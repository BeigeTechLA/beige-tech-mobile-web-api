const express = require('express');
const router = express.Router();
const waitlistController = require('../controllers/waitlist.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

/**
 * @route   POST /api/waitlist/join
 * @desc    Join waitlist
 * @access  Public
 */
router.post('/join', waitlistController.joinWaitlist);

/**
 * @route   GET /api/waitlist
 * @desc    Get all waitlist entries (admin only)
 * @access  Private (Admin)
 */
router.get('/', authenticate, authorize('admin'), waitlistController.getWaitlist);

/**
 * @route   PATCH /api/waitlist/:id/status
 * @desc    Update waitlist entry status (admin only)
 * @access  Private (Admin)
 */
router.patch('/:id/status', authenticate, authorize('admin'), waitlistController.updateWaitlistStatus);

module.exports = router;
