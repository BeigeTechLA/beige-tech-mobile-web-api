const { sales_leads, sales_lead_activities, stream_project_booking, users, discount_codes, payment_links,  quotes,
  quote_line_items, assigned_crew, crew_members } = require('../models');
const { Op, Sequelize, where } = require('sequelize');
const constants = require('../utils/constants');
const leadAssignmentService = require('../services/lead-assignment.service');
const { appendToSheet, updateSheetRow } = require('../utils/googleSheets');
const pricingService = require('../services/pricing.service');

const sequelize = require('../db');
const db = require('../models');

async function calculatePricingBreakdown(payload, tx) {
  const {
    creator_ids = [],
    role_counts = {},
    shoot_hours,
    event_type,
    shoot_start_date,
    add_on_items = [],
    video_edit_types = [],
    photo_edit_types = [],
    skip_discount = false,
    skip_margin = false
  } = payload || {};

  if (!shoot_hours || Number(shoot_hours) <= 0) {
    throw new Error('shoot_hours is required and must be > 0');
  }

  const ROLE_TO_ITEM_MAP = {
    videographer: 11,
    photographer: 10,
    cinematographer: 12
  };

  const pricingItems = [];
  let creators = [];

  // CASE 1: creator_ids given → derive roleCounts from creators.primary_role
  if (Array.isArray(creator_ids) && creator_ids.length > 0) {
    creators = await db.crew_members.findAll({
      where: { crew_member_id: creator_ids, is_active: 1 },
      attributes: ['crew_member_id', 'first_name', 'last_name', 'primary_role', 'hourly_rate'],
      transaction: tx // ✅ keep in same transaction if you want
    });

    if (creators.length !== creator_ids.length) {
      throw new Error('One or more creator IDs are invalid');
    }

    const derivedRoleCounts = {};
    creators.forEach((c) => {
      let roles = c.primary_role;

      if (typeof roles === 'string') {
        try { roles = JSON.parse(roles); } catch { roles = [roles]; }
      }
      const rolesArr = Array.isArray(roles) ? roles : [roles];

      rolesArr.forEach((r) => {
        const roleKey =
          r === 11 ? 'videographer' :
          r === 10 ? 'photographer' :
          r === 12 ? 'cinematographer' :
          null;

        if (roleKey) derivedRoleCounts[roleKey] = (derivedRoleCounts[roleKey] || 0) + 1;
      });
    });

    Object.entries(derivedRoleCounts).forEach(([role, count]) => {
      const itemId = ROLE_TO_ITEM_MAP[role];
      if (itemId && count > 0) pricingItems.push({ item_id: itemId, quantity: count });
    });
  }

  // CASE 2: no creators → use role_counts
  if (pricingItems.length === 0 && role_counts) {
    Object.entries(role_counts).forEach(([role, count]) => {
      const itemId = ROLE_TO_ITEM_MAP[role];
      if (itemId && count > 0) pricingItems.push({ item_id: itemId, quantity: count });
    });
  }

  if (pricingItems.length === 0 && (!Array.isArray(add_on_items) || add_on_items.length === 0)) {
    throw new Error('No pricing items resolved');
  }

  const allItems = [...pricingItems, ...(Array.isArray(add_on_items) ? add_on_items : [])];

  // ✅ This returns the "quote breakdown" object you already return from API
  const quote = await pricingService.calculateQuote({
    items: allItems,
    shootHours: Number(shoot_hours),
    eventType: event_type,
    shootStartDate: shoot_start_date,
    skipDiscount: !!skip_discount,
    skipMargin: !!skip_margin,
    videoEditTypes: Array.isArray(video_edit_types) ? video_edit_types : [],
    photoEditTypes: Array.isArray(photo_edit_types) ? photo_edit_types : []
  });

  return {
    quote,
    creators: creators.map((c) => ({
      crew_member_id: c.crew_member_id,
      name: `${c.first_name} ${c.last_name}`,
      role: c.primary_role,
      hourly_rate: Number(c.hourly_rate || 0)
    }))
  };
}

function safeJsonStringify(val) {
  if (val == null) return null;
  if (typeof val === 'string') return val;
  try { return JSON.stringify(val); } catch { return String(val); }
}

function parseStartDateTime(start_date_time) {
  if (!start_date_time) return { event_date: null, start_time: null };
  try {
    const dateObj = new Date(start_date_time);
    const event_date = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD
    const start_time = dateObj.toTimeString().split(' ')[0]; // HH:mm:ss
    return { event_date, start_time };
  } catch {
    return { event_date: null, start_time: null };
  }
}

function normalizeIsDraft(is_draft) {
  // allow boolean or 0/1
  if (typeof is_draft === 'boolean') return is_draft ? 1 : 0;
  if (typeof is_draft === 'number') return is_draft ? 1 : 0;
  if (typeof is_draft === 'string') return is_draft === 'true' || is_draft === '1' ? 1 : 0;
  return null;
}

/**
 * Create a quote row + quote_line_items based on the breakdown.
 * Adjust field names if your schema differs.
 */
async function persistQuoteFromBreakdown({
  bookingId,
  eventType,
  shootHours,
  shootStartDate,
  videoEditTypes,
  photoEditTypes,
  breakdown,
  tx
}) {
  // 1) Create quote
  const quote = await quotes.create(
    {
      status: 'pending',
      source: 'booking_finalize',
      booking_id: bookingId,            // if your quotes table has it
      event_type: eventType,
      shoot_hours: shootHours,
      shoot_start_date: shootStartDate,
      video_edit_types: safeJsonStringify(videoEditTypes || []),
      photo_edit_types: safeJsonStringify(photoEditTypes || []),
      subtotal: breakdown?.subtotal ?? null,
      total: breakdown?.total ?? null
    },
    { transaction: tx }
  );

  // 2) Create line items
  const items = Array.isArray(breakdown?.lineItems) ? breakdown.lineItems : [];
  if (items.length) {
    const rows = items.map((li) => ({
      quote_id: quote.quote_id || quote.id, // depends on your model PK
      item_id: li.item_id ?? null,
      name: li.name ?? null,
      slug: li.slug ?? null,
      kind: li.kind ?? null,
      quantity: li.quantity ?? 1,
      unit_price: li.unit_price ?? null,
      total_price: li.total_price ?? null,
      meta: li.meta ? safeJsonStringify(li.meta) : null
    }));

    await quote_line_items.bulkCreate(rows, { transaction: tx });
  }

  return quote;
}

const calculateLeadPricing = async (booking) => {
    if (!booking) return null;

    try {
        const ROLE_TO_ITEM_MAP = {
            videographer: 11,
            photographer: 10,
            cinematographer: 12,
        };

        let crewRoles = {};
        try {
            crewRoles = typeof booking.crew_roles === 'string' 
                ? JSON.parse(booking.crew_roles || '{}') 
                : (booking.crew_roles || {});
        } catch (e) { 
            crewRoles = {}; 
        }

        const items = Object.entries(crewRoles).map(([role, count]) => ({
            item_id: ROLE_TO_ITEM_MAP[role.toLowerCase()],
            quantity: count
        })).filter(item => item.item_id);

        let hours = Number(booking.duration_hours);
        
        if (!hours || hours <= 0) {
            if (booking.start_time && booking.end_time) {
                const [sH, sM] = booking.start_time.split(':').map(Number);
                const [eH, eM] = booking.end_time.split(':').map(Number);
                
                const start = new Date(2000, 0, 1, sH, sM);
                const end = new Date(2000, 0, 1, eH, eM);
                
                let diff = (end - start) / (1000 * 60 * 60);
                if (diff < 0) diff += 24;
                hours = Math.round(diff);
            } else {
                hours = 8; 
            }
        }

        const parseEdits = (val) => {
            if (!val) return [];
            if (Array.isArray(val)) return val;
            try { return JSON.parse(val); } catch { return []; }
        };

        const vEdits = parseEdits(booking.video_edit_types);
        const pEdits = parseEdits(booking.photo_edit_types);

        const quote = await pricingService.calculateQuote({
            items: items,
            shootHours: hours,
            eventType: booking.shoot_type || booking.event_type || 'general',
            shootStartDate: booking.event_date,
            videoEditTypes: vEdits,
            photoEditTypes: pEdits,
            skipDiscount: true, 
            skipMargin: true
        });

        return quote;
    } catch (error) {
        console.error('Lead Pricing calculation failed:', error);
        return null;
    }
};

function canEditBooking(lead, booking) {
  if (!booking) return false;

  if (booking.payment_id) return false;
  if (lead.lead_status === 'booked') return false;
  if (lead.lead_status === 'abandoned') return false;

  return true;
}

/**
 * Track early booking interest - Create draft booking and lead when user shows interest
 * POST /api/sales/leads/track-early-interest
 */
// exports.trackEarlyBookingInterest = async (req, res) => {
//   try {
//     const {
//       guest_email,
//       user_id,
//       content_type,
//       shoot_type,
//       client_name
//     } = req.body;

//     // 1. Validate required fields
//     if (!guest_email) {
//       return res.status(constants.BAD_REQUEST.code).json({
//         success: false,
//         message: 'Email is required'
//       });
//     }

//     // Basic email validation
//     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//     if (!emailRegex.test(guest_email)) {
//       return res.status(constants.BAD_REQUEST.code).json({
//         success: false,
//         message: 'Invalid email format'
//       });
//     }

//     // 2. Create minimal draft booking
//     const bookingData = {
//       user_id: user_id ? parseInt(user_id) : null,
//       guest_email: guest_email,
//       project_name: `Draft - ${shoot_type || content_type || 'Booking'}`,
//       event_type: shoot_type || content_type || 'general',
//       streaming_platforms: JSON.stringify([]),
//       crew_roles: JSON.stringify([]),
//       is_draft: 1,
//       is_completed: 0,
//       is_cancelled: 0,
//       is_active: 1
//     };

//     const booking = await stream_project_booking.create(bookingData);

//     // 3. Check if lead already exists
//     const existingLead = await sales_leads.findOne({
//       where: { 
//         guest_email,
//         lead_status: 'in_progress_self_serve'
//       },
//       order: [['created_at', 'DESC']]
//     });

//     if (existingLead) {
//       // Update existing lead
//       await existingLead.update({
//         booking_id: booking.stream_project_booking_id,
//         last_activity_at: new Date()
//       });

//       // SYNC ALL DATA TO SHEET FOR EXISTING LEAD
//       appendToSheet('leads_data', [
//         existingLead.lead_id,                 // A: Lead ID
//         booking.stream_project_booking_id,    // B: Booking ID
//         user_id || 'Guest',                     // C: User ID
//         client_name || 'N/A',                 // D: Client Name
//         guest_email,                          // E: Email
//         booking.project_name,                 // F: Project Name
//         content_type || 'N/A',                // G: Content Type
//         shoot_type || 'N/A',                  // H: Shoot Type
//         existingLead.lead_type,               // I: Lead Type
//         'Interaction Updated',                // J: Status
//         new Date().toLocaleString()           // M: Timestamp
//       ]).catch(err => console.error('Sheet Sync Error:', err.message));

//       return res.json({
//         success: true,
//         message: 'Lead tracking updated',
//         data: {
//           lead_id: existingLead.lead_id,
//           booking_id: booking.stream_project_booking_id,
//           is_new: false
//         }
//       });
//     }

//     // 4. Create new lead
//     const lead = await sales_leads.create({
//       booking_id: booking.stream_project_booking_id,
//       user_id: user_id || null,
//       guest_email: guest_email,
//       client_name: client_name || null,
//       lead_type: 'self_serve',
//       lead_status: 'in_progress_self_serve'
//     });

//     // 5. Log activity
//     await sales_lead_activities.create({
//       lead_id: lead.lead_id,
//       activity_type: 'created',
//       activity_data: {
//         source: 'early_interest',
//         user_id,
//         guest_email,
//         content_type,
//         shoot_type
//       }
//     });

//     // 6. Auto-assign lead
//     const assignedRep = await leadAssignmentService.autoAssignLead(lead.lead_id);

//     // 7. --- SYNC ALL DATA TO SHEET FOR NEW LEAD ---
//     appendToSheet('leads_data', [
//       lead.lead_id,                         // A: Lead ID
//       booking.stream_project_booking_id,    // B: Booking ID
//       user_id || 'Guest',                   // C: User ID
//       client_name || 'N/A',                 // D: Client Name
//       guest_email,                          // E: Email
//       booking.project_name,                 // F: Project Name
//       content_type || 'N/A',                // G: Content Type
//       shoot_type || 'N/A',                  // H: Shoot Type
//       lead.lead_type,                       // I: Lead Type
//       lead.lead_status,                     // J: Status
//       assignedRep ? JSON.stringify(assignedRep) : 'Pending', // K: Assigned Rep
//       booking.is_draft === 1 ? 'Yes' : 'No',// L: Is Draft
//       new Date().toLocaleString()           // M: Timestamp
//     ]).catch(err => console.error('Sheet Sync Error:', err.message));

//     res.status(constants.CREATED.code).json({
//       success: true,
//       message: 'Lead tracking started',
//       data: {
//         lead_id: lead.lead_id,
//         booking_id: booking.stream_project_booking_id,
//         is_new: true,
//         assigned_to: assignedRep
//       }
//     });

//   } catch (error) {
//     console.error('Error tracking early booking interest:', error);
//     res.status(constants.INTERNAL_SERVER_ERROR.code).json({
//       success: false,
//       message: 'Failed to track booking interest',
//       error: process.env.NODE_ENV === 'development' ? error.message : undefined
//     });
//   }
// };

// exports.trackEarlyBookingInterest = async (req, res) => {
//   try {
//     const { guest_email, user_id, content_type, shoot_type, client_name } = req.body;

//     // 1. Validate required fields
//     if (!guest_email) {
//       return res.status(constants.BAD_REQUEST.code).json({ success: false, message: 'Email is required' });
//     }

//     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//     if (!emailRegex.test(guest_email)) {
//       return res.status(constants.BAD_REQUEST.code).json({ success: false, message: 'Invalid email format' });
//     }

//     // 2. Create minimal draft booking
//     const bookingData = {
//       user_id: user_id ? parseInt(user_id) : null,
//       guest_email: guest_email,
//       project_name: `Draft - ${shoot_type || content_type || 'Booking'}`,
//       event_type: shoot_type || content_type || 'general',
//       streaming_platforms: JSON.stringify([]),
//       crew_roles: JSON.stringify([]),
//       is_draft: 1,
//       is_completed: 0,
//       is_cancelled: 0,
//       is_active: 1
//     };

//     const booking = await stream_project_booking.create(bookingData);

//     // 3. Check if lead already exists
//     const existingLead = await sales_leads.findOne({
//       where: { guest_email, lead_status: 'in_progress_self_serve' },
//       order: [['created_at', 'DESC']]
//     });

//     if (existingLead) {
//       await existingLead.update({
//         booking_id: booking.stream_project_booking_id,
//         last_activity_at: new Date()
//       });

//       updateSheetRow('leads_data', existingLead.lead_id, [
//         existingLead.lead_id,                 // A: Lead ID (Key)
//         booking.stream_project_booking_id,    // B: Booking ID
//         user_id || 'Guest',                   // C: User ID
//         client_name || 'N/A',                 // D: Client Name
//         guest_email,                          // E: Email
//         booking.project_name,                 // F: Project Name
//         content_type || 'N/A',                // G: Content Type
//         shoot_type || 'N/A',                  // H: Shoot Type
//         existingLead.lead_type,               // I: Lead Type
//         'Interaction Updated',                // J: Status
//         '',                                   // K: (Keep Rep Same)
//         'Yes',                                // L: Is Draft
//         new Date().toLocaleString()           // M: Timestamp (Updates in same row)
//       ]).catch(err => console.error('Sheet Update Error:', err.message));

//       return res.json({
//         success: true,
//         message: 'Lead tracking updated',
//         data: { lead_id: existingLead.lead_id, booking_id: booking.stream_project_booking_id, is_new: false }
//       });
//     }

//     // 4. Create new lead
//     const lead = await sales_leads.create({
//       booking_id: booking.stream_project_booking_id,
//       user_id: user_id || null,
//       guest_email: guest_email,
//       client_name: client_name || null,
//       lead_type: 'self_serve',
//       lead_status: 'in_progress_self_serve'
//     });

//     // 5. Log activity
//     await sales_lead_activities.create({
//       lead_id: lead.lead_id,
//       activity_type: 'created',
//       activity_data: { source: 'early_interest', user_id, guest_email, content_type, shoot_type }
//     });

//     // 6. Auto-assign lead
//     const assignedRep = await leadAssignmentService.autoAssignLead(lead.lead_id);

//     // 7. --- FIX: ONLY STORE NAME AND APPEND NEW ROW ---
//     appendToSheet('leads_data', [
//       lead.lead_id,                         // A: Lead ID
//       booking.stream_project_booking_id,    // B: Booking ID
//       user_id || 'Guest',                   // C: User ID
//       client_name || 'N/A',                 // D: Client Name
//       guest_email,                          // E: Email
//       booking.project_name,                 // F: Project Name
//       content_type || 'N/A',                // G: Content Type
//       shoot_type || 'N/A',                  // H: Shoot Type
//       lead.lead_type,                       // I: Lead Type
//       lead.lead_status,                     // J: Status
//       assignedRep ? assignedRep.name : 'Pending', // <--- FIX: Access .name only
//       booking.is_draft === 1 ? 'Yes' : 'No',// L: Is Draft
//       new Date().toLocaleString()           // M: Timestamp
//     ]).catch(err => console.error('Sheet Sync Error:', err.message));

//     res.status(constants.CREATED.code).json({
//       success: true,
//       message: 'Lead tracking started',
//       data: { lead_id: lead.lead_id, booking_id: booking.stream_project_booking_id, is_new: true, assigned_to: assignedRep }
//     });

//   } catch (error) {
//     console.error('Error tracking early booking interest:', error);
//     res.status(constants.INTERNAL_SERVER_ERROR.code).json({
//       success: false,
//       message: 'Failed to track booking interest'
//     });
//   }
// };

exports.trackEarlyBookingInterest = async (req, res) => {
    try {
        const { 
            booking_id, 
            guest_email, 
            user_id, 
            content_type, 
            shoot_type, 
            client_name,
            startDate, 
            endDate,
            location,
            specialInstructions,
            reference_links,
            video_edit_types, 
            photo_edit_types, 
            edits_needed 
        } = req.body;

        if (!guest_email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        const event_date = startDate ? new Date(startDate).toISOString().split('T')[0] : null;
        const start_time = startDate ? new Date(startDate).toTimeString().split(' ')[0] : null;
        const end_time = endDate ? new Date(endDate).toTimeString().split(' ')[0] : null;

        const bookingData = {
            user_id: user_id || null,
            guest_email: guest_email,
            project_name: `${shoot_type?.toUpperCase() || 'NEW'} Shoot - ${client_name || guest_email}`,
            event_type: content_type || 'general',
            shoot_type: shoot_type,
            content_type: content_type,
            streaming_platforms: JSON.stringify([]),
            crew_roles: JSON.stringify([]),
            event_date: event_date,
            start_time: start_time,
            end_time: end_time,
            event_location: location || null,
            description: specialInstructions || null,
            reference_links: reference_links || null,
            edits_needed: edits_needed ? 1 : 0,
            video_edit_types: video_edit_types || [], 
            photo_edit_types: photo_edit_types || [],
            is_draft: 1,
            is_completed: 0,
            is_cancelled: 0,
            is_active: 1
        };

        let booking;
        if (booking_id) {
            booking = await stream_project_booking.findByPk(booking_id);
            if (booking) {
                await booking.update(bookingData);
            }
        } 
        
        if (!booking) {
            booking = await stream_project_booking.create(bookingData);
        }

        let lead = await sales_leads.findOne({
            where: { booking_id: booking.stream_project_booking_id }
        });

        let isNewLead = false;
        let assignedRep = null;

        if (!lead) {
            isNewLead = true;
            lead = await sales_leads.create({
                booking_id: booking.stream_project_booking_id,
                user_id: user_id || null,
                guest_email: guest_email,
                client_name: client_name || null,
                lead_type: 'self_serve',
                lead_status: 'in_progress_self_serve'
            });
            
            await sales_lead_activities.create({
                lead_id: lead.lead_id,
                activity_type: 'created',
                activity_data: { source: 'step_1_capture', user_id, guest_email }
            });

            assignedRep = await leadAssignmentService.autoAssignLead(lead.lead_id);
        } else {
            await lead.update({ last_activity_at: new Date() });
        }

        const sheetRowData = [
            lead.lead_id,                         // A: Lead ID
            booking.stream_project_booking_id,    // B: Booking ID
            user_id || 'Guest',                   // C: User ID
            client_name || 'N/A',                 // D: Client Name
            guest_email,                          // E: Email
            booking.project_name,                 // F: Project Name
            content_type || 'N/A',                // G: Content Type
            shoot_type || 'N/A',                  // H: Shoot Type
            lead.lead_type,                       // I: Lead Type
            isNewLead ? lead.lead_status : 'Interaction Updated', // J: Status
            assignedRep ? assignedRep.name : 'Existing/Pending', // K: Rep Name
            'Yes',                                // L: Is Draft
            new Date().toLocaleString()           // M: Timestamp
        ];

        if (isNewLead) {
            appendToSheet('leads_data', sheetRowData)
                .catch(err => console.error('Sheet Append Error:', err.message));
        } else {
            updateSheetRow('leads_data', lead.lead_id, sheetRowData)
                .catch(err => console.error('Sheet Update Error:', err.message));
        }

        return res.status(isNewLead ? 201 : 200).json({
            success: true,
            message: isNewLead ? 'Lead tracking started' : 'Progress saved successfully',
            data: { 
                booking_id: booking.stream_project_booking_id, 
                lead_id: lead.lead_id,
                is_new: isNewLead,
                assigned_to: assignedRep ? assignedRep.name : null
            }
        });

    } catch (error) {
        console.error('Error in trackEarlyBookingInterest:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Internal Server Error',
            error: error.message 
        });
    }
};
/**
 * Track booking start - Create lead when client starts booking flow
 * POST /api/sales/leads/track-start
 */
exports.trackBookingStart = async (req, res) => {
  try {
    const {
      booking_id,
      user_id,
      guest_email,
      client_name
    } = req.body;

    // Validate required fields
    if (!booking_id) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Booking ID is required'
      });
    }

    // Check if lead already exists for this booking
    const existingLead = await sales_leads.findOne({
      where: { booking_id }
    });

    if (existingLead) {
      // Update last activity
      await existingLead.update({
        last_activity_at: new Date()
      });

      return res.json({
        success: true,
        message: 'Lead tracking updated',
        data: {
          lead_id: existingLead.lead_id,
          is_new: false
        }
      });
    }

    // Create new lead
    const lead = await sales_leads.create({
      booking_id,
      user_id: user_id || null,
      guest_email: guest_email || null,
      client_name: client_name || null,
      lead_type: 'self_serve',
      lead_status: 'in_progress_self_serve'
    });

    // Log activity
    await sales_lead_activities.create({
      lead_id: lead.lead_id,
      activity_type: 'created',
      activity_data: {
        source: 'booking_start',
        user_id,
        guest_email
      }
    });

    // Auto-assign lead
    const assignedRep = await leadAssignmentService.autoAssignLead(lead.lead_id);

    res.status(constants.CREATED.code).json({
      success: true,
      message: 'Lead tracking started',
      data: {
        lead_id: lead.lead_id,
        is_new: true,
        assigned_to: assignedRep
      }
    });

  } catch (error) {
    console.error('Error tracking booking start:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to track booking start',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Track payment page reached
 * POST /api/sales/leads/track-payment-page
 */
exports.trackPaymentPageReached = async (req, res) => {
  try {
    const { booking_id } = req.body;

    if (!booking_id) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Booking ID is required'
      });
    }

    // Find lead by booking_id
    const lead = await sales_leads.findOne({
      where: { booking_id }
    });

    if (!lead) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Lead not found'
      });
    }

    // Update booking to mark payment page reached
    await stream_project_booking.update(
      { payment_page_reached_at: new Date() },
      { where: { stream_project_booking_id: booking_id } }
    );

    // Update lead activity
    await lead.update({
      last_activity_at: new Date()
    });

    res.json({
      success: true,
      message: 'Payment page tracking recorded'
    });

  } catch (error) {
    console.error('Error tracking payment page:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to track payment page',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Create sales-assisted lead when "Contact Sales" is clicked
 * POST /api/sales/leads/contact-sales
 */
exports.createSalesAssistedLead = async (req, res) => {
  try {
    const {
      booking_id,
      user_id,
      guest_email,
      client_name
    } = req.body;

    if (!booking_id) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Booking ID is required'
      });
    }

    // Update booking to mark as sales assisted
    await stream_project_booking.update(
      { 
        sales_assisted: 1,
        is_draft: 1 // Save as draft
      },
      { where: { stream_project_booking_id: booking_id } }
    );

    // Check if lead already exists
    let lead = await sales_leads.findOne({
      where: { booking_id }
    });

    if (lead) {
      // Update existing lead to sales-assisted
      await lead.update({
        lead_type: 'sales_assisted',
        lead_status: 'in_progress_sales_assisted',
        contacted_sales_at: new Date(),
        last_activity_at: new Date()
      });
    } else {
      // Create new sales-assisted lead
      lead = await sales_leads.create({
        booking_id,
        user_id: user_id || null,
        guest_email: guest_email || null,
        client_name: client_name || null,
        lead_type: 'sales_assisted',
        lead_status: 'in_progress_sales_assisted',
        contacted_sales_at: new Date()
      });
    }

    // Log activity
    await sales_lead_activities.create({
      lead_id: lead.lead_id,
      activity_type: 'contacted_sales',
      activity_data: {
        source: 'contact_sales_button'
      }
    });

    // Auto-assign if not already assigned
    if (!lead.assigned_sales_rep_id) {
      await leadAssignmentService.autoAssignLead(lead.lead_id);
    }

    res.status(constants.CREATED.code).json({
      success: true,
      message: 'Sales team has been notified. Someone will contact you shortly.',
      data: {
        lead_id: lead.lead_id
      }
    });

  } catch (error) {
    console.error('Error creating sales-assisted lead:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to contact sales team',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all leads with filters and pagination
 * GET /api/sales/leads
 */
// Ensure these are at the top of sales-leads.controller.js
// const { Op, Sequelize } = require('sequelize'); 

// exports.getLeads = async (req, res) => {
//   try {
//     const {
//       page = 1,
//       limit = 20,
//       status,
//       lead_type,
//       assigned_to,
//       search,
//       range,        // Added
//       start_date,   // Added
//       end_date      // Added
//     } = req.query;

//     const offset = (parseInt(page) - 1) * parseInt(limit);

//     const whereClause = {};

//     if (start_date && end_date) {
//       whereClause.created_at = {
//         [Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`]
//       };
//     } else if (range === 'month') {
//       whereClause[Op.and] = [
//         Sequelize.where(Sequelize.fn('MONTH', Sequelize.col('sales_leads.created_at')), Sequelize.fn('MONTH', Sequelize.fn('CURDATE'))),
//         Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('sales_leads.created_at')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
//       ];
//     } else if (range === 'week') {
//       whereClause[Op.and] = [
//         Sequelize.where(Sequelize.fn('YEARWEEK', Sequelize.col('sales_leads.created_at'), 1), Sequelize.fn('YEARWEEK', Sequelize.fn('CURDATE'), 1))
//       ];
//     } else if (range === 'year') {
//       whereClause[Op.and] = [
//         Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('sales_leads.created_at')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
//       ];
//     }

//     if (status) {
//       whereClause.lead_status = status;
//     }

//     if (lead_type) {
//       whereClause.lead_type = lead_type;
//     }

//     if (assigned_to) {
//       if (assigned_to === 'unassigned') {
//         whereClause.assigned_sales_rep_id = null;
//       } else {
//         whereClause.assigned_sales_rep_id = parseInt(assigned_to);
//       }
//     }

//     if (search) {
//       const searchCondition = {
//         [Op.or]: [
//           { client_name: { [Op.like]: `%${search}%` } },
//           { guest_email: { [Op.like]: `%${search}%` } }
//         ]
//       };
      
//       if (whereClause[Op.and]) {
//         whereClause[Op.and].push(searchCondition);
//       } else {
//         whereClause[Op.and] = [searchCondition];
//       }
//     }

//     // Fetch leads
//     const { count, rows: leads } = await sales_leads.findAndCountAll({
//       where: whereClause,
//       include: [
//         {
//           model: users,
//           as: 'assigned_sales_rep',
//           attributes: ['id', 'name', 'email']
//         },
//         {
//           model: stream_project_booking,
//           as: 'booking',
//           attributes: ['stream_project_booking_id', 'project_name', 'event_date', 'event_type', 'budget']
//         }
//       ],
//       limit: parseInt(limit),
//       offset: offset,
//       order: [['created_at', 'DESC']] 
//     });

//     res.json({
//       success: true,
//       data: {
//         leads: leads.map(lead => ({
//           lead_id: lead.lead_id,
//           client_name: lead.client_name,
//           guest_email: lead.guest_email || lead.user?.email,
//           lead_type: lead.lead_type,
//           lead_status: lead.lead_status,
//           assigned_sales_rep: lead.assigned_sales_rep,
//           booking: lead.booking,
//           last_activity_at: lead.last_activity_at,
//           contacted_sales_at: lead.contacted_sales_at,
//           created_at: lead.created_at
//         })),
//         pagination: {
//           total: count,
//           page: parseInt(page),
//           limit: parseInt(limit),
//           totalPages: Math.ceil(count / parseInt(limit))
//         }
//       }
//     });

//   } catch (error) {
//     console.error('Error fetching leads:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to fetch leads',
//       error: process.env.NODE_ENV === 'development' ? error.message : undefined
//     });
//   }
// };

// exports.getLeads = async (req, res) => {
//   try {
//     const {
//       page = 1,
//       limit = 20,
//       status,
//       lead_type,
//       assigned_to,
//       search,
//       range,
//       start_date,
//       end_date
//     } = req.query;

//     const offset = (parseInt(page) - 1) * parseInt(limit);
//     const whereClause = { [Op.and]: [] };

//     if (start_date && end_date) {
//       whereClause.created_at = {
//         [Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`]
//       };
//     } else if (range === 'month') {
//       whereClause[Op.and].push(
//         Sequelize.where(Sequelize.fn('MONTH', Sequelize.col('sales_leads.created_at')), Sequelize.fn('MONTH', Sequelize.fn('CURDATE'))),
//         Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('sales_leads.created_at')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
//       );
//     } else if (range === 'week') {
//       whereClause[Op.and].push(
//         Sequelize.where(Sequelize.fn('YEARWEEK', Sequelize.col('sales_leads.created_at'), 1), Sequelize.fn('YEARWEEK', Sequelize.fn('CURDATE'), 1))
//       );
//     } else if (range === 'year') {
//       whereClause[Op.and].push(
//         Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('sales_leads.created_at')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
//       );
//     }

//     // Status & Type
//     if (status) whereClause.lead_status = status;
//     if (lead_type) whereClause.lead_type = lead_type;

//     // Assignment Logic
//     if (assigned_to) {
//       if (assigned_to === 'unassigned') {
//         whereClause.assigned_sales_rep_id = null;
//       } else {
//         whereClause.assigned_sales_rep_id = parseInt(assigned_to);
//       }
//     }

//     if (search) {
//       whereClause[Op.and].push({
//         [Op.or]: [
//           { client_name: { [Op.like]: `%${search}%` } },
//           { guest_email: { [Op.like]: `%${search}%` } }
//         ]
//       });
//     }

//     // Fetch leads
//     const { count, rows: leads } = await sales_leads.findAndCountAll({
//       where: whereClause,
//       include: [
//         {
//           model: users,
//           as: 'assigned_sales_rep',
//           attributes: ['id', 'name', 'email']
//         },
//         {
//           model: stream_project_booking,
//           as: 'booking',
//           attributes: ['stream_project_booking_id', 'project_name', 'event_date', 'event_type', 'budget']
//         }
//       ],
//       limit: parseInt(limit),
//       offset: offset,
//       order: [
//         ['created_at', 'DESC'],
//         ['lead_id', 'DESC'] 
//       ] 
//     });

//     res.json({
//       success: true,
//       data: {
//         leads: leads.map(lead => ({
//           lead_id: lead.lead_id,
//           client_name: lead.client_name,
//           guest_email: lead.guest_email || lead.user?.email,
//           lead_type: lead.lead_type,
//           lead_status: lead.lead_status,
//           assigned_sales_rep: lead.assigned_sales_rep,
//           booking: lead.booking,
//           last_activity_at: lead.last_activity_at,
//           contacted_sales_at: lead.contacted_sales_at,
//           created_at: lead.created_at
//         })),
//         pagination: {
//           total: count,
//           page: parseInt(page),
//           limit: parseInt(limit),
//           totalPages: Math.ceil(count / parseInt(limit))
//         }
//       }
//     });

//   } catch (error) {
//     console.error('Error fetching leads:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to fetch leads',
//       error: process.env.NODE_ENV === 'development' ? error.message : undefined
//     });
//   }
// };

exports.getLeads = async (req, res) => {
    try {
        const { page = 1, limit = 20, status, lead_type, assigned_to, search, range, start_date, end_date } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const whereClause = { [Op.and]: [] };

        // Filtering logic
        if (start_date && end_date) {
            whereClause.created_at = { [Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`] };
        }
        if (status) whereClause.lead_status = status;
        if (lead_type) whereClause.lead_type = lead_type;
        if (assigned_to) {
            whereClause.assigned_sales_rep_id = assigned_to === 'unassigned' ? null : parseInt(assigned_to);
        }

        if (search) {
            whereClause[Op.and].push({
                [Op.or]: [
                    { client_name: { [Op.like]: `%${search}%` } },
                    { guest_email: { [Op.like]: `%${search}%` } }
                ]
            });
        }

        const { count, rows: leads } = await sales_leads.findAndCountAll({
            where: whereClause,
            include: [
                { model: users, as: 'assigned_sales_rep', attributes: ['id', 'name', 'email'] },
                { 
                    model: stream_project_booking, 
                    as: 'booking',
                    attributes: [
                        'stream_project_booking_id', 'event_date', 'event_type', 'shoot_type',
                        'duration_hours', 'crew_roles', 'payment_id', 'start_time', 'end_time',
                        'video_edit_types', 'photo_edit_types', 'is_draft'
                    ]
                }
            ],
            limit: parseInt(limit),
            offset: offset,
            order: [['created_at', 'DESC']]
        });

        const leadsWithPricing = await Promise.all(leads.map(async (lead) => {
            const quote = await calculateLeadPricing(lead.booking);
            const leadJson = lead.toJSON();

            const intent =
              lead.intent ??
              leadAssignmentService.getLeadIntent({ lead, booking: lead.booking });

            return {
                ...leadJson,
                potential_value: quote ? quote.total : 0,
                payment_status: lead.booking?.payment_id ? 'paid' : 'unpaid',
                booking_status: leadAssignmentService.getLeadBookingStatus(
                  lead,
                  lead.booking
                ),
                intent,
                intent_source: lead.intent ? 'manual' : 'system'
            };
        }));

        res.json({
            success: true,
            data: {
                leads: leadsWithPricing,
                pagination: {
                    total: count,
                    page: parseInt(page),
                    totalPages: Math.ceil(count / limit)
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch leads', error: error.message });
    }
};

/**
 * GET LEAD BY ID
 */
exports.getLeadById = async (req, res) => {
    try {
        const { id } = req.params;

        const lead = await sales_leads.findOne({
          where: { lead_id: id },
          include: [
            { model: users, as: 'assigned_sales_rep', attributes: ['id', 'name', 'email'] },
            {
              model: stream_project_booking,
              as: 'booking',
              include: [
                {
                  model: assigned_crew,
                  as: 'assigned_crews',
                  required: false,
                  where: { is_active: 1 },
                  attributes: ['crew_member_id', 'status', 'crew_accept', 'is_active'],
                  include: [
                    {
                      model: crew_members,
                      as: 'crew_member',
                      required: false,
                      attributes: [
                        'crew_member_id',
                        'first_name',
                        'last_name',
                        'primary_role',
                        'hourly_rate',
                        // add image field if you have it
                        // 'profile_image',
                      ],
                    },
                  ],
                },
              ],
            },
            { model: discount_codes, as: 'discount_codes' },
            { model: payment_links, as: 'payment_links' },
            {
              model: sales_lead_activities,
              as: 'activities',
              include: [{ model: users, as: 'performed_by', attributes: ['id', 'name'] }],
            },
          ],
          order: [[{ model: sales_lead_activities, as: 'activities' }, 'created_at', 'DESC']],
        });

        if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

        // selected ids for pre-check in UI
        const selectedCrewIds =
          lead.booking?.assigned_crew?.map((a) => a.crew_member_id).filter(Boolean) || [];

        const quoteBreakdown = await calculateLeadPricing(lead.booking);

        const intent =
          lead.intent ??
          leadAssignmentService.getLeadIntent({
            lead,
            booking: lead.booking,
          });

        const intent_source = lead.intent ? 'manual' : 'system';
        const booking_status = leadAssignmentService.getLeadBookingStatus(lead, lead.booking);
        const payment_status = lead.booking?.payment_id ? 'paid' : 'unpaid';
        const booking_step = leadAssignmentService.getLeadBookingStep(
          lead,
          lead.booking,
          lead.activities
        );
        const can_edit_booking = canEditBooking(lead, lead.booking);

        res.json({
          success: true,
          data: {
            ...lead.toJSON(),
            selected_crew_ids: selectedCrewIds,
            intent,
            intent_source,
            booking_status,
            payment_status,
            booking_step,
            can_edit_booking,
            projected_quote: quoteBreakdown,
          },
        });
    } catch (error) {
        res.status(500).json({
          success: false,
          message: 'Failed to fetch lead details',
          error: error.message,
        });
    }
};

/**
 * Assign or reassign lead to sales rep
 * PUT /api/sales/leads/:id/assign
 */
exports.assignLead = async (req, res) => {
  try {
    const { id } = req.params;
    const { sales_rep_id } = req.body;
    const performedBy = req.userId; // From auth middleware

    if (!sales_rep_id) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Sales rep ID is required'
      });
    }

    await leadAssignmentService.manuallyAssignLead(
      parseInt(id),
      parseInt(sales_rep_id),
      performedBy
    );

    res.json({
      success: true,
      message: 'Lead assigned successfully'
    });

  } catch (error) {
    console.error('Error assigning lead:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: error.message || 'Failed to assign lead',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update lead status
 * PUT /api/sales/leads/:id/status
 */
exports.updateLeadStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const performedBy = req.userId;

    const validStatuses = [
      'in_progress_self_serve',
      'in_progress_sales_assisted',
      'payment_link_sent',
      'discount_applied',
      'booked',
      'abandoned'
    ];

    if (!validStatuses.includes(status)) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const lead = await sales_leads.findByPk(id);

    if (!lead) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Lead not found'
      });
    }

    const oldStatus = lead.lead_status;

    await lead.update({
      lead_status: status,
      last_activity_at: new Date()
    });

    // Log activity
    await sales_lead_activities.create({
      lead_id: parseInt(id),
      activity_type: 'status_changed',
      activity_data: {
        old_status: oldStatus,
        new_status: status
      },
      performed_by_user_id: performedBy
    });

    res.json({
      success: true,
      message: 'Lead status updated'
    });

  } catch (error) {
    console.error('Error updating lead status:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to update lead status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// exports.updateBookingCrew = async (req, res) => {
//   try {
//     const { bookingId } = req.params;
//     const { crew_roles } = req.body;

//     if (!crew_roles || typeof crew_roles !== 'object') {
//       return res.status(constants.BAD_REQUEST.code).json({
//         success: false,
//         message: 'crew_roles object is required'
//       });
//     }

//     const booking = await stream_project_booking.findOne({
//       where: {
//         stream_project_booking_id: bookingId,
//         is_active: 1
//       }
//     });

//     if (!booking) {
//       return res.status(constants.NOT_FOUND.code).json({
//         success: false,
//         message: 'Booking not found'
//       });
//     }

//     if (booking.is_completed === 1) {
//       return res.status(constants.BAD_REQUEST.code).json({
//         success: false,
//         message: 'Cannot modify completed booking'
//       });
//     }

//     // ONLY persist crew selection
//     await booking.update({
//       crew_roles: JSON.stringify(crew_roles)
//     });

//     return res.json({
//       success: true,
//       message: 'Crew roles saved',
//       data: {
//         booking_id: bookingId,
//         crew_roles
//       }
//     });

//   } catch (error) {
//     console.error('Error updating booking crew:', error);
//     return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
//       success: false,
//       message: 'Failed to update crew details'
//     });
//   }
// };

exports.updateBookingCrew = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { crew_roles, location, description, reference_links } = req.body;

    if (!crew_roles || typeof crew_roles !== 'object') {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'crew_roles object is required'
      });
    }

    const booking = await stream_project_booking.findOne({
      where: {
        stream_project_booking_id: bookingId,
        is_active: 1
      }
    });

    if (!booking) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // UPDATE ALL RELEVANT FIELDS
    await booking.update({
      crew_roles: JSON.stringify(crew_roles),
      event_location: location,      // Map 'location' from frontend to 'event_location' in DB
      special_instructions: description,      // Map 'description' from frontend to 'description' in DB
      reference_links: reference_links // Store links
    });

    return res.json({
      success: true,
      message: 'Crew roles and project details saved',
      data: {
        booking_id: bookingId,
        crew_roles,
        location,
        description
      }
    });

  } catch (error) {
    console.error('Error updating booking details:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to update details'
    });
  }
};

exports.updateLeadIntent = async (req, res) => {
  try {
    const { lead_id, intent, notes } = req.body;
    const salesUserId = req.userId;

    if (!['Hot', 'Warm', 'Cold'].includes(intent)) {
      return res.status(400).json({ message: 'Invalid intent' });
    }

    const lead = await sales_leads.findByPk(lead_id);
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    await lead.update({
      intent,
      intent_updated_by: salesUserId,
      intent_updated_at: new Date()
    });

    await sales_lead_activities.create({
      lead_id,
      activity_type: 'intent_updated',
      activity_data: { intent, notes }
    });

    return res.json({
      success: true,
      message: 'Lead intent updated successfully'
    });
  } catch (error) {
    console.error('Error updating booking crew:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to update crew details'
    });
  }
};

/**
 * POST /v1/guest-bookings/:id/finalize
 * Body: booking fields + creators/roles + edit types + flags
 */
exports.finalizeGuestBooking = async (req, res) => {
  const tx = await sequelize.transaction();
  try {
    const { id } = req.params;

    const {
      content_type, shoot_type,
      start_date_time,
      end_time,
      duration_hours,
      location,
      crew_roles,
      crew_size,
      selected_crew_ids,
      edits_needed,
      video_edit_types,
      photo_edit_types,
      event_type,
      is_draft,
      // pricing flags (pass-through)
      skip_discount = true,
      skip_margin = true
    } = req.body;

    if (!id) {
      await tx.rollback();
      return res.status(400).json({ success: false, message: 'Booking ID is required' });
    }

    // 1) Load booking
    const booking = await stream_project_booking.findOne({
      where: { stream_project_booking_id: id, is_active: 1 },
      transaction: tx
    });

    if (!booking) {
      await tx.rollback();
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // 2) Build update data (same spirit as updateGuestBooking)
    const { event_date, start_time } = parseStartDateTime(start_date_time);

    const updateData = {};
    if (content_type) updateData.content_type = content_type;
    if (shoot_type) updateData.shoot_type = shoot_type;
    if (event_type) updateData.event_type = event_type;
    if (event_date) updateData.event_date = event_date;
    if (start_time) updateData.start_time = start_time;
    if (end_time) updateData.end_time = end_time;
    if (duration_hours != null) updateData.duration_hours = parseInt(duration_hours, 10);
    if (crew_size != null) updateData.crew_size_needed = parseInt(crew_size, 10);

    if (location != null) updateData.event_location = safeJsonStringify(location);

    if (crew_roles != null) {
      updateData.crew_roles = safeJsonStringify(crew_roles);
    }

    // edits
    if (typeof edits_needed !== 'undefined') {
      updateData.edits_needed = edits_needed ? 1 : 0; // if your column is TINYINT
    }
    if (Array.isArray(video_edit_types)) {
      updateData.video_edit_types = safeJsonStringify(video_edit_types);
    }
    if (Array.isArray(photo_edit_types)) {
      updateData.photo_edit_types = safeJsonStringify(photo_edit_types);
    }

    const draftVal = normalizeIsDraft(is_draft);
    if (draftVal !== null) updateData.is_draft = draftVal;

    // ✅ For “Continue”, you typically want is_draft = 0
    // If your FE always sends is_draft:false, you’re good.

    await booking.update(updateData, { transaction: tx });

    // 3) Replace assigned crew (only if array provided)
    if (Array.isArray(selected_crew_ids)) {
      await assigned_crew.destroy({
        where: { project_id: id },
        transaction: tx
      });

      if (selected_crew_ids.length > 0) {
        const assignments = selected_crew_ids.map((creator_id) => ({
          project_id: id,
          crew_member_id: creator_id,
          status: 'selected',
          is_active: 1,
          crew_accept: 0
        }));

        await assigned_crew.bulkCreate(assignments, { transaction: tx });
      }
    }

    // 4) Calculate pricing breakdown (internal call)
    // Build payload exactly like your /pricing/calculate-from-creators expects
    const pricingPayload = {
      creator_ids: Array.isArray(selected_crew_ids) ? selected_crew_ids : [],
      shoot_hours: duration_hours != null ? parseInt(duration_hours, 10) : booking.duration_hours,
      role_counts: crew_roles || (booking.crew_roles ? JSON.parse(booking.crew_roles) : {}),
      event_type: event_type || booking.event_type,
      shoot_start_date: start_date_time || (booking.event_date ? `${booking.event_date}T${booking.start_time || '00:00:00.000Z'}` : null),
      video_edit_types: Array.isArray(video_edit_types) ? video_edit_types : [],
      photo_edit_types: Array.isArray(photo_edit_types) ? photo_edit_types : [],
      skip_discount: !!skip_discount,
      skip_margin: !!skip_margin
    };

    const breakdown = await calculatePricingBreakdown(pricingPayload, tx);

    // create quote rows from breakdown.quote.lineItems etc.
    const quote = await persistQuoteFromBreakdown({
      bookingId: id,
      eventType: pricingPayload.event_type,
      shootHours: pricingPayload.shoot_hours,
      shootStartDate: pricingPayload.shoot_start_date,
      videoEditTypes: pricingPayload.video_edit_types,
      photoEditTypes: pricingPayload.photo_edit_types,
      breakdown: {
        subtotal: breakdown.quote.subtotal,
        total: breakdown.quote.total,
        lineItems: breakdown.quote.lineItems.map(li => ({
          item_id: li.item_id,
          name: li.item_name,
          slug: li.slug || null,
          kind: li.category_slug || null,
          quantity: li.quantity,
          unit_price: li.unit_price,
          total_price: li.line_total,
          meta: {
            category_name: li.category_name,
            is_mandatory: li.is_mandatory,
            hidden: li.hidden
          }
        }))
      },
      tx
    });

    const quoteId = quote.quote_id || quote.id;

    // 6) Attach quote_id to booking
    await booking.update(
      { quote_id: quoteId },
      { transaction: tx }
    );

    await tx.commit();

    return res.status(200).json({
      success: true,
      message: 'Booking finalized',
      data: {
        booking_id: booking.stream_project_booking_id,
        quote_id: quoteId,
        booking: {
          stream_project_booking_id: booking.stream_project_booking_id,
          event_date: booking.event_date,
          start_time: booking.start_time,
          end_time: booking.end_time,
          duration_hours: booking.duration_hours,
          event_type: booking.event_type,
          event_location: booking.event_location,
          crew_roles: booking.crew_roles,
          crew_size_needed: booking.crew_size_needed,
          video_edit_types: booking.video_edit_types,
          photo_edit_types: booking.photo_edit_types,
          edits_needed: booking.edits_needed,
          is_draft: booking.is_draft === 1
        },
        quote: breakdown
      }
    });
  } catch (error) {
    try { await tx.rollback(); } catch (_) {}
    return res.status(500).json({
      success: false,
      message: 'Failed to finalize booking',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = exports;
