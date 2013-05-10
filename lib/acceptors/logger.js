'use strict';

var net = require('net')
  , dgram = require('dgram')

  , udp = dgram.createSocket('udp4')
  , tcp

  , server
  , clients = {}

  , sequenceChars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('')
  , udpSplitReg = /^([0-9]+|[a-z\-_]+)?:([0-9a-zA-Z]+)?:([0-9]{13})?:([0-7])?:(.+)$/
  , defaultPort = 41234
  , dropDelay = 3 * 1000
  , removalDelay = 5 * 1000
  , keepAliveLength = 2 * 60 * 1000
;

// Modify some prototypes
net.Socket.prototype.send = function (data) {
    if (typeof(data) === 'string' || data instanceof Buffer) {
        return this.write('\0' + data + '\0');
    } else if (typeof(data) === 'object') {
        try {
            data = JSON.stringify(data);
            return this.write('\0' + data + '\0');
        } catch (e) {
            console.error('Could not stringify object into JSON');
        }
    } else if (typeof(data) === 'function') {
        return this.send(data.call(this));
    }
    this.write(data);
};

function genId() {
    var id = 1;

    while (clients[id]) {
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

    self.socket.isClosed = false;

    self.ip = this.socket.remoteAddress;

    self.seq = '0000';
    self.dropped = {};

    // listen to socket for dropped packet resend
    self.socket.on('dropped', self.droppedReceived.bind(self));
    self.socket.on('close', function () {
        self.socket.isClosed = true;
    });
    self.socket.on('error', function (err) {
        //console.error(err);
    });

}

Client.prototype.sequence = function (seq) {

    if (seq < this.seq) {               // Before expected sequence (late packet); Sequence previously queued into dropped
        if (!this.caught(seq)) {        // Sequence already removed from dropped; Otherwise removed from dropped and logged
            return false;
        }
    } else if (seq > this.seq) {        // Past expected sequence (must have dropped)
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
      , dropped = {}
    ;

    if (self.dropped[seq]) { // Sequence already in dropped
        return; // TODO determine what to do
    }

    dropped.seq = seq;
    dropped.timer = setTimeout(function () {
        self.requestDropped(dropped);
    }, dropDelay);

    self.dropped[seq] = dropped;

};

Client.prototype.caught = function (seq) {

    var self = this;

    if (self.dropped[seq]) {
        clearTimeout(self.dropped[seq].timer);
        delete self.dropped[seq];
        return true;
    } else {
        return false; // Sequence was not found in dropped queue
    }

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

    var self = this;

    if (!data.notFound) {

        data.dropped = true;
        data.timestamp = new Date(Number(data.timestamp));

        if (isNumeric.test(data.sequence)) {

            if (this.caught(data.sequence)) { // Is still in dropped queue; If not there, assume packet was received late
                this.log(data);
            }

        }

    }

};

Client.prototype.log = function (message) {

    message.client = this.ip;
    message.clientId = this.id;

    this.handler.log(message);

};

udp.on('message', function (data, rinfo) {

    var segments = udpSplitReg.exec(data.toString()) // [1] - client id || instance name; [2] - sequence inc; [3] - timestamp; [4] - logger level (optional); [5] - message
      , sequence
      , client
      , handler
      , data
    ;

    if (segments === null) {
        console.log(data.toString());
        return console.log('bad regex');
    }

    sequence = segments[2];
    client = clients[segments[1]];

    // Construct object to pass through handler
    data = {
        timestamp: new Date(Number(segments[3]))
      , level: segments[4]
      , message: segments[5]
    };

    if (typeof(client = clients[segments[1]]) !== 'undefined') { // Client has connected through

        if (!client.sequence(sequence)) { // Skip this sequence
            return;
        }

        return client.log(data);

    } else if (typeof(handler = server.handlers[segment[1]]) !== 'undefined') {

        return handler.log(data);

    }

    // unhandled

});

function tcpData(data) {

    var message;

    data = data.toString();

    // Buffered data will be surrounded by NULL bytes

    if (this._buffer.length !== 0 || data.charCodeAt(0) === 0) { // Currently buffering || Start of a buffer
        this._buffer += data;
    }

    if (this._buffer.length !== 0) {
        if (this._buffer.charCodeAt(this._buffer.length - 1) === 0) { // End of buffer detected
            message = this._buffer.substring(1, this._buffer.length -1);
            this._buffer = '';
        }
    } else { // Non buffering
        message = data;
    }

    // Attempt to convert to JSON

    try {

        message = JSON.parse(message);

        if (typeof(message.type) !== 'undefined') {
            this.emit(message.type, message);
        } // do something with message without type

    } catch (e) {}

    // do something with non json message
}

function tcpHandshake(data) {

    console.log('--handshake--');

    var handler, client;

    if (data.handler && (handler = server.handlers[data.handler])) {

        // Authentication
        var id = this._id = genId();

        client = new Client(id, this, handler);

        clients[id] = client;

        this.send({
            type: 'handshake'
          , clientId: id
        });

        this.on('close', tcpClose);

    } else {
        // handler not valid
        console.error('Invalid Handler Identifier');
    }

}

function tcpClose() {
    var self = this;
    console.log('--close--');
    // Delay removal for any slow udp packets
    setTimeout(function () {
        console.log('--remove--');
        delete clients[self._id];
    }, removalDelay);
}

tcp = net.createServer(function (socket) {

    socket.setEncoding('ascii');
    socket.setKeepAlive(true, keepAliveLength);
    socket._buffer = '';

    socket
        .on('error', function (err) {  })
        .on('data', tcpData)
        .once('handshake', tcpHandshake)
    ;

});

module.exports = function (srvr, options) {

    if (server) {
        throw 'Server is already set';
    }

    server = srvr;

    options = options || {};

    options.port = options.port || defaultPort;
    options.tcpPort = options.tcpPort || options.port;
    options.udpPort = options.udpPort || options.port;

    tcp.listen(options.tcpPort, function () { console.log('tcp listening ' + tcp.address().port); });
    udp.bind(options.udpPort, function () { console.log('udp listening ' + udp.address().port); });

    return {
        tcp: tcp
      , udp: udp
    };

};
