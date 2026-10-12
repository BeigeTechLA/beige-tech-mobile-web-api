const db = require('../models');

const ELIGIBLE_PAYMENT_STATUSES = new Set(['paid', 'partially_paid']);
const PAID_TRANSACTION_STATUSES = new Set(['paid', 'completed', 'success', 'succeeded']);
const REFUND_TRANSACTION_STATUSES = new Set(['paid', 'refunded', 'completed', 'success', 'succeeded']);
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

function buildAnalyticsData(input, filters = resolveFilters(), now = new Date()) {
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

  const breakdownRows = (input.breakdowns || [])
    .map((breakdown) => {
      const bookingId = Number(breakdown.booking_id);
      const booking = bookings.get(bookingId) || {};
      const successfulPayments = (transactionsByBooking.get(bookingId) || [])
        .filter((transaction) => transaction.transaction_type === 'client_payment' && PAID_TRANSACTION_STATUSES.has(String(transaction.status || '').toLowerCase()))
        .sort((a, b) => new Date(a.transaction_date) - new Date(b.transaction_date));
      const activityDate = successfulPayments[0]?.transaction_date || booking.payment_completed_at || breakdown.calculated_at;
      return { ...breakdown, booking, booking_id: bookingId, activity_date: activityDate };
    })
    .filter((row) => isInRange(row.activity_date, filters));
  const eligibleRevenue = breakdownRows
    .filter((breakdown) => ELIGIBLE_PAYMENT_STATUSES.has(String(breakdown.payment_status || '').toLowerCase()));
  const outstandingRows = breakdownRows.filter(isOutstandingReceivable);

  const eligibleBookingIds = new Set(eligibleRevenue.map((row) => row.booking_id));
  const refunds = (input.transactions || [])
    .filter((transaction) => transaction.transaction_type === 'refund'
      && REFUND_TRANSACTION_STATUSES.has(String(transaction.status || '').toLowerCase())
      && (!transaction.booking_id || eligibleBookingIds.has(Number(transaction.booking_id)))
      && isInRange(transaction.transaction_date, filters))
    .map((transaction) => ({ date: dateKey(transaction.transaction_date, filters.timezone), amount: Math.abs(Number(transaction.gross_amount || transaction.net_amount || 0)) }));

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

  const cpRows = (input.earnings || [])
    .filter((earning) => eligibleBookingIds.has(Number(earning.booking_id)))
    .filter((earning) => String(earning.status || '').toLowerCase() !== 'cancelled' && String(earning.approval_status || '').toLowerCase() !== 'rejected')
    .map((earning) => {
      const booking = bookings.get(Number(earning.booking_id)) || {};
      const payoutTransaction = transactionById.get(Number(earning.finance_transaction_id));
      const dueDate = resolveDueDate(earning, booking);
      const isPaid = String(earning.status || '').toLowerCase() === 'paid';
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
        amount: money(earning.net_earning_amount)
      };
    })
    .filter((earning) => isInRange(earning.activity_date, filters));

  cpRows.forEach((row) => revenueSeriesRows.push({
    date: dateKey(row.activity_date, filters.timezone), gross: 0, pending: 0, cp_payout: row.amount, refunds: 0
  }));

  const paidCpPayout = money(cpRows.filter((row) => row.is_paid).reduce((sum, row) => sum + row.amount, 0));
  const payableCpPayout = money(cpRows.filter((row) => !row.is_paid).reduce((sum, row) => sum + row.amount, 0));
  const cpPayout = money(paidCpPayout + payableCpPayout);

  const revenueByBooking = new Map(eligibleRevenue.map((row) => [row.booking_id, Number(row.total_amount || 0)]));
  const cpByCreator = new Map();
  cpRows.forEach((row) => {
    const id = Number(row.creator_id);
    const current = cpByCreator.get(id) || { id: String(id), name: creatorName(row.creator), payout: 0, shoots: new Set(), shoot_revenue: 0 };
    current.payout += row.amount;
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

  const cpBookingIds = new Set(cpRows.map((row) => Number(row.booking_id)));
  const averageCpPayout = cpRows.length ? money(cpPayout / cpRows.length) : 0;
  const averageCpMargin = percent(cpPayout, grossRevenue);
  const averageCpsPerShoot = cpBookingIds.size ? Number((cpRows.length / cpBookingIds.size).toFixed(2)) : 0;
  const today = dateKey(now, filters.timezone);
  const overdueByCreator = new Map();
  cpRows.filter((row) => !row.is_paid && row.due_date && row.due_date < today).forEach((row) => {
    const id = Number(row.creator_id);
    const current = overdueByCreator.get(id) || {
      id: String(id), name: creatorName(row.creator), roles: creatorRoleNames(row.creator.primary_role),
      amount: 0, days_overdue: 0
    };
    current.amount += row.amount;
    current.days_overdue = Math.max(current.days_overdue, Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${row.due_date}T00:00:00Z`)) / 86400000));
    overdueByCreator.set(id, current);
  });
  const topOverdue = Array.from(overdueByCreator.values())
    .map((row) => ({ ...row, amount: money(row.amount) }))
    .sort((a, b) => b.amount - a.amount).slice(0, 100);
  const timeline = [
    { id: 'this_week', label: 'This Week', segments: { upcoming: 0, dueSoon: 0, later: 0, overdue: 0 } },
    { id: 'next_week', label: 'Next Week', segments: { upcoming: 0, dueSoon: 0, later: 0, overdue: 0 } },
    { id: '2_4_weeks', label: '2-4 Weeks', segments: { upcoming: 0, dueSoon: 0, later: 0, overdue: 0 } },
    { id: 'overdue', label: 'Overdue', segments: { upcoming: 0, dueSoon: 0, later: 0, overdue: 0 } }
  ];
  cpRows.filter((row) => !row.is_paid && row.due_date).forEach((row) => {
    const days = Math.floor((Date.parse(`${row.due_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
    if (days < 0) timeline[3].segments.overdue += row.amount;
    else if (days <= 6) timeline[0].segments.upcoming += row.amount;
    else if (days <= 13) timeline[1].segments.dueSoon += row.amount;
    else if (days <= 27) timeline[2].segments.later += row.amount;
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
  // Rankings and payment overview both include every client with a finance record,
  // so the client payment-state filter can return pending clients too.
  const clientRows = makeClientRows(breakdownRows);
  const topClientRows = clientRows;
  const topClientsByShoots = [...topClientRows].sort((a, b) => b.shoots - a.shoots || b.spend - a.spend).slice(0, 100);
  const topClientsBySpend = [...topClientRows].sort((a, b) => b.spend - a.spend).slice(0, 100);
  const paymentOverview = ['fully_paid', 'partially_paid', 'pending'].map((id) => ({ id, label: id === 'fully_paid' ? 'Fully Paid' : id === 'partially_paid' ? 'Partially Paid' : 'Pending', clients: clientRows.filter((row) => row.status === id).length }));
  const collectedAmount = money(breakdownRows.reduce((sum, row) => sum + Number(row.collected_amount || 0), 0));
  const recoveredRows = (input.transactions || []).filter((transaction) => transaction.transaction_type === 'client_payment' && PAID_TRANSACTION_STATUSES.has(String(transaction.status || '').toLowerCase()) && eligibleBookingIds.has(Number(transaction.booking_id)) && isInRange(transaction.transaction_date, filters)).map((transaction) => ({ date: dateKey(transaction.transaction_date, filters.timezone), value: Number(transaction.gross_amount || 0) }));
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
    }
  };
}

async function getAnalytics(query = {}) {
  const filters = resolveFilters(query);
  const [breakdowns, transactions, earnings, disputes] = await Promise.all([
    db.finance_project_breakdowns.findAll({ raw: true }),
    db.finance_transactions.findAll({ raw: true }),
    db.creator_earnings.findAll({ raw: true }),
    db.finance_disputes.findAll({ raw: true })
  ]);
  const bookingIds = [...new Set([...breakdowns.map((row) => Number(row.booking_id)), ...earnings.map((row) => Number(row.booking_id))].filter(Boolean))];
  const creatorIds = [...new Set(earnings.map((row) => Number(row.creator_id)).filter(Boolean))];
  const userIds = [...new Set([...breakdowns.map((row) => Number(row.client_user_id)), ...transactions.map((row) => Number(row.client_user_id))].filter(Boolean))];
  const [bookings, creators, users] = await Promise.all([
    db.stream_project_booking.findAll({ where: { stream_project_booking_id: bookingIds.length ? bookingIds : [0] }, raw: true }),
    db.crew_members.findAll({ where: { crew_member_id: creatorIds.length ? creatorIds : [0] }, attributes: ['crew_member_id', 'first_name', 'last_name', 'email', 'primary_role'], raw: true }),
    db.users.unscoped().findAll({ where: { id: userIds.length ? userIds : [0] }, attributes: ['id', 'name', 'email'], raw: true })
  ]);
  return buildAnalyticsData({ breakdowns, transactions, earnings, disputes, bookings, creators, users }, filters);
}

module.exports = { getAnalytics, _private: { resolveFilters, dateKey, isInRange, buildAnalyticsData, statusForClient, resolveDueDate, outstandingBalance, isOutstandingReceivable, creatorRoleNames } };
