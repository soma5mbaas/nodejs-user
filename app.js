var express = require('express');
var bodyParser = require('body-parser');

var store = require('haru-nodejs-store');
var analysis = require('haru-nodejs-analysis');


var index = require('./routes/index');
var routeV1 = require('./routes/routeV1');

var app = express();


store.connect(config.store);


app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(analysis({analysis: config.mqueue.analysis}));


app.use('/', index);
app.use('/1', routeV1);


module.exports = app;

