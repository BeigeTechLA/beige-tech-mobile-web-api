const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const { requireAnyPermission } = require('../middleware/permission.middleware');

const clientFinancesEdit = requireAnyPermission(['client_finances.edit'], { allowRoles: ['client'] });
const adminUsersCreate = requireAnyPermission(['admin_users_all_users.create']);

/**
 * ====================
 * PUBLIC ROUTES (No Authentication)
 * ====================
 */

// ===== REGISTRATION =====
router.post('/register', authController.register);
router.post('/quick-register', authController.quickRegister);
router.post('/register-sales', authController.registerSales);
router.post('/register-sales-admin', authController.registerSalesAdmin);

// ===== CREW MEMBER REGISTRATION (3 STEPS) =====
router.post('/register-crew-step1', authController.registerCrewMemberStep1);
router.post('/register-crew-step2', authController.registerCrewMemberStep2);
router.post('/register-crew-step3-file', authController.uploadCrewMemberStep3File);
router.post('/register-crew-step3', authController.registerCrewMemberStep3);
router.get('/crew-member/:crew_member_id', authController.getCrewMemberDetails);

// ===== EMAIL VERIFICATION =====
router.post('/send-otp', authController.sendOTP);
router.post('/resend-otp', authController.resendOTP);
router.post('/verify-email', authController.verifyEmail);

// ===== LOGIN =====
router.post('/login', authController.login);
router.post('/google', authController.googleLogin);
router.post('/refresh', authController.refreshSession);
router.post('/logout', authController.logout);

// ===== PASSWORD MANAGEMENT =====
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/admin/generate-reset-link', authController.generateUserResetLinkForAdmin);
router.post('/change-password', authenticate, authController.changePassword);

// ===== PERMISSIONS =====
router.get('/permissions/:role', authController.getPermissions);

/**
 * ====================
 * PROTECTED ROUTES (Authentication Required)
 * ====================
 */

// GET /auth/me - Get current user info
router.get('/me', authenticate, authController.getCurrentUser);
router.patch('/timezone', authenticate, authController.updateTimezone);
router.get('/onboarding-status', authenticate, authController.getOnboardingStatus);
router.post('/cp-event-location/confirm', authenticate, authController.confirmCpEventLocation);
router.post('/admin/create-internal-credential', authenticate, adminUsersCreate, authController.createInternalCredential);

router.post('/change-password-client', authenticate, clientFinancesEdit, authController.changePasswordclient);
router.post('/change-password-crew', authenticate, authController.changePasswordCrewMember);
router.post('/password-expiry/request-otp', authenticate, authController.requestPasswordExpiryOtp);
router.post('/password-expiry/verify-otp', authenticate, authController.verifyPasswordExpiryOtp);
router.post('/password-expiry/change', authenticate, authController.changeExpiredPassword);

module.exports = router;
