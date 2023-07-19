/**
 * 다음 페이지 이동 함수
 * @param       {jsonObj} selectors 페이징 파싱 룰
 */
function __goToNextPage(selectors) {
  console.log("__goToNextPage");

  var frameDocument;
  if (selectors.iframeSelector !== undefined) {
    // IFrame에서 원문 추출
    var iframeSelectors = selectors.iframeSelector.split(" ");

    for (var idx = 0; idx < iframeSelectors.length; idx++) {
      if (idx === 0) {
        frameDocument = document.querySelector(iframeSelectors[idx])
          .contentDocument;
      } else {
        frameDocument = frameDocument.querySelector(iframeSelectors[idx])
          .contentDocument;
      }
    }
  }

  // 불필요한 엘리먼트 제거
  if (selectors.removePaginationSelector !== undefined) {
    var removePaginationElement;

    if (frameDocument !== undefined) {
      removePaginationElement = frameDocument.querySelectorAll(
        selectors.removePaginationSelector
      );
    } else {
      removePaginationElement = document.querySelectorAll(
        selectors.removePaginationSelector
      );
    }

    for (var idx = 0; idx < removePaginationElement.length; idx++) {
      removePaginationElement[idx].parentNode.removeChild(
        removePaginationElement[idx]
      );
    }
  }

  // 페이지네이션 영역 추출
  var pageNaviArea;

  if (frameDocument !== undefined) {
    pageNaviArea = frameDocument.querySelectorAll(selectors.paginationSelector);
  } else {
    pageNaviArea = document.querySelectorAll(selectors.paginationSelector);
  }

  // 자식 노드 추출
  var children = [];
  for (var idx = 0; idx < pageNaviArea.length; idx++) {
    // A 태그일 경우 추가
    if (pageNaviArea[idx].tagName === "A") {
      children.push(pageNaviArea[idx]);
    } else {
      // 자식 노드가 존재하는 노의일 경우 자식 노드를 모두 추가
      if (pageNaviArea[idx].hasChildNodes) {
        for (var idx2 = 0; idx2 < pageNaviArea[idx].childNodes.length; idx2++) {
          if (pageNaviArea[idx].childNodes[idx2].nodeType !== 3) {
            children.push(pageNaviArea[idx].childNodes[idx2]);
          }
        }
      }
    }
  }

  var nodes = [];
  var accumulator = 0;
  var findCurPageMark = false;

  // 스코어 계산
  for (var idx = 0; idx < children.length; idx++) {
    var nodeType = children[idx].nodeType;
    var tagName = children[idx].tagName;

    var node = {
      idx: idx,
      nodeType: nodeType,
      tagName: tagName
    };

    if (tagName === undefined || nodeType !== 1) {
      node.score = 0;
    } else {
      var classList = children[idx].classList;

      //선택중인 페이지에 대한 Class정보가 명확한 경우
      if (selectors.paginationClass !== undefined) {
        if (classList.contains(selectors.paginationClass)) {
          //tagName !== 'A'
          accumulator = 100;
          findCurPageMark = true;
        } else {
          if (findCurPageMark === false) {
            accumulator += 1;
          } else {
            accumulator -= 1;
          }
        }
      } else if (selectors.paginationTag !== undefined) {
        if (tagName.toLowerCase() === selectors.paginationTag) {
          accumulator = 100;
          findCurPageMark = true;
        } else {
          if (findCurPageMark === false) {
            accumulator += 1;
          } else {
            accumulator -= 1;
          }
        }
      } else {
      }

      node.score = accumulator;
      // return node.idx + ', ' + node.nodeType + ', ' + node.tagName;
    }

    nodes.push(node);
  }

  // 정렬
  nodes.sort(function(a, b) {
    return b.score - a.score;
  });

  // nodes[1] 클릭. nodes[0] 는 현재 페이지 mark
  // 단, nodes[1] 의 score 값이 99인지 확인 필요. (score 값이 99 여야 현재 페이지 바로 링크임)

  if (nodes.length > 0) {
    if (nodes.length === 1) {
      // nodes의 size가 1인 경우. (페이징 영역에 node가 하나뿐인 경우. 즉, 첫페이지 이자 마지막 페이지)
      return false;
    } else {
      if (nodes[1].score === 99) {
        if (nodes[1].tagName !== "A") {
          var subChildren = children[nodes[1].idx].children;
          if (subChildren.length == 0) {
            children[nodes[1].idx].click();
            return true;
          } else {
            for (var idx = 0; idx < subChildren.length; idx++) {
              var nodeType = subChildren[idx].nodeType;
              var tagName = subChildren[idx].tagName;

              if (nodeType === 1 && tagName === "A") {
                subChildren[idx].click();
                return true;
              }
            }
          }
        } else {
          //children[nodes[1].idx].click();
          children[nodes[1].idx].click();
          return true;
        }
      } else {
        // nodes[1] 의 score 값이 99가 아닌 경우. (현재 페이지 mark 이후의 링크가 없는 경우. 즉, 마지막 페이지)
        // return nodes;
        return false;
      }
    }
  } else {
    return false;
  }
} // __goToNextPage

/**
 * 버튼 클릭으로 카테고리 이동
 * @param       {jsonObj} selectors 카테고리 파싱 룰
 */
function __openCategory(selectors) {
  console.log("__openCategory");
  if (selectors.categoryButtonSelector !== undefined) {
    document.querySelector(selectors.categoryButtonSelector).click();
  }
} // __openCategory

/**
 * 카테고리 스코리엉을 통한 카테고리 이동
 * @param       {jsonObj} selectors 카테고리 파싱 룰
 */
// function __goToNextCategory(selectors) {
//   console.log('__goToNextCategory');
//   var pageNaviArea = document.querySelector(selectors.categoryListSelector);
//   var children = pageNaviArea.childNodes;
//   var nodes = [];
//   var accumulator = 0;
//   var findCurCategoryMark = false;
//
//   for (var idx = 0; idx < children.length; idx++) {
//     var nodeType = children[idx].nodeType;
//     var tagName = children[idx].tagName;
//
//     var node = {
//       idx: idx,
//       nodeType: nodeType,
//       tagName: tagName
//     };
//
//     console.log(node);
//     if (tagName === undefined || nodeType !== 1) {
//       node.score = 0;
//     } else {
//       var classList = children[idx].classList;
//
//       if (classList.contains(selectors.categoryClass)) {
//         accumulator = 100;
//         findCurCategoryMark = true;
//       } else {
//         if (findCurCategoryMark === false) {
//           accumulator += 1;
//         } else {
//           accumulator -= 1;
//         }
//       }
//
//       node.score = accumulator;
//     }
//
//     nodes.push(node);
//   }
//
//   nodes.sort(function(a, b) {
//     return b.score - a.score;
//   });
//
//   // nodes[1] 클릭. nodes[0] 는 현재 페이지 mark
//   // 단, nodes[1] 의 score 값이 99인지 확인 필요. (score 값이 99 여야 현재 페이지 바로 링크임)
//   if (nodes[1].score === 99) {
//
//     if (nodes[1].tagName !== 'A') {
//       var subChildren = children[nodes[1].idx].children;
//       for (var idx = 0; idx < subChildren.length; idx++) {
//         var nodeType = subChildren[idx].nodeType;
//         var tagName = subChildren[idx].tagName;
//
//         if (nodeType === 1 && tagName === 'A') {
//           subChildren[idx].click();
//           return true;
//         }
//       }
//     } else {
//       children[nodes[1].idx].click();
//       return true;
//     }
//   } else { // nodes[1] 의 score 값이 99가 아닌 경우. (현재 페이지 mark 이후의 링크가 없는 경우. 즉, 마지막 페이지)
//     return false;
//   }
// } // __goToNextCategory

/**
 * 클릭형 스크롤 페이징 함수
 * @param       {jsonObj} selectors 페이징 파싱 룰
 */
function __goToNextScroll(selectors) {
  console.log("__goToNextScroll");

  // 스크롤을 맨 아래까지 내린다.
  window.scrollTo(0, 0);
  window.scrollTo(0, document.body.scrollHeight);

  // 읽어들이는 버튼이 있는 경우
  if (selectors.scrollBtnSelector !== undefined) {
    var scrollBtn = document.querySelector(selectors.scrollBtnSelector);

    if (scrollBtn !== undefined && scrollBtn !== null) {
      //더 읽어들이기 버튼 존재하는지 검사
      scrollBtn.click();
      return true;
    } else {
      return __goToScroll();
    }
  } else {
    return true;
  }
} // __goToNextScroll

/**
 * 스크롤 페이징 함수
 */
function __goToScroll() {
  window.scrollTo(0, 0);
  window.scrollTo(0, document.body.scrollHeight);
  return true;
} // __goToScroll
