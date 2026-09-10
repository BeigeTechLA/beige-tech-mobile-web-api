const express = require('express');
const router = express.Router();
const guestBookingsController = require('../controllers/guest-bookings.controller');
const pricingController = require('../controllers/pricing.controller');
const salesLeadsController = require('../controllers/sales-leads.controller');
const { optionalAuth } = require('../middleware/auth.middleware');

/**
 * Book-a-shoot v4 routes.
 *
 * These intentionally keep v4 on its own public URL surface while delegating to
 * the same stable booking, lead, and pricing controllers used by v3.
 */

router.post('/sales/leads/track-early-interest', salesLeadsController.trackEarlyBookingInterest);

router.post('/guest-bookings/create', guestBookingsController.createGuestBooking);
router.put('/guest-bookings/:id', guestBookingsController.updateGuestBooking);
router.get('/guest-bookings/:id', guestBookingsController.getGuestBookingById);
router.post('/guest-bookings/:id/assign-creators', guestBookingsController.assignCreatorsToBooking);
router.get('/guest-bookings/:id/payment-details', optionalAuth, guestBookingsController.getBookingPaymentDetails);

router.post('/pricing/quotes', optionalAuth, pricingController.saveQuote);
router.post('/pricing/calculate-from-creators', pricingController.calculateFromCreators);

module.exports = router;
