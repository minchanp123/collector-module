const async = require('async');
const { QueueServiceClient, StorageSharedKeyCredential } = require("@azure/storage-queue");
const aws = require('aws-sdk');
const moment = require('moment');
const util = require('util');
const path = require('path');

const config = require('../config');
const logger = require('../lib/logger');
const slack = require('../lib/slack');
const fsUtil = require('../lib/fsUtil');
const crawlRequestDao = require('../dao/crawlRequestDao');
const userAgentDao = require('../dao/userAgentDao');
const channelDao = require('../dao/channelDao');
const crawlProgressDao = require('../dao/crawlProgressDao');
const { promises } = require('dns');

// 시간 설정을 한국 시간으로 맞추기
// moment().utcOffset('+09:00');

module.exports = function (params) {

  // config 로딩
  const mode = params.mode;
  const modes = config.azure.modes;
  const groupCount = config.server.group_count;
  const sqsNames = config.azure.request.casper.names;

  //azure 세팅
  const account = config.azure.storageAccount; //스토리지 이름
  const accountKey = config.azure.AZURE_STORAGE_CONNECTION_STRING; //스토리지 엑세스 키
  const sharedKeyCredential = new StorageSharedKeyCredential(account, accountKey); //엑세스 연결 함수
  const queueServiceClient = new QueueServiceClient(`https://${account}.queue.core.windows.net`, sharedKeyCredential); //queue client 생성

  const queueName = config.azure.request.names[modes.indexOf(mode)];

  /**
   * Azure 메세지 송신
   * @param  {jsonObject} crawlReqParams Azure Producer 옵션
   */
  const produce = function (crawlReqParams, callback) {
    logger.debug('[Azure/producer] Produser 시작 [mode: ' + mode + ']');
    logger.debug('[Azure/producer] Request Parameters [' + JSON.stringify(crawlReqParams) + ']');

    async.waterfall([
      // Step #1. 수집 요청 건 가져오기
      function (callback) {
        logger.debug('[Azure/producer] Step #1. 수집 요청 건 가져오기 - mode : ' + mode);
        if (mode === 'manual' || mode === 'test' || mode === 'community') {
          crawlRequestDao.selectCrawlRequestList(crawlReqParams, null, null, null, null, mode, callback);
        } else {
          // 날짜 데이터는 월별, 분기별, 년도별을 위해 필요. 시간 데이터는 그날 06시에 수집을 진행하기 위해 필요.
          var s_year = String(moment().year()); // 년도 YYYY
          var s_month = String((moment().month() + 1)); // 월 0 ~ 11
          var s_day = String(moment().date()); // 일. 1 ~ 31
          var hours = String(moment().hours()); // 시간 0~23
          if (hours.length < 2) {
            hours = '0' + hours;
          }
          if (s_month.length < 2) {
            s_month = '0' + s_month;
          }
          if (s_day.length < 2) {
            s_day = '0' + s_day;
          }

          var now = new Date();
          var lastDate = (new Date(now.getYear(), now.getMonth() + 1, 0)).getDate(); // 현재 월의 마지막 날짜 계산

          if (s_day == lastDate) { // 현재 날짜가 마지막 날이면 월별 수집 할 채널들의 리스트 가져옴.
            s_day = '32'; // db에서 day_schedules = 32인 애들은 월의 마지막날 수집이 돌아감. (바꾸고 싶으면 원하는 형태로 바꾸길....)
          }

          logger.debug('[Azure/producer] 현재 시각 : ' + s_year + '-' + s_month + '-' + s_day + ':' + hours + '시'); // 현재 시간과 db 스케쥴 시간 비교해서 동일한 것만 진행.
          // 월별 ->
          crawlRequestDao.selectCrawlRequestList(crawlReqParams, s_year, s_month, s_day, hours, mode, callback);
        }
      },
      // Step #2. userAgent 정보 가져오기
      function (crawlReqs, callback) {
        logger.debug('[Azure/producer] Step #2. userAgent 정보 가져오기');

        if (crawlReqs.length === 0) {
          callback('NO_MESSAGES');
        } else {
          userAgentDao.selectUserAgentList(function (err, userAgents) {
            if (err) {
              callback(err);
            } else {
              callback(null, crawlReqs, userAgents);
            }
          }); // selectUserAgentList
        }
      },
      // Step #3. 각 수집 요청 건별로 처리하기
      function (crawlReqs, userAgents, callback) {
        logger.debug('[Azure/producer] Step #3. 각 수집 요청 건별로 처리하기');

        async.eachSeries(crawlReqs, function (crawlReq, callback) {
          logger.debug(crawlReq);
          crawlReq.userAgents = userAgents;

          let channelInfo = {
            seq: crawlReq.channelSeq
          };

          async.waterfall([
            // Step #3-1. 수집 요청 건 채널 및 로그인 정보 가져오기
            function (callback) {
              logger.debug('[Azure/producer] Step #3-1. 수집 요청 건 채널 및 로그인 정보 가져오기');
              channelDao.selectChannelInfo(channelInfo, function (err, results) {
                if (err) {
                  callback(err);
                } else {

                  // 채널 기본 정보 입력
                  channelInfo.name = results[0].name;
                  channelInfo.url = results[0].url;
                  channelInfo.rule = {
                    fileName: results[0].fileName,
                    filePath: results[0].filePath
                  };

                  // 채널 로그인 정보 입력
                  if (results[0].loginSeq !== null) {
                    channelInfo.loginRule = {};
                    channelInfo.loginRule.seq = results[0].loginSeq;
                    channelInfo.loginRule.id = results[0].id;
                    channelInfo.loginRule.password = results[0].password;
                  }

                  callback(null);
                }
              }); // selectChannelInfo
            },
            // Step #3-2. 수집 요청 건 채널의 engine 정보 가져오기
            function (callback) {
              logger.debug('[Azure/producer] Step #3-2. 수집 요청 건 채널의 engine 정보 가져오기');
              channelDao.selectChannelEngineList(channelInfo, function (err, results) {
                if (err) {
                  callback(err);
                } else {
                  async.each(results, function (result, callback) {
                    if (result.typeCd === 'CET001') { // 링크 수집 엔진
                      crawlReq.role = 'linkCollector';
                      channelInfo.linkEngine = result;
                    } else if (result.typeCd === 'CET002') { // 문서 수집 엔진
                      channelInfo.docEngine = result;
                    } else if (result.typeCd === 'CET003') { // 링크-문서 수집 엔진
                      crawlReq.role = 'linkDocCollector';
                      channelInfo.linkDocEngine = result;
                    } else if (result.typeCd === 'CET004') { // API 수집 엔진
                      crawlReq.role = 'apiCollector';
                      channelInfo.apiEngine = result;
                    }
                    callback(null);
                  }, callback);
                }
              }); // selectChannelEngineList
            },
            // Step #3-3. 수집 요청 건 채널의 injectScript 정보 가져오기
            function (callback) {
              logger.debug('[Azure/producer] Step #3-3. 수집 요청 건 채널의 injectScript 정보 가져오기');
              logger.debug(channelInfo);
              channelDao.selectChannelInjectScriptList(channelInfo, function (err, results) {
                if (err) {
                  callback(err);
                } else {
                  // 인젝트 스크립트 정보 입력
                  channelInfo.injectScript = results;
                  // 최종 채널 정보 객체 입력
                  crawlReq.channel = channelInfo;

                  callback(null);
                }
              }); // selectChannelInjectScriptList
            },
            // Step #3-4. 수집 요청 건의 수집 대상 날짜 리스트 생성
            function (callback) {
              logger.debug('[Azure/producer] Step #3-4. 수집 요청 건의 수집 대상 날짜 리스트 생성');

              let dates = [];

              let startDt = moment(crawlReq.startDt);
              let endDt = moment(crawlReq.endDt);

              const today = moment();

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

              if (crawlReqParams.startDt !== undefined && crawlReqParams.startDt !== '') {
                if (crawlReqParams.period === 'DD') {
                  startDt = moment(crawlReqParams.startDt);
                } else if (crawlReqParams.period === 'MM') {
                  startDt = moment(crawlReqParams.startDt, 'YYYY-MM');
                } else if (crawlReqParams.period === 'YY') {
                  startDt = moment(crawlReqParams.startDt, 'YYYY');
                } else if (crawlReqParams.period === 'QQ') {
                  startDt = moment(crawlReqParams.startDt, 'YYYY-Q');
                }
              }

              if (crawlReqParams.endDt !== undefined && crawlReqParams.endDt !== '') {
                if (crawlReqParams.period === 'DD') {
                  endDt = moment(crawlReqParams.endDt);
                } else if (crawlReqParams.period === 'MM') {
                  endDt = moment(crawlReqParams.endDt, 'YYYY-MM');
                } else if (crawlReqParams.period === 'YY') {
                  endDt = moment(crawlReqParams.endDt, 'YYYY');
                } else if (crawlReqParams.period === 'QQ') {
                  endDt = moment(crawlReqParams.endDt, 'YYYY-Q');
                }
              }

              // startDt 가 today 보다 크면 pass
              if (startDt.isAfter(today)) {
                callback('DATE_TOO_EARLY');
              } else {
                // endDt 가 today 보다 크면 endDt 를 today 로 설정
                if (endDt.isAfter(today)) {
                  endDt = today;
                }

                async.whilst(
                  function () {
                    return startDt.isSameOrBefore(endDt);
                  },
                  function (callback) {
                    /*
                    years	y
                    quarters	Q
                    months	M
                    weeks	w
                    days	d
                    hours	h
                    minutes	m
                    seconds	s
                    milliseconds	ms
                    */

                    if (crawlReq.period === 'DD') {
                      const date = {
                        startDt: moment(startDt).format('YYYY-MM-DD'),
                        endDt: moment(startDt).format('YYYY-MM-DD'),
                        period: crawlReq.period
                      };

                      dates.push(date);
                      startDt.add(1, 'd');

                      callback(null);
                    } else if (crawlReq.period === 'MM') {
                      const date = {
                        startDt: moment(startDt).format('YYYY-MM'),
                        endDt: moment(startDt).format('YYYY-MM'),
                        period: crawlReq.period
                      };

                      dates.push(date);
                      startDt.add(1, 'M');

                      callback(null);
                    } else if (crawlReq.period === 'YY') {
                      const date = {
                        startDt: moment(startDt).format('YYYY'),
                        endDt: moment(startDt).format('YYYY'),
                        period: crawlReq.period
                      };

                      dates.push(date);
                      startDt.add(1, 'y');

                      callback(null);
                    } else if (crawlReq.period === 'QQ') {
                      const date = {
                        startDt: moment(startDt).format('YYYY-Q'),
                        endDt: moment(startDt).format('YYYY-Q'),
                        period: crawlReq.period
                      };

                      dates.push(date);
                      startDt.add(1, 'Q');

                      callback(null);
                    }
                  },
                  function (err) {
                    if (err) {
                      callback(err);
                    } else {
                      callback(null, dates);
                    }
                  }
                ); // whilst
              }
            },
            // Step #3-5. 수집 대상 날짜의 메시지 생성 & md5 생성
            function (dates, callback) {
              logger.debug('[Azure/producer] Step #3-5. 수집 대상 날짜의 메시지 생성 & MD5 생성');
              let messages = [];

              async.eachSeries(dates, function (date, callback) {
                const collectCheckFile = __dirname + path.sep + '..' + path.sep + 'collect_check' + path.sep + crawlReq.seq + path.sep + 'duplication.md5';
                const collectCheckPath = __dirname + path.sep + '..' + path.sep + 'collect_check' + path.sep + crawlReq.seq;

                async.waterfall([
                  // Step #3-5-1. MD5파일 확인
                  function (callback) {
                    logger.debug('[Azure/producer] crawlReq.seq : ' + crawlReq.seq);
                    if (crawlReq.check_md5 === 'N') { // check_md5 = N 이면 md5 처리 하지 않고 다음으로 이동.
                      crawlReq.md5 = '';
                      callback(null, false);
                    } else {
                      logger.debug('[Azure/producer] Step #3-5-1. MD5파일 확인');
                      logger.debug(collectCheckFile);
                      fsUtil.getStats(collectCheckFile, function (err, exist, stats) {
                        if (err) {
                          callback(err);
                        } else {
                          logger.debug(exist);
                          if (exist) {
                            if (stats.isFile()) {
                              callback(null, true);
                            } else {
                              callback(null, false);
                            }
                          } else {
                            fsUtil.makeDir(collectCheckPath, callback);
                            callback(null, false);
                          }
                        }
                      });
                    }
                  },
                  // Step #3-5-2. MD5값 읽기
                  function (exist, callback) {
                    if (exist) {
                      logger.debug('[Azure/producer] Step #3-5.2 MD5값 읽기');
                      fsUtil.readFile(collectCheckFile, function (err, data) {
                        if (err) {
                          callback(err);
                        } else {
                          logger.debug(data);
                          crawlReq.md5 = data;
                          callback(null);
                        }
                      }); // readFile
                    } else {
                      crawlReq.md5 = '';
                      callback(null);
                    }
                  },
                  // Step #3-5-3. Request 메시지 생성
                  function (callback) {
                    logger.debug('[Azure/producer] Step #3-5-3. Request 메시지 생성');
                    logger.debug(date);
                    let progressDt = '';
                    if (date.period === 'MM') {
                      progressDt = date.startDt + "-01";
                    } else if (date.period === 'QQ') {
                      let spl = date.startDt.split("-");
                      if (spl[1] === '1') {
                        progressDt = spl[0] + "-01-01";
                      } else if (spl[1] === '2') {
                        progressDt = spl[0] + "-04-01";
                      } else if (spl[1] === '3') {
                        progressDt = spl[0] + "-07-01";
                      } else {
                        progressDt = spl[0] + "-10-01";
                      }
                    }
                    const crawlProgress = {
                      requestSeq: crawlReq.seq,
                      startDt: date.startDt,
                      endDt: date.endDt,
                      progressDt: progressDt
                    };
                    crawlProgressDao.selectCrawlProgress(crawlProgress, function (err, results) {
                      if (err) {
                        callback(err);
                      } else {
                        let messageFlag = false;

                        // 수집 진행 히스토리가 없는 경우
                        if (results.length === 0) {
                          messageFlag = true;
                        } else {
                          if (results[0].onGoingFlag === 'Y') {
                            messageFlag = true;
                            // OnGoingFlag가 활성화 되어 있는 경우
                          } else if (results[0].status === 'linkCollectError' || results[0].status === 'docCollectError' || results[0].status === 'linkDocCollectError' || results[0].status === 'apiCollectError') {
                            // Error가 발생한 경우
                            messageFlag = true;
                          } else if (results[0].errorMsg !== null && results[0].errorMsg !== undefined) {
                            messageFlag = true;
                            // Error 메시지가 발견 된 경우
                          }
                        }

                        // 신규 메세지 생성
                        if (messageFlag) {
                          const message = {
                            requestSeq: crawlReq.seq,
                            customer: crawlReq.customer,
                            period: date.period,
                            md5: crawlReq.md5,
                            startDt: date.startDt,
                            endDt: date.endDt,
                            role: crawlReq.role,
                            channel: crawlReq.channel,
                            userAgents: crawlReq.userAgents
                          };

                          // const endDt = moment(date.endDt);
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

                          // ONGOING 여부 확인
                          if (endDt.isSame(today, 'year') && endDt.isSame(today, 'month') && endDt.isSame(today, 'day')) {
                            message.onGoingFlag = 'Y';
                          } else {
                            message.onGoingFlag = 'N';
                          }

                          // 키워드 존재 여부 확인
                          if (crawlReq.typeCd === 'CRT002') {
                            message.keyword = crawlReq.keyword;
                          }

                          // 큐 설정
                          message.groupCount = groupCount;

                          messages.push(JSON.parse(JSON.stringify(message)));
                          callback(null);
                        } else {
                          callback(null);
                        }
                      }
                    }); // selectCrawlProgress
                  }
                ], callback);
              }, function (err) {
                if (err) {
                  callback(err);
                } else {
                  callback(null, messages);
                }
              }); // eachSeries
            },
            // Step #3-6. Azure 메시지 처리 및 상태 업데이트
            function (messages, callback) {
              logger.debug('[Azure/producer] Step #3-6. Azure 메시지 처리 및 상태 업데이트');
              if (messages.length === 0) { // 생성할 메시지가 없는 경우
                callback('NO_MESSAGES');
              } else {
                async.eachSeries(messages, function (message, callback) {
                  // Q ++ 해준다.
                  const payload = JSON.stringify(message)

                  logger.debug(payload);
		              const queueClient = queueServiceClient.getQueueClient(queueName); //queue client 접속

                  queueClient.sendMessage(payload).then((result, err) => {
                    if (err) {
                      callback(err);
                    } else {
                      logger.debug('[Azure/producer] 발송 결과 : ' + JSON.stringify(result));

                      const crawlProgress = {
                        requestSeq: message.requestSeq,
                        period: message.period,
                        startDt: message.startDt,
                        endDt: message.endDt,
                        onGoingFlag: message.onGoingFlag,
                        errorMsg: message.errorMsg
                      };

                      if (message.role === 'linkCollector') {
                        crawlProgress.status = 'linkRequest';
                      } else if (message.role === 'linkDocCollector') {
                        crawlProgress.status = 'linkDocRequest';
                      } else if (message.role === 'apiCollector') {
                        crawlProgress.status = 'apiRequest';
                      }

                      logger.debug(crawlProgress);
                      crawlProgressDao.upsertCrawlProgress(crawlProgress, callback);
                    }
                  });
                  
                }, callback); // eachSeries
              }
            },
            // Step #3-7. 수집 요청 건 상태 업데이트
            function (callback) {
              logger.debug('[Azure/producer] Step #3-7. 수집 요청 건 상태 업데이트');
              logger.debug(crawlReq.status);
              // 에러 상태가 아니라면 진행상태로 업데이트
              if (crawlReq.status !== 'CRS005' && crawlReq.status !== 'CRS006') {
                crawlReq.status = 'CRS002';
                logger.debug(crawlReq);
                crawlRequestDao.updateCrawlRequest(crawlReq, callback);
              } else {
                callback(null);
              }
            }
          ], callback);
        }, callback); // eachSeries
      }
    ], function (err) {
      if (err) {
        if (err === 'DATE_TOO_EARLY') {
          logger.debug('[Azure/producer] 수집 시작일 미도래 건');
          callback(null);
        } else if (err === 'NO_MESSAGES') {
          logger.debug('[Azure/producer] 수집 요청 건 없음');
          callback(null);
        } else {
          callback(err);
        }
      } else {
        callback(null);
      }
    }); // waterfall
  }; // produce

  return {
    produce: produce
  }
};
