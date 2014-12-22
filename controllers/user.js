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

    if( input.userinfo.authData ) {
        // social signup, login
        schemaHandler.createUserSchema(input.applicationId, input.userinfo);
        userHandler.signupSocial(input, function(error, results) {
            if(error) { return sendError(res, error); }

            res.json(results);
        });
    } else {
        // default signup
        schemaHandler.createUserSchema(input.applicationId, input.userinfo);
        userHandler.signup(input, function(error, results) {
            if(error) { return sendError(res, error); }

            res.json(results);
        });
    }
};

exports.login = function(req, res) {
    var input = getHeader(req);

    input.userinfo = {
        username: req.query.username,
        password: req.query.password,
    };

    input.deviceToken = req.query.deviceToken;

    userHandler.login(input, function(error, result) {
        if(error) { return sendError(res, error); }

        res.json(result);
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


exports.update = function(req, res) {
    var input = getHeader(req);

    input._id = req.params._id;
    input.userinfo = req.body;

    delete input.userinfo.username;
    delete input.userinfo.password;
    delete input.userinfo.createdAt;

    input.userinfo.updatedAt = input.timestamp;

    schemaHandler.createUserSchema(input.applicationId, input.userinfo);
    userHandler.update(input, function(error, results) {
        if( error ) { return sendError(res, error); }

        res.json({updatedAt: input.timestamp});
    });
};

exports.delete = function(req, res) {
    var input = getHeader(req);
    input.userinfo ={_id : req.params._id };

    if( !input.userinfo._id ) { return sendError(res, errorCode.MISSING_ENTITY_ID); }
    if( !input.sessionToken ) { return sendError(res, errorCode.SESSION_MISSING); }

    userHandler.delete(input, function(error, results) {
        if(error) return sendError(res, error);

        res.json({success: true});
    });
};

exports.retrieve = function(req, res) {
    var input = getHeader(req);
    input.userinfo ={_id : req.params._id };

    if( input.userinfo._id === 'me') {
        userHandler.validSessionToken(input, function(error, results) {
            if(error) return sendError(res, error);
            res.json(results);
        });
    } else {
        userHandler.retrieve(input, function(error, results) {
            if(error) return sendError(res, error);
            res.json(results);
        });
    }
};