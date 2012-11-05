'use strict';

var logger = require('./../index')
	, testHandler = new logger.Handler('test')
	, secondHandler = new logger.Handler('second');

testHandler.use(logger.extractor(/^([a-z]+)? - ([0-9]+)? \[([^\]]+)?]$/i, ['letters', 'numbers', 'bracket']));

testHandler.use(function (msg) {
	console.log(msg.letters);
	console.log(msg.numbers);
	console.log(msg.bracket);
});

logger.setHandler(testHandler);

secondHandler.use(function (msg) {
	console.log('second: '+msg.message);
});

logger.setHandler(secondHandler);

logger.listen(41234);