const { payment_links, sales_leads, client_leads, sales_lead_activities, client_lead_activities, discount_codes, stream_project_booking, quotes, quote_line_items, users } = require('../models');
const db = require('../models');
const paymentLinksService = require('../services/payment-links.service');
const quoteService = require('../services/sales-quote.service');
const accountCreditService = require('../services/account-credit.service');
const bookingPaymentSummaryService = require('../services/booking-payment-summary.service');
const constants = require('../utils/constants');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const emailService = require('../utils/emailService');
const { generateManualReceiptPdfBuffer } = require('../utils/manualReceiptPdf');
const discountService = require('../services/discount.service');
const pricingService = require('../services/pricing.service');
const { Op, QueryTypes } = require('sequelize');
const http = require('http');
const https = require('https');

const getFrontendBaseUrl = () =>
  String(process.env.FRONTEND_URL || 'http://localhost:3000').trim().replace(/\/+$/, '');

const buildManualInvoiceFrontendUrl = (bookingId) => {
  const frontendBaseUrl = getFrontendBaseUrl();
  return `${frontendBaseUrl}/beige_invoice/${encodeURIComponent(String(bookingId))}?manual=1`;
};

const buildReceiptFrontendUrl = ({ bookingId, manualPaymentId = null, paymentId = null, download = false }) => {
  const frontendBaseUrl = getFrontendBaseUrl();
  const url = new URL(`${frontendBaseUrl}/beige_invoice/${encodeURIComponent(String(bookingId))}`);
  url.searchParams.set('receipt', '1');
  if (manualPaymentId) url.searchParams.set('manual_payment_id', String(manualPaymentId));
  if (paymentId) url.searchParams.set('payment_id', String(paymentId));
  if (download) url.searchParams.set('download', '1');
  return url.toString();
};

const buildReceiptFrontendOpenUrl = ({ bookingId, manualPaymentId = null, paymentId = null }) => {
  const frontendBaseUrl = getFrontendBaseUrl();
  const url = new URL(`${frontendBaseUrl}/receipt-open/${encodeURIComponent(String(bookingId))}`);
  if (manualPaymentId) url.searchParams.set('manual_payment_id', String(manualPaymentId));
  if (paymentId) url.searchParams.set('payment_id', String(paymentId));
  return url.toString();
};

const findStripeInvoiceForPaidBooking = async (booking, bookingId) => {
  if (booking?.stripe_invoice_id) {
    try {
      const invoice = await stripe.invoices.retrieve(booking.stripe_invoice_id);
      if (invoice?.hosted_invoice_url) {
        return invoice;
      }
    } catch (error) {
      console.warn(`Could not retrieve Stripe invoice ${booking.stripe_invoice_id}: ${error.message}`);
    }
  }

  if (!booking?.stripe_customer_id) {
    return null;
  }

  try {
    const invoices = await stripe.invoices.list({
      customer: booking.stripe_customer_id,
      limit: 100
    });

    const matches = (invoices.data || []).filter(
      (invoice) => invoice.metadata?.booking_id === String(bookingId) && invoice.hosted_invoice_url
    );

    return (
      matches.find((invoice) => invoice.status === 'paid') ||
      matches.find((invoice) => invoice.status === 'open') ||
      matches[0] ||
      null
    );
  } catch (error) {
    console.warn(`Could not list Stripe invoices for booking ${bookingId}: ${error.message}`);
    return null;
  }
};

const findStripeInvoiceHistoryForPaidBooking = async (bookingId) => {
  if (!db.invoice_send_history) {
    return null;
  }

  const rows = await db.invoice_send_history.findAll({
    where: {
      booking_id: bookingId
    },
    attributes: ['invoice_number', 'invoice_url', 'invoice_pdf', 'payment_status'],
    order: [['sent_at', 'DESC'], ['invoice_send_history_id', 'DESC']],
    limit: 10
  });

  return (rows || []).find((row) => {
    const invoiceUrl = String(row.invoice_url || '');
    const invoicePdf = String(row.invoice_pdf || '');
    return /stripe\.com/i.test(invoiceUrl) || /stripe\.com/i.test(invoicePdf);
  }) || null;
};

const getStripeReceiptUrlFromPaymentIntent = async (paymentIntentId) => {
  if (!paymentIntentId) return null;

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge', 'charges.data']
    });
    const expandedCharge =
      paymentIntent.latest_charge && typeof paymentIntent.latest_charge === 'object'
        ? paymentIntent.latest_charge
        : paymentIntent.charges?.data?.[0] || null;

    if (expandedCharge?.receipt_url) {
      return expandedCharge.receipt_url;
    }

    if (typeof paymentIntent.latest_charge === 'string') {
      const charge = await stripe.charges.retrieve(paymentIntent.latest_charge);
      return charge?.receipt_url || null;
    }
  } catch (error) {
    console.warn(`Could not retrieve Stripe receipt for payment intent ${paymentIntentId}: ${error.message}`);
  }

  return null;
};

const fetchManualPaymentReceiptRow = async ({ bookingId, manualPaymentId }) => {
  const parsedBookingId = Number(bookingId);
  const parsedManualPaymentId = Number(manualPaymentId);

  if (!Number.isFinite(parsedBookingId) || parsedBookingId <= 0 || !Number.isFinite(parsedManualPaymentId) || parsedManualPaymentId <= 0) {
    return null;
  }

  try {
    const rows = await db.sequelize.query(
      `
        SELECT
          booking_manual_payment_id,
          booking_id,
          payment_type,
          amount,
          payment_mode,
          other_payment_mode,
          created_at
        FROM booking_manual_payments
        WHERE booking_manual_payment_id = :manualPaymentId
          AND booking_id = :bookingId
        LIMIT 1
      `,
      {
        replacements: {
          bookingId: parsedBookingId,
          manualPaymentId: parsedManualPaymentId
        },
        type: QueryTypes.SELECT
      }
    );

    return rows?.[0] || null;
  } catch (error) {
    const code = error?.original?.code || error?.parent?.code || error?.code;
    if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_TABLE_ERROR') {
      return null;
    }

    throw error;
  }
};

const fetchStripePaymentReceiptRow = async ({ paymentId }) => {
  const parsedPaymentId = Number(paymentId);
  if (!Number.isFinite(parsedPaymentId) || parsedPaymentId <= 0) return null;

  return db.payment_transactions.findByPk(parsedPaymentId, {
    attributes: [
      'payment_id',
      'stripe_payment_intent_id',
      'stripe_charge_id',
      'total_amount',
      'status',
      'created_at'
    ]
  });
};

const fetchStripePaymentReceiptRowsForBooking = async ({ bookingId }) => {
  const parsedBookingId = Number(bookingId);
  if (!Number.isFinite(parsedBookingId) || parsedBookingId <= 0) return [];

  try {
    return await db.sequelize.query(
      `
        SELECT
          p.payment_id,
          p.stripe_payment_intent_id,
          p.stripe_charge_id,
          p.total_amount,
          p.status,
          COALESCE(fip.paid_at, p.created_at) AS created_at
        FROM finance_invoice_payments fip
        INNER JOIN payment_transactions p
          ON p.payment_id = fip.payment_id
        WHERE fip.booking_id = :bookingId
          AND fip.payment_id IS NOT NULL
          AND fip.status = 'paid'
          AND p.status = 'succeeded'
        ORDER BY COALESCE(fip.paid_at, p.created_at) ASC, fip.finance_invoice_payment_id ASC
      `,
      {
        replacements: { bookingId: parsedBookingId },
        type: QueryTypes.SELECT
      }
    );
  } catch (error) {
    const code = error?.original?.code || error?.parent?.code || error?.code;
    if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_TABLE_ERROR') {
      return [];
    }

    throw error;
  }
};

const resolveHostedPaymentUrlForInvoice = async ({
  booking,
  bookingId,
  pricingData,
  paymentState,
  recipientOverride = null
}) => {
  const pendingAmount = Number(paymentState?.dueAmount ?? pricingData?.total ?? 0);
  if (!Number.isFinite(pendingAmount) || pendingAmount <= 0.009) return null;

  if (booking?.stripe_invoice_id) {
    try {
      const existingInvoice = await stripe.invoices.retrieve(booking.stripe_invoice_id);
      if (existingInvoice?.hosted_invoice_url && ['draft', 'open'].includes(String(existingInvoice.status || '').toLowerCase())) {
        return existingInvoice.hosted_invoice_url;
      }
    } catch (error) {
      console.warn(`Could not retrieve hosted payment invoice for booking ${bookingId}: ${error.message}`);
    }
  }

  try {
    const paymentInvoice = await paymentLinksService.createStripeInvoice(booking, pricingData, {
      recipientOverride,
      forceNewInvoice: false,
      metadata: {
        payment_source: 'quote_invoice',
        standardized_parent_invoice: 'true'
      }
    });
    return paymentInvoice?.hosted_invoice_url || null;
  } catch (error) {
    console.warn(`Could not create hosted payment invoice for booking ${bookingId}: ${error.message}`);
    return null;
  }
};

const resolveInvoiceDisplayNumber = (booking, stripeInvoiceNumber = null) =>
  paymentLinksService.buildBeigeInvoiceReference(booking) || stripeInvoiceNumber || null;

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

const normalizeRequestedPaymentAmount = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return NaN;
  return Math.round(numericValue * 100) / 100;
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
  bookingReference: paymentLinksService.buildBeigeInvoiceReference(booking),
  stripeInvoiceNumber: invoiceDetails.stripeInvoiceNumber || null,
  invoiceNumber: resolveInvoiceDisplayNumber(booking, invoiceDetails.stripeInvoiceNumber || invoiceDetails.invoiceNumber || null),
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

  const paymentSummary = bookingId
    ? await bookingPaymentSummaryService.getBookingPaymentSummary(bookingId, transaction)
    : null;
  const summaryChangeType = String(paymentSummary?.last_quote_change_type || '').toLowerCase();
  const summaryApprovalStatus = String(paymentSummary?.last_quote_change_status || '').toLowerCase();
  const summaryDueAmount = parseFloat(paymentSummary?.due_amount || 0);
  const summaryChangeAmount = parseFloat(paymentSummary?.last_quote_change_amount || 0);

  if (paymentSummary) {
    if (
      summaryChangeType === 'increase' &&
      summaryDueAmount > 0 &&
      (summaryChangeAmount > 0 || summaryDueAmount > 0)
    ) {
      return {
        additionalAmount: summaryDueAmount,
        originalIncreaseAmount: summaryChangeAmount || summaryDueAmount,
        revisedTotal: parseFloat(paymentSummary.quote_total || 0),
        previouslyPaidAmount: parseFloat(paymentSummary.paid_amount || 0),
        approvalStatus: summaryApprovalStatus || 'pending',
        label: 'Additional payment for revised quote',
        existingInvoice: null
      };
    }

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

  const latestAdditionalInvoice = db.invoice_send_history
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

  if (String(latestAdditionalInvoice?.payment_status || '').toLowerCase() === 'paid') {
    return null;
  }

  return {
    additionalAmount,
    revisedTotal,
    previouslyPaidAmount,
    approvalStatus: metadata.approval_status || 'pending',
    label: 'Additional payment for revised quote',
    existingInvoice: latestAdditionalInvoice
  };
};

const resolveReducedQuoteInvoiceContext = async ({ quoteId, bookingId, transaction }) => {
  if (!quoteId || !db.sales_quote_activities) {
    return null;
  }

  const paymentSummary = bookingId
    ? await bookingPaymentSummaryService.getBookingPaymentSummary(bookingId, transaction)
    : null;
  const summaryChangeType = String(paymentSummary?.last_quote_change_type || '').toLowerCase();
  const summaryApprovalStatus = String(paymentSummary?.last_quote_change_status || '').toLowerCase();
  const summaryChangeAmount = parseFloat(paymentSummary?.last_quote_change_amount || 0);

  if (paymentSummary) {
    if (summaryChangeType === 'decrease' && summaryChangeAmount > 0) {
      const quote = await db.sales_quotes.findByPk(quoteId, {
        attributes: ['client_user_id', 'client_email'],
        transaction
      });

      const accountBalance = await accountCreditService.getAccountCreditBalance({
        userId: quote?.client_user_id || null,
        guestEmail: quote?.client_email || null,
        transaction
      });

      return {
        reducedAmount: summaryChangeAmount,
        revisedTotal: parseFloat(paymentSummary.quote_total || 0),
        previouslyPaidAmount: parseFloat(paymentSummary.paid_amount || 0),
        approvalStatus: summaryApprovalStatus || 'pending',
        label: 'Quote total reduced after payment',
        existingInvoice: null,
        creditSummary: await accountCreditService.getQuoteCreditSummary({
          salesQuoteId: quoteId,
          bookingId,
          transaction
        }),
        accountBalance
      };
    }

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

  const quote = await db.sales_quotes.findByPk(quoteId, {
    attributes: ['client_user_id', 'client_email'],
    transaction
  });

  const accountBalance = await accountCreditService.getAccountCreditBalance({
    userId: quote?.client_user_id || null,
    guestEmail: quote?.client_email || null,
    transaction
  });

  return {
    reducedAmount,
    revisedTotal,
    previouslyPaidAmount,
    approvalStatus: metadata.approval_status || 'pending',
    label: 'Quote total reduced after payment',
    existingInvoice: existingReducedInvoice,
    creditSummary: await accountCreditService.getQuoteCreditSummary({
      salesQuoteId: quoteId,
      bookingId,
      transaction
    }),
    accountBalance
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

const sendInvoiceForBooking = async ({ bookingId, quoteId = null, performedByUserId = null, recipientOverride = null, requestBaseUrl = null }) => {
  const manualContext = await getBookingManualPaymentContext(bookingId);
  const useManualReceipt = await shouldUseManualInvoiceReceipt(bookingId, manualContext);
  const {
    parsedBookingId,
    recipientName,
    recipientEmail,
    invoiceDetails
  } = useManualReceipt
    ? await prepareManualInvoiceDetailsForBooking(bookingId, null, recipientOverride)
    : await prepareInvoiceDetailsForBooking(bookingId, performedByUserId, recipientOverride, quoteId, requestBaseUrl);

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

const getBookingManualPaymentContext = async (bookingId) => {
  const parsedBookingId = Number(bookingId);
  if (!Number.isFinite(parsedBookingId)) {
    return { isManual: false, latestManualPayment: null };
  }

  const [lead, clientLead] = await Promise.all([
    db.sales_leads.findOne({ where: { booking_id: parsedBookingId }, attributes: ['lead_id'] }),
    db.client_leads.findOne({ where: { booking_id: parsedBookingId }, attributes: ['lead_id'] })
  ]);

  const activityWhere = { activity_type: 'payment_completed' };
  const [leadActivities, clientLeadActivities] = await Promise.all([
    lead?.lead_id
      ? db.sales_lead_activities.findAll({
          where: { ...activityWhere, lead_id: lead.lead_id },
          attributes: ['activity_data', 'created_at'],
          order: [['created_at', 'DESC']],
          limit: 10
        })
      : [],
    clientLead?.lead_id
      ? db.client_lead_activities.findAll({
          where: { ...activityWhere, lead_id: clientLead.lead_id },
          attributes: ['activity_data', 'created_at'],
          order: [['created_at', 'DESC']],
          limit: 10
        })
      : []
  ]);

  const manualActivities = [...(leadActivities || []), ...(clientLeadActivities || [])]
    .map((activity) => {
      const parsed = parseActivityMetadata(activity.activity_data);
      return {
        created_at: activity.created_at,
        data: parsed
      };
    })
    .filter((activity) => activity.data && activity.data.payment_method === 'manual')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return {
    isManual: manualActivities.length > 0,
    latestManualPayment: manualActivities[0] || null
  };
};

const shouldUseManualInvoiceReceipt = async (bookingId, manualContext) => {
  if (!manualContext?.isManual) return false;
  if (String(manualContext?.latestManualPayment?.data?.payment_mode || '').toLowerCase() === 'net30') {
    return true;
  }

  const paymentState = await bookingPaymentSummaryService.resolveBookingPaymentState({ bookingId });
  if (paymentState.hasSummary) {
    return !paymentState.requiresPayment;
  }

  const remainingAfterPayment = Number(manualContext.latestManualPayment?.data?.remaining_after_payment ?? NaN);
  return manualContext.latestManualPayment?.data?.payment_type === 'full' ||
    (Number.isFinite(remainingAfterPayment) && remainingAfterPayment <= 0);
};

const prepareManualInvoiceDetailsForBooking = async (bookingId, req, recipientOverride = null) => {
  const parsedBookingId = Number(bookingId);
  if (!Number.isFinite(parsedBookingId)) {
    const error = new Error('Valid booking_id is required.');
    error.statusCode = 400;
    throw error;
  }

  const booking = await db.stream_project_booking.findOne({
    where: { stream_project_booking_id: parsedBookingId },
    include: bookingInvoiceIncludes
  });

  if (!booking) {
    const error = new Error(`Booking ID ${parsedBookingId} not found.`);
    error.statusCode = 404;
    throw error;
  }

  const pricingData = await calculateLeadPricing(booking);
  if (!pricingData) {
    const error = new Error(`Could not calculate pricing for booking ${parsedBookingId}.`);
    error.statusCode = 400;
    throw error;
  }

  let recipientEmail = booking.user?.email || booking.guest_email;
  let recipientName = booking.user?.name || (booking.project_name ? booking.project_name.split(' - ')[1] : 'Valued Guest');
  if (recipientOverride?.email) recipientEmail = recipientOverride.email;
  if (recipientOverride?.name) recipientName = recipientOverride.name;
  if (!recipientEmail) {
    const error = new Error('No email address associated with this booking.');
    error.statusCode = 400;
    throw error;
  }

  const invoicePdfUrl = buildManualInvoiceFrontendUrl(parsedBookingId);

  const manualContext = await getBookingManualPaymentContext(parsedBookingId);
  const paymentState = await bookingPaymentSummaryService.resolveBookingPaymentState({ bookingId: parsedBookingId });
  const paymentSummary = paymentState.paymentSummary;
  const remainingAfterPayment = Number(manualContext.latestManualPayment?.data?.remaining_after_payment ?? NaN);
  const totalAmount = Number(pricingData.total || 0);
  const isPaidManual =
    paymentState.isPaid ||
    totalAmount <= 0 ||
    manualContext.latestManualPayment?.data?.payment_type === 'full' ||
    (Number.isFinite(remainingAfterPayment) && remainingAfterPayment <= 0);

  const invoiceDetails = buildInvoiceTemplateDetails(booking, pricingData, {
    invoiceUrl: invoicePdfUrl,
    invoicePdf: invoicePdfUrl,
    receiptUrl: invoicePdfUrl,
    invoiceNumber: `INVBEIGE-M-${String(parsedBookingId).padStart(4, '0')}`,
    totalAmount,
    isPaid: isPaidManual,
    isAdditionalPayment: false
  });

  return {
    parsedBookingId,
    recipientName,
    recipientEmail,
    invoiceDetails
  };
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

const toCurrencyNumber = (value) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parseFloat(parsed.toFixed(2)) : 0;
};

const sumInvoiceLineItems = (items = []) => parseFloat(
    items.reduce((sum, item) => sum + toCurrencyNumber(item?.total ?? item?.line_total), 0).toFixed(2)
);

const mapLegacyQuoteLineItems = (lineItems = []) => (lineItems || []).map(item => ({
    name: item.item_name,
    quantity: item.quantity,
    unit_price: toCurrencyNumber(item.unit_price || 0),
    total: toCurrencyNumber(item.line_total)
}));

const mapSalesQuoteLineItems = (lineItems = []) => (lineItems || [])
    .filter((item) => item && item.is_active !== 0 && item.is_active !== false)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .map(item => ({
        name: item.item_name,
        quantity: item.quantity,
        unit_price: toCurrencyNumber(item.unit_rate || item.estimated_pricing || 0),
        total: toCurrencyNumber(item.line_total),
        section_type: item.section_type || null
    }));

const resolveLinkedSalesQuoteForBooking = async (booking) => {
    const bookingId = Number(booking?.stream_project_booking_id || 0);
    if (!bookingId || !db.sales_quotes || !db.sales_quote_line_items) return null;

    const includedSalesLeadIds = Array.isArray(booking.sales_leads)
        ? booking.sales_leads.map((lead) => Number(lead?.lead_id || 0)).filter(Boolean)
        : [];
    const includedClientLeadIds = Array.isArray(booking.client_leads)
        ? booking.client_leads.map((lead) => Number(lead?.lead_id || 0)).filter(Boolean)
        : [];

    let leadIds = [...includedSalesLeadIds, ...includedClientLeadIds];
    if (!leadIds.length) {
        const [salesLeadRows, clientLeadRows] = await Promise.all([
            db.sales_leads.findAll({
                where: { booking_id: bookingId },
                attributes: ['lead_id'],
                order: [['lead_id', 'DESC']],
                limit: 5
            }),
            db.client_leads.findAll({
                where: { booking_id: bookingId },
                attributes: ['lead_id'],
                order: [['lead_id', 'DESC']],
                limit: 5
            })
        ]);

        leadIds = [
            ...(salesLeadRows || []).map((lead) => Number(lead?.lead_id || 0)),
            ...(clientLeadRows || []).map((lead) => Number(lead?.lead_id || 0))
        ].filter(Boolean);
    }

    if (!leadIds.length) return null;

    return db.sales_quotes.findOne({
        where: { lead_id: { [Op.in]: [...new Set(leadIds)] } },
        include: [{
            model: db.sales_quote_line_items,
            as: 'line_items',
            required: false
        }],
        order: [
            ['accepted_at', 'DESC'],
            ['sales_quote_id', 'DESC'],
            [{ model: db.sales_quote_line_items, as: 'line_items' }, 'sort_order', 'ASC']
        ]
    });
};

const shouldPreferSalesQuotePricing = (salesQuote, legacyQuote) => {
    if (!salesQuote) return false;
    if (!legacyQuote) return true;

    const salesLineItems = mapSalesQuoteLineItems(salesQuote.line_items || []);
    const salesSubtotal = toCurrencyNumber(salesQuote.subtotal);
    const salesTotal = toCurrencyNumber(salesQuote.total);

    // Converted quote invoices must stay faithful to the accepted quote snapshot.
    // Direct booking fees such as rush order fees can exist on the legacy booking quote,
    // but they should not be added back onto quote-originated invoices.
    if (salesLineItems.length > 0 || salesSubtotal > 0 || salesTotal > 0) return true;

    const legacyLineItems = mapLegacyQuoteLineItems(legacyQuote.line_items || []);
    const legacySubtotal = toCurrencyNumber(legacyQuote.subtotal);
    const legacyTotal = toCurrencyNumber(legacyQuote.total);
    const salesLineTotal = sumInvoiceLineItems(salesLineItems);
    const legacyLineTotal = sumInvoiceLineItems(legacyLineItems);

    if (salesLineItems.length > legacyLineItems.length) return true;
    if (Math.abs(salesSubtotal - legacySubtotal) > 0.01 && salesSubtotal >= legacySubtotal) return true;
    if (Math.abs(salesLineTotal - legacyLineTotal) > 0.01 && salesLineTotal >= legacyLineTotal) return true;
    if (Math.abs(salesTotal - legacyTotal) > 0.01 && salesTotal > 0 && legacyTotal <= 0) return true;

    return false;
};

const buildPricingDataFromQuoteSnapshot = async ({
    quote,
    booking,
    paymentTransaction = null,
    bookingMarkedPaid = false,
    source = 'database'
}) => {
    const totalFromQuote = toCurrencyNumber(quote?.total);
    const subtotal = toCurrencyNumber(quote?.subtotal);
    const discountAmount = toCurrencyNumber(quote?.discount_amount);
    const taxAmount = toCurrencyNumber(quote?.tax_amount);
    const priceAfterDiscount = toCurrencyNumber(
        quote?.price_after_discount != null
            ? quote.price_after_discount
            : Math.max(subtotal - discountAmount, 0)
    );
    const totalFromPayment = toCurrencyNumber(paymentTransaction?.total_amount);
    const paymentState = await bookingPaymentSummaryService.resolveBookingPaymentState({
        bookingId: booking.stream_project_booking_id,
        quoteTotal: totalFromQuote > 0 ? totalFromQuote : priceAfterDiscount,
        paidAmount: totalFromPayment,
        paymentStatus: bookingMarkedPaid ? 'paid' : 'pending'
    });
    const paymentSummary = paymentState.paymentSummary;
    let resolvedTotal = totalFromQuote > 0 ? totalFromQuote : priceAfterDiscount;
    let creditApplied = 0;
    let effectivePaidFlag = bookingMarkedPaid;

    if (paymentSummary) {
        const fullQuoteTotal = paymentState.quoteTotal > 0 ? paymentState.quoteTotal : resolvedTotal;
        const isSettled = paymentState.isPaid;
        resolvedTotal = fullQuoteTotal;
        creditApplied = paymentState.creditUsedAmount;
        effectivePaidFlag = isSettled;
    } else {
        if (bookingMarkedPaid && totalFromPayment > 0 && resolvedTotal <= 0) {
            resolvedTotal = totalFromPayment;
        }
        if (bookingMarkedPaid && totalFromPayment > 0 && resolvedTotal > totalFromPayment) {
            creditApplied = Math.max(0, resolvedTotal - totalFromPayment);
            resolvedTotal = creditApplied;
            effectivePaidFlag = resolvedTotal <= 0;
        } else if (bookingMarkedPaid && totalFromPayment > 0 && resolvedTotal <= totalFromPayment) {
            resolvedTotal = 0;
            effectivePaidFlag = true;
        }
    }

    const isSalesQuote = Boolean(quote?.sales_quote_id);
    const fullLineItems = isSalesQuote
        ? mapSalesQuoteLineItems(quote.line_items || [])
        : mapLegacyQuoteLineItems(quote.line_items || []);

    return {
        source,
        sales_quote_id: quote?.sales_quote_id || null,
        quote_id: quote?.quote_id || null,
        is_paid: effectivePaidFlag,
        stripe_payment_intent_id: paymentTransaction?.stripe_payment_intent_id || null,
        total: toCurrencyNumber(resolvedTotal),
        total_before_credit: paymentSummary && paymentState.quoteTotal > 0
            ? toCurrencyNumber(paymentState.quoteTotal)
            : (totalFromQuote > 0 ? totalFromQuote : priceAfterDiscount),
        credit_applied: toCurrencyNumber(creditApplied),
        paid_amount: paymentSummary ? toCurrencyNumber(paymentState.paidAmount) : totalFromPayment,
        due_amount: paymentSummary ? toCurrencyNumber(paymentState.dueAmount) : toCurrencyNumber(resolvedTotal),
        subtotal,
        discount_amount: discountAmount,
        price_after_discount: priceAfterDiscount,
        tax_type: quote?.tax_type || null,
        tax_rate: toCurrencyNumber(quote?.tax_rate || 0),
        tax_amount: taxAmount,
        discount_type: quote?.discount_type || quote?.applied_discount_type || null,
        discount_value: toCurrencyNumber(quote?.discount_value ?? quote?.applied_discount_value ?? 0),
        line_items: fullLineItems
    };
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
        const linkedSalesQuote = await resolveLinkedSalesQuoteForBooking(booking);
        if (linkedSalesQuote && shouldPreferSalesQuotePricing(linkedSalesQuote, q)) {
            return buildPricingDataFromQuoteSnapshot({
                quote: linkedSalesQuote,
                booking,
                paymentTransaction,
                bookingMarkedPaid,
                source: 'sales_quote'
            });
        }

        if (q) {
            return buildPricingDataFromQuoteSnapshot({
                quote: q,
                booking,
                paymentTransaction,
                bookingMarkedPaid,
                source: 'database'
            });
        }

        if (paymentTransaction) {
            return {
                source: 'transaction',
                is_paid: true,
                stripe_payment_intent_id: paymentTransaction.stripe_payment_intent_id,
                total: parseFloat(paymentTransaction.total_amount || 0),
                total_before_credit: parseFloat(paymentTransaction.subtotal || paymentTransaction.total_amount || 0),
                credit_applied: 0,
                subtotal: parseFloat(paymentTransaction.subtotal || 0),
                price_after_discount: parseFloat(paymentTransaction.subtotal || 0),
                tax_type: null,
                tax_rate: 0,
                tax_amount: 0,
                line_items: [{
                    name: `Service Payment - ${booking.project_name || 'Project'}`,
                    quantity: 1,
                    unit_price: parseFloat(paymentTransaction.total_amount || 0),
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
            total_before_credit: calculated?.total || 0,
            credit_applied: 0,
            subtotal: calculated?.subtotal || 0,
            discount_amount: calculated?.discountAmount || 0,
            price_after_discount: calculated?.priceAfterDiscount || calculated?.subtotal || 0,
            tax_type: null,
            tax_rate: 0,
            tax_amount: 0,
            line_items: (calculated?.lineItems || []).map(li => ({
                name: li.item_name,
                quantity: li.quantity,
                unit_price: Number(li.unit_price || li.rate || ((Number(li.quantity || 1) > 0) ? (Number(li.line_total || 0) / Number(li.quantity || 1)) : 0)),
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
      expiry_hours,
      requested_amount,
      payment_amount
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
    const bookingMarkedPaid = Boolean(booking.payment_id || booking.is_completed === 1);
    const convertedQuoteContexts = await resolveConvertedBookingQuoteContexts(booking_id);
    const additionalApprovalStatus = String(convertedQuoteContexts.additionalInvoiceContext?.approvalStatus || '').toLowerCase();
    const reducedApprovalStatus = String(convertedQuoteContexts.reducedInvoiceContext?.approvalStatus || '').toLowerCase();
    const hasApprovedAdditionalAmount =
      Number(convertedQuoteContexts.additionalInvoiceContext?.additionalAmount || 0) > 0 &&
      additionalApprovalStatus === 'approved';

    const requestedPaymentAmount = normalizeRequestedPaymentAmount(
      requested_amount ?? payment_amount
    );

    if (Number.isNaN(requestedPaymentAmount) || (requestedPaymentAmount !== null && requestedPaymentAmount <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'Payment amount must be greater than $0.00.'
      });
    }

    let validatedRequestedAmount = null;
    if (requestedPaymentAmount !== null) {
      const approvedAdditionalAmount = Number(convertedQuoteContexts.additionalInvoiceContext?.additionalAmount || 0);
      const pricingForAmount = hasApprovedAdditionalAmount
        ? { total: approvedAdditionalAmount }
        : await calculateLeadPricing(booking);
      const quoteTotal = Number(pricingForAmount?.total || booking.budget || booking.total_amount || 0);
      const paymentState = await bookingPaymentSummaryService.resolveBookingPaymentState({
        bookingId: booking_id,
        quoteTotal
      });
      const maxPayableAmount = hasApprovedAdditionalAmount
        ? approvedAdditionalAmount
        : paymentState.hasSummary
          ? Number(paymentState.payableAmount || paymentState.dueAmount || 0)
          : quoteTotal;

      if (!Number.isFinite(maxPayableAmount) || maxPayableAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'No outstanding amount is available for this booking.'
        });
      }

      if (requestedPaymentAmount > maxPayableAmount + 0.009) {
        return res.status(400).json({
          success: false,
          message: `Payment amount cannot exceed the outstanding balance of $${maxPayableAmount.toFixed(2)}.`
        });
      }

      validatedRequestedAmount = requestedPaymentAmount;
    }

    if (bookingMarkedPaid && !hasApprovedAdditionalAmount) {
      if (convertedQuoteContexts.additionalInvoiceContext) {
        return res.status(409).json({
          success: false,
          message: additionalApprovalStatus === 'rejected'
            ? 'This paid quote increase request was rejected, so a payment link cannot be generated.'
            : 'This paid quote increase request is pending admin approval. Approve it before generating a payment link.'
        });
      }

      if (convertedQuoteContexts.reducedInvoiceContext) {
        return res.status(409).json({
          success: false,
          message: reducedApprovalStatus === 'approved'
            ? 'This paid quote was reduced after payment, so no additional payment link is required.'
            : 'This paid quote reduction request must be reviewed before sending any payment communication.'
        });
      }

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
      requested_amount: validatedRequestedAmount,
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
        requested_amount: validatedRequestedAmount,
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
        requested_amount: validatedRequestedAmount,
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

    const convertedQuoteContexts = await resolveConvertedBookingQuoteContexts(link.booking.stream_project_booking_id);
    const additionalApprovalStatus = String(convertedQuoteContexts.additionalInvoiceContext?.approvalStatus || '').toLowerCase();
    const reducedApprovalStatus = String(convertedQuoteContexts.reducedInvoiceContext?.approvalStatus || '').toLowerCase();
    const approvedAdditionalAmount = Number(convertedQuoteContexts.additionalInvoiceContext?.additionalAmount || 0);
    const hasApprovedAdditionalAmount =
      approvedAdditionalAmount > 0 && additionalApprovalStatus === 'approved';

    if (convertedQuoteContexts.additionalInvoiceContext && !hasApprovedAdditionalAmount) {
      return res.status(409).json({
        success: false,
        message: additionalApprovalStatus === 'rejected'
          ? 'This paid quote increase request was rejected, so a payment link email cannot be sent.'
          : 'This paid quote increase request is pending admin approval. Approve it before sending a payment link email.'
      });
    }

    if (convertedQuoteContexts.reducedInvoiceContext) {
      return res.status(409).json({
        success: false,
        message: reducedApprovalStatus === 'approved'
          ? 'This paid quote was reduced after payment, so no payment link email is required.'
          : 'This paid quote reduction request must be reviewed before sending any payment communication.'
      });
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
    const paymentState = await bookingPaymentSummaryService.resolveBookingPaymentState({
      bookingId: link.booking.stream_project_booking_id,
      quoteTotal: link.booking.primary_quote?.total || 0
    });
    const linkRequestedAmount = normalizeRequestedPaymentAmount(link.requested_amount);
    const proposedAmount = linkRequestedAmount
      ? linkRequestedAmount
      : hasApprovedAdditionalAmount
      ? approvedAdditionalAmount
      : paymentState.hasSummary
        ? (paymentState.paidAmount > 0 ? paymentState.payableAmount : paymentState.quoteTotal)
        : (link.booking.primary_quote?.total || '');

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
      proposed_amount: proposedAmount,
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

    const convertedQuoteContexts = booking
      ? await resolveConvertedBookingQuoteContexts(paymentLink.booking_id)
      : { additionalInvoiceContext: null };
    const additionalApprovalStatus = String(convertedQuoteContexts.additionalInvoiceContext?.approvalStatus || '').toLowerCase();
    const approvedAdditionalAmount = Number(convertedQuoteContexts.additionalInvoiceContext?.additionalAmount || 0);
    const hasApprovedAdditionalAmount =
      approvedAdditionalAmount > 0 && additionalApprovalStatus === 'approved';

    const pricing = hasApprovedAdditionalAmount
      ? {
          source: 'quote_additional_amount',
          is_paid: false,
          total: approvedAdditionalAmount,
          subtotal: approvedAdditionalAmount,
          discount_amount: 0,
          price_after_discount: approvedAdditionalAmount,
          tax_type: null,
          tax_rate: 0,
          tax_amount: 0,
          line_items: [
            {
              name: convertedQuoteContexts.additionalInvoiceContext?.label || 'Additional payment for revised quote',
              quantity: 1,
              total: approvedAdditionalAmount
            }
          ]
        }
      : (booking ? await calculateLeadPricing(booking) : null);

    res.json({
      success: true,
      valid: true,
      data: {
        payment_link_id: paymentLink.payment_link_id,
        booking,
        pricing,
        discount_code: discountCode,
        requested_amount: paymentLink.requested_amount ? Number(paymentLink.requested_amount) : null,
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

    const convertedQuoteContexts = paymentLink.booking
      ? await resolveConvertedBookingQuoteContexts(paymentLink.booking.stream_project_booking_id)
      : { additionalInvoiceContext: null, reducedInvoiceContext: null };
    const additionalApprovalStatus = String(convertedQuoteContexts.additionalInvoiceContext?.approvalStatus || '').toLowerCase();
    const hasApprovedAdditionalAmount =
      Number(convertedQuoteContexts.additionalInvoiceContext?.additionalAmount || 0) > 0 &&
      additionalApprovalStatus === 'approved';

    if (paymentLink.is_used === 1) {
      return res.status(200).json({
        success: true, 
        valid: false,
        message: 'This payment link has already been used.',
        reason_code: 'USED'
      });
    }

    if (paymentLink.booking && paymentLink.booking.payment_id && !hasApprovedAdditionalAmount) {
      await paymentLink.update({ is_used: 1 });

      return res.status(200).json({
        success: true, 
        valid: false,
        message: 'Payment for this project has already been completed.',
        reason_code: 'PAID'
      });
    }

    if (convertedQuoteContexts.additionalInvoiceContext && !hasApprovedAdditionalAmount) {
      return res.status(200).json({
        success: true,
        valid: false,
        message: additionalApprovalStatus === 'rejected'
          ? 'This additional payment request was rejected.'
          : 'This additional payment request is pending admin approval.',
        reason_code: 'NOT_APPROVED'
      });
    }

    if (convertedQuoteContexts.reducedInvoiceContext) {
      return res.status(200).json({
        success: true,
        valid: false,
        message: 'This quote was reduced after payment, so no payment link is required.',
        reason_code: 'NO_PAYMENT_REQUIRED'
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
        requested_amount: paymentLink.requested_amount ? Number(paymentLink.requested_amount) : null,
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
  { model: db.stream_project_booking_days, as: 'booking_days', required: false },
  {
    model: db.sales_leads,
    as: 'sales_leads',
    required: false,
    include: [{ model: db.sales_lead_activities, as: 'activities', required: false }]
  },
  {
    model: db.client_leads,
    as: 'client_leads',
    required: false,
    include: [{ model: db.client_lead_activities, as: 'activities', required: false }]
  }
];

const prepareInvoiceDetailsForBooking = async (bookingId, performedByUserId = null, recipientOverride = null, quoteId = null, requestBaseUrl = null) => {
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

    const recipientIdentityChanged = await paymentLinksService.hasRecipientIdentityChanged(
      booking,
      recipientOverride
    );

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
    const totalAmount = Number(pricingData.total || 0);

    // Stripe does not support collecting a 0 amount, so for fully discounted bookings we always use BEIGE manual invoice.
    if (totalAmount <= 0) {
      const invoicePdfUrl = buildManualInvoiceFrontendUrl(parsedBookingId);
      invoiceDetails = buildInvoiceTemplateDetails(booking, pricingData, {
        invoiceUrl: invoicePdfUrl,
        invoicePdf: invoicePdfUrl,
        receiptUrl: invoicePdfUrl,
        invoiceNumber: `INVBEIGE-M-${String(parsedBookingId).padStart(4, '0')}`,
        totalAmount: 0,
        isPaid: true,
        isAdditionalPayment: false
      });

      await booking.update({ invoice_generation_status: 'completed' });
      return { parsedBookingId, recipientName, recipientEmail, invoiceDetails };
    }

    if (additionalInvoiceContext) {
      const additionalApprovalStatus = String(additionalInvoiceContext.approvalStatus || 'pending').toLowerCase();

      if (additionalApprovalStatus !== 'approved') {
        await booking.update({ invoice_generation_status: 'completed' });
        const error = new Error(
          additionalApprovalStatus === 'rejected'
            ? 'This paid quote increase request was rejected, so an additional amount invoice cannot be sent.'
            : 'This paid quote increase request is pending admin approval. Approve it before sending the additional amount invoice.'
        );
        error.statusCode = 409;
        throw error;
      }

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
          descriptionOverride: `${additionalInvoiceContext.label} - ${booking.project_name || 'Project'}`,
          metadata: {
            payment_source: 'additional_invoice',
            ...(quoteId ? { sales_quote_id: String(quoteId) } : {})
          }
        });
      }
      const additionalInvoicePaid = stripeInvoice?.status === 'paid';

      if (!additionalInvoicePaid) {
        invoiceDetails = buildInvoiceTemplateDetails(booking, additionalPricingData, {
          invoiceUrl: stripeInvoice?.hosted_invoice_url || additionalInvoiceContext.existingInvoice?.invoice_url,
          invoicePdf: stripeInvoice?.invoice_pdf || additionalInvoiceContext.existingInvoice?.invoice_pdf,
          stripeInvoiceNumber: stripeInvoice?.number || null,
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
      const reducedApprovalStatus = String(reducedInvoiceContext.approvalStatus || 'pending').toLowerCase();

      if (reducedApprovalStatus !== 'approved') {
        await booking.update({ invoice_generation_status: 'completed' });
        const error = new Error(
          reducedApprovalStatus === 'rejected'
            ? 'This paid quote reduction request was rejected, so an updated receipt cannot be sent.'
            : 'This paid quote reduction request is pending admin approval. Approve it before sending the updated receipt.'
        );
        error.statusCode = 409;
        throw error;
      }

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
        stripeInvoiceNumber: invoiceNumber,
        invoiceNumber,
        totalAmount: reducedInvoiceContext.reducedAmount,
        isPaid: false,
        isAdditionalPayment: false,
        isReducedAmount: true,
        paymentStatusOverride: 'refund_pending',
        previouslyPaidAmount: reducedInvoiceContext.previouslyPaidAmount,
        revisedTotal: reducedInvoiceContext.revisedTotal,
        reducedAmount: reducedInvoiceContext.reducedAmount,
        availableCreditAmount: reducedInvoiceContext.accountBalance?.available_credit_amount || 0,
        hasAvailableCredit: (reducedInvoiceContext.accountBalance?.available_credit_amount || 0) > 0,
        pendingCreditAmount: 0,
        hasPendingCredit: false,
        creditApprovalStatus: 'approved',
        isCreditRejected: false
      });

      await booking.update({ invoice_generation_status: 'completed' });
      return { parsedBookingId, recipientName, recipientEmail, invoiceDetails };
    }

    // --- CASE 1: ALREADY PAID ---
    if (pricingData && (pricingData.is_paid || bookingMarkedPaid)) {
      const stripePaymentIntentId = pricingData.stripe_payment_intent_id || null;
      const paidStripeInvoice = await findStripeInvoiceForPaidBooking(booking, parsedBookingId);
      const paidStripeInvoiceHistory = paidStripeInvoice
        ? null
        : await findStripeInvoiceHistoryForPaidBooking(parsedBookingId);
      const stripeReceiptUrl =
        stripePaymentIntentId
          ? await getStripeReceiptUrlFromPaymentIntent(stripePaymentIntentId)
          : null;

      if (paidStripeInvoice?.hosted_invoice_url || paidStripeInvoiceHistory?.invoice_url || stripeReceiptUrl) {
        const stripeDocumentUrl =
          paidStripeInvoice?.hosted_invoice_url ||
          paidStripeInvoiceHistory?.invoice_url ||
          stripeReceiptUrl;
        invoiceDetails = buildInvoiceTemplateDetails(booking, pricingData, {
          invoiceUrl: stripeDocumentUrl,
          invoicePdf: paidStripeInvoice?.invoice_pdf || paidStripeInvoiceHistory?.invoice_pdf || stripeDocumentUrl,
          receiptUrl:
            stripeReceiptUrl ||
            paidStripeInvoice?.invoice_pdf ||
            paidStripeInvoiceHistory?.invoice_pdf ||
            stripeDocumentUrl,
          stripeInvoiceNumber: paidStripeInvoice?.number || paidStripeInvoiceHistory?.invoice_number || null,
          invoiceNumber:
            paidStripeInvoice?.number ||
            paidStripeInvoiceHistory?.invoice_number ||
            paymentLinksService.buildBeigeInvoiceReference(booking),
          totalAmount,
          isPaid: true,
          isAdditionalPayment: false
        });
      } else {
        const invoicePdfUrl = buildManualInvoiceFrontendUrl(parsedBookingId);
        invoiceDetails = buildInvoiceTemplateDetails(booking, pricingData, {
          invoiceUrl: invoicePdfUrl,
          invoicePdf: invoicePdfUrl,
          receiptUrl: invoicePdfUrl,
          invoiceNumber: `INVBEIGE-M-${String(parsedBookingId).padStart(4, '0')}`,
          totalAmount,
          isPaid: true,
          isAdditionalPayment: false
        });
      }

    } else {
      // --- CASE 2: NOT PAID YET ---
      const stripeInvoice = await paymentLinksService.createStripeInvoice(booking, pricingData, {
        recipientOverride,
        forceNewInvoice: recipientIdentityChanged,
        metadata: quoteId ? {
          payment_source: 'quote_invoice',
          sales_quote_id: String(quoteId)
        } : {
          payment_source: 'booking_checkout'
        }
      });
      invoiceDetails = buildInvoiceTemplateDetails(booking, pricingData, {
        invoiceUrl: stripeInvoice.hosted_invoice_url,
        invoicePdf: stripeInvoice.invoice_pdf,
        stripeInvoiceNumber: stripeInvoice.number,
        invoiceNumber: stripeInvoice.number,
        totalAmount: pricingData.total,
        isPaid: false,
        isAdditionalPayment: false
      });
    }

    if (invoiceDetails && !invoiceDetails.isAdditionalPayment && !invoiceDetails.isReducedAmount) {
      const brandedInvoiceUrl = buildManualInvoiceFrontendUrl(parsedBookingId);
      invoiceDetails = {
        ...invoiceDetails,
        invoiceUrl: invoiceDetails.isPaid ? brandedInvoiceUrl : invoiceDetails.invoiceUrl,
        invoicePdf: brandedInvoiceUrl,
        receiptUrl: invoiceDetails.isPaid ? brandedInvoiceUrl : invoiceDetails.receiptUrl
      };
    }

    await booking.update({ invoice_generation_status: 'completed' });
    return { parsedBookingId, recipientName, recipientEmail, invoiceDetails };

  } catch (error) {
    if (lockTransaction && !lockTransaction.finished) await lockTransaction.rollback();
    if (bookingId) await db.stream_project_booking.update({ invoice_generation_status: 'failed' }, { where: { stream_project_booking_id: bookingId } });
    throw error;
  }
};

const resolveConvertedBookingSalesQuoteId = async (bookingId) => {
  const parsedBookingId = parseInt(bookingId, 10);
  if (!parsedBookingId || Number.isNaN(parsedBookingId)) {
    return null;
  }

  const linkedLead = await db.sales_leads.findOne({
    where: {
      booking_id: parsedBookingId,
      lead_source: 'converted bookings'
    },
    attributes: ['lead_id']
  });

  if (!linkedLead?.lead_id) {
    return null;
  }

  const linkedSalesQuote = await db.sales_quotes.findOne({
    where: { lead_id: linkedLead.lead_id },
    attributes: ['sales_quote_id'],
    order: [['sales_quote_id', 'DESC']]
  });

  return linkedSalesQuote?.sales_quote_id || null;
};

const resolveConvertedBookingQuoteContexts = async (bookingId) => {
  const salesQuoteId = await resolveConvertedBookingSalesQuoteId(bookingId);

  if (!salesQuoteId) {
    return {
      salesQuoteId: null,
      additionalInvoiceContext: null,
      reducedInvoiceContext: null
    };
  }

  const [additionalInvoiceContext, reducedInvoiceContext] = await Promise.all([
    resolveAdditionalQuoteInvoiceContext({
      quoteId: salesQuoteId,
      bookingId,
      transaction: null
    }),
    resolveReducedQuoteInvoiceContext({
      quoteId: salesQuoteId,
      bookingId,
      transaction: null
    })
  ]);

  return {
    salesQuoteId,
    additionalInvoiceContext,
    reducedInvoiceContext
  };
};

const fetchRemoteFileBuffer = async (url, redirectCount = 0) => {
  if (!url) throw new Error('File URL is required');
  if (redirectCount > 5) throw new Error('Too many redirects while fetching file');

  return new Promise((resolve, reject) => {
    const client = String(url || '').toLowerCase().startsWith('http://') ? http : https;
    client.get(url, (response) => {
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

const resolveQuoteRecipientOverrideForBooking = async (bookingId) => {
  const parsedBookingId = Number(bookingId);
  if (!Number.isInteger(parsedBookingId) || parsedBookingId <= 0) {
    return { salesQuoteId: null, recipientOverride: null };
  }

  const linkedLead = await db.sales_leads.findOne({
    where: { booking_id: parsedBookingId },
    attributes: ['lead_id'],
    order: [['lead_id', 'DESC']]
  });

  if (!linkedLead?.lead_id) {
    return { salesQuoteId: null, recipientOverride: null };
  }

  const salesQuote = await db.sales_quotes.findOne({
    where: { lead_id: linkedLead.lead_id },
    attributes: ['sales_quote_id', 'client_name', 'client_email'],
    order: [['sales_quote_id', 'DESC']]
  });

  if (!salesQuote) {
    return { salesQuoteId: null, recipientOverride: null };
  }

  return {
    salesQuoteId: salesQuote.sales_quote_id,
    recipientOverride: {
      email: salesQuote.client_email || null,
      name: salesQuote.client_name || null
    }
  };
};

exports.previewStripeInvoice = async (req, res) => {
  try {
    const { booking_id } = req.body;
    const { salesQuoteId, recipientOverride } = await resolveQuoteRecipientOverrideForBooking(booking_id);
    const resolvedQuoteId = await resolveConvertedBookingSalesQuoteId(booking_id);
    const effectiveQuoteId = resolvedQuoteId || salesQuoteId || null;
    const manualContext = await getBookingManualPaymentContext(booking_id);
    const useManualReceipt = await shouldUseManualInvoiceReceipt(booking_id, manualContext);
    const requestBaseUrl = `${req.protocol}://${req.get('host')}/v1`;
    const { invoiceDetails } = useManualReceipt
      ? await prepareManualInvoiceDetailsForBooking(booking_id, req, recipientOverride)
      : await prepareInvoiceDetailsForBooking(
          booking_id,
          req.userId || null,
          recipientOverride,
          effectiveQuoteId,
          requestBaseUrl
        );

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
    const isManualRequested = String(req.query.manual || '').toLowerCase() === '1' || String(req.query.manual || '').toLowerCase() === 'true';
    const isReceiptRequested = String(req.query.receipt || '').toLowerCase() === '1' || String(req.query.receipt || '').toLowerCase() === 'true';
    const isStripeReceiptRequested = String(req.query.stripe || '').toLowerCase() === '1' || String(req.query.stripe || '').toLowerCase() === 'true';

    if (isStripeReceiptRequested) {
      const paymentId = Number(req.query.payment_id || 0);
      const paymentIntentIdFromQuery = String(req.query.payment_intent_id || '').trim();
      const paymentRecord = paymentId > 0
        ? await db.payment_transactions.findByPk(paymentId, {
            attributes: ['payment_id', 'stripe_payment_intent_id']
          })
        : null;
      const paymentIntentId = paymentRecord?.stripe_payment_intent_id || paymentIntentIdFromQuery || null;
      const stripeReceiptUrl = paymentIntentId
        ? await getStripeReceiptUrlFromPaymentIntent(paymentIntentId)
        : null;

      if (stripeReceiptUrl) {
        return res.redirect(302, stripeReceiptUrl);
      }

      const bookingForStripeFallback = await db.stream_project_booking.findByPk(Number(booking_id), {
        attributes: ['stream_project_booking_id', 'stripe_invoice_id', 'stripe_customer_id']
      });
      const stripeInvoice = bookingForStripeFallback
        ? await findStripeInvoiceForPaidBooking(bookingForStripeFallback, booking_id)
        : null;

      if (stripeInvoice?.invoice_pdf || stripeInvoice?.hosted_invoice_url) {
        return res.redirect(302, stripeInvoice.invoice_pdf || stripeInvoice.hosted_invoice_url);
      }

      return res.status(404).json({
        success: false,
        message: 'Stripe receipt is not available for this payment'
      });
    }

    const manualContext = await getBookingManualPaymentContext(booking_id);
    const useManualReceipt = isManualRequested || isReceiptRequested || await shouldUseManualInvoiceReceipt(booking_id, manualContext);

    if (useManualReceipt) {
      const parsedBookingId = Number(booking_id);
      const selectedManualPayment = await fetchManualPaymentReceiptRow({
        bookingId: parsedBookingId,
        manualPaymentId: req.query.manual_payment_id
      });
      const selectedStripePayment = selectedManualPayment
        ? null
        : await fetchStripePaymentReceiptRow({ paymentId: req.query.payment_id });
      const booking = await db.stream_project_booking.findOne({
        where: { stream_project_booking_id: parsedBookingId },
        include: bookingInvoiceIncludes
      });

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }

      const paymentState = await bookingPaymentSummaryService.resolveBookingPaymentState({
        bookingId: parsedBookingId
      });
      const paymentSummary = paymentState.paymentSummary;
      const hasPaymentSummary = paymentState.hasSummary;
      const isPaidFromSummary = paymentState.isPaid;

      const pricingData = await calculateLeadPricing(booking);
      if (!pricingData) {
        return res.status(400).json({
          success: false,
          message: `Could not calculate pricing for booking ${parsedBookingId}.`
        });
      }
      const pricingTotalAmount = Number(pricingData.total || 0);
      const totalAmount = paymentState.quoteTotal > 0 ? paymentState.quoteTotal : pricingTotalAmount;
      const allowManualForZeroTotal =
        totalAmount <= 0 ||
        hasPaymentSummary ||
        isPaidFromSummary ||
        (isReceiptRequested && pricingData?.is_paid);
      if (!manualContext.isManual && !allowManualForZeroTotal) {
        return res.status(400).json({
          success: false,
          message: 'Manual invoice is not available for this booking'
        });
      }

      const manualHistory = [];
      const allActivities = [];
      const linkedSalesLead = Array.isArray(booking.sales_leads) ? booking.sales_leads[0] : null;
      const linkedClientLead = Array.isArray(booking.client_leads) ? booking.client_leads[0] : null;

      if (linkedSalesLead?.activities?.length) {
        allActivities.push(...linkedSalesLead.activities);
      }
      if (linkedClientLead?.activities?.length) {
        allActivities.push(...linkedClientLead.activities);
      }

      let manualPaymentHistoryRows = [];
      try {
        manualPaymentHistoryRows = await db.sequelize.query(
          `
            SELECT
              booking_manual_payment_id,
              payment_type,
              amount,
              payment_mode,
              other_payment_mode,
              created_at
            FROM booking_manual_payments
            WHERE booking_id = :bookingId
            ORDER BY created_at ASC, booking_manual_payment_id ASC
          `,
          {
            replacements: { bookingId: parsedBookingId },
            type: QueryTypes.SELECT
          }
        );
      } catch (error) {
        const code = error?.original?.code || error?.parent?.code || error?.code;
        if (code !== 'ER_NO_SUCH_TABLE' && code !== 'ER_BAD_TABLE_ERROR') {
          throw error;
        }
      }

      if (manualPaymentHistoryRows.length > 0) {
        manualPaymentHistoryRows.forEach((manualPayment) => {
          const normalizedPaymentMode = String(manualPayment.payment_mode || '').toLowerCase();
          const resolvedMethod = normalizedPaymentMode === 'other' && String(manualPayment.other_payment_mode || '').trim()
            ? String(manualPayment.other_payment_mode).trim()
            : normalizedPaymentMode === 'net30'
              ? 'Net 30'
              : String(manualPayment.payment_mode || 'manual').replace(/_/g, ' ');
          manualHistory.push({
            method: resolvedMethod,
            date: formatInvoiceDate(manualPayment.created_at),
            sortDate: manualPayment.created_at,
            amount: Number(manualPayment.amount || 0),
            receiptUrl: buildReceiptFrontendOpenUrl({
              bookingId: parsedBookingId,
              manualPaymentId: manualPayment.booking_manual_payment_id
            }),
            receiptDownloadUrl: buildReceiptFrontendUrl({
              bookingId: parsedBookingId,
              manualPaymentId: manualPayment.booking_manual_payment_id,
              download: true
            })
          });
        });
      } else {
        allActivities
          .filter((activity) => activity?.activity_type === 'payment_completed')
          .forEach((activity) => {
            const meta = parseActivityMetadata(activity.activity_data);
            if (!meta || meta.payment_method !== 'manual') return;
            const normalizedPaymentMode = String(meta.payment_mode || '').toLowerCase();
            const parsedAmount = Number(meta.amount);
            const fallbackFullAmount = Number(meta.remaining_before_payment || meta.total_amount || 0);
            const resolvedAmount = normalizedPaymentMode === 'net30'
              ? 0
              : Number.isFinite(parsedAmount) && parsedAmount > 0
              ? parsedAmount
              : fallbackFullAmount;
            const normalizedMode = meta.payment_mode ? String(meta.payment_mode).replace(/_/g, ' ') : 'manual';
            const resolvedMethod = normalizedPaymentMode === 'other' && String(meta.other_payment_mode || '').trim()
              ? String(meta.other_payment_mode).trim()
              : normalizedPaymentMode === 'net30'
                ? 'Net 30'
                : normalizedMode;
            manualHistory.push({
              method: resolvedMethod,
              date: formatInvoiceDate(activity.created_at),
              sortDate: activity.created_at,
              amount: resolvedAmount,
              receiptUrl: meta.booking_manual_payment_id
                ? buildReceiptFrontendOpenUrl({
                    bookingId: parsedBookingId,
                    manualPaymentId: meta.booking_manual_payment_id
                  })
                : null,
              receiptDownloadUrl: meta.booking_manual_payment_id
                ? buildReceiptFrontendUrl({
                    bookingId: parsedBookingId,
                    manualPaymentId: meta.booking_manual_payment_id,
                    download: true
                  })
                : null
            });
          });
      }

      const lineItems = Array.isArray(pricingData.line_items) ? pricingData.line_items : [];
      const quoteDiscountAmount = Number(pricingData.discount_amount || 0);
      let quoteDiscountCode = null;
      let quoteDiscountType = pricingData.discount_type || null;
      let quoteDiscountValue = pricingData.discount_value != null
        ? Number(pricingData.discount_value)
        : null;
      const primaryQuote = booking.primary_quote || null;
      if (primaryQuote?.discount_code_id) {
        const linkedDiscountCode = await discount_codes.findByPk(primaryQuote.discount_code_id, {
          attributes: ['code', 'discount_type', 'discount_value']
        });
        if (linkedDiscountCode) {
          quoteDiscountCode = linkedDiscountCode.code || null;
          quoteDiscountType = linkedDiscountCode.discount_type || null;
          quoteDiscountValue = linkedDiscountCode.discount_value != null
            ? Number(linkedDiscountCode.discount_value)
            : null;
        }
      }
      const remainingAfterPayment = Number(manualContext.latestManualPayment?.data?.remaining_after_payment ?? NaN);
      const isPaidManual =
        manualContext.latestManualPayment?.data?.payment_type === 'full' ||
        (Number.isFinite(remainingAfterPayment) && remainingAfterPayment <= 0);
      const totalManualPaidAmount = manualHistory.reduce((sum, entry) => {
        const amount = Number(entry?.amount || 0);
        return sum + (Number.isFinite(amount) ? amount : 0);
      }, 0);
      const summaryPaidTotal = hasPaymentSummary && Number.isFinite(paymentState.paidAmount)
        ? Math.max(paymentState.paidAmount, 0)
        : null;
      const normalizedPaidAmount = summaryPaidTotal !== null
        ? Math.min(totalAmount, summaryPaidTotal)
        : (isPaidManual
          ? totalAmount
          : Math.min(totalAmount, Math.max(totalManualPaidAmount, 0)));
      const nonManualPaidAmount = summaryPaidTotal !== null
        ? Math.max(normalizedPaidAmount - totalManualPaidAmount, 0)
        : 0;
      const stripePaymentHistoryRows = await fetchStripePaymentReceiptRowsForBooking({
        bookingId: parsedBookingId
      });
      const totalStripeHistoryAmount = stripePaymentHistoryRows.reduce((sum, payment) => {
        const amount = Number(payment?.total_amount || 0);
        return sum + (Number.isFinite(amount) ? amount : 0);
      }, 0);

      if (stripePaymentHistoryRows.length > 0) {
        stripePaymentHistoryRows.forEach((payment) => {
          const paymentId = Number(payment.payment_id);
          const amount = Number(payment.total_amount || 0);
          if (!Number.isFinite(paymentId) || paymentId <= 0 || !Number.isFinite(amount) || amount <= 0) return;

          manualHistory.push({
            method: 'Online Payment',
            date: formatInvoiceDate(payment.created_at || paymentSummary?.updated_at || new Date()),
            sortDate: payment.created_at || paymentSummary?.updated_at || new Date(),
            amount,
            receiptUrl: buildReceiptFrontendOpenUrl({
              bookingId: parsedBookingId,
              paymentId
            }),
            receiptDownloadUrl: buildReceiptFrontendUrl({
              bookingId: parsedBookingId,
              paymentId,
              download: true
            })
          });
        });
      }

      const remainingOnlinePaidAmount = Math.max(nonManualPaidAmount - totalStripeHistoryAmount, 0);
      if (remainingOnlinePaidAmount > 0.009) {
        manualHistory.push({
          method: 'Online Payment',
          date: formatInvoiceDate(paymentSummary?.updated_at || new Date()),
          sortDate: paymentSummary?.updated_at || new Date(),
          amount: remainingOnlinePaidAmount,
          receiptUrl: booking.payment_id
            ? buildReceiptFrontendOpenUrl({
                bookingId: parsedBookingId,
                paymentId: booking.payment_id
              })
            : null,
          receiptDownloadUrl: booking.payment_id
            ? buildReceiptFrontendUrl({
                bookingId: parsedBookingId,
                paymentId: booking.payment_id,
                download: true
              })
            : null
        });
      }
      const isPaidRequestedReceipt = isReceiptRequested && pricingData?.is_paid;
      if (isPaidRequestedReceipt && manualHistory.length === 0) {
        manualHistory.push({
          method: 'Online Payment',
          date: formatInvoiceDate(paymentSummary?.updated_at || new Date()),
          sortDate: paymentSummary?.updated_at || new Date(),
          amount: totalAmount,
          receiptUrl: booking.payment_id
            ? buildReceiptFrontendOpenUrl({
                bookingId: parsedBookingId,
                paymentId: booking.payment_id
              })
            : null,
          receiptDownloadUrl: booking.payment_id
            ? buildReceiptFrontendUrl({
                bookingId: parsedBookingId,
                paymentId: booking.payment_id,
                download: true
              })
            : null
        });
      }
      const selectedManualHistory = selectedManualPayment
        ? [{
            method: String(selectedManualPayment.payment_mode || '').toLowerCase() === 'other' && String(selectedManualPayment.other_payment_mode || '').trim()
              ? String(selectedManualPayment.other_payment_mode).trim()
              : String(selectedManualPayment.payment_mode || 'manual').replace(/_/g, ' '),
            date: formatInvoiceDate(selectedManualPayment.created_at || new Date()),
            sortDate: selectedManualPayment.created_at || new Date(),
            amount: Number(selectedManualPayment.amount || 0),
            receiptUrl: buildReceiptFrontendOpenUrl({
              bookingId: parsedBookingId,
              manualPaymentId: selectedManualPayment.booking_manual_payment_id
            }),
            receiptDownloadUrl: buildReceiptFrontendUrl({
              bookingId: parsedBookingId,
              manualPaymentId: selectedManualPayment.booking_manual_payment_id,
              download: true
            })
          }]
        : null;
      const selectedManualAmount = selectedManualHistory
        ? Number(selectedManualHistory[0].amount || 0)
        : null;
      const selectedStripeHistory = selectedStripePayment
        ? [{
            method: 'Online Payment',
            date: formatInvoiceDate(selectedStripePayment.created_at || new Date()),
            sortDate: selectedStripePayment.created_at || new Date(),
            amount: Number(selectedStripePayment.total_amount || 0),
            receiptUrl: buildReceiptFrontendOpenUrl({
              bookingId: parsedBookingId,
              paymentId: selectedStripePayment.payment_id
            }),
            receiptDownloadUrl: buildReceiptFrontendUrl({
              bookingId: parsedBookingId,
              paymentId: selectedStripePayment.payment_id,
              download: true
            })
          }]
        : null;
      const selectedStripeAmount = selectedStripeHistory
        ? Number(selectedStripeHistory[0].amount || 0)
        : null;
      const receiptIsPaid =
        selectedManualHistory || selectedStripeHistory
          ? Number(selectedManualAmount ?? selectedStripeAmount ?? 0) > 0
          : (
              isPaidFromSummary ||
              isPaidManual ||
              isPaidRequestedReceipt ||
              (hasPaymentSummary && paymentState.dueAmount <= 0 && normalizedPaidAmount >= totalAmount)
            );
      const receiptPaymentHistory = selectedManualHistory || selectedStripeHistory || [...manualHistory].sort((a, b) => {
        const aTime = new Date(a?.sortDate || a?.date || 0).getTime();
        const bTime = new Date(b?.sortDate || b?.date || 0).getTime();
        return (Number.isFinite(aTime) ? aTime : 0) - (Number.isFinite(bTime) ? bTime : 0);
      });
      const receiptPaidAmount = selectedManualHistory || selectedStripeHistory
        ? Math.max(Number(selectedManualAmount ?? selectedStripeAmount ?? 0), 0)
        : normalizedPaidAmount;
      const receiptSuffix = selectedManualPayment
        ? `-${String(selectedManualPayment.booking_manual_payment_id).padStart(3, '0')}`
        : selectedStripePayment
          ? `-S${String(selectedStripePayment.payment_id).padStart(3, '0')}`
          : '';
      const isChildReceipt = Boolean(selectedManualPayment || selectedStripePayment);
      const paymentUrl = isChildReceipt
        ? null
        : await resolveHostedPaymentUrlForInvoice({
            booking,
            bookingId: parsedBookingId,
            pricingData,
            paymentState
          });
      const quoteLineItems = Array.isArray(primaryQuote?.line_items) ? primaryQuote.line_items : [];
      const pricingLineItemsTotal = sumInvoiceLineItems(lineItems);
      const quoteLineItemsTotal = sumInvoiceLineItems(quoteLineItems);
      const parentLineItems = lineItems.length > 0 ? lineItems : quoteLineItems;
      const parentSubtotal = Number(
        pricingData.subtotal != null
          ? pricingData.subtotal
          : (primaryQuote?.subtotal ?? (pricingLineItemsTotal || quoteLineItemsTotal || totalAmount))
      );
      const parentDiscountAmount = Number(
        pricingData.discount_amount != null
          ? pricingData.discount_amount
          : (primaryQuote?.discount_amount ?? quoteDiscountAmount)
      );
      const receiptItems = isChildReceipt
        ? [{
            name: `${selectedStripePayment ? 'Online' : 'Manual'} payment received`,
            quantity: 1,
            unitPrice: receiptPaidAmount,
            total: receiptPaidAmount
          }]
        : parentLineItems.map((item) => ({
            name: item.name || item.item_name || 'Item',
            quantity: Number(item.quantity || 1),
            unitPrice: (() => {
              const qty = Number(item.quantity || 1);
              const total = Number(item.total || item.line_total || 0);
              const raw = Number(item.unit_price || item.rate || 0);
              if (raw > 0) return raw;
              return qty > 0 ? total / qty : total;
            })(),
            total: Number(item.total || item.line_total || 0)
          }));
      const documentTotal = isChildReceipt ? receiptPaidAmount : totalAmount;

      const pdfBuffer = await generateManualReceiptPdfBuffer({
        documentTitle: isChildReceipt ? 'RECEIPT' : 'INVOICE',
        invoiceNumber: `INVBEIGE-M-${String(parsedBookingId).padStart(4, '0')}${receiptSuffix}`,
        invoiceDate: formatInvoiceDate(selectedManualPayment?.created_at || selectedStripePayment?.created_at || new Date()),
        receiptNumber: `RCPT-${String(parsedBookingId).padStart(6, '0')}${receiptSuffix}`,
        bookingRef: booking.project_name || `BOOKING-${parsedBookingId}`,
        projectTitle: formatProposalProjectName(booking?.project_name || ''),
        location: formatInvoiceLocation(booking?.event_location),
        isPaid: receiptIsPaid,
        clientName: linkedSalesLead?.client_name || linkedClientLead?.client_name || booking.user?.name || 'Client',
        clientEmail: linkedSalesLead?.guest_email || linkedClientLead?.guest_email || booking.user?.email || '',
        items: receiptItems,
        subtotal: isChildReceipt ? receiptPaidAmount : parentSubtotal,
        discountAmount: isChildReceipt ? 0 : parentDiscountAmount,
        discountCode: quoteDiscountCode,
        discountType: quoteDiscountType,
        discountValue: quoteDiscountValue,
        taxAmount: isChildReceipt ? 0 : Number(pricingData.tax_amount || 0),
        taxType: pricingData.tax_type || 'Tax',
        taxRate: Number(pricingData.tax_rate || 0),
        total: documentTotal,
        paidAmount: receiptPaidAmount,
        paymentUrl,
        paymentHistory: receiptPaymentHistory.length > 0
          ? receiptPaymentHistory
          : [{
              method: hasPaymentSummary ? 'Online Payment' : 'Manual',
              date: formatInvoiceDate(paymentSummary?.updated_at || new Date()),
              amount: receiptPaidAmount
            }]
      });

      const safeName = `${isChildReceipt ? 'beige-receipt' : 'beige-invoice'}-${parsedBookingId}${receiptSuffix}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `${forceDownload ? 'attachment' : 'inline'}; filename="${safeName}"`);
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
      return res.status(200).send(pdfBuffer);
    }

    const requestBaseUrl = `${req.protocol}://${req.get('host')}/v1`;
    const { invoiceDetails } = await prepareInvoiceDetailsForBooking(booking_id, req.userId || null, null, null, requestBaseUrl);

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
    const { salesQuoteId, recipientOverride } = await resolveQuoteRecipientOverrideForBooking(booking_id);
    const resolvedQuoteId = await resolveConvertedBookingSalesQuoteId(booking_id);
    const effectiveQuoteId = resolvedQuoteId || salesQuoteId || null;
    const manualContext = await getBookingManualPaymentContext(booking_id);
    const useManualReceipt = await shouldUseManualInvoiceReceipt(booking_id, manualContext);
    const requestBaseUrl = `${req.protocol}://${req.get('host')}/v1`;
    const {
      parsedBookingId,
      recipientName,
      recipientEmail,
      invoiceDetails
    } = useManualReceipt
      ? await prepareManualInvoiceDetailsForBooking(booking_id, req, recipientOverride)
      : await prepareInvoiceDetailsForBooking(
          booking_id,
          req.userId || null,
          recipientOverride,
          effectiveQuoteId,
          requestBaseUrl
        );

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
      quote_id: effectiveQuoteId,
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
        quote_id: effectiveQuoteId,
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

    const requestBaseUrl = `${req.protocol}://${req.get('host')}/v1`;
    const { invoiceDetails } = await sendInvoiceForBooking({
      bookingId,
      quoteId: salesQuote.sales_quote_id,
      performedByUserId: req.userId || null,
      requestBaseUrl,
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

    const recipientOverride = {
      email: salesQuote.client_email || null,
      name: salesQuote.client_name || null
    };
    const manualContext = await getBookingManualPaymentContext(bookingId);
    const useManualReceipt = await shouldUseManualInvoiceReceipt(bookingId, manualContext);
    const requestBaseUrl = `${req.protocol}://${req.get('host')}/v1`;
    const { invoiceDetails } = useManualReceipt
      ? await prepareManualInvoiceDetailsForBooking(bookingId, req, recipientOverride)
      : await prepareInvoiceDetailsForBooking(
          bookingId,
          req.userId || null,
          recipientOverride,
          salesQuote.sales_quote_id,
          requestBaseUrl
        );

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
