const path = require('path');
const async = require('async');
const moment = require('moment');
const spawn = require('child_process').spawn;

const config = require('./config');
const logger = require('./lib/logger');
const fsUtil = require('./lib/fsUtil');
const loader = require('./loader');

// 시간 설정을 한국 시간으로 맞추기
moment().utcOffset('+09:00');

const collector = (function() {
  const AQSProducer = require('./aqs/producer');

  const engine = config.server.engine;

  const collectBucket = config.azure.storage;
  const collectPath = config.azure.collect_path;

  // Casper exe 선택
  let CASPER_CMD = 'casperjs';
  if (process.platform === 'win32') {
    CASPER_CMD = 'casperjs.cmd';
  } else {
    CASPER_CMD = 'casperjs';
  }

  /**
   * 캐스터 수집 엔진 보유 여부 체크
   * @param  {string}   filePath   로컬 엔진 디렉토리
   * @param  {string}   s3FilePath S3 파일 디렉토리
   * @param  {string}   s3FileName S3 파일 이름
   */
  const __checkFile = function(filePath, s3FilePath, s3FileName, callback) {
    // 해당 파일이 존재하는 확인
    fsUtil.getStats(filePath, function(err, exist, stats) {
      if (err) {
        callback(err);
      } else {
        if (exist) {
          if (stats.isFile()) {
            callback(null);
          }
        } else {
          fsUtil.downloadFile(collectBucket, s3FilePath, callback);
        }
      }
    });
  }; // __checkFile

  /**
   * 캐스퍼 수집 엔진 구동
   * @param  {jsonObj}   collectParams  수집 요청 JSON 메시지
   */
  const __casperjsCollect = function(collectParams, callback) {
    const args = [__dirname + path.sep + collectParams.engine.filePath, escape(JSON.stringify(collectParams))];
    const casper = spawn(CASPER_CMD, args);

    logger.debug('### casperjs ' + args[0] + ' ' + args[1]);
    let stdout = new Buffer('');

    casper.stdout.on('data', function(data) {
      stdout = Buffer.concat([stdout, data]);
      logger.debug(data.toString('utf8'));
    }); // data

    casper.on("close", function(code, signal) {
      logger.info('child process exited with code ' + code);
      logger.info('child process terminated due to receipt of signal ' + signal);

      const stdoutStr = stdout.toString('utf8');
      const resultStartPos = stdoutStr.indexOf('<RESULT>');
      const resultEndPos = stdoutStr.indexOf('</RESULT>');

      if (resultStartPos > -1) {
        const result = stdoutStr.substring(resultStartPos + 8, resultEndPos);
        const resultJson = JSON.parse(result);

        if (resultJson.result === 'OK') {
          callback(null);
        } else {
          callback(resultJson.msg);
        }
      } else {
        callback('ERR_NOT_RECEIVED_CASPER_RESULT');
      }
    }); // on
  }; // __casperjsCollect

  /**
   * 수집 요청 메세지 유효성 체크 및 기본 메타 정보 입력
   * @param  {jsonObj}   message  수집 요청 메세지
   */
  const __getMetainfo = function(message, callback) {
    let results = {};

    // 메타 정보를 입력
    results.requestSeq = message.requestSeq;
    results.customer = message.customer;
    results.source = message.channel.name;
    results.requestUrl = message.channel.url;
    results.period = message.period;
    results.md5 = message.md5;

    if (message.period === 'DD') {
      results.startDt = message.startDt;
      results.endDt = message.endDt;
    } else if (message.period === 'MM') {
      results.startDt = moment(message.startDt, 'YYYY-MM').format('YYYY-MM-DD');
      results.endDt = moment(message.endDt, 'YYYY-MM').add(1, 'M').date(0).format('YYYY-MM-DD');
    } else if (message.period === 'YY') {
      results.startDt = moment(message.startDt, 'YYYY').format('YYYY-MM-DD');
      results.endDt = moment(message.endDt, 'YYYY').add(1, 'y').date(0).format('YYYY-MM-DD');
    } else if (message.period === 'QQ') {
      results.startDt = moment(message.startDt, 'YYYY-Q').format('YYYY-MM-DD');
      results.endDt = moment(message.endDt, 'YYYY-Q').add(1, 'Q').date(0).format('YYYY-MM-DD');
    }

    // 수집동작일 입력
    results.statDt = moment().format('YYYY-MM-DD');

    // 키워드 세팅
    if (message.keyword !== undefined) {
      results.keyword = message.keyword;
    }

    // 로그인 정보 세팅
    if (message.channel.loginRule !== undefined) {
      results.id = message.channel.loginRule.id;
      results.password = message.channel.loginRule.password;
    }

    callback(null, results);
  }; // __getMetainfo

  /**
   * 룰 파일에서 수집처에 해당하는 룰 찾기
   * @param  {array}   rules      룰 리스트
   */
  const __findRule = function(url, rules, callback) {
    let results = {};
    let findFlag = false;
    let ruleCount = 0;

    async.whilst(
      function() {
        return (ruleCount <= rules.length && findFlag === false);
      },
      function(callback) {
        let checkCount = 0;
        const urlPatterns = rules[ruleCount].urlPattern;
        async.eachSeries(urlPatterns, function(urlPattern, callback) {
          const urlRegexResult = new RegExp(urlPattern).exec(url);
          if (!findFlag && urlRegexResult !== null) {
            results = rules[ruleCount];
            findFlag = true;
            ruleCount = rules.length;
            callback(null);
          } else {
            if (checkCount < urlPatterns.length - 1) {
              checkCount++;
            } else {
              ruleCount++;
            }
            callback(null);
          }
        }, callback); // eachSeries
      },
      function(err) {
        if (err) {
          callback(err);
        } else {
          if (findFlag) {
            callback(null, results);
          } else {
            callback('ERR_NOT_FOUND_RULES');
          }
        }
      }
    ); // whilst
  }; // __findRule

  /**
   * 수집 요청 처리
   * @param  {jsonObj}   message  수집 요청 메세지
   */
  const collect = function(message, callback) {
    message = JSON.parse(message);

    // 수집을 위한 파라미터 생성
    let collectParams = {};

    async.waterfall([
      // Step #1. 수집 요청 메타 파라미터 생성
      function(callback) {
        logger.info('[collector] Step #1. 수집 요청 메타 파라미터 생성');
        __getMetainfo(message, function(err, result) {
          if (err) {
            callback(err);
          } else {
            collectParams = result;
            callback(null);
          }
        });
      },
      // Step #2. 수집 진행 메시지 처리
      function(callback) {
        logger.debug('[collector] Step #2. 수집 진행 메시지 처리');
        if (message.role === 'linkCollector') {
          message.status = 'linkCollecting';
        } else if (message.role === 'docCollector') {
          message.status = 'docCollecting';
        } else if (message.role === 'linkDocCollector') {
          message.status = 'linkDocCollecting';
        } else if (message.role === 'apiCollector') {
          message.status = 'apiCollecting';
        }

        // AQS 메시지 발송
        // AQSProducer.produce(message, callback);
        callback(null);
      },
      // Step #3. 수집 엔진 파일 확인 및 다운로드
      function(callback) {
        logger.debug('[collector] Step #3. 수집 엔진 파일 확인 및 다운로드');

        let filePath = '';
        let fileName = '';

        if (message.role === 'linkCollector') {
          filePath = message.channel.linkEngine.filePath;
          fileName = message.channel.linkEngine.fileName;
        } else if (message.role === 'docCollector') {
          filePath = message.channel.docEngine.filePath;
          fileName = message.channel.docEngine.fileName;
        } else if (message.role === 'linkDocCollector') {
          filePath = message.channel.linkDocEngine.filePath;
          fileName = message.channel.linkDocEngine.fileName;
        } else if (message.role === 'apiCollector') {
          filePath = message.channel.apiEngine.filePath;
          fileName = message.channel.apiEngine.fileName;
        }

        collectParams.engine = {};
        collectParams.engine.filePath = filePath;
        collectParams.engine.fileName = fileName;

        __checkFile(__dirname + path.sep + filePath, filePath, fileName, callback); // __checkFile
      },
      // Step #4. injectScript 파일 확인 및 다운로드
      function(callback) {
        logger.debug('[collector] Step #4. injectScript 파일 확인 및 다운로드');
        collectParams.injectScripts = [];

        async.eachSeries(message.channel.injectScript, function(script, callback) {
          const filePath = script.filePath;
          const fileName = script.fileName;

          collectParams.injectScripts.push('./' + filePath); // 상대 경로 지정
          __checkFile(__dirname + path.sep + filePath, filePath, fileName, callback); // __checkFile
        }, callback); // eachSeries
      },
      // Step #5. 룰 파일 처리 및 수집룰 가져오기
      function(callback) {
        logger.debug('[collector] Step #5. 룰 파일 처리 및 수집룰 가져오기');
        const filePath = message.channel.rule.filePath;
        const fileName = message.channel.rule.fileName;

        async.waterfall([
          // Step #5-1. 룰 파일 확인 및 다운로드
          function(callback) {
            logger.debug('[collector] Step #5-1. 룰 파일 확인 및 다운로드');
            __checkFile(__dirname + path.sep + filePath, filePath, fileName, callback);
          },
          // Step #5-2. 룰 파일 파싱
          function(callback) {
            logger.debug('[collector] Step #5-2. 룰 파일 파싱');
            fsUtil.readFile(__dirname + path.sep + filePath, function(err, data) {
              if (err) {
                callback(err);
              } else {
                callback(null, JSON.parse(data));
              }
            }); // readFile
          },
          // Step #5-3. 수집처에 맞는 룰 찾기
          function(rule, callback) {
            logger.debug('[collector] Step #5-3. 수집처에 맞는 룰 찾기');
            const url = message.channel.url;

            __findRule(url, rule, function(err, result) {
              if (err) {
                callback(err);
              } else {
                collectParams.rule = result;

                // 룰에 언급 된 URL을 강제로 채널의 URL로 바꿈
                if (collectParams.rule.linkSelectors) {
                  collectParams.rule.linkSelectors.url = url;
                }
                callback(null);
              }
            });
          }
        ], callback); // waterfall
      },
      // Step #6. 수집 결과 저장 디렉토리 생성
      function(callback) {
        logger.debug('[collector] Step #6. 수집 결과 저장 디렉토리 생성');
        var collectDataPath = __dirname + path.sep + collectPath + path.sep + message.customer + path.sep + message.requestSeq + path.sep + message.role + path.sep + (collectParams.statDt.replace(/-/g, ''));
        var collectDataS3Path = collectPath + '/' + message.customer + '/' + message.requestSeq + '/' + message.role + '/' + (collectParams.statDt.replace(/-/g, ''));
        var collectAttachDataS3Path = collectPath + '/' + message.customer + '/' + message.requestSeq + '/attachCollector/' + (collectParams.statDt.replace(/-/g, ''));

        fsUtil.makeDir(collectDataPath, function(err) {
          if (err) {
            callback(err);
          } else {
            collectParams.collectDataPath = collectDataPath;
            collectParams.collectDataS3Path = collectDataS3Path;
            collectParams.collectAttachDataS3Path = collectAttachDataS3Path;
            callback(null);
          }
        }); // makeDir
      },
      // Step #7. 수집 시 사용할 UserAgent 랜덤 선택
      function(callback) {
        logger.debug('[collector] Step #7. 수집 시 사용할 UserAgent 랜덤 선택');
        const min = 0;
        const max = message.userAgents.length;
        const random = Math.floor(Math.random() * (max - min)) + min;

        collectParams.userAgent = message.userAgents[random].useragent;
        callback(null);
      },
      // Step #8. 수집 처리
      function(callback) { // #8 ->  loder -> engine
        if (engine === 'chrome') {
          logger.debug('[collector] Step #8. chrome 엔진 수집 처리');
          logger.info(collectParams);

          // 문서 정보 입력
          if (message.role === 'docCollector') {
            collectParams.doc = message.doc;
          }

          loader.load(collectParams, (err, md5) => {
            if (err) {
              if (message.role === 'linkCollector') {
                message.status = 'linkCollectError';
              } else if (message.role === 'docCollector') {
                message.status = 'docCollectError';
              } else if (message.role === 'linkDocCollector') {
                message.status = 'linkDocCollectError';
              } else if (message.role === 'apiCollector') {
                message.status = 'apiCollectError';
              }
              message.errorMsg = err.toString();

              // AQS 메시지 발송
              AQSProducer.produce(message, (err2) => {
                if (err2) {
                  callback(err2);
                } else {
                  callback(err);
                }
              });
            } else {
              callback(null, md5);
            }
          });
        } else {
          logger.debug('[collector] Step #8. casper 엔진 수집 처리');
          logger.debug(collectParams);
          if (message.role === 'linkCollector') {
            __casperjsCollect(collectParams, function(err) {
              if (err) {
                message.status = 'linkCollectError';
                message.errorMsg = err.toString();

                // AQS 메시지 발송
                AQSProducer.produce(message, function(err2) {
                  if (err2) {
                    callback(err2);
                  } else {
                    callback(err);
                  }
                });
              } else {
                callback(null, null);
              }
            }); // __casperjsCollect
          } else if (message.role === 'docCollector') { // 문서 수집
            collectParams.doc = message.doc; //문서 link정보를 갖고 있음

            __casperjsCollect(collectParams, function(err) {
              if (err) {
                // 문서 수집 에러 상태로 업데이트
                message.status = 'docCollectError';
                message.errorMsg = err.toString();

                // AQS 메시지 발송
                AQSProducer.produce(message, function(err2) {
                  if (err2) {
                    callback(err2);
                  } else {
                    callback(err);
                  }
                });
              } else {
                callback(null, null);
              }
            }); // __casperjsCollect
          } else if (message.role === 'linkDocCollector') { // 링크-원문 수집
            __casperjsCollect(collectParams, function(err) {
              if (err) {
                // 문서 수집 에러 상태로 업데이트
                message.status = 'linkDocCollectError';
                message.errorMsg = err.toString();

                // AQS 메시지 발송
                AQSProducer.produce(message, function(err2) {
                  if (err2) {
                    callback(err2);
                  } else {
                    callback(err);
                  }
                });
              } else {
                callback(null, null);
              }
            }); // __casperjsCollect
          } else if (message.role === 'apiCollector') { // API 수집
            loader.load(collectParams, (err) => {
              if (err) {
                // 문서 수집 에러 상태로 업데이트
                message.status = 'apiCollectError';
                message.errorMsg = err.toString();

                // AQS 메시지 발송
                AQSProducer.produce(message, function(err2) {
                  if (err2) {
                    callback(err2);
                  } else {
                    callback(err);
                  }
                });
              } else {
                callback(null, null);
              }
            });
          }
        }
      },
      function(md5, callback) {
        logger.debug('[collector] Step #8-2. MD5 처리');
        logger.debug('MD5 : ' + md5);

        if (md5 === undefined) { // 마스터 쪽에서 md5 = undefined인 경우 상태 업데이트 없이 다음 스텝으로 진행함.
          callback(null);
        } else if (md5 === null || md5 === '') { // 빈칸이거나 null이면 상태 업데이트 하면 안됨.. undefined로 바꿔줌.
          md5 = undefined;
          message.md5 = md5;
          callback(null);
        } else {
          message.md5 = md5;
          callback(null);
        }
      },
      // Step #9. 수집 결과 파일 가져오기
      function(callback) {
        logger.debug('[collector] Step #9. 수집 결과 파일 가져오기');
        logger.debug(collectParams.collectDataPath);
        fsUtil.readDir(collectParams.collectDataPath, function(err, files) {
          if (err) {
            callback(err);
          } else {
            if (files.length > 0) {
              var json_files = [];

              async.eachSeries(files, function(file, callback) {
                if (file.substring(file.length - 4) === 'json') {
                  json_files.push(file);
                }
                callback(null);
              }, function(err) {
                if (err) {
                  callback(err);
                } else {
                  callback(null, json_files);
                }
              });
            } else {
              callback('NO_RESULTS');
            }
          }
        }); // readDir
      },
      // Step #10. 수집 결과 파일 처리
      function(files, callback) {
        logger.debug('[collector] Step #10. 수집 결과 파일 처리');

        if (files.length > 0) {
          async.eachSeries(files, function(file, callback) {
            async.waterfall([
              // Step #10-1. 수집 결과 파일 parsing
              function(callback) {
                logger.debug('[collector] Step #10-1. 수집  결과  파일  파싱');
                fsUtil.readFile(collectParams.collectDataPath + path.sep + file, function(err, data) {
                  if (err) {
                    callback(err);
                  } else {
                    callback(null, JSON.parse(data));
                  }
                }); // readFile
              },
              // Step #10-2. 수집 결과 처리
              function(results, callback) {
                if (message.role === 'linkCollector') {
                  logger.debug('[collector] Step #10-2. linkCollector 결과 처리');

                  async.waterfall([
                    // Step #10-2-1. 수집 데이터 업로드
                    function(callback) {
                      logger.debug('Step #10-2-1. 수집 데이터 업로드');
                      logger.debug('### upload File: ' + collectParams.collectDataPath + path.sep + file);
                      logger.debug('### upload Path: ' + collectParams.collectDataS3Path);

                      fsUtil.uploadFile(collectParams.collectDataPath + path.sep + file, collectBucket, collectParams.collectDataS3Path, function(err, result) {
                        if (err) {
                          callback(err);
                        } else {
                          fsUtil.removeFile(collectParams.collectDataPath + path.sep + file, callback); // removeFile
                        }
                      }); //uploadFile
                    },
                    function(callback) {
                      // Step #10-2-2. 수집 상태 완료 처리
                      logger.debug('Step #10-2-2. 수집 상태 완료 처리');
                      message.status = 'linkFinished';

                      // AQS 메시지 발송
                      AQSProducer.produce(message, callback);
                    }
                    // Step #10-2-3. 문서 수집 요청
                    ,
                    function(callback) {
                      logger.debug('Step #10-2-3. 문서 수집 요청');
                      async.eachSeries(results, function(result, callback) {
                        message.role = 'docCollector';
                        message.status = 'docRequest';
                        message.doc = result;

                        // AQS 메시지 발송
                        AQSProducer.produce(message, callback);
                      }, function(err) {
                        if (err) {
                          callback(err);
                        } else {
                          // 다음 파일을 위해 role & status 초기화
                          message.role = 'linkCollector';
                          message.status = 'linkCollecting';
                          callback(null);
                        }
                      }); // eachSeries
                    }
                  ], callback); // waterfall
                } else if (message.role === 'docCollector') {
                  logger.debug('[collector] Step #10-2. docCollector 결과 처리');

                  async.waterfall([
                    // #10-2-1. 수집 데이터 업로드
                    function(callback) {
                      logger.debug('Step #10-2-1. 수집 데이터 업로드');
                      logger.debug('### upload File: ' + collectParams.collectDataPath + path.sep + file);
                      logger.debug('### upload Path: ' + collectParams.collectDataS3Path);

                      fsUtil.uploadFile(collectParams.collectDataPath + path.sep + file, collectBucket, collectParams.collectDataS3Path, function(err, result) {
                        if (err) {
                          callback(err);
                        } else {
                          fsUtil.removeFile(collectParams.collectDataPath + path.sep + file, callback);
                        }
                      }); // uploadFile
                    },
                    // Step #10-2-2. 첨부파일 업로드 처리
                    function(callback) {
                      logger.debug('Step #10-2-2. 첨부파일 업로드 처리');
                      async.eachSeries(results.attachs, function(attach, callback) {
                        logger.debug('### upload File: ' + collectParams.collectDataPath + path.sep + attach.real_file_name);
                        logger.debug('### upload Path: ' + collectParams.collectAttachDataS3Path);

                        fsUtil.uploadFile(collectParams.collectDataPath + path.sep + attach.real_file_name, collectBucket, collectParams.collectAttachDataS3Path, function(err, result) {
                          if (err) {
                            if (err === 'ERR_NO_SUCH_FILE_OR_DIRECTORY') {
                              logger.warn(err);
                              callback(null);
                            } else {
                              callback(err);
                            }
                          } else {
                            fsUtil.removeFile(collectParams.collectDataPath + path.sep + attach.real_file_name, callback); // removeFile
                          }
                        }); // uploadFile
                      }, callback); // eachSeries
                    },
                    // Step #10-2-3. 수집 상태 완료 처리
                    function(callback) {
                      logger.debug('Step #10-2-3. 수집 상태 완료 처리');
                      message.status = 'docFinished';

                      // AQS 메시지 발송
                      AQSProducer.produce(message, callback);
                    }
                  ], callback); // waterfall
                } else if (message.role === 'linkDocCollector') {
                  logger.debug('[collector] Step #10-2. linkDocCollector 결과 처리');

                  async.waterfall([
                    // #10-2-1. 수집 데이터 업로드
                    function(callback) {
                      logger.debug('Step #10-2-1. 수집 데이터 업로드');
                      logger.debug('### upload File: ' + collectParams.collectDataPath + path.sep + file);
                      logger.debug('### upload Path: ' + collectParams.collectDataS3Path);

                      fsUtil.uploadFile(collectParams.collectDataPath + path.sep + file, collectBucket, collectParams.collectDataS3Path, function(err, result) {
                        if (err) {
                          callback(err);
                        } else {
                          fsUtil.removeFile(collectParams.collectDataPath + path.sep + file, callback);
                        }
                      });
                    },
                    // Step #10-2-2. 첨부파일 업로드 처리
                    function(callback) {
                      logger.debug('Step #10-2-2. 첨부파일 업로드 처리');
                      async.eachSeries(results, function(dialog, callback) {
                        if (dialog === null || dialog === undefined) {
                          callback(null);
                        } else {
                          async.eachSeries(dialog.attachs, function(attach, callback) {
                            logger.debug('### upload File: ' + collectParams.collectDataPath + path.sep + attach.real_file_name);
                            logger.debug('### upload Path: ' + collectParams.collectAttachDataS3Path);

                            fsUtil.uploadFile(collectParams.collectDataPath + path.sep + attach.real_file_name, collectBucket, collectParams.collectAttachDataS3Path, function(err, result) {
                              if (err) {
                                if (err === 'ERR_NO_SUCH_FILE_OR_DIRECTORY') {
                                  logger.warn(err);
                                  callback(null);
                                } else {
                                  callback(err);
                                }
                              } else {
                                fsUtil.removeFile(collectParams.collectDataPath + path.sep + attach.real_file_name, callback); // removeFile
                              }
                            }); // uploadFile
                          }, callback); // eachSeries
                        }
                      }, callback); // eachSeries
                    },
                    // Step #10-2-3. 수집 상태 완료 처리
                    function(callback) {
                      logger.debug('Step #10-2-3. 수집 상태 완료 처리');
                      message.status = 'linkDocFinished';

                      // AQS 메시지 발송
                      AQSProducer.produce(message, callback);
                    }
                  ], callback); // waterfall
                } else if (message.role === 'apiCollector') {
                  logger.debug('[collector] Step #10-2. apiCollector 결과 처리');

                  async.waterfall([
                    // #10-2-1. 수집 데이터 업로드
                    function(callback) {
                      logger.debug('Step #10-2-1. 수집 데이터 업로드');
                      logger.debug('### upload File: ' + collectParams.collectDataPath + path.sep + file);
                      logger.debug('### upload Path: ' + collectParams.collectDataS3Path);

                      fsUtil.uploadFile(collectParams.collectDataPath + path.sep + file, collectBucket, collectParams.collectDataS3Path, function(err, result) {
                        if (err) {
                          callback(err);
                        } else {
                          fsUtil.removeFile(collectParams.collectDataPath + path.sep + file, callback);
                        }
                      });
                    },
                    // Step #10-2-2. 첨부파일 업로드 처리
                    function(callback) {
                      logger.debug('Step #10-2-2. 첨부파일 업로드 처리');
                      async.eachSeries(results, function(dialog, callback) {
                        async.eachSeries(dialog.attachs, function(attach, callback) {
                          logger.debug('### upload File: ' + collectParams.collectDataPath + path.sep + attach.real_file_name);
                          logger.debug('### upload Path: ' + collectParams.collectAttachDataS3Path);

                          fsUtil.uploadFile(collectParams.collectDataPath + path.sep + attach.real_file_name, collectBucket, collectParams.collectAttachDataS3Path, function(err, result) {
                            if (err) {
                              if (err === 'ERR_NO_SUCH_FILE_OR_DIRECTORY') {
                                logger.warn(err);
                                callback(null);
                              } else {
                                callback(err);
                              }
                            } else {
                              fsUtil.removeFile(collectParams.collectDataPath + path.sep + attach.real_file_name, callback); // removeFile
                            }
                          }); // uploadFile
                        }, callback); // eachSeries
                      }, callback); // eachSeries
                    },
                    // Step #10-2-3. 수집 상태 완료 처리
                    function(callback) {
                      logger.debug('Step #10-2-3. 수집 상태 완료 처리');
                      message.status = 'apiFinished';

                      // AQS 메시지 발송
                      AQSProducer.produce(message, callback);
                    }
                  ], callback); // waterfall
                }
              }
            ], callback); // waterfall
          }, callback); // eachSeries
        } else {
          callback('NO_RESULTS');
        }
      }
    ], function(err) {
      // Step #10. 수집 에러 처리
      if (err) {
        logger.debug('[collector] Step #10. 수집 에러 처리');

        // 결과 없음의 경우
        if (err === 'NO_RESULTS') {
          // logger.warn(err.toString());
          // if (message.role === 'linkCollector') {
          //   message.status = 'linkCollectError';
          // } else if (message.role === 'docCollector') {
          //   message.status = 'docCollectError';
          // } else if (message.role === 'linkDocCollector') {
          //   message.status = 'linkDocCollectError';
          // }
          var errors = ['ERR_NOT_FOUND_RULES', 'LIST_PARSING_RULE_IS_NOT_MATCH', 'DOCUMENT_PARSING_RULE_IS_NOT_MATCH', 'PAGINATION_PARSING_RULE_IS_NOT_MATCH', 'ATTACH_PARSING_RULE_IS_NOT_MATCH'];

          logger.warn(err.toString());

          // 위 에러에 해당하는 경우 Error 상태 값으로 변환
          if (new RegExp(errors.join("|")).test(message.errorMsg)) {
            if (message.role === 'linkCollector') {
              message.status = 'linkCollectError';
            } else if (message.role === 'docCollector') {
              message.status = 'docCollectError';
            } else if (message.role === 'linkDocCollector') {
              message.status = 'linkDocCollectError';
            } else if (message.role === 'apiCollector') {
              message.status = 'apiCollectError';
            }
          } else {
            if (message.role === 'linkCollector') {
              message.role = 'docCollector';
              message.status = 'docFinished';
            } else if (message.role === 'docCollector') {
              message.status = 'docFinished';
            } else if (message.role === 'linkDocCollector') {
              message.status = 'linkDocFinished';
            } else if (message.role === 'apiCollector') {
              message.status = 'apiFinished';
            }
          }

          AQSProducer.produce(message, callback);
        } else {
          /*
          ERR_NOT_FOUND_RULES: 수집 룰을 찾지 못함
          ERR_NOT_RECEIVED_CASPER_RESULT: 캐스퍼 실행 오류

          LIST_PARSING_RULE_IS_NOT_MATCH: 리스트 파싱 중 에러 발생
          PAGINATION_PARSING_RULE_IS_NOT_MATCH: 페이징 중 에러 발생
          ATTACH_PARSING_RULE_IS_NOT_MATCH: 첨부파일 파싱 중 에러 발생
          DOCUMENT_PARSING_RULE_IS_NOT_MATCH: 원문 파싱 중 에러 발생
          */
          logger.error(err.toString());
          message.errorMsg = err.toString();

          if (message.role === 'linkCollector') {
            message.status = 'linkCollectError';
          } else if (message.role === 'docCollector') {
            message.status = 'docCollectError';
          } else if (message.role === 'linkDocCollector') {
            message.status = 'linkDocCollectError';
          } else if (message.role === 'apiCollector') {
            message.status = 'apiCollectError';
          }

          AQSProducer.produce(message, callback);
        }
      } else {
        logger.debug('[collector] Step #10. 수집 완료');
        callback(null, message);
      }
    }); //waterfall

  }; // collect

  return {
    collect: collect
  }
})();

if (exports) {
  module.exports = collector;
}
