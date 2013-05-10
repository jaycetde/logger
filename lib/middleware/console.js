'use strict';

// Level names equally spaced to line up messages for easier reading
var levels = [
    'Emergency'
  , 'Alert    '
  , 'Critical '
  , 'Error    '
  , 'Warning  '
  , 'Notice   '
  , 'Info     '
  , 'Debug    '
];

function formatStr() {
  var args = Array.prototype.slice.call(arguments)
    , str = args.shift()
    , i = 0;
  return str.replace(/\{([0-9]*)\}/g, function (m, argI) {
        argI = argI || i;
        i += 1;
    return typeof(args[argI]) !== 'undefined' ? args[argI] : '';
  });
};

module.exports = exports = function (options) {

    options = options || {};

    options.format = options.format || '{0} {1} {2}';
    options.dateFormat = options.dateFormat || '';

    return function (msg, next) {

        var level = msg.level === undefined ? '         ' : levels[msg.level]
          , timestamp = msg.timestamp.toUTCString()
        ;

        if (typeof(options.format) === 'function') {
            console.log(options.format(level, timestamp, msg.message));
        } else {
            console.log(formatStr(options.format, level, timestamp, msg.message));
        }

        return next();

    };

};
