var express = require('express');
var router = express.Router();

var user = require('../controllers/user');
var installation = require('../controllers/installation');

// User
router.post('/signup', user.signup);
router.get('/login', user.login);
router.get('/validtoken', user.validtoken);

router.get('/logout/me', user.logout);
router.get('/logout/other', user.logoutOther);
router.get('/logout/all', user.logoutAll);

// Installation
router.post('/installation', installation.create);
router.put('/installation/:_id', installation.update);
router.delete('/installation/:_id', installation.delete);

module.exports = router;


