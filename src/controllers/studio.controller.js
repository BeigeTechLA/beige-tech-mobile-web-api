const studioService = require('../services/studio.service');
const constants = require('../utils/constants');

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../public/uploads/media');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const uploadMiddleware = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => cb(null, Date.now() + Math.round(Math.random() * 1e9) + path.extname(file.originalname))
    })
}).single('file');

exports.uploadMedia = (req, res) => {
    uploadMiddleware(req, res, (err) => {
        if (err) return res.status(500).json({ success: false, message: 'Upload failed' });
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
        const fileUrl = `${req.protocol}://${req.get('host')}/uploads/media/${req.file.filename}`;
        return res.json({ success: true, url: fileUrl });
    });
};
// ─────────────────────────────────────────────────────────────────────────────
//  POST /v1/studios/create
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Create a new studio
 * POST /v1/studios/create
 * Body: { user_id: number }
 */
exports.createStudio = async (req, res) => {
    try {
        const { user_id } = req.body;

        if (!user_id) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'user_id is required',
            });
        }

        const studio = await studioService.createStudio(user_id);

        return res.status(201).json({
            success: true,
            message: 'Studio created',
            data: { studio_id: studio.id },
        });
    } catch (error) {
        console.error('Error creating studio:', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
            success: false,
            message: 'Failed to create studio',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /v1/studios/:studio_id/address
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Save studio address
 * POST /v1/studios/:studio_id/address
 * Body: address fields
 */
exports.saveAddress = async (req, res) => {
    try {
        const { studio_id } = req.params;

        if (!studio_id) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'studio_id is required',
            });
        }

        const data = await studioService.saveAddress(studio_id, req.body);

        return res.json({
            success: true,
            message: 'Address saved',
            data,
        });
    } catch (error) {
        console.error('Error saving address:', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
            success: false,
            message: 'Failed to save address',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /v1/studios/:studio_id/info
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Save studio info
 * POST /v1/studios/:studio_id/info
 * Body: studio info fields
 */
exports.saveInfo = async (req, res) => {
    try {
        const { studio_id } = req.params;

        if (!studio_id) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'studio_id is required',
            });
        }

        const data = await studioService.saveInfo(studio_id, req.body);

        return res.json({
            success: true,
            message: 'Space info saved',
            data,
        });
    } catch (error) {
        console.error('Error saving studio info:', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
            success: false,
            message: 'Failed to save studio info',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /v1/studios/:studio_id/facilities
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Save studio facilities
 * POST /v1/studios/:studio_id/facilities
 * Body: facilities fields
 */
exports.saveFacilities = async (req, res) => {
    try {
        const { studio_id } = req.params;

        if (!studio_id) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'studio_id is required',
            });
        }

        const data = await studioService.saveFacilities(studio_id, req.body);

        return res.json({
            success: true,
            message: 'Facilities saved',
            data,
        });
    } catch (error) {
        console.error('Error saving facilities:', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
            success: false,
            message: 'Failed to save facilities',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /v1/studios/:studio_id/media
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Save studio media
 * POST /v1/studios/:studio_id/media
 * Body: { media: [{ url, type, sort_order }] }
 */
exports.saveMedia = async (req, res) => {
    try {
        const { studio_id } = req.params;
        const { media } = req.body;

        if (!studio_id) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'studio_id is required',
            });
        }

        if (!media || !Array.isArray(media)) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'media array is required',
            });
        }

        const data = await studioService.saveMedia(studio_id, media);

        return res.json({
            success: true,
            message: 'Media saved',
            data,
        });
    } catch (error) {
        console.error('Error saving media:', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
            success: false,
            message: 'Failed to save media',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /v1/studios/:studio_id/details
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Save studio details
 * POST /v1/studios/:studio_id/details
 * Body: detail fields
 */
exports.saveDetails = async (req, res) => {
    try {
        const { studio_id } = req.params;

        if (!studio_id) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'studio_id is required',
            });
        }

        const data = await studioService.saveDetails(studio_id, req.body);

        return res.json({
            success: true,
            message: 'Details saved',
            data,
        });
    } catch (error) {
        console.error('Error saving details:', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
            success: false,
            message: 'Failed to save details',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /v1/studios/:studio_id/hours
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Save studio hours and rules
 * POST /v1/studios/:studio_id/hours
 * Body: {
 *   hours: [{ day, is_open, is_24hrs, opening_time, closing_time }],
 *   rules: { smoking_allowed, alcohol_allowed, ..., custom_rule }
 * }
 */
exports.saveHoursAndRules = async (req, res) => {
    try {
        const { studio_id } = req.params;
        const { hours, rules } = req.body;

        if (!studio_id) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'studio_id is required',
            });
        }

        if (!hours || !Array.isArray(hours)) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'hours array is required',
            });
        }

        const data = await studioService.saveHoursAndRules(studio_id, req.body);

        return res.json({
            success: true,
            message: 'Hours and rules saved',
            data,
        });
    } catch (error) {
        console.error('Error saving hours and rules:', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
            success: false,
            message: 'Failed to save hours and rules',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /v1/studios/:studio_id/budget
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Save studio budget
 * POST /v1/studios/:studio_id/budget
 * Body: {
 *   hourly_rate, overtime_rate, minimum_booking, buffer_time,
 *   categories: [{ name, price_per_hour, min_hours, max_people, is_selected, includes }],
 *   equipment:  [{ name, cost }]
 * }
 */
exports.saveBudget = async (req, res) => {
    try {
        const { studio_id } = req.params;
        const { hourly_rate, categories, equipment } = req.body;

        if (!studio_id) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'studio_id is required',
            });
        }

        if (hourly_rate !== undefined && (isNaN(parseFloat(hourly_rate)) || parseFloat(hourly_rate) < 0)) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'hourly_rate must be a non-negative number',
            });
        }

        if (categories !== undefined && !Array.isArray(categories)) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'categories must be an array',
            });
        }

        if (equipment !== undefined && !Array.isArray(equipment)) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'equipment must be an array',
            });
        }

        const data = await studioService.saveBudget(studio_id, req.body);

        return res.json({
            success: true,
            message: 'Budget saved',
            data,
        });
    } catch (error) {
        console.error('Error saving budget:', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
            success: false,
            message: 'Failed to save budget',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /v1/studios/:studio_id/policies  ← Final step
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Save studio policies (final publish step)
 * POST /v1/studios/:studio_id/policies
 * Body: { selected_policies: ["Cancellation Window & Refunded", ...] }
 */
exports.savePolicies = async (req, res) => {
    try {
        const { studio_id } = req.params;
        const { selected_policies } = req.body;

        if (!studio_id) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'studio_id is required',
            });
        }

        if (!selected_policies || !Array.isArray(selected_policies)) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'selected_policies array is required',
            });
        }

        const data = await studioService.savePolicies(studio_id, req.body);

        return res.json({
            success: true,
            message: 'Studio published successfully',
            data,
        });
    } catch (error) {
        console.error('Error saving policies:', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
            success: false,
            message: 'Failed to save policies',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /v1/studios/:studio_id
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Get studio by ID
 * GET /v1/studios/:studio_id
 */
exports.getStudioById = async (req, res) => {
    try {
        const { studio_id } = req.params;

        if (!studio_id || isNaN(parseInt(studio_id))) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'Valid studio_id is required',
            });
        }

        const data = await studioService.getStudioById(studio_id);

        if (!data) {
            return res.status(constants.NOT_FOUND.code).json({
                success: false,
                message: 'Studio not found',
            });
        }

        return res.json({
            success: true,
            message: 'Studio fetched',
            data,
        });
    } catch (error) {
        console.error('Error fetching studio:', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
            success: false,
            message: 'Failed to fetch studio',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /v1/studios/user/:user_id
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Get all studios by user
 * GET /v1/studios/user/:user_id
 */
exports.getStudiosByUser = async (req, res) => {
    try {
        const { user_id } = req.params;

        if (!user_id || isNaN(parseInt(user_id))) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'Valid user_id is required',
            });
        }

        const data = await studioService.getStudiosByUser(user_id);

        return res.json({
            success: true,
            message: 'Studios fetched',
            data,
            count: Array.isArray(data) ? data.length : 0,
        });
    } catch (error) {
        console.error('Error fetching studios by user:', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
            success: false,
            message: 'Failed to fetch studios',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE /v1/studios/:studio_id
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Delete a studio
 * DELETE /v1/studios/:studio_id
 */
exports.deleteStudio = async (req, res) => {
    try {
        const { studio_id } = req.params;

        if (!studio_id || isNaN(parseInt(studio_id))) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'Valid studio_id is required',
            });
        }

        const data = await studioService.deleteStudio(studio_id);

        if (!data) {
            return res.status(constants.NOT_FOUND.code).json({
                success: false,
                message: 'Studio not found',
            });
        }

        return res.json({
            success: true,
            message: 'Studio deleted',
            data,
        });
    } catch (error) {
        console.error('Error deleting studio:', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
            success: false,
            message: 'Failed to delete studio',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /v1/studios/:studio_id/operations/overview
// ─────────────────────────────────────────────────────────────────────────────
exports.getOverview = async (req, res) => {
    try {
        const { studio_id } = req.params;
        const { month } = req.query;

        if (!studio_id || isNaN(parseInt(studio_id))) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'Valid studio_id is required',
            });
        }

        const data = await studioService.getOverview(studio_id, month);

        return res.json({
            success: true,
            message: 'Overview fetched',
            data,
        });
    } catch (error) {
        console.error('Error fetching overview:', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
            success: false,
            message: 'Failed to fetch overview',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /v1/studios/:studio_id/operations/bookings
// ─────────────────────────────────────────────────────────────────────────────
exports.getBookings = async (req, res) => {
    try {
        const { studio_id } = req.params;
        const { status, month } = req.query;

        if (!studio_id || isNaN(parseInt(studio_id))) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'Valid studio_id is required',
            });
        }

        const validStatuses = ['upcoming', 'completed', 'cancelled'];
        if (status && !validStatuses.includes(status)) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'status must be upcoming, completed, or cancelled',
            });
        }

        const data = await studioService.getBookings(studio_id, { status, month });

        return res.json({
            success: true,
            message: 'Bookings fetched',
            data,
            count: Array.isArray(data) ? data.length : 0,
        });
    } catch (error) {
        console.error('Error fetching bookings:', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
            success: false,
            message: 'Failed to fetch bookings',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /v1/studios/:studio_id/operations/ledger
// ─────────────────────────────────────────────────────────────────────────────
exports.getLedger = async (req, res) => {
    try {
        const { studio_id } = req.params;
        const { month } = req.query;

        if (!studio_id || isNaN(parseInt(studio_id))) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'Valid studio_id is required',
            });
        }

        const data = await studioService.getLedger(studio_id, month);

        return res.json({
            success: true,
            message: 'Ledger fetched',
            data,
            count: Array.isArray(data) ? data.length : 0,
        });
    } catch (error) {
        console.error('Error fetching ledger:', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
            success: false,
            message: 'Failed to fetch ledger',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /v1/studios/:studio_id/operations/bookings
// ─────────────────────────────────────────────────────────────────────────────
exports.createBooking = async (req, res) => {
    try {
        const { studio_id } = req.params;
        const { booking_date, start_time, end_time } = req.body;

        if (!studio_id || isNaN(parseInt(studio_id))) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'Valid studio_id is required',
            });
        }

        if (!booking_date || !start_time || !end_time) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'booking_date, start_time, and end_time are required',
            });
        }

        const data = await studioService.createBooking(studio_id, req.body);

        return res.status(201).json({
            success: true,
            message: 'Booking created',
            data,
        });
    } catch (error) {
        console.error('Error creating booking:', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
            success: false,
            message: 'Failed to create booking',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  PUT /v1/studios/:studio_id/operations/bookings/:booking_id
// ─────────────────────────────────────────────────────────────────────────────
exports.updateBookingStatus = async (req, res) => {
    try {
        const { studio_id, booking_id } = req.params;
        const { status } = req.body;

        if (!studio_id || isNaN(parseInt(studio_id))) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'Valid studio_id is required',
            });
        }

        if (!booking_id || isNaN(parseInt(booking_id))) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'Valid booking_id is required',
            });
        }

        const validStatuses = ['upcoming', 'completed', 'cancelled'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'status must be upcoming, completed, or cancelled',
            });
        }

        const data = await studioService.updateBookingStatus(studio_id, booking_id, status);

        if (!data) {
            return res.status(constants.NOT_FOUND.code).json({
                success: false,
                message: 'Booking not found',
            });
        }

        return res.json({
            success: true,
            message: 'Booking status updated',
            data,
        });
    } catch (error) {
        console.error('Error updating booking status:', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
            success: false,
            message: 'Failed to update booking status',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  PUT /v1/studios/:studio_id
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Update studio — all sections in one call
 * PUT /v1/studios/:studio_id
 * Body: any combination of address, info, facilities, media,
 *       details, hours, rules, budget, policies fields
 */
exports.updateStudio = async (req, res) => {
    try {
        const { studio_id } = req.params;

        if (!studio_id || isNaN(parseInt(studio_id))) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'Valid studio_id is required',
            });
        }

        const data = await studioService.updateStudio(studio_id, req.body);

        return res.json({
            success: true,
            message: 'Studio updated successfully',
            data,
        });
    } catch (error) {
        if (error.status === 404) {
            return res.status(404).json({
                success: false,
                message: 'Studio not found',
            });
        }
        console.error('Error updating studio:', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
            success: false,
            message: 'Failed to update studio',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};


// ─────────────────────────────────────────────────────────────────────────────
//  POST /v1/studios/requests
// ─────────────────────────────────────────────────────────────────────────────
exports.createStudioRequest = async (req, res) => {
    try {
        const { studio_id, user_id } = req.body;
        if (!studio_id || !user_id) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'studio_id and user_id are required',
            });
        }
        const data = await studioService.createStudioRequest(req.body);
        return res.status(201).json({
            success: true,
            message: 'Studio request created',
            data,
        });
    } catch (error) {
        console.error('Error creating studio request:', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
            success: false,
            message: 'Failed to create studio request',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /v1/studios/requests
// ─────────────────────────────────────────────────────────────────────────────
exports.getStudioRequests = async (req, res) => {
    try {
        const { status, month } = req.query;
        const validStatuses = ['pending', 'approved', 'rejected'];
        if (status && !validStatuses.includes(status)) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'status must be pending, approved, or rejected',
            });
        }
        const data = await studioService.getStudioRequests({ status, month });
        return res.json({
            success: true,
            message: 'Studio requests fetched',
            data,
            count: data.length,
        });
    } catch (error) {
        console.error('Error fetching studio requests:', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
            success: false,
            message: 'Failed to fetch studio requests',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  PUT /v1/studios/requests/:request_id
// ─────────────────────────────────────────────────────────────────────────────
exports.updateStudioRequestStatus = async (req, res) => {
    try {
        const { request_id } = req.params;
        const { status } = req.body;
        if (!request_id || isNaN(parseInt(request_id))) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'Valid request_id is required',
            });
        }
        const validStatuses = ['pending', 'approved', 'rejected'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'status must be pending, approved, or rejected',
            });
        }
        const data = await studioService.updateStudioRequestStatus(request_id, status);
        if (!data) {
            return res.status(constants.NOT_FOUND.code).json({
                success: false,
                message: 'Studio request not found',
            });
        }
        return res.json({
            success: true,
            message: 'Studio request status updated',
            data,
        });
    } catch (error) {
        console.error('Error updating studio request status:', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
            success: false,
            message: 'Failed to update studio request status',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE /v1/studios/requests/:request_id
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteStudioRequest = async (req, res) => {
    try {
        const { request_id } = req.params;
        if (!request_id || isNaN(parseInt(request_id))) {
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'Valid request_id is required',
            });
        }
        const data = await studioService.deleteStudioRequest(request_id);
        if (!data) {
            return res.status(constants.NOT_FOUND.code).json({
                success: false,
                message: 'Studio request not found',
            });
        }
        return res.json({
            success: true,
            message: 'Studio request deleted',
            data,
        });
    } catch (error) {
        console.error('Error deleting studio request:', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
            success: false,
            message: 'Failed to delete studio request',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};