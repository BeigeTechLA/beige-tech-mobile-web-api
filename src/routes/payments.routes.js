const express = require('express');
const router = express.Router();
const paymentsController = require('../controllers/payments.controller');
const offlineCustomerPaymentsController = require('../controllers/offline-customer-payments.controller');
const paymentLinksController = require('../controllers/payment-links.controller');
const { authenticate, optionalAuth, optionalAuthenticate, requireSalesRepOrAdmin } = require('../middleware/auth.middleware');

/**
 * @route   POST /api/payments/create-intent
 * @desc    Create Stripe payment intent
 * @access  Public (with optional auth for tracking)
 */
router.post('/create-intent', optionalAuth, paymentsController.createPaymentIntent);

/**
 * @route   POST /api/payments/offline/bookings/:bookingId/payment-link
 * @desc    Get or create an offline payment link for the authenticated booking owner
 * @access  Authenticated customer or verified guest booking owner
 */
router.post(
  '/offline/bookings/:bookingId/payment-link',
  optionalAuthenticate,
  paymentLinksController.getOrCreateCustomerBookingPaymentLink
);

// Public customer payment-link flow. The token authorizes access to its booking only.
router.get('/offline/:token/instructions', offlineCustomerPaymentsController.getInstructions);
router.post('/offline/:token/confirmations', ...offlineCustomerPaymentsController.submitConfirmation);

// Internal review flow; intentionally separate from the existing manual-payment routes.
router.get('/offline/submissions', authenticate, requireSalesRepOrAdmin, offlineCustomerPaymentsController.listSubmissions);
router.get('/offline/submissions/:id', authenticate, requireSalesRepOrAdmin, offlineCustomerPaymentsController.getSubmission);
router.patch('/offline/submissions/:id', authenticate, requireSalesRepOrAdmin, offlineCustomerPaymentsController.reviewSubmission);

/**
 * @route   POST /api/payments/confirm
 * @desc    Confirm payment and create booking
 * @access  Public (with optional auth for user tracking)
 */
router.post('/confirm', optionalAuth, paymentsController.confirmPayment);

/**
 * @route   GET /api/payments/:id/status
 * @desc    Get payment status by payment_id or confirmation_number
 * @access  Public
 */
router.get('/:id/status', paymentsController.getPaymentStatus);

/**
 * @route   POST /api/payments/create-intent-multi
 * @desc    Create Stripe payment intent for multi-creator booking
 * @access  Public
 */
router.post('/create-intent-multi', optionalAuth, paymentsController.createPaymentIntentMulti);

/**
 * @route   POST /api/payments/confirm-multi
 * @desc    Confirm multi-creator payment and update booking
 * @access  Public
 */
router.post('/confirm-multi', optionalAuth, paymentsController.confirmPaymentMulti);

/**
 * @route   POST /api/payments/manual-webhook-paid
 * @desc    Local/dev helper to simulate Stripe invoice.paid webhook
 * @access  Sales Rep / Admin
 */
router.post('/manual-webhook-paid', optionalAuth, paymentsController.manualMarkWebhookPaid);

module.exports = router;
