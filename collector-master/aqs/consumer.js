const async = require('async');
// const { QueueServiceClient, StorageSharedKeyCredential } = require("@azure/storage-queue");
const { delay, ServiceBusClient, ServiceBusMessage } = require("@azure/service-bus");
const aws = require('aws-sdk');
const moment = require('moment');
const path = require('path');

const config = require('../config');
const common = require('../lib/common');
const logger = require('../lib/logger');
const slack = require('../lib/slack');
const fsUtil = require('../lib/fsUtil');
const workerDao = require('../dao/workerDao');
const crawlRequestDao = require('../dao/crawlRequestDao');
const crawlProgressDao = require('../dao/crawlProgressDao');
// 시간 설정을 한국 시간으로 맞추기
// moment().utcOffset('+09:00');

module.exports = function(params) {

  const mode = params.mode;
  const modes = config.azure.modes;

  const queueNames = config.azure.progress.names;
  // azure 세팅
  const serviceBusKey = config.azure.AZURE_SERVICE_BUS_CONNECTION_STRING; //스토리지 엑세스 키
  const queueName = queueNames[modes.indexOf(mode)];
  const sbClient = new ServiceBusClient(serviceBusKey);
  const queueReceiver = sbClient.createReceiver(queueName);

  /**
   * 수집 완료 여부 확인
   * @param  {jsonObj}   message  수집 진행 현황 오브젝트
   * @param  {Function} callback 콜백 함수
   */
  const __checkCrawlRequestIsFinish = function(message, callback) {
    async.waterfall([
      // Step #1. crawlRequest 의 startDt, endDt 가져오기
      function(callback) {
        logger.debug('Step #4-1. crawlRequest 의 startDt, endDt 가져오기');
        const crawlReq = {
          seq: message.requestSeq
        };

        crawlRequestDao.selectCrawlRequest(crawlReq, function(err, results) {
          if (err) {
            callback(err);
          } else {
            if (results.length === 0) {
              callback('NO_MATCHED_CRAWL_REQUEST');
            } else {
              logger.debug(results[0]);
              callback(null, results[0]);
            }
          }
        }); // selectCrawlRequest
      },
      // Step #2. startDt ~ endDt 까지 dates 배열 만들기
      function(crawlReq, callback) {
        logger.debug('Step #4-2. startDt ~ endDt 까지 dates 배열 만들기');

        let dates = [];

        let startDt;
        let endDt;

        if (crawlReq.period === 'DD') {
          startDt = moment(crawlReq.startDt);
          endDt = moment(crawlReq.endDt);
        } else if (crawlReq.period === 'MM') {
          startDt = moment(crawlReq.startDt, 'YYYY-MM');
          endDt = moment(crawlReq.endDt, 'YYYY-MM');
        } else if (crawlReq.period === 'YY') {
          startDt = moment(crawlReq.startDt, 'YYYY');
          endDt = moment(crawlReq.endDt, 'YYYY');
        } else if (crawlReq.period === 'QQ') {
          startDt = moment(crawlReq.startDt, 'YYYY-Q');
          endDt = moment(crawlReq.endDt, 'YYYY-Q');
        }

        async.whilst(
          function() {
            return startDt.isSameOrBefore(endDt);
          },
          function(callback) {
            const date = {
              startDt: moment(startDt).format('YYYY-MM-DD'),
              endDt: moment(startDt).format('YYYY-MM-DD')
            };

            dates.push(date);

            if (crawlReq.period === 'DD') {
              startDt.add(1, 'd');
            } else if (crawlReq.period === 'MM') {
              startDt.add(1, 'M');
            } else if (crawlReq.period === 'YY') {
              startDt.add(1, 'y');
            } else if (crawlReq.period === 'QQ') {
              startDt.add(1, 'Q');
            }

            callback(null);
          },
          function(err) {
            if (err) {
              callback(err);
            } else {
              callback(null, dates);
            }
          }
        ); // whilst
      },
      // Step #2. 해당 기간의 progress 확인하기
      function(dates, callback) {
        logger.debug('Step #4-2. 해당 기간의 progress 확인하기');

        let isAllFinished = true;
        const crawlProgress = {
          requestSeq: message.requestSeq,
          period: message.period,
          startDt: dates[0].startDt,
          endDt: dates[dates.length - 1].endDt
        };

        async.waterfall([
          function(callback) {
            logger.debug('Step #4-2-1. 해당 기간의 status별 progress 확인');
            logger.debug(crawlProgress);
            crawlProgressDao.selectCrawlProgressByStatus(crawlProgress, function(err, results) {
              if (err) {
                callback(err);
              } else {
                for (let idx = 0; idx < results.length; idx++) {
                  logger.debug(results[idx]);
                  if (results[idx].status !== 'docFinished' && results[idx].status !== 'linkDocFinished') {
                    isAllFinished = false;
                  } else {
                    if (dates.length !== results[idx].cnt) {
                      isAllFinished = false;
                    }
                  }
                }
                callback(null);
              }
            }); // selectCrawlProgress
          },
          function(callback) {
            logger.debug('Step #4-2-2. 해당 기간의 on_going_flag별 progress 확인');
            logger.debug(crawlProgress);
            crawlProgressDao.selectCrawlProgressByOnGoingFlag(crawlProgress, function(err, results) {
              if (err) {
                callback(err);
              } else {
                for (let idx = 0; idx < results.length; idx++) {
                  logger.debug(results[idx]);
                  if (results[idx].onGoingFlag !== 'N') {
                    isAllFinished = false;
                  } else {
                    if (dates.length !== results[idx].cnt) {
                      isAllFinished = false;
                    }
                  }
                }
                callback(null);
              }
            }); // selectCrawlProgress
          }
        ], function(err) {
          if (err) {
            callback(err);
          } else {
            callback(null, isAllFinished);
          }
        });
      },
      // Step #4. 모든 날짜의 수집이 완료된 경우 crawlRequest 의 상태 변경하기
      function(isAllFinished, callback) {
        logger.debug('Step #4-4. 모든 날짜의 수집이 완료된 경우 crawlRequest 의 상태 변경하기');
        logger.debug(isAllFinished);

        if (isAllFinished) {
          const crawlReq = {
            seq: message.requestSeq,
            status: 'CRS003'
          };

          crawlRequestDao.updateCrawlRequest(crawlReq, callback);
        } else {
          callback(null);
        }
      }
    ], callback);
  }; // __checkCrawlRequestIsFinish

  /**
   * Azure AQS 메세지 수신
   */
  const consume = function() {
    logger.debug('[AQS/consumer] Consumer 시작 [queue: ' + queueName + ']');

    const payload = {
      //The maximum number of messages to return.
      MaxNumberOfMessages: 10, //1 to 10
      //The URL of the Amazon AQS queue from which messages are received.
      QueueUrl: queueName,
      //The duration (in seconds) that the received messages are hidden from subsequent retrieve requests after being retrieved by a ReceiveMessage request.
      VisibilityTimeout: 300,
      //The duration (in seconds) for which the call waits for a message to arrive in the queue before returning. If a message is available, the call returns sooner than WaitTimeSeconds.
      WaitTimeSeconds: 0
      // MessageGroupId: 'progress'
    };
    async.forever(
      function(next) {
        logger.info('[AQS/consumer] AQS 메시지 수신');

        try {
          queueReceiver.receiveMessages(1, { maxWaitTimeInMs: 1000 }).then((messages, err)=>{
          // queueClient.receiveMessages({ numberOfMessages: 1 }).then((data, err)=>{
            if (err) {
              // err return 값이 없는 것으로 판단 -> try catch로 구성
              logger.error(err);
              next(null);
            } else {
              if (messages.length === 0) {
                logger.info('[AQS/consumer] 수집 Request 메시지 없음');
                logger.info('[AQS/consumer] sleep until 2 seconds');
                common.timeout(2, next);
              } else {
                let deletePayload = {
                  QueueUrl: payload.QueueUrl,
                  Entries: []
                };

                let payloadIdx = 0;

                async.eachSeries(messages, function(msg, callback) {
                // async.eachSeries(data.receivedMessageItems, function(msg, callback) {
                  let message = msg.body;
                  async.waterfall([
                    // Step #1. worker 상태 업데이트
                    function(callback) {
                      logger.debug('Step #1. 워커 상태 업데이트');

                      const worker = {
                        ip: message.ip,
                        host: message.host,
                        status: message.status,
                        errorMsg: message.errorMsg
                      };

                      logger.debug(worker);
                      workerDao.upsertWokerStatus(worker, callback);
                    },
                    // Step #2. 수집 progress 업데이트
                    function(callback) {
                      logger.debug('Step #2. 수집 현황 상태 업데이트');

                      const crawlProgress = {
                        requestSeq: message.requestSeq,
                        period: message.period,
                        startDt: message.startDt,
                        endDt: message.endDt,
                        status: message.status,
                        errorMsg: message.errorMsg
                      };

                      logger.debug(crawlProgress);
                      crawlProgressDao.updateCrawlProgress(crawlProgress, callback);
                    },
                    // Step #3. 수집 MD5 업데이트
                    function(callback) {
                      logger.debug('Step #3. 수집 MD5 업데이트');
                      if (message.md5 !== undefined) {

                        const collectCheckPath = __dirname + path.sep + '..' + path.sep + 'collect_check' + path.sep + message.requestSeq;
                        fsUtil.makeDir(collectCheckPath, function(err) {
                          if (err) {
                            callback(err);
                          }
                        }); // makeDir

                        const collectCheckFile = __dirname + path.sep + '..' + path.sep + 'collect_check' + path.sep + message.requestSeq + path.sep + 'duplication.md5';

                        logger.debug(collectCheckFile);
                        fsUtil.writeFile(collectCheckFile, message.md5, callback);
                      } else {
                        callback(null);
                      }
                    },
                    // Step #4. error 처리
                    function(callback) {
                      logger.debug('Step #4. 수집 에러 처리');

                      if (message.status === 'linkCollectError' || message.status === 'docCollectError' || message.status === 'linkDocCollectError') {
                        const crawlReq = {
                          seq: message.requestSeq,
                          status: 'CRS005'
                        };

                        logger.debug(crawlReq);
                        crawlRequestDao.updateCrawlRequest(crawlReq, callback);
                      } else {
                        callback(null);
                      }
                    },
                    // Step #5. 수집 요청 Finish 여부 확인 (docFinished, linkDocFinished인 경우)
                    function(callback) {
                      logger.debug('Step #5. 수집 완료 여부 확인');
                      if (message.status === 'docFinished' || message.status === 'linkDocFinished') {
                        __checkCrawlRequestIsFinish(message, callback);
                      } else {
                        callback(null);
                      }
                    },
                    function(callback) {
                      if (message.status === 'docFinished' || message.status === 'linkDocFinished' || message.status === 'apiFinished') {
                        logger.debug('Step #5-2. 해당 날짜의 onGoingFlag 업데이트 / ' + message.channel.seq + ' / ' + message.requestSeq);
                        if (message.channel.seq === 662) {
                          const today = moment();
                          let endDt;
                          if (message.period === 'DD') {
                            endDt = moment(message.endDt);
                          } else if (message.period === 'MM') {
                            endDt = moment(message.endDt, 'YYYY-MM');
                          } else if (message.period === 'YY') {
                            endDt = moment(message.endDt, 'YYYY');
                          } else if (message.period === 'QQ') {
                            endDt = moment(message.endDt, 'YYYY-Q');
                          }

                          if (endDt.isSame(today, 'year') && endDt.isSame(today, 'month') && endDt.isSame(today, 'day')) { // 오늘 날짜이면
                            const crawlProgress = {
                              requestSeq: message.requestSeq,
                              onGoingFlag: 'N',
                              startDt: message.startDt,
                              endDt: message.endDt
                            };

                            crawlProgressDao.updateOngoingFlags(crawlProgress, callback);
                          } else {
                            callback(null);
                          }
                        }else {
                          callback(null);
                        }
                      } else {
                        callback(null);
                      }
                    },
                    // Step #6. 수집 Progress 메시지 삭제
                    function(callback) {
                      logger.debug('Step #6. AQS 메시지 삭제 파라미터 생성');

                      // var EntriesValue = {
                      //   Id: msg.messageId,
                      //   ReceiptHandle: msg.popReceipt
                      // };

                      deletePayload.Entries.push(msg);
                      callback(null);
                      // 메시지 삭제 파라미터 생성했으면 deleteQ_cnt++
                    }
                  ], callback); // waterfall
                }, function(err) {
                  if (err) {
                    logger.error(err.toString());
                    slack.sendMessage({
                      color: 'danger',
                      title: 'collector-master',
                      value: err.toString()
                    }, function(err) {
                      if (err) {
                        logger.error(err);
                        next(null);
                      } else {
                        logger.info('[AQS/consumer] sleep until 10 seconds');
                        common.timeout(10, next);
                      }
                    });
                  } else {
                    async.waterfall([
                      function(callback) {
                        logger.debug('Step #7. AQS 메시지 삭제');
                        try {
                          queueReceiver.completeMessage(deletePayload.Entries[0]).then(()=>{});
                        }
                        catch (err) {
                          callback(err)
                        }
                        finally {
                          callback(null, deletePayload);
                        }
                      },
                      function(result, callback) {
                        // logger.debug(result);
                        logger.info('[AQS/consumer] all queue messages have been processed');
                        logger.info('[AQS/consumer] sleep until 1 seconds');
                        common.timeout(1, callback);
                      }
                    ], next); // waterfall
                  }
                }); // eachSeries
              }
            }
          }); // receiveMessage
        }
        catch (err) {
          logger.error(err);
          next(null);
        }
      },
      function(err) {
        if (err) {
          logger.error(err.toString());
          slack.sendMessage({
            color: 'danger',
            title: 'collector-master',
            value: err.toString()
          }, function(err) {
            if (err) {
              logger.error(err);
            } else {
              logger.info('[AQS/consumer] Successfully push message to Slack');
            }
          }); //sendMessage

        } else {
          logger.error('Module unexpectedly finished.');
          slack.sendMessage({
            color: 'danger',
            title: 'collector-master',
            value: 'Module unexpectedly finished.'
          }, function(err) {
            if (err) {
              logger.error(err);
            } else {
              logger.info('[AQS/consumer] Successfully push message to Slack');
            }
          }); //sendMessage
        }
      }
    ); // forever
  }; // consume

  return {
    consume: consume,
    // getQueueList: getQueueList
  }
};
