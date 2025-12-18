const express = require('express');
const router = express.Router();
const pricingController = require('../controllers/pricing.controller');
const { authenticate } = require('../middleware/auth.middleware');

/**
 * Pricing Routes
 * Base path: /api/pricing
 */

/**
 * @route   POST /api/pricing/calculate
 * @desc    Calculate pricing breakdown for creators + equipment
 * @body    creatorIds - array of crew_member_ids
 * @body    equipmentIds - array of equipment_ids
 * @body    hours - number of hours
 * @body    days - number of days
 * @body    beigeMarginPercent - margin percentage (default: 15)
 * @access  Public (no auth required for estimates)
 */
router.post('/calculate', pricingController.calculatePricing);

/**
 * @route   GET /api/pricing/estimate/:bookingId
 * @desc    Get pricing estimate for a booking
 * @param   bookingId - stream_project_booking_id
 * @access  Private (requires authentication)
 */
router.get('/estimate/:bookingId', authenticate, pricingController.getBookingEstimate);

/**
 * @route   GET /api/pricing/example
 * @desc    Get example pricing breakdown
 * @query   creatorHourlyRate - example hourly rate (default: 100)
 * @query   equipmentDailyRate - example daily rate (default: 50)
 * @query   hours - number of hours (default: 3)
 * @query   beigeMarginPercent - margin percentage (default: 15)
 * @access  Public
 */
router.get('/example', pricingController.getPricingExample);

module.exports = router;
