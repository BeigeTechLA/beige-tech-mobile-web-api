const { sales_leads, discount_codes, payment_links, users, stream_project_booking } = require('../models');
const { Op } = require('sequelize');
const sequelize = require('../db');
const constants = require('../utils/constants');
const leadAssignmentService = require('../services/lead-assignment.service');

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

module.exports = exports;
