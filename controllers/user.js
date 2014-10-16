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
    input.userinfo.createAt = input.userinfo.updateAt = input.timestamp;

    schemaHandler.createSchema(input.applicationId, input.userinfo);
    userHandler.signup(input, function(error, results) {
        if(error) { return sendError(res, error); }
        var output = {};

        output.createAt = output.updateAt = input.timestamp;
        output.sessionToken = results;

        res.json(output);
    });
};

exports.login = function(req, res) {
    var input = getHeader(req);

    input.userinfo = {
        username: req.query.username,
        password: req.query.password
    };

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
