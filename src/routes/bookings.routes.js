const express = require('express');
const router = express.Router();
const bookingsController = require('../controllers/bookings.controller');
const { authenticate } = require('../middleware/auth.middleware');

/**
 * Booking Management Routes
 * Base path: /api/bookings
 * All routes require authentication
 */

/**
 * @route   POST /api/bookings/create
 * @desc    Create a new booking from modal data
 * @body    order_name, project_type, content_type, shoot_type, edit_type,
 *          description, event_type, start_date_time, duration_hours, end_time,
 *          budget_min, budget_max, expected_viewers, stream_quality, crew_size,
 *          location, streaming_platforms, crew_roles, skills_needed,
 *          equipments_needed, is_draft
 * @access  Private (requires authentication)
 */
router.post('/create', authenticate, bookingsController.createBooking);

/**
 * @route   GET /api/bookings
 * @desc    Get user's bookings with pagination and filtering
 * @query   page - page number (default: 1)
 * @query   limit - results per page (default: 10)
 * @query   status - filter by status: draft, active, completed, cancelled
 * @access  Private (requires authentication)
 */
router.get('/', authenticate, bookingsController.getUserBookings);

/**
 * @route   GET /api/bookings/:id
 * @desc    Get single booking details with assigned creators
 * @param   id - stream_project_booking_id
 * @access  Private (requires authentication)
 */
router.get('/:id', authenticate, bookingsController.getBooking);

/**
 * @route   PUT /api/bookings/:id
 * @desc    Update booking status or details
 * @param   id - stream_project_booking_id
 * @body    Any booking fields to update (same as create endpoint)
 * @access  Private (requires authentication)
 */
router.put('/:id', authenticate, bookingsController.updateBooking);

/**
 * @route   POST /api/bookings/user
 * @desc    Get user's bookings with pagination and filtering
 * @query   page - page number (default: 1)
 * @query   limit - results per page (default: 10)
 * @query   status - filter by status: draft, active, completed, cancelled
 * @access  Private (requires authentication)
 */
router.post('/user', bookingsController.getBookings);


module.exports = router;
