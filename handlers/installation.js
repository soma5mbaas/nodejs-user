var async = require('async');
var uuid = require('uuid');


var redisService = require('../connectors').redisService;
var redisPublic = require('../connectors').redisPublic;
var mongodb = require('../connectors').mongodb;

var keys = require('haru-nodejs-util').keys;

var InstallationClass = 'Installations';


exports.createInstallation = function(input, callback) {
    var installationCollection = keys.collectionKey(InstallationClass, input.applicationId);

    async.waterfall([
        function isExists(callback) {
            mongodb.find(installationCollection, {deviceToken: input.installation.deviceToken}, function(error, results) {
                callback(error, results);
            });
        },
        function insertInstallation(installations, callback){
            if(installations.length > 0) { return callback(null, installations[0]); }

            input.installation._id = uuid();
            var installationKey = keys.entityDetail(InstallationClass, input.installation._id, input.applicationId);
            var installationHash = keys.installationKey(input.applicationId);
            var entityKey = keys.entityKey( InstallationClass, input.applicationId);

            async.series([
                function insertMongodb(callback){
                    mongodb.insert(installationCollection, input.installation, callback);
                },
                function addClasse(callback) {
                    var classesKey = keys.classesKey(input.applicationId);

                    redisPublic.sadd(classesKey, InstallationClass, callback);
                },
                function insertRedis(callback) {
                    redisService.multi()
                                .hmset(installationKey, input.installation)
                                .hset(installationHash, input.installation.deviceToken, input.installation._id)
                                .zadd(entityKey, input.installation.updateAt, input.installation._id)
                                .exec(callback);
                }
            ], function done(error, results) {
                callback(error, results[0][0]);
            });
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
            mongodb.update(installationCollection, {_id: input._id}, {$set:input.installation}, function(error, results) {
                if( results < 1 ) { return callback(errorCode.MISSING_ENTITY_ID, results);}

                callback(error, results);
            });
        },
        function updateRedis(callback) {
            redisService.multi()
                        .hmset(installationKey, input.installation)
                        .zadd(entityKey, input.installation.updateAt, input._id)
                        .exec(callback);

        },
        function getInstallation(callback) {
            redisService.hgetall(installationKey, callback);
        }
    ], function done(error, results) {
        callback(error, results[2]);    // installation 정보만 리턴
    });
};

exports.deleteInstallation = function(input, callback) {
    var installationCollection = keys.collectionKey(InstallationClass, input.applicationId);
    var installationKey = keys.entityDetail(InstallationClass, input._id, input.applicationId);
};
