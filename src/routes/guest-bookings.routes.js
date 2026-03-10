const express = require('express');
const router = express.Router();
const guestBookingsController = require('../controllers/guest-bookings.controller');

/**
 * Guest Booking Routes
 * Base path: /api/guest-bookings
 * No authentication required - public access
 */

/**
 * @route   POST /api/guest-bookings/create
 * @desc    Create a new guest booking without authentication
 * @body    order_name (required), guest_email (required),
 *          project_type, content_type, shoot_type, edit_type,
 *          description, event_type, start_date_time, duration_hours, end_time,
 *          budget_min, budget_max, expected_viewers, stream_quality, crew_size,
 *          location, streaming_platforms, crew_roles, skills_needed,
 *          equipments_needed, is_draft
 * @access  Public (no authentication required)
 */
router.post('/create', guestBookingsController.createGuestBooking);

/**
 * @route   GET /api/guest-bookings/:id
 * @desc    Get a guest booking by ID
 * @params  id - booking ID
 * @access  Public (no authentication required)
 */
router.get('/:id', guestBookingsController.getGuestBookingById);

/**
 * @route   PUT /api/guest-bookings/:id
 * @desc    Update a guest booking (convert draft to final)
 * @params  id - booking ID
 * @body    booking data to update
 * @access  Public (no authentication required)
 */
router.put('/:id', guestBookingsController.updateGuestBooking);

/**
 * @route   POST /api/guest-bookings/:id/assign-creators
 * @desc    Assign creators to a guest booking
 * @body    creator_ids - array of creator IDs
 * @params  id - booking ID
 * @access  Public (no authentication required)
 */
router.post('/:id/assign-creators', guestBookingsController.assignCreatorsToBooking);

/**
 * @route   GET /api/guest-bookings/:id/payment-details
 * @desc    Get booking with assigned creators and payment details
 * @query   creator_id - optional creator ID to assign
 * @params  id - booking ID
 * @access  Public (no authentication required)
 */
router.get('/:id/payment-details', guestBookingsController.getBookingPaymentDetails);

module.exports = router;
