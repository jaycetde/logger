'use strict';

function test() {

	this.middleware = [];

}

test.method('use', function (fn) {
	this.middleware.push(fn);
});

test.method('runMiddleware', function () {

	var self = this
		, args = Array.prototype.splice.call(arguments, 0)
		, applyArgs = args.concat([next])
		, callback = args.pop()
		, i = 0;

	function next(err) {

		if (err) {
			return callback.apply(self, [err].concat(args));
		}

		if (i >= self.middleware.length) {
			args.pop();
			callback.apply(self, [null].concat(args));
		} else {
			self.middleware[i++].apply(self, args);
		}

	}

	args.push(next);

	self.middleware[i++].apply(self, args);

});