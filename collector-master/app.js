const cluster = require('cluster');
const express = require('express');
const morgan = require('morgan');

const config = require('./config');
const common = require('./lib/common');
const logger = require('./lib/logger');
const slack = require('./lib/slack');

const PRODUCER_DONE = 'done';
const CONSUMER = 'consumer';
const PRODUCER = 'producer';

if (cluster.isMaster) {
  const groupCount = config.server.group_count;

  let workerCnt = 0;

  // 프로듀서 생성
  const workerProducer = cluster.fork();
  let workerProducerBusy = false;
  workerCnt++;

  // 메시지 대기
  workerProducer.on('message', function(msg) {
    if (msg === PRODUCER_DONE) {
      workerProducerBusy = false;
    }
  });

  // 운영 컨슈머 생성 * group count
  for (let idx = 0; idx < groupCount; idx++) {
    const workerConsumer = cluster.fork();
    workerCnt++;
    workerConsumer.send({
      mode: CONSUMER
    });
  }

  const app = express();
  app.set('port', config.server.port);
  app.use(morgan('combined', {
    'stream': logger.stream
  }));
  app.get('/produce', function(req, res) {
    let data = {};
    data.Result = 'OK';

    // AUTO 큐 생성 Producer 선언
    if (!workerProducerBusy) {
      workerProducer.send({
        mode: PRODUCER
      });

      workerProducerBusy = true;
    } else {
      data.Message = 'producer is busy!';
    }

    res.send(data);
  });

  app.get('/health', function(req, res) {
    let data = {};

    if (workerCnt > 2) {
      data.Result = 'OK';
      data.Message = 'WorkerCnt: ' + workerCnt;
    } else {
      data.Result = 'ERROR';
      data.Message = 'WorkerCnt: ' + workerCnt;
    }

    res.send(data);
  });

  const server = app.listen(app.get('port'), function() {
    const host = server.address().address;
    const port = server.address().port;

    logger.info('[app][master] Server Listening on port %d', port);
  });

  cluster.on('exit', function(worker, code, signal) {
    workerCnt--;
    logger.error('[app][master] worker ' + worker.process.pid + ' died - code : ' + code + ', signal : ' + signal);
    slack.sendMessage({
      color: 'danger',
      title: 'collector-master',
      value: '[app][master] worker ' + worker.process.pid + ' died - code : ' + code + ', signal : ' + signal
    }, function(err) {
      if (err) {
        logger.error(err);
      } else {
        logger.info('[app][master] Successfully push message to Slack');
      }
    }); // sendMessage
  }); // cluster
} else {
  const async = require('async');
  const AQSProducer = require('./aqs/producer')({mode : 'news'});
  const AQSConsumerNews = require('./aqs/consumer')({mode : 'news'});

  process.on('message', function(msg) {
    if (msg.mode === PRODUCER) {
      logger.debug('[app][worker] AQS Producer 시작');
      AQSProducer.produce({}, function(err) {
        if (err) {
          logger.error(err);
        } else {
          logger.info('[app][worker] AQS 메시지 생성 완료');
          process.send(PRODUCER_DONE);
        }
      }); // produce


    } else if (msg.mode === CONSUMER) {
      logger.debug('[app][worker] AQS Consumer 시작');
      AQSConsumerNews.consume();
    }
  }); // process
}
