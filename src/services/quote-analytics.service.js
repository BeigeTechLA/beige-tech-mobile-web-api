const db = require('../models');

const QUOTE_STATUSES = new Set(['draft', 'pending', 'partially_paid', 'sent', 'viewed', 'accepted', 'paid', 'rejected', 'expired']);
const PIPELINE_STATUSES = ['sent', 'accepted', 'partially_paid'];
const MAX_LIMIT = 100;

function createValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function number(value) { return Number(Number(value || 0).toFixed(2)); }
function percent(numerator, denominator) { return denominator ? number((numerator / denominator) * 100) : 0; }

function parseDate(value, endOfDay = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) throw createValidationError('Dates must use YYYY-MM-DD');
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  if (Number.isNaN(date.getTime())) throw createValidationError('Invalid date');
  return date;
}

function resolveDatePreset(preset, now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const range = (start, end) => ({ dateFrom: start, dateTo: new Date(end.getTime() + 86399999) });
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const quarterStart = new Date(Date.UTC(today.getUTCFullYear(), Math.floor(today.getUTCMonth() / 3) * 3, 1));
  switch (String(preset || '').toLowerCase().replace(/[^a-z0-9]/g, '')) {
    case 'today': return range(today, today);
    case 'yesterday': { const day = new Date(today.getTime() - 86400000); return range(day, day); }
    case 'last7days': return range(new Date(today.getTime() - 6 * 86400000), today);
    case 'last30days': return range(new Date(today.getTime() - 29 * 86400000), today);
    case 'thismonth': return range(monthStart, today);
    case 'lastmonth': { const end = new Date(monthStart.getTime() - 86400000); return range(new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1)), end); }
    case 'thisquarter': return range(quarterStart, today);
    case 'lastquarter': { const end = new Date(quarterStart.getTime() - 86400000); return range(new Date(Date.UTC(end.getUTCFullYear(), Math.floor(end.getUTCMonth() / 3) * 3, 1)), end); }
    case 'yeartodate': return range(new Date(Date.UTC(today.getUTCFullYear(), 0, 1)), today);
    default: throw createValidationError('Invalid datePreset');
  }
}

function normalizeFilters(query = {}, fixedRepId = null) {
  const hasCustomStart = query.dateFrom !== undefined;
  const hasCustomEnd = query.dateTo !== undefined;
  if (query.datePreset && (hasCustomStart || hasCustomEnd)) throw createValidationError('Use either datePreset or dateFrom/dateTo');
  if (hasCustomStart !== hasCustomEnd) throw createValidationError('Both dateFrom and dateTo are required');
  const dates = query.datePreset ? resolveDatePreset(query.datePreset) : hasCustomStart
    ? { dateFrom: parseDate(query.dateFrom), dateTo: parseDate(query.dateTo, true) }
    : resolveDatePreset('last_30_days');
  if (dates.dateFrom > dates.dateTo) throw createValidationError('dateFrom cannot be after dateTo');
  const repId = fixedRepId || query.assignedSalesRepId;
  if (repId !== undefined && repId !== null && (!/^\d+$/.test(String(repId)) || Number(repId) <= 0)) throw createValidationError('assignedSalesRepId must be a positive integer');
  const statuses = String(query.status || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (statuses.some((status) => !QUOTE_STATUSES.has(status))) throw createValidationError('Invalid status filter');
  const customerType = query.customerType ? String(query.customerType).toLowerCase() : null;
  if (customerType && !['new', 'returning'].includes(customerType)) throw createValidationError('customerType must be new or returning');
  return { ...query, dateFrom: dates.dateFrom, dateTo: dates.dateTo, assignedSalesRepId: repId ? Number(repId) : null, statuses, customerType };
}

function buildWhereClause(filters, { includeDate = true, alias = 'q' } = {}) {
  const clauses = [];
  const replacements = {};
  if (includeDate) { clauses.push(`${alias}.created_at BETWEEN :dateFrom AND :dateTo`); replacements.dateFrom = filters.dateFrom; replacements.dateTo = filters.dateTo; }
  if (filters.assignedSalesRepId) { clauses.push(`${alias}.assigned_sales_rep_id = :assignedSalesRepId`); replacements.assignedSalesRepId = filters.assignedSalesRepId; }
  if (filters.videoShootType) { clauses.push(`${alias}.video_shoot_type = :videoShootType`); replacements.videoShootType = filters.videoShootType; }
  if (filters.statuses.length) { clauses.push(`${alias}.status IN (:statuses)`); replacements.statuses = filters.statuses; }
  if (filters.leadSource) { clauses.push(`COALESCE(sl.lead_source, cl.lead_source) = :leadSource`); replacements.leadSource = filters.leadSource; }
  if (filters.customerType) {
    clauses.push(`${filters.customerType === 'returning' ? '' : 'NOT '}EXISTS (SELECT 1 FROM sales_quotes prior WHERE prior.status = 'paid' AND prior.created_at < ${alias}.created_at AND ((prior.client_id IS NOT NULL AND prior.client_id = ${alias}.client_id) OR (prior.client_user_id IS NOT NULL AND prior.client_user_id = ${alias}.client_user_id) OR (prior.client_email IS NOT NULL AND prior.client_email = ${alias}.client_email)))`);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', replacements };
}

function baseQuery(whereSql) {
  return `SELECT q.sales_quote_id, q.quote_number, q.client_name, q.client_email, q.client_id, q.client_user_id, q.status, q.total, q.created_at, q.valid_until, q.video_shoot_type, q.project_description, q.assigned_sales_rep_id, q.last_follow_up_at, COALESCE(sl.lead_source, cl.lead_source) AS lead_source, u.name AS rep_name, u.profile_image AS avatar_url, COALESCE(bps.paid_amount, 0) AS paid_amount, COALESCE(bps.due_amount, q.total) AS pending_amount, bps.booking_id FROM sales_quotes q LEFT JOIN sales_leads sl ON sl.lead_id = q.lead_id LEFT JOIN client_leads cl ON cl.lead_id = q.lead_id AND sl.lead_id IS NULL LEFT JOIN booking_payment_summary bps ON bps.sales_quote_id = q.sales_quote_id OR (bps.booking_id = COALESCE(sl.booking_id, cl.booking_id) AND bps.sales_quote_id IS NULL) LEFT JOIN users u ON u.id = q.assigned_sales_rep_id ${whereSql}`;
}

async function rowsFor(filters, includeDate) {
  const where = buildWhereClause(filters, { includeDate });
  return db.sequelize.query(baseQuery(where.sql), { replacements: where.replacements, type: db.sequelize.QueryTypes.SELECT });
}
function aggregate(rows) {
  const quoteValue = number(rows.reduce((sum, row) => sum + Number(row.total || 0), 0));
  const paid = rows.filter((row) => row.status === 'paid');
  const wonRevenue = number(paid.reduce((sum, row) => sum + Number(row.paid_amount || 0), 0));
  return { quoteValue, quotesSent: rows.length, dealsWon: paid.length, wonRevenue };
}
function pipeline(rows) {
  const active = rows.filter((row) => PIPELINE_STATUSES.includes(row.status));
  const breakdown = PIPELINE_STATUSES.map((stage) => { const grouped = active.filter((row) => row.status === stage); return { stage, count: grouped.length, value: number(grouped.reduce((sum, row) => sum + Number(row.total || 0), 0)) }; });
  const overdue = active.filter((row) => row.last_follow_up_at && new Date(row.last_follow_up_at).getTime() < Date.now() - 48 * 3600000);
  const risk = PIPELINE_STATUSES.map((stage) => { const grouped = overdue.filter((row) => row.status === stage); return { stage, count: grouped.length, value: number(grouped.reduce((sum, row) => sum + Number(row.total || 0), 0)) }; });
  return { active, breakdown, overdue, risk };
}
function previousFilters(filters) { const length = filters.dateTo.getTime() - filters.dateFrom.getTime() + 1; return { ...filters, dateFrom: new Date(filters.dateFrom.getTime() - length), dateTo: new Date(filters.dateFrom.getTime() - 1) }; }
function trend(rows) { const buckets = new Map(); rows.forEach((row) => { const key = new Date(row.created_at).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }); buckets.set(key, number((buckets.get(key) || 0) + Number(row.total || 0))); }); return [...buckets].map(([month, value]) => ({ month, value })); }

async function getSummary(query, repId = null) {
  const filters = normalizeFilters(query, repId); const [cohort, previous, current] = await Promise.all([rowsFor(filters, true), rowsFor(previousFilters(filters), true), rowsFor(filters, false)]);
  const metric = aggregate(cohort); const prior = aggregate(previous); const pipe = pipeline(current);
  const change = (key) => prior[key] ? percent(metric[key] - prior[key], prior[key]) : 0;
  // TODO: Quote-to-Cash Conversion formula pending final confirmation from product/dev.
  // Current calculation (wonRevenue / quoteValue * 100) is a placeholder — do not treat as final/accurate.
  return { quotePerformance: { quoteValue: metric.quoteValue, quoteValueChangePct: change('quoteValue'), quotesSent: metric.quotesSent, quotesSentChangePct: change('quotesSent'), dealsWon: metric.dealsWon, dealsWonChangePct: change('dealsWon'), wonRevenue: metric.wonRevenue, wonRevenueChangePct: change('wonRevenue'), trend: trend(cohort) }, conversionPerformance: { winRate: percent(metric.dealsWon, metric.quotesSent), quoteToCashConversion: percent(metric.wonRevenue, metric.quoteValue), avgDealValue: metric.dealsWon ? number(metric.wonRevenue / metric.dealsWon) : 0 }, openPipeline: { totalValue: number(pipe.active.reduce((sum, row) => sum + Number(row.total || 0), 0)), activeQuotes: pipe.active.length, breakdown: pipe.breakdown }, overdueFollowUps: { count: pipe.overdue.length }, pipelineAtRisk: { total: number(pipe.overdue.reduce((sum, row) => sum + Number(row.total || 0), 0)), breakdown: pipe.risk } };
}
function page(query) { const currentPage = Math.max(1, Number(query.page || 1)); const limit = Math.min(MAX_LIMIT, Math.max(1, Number(query.limit || 20))); if (!Number.isInteger(currentPage) || !Number.isInteger(limit)) throw createValidationError('page and limit must be integers'); return { currentPage, limit }; }
function paginate(rows, query) { const { currentPage, limit } = page(query); const totalRecords = rows.length; return { rows: rows.slice((currentPage - 1) * limit, currentPage * limit), pagination: { currentPage, totalPages: Math.ceil(totalRecords / limit), totalRecords } }; }
async function getReps(query) { const filters = normalizeFilters(query); const [cohort, current] = await Promise.all([rowsFor(filters, true), rowsFor(filters, false)]); const grouped = new Map(); cohort.forEach((row) => { if (!row.assigned_sales_rep_id) return; const item = grouped.get(row.assigned_sales_rep_id) || { repId: String(row.assigned_sales_rep_id), repName: row.rep_name || '', avatarUrl: row.avatar_url || '', rows: [] }; item.rows.push(row); grouped.set(row.assigned_sales_rep_id, item); }); const overdue = pipeline(current).overdue; let results = [...grouped.values()].map((item) => { const metrics = aggregate(item.rows); const openPipeline = current.filter((row) => Number(row.assigned_sales_rep_id) === Number(item.repId) && PIPELINE_STATUSES.includes(row.status)).reduce((sum, row) => sum + Number(row.total || 0), 0); return { repId: item.repId, repName: item.repName, avatarUrl: item.avatarUrl, quotesSent: metrics.quotesSent, quoteValue: metrics.quoteValue, dealsWon: metrics.dealsWon, winRate: percent(metrics.dealsWon, metrics.quotesSent), wonDealValuePaid: metrics.wonRevenue, avgDealSize: metrics.dealsWon ? number(metrics.wonRevenue / metrics.dealsWon) : 0, openPipeline: number(openPipeline), followUpsOverdueCount: overdue.filter((row) => Number(row.assigned_sales_rep_id) === Number(item.repId)).length }; }); const sortable = new Set(['repName', 'quotesSent', 'quoteValue', 'dealsWon', 'winRate', 'wonDealValuePaid', 'avgDealSize', 'openPipeline', 'followUpsOverdueCount']); const sortBy = sortable.has(query.sortBy) ? query.sortBy : 'repName'; const direction = String(query.sortOrder || 'asc').toLowerCase() === 'desc' ? -1 : 1; results.sort((a, b) => (a[sortBy] > b[sortBy] ? direction : a[sortBy] < b[sortBy] ? -direction : 0)); const paged = paginate(results, query); return { rows: paged.rows, pagination: paged.pagination }; }
async function getRep(repId, query) { const filters = normalizeFilters(query, repId); const user = await db.users.findByPk(filters.assignedSalesRepId, { attributes: ['id', 'name', 'profile_image'], raw: true }); if (!user) { const error = new Error('Sales rep not found'); error.statusCode = 404; throw error; } return { repId: String(user.id), repName: user.name || '', avatarUrl: user.profile_image || '', summary: await getSummary(query, filters.assignedSalesRepId) }; }
async function getRepDeals(repId, query) { if (!['won', 'overdue'].includes(String(query.type || ''))) throw createValidationError('type must be won or overdue'); const filters = normalizeFilters(query, repId); let rows = await rowsFor(filters, false); rows = query.type === 'won' ? rows.filter((row) => row.status === 'paid') : pipeline(rows).overdue; const mapped = rows.map((row) => ({ quoteId: String(row.sales_quote_id), clientName: row.client_name || '', clientCode: row.client_id ? String(row.client_id) : '', status: row.status, projectType: row.project_description || '', bookingStatus: row.booking_id ? 'booked' : '', amount: number(row.total), paid: number(row.paid_amount), pending: number(row.pending_amount), validityDate: row.valid_until || null })); const paged = paginate(mapped, query); return { rows: paged.rows, pagination: paged.pagination }; }
async function getList(query) { if (!['sent', 'accepted', 'partially_paid', 'overdue'].includes(String(query.status || ''))) throw createValidationError('status must be sent, accepted, partially_paid, or overdue'); const requestedStatus = query.status; const filters = normalizeFilters({ ...query, status: '' }); let rows = await rowsFor(filters, false); rows = requestedStatus === 'overdue' ? pipeline(rows).overdue : rows.filter((row) => row.status === requestedStatus); const sortFields = { quoteNumber: 'quote_number', quoteDate: 'created_at', quoteValue: 'total', validityDate: 'valid_until' }; const key = sortFields[query.sortBy] || 'created_at'; const multiplier = String(query.sortOrder || 'desc').toLowerCase() === 'asc' ? 1 : -1; rows.sort((a, b) => (a[key] > b[key] ? multiplier : a[key] < b[key] ? -multiplier : 0)); const mapped = rows.map((row) => ({ quoteNumber: row.quote_number, quoteDate: row.created_at, clientName: row.client_name || '', project: row.project_description || '', daysOpen: Math.max(0, Math.floor((Date.now() - new Date(row.created_at).getTime()) / 86400000)), quoteValue: number(row.total), quoteStatus: row.status, quoteAmount: number(row.total), leadSource: row.lead_source || '', shootType: row.video_shoot_type || '', salesRep: row.rep_name || '', validityDate: row.valid_until || null })); const paged = paginate(mapped, query); return { rows: paged.rows, pagination: paged.pagination }; }

module.exports = { resolveDatePreset, buildWhereClause, normalizeFilters, getSummary, getReps, getRep, getRepDeals, getList, __testables: { percent, aggregate, pipeline } };
