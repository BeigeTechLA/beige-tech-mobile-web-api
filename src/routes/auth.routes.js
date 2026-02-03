const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');

/**
 * ====================
 * PUBLIC ROUTES (No Authentication)
 * ====================
 */

// ===== REGISTRATION =====
router.post('/register', authController.register);
router.post('/quick-register', authController.quickRegister);

// ===== CREW MEMBER REGISTRATION (3 STEPS) =====
router.post('/register-crew-step1', authController.registerCrewMemberStep1);
router.post('/register-crew-step2', authController.registerCrewMemberStep2);
router.post('/register-crew-step3', authController.registerCrewMemberStep3);
router.get('/crew-member/:crew_member_id', authController.getCrewMemberDetails);

// ===== EMAIL VERIFICATION =====
router.post('/send-otp', authController.sendOTP);
router.post('/resend-otp', authController.resendOTP);
router.post('/verify-email', authController.verifyEmail);

// ===== LOGIN =====
router.post('/login', authController.login);

// ===== PASSWORD MANAGEMENT =====
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/change-password', authController.changePassword);

// ===== PERMISSIONS =====
router.get('/permissions/:role', authController.getPermissions);

/**
 * ====================
 * PROTECTED ROUTES (Authentication Required)
 * ====================
 */

// GET /auth/me - Get current user info
router.get('/me', authenticate, authController.getCurrentUser);

router.post('/change-password-client', authController.changePasswordclient);
router.post('/change-password-crew', authController.changePasswordCrewMember);

module.exports = router;