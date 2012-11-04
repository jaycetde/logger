'use strict';

var logServer = require('./../index')
	, testHandler = new logServer.Handler('test')
	, secondHandler = new logServer.Handler('second');

testHandler.use(function (msg) {
		console.log('Message: ' + msg.message);
});

logServer.setHandler(testHandler);

secondHandler.use(function (msg) {
	console.log('second: '+msg.message);
});

logServer.setHandler(secondHandler);

logServer.listen(41234);