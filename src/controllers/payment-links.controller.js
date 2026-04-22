const { payment_links, sales_leads, client_leads, sales_lead_activities, client_lead_activities, discount_codes, stream_project_booking, quotes, quote_line_items, users } = require('../models');
const db = require('../models');
const paymentLinksService = require('../services/payment-links.service');
const quoteService = require('../services/sales-quote.service');
const constants = require('../utils/constants');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const emailService = require('../utils/emailService');
const discountService = require('../services/discount.service');
const pricingService = require('../services/pricing.service');
const { Op } = require('sequelize');
const https = require('https');

const formatDisplayLabel = (value) => {
  const normalized = String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return '';

  return normalized
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

const formatProposalProjectName = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return 'Service Booking';

  return raw
    .split(' - ')
    .map((part) => formatDisplayLabel(part) || part.trim())
    .join(' - ');
};

const formatInvoiceDate = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const formatInvoiceTime = (value) => {
  if (!value) return '';
  const text = String(value);
  const [hh, mm] = text.split(':');
  if (hh === undefined || mm === undefined) return text;
  const hour = Number(hh);
  if (Number.isNaN(hour)) return text;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${mm} ${suffix}`;
};

const parseJsonArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return trimmed
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
};

const formatInvoiceLocation = (location) => {
  if (!location) return 'TBD';

  if (typeof location === 'object') {
    return (
      location.address ||
      location.full_address ||
      location.formatted_address ||
      location.place_name ||
      location.name ||
      'TBD'
    );
  }

  const trimmed = String(location).trim();
  if (!trimmed) return 'TBD';

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed === 'object') {
      return (
        parsed.address ||
        parsed.full_address ||
        parsed.formatted_address ||
        parsed.place_name ||
        parsed.name ||
        trimmed
      );
    }
  } catch (_) {}

  return trimmed;
};

const formatEditTypeLabel = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

const resolveInvoiceServices = (booking, pricingData) => {
  const editingKeywords = /\b(edit|editing|edited|reel|retouch|retouching|color|thumbnail|post[- ]?production|revision)\b/i;
  const lineItemNames = Array.isArray(pricingData?.line_items)
    ? pricingData.line_items
        .map((item) => String(item?.name || '').trim())
        .filter((name) => name && !editingKeywords.test(name))
    : [];

  const uniqueLineItems = [...new Set(lineItemNames)];
  if (uniqueLineItems.length) {
    return uniqueLineItems.join(', ');
  }

  const contentType = emailService.formatContentTypes(booking?.content_type);
  if (contentType) return contentType;

  const shootType = emailService.formatShootTypes(booking?.shoot_type);
  if (shootType) return shootType;

  return 'N/A';
};

const resolveInvoiceEditing = (booking) => {
  const videoEditTypes = parseJsonArray(booking?.video_edit_types);
  const photoEditTypes = parseJsonArray(booking?.photo_edit_types);
  const formattedTypes = [...new Set(
    [...videoEditTypes, ...photoEditTypes]
      .map((item) => {
        if (!item) return '';
        if (typeof item === 'string') return formatEditTypeLabel(item);
        if (typeof item === 'object') {
          return formatEditTypeLabel(item.label || item.name || item.slug || item.key || item.value);
        }
        return '';
      })
      .filter(Boolean)
  )];

  if (formattedTypes.length) {
    return formattedTypes.join(', ');
  }

  if (booking?.edits_needed === 1 || booking?.edits_needed === true) {
    return 'Included';
  }

  return 'Not included';
};

const resolveInvoiceSchedule = (booking) => {
  const bookingDayEntries = Array.isArray(booking?.booking_days) && booking.booking_days.length
    ? [...booking.booking_days]
    : [{
        event_date: booking?.event_date,
        start_time: booking?.start_time,
        end_time: booking?.end_time
      }];

  const sortedEntries = bookingDayEntries.sort((a, b) => {
    const dateCompare = String(a?.event_date || '').localeCompare(String(b?.event_date || ''));
    if (dateCompare !== 0) return dateCompare;
    return String(a?.start_time || '').localeCompare(String(b?.start_time || ''));
  });

  const parts = sortedEntries
    .map((day) => {
      const dateLabel = formatInvoiceDate(day?.event_date);
      const startLabel = formatInvoiceTime(day?.start_time);
      const endLabel = formatInvoiceTime(day?.end_time);
      const timeLabel = [startLabel, endLabel].filter(Boolean).join(' - ');

      if (dateLabel && timeLabel) return `${dateLabel} | ${timeLabel}`;
      return dateLabel || timeLabel || '';
    })
    .filter(Boolean);

  return parts.join('; ') || 'TBD';
};

const buildInvoiceTemplateDetails = (booking, pricingData, invoiceDetails) => ({
  ...invoiceDetails,
  projectTitle: formatProposalProjectName(booking?.project_name),
  shootType: booking?.shoot_type || '',
  contentType: booking?.content_type || '',
  services: resolveInvoiceServices(booking, pricingData),
  schedule: resolveInvoiceSchedule(booking),
  editing: resolveInvoiceEditing(booking),
  location: formatInvoiceLocation(booking?.event_location)
});

const parseActivityMetadata = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
};

const resolveAdditionalQuoteInvoiceContext = async ({ quoteId, bookingId, transaction }) => {
  if (!quoteId || !db.sales_quote_activities) {
    return null;
  }

  const recentUpdateActivities = await db.sales_quote_activities.findAll({
    where: {
      sales_quote_id: quoteId,
      activity_type: 'updated'
    },
    order: [['created_at', 'DESC'], ['activity_id', 'DESC']],
    limit: 10,
    transaction
  });

  const refreshActivity = (recentUpdateActivities || [])
    .map((activity) => ({
      activity,
      metadata: parseActivityMetadata(activity?.metadata_json)
    }))
    .find(({ metadata }) => {
      if (!metadata?.invoice_refresh_required) return false;
      if (bookingId && metadata.booking_id && Number(metadata.booking_id) !== Number(bookingId)) return false;
      return parseFloat(metadata.extra_amount || 0) > 0;
    });

  if (!refreshActivity?.metadata) {
    return null;
  }

  const { metadata } = refreshActivity;
  const additionalAmount = parseFloat(metadata.extra_amount || 0);
  const revisedTotal = parseFloat(metadata.new_total || 0);
  const previouslyPaidAmount = parseFloat(metadata.previous_total || 0);

  if (!(additionalAmount > 0)) {
    return null;
  }

  const existingAdditionalInvoice = db.invoice_send_history
    ? await db.invoice_send_history.findOne({
        where: {
          quote_id: quoteId,
          booking_id: bookingId,
          payment_status: 'pending',
          sent_at: { [Op.gte]: refreshActivity.activity.created_at }
        },
        order: [['sent_at', 'DESC'], ['invoice_send_history_id', 'DESC']],
        transaction
      })
    : null;

  return {
    additionalAmount,
    revisedTotal,
    previouslyPaidAmount,
    label: 'Additional payment for revised quote',
    existingInvoice: existingAdditionalInvoice
  };
};

const resolveReducedQuoteInvoiceContext = async ({ quoteId, bookingId, transaction }) => {
  if (!quoteId || !db.sales_quote_activities) {
    return null;
  }

  const recentUpdateActivities = await db.sales_quote_activities.findAll({
    where: {
      sales_quote_id: quoteId,
      activity_type: 'updated'
    },
    order: [['created_at', 'DESC'], ['activity_id', 'DESC']],
    limit: 10,
    transaction
  });

  const refreshActivity = (recentUpdateActivities || [])
    .map((activity) => ({
      activity,
      metadata: parseActivityMetadata(activity?.metadata_json)
    }))
    .find(({ metadata }) => {
      if (!metadata?.invoice_refresh_required) return false;
      if (bookingId && metadata.booking_id && Number(metadata.booking_id) !== Number(bookingId)) return false;
      return parseFloat(metadata.reduced_amount || 0) > 0;
    });

  if (!refreshActivity?.metadata) {
    return null;
  }

  const { metadata } = refreshActivity;
  const reducedAmount = parseFloat(metadata.reduced_amount || 0);
  const revisedTotal = parseFloat(metadata.new_total || 0);
  const previouslyPaidAmount = parseFloat(metadata.previous_total || 0);

  if (!(reducedAmount > 0)) {
    return null;
  }

  const existingReducedInvoice = db.invoice_send_history
    ? await db.invoice_send_history.findOne({
        where: {
          quote_id: quoteId,
          booking_id: bookingId,
          sent_at: { [Op.gte]: refreshActivity.activity.created_at }
        },
        order: [['sent_at', 'DESC'], ['invoice_send_history_id', 'DESC']],
        transaction
      })
    : null;

  return {
    reducedAmount,
    revisedTotal,
    previouslyPaidAmount,
    label: 'Quote total reduced after payment',
    existingInvoice: existingReducedInvoice
  };
};

const updatePaymentLeadState = async ({
  leadId = null,
  clientLeadId = null,
  newStatus = null,
  activityType = null,
  activityData = null,
  performedByUserId = null,
  transaction = null
}) => {
  if (leadId) {
    if (newStatus) {
      await sales_leads.update(
        { lead_status: newStatus },
        { where: { lead_id: leadId }, transaction }
      );
    }

    if (activityType) {
      await sales_lead_activities.create({
        lead_id: leadId,
        activity_type: activityType,
        activity_data: activityData,
        performed_by_user_id: performedByUserId
      }, { transaction });
    }
  }

  if (clientLeadId) {
    if (newStatus) {
      await client_leads.update(
        { lead_status: newStatus },
        { where: { lead_id: clientLeadId }, transaction }
      );
    }

    if (activityType) {
      await client_lead_activities.create({
        lead_id: clientLeadId,
        activity_type: activityType,
        activity_data: activityData,
        performed_by_user_id: performedByUserId
      }, { transaction });
    }
  }
};

const persistInvoiceSendHistory = async ({
  bookingId,
  quoteId = null,
  associatedLead = null,
  associatedClientLead = null,
  recipientName = null,
  recipientEmail = null,
  invoiceDetails,
  sentByUserId = null,
  sentAt = new Date()
}) => {
  await db.invoice_send_history.create({
    booking_id: bookingId,
    quote_id: quoteId,
    lead_id: associatedLead?.lead_id || null,
    client_lead_id: associatedClientLead?.lead_id || null,
    assigned_sales_rep_id: associatedLead?.assigned_sales_rep_id || associatedClientLead?.assigned_sales_rep_id || null,
    client_name: recipientName || associatedLead?.client_name || associatedClientLead?.client_name || null,
    client_email: recipientEmail || associatedLead?.guest_email || associatedClientLead?.guest_email || null,
    invoice_number: invoiceDetails.invoiceNumber || null,
    invoice_url: invoiceDetails.invoiceUrl || null,
    invoice_pdf: invoiceDetails.invoicePdf || null,
    payment_status: invoiceDetails.paymentStatusOverride || (invoiceDetails.isPaid ? 'paid' : 'pending'),
    sent_by_user_id: sentByUserId || null,
    sent_at: sentAt
  });
};

const sendInvoiceForBooking = async ({ bookingId, quoteId = null, performedByUserId = null, recipientOverride = null }) => {
  const {
    parsedBookingId,
    recipientName,
    recipientEmail,
    invoiceDetails
  } = await prepareInvoiceDetailsForBooking(bookingId, performedByUserId, recipientOverride, quoteId);

  const userData = { name: recipientName, email: recipientEmail };
  const emailResult = await emailService.sendInvoiceEmail(userData, invoiceDetails);

  if (!emailResult.success) {
    console.error("Email failed to send but invoice was generated:", emailResult.error);
  }

  const associatedLead = await db.sales_leads.findOne({ where: { booking_id: parsedBookingId } });
  const associatedClientLead = await db.client_leads.findOne({ where: { booking_id: parsedBookingId } });
  const sentAt = new Date();
  const invoicePaymentStatus = invoiceDetails.paymentStatusOverride || (invoiceDetails.isPaid ? 'paid' : 'pending');

  await persistInvoiceSendHistory({
    bookingId: parsedBookingId,
    quoteId,
    associatedLead,
    associatedClientLead,
    recipientName,
    recipientEmail,
    invoiceDetails,
    sentByUserId: performedByUserId,
    sentAt
  });

  await updatePaymentLeadState({
    leadId: associatedLead?.lead_id || null,
    clientLeadId: associatedClientLead?.lead_id || null,
    newStatus: 'proposal_sent',
    activityType: 'payment_link_generated',
    activityData: {
      booking_id: parsedBookingId,
      quote_id: quoteId,
      invoice_number: invoiceDetails.invoiceNumber,
      invoice_sent: true,
      invoice_url: invoiceDetails.invoiceUrl || null,
      invoice_pdf: invoiceDetails.invoicePdf || null,
      recipient_name: recipientName || null,
      recipient_email: recipientEmail || null,
      sent_at: sentAt.toISOString(),
      payment_status: invoicePaymentStatus
    },
    performedByUserId
  });

  return { invoiceDetails };
};

const applyQuoteDiscountFromLatestPaymentLink = async (booking, performedByUserId = null) => {
    if (!booking || !booking.primary_quote) return false;
    if (booking.payment_id || booking.is_completed === 1) return false;

    const linkWithDiscount = await payment_links.findOne({
        where: {
            booking_id: booking.stream_project_booking_id,
            discount_code_id: { [Op.ne]: null }
        },
        order: [['created_at', 'DESC']]
    });

    if (!linkWithDiscount || !linkWithDiscount.discount_code_id) return false;

    const latestDiscountCodeId = parseInt(linkWithDiscount.discount_code_id, 10);
    const currentDiscountCodeId = booking.primary_quote.discount_code_id
        ? parseInt(booking.primary_quote.discount_code_id, 10)
        : null;
    const existingDiscount = parseFloat(booking.primary_quote.discount_amount || 0);

    // Latest-link-wins: if quote already has the same code with a non-zero discount, nothing to do.
    if (currentDiscountCodeId === latestDiscountCodeId && existingDiscount > 0) return false;

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

    const transaction = await db.sequelize.transaction();
    try {
        // If quote previously used a different discount code for this booking, rollback its usage counters/logs.
        if (
            currentDiscountCodeId &&
            currentDiscountCodeId !== parseInt(validDiscountCode.discount_code_id, 10)
        ) {
            const previousUsageCount = await db.discount_code_usage.count({
                where: {
                    booking_id: booking.stream_project_booking_id,
                    discount_code_id: currentDiscountCodeId
                },
                transaction
            });

            if (previousUsageCount > 0) {
                await db.discount_code_usage.destroy({
                    where: {
                        booking_id: booking.stream_project_booking_id,
                        discount_code_id: currentDiscountCodeId
                    },
                    transaction
                });

                await discount_codes.update({
                    current_uses: db.sequelize.literal(`GREATEST(current_uses - ${previousUsageCount}, 0)`)
                }, {
                    where: { discount_code_id: currentDiscountCodeId },
                    transaction
                });
            }
        }

        await booking.primary_quote.update({
            discount_code_id: validDiscountCode.discount_code_id,
            applied_discount_type: validDiscountCode.discount_type,
            applied_discount_value: validDiscountCode.discount_value,
            discount_percent: validDiscountCode.discount_type === 'percentage' ? validDiscountCode.discount_value : 0,
            discount_amount: discountAmount,
            price_after_discount: finalAmount,
            total: newTotal
        }, { transaction });

        await discountService.incrementUsageCount(validDiscountCode.discount_code_id, transaction);
        await discountService.logUsage(
            validDiscountCode.discount_code_id,
            booking.stream_project_booking_id,
            booking.user_id || null,
            booking.guest_email || null,
            subtotal,
            discountAmount,
            finalAmount,
            transaction
        );

        await updatePaymentLeadState({
            leadId: validDiscountCode.lead_id || null,
            clientLeadId: validDiscountCode.client_lead_id || null,
            newStatus: 'discount_applied',
            activityType: 'discount_applied',
            activityData: {
                discount_code_id: validDiscountCode.discount_code_id,
                code: validDiscountCode.code,
                discount_amount: discountAmount,
                quote_id: booking.primary_quote.quote_id
            },
            performedByUserId,
            transaction
        });

        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        throw error;
    }

    return true;
};

const calculateLeadPricing = async (booking) => {
    if (!booking) return null;

    try {
        const bookingMarkedPaid = !!(booking.payment_id || booking.is_completed === 1);
        const paymentTransaction = bookingMarkedPaid
            ? await db.payment_transactions.findByPk(booking.payment_id)
            : null;

        // Prefer quote line items for both paid and unpaid bookings
        // so invoice/receipt keeps full breakdown (additional creatives, etc.).
        const q = booking.primary_quote; 
        if (q) {
            const totalFromQuote = parseFloat(q.total || 0);
            const totalAfterDiscount = parseFloat(q.price_after_discount || 0);
            const totalFromPayment = parseFloat(paymentTransaction?.total_amount || 0);
            let resolvedTotal = totalFromQuote > 0 ? totalFromQuote : totalAfterDiscount;
            if (bookingMarkedPaid && totalFromPayment > 0 && resolvedTotal <= 0) {
                resolvedTotal = totalFromPayment;
            }
            return {
                source: 'database',
                is_paid: bookingMarkedPaid,
                stripe_payment_intent_id: paymentTransaction?.stripe_payment_intent_id || null,
                total: resolvedTotal,
                subtotal: parseFloat(q.subtotal || 0),
                discount_amount: parseFloat(q.discount_amount || 0),
                price_after_discount: parseFloat(q.price_after_discount || 0),
                tax_type: q.tax_type || null,
                tax_rate: parseFloat(q.tax_rate || 0),
                tax_amount: parseFloat(q.tax_amount || 0),
                line_items: (q.line_items || []).map(item => ({
                    name: item.item_name,
                    quantity: item.quantity,
                    total: parseFloat(item.line_total)
                }))
            };
        }

        if (paymentTransaction) {
            return {
                source: 'transaction',
                is_paid: true,
                stripe_payment_intent_id: paymentTransaction.stripe_payment_intent_id,
                total: parseFloat(paymentTransaction.total_amount || 0),
                subtotal: parseFloat(paymentTransaction.subtotal || 0),
                price_after_discount: parseFloat(paymentTransaction.subtotal || 0),
                tax_type: null,
                tax_rate: 0,
                tax_amount: 0,
                line_items: [{
                    name: `Service Payment - ${booking.project_name || 'Project'}`,
                    quantity: 1,
                    total: parseFloat(paymentTransaction.total_amount || 0)
                }]
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
            price_after_discount: calculated?.priceAfterDiscount || calculated?.subtotal || 0,
            tax_type: null,
            tax_rate: 0,
            tax_amount: 0,
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
      client_lead_id,
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
    message: 'Payment link cannot be generated: The booking process is still pending. Please complete the booking details before proceeding.'
  });
}
    // --------------------------------------------

    // 3. Check if already paid
    if (booking.payment_id || booking.is_completed === 1) {
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
      lead_id: lead_id || null,
      client_lead_id: client_lead_id || null,
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
    await updatePaymentLeadState({
      leadId: lead_id || null,
      clientLeadId: client_lead_id || null,
      newStatus: 'payment_link_sent',
      activityType: 'payment_link_generated',
      activityData: {
        payment_link_id: paymentLink.payment_link_id,
        booking_id,
        discount_code_id,
        expires_at: expiresAt
      },
      performedByUserId: createdBy
    });

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

exports.generateClientPaymentLink = async (req, res) => {
  req.body.client_lead_id = req.body.client_lead_id || req.body.lead_id || null;
  delete req.body.lead_id;
  return exports.generatePaymentLink(req, res);
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
          include: [
            { model: users, as: 'user', required: false },
            { model: quotes, as: 'primary_quote', required: false }
          ]
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
    const formattedShootType = emailService.formatShootTypes(
      link.booking.shoot_type || link.booking.event_type || 'Shoot'
    );
    const formattedContentTypes = emailService.formatContentTypes(link.booking.content_type);
    const shootSummary = [formattedShootType, formattedContentTypes]
      .filter(Boolean)
      .join(' - ');
    const formattedProjectName = formatProposalProjectName(link.booking.project_name);

    // 4. Send Email
    const result = await emailService.sendProductionProposalEmail({
      to_email: recipientEmail,
      client_name: recipientName,
      shoot_summary: shootSummary || formattedShootType || 'Shoot',
      project_name: formattedProjectName,
      contentType: formattedContentTypes || formattedShootType || 'N/A',
      eventDate: link.booking.event_date
        ? new Date(link.booking.event_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : '',
      startTime: link.booking.start_time || '',
      endTime: link.booking.end_time || '',
      editsNeeded: link.booking.edits_needed ? 'Included' : 'Not Included',
      location: link.booking.event_location || 'TBD',
      proposed_amount: link.booking.primary_quote?.total || '',
      payment_link: paymentUrl
    });

    if (result.success) {
      // Log Activity
      await updatePaymentLeadState({
        leadId: link.lead_id || null,
        clientLeadId: link.client_lead_id || null,
        activityType: 'payment_link_generated',
        activityData: { payment_link_id, sent_to: recipientEmail, email_sent: true },
        performedByUserId: req.userId
      });

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
        'guest_email',
        'payment_id',
        'is_completed'
      ],
      include: [
        {
          model: quotes,
          as: 'primary_quote',
          required: false,
          include: [{ model: quote_line_items, as: 'line_items', required: false }]
        }
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

    const pricing = booking ? await calculateLeadPricing(booking) : null;

    res.json({
      success: true,
      valid: true,
      data: {
        payment_link_id: paymentLink.payment_link_id,
        booking,
        pricing,
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

const bookingInvoiceIncludes = [
  {
    model: db.quotes,
    as: 'primary_quote',
    required: false,
    include: [{ model: db.quote_line_items, as: 'line_items', required: false }]
  },
  { model: db.users, as: 'user', required: false },
  { model: db.stream_project_booking_days, as: 'booking_days', required: false }
];

const prepareInvoiceDetailsForBooking = async (bookingId, performedByUserId = null, recipientOverride = null, quoteId = null) => {
  let lockTransaction = null;
  try {
    const parsedBookingId = parseInt(bookingId, 10);
    if (!parsedBookingId || Number.isNaN(parsedBookingId)) {
      const error = new Error('Valid booking_id is required.');
      error.statusCode = 400;
      throw error;
    }

    lockTransaction = await db.sequelize.transaction();
    const booking = await db.stream_project_booking.findOne({
      where: { stream_project_booking_id: parsedBookingId },
      include: bookingInvoiceIncludes,
      transaction: lockTransaction,
      lock: lockTransaction.LOCK.UPDATE
    });

    if (!booking) {
      throw new Error(`Booking ID ${parsedBookingId} not found.`);
    }

    // Lock check logic...
    const now = new Date();
    if (booking.invoice_generation_status === 'in_progress' && 
        booking.invoice_generation_started_at && 
        (now - new Date(booking.invoice_generation_started_at)) < 10 * 60 * 1000) {
      const error = new Error('Invoice generation in progress.');
      error.statusCode = 409;
      throw error;
    }

    await booking.update({ invoice_generation_status: 'in_progress', invoice_generation_started_at: now }, { transaction: lockTransaction });
    await lockTransaction.commit();

    // Determine Recipient
    let recipientEmail = booking.user?.email || booking.guest_email;
    let recipientName = booking.user?.name || (booking.project_name ? booking.project_name.split(' - ')[1] : 'Valued Guest');

    if (recipientOverride?.email) {
      recipientEmail = recipientOverride.email;
    }
    if (recipientOverride?.name) {
      recipientName = recipientOverride.name;
    }

    if (!recipientEmail) {
      await booking.update({ invoice_generation_status: 'failed' });
      throw new Error('No email address associated with this booking.');
    }

    const bookingMarkedPaid = !!(booking.payment_id || booking.is_completed === 1);
    if (!bookingMarkedPaid) {
      await applyQuoteDiscountFromLatestPaymentLink(booking, performedByUserId || null);
      await booking.reload({ include: bookingInvoiceIncludes });
    }

    const pricingData = await calculateLeadPricing(booking);
    if (!pricingData) {
      await booking.update({ invoice_generation_status: 'failed' });
      throw new Error(`Could not calculate pricing for booking ${parsedBookingId}.`);
    }
    const additionalInvoiceContext = await resolveAdditionalQuoteInvoiceContext({
      quoteId,
      bookingId: parsedBookingId,
      transaction: null
    });
    const reducedInvoiceContext = await resolveReducedQuoteInvoiceContext({
      quoteId,
      bookingId: parsedBookingId,
      transaction: null
    });
    let invoiceDetails = null;

    if (additionalInvoiceContext) {
      const additionalPricingData = {
        source: 'quote_additional_amount',
        is_paid: false,
        total: additionalInvoiceContext.additionalAmount,
        subtotal: additionalInvoiceContext.additionalAmount,
        discount_amount: 0,
        price_after_discount: additionalInvoiceContext.additionalAmount,
        tax_type: null,
        tax_rate: 0,
        tax_amount: 0,
        line_items: [
          {
            name: additionalInvoiceContext.label,
            quantity: 1,
            total: additionalInvoiceContext.additionalAmount
          }
        ]
      };

      let stripeInvoice = null;
      if (booking.stripe_invoice_id) {
        try {
          const existingStripeInvoice = await stripe.invoices.retrieve(booking.stripe_invoice_id);
          const stripeInvoiceTotal = parseFloat(((existingStripeInvoice.total || existingStripeInvoice.amount_due || 0) / 100).toFixed(2));
          const expectedAdditionalTotal = parseFloat(Number(additionalInvoiceContext.additionalAmount || 0).toFixed(2));

          if (
            Math.abs(stripeInvoiceTotal - expectedAdditionalTotal) <= 0.01 &&
            ['open', 'paid', 'uncollectible', 'void'].includes(existingStripeInvoice.status)
          ) {
            stripeInvoice = existingStripeInvoice;
          }
        } catch (_) {
          stripeInvoice = null;
        }
      }

      if (!additionalInvoiceContext.existingInvoice?.invoice_url) {
        stripeInvoice = stripeInvoice || await paymentLinksService.createStripeInvoice(booking, additionalPricingData, {
          recipientOverride,
          forceNewInvoice: true,
          descriptionOverride: `${additionalInvoiceContext.label} - ${booking.project_name || 'Project'}`
        });
      }
      const additionalInvoicePaid = stripeInvoice?.status === 'paid';

      if (!additionalInvoicePaid) {
        invoiceDetails = buildInvoiceTemplateDetails(booking, additionalPricingData, {
          invoiceUrl: stripeInvoice?.hosted_invoice_url || additionalInvoiceContext.existingInvoice?.invoice_url,
          invoicePdf: stripeInvoice?.invoice_pdf || additionalInvoiceContext.existingInvoice?.invoice_pdf,
          invoiceNumber: stripeInvoice?.number || additionalInvoiceContext.existingInvoice?.invoice_number,
          totalAmount: additionalInvoiceContext.additionalAmount,
          isPaid: false,
          isAdditionalPayment: true,
          previouslyPaidAmount: additionalInvoiceContext.previouslyPaidAmount,
          revisedTotal: additionalInvoiceContext.revisedTotal,
          additionalAmount: additionalInvoiceContext.additionalAmount
        });

        await booking.update({ invoice_generation_status: 'completed' });
        return { parsedBookingId, recipientName, recipientEmail, invoiceDetails };
      }
    }

    if (reducedInvoiceContext) {
      let invoiceUrl = reducedInvoiceContext.existingInvoice?.invoice_url || null;
      let invoicePdf = reducedInvoiceContext.existingInvoice?.invoice_pdf || null;
      let invoiceNumber = reducedInvoiceContext.existingInvoice?.invoice_number || null;

      if (!invoicePdf || !invoiceUrl || !invoiceNumber) {
        const revisedInvoice = await paymentLinksService.createPaidStripeInvoice(booking, pricingData, { recipientOverride });
        invoiceUrl = revisedInvoice?.hosted_invoice_url || invoiceUrl;
        invoicePdf = revisedInvoice?.invoice_pdf || invoicePdf;
        invoiceNumber = revisedInvoice?.number || invoiceNumber;
      }

      invoiceDetails = buildInvoiceTemplateDetails(booking, pricingData, {
        invoiceUrl,
        invoicePdf,
        invoiceNumber,
        totalAmount: reducedInvoiceContext.reducedAmount,
        isPaid: false,
        isAdditionalPayment: false,
        isReducedAmount: true,
        paymentStatusOverride: 'refund_pending',
        previouslyPaidAmount: reducedInvoiceContext.previouslyPaidAmount,
        revisedTotal: reducedInvoiceContext.revisedTotal,
        reducedAmount: reducedInvoiceContext.reducedAmount
      });

      await booking.update({ invoice_generation_status: 'completed' });
      return { parsedBookingId, recipientName, recipientEmail, invoiceDetails };
    }

    // --- CASE 1: ALREADY PAID ---
    if (pricingData && (pricingData.is_paid || bookingMarkedPaid)) {
      let invoiceUrl, invoicePdf, invoiceNumber;
      let stripeTotalAmount = 0;
      let needsNewInvoice = Boolean(recipientOverride?.email || recipientOverride?.name);

      // Check existing invoice for amount mismatch
      if (booking.stripe_invoice_id) {
        try {
          const inv = await stripe.invoices.retrieve(booking.stripe_invoice_id);
          stripeTotalAmount = (inv.total || 0) / 100;
          const expectedTotal = parseFloat(pricingData.total);

          // If Stripe total ($20,700) != Expected ($9,315), force a new one
          if (Math.abs(stripeTotalAmount - expectedTotal) > 0.01) {
            needsNewInvoice = true;
          } else {
            invoiceUrl = inv.hosted_invoice_url;
            invoicePdf = inv.invoice_pdf;
            invoiceNumber = inv.number;
          }
        } catch (e) { needsNewInvoice = true; }
      }

      if (!invoicePdf || needsNewInvoice) {
        const retrospectiveInvoice = await paymentLinksService.createPaidStripeInvoice(booking, pricingData, { recipientOverride });
        invoiceUrl = retrospectiveInvoice.hosted_invoice_url;
        invoicePdf = retrospectiveInvoice.invoice_pdf;
        invoiceNumber = retrospectiveInvoice.number;
        stripeTotalAmount = (retrospectiveInvoice.total || 0) / 100;
      }

      invoiceDetails = buildInvoiceTemplateDetails(booking, pricingData, {
        invoiceUrl,
        invoicePdf,
        invoiceNumber,
        totalAmount: stripeTotalAmount,
        isPaid: true,
        isAdditionalPayment: false
      });

    } else {
      // --- CASE 2: NOT PAID YET ---
      const stripeInvoice = await paymentLinksService.createStripeInvoice(booking, pricingData, {
        recipientOverride,
        forceNewInvoice: Boolean(recipientOverride?.email || recipientOverride?.name)
      });
      invoiceDetails = buildInvoiceTemplateDetails(booking, pricingData, {
        invoiceUrl: stripeInvoice.hosted_invoice_url,
        invoicePdf: stripeInvoice.invoice_pdf,
        invoiceNumber: stripeInvoice.number,
        totalAmount: pricingData.total,
        isPaid: false,
        isAdditionalPayment: false
      });
    }

    await booking.update({ invoice_generation_status: 'completed' });
    return { parsedBookingId, recipientName, recipientEmail, invoiceDetails };

  } catch (error) {
    if (lockTransaction && !lockTransaction.finished) await lockTransaction.rollback();
    if (bookingId) await db.stream_project_booking.update({ invoice_generation_status: 'failed' }, { where: { stream_project_booking_id: bookingId } });
    throw error;
  }
};

const fetchRemoteFileBuffer = async (url, redirectCount = 0) => {
  if (!url) throw new Error('File URL is required');
  if (redirectCount > 5) throw new Error('Too many redirects while fetching file');

  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      const statusCode = response.statusCode || 500;
      const location = response.headers.location;

      if ([301, 302, 303, 307, 308].includes(statusCode) && location) {
        response.resume();
        fetchRemoteFileBuffer(location, redirectCount + 1).then(resolve).catch(reject);
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`Failed to fetch file. Status: ${statusCode}`));
        return;
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: response.headers['content-type'] || 'application/pdf'
        });
      });
      response.on('error', reject);
    }).on('error', reject);
  });
};

exports.previewStripeInvoice = async (req, res) => {
  try {
    const { booking_id } = req.body;
    const { invoiceDetails } = await prepareInvoiceDetailsForBooking(booking_id, req.userId || null);

    return res.status(200).json({
      success: true,
      message: invoiceDetails.isPaid ? 'Receipt preview ready' : 'Invoice preview ready',
      data: invoiceDetails
    });
  } catch (error) {
    console.error('Stripe Invoice Preview Error:', error);
    const status = error.statusCode || 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

exports.getStripeInvoicePdf = async (req, res) => {
  try {
    const { booking_id } = req.params;
    const forceDownload = String(req.query.download || '').toLowerCase() === '1' || String(req.query.download || '').toLowerCase() === 'true';
    const { invoiceDetails } = await prepareInvoiceDetailsForBooking(booking_id, req.userId || null);

    if (!invoiceDetails?.invoicePdf) {
      return res.status(404).json({
        success: false,
        message: 'Invoice PDF is not available for this booking'
      });
    }

    const { buffer, contentType } = await fetchRemoteFileBuffer(invoiceDetails.invoicePdf);
    const safeInvoiceNumber = String(invoiceDetails.invoiceNumber || 'invoice').replace(/[^\w.-]+/g, '_');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `${forceDownload ? 'attachment' : 'inline'}; filename="${safeInvoiceNumber}.pdf"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('Stripe Invoice PDF Proxy Error:', error);
    const status = error.statusCode || 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

exports.sendStripeInvoice = async (req, res) => {
  try {
    const { booking_id } = req.body;
    const {
      parsedBookingId,
      recipientName,
      recipientEmail,
      invoiceDetails
    } = await prepareInvoiceDetailsForBooking(booking_id, req.userId || null);

    const userData = { name: recipientName, email: recipientEmail };
    const emailResult = await emailService.sendInvoiceEmail(userData, invoiceDetails);

    if (!emailResult.success) {
      console.error("Email failed", {
        booking_id: parsedBookingId,
        invoice: invoiceDetails.invoiceNumber,
        error: emailResult.error
      });
    }

    const associatedLead = await db.sales_leads.findOne({ where: { booking_id: parsedBookingId } });
    const associatedClientLead = await db.client_leads.findOne({ where: { booking_id: parsedBookingId } });
    const sentAt = new Date();

    await db.invoice_send_history.create({
      booking_id: parsedBookingId,
      lead_id: associatedLead?.lead_id || null,
      client_lead_id: associatedClientLead?.lead_id || null,
      assigned_sales_rep_id: associatedLead?.assigned_sales_rep_id || associatedClientLead?.assigned_sales_rep_id || null,
      client_name: recipientName || associatedLead?.client_name || associatedClientLead?.client_name || null,
      client_email: recipientEmail || associatedLead?.guest_email || associatedClientLead?.guest_email || null,
      invoice_number: invoiceDetails.invoiceNumber || null,
      invoice_url: invoiceDetails.invoiceUrl || null,
      invoice_pdf: invoiceDetails.invoicePdf || null,
      payment_status: invoiceDetails.paymentStatusOverride || (invoiceDetails.isPaid ? 'paid' : 'pending'),
      sent_by_user_id: req.userId || null,
      sent_at: sentAt
    });

    await updatePaymentLeadState({
      leadId: associatedLead?.lead_id || null,
      clientLeadId: associatedClientLead?.lead_id || null,
      newStatus: 'proposal_sent',
      activityType: 'payment_link_generated',
      activityData: {
        booking_id: parsedBookingId,
        invoice_number: invoiceDetails.invoiceNumber,
        invoice_sent: emailResult.success,
        invoice_url: invoiceDetails.invoiceUrl || null,
        invoice_pdf: invoiceDetails.invoicePdf || null,
        recipient_name: recipientName || null,
        recipient_email: recipientEmail || null,
        sent_at: sentAt.toISOString(),
        payment_status: invoiceDetails.paymentStatusOverride || (invoiceDetails.isPaid ? 'paid' : 'pending')
      },
      performedByUserId: req.userId
    });

    return res.status(200).json({
      success: true,
      message: invoiceDetails.isReducedAmount ? 'Quote update sent successfully' : (invoiceDetails.isPaid ? 'Receipt sent successfully' : 'Invoice sent successfully'),
      data: invoiceDetails
    });

  } catch (error) {
    console.error('Stripe Invoice Error:', error);
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

exports.sendQuoteInvoice = async (req, res) => {
  try {
    const quoteId = Number(req.params.quoteId || req.body?.quote_id);
    if (!Number.isInteger(quoteId) || quoteId <= 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Invalid quoteId'
      });
    }

    const quoteWhere = { sales_quote_id: quoteId };
    if (req.userRole === 'sales_rep') {
      quoteWhere.assigned_sales_rep_id = req.userId;
    }

    const salesQuote = await db.sales_quotes.findOne({
      where: quoteWhere,
      attributes: ['sales_quote_id', 'lead_id', 'client_name', 'client_email']
    });

    if (!salesQuote) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Quote not found'
      });
    }

    const linkedLead = salesQuote.lead_id
      ? await db.sales_leads.findOne({
          where: { lead_id: salesQuote.lead_id },
          attributes: ['lead_id', 'booking_id']
        })
      : null;

    let bookingId = linkedLead?.booking_id || null;
    if (!bookingId) {
      const ensuredBooking = await quoteService.ensureQuoteBookingForPayment(
        salesQuote.sales_quote_id,
        { userId: req.userId, role: req.userRole }
      );
      bookingId = ensuredBooking.booking_id;
    }

    const { invoiceDetails } = await sendInvoiceForBooking({
      bookingId,
      quoteId: salesQuote.sales_quote_id,
      performedByUserId: req.userId || null,
      recipientOverride: {
        email: salesQuote.client_email || null,
        name: salesQuote.client_name || null
      }
    });

    return res.status(200).json({
      success: true,
      message: invoiceDetails.isReducedAmount ? 'Quote update sent successfully' : (invoiceDetails.isPaid ? 'Quote receipt sent successfully' : 'Quote invoice sent successfully'),
      data: {
        quote_id: salesQuote.sales_quote_id,
        booking_id: bookingId,
        ...invoiceDetails
      }
    });
  } catch (error) {
    console.error('Quote Invoice Error:', error);
    const status = error.statusCode || 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

exports.previewQuoteInvoice = async (req, res) => {
  try {
    const quoteId = Number(req.params.quoteId || req.body?.quote_id);
    if (!Number.isInteger(quoteId) || quoteId <= 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Invalid quoteId'
      });
    }

    const quoteWhere = { sales_quote_id: quoteId };
    if (req.userRole === 'sales_rep') {
      quoteWhere.assigned_sales_rep_id = req.userId;
    }

    const salesQuote = await db.sales_quotes.findOne({
      where: quoteWhere,
      attributes: ['sales_quote_id', 'lead_id', 'client_name', 'client_email']
    });

    if (!salesQuote) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Quote not found'
      });
    }

    const linkedLead = salesQuote.lead_id
      ? await db.sales_leads.findOne({
          where: { lead_id: salesQuote.lead_id },
          attributes: ['lead_id', 'booking_id']
        })
      : null;

    let bookingId = linkedLead?.booking_id || null;
    if (!bookingId) {
      const ensuredBooking = await quoteService.ensureQuoteBookingForPayment(
        salesQuote.sales_quote_id,
        { userId: req.userId, role: req.userRole }
      );
      bookingId = ensuredBooking.booking_id;
    }

    const { invoiceDetails } = await prepareInvoiceDetailsForBooking(bookingId, req.userId || null, {
      email: salesQuote.client_email || null,
      name: salesQuote.client_name || null
    }, salesQuote.sales_quote_id);

    return res.status(200).json({
      success: true,
      message: invoiceDetails.isReducedAmount ? 'Quote update preview ready' : (invoiceDetails.isPaid ? 'Quote receipt preview ready' : 'Quote invoice preview ready'),
      data: {
        quote_id: salesQuote.sales_quote_id,
        booking_id: bookingId,
        ...invoiceDetails
      }
    });
  } catch (error) {
    console.error('Quote Invoice Preview Error:', error);
    const status = error.statusCode || 500;
    return res.status(status).json({ success: false, message: error.message });
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
    await updatePaymentLeadState({
      leadId: paymentLink.lead_id || null,
      clientLeadId: paymentLink.client_lead_id || null,
      newStatus: 'booked',
      activityType: 'payment_completed',
      activityData: {
        payment_link_id: paymentLink.payment_link_id,
        booking_id: paymentLink.booking_id
      },
      transaction
    });

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
        },
        {
          model: client_leads,
          as: 'client_lead',
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
