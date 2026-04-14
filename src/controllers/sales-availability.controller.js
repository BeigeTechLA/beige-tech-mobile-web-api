const { sales_rep_availability, sales_rep_live_status, sales_rep_status_activity, users } = require('../models');
const { Op } = require('sequelize');

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function parseRecurrenceDays(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map((day) => String(day).toLowerCase().slice(0, 3));
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((day) => String(day).toLowerCase().slice(0, 3))
      : [];
  } catch (error) {
    return [];
  }
}

function appliesOnDate(rule, targetDate) {
  const target = new Date(targetDate);
  const start = new Date(rule.date);
  const end = rule.recurrence_until ? new Date(rule.recurrence_until) : start;

  target.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  if (target < start || target > end) {
    return false;
  }

  switch (Number(rule.recurrence || 1)) {
    case 1:
      return target.getTime() === start.getTime();
    case 2:
      return true;
    case 3: {
      const recurrenceDays = parseRecurrenceDays(rule.recurrence_days);
      const dayCode = target.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).toLowerCase();
      return recurrenceDays.includes(dayCode);
    }
    case 4:
      return target.getUTCDate() === Number(rule.recurrence_day_of_month);
    default:
      return false;
  }
}

async function resolveTargetSalesRep(req) {
  const requestedId = req.body?.sales_rep_id || req.query?.sales_rep_id;
  const targetId = req.userRole === 'sales_rep' ? req.userId : Number(requestedId);

  if (!targetId) {
    throw new Error('sales_rep_id is required');
  }

  const salesRep = await users.findOne({
    where: {
      id: targetId,
      user_type: 5,
      is_active: 1
    },
    attributes: ['id', 'name', 'email', 'user_type']
  });

  if (!salesRep) {
    throw new Error('Sales rep not found or inactive');
  }

  return salesRep;
}

async function getLiveStatusSnapshot(salesRepId) {
  const currentStatus = await sales_rep_live_status.findOne({
    where: { sales_rep_id: salesRepId },
    attributes: ['sales_rep_id', 'is_available', 'reason', 'updated_at']
  });

  return {
    is_available: currentStatus ? Number(currentStatus.is_available) === 1 : true,
    reason: currentStatus?.reason || null,
    updated_at: currentStatus?.updated_at || null
  };
}

function ensureAdminOrSalesAdmin(req) {
  const allowedRoles = ['admin', 'Admin', 'sales_admin'];

  if (!allowedRoles.includes(req.userRole)) {
    throw new Error('Only admin or sales admin can access this API');
  }
}

function getDateRangeFromQuery(query = {}) {
  const singleDate = normalizeDate(query.date);
  const startDate = normalizeDate(query.start_date);
  const endDate = normalizeDate(query.end_date);

  if (singleDate) {
    return {
      start: new Date(`${singleDate}T00:00:00.000Z`),
      end: new Date(`${singleDate}T23:59:59.999Z`),
      start_date: singleDate,
      end_date: singleDate
    };
  }

  if (startDate && endDate) {
    return {
      start: new Date(`${startDate}T00:00:00.000Z`),
      end: new Date(`${endDate}T23:59:59.999Z`),
      start_date: startDate,
      end_date: endDate
    };
  }

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);

  return {
    start,
    end,
    start_date: normalizeDate(start),
    end_date: normalizeDate(end)
  };
}

exports.getSalesRepAvailability = async (req, res) => {
  try {
    const { year, month } = req.body || {};

    if (!year || !month) {
      return res.status(400).json({
        error: true,
        message: 'year and month are required'
      });
    }

    const salesRep = await resolveTargetSalesRep(req);
    const monthString = String(month).padStart(2, '0');
    const startOfMonth = new Date(`${year}-${monthString}-01T00:00:00.000Z`);

    if (Number.isNaN(startOfMonth.getTime())) {
      return res.status(400).json({
        error: true,
        message: 'Invalid year or month'
      });
    }

    const endOfMonth = new Date(Date.UTC(startOfMonth.getUTCFullYear(), startOfMonth.getUTCMonth() + 1, 0));
    const daysInMonth = endOfMonth.getUTCDate();
    const monthStart = normalizeDate(startOfMonth);
    const monthEnd = normalizeDate(endOfMonth);

    const customAvailability = await sales_rep_availability.findAll({
      where: {
        sales_rep_id: salesRep.id,
        [Op.or]: [
          {
            recurrence: 1,
            date: { [Op.between]: [monthStart, monthEnd] }
          },
          {
            recurrence: { [Op.ne]: 1 },
            date: { [Op.lte]: monthEnd },
            [Op.or]: [
              { recurrence_until: null },
              { recurrence_until: { [Op.gte]: monthStart } }
            ]
          }
        ]
      },
      order: [['created_at', 'DESC']]
    });

    const calendar = {};

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(Date.UTC(Number(year), Number(monthString) - 1, day));
      const dateKey = normalizeDate(date);
      const rule = customAvailability.find((entry) => appliesOnDate(entry, dateKey));

      calendar[dateKey] = {
        available: rule ? String(rule.availability_status) === '1' : true,
        customAvailabilityStatus: rule ? Number(rule.availability_status) : null,
        start_time: rule && Number(rule.is_full_day) === 0 ? rule.start_time : null,
        end_time: rule && Number(rule.is_full_day) === 0 ? rule.end_time : null,
        is_full_day: rule ? Number(rule.is_full_day) : 1,
        notes: rule?.notes || null
      };
    }

    return res.status(200).json({
      error: false,
      message: 'Sales rep availability fetched successfully',
      data: {
        sales_rep_id: salesRep.id,
        sales_rep_name: salesRep.name,
        current_status: await getLiveStatusSnapshot(salesRep.id),
        availability: calendar
      }
    });
  } catch (error) {
    console.error('Error fetching sales rep availability:', error);
    if (error.message === 'sales_rep_id is required') {
      return res.status(400).json({
        error: true,
        message: error.message
      });
    }

    if (error.message === 'Sales rep not found or inactive') {
      return res.status(404).json({
        error: true,
        message: error.message
      });
    }

    return res.status(500).json({
      error: true,
      message: 'Something went wrong while fetching sales rep availability'
    });
  }
};

exports.getSalesRepCurrentStatus = async (req, res) => {
  try {
    const salesRep = await resolveTargetSalesRep(req);
    const currentStatus = await getLiveStatusSnapshot(salesRep.id);

    return res.status(200).json({
      error: false,
      message: 'Sales rep current status fetched successfully',
      data: {
        sales_rep_id: salesRep.id,
        sales_rep_name: salesRep.name,
        ...currentStatus
      }
    });
  } catch (error) {
    console.error('Error fetching sales rep current status:', error);

    if (error.message === 'sales_rep_id is required') {
      return res.status(400).json({
        error: true,
        message: error.message
      });
    }

    if (error.message === 'Sales rep not found or inactive') {
      return res.status(404).json({
        error: true,
        message: error.message
      });
    }

    return res.status(500).json({
      error: true,
      message: 'Something went wrong while fetching sales rep current status'
    });
  }
};

exports.getAllSalesRepStatuses = async (req, res) => {
  try {
    ensureAdminOrSalesAdmin(req);

    const salesReps = await users.findAll({
      where: {
        user_type: 5,
        is_active: 1
      },
      attributes: ['id', 'name', 'email'],
      order: [['name', 'ASC']]
    });

    const salesRepIds = salesReps.map((rep) => rep.id);
    const liveStatuses = salesRepIds.length
      ? await sales_rep_live_status.findAll({
          where: { sales_rep_id: { [Op.in]: salesRepIds } },
          attributes: ['sales_rep_id', 'is_available', 'reason', 'updated_at']
        })
      : [];

    const { start, end, start_date, end_date } = getDateRangeFromQuery(req.query);
    const activityRows = salesRepIds.length
      ? await sales_rep_status_activity.findAll({
          where: {
            sales_rep_id: { [Op.in]: salesRepIds },
            created_at: {
              [Op.between]: [start, end]
            }
          },
          attributes: [
            'sales_rep_id',
            'is_available',
            'created_at'
          ],
          raw: true
        })
      : [];

    const liveStatusMap = new Map(
      liveStatuses.map((row) => [
        row.sales_rep_id,
        {
          is_available: Number(row.is_available) === 1,
          reason: row.reason || null,
          updated_at: row.updated_at || null
        }
      ])
    );

    const activityMap = new Map();
    activityRows.forEach((row) => {
      const key = row.sales_rep_id;
      const activityDate = normalizeDate(row.created_at);

      if (!activityMap.has(key)) {
        activityMap.set(key, {
          activity_by_date: {},
          total_status_changes_in_range: 0
        });
      }

      const current = activityMap.get(key);
      if (!current.activity_by_date[activityDate]) {
        current.activity_by_date[activityDate] = {
          available_count: 0,
          unavailable_count: 0,
          total_status_changes: 0
        };
      }

      if (Number(row.is_available) === 1) {
        current.activity_by_date[activityDate].available_count += 1;
      } else {
        current.activity_by_date[activityDate].unavailable_count += 1;
      }

      current.activity_by_date[activityDate].total_status_changes += 1;
      current.total_status_changes_in_range += 1;
    });

    const data = salesReps.map((rep) => {
      const liveStatus = liveStatusMap.get(rep.id) || {
        is_available: true,
        reason: null,
        updated_at: null
      };
      const activity = activityMap.get(rep.id) || {
        activity_by_date: {},
        total_status_changes_in_range: 0
      };

      return {
        sales_rep_id: rep.id,
        sales_rep_name: rep.name,
        sales_rep_email: rep.email,
        current_status: liveStatus,
        activity
      };
    });

    return res.status(200).json({
      error: false,
      message: 'Sales rep statuses fetched successfully',
      filters: {
        start_date,
        end_date
      },
      data
    });
  } catch (error) {
    console.error('Error fetching all sales rep statuses:', error);

    if (error.message === 'Only admin or sales admin can access this API') {
      return res.status(403).json({
        error: true,
        message: error.message
      });
    }

    return res.status(500).json({
      error: true,
      message: 'Something went wrong while fetching sales rep statuses'
    });
  }
};

exports.toggleSalesRepCurrentStatus = async (req, res) => {
  try {
    const salesRep = await resolveTargetSalesRep(req);
    const { is_available, reason } = req.body || {};

    if (is_available === undefined || is_available === null || is_available === '') {
      return res.status(400).json({
        error: true,
        message: 'is_available is required'
      });
    }

    const normalizedAvailability = Number(is_available) === 1 ? 1 : 0;
    const normalizedReason = normalizedAvailability === 1 ? null : (reason ? String(reason).trim() : null);

    if (normalizedAvailability === 0 && !normalizedReason) {
      return res.status(400).json({
        error: true,
        message: 'reason is required when sales rep is unavailable/off'
      });
    }

    let statusRecord = await sales_rep_live_status.findOne({
      where: { sales_rep_id: salesRep.id }
    });

    if (statusRecord) {
      await statusRecord.update({
        is_available: normalizedAvailability,
        reason: normalizedReason
      });
    } else {
      statusRecord = await sales_rep_live_status.create({
        sales_rep_id: salesRep.id,
        is_available: normalizedAvailability,
        reason: normalizedReason
      });
    }

    await sales_rep_status_activity.create({
      sales_rep_id: salesRep.id,
      is_available: normalizedAvailability,
      reason: normalizedReason
    });

    return res.status(200).json({
      error: false,
      message: 'Sales rep current status updated successfully',
      data: {
        sales_rep_id: salesRep.id,
        sales_rep_name: salesRep.name,
        is_available: Number(statusRecord.is_available) === 1,
        reason: statusRecord.reason || null,
        updated_at: statusRecord.updated_at || null
      }
    });
  } catch (error) {
    console.error('Error updating sales rep current status:', error);

    if (error.message === 'sales_rep_id is required' || error.message === 'is_available is required' || error.message === 'reason is required when sales rep is unavailable/off') {
      return res.status(400).json({
        error: true,
        message: error.message
      });
    }

    if (error.message === 'Sales rep not found or inactive') {
      return res.status(404).json({
        error: true,
        message: error.message
      });
    }

    return res.status(500).json({
      error: true,
      message: 'Something went wrong while updating sales rep current status'
    });
  }
};

exports.setSalesRepAvailability = async (req, res) => {
  try {
    const salesRep = await resolveTargetSalesRep(req);
    const {
      date,
      availability_status,
      start_time,
      end_time,
      location,
      notes,
      is_full_day = 0,
      recurrence = 1,
      recurrence_days = null,
      recurrence_until = null,
      recurrence_day_of_month = null
    } = req.body;

    if (!date || !availability_status) {
      return res.status(400).json({
        error: true,
        message: 'date and availability_status are required'
      });
    }

    if (Number(recurrence) !== 1 && !recurrence_until) {
      return res.status(400).json({
        error: true,
        message: 'recurrence_until is required for recurring availability'
      });
    }

    if (Number(recurrence) === 3 && (!recurrence_days || !recurrence_days.length)) {
      return res.status(400).json({
        error: true,
        message: 'recurrence_days required for weekly recurrence'
      });
    }

    if (Number(recurrence) === 4 && !recurrence_day_of_month) {
      return res.status(400).json({
        error: true,
        message: 'recurrence_day_of_month required for monthly recurrence'
      });
    }

    const payload = {
      sales_rep_id: salesRep.id,
      date: normalizeDate(date),
      availability_status,
      start_time,
      end_time,
      location,
      notes,
      is_full_day,
      recurrence,
      recurrence_until: normalizeDate(recurrence_until),
      recurrence_days: recurrence_days ? JSON.stringify(recurrence_days) : null,
      recurrence_day_of_month
    };

    const availability = await sales_rep_availability.create(payload);

    return res.status(200).json({
      error: false,
      message: 'Sales rep availability saved successfully',
      data: availability
    });
  } catch (error) {
    console.error('Error saving sales rep availability:', error);

    if (error.message === 'sales_rep_id is required') {
      return res.status(400).json({
        error: true,
        message: error.message
      });
    }

    if (error.message === 'Sales rep not found or inactive') {
      return res.status(404).json({
        error: true,
        message: error.message
      });
    }

    return res.status(500).json({
      error: true,
      message: 'Something went wrong while setting sales rep availability'
    });
  }
};
