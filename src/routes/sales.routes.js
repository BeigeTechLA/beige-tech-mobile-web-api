const express = require('express');
const router = express.Router();
const salesLeadsController = require('../controllers/sales-leads.controller');
const discountsController = require('../controllers/discounts.controller');
const paymentLinksController = require('../controllers/payment-links.controller');
const salesDashboardController = require('../controllers/sales-dashboard.controller');
const salesQuotesController = require('../controllers/sales-quotes.controller');
const { authenticate, requireSalesRepOrAdmin, requireSalesRep, requireAdmin } = require('../middleware/auth.middleware');

/**
 * Sales Routes
 * Base path: /api/sales
 * All routes require sales rep or admin authentication
 */

// =====================================================
// Lead Tracking Routes (Public - no auth required)
// =====================================================

/**
 * @route   POST /api/sales/leads/track-early-interest
 * @desc    Track early booking interest - create draft booking and lead
 * @access  Public
 */
router.post('/leads/track-early-interest', salesLeadsController.trackEarlyBookingInterest);

/**
 * @route   POST /api/sales/leads/track-start
 * @desc    Track booking start - create lead
 * @access  Public
 */
router.post('/leads/track-start', salesLeadsController.trackBookingStart);

/**
 * @route   POST /api/sales/leads/track-payment-page
 * @desc    Track when client reaches payment page
 * @access  Public
 */
router.post('/leads/track-payment-page', salesLeadsController.trackPaymentPageReached);

/**
 * @route   POST /api/sales/leads/contact-sales
 * @desc    Create sales-assisted lead when "Contact Sales" clicked
 * @access  Public
 */
router.post('/leads/contact-sales', salesLeadsController.createSalesAssistedLead);

// =====================================================
// Lead Management Routes (Requires Auth)
// =====================================================

/**
 * @route   GET /api/sales/leads
 * @desc    Get all leads with filters
 * @query   page, limit, status, lead_type, assigned_to, search
 * @access  Sales Rep / Admin
 */
router.get('/leads', authenticate, requireSalesRepOrAdmin, salesLeadsController.getLeads);
router.get('/client-leads', authenticate, requireSalesRepOrAdmin, salesLeadsController.getClientLeads);

/**
 * @route   GET /api/sales/leads/:id
 * @desc    Get lead details by ID
 * @access  Sales Rep / Admin
 */
router.get('/leads/:id', authenticate, requireSalesRepOrAdmin, salesLeadsController.getLeadById);
router.get('/client-leads/:id', authenticate, requireSalesRepOrAdmin, salesLeadsController.getClientLeadById);

/**
 * @route   PUT /api/sales/leads/:id/assign
 * @desc    Assign or reassign lead to sales rep
 * @body    sales_rep_id
 * @access  Sales Rep / Admin
 */
router.put('/leads/:id/assign', authenticate, requireSalesRepOrAdmin, salesLeadsController.assignLead);

/**
 * @route   PUT /api/sales/leads/:id/status
 * @desc    Update lead status
 * @body    status
 * @access  Sales Rep / Admin
 */
router.put('/leads/:id/status', authenticate, requireSalesRepOrAdmin, salesLeadsController.updateLeadStatus);
router.put('/client-leads/:id/status', authenticate, requireSalesRepOrAdmin, salesLeadsController.updateClientLeadStatus);
router.post(
  '/leads/:id/post-production-status-update',
  authenticate,
  requireSalesRepOrAdmin,
  salesLeadsController.sendPostProductionStatusUpdate
);
router.post(
  '/leads/:id/raw-footage-ready',
  authenticate,
  requireSalesRepOrAdmin,
  salesLeadsController.sendRawFootageReady
);
router.post(
  '/leads/:id/final-assets-delivered-without-revision',
  authenticate,
  requireSalesRepOrAdmin,
  salesLeadsController.sendFinalAssetsDeliveredWithoutRevision
);
router.post(
  '/leads/:id/revision-request-received',
  authenticate,
  requireSalesRepOrAdmin,
  salesLeadsController.sendRevisionRequestReceived
);
router.post(
  '/leads/:id/revised-content-delivered',
  authenticate,
  requireSalesRepOrAdmin,
  salesLeadsController.sendRevisedContentDelivered
);
router.post(
  '/leads/:id/final-assets-delivered-with-revision',
  authenticate,
  requireSalesRepOrAdmin,
  salesLeadsController.sendFinalAssetsDeliveredWithRevision
);
router.post(
  '/leads/:id/cp-confirmed',
  authenticate,
  requireSalesRepOrAdmin,
  salesLeadsController.confirmLeadCreativePartner
);
router.post(
  '/client-leads/:id/cp-confirmed',
  authenticate,
  requireSalesRepOrAdmin,
  salesLeadsController.confirmClientLeadCreativePartner
);

// =====================================================
// Discount Code Routes
// =====================================================

/**
 * @route   POST /api/sales/discount-codes
 * @desc    Generate discount code
 * @body    lead_id, booking_id, discount_type, discount_value, usage_type, max_uses, expires_at
 * @access  Sales Rep / Admin
 */
router.post('/discount-codes', authenticate, requireSalesRepOrAdmin, discountsController.generateDiscountCode);
router.post('/client-discount-codes', authenticate, requireSalesRepOrAdmin, discountsController.generateClientDiscountCode);

/**
 * @route   GET /api/sales/discount-codes/:code/validate
 * @desc    Validate discount code
 * @access  Public
 */
router.get('/discount-codes/:code/validate', discountsController.validateDiscountCode);

/**
 * @route   POST /api/sales/discount-codes/:code/apply
 * @desc    Apply discount code to quote/booking
 * @body    quote_id, booking_id, user_id, guest_email
 * @access  Public
 */
router.post('/discount-codes/:code/apply', discountsController.applyDiscountCode);

/**
 * @route   POST /api/sales/discount-codes/:code/clear
 * @desc    Clear discount code from quote/booking
 * @body    quote_id, booking_id
 * @access  Public
 */
router.post('/discount-codes/:code/clear', discountsController.clearDiscountCode);

/**
 * @route   GET /api/sales/discount-codes/:id
 * @desc    Get discount code details and statistics
 * @access  Sales Rep / Admin
 */
router.get('/discount-codes/:id', authenticate, requireSalesRepOrAdmin, discountsController.getDiscountCodeDetails);

/**
 * @route   DELETE /api/sales/discount-codes/:id
 * @desc    Deactivate discount code
 * @access  Sales Rep / Admin
 */
router.delete('/discount-codes/:id', authenticate, requireSalesRepOrAdmin, discountsController.deactivateDiscountCode);

/**
 * @route   GET /api/sales/discount-codes/:id/usage
 * @desc    Get discount code usage history
 * @access  Sales Rep / Admin
 */
router.get('/discount-codes/:id/usage', authenticate, requireSalesRepOrAdmin, discountsController.getDiscountCodeUsageHistory);

// =====================================================
// Payment Link Routes
// =====================================================

/**
 * @route   POST /api/sales/payment-links
 * @desc    Generate payment link
 * @body    lead_id, booking_id, discount_code_id, expiry_hours
 * @access  Sales Rep / Admin
 */
router.post('/payment-links', authenticate, requireSalesRepOrAdmin, paymentLinksController.generatePaymentLink);
router.post('/client-payment-links', authenticate, requireSalesRepOrAdmin, paymentLinksController.generateClientPaymentLink);
router.post('/preview-invoice', paymentLinksController.previewStripeInvoice);
router.get('/invoice-pdf/:booking_id', paymentLinksController.getStripeInvoicePdf);
router.post('/send-invoice', paymentLinksController.sendStripeInvoice);
router.post('/payment-links/notify', paymentLinksController.sendPaymentLinkEmail);
router.get('/get-lead-stats/:id', authenticate, requireSalesRepOrAdmin, salesLeadsController.getLeadFulfillmentStatus);
router.get('/get-client-lead-stats/:id', authenticate, requireSalesRepOrAdmin, salesLeadsController.getClientLeadFulfillmentStatus);

/**
 * @route   GET /api/sales/payment-links/:token
 * @desc    Get payment link details
 * @access  Public
 */
router.get('/payment-links/:token', paymentLinksController.getPaymentLinkDetails);

/**
 * @route   GET /api/sales/payment-links/:token/validate
 * @desc    Validate payment link
 * @access  Public
 */
router.get('/payment-links/:token/validate', paymentLinksController.validatePaymentLink);

/**
 * @route   POST /api/sales/payment-links/:token/mark-used
 * @desc    Mark payment link as used after payment
 * @access  Public
 */
router.post('/payment-links/:token/mark-used', paymentLinksController.markLinkAsUsed);

/**
 * @route   GET /api/sales/payment-links/rep/:repId
 * @desc    Get payment links for specific sales rep
 * @query   status (all, active, used, expired)
 * @access  Sales Rep / Admin
 */
router.get('/payment-links/rep/:repId', authenticate, requireSalesRepOrAdmin, paymentLinksController.getSalesRepPaymentLinks);

// =====================================================
// Sales Dashboard Routes
// =====================================================

/**
 * @route   GET /api/sales/dashboard/stats
 * @desc    Get dashboard overview statistics
 * @query   period (7days, 30days, 90days), sales_rep_id
 * @access  Sales Rep / Admin
 */
router.get('/dashboard/stats', authenticate, requireSalesRepOrAdmin, salesDashboardController.getDashboardStats);

/**
 * @route   GET /api/sales/dashboard/rep-stats/:repId
 * @desc    Get sales rep performance statistics
 * @query   period (7days, 30days, 90days)
 * @access  Sales Rep / Admin
 */
router.get('/dashboard/rep-stats/:repId', authenticate, requireSalesRepOrAdmin, salesDashboardController.getSalesRepStats);

/**
 * @route   GET /api/sales/dashboard/sales-reps
 * @desc    Get all sales reps with workload
 * @access  Admin
 */
router.get('/dashboard/sales-reps', authenticate, requireAdmin, salesDashboardController.getSalesRepsWorkload);

/**
 * @route   GET /api/sales/dashboard/recent-activities
 * @desc    Get recent activities across all leads
 * @query   limit, sales_rep_id
 * @access  Sales Rep / Admin
 */
router.get('/dashboard/recent-activities', authenticate, requireSalesRepOrAdmin, salesDashboardController.getRecentActivities);

/**
 * @route   GET /api/sales/dashboard/funnel
 * @desc    Get leads funnel data
 * @query   period (7days, 30days, 90days), sales_rep_id
 * @access  Sales Rep / Admin
 */
router.get('/dashboard/funnel', authenticate, requireSalesRepOrAdmin, salesDashboardController.getLeadsFunnelData);

// =====================================================
// Quote Builder Routes
// =====================================================

router.get('/client-dropdown', authenticate, requireSalesRepOrAdmin, salesQuotesController.getClientDropdown);
router.get('/quotes/catalog', authenticate, requireSalesRepOrAdmin, salesQuotesController.getCatalog);
router.get('/quotes/shoot-types/:content_type', authenticate, requireSalesRepOrAdmin, salesQuotesController.getShootTypes);
router.post('/quotes/shoot-types', authenticate, requireAdmin, salesQuotesController.createShootType);
router.put('/quotes/shoot-types/:shootTypeId', authenticate, requireAdmin, salesQuotesController.updateShootType);
router.delete('/quotes/shoot-types/:shootTypeId', authenticate, requireAdmin, salesQuotesController.deleteShootType);
router.post('/quotes/catalog', authenticate, requireAdmin, salesQuotesController.createCatalogItem);
router.put('/quotes/catalog/:catalogItemId', authenticate, requireAdmin, salesQuotesController.updateCatalogItem);
router.delete('/quotes/catalog/:catalogItemId', authenticate, requireAdmin, salesQuotesController.deleteCatalogItem);

router.get('/quotes/dashboard', authenticate, requireSalesRepOrAdmin, salesQuotesController.getQuoteDashboard);
router.get('/quotes', authenticate, requireSalesRepOrAdmin, salesQuotesController.listQuotes);
router.get('/quotes/:quoteId', authenticate, requireSalesRepOrAdmin, salesQuotesController.getQuoteById);
router.post('/quotes', authenticate, requireSalesRepOrAdmin, salesQuotesController.createQuote);
router.put('/quotes/:quoteId', authenticate, requireSalesRepOrAdmin, salesQuotesController.updateQuote);
router.patch('/quotes/:quoteId/status', authenticate, requireSalesRepOrAdmin, salesQuotesController.updateQuoteStatus);

/**
 * @route   PATCH /api/bookings/:bookingId/crew
 * @desc    Update the crew assigned to a booking   
 * @param   bookingId - ID of the booking to update
 * @body    crew - Array of crew member objects to assign
 * @access  Private (requires authentication)
 */
router.patch(
  '/bookings/:bookingId/crew',
  salesLeadsController.updateBookingCrew,
);

router.post('/leads/intent', authenticate, requireSalesRepOrAdmin, salesLeadsController.updateLeadIntent);
router.post('/client-leads/intent', authenticate, requireSalesRepOrAdmin, salesLeadsController.updateClientLeadIntent);
router.put('/leads/:id/booking', authenticate, requireSalesRepOrAdmin, salesLeadsController.finalizeGuestBooking);
router.put('/client-leads/:id/booking', authenticate, requireSalesRepOrAdmin, salesLeadsController.finalizeClientLeadBooking);
router.post('/deals/finalize', salesLeadsController.finalizeCreateDeal);

module.exports = router;
