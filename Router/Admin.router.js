const express = require('express');
const router = express.Router();
const authController = require('../Controller/Admin.controller');

router.post('/login', authController.loginUser);

module.exports = router;