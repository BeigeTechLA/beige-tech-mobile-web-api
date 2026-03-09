const { stream_project_booking, assigned_crew, crew_members, crew_member_files } = require('../models');
const { Op } = require('sequelize');
const constants = require('../utils/constants');
const { Sequelize } = require('sequelize');
const { parseLocation, formatLocationResponse } = require('../utils/locationHelpers');

/**
 * Create a new booking
 * POST /api/bookings/create
 * Body: booking data from frontend modal
 * Headers: Authorization required
 */
exports.createBooking = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(constants.UNAUTHORIZED.code).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const {
      order_name,
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
    const bookingData = {
      user_id: userId, // Link booking to authenticated user
      quote_id: quote_id || null, // Link to pricing quote if provided
      guest_email: null, // Authenticated bookings don't use guest_email
      project_name: order_name,
      description: description || null,
      content_type: content_type || null,
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

    // Create booking
    const booking = await stream_project_booking.create(bookingData);

    res.status(constants.CREATED.code).json({
      success: true,
      message: is_draft ? 'Draft booking saved successfully' : 'Booking created successfully',
      data: {
        booking_id: booking.stream_project_booking_id,
        project_name: booking.project_name,
        event_date: booking.event_date,
        event_location: formatLocationResponse(booking.event_location),
        budget: booking.budget,
        is_draft: booking.is_draft === 1,
        created_at: booking.created_at
      }
    });

  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to create booking',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get single booking by ID
 * GET /api/bookings/:id
 * Headers: Authorization required
 */
exports.getBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(constants.UNAUTHORIZED.code).json({
        success: false,
        message: 'User authentication required'
      });
    }

    // Fetch booking with assigned crew members
    const booking = await stream_project_booking.findOne({
      where: {
        stream_project_booking_id: id,
        is_active: 1
      },
      include: [
        {
          model: assigned_crew,
          as: 'assigned_crews',
          required: false,
          where: { is_active: 1 },
          include: [
            {
              model: crew_members,
              as: 'crew_member',
              attributes: ['crew_member_id', 'first_name', 'last_name', 'email', 'phone_number', 'primary_role', 'hourly_rate', 'rating'],
              required: false,
              include: [
                {
                  model: crew_member_files,
                  as: 'crew_member_files',
                  attributes: ['crew_files_id', 'file_type', 'file_path'],
                  required: false
                }
              ]
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

    const bookingData = booking.toJSON();

    // Parse JSON fields
    let streaming_platforms = [];
    let crew_roles = [];
    let skills_needed = null;
    let equipments_needed = null;

    try {
      streaming_platforms = bookingData.streaming_platforms
        ? JSON.parse(bookingData.streaming_platforms)
        : [];
    } catch (e) {
      streaming_platforms = bookingData.streaming_platforms || [];
    }

    try {
      crew_roles = bookingData.crew_roles
        ? JSON.parse(bookingData.crew_roles)
        : [];
    } catch (e) {
      crew_roles = bookingData.crew_roles || [];
    }

    try {
      skills_needed = bookingData.skills_needed
        ? JSON.parse(bookingData.skills_needed)
        : null;
    } catch (e) {
      skills_needed = bookingData.skills_needed;
    }

    try {
      equipments_needed = bookingData.equipments_needed
        ? JSON.parse(bookingData.equipments_needed)
        : null;
    } catch (e) {
      equipments_needed = bookingData.equipments_needed;
    }

    // Transform assigned crew data
    const assignedCreators = bookingData.assigned_crews?.map(ac => {
      const crewMember = ac.crew_member;
      if (!crewMember) return null;

      const profileImage = crewMember.crew_member_files?.find(f => f.file_type === 'profile_image')
        || crewMember.crew_member_files?.find(f => f.file_type.includes('image'))
        || null;

      return {
        assignment_id: ac.id,
        crew_member_id: crewMember.crew_member_id,
        name: `${crewMember.first_name} ${crewMember.last_name}`,
        email: crewMember.email,
        phone: crewMember.phone_number,
        role: crewMember.primary_role,
        hourly_rate: parseFloat(crewMember.hourly_rate || 0),
        rating: parseFloat(crewMember.rating || 0),
        image: profileImage ? profileImage.file_path : null,
        status: ac.status,
        assigned_date: ac.assigned_date
      };
    }).filter(Boolean) || [];

    // Format response
    const response = {
      booking_id: bookingData.stream_project_booking_id,
      project_name: bookingData.project_name,
      description: bookingData.description,
      event_type: bookingData.event_type,
      event_date: bookingData.event_date,
      start_time: bookingData.start_time,
      end_time: bookingData.end_time,
      duration_hours: bookingData.duration_hours,
      event_location: formatLocationResponse(bookingData.event_location),
      budget: parseFloat(bookingData.budget || 0),
      expected_viewers: bookingData.expected_viewers,
      stream_quality: bookingData.stream_quality,
      crew_size_needed: bookingData.crew_size_needed,
      streaming_platforms: streaming_platforms,
      crew_roles: crew_roles,
      skills_needed: skills_needed,
      equipments_needed: equipments_needed,
      assigned_creators: assignedCreators,
      is_draft: bookingData.is_draft === 1,
      is_completed: bookingData.is_completed === 1,
      is_cancelled: bookingData.is_cancelled === 1,
      created_at: bookingData.created_at
    };

    res.json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch booking',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get user's bookings with pagination
 * GET /api/bookings
 * Query params: page, limit, status (draft/active/completed/cancelled)
 * Headers: Authorization required
 */
exports.getUserBookings = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(constants.UNAUTHORIZED.code).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const {
      page = 1,
      limit = 10,
      status
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build where clause
    const whereClause = {
      is_active: 1
    };

    // Filter by status
    if (status === 'draft') {
      whereClause.is_draft = 1;
    } else if (status === 'completed') {
      whereClause.is_completed = 1;
      whereClause.is_draft = 0;
    } else if (status === 'cancelled') {
      whereClause.is_cancelled = 1;
    } else if (status === 'active') {
      whereClause.is_draft = 0;
      whereClause.is_completed = 0;
      whereClause.is_cancelled = 0;
    }

    // Fetch bookings
    const { count, rows: bookings } = await stream_project_booking.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: assigned_crew,
          as: 'assigned_crews',
          required: false,
          where: { is_active: 1 },
          attributes: ['id', 'status', 'assigned_date']
        }
      ],
      attributes: [
        'stream_project_booking_id',
        'project_name',
        'description',
        'event_type',
        'event_date',
        'start_time',
        'event_location',
        'budget',
        'crew_size_needed',
        'is_draft',
        'is_completed',
        'is_cancelled',
        'created_at'
      ],
      limit: parseInt(limit),
      offset: offset,
      order: [['created_at', 'DESC']]
    });

    // Transform bookings data
    const transformedBookings = bookings.map(booking => {
      const bookingData = booking.toJSON();

      return {
        booking_id: bookingData.stream_project_booking_id,
        project_name: bookingData.project_name,
        description: bookingData.description,
        event_type: bookingData.event_type,
        event_date: bookingData.event_date,
        start_time: bookingData.start_time,
        event_location: formatLocationResponse(bookingData.event_location),
        budget: parseFloat(bookingData.budget || 0),
        crew_size_needed: bookingData.crew_size_needed,
        assigned_crew_count: bookingData.assigned_crews?.length || 0,
        is_draft: bookingData.is_draft === 1,
        is_completed: bookingData.is_completed === 1,
        is_cancelled: bookingData.is_cancelled === 1,
        created_at: bookingData.created_at
      };
    });

    res.json({
      success: true,
      data: {
        bookings: transformedBookings,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Error fetching user bookings:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch bookings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update booking
 * PUT /api/bookings/:id
 * Body: fields to update
 * Headers: Authorization required
 */
exports.updateBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(constants.UNAUTHORIZED.code).json({
        success: false,
        message: 'User authentication required'
      });
    }

    // Check if booking exists
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

    const {
      order_name,
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
      is_completed,
      is_cancelled
    } = req.body;

    // Prepare update data (only include fields that are provided)
    const updateData = {};

    if (order_name !== undefined) updateData.project_name = order_name;
    if (description !== undefined) updateData.description = description;
    if (content_type !== undefined) updateData.content_type = content_type;
    if (event_type !== undefined) updateData.event_type = event_type;
    if (content_type !== undefined && !event_type) updateData.event_type = content_type;
    if (project_type !== undefined && !event_type && !content_type) updateData.event_type = project_type;
    if (duration_hours !== undefined) updateData.duration_hours = parseInt(duration_hours);
    if (end_time !== undefined) updateData.end_time = end_time;
    if (expected_viewers !== undefined) updateData.expected_viewers = parseInt(expected_viewers);
    if (stream_quality !== undefined) updateData.stream_quality = stream_quality;
    if (crew_size !== undefined) updateData.crew_size_needed = parseInt(crew_size);
    if (location !== undefined) {
      // Normalize location format (support Mapbox JSON and plain strings)
      if (typeof location === 'object') {
        updateData.event_location = JSON.stringify(location);
      } else {
        updateData.event_location = location;
      }
    }
    if (is_draft !== undefined) updateData.is_draft = is_draft ? 1 : 0;
    if (is_completed !== undefined) updateData.is_completed = is_completed ? 1 : 0;
    if (is_cancelled !== undefined) updateData.is_cancelled = is_cancelled ? 1 : 0;

    // Handle date/time updates
    if (start_date_time) {
      try {
        const dateObj = new Date(start_date_time);
        updateData.event_date = dateObj.toISOString().split('T')[0];
        updateData.start_time = dateObj.toTimeString().split(' ')[0];
      } catch (error) {
        console.error('Error parsing start_date_time:', error);
      }
    }

    // Handle budget updates
    if (budget_max !== undefined || budget_min !== undefined) {
      if (budget_max) {
        updateData.budget = budget_max;
      } else if (budget_min && budget_max) {
        updateData.budget = (parseFloat(budget_min) + parseFloat(budget_max)) / 2;
      } else if (budget_min) {
        updateData.budget = budget_min;
      }
    }

    // Handle JSON fields
    if (streaming_platforms !== undefined) {
      updateData.streaming_platforms = typeof streaming_platforms === 'string'
        ? streaming_platforms
        : JSON.stringify(streaming_platforms);
    }

    if (crew_roles !== undefined) {
      updateData.crew_roles = typeof crew_roles === 'string'
        ? crew_roles
        : JSON.stringify(crew_roles);
    }

    if (skills_needed !== undefined) {
      updateData.skills_needed = typeof skills_needed === 'string'
        ? skills_needed
        : JSON.stringify(skills_needed);
    }

    if (equipments_needed !== undefined) {
      updateData.equipments_needed = typeof equipments_needed === 'string'
        ? equipments_needed
        : JSON.stringify(equipments_needed);
    }

    // Update booking
    await booking.update(updateData);

    // Fetch updated booking
    const updatedBooking = await stream_project_booking.findOne({
      where: { stream_project_booking_id: id }
    });

    res.json({
      success: true,
      message: 'Booking updated successfully',
      data: {
        booking_id: updatedBooking.stream_project_booking_id,
        project_name: updatedBooking.project_name,
        event_date: updatedBooking.event_date,
        event_location: formatLocationResponse(updatedBooking.event_location),
        budget: parseFloat(updatedBooking.budget || 0),
        is_draft: updatedBooking.is_draft === 1,
        is_completed: updatedBooking.is_completed === 1,
        is_cancelled: updatedBooking.is_cancelled === 1,
        created_at: updatedBooking.created_at
      }
    });

  } catch (error) {
    console.error('Error updating booking:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to update booking',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.getBookings = async (req, res) => {
  try {
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: "user_id is required",
      });
    }

    const { page = 1, limit = 10, status } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const whereClause = {
      is_active: 1,
      user_id: user_id,
    };

    // Status filter
    if (status === "draft") {
      whereClause.is_draft = 1;
    } else if (status === "completed") {
      whereClause.is_completed = 1;
      whereClause.is_draft = 0;
    } else if (status === "cancelled") {
      whereClause.is_cancelled = 1;
    } else if (status === "active") {
      whereClause.is_draft = 0;
      whereClause.is_completed = 0;
      whereClause.is_cancelled = 0;
    }

    const { count, rows: bookings } =
      await stream_project_booking.findAndCountAll({
        where: whereClause,
        distinct: true,
        include: [
          {
            model: assigned_crew,
            as: "assigned_crews",
            required: false,
            where: { is_active: 1 },
            attributes: [
              "id",
              "project_id",
              "crew_member_id",
              "status",
              "assigned_date",
              "crew_accept",
            ],
            include: [
              {
                model: crew_members,
                as: "crew_member",
                attributes: [
                  [
                    Sequelize.literal(
                      "CONCAT(`assigned_crews->crew_member`.`first_name`, ' ', `assigned_crews->crew_member`.`last_name`)"
                    ),
                    "crew_member_name",
                  ],
                ],
              },
            ],
          },
        ],

        attributes: [
          "stream_project_booking_id",
          "user_id",
          "project_name",
          "description",
          "event_type",
          "event_date",
          "start_time",
          "event_location",
          "budget",
          "crew_size_needed",
          "is_draft",
          "is_completed",
          "is_cancelled",
          "created_at",
        ],
        limit: parseInt(limit),
        offset,
        order: [["created_at", "DESC"]],
      });

    const transformedBookings = bookings.map((b) => {
      const booking = b.toJSON();

      return {
        booking_id: booking.stream_project_booking_id,
        user_id: booking.user_id,
        project_name: booking.project_name,
        description: booking.description,
        event_type: booking.event_type,
        event_date: booking.event_date,
        start_time: booking.start_time,
        event_location: formatLocationResponse(booking.event_location),
        budget: parseFloat(booking.budget || 0),
        crew_size_needed: booking.crew_size_needed,
        assigned_crew_count: booking.assigned_crews?.length || 0,
        assigned_crews: booking.assigned_crews || [],
        is_draft: booking.is_draft === 1,
        is_completed: booking.is_completed === 1,
        is_cancelled: booking.is_cancelled === 1,
        created_at: booking.created_at,
      };
    });

    return res.json({
      success: true,
      data: {
        bookings: transformedBookings,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching bookings:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch bookings",
    });
  }
};
