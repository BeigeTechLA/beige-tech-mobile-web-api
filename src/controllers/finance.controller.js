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

exports.getCreatorWallet = async (req, res) => {
  try {
    const creatorId = parseInt(req.params.creatorId || req.query.creator_id, 10);
    if (!creatorId) {
      return res.status(400).json({ success: false, message: 'Valid creator ID is required' });
    }

    const data = await financeService.getCreatorWallet(creatorId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get creator wallet error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch creator wallet'
    });
  }
};

exports.getAdminCreatorWalletOverview = async (req, res) => {
  try {
    const data = await financeService.getAdminCreatorWalletOverview(req.query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get admin creator wallet overview error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch creator wallet overview'
    });
  }
};

exports.listCreatorPayouts = async (req, res) => {
  try {
    const data = await financeService.listCreatorPayouts(req.query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('List creator payouts error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch creator payouts'
    });
  }
};

exports.upsertCreatorPayoutAccount = async (req, res) => {
  try {
    const data = await financeService.upsertCreatorPayoutAccount(req.body);
    return res.status(200).json({
      success: true,
      message: 'Creator payout account saved successfully',
      data
    });
  } catch (error) {
    console.error('Save creator payout account error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to save creator payout account'
    });
  }
};

exports.releaseCreatorEarnings = async (req, res) => {
  try {
    const data = await financeService.releaseCreatorEarnings(req.body, {
      userId: req.userId || req.user?.userId || null
    });
    return res.status(200).json({
      success: true,
      message: 'Creator earnings released successfully',
      data
    });
  } catch (error) {
    console.error('Release creator earnings error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to release creator earnings'
    });
  }
};

exports.requestCreatorPayout = async (req, res) => {
  try {
    const data = await financeService.requestCreatorPayout(req.body);
    return res.status(201).json({
      success: true,
      message: 'Creator payout requested successfully',
      data
    });
  } catch (error) {
    console.error('Request creator payout error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to request creator payout'
    });
  }
};

exports.approveCreatorPayout = async (req, res) => {
  try {
    const payoutRequestId = parseInt(req.params.payoutRequestId, 10);
    if (!payoutRequestId) {
      return res.status(400).json({ success: false, message: 'Valid payout request ID is required' });
    }

    const data = await financeService.approveCreatorPayout(payoutRequestId, req.body, {
      userId: req.userId || req.user?.userId || null
    });
    return res.status(200).json({ success: true, message: 'Creator payout approved successfully', data });
  } catch (error) {
    console.error('Approve creator payout error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to approve creator payout'
    });
  }
};

exports.rejectCreatorPayout = async (req, res) => {
  try {
    const payoutRequestId = parseInt(req.params.payoutRequestId, 10);
    if (!payoutRequestId) {
      return res.status(400).json({ success: false, message: 'Valid payout request ID is required' });
    }

    const data = await financeService.rejectCreatorPayout(payoutRequestId, req.body, {
      userId: req.userId || req.user?.userId || null
    });
    return res.status(200).json({ success: true, message: 'Creator payout rejected successfully', data });
  } catch (error) {
    console.error('Reject creator payout error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to reject creator payout'
    });
  }
};

exports.markCreatorPayoutPaid = async (req, res) => {
  try {
    const payoutRequestId = parseInt(req.params.payoutRequestId, 10);
    if (!payoutRequestId) {
      return res.status(400).json({ success: false, message: 'Valid payout request ID is required' });
    }

    const data = await financeService.markCreatorPayoutPaid(payoutRequestId, req.body, {
      userId: req.userId || req.user?.userId || null
    });
    return res.status(200).json({ success: true, message: 'Creator payout marked paid successfully', data });
  } catch (error) {
    console.error('Mark creator payout paid error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to mark creator payout paid'
    });
  }
};
