const { Op } = require('sequelize');
const models = require('../models');
const service = require('../services/shift-management.service');
const leadAssignmentService = require('../services/lead-assignment.service');

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

function fail(res, error) {
  return res.status(error.statusCode || 400).json({ success: false, message: error.message || 'Request failed' });
}

function formatDisplayDate(value) {
  if (!value) return null;
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelativeTime(value) {
  if (!value) return null;
  const diffSeconds = Math.max(Math.floor((Date.now() - new Date(value).getTime()) / 1000), 0);
  if (diffSeconds < 60) return 'Just now';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

function formatLeadType(value) {
  if (value === 'self_serve') return 'Self-Serve';
  if (value === 'sales_assisted') return 'Sales Assisted';
  return value || null;
}

function normalizeLeadStatusFilter(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const map = {
    'book a shoot - lead created': 'book_a_shoot_lead_created',
    'book a shoot – lead created': 'book_a_shoot_lead_created',
    'manual - lead created': 'manual_lead_created',
    'manual – lead created': 'manual_lead_created',
    'booking in progress': 'booking_in_progress',
    booked: 'booked',
    'signed up - lead created': 'signed_up',
    'signed up': 'signed_up'
  };
  return map[normalized] || value;
}

function normalizeStatusLabel(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s–-]+/g, ' ');
}

function normalizeQuoteStatus(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeQuoteStatusFilter(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
}

function mapLeadRow(row) {
  const lead = row.toJSON ? row.toJSON() : row;
  const booking = lead.booking || null;
  const creativePartnerMap = new Map();
  (booking?.assigned_crews || []).forEach((assignment) => {
    const crew = assignment.crew_member || {};
    if (!crew.crew_member_id || creativePartnerMap.has(crew.crew_member_id)) return;
    creativePartnerMap.set(crew.crew_member_id, {
      crew_member_id: crew.crew_member_id,
      name: [crew.first_name, crew.last_name].filter(Boolean).join(' ') || null,
      email: crew.email || null,
      status: assignment.status || null
    });
  });
  const creativePartners = Array.from(creativePartnerMap.values());

  return {
    lead_id: lead.lead_id,
    client_name: lead.client_name,
    email_id: lead.guest_email,
    date: formatDisplayDate(lead.created_at),
    lead_type: formatLeadType(lead.lead_type),
    intent: leadAssignmentService.getLeadIntent({ lead, booking }),
    booking_status: leadAssignmentService.getLeadBookingStatus(lead, booking),
    raw_booking_status: lead.lead_status,
    last_activity: formatRelativeTime(lead.last_activity_at),
    last_activity_at: lead.last_activity_at,
    booking_type: null,
    creative_partners: creativePartners
  };
}

function mapQuoteRow(row) {
  const quote = row.toJSON ? row.toJSON() : row;
  return {
    sales_quote_id: quote.sales_quote_id,
    quote_number: quote.quote_number,
    client_name: quote.client_name,
    client_location: quote.client_address || null,
    project: quote.video_shoot_type || quote.project_description || null,
    amount: quote.total,
    quote_status: normalizeQuoteStatus(quote.status),
    raw_quote_status: quote.status,
    valid_until: quote.valid_until,
    booking_type: quote.booking_type,
    creative_partners: []
  };
}

exports.createShift = async (req, res) => {
  try { return ok(res, await service.createShift(req.body), 201); } catch (error) { return fail(res, error); }
};

exports.listShifts = async (req, res) => {
  try { return ok(res, await service.listShifts(req.query)); } catch (error) { return fail(res, error); }
};

exports.getShift = async (req, res) => {
  try {
    const shift = await service.getShiftDetail(req.params.id);
    if (!shift) return res.status(404).json({ success: false, message: 'Shift not found' });
    return ok(res, shift);
  } catch (error) { return fail(res, error); }
};

exports.updateShift = async (req, res) => {
  try { return ok(res, await service.updateShift(req.params.id, req.body)); } catch (error) { return fail(res, error); }
};

exports.toggleShift = async (req, res) => {
  try {
    const shift = await service.getShiftOrThrow(req.params.id);
    const next = req.body.is_enabled !== undefined ? Boolean(req.body.is_enabled) : !Boolean(shift.is_enabled);
    await shift.update({ is_enabled: next });
    return ok(res, await service.getShiftDetail(req.params.id));
  } catch (error) { return fail(res, error); }
};

exports.deleteShift = async (req, res) => {
  try {
    const shift = await service.getShiftOrThrow(req.params.id);
    await shift.destroy();
    return ok(res, { deleted: true });
  } catch (error) { return fail(res, error); }
};

exports.overview = async (req, res) => {
  try { return ok(res, await service.overview(req.query)); } catch (error) { return fail(res, error); }
};

exports.hourlyLeadVolume = async (req, res) => {
  try { return ok(res, await service.hourlyLeadVolume(req.query)); } catch (error) { return fail(res, error); }
};

exports.activeNow = async (req, res) => {
  try {
    return ok(res, await service.getActiveShiftsNow());
  } catch (error) { return fail(res, error); }
};

exports.recentAssignments = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit || 10, 10), 1), 50);
    const where = {};
    if (req.query.date) {
      const range = service.dateRange(req.query.date);
      where.assigned_at = { [Op.between]: [range.start, range.end] };
    }
    const rows = await models.assignment_history.findAll({
      where,
      include: [
        { model: models.shifts, as: 'shift', attributes: ['id', 'name'] },
        { model: models.users, as: 'sales_rep', attributes: service.USER_ATTRS }
      ],
      order: [['assigned_at', 'DESC']],
      limit
    });
    const leadIds = [...new Set(rows.map((row) => Number(row.lead_id)).filter(Boolean))];
    const [salesLeads, clientLeads] = leadIds.length
      ? await Promise.all([
          models.sales_leads.findAll({
            where: { lead_id: { [Op.in]: leadIds } },
            attributes: ['lead_id', 'client_name', 'guest_email', 'assigned_sales_rep_id', 'lead_status'],
            include: [{
              model: models.stream_project_booking,
              as: 'booking',
              required: false,
              attributes: ['stream_project_booking_id', 'is_draft', 'is_cancelled', 'payment_id']
            }]
          }),
          models.client_leads.findAll({
            where: { lead_id: { [Op.in]: leadIds } },
            attributes: ['lead_id', 'client_name', 'guest_email', 'assigned_sales_rep_id', 'lead_status'],
            include: [{
              model: models.stream_project_booking,
              as: 'booking',
              required: false,
              attributes: ['stream_project_booking_id', 'is_draft', 'is_cancelled', 'payment_id']
            }]
          })
        ])
      : [[], []];

    const leadById = new Map();
    [
      ...salesLeads.map((lead) => ({ lead, type: 'sales' })),
      ...clientLeads.map((lead) => ({ lead, type: 'client' }))
    ].forEach(({ lead, type }) => {
      const row = lead.toJSON ? lead.toJSON() : lead;
      row._lead_type = type;
      const existing = leadById.get(row.lead_id);
      const existingLabel = existing?.client_name || existing?.guest_email || '';
      const nextLabel = row.client_name || row.guest_email || '';
      if (!existing || String(existingLabel).trim().toLowerCase() === 'n/a' || (!existingLabel && nextLabel)) {
        leadById.set(row.lead_id, row);
      }
    });

    return ok(res, rows.map((row) => {
      const assignment = row.toJSON ? row.toJSON() : row;
      const lead = leadById.get(assignment.lead_id) || {};
      const clientName = assignment.client_name && assignment.client_name !== 'N/A'
        ? assignment.client_name
        : lead.client_name || lead.guest_email || null;
      const currentStatus = lead.lead_id
        ? lead._lead_type === 'client'
          ? leadAssignmentService.getClientBookingStatus(lead, lead.booking)
          : leadAssignmentService.getLeadBookingStatus(lead, lead.booking)
        : assignment.status;

      return {
        ...assignment,
        status: currentStatus || assignment.status,
        client_name: clientName,
        client_email: lead.guest_email || null,
        sales_rep_name: assignment.sales_rep?.name || null,
        sales_rep_email: assignment.sales_rep?.email || null,
        assigned_at_local: service.formatIstDateTime(assignment.assigned_at)
      };
    }));
  } catch (error) { return fail(res, error); }
};

exports.addSalesperson = async (req, res) => {
  try {
    if (!req.body.sales_rep_id) throw new Error('sales_rep_id is required');
    return ok(res, await service.addSalesperson(req.params.id, req.body.sales_rep_id), 201);
  } catch (error) { return fail(res, error); }
};

exports.listSalespeople = async (req, res) => {
  try { return ok(res, await service.listSalespeople(req.params.id, req.query)); } catch (error) { return fail(res, error); }
};

exports.listAllShiftSalespeople = async (req, res) => {
  try { return ok(res, await service.listAllShiftSalespeople(req.query)); } catch (error) { return fail(res, error); }
};

exports.toggleSalesperson = async (req, res) => {
  try {
    const row = await models.shift_salespeople.findOne({ where: { shift_id: req.params.id, sales_rep_id: req.params.salesRepId } });
    if (!row) return res.status(404).json({ success: false, message: 'Shift salesperson link not found' });
    const body = req.body || {};
    const next = body.user_status !== undefined
      ? !['false', '0', 'off'].includes(String(body.user_status).toLowerCase())
      : !Boolean(row.user_status);
    await row.update({ user_status: next });
    const next_assignee_sales_rep_id = await service.recomputeNextAssignee(req.params.id);
    return ok(res, {
      ...(await service.listSalespeople(req.params.id, { page: 1, limit: 100 })),
      next_assignee_sales_rep_id,
      no_active_assignee: next_assignee_sales_rep_id === null
    });
  } catch (error) { return fail(res, error); }
};

exports.removeSalesperson = async (req, res) => {
  try {
    const shiftId = parseInt(req.params.id, 10);
    const salesRepId = parseInt(req.params.salesRepId, 10);
    if (!Number.isInteger(shiftId) || !Number.isInteger(salesRepId)) {
      return res.status(400).json({ success: false, message: 'Invalid shift_id or sales_rep_id' });
    }

    const row = await models.shift_salespeople.findOne({
      where: {
        shift_id: shiftId,
        sales_rep_id: salesRepId
      }
    });
    if (!row) return res.status(404).json({ success: false, message: 'Shift salesperson link not found' });

    await row.destroy();
    const next_assignee_sales_rep_id = await service.recomputeNextAssignee(shiftId);
    return ok(res, { deleted: true, next_assignee_sales_rep_id, no_active_assignee: next_assignee_sales_rep_id === null });
  } catch (error) { return fail(res, error); }
};

exports.getRoundRobin = async (req, res) => {
  try { return ok(res, await service.getRoundRobin(req.params.id)); } catch (error) { return fail(res, error); }
};

exports.updateRoundRobin = async (req, res) => {
  try { return ok(res, await service.updateRoundRobin(req.params.id, req.body)); } catch (error) { return fail(res, error); }
};

exports.assignmentHistory = async (req, res) => {
  try {
    const { page, limit, offset } = service.pageParams(req.query);
    const where = {};
    ['shift_id', 'sales_rep_id', 'status'].forEach((field) => {
      if (req.query[field]) where[field] = req.query[field];
    });
    if (req.query.date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date))) {
        return res.status(400).json({ success: false, message: 'date must be in YYYY-MM-DD format' });
      }
      where.assigned_at = {
        [Op.gte]: `${req.query.date} 00:00:00`,
        [Op.lte]: `${req.query.date} 23:59:59`
      };
    } else if (req.query.start_date && req.query.end_date) {
      where.assigned_at = { [Op.between]: [`${req.query.start_date} 00:00:00`, `${req.query.end_date} 23:59:59`] };
    }
    const result = await models.assignment_history.findAndCountAll({
      where,
      include: [
        { model: models.shifts, as: 'shift', attributes: ['id', 'name'] },
        { model: models.users, as: 'sales_rep', attributes: service.USER_ATTRS }
      ],
      order: [['assigned_at', 'DESC']],
      limit,
      offset
    });
    const leadIds = [...new Set(result.rows.map((row) => Number(row.lead_id)).filter(Boolean))];
    const [salesLeads, clientLeads] = leadIds.length
      ? await Promise.all([
          models.sales_leads.findAll({
            where: { lead_id: { [Op.in]: leadIds } },
            attributes: ['lead_id', 'client_name', 'guest_email', 'assigned_sales_rep_id', 'lead_status'],
            include: [{
              model: models.stream_project_booking,
              as: 'booking',
              required: false,
              attributes: ['stream_project_booking_id', 'is_draft', 'is_cancelled', 'payment_id']
            }]
          }),
          models.client_leads.findAll({
            where: { lead_id: { [Op.in]: leadIds } },
            attributes: ['lead_id', 'client_name', 'guest_email', 'assigned_sales_rep_id', 'lead_status'],
            include: [{
              model: models.stream_project_booking,
              as: 'booking',
              required: false,
              attributes: ['stream_project_booking_id', 'is_draft', 'is_cancelled', 'payment_id']
            }]
          })
        ])
      : [[], []];

    const leadById = new Map();
    [
      ...salesLeads.map((lead) => ({ lead, type: 'sales' })),
      ...clientLeads.map((lead) => ({ lead, type: 'client' }))
    ].forEach(({ lead, type }) => {
      const row = lead.toJSON ? lead.toJSON() : lead;
      row._lead_type = type;
      const existing = leadById.get(row.lead_id);
      const existingLabel = existing?.client_name || existing?.guest_email || '';
      const nextLabel = row.client_name || row.guest_email || '';
      if (!existing || String(existingLabel).trim().toLowerCase() === 'n/a' || (!existingLabel && nextLabel)) {
        leadById.set(row.lead_id, row);
      }
    });

    return ok(res, {
      rows: result.rows.map((row) => {
        const assignment = row.toJSON ? row.toJSON() : row;
        const lead = leadById.get(assignment.lead_id) || {};
        const clientName = assignment.client_name && assignment.client_name !== 'N/A'
          ? assignment.client_name
          : lead.client_name || lead.guest_email || null;
        const currentStatus = lead.lead_id
          ? lead._lead_type === 'client'
            ? leadAssignmentService.getClientBookingStatus(lead, lead.booking)
            : leadAssignmentService.getLeadBookingStatus(lead, lead.booking)
          : assignment.status;
        return {
          ...assignment,
          status: currentStatus || assignment.status,
          client_name: clientName,
          client_email: lead.guest_email || null,
          sales_rep_name: assignment.sales_rep?.name || null,
          sales_rep_email: assignment.sales_rep?.email || null,
          shift_name: assignment.shift?.name || null,
          assigned_at_local: service.formatIstDateTime(assignment.assigned_at)
        };
      }),
      pagination: { page, limit, total: result.count, pages: Math.ceil(result.count / limit) }
    });
  } catch (error) { return fail(res, error); }
};

exports.salesRepLeads = async (req, res) => {
  try {
    const { page, limit, offset } = service.pageParams(req.query);
    const where = { assigned_sales_rep_id: req.params.id };
    if (req.query.lead_type) {
      const leadType = String(req.query.lead_type).toLowerCase().replace(/[\s-]+/g, '_');
      where.lead_type = leadType === 'self_serve' ? 'self_serve' : leadType === 'sales_assisted' ? 'sales_assisted' : req.query.lead_type;
    }
    const intentFilter = req.query.intent ? String(req.query.intent).trim().toLowerCase() : '';
    const statusFilter = req.query.status || req.query.booking_status
      ? normalizeStatusLabel(req.query.status || req.query.booking_status)
      : '';
    if (req.query.date) {
      const range = service.dateRange(req.query.date);
      where.created_at = { [Op.between]: [range.start, range.end] };
    }

    const include = [{
      model: models.stream_project_booking,
      as: 'booking',
      required: false,
      include: [{
        model: models.assigned_crew,
        as: 'assigned_crews',
        required: Boolean(req.query.creative_partners),
        attributes: ['id', 'crew_member_id', 'status'],
        include: [{
          model: models.crew_members,
          as: 'crew_member',
          attributes: ['crew_member_id', 'first_name', 'last_name', 'email'],
          where: req.query.creative_partners ? { crew_member_id: req.query.creative_partners } : undefined
        }]
      }]
    }];

    const shouldFilterDerivedIntent = Boolean(intentFilter);
    const shouldFilterDerivedStatus = Boolean(statusFilter);
    const result = await models.sales_leads.findAndCountAll({
      where,
      include,
      distinct: true,
      order: [['created_at', 'DESC']],
      ...(shouldFilterDerivedIntent || shouldFilterDerivedStatus ? {} : { limit, offset })
    });
    const mappedRows = result.rows.map(mapLeadRow);
    const filteredRows = mappedRows.filter((row) => {
      if (shouldFilterDerivedIntent && String(row.intent || '').toLowerCase() !== intentFilter) return false;
      if (shouldFilterDerivedStatus && normalizeStatusLabel(row.booking_status || row.raw_booking_status) !== statusFilter) return false;
      return true;
    });
    const shouldPaginateAfterFilter = shouldFilterDerivedIntent || shouldFilterDerivedStatus;
    const rows = shouldPaginateAfterFilter ? filteredRows.slice(offset, offset + limit) : filteredRows;
    const total = shouldPaginateAfterFilter ? filteredRows.length : result.count;
    return ok(res, {
      rows,
      unsupported_filters: req.query.booking_type ? ['booking_type'] : [],
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) { return fail(res, error); }
};

exports.salesRepQuotes = async (req, res) => {
  try {
    const { page, limit, offset } = service.pageParams(req.query);
    const where = { assigned_sales_rep_id: req.params.id };
    if (req.query.status) where.status = normalizeQuoteStatusFilter(req.query.status);
    if (req.query.booking_type) where.booking_type = req.query.booking_type;
    if (req.query.date) {
      const range = service.dateRange(req.query.date);
      where.created_at = { [Op.between]: [range.start, range.end] };
    }
    const result = await models.sales_quotes.findAndCountAll({
      where,
      attributes: ['sales_quote_id', 'quote_number', 'client_name', 'client_address', 'project_description', 'video_shoot_type', 'total', 'status', 'valid_until', 'booking_type', 'created_at'],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });
    return ok(res, {
      rows: result.rows.map(mapQuoteRow),
      unsupported_filters: req.query.creative_partners ? ['creative_partners'] : [],
      pagination: { page, limit, total: result.count, pages: Math.ceil(result.count / limit) }
    });
  } catch (error) { return fail(res, error); }
};

exports._private = {
  mapLeadRow
};
