const { payment_links, sales_leads, sales_lead_activities, discount_codes, stream_project_booking, quotes, quote_line_items } = require('../models');
const db = require('../models');
const paymentLinksService = require('../services/payment-links.service');
const constants = require('../utils/constants');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const calculateLeadPricing = async (booking) => {
    if (!booking) return null;

    try {
        if (booking.payment_id || booking.is_completed === 1) {
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
                is_paid: false,
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
            is_paid: false,
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

    // Validation
    if (!booking_id) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID is required'
      });
    }

    // Verify booking exists
    const booking = await stream_project_booking.findByPk(booking_id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (booking.payment_id) {
      return res.status(400).json({
        success: false,
        message: 'Payment for this booking has already been completed. No new link is required.'
      });
    }

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
  try {
    const { booking_id } = req.body;

    const booking = await db.stream_project_booking.findOne({
        where: { stream_project_booking_id: booking_id },
        include: [
            { 
                model: db.quotes, 
                as: 'primary_quote', 
                include: [{ model: db.quote_line_items, as: 'line_items' }] 
            }
        ]
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const pricingData = await calculateLeadPricing(booking);

    // --- CASE: Booking is already paid ---
    if (pricingData && pricingData.is_paid) {
        let invoiceUrl = null;
        let invoicePdf = null;
        
        if (pricingData.stripe_payment_intent_id) {
            // Retrieve PaymentIntent and expand the charge details
            const pi = await stripe.paymentIntents.retrieve(pricingData.stripe_payment_intent_id, {
                expand: ['latest_charge']
            });
            
            // 1. If paid via a formal Stripe Invoice (best for PDF)
            if (pi.invoice) {
                const existingInvoice = await stripe.invoices.retrieve(pi.invoice);
                invoiceUrl = existingInvoice.hosted_invoice_url;
                invoicePdf = existingInvoice.invoice_pdf; // <--- This is the PDF link
            } 
            // 2. If paid via standalone PaymentIntent (Receipt)
            else {
                invoiceUrl = pi.latest_charge?.receipt_url;
                // Standalone receipts don't have a direct PDF API link, 
                // but users can save the receipt_url as PDF in their browser.
                invoicePdf = null; 
            }
        }

        return res.status(200).json({
          success: true,
          message: 'Booking is already paid.',
          data: {
            invoice_url: invoiceUrl,
            invoice_pdf: invoicePdf, // Added this field
            is_already_paid: true,
            total_amount: pricingData.total
          }
        });
    }

    // --- CASE: Booking is NOT paid (Create New Invoice) ---
    if (!pricingData || parseFloat(pricingData.total) <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot generate invoice for $0. Check project pricing.' 
      });
    }

    const stripeInvoice = await paymentLinksService.createStripeInvoice(booking, pricingData);

    res.status(200).json({
      success: true,
      message: 'Invoice generated and sent via Stripe',
      data: {
        invoice_url: stripeInvoice.hosted_invoice_url,
        invoice_pdf: stripeInvoice.invoice_pdf, // PDF link for the new invoice
        total_amount: pricingData.total
      }
    });

  } catch (error) {
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