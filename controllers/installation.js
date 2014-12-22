var util = require('haru-nodejs-util');
var getHeader = util.common.getHeader;
var sendError = util.common.sendError;

var handler = require('../handlers/installation');
var schema = require('../handlers/schema');

var uuid = require('uuid');

exports.create = function (req, res) {
    var input = getHeader(req);

    // Installation Entity
    input.installation = req.body;
    input.installation.createdAt = input.installation.updatedAt = input.timestamp;

    handler.createInstallation(input, function(error, installation) {
        if(error) { return sendError(res, error); }
        if(installation === null) { return sendError(res, errorCode.OTHER_CAUSE); }

        schema.createInstallationSchema(input.applicationId, installation);

        res.json(installation);
    });
};

exports.update = function(req, res) {
    // Header
    var input = getHeader(req);

    // Installation Entity
    input.installation = req.body;
    input.installation.updatedAt = input.timestamp;

    handler.createInstallation(input, function(error, installation) {
        if(error) { return sendError(res, error); }
        if(installation === null) { return sendError(res, errorCode.OTHER_CAUSE); }

        schema.createInstallationSchema(input.applicationId, installation);

        res.json(installation);
    });
};

// TODO master-key 만 가능하도록 수정
exports.delete = function(req, res) {
    res.json({success: false});
};
