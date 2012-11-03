'use strict';

function Interface(id) {
	this.id = id;
	this.stack = [];
}

Interface.prototype.use = function (fn) {
	if (typeof(fn) === 'Function') {
		this.stack.push(fn);
	}
};

Interface.prototype.log = function () {

	/*
	arguments[0]: {
		client: Address || Name
		level: Logging level (optional)
		message: Full Message
	* */

	var self = this
		, args = Array.prototype.splice.call(arguments, 0)
		, applyArgs = args.concat([next])
		, l = self.stack.length
		, i = -1;

	function next(err) {

		i += 1;

		if (i < l) {

			if (err) {
				if (self.stack[i].length === (applyArgs.length + 1)) {
					self.stack[i].apply(self, [err].concat(applyArgs));
				} else {
					next(err);
				}
			} else {
				self.stack[i].apply(self, applyArgs);
			}

		}

	}

	next(null);

};

module.exports = Interface;