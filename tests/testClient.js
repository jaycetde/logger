'use strict';

var logger = require('../index')
	, fs = require('fs')
	, testFile = fs.createWriteStream('./fallback.log', {flags: 'a'});

var client = logger.createClient({
		host: '192.168.1.120'
	, port: 41234
	, handler: 'test'
	, stream: testFile
});

var client2 = logger.createClient({
		host: '192.168.1.120'
	, port: 41234
	, handler: 'test2'
});

var x = 0;

function run() {

	client.error('Test ' + x++);
	setTimeout(run, 500);

}

setTimeout(run, 2000);
