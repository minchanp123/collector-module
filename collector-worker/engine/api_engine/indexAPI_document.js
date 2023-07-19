const moment = require('moment');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const async = require('async');
const xml = require('xml-parse');
const parser = require('xml2json');

const logger = require('../../lib/logger');

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

    const now = moment();

    logger.debug('[api] Step #1. API 접근');
    logger.debug('[api] ### url : ' + requestUrl);

    const response = await axios({
      method: 'GET',
      // `responseType` indicates the type of data that the server will respond with
      // options are 'arraybuffer', 'blob', 'document', 'json', 'text', 'stream'
      // responseType: 'document', // default
      url: requestUrl
    });

    const datas = xml.parse(response.data);
    let jsonData = JSON.parse(parser.toJson(datas[1].text));
    let imports = '';
    let exports = '';

    let result = {};
    result.source = source;
    result.customer = customer;
    result.doc_url = requestUrl;
    result.doc_datetime = new Date(now).toString();
    var collector = [];

    if(requestUrl.indexOf('statsCode=278203') > -1) { // ICT전체 및 부문별 수출추이	> 휴대폰(부분품포함)
      logger.debug('[api] ### source : E-나라지표 > ICT 수출입 동향 ' + requestUrl.indexOf('statsCode=278203'));
      exports = jsonData.지표.통계표.표.항목[0].분류1[9]; // 수출 휴대폰
      imports = jsonData.지표.통계표.표.항목[1].분류1[9]; // 수입 휴대폰

      jsonData.지표.통계표.표.항목[0].분류1 = []; // 항목 아래 항목들 초기화
      jsonData.지표.통계표.표.항목[1].분류1 = []; // 항목 아래 항목들 초기화

      jsonData.지표.통계표.표.항목[0].분류1.push(exports); // 항목에 원하는 품목만 추가

      jsonData.지표.통계표.표.항목[1].분류1.push(imports); // 항목에 원하는 품목만 추가

      collector.push(jsonData);
    } else if(requestUrl.indexOf('statsCode=115501') > -1) { // 반도체, 디스플레이 > 디스플레이 수
      logger.debug('[api] ### source : E-나라지표 > 반도체,디스플레이산업 동향 ' + requestUrl.indexOf('statsCode=115501'));
      exports = jsonData.지표.통계표.표.항목그룹.항목[9]; // 디스플레이 수출

      jsonData.지표.통계표.표.항목그룹 = []; // 열 아래 항목들 초기화

      jsonData.지표.통계표.표.항목그룹.push(exports); // 열에 원하는 품목만 추가

      collector.push(jsonData);
    } else if(requestUrl.indexOf('statsCode=105901') > -1) { // 제조업 경기실사지수(BSI) 동향	> BSI실적, BSI전망
      logger.debug('[api] ### source : E-나라지표 > 제조업 경기실사지수(BSI) 동향 ' + requestUrl.indexOf('statsCode=105901'));

      collector.push(jsonData);
    } else if(requestUrl.indexOf('statsCode=114301') > -1) { // 주요 원자재 가격 동향(철강분야)	> 철근
      logger.debug('[api] ### source : E-나라지표 > 주요 원자재 가격 동향(철강분야) ' + requestUrl.indexOf('statsCode=114301'));
      let imports_year = jsonData.지표.통계표.표[0].항목.분류1[3]; // 원자재 가격_철근 (년)
      let imports_half = jsonData.지표.통계표.표[1].항목.분류1[3]; // 원자재 가격_철근 (반기)

      jsonData.지표.통계표.표[0].항목 = [];
      jsonData.지표.통계표.표[1].항목 = [];

      jsonData.지표.통계표.표[0].항목.push(imports_year);
      jsonData.지표.통계표.표[1].항목.push(imports_half);

      collector.push(jsonData);
    }

    result.doc_content = JSON.stringify(collector);

    // 저장
    const fileName = 'D-1-' + now.format('YYYYMMDDHHmm-ssSSS') + '.json';
    logger.debug('[api] Step #2. 저장 ' + collectDataPath + path.sep + fileName);
    await fs.writeFile(collectDataPath + path.sep + fileName, JSON.stringify(result), (err) => {
      if (err) throw err;
    });

    logger.debug('[api] Step #3. 수집 종료');
    callback(null);
  });

  return {
    execute: execute
  };
})();

// engine.execute({
//   requestUrl: 'http://www.index.go.kr/openApi/xml_stts.do?idntfcId=3A3311A1853E410W&statsCode=278203',
//   source: 'E-나라지표 > ICT 수출입 동향',
//   collectDataPath: '/Users/gimgisu/example01/output',
//   userAgent: 'Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; WOW64; Trident/6.0)',
//   requestSeq: 0,
//   customer: 'koreaexim',
//   startDt: '2011-01-01',
//   endDt: '2018-03-20',
//   period: 'DD'
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
