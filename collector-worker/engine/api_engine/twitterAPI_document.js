const moment = require("moment");
const fs = require('fs');
const path = require('path');
const utf8 = require('utf8');
const axios = require('axios');
const logger = require('../../lib/logger');
const api = require("../../lib/api");

const md5Generator = (doc_url, pub_year, pub_month, pub_day) => {
  var crypto = require("crypto");
  var arrAsString =
    "['" +
    doc_url +
    "', '" +
    pub_year +
    "', '" +
    pub_month +
    "', '" +
    pub_day +
    "']";
  var id = crypto
    .createHash("md5")
    .update(utf8.encode(arrAsString))
    .digest("hex");

  return id;
};

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

const getDateTime = (dtParam) => {
  const datetime = new Date(dtParam);

  const year = datetime.getFullYear();
  const month = datetime.getMonth() + 1 < 10
              ? "0" + (datetime.getMonth() + 1).toString() 
              : (datetime.getMonth() + 1).toString();
  const day = datetime.getDate() < 10
              ? "0" + datetime.getDate() .toString() 
              : datetime.getDate() .toString();
  const hour = datetime.getHours() < 10 
              ? "0" + datetime.getHours() .toString() 
              : datetime.getHours() .toString();
  const minute = datetime.getMinutes() < 10 
              ? "0" + datetime.getMinutes() .toString() 
              : datetime.getMinutes() .toString();
  const second = datetime.getSeconds() < 10 
              ? "0" + datetime.getSeconds() .toString() 
              : datetime.getSeconds() .toString();
  return `${year}-${month}-${day}-${hour}${minute}${second}`;
};

const engine = (function() {
  const __getToken = async (options) => {
    try {
      const response = await axios(options);
      var reg = /gt=(\d+)/;
      let token = '';

      if (response !== null) {
        token = reg.exec(response.data)[1]
        return token;
      } else {
        return null;
      }
    } catch (e) {
      logger.error(e);
      return null;
    }
  }

  const __getIds = async (options) => {
    try {
      const response = await axios(options);
      let id = [];
      let cursor = "";

      if (response.status === 200) {
        const tweet = response.data.globalObjects.tweets;
        id = Object.keys(tweet);
        
        const entries = response.data.timeline.instructions[0].addEntries.entries;
        for(const e of entries){
          if (e.entryId == 'sq-cursor-bottom'){
            var reg = /scroll:(.*)/;
            cursor = reg.exec(e.content.operation.cursor.value)[0];
          }
        }
        
        if (cursor == ""){
          const entry = response.data.timeline.instructions[2].replaceEntry;
          if (entry.entryIdToReplace == 'sq-cursor-bottom'){
            cursor = entry.entry.content.operation.cursor.value
          }
        }

        return {
          id: id,
          cursor: cursor
        }
      } else {
        return null;
      }
    } catch (e) {
      return null;
    }
  }

  const __getData = async (options) => {
    try {
      const response = await axios(options);
      
      if (response !== null) {
        const user = response.data.globalObjects.users;
        const tweets = Object.values(response.data.globalObjects.tweets);
        
        return {
          user: user,
          tweets:  tweets
        }
      } else {
        return null;
      }
    } catch (e) {
      return null;
    }
  }

  const __makeCursorParam = function(cursor) {
    let cursorParam = "";
    if (cursor) {
      cursorParam += "&cursor=" + cursor;
    }
    
    return cursorParam;
  };

  const __changeKey = function() {
    let key = "";
    function random(min, max) {
      return Math.floor((Math.random() * (max - min + 1)) + min);
    }

    key = api.twitter.key[random(0, api.twitter.key.length-1)];
    return key;
  }

  const execute = (async (params, callback) => {
    let requestUrl = params.requestUrl;
    const collectDataPath = params.collectDataPath;
    const userAgent = params.userAgent;
    let startDt = params.startDt;
    let endDt = params.endDt;
    const customer = params.customer;
    const source = params.source;
    const requestSeq = params.requestSeq;
    const keyword = params.keyword;
    let key = api.twitter.key[0];
    let _url = "";

    const endDtParse = endDt.split("-");
    const endDate = new Date(
      parseInt(endDtParse[0]),
      parseInt(endDtParse[1]) - 1,
      parseInt(endDtParse[2])
    );
    endDate.setDate(endDate.getDate() + 1);
    endDt = moment(endDate).format('YYYY-MM-DD');

    const tokenOptions = {
      url: "https://mobile.twitter.com/search?q="+encodeURIComponent(keyword),
      method: "GET",
      headers: {
        "User-Agent": userAgent
      }
    };

    logger.debug('[api] Step #1. API 접근 - TOKEN 생성');

    const token = await __getToken(tokenOptions);
    logger.debug('[api] ### TOKEN: ' + token);

    let cursorParam = __makeCursorParam();
    let pageNum = 1;

    try {
      while (pageNum < 1000){
        logger.debug('[api] Step #2. API 접근 - docID 접근');
        _url = requestUrl + "q=" + encodeURIComponent(keyword) + " since:" + startDt + " until:" + endDt + cursorParam ;
        logger.debug('[api] ### search keyword: ' + keyword + " / " + startDt + " to " + endDt);
        logger.debug('[api] ### request url: '+_url);

        const options = {
          url: _url,
          method: "GET",
          headers: {
            "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7,und;q=0.6",
            "authorization": key,
            "x-guest-token": token
          }
        };

        logger.debug('[api] Step #3. API 접근 - doc 추출');
        const docId = await __getIds(options);

        if (!docId) {
          logger.debug('[api] API KEY CHANGE');
          key = __changeKey();
        } else {
          if (docId.id.length > 0){
            for (const doc of docId.id){
              _url = "https://api.twitter.com/2/timeline/conversation/" + doc + ".json";
              let result = {};
              let comment = {};
              let comments = [];
    
              options.url = _url;
              const data = await __getData(options);
              const user = data.user;
    
              for(const tweet of data.tweets){
                if (tweet.id_str == doc){
                  result.doc_id = tweet.id_str;
                  result.doc_title = source;
                  result.doc_content = parser(tweet.text);
                  result.doc_writer = user[tweet.user_id_str].name; // id=screen_name
                  result.doc_writer_following = user[tweet.user_id_str].friends_count;
                  result.doc_writer_follower = user[tweet.user_id_str].followers_count;
                  result.doc_url = 'https://twitter.com/' + user[tweet.user_id_str].screen_name + '/status/' + tweet.id_str;
                  result.pub_year = getDateTime(tweet.created_at).split('-')[0];
                  result.pub_month = getDateTime(tweet.created_at).split('-')[1];
                  result.pub_day = getDateTime(tweet.created_at).split('-')[2];
                  result.pub_time = getDateTime(tweet.created_at).split('-')[3];
                  result.img_url = [],
                  result.view_count = 0,
                  result.like_count = tweet.favorite_count,
                  result.dislike_count = 0,
                  result.share_count = 0,
                  result.locations = "",
                  result.source = source,
                  result.search_keyword_text = keyword,
                  result.customer_id = customer,
                  result.uuid = md5Generator(
                    result.doc_url,
                    result.pub_year,
                    result.pub_month,
                    result.pub_day
                  );
                  result.depth1_seq = 3,
                  result.depth2_seq = 16,
                  result.depth3_seq = 0,
                  result.depth1_nm = "SNS",
                  result.depth2_nm = "트위터",
                  result.depth3_nm = null;
                  result.doc_second_url = "NULL"
                } else {
                  comment.cmt_writer = user[tweet.user_id_str].name;
                  comment.cmt_content = parser(tweet.text);
                  comment.cmt_datetime = getDateTime(tweet.created_at);
                  comments.push(comment);
                  comment = {};
                }
                result.comments = comments;
                result.comment_count = comments.length;
              }
    
              // 저장
              const fileName =
                "D-1-" + moment().format("YYYYMMDDHHmm-ssSSS") + ".json";
              logger.debug(
                "[api] Step #4. 저장 " + collectDataPath + path.sep + fileName
              );
              await fs.writeFile(
                collectDataPath + path.sep + fileName,
                JSON.stringify(result),
                err => {
                  if (err) throw err;
                }
              );
            }
          } else {
            logger.debug('[api] NO MORE RESULT');
            break;
          }
          
          if (docId.cursor) {
            logger.debug('[api] ### 페이징');
            cursorParam = __makeCursorParam(docId.cursor);
            pageNum++;
          }
        }
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

// engine.execute({
//   requestUrl: 'https://api.twitter.com/2/search/adaptive.json?',
//   referUrl: '',
//   collectDataPath: 'C:/coding/test/crawler/tweetCrawler_api/collect_data/',
//   userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.13; rv:62.0) Gecko/20100101 Firefox/62.0',
//   requestSeq: 0,
//   source: '트위터',
//   customer: 'test',
//   startDt: '2020-01-01',
//   endDt: '2020-01-01',
//   keyword: '국세청',
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