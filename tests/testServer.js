'use strict';

var logger = require('./../index')
//	, lsAccess = new logger.Handler('test')
	, extractorReg
	, extractorMap;

extractorReg = /^(([0-9]{1,3}\.){3}[0-9]{1,3}) ([0-9]{3}) ([0-9]+) ([a-z]+) "([^"]*)" ([0-9]\.[0-9]) "([^"]*)" "([^"]*)"$/i;
extractorMap = [
		'remote'
	,	// Do not include second ip address capture
	, 'status'
	, 'duration'
	, 'method'
	, 'url'
	, 'httpversion'
	, 'referrer'
	, 'useragent'
];

var logServer = logger.createServer({
		port: 41234
}, function () {
	
	console.log('TCP listening on ' + this.tcp.address().port);
	console.log('UDP listening on ' + this.udp.address().port);
	
});

var testHandler = logServer.createHandler('test');

testHandler.use(function (data) {
	console.log(data.message);
});

//lsAccess.use(logger.extractor(extractorReg, extractorMap));

/*
var x = 0;

lsAccess.use(function (msg) {
	if (msg.dropped) {
		console.log('Dropped');
	}
});

logger.setHandler(lsAccess);

logger.listen(41234);
*/
/*
* remote address
* timestamp ---
* method
* url
* HTTP version
* status
* bytes sent (http content length)
* referrer
* user agent
* */