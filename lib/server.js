var EventEmitter = require('events').EventEmitter
  , util = require('util')
  , Handler = require('./handler')
;

function Server() {

    EventEmitter.call(this);

    this.handlers = {};
    this.disabled = {};

}

util.inherits(Server, EventEmitter);

Server.prototype.createHandler = function (id) {

    if (this.handlers[id]) {
        throw 'There is already a handler with the id "' + id + '"';
    }

    var handler = new Handler();

    this.emit('createHandler', id, handler);

    return this.handlers[id] = handler;

};

Server.prototype.removeHandler = function (id) {

    this.emit('removeHandler', id, this.handlers[id]);

    delete this.handlers[id];

};

Server.prototype.disableHandler = function (id) {

    if (!this.handlers[id]) {
        return false;
    }

    this.disabled[id] = this.handlers[id];

    delete this.handlers[id];

    this.emit('disable', id, this.disabled[id]);

    return true;

};

Server.prototype.enableHandler = function (id) {

    if (this.handlers[id]) {
        return false;
    }

    if (!this.disabled[id]) {
        throw "Handler not created";
    }

    this.handlers[id] = this.disabled[id];

    delete this.disabled[id];

    this.emit('enable', id, this.handlers[id]);

    return true;

};

Server.prototype.log = function (data) {

    data.timestamp = data.timestamp || new Date();

    if (!data.handler || !this.handlers[data.handler]) {

        this.emit('unhandled', data);

        return false;
    }

    this.handlers[data.handler].log(data);

};

module.exports = Server;
