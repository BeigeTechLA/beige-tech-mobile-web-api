const creatorEarningsService = require('../services/creator-earnings.service');

const ADMIN_ROLES = new Set([
    'admin',
    'Admin',
    'super_admin',
    'Super_Admin',
    'production_manager',
    'sales_admin',
    'Sales_Admin'
]);

function getRequestUserId(req) {
    return req.userId || req.user?.userId || req.user?.id || null;
}

function getRequestUserRole(req) {
    return req.userRole || req.user?.userRole || null;
}

function isAdminRequest(req) {
    return ADMIN_ROLES.has(getRequestUserRole(req));
}

async function resolveCreatorId(req) {
    const rawCreatorId = req.params.creatorId || req.query.creator_id || req.body?.creator_id;
    const requestedCreatorId = rawCreatorId && rawCreatorId !== 'me' ? parseInt(rawCreatorId, 10) : null;

    if (requestedCreatorId && isAdminRequest(req)) {
        return requestedCreatorId;
    }

    const userId = getRequestUserId(req);
    if (!userId) {
        const error = new Error('Authentication required');
        error.statusCode = 401;
        throw error;
    }

    const creator = await creatorEarningsService.resolveCreatorForUser(userId);
    if (!creator) {
        const error = new Error('Creative partner profile not found for logged-in user');
        error.statusCode = 404;
        throw error;
    }

    if (requestedCreatorId && Number(requestedCreatorId) !== Number(creator.creator_id)) {
        const error = new Error('You can only access your own earnings');
        error.statusCode = 403;
        throw error;
    }

    return creator.creator_id;
}

exports.getCreatorEarningsDashboard = async (req, res) => {
    try {
        const creatorId = await resolveCreatorId(req);
        const data = await creatorEarningsService.getCreatorEarningsDashboard(creatorId, req.query);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Get creator earnings dashboard error:', error);
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to fetch creator earnings dashboard'
        });
    }
};

exports.getCreatorEarningsList = async (req, res) => {
    try {
        const creatorId = await resolveCreatorId(req);
        const data = await creatorEarningsService.getCreatorEarningsList(creatorId, req.query);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Get creator earnings list error:', error);
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to fetch earnings list'
        });
    }
};

exports.getCreatorEarningDetails = async (req, res) => {
    try {
        const creatorEarningId = parseInt(req.params.earningId, 10);
        const creatorId = await resolveCreatorId(req);

        if (!creatorEarningId) {
            return res.status(400).json({ success: false, message: 'Valid earning ID is required' });
        }

        const data = await creatorEarningsService.getCreatorEarningDetails(creatorEarningId, creatorId);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Get creator earning details error:', error);
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to fetch earning details'
        });
    }
};

exports.getPayoutTimeline = async (req, res) => {
    try {
        const creatorEarningId = parseInt(req.params.earningId, 10);
        const creatorId = await resolveCreatorId(req);

        if (!creatorEarningId) {
            return res.status(400).json({ success: false, message: 'Valid earning ID is required' });
        }

        const data = await creatorEarningsService.getPayoutTimeline(creatorEarningId, creatorId);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Get payout timeline error:', error);
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to fetch payout timeline'
        });
    }
};

exports.acceptShoot = async (req, res) => {
    try {
        const bookingId = parseInt(req.params.bookingId, 10);
        const creatorId = await resolveCreatorId(req);

        if (!bookingId) {
            return res.status(400).json({ success: false, message: 'Valid booking ID is required' });
        }

        const data = await creatorEarningsService.acceptShoot(bookingId, creatorId);
        return res.status(200).json({
            success: true,
            message: 'Shoot accepted successfully',
            data
        });
    } catch (error) {
        console.error('Accept shoot error:', error);
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to accept shoot'
        });
    }
};

exports.declineShoot = async (req, res) => {
    try {
        const bookingId = parseInt(req.params.bookingId, 10);
        const creatorId = await resolveCreatorId(req);

        if (!bookingId) {
            return res.status(400).json({ success: false, message: 'Valid booking ID is required' });
        }

        const data = await creatorEarningsService.declineShoot(bookingId, creatorId);
        return res.status(200).json({
            success: true,
            message: 'Shoot declined successfully',
            data
        });
    } catch (error) {
        console.error('Decline shoot error:', error);
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to decline shoot'
        });
    }
};  

exports.respondToEarning = async (req, res) => {
    try {
        const bookingId = parseInt(req.params.bookingId, 10);
        const creatorId = await resolveCreatorId(req);
        const { action } = req.body;

        if (!bookingId) {
            return res.status(400).json({ success: false, message: 'Valid booking ID is required' });
        }

        if (!['accept', 'decline'].includes(action)) {
            return res.status(400).json({ success: false, message: 'action must be accept or decline' });
        }

        const data = await creatorEarningsService.respondToEarning(bookingId, creatorId, action);
        return res.status(200).json({
            success: true,
            message: action === 'accept' ? 'Shoot accepted successfully' : 'Shoot declined successfully',
            data
        });
    } catch (error) {
        console.error('Respond to earning error:', error);
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to respond to shoot'
        });
    }
};

exports.addAdvancePayment = async (req, res) => {
    try {
        const data = await creatorEarningsService.addAdvancePayment(req.body, {
            userId: getRequestUserId(req)
        });
        return res.status(201).json({
            success: true,
            message: 'Advance payment added successfully',
            data
        });
    } catch (error) {
        console.error('Add advance payment error:', error);
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to add advance payment'
        });
    }
};

exports.upsertCompensationItems = async (req, res) => {
    try {
        const creatorEarningId = parseInt(req.params.earningId, 10);
        if (!creatorEarningId) {
            return res.status(400).json({ success: false, message: 'Valid earning ID is required' });
        }

        const { items } = req.body;
        if (!Array.isArray(items) || !items.length) {
            return res.status(400).json({ success: false, message: 'items array is required' });
        }

        const data = await creatorEarningsService.upsertCompensationItems(creatorEarningId, items, {
            userId: getRequestUserId(req)
        });
        return res.status(200).json({
            success: true,
            message: 'Compensation items updated successfully',
            data
        });
    } catch (error) {
        console.error('Upsert compensation items error:', error);
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to update compensation items'
        });
    }
};
