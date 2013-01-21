var net = require('net')
	, dgram = require('dgram')
	, EventEmitter = require('events').EventEmitter
	, util = require('util')
	, fs = require('fs');

var defaultOptions = {
		host: 'localhost'
	, port: 41234
};

function Client(options) {
	
	var self = this;
	
	EventEmitter.call(this);
	
	this.options = options || {};
	
	// add default values to options
	for (var prop in defaultOptions) {
		if (typeof(options[prop]) === 'undefined') {
			options[prop] = defaultOptions[prop];
		}
	}
	
	if (!options.handler) {
		throw new Error('A log handler name must be specified');
	}
	
	this.id = null;
	
	this.isConnected = false;
	this.reconnectInterval = 1000 * 2;
	this.reconnectIntervalLimit = 1000 * 60;
	
	this.messages = new Array(100000);
	this.seq = 0;
	
	// setup fallback file
	if (options.fallback) {
		this.fallback = fs.createWriteStream()
	}
	
	this.udp = dgram.createSocket('udp4');
	this.tcp = new net.Socket();

	// add custom JSON method send
	this.tcp.send = function (data) {
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

	var buffer = '';
	
	this.tcp.on('data', function dataReceived(data) {

		data = data.toString();

		var message;

		// Buffered data will be surrounded by NULL bytes

		if (buffer.length !== 0 || data.charCodeAt(0) === 0) { // Currently buffering || Start of a buffer
			buffer += data;
		}

		if (buffer.length !== 0) {
			if (buffer.charCodeAt(buffer.length - 1) === 0) { // End of buffer detected
				message = buffer.substring(1, buffer.length -1);
				buffer = '';
			}
		} else { // Non buffering
			message = data;
		}

		// Attempt to convert to JSON

		try {

			message = JSON.parse(message);

			if (typeof(message.type) !== 'undefined') {
				self.tcp.emit(message.type, message);
			} // do something with message without type

		} catch (e) {}

		// do something with non json message

	});
	
	var previous = 0
		, latest = 0;

	setInterval(function () {

		var i;

		if (latest !== previous) { // Messages have been written

			i = previous;

			if (latest < i) { // Assume sequence has rolled over

				if (!self.isConnected && self.options.stream) { // Write messages to backup stream if available
					self.options.stream.write(self.messages.slice(i, self.messages.length).join('\n') + '\n', 'ascii');
				}

				while (i < self.messages.length) { // Remove values til sequence limit
					delete self.messages[i];
					i += 1;
				}

				i = 0; // Reset i to start of sequence

			}

			if (!self.isConnected && self.options.stream) { // Write messages to backup stream if available
				self.options.stream.write(self.messages.slice(i, latest).join('\n') + '\n', 'ascii');
			}

			while (i < latest) { // Remove values til sequence hit 5 seconds ago
				delete self.messages[i];
				i += 1;
			}

		}

		previous = latest;
		latest = self.seq;

	}, 1000 * 5);
	
	this.tcp
		.on('connect', this.connected.bind(this))
		.on('close', this.disconnected.bind(this))
		.on('error', this.tcpError.bind(this))
		.on('handshake', this.handshake.bind(this))
		.on('resend', this.resend.bind(this));

	process.on('exit', function () {

		if (!client.isConnected) {

		}

	});
	
	this.connect();
	
}

util.inherits(Client, EventEmitter);

Client.prototype.connect = function () {
	if (this.isConnected) return;
	this.tcp.connect({
			host: this.options.host
		, port: this.options.port
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

	setTimeout(this.connect.bind(this), this.reconnectInterval);

	this.reconnectInterval *= 2;

	if (this.reconnectInterval > this.reconnectIntervalLimit) {
		this.reconnectInterval = this.reconnectIntervalLimit;
	}
	
};

Client.prototype.tcpError = function () {

};

Client.prototype.handshake = function (data) {

	this.isConnected = true;
	
	this.id = data.client;
	this.seq = 0;
	
	this.emit('connected');
	
	this.sendFallback();
	// send any stored messages
	
};

Client.prototype.sendFallback = function () {
	
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
		
		this.udp.send(buf, 0, buf.length, this.options.port, this.options.host, function (err, bytes) {
			if (err) {
				console.error(err);
			}
		});

		this.seq += 1;

		if (this.seq >= this.messages.length) {
			this.seq = 0;
		}
		
	} else {
		
		// write to fallback
		
	}
	
};

Client.prototype.log = function (msg, level) {
	
	this.send([ Date.now(), level, msg ]);
	
};

Client.prototype.debug = function () {
	if (this.options.level > 1) return;
	return this.log(util.format.apply(null, arguments), 1);
};

Client.prototype.info = function () {
	if (this.options.level > 2) return;
	return this.log(util.format.apply(null, arguments), 2);
};

Client.prototype.warn = function () {
	if (this.options.level > 3)return;
	return this.log(util.format.apply(null, arguments), 3);
};

Client.prototype.error = function () {
	if (this.options.level > 4) return;
	return this.log(util.format.apply(null, arguments), 4);
};

Client.prototype.fatal = function () {
	if (this.options.level > 5) return;
	return this.log(util.format.apply(null, arguments), 5);
};

module.exports = Client;