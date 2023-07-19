const aws = require("aws-sdk");
const async = require("async");
const moment = require("moment");
const ip = require("ip");
const { QueueServiceClient, StorageSharedKeyCredential } = require("@azure/storage-queue");

const config = require("../config");
const common = require("../lib/common");
const logger = require("../lib/logger");
const slack = require("../lib/slack");

// 시간 설정을 한국 시간으로 맞추기
// moment().utcOffset('+09:00');

const consumer = (function() {
  const collector = require("../collector");

  // 옵션 로딩
  const engine = config.server.engine;
  const engines = config.server.engines;
  const mode = config.azure.mode;
  const modes = config.azure.modes;

  //azure 세팅
  const account = config.azure.storageQueueAccount; //스토리지 이름
  const accountKey = config.azure.AZURE_STORAGE_QUEUE_CONNECTION_STRING; //스토리지 엑세스 키
  const sharedKeyCredential = new StorageSharedKeyCredential(account, accountKey); //엑세스 연결 함수
  const queueServiceClient = new QueueServiceClient(`https://${account}.queue.core.windows.net`, sharedKeyCredential); //queue client 생성
  
  // Request, Progress 설정
  const RequestNames =
    engine === engines[0]
      ? config.azure.request.names
      : config.AQS.request.casper.names;
  const ProgressNames =
    engine === engines[0]
      ? config.azure.response.names
      : config.AQS.progress.casper.names;

  const queueName = RequestNames[modes.indexOf(mode)]; //큐 이름
  const queueClient = queueServiceClient.getQueueClient(queueName); //queue client 접속

  const consume = function() {
    logger.debug(
      "[AQS/consumer] Consumer 시작 [mode: " +
        mode +
        ", queue: " +
        queueName +
        "]"
    );

    async.forever(
      function(next) {
        async.waterfall(
          [
            //Step #1. 메시지 수신
            function(callback) {
              logger.debug("[AQS/consumer] Step #1. 메시지 수신");
              queueClient.receiveMessages({ numberOfMessages: 1 }).then((data, err)=>{
                if (err) {
                  callback(err);
                } else {
                  if (data.receivedMessageItems.length === 0) {
                    callback("NO_MESSAGES");
                  } else {
                    callback(null, data.receivedMessageItems);
                  }
                }
              })

            },
            //Step #2. 메시지 삭제
            function(data, callback) {
              logger.debug("[AQS/consumer] Step #2. 메시지 삭제");

              queueClient.deleteMessage(data[0].messageId, data[0].popReceipt).then((result, err)=>{
                if (err) {
                  callback(err);
                } else {
                  callback(null, data);
                }
              })
              
            },
            //Step #3. 수집 시작
            function(data, callback) {
              logger.debug("[AQS/consumer] Step #3. 수집 시작");
              collector.collect(data[0].messageText, callback);
            }
          ],
          function(err) {
            if (err) {
              if (err === "NO_MESSAGES") {
                logger.info("[AQS/consumer] 수집 Request 메시지 없음");
                logger.info("[AQS/consumer] sleep until 2 minutes");
                common.timeout(5, next);
              } else {
                logger.error(err.toString());
                slack.sendMessage(
                  {
                    color: "danger",
                    title: ip.address(),
                    value: err.toString()
                  },
                  function(err) {
                    if (err) {
                      logger.error(err);
                    } else {
                      logger.info(
                        "[AQS/consumer] Successfully push message to Slack"
                      );
                      logger.info("[AQS/consumer] sleep until 2 minutes");
                      common.timeout(5, next);
                    }
                  }
                );
              }
            } else {
              logger.info("[AQS/consumer] Successfully message processed");
              logger.info("[AQS/consumer] sleep until 2 minutes");
              common.timeout(5, next);
            }
          }
        ); //waterfall
      },
      function(err) {
        if (err) {
          logger.error(err.toString());
          slack.sendMessage(
            {
              color: "danger",
              title: ip.address(),
              value: err.toString()
            },
            function(err) {
              if (err) {
                logger.error(err);
              } else {
                logger.info(
                  "[AQS/consumer] Successfully push message to Slack"
                );
              }
            }
          );
        } else {
          logger.error("Module unexpectedly finished.");
          slack.sendMessage(
            {
              color: "danger",
              title: ip.address(),
              value: "Module unexpectedly finished."
            },
            function(err) {
              if (err) {
                logger.error(err);
              } else {
                logger.info(
                  "[AQS/consumer] Successfully push message to Slack"
                );
              }
            }
          );
        }
      }
    ); // forever
  }; // consume

  return {
    consume: consume
  };
})();

if (exports) {
  module.exports = consumer;
}
