var net = require('net')
  , dgram = require('dgram')
  , EventEmitter = require('events').EventEmitter
  , util = require('util')
  , fs = require('fs')

  , sequenceChars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('')

  , defaultHost = 'localhost'
  , defaultPort = 41234
;

// Setup Socket prototype
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
};

function incrementChar(char) {

    var i = sequenceChars.indexOf(char) + 1;

    if (i >= sequenceChars.length) {
        i = 0;
    }

    return sequenceChars[i];

}

function Client(options) {

    var self = this;

    EventEmitter.call(this);

    this.options = options || {};

    this.options.host = this.options.host || defaultHost;

    this.options.port = this.options.port || defaultPort;
    this.options.tcpPort = this.options.tcpPort || this.options.port;
    this.options.udpPort = this.options.udpPort || this.options.port;

    if (!this.options.handler) {
        throw new Error('A log handler name must be specified');
    }

    this.id = null;

    this.isConnected = false;
    this.reconnectTimeStart = 1000 * 2;
    this.reconnectTimeout = this.reconnectTimeStart;
    this.reconnectTimeLimit = 1000 * 60;
    this.stayClosed = false;

    this.messages = {};
    this.seq = '0000';

    // setup fallback file
    if (options.fallback) {
        this.fallback = fs.createWriteStream(options.fallback, {flags: 'a'});
    }

    if (options.callback) {
        this.once('connected', options.callback);
    }

    this.udp = dgram.createSocket('udp4');

    this.tcp = new net.Socket();
    this.tcp.buffer = '';

//    var previous = 0
//      , latest = 0
//    ;
//
//    setInterval(function () { // Clear out cache after resend should be received
//
//        var i;
//
//        if (latest !== previous) { // Messages have been written
//
//            i = previous;
//
//            if (latest < i) { // Assume sequence has rolled over
//
//                /* if (!self.isConnected && self.options.stream) { // Write messages to backup stream if available
//                    self.options.stream.write(self.messages.slice(i, self.messages.length).join('\n') + '\n', 'ascii');
//                } */
//
//                while (i < self.messages.length) { // Remove values til sequence limit
//                    delete self.messages[i];
//                    i += 1;
//                }
//
//                i = 0; // Reset i to start of sequence
//
//            }
//
//            /* if (!self.isConnected && self.options.stream) { // Write messages to backup stream if available
//                self.options.stream.write(self.messages.slice(i, latest).join('\n') + '\n', 'ascii');
//            } */
//
//            while (i < latest) { // Remove values til sequence hit 5 seconds ago
//                delete self.messages[i];
//                i += 1;
//            }
//
//        }
//
//        previous = latest;
//        latest = self.seq;
//
//    }, 1000 * 5);

    this.tcp
        .on('data', this.tcpData)
        .on('connect', this.connected.bind(this))
        .on('close', this.disconnected.bind(this))
        .on('error', this.tcpError.bind(this))
        .on('handshake', this.handshake.bind(this))
        .on('handshakeerror', this.handshakeError.bind(this))
        .on('dropped', this.resend.bind(this));

    this.connect();

}

util.inherits(Client, EventEmitter);

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

Client.prototype.tcpData = function (data) {

    var message;

    data = data.toString();

    // Buffered data will be surrounded by NULL bytes

    if (this.buffer.length !== 0 || data.charCodeAt(0) === 0) { // Currently buffering || Start of a buffer
        this.buffer += data;
    }

    if (this.buffer.length !== 0) {
        if (this.buffer.charCodeAt(this.buffer.length - 1) === 0) { // End of buffer detected
            message = this.buffer.substring(1, this.buffer.length -1);
            this.buffer = '';
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

    this.reconnectInterval = 1000 * 2

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

    if (this.options.fallback) {
        fs.readFile(this.options.fallback, 'ascii', function (err, data) {
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
    }

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
