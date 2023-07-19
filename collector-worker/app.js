const cluster = require("cluster");
const process = require("process");
const express = require("express");
const morgan = require("morgan");
const moment = require("moment");

const config = require("./config");
const logger = require("./lib/logger");
const slack = require("./lib/slack");

// 시간 설정을 한국 시간으로 맞추기
// moment().utcOffset('+09:00');

if (cluster.isMaster) {
  let workerCnt = 0;

  let workerConsumer = cluster.fork();
  workerCnt++;

  //signal -1: 비정상, signal 0: 정상
  cluster.on("exit", function(worker, code, signal) {
    workerCnt--;
    logger.error(
      "[app/master] worker " +
        worker.process.pid +
        " died - code : " +
        code +
        ", signal : " +
        signal
    );
    slack.sendMessage(
      {
        color: "danger",
        title: "collector-worker",
        value:
          "[app/master] worker " +
          worker.process.pid +
          " died - code : " +
          code +
          ", signal : " +
          signal
      },
      function(err) {
        if (err) {
          logger.error(err);
        } else {
          logger.info("[app/master] Successfully push message to Slack");
        }
      }
    );
  });

  const app = express();
  app.set("port", config.server.port);
  app.use(
    morgan("combined", {
      stream: logger.stream
    })
  );
  app.get("/health", function(req, res) {
    let data = {};
    if (workerCnt === 1) {
      data.Result = "OK";
    } else {
      data.Result = "ERROR";
    }
    res.send(data);
  });

  const server = app.listen(app.get("port"), function() {
    const host = server.address().address;
    const port = server.address().port;

    logger.info("[app][master] Server Listening on port %d", port);
  });
} else {
  const AQSConsumer = require("./aqs/consumer");

  logger.debug("[app/worker] SQS Consumer 시작");
  AQSConsumer.consume();
}
