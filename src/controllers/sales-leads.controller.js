const { sales_leads, sales_lead_activities, stream_project_booking, users, discount_codes, payment_links,  quotes, assigned_crew, crew_members,
  quote_line_items } = require('../models');
const { Op, Sequelize } = require('sequelize');
const constants = require('../utils/constants');
const leadAssignmentService = require('../services/lead-assignment.service');
const { appendToSheet, updateSheetRow } = require('../utils/googleSheets');
const pricingService = require('../services/pricing.service');
const pricingController = require('../controllers/pricing.controller');
const paymentService = require('../services/payment-links.service');

const sequelize = require('../db');
const db = require('../models');

/**
 * Internal helper to reuse calculateFromCreators safely.
 * DO NOT pass real res here.
 */
async function calculateFromCreatorsInternally(pricingPayload) {
  let pricingResult;

  const fakeRes = {
    status: () => fakeRes,
    json: (payload) => {
      pricingResult = payload;
      return payload;
    }
  };

  const fakeReq = {
    body: {
      ...pricingPayload,
      is_return: true
    }
  };

  const breakdown = await pricingController.calculateFromCreators(fakeReq, fakeRes);
  const pricingData = breakdown ?? pricingResult?.data;

  if (!pricingData || !pricingData.quote) {
    throw new Error('Pricing calculation failed');
  }

  return pricingData;
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
 * Create quote row + quote_line_items.
 */
async function persistQuoteFromBreakdown({ bookingId, guest_email, shootHours, breakdown, tx }) {
  const quote = await quotes.create(
    {
      booking_id: bookingId,
      guest_email,
      pricing_mode: breakdown?.pricingMode ?? null,
      shoot_hours: shootHours,
      subtotal: breakdown?.subtotal ?? null,
      discount_percent: breakdown?.discountPercent ?? null,
      discount_amount: breakdown?.discountAmount ?? null,
      price_after_discount: breakdown?.priceAfterDiscount ?? null,
      margin_percent: breakdown?.marginPercent ?? null,
      margin_amount: breakdown?.marginAmount ?? null,
      total: breakdown?.total ?? null,
      status: 'pending',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    { transaction: tx }
  );

  const items = Array.isArray(breakdown?.lineItems) ? breakdown.lineItems : [];
  if (items.length) {
    const rows = items.map((li) => ({
      quote_id: quote.quote_id || quote.id,
      item_id: li.item_id ?? null,
      item_name: li.name ?? null,
      quantity: li.quantity ?? 1,
      unit_price: li.unit_price ?? null,
      line_total: li.total_price ?? null
    }));
    await quote_line_items.bulkCreate(rows, { transaction: tx });
  }

  return quote;
}

const calculateLeadPricing = async (booking) => {
    if (!booking) return null;

    try {
        const q = booking.primary_quote; 
        
        if (q) {
            return {
                source: 'database',
                quote_id: q.quote_id,
                total: parseFloat(q.price_after_discount || q.total || 0),
                subtotal: parseFloat(q.subtotal || 0),
                discount_amount: parseFloat(q.discount_amount || 0),
                shoot_hours: q.shoot_hours,
                line_items: (q.line_items || []).map(item => ({
                    item_id: item.item_id,
                    name: item.item_name,
                    quantity: item.quantity,
                    unit_price: parseFloat(item.unit_price),
                    total: parseFloat(item.line_total)
                }))
            };
        }

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
        } catch (e) { crewRoles = {}; }

        const isRolesEmpty = !crewRoles || 
                           (Array.isArray(crewRoles) && crewRoles.length === 0) || 
                           (typeof crewRoles === 'object' && Object.keys(crewRoles).length === 0);

        if (isRolesEmpty && booking.event_type) {
            const types = booking.event_type.toLowerCase();
            crewRoles = {};
            if (types.includes('videographer')) crewRoles.videographer = 1;
            if (types.includes('photographer')) crewRoles.photographer = 1;
            if (types.includes('cinematographer')) crewRoles.cinematographer = 1;
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
                hours = diff; 
            } else {
                hours = 8; 
            }
        }

        const parseEdits = (val) => {
            if (!val) return [];
            if (Array.isArray(val)) return val;
            try { return JSON.parse(val); } catch { return []; }
        };

        const calculatedQuote = await pricingService.calculateQuote({
            items: items,
            shootHours: hours, 
            eventType: booking.shoot_type || booking.event_type || 'general',
            shootStartDate: booking.event_date,
            videoEditTypes: parseEdits(booking.video_edit_types),
            photoEditTypes: parseEdits(booking.photo_edit_types),
            skipDiscount: true, 
            skipMargin: true
        });

        return {
            source: 'calculated',
            total: calculatedQuote?.total || 0,
            subtotal: calculatedQuote?.subtotal || 0,
            line_items: calculatedQuote?.lineItems || [] 
        };

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
    const {
      page = 1,
      limit = 20,
      status,
      lead_type,
      assigned_to,
      search,
      start_date,
      end_date
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const whereClause = { [Op.and]: [] };

    if (start_date && end_date) {
      whereClause.created_at = {
        [Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`]
      };
    }

    if (status) whereClause.lead_status = status;
    if (lead_type) whereClause.lead_type = lead_type;

    if (assigned_to) {
      whereClause.assigned_sales_rep_id =
        assigned_to === 'unassigned' ? null : parseInt(assigned_to);
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
        {
          model: users,
          as: 'assigned_sales_rep',
          attributes: ['id', 'name', 'email']
        },
        {
          model: stream_project_booking,
          as: 'booking',
          attributes: [
            'stream_project_booking_id',
            'event_date',
            'event_type',
            'shoot_type',
            'duration_hours',
            'crew_roles',
            'payment_id',
            'start_time',
            'end_time',
            'video_edit_types',
            'photo_edit_types',
            'is_draft'
          ],
          include: [
            {
              model: quotes,
              as: 'primary_quote',
              include: [
                {
                  model: quote_line_items,
                  as: 'line_items'
                }
              ]
            }
          ]
        }
      ],
      limit: parseInt(limit),
      offset,
      order: [['created_at', 'DESC']]
    });

    const leadsWithPricing = await Promise.all(
      leads.map(async (lead) => {
        const leadJson = lead.toJSON();

        const pricingData = await calculateLeadPricing(lead.booking);

        const intent =
          lead.intent ??
          leadAssignmentService.getLeadIntent({
            lead,
            booking: lead.booking
          });

        return {
          ...leadJson,
          potential_value: pricingData ? pricingData.total : 0,
          pricing_details: pricingData || null,
          payment_status: lead.booking?.payment_id ? 'paid' : 'unpaid',
          intent,
          intent_source: lead.intent ? 'manual' : 'system',
          booking_status: leadAssignmentService.getLeadBookingStatus(
            lead,
            lead.booking
          )
        };
      })
    );

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
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leads',
      error: error.message
    });
  }
};

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
              model: quotes,
              as: 'primary_quote',
              include: [{ model: quote_line_items, as: 'line_items' }]
            },
            {
              model: assigned_crew,
              as: 'assigned_crews',
              required: false,
              where: { is_active: 1 },
              attributes: ['crew_member_id', 'crew_accept', 'status', 'is_active'],
              include: [
                {
                  model: crew_members,
                  as: 'crew_member',
                  attributes: ['crew_member_id', 'first_name', 'last_name', 'primary_role', 'hourly_rate']
                }
              ]
            }
          ]
        },
        { model: discount_codes, as: 'discount_codes' },
        { model: payment_links, as: 'payment_links' },
        {
          model: sales_lead_activities,
          as: 'activities',
          include: [{ model: users, as: 'performed_by', attributes: ['id', 'name'] }]
        }
      ],
      order: [[{ model: sales_lead_activities, as: 'activities' }, 'created_at', 'DESC']]
    });

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    const leadJson = lead.toJSON();

    let active_payment_link = null;
    const pLinks = leadJson.payment_links || leadJson.paymentLinks;
    const dCodes = leadJson.discount_codes || leadJson.discountCodes || [];

    if (pLinks && pLinks.length > 0) {
      const latestLink = [...pLinks].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      const attachedDiscount = dCodes.find((d) => d.discount_code_id === latestLink.discount_code_id);
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      
      if (latestLink.link_token) {
        let fullUrl = `${baseUrl}/payment-link/${latestLink.link_token}`;
        if (attachedDiscount && attachedDiscount.code) fullUrl += `?discount=${attachedDiscount.code}`;
        const now = new Date();
        const expiryDate = latestLink.expires_at ? new Date(latestLink.expires_at) : null;
        active_payment_link = {
          payment_link_id: latestLink.payment_link_id || latestLink.id,
          full_url: fullUrl,
          token: latestLink.link_token,
          expires_at: latestLink.expires_at,
          is_used: !!latestLink.is_used,
          is_expired: expiryDate ? expiryDate < now : false,
          discount_details: attachedDiscount ? {
            code: attachedDiscount.code,
            type: attachedDiscount.discount_type,
            value: attachedDiscount.discount_value,
            is_active: attachedDiscount.is_active
          } : null
        };
      }
    }

    const projectedQuote = await calculateLeadPricing(lead.booking);

    let pricing_breakdown = {
        shoot_cost: 0,
        editing_cost: 0,
        additional_creatives_cost: 0,
        discount: parseFloat(leadJson.booking?.primary_quote?.discount_amount || 0),
        total: 0
    };

    const activeQuoteSource = leadJson.booking?.primary_quote || projectedQuote;
    pricing_breakdown.total = parseFloat(activeQuoteSource?.total || 0);

    const itemsToProcess = activeQuoteSource?.line_items || [];

    itemsToProcess.forEach(item => {
        const name = (item.item_name || item.name || '').toLowerCase();
        const lineTotal = parseFloat(item.line_total || item.total || 0);
        const quantity = parseInt(item.quantity || 1);

        if (name.includes('videographer') || name.includes('photographer')) {
            const unitPrice = lineTotal / quantity;
            
            pricing_breakdown.shoot_cost += unitPrice;

            if (quantity > 1) {
                pricing_breakdown.additional_creatives_cost += (unitPrice * (quantity - 1));
            }
        } 
        else if (name.includes('reel') || name.includes('edit') || name.includes('highlight')) {
            pricing_breakdown.editing_cost += lineTotal;
        } 
        else {
            pricing_breakdown.shoot_cost += lineTotal;
        }
    });

    const selectedCrewIds = lead.booking?.assigned_crews?.map(c => c.crew_member_id).filter(Boolean) || [];
    const intent = lead.intent ?? leadAssignmentService.getLeadIntent({ lead, booking: lead.booking });
    const intent_source = lead.intent ? 'manual' : 'system';
    const booking_status = leadAssignmentService.getLeadBookingStatus(lead, lead.booking);
    
    let payment_status = lead.booking?.payment_id ? 'paid' : 'unpaid';
    if (payment_status === 'unpaid' && active_payment_link) {
        payment_status = active_payment_link.is_expired ? 'link_expired' : 'link_sent';
    }

    const booking_step = leadAssignmentService.getLeadBookingStep(lead, lead.booking, lead.activities);
    const can_edit_booking = canEditBooking(lead, lead.booking);

    const ROLE_GROUPS = { videographer: ['9', '1'], photographer: ['10', '2'], cinematographer: ['11', '3'] };
    const ID_TO_ROLE_MAP = {};
    Object.entries(ROLE_GROUPS).forEach(([role, ids]) => { ids.forEach(id => (ID_TO_ROLE_MAP[id] = role)); });

    let fulfillmentSummary = {};
    if (leadJson.booking && leadJson.booking.crew_roles) {
      let requestedRoles = {};
      try { requestedRoles = typeof leadJson.booking.crew_roles === 'string' ? JSON.parse(leadJson.booking.crew_roles) : leadJson.booking.crew_roles; } catch (e) { requestedRoles = {}; }
      
      // Safety check for requestedRoles being an object
      if (requestedRoles && typeof requestedRoles === 'object') {
          Object.keys(requestedRoles).forEach(role => {
            fulfillmentSummary[role] = { required: requestedRoles[role], pending: 0, accepted: 0, rejected: 0, display: `0/${requestedRoles[role]}` };
          });
      }

      if (leadJson.booking.assigned_crews) {
        leadJson.booking.assigned_crews.forEach(ac => {
          let crewRoleIds = [];
          
          // FIX: Safer primary_role parsing
          let rawRole = ac.crew_member?.primary_role;
          if (typeof rawRole === 'string') {
              try {
                  crewRoleIds = JSON.parse(rawRole);
              } catch (e) {
                  // If it's a string but not JSON array (e.g. "9"), wrap it in an array
                  crewRoleIds = [rawRole];
              }
          } else if (rawRole !== null && rawRole !== undefined) {
              crewRoleIds = rawRole;
          }

          // Ensure crewRoleIds is definitely an array before calling .map
          if (!Array.isArray(crewRoleIds)) {
              crewRoleIds = crewRoleIds ? [crewRoleIds] : [];
          }

          const potentialCategories = [...new Set(crewRoleIds.map(id => ID_TO_ROLE_MAP[String(id)]).filter(Boolean))];
          
          let assignedToCategory = null;
          if (ac.crew_accept === 1) assignedToCategory = potentialCategories.find(cat => fulfillmentSummary[cat] && fulfillmentSummary[cat].accepted < fulfillmentSummary[cat].required);
          if (!assignedToCategory && ac.crew_accept !== 2) assignedToCategory = potentialCategories.find(cat => fulfillmentSummary[cat] && (fulfillmentSummary[cat].accepted + fulfillmentSummary[cat].pending) < fulfillmentSummary[cat].required);
          if (!assignedToCategory) assignedToCategory = potentialCategories[0];
          
          if (assignedToCategory && fulfillmentSummary[assignedToCategory]) {
            const role = fulfillmentSummary[assignedToCategory];
            if (ac.crew_accept === 1) role.accepted += 1;
            else if (ac.crew_accept === 0 || ac.crew_accept === null) role.pending += 1;
            else if (ac.crew_accept === 2) role.rejected += 1;
          }
        });
      }
      Object.keys(fulfillmentSummary).forEach(key => {
        const item = fulfillmentSummary[key];
        item.display = `${item.accepted}/${item.required}`;
        item.needs_attention = item.accepted < item.required;
      });
    }

    const statusMap = { 0: 'pending', 1: 'accepted', 2: 'rejected' };
    if (leadJson.booking?.assigned_crews) {
      leadJson.booking.assigned_crews = leadJson.booking.assigned_crews.map(ac => ({
        ...ac,
        acceptance_status: statusMap[ac.crew_accept] || 'pending'
      }));
    }

    res.json({
      success: true,
      data: {
        ...leadJson,
        selected_crew_ids: selectedCrewIds,
        intent,
        intent_source,
        booking_status,
        payment_status,
        active_payment_link,
        booking_step,
        can_edit_booking,
        fulfillmentSummary,
        pricing_breakdown,
        projected_quote: projectedQuote
      }
    });
  } catch (error) {
    console.error('GetLeadById Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch lead details', error: error.message });
  }
};

exports.getLeadFulfillmentStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const lead = await sales_leads.findOne({
      where: { lead_id: id },
      include: [
        {
          model: stream_project_booking,
          as: 'booking',
          attributes: ['event_location', 'crew_roles'],
          include: [
            {
              model: assigned_crew,
              as: 'assigned_crews',
              where: { is_active: 1 },
              required: false,
              attributes: ['crew_accept'],
              include: [
                {
                  model: crew_members,
                  as: 'crew_member',
                  attributes: ['primary_role']
                }
              ]
            }
          ]
        }
      ]
    });

    if (!lead || !lead.booking) {
      return res.status(404).json({ success: false, message: 'Lead or Booking not found' });
    }

    const booking = lead.booking;
    
    let requestedRoles = {};
    try {
      requestedRoles = typeof booking.crew_roles === 'string' ? JSON.parse(booking.crew_roles) : (booking.crew_roles || {});
    } catch (e) {
      requestedRoles = {};
    }

    const ROLE_GROUPS = { 
      videographer: ['9', '1'], 
      photographer: ['10', '2'], 
      cinematographer: ['11', '3'] 
    };
    const ID_TO_ROLE_MAP = {};
    Object.entries(ROLE_GROUPS).forEach(([role, ids]) => {
      ids.forEach(id => (ID_TO_ROLE_MAP[String(id)] = role));
    });

    // 3. Initialize Summary
    let fulfillment = {};
    Object.keys(requestedRoles).forEach(role => {
      fulfillment[role] = {
        accepted: 0,
        required: parseInt(requestedRoles[role]) || 0,
        status_display: `0/${requestedRoles[role]}`
      };
    });

    if (booking.assigned_crews) {
      booking.assigned_crews.forEach(ac => {
        if (ac.crew_accept === 1) {
          let crewRoleIds = [];
          try {
            crewRoleIds = typeof ac.crew_member?.primary_role === 'string' 
              ? JSON.parse(ac.crew_member.primary_role) 
              : (ac.crew_member?.primary_role || []);
          } catch (e) { crewRoleIds = []; }

          const categories = [...new Set(crewRoleIds.map(id => ID_TO_ROLE_MAP[String(id)]).filter(Boolean))];
          
          const targetCategory = categories.find(cat => fulfillment[cat] && fulfillment[cat].accepted < fulfillment[cat].required);
          
          if (targetCategory) {
            fulfillment[targetCategory].accepted += 1;
          }
        }
      });
    }

    const result = {};
    Object.keys(fulfillment).forEach(key => {
      result[key] = `${fulfillment[key].accepted}/${fulfillment[key].required}`;
    });

    res.json({
      success: true,
      data: {
        lead_id: id,
        location: booking.event_location,
        fulfillment_stats: result
      }
    });

  } catch (error) {
    console.error('Fulfillment Status Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
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
 * Shared core finalize logic (this is your finalizeGuestBooking logic, reused cleanly).
 * IMPORTANT: no res/json here, pure function.
 */
async function finalizeBookingCore({ booking, bookingId, finalizeBody, tx }) {
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
    skip_discount = true,
    skip_margin = true
  } = finalizeBody;

  // 1) booking update
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
  if (crew_roles != null) updateData.crew_roles = safeJsonStringify(crew_roles);

  if (typeof edits_needed !== 'undefined') {
    updateData.edits_needed = edits_needed ? 1 : 0;
  }
  if (Array.isArray(video_edit_types)) updateData.video_edit_types = safeJsonStringify(video_edit_types);
  if (Array.isArray(photo_edit_types)) updateData.photo_edit_types = safeJsonStringify(photo_edit_types);

  const draftVal = normalizeIsDraft(is_draft);
  if (draftVal !== null) updateData.is_draft = draftVal;

  await booking.update(updateData, { transaction: tx });

  // 2) Replace assigned crew (validate FK first!)
  if (Array.isArray(selected_crew_ids)) {
    // FK safety: ensure all crew exist
    if (selected_crew_ids.length > 0) {
      const existing = await crew_members.findAll({
        where: { crew_member_id: selected_crew_ids, is_active: 1 },
        attributes: ['crew_member_id'],
        transaction: tx
      });

      const existingIds = new Set(existing.map(x => x.crew_member_id));
      const missing = selected_crew_ids.filter(id => !existingIds.has(id));
      if (missing.length) {
        throw new Error(`Invalid selected_crew_ids: ${missing.join(', ')}`);
      }
    }

    await assigned_crew.destroy({ where: { project_id: bookingId }, transaction: tx });

    if (selected_crew_ids.length > 0) {
      const assignments = selected_crew_ids.map((creator_id) => ({
        project_id: bookingId,
        crew_member_id: creator_id,
        status: 'selected',
        is_active: 1,
        crew_accept: 0
      }));
      await assigned_crew.bulkCreate(assignments, { transaction: tx });
    }
  }

  // 3) pricing payload (exactly like /pricing/calculate-from-creators)
  const pricingPayload = {
    creator_ids: Array.isArray(selected_crew_ids) ? selected_crew_ids : [],
    shoot_hours: duration_hours != null ? parseInt(duration_hours, 10) : booking.duration_hours,
    role_counts: crew_roles || (booking.crew_roles ? JSON.parse(booking.crew_roles) : {}),
    event_type: event_type || booking.event_type,
    shoot_start_date:
      start_date_time ||
      (booking.event_date ? `${booking.event_date}T${booking.start_time || '00:00:00.000Z'}` : null),
    video_edit_types: Array.isArray(video_edit_types) ? video_edit_types : [],
    photo_edit_types: Array.isArray(photo_edit_types) ? photo_edit_types : [],
    skip_discount: !!skip_discount,
    skip_margin: !!skip_margin
  };

  const pricingData = await calculateFromCreatorsInternally(pricingPayload);

  // 4) expire old quote (don’t delete history)
  if (booking.quote_id) {
    await quotes.update(
      { status: 'expired' },
      { where: { quote_id: booking.quote_id }, transaction: tx }
    );
  }

  // 5) create new quote + line items
  const quote = await persistQuoteFromBreakdown({
    bookingId,
    guest_email: booking.guest_email,
    shootHours: pricingPayload.shoot_hours,
    breakdown: {
      pricingMode: pricingData.quote.pricingMode,
      subtotal: pricingData.quote.subtotal,
      discountPercent: pricingData.quote.discountPercent,
      discountAmount: pricingData.quote.discountAmount,
      priceAfterDiscount: pricingData.quote.priceAfterDiscount,
      marginPercent: pricingData.quote.marginPercent,
      marginAmount: pricingData.quote.marginAmount,
      total: pricingData.quote.total,
      lineItems: pricingData.quote.lineItems.map(li => ({
        item_id: li.item_id,
        name: li.item_name,
        quantity: li.quantity,
        unit_price: li.unit_price,
        total_price: li.line_total
      }))
    },
    tx
  });

  const quoteId = quote.quote_id || quote.id;

  // 6) attach quote_id to booking
  await booking.update({ quote_id: quoteId }, { transaction: tx });

  return {
    quote_id: quoteId,
    booking: {
      stream_project_booking_id: booking.stream_project_booking_id,
      event_date: booking.event_date,
      start_time: booking.start_time,
      end_time: booking.end_time,
      duration_hours: booking.duration_hours,
      event_type: booking.event_type,
      shoot_type: booking.shoot_type,
      content_type: booking.content_type,
      event_location: booking.event_location,
      crew_roles: booking.crew_roles,
      crew_size_needed: booking.crew_size_needed,
      video_edit_types: booking.video_edit_types,
      photo_edit_types: booking.photo_edit_types,
      edits_needed: booking.edits_needed,
      is_draft: booking.is_draft === 1
    },
    quote: pricingData
  };
}

/**
 * POST /v1/guest-bookings/:id/finalize
 * Body: booking fields + creators/roles + edit types + flags
 */
exports.finalizeGuestBooking = async (req, res) => {
  const tx = await sequelize.transaction();
  try {
    const { id } = req.params;

    const {
      content_type,
      shoot_type,
      event_type,
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
      is_draft,
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

    // 2) Run shared finalize core
    const finalizeResult = await finalizeBookingCore({
      booking,
      bookingId: booking.stream_project_booking_id,
      finalizeBody: {
        content_type,
        shoot_type,
        event_type,
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
        is_draft,
        skip_discount,
        skip_margin
      },
      tx
    });

    await tx.commit();

    return res.status(200).json({
      success: true,
      message: 'Booking finalized',
      data: {
        booking_id: booking.stream_project_booking_id,
        quote_id: finalizeResult.quote_id,
        booking: finalizeResult.booking,
        quote: finalizeResult.quote
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

/**
 * POST /v1/sales/deals/finalize
 * Single API for Create New Deal "Continue" button:
 * - Creates sales_leads + stream_project_booking (draft)
 * - Runs finalize flow: booking update + assigned crew + pricing + quote + attach quote_id
 */
exports.finalizeCreateDeal = async (req, res) => {
  const tx = await sequelize.transaction();
  try {
    const {
      // Client / lead fields
      user_id = null,
      client_name = null,
      guest_email = null,
      phone = null,
      lead_type = 'sales_assisted',
      intent = 'Warm',
      lead_source = null,

      // Booking fields
      content_type,
      shoot_type,
      event_type,
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
      is_draft,

      // pricing flags
      skip_discount = true,
      skip_margin = true,
    } = req.body;

    if (!user_id && !guest_email) {
      await tx.rollback();
      return res.status(400).json({
        success: false,
        message: 'guest_email or user_id is required'
      });
    }

    // Load user if provided
    let user = null;
    if (user_id) {
      user = await users.findOne({
        where: { id: user_id, is_active: 1 },
        transaction: tx
      });

      if (!user) {
        await tx.rollback();
        return res.status(404).json({
          success: false,
          message: 'user not found'
        });
      }
    }

    const resolvedEmail = guest_email || user?.email || null;
    const resolvedName = client_name || user?.name || null;
    const resolvedPhone = phone || user?.phone_number || null;

    if (!resolvedEmail) {
      await tx.rollback();
      return res.status(400).json({
        success: false,
        message: 'guest_email is required'
      });
    }

    // 1️⃣ Create booking shell
    const booking = await stream_project_booking.create(
      {
        user_id: user_id || null,
        guest_email: resolvedEmail,
        project_name: resolvedName
          ? `DEAL - ${resolvedName}`
          : `DEAL - ${resolvedEmail}`,
        streaming_platforms: JSON.stringify([]),
        crew_roles: JSON.stringify(crew_roles ?? {}),
        is_draft: 1,
        is_active: 1,
      },
      { transaction: tx }
    );

    // 2️⃣ Create lead
    const lead = await sales_leads.create(
      {
        booking_id: booking.stream_project_booking_id,
        user_id: user_id || null,
        guest_email: resolvedEmail,
        phone: resolvedPhone,
        client_name: resolvedName,
        lead_type,
        intent,
        lead_source,
        lead_status: 'in_progress_sales_assisted',
        is_active: 1,
      },
      { transaction: tx }
    );

    // 3️⃣ Create lead activity
    await sales_lead_activities.create(
      {
        lead_id: lead.lead_id,
        activity_type: 'created',
        activity_data: {
          source: 'sales_portal_create_deal',
          guest_email: resolvedEmail,
          lead_source: lead_source || null
        }
      },
      { transaction: tx }
    );

    // 4️⃣ 🔥 AUTO ASSIGN (same as trackEarlyBookingInterest)
    const assignedRep = await leadAssignmentService.autoAssignLead(
  lead.lead_id,
  { transaction: tx }
);
    if (assignedRep?.id) {
      await lead.update(
        { assigned_sales_rep_id: assignedRep.id },
        { transaction: tx }
      );
    }

    // 5️⃣ Finalize booking
    const finalizeResult = await finalizeBookingCore({
      booking,
      bookingId: booking.stream_project_booking_id,
      finalizeBody: {
        content_type,
        shoot_type,
        event_type,
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
        is_draft,
        skip_discount,
        skip_margin,
      },
      tx
    });

    await tx.commit();

    return res.status(200).json({
      success: true,
      message: 'Deal created & booking finalized',
      data: {
        lead_id: lead.lead_id,
        booking_id: booking.stream_project_booking_id,
        quote_id: finalizeResult.quote_id,
        assigned_to: assignedRep ? assignedRep.name : null,
        booking: finalizeResult.booking,
        quote: finalizeResult.quote
      }
    });

  } catch (error) {
    try { await tx.rollback(); } catch (_) {}

    console.error('Error in finalizeCreateDeal:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to create & finalize deal',
      error: process.env.NODE_ENV === 'development'
        ? error.message
        : undefined
    });
  }
};

module.exports = exports;
