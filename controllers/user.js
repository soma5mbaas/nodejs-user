var async = require('async');
var uuid = require('uuid');


var userHandler = require('../handlers/user');
var schemaHandler = require('../handlers/schema');


var getHeader = require('haru-nodejs-util').common.getHeader;
var parseToJson = require('haru-nodejs-util').common.parseToJson;
var sendError = require('haru-nodejs-util').common.sendError;


exports.signup = function(req, res) {
    var input = getHeader(req);

    input.userinfo = req.body;
    input.userinfo._id = uuid();
    input.userinfo.createdAt = input.userinfo.updatedAt = input.timestamp;

    schemaHandler.createUserSchema(input.applicationId, input.userinfo);
    userHandler.signup(input, function(error, results) {
        if(error) { return sendError(res, error); }
        var output = {};

        output.createdAt = output.updatedAt = input.timestamp;
        output.sessionToken = results;
        output._id = input.userinfo._id;

        res.json(output);
    });
};

exports.login = function(req, res) {
    var input = getHeader(req);

    input.userinfo = {
        username: req.query.username,
        password: req.query.password
    };

    input.deviceToken = req.query.deviceToken;

    userHandler.login(input, function(error, result) {
        if(error) { return sendError(res, error); }

        res.json({sessionToken: result});
    });
};

exports.validtoken = function(req, res) {
    var input = getHeader(req);

    userHandler.validSessionToken(input, function(error, results) {
        if(error) return sendError(res, error);

        delete results.password;

        res.json(results);
    });
};

exports.logout = function(req, res) {
    var input = getHeader(req);

    // logout 옵션
    input.type = 'me';

    if( !input.sessionToken ) { return sendError(res, errorCode.SESSION_MISSING); }

    userHandler.logout(input, function(error, result) {
        if( error ) { return sendError(res, error); }

        res.json({success: true});
    });
};

exports.logoutAll = function(req, res) {
    var input = getHeader(req);

    // logout 옵션
    input.type = 'all';

    if( !input.sessionToken ) { return sendError(res, errorCode.SESSION_MISSING); }

    userHandler.logout(input, function(error, result) {
        if( error ) { return sendError(res, error); }

        res.json({success: true});
    });
};

exports.logoutOther = function(req, res) {
    var input = getHeader(req);

    // logout 옵션
    input.type = 'other';
    if( !input.sessionToken ) { return sendError(res, errorCode.SESSION_MISSING); }

    userHandler.logout(input, function(error, result) {
        if( error ) { return sendError(res, error); }

        res.json({success: true});
    });

};
