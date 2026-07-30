const financeService = require('../services/finance.service');
const accountCreditService = require('../services/account-credit.service');
const financeDisputeService = require('../services/finance-dispute.service');

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

exports.getClientPaymentManagement = async (req, res) => {
  try {
    const data = await financeService.getClientPaymentManagement(req.query, {
      userId: req.userId || req.user?.userId || null
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get client payment management error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch client payments'
    });
  }
};

exports.getClientPaymentDetails = async (req, res) => {
  try {
    const bookingId = parseInt(req.params.bookingId, 10);
    if (!bookingId) {
      return res.status(400).json({ success: false, message: 'Valid booking ID is required' });
    }

    const data = await financeService.getClientPaymentDetails(bookingId, {
      userId: req.userId || req.user?.userId || null
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get client payment details error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch client payment details'
    });
  }
};

exports.listClientDisputes = async (req, res) => {
  try {
    const data = await financeDisputeService.listClientDisputes(req.query, {
      userId: req.userId || req.user?.userId || null
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('List client disputes error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch client disputes'
    });
  }
};

exports.getClientDisputeDetails = async (req, res) => {
  try {
    const data = await financeDisputeService.getClientDisputeDetails(req.params.disputeId, {
      userId: req.userId || req.user?.userId || null
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get client dispute details error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch client dispute details'
    });
  }
};

exports.createClientDispute = async (req, res) => {
  try {
    const data = await financeDisputeService.createClientDispute(req.body, req.files, {
      userId: req.userId || req.user?.userId || null
    });
    return res.status(201).json({ success: true, message: 'Dispute submitted successfully', data });
  } catch (error) {
    console.error('Create client dispute error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to submit dispute'
    });
  }
};

exports.addClientDisputeComment = async (req, res) => {
  try {
    const data = await financeDisputeService.addClientDisputeComment(req.params.disputeId, req.body, {
      userId: req.userId || req.user?.userId || null
    });
    return res.status(201).json({ success: true, message: 'Comment added successfully', data });
  } catch (error) {
    console.error('Add client dispute comment error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to add dispute comment'
    });
  }
};

exports.addClientDisputeAttachment = async (req, res) => {
  try {
    const data = await financeDisputeService.addClientDisputeAttachment(req.params.disputeId, req.body, req.files, {
      userId: req.userId || req.user?.userId || null
    });
    return res.status(201).json({ success: true, message: 'Attachment added successfully', data });
  } catch (error) {
    console.error('Add client dispute attachment error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to add dispute attachment'
    });
  }
};

exports.listCreatorDisputes = async (req, res) => {
  try {
    const data = await financeDisputeService.listCreatorDisputes(req.query, {
      userId: req.userId || req.user?.userId || null
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('List creator disputes error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch creator disputes'
    });
  }
};

exports.getCreatorDisputeDetails = async (req, res) => {
  try {
    const data = await financeDisputeService.getCreatorDisputeDetails(req.params.disputeId, {
      userId: req.userId || req.user?.userId || null
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get creator dispute details error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch creator dispute details'
    });
  }
};

exports.createCreatorDispute = async (req, res) => {
  try {
    const data = await financeDisputeService.createCreatorDispute(req.body, req.files, {
      userId: req.userId || req.user?.userId || null
    });
    return res.status(201).json({ success: true, message: 'Dispute submitted successfully', data });
  } catch (error) {
    console.error('Create creator dispute error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to submit dispute'
    });
  }
};

exports.addCreatorDisputeComment = async (req, res) => {
  try {
    const data = await financeDisputeService.addCreatorDisputeComment(req.params.disputeId, req.body, {
      userId: req.userId || req.user?.userId || null
    });
    return res.status(201).json({ success: true, message: 'Comment added successfully', data });
  } catch (error) {
    console.error('Add creator dispute comment error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to add dispute comment'
    });
  }
};

exports.addCreatorDisputeAttachment = async (req, res) => {
  try {
    const data = await financeDisputeService.addCreatorDisputeAttachment(req.params.disputeId, req.body, req.files, {
      userId: req.userId || req.user?.userId || null
    });
    return res.status(201).json({ success: true, message: 'Attachment added successfully', data });
  } catch (error) {
    console.error('Add creator dispute attachment error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to add dispute attachment'
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

exports.getAdminPayoutsScreen = async (req, res) => {
  try {
    const data = await financeService.getAdminPayoutsScreen(req.query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get admin payouts screen error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch admin payouts screen'
    });
  }
};

exports.getAdminCreditPointsDashboard = async (req, res) => {
  try {
    const data = await accountCreditService.getAdminCreditDashboard(req.query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get admin credit points dashboard error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch credit points dashboard'
    });
  }
};

exports.listAdminCreditPointTransactions = async (req, res) => {
  try {
    const data = await accountCreditService.getAdminCreditTransactions(req.query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('List admin credit point transactions error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch credit point transactions'
    });
  }
};

exports.getAdminCreditPointUserDetails = async (req, res) => {
  try {
    const data = await accountCreditService.getAdminCreditUserDetails({
      ...req.query,
      user_id: req.params.userId || req.query.user_id
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get admin credit point user details error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch credit point user details'
    });
  }
};

exports.getAdminDisputesDashboard = async (req, res) => {
  try {
    const data = await financeDisputeService.getAdminDisputesDashboard(req.query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get admin disputes dashboard error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch disputes dashboard'
    });
  }
};

exports.listAdminDisputes = async (req, res) => {
  try {
    const data = await financeDisputeService.listAdminDisputes(req.query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('List admin disputes error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch disputes'
    });
  }
};

exports.getAdminDisputeDetails = async (req, res) => {
  try {
    const data = await financeDisputeService.getAdminDisputeDetails(req.params.disputeId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get admin dispute details error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch dispute details'
    });
  }
};

exports.createAdminDispute = async (req, res) => {
  try {
    const data = await financeDisputeService.createAdminDispute(req.body, {
      userId: req.userId || req.user?.userId || null
    });
    return res.status(201).json({ success: true, message: 'Dispute created successfully', data });
  } catch (error) {
    console.error('Create admin dispute error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to create dispute'
    });
  }
};

exports.updateAdminDispute = async (req, res) => {
  try {
    const data = await financeDisputeService.updateAdminDispute(req.params.disputeId, req.body, {
      userId: req.userId || req.user?.userId || null
    });
    return res.status(200).json({ success: true, message: 'Dispute updated successfully', data });
  } catch (error) {
    console.error('Update admin dispute error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to update dispute'
    });
  }
};

exports.addDisputeComment = async (req, res) => {
  try {
    const data = await financeDisputeService.addDisputeComment(req.params.disputeId, req.body, {
      userId: req.userId || req.user?.userId || null
    });
    return res.status(201).json({ success: true, message: 'Dispute comment added successfully', data });
  } catch (error) {
    console.error('Add dispute comment error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to add dispute comment'
    });
  }
};

exports.addDisputeAttachment = async (req, res) => {
  try {
    const data = await financeDisputeService.addDisputeAttachment(req.params.disputeId, req.body, req.files, {
      userId: req.userId || req.user?.userId || null
    });
    return res.status(201).json({ success: true, message: 'Dispute attachment added successfully', data });
  } catch (error) {
    console.error('Add dispute attachment error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to add dispute attachment'
    });
  }
};

exports.holdDisputePayout = async (req, res) => {
  try {
    const data = await financeDisputeService.holdDisputePayout(req.params.disputeId, req.body, {
      userId: req.userId || req.user?.userId || null
    });
    return res.status(201).json({ success: true, message: 'Payout hold created successfully', data });
  } catch (error) {
    console.error('Hold dispute payout error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to hold payout'
    });
  }
};

exports.resolveDispute = async (req, res) => {
  try {
    const data = await financeDisputeService.resolveDispute(req.params.disputeId, req.body, {
      userId: req.userId || req.user?.userId || null
    });
    return res.status(200).json({ success: true, message: 'Dispute resolved successfully', data });
  } catch (error) {
    console.error('Resolve dispute error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to resolve dispute'
    });
  }
};

exports.rejectOrRefundDispute = async (req, res) => {
  try {
    const data = await financeDisputeService.rejectOrRefundDispute(req.params.disputeId, req.body, {
      userId: req.userId || req.user?.userId || null
    });
    return res.status(200).json({ success: true, message: 'Dispute action completed successfully', data });
  } catch (error) {
    console.error('Reject/refund dispute error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to reject or refund dispute'
    });
  }
};

exports.escalateDispute = async (req, res) => {
  try {
    const data = await financeDisputeService.escalateDispute(req.params.disputeId, req.body, {
      userId: req.userId || req.user?.userId || null
    });
    return res.status(200).json({ success: true, message: 'Dispute escalated successfully', data });
  } catch (error) {
    console.error('Escalate dispute error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to escalate dispute'
    });
  }
};

exports.createAdminManualCredit = async (req, res) => {
  try {
    const data = await accountCreditService.createManualCredit({
      ...req.body,
      createdByUserId: req.userId || req.user?.userId || null
    });
    return res.status(201).json({
      success: true,
      message: 'Credit points added successfully',
      data
    });
  } catch (error) {
    console.error('Create admin manual credit error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to add credit points'
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
