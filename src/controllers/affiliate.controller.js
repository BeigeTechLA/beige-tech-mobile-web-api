const db = require('../models');
const crypto = require('crypto');

// Fixed commission amount per successful booking (200 SAR)
const COMMISSION_AMOUNT = 200.00;

/**
 * Generate a unique referral code
 * Format: 6 alphanumeric characters (uppercase)
 */
function generateReferralCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

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
exports.validateReferralCode = async (req, res) => {
  try {
    const { code } = req.params;

    if (!code || code.length < 4) {
      return res.status(400).json({
        success: false,
        message: 'Invalid referral code format'
      });
    }

    const affiliate = await db.affiliates.findOne({
      where: { 
        referral_code: code.toUpperCase(),
        status: 'active'
      },
      include: [{
        model: db.users,
        as: 'user',
        attributes: ['id', 'name']
      }]
    });

    if (!affiliate) {
      return res.status(404).json({
        success: false,
        message: 'Referral code not found or inactive',
        valid: false
      });
    }

    return res.status(200).json({
      success: true,
      valid: true,
      data: {
        referral_code: affiliate.referral_code,
        affiliate_name: affiliate.user?.name || 'Beige Partner'
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
          commission_per_booking: COMMISSION_AMOUNT
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

    // Prevent self-referral
    if (referredUserId && affiliate.user_id === referredUserId) {
      console.log('Self-referral attempted and blocked for user:', referredUserId);
      return null;
    }

    // Create referral record
    const referral = await db.referrals.create({
      affiliate_id: affiliate.affiliate_id,
      payment_id: paymentId,
      referral_code: referralCode.toUpperCase(),
      referred_user_id: referredUserId || null,
      referred_guest_email: referredGuestEmail || null,
      booking_amount: bookingAmount,
      commission_amount: COMMISSION_AMOUNT,
      status: 'completed', // Payment already succeeded
      payout_status: 'pending'
    }, { transaction });

    // Update affiliate stats
    affiliate.total_referrals = affiliate.total_referrals + 1;
    affiliate.successful_referrals = affiliate.successful_referrals + 1;
    affiliate.total_earnings = parseFloat(affiliate.total_earnings) + COMMISSION_AMOUNT;
    affiliate.pending_earnings = parseFloat(affiliate.pending_earnings) + COMMISSION_AMOUNT;
    await affiliate.save({ transaction });

    console.log(`Referral processed: ${referral.referral_id} for affiliate ${affiliate.affiliate_id}, commission: ${COMMISSION_AMOUNT} SAR`);

    return referral;
  } catch (error) {
    console.error('Process Referral Error:', error);
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

