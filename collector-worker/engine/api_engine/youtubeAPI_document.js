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
  const __getVideoId = async (options) => {
    try {
      const response = await axios(options);

      if (response.status === 200) {
        return {
          items: response.data.items,
          pageToken: response.data.nextPageToken
        };
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
      
      if (response.status === 200) {
        return response.data.items[0].snippet;
      } else {
        return null;
      }
    } catch (e) {
      return null;
    }
  }

  const __getComment = async (options) => {
    try {
      const response = await axios(options);
      
      if (response.status === 200) {
        return {
          items: response.data.items,
          nextPageToken: response.data.nextPageToken
        };
      } else {
        return null;
      }
    } catch (e) {
      return null;
    }
  }

  const __makeListParam = function(pageToken) {
    let listParam = "&part=snippet&maxResults=50&order=date";
    if (pageToken) {
      listParam += "&pageToken=" + pageToken;
    }
    return listParam;
  };

  const __makeVideoParam = function(id) {
    let listParam = "&part=snippet";
    if (id) {
      listParam += "&id=" + id;
    }
    return listParam;
  };

  const __makeCmtParam = function(pageToken, id) {
    let listParam = "&part=snippet";
    if (pageToken) {
      listParam += "&pageToken=" + pageToken;
    }
    if (id) {
      listParam += "&videoId=" + id;
    }
    return listParam;
  };

  const __changeKey = function() {
    let key = "";
    function random(min, max) {
      return Math.floor((Math.random() * (max - min + 1)) + min);
    }
    
    key = api.youtube.key[random(0, api.youtube.key.length-1)];
    return key;
  }

  const execute = (async (params, callback) => {
    let requestUrl = params.requestUrl;
    const collectDataPath = params.collectDataPath;
    const userAgent = params.userAgent;
    const startDt = params.startDt + "T00:00:00Z";
    const customer = params.customer;
    const source = params.source;
    const requestSeq = params.requestSeq;
    const keyword = params.keyword;
    let key = api.youtube.key[0];
    let videoId = "";
    
    const endDtParse = params.endDt.split("-");
    const endDate = new Date(
      parseInt(endDtParse[0]),
      parseInt(endDtParse[1]) - 1,
      parseInt(endDtParse[2])
    );
    endDate.setDate(endDate.getDate() + 1);
    const endDt = moment(endDate).format('YYYY-MM-DD') + "T00:00:00Z";

    let q = encodeURIComponent(keyword);
    let listParam = __makeListParam();
    let videoParam = __makeVideoParam();
    let cmtParam = __makeCmtParam();

    let pageNum = 1;
    let cmtNum = 1;

    logger.debug('[api] Step #1. API 접근 - videoId 생성');
    try {
      while (pageNum < 1000){
        let listUrl =
          requestUrl +
          "q=" + q +
          "&publishedBefore=" + endDt +
          "&publishedAfter=" + startDt +
          "&key=" + key;

        const searchOptions = {
          url: listUrl + listParam,
          method: "GET",
          headers: {
            "User-Agent": userAgent
          }
        };

        const urlList = await __getVideoId(searchOptions);
        logger.debug('[api] Step #1. request url ## ' + searchOptions.url);

        if (!urlList) {
          logger.debug('[api] API KEY CHANGE');
          key = __changeKey();
        } else {
          if (urlList.items.length > 0){
            let result = {};
            let comment = {};
            let comments = [];

            for (const item of urlList.items) {
              videoId = item.id.videoId;
              videoParam = __makeVideoParam(videoId);
              cmtParam = __makeCmtParam("", videoId);
              
              const videoOptions = {
                url: 'https://www.googleapis.com/youtube/v3/videos?key=' + key + videoParam,
                method: "GET",
                headers: {
                  "User-Agent": userAgent
                }
              };

              logger.debug('[api] Step #2. API 접근 - video 추출');
              //logger.debug('[api] Step #2. request url ## ' + videoOptions.url);

              const video = await __getData(videoOptions);

              if (!video) {
                logger.debug('[api] API KEY CHANGE');
                key = __changeKey();
              } else {
                result.doc_title = parser(video.title);
                result.doc_content = parser(video.description);
                result.doc_writer = video.channelTitle;
                result.doc_url = 'https://www.youtube.com/watch?v=' + videoId;
                result.pub_year = getDateTime(video.publishedAt).split('-')[0];
                result.pub_month = getDateTime(video.publishedAt).split('-')[1];
                result.pub_day = getDateTime(video.publishedAt).split('-')[2];
                result.pub_time = getDateTime(video.publishedAt).split('-')[3];
                result.img_url = [],
                result.view_count = 0,
                result.like_count = 0,
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
                result.depth2_seq = 10263,
                result.depth3_seq = 0,
                result.depth1_nm = "SNS",
                result.depth2_nm = "유튜브",
                result.depth3_nm = null;
                result.doc_second_url = "NULL"
                
                logger.debug('[api] Step #2-1. API 접근 - comment 추출');
                  
                // 스크롤 10번까지 수집
                while (cmtNum < 10) {
                  const commentOptions = {
                    url: 'https://www.googleapis.com/youtube/v3/commentThreads?key=' + key + cmtParam,
                    method: "GET",
                    headers: {
                      "User-Agent": userAgent
                    }
                  };
        
                  //logger.debug('[api] Step #2-1. request url ## ' + commentOptions.url);
        
                  const videoComment = await __getComment(commentOptions);
                  if (!videoComment) {
                    logger.debug('[api] API KEY CHANGE');
                    key = __changeKey();
                  } else {
                    if (videoComment.items.length > 0) {
                      for (const item of videoComment.items) {
                        comment.cmt_writer = item.snippet.topLevelComment.snippet.authorDisplayName;
                        comment.cmt_content = parser(item.snippet.topLevelComment.snippet.textOriginal);
                        comment.cmt_datetime = getDateTime(item.snippet.topLevelComment.snippet.publishedAt);
                        comments.push(comment);
                        comment = {};
                      }
                    } else {
                      logger.debug('[api] NO COMMENT');
                      break;
                    }
        
                    if(videoComment.nextPageToken) {
                      logger.debug('[api] ### 댓글 스크롤링');
                      cmtParam = __makeCmtParam(videoComment.nextPageToken, videoId);
                      cmtNum++;
                    } else {
                      break;
                    }
                  }
                }
                result.comments = comments;
                result.comment_count = comments.length;
                cmtNum = 1;
                comments = [];

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
            }
          } else {
            logger.debug('[api] NO MORE LIST RESULT');
            break;
          }
        }

        if (urlList.pageToken) {
          logger.debug('[api] ### 페이징');
          listParam = __makeListParam(urlList.pageToken);
          pageNum++;
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
//   requestUrl: 'https://www.googleapis.com/youtube/v3/search?',
//   referUrl: '',
//   collectDataPath: 'C:/coding/test/crawler/collector_worker_sqs_v2/collect_data/',
//   userAgent: 'Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; WOW64; Trident/6.0)',
//   requestSeq: 1,
//   source: '유튜브',
//   customer: 'NTS1',
//   startDt: '2019-11-26',
//   endDt: '2019-11-26',
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
