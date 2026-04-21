const { Op } = require('sequelize');
const db = require('../models');

const PAYMENT_LINK_CONTEXT = {
  BOOKING_PAYMENT: 'booking_payment',
  ADDITIONAL_QUOTE_PAYMENT: 'additional_quote_payment'
};

const INVOICE_HISTORY_TYPES = {
  INVOICE: 'invoice',
  ADDITIONAL_INVOICE: 'additional_invoice',
  RECEIPT: 'receipt'
};

const parseActivityMetadata = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
};

async function resolveSalesQuoteForBooking({ bookingId = null, quoteId = null, transaction = null } = {}) {
  const normalizedQuoteId = Number(quoteId || 0);
  if (normalizedQuoteId > 0) {
    return db.sales_quotes.findByPk(normalizedQuoteId, { transaction });
  }

  const normalizedBookingId = Number(bookingId || 0);
  if (!(normalizedBookingId > 0)) {
    return null;
  }

  const linkedLead = await db.sales_leads.findOne({
    where: { booking_id: normalizedBookingId },
    attributes: ['lead_id'],
    transaction
  });

  if (!linkedLead?.lead_id) {
    return null;
  }

  return db.sales_quotes.findOne({
    where: { lead_id: linkedLead.lead_id },
    order: [
      [db.sequelize.literal("CASE WHEN status = 'paid' THEN 0 WHEN status = 'accepted' THEN 1 WHEN status = 'partially_paid' THEN 2 WHEN status = 'sent' THEN 3 WHEN status = 'viewed' THEN 4 WHEN status = 'pending' THEN 5 ELSE 6 END"), 'ASC'],
      ['accepted_at', 'DESC'],
      ['updated_at', 'DESC'],
      ['sales_quote_id', 'DESC']
    ],
    transaction
  });
}

async function resolveAdditionalQuoteInvoiceContext({ quoteId = null, bookingId = null, transaction = null } = {}) {
  const salesQuote = await resolveSalesQuoteForBooking({ bookingId, quoteId, transaction });

  if (!salesQuote?.sales_quote_id || !db.sales_quote_activities) {
    return null;
  }

  const recentUpdateActivities = await db.sales_quote_activities.findAll({
    where: {
      sales_quote_id: salesQuote.sales_quote_id,
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

  const additionalAmount = parseFloat(refreshActivity.metadata.extra_amount || 0);
  if (!(additionalAmount > 0)) {
    return null;
  }

  const invoiceWhere = {
    quote_id: salesQuote.sales_quote_id,
    ...(bookingId ? { booking_id: bookingId } : {}),
    sent_at: { [Op.gte]: refreshActivity.activity.created_at }
  };

  if (db.invoice_send_history?.rawAttributes?.invoice_type) {
    invoiceWhere.invoice_type = INVOICE_HISTORY_TYPES.ADDITIONAL_INVOICE;
  }

  const refreshInvoiceHistory = db.invoice_send_history
    ? await db.invoice_send_history.findOne({
        where: invoiceWhere,
        order: [['sent_at', 'DESC'], ['invoice_send_history_id', 'DESC']],
        transaction
      })
    : null;

  const revisedTotal = parseFloat(refreshActivity.metadata.new_total || 0);
  const previouslyPaidAmount = parseFloat(refreshActivity.metadata.previous_total || 0);
  const paymentStatus = refreshInvoiceHistory?.payment_status || 'pending';

  return {
    quoteId: salesQuote.sales_quote_id,
    salesQuote,
    additionalAmount,
    revisedTotal,
    previouslyPaidAmount,
    label: 'Additional payment for revised quote',
    existingInvoice: refreshInvoiceHistory,
    paymentStatus,
    isPending: paymentStatus !== 'paid',
    activityCreatedAt: refreshActivity.activity.created_at
  };
}

function buildAdditionalPaymentPricingData(additionalInvoiceContext = null) {
  if (!additionalInvoiceContext) return null;

  return {
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
}

function hasPendingAdditionalQuotePayment(additionalInvoiceContext = null) {
  return Boolean(additionalInvoiceContext && additionalInvoiceContext.isPending);
}

module.exports = {
  PAYMENT_LINK_CONTEXT,
  INVOICE_HISTORY_TYPES,
  resolveSalesQuoteForBooking,
  resolveAdditionalQuoteInvoiceContext,
  buildAdditionalPaymentPricingData,
  hasPendingAdditionalQuotePayment
};
