const moment = require('moment');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const async = require('async');

const logger = require('../../lib/logger');

// 한국은행
const engine = (function() {
  const execute = (async (params, callback) => {
    // [서비스명]/[인증키]/[요청타입]/[언어]/[요청시작건수]/[요청종료건수]/[통계코드]/[주기]/[검색시작일]/[검색종료일자]/[항목코드1]/[항목코드2]/[항목코드3]
    /*
    let req_name = 'StatisticSearch'; // 서비스명
    let req_key = 'IFH0SXJ0IBLNLFY88R2Y'; // 인증키
    let req_type = 'json'; // 요청타입
    let req_lang = 'kr'; // 언어
    let req_sCount = 1; // 요청시작건수
    let req_eCount = 10; // 요청종료건수
    let req_code = '060Y001';
    let req_freq = 'DD'; //주기
    let req_startDt = '20110101'; //검색시작일
    let req_endDt = '20180320'; // 검색종료일자
    let req_itemCode1 = 10502000; // 항목코드1
    let req_itemCode2 = ''; // 항목코드2
    */

    // 종료건수 최대 5만 개가 넘는 api(원/엔(100엔) 환율(매매기준율))도 존재함.
    // let requestUrl = 'http://ecos.bok.or.kr/api/StatisticSearch/IFH0SXJ0IBLNLFY88R2Y/json/kr/1/10/060Y001/DD/20110101/20180320/010502000/';

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
      var s_month = startDtParse[1]-2; // 현재 날짜 기준으로 두달 전 데이터까지 뽑아서 제공 (데이터 누락 문제 발생 가능성 있어서 세달로 설정.)
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
    } else if (period === 'MM') {
      startDt = startDtParse[0] + startDtParse[1];
      endDt = endDtParse[0] + endDtParse[1];
    } else {
      startDt = startDtParse[0];
      endDt = endDtParse[0];
    }

    let pageSeq = 1;
    let totalCount = 501;
    let onGoingFlag = true;
    let urlParser = requestUrl.split('/');
    logger.debug(urlParser);
    urlParser[11] = period;
    urlParser[12] = startDt;
    urlParser[13] = endDt;

    // urlParser[8], urlParser[9] == 보여 질 페이지 수 urlParser[11,12,13] == DD, 시작날짜, 종료날짜
    while (onGoingFlag) {
      requestUrl = '';

      for (var idx in urlParser) {
        if(idx < urlParser.length - 1){
          requestUrl += urlParser[idx] + '/';
        } else {
          requestUrl += urlParser[idx];
        }
      }

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

      if (response.data.StatisticSearch !== undefined) {
        totalCount = response.data.StatisticSearch.list_total_count;
        logger.debug('[api] ### pageNum = ' + pageSeq + ', listCount = ' + totalCount);

        result.doc_content = JSON.stringify(response.data.StatisticSearch.row);

        // 저장
        const fileName = 'D-' + pageSeq + '-' + now.format('YYYYMMDDHHmm-ssSSS') + '.json';
        logger.debug('[api] Step #2. 저장 ' + collectDataPath + path.sep + fileName);
        await fs.writeFile(collectDataPath + path.sep + fileName, JSON.stringify(result), (err) => {
          if (err) throw err;
        });

        pageSeq++;

        if (urlParser[9] < totalCount) { // 초기 totalCount = 501로 설정(바로 안끝나게끔) 아래쪽에 response에서 실제 totalCount 를 받아옴.
          urlParser[8] = parseInt(urlParser[8]) + 500;
          urlParser[9] = parseInt(urlParser[9]) + 500;
        } else {
          onGoingFlag = false;
        }
      } else {
        onGoingFlag = false;
      }
    } // while

    logger.debug('[api] Step #3. 수집 종료');
    callback(null);
  });

  return {
    execute: execute
  };
})();

// engine.execute({
//   requestUrl: 'http://ecos.bok.or.kr/api/StatisticSearch/IFH0SXJ0IBLNLFY88R2Y/json/kr/1/500/099Y001/MM/201803/201803/A',
//   collectDataPath: '/Users/gimgisu/example01/output/',
//   userAgent: 'Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; WOW64; Trident/6.0)',
//   requestSeq: 0,
//   source: '한국은행 경제통계시스템 > CD수익률(91일)',
//   customer: 'koreaexim',
//   startDt: '2018-12-02',
//   endDt: '2018-12-02',
//   period: 'MM',
//   injectScripts: []
// }, (err) => {
//   if (err) {
//     logger.error(err);
//   } else {
//     logger.info('[api] Finished');
//   }
// });

if (exports) {
  module.exports = engine;
}
