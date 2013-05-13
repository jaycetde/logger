'use strict';

// Servers section

var logger = require('./../index')

  , server = logger.createServer()

  , test1Handler = server.createHandler('test1')
  , test2Handler = server.createHandler('test2')
  , test3Handler = server.createHandler('test3')

  , client1
  , client2
  , client3
  , client4

;

logger.logger(
    server
  , {
      tcpPort: 5555
    , udpPort: 8989
  }
  , function (sockets) {
      console.log('TCP:', sockets.tcp.address().port);
      console.log('UDP:', sockets.udp.address().port);
  }
);

test1Handler.use(function (data, next) {
    console.log('handler 1:', data.message);
});
test2Handler.use(function (data, next) {
    console.log('handler 2:', data.message);
});
test3Handler.use(function (data, next) {
    console.log('handler 3:', data.message);
});

server
  .on('socket-close', function () { console.log('close'); })
  .on('client-remove', function () { console.log('remove'); })
  .on('handshake', function () { console.log('handshake'); })
  .on('socket-connect', function () { console.log('connect'); })
;

// Clients section

client1 = logger.createClient({
    tcpPort: 5555
  , udpPort: 8989
  , handler: 'test1'
  , fallbackFile: __dirname + '/client1Fallback.log'
});

client2 = logger.createClient({
    tcpPort: 5555
  , udpPort: 8989
  , handler: 'test2'
  , fallbackFile: __dirname + '/client2Fallback.log'
});

client3 = logger.createClient({
    tcpPort: 5555
  , udpPort: 8989
  , handler: 'test3'
  , fallbackFile: __dirname + '/client3Fallback.log'
});

client4 = logger.createClient({
    tcpPort: 5555
  , udpPort: 8989
  , handler: 'test1'
  , fallbackFile: __dirname + '/client4Fallback.log'
});

function run() {

    client1.log('client 1', 4);
    client2.log('client 2', 3);
    client3.log('client 3', 2);
    client4.log('client 4', 1);

    setTimeout(run, 500);
}

setTimeout(run, 1000);
