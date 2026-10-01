const financeAnalyticsService = require('../services/finance-analytics.service');

exports.getOverview = async (req, res) => {
  try {
    const data = await financeAnalyticsService.getOverview(req.query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get finance overview analytics error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch finance overview analytics'
    });
  }
};

exports.getCpAnalysis = async (req, res) => {
  try {
    const data = await financeAnalyticsService.getCpAnalysis(req.query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get CP analysis error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch CP analysis analytics'
    });
  }
};

exports.getTopCpsShoots = async (req, res) => {
  try {
    const data = await financeAnalyticsService.getTopCpsShoots(req.query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get top CPs by shoots error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch top CPs by shoots'
    });
  }
};

exports.getClientAnalytics = async (req, res) => {
  try {
    const data = await financeAnalyticsService.getClientAnalytics(req.query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get client analytics error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch client analytics'
    });
  }
};

exports.getDisputesAnalytics = async (req, res) => {
  try {
    const data = await financeAnalyticsService.getDisputesAnalytics(req.query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get disputes analytics error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch disputes analytics'
    });
  }
};
