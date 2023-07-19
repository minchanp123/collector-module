function __parseTable(selectors) {
  console.log('__parseTable');
  var result = [];
  var frameDocument;

  if (selectors.iframeSelector !== undefined) {
    // IFrame에서 원문 추출
    var frameSelectors = selectors.iframeSelector.split(' ');

    for (var idx = 0; idx < frameSelectors.length; idx++) {
      if (idx === 0) {
        frameDocument = document.querySelector(frameSelectors[idx]).contentDocument;
      } else {
        frameDocument = frameDocument.querySelector(frameSelectors[idx]).contentDocument;
      }
    }
  }

  if (selectors.removeListSelector !== undefined) {
    var removeListElement = frameDocument.querySelectorAll(selectors.removeListSelector);

    for (var idx = 0; idx < removeListElement.length; idx++) {
      if (selectors.removeParent !== undefined) {
        if (selectors.removeParent) {
          __findParentBySelector(removeListElement[idx], selectors.listSelector, frameDocument).parentNode.removeChild(__findParentBySelector(removeListElement[idx], selectors.listSelector, frameDocument));
        } else {
          removeListElement[idx].parentNode.removeChild(removeListElement[idx]);
        }
      } else {
        removeListElement[idx].parentNode.removeChild(removeListElement[idx]);
      }
    }
  }

  var tableArea;
  if (frameDocument !== undefined) {
    if (selectors.tableRemoveSelector !== undefined) {
      var removeListElement = frameDocument.querySelectorAll(selectors.tableRemoveSelector);

      for (var idx = 0; idx < removeListElement.length; idx++) {
        removeListElement[idx].parentNode.removeChild(removeListElement[idx]);
      }
    }

    tableArea = frameDocument.querySelector(selectors.documentSelector);
  } else {
    if (selectors.tableRemoveSelector !== undefined) {
      var removeListElement = document.querySelectorAll(selectors.tableRemoveSelector);

      for (var idx = 0; idx < removeListElement.length; idx++) {
        removeListElement[idx].parentNode.removeChild(removeListElement[idx]);
      }
    }

    tableArea = document.querySelector(selectors.documentSelector);
  }

  if (selectors.tableSelector === undefined) {
    selectors.tableSelector = 'table';
  }

  var tableElems = tableArea.querySelectorAll(selectors.tableSelector);

  // 디폴트 행 우선 순회 파싱
  for (var idx = 0; idx < tableElems.length; idx++) {

    if (selectors.tableHeaderSelector === undefined) {
      selectors.tableHeaderSelector = 'thead';
    }

    if (selectors.tableHeaderRowSelector === undefined) {
      selectors.tableHeaderRowSelector = 'tr';
    }

    if (selectors.tableHeaderCellSelector === undefined) {
      selectors.tableHeaderCellSelector = 'th';
    }

    // 헤더 추출
    var header = tableElems[idx].querySelector(selectors.tableHeaderSelector);
    var headers;

    if (selectors.tableHeaderSelector === selectors.tableHeaderRowSelector) {
      headers = header.querySelectorAll(selectors.tableHeaderCellSelector);
    } else {
      headers = header.querySelector(selectors.tableHeaderRowSelector).querySelectorAll(selectors.tableHeaderCellSelector);
    }

    headers = Array.prototype.map.call(headers, function(e) {
      var value;

      if (selectors.tableHeaderHtmlParse !== undefined) {
        if (selectors.tableHeaderHtmlParse) {
          value = e.innerText.trim();
        } else if (!selectors.tableHeaderHtmlParse) {
          value = e.innerHTML.trim();
        }
      } else {
        value = e.innerText.trim();
      }

      return {
        value: value,
        rowspan: parseInt(e.getAttribute('rowspan') === null ? 1 : e.getAttribute('rowspan').trim()),
        colspan: parseInt(e.getAttribute('colspan') === null ? 1 : e.getAttribute('colspan').trim())
      }
    });

    var colKeys = Array.prototype.map.call(header.querySelectorAll(selectors.tableColKeySelector), function(e) {
      return {
        value: e.innerText.trim(),
        rowspan: parseInt(e.getAttribute('rowspan') === null ? 1 : e.getAttribute('rowspan').trim()),
        colspan: parseInt(e.getAttribute('colspan') === null ? 1 : e.getAttribute('colspan').trim())
      }
    });

    if (colKeys.length < 1 && selectors.two_tableColKeySelector !== undefined) {
      colKeys = Array.prototype.map.call(document.querySelectorAll(selectors.two_tableColKeySelector), function(e) {
        return {
          value: e.innerText.trim(),
          rowspan: parseInt(e.getAttribute('rowspan') === null ? 1 : e.getAttribute('rowspan').trim()),
          colspan: parseInt(e.getAttribute('colspan') === null ? 1 : e.getAttribute('colspan').trim())
        }
      });
    }

    if (selectors.tableBodySelector === undefined) {
      selectors.tableBodySelector = 'tbody';
    }

    if (selectors.tableBodyRowSelector === undefined) {
      selectors.tableBodyRowSelector = 'tr';
    }

    if (selectors.tableBodyCellSelector === undefined) {
      selectors.tableBodyCellSelector = 'td';
    }

    // 바디 추출
    var bodys = tableElems[idx].querySelectorAll(selectors.tableBodySelector);
    var rows = [];
    var rowKeys = [];

    // 로우 추출
    for (var bodyIdx = 0; bodyIdx < bodys.length; bodyIdx++) {
      rows = rows.concat(Array.prototype.slice.call(bodys[bodyIdx].querySelectorAll(selectors.tableBodyRowSelector)));

      if (selectors.tableRowKeySelector !== undefined) {
        rowKeys = rowKeys.concat(
          Array.prototype.map.call(bodys[bodyIdx].querySelectorAll(selectors.tableRowKeySelector), function(e) {
            return {
              value: e.innerText.trim(),
              rowspan: parseInt(e.getAttribute('rowspan') === null ? 1 : e.getAttribute('rowspan').trim()),
              colspan: parseInt(e.getAttribute('colspan') === null ? 1 : e.getAttribute('colspan').trim())
            };
          })
        );
      }
    }

    var startRowIdx = 0;
    if (selectors.tableBodyRowStartIdx !== undefined) {
      startRowIdx = selectors.tableBodyRowStartIdx;
    }

    var startColIdx = 0;
    if (selectors.tableBodyColStartIdx !== undefined) {
      startColIdx = selectors.tableBodyColStartIdx;
    }

    var colKeysUsed = false;
    if (colKeys !== undefined && colKeys.length > 0) {
      colKeysUsed = true;
    }

    var rowKeysUsed = false;
    if (rowKeys !== undefined && rowKeys.length > 0) {
      rowKeysUsed = true;
    }

    var data = {};

    // 로우 순회
    for (var rowIdx = startRowIdx; rowIdx < rows.length; rowIdx++) {
      // var cells = rows[rowIdx].querySelectorAll(selectors.tableBodyCellSelector);
      var cells = Array.prototype.map.call(rows[rowIdx].querySelectorAll(selectors.tableBodyCellSelector), function(e) {
        return {
          value: e.className === 'data-actual' || e.className === 'data-estimate' ? e.innerText.trim() : '',
          rowspan: parseInt(e.getAttribute('rowspan') === null ? 1 : e.getAttribute('rowspan').trim()),
          colspan: parseInt(e.getAttribute('colspan') === null ? 1 : e.getAttribute('colspan').trim())
        };
      });

      // cells = Array.prototype.slice.call(cells).slice(startColIdx, cells.length);
      cells = cells.slice(startColIdx, cells.length);

      // 셀 순회
      var cellColSpanIdx = 0;
      var cellRowSpanIdx = 0;
      for (var cellIdx = 0; cellIdx < cells.length; cellIdx++) {
        var key = headers[cellIdx].value;
        // var key = headers[cellIdx].innerText;
        // var key = __getKey(headers, cellIdx, 'COL').value;
        var value = cells[cellIdx].value.replace(/\n/g, '');
        // var value = cells[cellIdx].innerText.replace(/\n/g, '');
        //var value = __getKey(cells, cellIdx, 'COL').value;
        cellColSpanIdx += cells[cellIdx].colspan === 1 ? 0 : cells[cellIdx].colspan - 1;
        cellRowSpanIdx += cells[cellIdx].rowspan === 1 ? 0 : cells[cellIdx].rowspan - 1;

        if (value === '–') {
          value = '';
        }

        if (key === '' && value === '') {
          continue;
        }

        if (selectors.filterKey !== undefined && selectors.filterKey.length > 0) {
          if (selectors.filterKey.includes(key)) {
            continue;
          }
        }

        if (colKeysUsed && !rowKeysUsed) {
          var colKey = __getKey(colKeys, rowIdx + cellColSpanIdx, 'COL').value;

          if (selectors.filterColField !== undefined && selectors.filterColField.length > 0) {
            if (!selectors.filterColField.includes(colKey)) {
              continue;
            }
          }

          if (selectors.reverse) {
            if (key === "") {
              continue;
            }

            if (data[key] === undefined) {
              data[key] = {};
            }

            data[key][colKey] = value;
          } else {
            if (colKey === "") {
              continue;
            }

            if (data[colKey] === undefined) {
              data[colKey] = {};
            }

            data[colKey][key] = value;
          }
        } else if (!colKeysUsed && rowKeysUsed) {
          var rowKey = __getKey(rowKeys, rowIdx + cellRowSpanIdx, 'ROW').value;

          if (selectors.filterRowField !== undefined && selectors.filterRowField.length > 0) {
            if (!selectors.filterRowField.includes(rowKey)) {
              break;
            }
          }

          if (selectors.reverse) {
            if (key === "") {
              continue;
            }

            if (data[key] === undefined) {
              data[key] = {};
            }

            data[key][rowKey] = value;
          } else {
            if (rowKey === "") {
              continue;
            }

            if (data[rowKey] === undefined) {
              data[rowKey] = {};
            }

            data[rowKey][key] = value;
          }
        } else if (colKeysUsed && rowKeysUsed) {
          var rowKeyIdx;
          if(cellIdx < 1){
            rowKeyIdx = 0;
          }else if(cellIdx < 5){
            rowKeyIdx = 1;
          } else {
            rowKeyIdx = 2;
          }
          var colKey = __getKey(colKeys, rowIdx + cellColSpanIdx, 'COL').value;
          var rowKey = __getKey(rowKeys, rowKeyIdx + cellRowSpanIdx, 'ROW').value;

          // ROW 필터
          if (selectors.filterRowField !== undefined && selectors.filterRowField.length > 0) {
            if (!selectors.filterRowField.includes(rowKey)) {
              break;
            }
          }

          // COL 필터
          if (selectors.filterColField !== undefined && selectors.filterColField.length > 0) {
            if (!selectors.filterColField.includes(colKey)) {
              continue;
            }
          }

          if (colKey === "" || rowKey === "") {
            continue;
          }

          if (selectors.reverse) {
            if (data[rowKey] === undefined) {
              data[rowKey] = {};
              data[rowKey][colKey] = {};
            }

            if (data[rowKey][colKey] === undefined) {
              data[rowKey][colKey] = {};
            }

            if (key === "") {
              continue;
            }

            data[rowKey][colKey][key] = value;
          } else {
            if (data[colKey] === undefined) {
              data[colKey] = {};
              data[colKey][rowKey] = {};
            }

            if (data[colKey][rowKey] === undefined) {
              data[colKey][rowKey] = {};
            }

            if (key === "") {
              continue;
            }

            data[colKey][rowKey][key] = value;
          }
        } else {
          // ROW 필터
          if (selectors.filterRowField !== undefined && selectors.filterRowField.length > 0) {
            if (cellIdx === 0 && !selectors.filterRowField.includes(value)) {
              break;
            }
          }

          // COL 필터
          if (selectors.filterColField !== undefined && selectors.filterColField.length > 0) {
            if (!selectors.filterColField.includes(key)) {
              continue;
            }
          }

          if (key === "") {
            continue;
          }

          data[key] = value;
        }
      } //Cols

      if (!colKeysUsed && !rowKeysUsed) {
        if (Object.keys(data).length !== 0) {
          result.push(data);
          data = {};
        }
      }
    } // Rows

    if (Object.keys(data).length !== 0) {
      result.push(data);
      data = {};
    }
  }

  return JSON.stringify(result);
}

function __getKey(keys, index, type) {
  var idxSum = 0;
  var key;

  for (var idx = 0; idx < keys.length; idx++) {
    var span;

    if (type === 'ROW') {
      span = keys[idx].rowspan;
    } else if (type === 'COL') {
      span = keys[idx].colspan;
    }

    idxSum += span;

    if (index < idxSum) {
      key = keys[idx];
      break;
    }
  }

  return key;
}
