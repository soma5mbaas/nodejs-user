var async = require('async');
var uuid = require('uuid');

var store = require('haru-nodejs-store');

var getShardKey = require('haru-nodejs-util').common.getShardKey;
var createEntityId = require('haru-nodejs-util').common.createEntityId;

var keys = require('haru-nodejs-util').keys;

var InstallationClass = 'Installations';

exports.createInstallation = function(input, callback) {
    var installationCollection = keys.collectionKey(InstallationClass, input.applicationId);

    async.series([
        function findInstallation(callback) {
            store.get('mongodb').find(installationCollection, {deviceToken: input.installation.deviceToken}, function(error, results) {
                if( error ) { return callback(error, results); }

                input.isNewInstallation = (results.length === 0);

                if( results.length > 0 ) {
                    input._id = input.installation._id = results[0]._id;
                    input.installation.createdAt = results[0].createdAt;
                }

                callback(error, results);
            });
        },
        function upsertInstallaion(callback) {
            if( input.isNewInstallation ) {
                _createInstallation(input, callback);
            } else {
                _updateInstallation(input, callback);
            }
        }
    ], function done(error, results) {
        callback(error, input.installation);
    });
};

exports.updateInstallation = function(input, callback) {
    var installationCollection = keys.collectionKey(InstallationClass, input.applicationId);

    async.series([
        function findInstallation(callback) {
            store.get('mongodb').find(installationCollection, {deviceToken: input.installation.deviceToken}, function(error, results) {
                if( error ) { return callback(error, results); }

                input.isNewInstallation = (results.length === 0);

                if( results.length > 0 ) {
                    input._id = input.installation._id = results[0]._id;
                    input.installation.createdAt = results[0].createdAt;
                }

                callback(error, results);
            });
        },
        function upsertInstallaion(callback) {
            if( input.isNewInstallation ) {
                _createInstallation(input, callback);
            } else {
                _updateInstallation(input, callback);
            }
        }
    ], function done(error, results) {
        callback(error, input.installation);
    });
};

//exports.deleteInstallation = function(input, callback) {
//    var installationCollection = keys.collectionKey(InstallationClass, input.applicationId);
//    var installationKey = keys.entityDetail(InstallationClass, input._id, input.applicationId);
//};

function _createInstallation(input, callback) {
    var applicationId = input.applicationId;
    var installation = input.installation;

    var options = {};

    async.series([
        function createId(callback) {
            createEntityId({ timestamp:input.timestamp, public: store.get('public') }, function(error, id, shardKey) {
                input._id = installation._id = id;
                input.shardKey = shardKey;

                callback(error);
            });
        },
        function addMetaDataToPublic(callback) {
            store.get('public').multi()
                .sadd(keys.classesKey(applicationId), InstallationClass)
                .zadd(keys.entityKey(InstallationClass, applicationId), input.timestamp, input._id)
                .exec(function(error, results) {
                    options.isNewClass = results[0] === 1;
                    callback(error);
                });
        },
        function addShardCollection(callback) {
            if( options.isNewClass ) {
                store.get('mongodb').addShardCollection(keys.collectionKey(InstallationClass, applicationId));
            }

            callback(null);
        },
        function addEntityToMongo(callback) {
            store.get('mongodb').insert(keys.collectionKey(InstallationClass, applicationId), installation, callback);
        },
        function addEntityToRedis(callback) {
            store.get('service').hmset(keys.entityDetail(InstallationClass, input._id, applicationId), installation, callback, input.shardKey);
        }
    ], function done(error, results) {
        callback(error, installation);
    });

};

function _updateInstallation(input, callback) {
    var applicationId = input.applicationId;
    var installation = input.installation;

    var shardKey = getShardKey(input._id);

    async.series([
        function isExistEntity(callback) {
            store.get('service').hget( keys.entityDetail(InstallationClass, input._id, applicationId), '_id', function(error, results) {
                if(results == null) { return callback(errorCode.MISSING_ENTITY_ID, results); }

                callback(error, results);
            }, shardKey);
        },
        function updateEntityToMongoDB(callback){
            store.get('mongodb').update(keys.collectionKey(InstallationClass, applicationId),{_id: input._id}, {$set: installation}, callback);
        },
        function updateEntityToRedis(callback){
            store.get('service').hmset(keys.entityDetail(InstallationClass, input._id, applicationId), installation, callback, shardKey);
        },
        function updateEntityIdToPublic(callback) {
            store.get('public').zadd(keys.entityKey(InstallationClass, applicationId), input.timestamp, input._id, callback);
        }
    ], function done(error, results) {
        callback(error, results);
    });
};