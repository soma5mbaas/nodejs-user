
var Redis = require('./redis');
var MongoDB = require('./mongodb');

var config = require('../config').database.redis;

module.exports = {
    redisPublic: new Redis(config.public),
    redisService: new Redis(config.service),
    mongodb: new MongoDB()
};
