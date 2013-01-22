'use strict';

var fs = require('fs');

module.exports = exports = function (options) {

	/*
	* Accepts:
	*   stream
	*   format
	*   */
	
  options.stream = options.stream || fs.createWriteStream('./fallback.log', {flags: 'a'});
	
	return function (msg, next) {
		
		var line = '';

		// format

		// check existence of message

		// write to stream
		options.stream.write(line + '\n', 'ascii');

		next();

	};

};