const express = require('express');
const router = express.Router();
const paymentsController = require('../controllers/payments.controller');
const { authenticate, optionalAuth } = require('../middleware/auth.middleware');

/**
 * @route   POST /api/payments/create-intent
 * @desc    Create Stripe payment intent
 * @access  Public (with optional auth for tracking)
 */
router.post('/create-intent', optionalAuth, paymentsController.createPaymentIntent);

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

module.exports = router;
