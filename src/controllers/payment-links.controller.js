const { payment_links, sales_leads, sales_lead_activities, discount_codes, stream_project_booking, quotes, quote_line_items, users } = require('../models');
const db = require('../models');
const paymentLinksService = require('../services/payment-links.service');
const constants = require('../utils/constants');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const emailService = require('../utils/emailService');
const discountService = require('../services/discount.service');
const { Op } = require('sequelize');

const applyQuoteDiscountFromLatestPaymentLink = async (booking, performedByUserId = null) => {
    if (!booking || !booking.primary_quote) return false;
    if (booking.payment_id || booking.is_completed === 1) return false;

    const existingDiscount = parseFloat(booking.primary_quote.discount_amount || 0);
    if (existingDiscount > 0 || booking.primary_quote.discount_code_id) return false;

    const linkWithDiscount = await payment_links.findOne({
        where: {
            booking_id: booking.stream_project_booking_id,
            discount_code_id: { [Op.ne]: null }
        },
        order: [['created_at', 'DESC']]
    });

    if (!linkWithDiscount || !linkWithDiscount.discount_code_id) return false;

    const discountCode = await discount_codes.findByPk(linkWithDiscount.discount_code_id);
    if (!discountCode) return false;

    const codeCheck = await discountService.checkCodeAvailability(
        discountCode.code,
        booking.stream_project_booking_id
    );

    if (!codeCheck.valid) return false;

    const validDiscountCode = codeCheck.discountCode;
    const subtotal = parseFloat(booking.primary_quote.subtotal || 0);
    const { discountAmount, finalAmount } = discountService.calculateDiscountAmount(
        subtotal,
        validDiscountCode
    );

    if (discountAmount <= 0) return false;

    const marginPercent = parseFloat(booking.primary_quote.margin_percent || 0);
    const marginAmount = (finalAmount * marginPercent) / 100;
    const newTotal = finalAmount + marginAmount;

    await booking.primary_quote.update({
        discount_code_id: validDiscountCode.discount_code_id,
        applied_discount_type: validDiscountCode.discount_type,
        applied_discount_value: validDiscountCode.discount_value,
        discount_percent: validDiscountCode.discount_type === 'percentage' ? validDiscountCode.discount_value : 0,
        discount_amount: discountAmount,
        price_after_discount: finalAmount,
        total: newTotal
    });

    await discountService.incrementUsageCount(validDiscountCode.discount_code_id);
    await discountService.logUsage(
        validDiscountCode.discount_code_id,
        booking.stream_project_booking_id,
        booking.user_id || null,
        booking.guest_email || null,
        subtotal,
        discountAmount,
        finalAmount
    );

    if (validDiscountCode.lead_id) {
        await sales_leads.update(
            { lead_status: 'discount_applied' },
            { where: { lead_id: validDiscountCode.lead_id } }
        );

        await sales_lead_activities.create({
            lead_id: validDiscountCode.lead_id,
            activity_type: 'discount_applied',
            activity_data: {
                discount_code_id: validDiscountCode.discount_code_id,
                code: validDiscountCode.code,
                discount_amount: discountAmount,
                quote_id: booking.primary_quote.quote_id
            },
            performed_by_user_id: performedByUserId
        });
    }

    return true;
};

const calculateLeadPricing = async (booking) => {
    if (!booking) return null;

    try {
        const bookingMarkedPaid = !!(booking.payment_id || booking.is_completed === 1);

        if (bookingMarkedPaid) {
            const transaction = await db.payment_transactions.findByPk(booking.payment_id);
            if (transaction) {
                return {
                    source: 'transaction',
                    is_paid: true,
                    stripe_payment_intent_id: transaction.stripe_payment_intent_id,
                    total: parseFloat(transaction.total_amount || 0),
                    subtotal: parseFloat(transaction.subtotal || 0),
                    line_items: [{
                        name: `Service Payment - ${booking.project_name || 'Project'}`,
                        quantity: 1,
                        total: parseFloat(transaction.total_amount || 0)
                    }]
                };
            }
        }

        // --- CASE 2: Formal Quote exists in Database ---
        const q = booking.primary_quote; 
        if (q) {
            return {
                source: 'database',
                is_paid: bookingMarkedPaid,
                total: parseFloat(q.price_after_discount || q.total || 0),
                subtotal: parseFloat(q.subtotal || 0),
                discount_amount: parseFloat(q.discount_amount || 0),
                line_items: (q.line_items || []).map(item => ({
                    name: item.item_name,
                    quantity: item.quantity,
                    total: parseFloat(item.line_total)
                }))
            };
        }

        // --- CASE 3: Fallback Manual Calculation ---
        const ROLE_TO_ITEM_MAP = { videographer: 11, photographer: 10, cinematographer: 12 };
        let crewRoles = typeof booking.crew_roles === 'string' 
            ? JSON.parse(booking.crew_roles || '{}') 
            : (booking.crew_roles || {});

        if ((!crewRoles || Object.keys(crewRoles).length === 0) && booking.event_type) {
            const types = booking.event_type.toLowerCase();
            if (types.includes('videographer')) crewRoles.videographer = 1;
            if (types.includes('photographer')) crewRoles.photographer = 1;
        }

        const items = Object.entries(crewRoles).map(([role, count]) => ({
            item_id: ROLE_TO_ITEM_MAP[role.toLowerCase()],
            quantity: count
        })).filter(item => item.item_id);

        let hours = Number(booking.duration_hours) || 8;
        
        const calculated = await pricingService.calculateQuote({
            items,
            shootHours: hours,
            eventType: booking.shoot_type || booking.event_type || 'general',
            shootStartDate: booking.event_date,
            skipDiscount: true, 
            skipMargin: true
        });

        return {
            source: 'calculated',
            is_paid: bookingMarkedPaid,
            total: calculated?.total || 0,
            subtotal: calculated?.subtotal || 0,
            discount_amount: calculated?.discountAmount || 0,
            line_items: (calculated?.lineItems || []).map(li => ({
                name: li.item_name,
                quantity: li.quantity,
                total: li.line_total
            }))
        };
    } catch (error) {
        console.error('Pricing calculation failed:', error);
        return null;
    }
};

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

    const createdBy = req.userId;

    // 1. Basic Validation
    if (!booking_id) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID is required'
      });
    }

    // 2. Verify booking exists
    const booking = await stream_project_booking.findByPk(booking_id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // --- NEW CONDITION: CHECK IF QUOTE EXISTS ---
    // If quote_id is null, it means the quote hasn't been generated yet
    if (!booking.quote_id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot generate payment link: A quote must be generated and attached to the booking first.'
      });
    }
    // --------------------------------------------

    // 3. Check if already paid
    if (booking.payment_id) {
      return res.status(400).json({
        success: false,
        message: 'Payment for this booking has already been completed. No new link is required.'
      });
    }

    const token = paymentLinksService.generateLinkToken();

    // 4. Calculate expiration
    let expiresAt;
    if (expiry_hours) {
      expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + parseInt(expiry_hours));
    } else {
      expiresAt = paymentLinksService.getDefaultExpiration();
    }

    // 5. Create payment link record
    const paymentLink = await payment_links.create({
      link_token: token,
      lead_id: lead_id || booking.lead_id || null, // Fallback to lead_id from booking if not in body
      booking_id,
      discount_code_id: discount_code_id || null,
      created_by_user_id: createdBy,
      expires_at: expiresAt,
      is_used: 0
    });

    // 6. Get discount code if provided (to include in the URL)
    let discountCode = null;
    if (discount_code_id) {
      discountCode = await discount_codes.findByPk(discount_code_id);
    }

    // 7. Build final payment URL
    const paymentUrl = paymentLinksService.buildPaymentUrl(
      token,
      discountCode ? discountCode.code : null
    );

    // 8. Update lead status if associated with lead
    const finalLeadId = lead_id || booking.lead_id;
    if (finalLeadId) {
      await sales_leads.update(
        { lead_status: 'payment_link_sent' },
        { where: { lead_id: finalLeadId } }
      );

      // Log activity
      await sales_lead_activities.create({
        lead_id: finalLeadId,
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

    res.status(201).json({
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
    res.status(500).json({
      success: false,
      message: 'Failed to generate payment link',
      error: error.message
    });
  }
};

exports.sendPaymentLinkEmail = async (req, res) => {
  try {
    const { payment_link_id } = req.body;

    if (!payment_link_id) {
      return res.status(400).json({ success: false, message: 'Payment link ID is required' });
    }

    const link = await payment_links.findOne({
      where: { payment_link_id },
      include: [
        {
          model: stream_project_booking,
          as: 'booking', 
          include: [{ model: users, as: 'user', required: false }]
        }
      ]
    });

    if (!link || !link.booking) {
      return res.status(404).json({ success: false, message: 'Payment link or Booking not found' });
    }

    let recipientEmail = null;
    let recipientName = 'Customer';

    if (link.booking.user) {
      recipientEmail = link.booking.user.email;
      recipientName = link.booking.user.name;
    } else if (link.booking.guest_email) {
      recipientEmail = link.booking.guest_email;
      recipientName = link.booking.project_name.split(' - ')[1] || 'Valued Guest';
    }

    if (!recipientEmail) {
      return res.status(404).json({ success: false, message: 'No email address found for this booking' });
    }

    const paymentUrl = paymentLinksService.buildPaymentUrl(link.link_token);
    
    const paymentData = {
      projectTitle: link.booking.project_name || 'Service Booking',
      paymentUrl: paymentUrl,
      expiresAt: new Date(link.expires_at).toLocaleString('en-US', {
        dateStyle: 'long',
        timeStyle: 'short'
      })
    };

    const userData = {
      name: recipientName,
      email: recipientEmail
    };

    // 4. Send Email
    const result = await emailService.sendPaymentLinkEmail(userData, paymentData);

    if (result.success) {
      // Log Activity
      if (link.lead_id) {
        await sales_lead_activities.create({
          lead_id: link.lead_id,
          activity_type: 'payment_link_emailed',
          activity_data: { payment_link_id, sent_to: recipientEmail },
          performed_by_user_id: req.userId
        });
      }

      return res.status(200).json({
        success: true,
        message: `Payment link email sent successfully to ${recipientEmail}`
      });
    } else {
      throw new Error(result.error);
    }

  } catch (error) {
    console.error('Error in sendPaymentLinkEmailAPI:', error);
    res.status(500).json({ success: false, message: 'Failed to send payment email', error: error.message });
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

    const paymentLink = await payment_links.findOne({
      where: { link_token: token },
      include: [
        { 
          model: stream_project_booking, 
          as: 'booking', 
          attributes: ['stream_project_booking_id', 'payment_id'] 
        },
        { 
          model: discount_codes, 
          as: 'discount_code', 
          attributes: ['code'] 
        }
      ]
    });

    if (!paymentLink) {
      return res.status(200).json({
        success: true,
        valid: false,
        message: 'The payment link was not found.',
        reason_code: 'NOT_FOUND'
      });
    }

    if (paymentLink.is_used === 1 || (paymentLink.booking && paymentLink.booking.payment_id)) {
      
      if (paymentLink.is_used === 0) {
        await paymentLink.update({ is_used: 1 });
      }

      return res.status(200).json({
        success: true, 
        valid: false,
        message: 'Payment for this project has already been completed.',
        reason_code: 'PAID'
      });
    }

    const now = new Date();
    if (new Date(paymentLink.expires_at) < now) {
      return res.status(200).json({
        success: true,
        valid: false,
        message: 'This payment link has expired.',
        reason_code: 'EXPIRED'
      });
    }

    res.json({
      success: true,
      valid: true,
      data: {
        booking_id: paymentLink.booking_id,
        discount_code: paymentLink.discount_code ? paymentLink.discount_code.code : null,
        expires_at: paymentLink.expires_at
      }
    });

  } catch (error) {
    console.error('Error validating payment link:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during payment link validation' 
    });
  }
};

exports.sendStripeInvoice = async (req, res) => {
  let lockTransaction = null;
  try {
    const { booking_id } = req.body;
    const parsedBookingId = parseInt(booking_id, 10);

    if (!parsedBookingId || Number.isNaN(parsedBookingId)) {
      return res.status(400).json({ success: false, message: 'Valid booking_id is required.' });
    }

    lockTransaction = await db.sequelize.transaction();

    const booking = await db.stream_project_booking.findOne({
      where: { stream_project_booking_id: parsedBookingId },
      include: [
        {
          model: db.quotes,
          as: 'primary_quote',
          required: false,
          include: [{ model: db.quote_line_items, as: 'line_items', required: false }]
        },
        { model: db.users, as: 'user', required: false }
      ],
      transaction: lockTransaction,
      lock: lockTransaction.LOCK.UPDATE
    });

    if (!booking) {
      await lockTransaction.rollback();
      return res.status(404).json({ success: false, message: `Booking ID ${parsedBookingId} not found.` });
    }

    const now = new Date();
    if (
      booking.invoice_generation_status === 'in_progress' &&
      booking.invoice_generation_started_at &&
      (now - new Date(booking.invoice_generation_started_at)) < 10 * 60 * 1000
    ) {
      await lockTransaction.rollback();
      return res.status(409).json({
        success: false,
        message: 'Invoice generation is already in progress. Please retry in a few minutes.'
      });
    }

    await booking.update({
      invoice_generation_status: 'in_progress',
      invoice_generation_started_at: now
    }, { transaction: lockTransaction });

    await lockTransaction.commit();

    // 1. Determine Recipient (Logic same as your Payment Link API)
    let recipientEmail = null;
    let recipientName = 'Customer';

    if (booking.user) {
      recipientEmail = booking.user.email;
      recipientName = booking.user.name;
    } else if (booking.guest_email) {
      recipientEmail = booking.guest_email;
      recipientName = booking.project_name ? booking.project_name.split(' - ')[1] : 'Valued Guest';
    }

    if (!recipientEmail) {
      await booking.update({
        invoice_generation_status: 'failed'
      });
      return res.status(400).json({ success: false, message: 'No email address associated with this booking.' });
    }

    const bookingMarkedPaid = !!(booking.payment_id || booking.is_completed === 1);

    if (!bookingMarkedPaid) {
      const appliedOnQuote = await applyQuoteDiscountFromLatestPaymentLink(booking, req.userId || null);
      if (appliedOnQuote) {
        await booking.reload({
          include: [
            {
              model: db.quotes,
              as: 'primary_quote',
              required: false,
              include: [{ model: db.quote_line_items, as: 'line_items', required: false }]
            },
            { model: db.users, as: 'user', required: false }
          ]
        });
      }
    }

    const pricingData = await calculateLeadPricing(booking);
    let invoiceDetails = null;

    // --- CASE 1: ALREADY PAID ---
    if (pricingData && (pricingData.is_paid || bookingMarkedPaid)) {
      let invoiceUrl = null;
      let invoicePdf = null;
      let invoiceNumber = 'RECEIPT';

      if (pricingData.stripe_payment_intent_id) {
        const pi = await stripe.paymentIntents.retrieve(pricingData.stripe_payment_intent_id, {
          expand: ['latest_charge']
        });

        if (pi.invoice) {
          const existingInvoice = await stripe.invoices.retrieve(pi.invoice);
          invoiceUrl = existingInvoice.hosted_invoice_url;
          invoicePdf = existingInvoice.invoice_pdf;
          invoiceNumber = existingInvoice.number;
        } 
        
        if (!invoicePdf) {
          const retrospectiveInvoice = await paymentLinksService.createPaidStripeInvoice(
            booking,
            pricingData,
            {}
          );
          invoiceUrl = retrospectiveInvoice.hosted_invoice_url;
          invoicePdf = retrospectiveInvoice.invoice_pdf;
          invoiceNumber = retrospectiveInvoice.number;
        }
      }

      invoiceDetails = {
        projectTitle: booking.project_name || 'Service Booking',
        invoiceUrl,
        invoicePdf,
        invoiceNumber,
        totalAmount: pricingData.total,
        isPaid: true
      };

    } else {
      // --- CASE 2: NOT PAID YET ---
      if (!pricingData || parseFloat(pricingData.total) <= 0) {
        await booking.update({
          invoice_generation_status: 'failed'
        });
        return res.status(400).json({ success: false, message: 'Cannot generate invoice for $0.' });
      }

      const stripeInvoice = await paymentLinksService.createStripeInvoice(
        booking,
        pricingData,
        {}
      );
      const invoiceIsPaid = stripeInvoice?.status === 'paid';
      
      invoiceDetails = {
        projectTitle: booking.project_name || 'Service Booking',
        invoiceUrl: stripeInvoice.hosted_invoice_url,
        invoicePdf: stripeInvoice.invoice_pdf,
        invoiceNumber: stripeInvoice.number,
        totalAmount: pricingData.total,
        isPaid: invoiceIsPaid
      };
    }

    await booking.update({
      invoice_generation_status: 'completed'
    });

    // --- SEND THE EMAIL ---
    const userData = { name: recipientName, email: recipientEmail };
    const emailResult = await emailService.sendInvoiceEmail(userData, invoiceDetails);

    if (!emailResult.success) {
        console.error("Email failed to send but invoice was generated:", emailResult.error);
    }

    return res.status(200).json({
      success: true,
      message: invoiceDetails.isPaid ? 'Receipt sent successfully' : 'Invoice sent successfully',
      data: invoiceDetails
    });

  } catch (error) {
    try {
      if (lockTransaction && !lockTransaction.finished) {
        await lockTransaction.rollback();
      }
    } catch (rollbackError) {
      console.error('Failed to rollback invoice generation lock transaction:', rollbackError);
    }
    try {
      if (req?.body?.booking_id) {
        await db.stream_project_booking.update({
          invoice_generation_status: 'failed'
        }, {
          where: { stream_project_booking_id: req.body.booking_id }
        });
      }
    } catch (updateError) {
      console.error('Failed to record invoice generation failure:', updateError);
    }
    console.error('Stripe Invoice Error:', error);
    res.status(500).json({ success: false, message: error.message });
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
