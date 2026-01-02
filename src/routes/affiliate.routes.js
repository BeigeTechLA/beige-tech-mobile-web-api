const express = require('express');
const router = express.Router();
const affiliateController = require('../controllers/affiliate.controller');
const { authenticate } = require('../middleware/auth.middleware');

/**
 * Affiliate Routes
 * Base path: /api/affiliates
 */

// ============================================================================
// PUBLIC ENDPOINTS
// ============================================================================

/**
 * @route   GET /api/affiliates/validate/:code
 * @desc    Validate a referral code
 * @access  Public
 */
router.get('/validate/:code', affiliateController.validateReferralCode);

// ============================================================================
// AUTHENTICATED USER ENDPOINTS
// ============================================================================

/**
 * @route   GET /api/affiliates/me
 * @desc    Get current user's affiliate info
 * @access  Private (requires authentication)
 */
router.get('/me', authenticate, affiliateController.getMyAffiliate);

/**
 * @route   GET /api/affiliates/dashboard
 * @desc    Get affiliate dashboard stats
 * @access  Private (requires authentication)
 */
router.get('/dashboard', authenticate, affiliateController.getDashboardStats);

/**
 * @route   PUT /api/affiliates/payout-details
 * @desc    Update affiliate payout details
 * @access  Private (requires authentication)
 */
router.put('/payout-details', authenticate, affiliateController.updatePayoutDetails);

/**
 * @route   GET /api/affiliates/referrals
 * @desc    Get affiliate's referral history
 * @query   page, limit, status
 * @access  Private (requires authentication)
 */
router.get('/referrals', authenticate, affiliateController.getReferralHistory);

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

/**
 * @route   GET /api/affiliates/admin/list
 * @desc    Get all affiliates (admin only)
 * @query   status, page, limit, search
 * @access  Private (requires admin authentication)
 */
router.get('/admin/list', authenticate, affiliateController.getAllAffiliates);

/**
 * @route   GET /api/affiliates/admin/:id
 * @desc    Get affiliate by ID (admin only)
 * @access  Private (requires admin authentication)
 */
router.get('/admin/:id', authenticate, affiliateController.getAffiliateById);

/**
 * @route   PATCH /api/affiliates/admin/:id/status
 * @desc    Update affiliate status (admin only)
 * @body    status: 'active' | 'paused' | 'suspended'
 * @access  Private (requires admin authentication)
 */
router.patch('/admin/:id/status', authenticate, affiliateController.updateAffiliateStatus);

/**
 * @route   POST /api/affiliates/admin/approve-payout
 * @desc    Approve payout for referrals (admin only)
 * @body    affiliate_id, referral_ids (optional), notes
 * @access  Private (requires admin authentication)
 */
router.post('/admin/approve-payout', authenticate, affiliateController.approvePayout);

/**
 * @route   PATCH /api/affiliates/admin/payouts/:id/paid
 * @desc    Mark payout as paid (admin only)
 * @body    transaction_reference, notes
 * @access  Private (requires admin authentication)
 */
router.patch('/admin/payouts/:id/paid', authenticate, affiliateController.markPayoutPaid);

/**
 * @route   GET /api/affiliates/admin/payouts
 * @desc    Get all payouts (admin only)
 * @query   status, page, limit
 * @access  Private (requires admin authentication)
 */
router.get('/admin/payouts', authenticate, affiliateController.getAllPayouts);

/**
 * @route   PUT /api/affiliates/update/referral
 * @query   status, page, limit
 * @access  Private (requires admin authentication)
 */
router.put('/update/referral', affiliateController.updateReferralCode);

module.exports = router;

