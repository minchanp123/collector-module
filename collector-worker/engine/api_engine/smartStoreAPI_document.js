const moment = require("moment");
const fs = require("fs");
const path = require("path");
const utf8 = require("utf8");
const axios = require("axios");
const logger = require("../../lib/logger");
const depth = require("../../lib/depth");

const md5Generator = (doc_url, doc_content, doc_datetime) => {
    var crypto = require("crypto");
    var arrAsString =
      "['" +
      doc_url +
      "', '" +
      doc_content +
      "', '" +
      doc_datetime +
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
        .replace(/[\u001A]+/g, "")
        .replace(/\$TAG\$_[0-9]+_[0-9]+_/g, "")
        .replace(/\$END\$/g, "")
        .replace(/<b>/g, "")
        .replace(/<\/b>/g, "");
    }
    return data;
};

function randomNum(min, max){
    var randNum = Math.floor(Math.random()*(max-min+1)) + min;
    return randNum;
}

const engine = (function () {
    const execute = async function (params, callback) {
        let requestUrl = params.requestUrl;
        const collectDataPath = params.collectDataPath;
        const userAgent = params.userAgent;
        const customer = params.customer;
        const source = params.source;
        const requestSeq = params.requestSeq;
        const category = params.rule.category;
        const keyword = params.keyword;
        let storeUrl = "";
        let productNo = "";
        let pageNum = 1;
        const re = /[0-9]{10}/;

        for (const c of category) {
            if (keyword == c.keyword) {
                storeUrl = c.storeUrl + c.channelNo + "/products/";
                productNo = re.exec(c.productUrl)[0];
            }
        }

        const opt = {
            url: storeUrl + productNo,
            method: "GET"
        }
        const res = await(await axios(opt));

        let merchantNo = res.data.channel.naverPaySellerNo;
        let originProductNo = res.data.productNo;

        requestUrl = requestUrl + "merchantNo=" + merchantNo + "&originProductNo=" + originProductNo;

        while (pageNum <= 400){
            try {
                logger.debug("[chrome] Step #1. URL 접근 / " + requestUrl);
                logger.debug("[chrome] #### PAGE " + pageNum);

                const options = {
                    url: requestUrl + "&page=" + pageNum,
                    method: "GET"
                }

                const response = await axios(options);
                const resData = response.data.contents;

                if (!resData) {
                    logger.debug("[chrome] NO RESULTS");
                    break;
                } else {
                    logger.debug("[chrome] Step #2. 원문 룰 적용 및 수집");
                    for (const data of resData) {
                        let result = {};

                        result.doc_title = keyword;
                        result.doc_content = parser(data.reviewContent);
                        result.doc_url = data.productUrl;
                        result.doc_writer = data.writerMemberId;
                        result.score = data.reviewScore;
                        result.uuid = md5Generator(
                            result.doc_url,
                            result.doc_content,
                            data.createDate
                        );

                        if (data.helpCount) {
                            result.help_count = data.helpCount;
                        } else {
                            result.help_count = 0;
                        }

                        if (data.reviewComments) {
                            result.feedback = parser(data.reviewComments[0].commentContent);
                        } else {
                            result.feedback = "";
                        }
                        
                        if (data.productOptionContent) {
                            result.option = data.productOptionContent;
                        } else {
                            result.option = "";
                        }
                        
                        const doc_datetime = moment(data.createDate).format('YYYY-MM-DD');
                        result.pub_year = doc_datetime.split('-')[0];
                        result.pub_month = doc_datetime.split('-')[1];
                        result.pub_day = doc_datetime.split('-')[2];
                        result.pub_time = moment(data.createDate).format('HHmmss');
                        result.customer_id = customer;
                        result.source = "네이버 스마트스토어";
                        result.depth1_seq = depth.COMMON.NAVER_PORTAL[0];
                        result.depth2_seq = depth.COMMON.NAVER_PORTAL[1];
                        result.depth3_seq = depth.COMMON.NAVER_PORTAL[2];
                        result.depth1_nm = depth.COMMON.NAVER_PORTAL[3];
                        result.depth2_nm = "스마트스토어";
                        result.depth3_nm = depth.COMMON.NAVER_PORTAL[5];

                        const fileName =
                            "D-" + pageNum + "-" + moment().format("YYYYMMDDHHmmss-SSS") + randomNum(11, 99) + ".json";
                        logger.debug(
                            "[chrome] Step #3. 저장 " + collectDataPath + path.sep + fileName
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

                    pageNum++;
                }
            } catch (error) {
                logger.error(error);
                break;
            }
        }

        logger.debug('[chrome] Step #4. 수집 종료');
        callback(null);
    };

    return {
        execute: execute
    };
})();

// engine.execute(
//     {
//         requestUrl: "https://smartstore.naver.com/i/v1/reviews/paged-reviews?pageSize=20&sortType=REVIEW_SCORE_ASC&",
//         collectDataPath: "/home/ubuntu/collector_worker_sqs_v2/collect_data/",
//         userAgent:
//             "Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; WOW64; Trident/6.0)",
//         requestSeq: 0,
//         source: "스마트스토어",
//         customer: "test",
//         keyword: "허벌라이프",
//         category: [
//             {
//                 keyword: "쉐이크베이비",
//                 productNo: "merchantNo=510673781&originProductNo=4890412065"
//             },
//             {
//                 keyword: "그리밀",
//                 productNo: "merchantNo=510161428&originProductNo=2760768980"
//             },
//             {
//                 keyword: "뉴트리디데이",
//                 productNo: "merchantNo=500026587&originProductNo=307409588"
//             },
//             {
//                 keyword: "칼로바이",
//                 productNo: "merchantNo=500226694&originProductNo=4561955586"
//             },
//             {
//                 keyword: "디에트데이",
//                 productNo: "merchantNo=500174195&originProductNo=425458513"
//             },
//             {
//                 keyword: "셀렉스",
//                 productNo: "merchantNo=510133398&originProductNo=3642510833"
//             },
//             {
//                 keyword: "허벌라이프",
//                 productNo: "merchantNo=500040494&originProductNo=293276867"
//             },
//             {
//                 keyword: "지웨이",
//                 productNo: "merchantNo=500002617&originProductNo=3788525258"
//             },
//             {
//                 keyword: "원데이뉴트리션",
//                 productNo: "merchantNo=500002202&originProductNo=322497432"
//             },
//             {
//                 keyword: "GNM자연의품격",
//                 productNo: "merchantNo=500030812&originProductNo=2649011309"
//             }
//         ],
//         injectScripts: [
//             "../inject_script/listParser.js",
//             "../inject_script/documentParser.js"
//         ]
//     },
//     err => {
//         if (err) {
//             logger.error(err);
//         } else {
//             logger.info("[chrome] Finished");
//         }
//     }
// );

if (exports) {
    module.exports = engine;
}
