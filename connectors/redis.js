var redis = require('redis');
var async = require('async');
var _ = require('underscore');


var keys = require('haru-nodejs-util').keys;

var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

var MAX_SLAVE_COUNTER = 100000000;

module.exports = Redis;

function Redis(config) {
	this.slaveConnectors = [];
	this.slaveCounter = 0;

	this.connect(config);
};

inherits(Redis, EventEmitter);

Redis.prototype.connect = function(config) {
	var self = this;

    self.connection = { };


    var redisConfig = config;
    self.connection = [];

    redisConfig.forEach(function(redisGroup) {
        var config = redisGroup.master;
        var group = {
            master: {},
            slaves: []
        };

        // master
        group.master = _addEventListener(redis.createClient(config.port, config.host), config, 'master');

        //slaves
        redisGroup.slaves.forEach(function(slave) {
            group.slaves.push( _addEventListener(redis.createClient(slave.port, slave.host), slave, 'slave' ) );
        });

        // add redis shard group
        self.connection.push(group);
    });
};

Redis.prototype.hget = function(key, field, callback) {
	var self = this;

	var conn = self.getConnection('read');

	conn.select(0);
	conn.hget(key, field, callback);
};

Redis.prototype.hset = function(key, field, value, callback) {
    var self = this;

    var conn = self.getConnection('write');

    conn.select(0);
    conn.hset(key, field, value, callback);
};

Redis.prototype.sadd = function(key, value, callback) {
    var self = this;

    var conn = self.getConnection('write');

    conn.select(0);
    conn.sadd(key, value, callback);
};

Redis.prototype.hvals = function( key, callback ) {
	var self = this;

	var conn = self.getConnection('read');

	conn.select(0);
	conn.hvals(key, callback);
};

Redis.prototype.hgetall = function( key, callback ) {
	var self = this;

	var conn = self.getConnection('read');
    
	conn.select(0);
	conn.hgetall(key, callback);
};

Redis.prototype.zrange = function( key, start, end, callback ) {
	var self = this;

	var conn = self.getConnection('read');

	conn.select(0);
	conn.zrange(key, start, end, callback);
};

Redis.prototype.zadd = function(key, score, member, callback) {
    var self = this;

    var conn = self.getConnection('write');

    conn.select(0);
    conn.zadd(key, score, member, callback);
};

Redis.prototype.smembers = function( key, callback ) {
	var self = this;
	var conn = self.getConnection('read');

	conn.select(0);

	conn.smembers(key, callback);	
};

Redis.prototype.hmset = function(key, fields, callback) {
    var self = this;
    var conn = self.getConnection('write');

    conn.select(0);

    callback = callback || function(error, results) {};

    conn.hmset( key, fields , callback );
};

Redis.prototype.hmsetnx = function(key, fields, callback) {
    var self = this;
    var conn = self.getConnection('write');

    conn.select(0);

    conn.hmsetnx( key, fields );
};

Redis.prototype.getConnection = function(method) {
	var self = this;
    var conn;

    var shardNum = 0;
    var index = 0;

    var redisGroup = self.connection[shardNum];
    if( !redisGroup ) {
        //TODO throw Error
        return ;
    }

    if( method === 'write' ) {
        conn = redisGroup.master;
    } else if(method === 'read') {
        conn = redisGroup.slaves[index];
    } else {
        //TODO Throw Error
    }

    return conn;
};

Redis.prototype.multi = function() {
   var self = this;
   var conn = self.getConnection('write');

   conn.select(0);

   return conn.multi();
};

Redis.prototype.ttl = function(key, callback) {
    var self = this;
    var conn = self.getConnection('write');

    conn.select(0);

    conn.ttl(key, callback);
};

Redis.prototype.expire = function(key, seconds, callback) {
    var self = this;
    var conn = self.getConnection('write');

    conn.select(0);

    conn.expire(key, seconds, callback);
};

function _addEventListener(conn, config, type){
    conn.on( 'connect', function() {
        log.info('[%d] %s:%d Redis %s Connected', process.pid, config.host, config.port, type);
    }).on( 'error', function(error) {
        log.error('[%d] %s:%d Redis %s Error : %s', process.pid, config.host, config.port, type, error.stack);
    }).on( 'close', function(hadError) {
        log.error('[%d] %s:%d Redis %s Close', process.pid, config.host, config.port, type);
    });

    return conn;
};

function _toArray(){
    var array = [];

    _.values(arguments).forEach(function(data) {
        if(_.isObject(data)) {
            _.keys(data).forEach(function(key) {
               array.push(key);
               array.push(data[key]);
            });
        }
        else if(_.isArray(data)) {
            array.concat(data);
        }
        else {
            array.push(data);
        }
    });


    return array;
};
