const { Op, fn, col, literal } = require('sequelize');
const models = require('../models');
const leadAssignmentService = require('./lead-assignment.service');

const VALID_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const USER_ATTRS = ['id', 'name', 'email', 'is_active', 'assign_lead', 'role'];

function pageParams(query) {
  const page = Math.max(parseInt(query.page || 1, 10), 1);
  const limit = Math.min(Math.max(parseInt(query.limit || 10, 10), 1), 100);
  return { page, limit, offset: (page - 1) * limit };
}

function validateDateParam(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw new Error('date must be in YYYY-MM-DD format');
  return String(date);
}

function dateRange(date) {
  const safeDate = validateDateParam(date);
  return {
    start: `${safeDate} 00:00:00`,
    end: `${safeDate} 23:59:59`
  };
}

function previousDate(date) {
  const safeDate = validateDateParam(date);
  const [year, month, day] = safeDate.split('-').map(Number);
  const value = new Date(year, month - 1, day);
  value.setDate(value.getDate() - 1);
  const previousYear = value.getFullYear();
  const previousMonth = String(value.getMonth() + 1).padStart(2, '0');
  const previousDay = String(value.getDate()).padStart(2, '0');
  return `${previousYear}-${previousMonth}-${previousDay}`;
}

function dayFromDate(date) {
  const safeDate = validateDateParam(date);
  const [year, month, day] = safeDate.split('-').map(Number);
  const value = new Date(year, month - 1, day);
  return VALID_DAYS[value.getDay()];
}

function getIstDayAndTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    hour12: false
  }).formatToParts(now);
  const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    day: valueByType.weekday,
    time: `${valueByType.hour}:${valueByType.minute}:${valueByType.second}`
  };
}

function normalizeDays(days) {
  if (!Array.isArray(days) || days.length === 0) throw new Error('active_days must be a non-empty array');
  days.forEach((day) => {
    if (!VALID_DAYS.includes(day)) throw new Error(`Invalid active day: ${day}`);
  });
  return [...new Set(days)];
}

function validateTime(value, field) {
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(String(value || ''))) throw new Error(`${field} must be in HH:mm or HH:mm:ss format`);
  return value.length === 5 ? `${value}:00` : value;
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value).split(':').map(Number);
  return hours * 60 + minutes;
}

function rangesOverlap(startA, endA, startB, endB) {
  return timeToMinutes(startA) < timeToMinutes(endB) && timeToMinutes(startB) < timeToMinutes(endA);
}

function daysIntersect(a, b) {
  return normalizeStoredDays(a).some((day) => normalizeStoredDays(b).includes(day));
}

function normalizeStoredDays(days) {
  if (Array.isArray(days)) return days;
  if (!days) return [];
  try { return JSON.parse(days); } catch (_) { return []; }
}

function workingHours(shift) {
  return `${shift.start_time} - ${shift.end_time}`;
}

function salesRepPayload(link) {
  const rep = link.sales_rep || {};
  return {
    sales_rep_id: link.sales_rep_id,
    name: rep.name || null,
    email: rep.email || null,
    status: link.status,
    user_status: Boolean(link.user_status),
    last_activity: link.last_activity,
    assignment_order: link.assignment_order,
    shift_overlapping: Boolean(link.shift_overlapping)
  };
}

function shiftSalespersonPayload(link) {
  const row = link.toJSON ? link.toJSON() : link;
  const payload = salesRepPayload(row);
  return {
    ...payload,
    shift_id: row.shift_id,
    shift_name: row.shift?.name || null
  };
}

async function getShiftOrThrow(id) {
  const shift = await models.shifts.findByPk(id);
  if (!shift) {
    const error = new Error('Shift not found');
    error.statusCode = 404;
    throw error;
  }
  return shift;
}

async function validateSalesRep(id) {
  const user = await models.users.findByPk(id, { attributes: USER_ATTRS });
  if (!user) {
    const error = new Error('Sales rep not found');
    error.statusCode = 404;
    throw error;
  }

  const activeSalesReps = await leadAssignmentService.getActiveSalesReps({ attributes: USER_ATTRS });
  const rep = activeSalesReps.find((entry) => Number(entry.id) === Number(id));
  if (!rep) {
    const error = new Error('Selected user is not a sales representative');
    error.statusCode = 400;
    throw error;
  }
  return rep;
}

async function hasOverlapForSalesRep(salesRepId, shift, excludeShiftId = null) {
  const links = await models.shift_salespeople.findAll({
    where: {
      sales_rep_id: salesRepId,
      status: 'active',
      ...(excludeShiftId ? { shift_id: { [Op.ne]: excludeShiftId } } : {})
    },
    include: [{ model: models.shifts, as: 'shift', where: { status: 'active' } }]
  });

  return links.some((link) => link.shift && (
    daysIntersect(link.shift.active_days, shift.active_days) &&
    rangesOverlap(link.shift.start_time, link.shift.end_time, shift.start_time, shift.end_time)
  ));
}

async function decorateLinksWithOverlap(links, shift) {
  const output = [];
  for (const link of links) {
    const row = link.toJSON ? link.toJSON() : link;
    row.shift_overlapping = await hasOverlapForSalesRep(row.sales_rep_id, shift, shift.id);
    output.push(row);
  }
  return output;
}

async function createShift(payload) {
  const start_time = validateTime(payload.start_time, 'start_time');
  const end_time = validateTime(payload.end_time, 'end_time');
  const shift = await models.shifts.create({
    name: payload.name,
    start_time,
    end_time,
    active_days: normalizeDays(payload.active_days),
    is_enabled: payload.is_enabled !== undefined ? Boolean(payload.is_enabled) : true,
    status: payload.status || 'active'
  });
  return shift;
}

async function listShifts(query) {
  const { page, limit, offset } = pageParams(query);
  const where = {};
  if (query.status) where.status = query.status;
  if (query.date) {
    const range = dateRange(query.date);
    where.created_at = { [Op.between]: [range.start, range.end] };
  } else if (query.month) {
    where.created_at = { [Op.between]: [`${query.month}-01`, `${query.month}-31 23:59:59`] };
  }

  const result = await models.shifts.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit,
    offset
  });

  const shiftIds = result.rows.map((shift) => shift.id);
  const salespeopleLinks = shiftIds.length
    ? await models.shift_salespeople.findAll({
        where: { shift_id: { [Op.in]: shiftIds } },
        include: [{ model: models.users, as: 'sales_rep', attributes: USER_ATTRS }],
        order: [
          ['shift_id', 'ASC'],
          ['assignment_order', 'ASC']
        ]
      })
    : [];

  const linksByShiftId = new Map();
  salespeopleLinks.forEach((link) => {
    const row = link.toJSON ? link.toJSON() : link;
    if (!linksByShiftId.has(row.shift_id)) linksByShiftId.set(row.shift_id, []);
    linksByShiftId.get(row.shift_id).push(row);
  });

  const rows = await Promise.all(result.rows.map(async (shift) => {
    const json = shift.toJSON();
    const links = await decorateLinksWithOverlap(linksByShiftId.get(json.id) || [], json);
    return {
      ...json,
      salespeople: links,
      working_hours: workingHours(json),
      active_days: normalizeStoredDays(json.active_days),
      shift_overlapping: links.some((link) => link.shift_overlapping),
      salespeople_count: links.length,
      salespeople_avatars: links.slice(0, 4).map((link) => ({
        sales_rep_id: link.sales_rep_id,
        name: link.sales_rep?.name || null,
        email: link.sales_rep?.email || null
      }))
    };
  }));

  return { rows, pagination: { page, limit, total: result.count, pages: Math.ceil(result.count / limit) } };
}

async function getShiftDetail(id) {
  const shift = await models.shifts.findByPk(id, {
    include: [{ model: models.shift_salespeople, as: 'salespeople', include: [{ model: models.users, as: 'sales_rep', attributes: USER_ATTRS }] }]
  });
  if (!shift) return null;
  const json = shift.toJSON();
  const links = await decorateLinksWithOverlap(json.salespeople || [], json);
  return {
    ...json,
    working_hours: workingHours(json),
    active_days: normalizeStoredDays(json.active_days),
    shift_overlapping: links.some((link) => link.shift_overlapping),
    salespeople: links.map(salesRepPayload)
  };
}

async function updateShift(id, payload) {
  const shift = await getShiftOrThrow(id);
  const update = {};
  ['name', 'is_enabled', 'status'].forEach((field) => {
    if (payload[field] !== undefined) update[field] = payload[field];
  });
  if (payload.start_time) update.start_time = validateTime(payload.start_time, 'start_time');
  if (payload.end_time) update.end_time = validateTime(payload.end_time, 'end_time');
  if (payload.active_days) update.active_days = normalizeDays(payload.active_days);
  await shift.update(update);
  return getShiftDetail(id);
}

async function recomputeNextAssignee(shiftId) {
  const firstActive = await models.shift_salespeople.findOne({
    where: { shift_id: shiftId, status: 'active', user_status: true },
    order: [['assignment_order', 'ASC']]
  });
  const nextAssigneeId = firstActive ? firstActive.sales_rep_id : null;
  await models.shifts.update({ next_assignee_sales_rep_id: nextAssigneeId }, { where: { id: shiftId } });
  return nextAssigneeId;
}

async function addSalesperson(shiftId, salesRepId) {
  const shift = await getShiftOrThrow(shiftId);
  await validateSalesRep(salesRepId);
  const maxOrder = await models.shift_salespeople.max('assignment_order', { where: { shift_id: shiftId } });
  const [link] = await models.shift_salespeople.findOrCreate({
    where: { shift_id: shiftId, sales_rep_id: salesRepId },
    defaults: { assignment_order: Number(maxOrder || 0) + 1 }
  });
  await recomputeNextAssignee(shiftId);
  const shift_overlapping = await hasOverlapForSalesRep(salesRepId, shift, shift.id);
  return { ...(await getShiftDetail(shiftId)), added_sales_rep_id: salesRepId, shift_overlapping };
}

async function listSalespeople(shiftId, query) {
  const shift = await getShiftOrThrow(shiftId);
  const { page, limit, offset } = pageParams(query);
  const where = { shift_id: shiftId };
  if (query.status) where.status = query.status;
  // shift_salespeople rows are created only after validateSalesRep(), which uses
  // the same assignable-sales scope as GET /api/sales/sales-reps.
  const include = [{ model: models.users, as: 'sales_rep', attributes: USER_ATTRS, where: query.search ? { [Op.or]: [{ name: { [Op.like]: `%${query.search}%` } }, { email: { [Op.like]: `%${query.search}%` } }] } : undefined }];
  const result = await models.shift_salespeople.findAndCountAll({ where, include, order: [['assignment_order', 'ASC']], limit, offset });
  const rows = await decorateLinksWithOverlap(result.rows, shift);
  return { rows: rows.map(salesRepPayload), pagination: { page, limit, total: result.count, pages: Math.ceil(result.count / limit) } };
}

async function listAllShiftSalespeople(query) {
  const { page, limit, offset } = pageParams(query);
  const shiftId = query.shift_id ? parseInt(query.shift_id, 10) : null;
  if (query.shift_id && !Number.isInteger(shiftId)) throw new Error('shift_id must be a number');
  const status = query.status ? String(query.status).trim().toLowerCase() : '';

  const salesReps = await leadAssignmentService.getActiveSalesReps({
    attributes: USER_ATTRS,
    search: query.search
  });
  const salesRepIds = salesReps.map((rep) => rep.id);
  if (!salesRepIds.length) {
    return { rows: [], pagination: { page, limit, total: 0, pages: 0 } };
  }

  const linkWhere = {
    sales_rep_id: { [Op.in]: salesRepIds }
  };
  if (shiftId) linkWhere.shift_id = shiftId;
  if (status && status !== 'active') linkWhere.status = status;

  const links = await models.shift_salespeople.findAll({
    where: linkWhere,
    include: [{ model: models.shifts, as: 'shift', attributes: ['id', 'name', 'start_time', 'end_time', 'active_days', 'status'] }],
    order: [
      ['shift_id', 'ASC'],
      ['assignment_order', 'ASC']
    ]
  });

  const linksBySalesRepId = new Map();
  for (const link of links) {
    const row = link.toJSON ? link.toJSON() : link;
    if (!linksBySalesRepId.has(row.sales_rep_id)) linksBySalesRepId.set(row.sales_rep_id, []);
    linksBySalesRepId.get(row.sales_rep_id).push(row);
  }

  const rows = [];
  for (const repInstance of salesReps) {
    const rep = repInstance.toJSON ? repInstance.toJSON() : repInstance;
    const repLinks = linksBySalesRepId.get(rep.id) || [];

    if (!repLinks.length) {
      if (shiftId) continue;
      if (status && status !== 'active') continue;
      rows.push({
        sales_rep_id: rep.id,
        name: rep.name || null,
        email: rep.email || null,
        status: 'active',
        user_status: null,
        last_activity: null,
        assignment_order: null,
        shift_overlapping: null,
        shift_id: null,
        shift_name: null
      });
      continue;
    }

    for (const row of repLinks) {
      if (status && row.status !== status) continue;
      row.sales_rep = rep;
      row.shift_overlapping = row.shift
        ? await hasOverlapForSalesRep(row.sales_rep_id, row.shift, row.shift_id)
        : false;
      rows.push(shiftSalespersonPayload(row));
    }
  }

  const paginatedRows = rows.slice(offset, offset + limit);
  return { rows: paginatedRows, pagination: { page, limit, total: rows.length, pages: Math.ceil(rows.length / limit) } };
}

async function getNextAssignee(shiftId) {
  const shift = await getShiftOrThrow(shiftId);
  const links = await models.shift_salespeople.findAll({ where: { shift_id: shiftId, status: 'active', user_status: true }, order: [['assignment_order', 'ASC']] });
  if (!links.length) return null;
  const index = Math.max(links.findIndex((link) => link.sales_rep_id === shift.next_assignee_sales_rep_id), 0);
  const assignee = links[index];
  const next = links[(index + 1) % links.length];
  await shift.update({ next_assignee_sales_rep_id: next.sales_rep_id });
  await assignee.update({ last_activity: new Date() });
  return assignee.sales_rep_id;
}

async function logAssignment(payload) {
  return models.assignment_history.create(payload);
}

async function getRoundRobin(shiftId) {
  const shift = await getShiftOrThrow(shiftId);
  const nextAssigneeId = await recomputeNextAssignee(shiftId);
  const links = await models.shift_salespeople.findAll({
    where: { shift_id: shiftId },
    include: [{ model: models.users, as: 'sales_rep', attributes: USER_ATTRS }],
    order: [['assignment_order', 'ASC']]
  });
  return {
    next_assignee_sales_rep_id: nextAssigneeId,
    no_active_assignee: nextAssigneeId === null,
    salespeople: links.map(salesRepPayload)
  };
}

async function updateRoundRobin(shiftId, positions) {
  if (!Array.isArray(positions)) throw new Error('Body must be an array');
  await getShiftOrThrow(shiftId);
  for (const item of positions) {
    await models.shift_salespeople.update({ assignment_order: item.position }, { where: { shift_id: shiftId, sales_rep_id: item.sales_rep_id } });
  }
  await recomputeNextAssignee(shiftId);
  return getRoundRobin(shiftId);
}

async function getActiveShiftsNow(now = new Date()) {
  const { day, time: currentTime } = getIstDayAndTime(now);
  const shifts = await models.shifts.findAll({
    where: {
      status: 'active',
      is_enabled: true,
      start_time: { [Op.lte]: currentTime },
      end_time: { [Op.gte]: currentTime }
    },
    order: [['start_time', 'ASC']]
  });
  return shifts.filter((shift) => normalizeStoredDays(shift.active_days).includes(day));
}

async function compareCount(model, whereCurrent, wherePrevious) {
  const [current, previous] = await Promise.all([model.count({ where: whereCurrent }), model.count({ where: wherePrevious })]);
  const change_percent = previous ? Math.round(((current - previous) / previous) * 100) : (current ? 100 : 0);
  return { count: current, change_percent };
}

const PENDING_ASSIGNMENT_LEAD_STATUSES = [
  'book_a_shoot_lead_created',
  'manual_lead_created',
  'signed_up',
  'in_progress_self_serve',
  'in_progress_sales_assisted',
  'booking_in_progress',
  'payment_pending',
  'proposal_sent',
  'payment_link_sent',
  'discount_applied'
];

function activeOrEnabledShiftWhere(extraWhere = {}) {
  return {
    [Op.or]: [
      { is_enabled: true },
      { status: 'active' }
    ],
    ...extraWhere
  };
}

async function countPendingLeads(extraWhere = {}) {
  return models.sales_leads.count({
    where: {
      is_active: 1,
      assigned_sales_rep_id: null,
      lead_status: { [Op.in]: PENDING_ASSIGNMENT_LEAD_STATUSES },
      ...extraWhere
    }
  });
}

async function countDistinctActiveSalespeopleForShiftIds(shiftIds, extraWhere = {}) {
  if (!shiftIds.length) return 0;
  return models.shift_salespeople.count({
    where: {
      shift_id: { [Op.in]: shiftIds },
      user_status: true,
      status: 'active',
      ...extraWhere
    },
    distinct: true,
    col: 'sales_rep_id'
  });
}

function percentChange(current, previous) {
  return previous ? Math.round(((current - previous) / previous) * 100) : (current ? 100 : 0);
}

function monthRanges() {
  const now = new Date();
  const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { current: { [Op.gte]: currentStart }, previous: { [Op.gte]: previousStart, [Op.lt]: currentStart } };
}

async function countActiveShiftsForDate(date) {
  const range = dateRange(date);
  const day = dayFromDate(date);
  const shifts = await models.shifts.findAll({
    where: activeOrEnabledShiftWhere({
      created_at: { [Op.between]: [range.start, range.end] }
    }),
    attributes: ['id', 'active_days']
  });
  return shifts.filter((shift) => normalizeStoredDays(shift.active_days).includes(day)).length;
}

async function getActiveOrEnabledShifts(extraWhere = {}) {
  return models.shifts.findAll({
    where: activeOrEnabledShiftWhere(extraWhere),
    attributes: ['id', 'status', 'is_enabled', 'created_at']
  });
}

async function overview(query = {}) {
  if (query.date) {
    const currentRange = dateRange(query.date);
    const previousRange = dateRange(previousDate(query.date));

    const [
      activeShiftsCurrent,
      activeShiftsPrevious,
      leadsAssignedCurrent,
      leadsAssignedPrevious,
      pendingLeadsCurrent,
      pendingLeadsPrevious,
      activeSalespeopleCurrent,
      activeSalespeoplePrevious
    ] = await Promise.all([
      countActiveShiftsForDate(query.date),
      countActiveShiftsForDate(previousDate(query.date)),
      models.assignment_history.count({ where: { assigned_at: { [Op.between]: [currentRange.start, currentRange.end] } } }),
      models.assignment_history.count({ where: { assigned_at: { [Op.between]: [previousRange.start, previousRange.end] } } }),
      countPendingLeads({ created_at: { [Op.between]: [currentRange.start, currentRange.end] } }),
      countPendingLeads({ created_at: { [Op.between]: [previousRange.start, previousRange.end] } }),
      countDistinctActiveSalespeopleForShiftIds(
        (await getActiveOrEnabledShifts({ created_at: { [Op.between]: [currentRange.start, currentRange.end] } })).map((shift) => shift.id)
      ),
      countDistinctActiveSalespeopleForShiftIds(
        (await getActiveOrEnabledShifts({ created_at: { [Op.between]: [previousRange.start, previousRange.end] } })).map((shift) => shift.id)
      )
    ]);

    return {
      active_shifts_count: { count: activeShiftsCurrent, change_percent: percentChange(activeShiftsCurrent, activeShiftsPrevious) },
      leads_assigned_today: { count: leadsAssignedCurrent, change_percent: percentChange(leadsAssignedCurrent, leadsAssignedPrevious) },
      pending_leads: { count: pendingLeadsCurrent, change_percent: percentChange(pendingLeadsCurrent, pendingLeadsPrevious) },
      active_salespeople_count: { count: activeSalespeopleCurrent, change_percent: percentChange(activeSalespeopleCurrent, activeSalespeoplePrevious) }
    };
  }

  const ranges = monthRanges();
  const today = new Date().toISOString().slice(0, 10);
  const activeOrEnabledShifts = await getActiveOrEnabledShifts();
  const activeOrEnabledShiftIds = activeOrEnabledShifts.map((shift) => shift.id);
  const [
    activeShiftsCurrentMonth,
    activeShiftsPreviousMonth,
    leadsAssignedToday,
    pendingLeadsCurrent,
    pendingLeadsPrevious,
    activeSalespeopleCount,
    activeSalespeopleCurrentMonth,
    activeSalespeoplePreviousMonth
  ] = await Promise.all([
    models.shifts.count({ where: activeOrEnabledShiftWhere({ created_at: ranges.current }) }),
    models.shifts.count({ where: activeOrEnabledShiftWhere({ created_at: ranges.previous }) }),
    models.assignment_history.count({ where: { assigned_at: { [Op.gte]: `${today} 00:00:00` } } }),
    countPendingLeads(),
    countPendingLeads({ created_at: ranges.previous }),
    countDistinctActiveSalespeopleForShiftIds(activeOrEnabledShiftIds),
    countDistinctActiveSalespeopleForShiftIds(
      (await getActiveOrEnabledShifts({ created_at: ranges.current })).map((shift) => shift.id)
    ),
    countDistinctActiveSalespeopleForShiftIds(
      (await getActiveOrEnabledShifts({ created_at: ranges.previous })).map((shift) => shift.id)
    )
  ]);

  return {
    active_shifts_count: { count: activeOrEnabledShifts.length, change_percent: percentChange(activeShiftsCurrentMonth, activeShiftsPreviousMonth) },
    leads_assigned_today: { count: leadsAssignedToday, change_percent: 0 },
    pending_leads: { count: pendingLeadsCurrent, change_percent: percentChange(pendingLeadsCurrent, pendingLeadsPrevious) },
    active_salespeople_count: { count: activeSalespeopleCount, change_percent: percentChange(activeSalespeopleCurrentMonth, activeSalespeoplePreviousMonth) }
  };
}

async function hourlyLeadVolume(query) {
  const where = {};
  if (query.date) {
    const range = dateRange(query.date);
    where.assigned_at = { [Op.between]: [range.start, range.end] };
  } else if (query.start_date && query.end_date) where.assigned_at = { [Op.between]: [`${query.start_date} 00:00:00`, `${query.end_date} 23:59:59`] };
  else where.assigned_at = { [Op.gte]: `${new Date().toISOString().slice(0, 10)} 00:00:00` };
  return models.assignment_history.findAll({ where, attributes: [[fn('HOUR', col('assigned_at')), 'hour'], [fn('COUNT', col('id')), 'count']], group: [literal('hour')], order: [[literal('hour'), 'ASC']], raw: true });
}

module.exports = {
  pageParams,
  dateRange,
  dayFromDate,
  getIstDayAndTime,
  validateTime,
  normalizeDays,
  createShift,
  listShifts,
  getShiftDetail,
  updateShift,
  getShiftOrThrow,
  recomputeNextAssignee,
  addSalesperson,
  listSalespeople,
  listAllShiftSalespeople,
  getNextAssignee,
  logAssignment,
  getRoundRobin,
  updateRoundRobin,
  getActiveShiftsNow,
  overview,
  hourlyLeadVolume,
  hasOverlapForSalesRep,
  normalizeStoredDays,
  USER_ATTRS
};
