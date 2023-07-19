var mysql = require('mysql');

var mysqlPool = (function() {
  var pool = mysql.createPool({
    connectionLimit: 100,
    host: '',
    user: '',
    password: '',
    database: ''
  });

  var getConnection = function(callback) {
    pool.getConnection(callback);
  };

  return {
    getConnection: getConnection
  };
})();

if (exports) {
    module.exports = mysqlPool;
}
