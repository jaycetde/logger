
var Server = require('./server')
	, Client = require('./client');

exports.createServer = function (options, callback) {
	var server = new Server(options);
	
	if (callback) {
		server.on('ready', callback);
	}
	
	return server;
};

exports.createClient = function (options, callback) {
	var client = new Client(options);
	
	if (callback) {
		client.on('connected', callback);
	}
	
	return client;
};

exports.console = require('./middleware/console');
exports.fileWriter = require('./middleware/fileWriter');
exports.extractor = require('./middleware/extractor');