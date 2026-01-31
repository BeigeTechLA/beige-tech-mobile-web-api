const db = require('../models');
const { stream_project_booking, assigned_crew, crew_members, crew_member_files, quotes, quote_line_items } = require('../models');
const constants = require('../utils/constants');
const { formatLocationResponse } = require('../utils/locationHelpers');
const { appendBookingToSheet } = require('../utils/googleSheetsService');
const { appendToSheet, updateSheetRow } = require('../utils/googleSheets');
const { content } = require('googleapis/build/src/apis/content');


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
      selected_crew_ids
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

    // Parse date and time from start_date_time
    let event_date = null;
    let start_time = null;

    if (start_date_time) {
      try {
        const dateObj = new Date(start_date_time);
        event_date = dateObj.toISOString().split('T')[0];
        start_time = dateObj.toTimeString().split(' ')[0];
      } catch (error) {
        console.error('Error parsing start_date_time:', error);
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
      user_id: user_id ? parseInt(user_id) : null,
      quote_id: quote_id || null,
      guest_email: guest_email,
      project_name: order_name,
      description: combinedDescription || null,
      event_type: event_type || content_type || project_type || (shoot_type ? shoot_type : null),
      event_date: event_date,
      duration_hours: duration_hours ? parseInt(duration_hours) : null,
      start_time: start_time,
      end_time: end_time || null,
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

    const booking = await stream_project_booking.create(bookingData);

    // V3: Assign selected creators if provided
    if (selected_crew_ids && Array.isArray(selected_crew_ids) && selected_crew_ids.length > 0) {
        try {
            const assignments = selected_crew_ids.map(creator_id => ({
                project_id: booking.stream_project_booking_id,
                crew_member_id: creator_id,
                status: 'selected',
                is_active: 1,
                crew_accept: 0
            }));
            await assigned_crew.bulkCreate(assignments);
        } catch (assignError) {
            console.error("Error assigning V3 creators:", assignError);
        }
    }

    appendToSheet('Shoot_data', [
      booking.stream_project_booking_id,
      order_name,                    
      content_type || project_type || shoot_type || 'N/A',
      guest_email,                 
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
        guest_email: guest_email,
        event_date: booking.event_date,
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
      selected_crew_ids
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
      }
    });

    if (!booking) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Parse date and time from start_date_time
    let event_date = null;
    let start_time = null;

    if (start_date_time) {
      try {
        const dateObj = new Date(start_date_time);
        event_date = dateObj.toISOString().split('T')[0];
        start_time = dateObj.toTimeString().split(' ')[0];
      } catch (error) {
        console.error('Error parsing start_date_time:', error);
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
    if (guest_email) updateData.guest_email = guest_email;
    if (combinedDescription) updateData.description = combinedDescription;
    if (event_type || content_type || project_type || shoot_type) {
      updateData.event_type = event_type || content_type || project_type || shoot_type;
    }
    if (event_date) updateData.event_date = event_date;
    if (duration_hours) updateData.duration_hours = parseInt(duration_hours);
    if (start_time) updateData.start_time = start_time;
    if (end_time) updateData.end_time = end_time;
    if (budget) updateData.budget = budget;
    if (expected_viewers) updateData.expected_viewers = parseInt(expected_viewers);
    if (stream_quality) updateData.stream_quality = stream_quality;
    if (crew_size) updateData.crew_size_needed = parseInt(crew_size);
    if (normalizedLocation) updateData.event_location = normalizedLocation;
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

    // Update booking
    await booking.update(updateData);

    // V3: Update selected creators if provided
    if (selected_crew_ids && Array.isArray(selected_crew_ids) && selected_crew_ids.length > 0) {
      try {
        // Remove old assignments
        await assigned_crew.destroy({
          where: { project_id: id }
        });
        
        // Create new assignments
        const assignments = selected_crew_ids.map(creator_id => ({
          project_id: id,
          crew_member_id: creator_id,
          status: 'selected',
          is_active: 1,
          crew_accept: 0
        }));
        await assigned_crew.bulkCreate(assignments);
      } catch (assignError) {
        console.error("Error updating V3 creators:", assignError);
      }
    }

    res.status(constants.OK.code).json({
      success: true,
      message: is_draft ? 'Draft booking updated' : 'Booking updated successfully',
      data: {
        booking_id: booking.stream_project_booking_id,
        project_name: booking.project_name,
        guest_email: booking.guest_email,
        event_date: booking.event_date,
        event_location: formatLocationResponse(booking.event_location),
        budget: booking.budget,
        quote_id: booking.quote_id,
        is_draft: booking.is_draft === 1,
        updated_at: booking.updated_at
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
exports.getBookingPaymentDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { creator_id } = req.query;

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
                  where: { file_type: 'profile_image' },
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
            }
          ]
        }
      ]
    });

    if (!booking) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // If creator_id is provided and not already assigned, assign it
    let assignedCreators = booking.assigned_crews || [];
    if (creator_id) {
      const alreadyAssigned = assignedCreators.some(
        ac => ac.crew_member_id === parseInt(creator_id)
      );

      if (!alreadyAssigned) {
        // Verify creator exists
        const creator = await crew_members.findByPk(creator_id);
        if (creator) {
          // Assign creator to booking
          const newAssignment = await assigned_crew.create({
            project_id: id,
            crew_member_id: creator_id,
            status: 'selected',
            is_active: 1,
            crew_accept: 0
          });

          // Add to response
          assignedCreators.push({
            ...newAssignment.toJSON(),
            crew_member: creator
          });
        }
      }
    }

    // Role mapping (same as creators controller)
    const roleMap = {
      1: 'Videographer',
      2: 'Photographer',
      3: 'Editor',
      4: 'Producer',
      5: 'Director',
      6: 'Cinematographer'
    };

    // Format creators for response (flattened structure for frontend)
    const creators = assignedCreators.map(ac => {
      if (!ac.crew_member) return null;

      const profileImage = ac.crew_member.crew_member_files && ac.crew_member.crew_member_files.length > 0
        ? ac.crew_member.crew_member_files[0].file_path
        : null;

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

    res.status(constants.OK.code).json({
      success: true,
      data: {
        booking: {
          booking_id: booking.stream_project_booking_id,
          project_name: booking.project_name,
          shoot_name: booking.project_name, // Alias for frontend compatibility
          guest_email: booking.guest_email,
          description: booking.description,
          event_type: booking.event_type,
          event_date: booking.event_date,
          duration_hours: booking.duration_hours,
          start_time: booking.start_time,
          end_time: booking.end_time,
          budget: parseFloat(booking.budget || 0),
          event_location: formatLocationResponse(booking.event_location),
          is_draft: booking.is_draft === 1,
          is_completed: booking.is_completed === 1,
          payment_completed_at: booking.payment_completed_at,
          created_at: booking.created_at
        },
        creators: creators,
        quote: booking.primary_quote ? {
          quote_id: booking.primary_quote.quote_id,
          shoot_hours: parseFloat(booking.primary_quote.shoot_hours),
          subtotal: parseFloat(booking.primary_quote.subtotal),
          discountPercent: parseFloat(booking.primary_quote.discount_percent || 0),
          discountAmount: parseFloat(booking.primary_quote.discount_amount || 0),
          price_after_discount: parseFloat(booking.primary_quote.price_after_discount || booking.primary_quote.subtotal),
          marginPercent: parseFloat(booking.primary_quote.margin_percent || 0),
          marginAmount: parseFloat(booking.primary_quote.margin_amount || 0),
          total: parseFloat(booking.primary_quote.total || booking.primary_quote.subtotal),
          status: booking.primary_quote.status,
          lineItems: (booking.primary_quote.line_items || []).map(item => ({
            item_id: item.item_id,
            item_name: item.item_name,
            quantity: item.quantity,
            rate: parseFloat(item.rate),
            rate_type: item.rate_type,
            line_total: parseFloat(item.line_total)
          }))
        } : null,
        payment_status: booking.payment_id ? 'completed' : 'pending'
      }
    });

  } catch (error) {
    console.error('Error fetching booking payment details:', error);
    console.error('Error stack:', error.stack);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch booking payment details',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
