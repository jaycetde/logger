'use strict';

var net = require('net')
	, dgram = require('dgram')
	, client = dgram.createSocket('udp4')
	, netClient;

function receivedMessage(msg, rinfo) {

	// interpret type of message

	console.log(msg);
	console.log(rinfo);

}

//client.on('message', receivedMessage);

var message = new Buffer('some info');

netClient = net.connect({port: 41234}, function () {
	console.log('netConnected');
	client.end();
});

client.send(message, 0, message.length, 41234, 'localhost', function (err, bytes) {
	console.log(err);
	console.log(bytes);
	client.close();
});