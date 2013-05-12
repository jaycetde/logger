'use strict';

var net = require('net')
  , dgram = require('dgram')

  , sequenceChars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('')
  , udpSplitReg = /^([0-9]+|[a-z\-_]+)?:([0-9a-zA-Z]+)?:([0-9]{13})?:([0-7])?:(.+)$/
  , defaultPort = 41234
  , dropDelay = 3 * 1000
  , removalDelay = 5 * 1000
  , keepAliveLength = 2 * 60 * 1000
;

// Modify some prototypes
function netSend(data) {

    var socket = this;

    if (typeof(data) === 'string' || data instanceof Buffer) {
        return socket.write('\0' + data + '\0');
    } else if (typeof(data) === 'object') {
        try {
            data = JSON.stringify(data);
            return socket.write('\0' + data + '\0');
        } catch (e) {
            console.error('Could not stringify object into JSON');
        }
    } else if (typeof(data) === 'function') {
        return socket.send(data.call(socket));
    }
    socket.write(data);
}

function getUnusedIndex(obj, startIndex) {

    var id = startIndex === undefined ? 1 : startIndex;

    while (obj[id]) {
        id += 1;
    }

    return id;

}

function incrementChar(char) {

    var i = sequenceChars.indexOf(char) + 1;

    if (i >= sequenceChars.length) {
        i = 0;
    }

    return sequenceChars[i];

}

function Client(id, socket, handler) {

    var self = this;

    self.id = id;
    self.socket = socket;
    self.handler = handler;

    socket.isClosed = false;

    self.ip = socket.remoteAddress;

    self.seq = '0000';
    self.dropped = {};

    // listen to socket for dropped packet resend
    socket
      .on('dropped', self.droppedReceived.bind(self))
      .on('close', function () {
          self.socket.isClosed = true;
      })
    ;

}

Client.prototype.sequence = function (seq) {

    if (seq < this.seq) {           // Before expected sequence (late packet); Sequence previously queued into dropped
        if (!this.caught(seq)) {    // Sequence already removed from dropped; Otherwise removed from dropped and logged
            return false;
        }
    } else if (seq > this.seq) {    // Past expected sequence (must have dropped)
        while (this.seq < seq) {
            this.skipped(this.seq);
            this.incSequence();
        }
    }

    this.incSequence();

    return true;

};

Client.prototype.incSequence = function () {

    var seqSegments = this.seq.split('')
      , i = seqSegments.length - 1
    ;

    while (true) {

        if (!seqSegments[i]) {
            break;
        }

        seqSegments[i] = incrementChar(seqSegments[i]);

        if (seqSegments[i] !== sequenceChars[0]) {
            break;
        }

        i -= 1;
    }

    this.seq = seqSegments.join('');

};

Client.prototype.skipped = function (seq) {

    var self = this
      , dropped
    ;

    // Sequence already in dropped
    if (self.dropped[seq]) {
        return; // TODO - determine what to do
    }

    dropped = {
        seq: seq
      , timer: setTimeout(function () {
        self.requestDropped(dropped);
      }, dropDelay)
    };

    self.dropped[seq] = dropped;

};

Client.prototype.caught = function (seq) {

    if (this.dropped[seq]) {
        clearTimeout(this.dropped[seq].timer);
        delete this.dropped[seq];
        return true;
    }

    // Sequence was not found in dropped queue
    return false;

};

Client.prototype.requestDropped = function (dropped) {

    if (this.socket.isClosed) {
        return;
    }

    this.socket.send({
        type: 'dropped'
      , seq: dropped.seq
    });

};

Client.prototype.droppedReceived = function (data) {

    if (!data.notFound) {

        data.dropped = true;
        data.timestamp = new Date(Number(data.timestamp));

        // Is still in dropped queue; If not there, assume packet was received late
        if (this.caught(data.sequence)) {
            this.log(data);
        }

    }

};

Client.prototype.log = function (message) {

    message.client = this.ip;
    message.clientId = this.id;

    this.handler.log(message);

};

function tcpData(data) {

    var socket = this
      , message
      , buffer = socket._buffer
      , bLength = buffer.length
    ;

    data = data.toString();

    // Buffered data will be surrounded by NULL bytes

    // Currently buffering or start of a buffer
    if (bLength !== 0 || data.charCodeAt(0) === 0) {
        buffer += data;
        bLength = buffer.length;
    }

    if (bLength !== 0) {
        if (buffer.charCodeAt(bLength - 1) === 0) {     // End of buffer detected
            message = buffer.substring(1, bLength - 1); // Cut out null bytes on either side
            buffer = '';
        }
        socket._buffer = buffer;
    } else { // Non buffering
        message = data;
    }

    // Attempt to convert to JSON
    try {

        message = JSON.parse(message);

        if (message.type !== undefined) {
            return socket.emit(message.type, message);
        }

        // Do something with message without type

    } catch (e) {}

    // do something with non json message
}

function tcpHandshake(data) {

    var socket = this
      , server = socket._server
      , handler
      , client
      , id
    ;

    if (!data.handler) {
        return; // TODO - tell client to send handler data
    }

    handler = server.handlers[data.handler];

    if (!handler) {
        return; // TODO - tell client that handler not set
    }

    id = socket._id = getUnusedIndex(server._clients);

    client = new Client(id, socket, handler);

    server._clients[id] = client;

    socket
      .on('close', tcpClose)
      .send({
          type: 'handshake'
        , clientId: id
      })
    ;
    
    server.emit('handshake', socket, client);

}

function tcpClose() {

    var socket = this
      , server = socket._server;

    // Delay removal for any slow udp packets
    setTimeout(function () {
        server.emit('client-remove', server._clients[socket._id]);
        delete server._clients[socket._id];
    }, removalDelay);
    
    server.emit('socket-close', socket);

}

function tcpError() {

}

function netSocket(socket) {

    var server = this;                  // referring to server instance

    socket.setEncoding('ascii');
    socket.setKeepAlive(true, keepAliveLength);
    socket._buffer = '';
    socket._server = server;

    socket
      .on('error', tcpError)                        // global error handler
      .on('data', tcpData)                          // parse data into events
      .once('handshake', tcpHandshake.bind(socket)) // wait for handshake event
    ;
    
    server.emit('socket-connect', socket);

}

function udpMessage(message, rinfo) {
    
    message = message.toString();

    var server = this                   // referring to server instance
      // [1] - client id || instance name;
      // [2] - sequence;
      // [3] - timestamp;
      // [4] - logger level;
      // [5] - message
      , segments = udpSplitReg.exec(message)
      , sequence
      , client
      , handler
      , data
    ;

    if (segments === null) {
        return server.emit('udp-parse-error', message);
    }

    sequence = segments[2];
    client = server._clients[segments[1]];

    // Construct object to pass through handler
    data = {
        timestamp: new Date(Number(segments[3]))
      , level: segments[4]
      , message: segments[5]
    };

    if (typeof(client = server._clients[segments[1]]) !== 'undefined') { // Client has connected through

        if (!client.sequence(sequence)) { // Skip this sequence
            return;
        }

        return client.log(data);

    } else if (typeof(handler = server.handlers[segments[1]]) !== 'undefined') {

        return handler.log(data);

    }

}

module.exports = function (server, options, callback) {

    var tcp
      , udp
      , firstReady = false
      , returnObj
    ;

    server._clients = {};
    
    if (typeof(options) === 'function') {
        callback = options;
        options = {};
    }

    options = options || {};

    options.port = options.port || defaultPort;
    options.tcpPort = options.tcpPort || options.port;
    options.udpPort = options.udpPort || options.port;

    tcp = net.createServer(netSocket.bind(server));
    tcp.send = netSend;

    udp = dgram.createSocket('udp4');
    udp.on('message', udpMessage.bind(server));
    
    returnObj = {
        tcp: tcp
      , udp: udp
    };
    
    function listenCallback() {
        if (firstReady) {
            return callback(returnObj);
        }
        firstReady = true;
    }

    tcp.listen(options.tcpPort, listenCallback);
    udp.bind(options.udpPort, listenCallback);

    return returnObj;

};
