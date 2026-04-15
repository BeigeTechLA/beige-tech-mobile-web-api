const db = require('../models');
const { stream_project_booking, stream_project_booking_days, assigned_crew, crew_members, crew_member_files, quotes, quote_line_items, discount_codes } = require('../models');
const constants = require('../utils/constants');
const { formatLocationResponse } = require('../utils/locationHelpers');
const { appendBookingToSheet } = require('../utils/googleSheetsService');
const { appendToSheet, updateSheetRow } = require('../utils/googleSheets');
const { content } = require('googleapis/build/src/apis/content');
const { sendCPNewBookingRequestEmail } = require('../utils/emailService');
const { resolveEventDateAndStartTime, normalizeTime, splitDateTime } = require('../utils/timezone');
const REFERRAL_DISCOUNT_PERCENT = 10;

const normalizeDateOnlyInput = (value) => {
  const { date } = splitDateTime(value);
  return date || null;
};

async function resolveUserId(userId, guestEmail) {
  if (userId) return parseInt(userId);
  if (!guestEmail) return null;

  const normalizedEmail = String(guestEmail).trim().toLowerCase();
  if (!normalizedEmail) return null;

  const existingUser = await db.users.findOne({
    where: { email: normalizedEmail },
    attributes: ['id']
  });

  return existingUser ? existingUser.id : null;
}

const notifyAssignedCreators = async (
  creatorIds = [],
  booking = null,
  fallbackClientName = '',
  fallbackShootAmount = null
) => {
  try {
    const uniqueIds = [...new Set((creatorIds || []).map(Number).filter(Boolean))];
    if (!uniqueIds.length) return;

    const creators = await crew_members.findAll({
      where: { crew_member_id: uniqueIds },
      attributes: ['crew_member_id', 'first_name', 'last_name', 'email']
    });

    const dashboardLink =
      process.env.CP_DASHBOARD_LINK ||
      process.env.FRONTEND_URL ||
      'https://beige.app/';

    await Promise.allSettled(
      creators
        .filter((c) => c.email)
        .map((c) =>
          sendCPNewBookingRequestEmail({
            to_email: c.email,
            user_name: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'there',
            ...getCPNewBookingEmailFields(booking, fallbackClientName, fallbackShootAmount),
            dashboardLink
          })
        )
    );
  } catch (e) {
    console.error('notifyAssignedCreators error:', e?.message || e);
  }
};

const getCPNewBookingEmailFields = (booking = {}, fallbackClientName = '', fallbackShootAmount = null) => ({
  client_name:
    fallbackClientName ||
    booking?.client_name ||
    booking?.user?.name ||
    null,
  service_type:
    booking?.content_type ||
    booking?.event_type ||
    booking?.shoot_type ||
    null,
  date: booking?.event_date || null,
  start_time: booking?.start_time || null,
  end_time: booking?.end_time || null,
  shoot_amount: fallbackShootAmount ?? booking?.budget ?? null
});

const resolveBookingClientName = async (booking = null, options = {}) => {
  if (!booking) return null;

  const bookingId = booking.stream_project_booking_id;
  const transaction = options.transaction;
  const fallbackClientName = options.fallbackClientName;

  if (fallbackClientName) {
    return fallbackClientName;
  }

  if (booking.client_name) {
    return booking.client_name;
  }

  const salesLead = await db.sales_leads.findOne({
    where: { booking_id: bookingId },
    attributes: ['client_name'],
    transaction
  });

  if (salesLead?.client_name) {
    return salesLead.client_name;
  }

  const clientLead = await db.client_leads.findOne({
    where: { booking_id: bookingId },
    attributes: ['client_name'],
    transaction
  });

  if (clientLead?.client_name) {
    return clientLead.client_name;
  }

  if (booking.user_id) {
    const user = await db.users.findByPk(booking.user_id, {
      attributes: ['name'],
      transaction
    });

    if (user?.name) {
      return user.name;
    }
  }

  return null;
};

const resolveBookingShootAmount = async (booking = null, options = {}) => {
  if (!booking) return null;

  const transaction = options.transaction;
  const fallbackShootAmount = options.fallbackShootAmount;

  if (fallbackShootAmount !== undefined && fallbackShootAmount !== null) {
    return fallbackShootAmount;
  }

  if (booking.budget !== undefined && booking.budget !== null) {
    return booking.budget;
  }

  if (booking.quote_id) {
    const quote = await db.quotes.findByPk(booking.quote_id, {
      attributes: ['total', 'price_after_discount', 'subtotal'],
      transaction
    });

    if (quote) {
      return quote.total ?? quote.price_after_discount ?? quote.subtotal ?? null;
    }
  }

  return null;
};

/**
 * Create a new guest booking (no authentication required)
 * POST /api/guest-bookings/create
 * Body: booking data from frontend modal + guest_email
 * Headers: No authentication required
 */
// exports.createGuestBooking = async (req, res) => {
//   try {
//     const {
//       user_id,
//       order_name,
//       guest_email,
//       project_type,
//       content_type,
//       shoot_type,
//       edit_type,
//       description,
//       event_type,
//       start_date_time,
//       duration_hours,
//       end_time,
//       budget_min,
//       budget_max,
//       expected_viewers,
//       stream_quality,
//       crew_size,
//       location,
//       streaming_platforms,
//       crew_roles,
//       skills_needed,
//       equipments_needed,
//       is_draft,
//       quote_id,
//       // V3 New Fields
//       full_name,
//       phone,
//       edits_needed,
//       video_edit_types,
//       photo_edit_types,
//       team_included,
//       add_team_members,
//       special_instructions,
//       reference_links,
//       matching_method,
//       selected_crew_ids
//     } = req.body;

//     // Validate required fields
//     if (!order_name) {
//       return res.status(constants.BAD_REQUEST.code).json({
//         success: false,
//         message: 'Project name is required'
//       });
//     }

//     if (!guest_email) {
//       return res.status(constants.BAD_REQUEST.code).json({
//         success: false,
//         message: 'Guest email is required'
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

//     // Parse date and time from start_date_time
//     let event_date = null;
//     let start_time = null;

//     if (start_date_time) {
//       try {
//         const dateObj = new Date(start_date_time);
//         event_date = dateObj.toISOString().split('T')[0];
//         start_time = dateObj.toTimeString().split(' ')[0];
//       } catch (error) {
//         console.error('Error parsing start_date_time:', error);
//       }
//     }

//     // Calculate budget (use average of min/max or just max if only one provided)
//     let budget = null;
//     if (budget_max) {
//       budget = budget_max;
//     } else if (budget_min && budget_max) {
//       budget = (parseFloat(budget_min) + parseFloat(budget_max)) / 2;
//     } else if (budget_min) {
//       budget = budget_min;
//     }

//     // Parse and normalize location (supports Mapbox JSON format and plain strings)
//     let normalizedLocation = location;
//     if (location) {
//       // If location is already stringified JSON, keep as-is for storage
//       // If it's an object, stringify it
//       if (typeof location === 'object') {
//         normalizedLocation = JSON.stringify(location);
//       }
//       // Plain strings are kept as-is for backward compatibility
//     }

//     // V3: Combine edit types
//     let combinedEditTypes = edit_type;
//     if (video_edit_types || photo_edit_types) {
//         const vTypes = Array.isArray(video_edit_types) ? video_edit_types : [];
//         const pTypes = Array.isArray(photo_edit_types) ? photo_edit_types : [];
//         combinedEditTypes = [...vTypes, ...pTypes].join(',');
//     }

//     // V3: Combine description with new fields
//     let combinedDescription = description || special_instructions || '';
//     if (full_name) combinedDescription += `\n\nContact Name: ${full_name}`;
//     if (phone) combinedDescription += `\nPhone: ${phone}`;
//     if (reference_links) combinedDescription += `\nReference Links: ${reference_links}`;
//     if (matching_method) combinedDescription += `\nMatching Method: ${matching_method}`;

//     // Prepare booking data mapping frontend fields to database fields
//     // Note: user_id is NULL for guest bookings, guest_email is used instead
//     const bookingData = {
//       user_id: user_id ? parseInt(user_id) : null,
//       quote_id: quote_id || null, // Link to pricing quote if provided
//       guest_email: guest_email, // Store guest email for contact
//       project_name: order_name,
//       description: combinedDescription || null,
//       event_type: event_type || content_type || project_type || (shoot_type ? shoot_type : null),
//       event_date: event_date,
//       duration_hours: duration_hours ? parseInt(duration_hours) : null,
//       start_time: start_time,
//       end_time: end_time || null,
//       budget: budget,
//       expected_viewers: expected_viewers ? parseInt(expected_viewers) : null,
//       stream_quality: stream_quality || null,
//       crew_size_needed: crew_size ? parseInt(crew_size) : null,
//       event_location: normalizedLocation || null,
//       streaming_platforms: streaming_platforms
//         ? (typeof streaming_platforms === 'string' ? streaming_platforms : JSON.stringify(streaming_platforms))
//         : '[]',
//       crew_roles: crew_roles
//         ? (typeof crew_roles === 'string' ? crew_roles : JSON.stringify(crew_roles))
//         : '[]',
//       skills_needed: skills_needed
//         ? (typeof skills_needed === 'string' ? skills_needed : JSON.stringify(skills_needed))
//         : null,
//       equipments_needed: equipments_needed
//         ? (typeof equipments_needed === 'string' ? equipments_needed : JSON.stringify(equipments_needed))
//         : null,
//       is_draft: is_draft ? 1 : 0,
//       is_completed: 0,
//       is_cancelled: 0,
//       is_active: 1
//     };

//     // Create guest booking with email stored in database
//     const booking = await stream_project_booking.create(bookingData);

//     // V3: Assign selected creators if provided
//     if (selected_crew_ids && Array.isArray(selected_crew_ids) && selected_crew_ids.length > 0) {
//         try {
//             const assignments = selected_crew_ids.map(creator_id => ({
//                 project_id: booking.stream_project_booking_id,
//                 crew_member_id: creator_id,
//                 status: 'selected',
//                 is_active: 1,
//                 crew_accept: 0
//             }));
//             await assigned_crew.bulkCreate(assignments);
//         } catch (assignError) {
//             console.error("Error assigning V3 creators:", assignError);
//             // Don't fail the whole request, just log it
//         }
//     }

//     // Sync booking to Google Sheets (async, non-blocking)
//     appendBookingToSheet({
//       stream_project_booking_id: booking.stream_project_booking_id,
//       project_name: booking.project_name,
//       guest_email: guest_email,
//       event_type: booking.event_type,
//       event_date: booking.event_date,
//       event_location: booking.event_location,
//       budget: booking.budget,
//       crew_size_needed: booking.crew_size_needed,
//       skills_needed: booking.skills_needed,
//       description: booking.description,
//       is_draft: booking.is_draft === 1,
//     }).catch(err => {
//       console.error('Google Sheets sync failed (non-critical):', err.message);
//     });

//     res.status(constants.CREATED.code).json({
//       success: true,
//       message: is_draft ? 'Guest draft booking saved successfully' : 'Guest booking created successfully',
//       data: {
//         booking_id: booking.stream_project_booking_id,
//         project_name: booking.project_name,
//         guest_email: guest_email,
//         event_date: booking.event_date,
//         event_location: formatLocationResponse(booking.event_location),
//         budget: booking.budget,
//         quote_id: booking.quote_id,
//         is_draft: booking.is_draft === 1,
//         created_at: booking.created_at
//       }
//     });

//   } catch (error) {
//     console.error('Error creating guest booking:', error);
//     res.status(constants.INTERNAL_SERVER_ERROR.code).json({
//       success: false,
//       message: 'Failed to create guest booking',
//       error: process.env.NODE_ENV === 'development' ? error.message : undefined
//     });
//   }
// };

exports.createGuestBooking = async (req, res) => {
  try {
    const {
      user_id,
      order_name,
      guest_email,
      project_type,
      content_type,
      shoot_type,
      edit_type,
      description,
      event_type,
      start_date_time,
      start_date,
      start_time,
      estimated_delivery_date,
      duration_hours,
      end_time,
      time_zone,
      budget_min,
      budget_max,
      expected_viewers,
      stream_quality,
      crew_size,
      location,
      streaming_platforms,
      crew_roles,
      skills_needed,
      equipments_needed,
      is_draft,
      quote_id,
      // V3 New Fields
      full_name,
      phone,
      edits_needed,
      video_edit_types,
      photo_edit_types,
      team_included,
      add_team_members,
      special_instructions,
      reference_links,
      matching_method,
      selected_crew_ids,
      booking_type,
      booking_days
    } = req.body;

    // Validate required fields
    if (!order_name) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Project name is required'
      });
    }

    if (!guest_email) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Guest email is required'
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(guest_email)) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    const normalizedGuestEmail = String(guest_email).trim().toLowerCase();
    const resolvedUserId = await resolveUserId(user_id, normalizedGuestEmail);
    const normalizedEstimatedDeliveryDate = normalizeDateOnlyInput(estimated_delivery_date);

    if (estimated_delivery_date && !normalizedEstimatedDeliveryDate) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'estimated_delivery_date must be a valid date'
      });
    }

    const toTimeParts = (timeStr) => {
      if (!timeStr) return null;
      const parts = String(timeStr).split(':').map(Number);
      if (!parts.length || parts.some((p) => Number.isNaN(p))) return null;
      const [h, m, s = 0] = parts;
      return { h, m, s };
    };

    const calculateDurationHours = (startTime, endTime) => {
      const startParts = toTimeParts(startTime);
      const endParts = toTimeParts(endTime);
      if (!startParts || !endParts) return null;
      const startMinutes = startParts.h * 60 + startParts.m + startParts.s / 60;
      const endMinutes = endParts.h * 60 + endParts.m + endParts.s / 60;
      const diffMinutes = endMinutes - startMinutes;
      if (diffMinutes <= 0) return null;
      return Math.round((diffMinutes / 60) * 100) / 100;
    };

    let normalizedBookingDays = Array.isArray(booking_days) ? booking_days : [];
    normalizedBookingDays = normalizedBookingDays
      .filter((d) => d && d.date)
      .map((d) => ({
        date: d.date,
        start_time: normalizeTime(d.start_time || d.startTime) || null,
        end_time: normalizeTime(d.end_time || d.endTime) || null,
        duration_hours: d.duration_hours != null ? Number(d.duration_hours) : null,
        time_zone: d.time_zone || d.timeZone || null
      }));

    // Parse date and time from start_date_time (single day)
    const resolvedSingleDay = resolveEventDateAndStartTime({
      start_date,
      start_time,
      start_date_time
    });
    let event_date = resolvedSingleDay.event_date;
    let start_time_final = resolvedSingleDay.start_time;
    const end_time_final = normalizeTime(end_time);

    // If multi-day, derive event_date/start_time from first day
    let totalDurationHours = null;
    if (booking_type === 'multi_day' && normalizedBookingDays.length > 0) {
      normalizedBookingDays.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      event_date = normalizedBookingDays[0].date;
      start_time_final = normalizeTime(normalizedBookingDays[0].start_time) || null;
      totalDurationHours = normalizedBookingDays.reduce((sum, d) => {
        const hours = d.duration_hours != null ? d.duration_hours : calculateDurationHours(d.start_time, d.end_time);
        return sum + (hours || 0);
      }, 0);
      if (totalDurationHours > 0) {
        totalDurationHours = Math.round(totalDurationHours * 100) / 100;
      } else {
        totalDurationHours = null;
      }
    }

    // Calculate budget (use average of min/max or just max if only one provided)
    let budget = null;
    if (budget_max) {
      budget = budget_max;
    } else if (budget_min && budget_max) {
      budget = (parseFloat(budget_min) + parseFloat(budget_max)) / 2;
    } else if (budget_min) {
      budget = budget_min;
    }

    // Parse and normalize location (supports Mapbox JSON format and plain strings)
    let normalizedLocation = location;
    if (location) {
      if (typeof location === 'object') {
        normalizedLocation = JSON.stringify(location);
      }
    }

    // V3: Combine edit types
    let combinedEditTypes = edit_type;
    if (video_edit_types || photo_edit_types) {
        const vTypes = Array.isArray(video_edit_types) ? video_edit_types : [];
        const pTypes = Array.isArray(photo_edit_types) ? photo_edit_types : [];
        combinedEditTypes = [...vTypes, ...pTypes].join(',');
    }

    // V3: Combine description with new fields
    let combinedDescription = description || special_instructions || '';
    if (full_name) combinedDescription += `\n\nContact Name: ${full_name}`;
    if (phone) combinedDescription += `\nPhone: ${phone}`;
    if (reference_links) combinedDescription += `\nReference Links: ${reference_links}`;
    if (matching_method) combinedDescription += `\nMatching Method: ${matching_method}`;

    const bookingData = {
      user_id: resolvedUserId,
      quote_id: quote_id || null,
      guest_email: normalizedGuestEmail,
      project_name: order_name,
      description: combinedDescription || null,
      content_type: content_type || null,
      event_type: event_type || content_type || project_type || (shoot_type ? shoot_type : null),
      event_date: event_date,
      estimated_delivery_date: normalizedEstimatedDeliveryDate,
      duration_hours: duration_hours ? parseInt(duration_hours) : totalDurationHours != null ? totalDurationHours : null,
      start_time: start_time_final,
      end_time: normalizeTime(end_time) || null,
      budget: budget,
      expected_viewers: expected_viewers ? parseInt(expected_viewers) : null,
      stream_quality: stream_quality || null,
      crew_size_needed: crew_size ? parseInt(crew_size) : null,
      event_location: normalizedLocation || null,
      streaming_platforms: streaming_platforms
        ? (typeof streaming_platforms === 'string' ? streaming_platforms : JSON.stringify(streaming_platforms))
        : '[]',
      crew_roles: crew_roles
        ? (typeof crew_roles === 'string' ? crew_roles : JSON.stringify(crew_roles))
        : '[]',
      skills_needed: skills_needed
        ? (typeof skills_needed === 'string' ? skills_needed : JSON.stringify(skills_needed))
        : null,
      equipments_needed: equipments_needed
        ? (typeof equipments_needed === 'string' ? equipments_needed : JSON.stringify(equipments_needed))
        : null,
      is_draft: is_draft ? 1 : 0,
      is_completed: 0,
      is_cancelled: 0,
      is_active: 1
    };

    const tx = await db.sequelize.transaction();
    let booking;
    try {
      booking = await stream_project_booking.create(bookingData, { transaction: tx });

      if (booking_type === 'multi_day' && normalizedBookingDays.length > 0) {
        const dayRows = normalizedBookingDays.map((d) => ({
          stream_project_booking_id: booking.stream_project_booking_id,
          event_date: d.date,
          start_time: normalizeTime(d.start_time) || null,
          end_time: normalizeTime(d.end_time) || null,
          duration_hours: d.duration_hours != null ? d.duration_hours : calculateDurationHours(d.start_time, d.end_time),
          time_zone: d.time_zone || null
        }));
        await stream_project_booking_days.bulkCreate(dayRows, { transaction: tx });
      }

      // V3: Assign selected creators if provided
      if (selected_crew_ids && Array.isArray(selected_crew_ids) && selected_crew_ids.length > 0) {
        const assignments = selected_crew_ids.map(creator_id => ({
          project_id: booking.stream_project_booking_id,
          crew_member_id: creator_id,
          status: 'selected',
          is_active: 1,
          crew_accept: 0
        }));
        await assigned_crew.bulkCreate(assignments, { transaction: tx });
      }

      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }

    appendToSheet('Shoot_data', [
      booking.stream_project_booking_id,
      order_name,                    
      content_type || project_type || shoot_type || 'N/A',
      normalizedGuestEmail,                 
      full_name || 'N/A',              
      phone || 'N/A',               
      bookingData.event_type,           
      event_date,                      
      start_time,                     
      duration_hours,                    
      budget,                       
      crew_size,                      
      normalizedLocation,              
      matching_method || 'Standard',
      bookingData.streaming_platforms, 
      bookingData.crew_roles,     
      combinedDescription,       
      is_draft ? 'Draft' : 'Booked' 
    ]).catch(err => {
      console.error('Google Sheets Shoot_data sync failed:', err.message);
    });

    res.status(constants.CREATED.code).json({
      success: true,
      message: is_draft ? 'Guest draft booking saved successfully' : 'Guest booking created successfully',
      data: {
        booking_id: booking.stream_project_booking_id,
        project_name: booking.project_name,
        guest_email: normalizedGuestEmail,
        user_id: booking.user_id,
        event_date: booking.event_date,
        estimated_delivery_date: booking.estimated_delivery_date,
        event_location: formatLocationResponse(booking.event_location),
        budget: booking.budget,
        quote_id: booking.quote_id,
        is_draft: booking.is_draft === 1,
        created_at: booking.created_at
      }
    });

  } catch (error) {
    console.error('Error creating guest booking:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to create guest booking',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update a guest booking (convert draft to final)
 * PUT /api/guest-bookings/:id
 * Params: id - booking ID
 * Body: booking data to update
 * Headers: No authentication required
 */
exports.updateGuestBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      order_name,
      guest_email,
      project_type,
      content_type,
      shoot_type,
      edit_type,
      description,
      event_type,
      start_date_time,
      start_date,
      start_time,
      estimated_delivery_date,
      duration_hours,
      end_time,
      budget_min,
      budget_max,
      expected_viewers,
      stream_quality,
      crew_size,
      location,
      streaming_platforms,
      crew_roles,
      skills_needed,
      equipments_needed,
      is_draft,
      quote_id,
      // V3 New Fields
      full_name,
      phone,
      edits_needed,
      video_edit_types,
      photo_edit_types,
      team_included,
      add_team_members,
      special_instructions,
      reference_links,
      matching_method,
      selected_crew_ids,
      booking_type,
      booking_days,
      time_zone
    } = req.body;

    if (!id) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Booking ID is required'
      });
    }

    // Find existing booking
    const booking = await stream_project_booking.findOne({
      where: {
        stream_project_booking_id: id,
        is_active: 1
      },
      include: [
        {
          model: stream_project_booking_days,
          as: 'booking_days',
          required: false
        }
      ]
    });

    if (!booking) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const normalizedGuestEmail = guest_email ? String(guest_email).trim().toLowerCase() : null;
    const lookupEmail = normalizedGuestEmail || booking.guest_email || null;
    const resolvedUserId = await resolveUserId(null, lookupEmail);
    const normalizedEstimatedDeliveryDate = normalizeDateOnlyInput(estimated_delivery_date);

    if (estimated_delivery_date && !normalizedEstimatedDeliveryDate) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'estimated_delivery_date must be a valid date'
      });
    }

    const toTimeParts = (timeStr) => {
      if (!timeStr) return null;
      const parts = String(timeStr).split(':').map(Number);
      if (!parts.length || parts.some((p) => Number.isNaN(p))) return null;
      const [h, m, s = 0] = parts;
      return { h, m, s };
    };

    const calculateDurationHours = (startTime, endTime) => {
      const startParts = toTimeParts(startTime);
      const endParts = toTimeParts(endTime);
      if (!startParts || !endParts) return null;
      const startMinutes = startParts.h * 60 + startParts.m + startParts.s / 60;
      const endMinutes = endParts.h * 60 + endParts.m + endParts.s / 60;
      const diffMinutes = endMinutes - startMinutes;
      if (diffMinutes <= 0) return null;
      return Math.round((diffMinutes / 60) * 100) / 100;
    };

    let normalizedBookingDays = Array.isArray(booking_days) ? booking_days : [];
    normalizedBookingDays = normalizedBookingDays
      .filter((d) => d && d.date)
      .map((d) => ({
        date: d.date,
        start_time: normalizeTime(d.start_time || d.startTime) || null,
        end_time: normalizeTime(d.end_time || d.endTime) || null,
        duration_hours: d.duration_hours != null ? Number(d.duration_hours) : null,
        time_zone: d.time_zone || d.timeZone || null
      }));

    const resolvedSingleDay = resolveEventDateAndStartTime({
      start_date,
      start_time,
      start_date_time
    });
    let event_date = resolvedSingleDay.event_date;
    let start_time_final = resolvedSingleDay.start_time;

    let totalDurationHours = null;
    if (booking_type === 'multi_day' && normalizedBookingDays.length > 0) {
      normalizedBookingDays.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      event_date = normalizedBookingDays[0].date;
      start_time_final = normalizeTime(normalizedBookingDays[0].start_time) || null;
      totalDurationHours = normalizedBookingDays.reduce((sum, d) => {
        const hours = d.duration_hours != null ? d.duration_hours : calculateDurationHours(d.start_time, d.end_time);
        return sum + (hours || 0);
      }, 0);
      if (totalDurationHours > 0) {
        totalDurationHours = Math.round(totalDurationHours * 100) / 100;
      } else {
        totalDurationHours = null;
      }
    }

    // Calculate budget
    let budget = null;
    if (budget_max) {
      budget = budget_max;
    } else if (budget_min && budget_max) {
      budget = (parseFloat(budget_min) + parseFloat(budget_max)) / 2;
    } else if (budget_min) {
      budget = budget_min;
    }

    // Parse and normalize location
    let normalizedLocation = location;
    if (location) {
      if (typeof location === 'object') {
        normalizedLocation = JSON.stringify(location);
      }
    }

    // V3: Combine edit types
    let combinedEditTypes = edit_type;
    if (video_edit_types || photo_edit_types) {
      const vTypes = Array.isArray(video_edit_types) ? video_edit_types : [];
      const pTypes = Array.isArray(photo_edit_types) ? photo_edit_types : [];
      combinedEditTypes = [...vTypes, ...pTypes].join(',');
    }

    // V3: Combine description with new fields
    let combinedDescription = description || special_instructions || '';
    if (full_name) combinedDescription += `\n\nContact Name: ${full_name}`;
    if (phone) combinedDescription += `\nPhone: ${phone}`;
    if (reference_links) combinedDescription += `\nReference Links: ${reference_links}`;
    if (matching_method) combinedDescription += `\nMatching Method: ${matching_method}`;

    // Prepare update data
    const updateData = {};
    if (order_name) updateData.project_name = order_name;
    if (normalizedGuestEmail) updateData.guest_email = normalizedGuestEmail;
    if (!booking.user_id && resolvedUserId) updateData.user_id = resolvedUserId;
    if (combinedDescription) updateData.description = combinedDescription;
    if (content_type) updateData.content_type = content_type;
    if (event_type || content_type || project_type || shoot_type) {
      updateData.event_type = event_type || content_type || project_type || shoot_type;
    }
    if (event_date) updateData.event_date = event_date;
    if (estimated_delivery_date !== undefined) updateData.estimated_delivery_date = normalizedEstimatedDeliveryDate;
    if (duration_hours) updateData.duration_hours = parseInt(duration_hours);
    if (!duration_hours && totalDurationHours != null) updateData.duration_hours = totalDurationHours;
    if (start_time_final) updateData.start_time = start_time_final;
    // if (end_time_final) updateData.end_time = end_time_final;
    if (budget) updateData.budget = budget;
    if (expected_viewers) updateData.expected_viewers = parseInt(expected_viewers);
    if (stream_quality) updateData.stream_quality = stream_quality;
    if (crew_size !== undefined) {
      updateData.crew_size_needed = crew_size === null || crew_size === ''
        ? null
        : parseInt(crew_size);
    }
    if (location !== undefined) updateData.event_location = normalizedLocation || null;
    if (streaming_platforms) {
      updateData.streaming_platforms = typeof streaming_platforms === 'string' 
        ? streaming_platforms 
        : JSON.stringify(streaming_platforms);
    }
    if (crew_roles) {
      updateData.crew_roles = typeof crew_roles === 'string' 
        ? crew_roles 
        : JSON.stringify(crew_roles);
    }
    if (skills_needed) {
      updateData.skills_needed = typeof skills_needed === 'string' 
        ? skills_needed 
        : JSON.stringify(skills_needed);
    }
    if (equipments_needed) {
      updateData.equipments_needed = typeof equipments_needed === 'string' 
        ? equipments_needed 
        : JSON.stringify(equipments_needed);
    }
    if (quote_id) updateData.quote_id = quote_id;
    if (typeof is_draft !== 'undefined') updateData.is_draft = is_draft ? 1 : 0;

    const tx = await db.sequelize.transaction();
    try {
      // Update booking
      await booking.update(updateData, { transaction: tx });

      const salesLeadUpdate = {};
      if (full_name) salesLeadUpdate.client_name = full_name;
      if (phone) salesLeadUpdate.phone = phone;

      if (Object.keys(salesLeadUpdate).length > 0) {
        await db.sales_leads.update(salesLeadUpdate, {
          where: { booking_id: id },
          transaction: tx
        });
      }

      if (booking_type === 'multi_day' && normalizedBookingDays.length > 0) {
        await stream_project_booking_days.destroy({
          where: { stream_project_booking_id: id },
          transaction: tx
        });
        const dayRows = normalizedBookingDays.map((d) => ({
          stream_project_booking_id: id,
          event_date: d.date,
          start_time: normalizeTime(d.start_time) || null,
          end_time: normalizeTime(d.end_time) || null,
          duration_hours: d.duration_hours != null ? d.duration_hours : calculateDurationHours(d.start_time, d.end_time),
          time_zone: d.time_zone || null
        }));
        await stream_project_booking_days.bulkCreate(dayRows, { transaction: tx });
      }

      if (booking_type === 'single_day') {
        await stream_project_booking_days.destroy({
          where: { stream_project_booking_id: id },
          transaction: tx
        });
      }

      // V3: Update selected creators if provided
      if (selected_crew_ids && Array.isArray(selected_crew_ids) && selected_crew_ids.length > 0) {
        // Remove old assignments
        await assigned_crew.destroy({
          where: { project_id: id },
          transaction: tx
        });
        
        // Create new assignments
        const assignments = selected_crew_ids.map(creator_id => ({
          project_id: id,
          crew_member_id: creator_id,
          status: 'selected',
          is_active: 1,
          crew_accept: 0
        }));
        await assigned_crew.bulkCreate(assignments, { transaction: tx });
        
      }

      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }

    res.status(constants.OK.code).json({
      success: true,
      message: is_draft ? 'Draft booking updated' : 'Booking updated successfully',
      data: {
        booking_id: booking.stream_project_booking_id,
        project_name: booking.project_name,
        guest_email: booking.guest_email,
        user_id: booking.user_id,
        event_date: booking.event_date,
        estimated_delivery_date: booking.estimated_delivery_date,
        event_location: formatLocationResponse(booking.event_location),
        budget: booking.budget,
        quote_id: booking.quote_id,
        is_draft: booking.is_draft === 1,
        updated_at: booking.updated_at,
        booking_days: Array.isArray(booking.booking_days)
          ? booking.booking_days.map((d) => ({
            event_date: d.event_date,
            start_time: normalizeTime(d.start_time),
            end_time: normalizeTime(d.end_time),
            duration_hours: d.duration_hours,
            time_zone: d.time_zone
          }))
          : []
      }
    });

  } catch (error) {
    console.error('Error updating guest booking:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to update guest booking',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get a guest booking by ID
 * GET /api/guest-bookings/:id
 * Params: id - booking ID
 * Headers: No authentication required
 */
exports.getGuestBookingById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Booking ID is required'
      });
    }

    const booking = await stream_project_booking.findOne({
      where: {
        stream_project_booking_id: id,
        is_active: 1
      }
    });

    if (!booking) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Guest booking not found'
      });
    }

    res.status(constants.OK.code).json({
      success: true,
      data: {
        booking_id: booking.stream_project_booking_id,
        project_name: booking.project_name,
        guest_email: booking.guest_email,
        description: booking.description,
        event_type: booking.event_type,
        event_date: booking.event_date,
        estimated_delivery_date: booking.estimated_delivery_date,
        duration_hours: booking.duration_hours,
        start_time: booking.start_time,
        end_time: booking.end_time,
        budget: booking.budget,
        expected_viewers: booking.expected_viewers,
        stream_quality: booking.stream_quality,
        crew_size_needed: booking.crew_size_needed,
        event_location: formatLocationResponse(booking.event_location),
        streaming_platforms: booking.streaming_platforms,
        crew_roles: booking.crew_roles,
        skills_needed: booking.skills_needed,
        equipments_needed: booking.equipments_needed,
        is_draft: booking.is_draft === 1,
        is_completed: booking.is_completed === 1,
        is_cancelled: booking.is_cancelled === 1,
        created_at: booking.created_at,
        updated_at: booking.updated_at
      }
    });

  } catch (error) {
    console.error('Error fetching guest booking:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch guest booking',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Assign creators to a guest booking
 * POST /api/guest-bookings/:id/assign-creators
 * Body: { creator_ids: [1, 2, 3] }
 * Headers: No authentication required
 */
exports.assignCreatorsToBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { creator_ids } = req.body;

    if (!id) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Booking ID is required'
      });
    }

    if (!creator_ids || !Array.isArray(creator_ids) || creator_ids.length === 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'creator_ids must be a non-empty array'
      });
    }

    // Verify booking exists
    const booking = await stream_project_booking.findOne({
      where: {
        stream_project_booking_id: id,
        is_active: 1
      }
    });

    if (!booking) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Verify all creators exist
    const creators = await crew_members.findAll({
      where: {
        crew_member_id: creator_ids
      }
    });

    if (creators.length !== creator_ids.length) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'One or more creator IDs are invalid'
      });
    }

    // Remove existing assignments for this booking (replace mode)
    await assigned_crew.destroy({
      where: {
        project_id: id
      }
    });

    // Create new assignments
    const assignments = creator_ids.map(creator_id => ({
      project_id: id,
      crew_member_id: creator_id,
      status: 'selected',
      is_active: 1,
      crew_accept: 0
    }));

    const createdAssignments = await assigned_crew.bulkCreate(assignments);

    res.status(constants.OK.code).json({
      success: true,
      message: 'Creators assigned successfully',
      data: {
        booking_id: id,
        assigned_creators: createdAssignments.map(a => ({
          assignment_id: a.id,
          creator_id: a.crew_member_id,
          status: a.status
        }))
      }
    });

  } catch (error) {
    console.error('Error assigning creators to booking:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to assign creators to booking',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get booking with assigned creators and payment details
 * GET /api/guest-bookings/:id/payment-details
 * Query: creator_id (optional) - if provided, will be assigned to booking
 * Headers: No authentication required
 */
// exports.getBookingPaymentDetails = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { creator_id } = req.query;

//     if (!id) {
//       return res.status(constants.BAD_REQUEST.code).json({
//         success: false,
//         message: 'Booking ID is required'
//       });
//     }

//     // Fetch booking with assigned creators
//     const booking = await stream_project_booking.findOne({
//       where: {
//         stream_project_booking_id: id,
//         is_active: 1
//       },
//       include: [
//         {
//           model: assigned_crew,
//           as: 'assigned_crews',
//           where: { is_active: 1 },
//           required: false,
//           include: [
//             {
//               model: crew_members,
//               as: 'crew_member',
//               attributes: [
//                 'crew_member_id',
//                 'first_name',
//                 'last_name',
//                 'email',
//                 'location',
//                 'hourly_rate',
//                 'rating',
//                 'bio',
//                 'years_of_experience',
//                 'primary_role'
//               ],
//               include: [
//                 {
//                   model: crew_member_files,
//                   as: 'crew_member_files',
//                   where: { file_type: 'profile_image' },
//                   required: false,
//                   attributes: ['file_path'],
//                   limit: 1
//                 }
//               ]
//             }
//           ]
//         },
//         {
//           model: quotes,
//           as: 'primary_quote',
//           required: false,
//           include: [
//             {
//               model: quote_line_items,
//               as: 'line_items',
//               required: false
//             }
//           ]
//         }
//       ]
//     });

//     if (!booking) {
//       return res.status(constants.NOT_FOUND.code).json({
//         success: false,
//         message: 'Booking not found'
//       });
//     }

//     // If creator_id is provided and not already assigned, assign it
//     let assignedCreators = booking.assigned_crews || [];
//     if (creator_id) {
//       const alreadyAssigned = assignedCreators.some(
//         ac => ac.crew_member_id === parseInt(creator_id)
//       );

//       if (!alreadyAssigned) {
//         // Verify creator exists
//         const creator = await crew_members.findByPk(creator_id);
//         if (creator) {
//           // Assign creator to booking
//           const newAssignment = await assigned_crew.create({
//             project_id: id,
//             crew_member_id: creator_id,
//             status: 'selected',
//             is_active: 1,
//             crew_accept: 0
//           });

//           // Add to response
//           assignedCreators.push({
//             ...newAssignment.toJSON(),
//             crew_member: creator
//           });
//         }
//       }
//     }

//     // Role mapping (same as creators controller)
//     const roleMap = {
//       1: 'Videographer',
//       2: 'Photographer',
//       3: 'Editor',
//       4: 'Producer',
//       5: 'Director',
//       6: 'Cinematographer'
//     };

//     // Format creators for response (flattened structure for frontend)
//     const creators = assignedCreators.map(ac => {
//       if (!ac.crew_member) return null;

//       const profileImage = ac.crew_member.crew_member_files && ac.crew_member.crew_member_files.length > 0
//         ? ac.crew_member.crew_member_files[0].file_path
//         : null;

//       return {
//         assignment_id: ac.id,
//         crew_member_id: ac.crew_member.crew_member_id,
//         name: `${ac.crew_member.first_name} ${ac.crew_member.last_name}`,
//         email: ac.crew_member.email,
//         location: ac.crew_member.location,
//         hourly_rate: parseFloat(ac.crew_member.hourly_rate || 0),
//         rating: parseFloat(ac.crew_member.rating || 0),
//         bio: ac.crew_member.bio,
//         years_of_experience: ac.crew_member.years_of_experience,
//         role_name: roleMap[ac.crew_member.primary_role] || 'Creative Professional',
//         profile_image: profileImage,
//         status: ac.status,
//         crew_accept: ac.crew_accept === 1
//       };
//     }).filter(c => c !== null);

//     res.status(constants.OK.code).json({
//       success: true,
//       data: {
//         booking: {
//           booking_id: booking.stream_project_booking_id,
//           project_name: booking.project_name,
//           shoot_name: booking.project_name, // Alias for frontend compatibility
//           guest_email: booking.guest_email,
//           description: booking.description,
//           event_type: booking.event_type,
//           event_date: booking.event_date,
//           duration_hours: booking.duration_hours,
//           start_time: booking.start_time,
//           end_time: booking.end_time,
//           budget: parseFloat(booking.budget || 0),
//           event_location: formatLocationResponse(booking.event_location),
//           is_draft: booking.is_draft === 1,
//           is_completed: booking.is_completed === 1,
//           payment_completed_at: booking.payment_completed_at,
//           created_at: booking.created_at
//         },
//         creators: creators,
//         quote: booking.primary_quote ? {
//           quote_id: booking.primary_quote.quote_id,
//           shoot_hours: parseFloat(booking.primary_quote.shoot_hours),
//           subtotal: parseFloat(booking.primary_quote.subtotal),
//           discountPercent: 0, // Remove discount display
//           discountAmount: 0, // Remove discount display
//           price_after_discount: parseFloat(booking.primary_quote.subtotal), // Use subtotal
//           marginPercent: 0, // Remove margin display
//           marginAmount: 0, // Remove margin display
//           total: parseFloat(
//             booking.primary_quote.total ??
//             booking.primary_quote.price_after_discount ??
//             booking.primary_quote.subtotal
//           ),
//           status: booking.primary_quote.status,
//           lineItems: (booking.primary_quote.line_items || []).map(item => ({
//             item_id: item.item_id,
//             item_name: item.item_name,
//             quantity: item.quantity,
//             rate: item.rate == null ? null : parseFloat(item.rate),
//             rate_type: item.rate_type,
//             line_total: parseFloat(item.line_total || 0)
//           }))
//         } : null,
//         payment_status: booking.payment_id ? 'completed' : 'pending'
//       }
//     });

//   } catch (error) {
//     console.error('Error fetching booking payment details:', error);
//     console.error('Error stack:', error.stack);
//     console.error('Error name:', error.name);
//     console.error('Error message:', error.message);
//     res.status(constants.INTERNAL_SERVER_ERROR.code).json({
//       success: false,
//       message: 'Failed to fetch booking payment details',
//       error: error.message,
//       stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
//     });
//   }
// };


/**
 * Get booking with assigned creators and payment details
 * GET /api/guest-bookings/:id/payment-details
 * Query: creator_id (optional) - if provided, will be assigned to booking
 * Headers: No authentication required
 */
exports.getBookingPaymentDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { creator_id, referral_code } = req.query;

    if (!id) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Booking ID is required'
      });
    }

    // Fetch booking with assigned creators
    const booking = await stream_project_booking.findOne({
      where: {
        stream_project_booking_id: id,
        is_active: 1
      },
      include: [
        {
          model: assigned_crew,
          as: 'assigned_crews',
          where: { is_active: 1 },
          required: false,
          include: [
            {
              model: crew_members,
              as: 'crew_member',
              attributes: [
                'crew_member_id',
                'first_name',
                'last_name',
                'email',
                'location',
                'hourly_rate',
                'rating',
                'bio',
                'years_of_experience',
                'primary_role'
              ],
              include: [
                {
                  model: crew_member_files,
                  as: 'crew_member_files',
                  where: { file_type: 'profile_photo' },
                  required: false,
                  attributes: ['file_path'],
                  limit: 1
                }
              ]
            }
          ]
        },
        {
          model: quotes,
          as: 'primary_quote',
          required: false,
          include: [
            {
              model: quote_line_items,
              as: 'line_items',
              required: false
            },
            {
              model: discount_codes,
              as: 'discount_code',
              required: false,
              attributes: ['code']
            }
          ]
        },
        {
          model: stream_project_booking_days,
          as: 'booking_days',
          required: false
        }
      ]
    });

    if (!booking) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Logic for creator assignment (keeping your existing code)
    let assignedCreators = booking.assigned_crews || [];
    if (creator_id) {
      const alreadyAssigned = assignedCreators.some(
        ac => ac.crew_member_id === parseInt(creator_id)
      );

      if (!alreadyAssigned) {
        const creator = await crew_members.findByPk(creator_id);
        if (creator) {
          const newAssignment = await assigned_crew.create({
            project_id: id,
            crew_member_id: creator_id,
            status: 'selected',
            is_active: 1,
            crew_accept: 0
          });
          assignedCreators.push({
            ...newAssignment.toJSON(),
            crew_member: creator
          });
        }
      }
    }

    const roleMap = { 1: 'Videographer', 2: 'Photographer', 3: 'Editor', 4: 'Producer', 5: 'Director', 6: 'Cinematographer' };

    const creators = assignedCreators.map(ac => {
      if (!ac.crew_member) return null;
      const profileImage = ac.crew_member.crew_member_files && ac.crew_member.crew_member_files.length > 0
        ? ac.crew_member.crew_member_files[0].file_path : null;
      return {
        assignment_id: ac.id,
        crew_member_id: ac.crew_member.crew_member_id,
        name: `${ac.crew_member.first_name} ${ac.crew_member.last_name}`,
        email: ac.crew_member.email,
        location: ac.crew_member.location,
        hourly_rate: parseFloat(ac.crew_member.hourly_rate || 0),
        rating: parseFloat(ac.crew_member.rating || 0),
        bio: ac.crew_member.bio,
        years_of_experience: ac.crew_member.years_of_experience,
        role_name: roleMap[ac.crew_member.primary_role] || 'Creative Professional',
        profile_image: profileImage,
        status: ac.status,
        crew_accept: ac.crew_accept === 1
      };
    }).filter(c => c !== null);

    let quoteResponse = null;
    if (booking.primary_quote) {
      const baseSubtotal = parseFloat(booking.primary_quote.subtotal || 0);
      const baseDiscountAmount = parseFloat(booking.primary_quote.discount_amount || 0);
      const basePriceAfterDiscount = parseFloat(booking.primary_quote.price_after_discount || booking.primary_quote.subtotal || 0);
      const baseTaxRate = parseFloat(booking.primary_quote.tax_rate || 0);
      const baseTaxAmount = parseFloat(booking.primary_quote.tax_amount || 0);
      const baseTotal = parseFloat(booking.primary_quote.total || booking.primary_quote.subtotal || 0);

      let normalizedReferralCode = null;
      let referralAffiliateName = null;
      let referralDiscountAmount = 0;
      let referralDiscountPercent = 0;

      if (referral_code) {
        const candidateCode = String(referral_code).trim().toUpperCase();
        if (candidateCode.length < 4) {
          return res.status(constants.BAD_REQUEST.code).json({
            success: false,
            message: 'Invalid referral code format'
          });
        }

        const referralAffiliate = await db.affiliates.findOne({
          where: {
            referral_code: candidateCode,
            status: 'active'
          },
          include: [{
            model: db.users,
            as: 'user',
            attributes: ['name']
          }]
        });

        if (!referralAffiliate) {
          return res.status(constants.BAD_REQUEST.code).json({
            success: false,
            message: 'Invalid referral code'
          });
        }

        if (booking.user_id && Number(referralAffiliate.user_id) === Number(booking.user_id)) {
          return res.status(constants.BAD_REQUEST.code).json({
            success: false,
            message: 'You cannot use your own referral code'
          });
        }

        normalizedReferralCode = referralAffiliate.referral_code;
        referralAffiliateName = referralAffiliate.user?.name || null;
        referralDiscountPercent = REFERRAL_DISCOUNT_PERCENT;
        referralDiscountAmount = parseFloat((baseTotal * (REFERRAL_DISCOUNT_PERCENT / 100)).toFixed(2));
      }

      const finalTotal = parseFloat((baseTotal - referralDiscountAmount).toFixed(2));
      const finalPriceAfterDiscount = parseFloat((basePriceAfterDiscount - referralDiscountAmount).toFixed(2));

      quoteResponse = {
        quote_id: booking.primary_quote.quote_id,
        shoot_hours: parseFloat(booking.primary_quote.shoot_hours),
        subtotal: baseSubtotal,
        applied_discount_code: booking.primary_quote.discount_code ? booking.primary_quote.discount_code.code : null,
        applied_referral_code: normalizedReferralCode,
        referral_affiliate_name: referralAffiliateName,
        discount_total: baseDiscountAmount,
        discount_percentage: parseFloat(booking.primary_quote.discount_percent || 0),
        referral_discount_percent: referralDiscountPercent,
        referral_discount_amount: referralDiscountAmount,
        discountPercent: parseFloat(booking.primary_quote.discount_percent || 0),
        discountAmount: baseDiscountAmount,
        total_discount_with_referral: parseFloat((baseDiscountAmount + referralDiscountAmount).toFixed(2)),
        price_after_discount: finalPriceAfterDiscount,
        tax_type: booking.primary_quote.tax_type || null,
        tax_rate: baseTaxRate,
        tax_amount: baseTaxAmount,
        marginPercent: parseFloat(booking.primary_quote.margin_percent || 0),
        marginAmount: parseFloat(booking.primary_quote.margin_amount || 0),
        total_before_referral_discount: baseTotal,
        total: finalTotal,
        status: booking.primary_quote.status,
        lineItems: (booking.primary_quote.line_items || []).map(item => ({
          item_id: item.item_id,
          item_name: item.item_name,
          quantity: item.quantity,
          rate: parseFloat(item.rate),
          rate_type: item.rate_type,
          line_total: parseFloat(item.line_total)
        }))
      };
    }

    res.status(constants.OK.code).json({
      success: true,
      data: {
        booking: {
          booking_id: booking.stream_project_booking_id,
          project_name: booking.project_name,
          shoot_name: booking.project_name,
          guest_email: booking.guest_email,
          description: booking.description,
          event_type: booking.event_type,
          event_date: booking.event_date,
          estimated_delivery_date: booking.estimated_delivery_date,
          duration_hours: booking.duration_hours,
          start_time: booking.start_time,
          end_time: booking.end_time,
          budget: parseFloat(booking.budget || 0),
          event_location: formatLocationResponse(booking.event_location),
          is_draft: booking.is_draft === 1,
          is_completed: booking.is_completed === 1,
          payment_completed_at: booking.payment_completed_at,
          created_at: booking.created_at,
          booking_days: Array.isArray(booking.booking_days)
            ? booking.booking_days.map((d) => ({
              event_date: d.event_date,
              start_time: normalizeTime(d.start_time),
              end_time: normalizeTime(d.end_time),
              duration_hours: d.duration_hours,
              time_zone: d.time_zone
            }))
            : []
        },
        creators: creators,
        quote: quoteResponse,
        payment_status: booking.payment_id ? 'completed' : 'pending'
      }
    });

  } catch (error) {
    console.error('Error fetching booking payment details:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch booking payment details',
      error: error.message
    });
  }
};
