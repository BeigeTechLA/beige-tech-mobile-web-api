const { users, sales_leads, user_type } = require('../models');
const { Op } = require('sequelize');
const sequelize = require('../db');

/**
 * Get all active sales reps
 * @returns {Promise<Array>} Array of sales rep users
 */
async function getActiveSalesReps() {
  // Find user_type_id for 'sales_rep'
  const salesRepType = await user_type.findOne({
    where: { user_role: 'sales_rep' }
  });
  
  if (!salesRepType) {
    throw new Error('Sales rep user type not found in database');
  }
  
  return await users.findAll({
    where: {
      user_type: salesRepType.user_type_id,
      is_active: 1
    },
    attributes: ['id', 'name', 'email']
  });
}

/**
 * Get lead count per sales rep in a given time period
 * @param {Array} salesRepIds - Array of sales rep user IDs
 * @param {number} hours - Number of hours to look back (default: 24)
 * @returns {Promise<Map>} Map of rep ID to lead count
 */
async function getLeadCountsPerRep(salesRepIds, hours = 24) {
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - hours);
  
  const leadCounts = await sales_leads.findAll({
    attributes: [
      'assigned_sales_rep_id',
      [sequelize.fn('COUNT', sequelize.col('lead_id')), 'count']
    ],
    where: {
      assigned_sales_rep_id: { [Op.in]: salesRepIds },
      created_at: { [Op.gte]: cutoffDate }
    },
    group: ['assigned_sales_rep_id'],
    raw: true
  });
  
  // Create map with all reps initialized to 0
  const countMap = new Map();
  salesRepIds.forEach(id => countMap.set(id, 0));
  
  // Update with actual counts
  leadCounts.forEach(row => {
    countMap.set(row.assigned_sales_rep_id, parseInt(row.count));
  });
  
  return countMap;
}

/**
 * Find sales rep with fewest leads (round-robin distribution)
 * @param {Array} salesReps - Array of sales rep users
 * @param {Map} leadCounts - Map of rep ID to lead count
 * @returns {Object} Sales rep with fewest leads
 */
function findRepWithFewestLeads(salesReps, leadCounts) {
  if (salesReps.length === 0) {
    throw new Error('No active sales reps available');
  }
  
  let minCount = Infinity;
  let selectedRep = salesReps[0];
  
  for (const rep of salesReps) {
    const count = leadCounts.get(rep.id) || 0;
    if (count < minCount) {
      minCount = count;
      selectedRep = rep;
    }
  }
  
  return selectedRep;
}

/**
 * Automatically assign lead to sales rep using round-robin
 * @param {number} leadId - Lead ID to assign
 * @returns {Promise<Object>} Assigned sales rep info
 */
async function autoAssignLead(leadId) {
  const autoAssignEnabled = process.env.SALES_AUTO_ASSIGNMENT !== 'false';
  
  if (!autoAssignEnabled) {
    return null;
  }
  
  // Get all active sales reps
  const salesReps = await getActiveSalesReps();
  
  if (salesReps.length === 0) {
    console.warn('No active sales reps available for auto-assignment');
    return null;
  }
  
  // Get lead counts for last 24 hours
  const salesRepIds = salesReps.map(rep => rep.id);
  const leadCounts = await getLeadCountsPerRep(salesRepIds, 24);
  
  // Find rep with fewest leads
  const selectedRep = findRepWithFewestLeads(salesReps, leadCounts);
  
  // Update lead with assigned rep
  await sales_leads.update(
    { assigned_sales_rep_id: selectedRep.id },
    { where: { lead_id: leadId } }
  );
  
  console.log(`Lead ${leadId} auto-assigned to sales rep ${selectedRep.name} (ID: ${selectedRep.id})`);
  
  return {
    id: selectedRep.id,
    name: selectedRep.name,
    email: selectedRep.email
  };
}

/**
 * Manually assign or reassign lead to a specific sales rep
 * @param {number} leadId - Lead ID
 * @param {number} salesRepId - Sales rep user ID
 * @param {number} performedByUserId - User ID of person performing the assignment
 * @returns {Promise<void>}
 */
async function manuallyAssignLead(leadId, salesRepId, performedByUserId) {
  const { sales_lead_activities } = require('../models');
  
  // Verify sales rep exists and is active
  const salesRep = await users.findOne({
    where: { 
      id: salesRepId,
      is_active: 1
    }
  });
  
  if (!salesRep) {
    throw new Error('Sales rep not found or inactive');
  }
  
  // Get current assignment for history
  const lead = await sales_leads.findByPk(leadId);
  const previousRepId = lead.assigned_sales_rep_id;
  
  // Update lead assignment
  await sales_leads.update(
    { assigned_sales_rep_id: salesRepId },
    { where: { lead_id: leadId } }
  );
  
  // Log activity
  await sales_lead_activities.create({
    lead_id: leadId,
    activity_type: 'assigned',
    activity_data: {
      previous_rep_id: previousRepId,
      new_rep_id: salesRepId,
      assignment_type: 'manual'
    },
    performed_by_user_id: performedByUserId
  });
  
  console.log(`Lead ${leadId} manually assigned to sales rep ${salesRep.name} (ID: ${salesRepId})`);
}

/**
 * Get sales rep workload statistics
 * @param {number|null} salesRepId - Optional specific sales rep ID
 * @returns {Promise<Array>} Array of rep workload stats
 */
async function getSalesRepWorkload(salesRepId = null) {
  const whereClause = {};
  if (salesRepId) {
    whereClause.id = salesRepId;
  } else {
    // Get all sales reps
    const salesRepType = await user_type.findOne({
      where: { user_role: 'sales_rep' }
    });
    whereClause.user_type = salesRepType?.user_type_id;
  }
  
  whereClause.is_active = 1;
  
  const salesReps = await users.findAll({
    where: whereClause,
    attributes: ['id', 'name', 'email'],
    include: [
      {
        model: sales_leads,
        as: 'assigned_leads',
        attributes: ['lead_id', 'lead_status'],
        required: false
      }
    ]
  });
  
  return salesReps.map(rep => {
    const leads = rep.assigned_leads || [];
    const activeLeads = leads.filter(l => 
      !['booked', 'abandoned'].includes(l.lead_status)
    );
    
    return {
      rep_id: rep.id,
      rep_name: rep.name,
      rep_email: rep.email,
      total_assigned: leads.length,
      active_leads: activeLeads.length,
      in_progress: activeLeads.filter(l => 
        l.lead_status.includes('in_progress')
      ).length,
      payment_link_sent: activeLeads.filter(l => 
        l.lead_status === 'payment_link_sent'
      ).length,
      discount_applied: activeLeads.filter(l => 
        l.lead_status === 'discount_applied'
      ).length
    };
  });
}

/**
 * Unassign lead from sales rep
 * @param {number} leadId - Lead ID
 * @param {number} performedByUserId - User ID of person performing the action
 * @returns {Promise<void>}
 */
async function unassignLead(leadId, performedByUserId) {
  const { sales_lead_activities } = require('../models');
  
  const lead = await sales_leads.findByPk(leadId);
  const previousRepId = lead.assigned_sales_rep_id;
  
  await sales_leads.update(
    { assigned_sales_rep_id: null },
    { where: { lead_id: leadId } }
  );
  
  // Log activity
  await sales_lead_activities.create({
    lead_id: leadId,
    activity_type: 'assigned',
    activity_data: {
      previous_rep_id: previousRepId,
      new_rep_id: null,
      assignment_type: 'unassigned'
    },
    performed_by_user_id: performedByUserId
  });
}

module.exports = {
  getActiveSalesReps,
  getLeadCountsPerRep,
  findRepWithFewestLeads,
  autoAssignLead,
  manuallyAssignLead,
  getSalesRepWorkload,
  unassignLead
};
