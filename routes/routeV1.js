var express = require('express');
var router = express.Router();
var user = require('../controllers/user');


// user accout
router.post('/signup', user.signup);
router.get('/login', user.login);
router.get('/validtoken', user.validtoken);


module.exports = router;


