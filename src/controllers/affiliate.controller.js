const { Common } = require('googleapis');
const db = require('../models');
const financeService = require('../services/finance.service');
const financeDisputeService = require('../services/finance-dispute.service');
const { Op } = require('sequelize');
const crypto = require('crypto');
const constants = require('../utils/constants');
const common_model = require('../utils/common_model');
const Affiliate = common_model.getTableNameDirect(constants.TABLES.AFFILIATES)
const COMMISSION_RATE_PERCENT = 10;
const COMMISSION_RATE = COMMISSION_RATE_PERCENT / 100;

function calculateCommission(bookingAmount) {
  const amount = parseFloat(bookingAmount || 0);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return parseFloat((amount * COMMISSION_RATE).toFixed(2));
}

async function awardCommissionToAffiliate(
  affiliate,
  paymentId,
  bookingAmount,
  referredUserId,
  referredGuestEmail,
  referralCodeForRecord,
  transaction = null
) {
  const commissionAmount = calculateCommission(bookingAmount);
  if (commissionAmount <= 0) return null;

  const referral = await db.referrals.create({
    affiliate_id: affiliate.affiliate_id,
    payment_id: paymentId,
    referral_code: (referralCodeForRecord || affiliate.referral_code || '').toUpperCase(),
    referred_user_id: referredUserId || null,
    referred_guest_email: referredGuestEmail || null,
    booking_amount: bookingAmount,
    commission_amount: commissionAmount,
    status: 'completed',
    payout_status: 'pending'
  }, { transaction });

  affiliate.total_referrals = affiliate.total_referrals + 1;
  affiliate.successful_referrals = affiliate.successful_referrals + 1;
  affiliate.total_earnings = parseFloat(affiliate.total_earnings) + commissionAmount;
  affiliate.pending_earnings = parseFloat(affiliate.pending_earnings) + commissionAmount;
  await affiliate.save({ transaction });

  return referral;
}

/**
 * Generate a unique referral code
 * Format: 6 alphanumeric characters (uppercase)
 */
function generateReferralCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

async function isArchivedClientOnlyUser(userId, transaction = null) {
  if (!userId) return false;

  const [archivedClient, activeClient, activeCrew] = await Promise.all([
    db.clients.findOne({
      where: { user_id: userId, is_active: 0 },
      attributes: ['client_id'],
      transaction,
      raw: true
    }),
    db.clients.findOne({
      where: { user_id: userId, is_active: 1 },
      attributes: ['client_id'],
      transaction,
      raw: true
    }),
    db.crew_members.findOne({
      where: { user_id: userId, is_active: 1 },
      attributes: ['crew_member_id'],
      transaction,
      raw: true
    })
  ]);

  return Boolean(archivedClient && !activeClient && !activeCrew);
}

async function isAffiliateEligibleForReferral(affiliate, transaction = null) {
  if (!affiliate) return false;

  const plainAffiliate = affiliate.toJSON ? affiliate.toJSON() : affiliate;
  const userId = plainAffiliate.user_id;

  if (!userId) return false;
  if (plainAffiliate.status && plainAffiliate.status !== 'active') return false;
  if (plainAffiliate.is_active !== undefined && Number(plainAffiliate.is_active) !== 1) return false;

  const owner = await db.users.scope('all').findOne({
    where: { id: userId },
    attributes: ['id', 'is_active'],
    transaction,
    raw: true
  });

  if (!owner || Number(owner.is_active) !== 1) return false;

  if (await isArchivedClientOnlyUser(userId, transaction)) {
    return false;
  }

  return true;
}

exports.isAffiliateEligibleForReferral = isAffiliateEligibleForReferral;

/**
 * Create affiliate account for a user
 * Called automatically on user registration
 */
exports.createAffiliate = async (userId, transaction = null) => {
  try {
    // Check if affiliate already exists
    const existingAffiliate = await db.affiliates.findOne({
      where: { user_id: userId }
    });

    if (existingAffiliate) {
      return existingAffiliate;
    }

    // Generate unique referral code
    let referralCode;
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      referralCode = generateReferralCode();
      const existing = await db.affiliates.findOne({
        where: { referral_code: referralCode }
      });
      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      // Fallback: use user ID as part of code
      referralCode = `U${userId}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    }

    // Create affiliate record
    const affiliate = await db.affiliates.create({
      user_id: userId,
      referral_code: referralCode,
      status: 'active'
    }, { transaction });

    return affiliate;
  } catch (error) {
    console.error('Create Affiliate Error:', error);
    throw error;
  }
};

/**
 * Validate a referral code
 * GET /api/affiliates/validate/:code
 */
// exports.validateReferralCode = async (req, res) => {
//   try {
//     const { code } = req.params;

//     if (!code || code.length < 4) {
//       return res.status(400).json({
//         success: false,
//         message: 'Invalid referral code format'
//       });
//     }

//     const affiliate = await db.affiliates.findOne({
//       where: { 
//         referral_code: code.toUpperCase(),
//         status: 'active'
//       },
//       include: [{
//         model: db.users,
//         as: 'user',
//         attributes: ['id', 'name']
//       }]
//     });

//     if (!affiliate) {
//       return res.status(404).json({
//         success: false,
//         message: 'Referral code not found or inactive',
//         valid: false
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       valid: true,
//       data: {
//         referral_code: affiliate.referral_code,
//         affiliate_name: affiliate.user?.name || 'Beige Partner'
//       }
//     });

//   } catch (error) {
//     console.error('Validate Referral Code Error:', error);

//     return res.status(500).json({
//       success: false,
//       message: 'Failed to validate referral code',
//       error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
//     });
//   }
// };

exports.validateReferralCode = async (req, res) => {
  try {
    const { code } = req.params;
    
    // 1. Get user_id ONLY from query params (e.g., /validate/CODE?user_id=123)
    const queryUserId = req.query.user_id;

    if (!code || code.length < 4) {
      return res.status(400).json({
        success: false,
        message: 'Invalid referral code format'
      });
    }

    // 2. Find the affiliate in the database
    const affiliate = await db.affiliates.findOne({
      where: { 
        referral_code: code.toUpperCase(),
        status: 'active'
      },
      include: [{
        model: db.users,
        as: 'user', // matches your initModels alias
        attributes: ['id', 'name']
      }]
    });

    // 3. If no affiliate found, return error
    if (!affiliate) {
      return res.status(404).json({
        success: false,
        message: 'Referral code not found or inactive',
        valid: false
      });
    }

    if (!(await isAffiliateEligibleForReferral(affiliate))) {
      return res.status(404).json({
        success: false,
        message: 'Referral code not found or inactive',
        valid: false
      });
    }

    // 4. OWNERSHIP CHECK: 
    // ONLY check this if user_id was actually provided in the query string
    if (queryUserId) {
      if (Number(affiliate.user_id) === Number(queryUserId)) {
        return res.status(400).json({
          success: false,
          message: 'You cannot use your own referral code',
          valid: false
        });
      }
    }

    // 5. SUCCESS: If user_id wasn't provided, or it's not their own code
    return res.status(200).json({
      success: true,
      valid: true,
      data: {
        referral_code: affiliate.referral_code,
        affiliate_name: affiliate.user?.name || 'Partner'
      }
    });

  } catch (error) {
    console.error('Validate Referral Code Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to validate referral code',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get current user's affiliate info
 * GET /api/affiliates/me
 */
exports.getMyAffiliate = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const affiliate = await db.affiliates.findOne({
      where: { user_id: userId },
      include: [{
        model: db.users,
        as: 'user',
        attributes: ['id', 'name', 'email']
      }]
    });

    if (!affiliate) {
      return res.status(404).json({
        success: false,
        message: 'Affiliate account not found'
      });
    }

    const client = await db.clients.findOne({
      where: { user_id: userId },
      attributes: ['client_id', 'user_id', 'name', 'email', 'phone_number']
    });

    return res.status(200).json({
      success: true,
      data: {
        affiliate_id: affiliate.affiliate_id,
        client_id: client?.client_id || null,
        referral_code: affiliate.referral_code,
        status: affiliate.status,
        total_referrals: affiliate.total_referrals,
        successful_referrals: affiliate.successful_referrals,
        total_earnings: parseFloat(affiliate.total_earnings),
        pending_earnings: parseFloat(affiliate.pending_earnings),
        paid_earnings: parseFloat(affiliate.paid_earnings),
        payout_method: affiliate.payout_method,
        payout_details: affiliate.payout_details,
        user: affiliate.user,
        client,
        created_at: affiliate.created_at
      }
    });

  } catch (error) {
    console.error('Get My Affiliate Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve affiliate info',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get affiliate dashboard stats
 * GET /api/affiliates/dashboard
 */
exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const affiliate = await db.affiliates.findOne({
      where: { user_id: userId }
    });

    if (!affiliate) {
      return res.status(404).json({
        success: false,
        message: 'Affiliate account not found'
      });
    }

    // Get referrals breakdown
    const referrals = await db.referrals.findAll({
      where: { affiliate_id: affiliate.affiliate_id },
      include: [{
        model: db.payment_transactions,
        as: 'payment',
        attributes: ['payment_id', 'total_amount', 'shoot_date', 'status', 'created_at']
      }],
      order: [['created_at', 'DESC']],
      limit: 50
    });

    // Calculate stats
    const pendingCount = referrals.filter(r => r.status === 'pending').length;
    const completedCount = referrals.filter(r => r.status === 'completed').length;
    const cancelledCount = referrals.filter(r => r.status === 'cancelled' || r.status === 'refunded').length;

    // Get recent referrals for display
    const recentReferrals = referrals.slice(0, 10).map(r => ({
      referral_id: r.referral_id,
      booking_amount: r.booking_amount ? parseFloat(r.booking_amount) : null,
      commission_amount: parseFloat(r.commission_amount),
      status: r.status,
      payout_status: r.payout_status,
      created_at: r.created_at,
      payment: r.payment ? {
        payment_id: r.payment.payment_id,
        total_amount: parseFloat(r.payment.total_amount),
        shoot_date: r.payment.shoot_date,
        status: r.payment.status
      } : null
    }));

    return res.status(200).json({
      success: true,
      data: {
        affiliate: {
          affiliate_id: affiliate.affiliate_id,
          referral_code: affiliate.referral_code,
          status: affiliate.status
        },
        stats: {
          total_referrals: affiliate.total_referrals,
          successful_referrals: affiliate.successful_referrals,
          pending_referrals: pendingCount,
          cancelled_referrals: cancelledCount,
          conversion_rate: affiliate.total_referrals > 0 
            ? ((affiliate.successful_referrals / affiliate.total_referrals) * 100).toFixed(1) 
            : 0
        },
        earnings: {
          total_earnings: parseFloat(affiliate.total_earnings),
          pending_earnings: parseFloat(affiliate.pending_earnings),
          paid_earnings: parseFloat(affiliate.paid_earnings),
          commission_per_booking: COMMISSION_RATE_PERCENT,
          commission_rate_percent: COMMISSION_RATE_PERCENT
        },
        recent_referrals: recentReferrals
      }
    });

  } catch (error) {
    console.error('Get Dashboard Stats Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve dashboard stats',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Update affiliate payout details
 * PUT /api/affiliates/payout-details
 */
exports.updatePayoutDetails = async (req, res) => {
  try {
    const userId = req.userId;
    const { payout_method, payout_details } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const validMethods = ['bank_transfer', 'paypal', 'stripe'];
    if (payout_method && !validMethods.includes(payout_method)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payout method. Must be: bank_transfer, paypal, or stripe'
      });
    }

    const affiliate = await db.affiliates.findOne({
      where: { user_id: userId }
    });

    if (!affiliate) {
      return res.status(404).json({
        success: false,
        message: 'Affiliate account not found'
      });
    }

    // Update payout details
    if (payout_method) affiliate.payout_method = payout_method;
    if (payout_details) affiliate.payout_details = payout_details;
    await affiliate.save();

    return res.status(200).json({
      success: true,
      message: 'Payout details updated successfully',
      data: {
        payout_method: affiliate.payout_method,
        payout_details: affiliate.payout_details
      }
    });

  } catch (error) {
    console.error('Update Payout Details Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to update payout details',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get affiliate's referral history
 * GET /api/affiliates/referrals
 */
exports.getReferralHistory = async (req, res) => {
  try {
    const userId = req.userId;
    const { page = 1, limit = 20, status } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const affiliate = await db.affiliates.findOne({
      where: { user_id: userId }
    });

    if (!affiliate) {
      return res.status(404).json({
        success: false,
        message: 'Affiliate account not found'
      });
    }

    const where = { affiliate_id: affiliate.affiliate_id };
    if (status) {
      where.status = status;
    }

    const offset = (page - 1) * limit;

    const { count, rows } = await db.referrals.findAndCountAll({
      where,
      include: [{
        model: db.payment_transactions,
        as: 'payment',
        attributes: ['payment_id', 'total_amount', 'shoot_date', 'location', 'status', 'created_at']
      }],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']]
    });

    return res.status(200).json({
      success: true,
      data: {
        referrals: rows.map(r => ({
          referral_id: r.referral_id,
          referral_code: r.referral_code,
          booking_amount: r.booking_amount ? parseFloat(r.booking_amount) : null,
          commission_amount: parseFloat(r.commission_amount),
          status: r.status,
          payout_status: r.payout_status,
          created_at: r.created_at,
          payment: r.payment ? {
            payment_id: r.payment.payment_id,
            total_amount: parseFloat(r.payment.total_amount),
            shoot_date: r.payment.shoot_date,
            location: r.payment.location,
            status: r.payment.status
          } : null
        })),
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get Referral History Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve referral history',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

function formatAffiliateTransactionMethod(method, source, externalReference) {
  const normalized = String(method || source || '').trim().toLowerCase();
  if (normalized === 'stripe' || String(externalReference || '').startsWith('pi_')) return 'Stripe';
  if (normalized === 'booking_checkout' || normalized === 'quote_invoice' || normalized === 'additional_invoice') return 'Stripe';
  if (normalized === 'bank_transfer' || normalized === 'bank transfer') return 'Bank Transfer';
  if (normalized === 'manual') return 'Manual';
  if (normalized === 'paypal') return 'PayPal';
  if (!normalized) return 'Manual';
  return normalized.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatAffiliateTransactionStatus(record = {}) {
  const status = String(record.status || '').trim().toLowerCase();
  const payoutStatus = String(record.payout_status || '').trim().toLowerCase();
  const transactionType = String(record.transaction_type || '').trim().toLowerCase();

  if (transactionType === 'affiliate_payout') {
    if (status === 'paid') return 'paid';
    if (status === 'approved' || status === 'processing') return 'In-Progress';
    if (status === 'failed' || status === 'rejected') return 'Refunded';
    return 'Pending';
  }

  if (status === 'cancelled' || status === 'refunded') return 'Refunded';
  if (payoutStatus === 'paid' || status === 'paid') return 'Paid';
  if (payoutStatus === 'approved' || payoutStatus === 'processing') return 'In-Progress';
  if (status === 'completed' || status === 'pending') return 'Pending';
  return 'Pending';
}

function formatAffiliateReferralTransactionRow(referral) {
  const payment = referral.payment || {};
  const transactionDate = referral.created_at || payment.created_at || null;
  return {
    finance_transaction_id: `ref-${referral.referral_id}`,
    transaction_id: `AFF-REF-${referral.referral_id}`,
    transaction_code: `AFF-REF-${referral.referral_id}`,
    booking_id: payment.payment_id || referral.payment_id || referral.referral_id,
    shoot_id: payment.payment_id || referral.payment_id || null,
    payment_id: referral.payment_id || payment.payment_id || null,
    quote_id: null,
    client_name: payment.user?.name || payment.client_name || referral.referred_guest_email || 'Affiliate Referral',
    client_email: payment.user?.email || referral.referred_guest_email || null,
    client_phone: null,
    shoot_type: payment.shoot_type || 'Affiliate Commission',
    project_name: payment.shoot_type || 'Affiliate Commission',
    event_date: payment.shoot_date || null,
    transaction_date: transactionDate,
    total_amount: parseFloat(referral.commission_amount || 0),
    currency: 'USD',
    payment_method: formatAffiliateTransactionMethod(payment.payment_method, payment.payment_source, payment.stripe_payment_intent_id),
    status: formatAffiliateTransactionStatus({
      status: referral.status,
      payout_status: referral.payout_status,
      transaction_type: 'affiliate_commission'
    }),
    transaction_type: 'affiliate_commission',
    source: 'affiliate',
    external_reference: referral.referral_code || payment.stripe_payment_intent_id || null,
    receipt_number: referral.referral_code ? `REF-${referral.referral_code}` : null,
    invoice_number: payment.payment_id ? `PAY-${payment.payment_id}` : null,
    receipt_url: null,
    receipt_download_url: null,
    manual_payment_id: null,
    invoices_count: payment.payment_id ? 1 : 0,
    latest_invoice: payment.payment_id ? {
      payment_id: payment.payment_id,
      total_amount: parseFloat(payment.total_amount || 0),
      shoot_date: payment.shoot_date || null,
      status: payment.status || null
    } : null,
    metadata: {
      referral_id: referral.referral_id,
      booking_amount: parseFloat(referral.booking_amount || 0),
      commission_amount: parseFloat(referral.commission_amount || 0),
      referral_status: referral.status,
      payout_status: referral.payout_status
    }
  };
}

function formatAffiliatePayoutTransactionRow(payout) {
  return {
    finance_transaction_id: `payout-${payout.payout_id}`,
    transaction_id: `AFF-PAYOUT-${payout.payout_id}`,
    transaction_code: `AFF-PAYOUT-${payout.payout_id}`,
    booking_id: null,
    shoot_id: null,
    payment_id: null,
    quote_id: null,
    client_name: payout.affiliate?.user?.name || 'Affiliate Payout',
    client_email: payout.affiliate?.user?.email || null,
    client_phone: null,
    shoot_type: 'Affiliate Payout',
    project_name: 'Affiliate Payout',
    event_date: null,
    transaction_date: payout.processed_at || payout.created_at || null,
    total_amount: parseFloat(payout.amount || 0),
    currency: 'USD',
    payment_method: formatAffiliateTransactionMethod(payout.payout_method, 'affiliate_payout', payout.transaction_reference),
    status: formatAffiliateTransactionStatus({
      status: payout.status,
      transaction_type: 'affiliate_payout'
    }),
    transaction_type: 'affiliate_payout',
    source: 'affiliate_payout',
    external_reference: payout.transaction_reference || null,
    receipt_number: null,
    invoice_number: null,
    receipt_url: null,
    receipt_download_url: null,
    manual_payment_id: null,
    invoices_count: 0,
    latest_invoice: null,
    metadata: {
      payout_id: payout.payout_id,
      payout_method: payout.payout_method,
      status: payout.status,
      notes: payout.notes || null
    }
  };
}

/**
 * Get the authenticated affiliate's finance transactions
 * GET /api/affiliates/transactions
 */
exports.getAffiliateTransactions = async (req, res) => {
  try {
    const data = await financeService.listClientTransactions(req.query, {
      userId: req.userId || req.user?.userId || null
    });

    return res.status(200).json({
      success: true,
      data: {
        rows: data.rows,
        pagination: data.pagination
      }
    });
  } catch (error) {
    console.error('Get Affiliate Transactions Error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: 'Failed to retrieve affiliate transactions',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

exports.listDisputes = async (req, res) => {
  try {
    const data = await financeDisputeService.listClientDisputes(req.query, {
      userId: req.userId || req.user?.userId || null
    });

    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('List affiliate disputes error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch disputes'
    });
  }
};

exports.getDisputeDetails = async (req, res) => {
  try {
    const data = await financeDisputeService.getClientDisputeDetails(req.params.disputeId, {
      userId: req.userId || req.user?.userId || null
    });

    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Get affiliate dispute details error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch dispute details'
    });
  }
};

exports.addDisputeComment = async (req, res) => {
  try {
    const data = await financeDisputeService.addClientDisputeComment(req.params.disputeId, req.body, {
      userId: req.userId || req.user?.userId || null
    });

    return res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      data
    });
  } catch (error) {
    console.error('Add affiliate dispute comment error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to add comment'
    });
  }
};

exports.addDisputeAttachment = async (req, res) => {
  try {
    const data = await financeDisputeService.addClientDisputeAttachment(req.params.disputeId, req.body, req.files, {
      userId: req.userId || req.user?.userId || null
    });

    return res.status(201).json({
      success: true,
      message: 'Attachment added successfully',
      data
    });
  } catch (error) {
    console.error('Add affiliate dispute attachment error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to add attachment'
    });
  }
};

/**
 * Process a referral when payment is completed
 * Called internally when a payment with referral code is confirmed
 */
exports.processReferral = async (referralCode, paymentId, bookingAmount, referredUserId, referredGuestEmail, transaction = null) => {
  try {
    // Find the affiliate by referral code
    const affiliate = await db.affiliates.findOne({
      where: { 
        referral_code: referralCode.toUpperCase(),
        status: 'active'
      }
    });

    if (!affiliate) {
      console.log('Referral code not found or inactive:', referralCode);
      return null;
    }

    if (!(await isAffiliateEligibleForReferral(affiliate, transaction))) {
      console.log('Referral code owner is not eligible:', referralCode);
      return null;
    }

    // Prevent self-referral
    if (referredUserId && affiliate.user_id === referredUserId) {
      console.log('Self-referral attempted and blocked for user:', referredUserId);
      return null;
    }

    const referral = await awardCommissionToAffiliate(
      affiliate,
      paymentId,
      bookingAmount,
      referredUserId,
      referredGuestEmail,
      referralCode.toUpperCase(),
      transaction
    );

    if (!referral) return null;

    console.log(`Referral processed: ${referral.referral_id} for affiliate ${affiliate.affiliate_id}, commission: ${referral.commission_amount}`);

    return referral;
  } catch (error) {
    console.error('Process Referral Error:', error);
    throw error;
  }
};

/**
 * Process commission for the buyer's own affiliate account (if any)
 * Used when a logged-in user completes payment and also has an active affiliate account.
 */
exports.processUserAffiliateCommission = async (
  referredUserId,
  paymentId,
  bookingAmount,
  referredGuestEmail,
  excludeAffiliateId = null,
  transaction = null
) => {
  try {
    if (!referredUserId) return null;

    const affiliate = await db.affiliates.findOne({
      where: {
        user_id: referredUserId,
        status: 'active'
      }
    });

    if (!affiliate) return null;
    if (!(await isAffiliateEligibleForReferral(affiliate, transaction))) return null;
    if (excludeAffiliateId && Number(affiliate.affiliate_id) === Number(excludeAffiliateId)) {
      return null;
    }

    const referral = await awardCommissionToAffiliate(
      affiliate,
      paymentId,
      bookingAmount,
      referredUserId,
      referredGuestEmail,
      affiliate.referral_code,
      transaction
    );

    if (!referral) return null;

    console.log(`User-affiliate commission processed: ${referral.referral_id} for affiliate ${affiliate.affiliate_id}, commission: ${referral.commission_amount}`);
    return referral;
  } catch (error) {
    console.error('Process User Affiliate Commission Error:', error);
    throw error;
  }
};

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

/**
 * Get all affiliates (admin)
 * GET /api/affiliates/admin/list
 */
exports.getAllAffiliates = async (req, res) => {
  try {
    const { status, page = 1, limit = 50, search } = req.query;

    const where = {};
    if (status) {
      where.status = status;
    }

    const offset = (page - 1) * limit;

    const { count, rows } = await db.affiliates.findAndCountAll({
      where,
      include: [{
        model: db.users,
        as: 'user',
        attributes: ['id', 'name', 'email', 'phone_number'],
        where: search ? {
          [db.Sequelize.Op.or]: [
            { name: { [db.Sequelize.Op.like]: `%${search}%` } },
            { email: { [db.Sequelize.Op.like]: `%${search}%` } }
          ]
        } : undefined
      }],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']]
    });

    return res.status(200).json({
      success: true,
      data: {
        affiliates: rows.map(a => ({
          affiliate_id: a.affiliate_id,
          referral_code: a.referral_code,
          status: a.status,
          total_referrals: a.total_referrals,
          successful_referrals: a.successful_referrals,
          total_earnings: parseFloat(a.total_earnings),
          pending_earnings: parseFloat(a.pending_earnings),
          paid_earnings: parseFloat(a.paid_earnings),
          payout_method: a.payout_method,
          user: a.user ? {
            id: a.user.id,
            name: a.user.name,
            email: a.user.email,
            phone_number: a.user.phone_number
          } : null,
          created_at: a.created_at
        })),
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get All Affiliates Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve affiliates',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get affiliate by ID (admin)
 * GET /api/affiliates/admin/:id
 */
exports.getAffiliateById = async (req, res) => {
  try {
    const { id } = req.params;

    const affiliate = await db.affiliates.findByPk(id, {
      include: [
        {
          model: db.users,
          as: 'user',
          attributes: ['id', 'name', 'email', 'phone_number']
        },
        {
          model: db.referrals,
          as: 'referrals',
          limit: 20,
          order: [['created_at', 'DESC']],
          include: [{
            model: db.payment_transactions,
            as: 'payment',
            attributes: ['payment_id', 'total_amount', 'shoot_date', 'status']
          }]
        },
        {
          model: db.affiliate_payouts,
          as: 'payouts',
          limit: 10,
          order: [['created_at', 'DESC']]
        }
      ]
    });

    if (!affiliate) {
      return res.status(404).json({
        success: false,
        message: 'Affiliate not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        affiliate_id: affiliate.affiliate_id,
        referral_code: affiliate.referral_code,
        status: affiliate.status,
        total_referrals: affiliate.total_referrals,
        successful_referrals: affiliate.successful_referrals,
        total_earnings: parseFloat(affiliate.total_earnings),
        pending_earnings: parseFloat(affiliate.pending_earnings),
        paid_earnings: parseFloat(affiliate.paid_earnings),
        payout_method: affiliate.payout_method,
        payout_details: affiliate.payout_details,
        user: affiliate.user,
        referrals: affiliate.referrals,
        payouts: affiliate.payouts,
        created_at: affiliate.created_at,
        updated_at: affiliate.updated_at
      }
    });

  } catch (error) {
    console.error('Get Affiliate By ID Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve affiliate',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Update affiliate status (admin)
 * PATCH /api/affiliates/admin/:id/status
 */
exports.updateAffiliateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['active', 'paused', 'suspended'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be: active, paused, or suspended'
      });
    }

    const affiliate = await db.affiliates.findByPk(id);

    if (!affiliate) {
      return res.status(404).json({
        success: false,
        message: 'Affiliate not found'
      });
    }

    affiliate.status = status;
    await affiliate.save();

    return res.status(200).json({
      success: true,
      message: 'Affiliate status updated successfully',
      data: {
        affiliate_id: affiliate.affiliate_id,
        referral_code: affiliate.referral_code,
        status: affiliate.status
      }
    });

  } catch (error) {
    console.error('Update Affiliate Status Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to update affiliate status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Approve payout for referrals (admin)
 * POST /api/affiliates/admin/approve-payout
 */
exports.approvePayout = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { affiliate_id, referral_ids, notes } = req.body;
    const adminUserId = req.userId;

    if (!affiliate_id) {
      return res.status(400).json({
        success: false,
        message: 'Affiliate ID is required'
      });
    }

    const affiliate = await db.affiliates.findByPk(affiliate_id);

    if (!affiliate) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Affiliate not found'
      });
    }

    // Get pending referrals for this affiliate
    const where = {
      affiliate_id: affiliate_id,
      status: 'completed',
      payout_status: 'pending'
    };

    if (referral_ids && referral_ids.length > 0) {
      where.referral_id = { [db.Sequelize.Op.in]: referral_ids };
    }

    const pendingReferrals = await db.referrals.findAll({ where });

    if (pendingReferrals.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'No pending referrals found for payout'
      });
    }

    // Calculate total payout amount
    const payoutAmount = pendingReferrals.reduce((sum, r) => sum + parseFloat(r.commission_amount), 0);

    // Create payout record
    const payout = await db.affiliate_payouts.create({
      affiliate_id: affiliate_id,
      amount: payoutAmount,
      payout_method: affiliate.payout_method || 'bank_transfer',
      payout_details: affiliate.payout_details,
      status: 'approved',
      processed_by: adminUserId,
      processed_at: new Date(),
      notes: notes || null
    }, { transaction });

    // Update referrals payout status
    await db.referrals.update(
      { payout_status: 'approved' },
      { 
        where: { referral_id: { [db.Sequelize.Op.in]: pendingReferrals.map(r => r.referral_id) } },
        transaction
      }
    );

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: 'Payout approved successfully',
      data: {
        payout_id: payout.payout_id,
        affiliate_id: affiliate_id,
        amount: payoutAmount,
        referrals_count: pendingReferrals.length,
        status: 'approved'
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Approve Payout Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to approve payout',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Mark payout as paid (admin)
 * PATCH /api/affiliates/admin/payouts/:id/paid
 */
exports.markPayoutPaid = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { id } = req.params;
    const { transaction_reference, notes } = req.body;
    const adminUserId = req.userId;

    const payout = await db.affiliate_payouts.findByPk(id, {
      include: [{
        model: db.affiliates,
        as: 'affiliate'
      }]
    });

    if (!payout) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Payout not found'
      });
    }

    if (payout.status === 'paid') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Payout already marked as paid'
      });
    }

    // Update payout status
    payout.status = 'paid';
    payout.transaction_reference = transaction_reference || null;
    payout.processed_by = adminUserId;
    payout.processed_at = new Date();
    if (notes) payout.notes = notes;
    await payout.save({ transaction });

    // Update affiliate earnings
    const affiliate = payout.affiliate;
    affiliate.pending_earnings = parseFloat(affiliate.pending_earnings) - parseFloat(payout.amount);
    affiliate.paid_earnings = parseFloat(affiliate.paid_earnings) + parseFloat(payout.amount);
    await affiliate.save({ transaction });

    // Update referrals payout status to paid
    await db.referrals.update(
      { payout_status: 'paid' },
      { 
        where: { 
          affiliate_id: affiliate.affiliate_id,
          payout_status: 'approved'
        },
        transaction
      }
    );

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: 'Payout marked as paid successfully',
      data: {
        payout_id: payout.payout_id,
        amount: parseFloat(payout.amount),
        status: payout.status,
        transaction_reference: payout.transaction_reference
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Mark Payout Paid Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to mark payout as paid',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get all payouts (admin)
 * GET /api/affiliates/admin/payouts
 */
exports.getAllPayouts = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;

    const where = {};
    if (status) {
      where.status = status;
    }

    const offset = (page - 1) * limit;

    const { count, rows } = await db.affiliate_payouts.findAndCountAll({
      where,
      include: [
        {
          model: db.affiliates,
          as: 'affiliate',
          include: [{
            model: db.users,
            as: 'user',
            attributes: ['id', 'name', 'email']
          }]
        },
        {
          model: db.users,
          as: 'processor',
          attributes: ['id', 'name'],
          required: false
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']]
    });

    return res.status(200).json({
      success: true,
      data: {
        payouts: rows.map(p => ({
          payout_id: p.payout_id,
          amount: parseFloat(p.amount),
          payout_method: p.payout_method,
          status: p.status,
          transaction_reference: p.transaction_reference,
          processed_at: p.processed_at,
          notes: p.notes,
          affiliate: p.affiliate ? {
            affiliate_id: p.affiliate.affiliate_id,
            referral_code: p.affiliate.referral_code,
            user: p.affiliate.user
          } : null,
          processor: p.processor,
          created_at: p.created_at
        })),
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get All Payouts Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve payouts',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

exports.updateReferralCode = async (req, res) => {
  try {
    const { affiliate_id, referral_code } = req.body;

    // Validation
    if (!affiliate_id || !referral_code) {
      return res.status(400).json({
        success: false,
        message: "affiliate_id and referral_code are required",
      });
    }

    // Normalize referral code
    const normalizedCode = referral_code.trim().toUpperCase();

    if (normalizedCode.length < 4 || normalizedCode.length > 20) {
      return res.status(400).json({
        success: false,
        message: "Referral code must be between 4 and 20 characters long",
      });
    }

    // Check affiliate exists
    const affiliate = await Affiliate.findOne({
      where: { affiliate_id },
    });

    if (!affiliate) {
      return res.status(404).json({
        success: false,
        message: "Affiliate not found",
      });
    }

    // Check referral code uniqueness
    const existingCode = await Affiliate.findOne({
      where: {
        referral_code: normalizedCode,
        affiliate_id: { [Op.ne]: affiliate_id },
      },
    });

    if (existingCode) {
      return res.status(200).json({
        success: false,
        message: "Referral code already in use by another affiliate",
      });
    }

    // Update referral code
    await Affiliate.update(
      { referral_code: normalizedCode },
      { where: { affiliate_id } }
    );

    return res.status(200).json({
      success: true,
      message: "Referral code updated successfully",
      data: {
        affiliate_id,
        referral_code: normalizedCode,
      },
    });

  } catch (error) {
    console.error("Update Referral Code Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating referral code",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
