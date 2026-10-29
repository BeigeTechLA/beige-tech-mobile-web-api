const db = require('../models');
const financeService = require('./finance.service');
const { getCanonicalCpEarningRows, payoutAmountsByEarningId } = require('../utils/cp-compensation-summary');
const { acceptedCompensationWhere } = require('../utils/cp-compensation-eligibility');

const ELIGIBLE_PAYMENT_STATUSES = new Set(['paid', 'partially_paid']);
const PAID_TRANSACTION_STATUSES = new Set(['paid', 'completed', 'success', 'succeeded']);
const REFUND_TRANSACTION_STATUSES = new Set(['paid', 'refunded', 'completed', 'success', 'succeeded']);
// Draft earnings are generated while a shoot is being prepared. They are not
// compensation commitments and must never affect finance analytics.
const ACTIVE_CP_APPROVAL_STATUSES = new Set(['pending_approval', 'approved']);

// Payout timeline: each unpaid earning has exactly one urgency segment (by days
// until due). Each bucket is cumulative: it shows every segment due within its window.
const INCLUDE_OVERDUE_IN_FORWARD_BUCKETS = false;
const BUCKET_SEGMENTS = {
  this_week: ['upcoming', ...(INCLUDE_OVERDUE_IN_FORWARD_BUCKETS ? ['overdue'] : [])],
  next_week: ['upcoming', 'dueSoon', ...(INCLUDE_OVERDUE_IN_FORWARD_BUCKETS ? ['overdue'] : [])],
  '2_4_weeks': ['upcoming', 'dueSoon', 'later', ...(INCLUDE_OVERDUE_IN_FORWARD_BUCKETS ? ['overdue'] : [])],
  overdue: ['overdue']
};

function payoutSegmentForDays(days) {
  if (days < 0) return 'overdue';
  if (days <= 6) return 'upcoming';
  if (days <= 13) return 'dueSoon';
  if (days <= 27) return 'later';
  return null; // more than 4 weeks away: not shown on the timeline
}
const CREATOR_ROLE_LABELS = {
  1: 'Videographer', 2: 'Photographer', 3: 'Editor', 4: 'Producer', 5: 'Director',
  9: 'Videographer', 10: 'Photographer', 11: 'Editor'
};

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

function percent(numerator, denominator) {
  return denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(2)) : 0;
}

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return {};
  }
}

function parseDateOnly(value, fieldName) {
  const input = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) throw badRequest(`${fieldName} must use YYYY-MM-DD format`);
  const date = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input) {
    throw badRequest(`${fieldName} is not a valid date`);
  }
  return input;
}

function resolveFilters(query = {}) {
  const start = query.start_date || query.date_from;
  const end = query.end_date || query.date_to;
  if (Boolean(start) !== Boolean(end)) throw badRequest('start_date and end_date must be provided together');

  const timezone = String(query.timezone || 'Asia/Kolkata').trim() || 'Asia/Kolkata';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  } catch (_) {
    throw badRequest('timezone must be a valid IANA timezone');
  }

  if (!start) return { start_date: null, end_date: null, timezone };
  const startDate = parseDateOnly(start, 'start_date');
  const endDate = parseDateOnly(end, 'end_date');
  if (startDate > endDate) throw badRequest('start_date must be on or before end_date');
  return { start_date: startDate, end_date: endDate, timezone };
}

function dateKey(value, timezone) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function isInRange(value, filters) {
  if (!filters.start_date) return true;
  const key = dateKey(value, filters.timezone);
  return Boolean(key && key >= filters.start_date && key <= filters.end_date);
}

function addDays(dateOnly, days) {
  const value = new Date(`${dateOnly}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function creatorName(creator = {}) {
  return [creator.first_name, creator.last_name].filter(Boolean).join(' ').trim() || creator.email || `CP #${creator.crew_member_id}`;
}

function creatorRoleNames(value) {
  let roles = value;
  if (typeof value === 'string') {
    try { roles = JSON.parse(value); } catch (_) { roles = [value]; }
  }
  const labels = (Array.isArray(roles) ? roles : [roles])
    .map((role) => CREATOR_ROLE_LABELS[Number(role)] || String(role || '').trim())
    .filter(Boolean);
  return [...new Set(labels)];
}

function clientName(client = {}, fallback) {
  return client.name || client.email || fallback || 'Guest client';
}

function groupSeries(rows, key, fields) {
  const grouped = new Map();
  rows.forEach((row) => {
    if (!row[key]) return;
    const current = grouped.get(row[key]) || { date: row[key] };
    fields.forEach((field) => { current[field] = money((current[field] || 0) + Number(row[field] || 0)); });
    grouped.set(row[key], current);
  });
  return Array.from(grouped.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function resolveDueDate(earning, booking) {
  const metadata = parseMetadata(earning.metadata_json);
  const explicit = metadata.due_date || metadata.payout_due_date;
  if (explicit && /^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
  const eventDate = booking?.event_date ? String(booking.event_date).slice(0, 10) : null;
  return eventDate ? addDays(eventDate, 15) : null;
}

function statusForClient(totalCollected, totalOutstanding) {
  if (totalOutstanding <= 0) return 'fully_paid';
  return totalCollected > 0 ? 'partially_paid' : 'pending';
}

// The balance is the source of truth for receivables. A historic breakdown can
// retain an old payment_status even after its collected amount changes, so do
// not let that label hide an amount the client still owes.
function outstandingBalance(row) {
  return Math.max(Number(row.total_amount || 0) - Number(row.collected_amount || 0), 0);
}

function isOutstandingReceivable(row) {
  return String(row.payment_status || '').toLowerCase() !== 'refunded' && outstandingBalance(row) > 0;
}

function buildAnalyticsData(input, filters = resolveFilters(), now = new Date(), includeAudit = false) {
  const bookings = new Map((input.bookings || []).map((item) => [Number(item.stream_project_booking_id), item]));
  const users = new Map((input.users || []).map((item) => [Number(item.id), item]));
  const creators = new Map((input.creators || []).map((item) => [Number(item.crew_member_id), item]));
  const transactionsByBooking = new Map();
  const transactionById = new Map();

  (input.transactions || []).forEach((transaction) => {
    transactionById.set(Number(transaction.finance_transaction_id), transaction);
    const bookingId = Number(transaction.booking_id);
    if (!bookingId) return;
    transactionsByBooking.set(bookingId, [...(transactionsByBooking.get(bookingId) || []), transaction]);
  });

  const allBreakdownRows = (input.breakdowns || [])
    .map((breakdown) => {
      const bookingId = Number(breakdown.booking_id);
      const booking = bookings.get(bookingId) || {};
      const successfulPayments = (transactionsByBooking.get(bookingId) || [])
        .filter((transaction) => transaction.transaction_type === 'client_payment' && PAID_TRANSACTION_STATUSES.has(String(transaction.status || '').toLowerCase()))
        .sort((a, b) => new Date(a.transaction_date) - new Date(b.transaction_date));
      const activityDate = successfulPayments[0]?.transaction_date || booking.payment_completed_at || breakdown.calculated_at;
      return { ...breakdown, booking, booking_id: bookingId, activity_date: activityDate };
    });
  const breakdownRows = allBreakdownRows.filter((row) => isInRange(row.activity_date, filters));
  const eligibleRevenue = breakdownRows
    .filter((breakdown) => ELIGIBLE_PAYMENT_STATUSES.has(String(breakdown.payment_status || '').toLowerCase()));
  const outstandingRows = breakdownRows.filter(isOutstandingReceivable);

  const eligibleBookingIds = new Set(eligibleRevenue.map((row) => row.booking_id));
  const refunds = (input.transactions || [])
    .filter((transaction) => transaction.transaction_type === 'refund'
      && REFUND_TRANSACTION_STATUSES.has(String(transaction.status || '').toLowerCase())
      && isInRange(transaction.transaction_date, filters))
    .map((transaction) => ({
      id: transaction.finance_transaction_id,
      booking_id: transaction.booking_id,
      status: transaction.status,
      date: dateKey(transaction.transaction_date, filters.timezone),
      amount: Math.abs(Number(transaction.gross_amount || transaction.net_amount || 0))
    }));

  const grossRevenue = money(eligibleRevenue.reduce((sum, row) => sum + Number(row.total_amount || 0), 0));
  const pendingRevenue = money(outstandingRows.reduce((sum, row) => sum + outstandingBalance(row), 0));
  const refundAmount = money(refunds.reduce((sum, row) => sum + row.amount, 0));
  const netRevenue = money(grossRevenue - refundAmount);

  const revenueSeriesRows = eligibleRevenue.map((row) => ({
    date: dateKey(row.activity_date, filters.timezone),
    gross: Number(row.total_amount || 0),
    pending: outstandingBalance(row),
    cp_payout: 0,
    refunds: 0
  }));
  outstandingRows
    .filter((row) => !eligibleBookingIds.has(row.booking_id))
    .forEach((row) => revenueSeriesRows.push({
      date: dateKey(row.activity_date, filters.timezone), gross: 0,
      pending: outstandingBalance(row), cp_payout: 0, refunds: 0
    }));
  refunds.forEach((refund) => revenueSeriesRows.push({ date: refund.date, gross: 0, pending: 0, cp_payout: 0, refunds: refund.amount }));

  const allCpRows = getCanonicalCpEarningRows(input.earnings || [])
    // CP Compensation is its own financial source of truth. A creator payout
    // can be completed before a finance_project_breakdowns row exists, so do
    // not drop valid CP records based on the client's payment data.
    .filter((earning) => (
      String(earning.status || '').toLowerCase() !== 'cancelled'
      && ACTIVE_CP_APPROVAL_STATUSES.has(String(earning.approval_status || '').toLowerCase())
    ))
    .map((earning) => {
      const booking = bookings.get(Number(earning.booking_id)) || {};
      const payoutTransaction = transactionById.get(Number(earning.finance_transaction_id));
      const dueDate = resolveDueDate(earning, booking);
      const amount = money(earning.net_earning_amount);
      const recordedPaid = money((input.paidAmountsByEarningId || new Map()).get(Number(earning.creator_earning_id)) || 0);
      const paidAmount = String(earning.status || '').toLowerCase() === 'paid'
        ? (recordedPaid > 0 ? Math.min(recordedPaid, amount) : amount)
        : Math.min(recordedPaid, amount);
      const payableAmount = money(Math.max(amount - paidAmount, 0));
      const isPaid = paidAmount >= amount;
      const activityDate = isPaid
        ? (payoutTransaction?.transaction_date || earning.updated_at || earning.approved_at || earning.created_at)
        : (dueDate ? `${dueDate}T00:00:00.000Z` : earning.updated_at || earning.created_at);
      return {
        ...earning,
        booking,
        creator: creators.get(Number(earning.creator_id)) || {},
        due_date: dueDate,
        activity_date: activityDate,
        is_paid: isPaid,
        amount,
        paid_amount: paidAmount,
        payable_amount: payableAmount
      };
    });
  const cpRows = allCpRows.filter((earning) => isInRange(earning.activity_date, filters));

  cpRows.forEach((row) => revenueSeriesRows.push({
    date: dateKey(row.activity_date, filters.timezone), gross: 0, pending: 0, cp_payout: row.amount, refunds: 0
  }));

  const paidCpPayout = money(cpRows.reduce((sum, row) => sum + row.paid_amount, 0));
  const payableCpPayout = money(cpRows.reduce((sum, row) => sum + row.payable_amount, 0));
  const cpPayout = money(paidCpPayout + payableCpPayout);

  // A ranking titled “Top CPs By Payout” represents money already paid to a
  // creator. Pending or approved-but-unpaid compensation remains payable and
  // is shown in the CP payout summary/timeline, never in this ranking.
  const paidCpRows = cpRows.filter((row) => row.paid_amount > 0);
  const revenueByBooking = new Map(eligibleRevenue.map((row) => [row.booking_id, Number(row.total_amount || 0)]));
  const cpByCreator = new Map();
  paidCpRows.forEach((row) => {
    const id = Number(row.creator_id);
    const current = cpByCreator.get(id) || { id: String(id), name: creatorName(row.creator), payout: 0, shoots: new Set(), shoot_revenue: 0 };
    current.payout += row.paid_amount;
    if (!current.shoots.has(Number(row.booking_id))) current.shoot_revenue += revenueByBooking.get(Number(row.booking_id)) || 0;
    current.shoots.add(Number(row.booking_id));
    cpByCreator.set(id, current);
  });
  const topByPayout = Array.from(cpByCreator.values())
    .map((row) => ({ ...row, payout: money(row.payout), shoots: row.shoots.size, margin: percent(row.payout, row.shoot_revenue) }))
    .sort((a, b) => b.payout - a.payout).slice(0, 5);
  const topByShoots = Array.from(cpByCreator.values())
    .map((row) => ({ id: row.id, name: row.name, shoots: row.shoots.size }))
    .sort((a, b) => b.shoots - a.shoots).slice(0, 10);

  const cpBookingIds = new Set(paidCpRows.map((row) => Number(row.booking_id)));
  const averageCpPayout = paidCpRows.length ? money(paidCpPayout / paidCpRows.length) : 0;
  const averageCpMargin = percent(paidCpPayout, grossRevenue);
  const averageCpsPerShoot = cpBookingIds.size ? Number((paidCpRows.length / cpBookingIds.size).toFixed(2)) : 0;
  const today = dateKey(now, filters.timezone);
  const overdueByCreator = new Map();
  cpRows.filter((row) => row.payable_amount > 0 && row.due_date && row.due_date < today).forEach((row) => {
    const id = Number(row.creator_id);
    const current = overdueByCreator.get(id) || {
      id: String(id), name: creatorName(row.creator), roles: creatorRoleNames(row.creator.primary_role),
      amount: 0, days_overdue: 0, shoots: new Set()
    };
    current.amount += row.payable_amount;
    current.shoots.add(Number(row.booking_id));
    current.days_overdue = Math.max(current.days_overdue, Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${row.due_date}T00:00:00Z`)) / 86400000));
    overdueByCreator.set(id, current);
  });
  const topOverdue = Array.from(overdueByCreator.values())
    .map((row) => ({ ...row, amount: money(row.amount), shoots: row.shoots.size }))
    .sort((a, b) => b.amount - a.amount).slice(0, 100);
  const timeline = [
    { id: 'this_week', label: 'This Week', segments: { upcoming: 0, dueSoon: 0, later: 0, overdue: 0 } },
    { id: 'next_week', label: 'Next Week', segments: { upcoming: 0, dueSoon: 0, later: 0, overdue: 0 } },
    { id: '2_4_weeks', label: '2-4 Weeks', segments: { upcoming: 0, dueSoon: 0, later: 0, overdue: 0 } },
    { id: 'overdue', label: 'Overdue', segments: { upcoming: 0, dueSoon: 0, later: 0, overdue: 0 } }
  ];
  cpRows.filter((row) => row.payable_amount > 0 && row.due_date).forEach((row) => {
    const days = Math.floor((Date.parse(`${row.due_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
    const segment = payoutSegmentForDays(days);
    if (!segment) return;
    timeline.forEach((bucket) => {
      if (BUCKET_SEGMENTS[bucket.id].includes(segment)) bucket.segments[segment] += row.payable_amount;
    });
  });
  timeline.forEach((bucket) => Object.keys(bucket.segments).forEach((key) => { bucket.segments[key] = money(bucket.segments[key]); }));

  const makeClientRows = (rows) => {
    const clients = new Map();
    rows.forEach((row) => {
      const userId = Number(row.client_user_id || row.booking.user_id || 0);
      const identity = userId ? `user:${userId}` : `guest:${String(row.guest_email || row.booking.guest_email || row.booking_id).toLowerCase()}`;
      const user = users.get(userId) || {};
      const current = clients.get(identity) || { id: identity, name: clientName(user, row.guest_email || row.booking.guest_email), shoots: new Set(), spend: 0, collected: 0, outstanding: 0 };
      current.shoots.add(row.booking_id);
      current.spend += Number(row.total_amount || 0);
      current.collected += Number(row.collected_amount || 0);
      current.outstanding += isOutstandingReceivable(row) ? outstandingBalance(row) : 0;
      clients.set(identity, current);
    });
    return Array.from(clients.values()).map((row) => ({
      ...row, shoots: row.shoots.size, spend: money(row.spend), collected: money(row.collected), outstanding: money(row.outstanding), status: statusForClient(row.collected, row.outstanding)
    }));
  };
  // The client ranking is a paid-shoot ranking.  Pending finance rows remain in
  // the payment overview, but must never inflate the shoot or spend leaderboard.
  const clientRows = makeClientRows(breakdownRows);
  // A finance breakdown is a derived snapshot and older paid shoots may not
  // have one yet.  Client rankings must instead use the confirmed payment
  // evidence supplied by getAnalytics, so the count matches Client Profiles.
  const paidClientSourceRows = (input.clientPaymentBookings && input.clientPaymentBookings.length > 0)
    ? input.clientPaymentBookings
    : eligibleRevenue;
  const paidClientRows = paidClientSourceRows.map((row) => ({
    ...row,
    booking: bookings.get(Number(row.booking_id)) || row.booking || {},
    activity_date: row.activity_date || row.payment_completed_at || row.updated_at
  })).filter((row) => ELIGIBLE_PAYMENT_STATUSES.has(String(row.payment_status || '').toLowerCase()) && isInRange(row.activity_date, filters));
  const topClientRows = makeClientRows(paidClientRows);
  const topClientsByShoots = [...topClientRows].sort((a, b) => b.shoots - a.shoots || b.spend - a.spend).slice(0, 100);
  const topClientsBySpend = [...topClientRows].sort((a, b) => b.spend - a.spend).slice(0, 100);
  const paymentOverview = ['fully_paid', 'partially_paid', 'pending'].map((id) => ({ id, label: id === 'fully_paid' ? 'Fully Paid' : id === 'partially_paid' ? 'Partially Paid' : 'Pending', clients: clientRows.filter((row) => row.status === id).length }));
  const collectedAmount = money(breakdownRows.reduce((sum, row) => sum + Number(row.collected_amount || 0), 0));
  const recoveredRows = (input.transactions || []).filter((transaction) => transaction.transaction_type === 'client_payment' && PAID_TRANSACTION_STATUSES.has(String(transaction.status || '').toLowerCase()) && isInRange(transaction.transaction_date, filters)).map((transaction) => ({
    id: transaction.finance_transaction_id,
    booking_id: transaction.booking_id,
    status: transaction.status,
    date: dateKey(transaction.transaction_date, filters.timezone),
    value: Number(transaction.gross_amount || 0)
  }));
  const recoveredSeries = groupSeries(recoveredRows, 'date', ['value']).map((row) => ({ name: row.date, value: row.value }));

  const disputes = input.disputes || [];
  const raised = disputes.filter((row) => isInRange(row.created_at, filters));
  const resolved = disputes.filter((row) => String(row.status).toLowerCase() === 'resolved' && isInRange(row.resolved_at, filters));
  const reasonCounts = new Map();
  raised.forEach((row) => reasonCounts.set(row.category || 'other', (reasonCounts.get(row.category || 'other') || 0) + 1));
  const topReasons = Array.from(reasonCounts.entries()).map(([reason, cases]) => ({ id: reason, name: reason.replace(/_/g, ' '), cases })).sort((a, b) => b.cases - a.cases).slice(0, 5);

  return {
    filters,
    revenue: {
      gross_revenue: { amount: grossRevenue }, refund_amount: refundAmount, net_revenue: { amount: netRevenue }, pending_revenue: { amount: pendingRevenue },
      cp_payout: { paid_amount: paidCpPayout, payable_amount: payableCpPayout, total_amount: cpPayout },
      series: groupSeries(revenueSeriesRows, 'date', ['gross', 'pending', 'cp_payout', 'refunds']).map((row) => ({ ...row, net_revenue: money(row.gross - row.refunds) }))
    },
    creative_partners: {
      top_by_payout: topByPayout, top_by_shoots: topByShoots,
      averages: { payout_per_assignment: averageCpPayout, cp_payout_percent_of_revenue: averageCpMargin, cps_per_shoot: averageCpsPerShoot },
      payout_timeline: timeline, top_overdue: topOverdue
    },
    clients: {
      top_by_shoots: topClientsByShoots, top_by_spend: topClientsBySpend,
      average_spend_per_shoot: { amount: eligibleRevenue.length ? money(grossRevenue / eligibleRevenue.length) : 0 },
      payment_overview: paymentOverview,
      outstanding: { collected_amount: collectedAmount, outstanding_amount: pendingRevenue, recovered_amount: money(recoveredRows.reduce((sum, row) => sum + row.value, 0)), recovered_series: recoveredSeries }
    },
    disputes: {
      raised: raised.length, resolved: resolved.length,
      pending: raised.filter((row) => String(row.status).toLowerCase() === 'open').length,
      active: raised.filter((row) => ['in_review', 'escalated'].includes(String(row.status).toLowerCase())).length,
      top_reasons: topReasons
    },
    ...(includeAudit ? { audit: {
      as_of_date: today,
      revenue: allBreakdownRows.map((row) => ({
        booking_id: row.booking_id,
        project_name: row.booking.project_name || '',
        client_id: Number(row.client_user_id || row.booking.user_id || 0) || '',
        guest_email: row.guest_email || row.booking.guest_email || '',
        activity_date: dateKey(row.activity_date, filters.timezone),
        payment_status: row.payment_status || '',
        total_amount: Number(row.total_amount || 0),
        collected_amount: Number(row.collected_amount || 0),
        in_range: isInRange(row.activity_date, filters),
        gross_contribution: isInRange(row.activity_date, filters) && ELIGIBLE_PAYMENT_STATUSES.has(String(row.payment_status || '').toLowerCase()) ? Number(row.total_amount || 0) : 0,
        pending_contribution: isInRange(row.activity_date, filters) && isOutstandingReceivable(row) ? outstandingBalance(row) : 0
      })),
      refunds,
      recovered: recoveredRows,
      transactions: (input.transactions || []).map((row) => ({
        id: row.finance_transaction_id,
        booking_id: row.booking_id,
        transaction_type: row.transaction_type || '',
        status: row.status || '',
        transaction_date: dateKey(row.transaction_date, filters.timezone),
        gross_amount: Number(row.gross_amount || 0),
        net_amount: Number(row.net_amount || 0),
        in_range: isInRange(row.transaction_date, filters)
      })),
      cp: allCpRows.map((row) => ({
        earning_id: row.creator_earning_id,
        booking_id: row.booking_id,
        creator_id: row.creator_id,
        creator_name: creatorName(row.creator),
        status: row.status,
        approval_status: row.approval_status,
        activity_date: dateKey(row.activity_date, filters.timezone),
        due_date: row.due_date,
        amount: row.amount,
        paid_amount: row.paid_amount,
        payable_amount: row.payable_amount,
        in_range: isInRange(row.activity_date, filters),
        days_until_due: row.due_date ? Math.floor((Date.parse(`${row.due_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000) : null
      })),
      clients: clientRows.map((row) => ({
        id: row.id, name: row.name, shoots: row.shoots,
        spend: row.spend, collected: row.collected,
        outstanding: row.outstanding, status: row.status
      })),
      client_rankings: topClientRows.map((row) => ({
        id: row.id, name: row.name, shoots: row.shoots,
        spend: row.spend, collected: row.collected,
        outstanding: row.outstanding, status: row.status
      })),
      client_bookings: paidClientSourceRows.map((row) => {
        const booking = bookings.get(Number(row.booking_id)) || row.booking || {};
        const activityDate = row.activity_date || row.payment_completed_at || row.updated_at;
        return {
          booking_id: row.booking_id,
          client_id: Number(row.client_user_id || booking.user_id || 0) || '',
          guest_email: row.guest_email || booking.guest_email || '',
          activity_date: dateKey(activityDate, filters.timezone),
          payment_status: row.payment_status || '',
          total_amount: Number(row.total_amount || 0),
          collected_amount: Number(row.collected_amount || 0),
          included: ELIGIBLE_PAYMENT_STATUSES.has(String(row.payment_status || '').toLowerCase()) && isInRange(activityDate, filters)
        };
      }),
      disputes: disputes.map((row) => ({
        id: row.finance_dispute_id,
        booking_id: row.booking_id,
        created_date: dateKey(row.created_at, filters.timezone),
        resolved_date: dateKey(row.resolved_at, filters.timezone),
        status: row.status || '',
        category: row.category || 'other',
        raised_in_range: isInRange(row.created_at, filters),
        resolved_in_range: String(row.status || '').toLowerCase() === 'resolved' && isInRange(row.resolved_at, filters)
      }))
    } } : {})
  };
}

const PAYOUT_PERIODS = new Set(['last_30_days', 'this_quarter', 'this_year']);

function titleCase(value) {
  return String(value || '').trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Maps a booking onto the three options of the "type" filter in the UI.
// If content_type is stored as a numeric id in your DB, map it here.
function serviceTypeLabel(booking = {}) {
  const text = [booking.content_type, booking.shoot_type, booking.event_type].filter(Boolean).join(' ').toLowerCase();
  const photo = /photo/.test(text);
  const video = /video|film|cinema/.test(text);
  if (photo && video) return 'Photo + Video';
  if (photo) return 'Photography';
  if (video) return 'Videography';
  return titleCase(booking.shoot_type || booking.event_type || '') || 'Other';
}

function payoutMethodLabel(payout) {
  if (!payout) return '—';
  if (String(payout.payout_method || '').toLowerCase() === 'stripe') return 'Stripe';
  const mode = String(parseMetadata(payout.metadata_json).payment_mode || '').trim().toLowerCase();
  if (!mode || ['advance_payment', 'final_payment', 'outside_platform'].includes(mode)) return 'Manual';
  return titleCase(mode);
}

function periodRange(period, timezone, now = new Date()) {
  if (!PAYOUT_PERIODS.has(period)) return null;
  const today = dateKey(now, timezone);
  const year = today.slice(0, 4);
  const pad = (n) => String(n).padStart(2, '0');
  if (period === 'last_30_days') return { start: addDays(today, -29), end: today };
  if (period === 'this_year') return { start: `${year}-01-01`, end: `${year}-12-31` };
  const month = Number(today.slice(5, 7));
  const qStart = Math.floor((month - 1) / 3) * 3 + 1;
  const qEnd = qStart + 2;
  const lastDay = new Date(Date.UTC(Number(year), qEnd, 0)).getUTCDate();
  return { start: `${year}-${pad(qStart)}-01`, end: `${year}-${pad(qEnd)}-${pad(lastDay)}` };
}

async function getCpPayoutHistory(query = {}, now = new Date()) {
  const creatorId = Number(query.creator_id);
  if (!Number.isInteger(creatorId) || creatorId <= 0) throw badRequest('creator_id is required');

  const filters = resolveFilters(query);
  const timezone = filters.timezone;
  const statusFilter = String(query.status || '').trim().toLowerCase(); // completed | pending
  const serviceFilter = String(query.service_type || '').trim();
  const search = String(query.search || '').trim().toLowerCase().replace(/^#/, '');
  const range = periodRange(String(query.period || '').trim(), timezone, now);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 100);

  const [earnings, payoutRequests] = await Promise.all([
    db.creator_earnings.findAll({ where: { ...acceptedCompensationWhere(), creator_id: creatorId }, raw: true }),
    db.creator_payout_requests.findAll({ where: { creator_id: creatorId }, raw: true })
  ]);

  const activeEarnings = getCanonicalCpEarningRows(earnings).filter((earning) => (
    String(earning.status || '').toLowerCase() !== 'cancelled'
    && ACTIVE_CP_APPROVAL_STATUSES.has(String(earning.approval_status || '').toLowerCase())
  ));

  const bookingIds = [...new Set(activeEarnings.map((e) => Number(e.booking_id)).filter(Boolean))];
  const bookings = bookingIds.length
    ? await db.stream_project_booking.findAll({
        where: { stream_project_booking_id: bookingIds },
        attributes: ['stream_project_booking_id', 'project_name', 'shoot_type', 'event_type', 'content_type', 'event_date'],
        raw: true
      })
    : [];
  const bookingById = new Map(bookings.map((b) => [Number(b.stream_project_booking_id), b]));

  // Latest CP-compensation payout per earning (for method + paid date)
  const latestPayout = new Map();
  payoutRequests
    .filter((p) => ['processing', 'paid'].includes(String(p.status || '').toLowerCase()))
    .forEach((p) => {
      const meta = parseMetadata(p.metadata_json);
      if (meta.source !== 'cp_compensation') return;
      const earningId = Number(meta.creator_earning_id);
      const when = new Date(p.paid_at || p.processed_at || p.created_at || 0).getTime();
      const current = latestPayout.get(earningId);
      if (!current || when > current.when) latestPayout.set(earningId, { payout: p, when });
    });

  // Keep each history row on the same actual-paid definition as Top CPs by
  // Payout. Requested/approved/processing requests and advances are not paid.
  const paidByEarning = payoutAmountsByEarningId(payoutRequests);

  let rows = activeEarnings.map((earning) => {
    const booking = bookingById.get(Number(earning.booking_id)) || {};
    const amount = money(earning.net_earning_amount || earning.gross_amount || 0);
    const earningId = Number(earning.creator_earning_id);
    const recordedPaid = money(paidByEarning.get(earningId) || 0);
    const paidAmount = String(earning.status || '').toLowerCase() === 'paid'
      ? (recordedPaid > 0 ? Math.min(recordedPaid, amount) : amount)
      : Math.min(recordedPaid, amount);
    const isFullyPaid = amount > 0 && paidAmount >= amount;
    const last = latestPayout.get(Number(earning.creator_earning_id))?.payout || null;
    const date = isFullyPaid
      ? (dateKey(last?.paid_at || last?.processed_at || earning.updated_at, timezone))
      : resolveDueDate(earning, booking);
    return {
      id: String(earning.creator_earning_id),
      booking_id: Number(earning.booking_id),
      shoot_id: `#${earning.booking_id}`,
      project_name: booking.project_name || `Shoot #${earning.booking_id}`,
      date,
      service_type: serviceTypeLabel(booking),
      payout: paidAmount,
      total_compensation: amount,
      paid_amount: paidAmount,
      payment_method: payoutMethodLabel(last),
      status: isFullyPaid ? 'Completed' : 'Pending'
    };
  });

  rows = rows.filter((row) => {
    if (!(row.paid_amount > 0)) return false; // same rule as Top CPs By Payout
    if (statusFilter && row.status.toLowerCase() !== statusFilter) return false;
    if (serviceFilter && row.service_type !== serviceFilter) return false;
    if (range && !(row.date && row.date >= range.start && row.date <= range.end)) return false;
    if (filters.start_date && !(row.date && row.date >= filters.start_date && row.date <= filters.end_date)) return false;
    if (search && !`${row.booking_id} ${row.project_name}`.toLowerCase().includes(search)) return false;
    return true;
  }).sort((a, b) => (b.date || '').localeCompare(a.date || '') || Number(b.id) - Number(a.id));

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(Math.max(parseInt(query.page, 10) || 1, 1), totalPages);

  return {
    summary: {
      total_paid: money(rows.reduce((sum, r) => sum + r.paid_amount, 0)),
      total_payable: money(rows.reduce((sum, r) => sum + (r.total_compensation - r.paid_amount), 0))
    },
    rows: rows.slice((page - 1) * limit, page * limit).map(({ paid_amount, ...row }) => row),
    pagination: { page, limit, total, total_pages: totalPages }
  };
}

async function getCpOverdueHistory(query = {}, now = new Date()) {
  const creatorId = Number(query.creator_id);
  if (!Number.isInteger(creatorId) || creatorId <= 0) throw badRequest('creator_id is required');

  const filters = resolveFilters(query);
  const timezone = filters.timezone;
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 100);
  const [earnings, payoutRequests] = await Promise.all([
    db.creator_earnings.findAll({ where: { ...acceptedCompensationWhere(), creator_id: creatorId }, raw: true }),
    db.creator_payout_requests.findAll({ where: { creator_id: creatorId }, raw: true })
  ]);
  const paidByEarning = payoutAmountsByEarningId(payoutRequests);
  const activeEarnings = getCanonicalCpEarningRows(earnings).filter((earning) => (
    String(earning.status || '').toLowerCase() !== 'cancelled'
    && ACTIVE_CP_APPROVAL_STATUSES.has(String(earning.approval_status || '').toLowerCase())
  ));
  const bookingIds = [...new Set(activeEarnings.map((earning) => Number(earning.booking_id)).filter(Boolean))];
  const bookings = bookingIds.length
    ? await db.stream_project_booking.findAll({
        where: { stream_project_booking_id: bookingIds },
        attributes: ['stream_project_booking_id', 'project_name', 'shoot_type', 'event_type', 'content_type', 'event_date', 'user_id', 'guest_email'],
        raw: true
      })
    : [];
  const bookingById = new Map(bookings.map((booking) => [Number(booking.stream_project_booking_id), booking]));
  const userIds = [...new Set(bookings.map((booking) => Number(booking.user_id)).filter(Boolean))];
  const users = userIds.length
    ? await db.users.unscoped().findAll({ where: { id: userIds }, attributes: ['id', 'name', 'email'], raw: true })
    : [];
  const userById = new Map(users.map((user) => [Number(user.id), user]));
  const today = dateKey(now, timezone);

  let rows = activeEarnings.flatMap((earning) => {
    const booking = bookingById.get(Number(earning.booking_id)) || {};
    const amount = money(earning.net_earning_amount);
    const recordedPaid = money(paidByEarning.get(Number(earning.creator_earning_id)) || 0);
    const paidAmount = String(earning.status || '').toLowerCase() === 'paid'
      ? (recordedPaid > 0 ? Math.min(recordedPaid, amount) : amount)
      : Math.min(recordedPaid, amount);
    const overdueAmount = money(Math.max(amount - paidAmount, 0));
    const dueDate = resolveDueDate(earning, booking);
    if (!(overdueAmount > 0) || !dueDate || dueDate >= today || !isInRange(`${dueDate}T00:00:00.000Z`, filters)) return [];

    const user = userById.get(Number(booking.user_id)) || {};
    return [{
      id: String(earning.creator_earning_id),
      earning_id: Number(earning.creator_earning_id),
      booking_id: Number(earning.booking_id),
      shoot_name: booking.project_name || `Shoot #${earning.booking_id}`,
      category: serviceTypeLabel(booking),
      customer_name: clientName(user, booking.guest_email),
      amount: overdueAmount,
      due_date: dueDate,
      days_overdue: Math.max(0, Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86400000))
    }];
  }).sort((a, b) => b.due_date.localeCompare(a.due_date) || b.amount - a.amount || b.earning_id - a.earning_id);

  const total = rows.length;
  const totalOverdue = money(rows.reduce((sum, row) => sum + row.amount, 0));
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(Math.max(parseInt(query.page, 10) || 1, 1), totalPages);
  rows = rows.slice((page - 1) * limit, page * limit);

  return {
    summary: { total_overdue: totalOverdue, total_shoots: total },
    rows,
    pagination: { page, limit, total, total_pages: totalPages }
  };
}

async function getPayoutScheduleHistory(query = {}, now = new Date()) {
  const bucket = String(query.bucket_id || '').trim();
  const bucketIds = new Set(['this_week', 'next_week', '2_4_weeks', 'overdue']);
  if (!bucketIds.has(bucket)) throw badRequest('A valid payout bucket_id is required');

  const filters = resolveFilters(query);
  const timezone = filters.timezone;
  const search = String(query.search || '').trim().toLowerCase().replace(/^#/, '');
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 100);
  const [earnings, payoutRequests] = await Promise.all([
    db.creator_earnings.findAll({ where: acceptedCompensationWhere(), raw: true }),
    db.creator_payout_requests.findAll({ raw: true })
  ]);
  const paidByEarning = payoutAmountsByEarningId(payoutRequests);
  const activeEarnings = getCanonicalCpEarningRows(earnings).filter((earning) => (
    String(earning.status || '').toLowerCase() !== 'cancelled'
    && ACTIVE_CP_APPROVAL_STATUSES.has(String(earning.approval_status || '').toLowerCase())
  ));
  const bookingIds = [...new Set(activeEarnings.map((earning) => Number(earning.booking_id)).filter(Boolean))];
  const creatorIds = [...new Set(activeEarnings.map((earning) => Number(earning.creator_id)).filter(Boolean))];
  const [bookings, creators] = await Promise.all([
    bookingIds.length
      ? db.stream_project_booking.findAll({
          where: { stream_project_booking_id: bookingIds },
          attributes: ['stream_project_booking_id', 'project_name', 'shoot_type', 'event_type', 'content_type', 'event_date', 'budget', 'user_id', 'guest_email'],
          raw: true
        })
      : [],
    creatorIds.length
      ? db.crew_members.findAll({
          where: { crew_member_id: creatorIds },
          attributes: ['crew_member_id', 'first_name', 'last_name', 'email', 'primary_role'],
          raw: true
        })
      : []
  ]);
  const userIds = [...new Set(bookings.map((booking) => Number(booking.user_id)).filter(Boolean))];
  const users = userIds.length
    ? await db.users.unscoped().findAll({ where: { id: userIds }, attributes: ['id', 'name', 'email'], raw: true })
    : [];
  const bookingById = new Map(bookings.map((booking) => [Number(booking.stream_project_booking_id), booking]));
  const creatorById = new Map(creators.map((creator) => [Number(creator.crew_member_id), creator]));
  const userById = new Map(users.map((user) => [Number(user.id), user]));
  const today = dateKey(now, timezone);

  let rows = activeEarnings.flatMap((earning) => {
    const booking = bookingById.get(Number(earning.booking_id)) || {};
    const amount = money(earning.net_earning_amount);
    const recordedPaid = money(paidByEarning.get(Number(earning.creator_earning_id)) || 0);
    const paidAmount = String(earning.status || '').toLowerCase() === 'paid'
      ? (recordedPaid > 0 ? Math.min(recordedPaid, amount) : amount)
      : Math.min(recordedPaid, amount);
    const pendingAmount = money(Math.max(amount - paidAmount, 0));
    if (!(pendingAmount > 0)) return [];

    const dueDate = resolveDueDate(earning, booking);
    if (!dueDate || !isInRange(`${dueDate}T00:00:00.000Z`, filters)) return [];
    const dueDays = Math.floor((Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
    const segment = payoutSegmentForDays(dueDays);
    if (!segment || !BUCKET_SEGMENTS[bucket].includes(segment)) return [];

    const creator = creatorById.get(Number(earning.creator_id)) || {};
    const user = userById.get(Number(booking.user_id)) || {};
    const cpName = creatorName(creator);
    const customer = clientName(user, booking.guest_email);
    const bookingId = Number(earning.booking_id);
    const searchable = `${cpName} ${customer} ${bookingId} ${booking.project_name || ''}`.toLowerCase();
    if (search && !searchable.includes(search)) return [];

    const approval = String(earning.approval_status || '').toLowerCase();
    const status = approval === 'pending_approval' ? 'Finance Approval'
      : paidAmount > 0 ? 'Partially Paid'
        : String(earning.status || '').toLowerCase() === 'pending' ? 'Pending' : 'Approved';
    return [{
      id: String(earning.creator_earning_id),
      creator_name: cpName,
      creator_roles: creatorRoleNames(creator.primary_role).join(' + ') || 'Creative Partner',
      creator_id: Number(earning.creator_id),
      shoot_id: `#${bookingId}`,
      created_date: dateKey(earning.created_at || earning.submitted_at || earning.approved_at, timezone),
      customer_name: customer,
      shoot_amount: money(booking.budget),
      cp_payout: amount,
      pending_amount: pendingAmount,
      due_date: dueDate,
      status
    }];
  }).sort((a, b) => a.due_date.localeCompare(b.due_date) || a.creator_name.localeCompare(b.creator_name) || a.shoot_id.localeCompare(b.shoot_id));

  const total = rows.length;
  const totalPending = money(rows.reduce((sum, row) => sum + row.pending_amount, 0));
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(Math.max(parseInt(query.page, 10) || 1, 1), totalPages);
  rows = rows.slice((page - 1) * limit, page * limit);
  return { summary: { total_pending: totalPending, total_rows: total }, rows, pagination: { page, limit, total, total_pages: totalPages } };
}

const SHOOT_FAILED_STATUSES = new Set(['failed', 'cancelled', 'canceled', 'declined', 'expired']);

function invoiceStatus(transaction) {
  const status = String(transaction.status || '').toLowerCase();
  if (PAID_TRANSACTION_STATUSES.has(status) || status === 'refunded') return 'Paid';
  if (SHOOT_FAILED_STATUSES.has(status)) return 'Failed';
  return 'Pending';
}

async function getShootHistory(query = {}, now = new Date()) {
  const Op = db.Sequelize.Op;
  const entityType = String(query.entity_type || '').trim().toLowerCase();
  const entityId = String(query.entity_id || '').trim();
  if (!['cp', 'client'].includes(entityType)) throw badRequest('entity_type must be cp or client');
  if (!entityId) throw badRequest('entity_id is required');

  const filters = resolveFilters(query);
  const timezone = filters.timezone;
  const statusFilter = String(query.status || '').trim().toLowerCase(); // paid | pending | failed
  const serviceFilter = String(query.service_type || '').trim();
  const search = String(query.search || '').trim().toLowerCase().replace(/^#/, '');
  const range = periodRange(String(query.period || '').trim(), timezone, now);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 100);

  // 1) Which bookings belong to the selected entity
  let bookingIds = [];
  if (entityType === 'cp') {
    const creatorId = Number(entityId);
    if (!Number.isInteger(creatorId) || creatorId <= 0) throw badRequest('entity_id must be a creator id when entity_type is cp');
    const [earnings, payoutRequests] = await Promise.all([
      db.creator_earnings.findAll({ where: { ...acceptedCompensationWhere(), creator_id: creatorId }, raw: true }),
      db.creator_payout_requests.findAll({ where: { creator_id: creatorId }, raw: true })
    ]);
    const paidByEarning = payoutAmountsByEarningId(payoutRequests);
    const activeEarnings = getCanonicalCpEarningRows(earnings)
      .filter((e) => String(e.status || '').toLowerCase() !== 'cancelled'
        && ACTIVE_CP_APPROVAL_STATUSES.has(String(e.approval_status || '').toLowerCase()));

    const earningBookingIds = [...new Set(activeEarnings.map((e) => Number(e.booking_id)).filter(Boolean))];
    const payoutTxIds = [...new Set(activeEarnings.map((e) => Number(e.finance_transaction_id)).filter(Boolean))];
    const [earningBookings, payoutTxs] = await Promise.all([
      earningBookingIds.length
        ? db.stream_project_booking.findAll({ where: { stream_project_booking_id: { [Op.in]: earningBookingIds } }, attributes: ['stream_project_booking_id', 'event_date'], raw: true })
        : [],
      payoutTxIds.length
        ? db.finance_transactions.findAll({ where: { finance_transaction_id: { [Op.in]: payoutTxIds } }, attributes: ['finance_transaction_id', 'transaction_date'], raw: true })
        : []
    ]);
    const eventBookingById = new Map(earningBookings.map((b) => [Number(b.stream_project_booking_id), b]));
    const payoutTxById = new Map(payoutTxs.map((t) => [Number(t.finance_transaction_id), t]));

    // Same rules as the "Top CPs By Shoots" ranking: paid amount > 0, and the
    // page date range applied to the payout date (or due date while unpaid).
    bookingIds = [...new Set(activeEarnings.filter((e) => {
      const amount = money(e.net_earning_amount);
      const recorded = money(paidByEarning.get(Number(e.creator_earning_id)) || 0);
      const paid = String(e.status || '').toLowerCase() === 'paid'
        ? (recorded > 0 ? Math.min(recorded, amount) : amount)
        : Math.min(recorded, amount);
      if (!(paid > 0)) return false;
      const isPaid = paid >= amount;
      const dueDate = resolveDueDate(e, eventBookingById.get(Number(e.booking_id)));
      const activity = isPaid
        ? (payoutTxById.get(Number(e.finance_transaction_id))?.transaction_date || e.updated_at || e.approved_at || e.created_at)
        : (dueDate ? `${dueDate}T00:00:00.000Z` : e.updated_at || e.created_at);
      return isInRange(activity, filters);
    }).map((e) => Number(e.booking_id)).filter(Boolean))];
  } else {
    const match = /^(user|guest):(.+)$/i.exec(entityId);
    const kind = match ? match[1].toLowerCase() : 'user';
    const value = match ? match[2] : entityId;
    const where = { is_active: 1 };
    if (kind === 'user') {
      const userId = Number(value);
      if (!Number.isInteger(userId) || userId <= 0) throw badRequest('entity_id must be user:<id> or guest:<email> when entity_type is client');
      where.user_id = userId;
    } else {
      where.guest_email = value;
    }
    const owned = await db.stream_project_booking.findAll({ where, attributes: ['stream_project_booking_id'], raw: true });
    bookingIds = owned.map((b) => Number(b.stream_project_booking_id)).filter(Boolean);
  }

  const emptyResult = { rows: [], pagination: { page: 1, limit, total: 0, total_pages: 1 } };
  if (!bookingIds.length) return emptyResult;

  // 2) Real data for those bookings
  const inIds = { [Op.in]: bookingIds };
  const [bookings, breakdowns, paymentHistoryEntries, summaries] = await Promise.all([
    db.stream_project_booking.findAll({
      where: { stream_project_booking_id: inIds },
      attributes: ['stream_project_booking_id', 'project_name', 'shoot_type', 'event_type', 'content_type', 'event_date', 'budget', 'user_id', 'guest_email', 'payment_completed_at', 'created_at'],
      raw: true
    }),
    db.finance_project_breakdowns.findAll({ where: { booking_id: inIds }, raw: true }),
    financeService.getPaymentHistoryEntriesForBookings(bookingIds),
    db.sequelize.query(
      `SELECT booking_id, quote_total, paid_amount, credit_used_amount, due_amount
       FROM booking_payment_summary WHERE booking_id IN (:ids)`,
      { replacements: { ids: bookingIds }, type: db.Sequelize.QueryTypes.SELECT }
    )
  ]);

  const userIds = [...new Set(bookings.map((b) => Number(b.user_id)).filter(Boolean))];
  const users = userIds.length
    ? await db.users.unscoped().findAll({ where: { id: { [Op.in]: userIds } }, attributes: ['id', 'name', 'email'], raw: true })
    : [];
  const userById = new Map(users.map((u) => [Number(u.id), u]));
  const breakdownByBooking = new Map(breakdowns.map((b) => [Number(b.booking_id), b]));
  const summaryByBooking = new Map(summaries.map((s) => [Number(s.booking_id), s]));
  const paymentsByBooking = new Map();
  paymentHistoryEntries.forEach((entry) => {
    const id = Number(entry.booking_id);
    paymentsByBooking.set(id, [...(paymentsByBooking.get(id) || []), entry]);
  });
  paymentsByBooking.forEach((entries) => entries.sort((a, b) => (
    new Date(a.paid_at || a.created_at || 0).getTime() - new Date(b.paid_at || b.created_at || 0).getTime()
    || String(a.payment_history_id || '').localeCompare(String(b.payment_history_id || ''))
  )));

  // 3) One row per shoot
  let rows = bookings.map((booking) => {
    const id = Number(booking.stream_project_booking_id);
    const breakdown = breakdownByBooking.get(id);
    const summary = summaryByBooking.get(id) || {};
    const payments = paymentsByBooking.get(id) || [];

    if (entityType === 'client') {
      const hasEvidence = Boolean(breakdown) || payments.length > 0
        || Number(summary.paid_amount || 0) > 0 || Number(summary.credit_used_amount || 0) > 0;
      if (!hasEvidence) return null;
    }

    const paidPayments = payments.filter((payment) => PAID_TRANSACTION_STATUSES.has(String(payment.status || '').toLowerCase()));
    const paidSum = paidPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    // Use the same recorded payment entries as /admin/finances/transactions.
    // This history groups those transaction rows by shoot, so its total is
    // their sum; quote totals and booking budgets are not transaction amounts.
    const transactionTotal = payments.reduce((sum, payment) => sum + Math.abs(Number(payment.amount || 0)), 0);
    const total = money(transactionTotal);
    const collected = paidSum;

    let status = 'Pending';
    if (paidPayments.length > 0 && total === 0) status = 'Paid';
    else if (collected > 0 && Math.max(total - collected, 0) <= 0) status = 'Paid';
    else if (collected <= 0 && payments.some((payment) => SHOOT_FAILED_STATUSES.has(String(payment.status || '').toLowerCase()))) status = 'Failed';

    const methods = [...new Set(paidPayments.map((payment) => payment.type === 'stripe' ? 'Stripe' : payment.method).filter((method) => method && method !== '—'))];
    const user = userById.get(Number(booking.user_id)) || {};
    const invoices = payments.map((payment) => ({
      id: payment.invoice_number || payment.receipt_number || payment.payment_history_id,
      date: dateKey(payment.paid_at || payment.created_at, timezone),
      method: payment.type === 'stripe' ? 'Stripe' : payment.method || 'Manual',
      status: invoiceStatus(payment),
      amount: money(Math.abs(Number(payment.amount || 0))),
      note: payment.external_reference ? `Ref: ${payment.external_reference}` : ''
    }));

    return {
      id: String(id),
      booking_id: id,
      shoot_id: `#${id}`,
      project_name: booking.project_name || `Shoot #${id}`,
      client_name: clientName(user, booking.guest_email),
      date: dateKey(booking.event_date || paidPayments[0]?.paid_at || paidPayments[0]?.created_at || booking.payment_completed_at || booking.created_at, timezone),
      service_type: serviceTypeLabel(booking),
      total_amount: money(total),
      invoice_count: invoices.length,
      payment_method: methods.length === 0 ? '—' : methods.length === 1 ? methods[0] : 'Multiple',
      status,
      invoices
    };
  }).filter(Boolean);

  // 4) Filters, sort, pagination (server-side)
  rows = rows.filter((row) => {
    if (statusFilter && row.status.toLowerCase() !== statusFilter) return false;
    if (serviceFilter && row.service_type !== serviceFilter) return false;
    if (range && !(row.date && row.date >= range.start && row.date <= range.end)) return false;
    if (entityType !== 'cp' && filters.start_date && !(row.date && row.date >= filters.start_date && row.date <= filters.end_date)) return false;
    if (search) {
      const haystack = `${row.booking_id} ${row.project_name} ${row.client_name} ${row.invoices.map((i) => i.id).join(' ')}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  }).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.booking_id - a.booking_id);

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(Math.max(parseInt(query.page, 10) || 1, 1), totalPages);

  return {
    rows: rows.slice((page - 1) * limit, page * limit),
    pagination: { page, limit, total, total_pages: totalPages }
  };
}

async function getAnalyticsData(query = {}, includeAudit = false) {
  const filters = resolveFilters(query);
  const [breakdowns, transactions, earnings, disputes, payoutRequests, clientPaymentBookings] = await Promise.all([
    db.finance_project_breakdowns.findAll({ raw: true }),
    db.finance_transactions.findAll({ raw: true }),
    db.creator_earnings.findAll({ where: acceptedCompensationWhere(), raw: true }),
    db.finance_disputes.findAll({ raw: true }),
    db.creator_payout_requests.findAll({ raw: true }),
    db.sequelize.query(
      `
        SELECT
          b.stream_project_booking_id AS booking_id,
          b.user_id AS client_user_id,
          b.guest_email,
          b.payment_completed_at,
          COALESCE(ps.quote_total, b.budget, pt.total_amount, mp.paid_amount, 0) AS total_amount,
          COALESCE(ps.paid_amount, pt.total_amount, mp.paid_amount, 0) AS collected_amount,
          COALESCE(ps.due_amount, 0) AS outstanding_amount,
          CASE
            WHEN ps.payment_status IN ('paid', 'partially_paid') THEN ps.payment_status
            WHEN COALESCE(ps.credit_used_amount, 0) > 0 AND COALESCE(ps.due_amount, 0) <= 0 THEN 'paid'
            WHEN pt.status IN ('paid', 'completed', 'success', 'succeeded') THEN 'paid'
            WHEN COALESCE(mp.paid_amount, 0) > 0 THEN 'partially_paid'
            ELSE 'pending'
          END AS payment_status,
          COALESCE(pt.created_at, mp.paid_at, ps.manual_payment_updated_at, b.payment_completed_at, b.created_at) AS activity_date
        FROM stream_project_booking b
        LEFT JOIN booking_payment_summary ps ON ps.booking_id = b.stream_project_booking_id
        LEFT JOIN payment_transactions pt ON pt.payment_id = b.payment_id
        LEFT JOIN (
          SELECT booking_id, SUM(amount) AS paid_amount, MAX(updated_at) AS paid_at
          FROM booking_manual_payments
          GROUP BY booking_id
        ) mp ON mp.booking_id = b.stream_project_booking_id
        WHERE COALESCE(b.is_active, 1) = 1
          AND (
            ps.payment_status IN ('paid', 'partially_paid', 'no_payment_due')
            OR pt.status IN ('paid', 'completed', 'success', 'succeeded')
            OR COALESCE(mp.paid_amount, 0) > 0
            OR EXISTS (
              SELECT 1 FROM sales_leads sl
              WHERE sl.booking_id = b.stream_project_booking_id
                AND sl.lead_status = 'booked'
                AND sl.is_active = 1
            )
          )
      `,
      { type: db.Sequelize.QueryTypes.SELECT }
    )
  ]);
  const bookingIds = [...new Set([
    ...breakdowns.map((row) => Number(row.booking_id)),
    ...earnings.map((row) => Number(row.booking_id)),
    ...clientPaymentBookings.map((row) => Number(row.booking_id))
  ].filter(Boolean))];
  const creatorIds = [...new Set(earnings.map((row) => Number(row.creator_id)).filter(Boolean))];
  const userIds = [...new Set([
    ...breakdowns.map((row) => Number(row.client_user_id)),
    ...transactions.map((row) => Number(row.client_user_id)),
    ...clientPaymentBookings.map((row) => Number(row.client_user_id))
  ].filter(Boolean))];
  const [bookings, creators, users] = await Promise.all([
    db.stream_project_booking.findAll({ where: { stream_project_booking_id: bookingIds.length ? bookingIds : [0] }, raw: true }),
    db.crew_members.findAll({ where: { crew_member_id: creatorIds.length ? creatorIds : [0] }, attributes: ['crew_member_id', 'first_name', 'last_name', 'email', 'primary_role'], raw: true }),
    db.users.unscoped().findAll({ where: { id: userIds.length ? userIds : [0] }, attributes: ['id', 'name', 'email'], raw: true })
  ]);
  return buildAnalyticsData({
    breakdowns, transactions, earnings, disputes, bookings, creators, users, clientPaymentBookings,
    paidAmountsByEarningId: payoutAmountsByEarningId(payoutRequests)
  }, filters, new Date(), includeAudit);
}

const getAnalytics = (query = {}) => getAnalyticsData(query);
const getAnalyticsAudit = (query = {}) => getAnalyticsData(query, true);

module.exports = { getAnalytics, getAnalyticsAudit, getCpPayoutHistory, getCpOverdueHistory, getPayoutScheduleHistory, getShootHistory, _private: { resolveFilters, dateKey, isInRange, buildAnalyticsData, statusForClient, resolveDueDate, outstandingBalance, isOutstandingReceivable, creatorRoleNames } };
