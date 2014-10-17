var redisPublic = require('../connectors').redisPublic;
var redisService = require('../connectors').redisService;

var keys = require('haru-nodejs-util').keys;
var exportSchemaToJson = require('haru-nodejs-util').common.exportSchemaToJson;

var UserSchema = require('haru-nodejs-util').models.User.schema;
var InstallationSchema = require('haru-nodejs-util').models.Installation.schema;

var UsersClass = 'Users';
var InstallationClass = 'Installations';

exports.createUserSchema = function(applicationId, user, callback) {
    var schemaKey = keys.schemaKey(applicationId, UsersClass);
    var schema = exportSchemaToJson( user, UserSchema );

    redisPublic.hmset(schemaKey, schema);
};

exports.updateUserSchema = function(applicationId, user, callback) {
    var schemaKey = keys.schemaKey(applicationId, UsersClass);

    redisPublic.hmsetnx(schemaKey, user);
};

exports.createInstallationSchema = function(applicationId, installation, callbck) {
    var schemaKey = keys.schemaKey(applicationId, InstallationClass);
    var schema = exportSchemaToJson( installation, InstallationSchema );

    redisPublic.hmset(schemaKey, schema);
};


exports.retrieveSchema = function(input, callback) {
    redisPublic.hgetall( key, function(error, results) {
		if( error ) {}

		callback(error, results);
	});
};