const {
  sales_leads,
  client_leads,
  discount_codes,
  payment_links,
  invoice_send_history,
  users,
  sales_rep_live_status,
  stream_project_booking,
  sales_quotes
} = require('../models');
const { Op } = require('sequelize');
const sequelize = require('../db');
const constants = require('../utils/constants');
const leadAssignmentService = require('../services/lead-assignment.service');

function getDashboardStartDate(period) {
  if (!period || period === 'all_time' || period === 'all') {
    return null;
  }

  const startDate = new Date();

  if (period === '7days') {
    startDate.setDate(startDate.getDate() - 7);
    return startDate;
  }

  if (period === '30days') {
    startDate.setDate(startDate.getDate() - 30);
    return startDate;
  }

  if (period === '90days') {
    startDate.setDate(startDate.getDate() - 90);
    return startDate;
  }

  return null;
}

function getDashboardDateRanges(period) {
  if (!period || period === 'all_time' || period === 'all') {
    return {
      currentStartDate: null,
      previousStartDate: null,
      previousEndDate: null
    };
  }

  const currentStartDate = getDashboardStartDate(period);
  if (!currentStartDate) {
    return {
      currentStartDate: null,
      previousStartDate: null,
      previousEndDate: null
    };
  }

  const now = new Date();
  const rangeMs = now.getTime() - currentStartDate.getTime();
  const previousEndDate = new Date(currentStartDate.getTime());
  const previousStartDate = new Date(currentStartDate.getTime() - rangeMs);

  return {
    currentStartDate,
    previousStartDate,
    previousEndDate
  };
}

function buildLeadDashboardWhere({ startDate, salesRepId, req, restrictToLoggedInRep = true }) {
  const whereClause = {
    is_active: 1
  };

  if (startDate) {
    whereClause.created_at = { [Op.gte]: startDate };
  }

  if (restrictToLoggedInRep && req.userRole === 'sales_rep') {
    whereClause.assigned_sales_rep_id = req.userId;
  } else if (salesRepId) {
    whereClause.assigned_sales_rep_id = parseInt(salesRepId, 10);
  }

  return whereClause;
}

function buildPreviousLeadDashboardWhere({ previousStartDate, previousEndDate, salesRepId, req, restrictToLoggedInRep = true }) {
  const whereClause = {
    is_active: 1
  };

  if (previousStartDate && previousEndDate) {
    whereClause.created_at = {
      [Op.gte]: previousStartDate,
      [Op.lt]: previousEndDate
    };
  }

  if (restrictToLoggedInRep && req.userRole === 'sales_rep') {
    whereClause.assigned_sales_rep_id = req.userId;
  } else if (salesRepId) {
    whereClause.assigned_sales_rep_id = parseInt(salesRepId, 10);
  }

  return whereClause;
}

async function getOverviewStatsForModel(LeadModel, whereClause) {
  const totalLeads = await LeadModel.count({
    where: whereClause
  });

  const totalActiveLeads = await LeadModel.count({
    where: whereClause
  });

  const salesAssistedLeads = await LeadModel.count({
    where: {
      ...whereClause,
      lead_type: 'sales_assisted'
    }
  });

  const totalBookings = await LeadModel.count({
    where: {
      ...whereClause,
      lead_status: 'booked'
    }
  });

  const totalConversionRate = totalLeads > 0
    ? Number(((totalBookings / totalLeads) * 100).toFixed(1))
    : 0;

  return {
    total_leads: totalLeads,
    total_active_leads: totalActiveLeads,
    sales_assisted_leads: salesAssistedLeads,
    total_conversion_rate: totalConversionRate,
    total_bookings: totalBookings
  };
}

function getPercentageChange(currentValue, previousValue, options = {}) {
  const { isRate = false } = options;

  if (previousValue === 0) {
    if (currentValue === 0) return 0;
    return 100;
  }

  const change = ((currentValue - previousValue) / previousValue) * 100;
  return Number((isRate ? change : change).toFixed(1));
}

function withTrend(currentStats, previousStats, period) {
  const trendValue = (current, previous, options = {}) =>
    period === 'all_time' || period === 'all'
      ? 0
      : getPercentageChange(current, previous, options);

  return {
    total_active_leads: {
      value: currentStats.total_active_leads,
      change_percent: trendValue(currentStats.total_active_leads, previousStats.total_active_leads)
    },
    sales_assisted_leads: {
      value: currentStats.sales_assisted_leads,
      change_percent: trendValue(currentStats.sales_assisted_leads, previousStats.sales_assisted_leads)
    },
    total_conversion_rate: {
      value: currentStats.total_conversion_rate,
      change_percent: trendValue(currentStats.total_conversion_rate, previousStats.total_conversion_rate, { isRate: true })
    },
    total_bookings: {
      value: currentStats.total_bookings,
      change_percent: trendValue(currentStats.total_bookings, previousStats.total_bookings)
    }
  };
}

function combineOverviewStats(salesStats, clientStats) {
  const totalLeads = salesStats.total_leads + clientStats.total_leads;
  const totalBookings = salesStats.total_bookings + clientStats.total_bookings;

  return {
    total_active_leads: salesStats.total_active_leads + clientStats.total_active_leads,
    sales_assisted_leads: salesStats.sales_assisted_leads + clientStats.sales_assisted_leads,
    total_conversion_rate: totalLeads > 0
      ? Number(((totalBookings / totalLeads) * 100).toFixed(1))
      : 0,
    total_bookings: totalBookings
  };
}

/**
 * Get dashboard overview statistics
 * GET /api/sales/dashboard/stats
 */
exports.getDashboardStats = async (req, res) => {
  try {
    const { period = '30days', sales_rep_id } = req.query;

    // Calculate date range
    let startDate = new Date();
    if (period === '7days') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === '30days') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (period === '90days') {
      startDate.setDate(startDate.getDate() - 90);
    }

    // Build where clause for leads
    const leadsWhere = {
      created_at: { [Op.gte]: startDate }
    };

    if (sales_rep_id) {
      leadsWhere.assigned_sales_rep_id = parseInt(sales_rep_id);
    }

    // Total leads
    const totalLeads = await sales_leads.count({
      where: leadsWhere
    });

    // Leads by type
    const selfServeLeads = await sales_leads.count({
      where: { ...leadsWhere, lead_type: 'self_serve' }
    });

    const salesAssistedLeads = await sales_leads.count({
      where: { ...leadsWhere, lead_type: 'sales_assisted' }
    });

    // Leads by status
    const statusCounts = await sales_leads.findAll({
      attributes: [
        'lead_status',
        [sequelize.fn('COUNT', sequelize.col('lead_id')), 'count']
      ],
      where: leadsWhere,
      group: ['lead_status'],
      raw: true
    });

    const statusMap = {};
    statusCounts.forEach(row => {
      statusMap[row.lead_status] = parseInt(row.count);
    });

    // Conversion metrics
    const bookedLeads = statusMap['booked'] || 0;
    const conversionRate = totalLeads > 0 
      ? Math.round((bookedLeads / totalLeads) * 100) 
      : 0;

    // Discount codes stats
    const discountCodesWhere = {
      created_at: { [Op.gte]: startDate }
    };

    if (sales_rep_id) {
      discountCodesWhere.created_by_user_id = parseInt(sales_rep_id);
    }

    const totalDiscountCodes = await discount_codes.count({
      where: discountCodesWhere
    });

    const activeDiscountCodes = await discount_codes.count({
      where: {
        ...discountCodesWhere,
        is_active: 1,
        [Op.or]: [
          { expires_at: null },
          { expires_at: { [Op.gt]: new Date() } }
        ]
      }
    });

    // Payment links stats
    const paymentLinksWhere = {
      created_at: { [Op.gte]: startDate }
    };

    if (sales_rep_id) {
      paymentLinksWhere.created_by_user_id = parseInt(sales_rep_id);
    }

    const totalPaymentLinks = await payment_links.count({
      where: paymentLinksWhere
    });

    const usedPaymentLinks = await payment_links.count({
      where: { ...paymentLinksWhere, is_used: 1 }
    });

    const linkConversionRate = totalPaymentLinks > 0
      ? Math.round((usedPaymentLinks / totalPaymentLinks) * 100)
      : 0;

    // Revenue (sum of completed bookings)
    const completedBookings = await stream_project_booking.findAll({
      attributes: [
        [sequelize.fn('SUM', sequelize.col('budget')), 'total_revenue'],
        [sequelize.fn('COUNT', sequelize.col('stream_project_booking_id')), 'booking_count']
      ],
      where: {
        is_completed: 1,
        created_at: { [Op.gte]: startDate }
      },
      raw: true
    });

    const totalRevenue = completedBookings[0]?.total_revenue || 0;
    const completedBookingCount = completedBookings[0]?.booking_count || 0;

    res.json({
      success: true,
      data: {
        period,
        overview: {
          total_leads: totalLeads,
          self_serve_leads: selfServeLeads,
          sales_assisted_leads: salesAssistedLeads,
          booked_leads: bookedLeads,
          conversion_rate: conversionRate,
          total_revenue: parseFloat(totalRevenue || 0),
          completed_bookings: parseInt(completedBookingCount)
        },
        leads_by_status: statusMap,
        discount_codes: {
          total: totalDiscountCodes,
          active: activeDiscountCodes
        },
        payment_links: {
          total: totalPaymentLinks,
          used: usedPaymentLinks,
          conversion_rate: linkConversionRate
        }
      }
    });

  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch dashboard stats',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get combined overview statistics for dashboard cards
 * GET /api/sales/dashboard/overview
 */
exports.getCombinedOverviewStats = async (req, res) => {
  try {
    const { period = 'all_time', sales_rep_id } = req.query;
    const {
      currentStartDate,
      previousStartDate,
      previousEndDate
    } = getDashboardDateRanges(period);

    const salesWhere = buildLeadDashboardWhere({
      startDate: currentStartDate,
      salesRepId: sales_rep_id,
      req,
      restrictToLoggedInRep: false
    });

    const clientWhere = buildLeadDashboardWhere({
      startDate: currentStartDate,
      salesRepId: sales_rep_id,
      req,
      restrictToLoggedInRep: false
    });

    const previousSalesWhere = buildPreviousLeadDashboardWhere({
      previousStartDate,
      previousEndDate,
      salesRepId: sales_rep_id,
      req,
      restrictToLoggedInRep: false
    });

    const previousClientWhere = buildPreviousLeadDashboardWhere({
      previousStartDate,
      previousEndDate,
      salesRepId: sales_rep_id,
      req,
      restrictToLoggedInRep: false
    });

    const salesOverview = await getOverviewStatsForModel(sales_leads, salesWhere);
    const clientOverview = await getOverviewStatsForModel(client_leads, clientWhere);
    const previousSalesOverview = await getOverviewStatsForModel(sales_leads, previousSalesWhere);
    const previousClientOverview = await getOverviewStatsForModel(client_leads, previousClientWhere);

    const combinedOverview = combineOverviewStats(salesOverview, clientOverview);
    const previousCombinedOverview = combineOverviewStats(previousSalesOverview, previousClientOverview);

    return res.json({
      success: true,
      data: {
        period,
        combined: withTrend(combinedOverview, previousCombinedOverview, period),
        sales_leads: withTrend(salesOverview, previousSalesOverview, period),
        client_leads: withTrend(clientOverview, previousClientOverview, period)
      }
    });
  } catch (error) {
    console.error('Error fetching combined overview stats:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch dashboard overview stats',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get sales rep performance statistics
 * GET /api/sales/dashboard/rep-stats/:repId
 */
exports.getSalesRepStats = async (req, res) => {
  try {
    const { repId } = req.params;
    const { period = '30days' } = req.query;

    // Calculate date range
    let startDate = new Date();
    if (period === '7days') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === '30days') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (period === '90days') {
      startDate.setDate(startDate.getDate() - 90);
    }

    // Get rep workload
    const workload = await leadAssignmentService.getSalesRepWorkload(parseInt(repId));

    if (workload.length === 0) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Sales rep not found'
      });
    }

    // Get performance metrics
    const leadsWhere = {
      assigned_sales_rep_id: parseInt(repId),
      created_at: { [Op.gte]: startDate }
    };

    const totalLeads = await sales_leads.count({ where: leadsWhere });
    
    const bookedLeads = await sales_leads.count({
      where: { ...leadsWhere, lead_status: 'booked' }
    });

    const conversionRate = totalLeads > 0
      ? Math.round((bookedLeads / totalLeads) * 100)
      : 0;

    // Average time to close (in hours)
    const closedLeads = await sales_leads.findAll({
      where: {
        ...leadsWhere,
        lead_status: 'booked'
      },
      attributes: [
        'created_at',
        'updated_at'
      ],
      raw: true
    });

    let avgTimeToClose = 0;
    if (closedLeads.length > 0) {
      const totalHours = closedLeads.reduce((sum, lead) => {
        const created = new Date(lead.created_at);
        const updated = new Date(lead.updated_at);
        const hours = (updated - created) / (1000 * 60 * 60);
        return sum + hours;
      }, 0);
      avgTimeToClose = Math.round(totalHours / closedLeads.length);
    }

    res.json({
      success: true,
      data: {
        rep_info: workload[0],
        performance: {
          total_leads: totalLeads,
          booked_leads: bookedLeads,
          conversion_rate: conversionRate,
          avg_time_to_close_hours: avgTimeToClose
        }
      }
    });

  } catch (error) {
    console.error('Error fetching sales rep stats:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch sales rep stats',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all sales reps with workload
 * GET /api/sales/dashboard/sales-reps
 */
exports.getSalesRepsWorkload = async (req, res) => {
  try {
    const workload = await leadAssignmentService.getSalesRepWorkload();

    res.json({
      success: true,
      data: {
        sales_reps: workload
      }
    });

  } catch (error) {
    console.error('Error fetching sales reps workload:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch sales reps workload',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get active sales reps list
 * GET /api/sales/sales-reps
 */
// exports.getSalesRepsList = async (req, res) => {
//   try {
//     const { user_type } = require('../models');

//     const salesRepType = await user_type.findOne({
//       where: { user_role: 'sales_rep' },
//       attributes: ['user_type_id']
//     });

//     if (!salesRepType) {
//       return res.json({
//         success: true,
//         data: salesReps
//       });
//     }

//     const salesReps = await users.findAll({
//       where: {
//         user_type: salesRepType.user_type_id,
//         is_active: 1
//       },
//       attributes: ['id', 'name', 'email'],
//       order: [['name', 'ASC']]
//     });

//     res.json({
//       success: true,
//       data: salesReps
//     });
//   } catch (error) {
//     console.error('Error fetching sales reps list:', error);
//     res.status(constants.INTERNAL_SERVER_ERROR.code).json({
//       success: false,
//       message: 'Failed to fetch sales reps list',
//       error: process.env.NODE_ENV === 'development' ? error.message : undefined
//     });
//   }
// };

exports.getSalesRepsList = async (req, res) => {
  try {
    const { user_type, users, Sequelize } = require('../models');
    const { Op } = Sequelize;

    // Get both roles
    const userTypes = await user_type.findAll({
      where: {
        user_role: {
          [Op.in]: ['sales_rep']
        }
      },
      attributes: ['user_type_id']
    });

    const userTypeIds = userTypes.map(u => u.user_type_id);

    // If no roles found
    if (userTypeIds.length === 0) {
      return res.json({
        success: true,
        data: []
      });
    }

    // Fetch users
    const salesReps = await users.findAll({
      where: {
        user_type: {
          [Op.in]: userTypeIds
        },
        is_active: 1
      },
      attributes: ['id', 'name', 'email', 'user_type'],
      order: [['name', 'ASC']]
    });

    const salesRepIds = salesReps.map((rep) => rep.id);
    const liveStatuses = salesRepIds.length
      ? await sales_rep_live_status.findAll({
          where: {
            sales_rep_id: {
              [Op.in]: salesRepIds
            }
          },
          attributes: ['sales_rep_id', 'is_available', 'reason', 'updated_at'],
          raw: true
        })
      : [];

    const liveStatusMap = new Map(
      liveStatuses.map((statusRow) => [
        statusRow.sales_rep_id,
        {
          is_available: Number(statusRow.is_available) === 1,
          reason: statusRow.reason || null,
          updated_at: statusRow.updated_at || null
        }
      ])
    );

    const salesRepsWithStatus = salesReps.map((rep) => {
      const currentStatus = liveStatusMap.get(rep.id) || {
        is_available: true,
        reason: null,
        updated_at: null
      };

      return {
        ...rep.toJSON(),
        status: currentStatus.is_available ? 'active' : 'inactive'
      };
    });

    res.json({
      success: true,
      data: salesRepsWithStatus
    });
  } catch (error) {
    console.error('Error fetching sales reps list:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sales reps list',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
/**
 * Get recent activities across all leads
 * GET /api/sales/dashboard/recent-activities
 */
exports.getRecentActivities = async (req, res) => {
  try {
    const { limit = 20, sales_rep_id } = req.query;
    const { sales_lead_activities } = require('../models');

    const whereClause = {};

    // If filtering by sales rep, only show activities for their leads
    if (sales_rep_id) {
      const repLeads = await sales_leads.findAll({
        where: { assigned_sales_rep_id: parseInt(sales_rep_id) },
        attributes: ['lead_id']
      });
      const leadIds = repLeads.map(l => l.lead_id);
      whereClause.lead_id = { [Op.in]: leadIds };
    }

    const activities = await sales_lead_activities.findAll({
      where: whereClause,
      include: [
        {
          model: sales_leads,
          as: 'lead',
          attributes: ['lead_id', 'client_name', 'guest_email', 'lead_status'],
          include: [
            {
              model: users,
              as: 'assigned_sales_rep',
              attributes: ['id', 'name']
            }
          ]
        },
        {
          model: users,
          as: 'performed_by',
          attributes: ['id', 'name']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: {
        activities
      }
    });

  } catch (error) {
    console.error('Error fetching recent activities:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch recent activities',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get leads funnel data
 * GET /api/sales/dashboard/funnel
 */
exports.getLeadsFunnelData = async (req, res) => {
  try {
    const { period = '30days', sales_rep_id } = req.query;

    let startDate = new Date();
    if (period === '7days') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === '30days') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (period === '90days') {
      startDate.setDate(startDate.getDate() - 90);
    }

    const leadsWhere = {
      created_at: { [Op.gte]: startDate }
    };

    if (sales_rep_id) {
      leadsWhere.assigned_sales_rep_id = parseInt(sales_rep_id);
    }

    const totalLeads = await sales_leads.count({ where: leadsWhere });
    
    const paymentLinkSent = await sales_leads.count({
      where: { 
        ...leadsWhere, 
        lead_status: { 
          [Op.in]: ['payment_link_sent', 'discount_applied', 'booked'] 
        }
      }
    });

    const discountApplied = await sales_leads.count({
      where: { 
        ...leadsWhere, 
        lead_status: { [Op.in]: ['discount_applied', 'booked'] }
      }
    });

    const booked = await sales_leads.count({
      where: { ...leadsWhere, lead_status: 'booked' }
    });

    res.json({
      success: true,
      data: {
        funnel: [
          { stage: 'Leads', count: totalLeads },
          { stage: 'Payment Link Sent', count: paymentLinkSent },
          { stage: 'Discount Applied', count: discountApplied },
          { stage: 'Booked', count: booked }
        ]
      }
    });

  } catch (error) {
    console.error('Error fetching funnel data:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch funnel data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get invoice send history for admin/sales screens
 * GET /api/sales/dashboard/invoice-history
 */
exports.getInvoiceHistory = async (req, res) => {
  try {
    const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const status = String(req.query.status || '').trim().toLowerCase();
    const search = String(req.query.search || '').trim().toLowerCase();
    const salesRepId = req.userRole === 'sales_rep'
      ? req.userId
      : (req.query.sales_rep_id ? parseInt(req.query.sales_rep_id, 10) : null);

    const whereClause = {};
    if (salesRepId) {
      whereClause.assigned_sales_rep_id = salesRepId;
    }
    if (status === 'paid' || status === 'pending') {
      whereClause.payment_status = status;
    }

    const historyRows = await invoice_send_history.findAll({
      where: whereClause,
      include: [
        {
          model: users,
          as: 'sent_by',
          required: false,
          attributes: ['id', 'name']
        },
        {
          model: users,
          as: 'assigned_sales_rep',
          required: false,
          attributes: ['id', 'name']
        },
        {
          model: stream_project_booking,
          as: 'booking',
          required: false,
          attributes: ['stream_project_booking_id']
        },
        {
          model: sales_quotes,
          as: 'quote',
          required: false,
          attributes: ['sales_quote_id', 'quote_number']
        }
      ],
      order: [['sent_at', 'DESC'], ['invoice_send_history_id', 'DESC']]
    });

    let items = historyRows.map((row) => ({
      invoice_send_history_id: row.invoice_send_history_id,
      lead_id: row.lead_id,
      client_lead_id: row.client_lead_id,
      booking_id: row.booking_id,
      quote_id: row.quote_id || row.quote?.sales_quote_id || null,
      quote_number: row.quote?.quote_number || null,
      client_name: row.client_name,
      client_email: row.client_email,
      send_date_time: row.sent_at,
      payment_status: row.payment_status,
      invoice_number: row.invoice_number,
      invoice_url: row.invoice_url,
      invoice_pdf: row.invoice_pdf,
      sent_by: row.sent_by ? {
        id: row.sent_by.id,
        name: row.sent_by.name
      } : null,
      sales_rep: row.assigned_sales_rep ? {
        id: row.assigned_sales_rep.id,
        name: row.assigned_sales_rep.name
      } : null,
      created_at: row.created_at
    }));

    if (search) {
      items = items.filter((item) => {
        const haystack = [
          item.invoice_send_history_id,
          item.client_lead_id,
          item.lead_id,
          item.booking_id,
          item.quote_id,
          item.quote_number,
          item.client_name,
          item.client_email,
          item.invoice_number
        ]
          .filter((value) => value !== null && value !== undefined)
          .join(' ')
          .toLowerCase();

        return haystack.includes(search);
      });
    }

    items.sort((a, b) => new Date(b.send_date_time) - new Date(a.send_date_time));

    const total = items.length;
    const offset = (page - 1) * limit;
    const paginatedItems = items.slice(offset, offset + limit);

    return res.json({
      success: true,
      data: {
        items: paginatedItems,
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching invoice history:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch invoice history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = exports;
