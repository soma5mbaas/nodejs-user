'use strict';

var redis = require('redis');

var client = redis.createClient(6402, 'stage.haru.io');
var pubsub = redis.createClient(6402, 'stage.haru.io');

pubsub.psubscribe('*');

pubsub.on('pmessage', function(pattern, channel, message) {
    console.info('---------------------');
    console.info(pattern);
    console.info(channel);
    console.info(message);
    console.info(data);
    console.info('---------------------');
    console.log();

});


