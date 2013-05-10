
var Server = require('./server')
  , Client = require('./client')
;

exports.createServer = function () {

    return new Server();

};

exports.createClient = function (options, callback) {
    var client = new Client(options);

    if (callback) {
        client.on('connected', callback);
    }

    return client;
};

// Acceptors
exports.logger = require('./acceptors/logger');

// Middleware
exports.console = require('./middleware/console');
exports.fileWriter = require('./middleware/fileWriter');
exports.extractor = require('./middleware/extractor');
