const express = require('express');
const router = express.Router();
const authController = require('../Controller/Register.controller');

router.post('/register', authController.registerUser);
router.post('/login', authController.loginUser);
router.get('/user/:username', authController.getUserDetails);
router.put('/user/:username', authController.updateUserDetails);

module.exports = router;