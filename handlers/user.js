/**
 * Created by syntaxfish on 2014. 10. 14..
 */
var keys = require('haru-nodejs-util').keys; //MongoDB


var async = require('async');
var _ = require('underscore');


var UsersClass = 'Users';

var mongodb = require('../connectors').mongodb;
var redisPublic = require('../connectors').redisPublic;
var redisService = require('../connectors').redisService;

var uuid = require('uuid');

var TTL = require('../config').sessionToken.TTL;


exports.signup = function(input, callback) {
    var userCollectionKey = keys.collectionKey(UsersClass, input.applicationId);

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
                    var userHasMapKey = keys.entityDetail(UsersClass, input.userinfo._id, input.applicationId);
                    var keyset = keys.entityKey(UsersClass, input.applicationId);

                    redisService.multi()
                                .hmset(userHasMapKey, input.userinfo)
                                .zadd(keyset, input.timestamp, input.userinfo._id)
                                .exec(function(error, replies) {
                                    callback(error, replies);
                                });
                },
                function registSessionToken(callback){
                    var token = uuid();

                    var tokenIdKey = keys.tokenIdKey(input.applicationId, token);
                    var idTokenKey = keys.idTokenKey(input.applicationId, input.userinfo._id);

                    redisPublic.multi()
                                .sadd(idTokenKey, token)
                                .hmset(tokenIdKey, input.userinfo)
                                .expire(tokenIdKey, TTL)
                                .expire(idTokenKey, TTL)
                                .exec(function(error, results) {
                                    callback(error, token);
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
    var userCollectionKey = keys.collectionKey(UsersClass, input.applicationId);

    async.waterfall([
        function getUserInfo(callback) {
            mongodb.find( userCollectionKey, input.userinfo, function(error, results) {
                if( results.length < 1 ) { return callback (errorCode.ACCOUNT_ALREADY_LINKED, results) }
                callback (error, results[0]);
            });
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