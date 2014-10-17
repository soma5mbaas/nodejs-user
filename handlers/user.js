/**
 * Created by syntaxfish on 2014. 10. 14..
 */
var keys = require('haru-nodejs-util').keys; //MongoDB


var async = require('async');
var _ = require('underscore');


var UsersClass = 'Users';
var InstallationClass = 'Installations'

var mongodb = require('../connectors').mongodb;
var redisPublic = require('../connectors').redisPublic;
var redisService = require('../connectors').redisService;

var uuid = require('uuid');

var TTL = require('../config').sessionToken.TTL;


exports.signup = function(input, callback) {
    var deviceToken = input.userinfo.deviceToken;
    var userId = input.userinfo._id;
    var applicationId = input.applicationId;

    var userCollectionKey = keys.collectionKey(UsersClass, applicationId);

    async.series([
        function isExists(callback) {
            mongodb.find( userCollectionKey, {username: input.userinfo.username}, function(error, results) {
                if( results.length > 0 ) { return callback (errorCode.ACCOUNT_ALREADY_LINKED, results) }

                callback (error, results);
            });
        },
        function signup(callback) {
            async.series([
                function saveUserinfoToMongo(callback) {
                    mongodb.insert(userCollectionKey, input.userinfo, function(error, results) {
                        callback(error, results);
                    });
                },
                function saveUserinfoToRedis(callback) {
                    var userHasMapKey = keys.entityDetail(UsersClass, userId, applicationId);
                    var keyset = keys.entityKey(UsersClass, applicationId);

                    redisService.multi()
                                .hmset(userHasMapKey, input.userinfo)
                                .zadd(keyset, input.timestamp, userId)
                                .exec(function(error, replies) {
                                    callback(error, replies);
                                });
                },
                function registSessionToken(callback){
                    var token = uuid();

                    var tokenIdKey = keys.tokenIdKey(applicationId, token);
                    var idTokenKey = keys.idTokenKey(applicationId, userId);

                    redisPublic.multi()
                                .sadd(idTokenKey, token)
                                .hmset(tokenIdKey, input.userinfo)
                                .expire(tokenIdKey, TTL)
                                .expire(idTokenKey, TTL)
                                .exec(function(error, results) {
                                    callback(error, token);
                                });
                },
                function addClasse(callback) {
                    var classesKey = keys.classesKey(input.applicationId);

                    redisPublic.sadd(classesKey, UsersClass, callback);
                },
                function updateInstallationUserId(callback) {
                    var installationCollection = keys.collectionKey(InstallationClass, applicationId);
                    var installationHash = keys.installationKey(applicationId);

                    async.series([
                        function updateMongo(callback){
                            mongodb.update(installationCollection,
                                {deviceToken: deviceToken}, {$set: {userId: userId}},
                                callback );
                        },
                        function updateRedis(callback) {
                            redisService.hget(installationHash, deviceToken, function(error, deviceId) {
                                // TODO deviceToken error handling
                               var installationKey = keys.entityDetail(InstallationClass, deviceId, applicationId);
                               redisService.hset(installationKey, 'userId', userId, callback);
                            });
                        }
                    ], function done(error, results) {
                        callback(error, results);
                    });
                }
            ], function done(error, results) {
                callback(error, results[2]);    // return Session-Token
            });
        }
    ], function done(error, results) {
        callback(error, results[1]);    // return Session-Token
    });
};

exports.login = function(input, callback) {
    var applicationId = input.applicationId;
    var userCollectionKey = keys.collectionKey(UsersClass, applicationId);
    var deviceToken = input.deviceToken;

    async.waterfall([
        function getUserInfo(callback) {
            mongodb.find( userCollectionKey, input.userinfo, function(error, results) {
                if( results.length < 1 ) { return callback (errorCode.ACCOUNT_ALREADY_LINKED, results) }
                callback (error, results[0]);
            });
        },
        function updateInstallationUserId(userInfo, callback) {
            if( deviceToken ) {
                var installationCollection = keys.collectionKey(InstallationClass, applicationId);
                var installationHash = keys.installationKey(applicationId);

                async.series([
                    function updateMongo(callback) {
                        mongodb.update(installationCollection, {deviceToken: deviceToken}, {$set: {userId: userInfo._id}}, callback);
                    },
                    function updateRedis(callback) {
                        redisService.hget(installationHash, deviceToken, function (error, deviceId) {
                            // TODO deviceToken error handling
                            var installationKey = keys.entityDetail(InstallationClass, deviceId, applicationId);
                            redisService.hset(installationKey, 'userId', userInfo._id, callback);
                        });
                    }
                ], function done(error, results) {
                    callback(error, userInfo);
                });
            }
            else {
                callback(null, userInfo);
            }
        },
        function registSessionToken(userInfo, callback){
            var token = uuid();

            var tokenIdKey = keys.tokenIdKey(input.applicationId, token);
            var idTokenKey = keys.idTokenKey(input.applicationId, userInfo._id);

            redisPublic.multi()
                .sadd(idTokenKey, token)
                .hmset(tokenIdKey, userInfo)
                .smembers(idTokenKey)
                .expire(tokenIdKey, TTL)
                .expire(idTokenKey, TTL)
                .exec(function(error, results) {
                    callback(error, token);
                });
        }
    ], function done(error, result) {
        callback(error, result);
    });
};

exports.validSessionToken = function(input, callback) {
    var userCollectionKey = keys.collectionKey(UsersClass, input.applicationId);
    var tokenIdKey = keys.tokenIdKey(input.applicationId, input.sessionToken);


    async.waterfall([
        function isValidSessionToken(callback){
            redisPublic.hget( tokenIdKey, '_id', function(error, result) {
                if( result == null ) return callback(errorCode.INVALID_USER_TOKEN, result);

                var idTokenKey = keys.idTokenKey(input.applicationId, result);
                redisPublic.multi()
                            .expire(tokenIdKey, TTL)
                            .expire(idTokenKey, TTL)
                            .exec();

                callback(error, result);
            });
        },
        function getUserInfo(_id, callback){
            mongodb.findOne(userCollectionKey, {_id: _id}, function(error, result) {
                callback(error, result);
            });
        }
    ], function done(error, result) {
        callback(error, result);
    });
};