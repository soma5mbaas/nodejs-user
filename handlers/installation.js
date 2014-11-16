var async = require('async');
var uuid = require('uuid');

var store = require('haru-nodejs-store');


var keys = require('haru-nodejs-util').keys;

var InstallationClass = 'Installations';


exports.createInstallation = function(input, callback) {
    var installationCollection = keys.collectionKey(InstallationClass, input.applicationId);

    async.waterfall([
        function checkClass(callback) {
            store.get('public').sismember(keys.classesKey(input.applicationId), InstallationClass,function(error, results) {

                if( results === 0 ) {
                    var classesKey = keys.classesKey(input.applicationId);
                    store.get('public').sadd(classesKey, InstallationClass);
                    store.get('mongodb').addShardCollection(installationCollection);
                }

                callback(error, results);
            });
        },
        function isExists(_, callback) {
            store.get('mongodb').find(installationCollection, {deviceToken: input.installation.deviceToken}, function(error, results) {
                callback(error, results);
            });
        },
        function insertInstallation(installations, callback){
            if(installations.length > 0) {
                // return callback(null, installations[0]);
                // installations 가 존재하면 update 14.11.16
                input._id = installations[0]._id;
                delete input.installation._id;
                exports.updateInstallation(input, callback);

            } else {
                input.installation._id = uuid();
                var installationKey = keys.entityDetail(InstallationClass, input.installation._id, input.applicationId);
                var installationHash = keys.installationKey(input.applicationId);
                var entityKey = keys.entityKey( InstallationClass, input.applicationId);

                async.series([
                    function insertMongodb(callback){
                        store.get('mongodb').insert(installationCollection, input.installation, callback);
                    },
                    function insertRedis(callback) {
                        store.get('service').multi()
                            .hmset(installationKey, input.installation)
                            .hset(installationHash, input.installation.deviceToken, input.installation._id)
                            .zadd(entityKey, input.installation.updatedAt, input.installation._id)
                            .exec(callback);
                    }
                ], function done(error, results) {
                    callback(error, results[0][0]);
                });
            }
        }
    ], function done(error, results) {
        callback(error, results);
    });

};

exports.updateInstallation = function(input, callback) {
    var installationCollection = keys.collectionKey(InstallationClass, input.applicationId);
    var installationKey = keys.entityDetail(InstallationClass, input._id, input.applicationId);
    var entityKey = keys.entityKey( InstallationClass, input.applicationId);

    async.series([
        function updateMongoDB(callback){
            store.get('mongodb').update(installationCollection, {_id: input._id}, {$set:input.installation}, function(error, results) {
                if( results < 1 ) { return callback(errorCode.MISSING_ENTITY_ID, results);}

                callback(error, results);
            });
        },
        function updateRedis(callback) {
            store.get('service').multi()
                        .hmset(installationKey, input.installation)
                        .zadd(entityKey, input.installation.updatedAt, input._id)
                        .exec(callback);

        },
        function getInstallation(callback) {
            store.get('service').hgetall(installationKey, callback);
        }
    ], function done(error, results) {
        callback(error, results[2]);    // installation 정보만 리턴
    });
};

exports.deleteInstallation = function(input, callback) {
    var installationCollection = keys.collectionKey(InstallationClass, input.applicationId);
    var installationKey = keys.entityDetail(InstallationClass, input._id, input.applicationId);
};
