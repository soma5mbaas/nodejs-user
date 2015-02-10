var express = require('express');
var router = express.Router();

var user = require('../controllers/user');
var installation = require('../controllers/installation');

// User
router.post('/users', user.signup);     // signing up, linking users
router.put('/users/:_id', user.update);      // updating users, linking users, verifying email
router.delete('/users/:_id', user.delete);   // delete users
router.get('/users/:_id', user.retrieve);  //  validating Session Tokens, retreiving current user

router.get('/login', user.login);
router.get('/logout/me', user.logout);
router.get('/logout/other', user.logoutOther);
router.get('/logout/all', user.logoutAll);

// Installation
router.post('/installations', installation.create);
router.put('/installations/:_id', installation.update);
router.delete('/installations/:_id', installation.delete);

router.delete('/installations/:_id/channels', installation.deleteChannel);
router.post('/installations/:_id/channels', installation.createChannel);

module.exports = router;


