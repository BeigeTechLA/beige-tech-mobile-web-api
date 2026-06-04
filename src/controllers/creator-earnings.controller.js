const creatorEarningsService = require('../services/creator-earnings.service');

exports.getCreatorEarningsDashboard = async (req, res) => {
    try {
        const creatorId = parseInt(req.params.creatorId || req.query.creator_id, 10);
        if (!creatorId) {
            return res.status(400).json({ success: false, message: 'Valid creator ID is required' });
        }

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
        const creatorId = parseInt(req.params.creatorId || req.query.creator_id, 10);
        if (!creatorId) {
            return res.status(400).json({ success: false, message: 'Valid creator ID is required' });
        }

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
        const creatorId = parseInt(req.params.creatorId || req.query.creator_id, 10);

        if (!creatorEarningId || !creatorId) {
            return res.status(400).json({ success: false, message: 'Valid earning ID and creator ID are required' });
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
        const creatorId = parseInt(req.params.creatorId || req.query.creator_id, 10);

        if (!creatorEarningId || !creatorId) {
            return res.status(400).json({ success: false, message: 'Valid earning ID and creator ID are required' });
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
        const creatorId = parseInt(req.params.creatorId || req.body.creator_id, 10);

        if (!bookingId || !creatorId) {
            return res.status(400).json({ success: false, message: 'Valid booking ID and creator ID are required' });
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
        const creatorId = parseInt(req.params.creatorId || req.body.creator_id, 10);

        if (!bookingId || !creatorId) {
            return res.status(400).json({ success: false, message: 'Valid booking ID and creator ID are required' });
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
        const creatorId = parseInt(req.params.creatorId || req.body.creator_id, 10);
        const { action } = req.body;

        if (!bookingId || !creatorId) {
            return res.status(400).json({ success: false, message: 'Valid booking ID and creator ID are required' });
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
            userId: req.userId || req.user?.userId || null
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
            userId: req.userId || req.user?.userId || null
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