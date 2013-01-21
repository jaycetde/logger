'use strict';

module.exports = exports = function (reg, names) {

	var namesLength = names.length;

	return function (msg, next) {

		var regExec = reg.exec(msg.message)
			, i;

		if (regExec !== null) {

			for (i = 0; i < namesLength; i += 1) {

				if (names[i]) {
					msg[names[i]] = regExec[i + 1];
				}

			}

		} else {
			console.log('bad reg');
		}

		next();

	};

};