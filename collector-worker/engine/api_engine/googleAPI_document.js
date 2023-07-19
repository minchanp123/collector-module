const moment = require("moment");
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const logger = require('../../lib/logger');
const api = require("../../lib/api");

const cx = api.search.cx[0];
const startDate = process.argv[2];
const endDate = process.argv[3];
const startDt = moment(startDate).format('YYYYMMDD');
const endDt = moment(endDate).format('YYYYMMDD');
const code = process.argv[4];

const parser = data => {
  if (data !== undefined) {
    data = data
      .replace(/\'/g, "'")
      .replace(/\"/g, '"')
      .replace(/[\u0000-\u0019]+/g, "");
  }
  return data;
};

const engine = (function() {
  const __getData = async (options) => {
    try {
      const response = await axios(options);
      
      if (response.status === 200) {
        return {
          doc: response.data.items,
          st: response.status
        }
      } else {
        return null;
      }
    } catch (e) {
      return null;
    }
  }

  const __makeListParam = function(startIndex) {
    listParam = "&lr=lang_" + code + "&cx=" + cx + "&sort=date:r:" + startDt + ":" + endDt; //date range : &date:r:yyyymmdd:yyyymmdd
    if (startIndex) {
      startIndex = startIndex*10 + 1;
      listParam += "&start=" + startIndex;
    }
    return listParam;
  };

  const __changeKey = function() {
    let key = "";
    function random(min, max) {
      return Math.floor((Math.random() * (max - min + 1)) + min);
    }

    key = api.search.key[random(0, api.search.key.length-1)];
    return key;
  }

  const execute = (async (params, callback) => {
    let requestUrl = params.requestUrl;
    const collectDataPath = params.collectDataPath;
    const userAgent = params.userAgent;
    const customer = params.customer;
    const keyword = process.argv[5];
    let key = api.search.key[0];
    
    const now = moment();

    let q = encodeURIComponent(keyword);
    let listUrl = requestUrl + "q=" + q;
    let listParam = __makeListParam();

    let pageNum = 0;
    let urlList = [];

    try {
      while (pageNum < 10) {
        const options = {
          url: listUrl + listParam + "&key=" + key,
          method: "GET",
          headers: {
            "User-Agent": userAgent,
            "accept-language": "en-US,en;q=0.8"
          }
        };

        logger.debug("[api] Step #1. Google Search API - url 접근");
        logger.debug("[api] ### PageNum: " + Number(pageNum+1));
        logger.debug("[api] ### search url: " + options.url);

        const data = await __getData(options);

        if (!data) {
          logger.debug('[api] API KEY CHANGE');
          key = __changeKey();
        } else {
          if (data.st === 200 && data.doc !== undefined) {
            for (const doc of data.doc){
              let result = {};
              result.doc_title = parser(doc.title);
              result.doc_content = parser(doc.snippet);
              result.doc_url = doc.link;
              result.language = code;
              result.keyword = keyword;
              urlList.push(result);
            }
          } else {
            logger.debug('[api] NO MORE RESULT');
            break;
          }
          pageNum++;
          listParam = __makeListParam(pageNum);
        }
      }

      if (urlList.length > 0) {
        logger.debug("[api] Step #2. 저장");
        logger.debug(
          "[api] ### filePath: " + collectDataPath + keyword + ".json"
        );
        fs.writeFile(
          collectDataPath + path.sep + keyword + ".json",
          JSON.stringify(urlList),
          err => {
              if (err) throw err;
          }
        );
      }
    } catch (error) {
      throw error;
    }
    
    logger.debug('[api] Step #3. 수집 종료');
    callback(null);
  });

  return {
    execute: execute
  };
})();

engine.execute(
  {
    requestUrl: "https://www.googleapis.com/customsearch/v1?",
    collectDataPath: "/home/ubuntu/collector_worker_sqs_v2/collect_data/apiGoogle/",
    userAgent:
      "Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; WOW64; Trident/6.0)",
    requestSeq: 0,
    source: "",
    customer: "",
    startDt: "",
    endDt: "",
    keyword: "",
  },
  err => {
    if (err) {
      logger.error(err);
    } else {
      logger.info("[chrome] Finished");
    }
  }
);

if (exports) {
  module.exports = engine;
}


