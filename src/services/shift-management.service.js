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

  return links.some((link) => (
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
  if (query.month) where.created_at = { [Op.between]: [`${query.month}-01`, `${query.month}-31 23:59:59`] };

  const result = await models.shifts.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit,
    offset,
    distinct: true,
    include: [{ model: models.shift_salespeople, as: 'salespeople', include: [{ model: models.users, as: 'sales_rep', attributes: USER_ATTRS }] }]
  });

  const rows = await Promise.all(result.rows.map(async (shift) => {
    const json = shift.toJSON();
    const links = await decorateLinksWithOverlap(json.salespeople || [], json);
    return {
      ...json,
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

async function compareCount(model, whereCurrent, wherePrevious) {
  const [current, previous] = await Promise.all([model.count({ where: whereCurrent }), model.count({ where: wherePrevious })]);
  const change_percent = previous ? Math.round(((current - previous) / previous) * 100) : (current ? 100 : 0);
  return { count: current, change_percent };
}

function monthRanges() {
  const now = new Date();
  const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { current: { [Op.gte]: currentStart }, previous: { [Op.gte]: previousStart, [Op.lt]: currentStart } };
}

async function overview() {
  const ranges = monthRanges();
  const today = new Date().toISOString().slice(0, 10);
  return {
    active_shifts_count: await compareCount(models.shifts, { status: 'active', created_at: ranges.current }, { status: 'active', created_at: ranges.previous }),
    leads_assigned_today: { count: await models.assignment_history.count({ where: { assigned_at: { [Op.gte]: `${today} 00:00:00` } } }), change_percent: 0 },
    pending_leads: await compareCount(models.sales_leads, { lead_status: { [Op.like]: '%progress%' }, created_at: ranges.current }, { lead_status: { [Op.like]: '%progress%' }, created_at: ranges.previous }),
    active_salespeople_count: await compareCount(models.shift_salespeople, { status: 'active', user_status: true, created_at: ranges.current }, { status: 'active', user_status: true, created_at: ranges.previous })
  };
}

async function hourlyLeadVolume(query) {
  const where = {};
  if (query.start_date && query.end_date) where.assigned_at = { [Op.between]: [`${query.start_date} 00:00:00`, `${query.end_date} 23:59:59`] };
  else where.assigned_at = { [Op.gte]: `${new Date().toISOString().slice(0, 10)} 00:00:00` };
  return models.assignment_history.findAll({ where, attributes: [[fn('HOUR', col('assigned_at')), 'hour'], [fn('COUNT', col('id')), 'count']], group: [literal('hour')], order: [[literal('hour'), 'ASC']], raw: true });
}

module.exports = {
  pageParams,
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
  getNextAssignee,
  logAssignment,
  getRoundRobin,
  updateRoundRobin,
  overview,
  hourlyLeadVolume,
  hasOverlapForSalesRep,
  normalizeStoredDays,
  USER_ATTRS
};
