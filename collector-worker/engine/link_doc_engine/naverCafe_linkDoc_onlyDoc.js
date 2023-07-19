const puppeteer = require("puppeteer");
const moment = require("moment");
const fs = require("fs");
const path = require("path");
const logger = require("../../lib/logger");
const depth = require("../../lib/depth");

// 다음 페이지 url build
const urlBuilder = (mainURL, startDt, endDt, keyword, pageNum) => 
  (mainURL +
    "q=" +
    keyword +
    "&p=" +
    pageNum +
    "&pr=7" +
    "&ps=" +
    startDt +
    "&pe=" +
    endDt +
    "&keyword=" +
    encodeURIComponent(keyword)
  );

// 정규식 파싱
const parser = (data) => {
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

// 문서 수집
const collectDocument = async (page, link, params, parser) => {
  try {
    const docSelectors = params.rule.docSelectors[0];
    const commentSelectors = params.rule.commentSelectors;
    const injectScripts = params.injectScripts;
    const source = params.source;
    const keyword = params.keyword;
    const customer = params.customer;


    logger.debug("[chrome] Step #5-2. 스크립트 인젝팅");
    for (let injectScript of injectScripts) {
      await page.addScriptTag({
        path: injectScript,
      });
    }

    await page.waitFor(docSelectors.crawlerInterval);
              
    logger.debug("[chrome] Step #5-3. 원문 룰 적용 및 수집 ");
    const result = await page.evaluate(function (selectors) {
      return __parseDocument(selectors);
    }, docSelectors);

    // 230711 추가
    const cafe_name = await page.evaluate(function (selectors) {
      let result = document.querySelector("body > h1");
      result = result != null ? result.innerText : null;
      return result;
    }, docSelectors);

    if (result === null || result === undefined) {
      return "DOCUMENT_PARSING_RULE_IS_NOT_MATCH";
    } else if (Object.keys(result).length === 0) {
      return "NO_RESULTS";
    } else {
      const title = result.doc_title;
      const content = result.doc_content;
      const doc_datetime = moment(new Date(result.doc_datetime)).format(
        "YYYY-MM-DD-HHmmss"
      );

      result.doc_title = parser(title);
      result.doc_content = parser(content);
      result.doc_url = link.split("?art")[0];
      result.img_url = [];
      result.dislike_count = 0;
      result.share_count = 0;
      result.locations = "";
      result.source = source;
      result.uuid = "";
      result.customer_id = customer;
      result.search_keyword_text = keyword;
      result.pub_year = doc_datetime.split("-")[0];
      result.pub_month = doc_datetime.split("-")[1];
      result.pub_day = doc_datetime.split("-")[2];
      result.pub_time = doc_datetime.split("-")[3];
      result.doc_datetime = undefined;
      result.depth1_seq = depth.COMMON.NAVER_CAFE[0];
      result.depth2_seq = depth.COMMON.NAVER_CAFE[1];
      result.depth3_seq = depth.COMMON.NAVER_CAFE[2];
      result.depth1_nm = depth.COMMON.NAVER_CAFE[3];
      result.depth2_nm = depth.COMMON.NAVER_CAFE[4];
      result.depth3_nm = depth.COMMON.NAVER_CAFE[5];
      result.doc_second_url = "NULL";
      result.cafe_name = cafe_name;
                
      await page.waitFor(docSelectors.crawlerInterval);
      return result;
    }

  } catch (err) {
    return err.message;
  }
};

const engine = (function () {
  const execute = function (params, callback) {
    puppeteer
      .launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      })
      .then(async (browser) => {
        const userAgent = params.userAgent;

        // startDt, endDt parsing (YYYY-MM-DD => YYYYMMDD)
        const startDtParse = params.startDt.split("-");
        const endDtParse = params.endDt.split("-");
        const startDate = startDtParse[0] + startDtParse[1] + startDtParse[2];
        const endDate = endDtParse[0] + endDtParse[1] + endDtParse[2];

        // urlBuilder 파라미터
        const keyword = params.keyword;
        let mainURL = params.requestUrl;
        let pageNum = 1;
        let requestURL = urlBuilder(mainURL, startDate, endDate, keyword, pageNum);

        // page evaluation 시 필요한 파라미터
        const linkSelectors = params.rule.linkSelectors;
        const injectScripts = params.injectScripts;
        const itemNumPerPage = 12;

        const source = params.source;
        const collectDataPath = params.collectDataPath;

        logger.info("검색어 -> " + keyword);
        logger.info("검색기간 -> " + startDate + " ~ " + endDate);

        const page = await browser.newPage();
        await page.setUserAgent(userAgent);
        await page.setRequestInterception(true);

        page.on("request", (interceptedRequest) => {
          // 불필요한 리소스 제외
          if (
            interceptedRequest._url.endsWith(".jpg") ||
            interceptedRequest._url.endsWith(".png")
          ) {
            interceptedRequest.abort();
          } else {
            interceptedRequest.continue();
          }
        });

            
        // 다이얼로그 옵션 추가
        let dialogFlag = false;
        page.on("dialog", (dialog) => {
          logger.debug("### DIALOG MESSAGE : " + dialog.message());
          logger.debug("### DIALOG TYPE : " + dialog.type());
          dialog.dismiss();

          dialogFlag = true;
        });

        await page.setViewport({
          width: 960,
          height: 540,
        });

        logger.debug(`[chrome] Step #1. 검색 첫 페이지로 이동 : ${requestURL}`);
        await page.goto(requestURL, { waitUntil: "networkidle2" });
        await page.waitFor(linkSelectors.crawlerInterval);
        
        logger.debug("[chrome] Step #2. 스크립트 인젝팅");
        for (let injectScript of injectScripts) {
          logger.debug("[chrome] ### injectScriptPath: " + injectScript);
          await page.addScriptTag({
            path: injectScript,
          });
        }

        // 페이징 인터벌
        await page.waitFor(linkSelectors.crawlerInterval);

        let onGoingFlag = true;
        let pagingCnt = 0;

        // 검색결과 건수 확인
        const totalResCntStr = await page.evaluate(function (selectors) {
          return __parseTotalResCnt(selectors);
        }, linkSelectors);

        if (
          totalResCntStr !== null &&
          totalResCntStr !== undefined &&
          parseInt(totalResCntStr) !== 0
        ) {
          let totalResCnt = parseInt(totalResCntStr);

          // 룰 파일에서 설정한 maxResultCount 까지만 수집
          if (totalResCnt >= linkSelectors.maxResultCount) {
            pagingCnt = linkSelectors.maxPagingCount;
            totalResCnt = linkSelectors.maxResultCount;
          } else {
            pagingCnt = Math.ceil(totalResCnt / itemNumPerPage);
          }

          logger.info(
            "[chrome] ### 전체 결과 개수 : " +
              totalResCnt +
              " / 검색할 페이지 개수 : " +
              pagingCnt
          );
        } else {
          onGoingFlag = false;
          logger.info("[chrome] ### NO SEARCH RESULTS. END COLLECTION.");
          await browser.close();
          throw Error("NO_RESULTS");
        }

        let allLinksSetList = new Set();

        while (pageNum <= pagingCnt && onGoingFlag) {
          let duple = false;
          let tmpLinkList = [];

          await page.waitFor(linkSelectors.crawlerInterval);
          // 인젝트 스크립트 설정 (주의! 인젝트 스크립트는 URL 접근 후 세팅 되어야함)
          logger.debug("[chrome] Step #3. 스크립트 인젝팅");
          for (let injectScript of injectScripts) {
            logger.debug("[chrome] ### injectScriptPath: " + injectScript);
            await page.addScriptTag({
              path: injectScript,
            });
          }

          // 페이징 인터벌
          await page.waitFor(linkSelectors.crawlerInterval);

          logger.debug("[chrome] Step #4. 문서링크 추출");
          logger.debug("[chrome] ### requestURL : " + requestURL);
          const lists = await page.evaluate(function (linkSelectors) {
            return __parseList(linkSelectors);
          }, linkSelectors);

          await page.waitFor(linkSelectors.crawlerInterval);
          
          if (lists === null) {
            await browser.close();
            throw Error("LIST_PARSING_RULE_IS_NOT_MATCH");
          } else if (lists.length === 0) {
            await browser.close();
            throw Error("NO_RESULTS");
          } else {
            logger.info(`[chrome] ### BRIEFING -> | ${source} | ${keyword} | ${pageNum} / ${pagingCnt} Page |`);
           
            for (let i = 0; i < lists.length; i++) {
              const linkRegx = new RegExp(linkSelectors.linkPatternRegex);
              const [ realLink, ] = linkRegx.exec(lists[i].link); // 쿠키값 제거한 url로 중복체크

              if (allLinksSetList.has(realLink)) {
                logger.debug("[chrome] ### 중복링크 제거 ");
                logger.debug("[chrome] ### URL : " + realLink);
                duple = true;
              } else {
                if (duple) {
                  tmpLinkList.push(lists[i]);
                }

                allLinksSetList.add(realLink); // 중복체크용 리스트에 저장
              }
            }

            let linksToCollect = lists; // 실제로 수집할 링크 리스트

            if (duple) {
             linksToCollect = tmpLinkList;
            } 
          
            logger.debug(`[chrome] ### linksToCollect length: ${linksToCollect.length}`);

            if (linksToCollect.length > 0) {
              for (let linkObj of linksToCollect) {
                logger.debug(`[chrome] Step #5-1. 문서 URL 접근 : ${linkObj.link}`);
                await page.goto(linkObj.link, { waitUntil: "networkidle2" });
  
                if (dialogFlag) {
                  // 다이알로그 플래그 초기화
                  dialogFlag = false; 
                } else {
                  const docResult = await collectDocument(
                    page, 
                    linkObj.link, 
                    params,
                    parser
                  );
    
                  if (typeof docResult === "object") {
                    const fileName = "D-1-" + moment().format("YYYYMMDDHHmm-ssSSS") + ".json";
                    logger.debug(
                      "[chrome] Step #5-5. 문서 저장 " +
                        collectDataPath +
                        path.sep +
                        fileName
                    );
      
                    fs.writeFile(
                      collectDataPath + path.sep + fileName,
                      JSON.stringify(docResult),
                      (err) => {
                        if (err) throw err;
                      }
                    );
                  } else if (typeof docResult === "string") {
                    logger.error(docResult);
                  }
                }
              }
            }

            
          } // if (lists === null) else 

          if (pageNum >= pagingCnt) {
            onGoingFlag = false;
          }

          if (onGoingFlag) {
            logger.debug("[chrome] Step #6. 페이징");
            requestURL = urlBuilder(
              mainURL,
              startDate,
              endDate,
              keyword,
              ++pageNum
            );
             await page.goto(requestURL, { waitUntil: "networkidle2" });
             await page.waitFor(linkSelectors.pagingInterval);
          } else {
            logger.info("[chrome] SUCCESSFULLY_COLLECTED");
          }
        } // while
        
        // 브라우저 닫기
        logger.debug("[chrome] Step #7. 수집 종료");
        await browser.close();
        callback(null);
      })
      .catch((err) => {
        if (err) {
          if (
            err.message === "NO_RESULTS" ||
            err.message === "SUCCESSFULLY_COLLECTED" ||
            err.message === "NO_MORE_LIST_PAGE"
          ) {
            callback(null, err.message);
          } else {
            callback(err);
          }
        } else {
          callback(null);
        }
      });
  };

  return { execute };
})();

// engine.execute(
//   {
//     requestUrl: "https://cafe.naver.com/ca-fe/home/search/articles?em=1&",
//     collectDataPath: "../../collect_data/jeonnam_claim",
//     userAgent:
//       "Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; WOW64; Trident/6.0)",
//     source: "네이버 카페",
//     customer: "test",
//     startDt: "2022-07-21",
//     endDt: "2022-07-21",
//     keyword: '싱크홀',
//     injectScripts: [
//       "../inject_script/listParser.js",
//       "../inject_script/documentParser.js",
//       "../inject_script/datetimeParser.js",
//       "../inject_script/paginationParser.js",
//       "../inject_script/commentParser.js",
//     ],
//     rule: {
//       "linkSelectors": {
//         "crawlerInterval": 1000,
//         "resultCntSelector": "span.total_count",
//         "listSelector": "li.article_item",
//         "linkSelector": "div.detail_area > a",
//         "linkAttr": "href",
//         "linkPatternRegex": "https?:\/\/cafe.naver.com\/([A-za-z0-9]*)\/([A-za-z0-9]*)",
//         "maxPagingCount": 100,
//         "maxResultCount": 1000,
//         "pagingInterval": 1000
//       },
//       "docSelectors": [
//         {
//           "crawlerInterval": 1000,
//           "documentSelector": "div.ArticleContentBox",
//           "titleSelector": "h3.title_text",
//           "contentSelector": "div.ContentRenderer, div.content.CafeViewer",
//           "writerSelector": "a.nickname, button.nickname",
//           "viewCntSelector": "span.count",
//           "viewCountRegex": "조회 (\\d+)",
//           "likeCountSelector": "em.u_cnt",
//           "datetimeSelector": "span.date",
//           "iframeSelector": "iframe#cafe_main"
//         }
//       ],
//       "commentSelectors": {
//         "commentIframeSelector": "iframe#cafe_main",
//         "commentSelector": "ul.comment_list",
//         "listSelector": "li.CommentItem",
//         "deleteListSelector": "div.deleted, p.comment_deleted",
//         "writerSelector": "a.comment_nickname",
//         "datetimeSelector": "span.comment_info_date",
//         "contentSelector": "span.text_comment"
//       }
//     },
//   },
//   (err) => {
//     if (err) {
//       logger.error(err);
//     } else {
//       logger.info("[chrome] Finished");
//     }
//   }
// );

if (exports) {
  module.exports = engine;
}
