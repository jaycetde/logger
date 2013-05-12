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

    self.options = options || {};

    self.options.host = self.options.host || defaultHost;

    self.options.port = self.options.port || defaultPort;
    self.options.tcpPort = self.options.tcpPort || self.options.port;
    self.options.udpPort = self.options.udpPort || self.options.port;

    if (!self.options.handler) {
        throw new Error('A log handler name must be specified');
    }

    self.id = null;

    self.isConnected = false;
    self.stayClosed = false;
    
    self.reconnectTimeStart = self.reconnectTimeout = reconnectTimeStart;
    self.reconnectTimeLimit = reconnectTimeLimit;

    self.messages = {};
    self.seq = self._previous = self._latest = '0000';

    // setup fallback file
    if (options.fallback) {
        self.fallback = fs.createWriteStream(options.fallback, {flags: 'a'});
    }

    if (options.callback) {
        self.once('connected', options.callback);
    }

    self.udp = dgram.createSocket('udp4');

    self.tcp = new net.Socket();
    self.tcp._buffer = '';

    self.tcp
        .on('data', self.tcpData)
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
    this.seq = '0000';

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
    
    if (!self.options.fallback) {
        return;
    }

    fs.readFile(self.options.fallback, 'ascii', function (err, data) {
        
        if (!err && data.length > 0) {

            data = data.replace(/^\n+|\n+$/g, '');

            var lines = data.split('\n');

            for (var i = 0, l = lines.length; i < l; i += 1)(function (line) {

                var segs = line.split(':');

                process.nextTick(function () { // potential to overload server or clearout cache before server can refetch
                    self.send(segs);
                });

            })(lines[i]);

        }

        self.fallback.end();
        self.fallback = fs.createWriteStream(self.options.fallback, { flags: 'w' });

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
