'use strict';

var net = require('net')
	, dgram = require('dgram')
	, util = require('util')
	, Client = require('./lib/client.js')
	, Instance = require('./lib/handler.js')
	, EventEmitter = require('events').EventEmitter
	, dgramServer = dgram.createSocket('udp4')
	, netServer
	, messageReg = /^([0-9]+|[a-z\-]+):([0-9]+):(([0-5]):)?(.+)$/
	, isNumeric = /^[0-9]+$/;

// Modify net.Socket prototype to add custom JSON methods
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

function generateId() {
	var id = 100;
	while (clients[id]) {
		id += 1;
	}
	return id;
}



netServer = net.createServer(function netConnection(socket) {

	var client
		, instance
		, buffer = '';

	socket.setEncoding('utf8');
	socket.setKeepAlive(true, 1000 * 120);

	socket.on('data', function dataReceived(data) {

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

		if (data.instance && (instance = instances[data.instance])) {

			// Authentication

			client = new Client(generateId(), socket, instance);

			clients[client.id] = client;

			socket.send({
					client: client.id
				, config: instance.config()
			});

		}

		// config and assign to instance

		/*if (typeof(data.instance) !== 'undefined' &&
				typeof(instances[data.instance]) !== 'undefined') {
			instances[data.instance].connect(socket, data);
		} else {
			// close the client
			socket.send('error', {error: 'Instance could not be found'});
			socket.end();
		}*/

	});

});

function receivedMessage(msg, rinfo) {

	var segments = messageReg.exec(msg.toString()) // [1] - client id || instance name; [2] - sequence inc; [4] - logger level (optional); [5] - message
		, client
		, seq = Number(segments[2])
		, message;

	if (isNumeric.test(segments[1]) && typeof(clients[segments[1]]) !== 'undefined') { // Client has connected through TCP

		client = clients[segments[1]];

		// Verify remoteInfo against client info

		// Verify sequence id

		if (seq < client.seq) { // Packet previously queued into dropped
			if (!client.caught(seq)) { // Packet has already been removed from dropped
				return; // Don't do anything
			}
		} else if (seq > client.seq) { // Past expected packet (must have dropped 1 or more)
			while (client.seq < seq) { // Queue missed packets as dropped
				client.skipped(client.seq);
				client.seq += 1;
			}
		}

		client.seq += 1; // Next packet is expected to increment

		// Construct object to pass through handler
		message = {
			  sequence: seq
			, message: segments[5]
		};

		if (segments[4]) {
			message.level = segments[4];
		}

		// Pass object to handler
		client.log(message);

	} else if (typeof(instances[segments[1]]) !== 'undefined') {
		console.log('named instance');
		//clients[segments[i]].log(rinfo.address, segments[2], segments[5], segments[4]);
	} else {
		console.log('unhandled udp');
	}

}



dgramServer.on('message', receivedMessage);

dgramServer.on('listening', function ready() {
	var address = dgramServer.address();
	console.log('Listening: UDP ' + address.port);
});

dgramServer.bind(41234);

netServer.listen(41234, function () {
	var address = netServer.address();
	console.log('Listening: TCP ' + address.port);
});

exports.addInstance = function (name, instance) {

};

function Interface() {
	EventEmitter.call(this);
	this.clients = {};
	this.stack = [];
	this.dropped = {};
}

util.inherits(Interface, EventEmitter);

Interface.prototype.use = function (fn) {
	if (typeof(fn) === 'Function') {
		this.stack.push(fn);
	}
};

Interface.prototype.runStack = function () {
	var self = this
		, args = Array.prototype.splice.call(arguments, 0)
		, callback = args.pop()
		, applyArgs = args.concat([next])
		, l = self.stack.length
		, i = 0;

	function next(err) {

		if (err || i >= l) {
			return callback.apply(self, [err].concat(args));
		}

		return self.stack[i++].apply(self, applyArgs);

	}

	self.stack[i++].apply(self, applyArgs);

};

Interface.prototype.connect = function (socket, handshakeData) {

	var client = {
			id: generateId()
		,	socket: socket
		, name: handshakeData.client
		, inc: 0
	};

	this.clients[client.id] = client;

	this.emit('register', client.id);

	socket.send('config', {
			clientId: client.id
	});

};

Interface.prototype.log = function (clientId, seq, message, level) {

	var client = this.clients[clientId];

	if (!client) {
		return console.log('bad client id');
	}

	if (seq < client.inc) { // Previously missed packet
		if (!this.found(seq)) {
			return;
		}
	} else if (seq > client.inc) { // Past expected packet (must have dropped 1 or more)
		// add all missed packets to queue while client.inc <= seq - queue(client.inc += 1)
		while (client.inc < seq) {
			this.lost(client.inc);
			client.inc += 1;
		}
	}

	client.inc += 1;

	this.runStack({message: message});

};