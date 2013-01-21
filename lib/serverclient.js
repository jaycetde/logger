'use strict';

var debug = require('debug')('lib/client')
	, messageReg = /^([0-9]+|[a-z\-_]+):([0-9]+)?:([0-9]{13})?:([1-5])?:(.+)$/
	, isNumeric = /^[0-9]+$/;

function Client(id, socket, handler) {

	var self = this;

	self.id = id;
	self.socket = socket;
	self.handler = handler;

	self.socket.isClosed = false;

	self.ip = this.socket.remoteAddress;

	self.seq = 0;
	self.dropped = {};

	// listen to socket for dropped packet resend
	self.socket.on('dropped', self.droppedReceived.bind(self));
	self.socket.on('close', function () {
		self.socket.isClosed = true;
	});
	self.socket.on('error', function (err) {
		debug(err);
	});

}

Client.prototype.skipped = function (seq) {

	var self = this
		, dropped = {};

	if (self.dropped[seq]) { // Sequence already in dropped
		return; // TODO determine what to do
	}

	dropped.seq = seq;
	dropped.timer = setTimeout(function () {
		self.requestDropped(dropped);
	}, 1000 * 3);

	self.dropped[seq] = dropped;

	debug('-- Detected Dropped --');

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

	var self = this;

	if (self.socket.isClosed) {
		return;
	}

	self.socket.send({
			type: 'resend'
		, seq: dropped.seq
	});

	debug('-- Requesting Dropped --');

};

Client.prototype.droppedReceived = function (data) {

	var self = this;
	
	if (!data.notFound) {
		
		data.dropped = true;
		data.timestamp = new Date(Number(data.timestamp));
		
		if (isNumeric.test(data.sequence)) {
			
			data.sequence = Number(data.sequence);
			
			if (this.caught(data.sequence)) { // Is still in dropped queue; If no message, assume message was cleared from memory
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

module.exports = Client;