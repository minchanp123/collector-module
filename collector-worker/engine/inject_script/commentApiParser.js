function __request(options, callback) {
  var req = https.request(options, (res) => {
    res.setEncoding('utf-8');

    var responseString = '';

    res.on('data', (data) => {
      responseString += data;
    });

    res.on('end', function() {
      var resultString = responseString.replace('window.__cbox_jindo_callback._2152(', '');
      resultString = resultString.substring(0, resultString.length - 2);
      //eval('var resultObject=' + resultString);

      callback(null, JSON.parse(resultString));
    });
  });

  req.write('');
  req.end();
  req.on('error', (err) => {
    callback(err);
  });
};

function __paseComment(url) {
  let comments = [];

  // 파라미터 파싱
  var queryStrings = url.split('?')[1];
  var params = queryStrings.split('&');

  // 커스텀 oid, aid 값 추출
  var oid = '';
  var aid = '';
  for (var idx = 0; idx < params.length; idx++) {
    var param = params[idx].split('=');
    if (param[0] == 'oid') {
      oid = param[1];
    } else if (param[0] == 'aid') {
      aid = param[1];
    }
  }

  const commentHost = 'apis.naver.com';
  const commentPath = '/commentBox/cbox5/web_naver_list_jsonp.json?ticket=news&templateId=default_life&_callback=window.__cbox_jindo_callback._2152&lang=ko&country=KR&objectId=news' + oid + ',' + aid + '&categoryId&pageSize=10000&indexSize=10&groupId&page=1&initialize=true&useAltSort=true&replyPageSize=100&moveTo&sort&userType=';
  const port = 443;
  const method = 'POST';
  const headers = {
    'Referer': url
  };

  // 옵션 생성
  __request({
    host: commentHost,
    port: port,
    path: commentPath,
    method: method,
    headers: headers
  }, (err, data) => {
    if (err) {
      callback(err);
    } else {
      const result = data.result;

      if (result.commentList != undefined) {
        for (comment of result.commentList) {
          const parentCommentNo = comment.parentCommentNo;
          const replyCount = comment.replyCount;

          var comment = {
            cmt_writer: comment.userName,
            cmt_datetime: comment.regTime,
            cmt_content: comment.contents.replace(/\n/g, ''),
            like_count: comment.sympathyCount,
            dislike_count: comment.antipathyCount
          };

          if (replyCount > 0) {
            comment.comments = [];

            __request({
              host: commentHost,
              port: port,
              path: commentPath + '&parentCommentNo=' + parentCommentNo,
              method: method,
              headers: headers
            }, (err2, data2) => {
              if (err2) {
                //callback(err2);
                return null;
              } else {
                const result2 = data2.result;
                if (result2.commentList != undefined) {
                  for (recomment of result2.commentList) {
                    var recomment = {
                      cmt_writer: recomment.userName,
                      cmt_datetime: recomment.regTime,
                      cmt_content: recomment.contents.replace(/\n/g, ''),
                      like_count: recomment.sympathyCount,
                      dislike_count: recomment.antipathyCount
                    }

                    comment.comments.push(recomment);
                  }
                }

                comments.push(comment);
              }
            });
          } else {
            comments.push(comment);
          }
        }

        //callback(null, comments);
        return comments;
      }
    }
  });
}; // crawlComments
