/**
 * Created by syntaxfish on 2014. 10. 14..
 */
var keys = require('haru-nodejs-util').keys; //MongoDB


var async = require('async');
var _ = require('underscore');

var UsersClass = 'Users';
var InstallationClass = 'Installations'

var store = require('haru-nodejs-store');

var uuid = require('uuid');
var uid2 = require('uid2');

var TTL = require('../config').sessionToken.TTL;

exports.signup = function(input, callback) {
    var deviceToken = input.userinfo.deviceToken;
    var userId = input.userinfo._id;
    var applicationId = input.applicationId;

    var userCollectionKey = keys.collectionKey(UsersClass, applicationId);

    async.series([
        function checkClass(callback) {
            store.get('public').sismember(keys.classesKey(input.applicationId), UsersClass,function(error, results) {

                if( results === 0 ) {
                    var classesKey = keys.classesKey(input.applicationId);
                    store.get('public').sadd(classesKey, UsersClass);
                    store.get('mongodb').addShardCollection(userCollectionKey);
                }

                callback(error, results);
            });
        },
        function isExists(callback) {
            store.get('mongodb').find( userCollectionKey, {username: input.userinfo.username}, function(error, results) {
                if( results.length > 0 ) { return callback (errorCode.ACCOUNT_ALREADY_LINKED, results) }

                callback (error, results);
            });
        },
        function signup(callback) {
            async.series([
                function saveUserinfoToMongo(callback) {
                    store.get('mongodb').insert(userCollectionKey, input.userinfo, function(error, results) {
                        if( input.userinfo.authData ) {  input.userinfo.authData = JSON.stringify(input.userinfo.authData); }
                        callback(error, results);
                    });
                },
                function saveUserinfoToRedis(callback) {
                    var userHasMapKey = keys.entityDetail(UsersClass, userId, applicationId);
                    var keyset = keys.entityKey(UsersClass, applicationId);

                    store.get('service').multi()
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

                    store.get('public').multi()
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

                    store.get('public').sadd(classesKey, UsersClass, callback);
                },
                function updateInstallationUserId(callback) {
                    var installationCollection = keys.collectionKey(InstallationClass, applicationId);
                    var installationHash = keys.installationKey(applicationId);

                    async.series([
                        function updateMongo(callback){
                            store.get('mongodb').update(installationCollection,
                                {deviceToken: deviceToken}, {$set: {userId: userId}},
                                callback );
                        },
                        function updateRedis(callback) {
                            store.get('service').hget(installationHash, deviceToken, function(error, deviceId) {
                                // TODO deviceToken error handling
                               var installationKey = keys.entityDetail(InstallationClass, deviceId, applicationId);
                               store.get('service').hset(installationKey, 'userId', userId, callback);
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
        callback(error,  {
            _id: input.userinfo._id,
            createdAt: input.userinfo.createdAt,
            updatedAt: input.userinfo.updatedAt,
            sessionToken: results[1]
        });
    });
};

exports.signupSocial = function(input, callback) {
    var deviceToken = input.userinfo.deviceToken;
    var applicationId = input.applicationId;

    var authData = input.userinfo.authData;
    var authCondtion = _createCondition(authData);

    var userCollectionKey = keys.collectionKey(UsersClass, applicationId);

    async.waterfall([
        function isExists(callback) {
            store.get('mongodb').find(userCollectionKey, authCondtion, function(error, results) {
                callback (error, results[0]);
            });
        },
        function signup(user, callback) {
            if( !user ) {
                // 신규 유저는 random id 를 생성해서 가입시킨다.
                input.userinfo.username = _createRandomUesrname(applicationId);
                exports.signup(input, callback);
            } else {
                // 기존 유저는 session-token 발행한다.
                input.userinfo.createdAt = user.createdAt;
                input.userinfo._id = user._id;

                async.series([
                    function saveUserinfoToMongo(callback) {
                        var d = {
                            updatedAt: input.timestamp,
                            authData: authData,
                            deviceToken: deviceToken
                        };

                        store.get('mongodb').update(userCollectionKey, authCondtion, {$set: d}, function(error, results) {
                            input.userinfo.authData = JSON.stringify(authData);
                            callback(error, results);
                        });
                    },
                    function saveUserinfoToRedis(callback) {
                        var userHasMapKey = keys.entityDetail(UsersClass, user._id, applicationId);
                        var keyset = keys.entityKey(UsersClass, applicationId);

                        store.get('service').multi()
                            .hmset(userHasMapKey, input.userinfo)
                            .zadd(keyset, input.timestamp, user._id)
                            .exec(function(error, replies) {
                                callback(error, replies);
                            });
                    },
                    function registSessionToken(callback){
                        var token = uuid();

                        var tokenIdKey = keys.tokenIdKey(applicationId, token);
                        var idTokenKey = keys.idTokenKey(applicationId, user._id);

                        store.get('public').multi()
                            .sadd(idTokenKey, token)
                            .hmset(tokenIdKey, input.userinfo)
                            .expire(tokenIdKey, TTL)
                            .expire(idTokenKey, TTL)
                            .exec(function(error, results) {
                                callback(error,  {
                                    _id: user._id,
                                    createdAt: user.createdAt,
                                    updatedAt: user.updatedAt,
                                    sessionToken: token
                                });
                            });
                    },
                    function updateInstallationUserId(callback) {
                        var installationCollection = keys.collectionKey(InstallationClass, applicationId);
                        var installationHash = keys.installationKey(applicationId);

                        async.series([
                            function updateMongo(callback){
                                store.get('mongodb').update(installationCollection,
                                    {deviceToken: deviceToken}, {$set: {userId: user._id}},
                                    callback );
                            },
                            function updateRedis(callback) {
                                store.get('service').hget(installationHash, deviceToken, function(error, deviceId) {
                                    // TODO deviceToken error handling
                                    var installationKey = keys.entityDetail(InstallationClass, deviceId, applicationId);
                                    store.get('service').hset(installationKey, 'userId', user._id, callback);
                                });
                            }
                        ], function done(error, results) {
                            callback(error, results);
                        });
                    }
                ], function done(error, results) {
                    if(results.length > 2) {
                        callback(error, results[2]);
                    } else {
                        callback(error, null);
                    }
                });
            }
        }
    ], function done(error, results) {
        callback(error, results);
    });
};

exports.login = function(input, callback) {
    var applicationId = input.applicationId;
    var userCollectionKey = keys.collectionKey(UsersClass, applicationId);
    var deviceToken = input.deviceToken;

    async.waterfall([
        function getUserInfo(callback) {
            store.get('mongodb').find( userCollectionKey, input.userinfo, function(error, results) {
                if( results.length < 1 ) { return callback (errorCode.USERNAME_MISSING, results) }
                callback (error, results[0]);
            });
        },
        function updateInstallationUserId(userInfo, callback) {
            if( deviceToken ) {
                var installationCollection = keys.collectionKey(InstallationClass, applicationId);
                var installationHash = keys.installationKey(applicationId);

                async.series([
                    function updateMongo(callback) {
                        store.get('mongodb').update(installationCollection, {deviceToken: deviceToken}, {$set: {userId: userInfo._id}}, callback);
                    },
                    function updateRedis(callback) {
                        store.get('service').hget(installationHash, deviceToken, function (error, deviceId) {
                            // TODO deviceToken error handling
                            var installationKey = keys.entityDetail(InstallationClass, deviceId, applicationId);
                            store.get('service').hset(installationKey, 'userId', userInfo._id, callback);
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

            store.get('public').multi()
                .sadd(idTokenKey, token)
                .hmset(tokenIdKey, userInfo)
                .smembers(idTokenKey)
                .expire(tokenIdKey, TTL)
                .expire(idTokenKey, TTL)
                .exec(function(error, results) {
                    callback(error, {sessionToken: token, _id: userInfo._id} );
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
            store.get('public').hget( tokenIdKey, '_id', function(error, result) {
                if( result == null ) return callback(errorCode.INVALID_USER_TOKEN, result);

                var idTokenKey = keys.idTokenKey(input.applicationId, result);
                store.get('public').multi()
                            .expire(tokenIdKey, TTL)
                            .expire(idTokenKey, TTL)
                            .exec();

                callback(error, result);
            });
        },
        function getUserInfo(_id, callback){
            store.get('mongodb').findOne(userCollectionKey, {_id: _id}, function(error, result) {
                callback(error, result);
            });
        }
    ], function done(error, result) {
        callback(error, result);
    });
};

exports.logout = function(input, callback) {
    var applicationId = input.applicationId;
    async.waterfall([
        function selectId(callback) {
            store.get('public').hget(keys.tokenIdKey(applicationId, input.sessionToken), '_id', function (error, id) {
                if( id < 1 ) { callback(errorCode.INVALID_LINKED_SESSION, id); } // session check

                callback(error, id)
            });
        },
        function selectTokens(id, callback) {
            var type = input.type;

            if(type === 'me') {
                callback(null, id, [input.sessionToken]);
            } else if(type === 'other') {
                store.get('public').smembers(keys.idTokenKey(applicationId, id), function (error, results) {
                    callback(error, id, _.without(results, input.sessionToken));
                });
            } else if(type === 'all') {
                store.get('public').smembers(keys.idTokenKey(applicationId, id), function(error, results) {
                    callback(error, id, results)
                });
            }else {
                return callback(null, null, []);
            }
        },
        function expireTokens(id, tokens, callback) {
            var multi = store.get('public').multi();

            for( var i = 0; i < tokens.length; i++ ) {
                multi.del( keys.tokenIdKey(applicationId, tokens[i]) );
            }
            multi.srem(keys.idTokenKey(applicationId, id), tokens);
            multi.exec(callback);
        }
    ], function done(error, results) {
        callback(error, results);
    });
};

exports.update = function(input, callback) {
    var applicationId = input.applicationId;
    var _id = input._id;
    var userCollectionKey = keys.collectionKey(UsersClass, applicationId);

    async.series([
        function updateMongo(callback) {
            store.get('mongodb').update(userCollectionKey, {_id: _id}, {$set: input.userinfo}, function(error, results) {
                if( input.userinfo.authData ) {
                    input.userinfo.authData = JSON.stringify(input.userinfo.authData);
                }
                callback(error, results);
            });
        },
        function updateRedis(callback) {
            var userHasMapKey = keys.entityDetail(UsersClass, _id, applicationId);
            var keyset = keys.entityKey(UsersClass, applicationId);

            store.get('service').multi()
                .hmset(userHasMapKey, input.userinfo)
                .zadd(keyset, input.timestamp, _id)
                .exec(function(error, replies) {
                    callback(error, replies);
                });
        }
    ], function done(error, results) {
        callback(error, results);
    });
};


exports.retrieve = function(input, callback) {
    var applicationId = input.applicationId;
    var _id = input.userinfo._id;
    var userCollectionKey = keys.collectionKey(UsersClass, applicationId);

    store.get('mongodb').find( userCollectionKey, {_id: input.userinfo._id}, function(error, results) {
        if( results.length < 1 ) { return callback (errorCode.MISSING_ENTITY_ID, results) }

        callback (error, results);
    });
};

exports.delete = function(input, callback) {
    var applicationId = input.applicationId;
    var userCollectionKey = keys.collectionKey(UsersClass, applicationId);
    var _id = input.userinfo._id;
    var tokenIdKey = keys.tokenIdKey(input.applicationId, input.sessionToken);

    async.waterfall([
        function isValidSessionToken(callback){
            store.get('public').hget( tokenIdKey, '_id', function(error, result) {
                if( result == null ) return callback(errorCode.SESSION_MISSING, result);
                callback(error, result);
            });
        },
        function selectTokens(e, callback) {
            store.get('public').smembers(keys.idTokenKey(applicationId, _id), function(error, results) {
                callback(error, _id, results)
            });
        },
        function expireTokens(id, tokens, callback) {
            if( tokens.length > 0 ) {
                var multi = store.get('public').multi();

                for( var i = 0; i < tokens.length; i++ ) {
                    multi.del( keys.tokenIdKey(applicationId, tokens[i]) );
                }

                multi.del(keys.idTokenKey(applicationId, id));
                multi.exec(callback);
            } else {
                callback(null, null);
            }
        },
        function deleteMongoDb(r, callback) {
            store.get('mongodb').remove(userCollectionKey, {_id: _id}, callback);
        },
        function deleteRedis(e, r, callback) {
            var userHasMapKey = keys.entityDetail(UsersClass, _id, applicationId);
            var keyset = keys.entityKey(UsersClass, applicationId);

            store.get('service').multi()
                .del(userHasMapKey)
                .zrem(keyset, _id)
                .exec(function(error, replies) {
                    callback(error, replies);
                });
        }
    ], function done(error, results) {
        callback(error, results);
    });
};

function _createRandomUesrname(applicationId) {
    return (String.fromCharCode(_.random(97, 122)) + uid2(_.random(5, 10))).toLowerCase();
};

function _createCondition(authData) {
    var providers = Object.keys(authData);
    var condition = {};

    for( var i = 0; i < providers.length; i++ ){
        var provider = providers[i];
        condition['authData.'+provider+'.id'] = authData[provider].id;
    }

    return condition;
};