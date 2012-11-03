'use strict';

function Client(id, socket, instance) {

	var self = this;

	self.id = id;
	self.socket = socket;
	self.instance = instance;

	self.ip = this.socket.remoteAddress;

	self.seq = 0;
	self.dropped = {};

	// listen to socket for dropped packet resend
	self.socket.on('dropped', self.droppedReceived.bind(self));

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
	}, 1000 * 5);

	self.dropped[seq] = dropped;
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

	self.socket.send({
			type: 'resend'
		, seq: dropped.seq
	});

};

Client.prototype.droppedReceived = function (data) {

	var self = this;

	if (data.seq && self.caught(data.seq)) { // Is still in dropped queue
		self.log(data);
	}

};

Client.prototype.log = function (message) {

	message.client = this.ip;
	message.clientId = this.id;

	this.instance.log(message);

};

module.exports = Client;