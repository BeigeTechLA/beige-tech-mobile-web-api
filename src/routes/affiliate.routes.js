const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const affiliateController = require('../controllers/affiliate.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAnyPermission } = require('../middleware/permission.middleware');

const crewAffiliateView = requireAnyPermission(['creative_partner_affiliate.view'], { allowRoles: ['creative'] });
const affiliateDashboardView = requireAnyPermission([
  'client_affiliate_overview.view',
  'creative_partner_affiliate.view'
], { allowRoles: ['client', 'creative'] });
const affiliateReferralsView = requireAnyPermission([
  'client_affiliate_overview.view',
  'creative_partner_affiliate.view'
], { allowRoles: ['client', 'creative'] });
const affiliateIdentityView = requireAnyPermission([
  'client_dashboard.view',
  'creative_partner_affiliate.view'
], { allowRoles: ['client', 'creative'] });

const disputeUploadDir = path.join(__dirname, '../../public/uploads/media');
fs.mkdirSync(disputeUploadDir, { recursive: true });
const disputeUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, disputeUploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '');
      const base = path.basename(file.originalname || 'dispute-attachment', ext).replace(/[^a-z0-9_-]/gi, '_');
      cb(null, `${base}_${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 }
});

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
router.get('/me', authenticate, affiliateIdentityView, affiliateController.getMyAffiliate);

/**
 * @route   GET /api/affiliates/dashboard
 * @desc    Get affiliate dashboard stats
 * @access  Private (requires authentication)
 */
router.get('/dashboard', authenticate, affiliateDashboardView, affiliateController.getDashboardStats);

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
router.get('/referrals', authenticate, affiliateReferralsView, affiliateController.getReferralHistory);

/**
 * @route   GET /api/affiliates/transactions
 * @desc    Get affiliate finance transactions
 * @query   page, limit, search, status, transaction_type, payment_method, date_from, date_to
 * @access  Private (requires authentication)
 */
router.get('/transactions', authenticate, affiliateReferralsView, affiliateController.getAffiliateTransactions);

/**
 * @route   GET /api/affiliates/disputes
 * @desc    List affiliate disputes
 * @access  Private (requires authentication)
 */
router.get('/disputes', authenticate, affiliateReferralsView, affiliateController.listDisputes);

/**
 * @route   GET /api/affiliates/disputes/:disputeId
 * @desc    Get affiliate dispute details
 * @access  Private (requires authentication)
 */
router.get('/disputes/:disputeId', authenticate, affiliateReferralsView, affiliateController.getDisputeDetails);

/**
 * @route   POST /api/affiliates/disputes/:disputeId/comments
 * @desc    Add comment to affiliate dispute
 * @access  Private (requires authentication)
 */
router.post('/disputes/:disputeId/comments', authenticate, affiliateReferralsView, affiliateController.addDisputeComment);

/**
 * @route   POST /api/affiliates/disputes/:disputeId/attachments
 * @desc    Add attachment to affiliate dispute
 * @access  Private (requires authentication)
 */
router.post(
  '/disputes/:disputeId/attachments',
  authenticate,
  affiliateReferralsView,
  disputeUpload.fields([{ name: 'attachment', maxCount: 5 }, { name: 'attachments', maxCount: 10 }, { name: 'file', maxCount: 5 }]),
  affiliateController.addDisputeAttachment
);

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

