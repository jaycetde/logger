'use strict';

var debug = require('debug')('lib/handler');

function Handler(id) {
	this.id = id;
	this.stack = [];
}

Handler.prototype.use = function (fn) {
	if (typeof(fn) === 'function') {
		this.stack.push(fn);
	}
};

Handler.prototype.log = function () {

	var self = this
		, args = Array.prototype.slice.call(arguments, 0)
		, applyArgs = args.concat([next])
		, l = self.stack.length
		, i = -1;

	function next(err) {

		i += 1;

		if (i < l) {

			if (err) {
				if (self.stack[i].length === (applyArgs.length + 1)) {
					return process.nextTick(function () {
						self.stack[i].apply(self, [err].concat(applyArgs));
					});
				} else {
					return next(err);
				}
			} else {
				return process.nextTick(function () {
					self.stack[i].apply(self, applyArgs);
				});
			}

		}

	}

	process.nextTick(next);

};

Handler.prototype.config = function () {
	return '';
};

module.exports = Handler;