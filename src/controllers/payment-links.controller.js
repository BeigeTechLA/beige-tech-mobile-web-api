const { payment_links, sales_leads, sales_lead_activities, discount_codes, stream_project_booking } = require('../models');
const db = require('../models');
const paymentLinksService = require('../services/payment-links.service');
const constants = require('../utils/constants');

/**
 * Generate payment link
 * POST /api/sales/payment-links
 */
exports.generatePaymentLink = async (req, res) => {
  try {
    const {
      lead_id,
      booking_id,
      discount_code_id,
      expiry_hours
    } = req.body;

    const createdBy = req.userId; // From auth middleware

    // Validation
    if (!booking_id) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Booking ID is required'
      });
    }

    // Verify booking exists
    const booking = await stream_project_booking.findByPk(booking_id);

    if (!booking) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Generate unique token
    const token = paymentLinksService.generateLinkToken();

    // Calculate expiration
    let expiresAt;
    if (expiry_hours) {
      expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + parseInt(expiry_hours));
    } else {
      expiresAt = paymentLinksService.getDefaultExpiration();
    }

    // Create payment link
    const paymentLink = await payment_links.create({
      link_token: token,
      lead_id: lead_id || null,
      booking_id,
      discount_code_id: discount_code_id || null,
      created_by_user_id: createdBy,
      expires_at: expiresAt,
      is_used: 0
    });

    // Get discount code if provided
    let discountCode = null;
    if (discount_code_id) {
      discountCode = await discount_codes.findByPk(discount_code_id);
    }

    // Build payment URL
    const paymentUrl = paymentLinksService.buildPaymentUrl(
      token,
      discountCode ? discountCode.code : null
    );

    // Update lead status if associated with lead
    if (lead_id) {
      await sales_leads.update(
        { lead_status: 'payment_link_sent' },
        { where: { lead_id } }
      );

      // Log activity
      await sales_lead_activities.create({
        lead_id,
        activity_type: 'payment_link_generated',
        activity_data: {
          payment_link_id: paymentLink.payment_link_id,
          booking_id,
          discount_code_id,
          expires_at: expiresAt
        },
        performed_by_user_id: createdBy
      });
    }

    res.status(constants.CREATED.code).json({
      success: true,
      message: 'Payment link generated successfully',
      data: {
        payment_link_id: paymentLink.payment_link_id,
        link_token: token,
        url: paymentUrl,
        expires_at: expiresAt,
        discount_code: discountCode ? {
          code: discountCode.code,
          discount_type: discountCode.discount_type,
          discount_value: parseFloat(discountCode.discount_value)
        } : null
      }
    });

  } catch (error) {
    console.error('Error generating payment link:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to generate payment link',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get payment link details
 * GET /api/sales/payment-links/:token
 */
exports.getPaymentLinkDetails = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Payment link token is required'
      });
    }

    // Validate link
    const result = await paymentLinksService.checkLinkExpiration(token);

    if (!result.valid) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        valid: false,
        message: result.reason
      });
    }

    const paymentLink = result.paymentLink;

    // Get booking details
    const booking = await stream_project_booking.findByPk(paymentLink.booking_id, {
      attributes: [
        'stream_project_booking_id',
        'project_name',
        'event_type',
        'event_date',
        'event_location',
        'duration_hours',
        'budget',
        'description',
        'guest_email'
      ]
    });

    // Get discount code if linked
    let discountCode = null;
    if (paymentLink.discount_code_id) {
      discountCode = await discount_codes.findByPk(paymentLink.discount_code_id, {
        attributes: [
          'discount_code_id',
          'code',
          'discount_type',
          'discount_value',
          'expires_at'
        ]
      });
    }

    res.json({
      success: true,
      valid: true,
      data: {
        payment_link_id: paymentLink.payment_link_id,
        booking,
        discount_code: discountCode,
        expires_at: paymentLink.expires_at
      }
    });

  } catch (error) {
    console.error('Error fetching payment link details:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch payment link details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Validate payment link (check if valid and not expired)
 * GET /api/sales/payment-links/:token/validate
 */
exports.validatePaymentLink = async (req, res) => {
  try {
    const { token } = req.params;

    const result = await paymentLinksService.checkLinkExpiration(token);

    if (!result.valid) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        valid: false,
        message: result.reason
      });
    }

    res.json({
      success: true,
      valid: true,
      data: {
        booking_id: result.paymentLink.booking_id,
        discount_code_id: result.paymentLink.discount_code_id,
        expires_at: result.paymentLink.expires_at
      }
    });

  } catch (error) {
    console.error('Error validating payment link:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to validate payment link',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Mark payment link as used (called after successful payment)
 * POST /api/sales/payment-links/:token/mark-used
 */
exports.markLinkAsUsed = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { token } = req.params;

    const paymentLink = await payment_links.findOne({
      where: { link_token: token }
    });

    if (!paymentLink) {
      await transaction.rollback();
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Payment link not found'
      });
    }

    // Mark as used
    await paymentLinksService.markLinkAsUsed(token, transaction);

    // Update lead status to booked if associated with lead
    if (paymentLink.lead_id) {
      await sales_leads.update(
        { lead_status: 'booked' },
        { 
          where: { lead_id: paymentLink.lead_id },
          transaction
        }
      );

      // Log activity
      await sales_lead_activities.create({
        lead_id: paymentLink.lead_id,
        activity_type: 'payment_completed',
        activity_data: {
          payment_link_id: paymentLink.payment_link_id,
          booking_id: paymentLink.booking_id
        }
      }, { transaction });
    }

    await transaction.commit();

    res.json({
      success: true,
      message: 'Payment link marked as used'
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Error marking payment link as used:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to mark payment link as used',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get payment links for a sales rep
 * GET /api/sales/payment-links/rep/:repId
 */
exports.getSalesRepPaymentLinks = async (req, res) => {
  try {
    const { repId } = req.params;
    const { status = 'all' } = req.query;

    const whereClause = {
      created_by_user_id: parseInt(repId)
    };

    if (status === 'active') {
      whereClause.is_used = 0;
      whereClause.expires_at = {
        [require('sequelize').Op.gt]: new Date()
      };
    } else if (status === 'used') {
      whereClause.is_used = 1;
    } else if (status === 'expired') {
      whereClause.is_used = 0;
      whereClause.expires_at = {
        [require('sequelize').Op.lte]: new Date()
      };
    }

    const links = await payment_links.findAll({
      where: whereClause,
      include: [
        {
          model: stream_project_booking,
          as: 'booking',
          attributes: ['stream_project_booking_id', 'project_name', 'event_date']
        },
        {
          model: discount_codes,
          as: 'discount_code',
          attributes: ['code', 'discount_type', 'discount_value']
        },
        {
          model: sales_leads,
          as: 'lead',
          attributes: ['lead_id', 'client_name', 'lead_status']
        }
      ],
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        links
      }
    });

  } catch (error) {
    console.error('Error fetching payment links:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch payment links',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = exports;
