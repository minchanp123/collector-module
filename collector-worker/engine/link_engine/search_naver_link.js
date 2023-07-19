const puppeteer = require("puppeteer");
const moment = require("moment");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const logger = require("../../lib/logger");

const engine = (function() {
  const __goToNext = function(startNm) {
    startNm = startNm*10 + 1;
    return "&start=" + startNm;
  };

  const execute = function(params, callback) {
    let requestUrl = params.requestUrl;
    const collectDataPath = params.collectDataPath;
    const userAgent = params.userAgent;
    let startDt = params.startDt;
    let endDt = params.endDt;
    const keyword = params.keyword;
    // const customer = params.customer;
    // const source = params.source;
    const requestSeq = params.requestSeq;
    const injectScripts = params.injectScripts;
    const linkSelectors = params.rule.linkSelectors;
    const docSelectors = params.rule.docSelectors;

    // startDt, endDt parsing
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

    const now = moment();

    // 브라우저 런치
    // launch() return Promise(Browser)
    puppeteer
      .launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      })
      .then(async browser => {
        const page = await browser.newPage();

        // 유저에이전트
        await page.setUserAgent(userAgent);

        // Request 인터셉트
        await page.setRequestInterception(true);
        page.on("request", interceptedRequest => {
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

        // 뷰 포트 설정
        await page.setViewport({
          width: 1280,
          height: 960
        });

        let startDtParams = startDtParse[0] + startDtParse[1] + startDtParse[2];
        let endDtParams = endDtParse[0] + endDtParse[1] + endDtParse[2];
        let ds =
          startDtParse[0] + "." + startDtParse[1] + "." + startDtParse[2];
        let de = endDtParse[0] + "." + endDtParse[1] + "." + endDtParse[2];

        requestUrl +=
          "&query=" +
          encodeURIComponent(keyword) +
          "&sort=1&ds=" +
          ds +
          "&de=" +
          de +
          "&nso=so:r,p:from" +
          startDtParams +
          "to" +
          endDtParams +
          ",a:all";

        try {
          // 수집 URL 접근
          logger.debug("[chrome] Step #1. URL 접근");
          logger.debug("[chrome] ### requestUrl: " + requestUrl);
          await page.goto(requestUrl);

          let fileSeq = 1;
          let pageNum = 1;
          let onGoingFlag = true;
          let maxPagingCount = linkSelectors.maxPagingCount;
          let pagingInterval = linkSelectors.pagingInterval;

          // 페이징 인터벌
          await page.waitFor(linkSelectors.crawlerInterval);

          while (onGoingFlag && pageNum <= maxPagingCount) {
            // 인젝트 스크립트 설정 (주의! 인젝트 스크립트는 URL 접근 후 세팅 되어야함)
            logger.debug("[chrome] Step #2. 스크립트 인젝팅");
            for (let injectScript of injectScripts) {
              logger.debug("[chrome] ### injectScriptPath: " + injectScript);
              await page.addScriptTag({
                path: injectScript
              });
            }

            // 리스트 추출
            logger.debug("[chrome] Step #3. 문서링크 추출");
            let lists = await page.evaluate(function(linkSelectors) {
              return __parseList(linkSelectors);
            }, linkSelectors);

            if (lists === null) {
              await browser.close();
              throw Error("LIST_PARSING_RULE_IS_NOT_MATCH");
            } else if (lists.length === 0) {
              await browser.close();
              throw Error("NO_RESULTS");
            } else {
              logger.debug(
                "[chrome] ### pageNum: " +
                  pageNum +
                  ", listCount: " +
                  lists.length
              );
              let collectList = [];

              // logger.debug(lists);
              // logger.debug(lists[0]);
              for (let list of lists) {
                if (!list) {
                  continue;
                }

                const datetime = new Date(list.datetime);

                // 날짜 지정일 경우 비교 없이 push해준다.
                if (
                  linkSelectors.startDtParam !== undefined ||
                  linkSelectors.endDtParam !== undefined
                ) {
                  collectList.push(list);
                } else {
                  if (
                    datetime.getTime() >= startDate.getTime() &&
                    datetime.getTime() <= endDate.getTime()
                  ) {
                    collectList.push(list);
                  } else if (datetime.getTime() < startDate.getTime()) {
                    // datetime 값이 startDate 보다 작은 경우 정지
                    onGoingFlag = false;
                    break;
                  }
                }
              }

              if (collectList.length > 0) {
                const fileName =
                  "L-" +
                  pageNum +
                  "-" +
                  now.format("YYYYMMDDHHmm-ssSSS") +
                  ".json";
                logger.debug("[chrome] Step #4. 저장");
                logger.debug(
                  "[chrome] ### filePath: " +
                    collectDataPath +
                    path.sep +
                    fileName
                );
                await fs.writeFile(
                  collectDataPath + path.sep + fileName,
                  JSON.stringify(collectList),
                  err => {
                    if (err) throw err;
                  }
                );
              }

              if (onGoingFlag) {
                logger.debug("[chrome] Step #5. 페이징");
                logger.debug("[chorme] ### requestUrl: " + requestUrl + __goToNext(pageNum));

                await page.goto(requestUrl + __goToNext(pageNum), { waitUntil: "networkidle2" });
                // 페이징 인터벌
                await page.waitFor(pagingInterval);

                pageNum++;
              } else {
                logger.debug("NO RESULTS");
              }
            }
          } // while
        } catch (error) {
          await browser.close();
          throw error;
        }

        // 브라우저 닫기
        logger.debug("[chrome] Step #7. 수집 종료");
        await browser.close();
        callback(null);
      })
      .catch(err => {
        if (err) {
          if (
            err.message === "NO_RESULTS" ||
            err.message === "NO_MORE_LIST_PAGE"
          ) {
            callback(null);
          } else {
            callback(err);
          }
        } else {
          callback(null);
        }
      });
  };

  return {
    execute: execute
  };
})();

/*
engine.execute(
  {
    requestUrl: "https://search.naver.com/search.naver?where=news",
    collectDataPath: "../../collect_data/naver_news",
    userAgent:
      "Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; WOW64; Trident/6.0)",
    requestSeq: 0,
    source: "네이버 뉴스",
    customer: "국세청",
    startDt: "2020-10-29",
    endDt: "2020-10-29",
    keyword: "신용카드",
    injectScripts: [
      "../inject_script/listParser.js",
      "../inject_script/paginationParser.js",
      "../inject_script/documentParser.js",
      "../inject_script/datetimeParser.js",
    ],
    rule: {
      linkSelectors: [
        // 지면기사 rule
        {
        crawlerInterval: 3000,
        startDtParam: "date",
        listSelector: "ul.list_news > li",
        linkSelector: "div.news_info > div > a:last-child",
        linkAttr: "href",
        datetimeSelector: "div.news_info > div > span:nth-child(3)",
        listNoResultSelector: "div.not_found02",
        maxPagingCount: 1000,
        pagingInterval: 3000,
        }, 
        // 보도자료 rule
        {
          crawlerInterval: 3000,
          startDtParam: "date",
          listSelector: "ul.list_news > li",
          linkSelector: "div.news_info > div > a:last-child",
          linkAttr: "href",
          datetimeSelector: "div.news_info > div > span:nth-child(2)",
          listNoResultSelector: "div.not_found02",
          maxPagingCount: 1000,
          pagingInterval: 3000,
        }
      ],
      docSelectors: {
        crawlerInterval: 3000,
        documentSelector: "table.container div#main_content",
        titleSelector: "div.article_header h3#articleTitle",
        contentSelector: "div#articleBody div#articleBodyContents",
        datetimeSelector: "div.sponsor span.t11",
        likeCountSelector:
          "div.end_btn li.u_likeit_list.good span.u_likeit_list_count._count",
      },
      commentSelectors: {
        openCommentPatternRegex: "news.naver.com.*oid=(\\d.*)\\&aid=(\\d.*)",
        openCommentPattern:
          "http://news.naver.com/main/read.nhn?mode=LS2D&mid=shm&sid1=100&sid2=265&oid=018&aid=0004028184",
        urlPattern:
          "https://apis.naver.com/commentBox/cbox5/web_naver_list_jsonp.json?ticket=news&templateId=default_life&_callback=window.__cbox_jindo_callback._2152&lang=ko&country=KR&objectId=news#1#,#2#&categoryId&pageSize=10000&indexSize=10&groupId&page=1&initialize=true&useAltSort=true&replyPageSize=100&moveTo&sort&userType=",
      },
    },
  },
  (err) => {
    if (err) {
      logger.error(err);
    } else {
      logger.info("[chrome] Finished");
    }
  }
);
*/

if (exports) {
  module.exports = engine;
}
