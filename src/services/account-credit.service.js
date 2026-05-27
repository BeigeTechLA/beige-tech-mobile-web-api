const db = require('../models');
const { Op } = require('sequelize');
const notificationService = require('./notification.service');

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

function normalizeGuestEmail(email) {
  return String(email || '').trim().toLowerCase() || null;
}

function normalizeSegment(segment) {
  return String(segment || 'client').toLowerCase() === 'creator' ? 'creator' : 'client';
}

function getSegmentFilter(segment) {
  const value = String(segment || 'client').trim().toLowerCase();
  if (value === 'all') return null;
  return normalizeSegment(value);
}

function normalizeCreditSource(source, fallback = 'manual_admin') {
  const value = String(source || fallback).trim().toLowerCase();
  return ['quote_reduction', 'referral_bonus', 'loyalty_reward', 'manual_admin', 'payment_adjustment'].includes(value)
    ? value
    : fallback;
}

function normalizeCreditType(creditType, fallback = 'other') {
  const value = String(creditType || fallback).trim().toLowerCase();
  return value.replace(/[^a-z0-9_-]/g, '_').slice(0, 50) || fallback;
}

function normalizeUsageContext(context, fallback = 'general') {
  const value = String(context || fallback).trim().toLowerCase();
  return ['general', 'shoot_payment', 'studio_rental'].includes(value) ? value : fallback;
}

function parseJsonObject(value, fieldName = 'value') {
  if (value == null || value === '') return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch (error) {
      const err = new Error(`${fieldName} must be a valid JSON object`);
      err.statusCode = 400;
      throw err;
    }
  }

  const err = new Error(`${fieldName} must be a valid JSON object`);
  err.statusCode = 400;
  throw err;
}

function safeParseJsonObject(value) {
  try {
    return parseJsonObject(value);
  } catch (error) {
    return null;
  }
}

function normalizeExpiresAt(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error('expires_at must be a valid date');
    error.statusCode = 400;
    throw error;
  }
  return date;
}

function entryIsExpired(entry = {}, now = new Date()) {
  return Boolean(entry.expires_at && new Date(entry.expires_at) <= now);
}

async function syncExpiredAccountCredits({ where = {}, transaction = null } = {}) {
  if (!db.account_credit_ledger) return 0;

  const [updatedCount] = await db.account_credit_ledger.update({
    status: 'expired',
    updated_at: new Date()
  }, {
    where: {
      ...where,
      entry_type: 'credit_created',
      status: { [Op.in]: ['pending', 'available'] },
      expires_at: {
        [Op.ne]: null,
        [Op.lte]: new Date()
      }
    },
    transaction
  });

  return updatedCount;
}

function creditMatchesUsageRestrictions(entry = {}, usageContext = null) {
  if (!usageContext) return true;
  const restrictions = safeParseJsonObject(entry.restrictions_json);
  if (!restrictions) return true;

  const allowedContexts = restrictions.allowed_usage_contexts || restrictions.usage_contexts || restrictions.contexts;
  if (Array.isArray(allowedContexts) && allowedContexts.length) {
    return allowedContexts.map((item) => normalizeUsageContext(item, item)).includes(normalizeUsageContext(usageContext, usageContext));
  }

  return true;
}

function toPlain(record) {
  if (!record) return null;
  if (typeof record.get === 'function') return record.get({ plain: true });
  if (typeof record.toJSON === 'function') return record.toJSON();
  return record;
}

function parsePageParams(filters = {}) {
  const page = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 20, 1), 200);
  return { page, limit, offset: (page - 1) * limit };
}

function parseLedgerPaymentId(notes = '') {
  const match = String(notes || '').match(/payment_id=(\d+)/i);
  return match ? Number(match[1]) : null;
}

function identityKey(entry = {}) {
  if (entry.user_id) return `user:${entry.user_id}`;
  if (entry.guest_email) return `guest:${normalizeGuestEmail(entry.guest_email)}`;
  return null;
}

function collectCreditIdentityEmail(entry = {}) {
  return normalizeGuestEmail(
    entry.guest_email ||
    entry.user?.email ||
    entry.sales_quote?.client_email ||
    entry.source_entry?.sales_quote?.client_email
  );
}

async function buildCreditIdentityResolver(entries = [], transaction = null) {
  const emailSet = new Set();
  const userIdSet = new Set();

  (entries || []).forEach((row) => {
    const entry = toPlain(row) || {};
    const email = collectCreditIdentityEmail(entry);
    if (email) emailSet.add(email);
    if (entry.user_id) userIdSet.add(Number(entry.user_id));
  });

  const emailToUser = new Map();
  const userToProfile = new Map();

  if (userIdSet.size && db.users) {
    const users = await db.users.findAll({
      where: { id: { [Op.in]: [...userIdSet] } },
      attributes: ['id', 'name', 'email', 'user_type', 'role'],
      transaction
    });

    users.map(toPlain).forEach((user) => {
      if (!user?.id) return;
      userToProfile.set(Number(user.id), user);
      const email = normalizeGuestEmail(user.email);
      if (email) {
        emailSet.add(email);
        emailToUser.set(email, Number(user.id));
      }
    });
  }

  if (emailSet.size && db.users) {
    const users = await db.users.findAll({
      where: { email: { [Op.in]: [...emailSet] } },
      attributes: ['id', 'name', 'email', 'user_type', 'role'],
      transaction
    });

    users.map(toPlain).forEach((user) => {
      if (!user?.id) return;
      userToProfile.set(Number(user.id), user);
      const email = normalizeGuestEmail(user.email);
      if (email) emailToUser.set(email, Number(user.id));
    });
  }

  if (emailSet.size && db.clients) {
    const clients = await db.clients.findAll({
      where: {
        email: { [Op.in]: [...emailSet] },
        user_id: { [Op.ne]: null },
        is_active: 1
      },
      attributes: ['client_id', 'user_id', 'name', 'email'],
      transaction
    });

    clients.map(toPlain).forEach((client) => {
      const email = normalizeGuestEmail(client?.email);
      const linkedUserId = Number(client?.user_id || 0) || null;
      if (!email || !linkedUserId) return;
      emailToUser.set(email, linkedUserId);
      if (!userToProfile.has(linkedUserId)) {
        userToProfile.set(linkedUserId, {
          id: linkedUserId,
          name: client.name || null,
          email
        });
      }
    });
  }

  return function resolveCreditIdentity(entry = {}) {
    const email = collectCreditIdentityEmail(entry);
    const linkedUserId = (email && emailToUser.get(email)) || Number(entry.user_id || 0) || null;
    const userProfile = linkedUserId ? userToProfile.get(Number(linkedUserId)) : null;

    return {
      key: linkedUserId ? `user:${linkedUserId}` : identityKey(entry),
      userId: linkedUserId,
      guestEmail: email || normalizeGuestEmail(userProfile?.email),
      user: userProfile || entry.user || null
    };
  };
}

function applyEntryToTotals(totals, entry) {
  const amount = roundCurrency(entry.amount);
  const isExpired = entryIsExpired(entry);
  if (entry.entry_type === 'credit_created' && ['pending', 'available', 'expired'].includes(entry.status)) {
    totals.total_credit_amount = roundCurrency(totals.total_credit_amount + amount);
    totals.issued_credit_amount = roundCurrency((totals.issued_credit_amount || 0) + amount);
    if (entry.status === 'pending') totals.pending_credit_amount = roundCurrency(totals.pending_credit_amount + amount);
    if (entry.status === 'available' && !isExpired) totals.available_credit_amount = roundCurrency(totals.available_credit_amount + amount);
    if (entry.status === 'expired' || isExpired) {
      totals.expired_credit_amount = roundCurrency((totals.expired_credit_amount || 0) + amount);
    }
  }
  if (entry.entry_type === 'credit_used') {
    totals.used_credit_amount = roundCurrency(totals.used_credit_amount + amount);
    totals.available_credit_amount = roundCurrency(totals.available_credit_amount - amount);
  }
  if (entry.entry_type === 'credit_reversed') {
    totals.reversed_credit_amount = roundCurrency(totals.reversed_credit_amount + amount);
    totals.available_credit_amount = roundCurrency(totals.available_credit_amount - amount);
  }
  return totals;
}

function finalizeCreditTotals(totals = emptyCreditTotals()) {
  return {
    ...totals,
    total_credit_amount: roundCurrency(totals.total_credit_amount),
    issued_credit_amount: roundCurrency(totals.issued_credit_amount),
    pending_credit_amount: roundCurrency(totals.pending_credit_amount),
    used_credit_amount: roundCurrency(totals.used_credit_amount),
    reversed_credit_amount: roundCurrency(totals.reversed_credit_amount),
    expired_credit_amount: roundCurrency(totals.expired_credit_amount || 0),
    available_credit_amount: Math.max(0, roundCurrency(totals.available_credit_amount))
  };
}

function emptyCreditTotals() {
  return {
    total_credit_amount: 0,
    issued_credit_amount: 0,
    pending_credit_amount: 0,
    used_credit_amount: 0,
    reversed_credit_amount: 0,
    expired_credit_amount: 0,
    available_credit_amount: 0
  };
}

function buildLedgerIncludes() {
  return [
    {
      model: db.users,
      as: 'user',
      required: false,
      attributes: ['id', 'name', 'email', 'user_type', 'role']
    },
    {
      model: db.stream_project_booking,
      as: 'booking',
      required: false,
      attributes: ['stream_project_booking_id', 'project_name', 'event_date', 'shoot_type', 'event_type']
    },
    {
      model: db.sales_quotes,
      as: 'sales_quote',
      required: false,
      attributes: ['sales_quote_id', 'quote_number', 'client_name', 'client_email', 'total']
    },
    {
      model: db.invoice_send_history,
      as: 'invoice',
      required: false,
      attributes: ['invoice_send_history_id', 'invoice_number', 'invoice_url', 'invoice_pdf', 'payment_status']
    },
    {
      model: db.payment_transactions,
      as: 'payment',
      required: false,
      attributes: ['payment_id', 'stripe_payment_intent_id', 'status', 'total_amount']
    },
    {
      model: db.account_credit_ledger,
      as: 'source_entry',
      required: false,
      attributes: ['account_credit_ledger_id', 'sales_quote_id', 'amount', 'source', 'notes', 'created_at'],
      include: [{
        model: db.sales_quotes,
        as: 'sales_quote',
        required: false,
        attributes: ['sales_quote_id', 'quote_number', 'client_name', 'client_email']
      }]
    }
  ];
}

function formatLedgerEntry(row) {
  const entry = toPlain(row) || {};
  const isDebit = entry.entry_type === 'credit_used' || entry.entry_type === 'credit_reversed';
  const sourceQuote = entry.sales_quote || entry.source_entry?.sales_quote || null;
  const paymentId = entry.payment_id || entry.payment?.payment_id || parseLedgerPaymentId(entry.notes);

  return {
    account_credit_ledger_id: entry.account_credit_ledger_id,
    user_segment: entry.user_segment || 'client',
    user_id: entry.user_id || null,
    guest_email: entry.guest_email || null,
    client_name: entry.user?.name || sourceQuote?.client_name || null,
    client_email: entry.user?.email || entry.guest_email || sourceQuote?.client_email || null,
    direction: isDebit ? 'debit' : 'credit',
    entry_type: entry.entry_type,
    source: entry.source,
    source_type: entry.entry_type === 'credit_used'
      ? normalizeUsageContext(entry.usage_context, 'shoot_payment')
      : entry.source,
    credit_type: entry.credit_type || null,
    expires_at: entry.expires_at || null,
    is_expired: entry.status === 'expired' || entryIsExpired(entry),
    usage_context: entry.usage_context || 'general',
    status: entry.status,
    credited_amount: isDebit ? 0 : roundCurrency(entry.amount),
    used_amount: isDebit ? roundCurrency(entry.amount) : 0,
    amount: roundCurrency(entry.amount),
    remaining_balance: null,
    source_account_credit_ledger_id: entry.source_account_credit_ledger_id || null,
    source_quote_id: entry.sales_quote_id || entry.source_entry?.sales_quote_id || null,
    source_quote_number: sourceQuote?.quote_number || null,
    source_booking_id: entry.booking_id || null,
    source_booking_name: entry.booking?.project_name || null,
    invoice_id: entry.invoice_send_history_id || null,
    invoice_number: entry.invoice?.invoice_number || null,
    payment_id: paymentId || null,
    transaction_date: entry.approved_at || entry.created_at || null,
    created_at: entry.created_at || null,
    approved_at: entry.approved_at || null,
    restrictions: safeParseJsonObject(entry.restrictions_json),
    restrictions_json: entry.restrictions_json || null,
    created_by_admin: Boolean(entry.created_by_admin),
    notification_status: entry.notification_status || 'not_requested',
    notes: entry.notes || null,
    reason: entry.notes || null
  };
}

function attachRunningBalances(rows = []) {
  let balance = 0;
  const balances = new Map();
  [...rows].reverse().forEach((row) => {
    if (row.entry_type === 'credit_created' && row.status === 'available' && !row.is_expired) {
      balance = roundCurrency(balance + row.credited_amount);
    }
    if (row.entry_type === 'credit_used' || row.entry_type === 'credit_reversed') {
      balance = roundCurrency(balance - row.used_amount);
    }
    if (balance < 0) balance = 0;
    balances.set(row.account_credit_ledger_id, balance);
  });

  return rows.map((row) => ({
    ...row,
    remaining_balance: balances.get(row.account_credit_ledger_id) ?? row.remaining_balance
  }));
}

async function findLatestInvoiceForBooking(bookingId, transaction = null) {
  if (!bookingId || !db.invoice_send_history) return null;
  return db.invoice_send_history.findOne({
    where: { booking_id: bookingId },
    order: [['sent_at', 'DESC'], ['invoice_send_history_id', 'DESC']],
    transaction
  });
}

async function postAccountCreditFinanceTransaction({
  ledgerEntry,
  bookingId,
  paymentId = null,
  invoiceSendHistoryId = null,
  userId = null,
  guestEmail = null,
  amount,
  paymentIntentId = null,
  createdByUserId = null,
  usageContext = 'shoot_payment',
  transaction = null
}) {
  if (!db.finance_transactions || !(Number(amount) > 0)) return null;
  const codeSuffix = paymentId || paymentIntentId || ledgerEntry?.account_credit_ledger_id || bookingId;
  const transactionCode = `CRD-${String(bookingId || 'NOBOOK')}-${String(codeSuffix).replace(/[^A-Za-z0-9_-]/g, '')}`;

  const payload = {
    transaction_code: transactionCode,
    booking_id: bookingId || null,
    payment_id: paymentId || null,
    invoice_send_history_id: invoiceSendHistoryId || null,
    client_user_id: userId || null,
    guest_email: guestEmail || null,
    transaction_type: 'credit',
    direction: 'internal',
    source: 'account_credit',
    payment_method: 'account_credit',
    status: 'paid',
    currency: 'USD',
    gross_amount: roundCurrency(amount),
    platform_fee_amount: 0,
    creator_earnings_amount: 0,
    gateway_fee_amount: 0,
    net_amount: roundCurrency(amount),
    external_reference: paymentIntentId || null,
    transaction_date: new Date(),
    metadata_json: JSON.stringify({
      account_credit_ledger_id: ledgerEntry?.account_credit_ledger_id || null,
      usage_context: usageContext
    }),
    created_by_user_id: createdByUserId || null,
    updated_at: new Date()
  };

  const [financeTransaction] = await db.finance_transactions.findOrCreate({
    where: { transaction_code: transactionCode },
    defaults: payload,
    transaction
  });
  if (!financeTransaction.isNewRecord) {
    await financeTransaction.update(payload, { transaction });
  }

  return financeTransaction;
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

  const duplicateWhere = {
    sales_quote_id: salesQuoteId || null,
    amount: creditAmount,
    entry_type: 'credit_created',
    source: 'quote_reduction',
    status: { [Op.in]: ['pending', 'available'] }
  };

  if (bookingId) {
    duplicateWhere.booking_id = bookingId;
  }

  const duplicate = await db.account_credit_ledger.findOne({
    where: duplicateWhere,
    order: [['created_at', 'DESC'], ['account_credit_ledger_id', 'DESC']],
    transaction
  });

  if (duplicate) {
    return duplicate;
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
    credit_type: 'refund',
    usage_context: 'general',
    user_segment: 'client',
    notes: notes || 'Account credit created from paid quote reduction',
    created_by_admin: Boolean(createdByUserId),
    notification_status: 'not_requested',
    created_by_user_id: createdByUserId || null
  }, { transaction });
}

async function getAccountCreditBalance({
  userId = null,
  guestEmail = null,
  usageContext = null,
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
      expired_credit_amount: 0,
      available_credit_amount: 0,
      latest_credit: null
    };
  }

  await syncExpiredAccountCredits({ where: identityWhere, transaction });

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
      expired_credit_amount: 0,
      available_credit_amount: 0,
      latest_credit: null
    };
  }

  const totals = entries.reduce((acc, entry) => {
    const amount = roundCurrency(entry.amount);

    const isExpired = entryIsExpired(entry);
    const usableForContext = creditMatchesUsageRestrictions(entry, usageContext);

    if (entry.entry_type === 'credit_created' && ['pending', 'available', 'expired'].includes(entry.status)) {
      acc.total_credit_amount = roundCurrency(acc.total_credit_amount + amount);

      if (entry.status === 'pending') {
        acc.pending_credit_amount = roundCurrency(acc.pending_credit_amount + amount);
      }

      if (entry.status === 'available' && !isExpired && usableForContext) {
        acc.available_credit_amount = roundCurrency(acc.available_credit_amount + amount);
      }

      if (entry.status === 'expired' || isExpired) {
        acc.expired_credit_amount = roundCurrency((acc.expired_credit_amount || 0) + amount);
      }
    }

    if (entry.entry_type === 'credit_used') {
      acc.used_credit_amount = roundCurrency(acc.used_credit_amount + amount);
      acc.available_credit_amount = roundCurrency(acc.available_credit_amount - amount);
    }

    if (entry.entry_type === 'credit_reversed') {
      acc.reversed_credit_amount = roundCurrency(acc.reversed_credit_amount + amount);
      acc.available_credit_amount = roundCurrency(acc.available_credit_amount - amount);
    }

    return acc;
  }, {
    total_credit_amount: 0,
    pending_credit_amount: 0,
    used_credit_amount: 0,
    reversed_credit_amount: 0,
    expired_credit_amount: 0,
    available_credit_amount: 0
  });

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
      credit_type: latestEntry.credit_type || null,
      expires_at: latestEntry.expires_at || null,
      is_expired: latestEntry.status === 'expired' || entryIsExpired(latestEntry),
      restrictions: safeParseJsonObject(latestEntry.restrictions_json),
      notification_status: latestEntry.notification_status || 'not_requested',
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

  await syncExpiredAccountCredits({
    where: {
      sales_quote_id: salesQuoteId,
      ...(bookingId ? { booking_id: bookingId } : {}),
      source: 'quote_reduction'
    },
    transaction
  });

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
    const isExpired = entryIsExpired(entry);
    if (['pending', 'available', 'expired'].includes(entry.status)) {
      acc.total_credit_amount = roundCurrency(acc.total_credit_amount + amount);

      if (entry.status === 'pending') {
        acc.pending_credit_amount = roundCurrency(acc.pending_credit_amount + amount);
      }

      if (entry.status === 'available' && !isExpired) {
        acc.available_credit_amount = roundCurrency(acc.available_credit_amount + amount);
      }

      if (entry.status === 'expired' || isExpired) {
        acc.expired_credit_amount = roundCurrency((acc.expired_credit_amount || 0) + amount);
      }
    }

    return acc;
  }, {
    total_credit_amount: 0,
    pending_credit_amount: 0,
    expired_credit_amount: 0,
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
      credit_type: latestEntry.credit_type || null,
      expires_at: latestEntry.expires_at || null,
      is_expired: latestEntry.status === 'expired' || entryIsExpired(latestEntry),
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
  usageContext = 'shoot_payment',
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

  await syncExpiredAccountCredits({ where: identityWhere, transaction });

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

  const normalizedUsageContext = normalizeUsageContext(usageContext, 'shoot_payment');
  const balance = await getAccountCreditBalance({
    userId,
    guestEmail,
    usageContext: normalizedUsageContext,
    transaction
  });
  const available = roundCurrency(balance?.available_credit_amount || 0);
  const amountToUse = roundCurrency(Math.min(requestedAmount, available));

  if (!(amountToUse > 0)) {
    return null;
  }

  const sourceCreditEntries = await db.account_credit_ledger.findAll({
    where: {
      entry_type: 'credit_created',
      status: 'available',
      [Op.or]: [
        { expires_at: null },
        { expires_at: { [Op.gt]: new Date() } }
      ],
      ...identityWhere
    },
    order: [['approved_at', 'DESC'], ['created_at', 'DESC'], ['account_credit_ledger_id', 'DESC']],
    limit: 25,
    transaction
  });
  const sourceCreditEntry = sourceCreditEntries.find((entry) => (
    creditMatchesUsageRestrictions(toPlain(entry), normalizedUsageContext)
  )) || null;
  const invoice = await findLatestInvoiceForBooking(bookingId, transaction);

  const noteParts = [
    `Account credit used for booking #${bookingId}`,
    paymentId ? `payment_id=${paymentId}` : null,
    paymentIntentId ? `payment_intent_id=${paymentIntentId}` : null
  ].filter(Boolean);

  const ledgerEntry = await db.account_credit_ledger.create({
    user_id: Number(userId || 0) || null,
    guest_email: normalizeGuestEmail(guestEmail),
    booking_id: Number(bookingId || 0) || null,
    payment_id: Number(paymentId || 0) || null,
    invoice_send_history_id: invoice?.invoice_send_history_id || null,
    source_account_credit_ledger_id: sourceCreditEntry?.account_credit_ledger_id || null,
    sales_quote_id: sourceCreditEntry?.sales_quote_id || null,
    sales_quote_activity_id: null,
    amount: amountToUse,
    entry_type: 'credit_used',
    status: 'used',
    source: 'payment_adjustment',
    usage_context: normalizedUsageContext,
    user_segment: sourceCreditEntry?.user_segment || 'client',
    credit_type: sourceCreditEntry?.credit_type || null,
    restrictions_json: safeParseJsonObject(sourceCreditEntry?.restrictions_json),
    notes: noteParts.join(' | '),
    created_by_user_id: createdByUserId || null,
    approved_by_user_id: createdByUserId || null,
    approved_at: new Date()
  }, { transaction });

  await postAccountCreditFinanceTransaction({
    ledgerEntry,
    bookingId: Number(bookingId || 0) || null,
    paymentId: Number(paymentId || 0) || null,
    invoiceSendHistoryId: invoice?.invoice_send_history_id || null,
    userId: Number(userId || 0) || null,
    guestEmail: normalizeGuestEmail(guestEmail),
    amount: amountToUse,
    paymentIntentId,
    createdByUserId,
    usageContext: normalizedUsageContext,
    transaction
  });

  return ledgerEntry;
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

  await syncExpiredAccountCredits({ where: identityWhere, transaction });

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

async function resolveManualCreditTarget({
  userType = null,
  user_type = null,
  targetUserId = null,
  target_user_id = null,
  userId = null,
  user_id = null,
  guestEmail = null,
  guest_email = null,
  transaction = null
}) {
  const normalizedSegment = normalizeSegment(userType || user_type || 'client');
  let normalizedUserId = Number(targetUserId || target_user_id || userId || user_id || 0) || null;
  const normalizedGuestEmail = normalizeGuestEmail(guestEmail || guest_email);
  let targetUser = null;

  if (!normalizedUserId && normalizedGuestEmail && normalizedSegment === 'client') {
    const [matchedUser, matchedClient] = await Promise.all([
      db.users.findOne({
        where: { email: normalizedGuestEmail },
        attributes: ['id', 'name', 'email', 'user_type', 'role'],
        transaction
      }),
      db.clients ? db.clients.findOne({
        where: {
          email: normalizedGuestEmail,
          user_id: { [Op.ne]: null },
          is_active: 1
        },
        attributes: ['client_id', 'user_id'],
        order: [['client_id', 'ASC']],
        transaction
      }) : null
    ]);

    normalizedUserId = Number(matchedUser?.id || matchedClient?.user_id || 0) || null;
    targetUser = matchedUser || null;
  }

  if (normalizedUserId) {
    if (!targetUser || Number(targetUser.id) !== normalizedUserId) {
      targetUser = await db.users.findByPk(normalizedUserId, {
        attributes: ['id', 'name', 'email', 'user_type', 'role'],
        transaction
      });
    }

    if (!targetUser) {
      const error = new Error('Selected user was not found');
      error.statusCode = 404;
      throw error;
    }

    if (db.user_type) {
      const type = await db.user_type.findByPk(targetUser.user_type, {
        attributes: ['user_type_id', 'user_role'],
        transaction
      });
      const role = String(type?.user_role || targetUser.role || '').toLowerCase();
      if (role && ['client', 'creator'].includes(role) && role !== normalizedSegment) {
        const error = new Error(`Selected user is not a ${normalizedSegment}`);
        error.statusCode = 400;
        throw error;
      }
    }
  }

  if (!normalizedUserId && !normalizedGuestEmail) {
    const error = new Error('target_user_id, user_id, or guest_email is required');
    error.statusCode = 400;
    throw error;
  }

  return {
    userSegment: normalizedSegment,
    userId: normalizedUserId,
    guestEmail: normalizedGuestEmail || normalizeGuestEmail(targetUser?.email),
    user: targetUser ? toPlain(targetUser) : null
  };
}

async function logManualCreditAudit(ledgerEntry, payload = {}, transaction = null) {
  if (!db.activity_logs || !ledgerEntry) return null;

  return db.activity_logs.create({
    activity_type: 'admin_manual_credit_issued',
    title: 'Admin manual credit issued',
    description: JSON.stringify({
      account_credit_ledger_id: ledgerEntry.account_credit_ledger_id,
      user_id: ledgerEntry.user_id || null,
      guest_email: ledgerEntry.guest_email || null,
      user_segment: ledgerEntry.user_segment || null,
      amount: roundCurrency(ledgerEntry.amount),
      credit_type: ledgerEntry.credit_type || null,
      reason: ledgerEntry.notes || null,
      created_by_admin_user_id: payload.createdByUserId || null
    }),
    reference_id: ledgerEntry.account_credit_ledger_id,
    reference_type: 'account_credit_ledger'
  }, { transaction });
}

async function notifyManualCreditIssued(ledgerEntry, targetUser = null) {
  if (!ledgerEntry?.user_id || !notificationService?.createNotification) {
    return 'skipped';
  }

  try {
    await notificationService.createNotification(
      ledgerEntry.user_id,
      'GENERAL_MESSAGE',
      'Credit points added',
      `$${roundCurrency(ledgerEntry.amount).toFixed(2)} in Beige credit points has been added to your account.`,
      {
        force: true,
        actionUrl: '/account/credits',
        expiresAt: ledgerEntry.expires_at || null
      }
    );
    return 'sent';
  } catch (error) {
    console.error('Manual credit notification error:', error);
    return 'failed';
  }
}

async function createManualCredit({
  userId = null,
  guestEmail = null,
  amount,
  source = 'manual_admin',
  userSegment = 'client',
  userType = null,
  user_type = null,
  targetUserId = null,
  target_user_id = null,
  user_id = null,
  guest_email = null,
  creditType = null,
  credit_type = null,
  expiresAt = null,
  expires_at = null,
  reason = null,
  restrictions = null,
  usageRestrictions = null,
  usage_restrictions = null,
  restrictions_json = null,
  notifyUser = false,
  notify_user = false,
  salesQuoteId = null,
  bookingId = null,
  invoiceSendHistoryId = null,
  notes = null,
  createdByUserId = null,
  transaction = null
}) {
  const creditAmount = roundCurrency(amount);
  if (!(creditAmount > 0) || !db.account_credit_ledger) {
    const error = new Error('A positive amount is required');
    error.statusCode = 400;
    throw error;
  }

  const run = async (tx) => {
    const target = await resolveManualCreditTarget({
      userType: userType || user_type || userSegment,
      targetUserId,
      target_user_id,
      userId,
      user_id,
      guestEmail,
      guest_email,
      transaction: tx
    });
    const normalizedCreditType = normalizeCreditType(creditType || credit_type, 'other');
    const normalizedExpiresAt = normalizeExpiresAt(expiresAt || expires_at);
    const normalizedRestrictions = parseJsonObject(
      restrictions_json || usageRestrictions || usage_restrictions || restrictions,
      'restrictions_json'
    );
    const shouldNotify = Boolean(notifyUser || notify_user);
    const resolvedNotes = String(notes || reason || 'Manual account credit issued by admin').trim();

    const ledgerEntry = await db.account_credit_ledger.create({
      user_id: target.userId,
      guest_email: target.guestEmail,
      booking_id: Number(bookingId || 0) || null,
      invoice_send_history_id: Number(invoiceSendHistoryId || 0) || null,
      sales_quote_id: Number(salesQuoteId || 0) || null,
      amount: creditAmount,
      entry_type: 'credit_created',
      status: 'available',
      source: normalizeCreditSource(source, 'manual_admin'),
      credit_type: normalizedCreditType,
      expires_at: normalizedExpiresAt,
      usage_context: 'general',
      user_segment: target.userSegment,
      notes: resolvedNotes,
      restrictions_json: normalizedRestrictions,
      created_by_admin: true,
      notification_status: shouldNotify ? 'pending' : 'not_requested',
      created_by_user_id: createdByUserId || null,
      approved_by_user_id: createdByUserId || null,
      approved_at: new Date()
    }, { transaction: tx });

    await logManualCreditAudit(ledgerEntry, { createdByUserId }, tx);
    return { ledgerEntry, targetUser: target.user, shouldNotify };
  };

  const result = transaction
    ? await run(transaction)
    : await db.sequelize.transaction(run);

  // if (result.shouldNotify) {
  //   const notificationStatus = await notifyManualCreditIssued(result.ledgerEntry, result.targetUser);
  //   await result.ledgerEntry.update({ notification_status: notificationStatus });
  //   result.ledgerEntry.notification_status = notificationStatus;
  // }

  return result.ledgerEntry;
}

function buildAdminCreditWhere(filters = {}) {
  const where = {};
  const segment = getSegmentFilter(filters.segment || filters.user_segment || 'client');
  if (segment) where.user_segment = segment;

  if (filters.entry_type) where.entry_type = filters.entry_type;
  if (filters.status) where.status = filters.status;
  if (filters.source) where.source = normalizeCreditSource(filters.source, filters.source);
  if (filters.credit_type) where.credit_type = normalizeCreditType(filters.credit_type, filters.credit_type);
  if (filters.notification_status) where.notification_status = filters.notification_status;
  if (filters.usage_context) where.usage_context = normalizeUsageContext(filters.usage_context, filters.usage_context);
  const filterUserId = Number(filters.user_id || 0) || null;
  const filterGuestEmail = normalizeGuestEmail(filters.guest_email);
  if (filters.identity_or && filterUserId && filterGuestEmail) {
    where[Op.or] = [
      { user_id: filterUserId },
      { guest_email: filterGuestEmail }
    ];
  } else {
    if (filterUserId) where.user_id = filterUserId;
    if (filterGuestEmail) where.guest_email = filterGuestEmail;
  }
  if (filters.booking_id) where.booking_id = Number(filters.booking_id);
  if (filters.sales_quote_id) where.sales_quote_id = Number(filters.sales_quote_id);
  if (filters.invoice_id) where.invoice_send_history_id = Number(filters.invoice_id);
  if (filters.date_from || filters.date_to) {
    where.created_at = {};
    if (filters.date_from) where.created_at[Op.gte] = new Date(filters.date_from);
    if (filters.date_to) where.created_at[Op.lte] = new Date(filters.date_to);
  }
  if (filters.expires_from || filters.expires_to) {
    where.expires_at = {};
    if (filters.expires_from) where.expires_at[Op.gte] = new Date(filters.expires_from);
    if (filters.expires_to) where.expires_at[Op.lte] = new Date(filters.expires_to);
  }

  return where;
}

function buildClientDashboardCreditWhere({ userId = null, guestEmail = null } = {}) {
  const identityWhere = buildIdentityWhere({ userId, guestEmail });
  if (!identityWhere) return null;

  return {
    ...identityWhere,
    user_segment: 'client',
    source: { [Op.in]: ['quote_reduction', 'manual_admin', 'payment_adjustment'] },
    entry_type: { [Op.in]: ['credit_created', 'credit_used'] }
  };
}

function formatClientDashboardLedgerRow(entry) {
  const quoteId = entry.source_quote_id || null;
  const bookingId = entry.source_booking_id || null;
  const invoiceId = entry.invoice_id || null;

  return {
    account_credit_ledger_id: entry.account_credit_ledger_id,
    credit_reference: `CR-${entry.account_credit_ledger_id}`,
    direction: entry.direction,
    date: entry.transaction_date,
    amount: entry.amount,
    booking_id: bookingId,
    booking_name: entry.source_booking_name || null,
    invoice_id: invoiceId,
    invoice_number: entry.invoice_number || null,
    quote_id: quoteId,
    quote_number: entry.source_quote_number || null,
    payment_id: entry.payment_id || null,
    source: entry.source,
    transaction_type: entry.source === 'quote_reduction'
      ? 'quote_adjustment_credit'
      : entry.source === 'manual_admin'
        ? 'admin_added_credit'
        : 'shoot_payment_credit_used',
    title: entry.source === 'quote_reduction'
      ? 'Quote adjustment credit'
      : entry.source === 'manual_admin'
        ? 'Admin-added credit'
        : 'Applied to shoot payment',
    entry_type: entry.entry_type,
    status: entry.status,
    credit_type: entry.credit_type || null,
    expires_at: entry.expires_at || null,
    is_expired: entry.is_expired,
    remaining_balance: entry.remaining_balance,
    notes: entry.notes || null,
    created_at: entry.created_at,
    approved_at: entry.approved_at
  };
}

async function getClientCreditDashboard({
  userId = null,
  guestEmail = null,
  page = 1,
  limit = 20,
  expiringDays = 30,
  transaction = null
} = {}) {
  if (!db.account_credit_ledger) {
    return {
      wallet_summary: emptyCreditTotals(),
      expiring_credits: null,
      transaction_history: {
        rows: [],
        pagination: { page: 1, limit: 20, total: 0, total_pages: 0 }
      }
    };
  }

  const where = buildClientDashboardCreditWhere({ userId, guestEmail });
  if (!where) {
    const error = new Error('user_id or guest_email is required');
    error.statusCode = 400;
    throw error;
  }

  await syncExpiredAccountCredits({
    where: buildIdentityWhere({ userId, guestEmail }),
    transaction
  });

  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);
  const offset = (safePage - 1) * safeLimit;

  const [allRows, pagedResult] = await Promise.all([
    db.account_credit_ledger.findAll({
      where,
      order: [['created_at', 'DESC'], ['account_credit_ledger_id', 'DESC']],
      transaction
    }),
    db.account_credit_ledger.findAndCountAll({
      where,
      distinct: true,
      limit: safeLimit,
      offset,
      order: [['created_at', 'DESC'], ['account_credit_ledger_id', 'DESC']],
      include: buildLedgerIncludes(),
      transaction
    })
  ]);

  const plainRows = (allRows || []).map(toPlain);
  const totals = finalizeCreditTotals(plainRows.reduce((acc, row) => {
    applyEntryToTotals(acc, row);
    return acc;
  }, emptyCreditTotals()));

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const expiringUntil = new Date(now);
  expiringUntil.setDate(expiringUntil.getDate() + Math.max(parseInt(expiringDays, 10) || 30, 1));

  const earnedThisMonth = roundCurrency(plainRows
    .filter((entry) => entry.entry_type === 'credit_created' && new Date(entry.created_at) >= monthStart)
    .reduce((sum, entry) => sum + roundCurrency(entry.amount), 0));
  const usedThisMonth = roundCurrency(plainRows
    .filter((entry) => entry.entry_type === 'credit_used' && new Date(entry.created_at) >= monthStart)
    .reduce((sum, entry) => sum + roundCurrency(entry.amount), 0));
  const shootUsageRows = plainRows.filter((entry) => (
    entry.entry_type === 'credit_used' &&
    entry.source === 'payment_adjustment' &&
    entry.usage_context === 'shoot_payment'
  ));
  const shootUsageAmount = roundCurrency(shootUsageRows.reduce((sum, entry) => (
    sum + roundCurrency(entry.amount)
  ), 0));

  const expiringRows = plainRows
    .filter((entry) => (
      entry.entry_type === 'credit_created' &&
      entry.status === 'available' &&
      entry.expires_at &&
      new Date(entry.expires_at) > now &&
      new Date(entry.expires_at) <= expiringUntil
    ));

  const expiringCreditsAmount = roundCurrency(expiringRows.reduce((sum, entry) => (
    sum + roundCurrency(entry.amount)
  ), 0));

  const formattedRows = attachRunningBalances(
    pagedResult.rows.map(formatLedgerEntry)
  ).map(formatClientDashboardLedgerRow);

  return {
    overview: {
      total_points: totals.total_credit_amount,
      earned_this_month: earnedThisMonth,
      used_this_month: usedThisMonth,
      expiring_soon: expiringRows.length,
      expiring_soon_amount: expiringCreditsAmount,
      expiring_within_days: Math.max(parseInt(expiringDays, 10) || 30, 1)
    },
    wallet_summary: {
      total_points: totals.total_credit_amount,
      available_balance: totals.available_credit_amount,
      total_earned: totals.issued_credit_amount,
      total_used: totals.used_credit_amount,
      pending_points: totals.pending_credit_amount,
      expired_points: totals.expired_credit_amount,
      reversed_points: totals.reversed_credit_amount,
      currency: 'USD'
    },
    expiring_credits: expiringRows.length ? {
      amount: expiringCreditsAmount,
      count: expiringRows.length,
      within_days: Math.max(parseInt(expiringDays, 10) || 30, 1),
      next_expiring_at: expiringRows
        .map((entry) => entry.expires_at)
        .sort((a, b) => new Date(a) - new Date(b))[0]
    } : null,
    transaction_history: {
      rows: formattedRows,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: pagedResult.count,
        total_pages: Math.ceil(pagedResult.count / safeLimit),
        returned_count: formattedRows.length
      }
    },
    credit_usage_summary: {
      credits_used_in_shoots: shootUsageAmount,
      shoot_transactions_count: shootUsageRows.length,
      credits_per_shoot_avg: shootUsageRows.length
        ? roundCurrency(shootUsageAmount / shootUsageRows.length)
        : 0,
      total_value_saved: shootUsageAmount,
      currency: 'USD'
    }
  };
}

async function getAdminCreditTransactions(filters = {}) {
  if (!db.account_credit_ledger) {
    return { rows: [], pagination: { page: 1, limit: 20, total: 0, total_pages: 0 } };
  }

  const { page, limit, offset } = parsePageParams(filters);
  const where = buildAdminCreditWhere(filters);
  const search = String(filters.search || filters.q || '').trim();

  await syncExpiredAccountCredits({ where });

  if (search) {
    const term = `%${search}%`;
    const matchedUsers = await db.users.findAll({
      where: {
        [Op.or]: [
          { name: { [Op.like]: term } },
          { email: { [Op.like]: term } }
        ]
      },
      attributes: ['id']
    });
    where[Op.or] = [
      { guest_email: { [Op.like]: term } },
      { notes: { [Op.like]: term } },
      { user_id: { [Op.in]: matchedUsers.map((user) => user.id) } }
    ];
  }

  const result = await db.account_credit_ledger.findAndCountAll({
    where,
    distinct: true,
    limit,
    offset,
    order: [['created_at', 'DESC'], ['account_credit_ledger_id', 'DESC']],
    include: buildLedgerIncludes()
  });

  return {
    rows: result.rows.map(formatLedgerEntry),
    pagination: {
      page,
      limit,
      total: result.count,
      total_pages: Math.ceil(result.count / limit)
    }
  };
}

async function getAdminCreditSummary(filters = {}) {
  if (!db.account_credit_ledger) {
    return {
      total_credits_available: 0,
      total_credits_used: 0,
      total_credits_issued: 0,
      pending_credits: 0,
      active_users_holding_credits: 0,
      user_segment: getSegmentFilter(filters.segment || filters.user_segment || 'client') || 'all'
    };
  }

  const where = buildAdminCreditWhere(filters);
  delete where.entry_type;
  delete where.status;

  await syncExpiredAccountCredits({ where });

  const entries = await db.account_credit_ledger.findAll({
    where,
    order: [['created_at', 'DESC'], ['account_credit_ledger_id', 'DESC']]
  });

  const globalTotals = emptyCreditTotals();
  const identityTotals = new Map();
  const resolveCreditIdentity = await buildCreditIdentityResolver(entries);

  entries.forEach((row) => {
    const entry = toPlain(row);
    applyEntryToTotals(globalTotals, entry);
    const { key } = resolveCreditIdentity(entry);
    if (!key) return;
    if (!identityTotals.has(key)) identityTotals.set(key, emptyCreditTotals());
    applyEntryToTotals(identityTotals.get(key), entry);
  });

  const finalizedIdentityTotals = [...identityTotals.values()].map(finalizeCreditTotals);
  const dashboardTotals = finalizedIdentityTotals.reduce((acc, totals) => ({
    available_credit_amount: roundCurrency(acc.available_credit_amount + totals.available_credit_amount),
    used_credit_amount: roundCurrency(acc.used_credit_amount + totals.used_credit_amount),
    issued_credit_amount: roundCurrency(acc.issued_credit_amount + totals.issued_credit_amount),
    pending_credit_amount: roundCurrency(acc.pending_credit_amount + totals.pending_credit_amount),
    reversed_credit_amount: roundCurrency(acc.reversed_credit_amount + totals.reversed_credit_amount)
  }), {
    available_credit_amount: 0,
    used_credit_amount: 0,
    issued_credit_amount: 0,
    pending_credit_amount: 0,
    reversed_credit_amount: 0
  });

  return {
    total_credits_available: dashboardTotals.available_credit_amount,
    total_credits_used: dashboardTotals.used_credit_amount,
    total_credits_issued: dashboardTotals.issued_credit_amount,
    pending_credits: dashboardTotals.pending_credit_amount,
    reversed_credits: dashboardTotals.reversed_credit_amount,
    active_users_holding_credits: finalizedIdentityTotals.filter((totals) => totals.available_credit_amount > 0).length,
    user_segment: getSegmentFilter(filters.segment || filters.user_segment || 'client') || 'all'
  };
}

async function getAdminCreditUsers(filters = {}) {
  const where = buildAdminCreditWhere(filters);
  delete where.entry_type;
  delete where.status;
  const search = String(filters.search || filters.q || '').trim().toLowerCase();
  const { page, limit, offset } = parsePageParams(filters);

  await syncExpiredAccountCredits({ where });

  const entries = await db.account_credit_ledger.findAll({
    where,
    include: buildLedgerIncludes(),
    order: [['created_at', 'DESC'], ['account_credit_ledger_id', 'DESC']]
  });

  const usersMap = new Map();
  const resolveCreditIdentity = await buildCreditIdentityResolver(entries);
  entries.forEach((row) => {
    const entry = toPlain(row);
    const identity = resolveCreditIdentity(entry);
    const key = identity.key;
    if (!key) return;

    if (!usersMap.has(key)) {
      const identityUser = identity.user || entry.user || null;
      const identityEmail = identity.guestEmail || entry.guest_email || entry.sales_quote?.client_email || null;
      usersMap.set(key, {
        identity_key: key,
        user_segment: entry.user_segment || 'client',
        user_id: identity.userId || entry.user_id || null,
        guest_email: identityEmail,
        name: identityUser?.name || entry.user?.name || entry.sales_quote?.client_name || null,
        email: identityUser?.email || identityEmail || entry.user?.email || entry.guest_email || entry.sales_quote?.client_email || null,
        totals: emptyCreditTotals(),
        last_activity_at: entry.created_at || null,
        last_activity: null
      });
    }

    const item = usersMap.get(key);
    applyEntryToTotals(item.totals, entry);
    if (!item.last_activity || new Date(entry.created_at) > new Date(item.last_activity_at || 0)) {
      item.last_activity_at = entry.created_at || null;
      item.last_activity = formatLedgerEntry(entry);
    }
  });

  let rows = [...usersMap.values()].map((item) => {
    const totals = finalizeCreditTotals(item.totals);
    return {
      identity_key: item.identity_key,
      user_segment: item.user_segment,
      user_id: item.user_id,
      guest_email: item.guest_email,
      name: item.name || item.email || 'Guest Client',
      email: item.email,
      total_credit_points_available: totals.available_credit_amount,
      total_credits_available: totals.available_credit_amount,
      total_credit_points_used: totals.used_credit_amount,
      total_credits_used: totals.used_credit_amount,
      total_credit_points_issued: totals.issued_credit_amount,
      pending_credits: totals.pending_credit_amount,
      last_activity_at: item.last_activity_at,
      last_activity: item.last_activity
    };
  });

  if (search) {
    rows = rows.filter((row) => [
      row.name,
      row.email,
      row.guest_email,
      row.identity_key
    ].some((value) => String(value || '').toLowerCase().includes(search)));
  }

  rows.sort((a, b) => new Date(b.last_activity_at || 0) - new Date(a.last_activity_at || 0));

  return {
    rows: rows.slice(offset, offset + limit),
    pagination: {
      page,
      limit,
      total: rows.length,
      total_pages: Math.ceil(rows.length / limit)
    }
  };
}

async function getAdminCreditDashboard(filters = {}) {
  const [summary, users, transactions] = await Promise.all([
    getAdminCreditSummary(filters),
    getAdminCreditUsers(filters),
    // getAdminCreditTransactions({ ...filters, limit: filters.transaction_limit || 10 })
  ]);

  return {
    overview: {
      total_credits_available: summary.total_credits_available,
      total_credits_used: summary.total_credits_used,
      active_users_holding_credits: summary.active_users_holding_credits,
      user_segment: summary.user_segment
    },
    credit_points_history: {
      rows: users.rows.map((row) => ({
        date: row.last_activity_at,
        user_type: row.user_segment,
        user_id: row.user_id,
        guest_email: row.guest_email,
        name: row.name,
        email: row.email,
        total_credits_available: row.total_credits_available,
        total_credits_used: row.total_credits_used,
        last_activity_at: row.last_activity_at
      })),
      pagination: users.pagination
    },
    // recent_transactions: transactions.rows
  };
}

async function getAdminCreditUserDetails(filters = {}) {
  const userId = Number(filters.user_id || 0) || null;
  let guestEmail = normalizeGuestEmail(filters.guest_email);
  if (!userId && !guestEmail) {
    const error = new Error('user_id or guest_email is required');
    error.statusCode = 400;
    throw error;
  }

  let user = null;
  if (userId) {
    user = await db.users.findByPk(userId, { attributes: ['id', 'name', 'email', 'user_type', 'role'] });
    guestEmail = guestEmail || normalizeGuestEmail(user?.email);
  }

  const [summary, history] = await Promise.all([
    getAccountCreditBalance({ userId, guestEmail }),
    getAdminCreditTransactions({
      ...filters,
      user_id: userId || undefined,
      guest_email: guestEmail || undefined,
      identity_or: Boolean(userId && guestEmail),
      limit: filters.limit || 50
    })
  ]);

  return {
    user: user ? toPlain(user) : {
      id: null,
      name: history.rows[0]?.client_name || guestEmail || 'Guest Client',
      email: guestEmail
    },
    summary: {
      total_credit_points: summary?.total_credit_amount || 0,
      current_balance: summary?.available_credit_amount || 0,
      total_used: summary?.used_credit_amount || 0,
      pending_credit_amount: summary?.pending_credit_amount || 0,
      reversed_credit_amount: summary?.reversed_credit_amount || 0
    },
    ledger: {
      ...history,
      rows: attachRunningBalances(history.rows)
    }
  };
}

module.exports = {
  createCreditForQuoteReduction,
  createManualCredit,
  getQuoteCreditSummary,
  getAccountCreditBalance,
  consumeAccountCreditForPayment,
  getAccountCreditHistory,
  getClientCreditDashboard,
  approveQuoteReductionCredits,
  rejectQuoteReductionCredits,
  getAdminCreditDashboard,
  getAdminCreditSummary,
  getAdminCreditUsers,
  getAdminCreditUserDetails,
  getAdminCreditTransactions
};
