/**
 * 오브젝트 NOT NULL 체크
 * @param       {Object} obj 오브젝트
 */
function __notNull(obj) {
  if (obj !== null && obj !== undefined) {
    return true;
  } else {
    return false;
  }
}

/**
 * 정규식 파싱 함수
 * @param        {String} data 
 */
const __regxParser = data => {
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


/**
 * JSON 형식의 텍스트에서 댓글 추출
 * @param       {[type]} data [description]
 */
function __getCommentByJson(data) {
  // json형식의 텍스트 읽어서 가져가기.
  var comments = [];
  if (
    data.result.commentList !== undefined &&
    data.result.commentList.length > 0
  ) {
    if (data.result.commentList[0].ticket === "blog") {
      var isParent = true;
      for (var idx = data.result.commentList.length - 1; idx >= 0; idx--) {
        var content = data.result.commentList[idx].contents;
        var datetimeTxt = data.result.commentList[idx].regTime;
        var datetime = __parseDatetime(datetimeTxt);
        var writer = data.result.commentList[idx].userName;
        var replyLevel = data.result.commentList[idx].replyLevel;
        var likeCount = data.result.commentList[idx].sympathyCount;
        var dislikeCount = data.result.commentList[idx].antipathyCount;

        if (!isParent) {
          if (replyLevel > 1) {
            // 대댓글
            if (comment.re_comment === undefined) {
              comment.re_comment = [];
            }
            var re_comment = {
              cmt_writer: writer,
              cmt_content: content.replace(/<br>/g, " "),
              cmt_datetime: datetime,
              like_count: likeCount,
              dislike_count: dislikeCount
            };
            comment.re_comment.push(re_comment);
          } else {
            comments.push(comment);
            idx++;
            comment = {};
            isParent = true;
          }
        } else {
          var comment = {
            cmt_writer: writer,
            cmt_content: content.replace(/<br>/g, " "),
            cmt_datetime: datetime,
            like_count: likeCount,
            dislike_count: dislikeCount
          };
          isParent = false;
        }
      } // for
      comments.push(comment);
    }
  } else {
    for (var idx = 0; idx < data.result.list.length; idx++) {
      var content = data.result.list[idx].content;
      var datetimeTxt = data.result.list[idx].writedt;
      var datetime = __parseDatetime(datetimeTxt);
      var writer = data.result.list[idx].writernick;
      var refComment = data.result.list[idx].refComment;
      var likeCount = 0;
      var dislikeCount = 0;

      var comment = {
        cmt_writer: writer,
        cmt_datetime: datetime,
        cmt_content: content,
        like_count: likeCount,
        dislike_count: dislikeCount
      };

      if (refComment === false) {
        // 댓글
        if (idx + 1 < data.result.list.length) {
          if (data.result.list[idx + 1].refComment === true) {
            comment.comments = [];
            for (var idx2 = idx + 1; idx2 < data.result.list.length; idx2++) {
              var check = data.result.list[idx2].refComment;
              if (check === true) {
                // 대댓글이면
                var re_comment = {
                  cmt_writer: data.result.list[idx2].writernick,
                  cmt_datetime: __parseDatetime(data.result.list[idx2].writedt),
                  cmt_content: data.result.list[idx2].content,
                  like_count: likeCount,
                  dislike_count: dislikeCount
                };
                comment.comments.push(re_comment);
              } else {
                idx = idx2 - 1;
                break;
              }
            }
          }
        }
        comments.push(comment);
      }
    } // for
  }
  return comments;
} // __getCommentByJson

/**
 * 댓글창 열기
 * @param       {jsonObj} selectors CSS Selectors
 */
function __openReply(selectors) {
  // 댓글창 열기.
  if (
    selectors.openCommentPatternRegex !== undefined &&
    selectors.openCommentPattern !== undefined
  ) {
    var replaceString = selectors.openCommentPattern;

    var regex = new RegExp(selectors.openCommentPatternRegex);
    var matched = regex.exec(selectors.openCommentPattern);

    if (matched !== null && matched !== undefined) {
      replaceString = selectors.urlPattern;

      for (var idx = 1; idx < matched.length; idx++) {
        var regexStr = "#" + idx + "#";
        var regexp = new RegExp(regexStr, "g");

        replaceString = replaceString.replace(regexp, matched[idx]);
      }
    }
    return replaceString;
  }
} // __openReply

/**
 * 숫자 추출
 * @param       {[type]} str 대상 문자열
 */
function __getInteger(str) {
  console.log("__getInteger");
  // var Pattern = new RegExp('\\s*([0-9]{0,3})(?:[,])?([0-9]{0,3})(?:[,])?([0-9]{0,3})');
  var Pattern = new RegExp("([0-9]+)");
  var matched = Pattern.exec(str.trim().replace(/,/g, ""));
  var result = "";

  if (matched !== null && matched !== undefined) {
    for (var idx = 1; idx < matched.length; idx++) {
      result += matched[idx];
    }

    return result;
  } else {
    return "0";
  }
}

/**
 * 단일 댓글 추출
 * @param       {jsonObj} selectors CSS selectors
 * @param       {Object} elm       파싱 대상 엘레먼트
 */
function __getComment(selectors, elm) {
  var isHidden = false;
  var comment = {};

  // 비밀 댓글 여부 확인
  if (selectors.hiddenClass !== undefined) {
    if (elm.classList.contains(selectors.hiddenClass)) {
      isHidden = true;
    }
  }

  // 삭제 댓글 여부 확인
  if (selectors.deleteListSelector !== undefined) {
    var deleteList = elm.querySelector(selectors.deleteListSelector);
    if (__notNull(deleteList)) {
      comment.cmt_wirter = null;
      comment.cmt_content = deleteList.innerText.trim();
      comment.cmt_datetime = null;
      return comment;
    }
  }

  // 작성자 파싱
  if (selectors.writerSelector !== undefined && !isHidden) {
    var writerElement = elm.querySelector(selectors.writerSelector);
    var writer = "";

    if (writerElement !== null) {
      if (writerElement.textContent.length === 0) {
        writer = writerElement.childNodes[0].getAttribute("alt");
      } else if (writerElement.textContent.length <= 8 && selectors.isClien) {
        writer = writerElement.childNodes[1].getAttribute("alt");
      } else {
        writer = writerElement.textContent.trim();
      }

      if (writerElement.childNodes.length > 1 && selectors.isDdanzi) {
        writer = writer.substr(
          0,
          writer.indexOf(writerElement.childNodes[1].innerText)
        );
        writer = __regxParser(writer);
      }
    }
    comment.cmt_writer = writer;
  } // comment.cmt_writer

  // 내용 파싱
  if (selectors.contentSelector !== undefined) {
    var contentElement;
    var content = "";

    if (isHidden) {
      if (selectors.hiddenContentSelector !== undefined) {
        contentElement = elm.querySelector(selectors.hiddenContentSelector);

        if (contentElement !== null) {
          content = __regxParser(contentElement.textContent)
            .trim();
        }
      } else {
        contentElement = elm.querySelector(selectors.contentSelector);

        if (contentElement !== null) {
          content = __regxParser(contentElement.textContent)
            .trim();
        }
      }
    } else if (selectors.isDaumB) {
      contentElement = elm
        .querySelector(selectors.contentSelector)
        .getAttribute("onclick")
        .split(",");

      if (contentElement !== null) {
        content = contentElement[1].replace(/<br \/>/g, " ").trim();
      }
    } else {
      contentElement = elm.querySelector(selectors.contentSelector);

      if (contentElement !== null) {
        content = __regxParser(contentElement.textContent)
          .trim();
      }
    }
    comment.cmt_content = content;
  } // comment.cmt_content

  // 날짜 파싱
  if (selectors.datetimeSelector !== undefined) {
    var datetimeElement = elm.querySelector(selectors.datetimeSelector);

    if (__notNull(selectors.isClien)) {
      var datetimeTxt = document
        .querySelector(selectors.datetimeSelector)
        .innerText.trim();
    } else if (__notNull(selectors.datetimeAttr)) {
      datetime = __parseDatetime(
        datetimeElement.getAttribute(selectors.datetimeAttr).trim()
      );
    } else {
      var datetimeTxt = "";
      datetimeTxt = datetimeElement.textContent.trim();

      if (selectors.isBobae !== undefined) {
        var datetimeTxt_bobae = document
          .querySelector(selectors.isBobae)
          .innerText.split("|");
        var datetimeTxt_year = datetimeTxt_bobae[2].substr(1, 4).trim();

        datetimeTxt = datetimeTxt_year + "/" + datetimeTxt;
      }
      if (selectors.isDc !== undefined) {
        var now = new Date();
        var year = now.getFullYear();
        if (datetimeTxt.split(".").length < 3) {
          datetimeTxt = year + "." + datetimeTxt;
        }
      }
    }
    var datetime = __parseDatetime(datetimeTxt);
    comment.cmt_datetime = datetime;
  } // comment.cmt_datetime

  // 좋아요 파싱
  if (selectors.likeCountSelector !== undefined) {
    var likeCountElement = elm.querySelector(selectors.likeCountSelector);
    var likeCount = 0;

    if (likeCountElement !== null) {
      likeCount = parseInt(__getInteger(likeCountElement.textContent.trim()));
    }
    comment.like_count = likeCount;
  }

  // 싫어요 파싱
  if (selectors.dislikeCountSelector !== undefined) {
    var dislikeCountElement = elm.querySelector(selectors.dislikeCountSelector);
    var dislikeCount = 0;

    if (dislikeCountElement !== null) {
      dislikeCount = parseInt(
        __getInteger(dislikeCountElement.textContent.trim())
      );
    }
    comment.dislike_count = dislikeCount;
  }

  return comment;
}

/**
 * 댓글 파싱
 * @param       {jsonObj} selectors 댓글 수집 룰
 */
function __parseComment(selectors) {
  console.log("__parseComment");
  var commentArea = null;

  // 댓글 IFrame 파싱
  if (selectors.commentIframeSelector !== undefined) {
    var commentDocument = document.querySelector(
      selectors.commentIframeSelector
    );
    if (__notNull(commentDocument)) {
      commentDocument = commentDocument.contentDocument;
      commentArea = commentDocument.querySelector(selectors.commentSelector);
    } else {
      return [];
    }
  } else {
    commentArea = document.querySelector(selectors.commentSelector);
  }
  if (commentArea === null || commentArea === undefined) {
    return [];
  }

  // 불필요한 영역 제거
  if (selectors.removeSelector !== undefined) {
    const removeArea = commentArea.querySelectorAll(selectors.removeSelector);
    if (removeArea !== undefined) {
      for (remove of removeArea) {
        remove.parentNode.removeChild(remove);
      }
    }
  }

  if (commentArea !== undefined) {
    // 댓글 수집 타입 구분 (1: 댓글과 대댓글의 구분이 없음)
    if (selectors.commentType === undefined) {
      return __parseCommentDialog(selectors, commentArea);
    } else {
      if (selectors.commentType === "1") {
        //댓글과 대댓글을 구분 없이 수집함
        return __parseCommentList(selectors, commentArea);
      } else if (selectors.commentType === "daum") {
        // 다음 댓글 수집 전용.
        return __parseCommentDaum(selectors, commentArea);
      } else {
        //댓글과 대댓글을 재귀적으로 수집함
        return __parseCommentDialog(selectors, commentArea);
      }
    }
  } else {
    return [];
  }
} // __parseComment

/**
 * 댓글 Child 다이어 로그 파싱 (대댓글 이하 부터는 모두 DEPTH 2로 간주하여 수집함)
 * @param       {jsonObj} selectors 댓글 파싱 룰
 * @param       {Element} dialog    댓글 영역 엘레먼트
 */
function __parseCommentDialog(selectors, dialog) {
  console.log("__parseCommentDialog");

  var lists = dialog.querySelectorAll(selectors.listSelector);
  var comments = [];

  for (var idx = 0; idx < lists.length; idx++) {

    if (__notNull(selectors.deleteListSelector)) {
      var deletedComment = lists[idx].querySelector(selectors.deleteListSelector);
      
      if (__notNull(deletedComment)) {
        continue;
      }
    }

    // 다음 뉴스 댓글 수집용 셀렉터 추가 (댓글 id값 가져오기)
    var daumNewsCommentId = false;

    if (__notNull(selectors.daumNewsCommentIdSelector)) {
      daumNewsCommentId = lists[idx].id.replace("comment", "").trim();
    }
    
    var writer = lists[idx]
      .querySelector(selectors.writerSelector)
      .textContent.trim();
    var content = lists[idx]
      .querySelector(selectors.contentSelector)
      .textContent.trim();

    if (__notNull(content)) {
      content = __regxParser(content);
    }

    if (__notNull(selectors.datetimeAttr)) {
      datetime = __parseDatetime(
        lists[idx]
          .querySelector(selectors.datetimeSelector)
          .getAttribute(selectors.datetimeAttr)
          .trim()
      );
    } else {
      var datetimeTxt = lists[idx]
        .querySelector(selectors.datetimeSelector)
        .textContent.trim();
      var datetime = __parseDatetime(datetimeTxt);
    }

    if (selectors.likeCountSelector !== undefined) {
      var likeCount = 0;
      likeCount = parseInt(
        lists[idx].querySelector(selectors.likeCountSelector).textContent.trim()
      );
    }
    if (selectors.dislikeCountSelector !== undefined) {
      var dislikeCount = 0;
      dislikeCount = parseInt(
        lists[idx]
          .querySelector(selectors.dislikeCountSelector)
          .textContent.trim()
      );
    }

    if (
      (writer === null || writer === "") &&
      selectors.writerAttrSelector !== undefined
    ) {
      writer = lists[idx].querySelector(selectors.writerAttrSelector).alt;
    }

    var comment = {
      cmt_writer: writer,
      cmt_datetime: datetime,
      cmt_content: content,
      like_count: likeCount,
      dislike_count: dislikeCount
    };

    if(daumNewsCommentId){
      comment._id = daumNewsCommentId;
    }

    comments.push(comment);

    //대댓댓글 수집
    var children = lists[idx].querySelector(selectors.childrenSelector);
    if (children !== null) {
      comments[idx].comments = [];
      if (selectors.checkReSelectors !== undefined) {
        var reSelectors = {
          listSelector: selectors.reListSelector,
          writerSelector: selectors.reWriterSelector,
          datetimeSelector: selectors.reDatetimeSelector,
          contentSelector: selectors.reContentSelector,
          commentListSelector: selectors.commentListSelector,
          likeCountSelector: selectors.likeCountSelector,
          dislikeCountSelector: selectors.dislikeCountSelector
        };
        comments[idx].comments.push(
          __parseCommentDialog(reSelectors, children)
        );
      } else {
        comments[idx].comments.push(__parseCommentDialog(selectors, children));
      }
    }
  }

  return comments;

} // __parseCommentDialog

/**
 * 댓글과 원글의 구분이 없는 리스트 형식의 댓글 파싱
 * @param       {jsonObj} selectors 댓글 수집 룰
 * @param       {Element} dialog    댓글 영역
 */
function __parseCommentList(selectors, dialog) {
  console.log("__parseCommentList");

  var lists = dialog.querySelectorAll(selectors.listSelector);
  var isParent = true;

  var comments = [];
  var comment = {};

  for (var idx = 0; idx < lists.length; idx++) {
    // 부모&자식 글 여부 확인
    if (!isParent) {
      // 댓글여부 확인
      if (selectors.recommentClass !== undefined) {
        if (lists[idx].classList.contains(selectors.recommentClass)) {
          if (comment.comments === undefined) {
            comment.comments = [];
          }
          comment.comments.push(__getComment(selectors, lists[idx]));
        } else {
          comments.push(comment);
          idx--;
          comment = {};
          isParent = true;
        }
      } else if (selectors.recommentListSelector !== undefined) {
        var list = lists[idx].querySelector(selectors.recommentListSelector);
        if (list !== null && list !== undefined) {
          if (comment.comments === undefined) {
            comment.comments = [];
          }
          comment.comments.push(__getComment(selectors, list));
        } else {
          comments.push(comment);
          idx--;
          comment = {};
          isParent = true;
        }
      } else {
        comments.push(comment);
        idx--;
        comment = {};
        isParent = true;
      }
    } else {
      if (selectors.commentListSelector !== undefined) {
        var list = lists[idx].querySelector(selectors.commentListSelector);
        comment = __getComment(selectors, list);
        isParent = false;
      } else {
        comment = __getComment(selectors, lists[idx]);
        isParent = false;
      }
    }
  } // for

  if (Object.keys(comment).length > 0) {
    comments.push(comment);
  }

  return comments;
} // __parseCommentList

/**
 * 댓글과 원글의 구분이 없는 리스트 형식의 댓글 파싱
 * @param       {jsonObj} selectors 댓글 수집 룰
 * @param       {Element} dialog    댓글 영역
 */
function __parseCommentDaum(selectors, dialog) {
  var isHidden = false;

  var lists = dialog.querySelectorAll(selectors.listSelector);
  var comments = [];
  // 다음 댓글은 대댓글 없이 수집 함.
  for (var idx = 0; idx < lists.length; idx++) {
    var comment = {};
    // 작성자 파싱
    if (selectors.writerSelector !== undefined && !isHidden) {
      var writerElement = dialog.querySelectorAll(selectors.writerSelector);
      var writer = "";

      if (writerElement[idx] !== null) {
        writer = __regxParser(writerElement[idx].textContent)
          .trim();
      }

      if (writer.includes("주인과 글쓴이만")) {
        continue;
      } else {
        comment.cmt_writer = writer;
      }
    }

    // 내용 파싱
    if (selectors.contentSelector !== undefined) {
      var contentElement;
      var content = "";

      if (isHidden) {
        if (selectors.hiddenContentSelector !== undefined) {
          contentElement = dialog.querySelectorAll(
            selectors.hiddenContentSelector
          );

          if (contentElement[idx] !== null) {
            content = __regxParser(contentElement[idx].textContent);
          }
        } else {
          contentElement = dialog.querySelectorAll(selectors.contentSelector);

          if (contentElement[idx] !== null) {
            content = __regxParser(contentElement[idx].textContent);
          }
        }
      } else {
        contentElement = dialog.querySelectorAll(selectors.contentSelector);

        if (contentElement[idx] !== null) {
          content = __regxParser(contentElement[idx].textContent);
        }
      }

      comment.cmt_content = content;
    }

    // 날짜 파싱
    if (selectors.datetimeSelector !== undefined) {
      var datetimeTxt = dialog.querySelectorAll(selectors.datetimeSelector);
      var datetime = __parseDatetime(datetimeTxt[idx].textContent.trim());

      comment.cmt_datetime = datetime;
    }

    comments.push(comment);
  } //for

  return comments;
}

/**
 * 댓글 리스트에 삭제된 댓글이 껴 있을 경우 - SLR클럽 전용
 * @param       {jsonObj} selectors 댓글 수집 룰
 */
function __parseCommentSLRClub(selectors) {
  console.log("__parseCommentSLRClub");
  const commentArea = document.querySelector(selectors.commentSelector);

  if (commentArea !== undefined) {
    const lists = commentArea.querySelectorAll(selectors.listSelector);
    const comments = [];

    for (let idx = 0; idx < lists.length; idx++) {
      let writer = lists[idx].querySelector(selectors.writerSelector);
      let content = lists[idx].querySelector(selectors.contentSelector);
      let datetime = lists[idx].querySelector(selectors.datetimeSelector);
      let likeCount = lists[idx].querySelector(selectors.likeCountSelector);

      if (writer && content && datetime) {
        writer = writer.textContent.trim();
        content = __regxParser(content.textContent).trim();
        datetime = __parseDatetime(datetime.textContent.trim());
        likeCount = likeCount.textContent.trim().replace(/\[/,"").replace(/\]/,"");
        if(likeCount ==""){
          likeCount = 0;
        }
        // if (likeCount) {
        //   likeCount = parseInt(__regxParser(likeCount.textContent));
        // } else {
        //   likeCount = 0;
        // }
      } else {
        continue;
      }

      let comment = {
        cmt_writer: writer,
        cmt_datetime: datetime,
        cmt_content: content,
        like_count: likeCount,
      };

      comments.push(comment);

    } // for

    return comments;
  }
}


// 2020-12-01
// 작성자: 유다정 
// 신세계 면세점 리뷰 수집 전용
function __parseSSGDFMReview (selectors) {
  let result= [];

  if (selectors.noResultSelector) {
    const noResultArea = document.querySelector(selectors.noResultSelector);

    // 리뷰 영역 존재하지 않으면 바로 빈 배열 리턴
    if (noResultArea) {
      return result;
    }
  }

  if (selectors.reviewAreaSelector) {
    const reviewArea = document.querySelector(selectors.reviewAreaSelector);

    if (reviewArea) {
      // 리뷰 리스트 추출
      if (selectors.reviewSelector) {
        // reviewSelector 안에 모든 정보가 담긴 경우
        const reviewList = reviewArea.querySelectorAll(
          selectors.reviewSelector
        );

        if (reviewList) {

          for (let reviewElem of reviewList) {
            let review = {};

            // 상품평 추출
            if (selectors.contentSelector) {
              const content = reviewElem.querySelector(selectors.contentSelector);

              if (content) {
                review.review_content = content.innerText.trim();
              }
            }
            
            // 별점 추출
            if (selectors.scoreSelector) {
              const score = reviewElem.querySelector(selectors.scoreSelector);

              if (score) {
                const scoreClassName = score.className;

                if (scoreClassName) {
                  review.score = Number(scoreClassName.slice(-1));
                }
              }
            }

            // 작성자 추출
            if (selectors.writerSelector) {
              const writer = reviewElem.querySelector(selectors.writerSelector);

              // 작성자에서는 공백 모두 제거
              if (writer) {
                review.review_writer = writer.innerText
                                      .trim()
                                      .replace(/\s/g, "")
                                      .replace(" ", "");
              }
            }

            // 작성일자 추출
            if (selectors.datetimeSelector) {
              const datetime = reviewElem.querySelector(selectors.datetimeSelector);

              if (datetime) {
                review.review_datetime = datetime.innerText;
              }
            }

            result.push(review);
          }
        } else {
          result = [];
        }
      } else {
        // reviewSelector 안에 모든 정보가 없는 경우

        // 상품평 추출
        if (selectors.contentSelector) {
          const contentElems = reviewArea.querySelectorAll(selectors.contentSelector);

          if (contentElems) {
            for (let contentElem of contentElems) {
              const review = contentElem.innerText.trim();
              result.push({ review_content: review });
            }
          }
        }

        // 별점 추출
        if (selectors.scoreSelector) {
          const scoreElems = reviewArea.querySelectorAll(selectors.scoreSelector);
          
          if (scoreElems) {
            for (let idx = 0; idx < scoreElems.length; idx++) {

              if (selectors.isScoreOnOff) {
                // 별 이미지 on/off 개수를 확인해야 하는 경우
                if (selectors.scoreOnOffSelector) {
                  const stars = scoreElems[idx].querySelectorAll(selectors.scoreOnOffSelector);
                  let score = 0;

                  if (stars.length > 0 && stars.length <= 5) {
                    for (let star of stars) {
                      if (selectors.scoreAttr) {
                        const scoreTxt = star.getAttribute(selectors.scoreAttr);
  
                        if (selectors.scoreRegexPattern) {
                          const matched = new RegExp(selectors.scoreRegexPattern).exec(scoreTxt);
  
                          if (matched) {
                            score += 1;
                          }
                        }
                      }
                    }
                  }

                  result[idx] = {
                    ...result[idx],
                    score: score
                  }
                }
                
              } else {
                if (selectors.scoreAttr) {
                  const scoreTxt = scoreElems[idx].getAttribute(selectors.scoreAttr);
                  let score;
  
                  if (selectors.scoreRegexPattern) {
                    const matched = new RegExp(selectors.scoreRegexPattern).exec(scoreTxt);
  
                    if (matched) {
                      score = matched[0];
                    }
  
                  } else {
                    score = scoreTxt;
                  }
                   
                  result[idx] = {
                    ...result[idx],
                    score: Number(score)
                  }
                }
              }
                
            }
          }
        } // 별점 추출

        // 작성자 추출
        if (selectors.writerSelector) {
          const writerElems = reviewArea.querySelectorAll(selectors.writerSelector);

          if (writerElems) {
            for (let idx = 0; idx < writerElems.length; idx++) {
              // 작성자에서는 공백 모두 제거
              const writer = writerElems[idx]
                          .innerText.trim()
                          .replace(/\s/g, "")
                          .replace(" ", "");
                
              result[idx] = {
                ...result[idx],
                review_writer: writer
              }
              
            }
          }
        } // 작성자 추출

        // 작성일자 추출
        if (selectors.datetimeSelector) {
          const dtElems = reviewArea.querySelectorAll(selectors.datetimeSelector);

          if (dtElems) {
            for (let idx = 0; idx < dtElems.length; idx++) {
              const datetime = dtElems[idx].innerText;

              result[idx] = {
                ...result[idx],
                review_datetime: datetime
              }
             
            }
          }
        } // 작성일자 추출

      }
    } else {
      // 리뷰영역 셀렉터가 맞지 않는 경우 null 리턴
      result = null;
    }
  } 
  return result;
}

// 2020-12-01
// 작성자: 유다정
// 리뷰 페이징 전용
function __goToNextReviewPage (selectors) {
  const pageList = document.querySelectorAll(
    selectors.paginationSelector
  );
  let hasNextPage;
   
  if (pageList.length > 0) {
    for (let idx = 0; idx < pageList.length; idx++) {
      if (idx === pageList.length - 1) {
        // 마지막 페이지
        hasNextPage = false;
      } else {
        if (selectors.paginationClass) {    
          // 현재 페이지의 className을 확인
          const paginationClass = selectors.paginationClass;
          const pageClassName = pageList[idx].className;
                      
          if (pageClassName === paginationClass) {
            // 다음 페이지 태그를 선택
            const nextPage = pageList[idx + 1];
            if (nextPage.tagName === "A") {
              nextPage.click();
              hasNextPage = true;
              break;
            } else {
              // 다음 태그가 A 태그가 아닌 경우 null 리턴
              hasNextPage = null;
              break;
            }
          }
          
        } else if (selectors.paginationHref) {
          const paginationHref = selectors.paginationHref;
          const pageHref = pageList[idx].getAttribute("href");
                      
          if (pageHref === paginationHref) {
            // 다음 페이지 태그를 선택
            const nextPage = pageList[idx + 1];
            if (nextPage.tagName === "A") {
              nextPage.click();
              hasNextPage = true;
              break;
            } else {
              // 다음 태그가 A 태그가 아닌 경우 null 리턴
              hasNextPage = null;
              break;
            }
          }
        } 
        
      }
    }
  } else {
  // 셀렉터가 맞지 않는 경우 null 리턴
  hasNextPage = null;
  }
 
  return hasNextPage;
}

/**
 * 리뷰수집 - 네이버쇼핑 전용
 * @param       {jsonObj} selectors 리뷰 수집 룰
 */
function __parseCommentShopping(selectors) {
  console.log("__parseCommentShopping");

  const commentArea = document.querySelector(selectors.commentSelector);

  // 불필요한 영역 제거
  if (selectors.removeSelector !== undefined) {
    const removeArea = commentArea.querySelectorAll(selectors.removeSelector);
    if (removeArea !== undefined) {
      for (remove of removeArea) {
        remove.parentNode.removeChild(remove);
      }
    }
  }

  if (commentArea !== undefined) {
    const lists = commentArea.querySelectorAll(selectors.listSelector);
    const comments = [];

    for (let idx = 0; idx < lists.length; idx++) {
      let title = lists[idx].querySelector(selectors.titleSelector);
      let content = lists[idx].querySelector(selectors.contentSelector);
      let writer = lists[idx].querySelector(selectors.writerSelector);
      let datetime = lists[idx].querySelector(selectors.datetimeSelector);
      let rating = lists[idx].querySelector(selectors.ratingSelector);

      if (title && writer && content && datetime && rating) {
        title = title.textContent.trim();
        content = content.textContent.trim();
        writer = writer.textContent.trim();
        rating = rating.textContent.trim();
        datetime = __parseDatetime(datetime.textContent.trim());
      } else {
        continue;
      }

      let comment = {
        title: title,
        content: content,
        writer: writer,
        rating: rating,
        datetime: datetime
      };

      comments.push(comment);

    } // for

    return comments;
  }
}