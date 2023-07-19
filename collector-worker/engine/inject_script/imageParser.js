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
 * 원문 파싱
 * @param       {jsonObj} selectors CSS Selectors
 */
function __parseDocument(selectors) {
  console.log("__parseDocument");
  var result = {};

  // IFrame 파싱
  var frameDocument;
  if (__notNull(selectors.iframeSelector)) {
    // IFrame에서 원문 추출
    var frameSelectors = selectors.iframeSelector;
    frameDocument = document.querySelector(frameSelectors).contentDocument;
  }

  // 본문 영역 추출
  var header;
  if (__notNull(frameDocument)) {
    header = frameDocument.querySelector(selectors.documentSelector);
  } else {
    header = document.querySelector(selectors.documentSelector);
  }

  if (!__notNull(header)) {
    return null;
  }

  // 제목 추출
  if (__notNull(selectors.titleSelector)) {
    var titleElement = header.querySelector(selectors.titleSelector);
    var title = titleElement.innerText
      .trim()
      .replace(/\t/g, "")
      .replace(/\n/g, "");

    result.doc_title = title;
  }

  let img_url = [];

  if (__notNull(selectors.contentSelector)) {
    var contentElements = header.querySelector(selectors.contentSelector);
    result.doc_content = contentElements.innerText;

    if (
      __notNull(contentElements) &&
      __notNull(selectors.imageSelector) &&
      __notNull(selectors.imageAttrSelector)
    ) {
      const imageElements = contentElements.querySelectorAll(
        selectors.imageSelector
      );

      for (let idx = 0, len = imageElements.length; idx < len; idx += 1) {
        img_url.push(
          imageElements[idx].getAttribute(selectors.imageAttrSelector)
        );
      }

      result.image_urls = img_url;
    }
  }

  // 날짜 추출
  if (__notNull(selectors.datetimeSelector)) {
    var datetimeElement = header.querySelector(selectors.datetimeSelector);
    var datetime = "";

    if (__notNull(datetimeElement)) {
      if (__notNull(selectors.datetimeRegex)) {
        var datetimeRegex = new RegExp(selectors.datetimeRegex);
        var matched = datetimeRegex.exec(datetimeElement.innerText);

        if (__notNull(matched)) {
          datetime = __parseDatetime(matched[1]);
        } else {
          datetime = __parseDatetime(datetimeElement.innerText);
        }
      } else if (__notNull(selectors.datetimeAttr)) {
        datetime = __parseDatetime(
          datetimeElement.getAttribute(selectors.datetimeAttr).trim()
        );
      } else {
        datetime = __parseDatetime(datetimeElement.innerText);
      }
    }

    result.doc_datetime = datetime;
  }

  // 결과데이터가 있는 경우 result 리턴
  if (Object.keys(result).length === 0) {
    return null;
  } else {
    return result;
  }
} // __parseDocument
