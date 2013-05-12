'use strict';

var logger = require('./../index')
//    , lsAccess = new logger.Handler('test')
    , extractorReg
    , extractorMap;

extractorReg = /^(([0-9]{1,3}\.){3}[0-9]{1,3}) ([0-9]{3}) ([0-9]+) ([a-z]+) "([^"]*)" ([0-9]\.[0-9]) "([^"]*)" "([^"]*)"$/i;
extractorMap = [
        'remote'
    ,    // Do not include second ip address capture
    , 'status'
    , 'duration'
    , 'method'
    , 'url'
    , 'httpversion'
    , 'referrer'
    , 'useragent'
];

var logServer = logger.createServer();

var logInput = logger.logger(logServer, { port: 5555 }, function (sockets) {
    console.log('TCP: ', sockets.tcp.address().port);
    console.log('UDP: ', sockets.udp.address().port);
});

var handler1 = logServer.createHandler('test');

handler1.use(logger.console());

logServer
  .on('socket-close', function () { console.log('close'); })
  .on('client-remove', function () { console.log('remove'); })
  .on('handshake', function () { console.log('handshake'); })
  .on('socket-connect', function () { console.log('connect'); })
;

/*
var handler2 = logServer.createHandler('test2');

handler2.use(function (data) {
    console.log('test2: ' + data.message);
});

var handler3 = logServer.createHandler('test3');

handler3.use(function (data) {
    console.log('test3: ' + data.message);
});
*/

//lsAccess.use(logger.extractor(extractorReg, extractorMap));

/*
var x = 0;

lsAccess.use(function (msg) {
    if (msg.dropped) {
        console.log('Dropped');
    }
});

logger.setHandler(lsAccess);

logger.listen(41234);
*/
/*
* remote address
* timestamp ---
* method
* url
* HTTP version
* status
* bytes sent (http content length)
* referrer
* user agent
* */
