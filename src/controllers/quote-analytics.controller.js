const quoteAnalyticsService = require('../services/quote-analytics.service');

exports.getQuoteAnalyticsSummary = async (req, res) => {
    try {
        const data = await quoteAnalyticsService.getSummary(req.query);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Get quote analytics summary error:', error);
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to fetch quote analytics summary'
        });
    }
};

exports.getQuoteAnalyticsReps = async (req, res) => {
    try {
        const data = await quoteAnalyticsService.getReps(req.query);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Get quote analytics reps error:', error);
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to fetch quote analytics reps'
        });
    }
};

exports.getQuoteAnalyticsRep = async (req, res) => {
    try {
        const repId = parseInt(req.params.repId, 10);

        if (!repId) {
            return res.status(400).json({ success: false, message: 'Valid sales rep ID is required' });
        }

        const data = await quoteAnalyticsService.getRep(repId, req.query);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Get quote analytics rep error:', error);
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to fetch quote analytics rep'
        });
    }
};

exports.getQuoteAnalyticsRepDeals = async (req, res) => {
    try {
        const repId = parseInt(req.params.repId, 10);

        if (!repId) {
            return res.status(400).json({ success: false, message: 'Valid sales rep ID is required' });
        }

        const data = await quoteAnalyticsService.getRepDeals(repId, req.query);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Get quote analytics rep deals error:', error);
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to fetch quote analytics rep deals'
        });
    }
};

exports.getQuoteAnalyticsList = async (req, res) => {
    try {
        const data = await quoteAnalyticsService.getList(req.query);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Get quote analytics list error:', error);
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to fetch quote analytics list'
        });
    }
};
