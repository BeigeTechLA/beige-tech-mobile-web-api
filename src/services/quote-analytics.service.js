const { Op } = require('sequelize');
const db = require('../models');
const { expireQuotesPastValidUntil } = require('./sales-quote-expiration.service');
const leadAssignmentService = require('./lead-assignment.service');

const DATE_PRESETS = [
  'all_time',
  'today',
  'yesterday',
  'last_7_days',
  'last_30_days',
  'this_month',
  'last_month',
  'this_quarter',
  'last_quarter',
  'year_to_date',
  'custom'
];
// `expired` is intentionally omitted as a fallback: draft quotes can expire too.
// A genuinely sent expired quote is still included through its persisted sent_at.
const SENT_STATUSES = new Set(['sent', 'viewed', 'accepted', 'partially_paid', 'paid', 'rejected']);
const ACTIVE_STATUSES = new Set(['sent', 'viewed', 'accepted', 'partially_paid']);
const FULLY_PAID_STATUSES = new Set(['paid', 'no_payment_due', 'completed', 'success', 'succeeded']);
const QUOTE_STATUSES = ['draft', 'pending', 'partially_paid', 'sent', 'viewed', 'accepted', 'paid', 'rejected', 'expired'];
const PAYMENT_STATUSES = ['unpaid', 'partially_paid', 'paid', 'refunded'];
const CUSTOMER_TYPES = ['new', 'returning'];
const OVERDUE_HOURS = 48;

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function toPlain(value) {
  return value && typeof value.toJSON === 'function' ? value.toJSON() : value;
}

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function roundPercent(value) {
  return Number(Number(value || 0).toFixed(2));
}

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function startOfMonth(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfQuarter(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
}

function addMonths(value, months) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function formatDate(value) {
  const date = new Date(value);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function parseDateOnly(value, fieldName) {
  const input = String(value || '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!match) throw badRequest(`${fieldName} must use YYYY-MM-DD format`);

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (formatDate(date) !== input) throw badRequest(`${fieldName} is not a valid date`);
  return date;
}

function resolveDateRange(query = {}, nowValue = new Date()) {
  // Analytics opens on All Time.  Keeping this default in the API (rather than
  // relying on the client to send a parameter) also makes direct API consumers
  // and rep drill-downs consistent with the dashboard.
  const preset = String(query.date_preset || 'all_time').trim().toLowerCase();
  if (!DATE_PRESETS.includes(preset)) {
    throw badRequest(`date_preset must be one of: ${DATE_PRESETS.join(', ')}`);
  }

  const today = startOfDay(nowValue);
  const tomorrow = addDays(today, 1);
  let start;
  let endExclusive;

  if (preset === 'all_time') {
    // The exact first sent quote is resolved after filters have been applied so
    // the chart begins at useful data instead of rendering empty historical
    // months. `isInRange` treats this preset as unbounded.
    start = new Date(0);
    endExclusive = tomorrow;
  } else if (preset === 'today') {
    start = today;
    endExclusive = tomorrow;
  } else if (preset === 'yesterday') {
    start = addDays(today, -1);
    endExclusive = today;
  } else if (preset === 'last_7_days') {
    start = addDays(today, -6);
    endExclusive = tomorrow;
  } else if (preset === 'last_30_days') {
    start = addDays(today, -29);
    endExclusive = tomorrow;
  } else if (preset === 'this_month') {
    start = startOfMonth(today);
    endExclusive = tomorrow;
  } else if (preset === 'last_month') {
    start = addMonths(startOfMonth(today), -1);
    endExclusive = startOfMonth(today);
  } else if (preset === 'this_quarter') {
    start = startOfQuarter(today);
    endExclusive = tomorrow;
  } else if (preset === 'last_quarter') {
    endExclusive = startOfQuarter(today);
    start = addMonths(endExclusive, -3);
  } else if (preset === 'year_to_date') {
    start = new Date(today.getFullYear(), 0, 1);
    endExclusive = tomorrow;
  } else {
    if (!query.start_date || !query.end_date) {
      throw badRequest('start_date and end_date are required when date_preset is custom');
    }
    start = parseDateOnly(query.start_date, 'start_date');
    const end = parseDateOnly(query.end_date, 'end_date');
    if (start > end) throw badRequest('start_date cannot be after end_date');
    endExclusive = addDays(end, 1);
  }

  return {
    preset,
    start,
    endExclusive,
    start_date: formatDate(start),
    end_date: formatDate(addDays(endExclusive, -1))
  };
}

function parseCsv(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  return source.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
}

function parseNumberCsv(value, fieldName) {
  const values = parseCsv(value);
  const numbers = values.map(Number);
  if (numbers.some((item) => !Number.isInteger(item) || item <= 0)) {
    throw badRequest(`${fieldName} must contain positive numeric IDs`);
  }
  return numbers;
}

function normalizeFilterQuery(query = {}) {
  return {
    salesRepIds: parseNumberCsv(query.sales_rep_id, 'sales_rep_id'),
    shootTypes: parseCsv(query.shoot_type),
    quoteStatuses: parseCsv(query.quote_status),
    paymentStatuses: parseCsv(query.payment_status),
    leadSources: parseCsv(query.lead_source),
    customerTypes: parseCsv(query.customer_type)
  };
}

function getQuoteRepId(quote) {
  return Number(quote.assigned_sales_rep_id || quote.created_by_user_id || 0) || null;
}

function getQuoteSentAt(quote) {
  if (quote.sent_at) return new Date(quote.sent_at);
  return SENT_STATUSES.has(String(quote.status || '').toLowerCase()) && quote.created_at
    ? new Date(quote.created_at)
    : null;
}

function getCustomerKey(quote) {
  if (quote.client_id) return `client:${quote.client_id}`;
  if (quote.client_user_id) return `user:${quote.client_user_id}`;
  const email = String(quote.client_email || '').trim().toLowerCase();
  return email ? `email:${email}` : `quote:${quote.sales_quote_id}`;
}

function parseActivityData(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function resolvePaymentState({ quote, paymentSummary = null, invoiceHistory = null, paymentActivities = [] }) {
  const quoteTotal = roundMoney(quote.total);
  const summaryStatus = String(paymentSummary?.payment_status || '').trim().toLowerCase();
  const summaryPaid = Math.max(0, Number(paymentSummary?.paid_amount || 0));
  const summaryCredit = Math.max(0, Number(paymentSummary?.credit_used_amount || 0));
  const summaryDue = paymentSummary
    ? Math.max(0, Number(paymentSummary.due_amount ?? (quoteTotal - summaryPaid - summaryCredit)))
    : null;

  const manualEntries = paymentActivities
    .map((activity) => parseActivityData(activity.activity_data))
    .filter((entry) => entry && String(entry.payment_method || '').toLowerCase() === 'manual');
  const manualFull = manualEntries.some((entry) => String(entry.payment_type || '').toLowerCase() === 'full');
  const manualPartial = manualEntries.reduce((sum, entry) => {
    if (String(entry.payment_type || '').toLowerCase() !== 'partial') return sum;
    return sum + Math.max(0, Number(entry.amount || 0));
  }, 0);

  let collectedAmount = paymentSummary ? summaryPaid : (manualFull ? quoteTotal : manualPartial);
  let effectivePaidAmount = paymentSummary ? summaryPaid + summaryCredit : collectedAmount;
  let fullPaid = Boolean(
    quoteTotal > 0 && paymentSummary && (
      effectivePaidAmount >= quoteTotal ||
      (summaryDue <= 0 && FULLY_PAID_STATUSES.has(summaryStatus))
    )
  );

  if (!paymentSummary && invoiceHistory?.payment_status === 'paid') {
    collectedAmount = quoteTotal;
    effectivePaidAmount = quoteTotal;
    fullPaid = quoteTotal > 0;
  }
  if (!paymentSummary && manualFull) {
    collectedAmount = quoteTotal;
    effectivePaidAmount = quoteTotal;
    fullPaid = quoteTotal > 0;
  }
  if (!paymentSummary && !invoiceHistory && !manualEntries.length && quote.status === 'paid') {
    collectedAmount = quoteTotal;
    effectivePaidAmount = quoteTotal;
    fullPaid = quoteTotal > 0;
  }

  const isRefunded = summaryStatus === 'refunded';
  if (isRefunded) {
    collectedAmount = 0;
    effectivePaidAmount = 0;
    fullPaid = false;
  }
  collectedAmount = roundMoney(Math.min(collectedAmount, quoteTotal));
  effectivePaidAmount = roundMoney(Math.min(effectivePaidAmount, quoteTotal));
  const outstandingAmount = roundMoney(Math.max(quoteTotal - effectivePaidAmount, 0));
  const paymentStatus = isRefunded
    ? 'refunded'
    : fullPaid
      ? 'paid'
      : collectedAmount > 0
        ? 'partially_paid'
        : 'unpaid';

  return {
    paymentStatus,
    collectedAmount,
    outstandingAmount,
    fullPaid
  };
}

function applyFilters(records, filters) {
  return records.filter((record) => {
    if (filters.salesRepIds.length && !filters.salesRepIds.includes(record.repId)) return false;
    if (filters.shootTypes.length && !filters.shootTypes.includes(record.shootTypeKey)) return false;
    if (filters.quoteStatuses.length && !filters.quoteStatuses.includes(record.quoteStatus)) return false;
    if (filters.paymentStatuses.length && !filters.paymentStatuses.includes(record.paymentStatus)) return false;
    if (filters.leadSources.length && !filters.leadSources.includes(record.leadSourceKey)) return false;
    if (filters.customerTypes.length && !filters.customerTypes.includes(record.customerType)) return false;
    return true;
  });
}

function isInRange(value, range) {
  if (range.preset === 'all_time') return Boolean(value);
  if (!value) return false;
  const date = new Date(value);
  return date >= range.start && date < range.endExclusive;
}

function isOpenPipeline(record) {
  return ACTIVE_STATUSES.has(record.quoteStatus) && !record.fullPaid && record.paymentStatus !== 'refunded';
}

function getPipelineStatus(record) {
  if (record.paymentStatus === 'partially_paid' || record.quoteStatus === 'partially_paid') return 'partially_paid';
  if (record.quoteStatus === 'accepted') return 'accepted';
  return 'sent';
}

function isOverdue(record, nowValue = new Date()) {
  if (!isOpenPipeline(record)) return false;
  const sentTime = record.sentAt ? new Date(record.sentAt).getTime() : 0;
  const contactedTime = record.lastContactedAt ? new Date(record.lastContactedAt).getTime() : 0;
  const reference = Math.max(sentTime, contactedTime);
  if (!reference) return false;
  return reference <= new Date(nowValue).getTime() - OVERDUE_HOURS * 60 * 60 * 1000;
}

function emptyStatusBreakdown() {
  return ['sent', 'accepted', 'partially_paid'].map((status) => ({ status, count: 0, value: 0 }));
}

function summarizeCurrentState(records, nowValue = new Date()) {
  const pipelineRecords = records.filter(isOpenPipeline);
  const overdueRecords = pipelineRecords.filter((record) => isOverdue(record, nowValue));

  const summarize = (items) => {
    const byStatus = emptyStatusBreakdown();
    items.forEach((record) => {
      const bucket = byStatus.find((item) => item.status === getPipelineStatus(record));
      bucket.count += 1;
      bucket.value = roundMoney(bucket.value + record.outstandingAmount);
    });
    return {
      count: items.length,
      value: roundMoney(items.reduce((sum, record) => sum + record.outstandingAmount, 0)),
      by_status: byStatus
    };
  };

  return {
    open_pipeline: summarize(pipelineRecords),
    overdue_follow_ups: summarize(overdueRecords)
  };
}

function summarizeCohort(records) {
  const quoteValue = roundMoney(records.reduce((sum, record) => sum + record.quoteValue, 0));
  const wonRecords = records.filter((record) => record.fullPaid);
  const wonRevenue = roundMoney(wonRecords.reduce((sum, record) => sum + record.quoteValue, 0));
  const collectedRevenue = roundMoney(records.reduce((sum, record) => sum + record.collectedAmount, 0));
  const quotesSent = records.length;
  const dealsWon = wonRecords.length;

  return {
    quote_value: quoteValue,
    quotes_sent: quotesSent,
    deals_won: dealsWon,
    won_revenue: wonRevenue,
    collected_revenue: collectedRevenue,
    win_rate: quotesSent ? roundPercent((dealsWon / quotesSent) * 100) : 0,
    quote_to_cash_conversion: quoteValue ? roundPercent((collectedRevenue / quoteValue) * 100) : 0,
    average_deal_size: dealsWon ? roundMoney(wonRevenue / dealsWon) : 0
  };
}

function createSixMonthChartBuckets(nowValue = new Date()) {
  const currentMonth = startOfMonth(nowValue);
  const start = addMonths(currentMonth, -5);
  const endExclusive = addMonths(currentMonth, 1);
  const buckets = [];

  for (let cursor = start; cursor < endExclusive; cursor = addMonths(cursor, 1)) {
    buckets.push({
      key: formatDate(cursor).slice(0, 7),
      date: formatDate(cursor),
      records: []
    });
  }

  return { buckets, start, endExclusive };
}

function buildPerformanceChart(records, nowValue = new Date()) {
  const { buckets, start, endExclusive } = createSixMonthChartBuckets(nowValue);
  const map = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  records.forEach((record) => {
    const date = new Date(record.sentAt);
    if (Number.isNaN(date.getTime()) || date < start || date >= endExclusive) return;
    const key = formatDate(date).slice(0, 7);
    map.get(key)?.records.push(record);
  });

  return buckets.map((bucket) => ({ date: bucket.date, ...summarizeCohort(bucket.records) }));
}

function buildRepPerformance(segmentedRecords, cohortRecords, nowValue = new Date()) {
  const repIds = Array.from(new Set(segmentedRecords.map((record) => record.repId).filter(Boolean)));
  return repIds.map((repId) => {
    const allForRep = segmentedRecords.filter((record) => record.repId === repId);
    const cohortForRep = cohortRecords.filter((record) => record.repId === repId);
    const rep = allForRep.find((record) => record.salesRep)?.salesRep || { id: repId, name: 'Unassigned', email: null };
    return {
      rep_id: repId,
      rep_name: rep.name || rep.email || `Rep ${repId}`,
      rep_email: rep.email || null,
      ...summarizeCohort(cohortForRep),
      ...summarizeCurrentState(allForRep, nowValue)
    };
  }).sort((left, right) => right.won_revenue - left.won_revenue || left.rep_name.localeCompare(right.rep_name));
}

function getDefinitions() {
  return {
    quote_value: 'Total value of quotes sent in the selected period.',
    quotes_sent: 'Number of quotes sent in the selected period.',
    deals_won: 'Sent quotes for which full payment has been completed.',
    won_revenue: 'Total quote value of fully paid deals won.',
    collected_revenue: 'Actual cash collected from sent quotes, including partial payments.',
    win_rate: 'Deals won divided by quotes sent, multiplied by 100.',
    quote_to_cash_conversion: 'Actual collected revenue, including partial payments, divided by quote value, multiplied by 100.',
    average_deal_size: 'Won revenue divided by deals won.',
    open_pipeline: 'Current outstanding value of sent, accepted, or partially paid quotes that are not paid, rejected, or expired.',
    overdue_follow_ups: `Current active unpaid quotes whose last sales contact (or sent time when never contacted) is at least ${OVERDUE_HOURS} hours old.`
  };
}

function buildAccessWhere(user) {
  const role = String(user?.role || '').trim().toLowerCase().replace(/\s+/g, '_');
  return role === 'client' ? { client_user_id: user.userId } : {};
}

async function loadAnalyticsRecords(user = {}, nowValue = new Date()) {
  const quoteRows = await db.sales_quotes.findAll({
    where: buildAccessWhere(user),
    attributes: [
      'sales_quote_id',
      'quote_number',
      'lead_id',
      'client_user_id',
      'client_id',
      'created_by_user_id',
      'assigned_sales_rep_id',
      'status',
      'client_name',
      'client_email',
      'client_phone',
      'project_description',
      'video_shoot_type',
      'quote_validity_days',
      'valid_until',
      'total',
      'sent_at',
      'created_at',
      'updated_at'
    ],
    include: [
      { model: db.users.unscoped(), as: 'assigned_sales_rep', attributes: ['id', 'name', 'email'], required: false },
      { model: db.users.unscoped(), as: 'created_by', attributes: ['id', 'name', 'email'], required: false }
    ],
    order: [['created_at', 'ASC'], ['sales_quote_id', 'ASC']]
  });
  const quotes = quoteRows.map(toPlain);
  if (!quotes.length) return [];

  const quoteIds = quotes.map((quote) => Number(quote.sales_quote_id));
  const leadIds = Array.from(new Set(quotes.map((quote) => Number(quote.lead_id || 0)).filter(Boolean)));
  const [summaryRows, invoiceRows, leadRows, activityRows] = await Promise.all([
    db.sequelize.query(
      `SELECT * FROM booking_payment_summary
       WHERE sales_quote_id IN (:quoteIds)
       ORDER BY updated_at DESC, booking_payment_summary_id DESC`,
      { replacements: { quoteIds }, type: db.Sequelize.QueryTypes.SELECT }
    ),
    db.invoice_send_history
      ? db.invoice_send_history.findAll({
          where: { quote_id: { [Op.in]: quoteIds } },
          order: [['sent_at', 'DESC'], ['invoice_send_history_id', 'DESC']]
        })
      : [],
    leadIds.length
      ? db.sales_leads.findAll({ where: { lead_id: { [Op.in]: leadIds } }, raw: true })
      : [],
    leadIds.length
      ? db.sales_lead_activities.findAll({
          where: {
            lead_id: { [Op.in]: leadIds },
            activity_type: { [Op.in]: ['payment_completed', 'contacted_sales'] }
          },
          order: [['created_at', 'DESC']],
          raw: true
        })
      : []
  ]);

  const summariesByQuote = new Map();
  summaryRows.forEach((summary) => {
    const quoteId = Number(summary.sales_quote_id || 0);
    if (quoteId && !summariesByQuote.has(quoteId)) summariesByQuote.set(quoteId, summary);
  });
  const invoicesByQuote = new Map();
  invoiceRows.map(toPlain).forEach((invoice) => {
    const quoteId = Number(invoice.quote_id || 0);
    if (quoteId && !invoicesByQuote.has(quoteId)) invoicesByQuote.set(quoteId, invoice);
  });
  const leadsById = new Map(leadRows.map((lead) => [Number(lead.lead_id), lead]));
  const paymentActivitiesByLead = new Map();
  const latestContactByLead = new Map();
  activityRows.forEach((activity) => {
    const leadId = Number(activity.lead_id || 0);
    if (activity.activity_type === 'payment_completed') {
      if (!paymentActivitiesByLead.has(leadId)) paymentActivitiesByLead.set(leadId, []);
      paymentActivitiesByLead.get(leadId).push(activity);
    }
    if (activity.activity_type === 'contacted_sales' && !latestContactByLead.has(leadId)) {
      latestContactByLead.set(leadId, activity.created_at);
    }
  });

  const earliestSentByCustomer = new Map();
  quotes.forEach((quote) => {
    const sentAt = getQuoteSentAt(quote);
    if (!sentAt) return;
    const key = getCustomerKey(quote);
    const existing = earliestSentByCustomer.get(key);
    if (!existing || sentAt < existing) earliestSentByCustomer.set(key, sentAt);
  });

  return quotes.map((quote) => {
    const quoteId = Number(quote.sales_quote_id);
    const leadId = Number(quote.lead_id || 0);
    const lead = leadsById.get(leadId) || null;
    const sentAt = getQuoteSentAt(quote);
    const customerFirstSent = earliestSentByCustomer.get(getCustomerKey(quote));
    const payment = resolvePaymentState({
      quote,
      paymentSummary: summariesByQuote.get(quoteId),
      invoiceHistory: invoicesByQuote.get(quoteId),
      paymentActivities: paymentActivitiesByLead.get(leadId) || []
    });
    const salesRep = quote.assigned_sales_rep || quote.created_by || null;
    const shootType = String(quote.video_shoot_type || '').trim();
    const leadSource = String(lead?.lead_source || '').trim();
    const lastContactedAt = latestContactByLead.get(leadId) || lead?.contacted_sales_at || null;

    return {
      quote,
      quoteId,
      quoteStatus: String(quote.status || '').toLowerCase(),
      quoteValue: roundMoney(quote.total),
      sentAt,
      repId: getQuoteRepId(quote),
      salesRep,
      shootType,
      shootTypeKey: shootType.toLowerCase(),
      leadSource,
      leadSourceKey: leadSource.toLowerCase(),
      customerType: sentAt && customerFirstSent && sentAt.getTime() > customerFirstSent.getTime() ? 'returning' : 'new',
      lastContactedAt,
      ...payment,
      overdue: false,
      nowValue
    };
  });
}

function buildAnalyticsData(records, query = {}, nowValue = new Date()) {
  const range = resolveDateRange(query, nowValue);
  const filters = normalizeFilterQuery(query);
  const segmentedRecords = applyFilters(records, filters);
  const cohortRecords = segmentedRecords.filter((record) => isInRange(record.sentAt, range));
  const currentState = summarizeCurrentState(segmentedRecords, nowValue);

  return {
    filters: {
      date_preset: range.preset,
      start_date: range.start_date,
      end_date: range.end_date,
      sales_rep_id: filters.salesRepIds,
      shoot_type: filters.shootTypes,
      quote_status: filters.quoteStatuses,
      payment_status: filters.paymentStatuses,
      lead_source: filters.leadSources,
      customer_type: filters.customerTypes
    },
    overview: {
      ...summarizeCohort(cohortRecords),
      ...currentState
    },
    // This visualization is intentionally a rolling six-month trend. Date
    // filters continue to control the dashboard totals above it; non-date
    // filters (rep, status, source, etc.) are still applied to the chart.
    performance_chart: buildPerformanceChart(segmentedRecords, nowValue),
    rep_performance: buildRepPerformance(segmentedRecords, cohortRecords, nowValue),
    definitions: getDefinitions()
  };
}

async function getAnalytics(query, user) {
  await expireQuotesPastValidUntil();
  const nowValue = new Date();
  const records = await loadAnalyticsRecords(user, nowValue);
  return buildAnalyticsData(records, query, nowValue);
}

function uniqueOptions(records, key, labelKey = key) {
  const map = new Map();
  records.forEach((record) => {
    const value = String(record[key] || '').trim();
    const label = String(record[labelKey] || value).trim();
    if (value && !map.has(value.toLowerCase())) map.set(value.toLowerCase(), { value, label });
  });
  return Array.from(map.values()).sort((left, right) => left.label.localeCompare(right.label));
}

async function getAnalyticsFilters(user) {
  await expireQuotesPastValidUntil();
  const isClient = String(user?.role || '').trim().toLowerCase().replace(/\s+/g, '_') === 'client';
  const [records, activeSalesReps] = await Promise.all([
    loadAnalyticsRecords(user),
    isClient
      ? Promise.resolve([])
      : leadAssignmentService.getActiveSalesReps({ attributes: ['id', 'name', 'email'] })
  ]);
  const reps = new Map();
  activeSalesReps.map(toPlain).forEach((rep) => {
    reps.set(Number(rep.id), {
      id: Number(rep.id),
      name: rep.name || rep.email || `Rep ${rep.id}`,
      email: rep.email || null
    });
  });
  records.forEach((record) => {
    if (record.repId && record.salesRep) {
      reps.set(record.repId, {
        id: record.repId,
        name: record.salesRep.name || record.salesRep.email || `Rep ${record.repId}`,
        email: record.salesRep.email || null
      });
    }
  });

  return {
    sales_reps: Array.from(reps.values()).sort((left, right) => left.name.localeCompare(right.name)),
    shoot_types: uniqueOptions(records, 'shootType'),
    quote_statuses: QUOTE_STATUSES.map((value) => ({ value, label: value.replace(/_/g, ' ') })),
    payment_statuses: PAYMENT_STATUSES.map((value) => ({ value, label: value.replace(/_/g, ' ') })),
    lead_sources: uniqueOptions(records, 'leadSource'),
    customer_types: CUSTOMER_TYPES.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) })),
    date_presets: DATE_PRESETS.map((value) => ({ value, label: value.replace(/_/g, ' ') }))
  };
}

function buildQueryString(query, overrides = {}) {
  const params = new URLSearchParams();
  Object.entries({ ...query, ...overrides }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  return params.toString();
}

async function getRepAnalytics(salesRepId, query, user) {
  const repId = Number(salesRepId);
  if (!Number.isInteger(repId) || repId <= 0) throw badRequest('salesRepId must be a positive numeric ID');
  const rep = await db.users.unscoped().findByPk(repId, { attributes: ['id', 'name', 'email'] });
  if (!rep) {
    const error = new Error('Sales representative not found');
    error.statusCode = 404;
    throw error;
  }

  const analytics = await getAnalytics({ ...query, sales_rep_id: repId }, user);
  const baseQuery = { ...query, sales_rep_id: repId };
  return {
    sales_rep: toPlain(rep),
    ...analytics,
    drilldowns: {
      deals_won: `/v1/sales/quotes/analytics/quotes?${buildQueryString(baseQuery, { bucket: 'deals_won' })}`,
      open_pipeline: `/v1/sales/quotes/analytics/quotes?${buildQueryString(baseQuery, { bucket: 'open_pipeline' })}`,
      overdue_follow_ups: `/v1/sales/quotes/analytics/quotes?${buildQueryString(baseQuery, { bucket: 'overdue_follow_ups' })}`
    }
  };
}

function getDaysOpen(record, nowValue = new Date()) {
  const openedAt = record.sentAt || record.quote.created_at;
  if (!openedAt) return 0;
  const isClosed = record.fullPaid || ['rejected', 'expired'].includes(record.quoteStatus);
  const end = isClosed && record.quote.updated_at ? new Date(record.quote.updated_at) : new Date(nowValue);
  return Math.max(0, Math.floor((startOfDay(end) - startOfDay(openedAt)) / 86400000));
}

function toQuoteCard(record, nowValue = new Date()) {
  const quote = record.quote;
  return {
    sales_quote_id: record.quoteId,
    quote_number: quote.quote_number,
    quote_date: record.sentAt || quote.created_at || null,
    client: {
      id: quote.client_id || quote.client_user_id || null,
      name: quote.client_name || null,
      email: quote.client_email || null,
      phone: quote.client_phone || null,
      type: record.customerType
    },
    project: quote.project_description || null,
    days_open: getDaysOpen(record, nowValue),
    quote_value: record.quoteValue,
    collected_amount: record.collectedAmount,
    outstanding_amount: record.outstandingAmount,
    quote_status: record.quoteStatus,
    payment_status: record.paymentStatus,
    lead_source: record.leadSource || null,
    shoot_type: record.shootType || null,
    sales_rep: record.salesRep ? {
      id: record.repId,
      name: record.salesRep.name || null,
      email: record.salesRep.email || null
    } : null,
    validity: {
      days: quote.quote_validity_days || null,
      valid_until: quote.valid_until || null,
      is_expired: record.quoteStatus === 'expired'
    },
    sent_at: record.sentAt || null,
    last_follow_up_at: record.lastContactedAt || null
  };
}

async function listAnalyticsQuotes(query, user) {
  await expireQuotesPastValidUntil();
  const bucket = String(query.bucket || '').trim().toLowerCase();
  if (!['open_pipeline', 'overdue_follow_ups', 'deals_won'].includes(bucket)) {
    throw badRequest('bucket must be open_pipeline, overdue_follow_ups, or deals_won');
  }

  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
  if (!Number.isInteger(page) || !Number.isInteger(limit)) throw badRequest('page and limit must be integers');

  const nowValue = new Date();
  const records = await loadAnalyticsRecords(user, nowValue);
  const range = resolveDateRange(query, nowValue);
  const filters = normalizeFilterQuery(query);
  let matching = applyFilters(records, filters);

  if (bucket === 'deals_won') {
    matching = matching.filter((record) => record.fullPaid && isInRange(record.sentAt, range));
  } else if (bucket === 'open_pipeline') {
    matching = matching.filter(isOpenPipeline);
    if (query.status) {
      const statuses = parseCsv(query.status);
      const validStatuses = ['sent', 'accepted', 'partially_paid'];
      if (statuses.some((status) => !validStatuses.includes(status))) {
        throw badRequest(`status must be one of: ${validStatuses.join(', ')}`);
      }
      matching = matching.filter((record) => statuses.includes(getPipelineStatus(record)));
    }
  } else {
    matching = matching.filter((record) => isOverdue(record, nowValue));
  }

  matching.sort((left, right) => new Date(right.sentAt || 0) - new Date(left.sentAt || 0));
  const offset = (page - 1) * limit;
  return {
    bucket,
    pagination: {
      page,
      limit,
      total: matching.length,
      total_pages: Math.ceil(matching.length / limit)
    },
    rows: matching.slice(offset, offset + limit).map((record) => toQuoteCard(record, nowValue))
  };
}

module.exports = {
  getAnalytics,
  getAnalyticsFilters,
  getRepAnalytics,
  listAnalyticsQuotes,
  _private: {
    resolveDateRange,
    resolvePaymentState,
    summarizeCohort,
    summarizeCurrentState,
    buildAnalyticsData,
    getQuoteSentAt,
    isOverdue
  }
};
