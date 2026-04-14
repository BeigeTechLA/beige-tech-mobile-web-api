const {
  users,
  sales_leads,
  client_leads,
  user_type,
  sales_rep_availability,
  sales_rep_live_status
} = require('../models');
const { Op } = require('sequelize');
const sequelize = require('../db');

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

function appliesAvailabilityRuleOnDate(rule, targetDate) {
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

async function getLeadAssignmentDate(leadId, options = {}) {
  const leadModel = options.leadModel || sales_leads;
  const transaction = options.transaction || null;

  const lead = await leadModel.findOne({
    where: { lead_id: leadId },
    attributes: ['lead_id', 'booking_id', 'created_at'],
    transaction
  });

  if (!lead) {
    return null;
  }

  // Availability should be matched against when the lead/book-a-shoot
  // entry was created, not the event/shoot date.
  return normalizeDate(lead.created_at);
}

async function getUnavailableSalesRepIdsForDate(assignmentDate, salesRepIds, options = {}) {
  if (!assignmentDate || !salesRepIds?.length) {
    return new Set();
  }

  const transaction = options.transaction || null;
  const entries = await sales_rep_availability.findAll({
    where: {
      sales_rep_id: { [Op.in]: salesRepIds },
      date: { [Op.lte]: assignmentDate },
      [Op.or]: [
        { recurrence_until: null },
        { recurrence_until: { [Op.gte]: assignmentDate } }
      ]
    },
    order: [['created_at', 'DESC']],
    transaction
  });

  const unavailableIds = new Set();
  const resolvedIds = new Set();

  for (const entry of entries) {
    if (resolvedIds.has(entry.sales_rep_id)) {
      continue;
    }

    if (!appliesAvailabilityRuleOnDate(entry, assignmentDate)) {
      continue;
    }

    resolvedIds.add(entry.sales_rep_id);

    if (String(entry.availability_status) !== '1') {
      unavailableIds.add(entry.sales_rep_id);
    }
  }

  return unavailableIds;
}

async function getUnavailableSalesRepIdsByLiveStatus(salesRepIds, options = {}) {
  if (!salesRepIds?.length) {
    return new Set();
  }

  const transaction = options.transaction || null;
  const liveStatuses = await sales_rep_live_status.findAll({
    where: {
      sales_rep_id: { [Op.in]: salesRepIds },
      is_available: 0
    },
    attributes: ['sales_rep_id'],
    transaction
  });

  return new Set(liveStatuses.map((entry) => entry.sales_rep_id));
}

/**
 * Get all active sales reps
 * @returns {Promise<Array>} Array of sales rep users
 */
async function getActiveSalesReps(options = {}) {
  const transaction = options.transaction || null;

  // Find user_type_id for 'sales_rep'
  const salesRepType = await user_type.findOne({
    where: { user_role: 'sales_rep' },
    transaction
  });
  
  if (!salesRepType) {
    throw new Error('Sales rep user type not found in database');
  }
  
  return await users.findAll({
    where: {
      user_type: salesRepType.user_type_id,
      is_active: 1
    },
    attributes: ['id', 'name', 'email'],
    transaction
  });
}

/**
 * Get lead count per sales rep in a given time period
 * @param {Array} salesRepIds - Array of sales rep user IDs
 * @param {number} hours - Number of hours to look back (default: 24)
 * @returns {Promise<Map>} Map of rep ID to lead count
 */
async function getLeadCountsPerRep(salesRepIds, hours = 24, options = {}) {
  const {
    leadModel = sales_leads,
    transaction = null
  } = options;
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - hours);
  
  const leadCounts = await leadModel.findAll({
    attributes: [
      'assigned_sales_rep_id',
      [sequelize.fn('COUNT', sequelize.col('lead_id')), 'count']
    ],
    where: {
      assigned_sales_rep_id: { [Op.in]: salesRepIds },
      created_at: { [Op.gte]: cutoffDate },
      is_active: 1
    },
    group: ['assigned_sales_rep_id'],
    raw: true,
    transaction
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
async function autoAssignLead(leadId, options = {}) {
  const transaction = options.transaction || null;
  const leadModel = options.leadModel || sales_leads;

  const autoAssignEnabled = process.env.SALES_AUTO_ASSIGNMENT !== 'false';
  
  if (!autoAssignEnabled) {
    return null;
  }

  // 1️⃣ Get all active sales reps
  const salesReps = await getActiveSalesReps({ transaction });

  if (!salesReps.length) {
    console.warn('No active sales reps available for auto-assignment');
    return null;
  }

  // 2️⃣ Get lead counts for last 24 hours
  const salesRepIds = salesReps.map(rep => rep.id);
  const leadCounts = await getLeadCountsPerRep(salesRepIds, 24, { leadModel, transaction });

  // 3️⃣ Find rep with fewest leads
  const selectedRep = findRepWithFewestLeads(salesReps, leadCounts);

  // 4️⃣ Update lead WITH SAME TRANSACTION
  await leadModel.update(
    { assigned_sales_rep_id: selectedRep.id },
    { 
      where: { lead_id: leadId },
      transaction
    }
  );

  console.log(
    `Lead ${leadId} auto-assigned to ${selectedRep.name} (ID: ${selectedRep.id})`
  );

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
  const lead = await sales_leads.findOne({
    where: {
      lead_id: leadId,
      is_active: 1
    }
  });

  if (!lead) {
    throw new Error('Lead not found');
  }
  const previousRepId = lead.assigned_sales_rep_id;
  
  // Update lead assignment
  await sales_leads.update(
    { assigned_sales_rep_id: salesRepId },
    {
      where: {
        lead_id: leadId,
        is_active: 1
      }
    }
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

// const getLeadBookingStatus = (lead, booking) => {
//   if (lead.lead_status === 'abandoned') {
//     return 'Closed – Lost';
//   }

//   if (booking?.payment_id) {
//     return 'Booked';
//   }

//   if (lead.lead_status === 'payment_link_sent') {
//     return 'Payment Sent';
//   }

//   if (booking && booking.is_draft === 0) {
//     return 'Ready for Payment';
//   }

//   if (booking && booking.is_draft === 1) {
//     return 'Booking In Progress';
//   }

//   if (!booking && lead.lead_type === 'sales_assisted') {
//     return 'Manual – Lead Created';
//   }

//   return 'Lead Created';
// };

// Add/Update this in your service file
// const getLeadBookingStatus = (lead, booking) => {
//   // 1. Closed - Lost
//   if (lead.lead_status === 'abandoned' || booking?.is_cancelled) {
//     return 'Closed – Lost';
//   }

//   // 2. Booked (Payment verified)
//   if (booking?.payment_id || lead.lead_status === 'booked') {
//     return 'Booked';
//   }

//   // 3. Proposal Sent (Invoice generated/sent)
//   if (lead.lead_status === 'proposal_sent') {
//     return 'Proposal Sent (optional)';
//   }

//   // 4. Payment Sent (Link generated/emailed)
//   if (lead.lead_status === 'payment_link_sent') {
//     return 'Payment Sent';
//   }

//   // 5. Ready for Payment (Booking finalized but link not sent)
//   if (booking && booking.is_draft === 0) {
//     return 'Ready for Payment';
//   }

//   // 6. Booking In Progress
//   if (lead.lead_status === 'booking_in_progress' || (booking && booking.is_draft === 1)) {
//     // If it's a specific "Lead Created" status, show that instead of "In Progress"
//     if (lead.lead_status === 'book_a_shoot_lead_created') return 'Book a shoot – Lead Created';
//     if (lead.lead_status === 'manual_lead_created') return 'Manual – Lead Created';
    
//     return 'Booking In Progress';
//   }

//   // 7. Initial Lead States
//   if (lead.lead_status === 'book_a_shoot_lead_created') return 'Book a shoot – Lead Created';
//   if (lead.lead_status === 'manual_lead_created') return 'Manual – Lead Created';

//   // Fallback / Default
//   return 'Signed Up – Lead Created';
// };

const getLeadBookingStatus = (lead, booking) => {
  // 1. Closed - Lost
  if (lead.lead_status === 'abandoned' || booking?.is_cancelled) {
    return 'Closed – Lost';
  }

  // 2. Booked (Payment verified)
  if (booking?.payment_id || lead.lead_status === 'booked') {
    return 'Paid';
  }

  // 3. Proposal Sent (Invoice generated/sent)
  if (lead.lead_status === 'proposal_sent') {
    return 'Payment Link Sent';
  }

  // 4. Payment Sent (Link generated/emailed)
  if (lead.lead_status === 'payment_link_sent') {
    return 'Payment Link Sent';
  }

  // 5. Ready for Payment (Booking finalized but link not sent)
  if (booking && booking.is_draft === 0) {
    return 'Ready for Payment';
  }

  // 6. Booking In Progress
  if (lead.lead_status === 'booking_in_progress' || (booking && booking.is_draft === 1)) {
    // If it's a specific "Lead Created" status, show that instead of "In Progress"
    if (lead.lead_status === 'book_a_shoot_lead_created') return 'Book a shoot – Lead Created';
    if (lead.lead_status === 'manual_lead_created') return 'Manual – Lead Created';
    
    return 'Booking In Progress';
  }

  // 7. Initial Lead States
  if (lead.lead_status === 'book_a_shoot_lead_created') return 'Book a shoot – Lead Created';
  if (lead.lead_status === 'manual_lead_created') return 'Manual – Lead Created';

  // Fallback / Default
  return 'Signed Up';
};

const getLeadIntent = ({ lead, booking }) => {
  // 1. Manual override (highest priority)
  if (lead?.intent) {
    return lead.intent; // Hot | Warm | Cold
  }

  // 2. Payment done → always Hot
  if (booking?.payment_id) {
    return 'Hot';
  }

  // 3. Checkout reached (non-draft booking)
  if (booking && booking.is_draft === false) {
    return 'Hot';
  }

  // 4. Draft booking exists
  if (booking && booking.is_draft === true) {
    return 'Warm';
  }

  // 5. Lead exists but no booking
  if (lead) {
    return 'Cold';
  }

  // Fallback
  return 'Cold';
};

const getClientIntent = ({ lead, booking }) => {
  if (lead?.intent) {
    return lead.intent;
  }

  if (booking?.payment_id || lead?.lead_status === 'booked') {
    return 'Hot';
  }

  if (lead?.lead_status === 'proposal_sent' || lead?.lead_status === 'payment_link_sent') {
    return 'Hot';
  }

  if (booking && (booking.is_draft === true || booking.is_draft === 1)) {
    return lead?.lead_type === 'sales_assisted' ? 'Warm' : 'Hot';
  }

  if (booking && (booking.is_draft === false || booking.is_draft === 0)) {
    return 'Hot';
  }

  return 'Hot';
};

const getClientBookingStatus = (lead, booking) => {
  if (lead?.lead_status === 'abandoned' || booking?.is_cancelled) {
    return 'Closed - Lost';
  }

  if (booking?.is_cancelled) {
    return 'Closed – Lost';
  }

  if (booking?.payment_id || lead?.lead_status === 'booked') {
    return 'Booked';
  }

  if (lead?.lead_status === 'proposal_sent' || lead?.lead_status === 'payment_link_sent') {
    return 'Payment/Invoice Sent';
  }

  if (lead?.lead_status === 'booking_in_progress' || (booking && (booking.is_draft === true || booking.is_draft === 1))) {
    return 'Booking In Progress';
  }

  if (booking && (booking.is_draft === false || booking.is_draft === 0)) {
    return 'Ready for Payment';
  }

  if (lead?.lead_status === 'book_a_shoot_lead_created') {
    return 'Book a shoot - Lead Created';
  }

  if (lead?.lead_status === 'manual_lead_created') {
    return 'Manual - Lead Created';
  }

  return 'Signed Up - No Booking';
};

function getLeadBookingStep(lead, booking, activities = []) {
  // STEP 4 — Booked (final truth)
  if (
    lead.lead_status === 'booked' ||
    booking?.payment_id
  ) {
    return 4;
  }

  // STEP 3 — Discount applied
  if (
    lead.lead_status === 'discount_applied' ||
    activities.some(a => a.activity_type === 'discount_applied')
  ) {
    return 3;
  }

  // STEP 2 — Payment link sent
  if (
    lead.lead_status === 'payment_link_sent' ||
    activities.some(a => a.activity_type === 'payment_link_generated')
  ) {
    return 2;
  }

  // STEP 1 — In progress (lead exists OR booking started)
  return 1;
}

async function autoAssignLead(leadId, options = {}) {
  const transaction = options.transaction || null;
  const leadModel = options.leadModel || sales_leads;
  const { sales_lead_activities, client_lead_activities } = require('../models');

  if (process.env.SALES_AUTO_ASSIGNMENT === 'false') {
    return null;
  }

  const lead = await leadModel.findOne({
    where: { lead_id: leadId },
    attributes: ['lead_id', 'assigned_sales_rep_id'],
    transaction
  });

  const salesReps = await getActiveSalesReps({ transaction });

  if (!salesReps.length) {
    console.warn('No active sales reps available for auto-assignment');
    return null;
  }

  const assignmentDate = options.assignmentDate || await getLeadAssignmentDate(leadId, { leadModel, transaction });
  const unavailableRepIds = await getUnavailableSalesRepIdsForDate(
    assignmentDate,
    salesReps.map((rep) => rep.id),
    { transaction }
  );
  const unavailableByLiveStatusIds = await getUnavailableSalesRepIdsByLiveStatus(
    salesReps.map((rep) => rep.id),
    { transaction }
  );
  const availableSalesReps = salesReps.filter(
    (rep) => !unavailableRepIds.has(rep.id) && !unavailableByLiveStatusIds.has(rep.id)
  );

  if (!availableSalesReps.length) {
    console.warn(`No available sales reps found for auto-assignment on ${assignmentDate || 'requested date'}`);
    return null;
  }

  const salesRepIds = availableSalesReps.map((rep) => rep.id);
  const leadCounts = await getLeadCountsPerRep(salesRepIds, 24, { leadModel, transaction });
  const selectedRep = findRepWithFewestLeads(availableSalesReps, leadCounts);

  await leadModel.update(
    { assigned_sales_rep_id: selectedRep.id },
    {
      where: { lead_id: leadId },
      transaction
    }
  );

  const previousRepId = lead?.assigned_sales_rep_id ?? null;
  const activityPayload = {
    lead_id: leadId,
    activity_type: 'assigned',
    activity_data: {
      previous_rep_id: previousRepId,
      new_rep_id: selectedRep.id,
      assignment_type: 'auto'
    },
    performed_by_user_id: null
  };

  if (leadModel === sales_leads) {
    await sales_lead_activities.create(activityPayload, { transaction });
  } else if (leadModel === client_leads) {
    await client_lead_activities.create(activityPayload, { transaction });
  }

  console.log(`Lead ${leadId} auto-assigned to ${selectedRep.name} (ID: ${selectedRep.id})`);

  return {
    id: selectedRep.id,
    name: selectedRep.name,
    email: selectedRep.email
  };
}

module.exports = {
  getActiveSalesReps,
  getLeadCountsPerRep,
  findRepWithFewestLeads,
  getLeadAssignmentDate,
  getUnavailableSalesRepIdsForDate,
  getUnavailableSalesRepIdsByLiveStatus,
  autoAssignLead,
  manuallyAssignLead,
  getSalesRepWorkload,
  unassignLead,
  getLeadBookingStatus,
  getLeadIntent,
  getClientIntent,
  getClientBookingStatus,
  getLeadBookingStep
};
