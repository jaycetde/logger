'use strict';

var net = require('net')
	, dgram = require('dgram')
	, client = dgram.createSocket('udp4')
	, netClient;

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

netClient = net.connect({port: 41234}, function () {

	netClient.send({
			type: 'handshake'
		, handler: 'second'
	});

});

var buffer = '';

netClient.on('data', function dataReceived(data) {

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
			netClient.emit(message.type, message);
		} // do something with message without type

	} catch (e) {}

	// do something with non json message

});

var clientId;

netClient.on('handshake', function (data) {

	clientId = data.client;

	setInterval(sendUDP, 2000);

});

netClient.on('resend', function (data) {

	netClient.send({
		  type: 'dropped'
		, seq: data.seq
		, message: 'fuck you!'
	});

});

var seq = 0;

var level = 1;

var messages = {};

function sendUDP() {

	if (seq === 3) {
		seq += 1;
		return;
	}

	var message = new Buffer(clientId + ':' + seq + ':' + level + ':' + 'hello world');

	messages[seq] = message;

	client.send(message, 0, message.length, 41234, 'localhost', function (err, bytes) {
		console.log(err);
		console.log(bytes);
	});

	seq += 1;
	level += 1;

	if (level >= 6) {
		level = 1;
	}

}