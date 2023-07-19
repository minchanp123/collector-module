var needle = require('needle');

var slack = (function() {

  /**
   * 슬랙 메세지 보내기
   * @param  {jsonObj}   message  발송 메세지
   * @param  {Function} callback  콜백 함수
   */
    var sendMessage = function(message, callback) {
        var webHookUri = '';

        var options = {
            headers: {'Content-Type': 'application/x-www-form-urlencoded'}
        };

        var payload = {
            "attachments":[
                {
                    "fallback": message.title,
                    "color": message.color,
                    "fields":[
                        {
                            "title": message.title,
                            "value": message.value,
                            "short": false
                        }
                    ]
                }
            ]
        };

        needle.post(webHookUri, 'payload=' + JSON.stringify(payload), options, function(err, reps) {
            if (err) {
                callback(err);
            } else {
                callback(null);
            }
        });
    };

    return {
        sendMessage: sendMessage
    };
})();

if (exports) {
    module.exports = slack;
}
