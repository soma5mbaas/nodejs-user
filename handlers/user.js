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

var TTL = config.sessionToken.TTL;

var _createEntityId = require('haru-nodejs-util').common.createEntityId;
var _getShardKey = require('haru-nodejs-util').common.getShardKey;

var passwordHash = require('password-hash');


exports.signup = function(input, callback) {
    var applicationId = input.applicationId;
    var userinfo = input.userinfo;

    var userCollectionKey = keys.collectionKey(UsersClass, applicationId);
    var installationCollectionKey = keys.collectionKey(InstallationClass, applicationId);

    var usernameKey = keys.usernameKey(applicationId);
    var classList = keys.classesKey(applicationId);

    var hashedPassword = passwordHash.generate( userinfo.password );

    async.series([
        function checkUser(callback) {
            store.get('public').multi()
                .sadd(classList, UsersClass)
                .hsetnx(usernameKey, userinfo.username+'.password', hashedPassword)
                .exec(function(error, results) {
                    if( results[0] === 1 /** isNewClass **/ ) {
                        store.get('mongodb').addShardCollection(userCollectionKey);
                    }

                    if( results[1] === 0 /** !isNewUser **/ ) {
                        return callback( errorCode.ACCOUNT_ALREADY_LINKED, null );
                    }

                    callback(error);
                });
        },
        function findInstallation(callback) {
            if( userinfo.deviceToken ){
                store.get('mongodb').find(installationCollectionKey, {deviceToken: userinfo.deviceToken}, function(error, installation) {
                    if(_.isArray(installation) && installation.length > 0 ) {
                        input.installation = installation[0];
                    }
                    callback(error, installation);
                });
            } else {
                callback(null, null);
            }
        },
        function createEntityId(callback) {
            _createEntityId({ timestamp:input.timestamp, public: store.get('public') }, function(error, id, shardKey) {
                input._id = userinfo._id = id;
                input.shardKey = shardKey;

                callback(error);
            });
        },
        function createSessionToken(callback) {
            var token = input.shardKey+''+uuid();
            input.sessionToken =  token;

            callback(null, token);
        },
        function updateMongoDb(callback) {
            store.get('mongodb').insert(userCollectionKey, userinfo, function(error, results) {
                if(input.installation) {
                    store.get('mongodb').update(installationCollectionKey, {deviceToken: userinfo.deviceToken}, {$set: {userId: userinfo._id}},{}, function(error, results) {
                        if(error && error.message == 'Invalid condition') { return callback(errorCode.INVALID_DEVICE_TOKEN, results); }

                        callback(error, results);
                    });
                } else {
                    callback(error, results);
                }
            });
        },
        function updateRedisPublic(callback) {
            var multi = store.get('public').multi();
            var keyset = keys.entityKey(UsersClass, applicationId);

            // userinfo
            multi.zadd(keyset, input.timestamp, input._id)
                .hsetnx(usernameKey, userinfo.username+'._id', input._id);

            multi.exec(callback);
        },
        function updateRedisSerivce(callback) {
            if( userinfo.authData ) {  userinfo.authData = JSON.stringify(userinfo.authData); }

            var multi = store.get('service').multi(input.shardKey);

            var tokenIdKey = keys.tokenIdKey(applicationId, input.sessionToken);
            var idTokenKey = keys.idTokenKey(applicationId, input._id);

            var userHasMapKey = keys.entityDetail(UsersClass, input._id, applicationId);

            // sessionToken
            multi.hmset(userHasMapKey, userinfo)
                .sadd(idTokenKey, input.sessionToken)
                .set(tokenIdKey, input._id)
                .expire(tokenIdKey, TTL)
                .expire(idTokenKey, TTL);

            multi.exec(callback);
        },
    ], function done(error, results) {
        if( error ) {
            if( error !== errorCode.ACCOUNT_ALREADY_LINKED ) {
                store.get('public').srem(userNameSetKey, userinfo.username, function(error, results) {
                    return callback(error, results);
                });
            }
        }

        callback(error, {_id: input._id, createdAt: userinfo.createdAt, updatedAt: userinfo.updatedAt, sessionToken: input.sessionToken});
    });
};

exports.signupSocial = function(input, callback) {
    var userinfo = input.userinfo;
    var deviceToken = input.userinfo.deviceToken;
    var applicationId = input.applicationId;

    var authData = input.userinfo.authData;
    var authCondtion = _createCondition(authData);

    var userCollectionKey = keys.collectionKey(UsersClass, applicationId);
    var installationCollectionKey = keys.collectionKey(InstallationClass, applicationId);

    userinfo.password = _serializeAuthData(authData);
    
    async.waterfall([
        function isExists(callback) {
            store.get('mongodb').find(userCollectionKey, authCondtion, function(error, results) {
                if( _.isArray(results) && results.length > 0 ) { return callback(error, results[0]); }


                callback (error, null);
            });
        },
        function signup(user, callback) {
            if( user === null ) {
                // 신규 유저는 random id 를 생성해서 가입시킨다.
                input.userinfo.username = _createRandomUesrname(applicationId);
                exports.signup(input, callback);
            } else {
                // 기존 유저는 session-token 발행한다.
                input.userinfo.createdAt = user.createdAt;
                input.userinfo._id = user._id;
                input._id = user._id;

                input.shardKey = _getShardKey(user._id);
                async.series([
                    function createSessionToken(callback) {
                        var token = input.shardKey+''+uuid();

                        input.sessionToken =  token;

                        callback(null, token);
                    },
                    function updateMongoDb(callback) {
                        store.get('mongodb').update(userCollectionKey,{_id: user._id}, {$set: {authData:authData}}, function(error, results) {
                            if( deviceToken ) {
                                store.get('mongodb').update(installationCollectionKey, {deviceToken: deviceToken}, {$set: {userId: user._id}},{}, function(error, results) {
                                    if(error && error.message == 'Invalid condition') { return callback(errorCode.INVALID_DEVICE_TOKEN, results); }

                                    callback(error, results);
                                });
                            } else {
                                callback(error, results);
                            }
                        });
                    },
                    function updateRedisSerivce(callback) {
                        if( userinfo.authData ) {  userinfo.authData = JSON.stringify(userinfo.authData); }

                        var multi = store.get('service').multi(input.shardKey);

                        var tokenIdKey = keys.tokenIdKey(applicationId, input.sessionToken);
                        var idTokenKey = keys.idTokenKey(applicationId, input._id);

                        var userHasMapKey = keys.entityDetail(UsersClass, input._id, applicationId);

                        // sessionToken
                        multi.hmset(userHasMapKey, userinfo)
                            .sadd(idTokenKey, input.sessionToken)
                            .set(tokenIdKey, input._id)
                            .expire(tokenIdKey, TTL)
                            .expire(idTokenKey, TTL);

                        multi.exec(callback);
                    },
                ], function done(error, results) {
                    callback(error, results);
                });
            }
        }
    ], function done(error, results) {
        callback(error, {_id: input._id, createdAt: userinfo.createdAt, updatedAt: userinfo.updatedAt, sessionToken: input.sessionToken});
    });
};

exports.login = function(input, callback) {
    var applicationId = input.applicationId;
    var deviceToken = input.deviceToken;

    var userinfo = input.userinfo;

    var usernameKey = keys.usernameKey(applicationId);
    var userMetaData = [ userinfo.username +'.password', userinfo.username+'._id' ];

    async.series([
        function findUser(callback) {
            store.get('public').hmget(usernameKey, userMetaData, function(error, metaData) {
                if( metaData[0] === null ) { return callback(errorCode.USERNAME_MISSING, metaData); }
                if( passwordHash.verify(userinfo.password, metaData[0]) === false ) { return callback(errorCode.PASSWORD_MISSING, metaData); }

                input.password = metaData[0];
                input._id = metaData[1];
                input.shardKey = _getShardKey(input._id);

                callback(error, metaData);
            });
        },
        function createSessionToken(callback) {
            var token = input.shardKey+''+uuid();

            input.sessionToken =  token;

            callback(null, token);
        },
        function updateRedisSerivce(callback) {
            var multi = store.get('service').multi(input.shardKey);

            var tokenIdKey = keys.tokenIdKey(applicationId, input.sessionToken);
            var idTokenKey = keys.idTokenKey(applicationId, input._id);

            // sessionToken
            multi.sadd(idTokenKey, input.sessionToken)
                .set(tokenIdKey, input._id)
                .expire(tokenIdKey, TTL)
                .expire(idTokenKey, TTL);

            multi.exec(callback);
        },
        function relationInstallation(callback) {
            if( input.deviceToken ) {
                _relationInstallation({timestamp: input.timestamp, applicationId: input.applicationId, deviceToken:input.deviceToken, userId: input._id}, callback);
            } else {
                callback(null, null);
            }
        }
    ], function done(error, results) {
        callback(error, {sessionToken: input.sessionToken, _id: input._id});
    });
};

exports.validSessionToken = function(input, callback) {
    var userCollectionKey = keys.collectionKey(UsersClass, input.applicationId);
    var tokenIdKey = keys.tokenIdKey(input.applicationId, input.sessionToken);

    input.shardKey = _getShardKey(input.sessionToken);

    async.series([
        function validSessionToken(callback) {
            store.get('service').get(tokenIdKey, function(error, userId) {
                if( error ) { return callback(error, userId); }
                if( userId === null) { return callback(errorCode.INVALID_USER_TOKEN, userId); }

                input._id = userId;

                callback(error, userId);

            }, input.shardKey);
        },
        function getUserInfo(callback) {
            var userHasMapKey = keys.entityDetail(UsersClass, input._id, input.applicationId);
            var idTokenKey = keys.idTokenKey(input.applicationId, input._id);

            var multi = store.get('service').multi(input.shardKey);

            multi.hgetall(userHasMapKey)
                .expire(tokenIdKey, TTL)
                .expire(idTokenKey, TTL)
                .exec(function(error, results) {
                    input.userinfo = results[0];

                    callback(error, results);
                });
        }
    ], function done(error, results) {
        callback(error, input.userinfo);
    });
};

exports.logout = function(input, callback) {
    var applicationId = input.applicationId;
    var shardKey = _getShardKey(input.sessionToken);

    async.waterfall([
        function findId(callback) {
            store.get('service').get(keys.tokenIdKey(applicationId, input.sessionToken), function (error, id) {
                if( error ) { return callback(error, id); }
                if( id === null ) { return callback(errorCode.INVALID_LINKED_SESSION, id); }

                input._id = id;

                callback(error);
            }, shardKey);
        },
        function selectTokens(callback) {
                if(input.type === 'me') {
                    callback(null, [input.sessionToken]);
                } else if(input.type === 'other') {
                    store.get('service').smembers(keys.idTokenKey(applicationId, input._id), function (error, results) {
                        callback(error, _.without(results, input.sessionToken));
                    }, shardKey);
                } else if(input.type === 'all') {
                    store.get('service').smembers(keys.idTokenKey(applicationId, input._id), function(error, results) {
                        callback(error, results)
                    }, shardKey);
                }else {
                    return callback(null, null, []);
                }
        },
        function expireTokens(tokens, callback) {
            if( tokens.length  === 0 ) { return callback(null, null); }


            var multi = store.get('service').multi(shardKey);

            for( var i = 0; i < tokens.length; i++ ) {
                multi.del( keys.tokenIdKey(applicationId, tokens[i]) );
            }

            multi.srem(keys.idTokenKey(applicationId, input._id), tokens);
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
    var shardKey = _getShardKey(_id);

    async.series([
        function isExists(callback) {
            var userHasMapKey = keys.entityDetail(UsersClass, input._id, applicationId);

            store.get('service').hgetall(userHasMapKey, function(error, userinfo){
                if( userinfo === null) { return callback(errorCode.MISSING_ENTITY_ID, userinfo); }

                callback(error, userinfo);
            }, shardKey);
        },
        function updateMongo(callback) {
            store.get('mongodb').update(userCollectionKey, {_id: _id}, {$set: input.userinfo},{}, callback);
        },
        function updateRedisService(callback) {
            var userHasMapKey = keys.entityDetail(UsersClass, _id, applicationId);

            if( input.userinfo.authData ) {
                input.userinfo.authData = JSON.stringify(input.userinfo.authData);
            }

            store.get('service').hmset(userHasMapKey, input.userinfo, callback, shardKey);
        },
        function updateRedisPublic(callback) {
            var keyset = keys.entityKey(UsersClass, applicationId);

            store.get('public').zadd(keyset, input.timestamp, _id, callback);
        }
    ], function done(error, results) {
        callback(error, results);
    });
};

exports.retrieve = function(input, callback) {
    var userHasMapKey = keys.entityDetail(UsersClass, input.userinfo._id, input.applicationId);
    var shardKey = _getShardKey(input.userinfo._id);
    store.get('service').hgetall(userHasMapKey, function(error, userinfo) {
        if(error) { return callback(error, userinfo); }
        if(userinfo === null) { return callback(errorCode.MISSING_ENTITY_ID, userinfo); }

        callback(error, userinfo);
    }, shardKey);
};

exports.delete = function(input, callback) {
    var applicationId = input.applicationId;
    var userCollectionKey = keys.collectionKey(UsersClass, applicationId);
    var _id = input.userinfo._id;
    var tokenIdKey = keys.tokenIdKey(input.applicationId, input.sessionToken);

    var shardKey = _getShardKey(_id);
    
    async.series([
        function isValidIdSessionToken(callback) {
            store.get('service').get(tokenIdKey, function(error, id){
                if( error ) { return callback(error, id); }
                if( id === null ) { return callback(errorCode.SESSION_MISSING, id); }
                if( id !== _id ) { return callback(errorCode.MISSING_ENTITY_ID, id); }

                callback(error, id);
            }, shardKey);
        },
        function findUser(callback) {
            var userHasMapKey = keys.entityDetail(UsersClass, input.userinfo._id, input.applicationId);
            store.get('service').hgetall(userHasMapKey, function(error, userinfo) {
                if(error) { return callback(error, userinfo); }
                if(userinfo === null) { return callback(errorCode.MISSING_ENTITY_ID, userinfo); }

                input.userinfo = userinfo;

                callback(error, userinfo);
            }, shardKey);
        },
        function selectTokens(callback) {
            store.get('service').smembers(keys.idTokenKey(applicationId, _id), function(error, results) {

                input.sessionTokens = results;

                callback(error, results)
            }, shardKey);
        },
        function deleteRedisPublic(callback) {
            var multi = store.get('public').multi();

            var keyset = keys.entityKey(UsersClass, applicationId);
            var usernameKey = keys.usernameKey(applicationId);

            // userinfo
            multi.zrem(keyset, input._id)
                .hdel(usernameKey, input.userinfo.username+'._id')
                .hdel(usernameKey, input.userinfo.username+'.password')
                .exec(callback);

        },
        function deleteRedisService(callback) {
            var multi = store.get('service').multi(shardKey);
            var userHasMapKey = keys.entityDetail(UsersClass, _id, applicationId);

            // userinfo
            multi.del(userHasMapKey);

            // sessionToken
            for(var i = 0; i < input.sessionTokens.length; i++ ) {
                multi.del( keys.tokenIdKey(applicationId, input.sessionTokens[i]) );
            }
            multi.del(keys.idTokenKey(applicationId, input._id));

            multi.exec(callback);
        },
        function deleteMongodb(callback){
            store.get('mongodb').remove(userCollectionKey, {_id: _id}, callback);
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

function _serializeAuthData(authData) {

    var authType = Object.keys(authData)[0];

    return authType + '.id:' + authData[authType].id;
};

/**
 * input = { applicationId, deviceToken, userId };
 * **/
function _relationInstallation(input, callback) {
    var installationCollectionKey = keys.collectionKey(InstallationClass, input.applicationId);

    async.series([
        function findInstallation(callback) {
            store.get('mongodb').find(installationCollectionKey, {deviceToken: input.deviceToken}, function(error, results) {
                if( results === null ) { return callback(errorCode.INVALID_DEVICE_TOKEN, results); }
                if( results.length < 1 ) { return callback(errorCode.INVALID_DEVICE_TOKEN, results); }

                input.installation = results[0];
                input.shardKey = "0"//_getShardKey(results[0]._id); TODO Installations _id

                callback(error, results);
            });
        },
        function updateMongodb(callback) {
            store.get('mongodb').update(installationCollectionKey, {_id: input.installation._id}, {$set: {userId: input.userId}},{}, function(error, results) {
                if(error && error.message == 'Invalid condition') { return callback(errorCode.INVALID_DEVICE_TOKEN, results); }

                callback(error, results);
            });
        },
        function updateRedisService(callback) {
            var redisKey = keys.entityDetail(InstallationClass, input.installation._id, input.applicationId);

            store.get('service').hset(redisKey, 'userId', input.userId, callback, input.shardKey );
        },
        function updateRedisPublic(callback) {
            var keyset = keys.entityKey(InstallationClass, input.applicationId);

            store.get('public').zadd(keyset, input.timestamp, input.installation._id, callback);
        },
    ], function done(error, results) {
        callback(error, results);
    });
};

function _registSessionToken(input, callback) {

};