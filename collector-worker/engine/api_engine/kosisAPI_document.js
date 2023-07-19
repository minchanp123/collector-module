const puppeteer = require('puppeteer');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const async = require('async');
const logger = require('../../lib/logger');

// 통계청
const engine = (function() {
  const execute = (async (params, callback) => {
    let requestUrl = params.requestUrl;
    const collectDataPath = params.collectDataPath;
    let startDt = params.startDt;
    let endDt = params.endDt;
    const period = params.period;
    const customer = params.customer;
    const source = params.source;
    const requestSeq = params.requestSeq;


    // startDt, endDt parsing
    const startDtParse = startDt.split('-');
    const startDate = new Date(parseInt(startDtParse[0]), parseInt(startDtParse[1]) - 1, parseInt(startDtParse[2]), 0, 0, 0);
    const endDtParse = endDt.split('-');
    const endDate = new Date(parseInt(endDtParse[0]), parseInt(endDtParse[1]) - 1, parseInt(endDtParse[2]), 23, 59, 59);

    const now = moment();

    // 날짜 변환 - 2018-03-05  >> 20180305
    // startDt = startDt.replace(/-/g, '');
    // endDt = endDt.replace(/-/g, '');

    if (period !== 'YY') {
      var s_month = startDtParse[1]-2; // 현재 날짜 기준으로 두달 전 데이터까지 뽑아서 제공 (데이터 누락 문제 발생 가능성 있어서 두달로 설정.)
      if (s_month < 1){
        startDtParse[1] = String((12 + s_month));
        startDtParse[0] = String(startDtParse[0]-1);
      } else if (s_month < 10){
        s_month = '0'+s_month;
        startDtParse[1] = String(s_month);
      } else {
        startDtParse[1] = String(s_month);
      }
    }

    // DD, MM, YY에 따라 날짜 변환 (MM이면 201803)
    if (period === 'DD') {
      startDt = startDtParse[0] + startDtParse[1] + startDtParse[2];
      endDt = endDtParse[0] + endDtParse[1] + endDtParse[2];
    } else if (period === 'MM' || period === 'QQ') {
      startDt = startDtParse[0] + startDtParse[1];
      endDt = endDtParse[0] + endDtParse[1];
    } else {
      startDt = startDtParse[0];
      endDt = endDtParse[0];
    }

    requestUrl = requestUrl + 'startPrdDe=' + startDt + '&endPrdDe=' + endDt;

    let result = {};
    result.source = source;
    result.customer = customer;
    result.doc_url = requestUrl;
    result.doc_datetime = startDate.toString();

    logger.debug('[api] Step #1. API 접근');
    logger.debug('[api] ### url : ' + requestUrl);
    const response = await axios({
      method: 'GET',
      url: requestUrl
    });

    if (response.data[0].TBL_NM !== undefined) { // 값이 있을때만 저장. 에러뜨면 저장 하지 않음.
      result.doc_content = JSON.stringify(response.data);

      // 저장
      const fileName = 'D-1-' + now.format('YYYYMMDDHHmm-ssSSS') + '.json';
      logger.debug('[api] Step #5. 저장 ' + collectDataPath + path.sep + fileName);
      await fs.writeFile(collectDataPath + path.sep + fileName, JSON.stringify(result), (err) => {
        if (err) throw err;
      });
    }

    logger.debug('[api] Step #3. 수집 종료');
    callback(null);
  });

  return {
    execute: execute
  };
})();

// engine.execute({
//   requestUrl: 'http://kosis.kr/openapi/statisticsData.do?method=getList&apiKey=MGRhZWU2ZGIwNDdiZmNkZGZhYjRkYTcxZGE4NjU2MzE=&format=json&jsonVD=Y&userStatsId=kexim/101/DT_1MS1501/2/1/20180307141413_1&prdSe=M&',
//   collectDataPath: '/Users/gimgisu/example01/output',
//   userAgent: 'Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; WOW64; Trident/6.0)',
//   requestSeq: 0,
//   source: '통계청 > 노동생산성지수 * 서비스업',
//   customer: 'koreaexim',
//   startDt: '2018-06',
//   endDt: '2018-06',
//   period: 'MM'
// }, (err) => {
//   if (err) {
//     logger.error(err);
//   } else {
//     logger.info('[chrome] Finished');
//   }
// });

if (exports) {
  module.exports = engine;
}
