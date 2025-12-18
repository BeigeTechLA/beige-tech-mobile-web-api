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

module.exports = router;
