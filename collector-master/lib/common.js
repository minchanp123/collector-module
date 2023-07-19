var common = (function() {

  /**
   * 타임 아웃
   * @param  {Integer}   timeout  타입아웃값
   * @param  {Function} callback 콜백 함수
   */
  var timeout = function(timeout, callback) {
    if (process.platform === 'win32') {
      setTimeout(function() {
        callback(null);
      }, timeout * 1000);
    } else {
      require('sleep').sleep(timeout);
      callback(null);
    }
  }; // timeout

  return {
    timeout: timeout
  };
})();

if (exports) {
    module.exports = common;
}
