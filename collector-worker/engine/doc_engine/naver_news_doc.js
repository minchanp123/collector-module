const puppeteer = require("puppeteer");
const moment = require("moment");
const fs = require("fs");
const path = require("path");
const axios = require("axios"); // promised based requests - like fetch()

const logger = require("../../lib/logger");
const depth = require("../../lib/depth");

const qsToJson  = (qs) => {
  const pairs = qs.split("&");
  const result = {};

  pairs.forEach((pair) => {
      const [k, v] = pair.split("=");
      result[k] = decodeURIComponent(v || "");
  });

  return JSON.parse(JSON.stringify(result));
};

const jsonToQs = (json) => {    
  const keys = Object.keys(json);
  const strArr = [];

  keys.forEach((key) => {
      const str = `${key}=${encodeURIComponent(json[key])}`;
      strArr.push(str);
  });
  return strArr.join('&');
}

const engine = (function () {
  const execute = function (params, callback) {
    // const requestUrl = params.requestUrl;
    const collectDataPath = params.collectDataPath;
    const userAgent = params.userAgent;
    // const startDt = params.startDt;
    // const endDt = params.endDt;
    const keyword = params.keyword;
    const customer = params.customer;
    const source = params.source;
    const requestSeq = params.requestSeq;
    const injectScripts = params.injectScripts;
    let docSelectors = params.rule.docSelectors;
    const commentSelectors = params.rule.commentSelectors;
    const referer = params.doc.referer;
    let link = params.doc.link;

    const rules = [
      {
        // 뉴스 기사 중 스포츠, 연예기사로 넘어가는 채널들 수집하기 위해 엔진에 추가함.
        site: "스포츠",
        urlPattern: ["https://sports.news.naver.com"],
        docSelectors: {
          crawlerInterval: 3000,
          documentSelector: "div#container",
          documentNoResultSelector: "div.error_msg",
          titleSelector: "div.news_headline h4.title",
          contentSelector: "div#newsEndContents",
          // datetimeSelector: "div.news_headline div.info",
          naverDatetimeSelector: "div.news_headline div.info",
          naverDatetimeRegex:
            "(\\d{1,4}).(\\d{1,2}).(\\d{1,2}).(\\s)(오전|오후)(\\s)(\\d{1,2})(?:\\:)(\\d{1,2})(?:\\:)?(\\d{1,2})?",
          likeCountSelector:
            "div.news_end_btn div.u_likeit li.good span._count",
          mediaSelector: "div.news_headline span#pressLogo a > img",
          mediaAttr: "alt",
          articleOriginSelector: "div.news_headline div.info a[href]",
          articleAttr: "href",
        },
      },
      {
        site: "TV연예",
        urlPattern: ["https://entertain.naver.com/read"],
        docSelectors: {
          crawlerInterval: 3000,
          documentSelector: "div#content div.end_ct_area",
          documentNoResultSelector: "div.error_msg",
          titleSelector: "h2.end_tit",
          contentSelector: "div.end_body_wrp div#articeBody",
          // datetimeSelector: "div.article_info span.author:nth-child(1) > em",
          naverDatetimeSelector:
            "div.article_info span.author:nth-child(1) > em",
          naverDatetimeRegex:
            "(\\d{1,4}).(\\d{1,2}).(\\d{1,2}).(\\s)(오전|오후)(\\s)(\\d{1,2})(?:\\:)(\\d{1,2})(?:\\:)?(\\d{1,2})?",
          likeCountSelector: "div.end_btn div.u_likeit li.good span._count",
          mediaSelector: "div.press_logo a > img",
          mediaAttr: "alt",
          articleOriginSelector: "div.article_info a[href]",
          articleAttr: "href",
        },
      },
    ];

    const now = moment();

    // 브라우저 런치
    puppeteer
      .launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      })
      .then(async (browser) => {
        const page = await browser.newPage();

        // 유저에이전트
        await page.setUserAgent(userAgent);

        // Request 인터셉트
        await page.setRequestInterception(true);
        page.on("request", (interceptedRequest) => {
          // 불필요한 리소스 제외
          if (
            interceptedRequest._url.endsWith(".jpg") ||
            interceptedRequest._url.includes("readVod.nhn")
          ) {
            interceptedRequest.abort();
          } else {
            interceptedRequest.continue();
          }
        });

        // 댓글 API 옵션 가져오기
        let commentAPI = '';
        let commentUrl = '';
        let commentReferer = {};
        let commentRequestFlag = true;

        // 기사 타입 (일반, 스포츠, TV연예) 룰 확인용 인덱스          
        let ruleIdx = -1;

        page.on("response", async (res) => {
          const req = res.request();

          // 댓글이 바로 로드 된 경우 
          if (req.url().startsWith(commentSelectors.urlPattern)) {
              commentAPI = req.url();
              commentReferer = req.headers().referer;
          }

          // 댓글이 바로 로드 안되는 경우 => 댓글 페이지 url 생성하여 페이지 이동
          if (req.url().startsWith("https://n.news.naver.com/mnews/article/")) {
            const subUrl = req.url().split('https://n.news.naver.com/mnews/article/')[1];
            commentUrl = `https://n.news.naver.com/mnews/article/comment/${subUrl}`;
          }

          // 기사 타입 체크
          for (let i in rules) {
            if (req.url().includes(rules[i].urlPattern)) {
              ruleIdx = i;
              logger.debug(`[chrome] ${rules[i].site} | ${req.url()}`);
              break;
            }
          }
        });

        // 뷰 포트 설정
        await page.setViewport({
          width: 1280,
          height: 960,
        });
        try {
          // 수집 URL 접근
          logger.debug("[chrome] Step #1. URL 접근");
          logger.debug("[chrome] ### url: " + link);
          await page.goto(link, { waitUntil: "networkidle2" });

          // 인젝트 스크립트 설정 (주의! 인젝트 스크립트는 URL 접근 후 세팅 되어야함)
          logger.debug("[chrome] Step #2. 스크립트 인젝팅");
          for (let injectScript of injectScripts) {
            logger.debug("[chrome] ### injectScriptPath: " + injectScript);
            await page.addScriptTag({
              path: injectScript,
            });
          }

          // 페이징 인터벌
          await page.waitFor(docSelectors.crawlerInterval);

          // 문서 추출
          logger.debug("[chrome] Step #3. 원문 추출");

          if (ruleIdx > -1) { // 스포츠, 연예기사인 경우
            docSelectors = rules[ruleIdx].docSelectors;
            commentRequestFlag = false; // 댓글 수집 X
          }

          const result = await page.evaluate(function (selectors) {
            return __parseDocument(selectors);
          }, docSelectors);

          // logger.debug(result);

          if (result === null) {
            await browser.close();
            throw Error("DOCUMENT_PARSING_RULE_IS_NOT_MATCH");
          } else if (Object.keys(result).length === 0) {
            await browser.close();
            throw Error("NO_RESULTS");
          } else {
            title = result.doc_title;
            content = result.doc_content;
            var doc_datetime = moment(new Date(result.doc_datetime)).format(
              "YYYY-MM-DD-HHmmss"
            );

            result.doc_title = parser(title);
            result.doc_content = parser(content);

            result.doc_url = link;
            result.img_url = [];
            result.comment_count = 0;
            result.dislike_count = 0;
            result.share_count = 0;
            result.locations = "";
            result.source = source;
            result.uuid = "";
            result.customer_id = customer;
            // result.request_seq = requestSeq;
            if (keyword !== undefined) {
              result.search_keyword_text = keyword;
            }
            result.pub_year = doc_datetime.split("-")[0];
            result.pub_month = doc_datetime.split("-")[1];
            result.pub_day = doc_datetime.split("-")[2];
            result.pub_time = doc_datetime.split("-")[3];
            result.doc_datetime = undefined;
            result.depth1_seq = depth.COMMON.NAVER_NEWS[0];
            result.depth2_seq = depth.COMMON.NAVER_NEWS[1];
            result.depth3_seq = depth.COMMON.NAVER_NEWS[2];
            result.depth1_nm = depth.COMMON.NAVER_NEWS[3];
            result.depth2_nm = depth.COMMON.NAVER_NEWS[4];
            result.depth3_nm = depth.COMMON.NAVER_NEWS[5];
            result.doc_second_url = "NULL";
            result.comments = [];

            // 저장
            const fileName =
              "D-1-" + now.format("YYYYMMDDHHmm-ssSSS") + ".json";
            logger.debug(
              "[chrome] Step #5. 저장 " + collectDataPath + path.sep + fileName
            );
            logger.debug("[chrome] 수집시간 : " + now.format("YYYY-MM-DD:HHmm-ssSSS"));
            fs.writeFile(
              collectDataPath + path.sep + fileName,
              JSON.stringify(result),
              (err) => {
                if (err) throw err;
              }
            );
          }
        } catch (error) {
          await browser.close();
          throw error;
        }

        // 브라우저 닫기
        logger.debug("[chrome] Step #6. 수집 종료");
        await browser.close();
        callback(null);
      })
      .catch((err) => {
        if (err) {
          if (err.message === "NO_RESULTS") {
            callback(null, err.message);
          } else {
            callback(err);
          }
        } else {
          callback(null);
        }
      });
  };

  return {
    execute: execute,
  };
})();

/*
engine.execute(
  {
    requestUrl:
      "http://news.naver.com/main/read.nhn?mode=LS2D&mid=shm&sid1=100&sid2=264&oid=020&aid=0003156155",
    collectDataPath: "../../collect_data",
    userAgent:
      "Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; WOW64; Trident/6.0)",
    requestSeq: 0,
    source: "네이버 뉴스",
    customer: "국세청",
    startDt: "2020-02-01",
    endDt: "2020-02-09",
    keyword:
      "국세청 | 세무서 | 세무조사 | 국세징수 | 근로장려금 | 자녀장려금 | 취업후학자금",
    injectScripts: [
      "../inject_script/documentParser.js",
      "../inject_script/datetimeParser.js",
    ],
    rule: {
      linkSelectors: {
        crawlerInterval: 3000,
        listSelector: "ul.themecolumns_list > li",
        linkSelector: "strong.themecolumns_headline > a.themecolumns_title",
        linkAttr: "href",
        datetimeSelector: "em.writercolumns_date",
        paginationSelector: "div.paging",
        paginationTag: "strong",
        maxPagingCount: 1000,
        pagingInterval: 3000,
      },
      docSelectors: {
        crawlerInterval: 3000,
        documentSelector: "#ct",
        documentNoResultSelector: "div.error_msg",
        titleSelector: ".media_end_head_title h2.media_end_head_headline",
        contentSelector: "div#newsct_article",
        naverDatetimeSelector: "div.media_end_head_info_datestamp > div > span",
        naverDatetimeRegex:
          "(\\d{1,4}).(\\d{1,2}).(\\d{1,2}).(\\s)(오전|오후)(\\s)(\\d{1,2})(?:\\:)(\\d{1,2})(?:\\:)?(\\d{1,2})?",
        likeCountSelector:
          "#likeItCountViewDiv > ul > li.u_likeit_list.good > a > span.u_likeit_list_count._count",
        warmCountSelector:
          "#likeItCountViewDiv > ul > li.u_likeit_list.warm > a > span.u_likeit_list_count._count",
        sadCountSelector:
          "#likeItCountViewDiv > ul > li.u_likeit_list.sad > a > span.u_likeit_list_count._count",
        angryCountSelector:
          "#likeItCountViewDiv > ul > li.u_likeit_list.angry > a > span.u_likeit_list_count._count",
        wantCountSelector:
          "#likeItCountViewDiv > ul > li.u_likeit_list.want > a > span.u_likeit_list_count._count",
        recommendCountSelector: "div#toMainContainer em.u_cnt._count",
        mediaSelector: "a.media_end_head_top_logo > img",
        mediaAttr: "title",
        articleOriginSelector:
          "#ct > div.media_end_head.go_trans > div.media_end_head_info.nv_notrans > div.media_end_head_info_datestamp > a",
        articleAttr: "href",
      },
      commentSelectors: {
        urlPattern:
          "https://apis.naver.com/commentBox/cbox/web_naver_list_jsonp.json",
      },
    },
    doc: {
      referer:
        "https://search.naver.com/search.naver?where=news&sm=tab_opt&sort=0?where=news&query=%EA%B5%AD%EC%84%B8%EC%B2%AD%20|%20%EC%84%B8%EB%AC%B4%EC%84%9C%20|%20%EC%84%B8%EB%AC%B4%EC%A1%B0%EC%82%AC%20|%20%EA%B5%AD%EC%84%B8%EC%A7%95%EC%88%98%20|%20%EA%B7%BC%EB%A1%9C%EC%9E%A5%EB%A0%A4%EA%B8%88%20|%20%EC%9E%90%EB%85%80%EC%9E%A5%EB%A0%A4%EA%B8%88%20|%20%EC%B7%A8%EC%97%85%ED%9B%84%ED%95%99%EC%9E%90%EA%B8%88&ds=2020.02.01&de=2020.02.09&nso=so:r,p:from20200201to20200209,a:all",
      link: " https://news.naver.com/main/read.naver?mode=LSD&mid=sec&sid1=102&oid=119&aid=0002608071",
      datetimeTxt: "2020.02.07.  ",
      datetime: "Fri Feb 07 2020 00:00:00 GMT+0900 (Korean Standard Time)",
    },
  },
  (err) => {
    if (err) {
      logger.error(err);
    } else {
      logger.info("[chrome] Finished");
      // MD5 파일 생성
    }
  }
);
*/

function parser(data) {
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
}

if (exports) {
  module.exports = engine;
}
