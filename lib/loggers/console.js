'use strict';

module.exports = exports = function () {

	return function (msg, next) {

		if (msg.level) {
			switch (Number(msg.level)) {
				case 1:
					console.log(msg.message);
					break;
				case 2:
					console.info(msg.message);
					break;
				case 3:
					console.warn(msg.message);
					break;
				case 4:
				case 5:
					console.error(msg.message);
					break;

				default:
					console.log(msg.message);
			}
			return next();
		}

		console.log(msg.message);

		return next();

	};

};