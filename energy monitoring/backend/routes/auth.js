const express = require('express');
const router  = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');
const {
  validateLogin,
  validateRegister,
  validateOTPRequest,
  validateOTPVerify,
} = require('../middleware/validate');

router.post('/login',      validateLogin,      authController.login);
router.post('/register',   validateRegister,   authController.register);
router.post('/send-otp',   validateOTPRequest, authController.sendOTP);
router.post('/verify-otp', validateOTPVerify,  authController.verifyOTP);
router.post('/logout',                         authController.logout);
router.get('/users',       authenticateToken,  authController.getAllUsers); // admin only

module.exports = router;
