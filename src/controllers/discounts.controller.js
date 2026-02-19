const { discount_codes, sales_leads, sales_lead_activities, quotes, stream_project_booking } = require('../models');
const db = require('../models');
const discountService = require('../services/discount.service');
const constants = require('../utils/constants');

/**
 * Generate discount code
 * POST /api/sales/discount-codes
 */
exports.generateDiscountCode = async (req, res) => {
  try {
    const {
      lead_id,
      booking_id,
      discount_type,
      discount_value,
      usage_type,
      max_uses,
      expires_at
    } = req.body;

    const createdBy = req.userId; // From auth middleware

    // 1. Basic Validation
    if (!discount_type || !discount_value) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Discount type and value are required'
      });
    }

    // --- NEW CONDITION: CHECK IF QUOTE EXISTS ---
    // We look for the booking to see if it has a quote_id
    const booking = await stream_project_booking.findOne({
      where: booking_id ? { stream_project_booking_id: booking_id } : { lead_id: lead_id }
    });

    if (!booking) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Booking not found for the provided ID'
      });
    }

    // Check if the booking has an associated quote
    if (!booking.quote_id) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Cannot generate discount code: A quote must be generated first.'
      });
    }
    // --------------------------------------------

    if (!['percentage', 'fixed_amount'].includes(discount_type)) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Invalid discount type. Must be "percentage" or "fixed_amount"'
      });
    }

    if (discount_value <= 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Discount value must be greater than 0'
      });
    }

    if (discount_type === 'percentage' && discount_value > 100) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Percentage discount cannot exceed 100%'
      });
    }

    if (usage_type === 'multi_use' && !max_uses) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Max uses required for multi-use discount codes'
      });
    }

    // Generate unique code
    const code = await discountService.generateUniqueCode();

    // Create discount code
    const discountCode = await discount_codes.create({
      code,
      lead_id: lead_id || booking.lead_id || null, // Ensure lead_id is captured from booking if not in body
      booking_id: booking.stream_project_booking_id,
      discount_type,
      discount_value,
      usage_type: usage_type || 'one_time',
      max_uses: usage_type === 'multi_use' ? max_uses : null,
      expires_at: expires_at || null,
      created_by_user_id: createdBy,
      is_active: 1
    });

    // Log activity if associated with lead
    const finalLeadId = lead_id || booking.lead_id;
    if (finalLeadId) {
      await sales_lead_activities.create({
        lead_id: finalLeadId,
        activity_type: 'discount_code_generated',
        activity_data: {
          discount_code_id: discountCode.discount_code_id,
          code: discountCode.code,
          discount_type,
          discount_value
        },
        performed_by_user_id: createdBy
      });
    }

    res.status(constants.CREATED.code).json({
      success: true,
      message: 'Discount code generated successfully',
      data: {
        discount_code_id: discountCode.discount_code_id,
        code: discountCode.code,
        discount_type: discountCode.discount_type,
        discount_value: parseFloat(discountCode.discount_value),
        usage_type: discountCode.usage_type,
        max_uses: discountCode.max_uses,
        expires_at: discountCode.expires_at
      }
    });

  } catch (error) {
    console.error('Error generating discount code:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to generate discount code',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Validate discount code
 * GET /api/sales/discount-codes/:code/validate
 */
exports.validateDiscountCode = async (req, res) => {
  try {
    const { code } = req.params;
    const { booking_id } = req.query; // Optional query param for booking validation

    if (!code) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Discount code is required'
      });
    }

    // Validate with optional booking_id
    const result = await discountService.checkCodeAvailability(
      code.toUpperCase(),
      booking_id ? parseInt(booking_id) : null
    );

    if (!result.valid) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        valid: false,
        message: result.reason
      });
    }

    const discountCode = result.discountCode;

    res.json({
      success: true,
      valid: true,
      data: {
        discount_code_id: discountCode.discount_code_id,
        code: discountCode.code,
        discount_type: discountCode.discount_type,
        discount_value: parseFloat(discountCode.discount_value),
        usage_type: discountCode.usage_type,
        current_uses: discountCode.current_uses,
        max_uses: discountCode.max_uses,
        expires_at: discountCode.expires_at
      }
    });

  } catch (error) {
    console.error('Error validating discount code:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to validate discount code',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Apply discount code to quote/booking
 * POST /api/sales/discount-codes/:code/apply
 */
exports.applyDiscountCode = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { code } = req.params;
    const { quote_id, booking_id, user_id, guest_email } = req.body;

    if (!quote_id) {
      await transaction.rollback();
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Quote ID is required'
      });
    }

    // Get quote first to extract booking_id if not provided
    const quote = await quotes.findByPk(quote_id);

    if (!quote) {
      await transaction.rollback();
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Quote not found'
      });
    }

    // Use booking_id from request body or quote's booking_id
    const effectiveBookingId = booking_id || quote.booking_id;

    // Validate discount code with booking_id
    const result = await discountService.checkCodeAvailability(
      code.toUpperCase(),
      effectiveBookingId
    );

    if (!result.valid) {
      await transaction.rollback();
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: result.reason
      });
    }

    const discountCode = result.discountCode;

    // Calculate discount
    const subtotal = parseFloat(quote.subtotal);
    const { discountAmount, finalAmount } = discountService.calculateDiscountAmount(
      subtotal,
      discountCode
    );

    // Recalculate total with margin
    const marginAmount = (finalAmount * parseFloat(quote.margin_percent)) / 100;
    const newTotal = finalAmount + marginAmount;

    // Update quote
    await quote.update({
      discount_code_id: discountCode.discount_code_id,
      applied_discount_type: discountCode.discount_type,
      applied_discount_value: discountCode.discount_value,
      discount_percent: discountCode.discount_type === 'percentage' ? discountCode.discount_value : 0,
      discount_amount: discountAmount,
      price_after_discount: finalAmount,
      total: newTotal
    }, { transaction });

    // Increment usage count (within transaction)
    await discountService.incrementUsageCount(discountCode.discount_code_id, transaction);

    // Log usage
    await discountService.logUsage(
      discountCode.discount_code_id,
      effectiveBookingId,
      user_id || null,
      guest_email || null,
      subtotal,
      discountAmount,
      finalAmount,
      transaction
    );

    // Update lead status if associated with lead
    if (discountCode.lead_id) {
      await sales_leads.update(
        { lead_status: 'discount_applied' },
        { 
          where: { lead_id: discountCode.lead_id },
          transaction
        }
      );

      // Log activity
      await sales_lead_activities.create({
        lead_id: discountCode.lead_id,
        activity_type: 'discount_applied',
        activity_data: {
          discount_code_id: discountCode.discount_code_id,
          code: discountCode.code,
          discount_amount: discountAmount,
          quote_id
        }
      }, { transaction });
    }

    await transaction.commit();

    res.json({
      success: true,
      message: 'Discount code applied successfully',
      data: {
        original_total: subtotal,
        discount_amount: discountAmount,
        subtotal_after_discount: finalAmount,
        margin_amount: Math.round(marginAmount * 100) / 100,
        final_total: Math.round(newTotal * 100) / 100
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Error applying discount code:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to apply discount code',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get discount code details
 * GET /api/sales/discount-codes/:id
 */
exports.getDiscountCodeDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const discountCode = await discount_codes.findByPk(id, {
      include: [
        {
          model: sales_leads,
          as: 'lead',
          attributes: ['lead_id', 'client_name', 'guest_email', 'lead_status']
        }
      ]
    });

    if (!discountCode) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Discount code not found'
      });
    }

    // Get statistics
    const stats = await discountService.getCodeStatistics(id);

    res.json({
      success: true,
      data: {
        ...discountCode.toJSON(),
        statistics: stats
      }
    });

  } catch (error) {
    console.error('Error fetching discount code details:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch discount code details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Deactivate discount code
 * DELETE /api/sales/discount-codes/:id
 */
exports.deactivateDiscountCode = async (req, res) => {
  try {
    const { id } = req.params;
    const performedBy = req.userId;

    const discountCode = await discount_codes.findByPk(id);

    if (!discountCode) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Discount code not found'
      });
    }

    await discountService.deactivateCode(id);

    res.json({
      success: true,
      message: 'Discount code deactivated successfully'
    });

  } catch (error) {
    console.error('Error deactivating discount code:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to deactivate discount code',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get discount code usage history
 * GET /api/sales/discount-codes/:id/usage
 */
exports.getDiscountCodeUsageHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const { discount_code_usage } = require('../models');

    const discountCode = await discount_codes.findByPk(id);

    if (!discountCode) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Discount code not found'
      });
    }

    const usageHistory = await discount_code_usage.findAll({
      where: { discount_code_id: id },
      include: [
        {
          association: 'user',
          attributes: ['id', 'name', 'email']
        },
        {
          association: 'booking',
          attributes: ['stream_project_booking_id', 'project_name', 'event_date']
        }
      ],
      order: [['used_at', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        discount_code: {
          code: discountCode.code,
          discount_type: discountCode.discount_type,
          discount_value: parseFloat(discountCode.discount_value)
        },
        usage_history: usageHistory
      }
    });

  } catch (error) {
    console.error('Error fetching usage history:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch usage history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = exports;
