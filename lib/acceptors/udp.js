'use strict';

var dgram = require('dgram')
  , defaultPort = 8989
;

function defaultParse(message, rinfo) {
    return {
        message: message
      , rinfo: rinfo
    };
}

module.exports = function (server, options) {
    
    var udp = options.udp || dgram.createSocket('udp4');
    
    options = options || {};
    
    options.port = options.port || defaultPort;
    
    udp.on('message', function (message, rinfo) {
        
        var data = options.parse(message, rinfo);
        
        if (options.handler) {
            data.handler = options.handler;
            return server.log(data);
        }
        
        server.all(data);
        
    });
    
    udp.bind(options.port, options.address);
    
};