const db = require('../models');
const { Op } = require('sequelize');

function roundCurrency(value) {
  const numeric = Number(value || 0);
  return Number(numeric.toFixed(2));
}

function buildIdentityWhere({ userId = null, guestEmail = null }) {
  const normalizedUserId = Number(userId || 0) || null;
  const normalizedGuestEmail = String(guestEmail || '').trim().toLowerCase() || null;

  if (normalizedUserId && normalizedGuestEmail) {
    return {
      [Op.or]: [
        { user_id: normalizedUserId },
        { guest_email: normalizedGuestEmail }
      ]
    };
  }

  if (normalizedUserId) {
    return { user_id: normalizedUserId };
  }

  if (normalizedGuestEmail) {
    return { guest_email: normalizedGuestEmail };
  }

  return null;
}

async function createCreditForQuoteReduction({
  salesQuoteId,
  bookingId = null,
  salesQuoteActivityId,
  userId = null,
  guestEmail = null,
  amount,
  createdByUserId = null,
  notes = null,
  transaction = null
}) {
  const creditAmount = roundCurrency(amount);

  if (!salesQuoteActivityId || !(creditAmount > 0) || !db.account_credit_ledger) {
    return null;
  }

  const existing = await db.account_credit_ledger.findOne({
    where: {
      sales_quote_activity_id: salesQuoteActivityId,
      entry_type: 'credit_created'
    },
    transaction
  });

  if (existing) {
    return existing;
  }

  return db.account_credit_ledger.create({
    user_id: userId || null,
    guest_email: guestEmail || null,
    booking_id: bookingId || null,
    sales_quote_id: salesQuoteId || null,
    sales_quote_activity_id: salesQuoteActivityId,
    amount: creditAmount,
    entry_type: 'credit_created',
    status: 'pending',
    source: 'quote_reduction',
    notes: notes || 'Account credit created from paid quote reduction',
    created_by_user_id: createdByUserId || null
  }, { transaction });
}

async function getAccountCreditBalance({
  userId = null,
  guestEmail = null,
  transaction = null
}) {
  if (!db.account_credit_ledger) {
    return null;
  }

  const identityWhere = buildIdentityWhere({ userId, guestEmail });

  if (!identityWhere) {
    return {
      total_credit_amount: 0,
      pending_credit_amount: 0,
      used_credit_amount: 0,
      reversed_credit_amount: 0,
      available_credit_amount: 0,
      latest_credit: null
    };
  }

  const entries = await db.account_credit_ledger.findAll({
    where: {
      ...identityWhere
    },
    order: [['created_at', 'DESC'], ['account_credit_ledger_id', 'DESC']],
    transaction
  });

  if (!entries.length) {
    return {
      total_credit_amount: 0,
      pending_credit_amount: 0,
      used_credit_amount: 0,
      reversed_credit_amount: 0,
      available_credit_amount: 0,
      latest_credit: null
    };
  }

  const totals = entries.reduce((acc, entry) => {
    const amount = roundCurrency(entry.amount);

    if (entry.entry_type === 'credit_created' && ['pending', 'available'].includes(entry.status)) {
      acc.total_credit_amount = roundCurrency(acc.total_credit_amount + amount);

      if (entry.status === 'pending') {
        acc.pending_credit_amount = roundCurrency(acc.pending_credit_amount + amount);
      }
    }

    if (entry.entry_type === 'credit_used') {
      acc.used_credit_amount = roundCurrency(acc.used_credit_amount + amount);
    }

    if (entry.entry_type === 'credit_reversed') {
      acc.reversed_credit_amount = roundCurrency(acc.reversed_credit_amount + amount);
    }

    return acc;
  }, {
    total_credit_amount: 0,
    pending_credit_amount: 0,
    used_credit_amount: 0,
    reversed_credit_amount: 0,
    available_credit_amount: 0
  });

  totals.available_credit_amount = roundCurrency(
    totals.total_credit_amount - totals.used_credit_amount - totals.reversed_credit_amount
  );
  if (totals.available_credit_amount < 0) {
    totals.available_credit_amount = 0;
  }

  const latestEntry = entries[0];

  return {
    ...totals,
    latest_credit: {
      account_credit_ledger_id: latestEntry.account_credit_ledger_id,
      amount: roundCurrency(latestEntry.amount),
      status: latestEntry.status,
      entry_type: latestEntry.entry_type,
      source: latestEntry.source,
      guest_email: latestEntry.guest_email || null,
      user_id: latestEntry.user_id || null,
      created_at: latestEntry.created_at || null,
      notes: latestEntry.notes || null
    }
  };
}

async function getQuoteCreditSummary({
  salesQuoteId = null,
  bookingId = null,
  transaction = null
}) {
  if (!salesQuoteId || !db.account_credit_ledger) {
    return null;
  }

  const entries = await db.account_credit_ledger.findAll({
    where: {
      sales_quote_id: salesQuoteId,
      ...(bookingId ? { booking_id: bookingId } : {}),
      source: 'quote_reduction'
    },
    order: [['created_at', 'DESC'], ['account_credit_ledger_id', 'DESC']],
    transaction
  });

  if (!entries.length) {
    return null;
  }

  const totals = entries.reduce((acc, entry) => {
    const amount = roundCurrency(entry.amount);
    if (['pending', 'available'].includes(entry.status)) {
      acc.total_credit_amount = roundCurrency(acc.total_credit_amount + amount);

      if (entry.status === 'pending') {
        acc.pending_credit_amount = roundCurrency(acc.pending_credit_amount + amount);
      }

      if (entry.status === 'available') {
        acc.available_credit_amount = roundCurrency(acc.available_credit_amount + amount);
      }
    }

    return acc;
  }, {
    total_credit_amount: 0,
    pending_credit_amount: 0,
    available_credit_amount: 0
  });

  const latestEntry = entries[0];

  return {
    ...totals,
    latest_credit: {
      account_credit_ledger_id: latestEntry.account_credit_ledger_id,
      amount: roundCurrency(latestEntry.amount),
      status: latestEntry.status,
      entry_type: latestEntry.entry_type,
      source: latestEntry.source,
      guest_email: latestEntry.guest_email || null,
      user_id: latestEntry.user_id || null,
      created_at: latestEntry.created_at || null,
      notes: latestEntry.notes || null
    }
  };
}

async function consumeAccountCreditForPayment({
  userId = null,
  guestEmail = null,
  bookingId = null,
  amount,
  paymentId = null,
  paymentIntentId = null,
  createdByUserId = null,
  transaction = null
}) {
  const requestedAmount = roundCurrency(amount);
  if (!(requestedAmount > 0) || !bookingId || !db.account_credit_ledger) {
    return null;
  }

  const identityWhere = buildIdentityWhere({ userId, guestEmail });
  if (!identityWhere) {
    return null;
  }

  const existingUsage = await db.account_credit_ledger.findOne({
    where: {
      booking_id: bookingId,
      entry_type: 'credit_used',
      source: 'payment_adjustment',
      ...identityWhere
    },
    order: [['created_at', 'DESC'], ['account_credit_ledger_id', 'DESC']],
    transaction
  });

  if (existingUsage) {
    return existingUsage;
  }

  const balance = await getAccountCreditBalance({ userId, guestEmail, transaction });
  const available = roundCurrency(balance?.available_credit_amount || 0);
  const amountToUse = roundCurrency(Math.min(requestedAmount, available));

  if (!(amountToUse > 0)) {
    return null;
  }

  const noteParts = [
    `Account credit used for booking #${bookingId}`,
    paymentId ? `payment_id=${paymentId}` : null,
    paymentIntentId ? `payment_intent_id=${paymentIntentId}` : null
  ].filter(Boolean);

  return db.account_credit_ledger.create({
    user_id: Number(userId || 0) || null,
    guest_email: String(guestEmail || '').trim().toLowerCase() || null,
    booking_id: Number(bookingId || 0) || null,
    amount: amountToUse,
    entry_type: 'credit_used',
    status: 'used',
    source: 'payment_adjustment',
    notes: noteParts.join(' | '),
    created_by_user_id: createdByUserId || null,
    approved_by_user_id: createdByUserId || null,
    approved_at: new Date()
  }, { transaction });
}

async function approveQuoteReductionCredits({
  salesQuoteId = null,
  bookingId = null,
  salesQuoteActivityId = null,
  accountCreditLedgerId = null,
  approvedByUserId = null,
  transaction = null
}) {
  if (!db.account_credit_ledger) {
    return {
      approved_count: 0,
      approved_entries: [],
      quote_credit_summary: null
    };
  }

  const where = {
    entry_type: 'credit_created',
    source: 'quote_reduction',
    status: 'pending'
  };

  if (accountCreditLedgerId) {
    where.account_credit_ledger_id = Number(accountCreditLedgerId);
  }

  if (salesQuoteActivityId) {
    where.sales_quote_activity_id = Number(salesQuoteActivityId);
  }

  if (salesQuoteId) {
    where.sales_quote_id = Number(salesQuoteId);
  }

  if (bookingId) {
    where.booking_id = Number(bookingId);
  }

  const pendingEntries = await db.account_credit_ledger.findAll({
    where,
    order: [['created_at', 'DESC'], ['account_credit_ledger_id', 'DESC']],
    transaction
  });

  if (!pendingEntries.length) {
    return {
      approved_count: 0,
      approved_entries: [],
      quote_credit_summary: salesQuoteId
        ? await getQuoteCreditSummary({ salesQuoteId, bookingId, transaction })
        : null
    };
  }

  const approvedAt = new Date();

  await db.account_credit_ledger.update({
    status: 'available',
    approved_by_user_id: approvedByUserId || null,
    approved_at: approvedAt
  }, {
    where: {
      account_credit_ledger_id: pendingEntries.map((entry) => entry.account_credit_ledger_id)
    },
    transaction
  });

  const approvedEntries = await db.account_credit_ledger.findAll({
    where: {
      account_credit_ledger_id: pendingEntries.map((entry) => entry.account_credit_ledger_id)
    },
    order: [['created_at', 'DESC'], ['account_credit_ledger_id', 'DESC']],
    transaction
  });

  const resolvedSalesQuoteId = Number(
    salesQuoteId || approvedEntries[0]?.sales_quote_id || pendingEntries[0]?.sales_quote_id || 0
  ) || null;
  const resolvedBookingId = Number(
    bookingId || approvedEntries[0]?.booking_id || pendingEntries[0]?.booking_id || 0
  ) || null;

  return {
    approved_count: approvedEntries.length,
    approved_entries: approvedEntries.map((entry) => ({
      account_credit_ledger_id: entry.account_credit_ledger_id,
      sales_quote_id: entry.sales_quote_id || null,
      booking_id: entry.booking_id || null,
      amount: roundCurrency(entry.amount),
      status: entry.status,
      approved_by_user_id: entry.approved_by_user_id || null,
      approved_at: entry.approved_at || null,
      notes: entry.notes || null
    })),
    quote_credit_summary: resolvedSalesQuoteId
      ? await getQuoteCreditSummary({
          salesQuoteId: resolvedSalesQuoteId,
          bookingId: resolvedBookingId,
          transaction
        })
      : null
  };
}

async function rejectQuoteReductionCredits({
  salesQuoteId = null,
  bookingId = null,
  salesQuoteActivityId = null,
  rejectedByUserId = null,
  notes = null,
  transaction = null
}) {
  if (!db.account_credit_ledger) {
    return {
      rejected_count: 0,
      rejected_entries: [],
      quote_credit_summary: null
    };
  }

  const where = {
    entry_type: 'credit_created',
    source: 'quote_reduction',
    status: 'pending'
  };

  if (salesQuoteId) {
    where.sales_quote_id = Number(salesQuoteId);
  }

  if (bookingId) {
    where.booking_id = Number(bookingId);
  }

  if (salesQuoteActivityId) {
    where.sales_quote_activity_id = Number(salesQuoteActivityId);
  }

  const pendingEntries = await db.account_credit_ledger.findAll({
    where,
    order: [['created_at', 'DESC'], ['account_credit_ledger_id', 'DESC']],
    transaction
  });

  if (!pendingEntries.length) {
    return {
      rejected_count: 0,
      rejected_entries: [],
      quote_credit_summary: salesQuoteId
        ? await getQuoteCreditSummary({ salesQuoteId, bookingId, transaction })
        : null
    };
  }

  const reviewedAt = new Date();
  const nextNotes = notes ? String(notes) : null;

  await db.account_credit_ledger.update({
    status: 'expired',
    approved_by_user_id: rejectedByUserId || null,
    approved_at: reviewedAt,
    ...(nextNotes ? { notes: nextNotes } : {})
  }, {
    where: {
      account_credit_ledger_id: pendingEntries.map((entry) => entry.account_credit_ledger_id)
    },
    transaction
  });

  const rejectedEntries = await db.account_credit_ledger.findAll({
    where: {
      account_credit_ledger_id: pendingEntries.map((entry) => entry.account_credit_ledger_id)
    },
    order: [['created_at', 'DESC'], ['account_credit_ledger_id', 'DESC']],
    transaction
  });

  return {
    rejected_count: rejectedEntries.length,
    rejected_entries: rejectedEntries.map((entry) => ({
      account_credit_ledger_id: entry.account_credit_ledger_id,
      sales_quote_id: entry.sales_quote_id || null,
      booking_id: entry.booking_id || null,
      amount: roundCurrency(entry.amount),
      status: entry.status,
      approved_by_user_id: entry.approved_by_user_id || null,
      approved_at: entry.approved_at || null,
      notes: entry.notes || null
    })),
    quote_credit_summary: salesQuoteId
      ? await getQuoteCreditSummary({ salesQuoteId, bookingId, transaction })
      : null
  };
}

async function getAccountCreditHistory({
  userId = null,
  guestEmail = null,
  limit = 50,
  offset = 0,
  transaction = null
}) {
  if (!db.account_credit_ledger) return [];

  const identityWhere = buildIdentityWhere({ userId, guestEmail });
  if (!identityWhere) return [];

  const safeLimit = Math.max(1, Math.min(Number(limit || 50), 200));
  const safeOffset = Math.max(0, Number(offset || 0));

  return db.account_credit_ledger.findAll({
    where: identityWhere,
    include: [{
      model: db.stream_project_booking,
      as: 'booking',
      required: false,
      attributes: ['stream_project_booking_id', 'project_name', 'event_date']
    }],
    order: [['created_at', 'DESC'], ['account_credit_ledger_id', 'DESC']],
    limit: safeLimit,
    offset: safeOffset,
    transaction
  });
}

module.exports = {
  createCreditForQuoteReduction,
  getQuoteCreditSummary,
  getAccountCreditBalance,
  consumeAccountCreditForPayment,
  getAccountCreditHistory,
  approveQuoteReductionCredits,
  rejectQuoteReductionCredits
};
