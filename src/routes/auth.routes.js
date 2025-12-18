const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');

/**
 * Public routes (no authentication required)
 */

// POST /auth/register - Register new user
router.post('/register', authController.register);

// POST /auth/login - Login with email/password
router.post('/login', authController.login);

// POST /auth/quick-register - Quick signup during booking
router.post('/quick-register', authController.quickRegister);

// GET /auth/permissions/:role - Get permissions for a role
router.get('/permissions/:role', authController.getPermissions);

/**
 * Protected routes (authentication required)
 */

// GET /auth/me - Get current user info
router.get('/me', authenticate, authController.getCurrentUser);

// OS ROUTES

router.post('/register-admin', authController.register);
router.post('/verify-email', authController.verifyEmail);
router.post('/login-admin', authController.login);
router.post('/change-password', authController.changePassword);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/register-crew-step1', authController.registerCrewMemberStep1);
router.post('/register-crew-step2', authController.registerCrewMemberStep2);
router.post('/register-crew-step3', authController.registerCrewMemberStep3);
router.get('/crew-member/:crew_member_id', authController.getCrewMemberDetails)

module.exports = router;