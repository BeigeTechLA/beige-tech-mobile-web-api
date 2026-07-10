const db = require('../models');
const config = require('../config/config');
const { toAbsoluteBeigeAssetUrl } = require('../utils/common');
const bookingPricingService = require('./booking-pricing.service');

const stripe = config.stripe?.secretKey
  ? require('stripe')(config.stripe.secretKey)
  : null;

const VALID_COMPENSATION_METHODS = new Set(['equal_split', 'role_based', 'manual']);
const ACTIVE_APPROVAL_STATUSES = ['pending_approval', 'approved', 'rejected'];
const OPEN_APPROVAL_STATUSES = ['pending_approval', 'approved'];
const VALID_PAYMENT_METHODS = new Set(['stripe', 'manual']);

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function parseAmountCandidate(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function stringifyMetadata(value) {
  if (!value) return null;
  try {
    return JSON.stringify(value);
  } catch (_) {
    return null;
  }
}

function getUserId(options = {}) {
  return options.userId || options.user_id || options.user?.id || options.user?.userId || null;
}

function toPlain(record) {
  if (!record) return null;
  if (typeof record.get === 'function') return record.get({ plain: true });
  if (typeof record.toJSON === 'function') return record.toJSON();
  return record;
}

function buildError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function buildPayoutRequestCode(creatorId) {
  const date = new Date();
  const yyyy = date.getFullYear();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CP-${yyyy}-${String(creatorId).padStart(5, '0')}-${random}`;
}

function buildFinanceTransactionCode(earningId) {
  const date = new Date();
  const yyyy = date.getFullYear();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CPC-${yyyy}-${String(earningId).padStart(6, '0')}-${random}`;
}

function formatDateOnly(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function addDaysDateOnly(value, days = 0) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function titleize(value) {
  return String(value || '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatShootType(booking = {}) {
  const contentType = titleize(booking.content_type || booking.event_type || '');
  const shootType = titleize(booking.shoot_type || '');

  if (shootType && contentType && shootType.toLowerCase() !== contentType.toLowerCase()) {
    return `${shootType} ${contentType}`;
  }
  return shootType || contentType || booking.project_name || null;
}

function deriveNameFromEmail(email) {
  const localPart = String(email || '').includes('@') ? String(email).split('@')[0] : '';
  const name = titleize(localPart.replace(/\b\d+\b/g, ' '));
  return name || null;
}

function buildCustomer(booking = {}) {
  const user = booking.user || {};
  const email = user.email || booking.guest_email || null;
  return {
    user_id: booking.user_id || user.id || null,
    name: user.name || deriveNameFromEmail(email),
    email,
    image: null
  };
}

function pushGroupedAuditLog(logs, action, earning, payload = {}) {
  const createdAt = payload.created_at || null;
  if (!createdAt) return;

  const key = [
    action,
    payload.performed_by_user_id || '',
    new Date(createdAt).toISOString()
  ].join('|');

  let log = logs.find((item) => item.key === key);
  if (!log) {
    log = {
      key,
      action,
      label: payload.label,
      notes: payload.notes || null,
      performed_by_user_id: payload.performed_by_user_id || null,
      created_at: createdAt,
      creator_count: 0,
      creators: []
    };
    logs.push(log);
  }

  if (!log.creators.some((creator) => Number(creator.creator_id) === Number(earning.creator_id))) {
    log.creators.push({
      creator_earning_id: earning.creator_earning_id,
      creator_id: earning.creator_id,
      creator_name: buildCreatorName(earning.creator)
    });
    log.creator_count = log.creators.length;
  }
}

function buildAuditLogs(earnings = []) {
  const logs = [];

  earnings.forEach((earning) => {
    pushGroupedAuditLog(logs, 'submitted_to_finance', earning, {
      label: 'Submitted to Finance',
      notes: earning.approval_notes || null,
      performed_by_user_id: earning.submitted_by_user_id || null,
      created_at: earning.submitted_at
    });

    pushGroupedAuditLog(logs, 'approved', earning, {
      label: 'Approved by Finance',
      notes: earning.approval_notes || null,
      performed_by_user_id: earning.approved_by_user_id || null,
      created_at: earning.approved_at
    });

    pushGroupedAuditLog(logs, 'rejected', earning, {
      label: 'Rejected by Finance',
      notes: earning.rejection_reason || earning.approval_notes || null,
      performed_by_user_id: earning.rejected_by_user_id || null,
      created_at: earning.rejected_at
    });

    (earning.timeline_events || [])
      .filter((event) => event.event_type !== 'awaiting_finance_approval')
      .forEach((event) => {
        pushGroupedAuditLog(logs, event.event_type, earning, {
          label: event.label,
          notes: event.sub_label || null,
          amount: event.amount ? toMoney(event.amount) : null,
          performed_by_user_id: null,
          created_at: event.event_date || event.created_at || null
        });
      });
  });

  return logs
    .filter((log) => log.created_at)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map(({ key, ...log }) => log);
}

function buildCreatorName(creator = null) {
  if (!creator) return null;
  return [creator.first_name, creator.last_name].filter(Boolean).join(' ').trim() || creator.email || null;
}

async function buildCompensationStatus(earnings = []) {
  if (!earnings.length) return 'draft';
  if (earnings.some((earning) => earning.approval_status === 'pending_approval')) return 'pending_approval';
  if (earnings.every((earning) => earning.approval_status === 'rejected')) return 'rejected';

  const paymentStates = await Promise.all(earnings.map((earning) => getCompensationPaymentState(earning)));
  const paidStates = paymentStates.filter((state) => state.total_compensation > 0 && state.paid_total > 0);
  if (
    paymentStates.length > 0 &&
    paymentStates.every((state) => state.total_compensation > 0 && state.remaining_balance <= 0)
  ) {
    return 'paid';
  }
  if (paidStates.some((state) => state.remaining_balance > 0)) return 'partially_paid';
  if (earnings.every((earning) => earning.approval_status === 'approved')) return 'approved';
  return 'mixed';
}

function getEarningAttemptTime(earning = {}) {
  const value = earning.submitted_at || earning.approved_at || earning.rejected_at || earning.created_at || earning.updated_at;
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getLatestEarningAttemptsByCreator(earnings = []) {
  const latestByCreator = new Map();

  earnings.forEach((earning) => {
    const creatorId = Number(earning.creator_id);
    if (!creatorId) return;

    const current = latestByCreator.get(creatorId);
    if (!current) {
      latestByCreator.set(creatorId, earning);
      return;
    }

    const currentTime = getEarningAttemptTime(current);
    const nextTime = getEarningAttemptTime(earning);
    if (
      nextTime > currentTime ||
      (nextTime === currentTime && Number(earning.creator_earning_id || 0) > Number(current.creator_earning_id || 0))
    ) {
      latestByCreator.set(creatorId, earning);
    }
  });

  return Array.from(latestByCreator.values());
}

function resolveCompensationDueDate(earnings = [], booking = {}) {
  const explicitDueDate = earnings
    .map((earning) => parseJson(earning.metadata_json, {})?.due_date || parseJson(earning.metadata_json, {})?.payout_due_date)
    .find(Boolean);

  return formatDateOnly(explicitDueDate) || addDaysDateOnly(booking.event_date, 15);
}

function getApprovalWhere(filters = {}) {
  const Op = db.Sequelize.Op;
  if (filters.approval_status && ACTIVE_APPROVAL_STATUSES.includes(filters.approval_status)) {
    return filters.approval_status;
  }
  if (filters.status && ACTIVE_APPROVAL_STATUSES.includes(filters.status)) {
    return filters.status;
  }
  return { [Op.in]: ACTIVE_APPROVAL_STATUSES };
}

function buildCompensationItems(items = []) {
  return items
    .filter((item) => Number(item.is_active) === 1)
    .map((item) => ({
      compensation_item_id: item.compensation_item_id,
      label: item.item_label,
      amount: toMoney(item.amount)
    }));
}

async function fetchBookingPaymentSummaries(bookingIds = []) {
  const ids = [...new Set(
    bookingIds
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
  )];

  if (!ids.length) return new Map();

  const rows = await db.sequelize.query(
    `
      SELECT booking_id, sales_quote_id, paid_amount, credit_used_amount, due_amount, quote_total
      FROM booking_payment_summary
      WHERE booking_id IN (:bookingIds)
    `,
    {
      replacements: { bookingIds: ids },
      type: db.Sequelize.QueryTypes.SELECT
    }
  );

  return new Map(rows.map((row) => [Number(row.booking_id), row]));
}

async function fetchShootTabBookedBookingIds() {
  const [
    bookedSalesLeads,
    bookedClientLeads,
    salesManualPaymentActivities,
    clientManualPaymentActivities,
    collectedPaymentSummaryRows
  ] = await Promise.all([
    db.sales_leads.findAll({
      where: {
        is_active: 1,
        lead_status: 'booked',
        booking_id: { [db.Sequelize.Op.ne]: null }
      },
      attributes: ['booking_id'],
      raw: true
    }),
    db.client_leads.findAll({
      where: {
        is_active: 1,
        lead_status: 'booked',
        booking_id: { [db.Sequelize.Op.ne]: null }
      },
      attributes: ['booking_id'],
      raw: true
    }),
    db.sales_lead_activities.findAll({
      where: { activity_type: 'payment_completed' },
      attributes: ['lead_id'],
      raw: true
    }),
    db.client_lead_activities.findAll({
      where: { activity_type: 'payment_completed' },
      attributes: ['lead_id'],
      raw: true
    }),
    db.sequelize.query(
      `
        SELECT booking_id
        FROM booking_payment_summary
        WHERE payment_status IN ('paid', 'partially_paid', 'approval_pending', 'no_payment_due')
          AND (
            COALESCE(paid_amount, 0) > 0
            OR COALESCE(credit_used_amount, 0) > 0
            OR payment_status = 'no_payment_due'
          )
      `,
      { type: db.Sequelize.QueryTypes.SELECT }
    )
  ]);

  const manualSalesLeadIds = [...new Set(
    salesManualPaymentActivities
      .map((row) => Number(row.lead_id))
      .filter(Number.isFinite)
  )];
  const manualClientLeadIds = [...new Set(
    clientManualPaymentActivities
      .map((row) => Number(row.lead_id))
      .filter(Number.isFinite)
  )];

  const [manualPaidSalesLeads, manualPaidClientLeads] = await Promise.all([
    manualSalesLeadIds.length
      ? db.sales_leads.findAll({
          where: {
            is_active: 1,
            lead_id: { [db.Sequelize.Op.in]: manualSalesLeadIds },
            booking_id: { [db.Sequelize.Op.ne]: null }
          },
          attributes: ['booking_id'],
          raw: true
        })
      : Promise.resolve([]),
    manualClientLeadIds.length
      ? db.client_leads.findAll({
          where: {
            is_active: 1,
            lead_id: { [db.Sequelize.Op.in]: manualClientLeadIds },
            booking_id: { [db.Sequelize.Op.ne]: null }
          },
          attributes: ['booking_id'],
          raw: true
        })
      : Promise.resolve([])
  ]);

  return [...new Set([
    ...bookedSalesLeads.map((row) => Number(row.booking_id)),
    ...bookedClientLeads.map((row) => Number(row.booking_id)),
    ...manualPaidSalesLeads.map((row) => Number(row.booking_id)),
    ...manualPaidClientLeads.map((row) => Number(row.booking_id)),
    ...collectedPaymentSummaryRows.map((row) => Number(row.booking_id))
  ].filter(Number.isFinite))];
}

function resolveShootAmount(booking = {}, breakdown = {}, paymentSummary = {}) {
  const paidAmount = Number(paymentSummary.paid_amount || 0);
  const creditUsedAmount = Number(paymentSummary.credit_used_amount || 0);
  const dueAmount = Number(paymentSummary.due_amount || 0);
  const summaryKnownTotal = paidAmount + creditUsedAmount + dueAmount;
  const amount = [
    booking.total_value_amount,
    paymentSummary.quote_total,
    summaryKnownTotal,
    booking.total_paid_amount,
    paymentSummary.paid_amount,
    breakdown.total_amount,
    booking.budget
  ].find((value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0;
  });

  return toMoney(amount || 0);
}

async function resolveBookingTotalValueAmount(booking = {}, paymentSummary = {}) {
  const bookingId = Number(booking.stream_project_booking_id || booking.booking_id || booking.id);
  const budgetAmount = parseAmountCandidate(booking.budget);

  const salesQuoteAmount = paymentSummary.sales_quote_id
    ? await db.sales_quotes.findByPk(paymentSummary.sales_quote_id, {
        attributes: ['total', 'subtotal']
      }).then((quote) => {
        if (!quote) return null;
        return parseAmountCandidate(quote.total) ?? parseAmountCandidate(quote.subtotal);
      })
    : null;

  if (salesQuoteAmount !== null && salesQuoteAmount > 0) return salesQuoteAmount;

  const linkedQuoteAmount = booking.quote_id
    ? await db.quotes.findByPk(booking.quote_id, {
        attributes: ['total', 'price_after_discount', 'subtotal']
      }).then((quote) => {
        if (!quote) return null;
        if (budgetAmount !== null && budgetAmount > 0) return budgetAmount;
        return (
          parseAmountCandidate(quote.total) ??
          parseAmountCandidate(quote.price_after_discount) ??
          parseAmountCandidate(quote.subtotal)
        );
      })
    : null;

  if (linkedQuoteAmount !== null && linkedQuoteAmount > 0) return linkedQuoteAmount;

  const bookingQuoteAmount = bookingId
    ? await db.quotes.findOne({
        where: { booking_id: bookingId },
        attributes: ['total', 'price_after_discount', 'subtotal'],
        order: [['quote_id', 'DESC']]
      }).then((quote) => {
        if (!quote) return null;
        if (budgetAmount !== null && budgetAmount > 0) return budgetAmount;
        return (
          parseAmountCandidate(quote.total) ??
          parseAmountCandidate(quote.price_after_discount) ??
          parseAmountCandidate(quote.subtotal)
        );
      })
    : null;

  if (bookingQuoteAmount !== null && bookingQuoteAmount > 0) return bookingQuoteAmount;

  const salesQuoteAmountFromLead = bookingId
    ? await db.sales_leads.findOne({
        where: { booking_id: bookingId, is_active: 1 },
        attributes: ['lead_id'],
        order: [['lead_id', 'DESC']]
      }).then((lead) => {
        if (!lead?.lead_id) return null;
        return db.sales_quotes.findOne({
          where: { lead_id: lead.lead_id },
          attributes: ['total', 'subtotal'],
          order: [['updated_at', 'DESC'], ['sales_quote_id', 'DESC']]
        });
      }).then((quote) => {
        if (!quote) return null;
        return parseAmountCandidate(quote.total) ?? parseAmountCandidate(quote.subtotal);
      })
    : null;

  if (salesQuoteAmountFromLead !== null && salesQuoteAmountFromLead > 0) return salesQuoteAmountFromLead;
  if (budgetAmount !== null && budgetAmount > 0) return budgetAmount;

  if (!bookingId) return 0;

  try {
    const bookingDays = await db.stream_project_booking_days.findAll({
      where: { stream_project_booking_id: bookingId },
      attributes: ['event_date', 'start_time', 'end_time', 'duration_hours', 'time_zone'],
      raw: true
    });
    const projectedPricing = await bookingPricingService.calculateBookingPricing({
      ...booking,
      booking_days: bookingDays
    });

    return parseAmountCandidate(projectedPricing?.total) ?? 0;
  } catch (error) {
    console.warn('[cp-compensation] booking pricing fallback failed:', {
      booking_id: bookingId,
      message: error?.message || error
    });
    return 0;
  }
}

async function resolveShootAmountLikeShoots(booking = {}, breakdown = {}, paymentSummary = {}) {
  const currentAmount = resolveShootAmount(booking, breakdown, paymentSummary);
  if (currentAmount > 0) return currentAmount;

  return toMoney(await resolveBookingTotalValueAmount(booking, paymentSummary));
}

function buildAdvances(advances = []) {
  return advances.map((advance) => ({
    advance_id: advance.advance_id,
    amount: toMoney(advance.amount),
    status: advance.status,
    processed_at: advance.processed_at,
    notes: advance.notes
  }));
}

function getProcessedAdvanceTotal(advances = []) {
  return toMoney(
    advances
      .filter((advance) => advance.status === 'processed')
      .reduce((sum, advance) => sum + Number(advance.amount || 0), 0)
  );
}

function getPaymentScope(payload = {}, amount, remainingBalance) {
  const requested = String(payload.payment_scope || payload.scope || '').trim().toLowerCase();
  if (['advance', 'final'].includes(requested)) return requested;
  return amount < remainingBalance ? 'advance' : 'final';
}

function getPaymentMethod(payload = {}) {
  const method = String(payload.payment_method || payload.payout_method || '').trim().toLowerCase();
  if (['outside_platform', 'external', 'external_payment'].includes(method)) return 'manual';
  if (!VALID_PAYMENT_METHODS.has(method)) {
    throw buildError('payment_method must be stripe, manual, or outside_platform');
  }
  return method;
}

function buildProofUrl(metadata = {}) {
  const proofUrl = metadata.proof_url || metadata.proof_file_path || null;
  if (!proofUrl) return null;
  return toAbsoluteBeigeAssetUrl(proofUrl) || String(proofUrl);
}

async function buildCpPayoutHistoryForEarnings(earnings = [], transaction = null) {
  const earningIds = earnings.map((earning) => Number(earning.creator_earning_id)).filter(Boolean);
  const creatorIds = [...new Set(earnings.map((earning) => Number(earning.creator_id)).filter(Boolean))];
  if (!earningIds.length || !creatorIds.length) return { byEarningId: new Map(), all: [] };

  const payouts = await db.creator_payout_requests.findAll({
    where: {
      creator_id: { [db.Sequelize.Op.in]: creatorIds },
      status: { [db.Sequelize.Op.in]: ['processing', 'paid'] }
    },
    order: [['paid_at', 'DESC'], ['processed_at', 'DESC'], ['created_at', 'DESC']],
    transaction
  });

  const earningById = new Map(earnings.map((earning) => [Number(earning.creator_earning_id), earning]));
  const byEarningId = new Map();
  const all = [];

  payouts.map(toPlain).forEach((payout) => {
    const metadata = parseJson(payout.metadata_json, {});
    if (metadata?.source !== 'cp_compensation') return;

    const creatorEarningId = Number(metadata.creator_earning_id);
    if (!earningById.has(creatorEarningId)) return;

    const earning = earningById.get(creatorEarningId);
    const proofUrl = buildProofUrl(metadata);
    const paymentScope = metadata.payment_scope || 'final';
    const historyItem = {
      id: payout.creator_payout_request_id,
      creator_earning_id: creatorEarningId,
      creator_id: Number(earning.creator_id),
      creator_name: buildCreatorName(earning.creator),
      cp_role: earning.creator?.primary_role || null,
      type: paymentScope === 'advance' ? 'partial_payment' : 'final_payment',
      method: metadata.payment_mode || payout.payout_method || 'manual',
      status: payout.status,
      amount: toMoney(payout.amount),
      paid_at: payout.paid_at || payout.processed_at || payout.created_at || null,
      receipt_url: proofUrl,
      receipt_download_url: proofUrl,
      transaction_reference: metadata.transaction_reference || payout.external_reference || null,
      proof_file_name: metadata.proof_file_name || null,
      notes: metadata.notes || null
    };

    if (!byEarningId.has(creatorEarningId)) byEarningId.set(creatorEarningId, []);
    byEarningId.get(creatorEarningId).push(historyItem);
    all.push(historyItem);
  });

  return { byEarningId, all };
}

function normalizeCompensationMethod(value) {
  const method = String(value || '').trim().toLowerCase();
  if (!VALID_COMPENSATION_METHODS.has(method)) {
    throw buildError('compensation_method must be equal_split, role_based, or manual');
  }
  return method;
}

function normalizeCompensationItems(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    throw buildError('items array is required');
  }

  const normalized = items.map((item) => {
    const label = String(item.label || item.item_label || '').trim();
    const amount = toMoney(item.amount);

    if (!label) throw buildError('Each compensation item requires a label');
    if (amount < 0) throw buildError('Compensation item amount cannot be negative');

    return { label, amount };
  });

  const total = toMoney(normalized.reduce((sum, item) => sum + item.amount, 0));
  if (!(total > 0)) {
    throw buildError('Total compensation must be greater than zero');
  }

  return { items: normalized, total };
}

async function getBooking(bookingId, transaction = null) {
  const booking = await db.stream_project_booking.findByPk(bookingId, { transaction });
  if (!booking) throw buildError('Booking not found', 404);
  return booking;
}

async function getAssignedCreator(bookingId, creatorId, transaction = null) {
  const assignedCreator = await db.assigned_crew.findOne({
    where: {
      project_id: bookingId,
      crew_member_id: creatorId,
      is_active: 1
    },
    transaction
  });

  if (!assignedCreator) {
    throw buildError('Creator is not assigned to this booking', 404);
  }

  return assignedCreator;
}

async function ensureCreatorEarning(bookingId, creatorId, defaults = {}, transaction = null) {
  const existing = await db.creator_earnings.findOne({
    where: {
      booking_id: bookingId,
      creator_id: creatorId,
      approval_status: { [db.Sequelize.Op.ne]: 'rejected' }
    },
    order: [['updated_at', 'DESC'], ['creator_earning_id', 'DESC']],
    transaction
  });

  if (existing) {
    return existing;
  }

  return db.creator_earnings.create({
    booking_id: bookingId,
    creator_id: creatorId,
    payment_id: defaults.payment_id || null,
    finance_transaction_id: defaults.finance_transaction_id || null,
    currency: defaults.currency || 'USD',
    gross_amount: 0,
    platform_fee_amount: 0,
    net_earning_amount: 0,
    status: 'pending',
    approval_status: 'draft',
    compensation_source: 'system',
    compensation_method: null,
    metadata_json: defaults.metadata_json || null,
    updated_at: new Date()
  }, { transaction });
}

async function listPendingCompensationShoots(filters = {}) {
  const Op = db.Sequelize.Op;
  const search = String(filters.search || '').trim();
  const bookedBookingIds = await fetchShootTabBookedBookingIds();
  const bookingWhere = {
    is_active: 1,
    is_cancelled: 0,
    [Op.or]: [
      { payment_id: { [Op.ne]: null } },
      ...(bookedBookingIds.length
        ? [{ stream_project_booking_id: { [Op.in]: bookedBookingIds } }]
        : [])
    ]
  };

  if (search) {
    const term = `%${search}%`;
    bookingWhere[Op.and] = [
      ...(bookingWhere[Op.and] || []),
      {
        [Op.or]: [
          { stream_project_booking_id: Number(term.replace(/%/g, '')) || 0 },
          { project_name: { [Op.like]: term } },
          { shoot_type: { [Op.like]: term } },
          { event_type: { [Op.like]: term } },
          { content_type: { [Op.like]: term } },
          { guest_email: { [Op.like]: term } }
        ]
      }
    ];
  }

  const bookings = await db.stream_project_booking.findAll({
    where: bookingWhere,
    subQuery: false,
    distinct: true,
    order: [['created_at', 'DESC'], ['stream_project_booking_id', 'DESC']],
    attributes: [
      'stream_project_booking_id',
      'quote_id',
      'project_name',
      'shoot_type',
      'event_type',
      'content_type',
      'event_date',
      'budget',
      'guest_email',
      'user_id',
      'created_at'
    ],
    include: [
      {
        model: db.assigned_crew,
        as: 'assigned_crews',
        required: true,
        where: { is_active: 1 },
        attributes: ['id', 'crew_member_id', 'status'],
        include: [
          {
            model: db.crew_members,
            as: 'crew_member',
            required: true,
            attributes: ['crew_member_id', 'first_name', 'last_name', 'email', 'primary_role', 'hourly_rate']
          }
        ]
      },
      {
        model: db.creator_earnings,
        as: 'creator_earnings',
        required: false,
        where: { approval_status: { [Op.in]: OPEN_APPROVAL_STATUSES } },
        attributes: ['creator_earning_id', 'creator_id', 'approval_status']
      },
      {
        model: db.finance_project_breakdowns,
        as: 'finance_breakdown',
        required: false,
        attributes: ['total_amount', 'creator_earnings_amount', 'platform_fee_amount', 'platform_fee_percent']
      },
      {
        model: db.users,
        as: 'user',
        required: false,
        attributes: ['id', 'name', 'email']
      }
    ]
  });

  const plainBookings = bookings.map(toPlain);
  const paymentSummaryByBookingId = await fetchBookingPaymentSummaries(
    plainBookings.map((booking) => booking.stream_project_booking_id)
  );

  const rows = await Promise.all(plainBookings
    .filter((booking) => !(booking.creator_earnings || []).length)
    .map(async (booking) => {
      const breakdown = booking.finance_breakdown || {};
      const paymentSummary = paymentSummaryByBookingId.get(Number(booking.stream_project_booking_id)) || {};
      const shootAmount = await resolveShootAmountLikeShoots(booking, breakdown, paymentSummary);
      const creators = (booking.assigned_crews || []).filter((assignment) => assignment.crew_member).map((assignment) => {
        const creator = assignment.crew_member || {};
        return {
          assignment_id: assignment.id,
          creator_id: creator.crew_member_id,
          creator_name: buildCreatorName(creator),
          creator_email: creator.email || null,
          cp_role: creator.primary_role || null,
          hourly_rate: toMoney(creator.hourly_rate || 0)
        };
      });

      return {
        booking_id: booking.stream_project_booking_id,
        shoot_name: booking.project_name || `Shoot #${booking.stream_project_booking_id}`,
        shoot_type: formatShootType(booking),
        content_type: booking.content_type || booking.event_type || null,
        event_date: formatDateOnly(booking.event_date),
        customer: buildCustomer(booking),
        shoot_amount: shootAmount,
        existing_cp_payout: toMoney(breakdown.creator_earnings_amount || 0),
        margin_percent: breakdown.platform_fee_percent ? toMoney(breakdown.platform_fee_percent) : null,
        creators,
        created_at: booking.created_at
      };
    }));

  return {
    rows,
    total: rows.length
  };
}

async function replaceCompensationItems(earning, items, transaction = null) {
  await db.creator_earning_compensation_items.update(
    { is_active: 0, updated_at: new Date() },
    { where: { creator_earning_id: earning.creator_earning_id }, transaction }
  );

  return db.creator_earning_compensation_items.bulkCreate(
    items.map((item) => ({
      creator_earning_id: earning.creator_earning_id,
      booking_id: earning.booking_id,
      creator_id: earning.creator_id,
      item_label: item.label,
      amount: item.amount,
      is_active: 1,
      updated_at: new Date()
    })),
    { transaction }
  );
}

async function addAdvanceIfProvided(earning, advance = null, options = {}, transaction = null) {
  const amount = toMoney(advance?.amount);
  if (!(amount > 0)) return null;
  const status = ['pending', 'processed', 'failed'].includes(advance?.status)
    ? advance.status
    : 'processed';
  const processedAt = status === 'processed'
    ? (advance.payment_date ? new Date(advance.payment_date) : new Date())
    : null;

  return db.creator_earning_advances.create({
    creator_earning_id: earning.creator_earning_id,
    booking_id: earning.booking_id,
    creator_id: earning.creator_id,
    amount,
    status,
    processed_at: processedAt,
    notes: advance.notes || null,
    created_by_user_id: getUserId(options),
    updated_at: new Date()
  }, { transaction });
}

async function ensureCreatorWallet(creatorId, options = {}) {
  const creator = await db.crew_members.findByPk(creatorId, { transaction: options.transaction || null });
  if (!creator) throw buildError('Creator not found', 404);

  const [wallet] = await db.creator_wallets.findOrCreate({
    where: { creator_id: creatorId },
    defaults: {
      creator_id: creatorId,
      currency: options.currency || 'USD',
      pending_balance: 0,
      available_balance: 0,
      reserved_balance: 0,
      lifetime_earnings: 0,
      lifetime_payouts: 0,
      last_reconciled_at: new Date()
    },
    transaction: options.transaction || null
  });

  return wallet;
}

async function postWalletTransaction({
  creatorId,
  transactionType,
  direction,
  amount,
  sourceType = null,
  sourceId = null,
  sourceReference = null,
  payoutRequestId = null,
  payoutAccountId = null,
  metadata = null,
  balanceChanges = {}
}, transaction = null) {
  const wallet = await ensureCreatorWallet(creatorId, { transaction });
  const pendingBefore = toMoney(wallet.pending_balance);
  const availableBefore = toMoney(wallet.available_balance);
  const reservedBefore = toMoney(wallet.reserved_balance);
  const lifetimeEarningsBefore = toMoney(wallet.lifetime_earnings);
  const lifetimePayoutsBefore = toMoney(wallet.lifetime_payouts);

  wallet.pending_balance = toMoney(pendingBefore + Number(balanceChanges.pending || 0));
  wallet.available_balance = toMoney(availableBefore + Number(balanceChanges.available || 0));
  wallet.reserved_balance = toMoney(reservedBefore + Number(balanceChanges.reserved || 0));
  wallet.lifetime_earnings = toMoney(lifetimeEarningsBefore + Number(balanceChanges.lifetimeEarnings || 0));
  wallet.lifetime_payouts = toMoney(lifetimePayoutsBefore + Number(balanceChanges.lifetimePayouts || 0));
  wallet.last_reconciled_at = new Date();
  wallet.updated_at = new Date();

  if (wallet.pending_balance < 0 || wallet.available_balance < 0 || wallet.reserved_balance < 0) {
    throw buildError('Wallet balance cannot go negative', 409);
  }

  await wallet.save({ transaction });

  const walletTransaction = await db.creator_payout_transactions.create({
    creator_id: creatorId,
    creator_payout_request_id: payoutRequestId,
    creator_payout_account_id: payoutAccountId,
    transaction_type: transactionType,
    direction,
    currency: wallet.currency || 'USD',
    amount,
    source_type: sourceType,
    source_id: sourceId,
    source_reference: sourceReference,
    balance_pending_after: wallet.pending_balance,
    balance_available_after: wallet.available_balance,
    balance_reserved_after: wallet.reserved_balance,
    status: 'posted',
    metadata_json: stringifyMetadata(metadata),
    updated_at: new Date()
  }, { transaction });

  return { wallet, walletTransaction };
}

async function releaseApprovedCpCompensationToWallet(earning, transaction = null) {
  const amount = toMoney(earning.net_earning_amount || earning.gross_amount || 0);
  if (!(amount > 0)) return null;

  const sourceReference = `cp:${earning.creator_earning_id}`;
  const existing = await db.creator_payout_transactions.findOne({
    where: {
      source_type: 'cp_compensation',
      source_reference: sourceReference,
      transaction_type: 'earning_released',
      status: 'posted'
    },
    transaction
  });

  if (existing) return existing;

  return postWalletTransaction({
    creatorId: earning.creator_id,
    transactionType: 'earning_released',
    direction: 'internal',
    amount,
    sourceType: 'cp_compensation',
    sourceId: earning.creator_earning_id,
    sourceReference,
    metadata: {
      booking_id: earning.booking_id,
      creator_earning_id: earning.creator_earning_id,
      approval_status: earning.approval_status
    },
    balanceChanges: {
      available: amount,
      lifetimeEarnings: amount
    }
  }, transaction);
}

async function upsertTimelineEvent(earning, eventPayload, transaction = null) {
  const existing = await db.creator_earning_timeline_events.findOne({
    where: {
      creator_earning_id: earning.creator_earning_id,
      event_type: eventPayload.event_type
    },
    transaction
  });

  const payload = {
    booking_id: earning.booking_id,
    creator_id: earning.creator_id,
    label: eventPayload.label,
    sub_label: eventPayload.sub_label || null,
    amount: eventPayload.amount || null,
    is_completed: eventPayload.is_completed ? 1 : 0,
    event_date: eventPayload.event_date || null,
    sort_order: eventPayload.sort_order || 0,
    updated_at: new Date()
  };

  if (existing) {
    await existing.update(payload, { transaction });
    return existing;
  }

  return db.creator_earning_timeline_events.create({
    creator_earning_id: earning.creator_earning_id,
    event_type: eventPayload.event_type,
    ...payload
  }, { transaction });
}

async function upsertCreatorCompensation(payload = {}, options = {}) {
  const bookingId = Number(payload.booking_id || payload.bookingId);
  const creatorId = Number(payload.creator_id || payload.creatorId);
  const userId = getUserId(options);
  const approvalStatus = options.approvalStatus;
  const compensationSource = options.compensationSource;
  const compensationMethod = normalizeCompensationMethod(payload.compensation_method);
  const normalized = normalizeCompensationItems(payload.items);

  if (!bookingId || !creatorId) {
    throw buildError('booking_id and creator_id are required');
  }
  if (!['pending_approval', 'approved'].includes(approvalStatus)) {
    throw buildError('Invalid approval status');
  }
  if (!['sales_admin', 'admin'].includes(compensationSource)) {
    throw buildError('Invalid compensation source');
  }

  const externalTransaction = options.transaction || null;
  const transaction = externalTransaction || await db.sequelize.transaction();

  try {
    const booking = await getBooking(bookingId, transaction);
    await getAssignedCreator(bookingId, creatorId, transaction);
    const earning = await ensureCreatorEarning(bookingId, creatorId, {
      payment_id: booking.payment_id || null,
      currency: 'USD'
    }, transaction);

    const now = new Date();
    const approvalPayload = approvalStatus === 'approved'
      ? {
          approval_status: 'approved',
          approved_by_user_id: userId,
          approved_at: now,
          submitted_by_user_id: userId,
          submitted_at: now,
          rejected_by_user_id: null,
          rejected_at: null,
          rejection_reason: null
        }
      : {
          approval_status: 'pending_approval',
          submitted_by_user_id: userId,
          submitted_at: now,
          approved_by_user_id: null,
          approved_at: null,
          rejected_by_user_id: null,
          rejected_at: null,
          rejection_reason: null
        };

    await replaceCompensationItems(earning, normalized.items, transaction);
    await earning.update({
      gross_amount: normalized.total,
      net_earning_amount: normalized.total,
      status: approvalStatus === 'approved' ? 'earned' : 'pending',
      compensation_source: compensationSource,
      compensation_method: compensationMethod,
      approval_notes: payload.notes || payload.approval_notes || null,
      metadata_json: stringifyMetadata({
        ...parseJson(earning.metadata_json, {}),
        rate_type: payload.rate_type || null
      }),
      ...approvalPayload,
      updated_at: now
    }, { transaction });

    const advancePayload = payload.advance && compensationSource === 'sales_admin'
      ? { ...payload.advance, status: 'pending' }
      : payload.advance;
    const advance = await addAdvanceIfProvided(earning, advancePayload, options, transaction);

    if (approvalStatus === 'approved') {
      await releaseApprovedCpCompensationToWallet(earning, transaction);
      await upsertTimelineEvent(earning, {
        event_type: 'awaiting_finance_approval',
        label: 'Finance Approval',
        sub_label: 'Approved by finance',
        is_completed: 1,
        event_date: now,
        sort_order: 5
      }, transaction);
    }

    if (approvalStatus === 'pending_approval') {
      await upsertTimelineEvent(earning, {
        event_type: 'awaiting_finance_approval',
        label: 'Awaiting Finance Approval',
        sub_label: 'Submitted for finance approval',
        is_completed: 0,
        sort_order: 5
      }, transaction);
    }

    if (!externalTransaction) await transaction.commit();

    return {
      booking_id: bookingId,
      creator_id: creatorId,
      creator_earning_id: earning.creator_earning_id,
      approval_status: approvalStatus,
      compensation_source: compensationSource,
      compensation_method: compensationMethod,
      total_compensation: normalized.total,
      items: normalized.items,
      advance
    };
  } catch (error) {
    if (!externalTransaction && transaction && !transaction.finished) {
      await transaction.rollback();
    }
    throw error;
  }
}

function normalizeBulkCompensationPayload(payload = {}) {
  const bookingId = Number(payload.booking_id || payload.bookingId);
  const creators = Array.isArray(payload.creators) && payload.creators.length
    ? payload.creators
    : [{
        creator_id: payload.creator_id || payload.creatorId,
        compensation_method: payload.compensation_method,
        rate_type: payload.rate_type,
        items: payload.items,
        advance: payload.advance,
        notes: payload.notes,
        approval_notes: payload.approval_notes
      }];

  if (!bookingId) throw buildError('booking_id is required');
  if (!creators.length) throw buildError('creators array is required');

  return creators.map((creator) => ({
    ...creator,
    booking_id: bookingId,
    creator_id: creator.creator_id || creator.creatorId,
    compensation_method: creator.compensation_method || payload.compensation_method,
    rate_type: creator.rate_type || payload.rate_type || null,
    items: creator.items,
    advance: creator.advance,
    notes: creator.notes ?? payload.notes ?? null,
    approval_notes: creator.approval_notes ?? payload.approval_notes ?? null
  }));
}

async function upsertBulkCreatorCompensations(payload = {}, options = {}) {
  const entries = normalizeBulkCompensationPayload(payload);
  const bookingId = Number(payload.booking_id || payload.bookingId);
  const externalTransaction = options.transaction || null;
  const transaction = externalTransaction || await db.sequelize.transaction();

  try {
    const creators = [];
    for (const entry of entries) {
      const result = await upsertCreatorCompensation(entry, {
        ...options,
        transaction
      });
      creators.push(result);
    }

    if (!externalTransaction) await transaction.commit();

    return {
      booking_id: bookingId,
      approval_status: options.approvalStatus,
      compensation_source: options.compensationSource,
      compensation_method: payload.compensation_method || null,
      creators
    };
  } catch (error) {
    if (!externalTransaction && transaction && !transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function listCpCompensations(filters = {}) {
  const Op = db.Sequelize.Op;
  const page = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;
  const view = String(filters.view || filters.tab || 'shoots').trim().toLowerCase();
  const where = {
    approval_status: getApprovalWhere(filters)
  };
  const bookingWhere = {};

  if (filters.booking_id) where.booking_id = Number(filters.booking_id);
  if (filters.creator_id) where.creator_id = Number(filters.creator_id);
  if (filters.search) {
    const term = `%${String(filters.search).trim()}%`;
    bookingWhere[Op.or] = [
      { project_name: { [Op.like]: term } },
      { shoot_type: { [Op.like]: term } },
      { event_type: { [Op.like]: term } },
      { content_type: { [Op.like]: term } },
      { guest_email: { [Op.like]: term } }
    ];
  }

  const result = await db.creator_earnings.findAndCountAll({
    where,
    distinct: true,
    limit,
    offset,
    order: [['updated_at', 'DESC'], ['creator_earning_id', 'DESC']],
    include: [
      {
        model: db.stream_project_booking,
        as: 'booking',
        required: Object.keys(bookingWhere).length > 0,
        where: bookingWhere,
        attributes: [
          'stream_project_booking_id',
          'quote_id',
          'project_name',
          'shoot_type',
          'event_type',
          'content_type',
          'event_date',
          'budget',
          'guest_email',
          'user_id'
        ],
        include: [
          {
            model: db.users,
            as: 'user',
            required: false,
            attributes: ['id', 'name', 'email']
          }
        ]
      },
      {
        model: db.crew_members,
        as: 'creator',
        required: false,
        attributes: ['crew_member_id', 'first_name', 'last_name', 'email', 'primary_role']
      }
    ]
  });

  const earnings = result.rows.map(toPlain);
  const bookingIds = [...new Set(earnings.map((earning) => Number(earning.booking_id)).filter(Boolean))];
  const paymentSummaryByBookingId = await fetchBookingPaymentSummaries(bookingIds);
  const breakdowns = bookingIds.length
    ? await db.finance_project_breakdowns.findAll({
        where: { booking_id: { [Op.in]: bookingIds } },
        attributes: ['booking_id', 'total_amount', 'creator_earnings_amount', 'platform_fee_amount', 'platform_fee_percent']
      })
    : [];
  const breakdownByBookingId = new Map(
    breakdowns.map((breakdown) => {
      const plain = toPlain(breakdown);
      return [Number(plain.booking_id), plain];
    })
  );

  if (view === 'creators') {
    const rows = await Promise.all(earnings.map(async (earning) => {
      const booking = earning.booking || {};
      const bookingId = Number(earning.booking_id);
      const breakdown = breakdownByBookingId.get(bookingId) || {};
      const paymentSummary = paymentSummaryByBookingId.get(bookingId) || {};
      const shootAmount = await resolveShootAmountLikeShoots(booking, breakdown, paymentSummary);
      const cpPayout = toMoney(earning.net_earning_amount || earning.gross_amount || 0);
      const marginAmount = toMoney(Math.max(shootAmount - cpPayout, 0));
      const marginPercent = shootAmount > 0 ? toMoney((marginAmount / shootAmount) * 100) : null;
      const status = await buildCompensationStatus([earning]);

      return {
        creator_earning_id: earning.creator_earning_id,
        booking_id: bookingId,
        creator_id: earning.creator_id,
        creator_name: buildCreatorName(earning.creator),
        creator_email: earning.creator?.email || null,
        cp_role: earning.creator?.primary_role || null,
        shoot_name: booking.project_name || `Shoot #${bookingId}`,
        shoot_type: formatShootType(booking),
        content_type: booking.content_type || booking.event_type || null,
        event_date: formatDateOnly(booking.event_date),
        customer: buildCustomer(booking),
        shoot_amount: shootAmount,
        cp_payout: cpPayout,
        margin_amount: marginAmount,
        margin_percent: marginPercent,
        status,
        earning_status: earning.status,
        compensation_source: earning.compensation_source,
        compensation_method: earning.compensation_method,
        due_date: resolveCompensationDueDate([earning], booking),
        latest_activity_at: earning.updated_at || earning.created_at || null
      };
    }));

    return {
      view: 'creators',
      rows,
      pagination: {
        page,
        limit,
        total: result.count,
        total_pages: Math.ceil(result.count / limit)
      }
    };
  }

  const grouped = new Map();

  earnings.forEach((earning) => {
    const bookingId = Number(earning.booking_id);
    if (!grouped.has(bookingId)) {
      grouped.set(bookingId, []);
    }
    grouped.get(bookingId).push(earning);
  });

  const rows = await Promise.all(Array.from(grouped.entries()).map(async ([bookingId, bookingEarnings]) => {
    const booking = bookingEarnings[0].booking || {};
    const breakdown = breakdownByBookingId.get(bookingId) || {};
    const paymentSummary = paymentSummaryByBookingId.get(bookingId) || {};
    const latestEarnings = getLatestEarningAttemptsByCreator(bookingEarnings);
    const cpPayout = toMoney(latestEarnings.reduce((sum, earning) => sum + Number(earning.net_earning_amount || 0), 0));
    const shootAmount = await resolveShootAmountLikeShoots(booking, breakdown, paymentSummary);
    const marginAmount = toMoney(Math.max(shootAmount - cpPayout, 0));
    const marginPercent = shootAmount > 0 ? toMoney((marginAmount / shootAmount) * 100) : null;

    return {
      booking_id: bookingId,
      shoot_name: booking.project_name || `Shoot #${bookingId}`,
      shoot_type: formatShootType(booking),
      content_type: booking.content_type || booking.event_type || null,
      event_date: formatDateOnly(booking.event_date),
      customer: buildCustomer(booking),
      total_cps: latestEarnings.length,
      cp_payout: cpPayout,
      shoot_amount: shootAmount,
      due_date: resolveCompensationDueDate(latestEarnings, booking),
      margin_amount: marginAmount,
      margin_percent: marginPercent,
      status: await buildCompensationStatus(latestEarnings),
      latest_activity_at: bookingEarnings[0].updated_at || bookingEarnings[0].created_at || null
    };
  }));

  return {
    view: 'shoots',
    rows,
    pagination: {
      page,
      limit,
      total: result.count,
      total_pages: Math.ceil(result.count / limit)
    }
  };
}

async function getCpCompensationDetails(bookingId) {
  const Op = db.Sequelize.Op;
  const booking = await db.stream_project_booking.findByPk(bookingId, {
    attributes: [
      'stream_project_booking_id',
      'quote_id',
      'project_name',
      'shoot_type',
      'event_type',
      'content_type',
      'event_date',
      'budget',
      'event_location',
      'guest_email',
      'user_id'
    ],
    include: [
      {
        model: db.users,
        as: 'user',
        required: false,
        attributes: ['id', 'name', 'email']
      },
      {
        model: db.creator_earnings,
        as: 'creator_earnings',
        required: false,
        where: { approval_status: { [Op.in]: ACTIVE_APPROVAL_STATUSES } },
        include: [
          {
            model: db.crew_members,
            as: 'creator',
            required: false,
            attributes: ['crew_member_id', 'first_name', 'last_name', 'email', 'primary_role']
          },
          {
            model: db.creator_earning_compensation_items,
            as: 'compensation_items',
            required: false
          },
          {
            model: db.creator_earning_advances,
            as: 'advances',
            required: false
          },
          {
            model: db.creator_earning_timeline_events,
            as: 'timeline_events',
            required: false
          }
        ]
      },
      {
        model: db.finance_project_breakdowns,
        as: 'finance_breakdown',
        required: false
      }
    ]
  });

  if (!booking) throw buildError('Booking not found', 404);

  const plain = toPlain(booking);
  const earnings = plain.creator_earnings || [];
  const latestEarnings = getLatestEarningAttemptsByCreator(earnings);
  const breakdown = plain.finance_breakdown || {};
  const paymentSummaryByBookingId = await fetchBookingPaymentSummaries([bookingId]);
  const paymentSummary = paymentSummaryByBookingId.get(Number(bookingId)) || {};
  const totalCpPayout = toMoney(latestEarnings.reduce((sum, earning) => sum + Number(earning.net_earning_amount || 0), 0));
  const shootAmount = await resolveShootAmountLikeShoots(plain, breakdown, paymentSummary);
  const marginAmount = toMoney(Math.max(shootAmount - totalCpPayout, 0));
  const marginPercent = shootAmount > 0 ? toMoney((marginAmount / shootAmount) * 100) : null;
  const paymentHistory = await buildCpPayoutHistoryForEarnings(earnings);

  return {
    booking_id: plain.stream_project_booking_id,
    shoot_name: plain.project_name || `Shoot #${plain.stream_project_booking_id}`,
    shoot_type: formatShootType(plain),
    content_type: plain.content_type || plain.event_type || null,
    event_date: formatDateOnly(plain.event_date),
    event_location: plain.event_location || null,
    customer: buildCustomer(plain),
    summary: {
      total_cp_payout: totalCpPayout,
      shoot_amount: shootAmount,
      margin_amount: marginAmount,
      margin_percent: marginPercent,
      status: await buildCompensationStatus(latestEarnings)
    },
    payment_history: paymentHistory.all,
    audit_logs: buildAuditLogs(earnings),
    creators: await Promise.all(earnings.map(async (earning) => {
      const compensationItems = buildCompensationItems(earning.compensation_items || []);
      const advanceItems = buildAdvances(earning.advances || []);
      const totalCompensation = toMoney(earning.net_earning_amount || earning.gross_amount || 0);
      const paymentState = await getCompensationPaymentState(earning);

      return {
        creator_earning_id: earning.creator_earning_id,
        creator_id: earning.creator_id,
        creator_name: buildCreatorName(earning.creator),
        creator_email: earning.creator?.email || null,
        cp_role: earning.creator?.primary_role || null,
        compensation_method: earning.compensation_method,
        compensation_source: earning.compensation_source,
        approval_status: earning.approval_status,
        earning_status: earning.status,
        total_compensation: totalCompensation,
        advance_paid: paymentState.advance_paid,
        paid_total: paymentState.paid_total,
        remaining_balance: paymentState.remaining_balance,
        compensation_items: compensationItems,
        advances: advanceItems,
        payment_history: paymentHistory.byEarningId.get(Number(earning.creator_earning_id)) || [],
        timeline: (earning.timeline_events || [])
          .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
          .map((event) => ({
            timeline_event_id: event.timeline_event_id,
            event_type: event.event_type,
            label: event.label,
            sub_label: event.sub_label,
            amount: event.amount ? toMoney(event.amount) : null,
            is_completed: Boolean(event.is_completed),
            event_date: event.event_date || null,
            sort_order: event.sort_order
          })),
        submitted_by_user_id: earning.submitted_by_user_id,
        due_date: resolveCompensationDueDate([earning], plain),
        submitted_at: earning.submitted_at,
        approved_by_user_id: earning.approved_by_user_id,
        approved_at: earning.approved_at,
        rejected_by_user_id: earning.rejected_by_user_id,
        rejected_at: earning.rejected_at,
        rejection_reason: earning.rejection_reason,
        approval_notes: earning.approval_notes
      };
    }))
  };
}

async function getCreatorEarningForReview(creatorEarningId, transaction = null) {
  const earning = await db.creator_earnings.findByPk(creatorEarningId, { transaction });
  if (!earning) throw buildError('Creator earning not found', 404);
  if (!ACTIVE_APPROVAL_STATUSES.includes(earning.approval_status)) {
    throw buildError('Creator earning does not have submitted compensation', 409);
  }
  return earning;
}

async function getCpPayoutTotalForEarning(earning, transaction = null) {
  const payoutRows = await db.creator_payout_requests.findAll({
    where: {
      creator_id: earning.creator_id,
      status: { [db.Sequelize.Op.in]: ['requested', 'approved', 'processing', 'paid'] }
    },
    transaction
  });

  return toMoney(payoutRows.reduce((sum, payout) => {
    const metadata = parseJson(payout.metadata_json, {});
    if (
      metadata?.source === 'cp_compensation' &&
      Number(metadata.creator_earning_id) === Number(earning.creator_earning_id)
    ) {
      return sum + Number(payout.amount || 0);
    }
    return sum;
  }, 0));
}

async function getCompensationPaymentState(earning, transaction = null) {
  const advances = await db.creator_earning_advances.findAll({
    where: {
      creator_earning_id: earning.creator_earning_id,
      status: 'processed'
    },
    transaction
  });
  const totalCompensation = toMoney(earning.net_earning_amount || earning.gross_amount || 0);
  const advanceTotal = getProcessedAdvanceTotal(advances.map(toPlain));
  const payoutTotal = await getCpPayoutTotalForEarning(earning, transaction);
  const paidTotal = toMoney(Math.max(advanceTotal, payoutTotal));

  return {
    total_compensation: totalCompensation,
    advance_paid: advanceTotal,
    payout_paid: payoutTotal,
    paid_total: paidTotal,
    remaining_balance: toMoney(Math.max(totalCompensation - paidTotal, 0))
  };
}

async function getStripePayoutAccount(creatorId, transaction = null) {
  const account = await db.creator_payout_accounts.findOne({
    where: {
      creator_id: creatorId,
      payout_method: 'stripe',
      status: 'verified'
    },
    order: [['is_default', 'DESC'], ['creator_payout_account_id', 'DESC']],
    transaction
  });

  if (!account?.stripe_account_id) {
    throw buildError('Creator does not have a verified Stripe payout account connected', 409);
  }

  return account;
}

async function createStripeTransfer({ amount, currency, stripeAccountId, earning, payoutRequest }) {
  if (!stripe) {
    throw buildError('Stripe is not configured for creator payouts', 503);
  }

  return stripe.transfers.create({
    amount: Math.round(amount * 100),
    currency: String(currency || 'USD').toLowerCase(),
    destination: stripeAccountId,
    metadata: {
      source: 'cp_compensation',
      creator_earning_id: String(earning.creator_earning_id),
      booking_id: String(earning.booking_id),
      creator_id: String(earning.creator_id),
      payout_request_id: String(payoutRequest.creator_payout_request_id)
    }
  });
}

async function createCpPayoutRecords({
  earning,
  amount,
  paymentMethod,
  paymentScope,
  payoutAccount = null,
  externalReference = null,
  payload = {},
  userId = null
}, transaction = null) {
  const now = new Date();
  const payoutRequest = await db.creator_payout_requests.create({
    request_code: buildPayoutRequestCode(earning.creator_id),
    creator_id: earning.creator_id,
    creator_payout_account_id: payoutAccount?.creator_payout_account_id || null,
    currency: earning.currency || payload.currency || 'USD',
    amount,
    payout_method: paymentMethod === 'stripe' ? 'stripe' : 'manual',
    status: paymentMethod === 'stripe' ? 'processing' : 'paid',
    external_reference: externalReference,
    requested_at: now,
    approved_by_user_id: userId,
    approved_at: now,
    processed_by_user_id: userId,
    processed_at: now,
    paid_at: paymentMethod === 'manual' ? (payload.paid_at ? new Date(payload.paid_at) : now) : null,
    metadata_json: stringifyMetadata({
      source: 'cp_compensation',
      creator_earning_id: earning.creator_earning_id,
      booking_id: earning.booking_id,
      payment_scope: paymentScope,
      payment_mode: payload.payment_mode || payload.payment_type || null,
      transaction_reference: payload.transaction_reference || payload.external_reference || null,
      proof_url: payload.proof_url || null,
      proof_file_path: payload.proof_file_path || null,
      proof_file_name: payload.proof_file_name || null,
      notes: payload.notes || null
    }),
    updated_at: now
  }, { transaction });

  await postWalletTransaction({
    creatorId: earning.creator_id,
    transactionType: 'payout_requested',
    direction: 'debit',
    amount,
    payoutRequestId: payoutRequest.creator_payout_request_id,
    payoutAccountId: payoutAccount?.creator_payout_account_id || null,
    sourceType: 'cp_compensation_payout',
    sourceId: payoutRequest.creator_payout_request_id,
    sourceReference: payoutRequest.request_code,
    metadata: {
      creator_earning_id: earning.creator_earning_id,
      booking_id: earning.booking_id,
      payment_scope: paymentScope,
      payment_method: paymentMethod
    },
    balanceChanges: { available: -amount }
  }, transaction);

  return payoutRequest;
}

async function finalizeCpPayout({
  earning,
  payoutRequest,
  amount,
  paymentMethod,
  paymentScope,
  externalReference = null,
  payload = {},
  userId = null
}, transaction = null) {
  const paidAt = payload.paid_at ? new Date(payload.paid_at) : new Date();
  const metadata = parseJson(payoutRequest.metadata_json, {});

  const financeTransaction = await db.finance_transactions.create({
    transaction_code: buildFinanceTransactionCode(earning.creator_earning_id),
    booking_id: earning.booking_id,
    transaction_type: 'creator_earning',
    direction: 'outflow',
    source: paymentMethod === 'stripe' ? 'stripe' : 'manual',
    payment_method: paymentMethod === 'stripe' ? 'stripe' : (payload.payment_mode || 'manual'),
    status: 'paid',
    currency: earning.currency || 'USD',
    gross_amount: amount,
    platform_fee_amount: 0,
    creator_earnings_amount: amount,
    gateway_fee_amount: 0,
    net_amount: amount,
    external_reference: externalReference || payload.transaction_reference || payload.external_reference || null,
    transaction_date: paidAt,
    metadata_json: stringifyMetadata({
      ...metadata,
      payout_request_id: payoutRequest.creator_payout_request_id,
      payment_method: paymentMethod
    }),
    created_by_user_id: userId,
    updated_at: new Date()
  }, { transaction });

  await payoutRequest.update({
    status: 'paid',
    external_reference: externalReference || payload.transaction_reference || payload.external_reference || null,
    paid_at: paidAt,
    metadata_json: stringifyMetadata({
      ...metadata,
      finance_transaction_id: financeTransaction.finance_transaction_id,
      stripe_transfer_id: paymentMethod === 'stripe' ? externalReference : null
    }),
    updated_at: new Date()
  }, { transaction });

  await postWalletTransaction({
    creatorId: earning.creator_id,
    transactionType: 'payout_paid',
    direction: 'debit',
    amount,
    payoutRequestId: payoutRequest.creator_payout_request_id,
    payoutAccountId: payoutRequest.creator_payout_account_id || null,
    sourceType: 'cp_compensation_payout',
    sourceId: payoutRequest.creator_payout_request_id,
    sourceReference: payoutRequest.request_code,
    metadata: {
      creator_earning_id: earning.creator_earning_id,
      booking_id: earning.booking_id,
      payment_scope: paymentScope,
      payment_method: paymentMethod,
      finance_transaction_id: financeTransaction.finance_transaction_id
    },
    balanceChanges: { lifetimePayouts: amount }
  }, transaction);

  return financeTransaction;
}

async function approveCompensation(creatorEarningId, payload = {}, options = {}) {
  const userId = getUserId(options);
  const transaction = options.transaction || await db.sequelize.transaction();
  const externalTransaction = Boolean(options.transaction);

  try {
    const earning = await getCreatorEarningForReview(creatorEarningId, transaction);
    if (earning.approval_status === 'approved') {
      throw buildError('CP compensation is already approved', 409);
    }

    const now = new Date();
    await earning.update({
      approval_status: 'approved',
      status: 'earned',
      approved_by_user_id: userId,
      approved_at: now,
      rejected_by_user_id: null,
      rejected_at: null,
      rejection_reason: null,
      approval_notes: payload.notes || payload.approval_notes || earning.approval_notes || null,
      updated_at: now
    }, { transaction });

    await releaseApprovedCpCompensationToWallet(earning, transaction);

    await upsertTimelineEvent(earning, {
      event_type: 'awaiting_finance_approval',
      label: 'Finance Approval',
      sub_label: 'Approved by finance',
      is_completed: 1,
      event_date: now,
      sort_order: 5
    }, transaction);

    if (!externalTransaction) await transaction.commit();

    return {
      creator_earning_id: earning.creator_earning_id,
      booking_id: earning.booking_id,
      creator_id: earning.creator_id,
      approval_status: 'approved',
      earning_status: 'earned',
      approved_by_user_id: userId,
      approved_at: now
    };
  } catch (error) {
    if (!externalTransaction && transaction && !transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function rejectCompensation(creatorEarningId, payload = {}, options = {}) {
  const reason = String(payload.rejection_reason || payload.reason || payload.notes || '').trim();
  if (!reason) throw buildError('rejection_reason is required');

  const userId = getUserId(options);
  const transaction = options.transaction || await db.sequelize.transaction();
  const externalTransaction = Boolean(options.transaction);

  try {
    const earning = await getCreatorEarningForReview(creatorEarningId, transaction);
    if (earning.approval_status === 'rejected') {
      throw buildError('CP compensation is already rejected', 409);
    }
    if (earning.status === 'paid') {
      throw buildError('Paid CP compensation cannot be rejected', 409);
    }

    const now = new Date();
    await earning.update({
      approval_status: 'rejected',
      rejected_by_user_id: userId,
      rejected_at: now,
      rejection_reason: reason,
      approved_by_user_id: null,
      approved_at: null,
      approval_notes: payload.approval_notes || reason,
      updated_at: now
    }, { transaction });

    if (!externalTransaction) await transaction.commit();

    return {
      creator_earning_id: earning.creator_earning_id,
      booking_id: earning.booking_id,
      creator_id: earning.creator_id,
      approval_status: 'rejected',
      rejected_by_user_id: userId,
      rejected_at: now,
      rejection_reason: reason
    };
  } catch (error) {
    if (!externalTransaction && transaction && !transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function modifyCompensation(creatorEarningId, payload = {}, options = {}) {
  const reason = String(payload.modification_reason || payload.reason || payload.notes || '').trim();
  if (!reason) throw buildError('modification_reason is required');

  const normalized = payload.items
    ? normalizeCompensationItems(payload.items)
    : normalizeCompensationItems([{
        label: payload.label || 'Modified Payout',
        amount: payload.new_payout_amount ?? payload.amount
      }]);

  const userId = getUserId(options);
  const transaction = options.transaction || await db.sequelize.transaction();
  const externalTransaction = Boolean(options.transaction);

  try {
    const earning = await getCreatorEarningForReview(creatorEarningId, transaction);
    if (earning.status === 'paid') {
      throw buildError('Paid CP compensation cannot be modified', 409);
    }
    const now = new Date();

    await replaceCompensationItems(earning, normalized.items, transaction);
    await earning.update({
      gross_amount: normalized.total,
      net_earning_amount: normalized.total,
      approval_notes: reason,
      submitted_by_user_id: earning.submitted_by_user_id || userId,
      submitted_at: earning.submitted_at || now,
      updated_at: now
    }, { transaction });

    if (earning.approval_status === 'approved') {
      await releaseApprovedCpCompensationToWallet(earning, transaction);
    }

    if (!externalTransaction) await transaction.commit();

    return {
      creator_earning_id: earning.creator_earning_id,
      booking_id: earning.booking_id,
      creator_id: earning.creator_id,
      approval_status: earning.approval_status,
      total_compensation: normalized.total,
      items: normalized.items,
      modification_reason: reason
    };
  } catch (error) {
    if (!externalTransaction && transaction && !transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function addAdvancePayment(creatorEarningId, payload = {}, options = {}) {
  const amount = toMoney(payload.amount);
  if (!(amount > 0)) throw buildError('Advance amount must be greater than zero');

  const transaction = options.transaction || await db.sequelize.transaction();
  const externalTransaction = Boolean(options.transaction);

  try {
    const earning = await getCreatorEarningForReview(creatorEarningId, transaction);
    const totalCompensation = toMoney(earning.net_earning_amount || earning.gross_amount || 0);
    if (!(totalCompensation > 0)) {
      throw buildError('Total compensation must be greater than zero before adding an advance', 409);
    }

    const existingAdvances = await db.creator_earning_advances.findAll({
      where: {
        creator_earning_id: earning.creator_earning_id,
        status: 'processed'
      },
      transaction
    });
    const existingAdvanceTotal = toMoney(existingAdvances.reduce((sum, advance) => (
      sum + Number(advance.amount || 0)
    ), 0));
    const remainingBalance = toMoney(Math.max(totalCompensation - existingAdvanceTotal, 0));

    if (amount > remainingBalance) {
      throw buildError('Advance amount cannot exceed remaining compensation balance', 409);
    }

    const advance = await addAdvanceIfProvided(earning, {
      amount,
      payment_date: payload.payment_date || payload.processed_at,
      notes: payload.notes || null
    }, options, transaction);

    const processedAt = advance.processed_at || new Date();
    await upsertTimelineEvent(earning, {
      event_type: 'advance_payment_processed',
      label: 'Advance Payment',
      sub_label: `$${amount.toFixed(2)} Has Been Processed`,
      amount,
      is_completed: 1,
      event_date: processedAt,
      sort_order: 3
    }, transaction);

    if (!externalTransaction) await transaction.commit();

    return {
      creator_earning_id: earning.creator_earning_id,
      booking_id: earning.booking_id,
      creator_id: earning.creator_id,
      advance: {
        advance_id: advance.advance_id,
        amount: toMoney(advance.amount),
        status: advance.status,
        processed_at: advance.processed_at,
        notes: advance.notes
      },
      payment_breakdown: {
        total_compensation: totalCompensation,
        advance_paid: toMoney(existingAdvanceTotal + amount),
        remaining_balance: toMoney(Math.max(remainingBalance - amount, 0))
      }
    };
  } catch (error) {
    if (!externalTransaction && transaction && !transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function processCompensationPayment(creatorEarningId, payload = {}, options = {}) {
  const amount = toMoney(payload.amount);
  if (!(amount > 0)) throw buildError('Payment amount must be greater than zero');

  const paymentMethod = getPaymentMethod(payload);
  const userId = getUserId(options);
  const transaction = options.transaction || await db.sequelize.transaction();
  const externalTransaction = Boolean(options.transaction);

  try {
    const earning = await db.creator_earnings.findByPk(creatorEarningId, { transaction });
    if (!earning) throw buildError('Creator earning not found', 404);
    if (earning.approval_status !== 'approved') {
      throw buildError('Only approved CP compensation can be paid', 409);
    }
    if (['paid', 'cancelled', 'held'].includes(earning.status)) {
      throw buildError('CP compensation cannot be paid from its current status', 409);
    }

    await releaseApprovedCpCompensationToWallet(earning, transaction);

    const paymentState = await getCompensationPaymentState(earning, transaction);
    if (!(paymentState.total_compensation > 0)) {
      throw buildError('Total compensation must be greater than zero before payment', 409);
    }
    if (amount > paymentState.remaining_balance) {
      throw buildError('Payment amount cannot exceed remaining compensation balance', 409);
    }

    const paymentScope = getPaymentScope(payload, amount, paymentState.remaining_balance);
    if (paymentScope === 'final' && amount < paymentState.remaining_balance) {
      throw buildError('Final payment amount must equal remaining balance', 409);
    }

    if (paymentMethod === 'manual') {
      if (!String(payload.payment_mode || '').trim()) {
        throw buildError('payment_mode is required for outside platform payments');
      }
      if (!String(payload.proof_url || '').trim()) {
        throw buildError('proof_url is required for outside platform payments');
      }
    }

    let payoutAccount = null;
    if (paymentMethod === 'stripe') {
      payoutAccount = await getStripePayoutAccount(earning.creator_id, transaction);
    }

    const payoutRequest = await createCpPayoutRecords({
      earning,
      amount,
      paymentMethod,
      paymentScope,
      payoutAccount,
      externalReference: payload.transaction_reference || payload.external_reference || null,
      payload,
      userId
    }, transaction);

    let externalReference = payoutRequest.external_reference || null;
    if (paymentMethod === 'stripe') {
      const transfer = await createStripeTransfer({
        amount,
        currency: earning.currency || 'USD',
        stripeAccountId: payoutAccount.stripe_account_id,
        earning,
        payoutRequest
      });
      externalReference = transfer.id;
    }

    const financeTransaction = await finalizeCpPayout({
      earning,
      payoutRequest,
      amount,
      paymentMethod,
      paymentScope,
      externalReference,
      payload,
      userId
    }, transaction);

    let advance = null;
    if (paymentScope === 'advance') {
      advance = await addAdvanceIfProvided(earning, {
        amount,
        payment_date: payload.paid_at || payload.payment_date || new Date(),
        notes: payload.notes || null
      }, options, transaction);

      await upsertTimelineEvent(earning, {
        event_type: 'advance_payment_processed',
        label: 'Advance Payment',
        sub_label: `$${amount.toFixed(2)} Has Been Processed`,
        amount,
        is_completed: 1,
        event_date: advance.processed_at || new Date(),
        sort_order: 3
      }, transaction);
    }

    const paidTotalAfter = toMoney(paymentState.paid_total + amount);
    const remainingAfter = toMoney(Math.max(paymentState.total_compensation - paidTotalAfter, 0));
    const earningStatus = remainingAfter <= 0 ? 'paid' : 'earned';

    await earning.update({
      status: earningStatus,
      payout_id: payoutRequest.creator_payout_request_id,
      finance_transaction_id: financeTransaction.finance_transaction_id,
      updated_at: new Date()
    }, { transaction });

    if (remainingAfter <= 0) {
      await upsertTimelineEvent(earning, {
        event_type: 'final_payment_processed',
        label: 'Final Payment Processed',
        sub_label: 'Remaining Balance Paid',
        amount,
        is_completed: 1,
        event_date: payload.paid_at ? new Date(payload.paid_at) : new Date(),
        sort_order: 6
      }, transaction);
    }

    if (!externalTransaction) await transaction.commit();

    return {
      creator_earning_id: earning.creator_earning_id,
      booking_id: earning.booking_id,
      creator_id: earning.creator_id,
      payment_method: paymentMethod,
      payment_scope: paymentScope,
      amount,
      payout_request_id: payoutRequest.creator_payout_request_id,
      finance_transaction_id: financeTransaction.finance_transaction_id,
      external_reference: externalReference,
      advance_id: advance?.advance_id || null,
      earning_status: earningStatus,
      payment_breakdown: {
        total_compensation: paymentState.total_compensation,
        paid_total: paidTotalAfter,
        remaining_balance: remainingAfter
      }
    };
  } catch (error) {
    if (!externalTransaction && transaction && !transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function updateBookingCompensationDueDate(bookingId, payload = {}, options = {}) {
  const normalizedBookingId = Number(bookingId || payload.booking_id || payload.bookingId);
  const dueDate = formatDateOnly(payload.due_date || payload.dueDate);

  if (!normalizedBookingId) throw buildError('booking_id is required');
  if (!dueDate) throw buildError('Valid due_date is required');

  const earnings = await db.creator_earnings.findAll({
    where: {
      booking_id: normalizedBookingId,
      approval_status: { [db.Sequelize.Op.in]: ACTIVE_APPROVAL_STATUSES }
    }
  });

  if (!earnings.length) {
    throw buildError('No compensation records found for this booking', 404);
  }

  const now = new Date();
  const updatedByUserId = getUserId(options);

  await Promise.all(earnings.map((earning) => {
    const metadata = parseJson(earning.metadata_json, {}) || {};
    return earning.update({
      metadata_json: stringifyMetadata({
        ...metadata,
        due_date: dueDate,
        payout_due_date: dueDate,
        due_date_updated_by_user_id: updatedByUserId,
        due_date_updated_at: now.toISOString()
      }),
      updated_at: now
    });
  }));

  return {
    booking_id: normalizedBookingId,
    due_date: dueDate,
    updated_count: earnings.length
  };
}

async function submitSalesAdminCompensation(payload = {}, options = {}) {
  return upsertBulkCreatorCompensations(payload, {
    ...options,
    approvalStatus: 'pending_approval',
    compensationSource: 'sales_admin'
  });
}

async function addAdminCompensation(payload = {}, options = {}) {
  return upsertBulkCreatorCompensations(payload, {
    ...options,
    approvalStatus: 'approved',
    compensationSource: 'admin'
  });
}

module.exports = {
  submitSalesAdminCompensation,
  addAdminCompensation,
  upsertCreatorCompensation,
  upsertBulkCreatorCompensations,
  listCpCompensations,
  getCpCompensationDetails,
  approveCompensation,
  rejectCompensation,
  modifyCompensation,
  addAdvancePayment,
  processCompensationPayment,
  updateBookingCompensationDueDate,
  listPendingCompensationShoots
};
