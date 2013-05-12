'use strict';

var logger = require('../index')
    , fs = require('fs')
    , testFile = fs.createWriteStream('./fallback.log', {flags: 'a'});

var client1 = logger.createClient({
    host: '127.0.0.1'
  , tcpPort: 5555
  , udpPort: 8989
  , handler: 'test'
  , callback: run1
});

client1.on('udp-send', function (buf) {
    console.log('Sending - ' + buf.toString());
});
/*
var client2 = logger.createClient({
    host: '192.168.1.120'
  , port: 41234
  , handler: 'test2'
}, run2);

var client3 = logger.createClient({
        host: '192.168.1.120'
    , port: 41234
    , handler: 'test3'
}, run3);
*/
var x = 0;

function run1() {
    client1.log('Test ' + x++, x % 8);
    setTimeout(run1, 500);
}
/*
function run2() {

    client2.info('Derpy');
    setTimeout(run2, 1000);

}

function run3() {

    client3.warn('ello mate');
    setTimeout(run3, 2000);

}
*/
