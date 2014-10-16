var redisPublic = require('../connectors').redisPublic;
var redisService = require('../connectors').redisService;

var keys = require('haru-nodejs-util').keys;
var UserSchema = require('haru-nodejs-util').models.User.schema;
var exportSchemaToJson = require('haru-nodejs-util').common.exportSchemaToJson;

var UsersClass = 'Users';

exports.createSchema = function(applicationId, user, callback) {
    var schemaKey = keys.schemaKey(applicationId, UsersClass);
    var schema = exportSchemaToJson( user, UserSchema );
    

    redisPublic.hmset(schemaKey, schema);
};


exports.retrieveSchema = function(input, callback) {
    redisPublic.hgetall( key, function(error, results) {
		if( error ) {}

		callback(error, results);
	});
};