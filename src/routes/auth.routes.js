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

module.exports = router;
