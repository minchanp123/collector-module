const aws = require('aws-sdk');
const async = require('async');
const moment = require('moment');
const os = require('os');
const interfaces = os.networkInterfaces();
const { QueueServiceClient, StorageSharedKeyCredential } = require("@azure/storage-queue");
const { ServiceBusClient } = require("@azure/service-bus");
const config = require('../config');
const logger = require('../lib/logger');
const slack = require('../lib/slack');
const md5 = require('md5');

// 시간 설정을 한국 시간으로 맞추기
// moment().utcOffset('+09:00');

var producer = (function() {

  const engine = config.server.engine;
  const engines = config.server.engines;

  const mode = config.azure.mode;
  const modes = config.azure.modes;

  //azure storage queue 세팅
  const account = config.azure.storageQueueAccount; //스토리지 이름
  const accountKey = config.azure.AZURE_STORAGE_QUEUE_CONNECTION_STRING; //스토리지 엑세스 키
  const sharedKeyCredential = new StorageSharedKeyCredential(account, accountKey); //엑세스 연결 함수
  const queueServiceClient = new QueueServiceClient(`https://${account}.queue.core.windows.net`, sharedKeyCredential);

  //azure ServiceBus 세팅
  const connectionString = config.azure.AZURE_SERVICE_BUS_CONNECTION_STRING
  const sbClient = new ServiceBusClient(connectionString);

  //Default
  let queueName = '';

  logger.debug('[AQS/producer] Produser 시작 [mode: ' + mode + ']');

  /**
   * AWS S3 메세지 발송
   * @param  {jsonObj}   message  발송 메시지
   */
  const produce = function(message, callback) {

    // 서버 정보 입력
    let addresses = [];
    for (let idx in interfaces) {
      for (let idx2 in interfaces[idx]) {
        let address = interfaces[idx][idx2];
        if (address.family === 'IPv4' && !address.internal) {
          addresses.push(address.address);
        }
      }
    }

    message.host = os.hostname();
    message.ip = addresses[0];

    let queueNames = [];
    let queueStatus = "service";

    // 수집 상태를 파악하여 queueName 그룹 세팅
    if (message.role === 'linkCollector') {
      if (message.status === 'ready' || message.status === 'linkRequest') {
        //Do nothing
      } else {
        queueNames = engine===engines[0]?config.azure.response.names:config.azure.response.casper.names;
      }
    } else if (message.role === 'docCollector') {
      if (message.status === 'docRequest') {
        queueNames = engine===engines[0]?config.azure.request.names:config.azure.request.casper.names; //DocCollect 요청
        queueStatus = "storage";
      } else if (message.status === 'docCollecting' || message.status === 'docFinished' || message.status === 'docCollectError') {
        queueNames = engine===engines[0]?config.azure.response.names:config.azure.response.casper.names;
      }
    } else if (message.role === 'linkDocCollector') {
      if (message.status === 'ready' || message.status === 'linkDocRequest') {
        //Do nothing
      } else if (message.status === 'linkDocCollecting' || message.status === 'linkDocFinished' || message.status === 'linkDocCollectError') {
        queueNames = engine===engines[0]?config.azure.response.names:config.azure.response.casper.names;
      }
    } else if (message.role === 'apiCollector') {
      if (message.status === 'ready' || message.status === 'apiRequest') {
        //Do nothing
      } else if (message.status === 'apiCollecting' || message.status === 'apiFinished' || message.status === 'apiCollectError') {
        queueNames = engine===engines[0]?config.azure.response.names:config.azure.response.casper.names;
      }
    }

    queueName = queueNames[modes.indexOf(mode)];

    if(queueStatus === "service"){ //serviceBus queue
      
      const sender = sbClient.createSender(queueName); //queue client 접속

      var payload = {} //body 필드에 json 정의
      payload.body = message;
      payload.messageId = md5(JSON.stringify(message));
  
      // 메세지 발송
      logger.info('[AQS/producer] 메시지 id : '+payload.messageId);
      logger.info('[AQS/producer] 발송 메시지 : ' + JSON.stringify(payload.body));
      
      
      try{
        sender.sendMessages(payload).then(() => {
            console.log('[AQS/producer] 발송 완료');
    
        }).then(()=>{callback(null);})
        //.then(()=>{sender.close();}).then(()=>{sbClient.close();}).then(()=>{callback(null);})
    
      }catch(err){
        //sender.close().then(()=>{sbClient.close();}).then(()=>{callback(err);})
	      callback(err);
      }

    }else{ //storage queue
      const queueClient = queueServiceClient.getQueueClient(queueName); //queue client 접속
      var payload = JSON.stringify(message);

      // 메세지 발송
      logger.info('[AQS/producer] 발송 메시지 : ' + JSON.stringify(payload));

      queueClient.sendMessage(payload).then((result, err)=>{
        if (err) {
          callback(err);
        } else {
          logger.info('[AQS/producer] 발송 결과 : ' + JSON.stringify(result));
          callback(null);
        }
      })

    }
  }; // produce

  return {
    produce: produce
  }
})();

if (exports) {
  module.exports = producer;
}

