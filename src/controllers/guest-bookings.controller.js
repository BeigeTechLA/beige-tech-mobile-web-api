const db = require('../models');
const { stream_project_booking, assigned_crew, crew_members, quotes, quote_line_items } = require('../models');
const constants = require('../utils/constants');
const { formatLocationResponse } = require('../utils/locationHelpers');
const { appendBookingToSheet } = require('../utils/googleSheetsService');

/**
 * Create a new guest booking (no authentication required)
 * POST /api/guest-bookings/create
 * Body: booking data from frontend modal + guest_email
 * Headers: No authentication required
 */
exports.createGuestBooking = async (req, res) => {
  try {
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
      quote_id
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
      // If location is already stringified JSON, keep as-is for storage
      // If it's an object, stringify it
      if (typeof location === 'object') {
        normalizedLocation = JSON.stringify(location);
      }
      // Plain strings are kept as-is for backward compatibility
    }

    // Prepare booking data mapping frontend fields to database fields
    // Note: user_id is NULL for guest bookings, guest_email is used instead
    const bookingData = {
      user_id: null, // Guest bookings have no user_id
      quote_id: quote_id || null, // Link to pricing quote if provided
      guest_email: guest_email, // Store guest email for contact
      project_name: order_name,
      description: description || null,
      event_type: event_type || content_type || project_type || null,
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

    // Create guest booking with email stored in database
    const booking = await stream_project_booking.create(bookingData);

    // Sync booking to Google Sheets (async, non-blocking)
    appendBookingToSheet({
      stream_project_booking_id: booking.stream_project_booking_id,
      project_name: booking.project_name,
      guest_email: guest_email,
      event_type: booking.event_type,
      event_date: booking.event_date,
      event_location: booking.event_location,
      budget: booking.budget,
      crew_size_needed: booking.crew_size_needed,
      skills_needed: booking.skills_needed,
      description: booking.description,
      is_draft: booking.is_draft === 1,
    }).catch(err => {
      console.error('Google Sheets sync failed (non-critical):', err.message);
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
                'years_of_experience'
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

    // Format creators for response
    const creators = assignedCreators.map(ac => ({
      assignment_id: ac.id,
      creator_id: ac.crew_member_id,
      status: ac.status,
      crew_accept: ac.crew_accept === 1,
      details: ac.crew_member ? {
        crew_member_id: ac.crew_member.crew_member_id,
        name: `${ac.crew_member.first_name} ${ac.crew_member.last_name}`,
        email: ac.crew_member.email,
        location: ac.crew_member.location,
        hourly_rate: parseFloat(ac.crew_member.hourly_rate || 0),
        rating: parseFloat(ac.crew_member.rating || 0),
        bio: ac.crew_member.bio,
        years_of_experience: ac.crew_member.years_of_experience
      } : null
    }));

    res.status(constants.OK.code).json({
      success: true,
      data: {
        booking: {
          booking_id: booking.stream_project_booking_id,
          project_name: booking.project_name,
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
          discount_amount: parseFloat(booking.primary_quote.discount_amount),
          price_after_discount: parseFloat(booking.primary_quote.price_after_discount),
          margin_amount: parseFloat(booking.primary_quote.margin_amount),
          total: parseFloat(booking.primary_quote.total),
          status: booking.primary_quote.status,
          line_items: booking.primary_quote.line_items || []
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
