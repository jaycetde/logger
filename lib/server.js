var dgram = require('dgram')
	, net = require('net')
	, EventEmitter = require('events').EventEmitter
	, util = require('util')
	, Handler = require('./handler')
	, ServerClient = require('./serverclient')
	, numericReg = /^[0-9]+$/;

function isNumeric (num) {
	return typeof(num) === 'number' && !isNaN(num) && isFinite(num);
}

function Server(options) {
	
	var self = this;
	
	EventEmitter.call(this);
	
	this.options = options;
	
	this.udpReady = false;
	this.tcpReady = false;
	
	this.clients = {};
	this.handlers = {};
	this.splitReg = /^([0-9]+|[a-z\-_]+)?:([0-9]+)?:([0-9]{13})?:([1-5])?:(.+)$/;
	
	this.udp = dgram.createSocket('udp4');
	this.udp.on('message', this.receive.bind(this));
	
	this.tcp = net.createServer(function (socket) {
		var client
			, handler
			, buffer = '';

		socket.setEncoding('ascii');
		socket.setKeepAlive(true, 1000 * 120);

		// Add send method to socket
		socket.send = function (data) {
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

		// Setup message type handling
		socket.on('data', function dataReceived(data) {

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
					socket.emit(message.type, message);
				} // do something with message without type

			} catch (e) {}

			// do something with non json message

		});

		socket.once('handshake', function (data) {
			
			console.log('-- Handshake --');

			if (data.handler && (handler = self.handlers[data.handler])) {

				// Authentication

				client = new ServerClient(self.getCleanId(), socket, handler);

				console.log('New client: ' + client.id);

				self.clients[client.id] = client;

				socket.send({
						type: 'handshake'
					,	client: client.id
					, config: handler.config()
				});

				socket.on('close', function () {
					console.log('-- Socket Ended --');
					setTimeout(function () {
						console.log('-- Removing Client --');
						delete self.clients[client.id];
					}, 1000 * 5);
				});

			} else {
				// handler not valid
				console.error('Invalid Handler Identifier: ' + data.handler);
				
				socket.send({
						type: 'handshakeerror'
					, message: 'Invalid handler'
				});
				
				socket.end();
			}

		});
	});
	
	this.udp.on('listening', function () {
		self.udpReady = true;
		self.ready();
	});
	
	this.tcp.on('listening', function () {
		self.tcpReady = true;
		self.ready();
	});
	
	this.udp.bind(options.port);
	this.tcp.listen(options.port);
	
}

util.inherits(Server, EventEmitter);

Server.prototype.createHandler = function (name, options) {
	if (this.handlers[name]) {
		throw new Error('There is already a handler named "' + name + '"');
	}
	
	return this.handlers[name] = new Handler(options);
};

Server.prototype.ready = function () {
	if (this.udpReady && this.tcpReady) {
		this.emit('ready');
	}
};

Server.prototype.receive = function (msg, rinfo) {
	var segments = this.splitReg.exec(msg.toString()) // [1] - client id || instance name; [2] - sequence inc; [3] - timestamp; [4] - logger level (optional); [5] - message
		, client
		, handler
		, data;

	if (segments === null) {
		console.log(msg.toString());
		return console.log('bad regex');
	}

	// Construct object to pass through handler
	data = {
			sequence: Number(segments[2])
		, timestamp: new Date(Number(segments[3]))
		, level: segments[4]
		, message: segments[5]
	};

	if (numericReg.test(segments[1]) && typeof(client = this.clients[segments[1]])) { // Client has connected through TCP

		// Verify remoteInfo against client info

		// Verify sequence id
		if (isNumeric(data.sequence)) {

			if (data.sequence < client.seq) { // Packet previously queued into dropped
				if (!client.caught(data.sequence)) { // Packet has already been removed from dropped
					return; // Don't do anything
				}
			} else if (data.sequence > client.seq) { // Past expected packet (must have dropped 1 or more)
				while (client.seq < data.sequence) { // Queue missed packets as dropped
					client.skipped(client.seq);
					client.seq += 1;
				}
			}

			client.seq += 1; // Next packet is expected to increment

			if (client.seq >= 100000) {
				client.seq = 0;
			}

		}

		// Pass object to handler
		client.log(data);

	} else if (typeof(handler = this.handlers[segment[1]]) !== 'undefined') {
		
		handler.log(data);
		
	} else {
		console.error('UDP - No handler found');
	}
};

Server.prototype.getCleanId = function () {
	var id = 100;
	while (this.clients[id]) {
		id += 1;
	}
	return id;
};

module.exports = Server;