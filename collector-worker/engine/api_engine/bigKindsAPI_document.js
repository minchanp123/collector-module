const moment = require("moment");
const fs = require('fs');
const path = require("path");
const axios = require('axios');
const logger = require('../../lib/logger');
const api = require("../../lib/api");

const parser = data => {
  if (data !== undefined) {
    data = data
      .replace(
        /[^(\{\}\[\]\/\:\+=_<>!@#\$%\^&\*\(\)\-\.\,\;\'\"\＜\a-zA-Z0-9ㄱ-ㅎ가-힣\s)]/gi,
        ""
      )
      .replace(/\＜/g, "")
      .replace(/\＞/g, "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\'/g, "'")
      .replace(/\&/g, "&")
      .replace(/\r/g, "")
      .replace(/\t/g, "")
      .replace(/\b/g, "")
      .replace(/\f/g, "")
      .replace(/\"/g, '"')
      .replace(/\b/g, "")
      .replace(/[\u0003]+/g, "")
      .replace(/[\u0005]+/g, "")
      .replace(/[\u007F]+/g, "")
      .replace(/[\u001a]+/g, "")
      .replace(/[\u001e]+/g, "")
      .replace(/[\u0000-\u0019]+/g, "")
      .replace(/[\u001A]+/g, "");
  }
  return data;
};

const engine = (function() {
  const __getRequest = async (options) => {
    try {
      const response = await axios(options);

      if (response.status == 200) {
        return response;
      }
    } catch (e) {
      logger.error(e);
      return null;
    }
  }

  const execute = (async (params, callback) => {
    let requestUrl = params.requestUrl;
    const collectDataPath = params.collectDataPath;
    const userAgent = params.userAgent;
    const customer = params.customer;
    let startDt = params.startDt;
    let endDt = params.endDt;
    let keyword = params.keyword;
    const source = params.source;
    const requestSeq = params.requestSeq;
    let key = api.bigkinds.key[0];
	
    const startDtParse = startDt.split("-");
    const startDate = new Date(
      parseInt(startDtParse[0]),
      parseInt(startDtParse[1]) - 1,
      parseInt(startDtParse[2]),
      0,
      0,
      0
    );
    const endDtParse = endDt.split("-");
    const endDate = new Date(
      parseInt(endDtParse[0]),
      parseInt(endDtParse[1]) - 1,
      parseInt(endDtParse[2]),
      23,
      59,
      59
    );
    const reqEndDate = new Date(
      parseInt(endDtParse[0]),
      parseInt(endDtParse[1]) - 1,
      parseInt(endDtParse[2])
    );
    reqEndDate.setDate(reqEndDate.getDate() + 1);
    endDt = moment(reqEndDate).format('YYYY-MM-DD');

    let idList = [];

    logger.debug('[api] Step #1. API 접근');

    const link_options = {
      url: requestUrl,
      method: "POST",
      data: {
        "access_key": key,
        "argument": {
          "query": keyword,
          "published_at": {
            "from": startDt,
            "until": endDt
           },
          "provider": [
            "KBS", "MBC", "OBS", "SBS", "YTN", "강원도민일보", "강원일보", "경기일보", "경남도민일보", "경남신문",
            "경상일보", "경인일보", "광주매일신문", "광주일보", "국민일보", "국제신문", "내일신문", "대구일보", "대전일보", "매일신문",
            "머니투데이", "무등일보", "부산일보", "서울경제", "서울신문", "세계일보", "아시아경제", "아주경제", "영남일보", "울산매일",
            "전남일보", "전북도민일보", "전북일보", "전자신문", "제민일보", "중도일보", "중부매일", "중부일보", "충북일보", "충청일보",
            "충청투데이", "파이낸셜뉴스", "한겨레", "한국경제", "한국일보", "한라일보", "헤럴드경제"
           ],
          "category": [
           ],
          "category_incident": [
           ],
          "byline": "",
          "provider_subject": [
           ],
          "subject_info": [
            ""
            ],
          "subject_info1": [
            ""
            ],
          "subject_info2": [
            ""
            ],
          "subject_info3": [
            ""
            ],
          "subject_info4": [
            ""
            ],
          "sort": {"date": "desc"},
          "hilight": 200,
          "return_from": 0,
          "return_size": 1000,
          "fields": []
        }
      }
    };

    const doc_options = {
      url: requestUrl,
      method: "POST",
      data: {
        "access_key": key,
        "argument": {
          "news_ids": idList,
          "fields": [
            "content",
            "byline",
            "category",
            "category_incident",
            "images",
            "provider_subject",
            "provider_news_id",
            "publisher_code"
          ]
        }
      }
    };

    try {
      const response = await __getRequest(link_options);
      let links = response.data.return_object.documents;

      if (links) {
        for (let link of links) {
          let datetime = new Date(link.published_at);

          if (
            datetime.getTime() >= startDate.getTime() &&
            datetime.getTime() <= endDate.getTime()
          ) {
            idList.push(link.news_id);
          }
        }      

        logger.debug(
          "[api] Step #2. 뉴스ID 추출"
        );
  
        if (idList.length > 0) {
          doc_options.data.argument.news_ids = idList;
          
          const response2 = await __getRequest(doc_options);
          const docs = response2.data.return_object.documents;
  
          for (let doc of docs) {
            let result = {};
            title = doc.title;
            content = doc.content;
  
            result.media = doc.provider;
            result.doc_title = parser(title);
            result.doc_content = parser(content);
            result.source = source;
            result.customer_id = customer;
            result.search_keyword_text = keyword;
            
            const doc_datetime = moment(new Date(doc.published_at)).format("YYYY-MM-DD-HHmmss");
            result.pub_year = doc_datetime.split('-')[0];
            result.pub_month = doc_datetime.split('-')[1];
            result.pub_day = doc_datetime.split('-')[2];
            result.pub_time = doc_datetime.split('-')[3];
  
            const fileName =
              "D-1-" + moment().format("YYYYMMDDHHmm-ssSSS") + ".json";
            logger.debug(
              "[api] Step #3. 저장 " + collectDataPath + path.sep + fileName
            );
            await fs.writeFile(
              collectDataPath + path.sep + fileName,
              JSON.stringify(result),
              err => {
                if (err) throw err;
              }
            );
            await new Promise(resolve => setTimeout(resolve, 500));
          } 
        }
      } else {
        logger.debug('NO RESULTS');
      }
    } catch (error) {
      throw error;
    }

    logger.debug('[api] Step #4. 수집 종료');
    callback(null);
  });

  return {
    execute: execute
  };
})();

// engine.execute({
//   requestUrl: 'http://tools.kinds.or.kr:8888/search/news',
//   referUrl: '',
//   collectDataPath: 'C:/coding/test/crawler/collector_worker_sqs_v2/collect_data/',
//   userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.13; rv:62.0) Gecko/20100101 Firefox/62.0',
//   requestSeq: 0,
//   source: '빅카인즈',
//   customer: '',
//   startDt: '2018-01-03',
//   endDt: '2018-01-03',
//   keyword: '혈액부족',
//   injectScripts: [],
//   rule: {}
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
