const path = require("path");

const logger = require("./lib/logger");

const loader = (function () {
  try {
    const load = function (collectParams, callback) {

      const engine = require("./" + collectParams.engine.filePath);
      logger.debug("[loader] execute engine");
      logger.debug("### engine Path: " + collectParams.engine.filePath);

      engine.execute(collectParams, (err, md5) => {
        if (err) {
          callback(err);
        } else {
          if (
            md5 === "NO_RESULTS" ||
            md5 === "SUCCESSFULLY_COLLECTED" ||
            md5 === "NO_MORE_LIST_PAGE"
          ) {
            md5 = "";
          }

          callback(null, md5);
        }
      });
    }; // load

    return {
      load: load,
    };
  } catch (e) {
    logger.error(e);
  }
})();

if (exports) {
  module.exports = loader;
}
