var net = require('net')
  , dgram = require('dgram')
  , EventEmitter = require('events').EventEmitter
  , util = require('util')
  , fs = require('fs')

  , sequenceChars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('')

  , defaultHost = 'localhost'
  , defaultPort = 41234
  , reconnectTimeStart = 2 * 1000
  , reconnectTimeLimit = 60 * 1000
  , clearPastTime = 5 * 1000
;

function tcpSend(data) {

    var socket = this
      , dataType = typeof(data)
    ;

    if (dataType === 'object') {
        data = JSON.stringify(data);
    } else if (dataType === 'function') {
        return tcpSend.call(socket, data.call(socket));
    }

    data = data.replace(/\r\n/g, '\n');

    data += '\r\n'; // delimiter

    socket.write(new Buffer(data));

}

function tcpRead(buffer) {

    var end, message, temp;

    end = findDelimiter(buffer);

    if (end !== -1) {
        if (this._partial) {
            message = new Buffer(this._partial.length + end);
            this._partial.copy(message);
            buffer.copy(message, this._partial.length, 0, end);
        } else {
            message = buffer.slice(0, end);
        }
        this._partial = null;

        this.emit('buffered-data', message.slice(0, message.length - 2));

        if (end < buffer.length) {
            return tcpRead.call(this, buffer.slice(end));
        }
    } else {
        if (this._partial) {
            temp = new Buffer(this._partial.length + buffer.length);
            this._partial.copy(temp);
            buffer.copy(temp, this._partial.length);
            return this._partial = temp;
        }
        this._partial = buffer;
    }

}

function findDelimiter(buffer) {

    var index = -1
      , i
      , len = buffer.length;

    for (i = 1; i < len; i += 1) {
        if (buffer[i] === 10 && buffer[i - 1] === 13) {
            index = i + 1;
            break;
        }
    }

    return index;

}

function incrementChar(char) {

    var i = sequenceChars.indexOf(char) + 1;

    if (i >= sequenceChars.length) {
        i = 0;
    }

    return sequenceChars[i];

}

function incrementSeq(seq) {

    var seqSegments = seq.split('')
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

    return seqSegments.join('');

}

function clearPastMessages() {

    var client = this
      , latest = client._latest
      , previous = client._previous
      , i
    ;

    if (latest !== previous) {

        while (previous < latest) {
            delete client.messages[previous];
            previous = incrementSeq(previous);
        }

    }

    client._latest = client.seq;
    client._previous = latest;

}

function Client(options) {

    var self = this;

    EventEmitter.call(self);

    self.options = options = options || {};

    options.host = options.host || defaultHost;

    options.port = options.port || defaultPort;
    options.tcpPort = options.tcpPort || options.port;
    options.udpPort = options.udpPort || options.port;

    if (!options.handler) {
        throw new Error('A log handler name must be specified');
    }

    self.id = null;

    self.isConnected = false;
    self.stayClosed = false;

    self.reconnectTimeStart = self.reconnectTimeout = reconnectTimeStart;
    self.reconnectTimeLimit = reconnectTimeLimit;

    self.messages = {};
    self.seq = self._previous = self._latest = '0000';
    self._queue = [];

    // setup fallback file
    if (options.fallbackFile) {
        self.fallback = fs.createWriteStream(options.fallbackFile, {flags: 'a'});
    }

    if (options.callback) {
        self.once('connected', options.callback);
    }

    self.udp = dgram.createSocket('udp4');

    self.tcp = new net.Socket();
    self.tcp.send = tcpSend;
    self.tcp._buffer = '';

    self.tcp
        .on('data', tcpRead)
        .on('buffered-data', self.tcpData)
        .on('connect', self.connected.bind(self))
        .on('close', self.disconnected.bind(self))
        .on('error', self.tcpError.bind(self))
        .on('handshake', self.handshake.bind(self))
        .on('handshakeerror', self.handshakeError.bind(self))
        .on('dropped', self.resend.bind(self));

    self.connect();

    setInterval(clearPastMessages.bind(self), clearPastTime);

}

util.inherits(Client, EventEmitter);

Client.prototype.incSequence = function () {

    this.seq = incrementSeq(this.seq);

};

Client.prototype.tcpData = function (data) {

    var socket = this
    ;

    data = data.toString();

    // Attempt to convert to JSON
    try {

        data = JSON.parse(data);

        if (data.type !== undefined) {
            return socket.emit(data.type, data);
        }

        // Do something with message without type

    } catch (e) {}

    // do something with non json message

};

Client.prototype.connect = function () {

    if (this.isConnected) return;

    this.tcp.connect({
        host: this.options.host
      , port: this.options.tcpPort
    });

};

Client.prototype.connected = function () {

    // Initiate handshake
    this.tcp.send({
        type: 'handshake'
      , handler: this.options.handler
    });

    this.reconnectInterval = 1000 * 2;

};

Client.prototype.disconnected = function () {

    this.isConnected = false;

    if (!this.stayClosed) {
        setTimeout(this.connect.bind(this), this.reconnectInterval);

        this.reconnectInterval *= 2;

        if (this.reconnectInterval > this.reconnectIntervalLimit) {
            this.reconnectInterval = this.reconnectIntervalLimit;
        }
    }

};

Client.prototype.tcpError = function (data) {

};

Client.prototype.handshake = function (data) {

    this.isConnected = true;

    this.id = data.clientId;

    this.emit('connected');

    this.sendFallback();
    // send any stored messages

};

Client.prototype.handshakeError = function (data) {

    this.stayClosed = true;

    console.error('Handshake Error: ' + data.message);

};

Client.prototype.sendFallback = function () {

    var self = this;

    if (!self.options.fallbackFile) {
        return;
    }

    fs.readFile(self.options.fallbackFile, 'ascii', function (err, data) {

        if (!err && data.length > 0) {

            data = data.replace(/^\n+|\n+$/g, '');

            self.batch(data.split('\n').reverse());

        }

        self.fallback.end();
        self.fallback = fs.createWriteStream(self.options.fallbackFile, { flags: 'w' });

    });

};

Client.prototype.writeToFallback = function (line) {

    if (this.fallback) {
        this.fallback.write(line + '\n', 'ascii');
    }

};

Client.prototype.resend = function (data) {

    var msg;

    if (typeof(msg = this.messages[data.seq]) !== 'undefined') {

        this.tcp.send({
            type: 'dropped'
          , seq: data.seq
          , timestamp: msg[0]
          , level: msg[1]
          , message: msg[2]
        });

    } else {

        this.tcp.send({
            type: 'dropped'
          , sequence: data.seq
          , notFound: true
        });

    }

};

Client.prototype.send = function (data) {

    if (this.isConnected) {

        this.messages[this.seq] = data;

        var buf = new Buffer([ this.id, this.seq ].concat(data).join(':'));

        this.udp.send(buf, 0, buf.length, this.options.udpPort, this.options.host, function (err, bytes) {
            if (err) {
                console.error(err);
            }
        });

        this.incSequence();

        this.emit('udp-send', buf);

    } else {

        this.writeToFallback(data.join(':'));

    }

};

Client.prototype.batch = function (arr) {

    this._queue = this._queue.concat(arr);

    this.startQueue();

};

Client.prototype.startQueue = function () {

    if (this._queueRunning) {
        return;
    }

    this.runQueue();

};

Client.prototype.runQueue = function () {

    var item = this._queue.pop();

    if (!item) {
        this._queueRunning = false;
        return;
    }

    this.send(item.split(':'));

    process.nextTick(this.runQueue.bind(this));

};

Client.prototype.log = function (msg, level) {

    this.send([ Date.now(), level, msg ]);

};

var levels = ['emergency', 'alert', 'critical', 'error', 'warn', 'notice', 'info', 'debug'];

levels.forEach(function (level, i) {
    Client.prototype[level] = function () {
        if (this.options.level !== undefined && this.options.level < i) return;
        this.log(util.format.apply(null, arguments), i);
    };
});

module.exports = Client;
