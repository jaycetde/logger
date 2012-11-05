'use strict';

var debug = require('debug')('index')
	, net = require('net')
	, dgram = require('dgram')
	, dgramServer
	, netServer
	, messageReg = /^([0-9]+|[a-z\-_]+):([0-9]+)?:([0-9]{13})?:([1-5])?:(.+)$/
	, isNumeric = /^[0-9]+$/
	, clients = {}
	, handlers = {};

exports.Client = require('./lib/client');
exports.Handler = require('./lib/handler');
exports.console = require('./lib/middleware/console');
exports.fileWriter = require('./lib/middleware/fileWriter');
exports.extractor = require('./lib/middleware/extractor');

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

dgramServer = dgram.createSocket('udp4');

netServer = net.createServer(function netConnection(socket) {

	var client
		, handler
		, buffer = '';

	socket.setEncoding('ascii');
	socket.setKeepAlive(true, 1000 * 120);

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

		debug('Handshake received');

		if (data.handler && (handler = handlers[data.handler])) {

			// Authentication

			client = new exports.Client(generateId(), socket, handler);

			debug('New client: ' + client.id);

			clients[client.id] = client;

			socket.send({
					type: 'handshake'
				,	client: client.id
				, config: handler.config()
			});

			socket.on('close', function () {
				debug('-- Socket Ended --');
				setTimeout(function () {
					debug('-- Removing Client --');
					delete clients[client.id];
				}, 1000 * 5);
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

	var segments = messageReg.exec(msg.toString()) // [1] - client id || instance name; [2] - sequence inc; [3] - timestamp; [4] - logger level (optional); [5] - message
		, client
		, message;

	if (segments === null) {
		return console.log('bad regex');
	}

	// Construct object to pass through handler
	message = {
		  sequence: segments[2]
		, timestamp: new Date(Number(segments[3]))
		, level: segments[4]
		, message: segments[5]
	};

	if (isNumeric.test(segments[1]) && typeof(clients[segments[1]]) !== 'undefined') { // Client has connected through TCP

		client = clients[segments[1]];

		// Verify remoteInfo against client info

		// Verify sequence id
		if (isNumeric.test(message.sequence)) {

			message.sequence = Number(message.sequence);

			if (message.sequence < client.seq) { // Packet previously queued into dropped
				if (!client.caught(message.sequence)) { // Packet has already been removed from dropped
					return; // Don't do anything
				}
			} else if (message.sequence > client.seq) { // Past expected packet (must have dropped 1 or more)
				while (client.seq < message.sequence) { // Queue missed packets as dropped
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
		client.log(message);

	} else if (typeof(handlers[segments[1]]) !== 'undefined') {
		debug('named instance');
		//clients[segments[i]].log(rinfo.address, segments[2], segments[5], segments[4]);
	} else {
		debug('unhandled udp');
	}

}

netServer.on('listening', function () {
	var address = netServer.address();
	debug('Listening: TCP ' + address.port);
});

dgramServer.on('listening', function ready() {
	var address = dgramServer.address();
	debug('Listening: UDP ' + address.port);
});

dgramServer.on('message', receivedMessage);

exports.listen = function (port) {

	netServer.listen(port)
	dgramServer.bind(port);

};

exports.setHandler = function (handler) {

	if (handler instanceof exports.Handler) {
		handlers[handler.id] = handler;
	}

};