const db = require('../models');

function roundCurrency(value) {
  const numeric = Number(value || 0);
  return Number(numeric.toFixed(2));
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
    status: 'available',
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

  const normalizedUserId = Number(userId || 0) || null;
  const normalizedGuestEmail = String(guestEmail || '').trim().toLowerCase() || null;

  if (!normalizedUserId && !normalizedGuestEmail) {
    return {
      total_credit_amount: 0,
      pending_credit_amount: 0,
      available_credit_amount: 0,
      latest_credit: null
    };
  }

  const entries = await db.account_credit_ledger.findAll({
    where: {
      entry_type: 'credit_created',
      ...(normalizedUserId ? { user_id: normalizedUserId } : { guest_email: normalizedGuestEmail })
    },
    order: [['created_at', 'DESC'], ['account_credit_ledger_id', 'DESC']],
    transaction
  });

  if (!entries.length) {
    return {
      total_credit_amount: 0,
      pending_credit_amount: 0,
      available_credit_amount: 0,
      latest_credit: null
    };
  }

  const totals = entries.reduce((acc, entry) => {
    const amount = roundCurrency(entry.amount);
    acc.total_credit_amount = roundCurrency(acc.total_credit_amount + amount);

    if (entry.status === 'pending') {
      acc.pending_credit_amount = roundCurrency(acc.pending_credit_amount + amount);
    }

    if (entry.status === 'available') {
      acc.available_credit_amount = roundCurrency(acc.available_credit_amount + amount);
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
    acc.total_credit_amount = roundCurrency(acc.total_credit_amount + amount);

    if (entry.status === 'pending') {
      acc.pending_credit_amount = roundCurrency(acc.pending_credit_amount + amount);
    }

    if (entry.status === 'available') {
      acc.available_credit_amount = roundCurrency(acc.available_credit_amount + amount);
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

module.exports = {
  createCreditForQuoteReduction,
  getQuoteCreditSummary,
  getAccountCreditBalance
};
