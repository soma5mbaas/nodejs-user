var express = require('express');
var bodyParser = require('body-parser');

var store = require('haru-nodejs-store');


var index = require('./routes/index');
var routeV1 = require('./routes/routeV1');

var app = express();


store.connect(require('./config').store);


app.use(bodyParser.json());
app.use(bodyParser.urlencoded());


app.use('/', index);
app.use('/1', routeV1);


module.exports = app;

