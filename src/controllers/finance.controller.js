const financeService = require('../services/finance.service');

exports.syncBookingFinance = async (req, res) => {
  try {
    const bookingId = parseInt(req.params.bookingId, 10);
    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: 'Valid booking ID is required'
      });
    }

    const result = await financeService.syncBookingFinance(bookingId, {
      userId: req.userId || req.user?.userId || null
    });

    return res.status(200).json({
      success: true,
      message: 'Booking finance synced successfully',
      data: result
    });
  } catch (error) {
    console.error('Sync booking finance error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to sync booking finance'
    });
  }
};

exports.listTransactions = async (req, res) => {
  try {
    const data = await financeService.listTransactions(req.query);
    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('List finance transactions error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch finance transactions'
    });
  }
};

exports.listShootBreakdowns = async (req, res) => {
  try {
    const data = await financeService.listShootBreakdowns(req.query);
    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('List shoot finance breakdowns error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch shoot finance breakdowns'
    });
  }
};

exports.getShootFinance = async (req, res) => {
  try {
    const bookingId = parseInt(req.params.bookingId, 10);
    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: 'Valid booking ID is required'
      });
    }

    const data = await financeService.getShootFinance(bookingId);
    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Finance breakdown not found'
      });
    }

    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Get shoot finance error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch shoot finance'
    });
  }
};
