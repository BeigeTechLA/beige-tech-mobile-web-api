const { sales_leads, sales_lead_activities, stream_project_booking, users, discount_codes, payment_links,  quotes,
  quote_line_items } = require('../models');
const { Op, Sequelize } = require('sequelize');
const constants = require('../utils/constants');
const leadAssignmentService = require('../services/lead-assignment.service');
const { appendToSheet, updateSheetRow } = require('../utils/googleSheets');


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



exports.trackEarlyBookingInterest = async (req, res) => {
  try {
    const { guest_email, user_id, content_type, shoot_type, client_name } = req.body;

    // 1. Validate required fields
    if (!guest_email) {
      return res.status(constants.BAD_REQUEST.code).json({ success: false, message: 'Email is required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(guest_email)) {
      return res.status(constants.BAD_REQUEST.code).json({ success: false, message: 'Invalid email format' });
    }

    // 2. Create minimal draft booking
    const bookingData = {
      user_id: user_id ? parseInt(user_id) : null,
      guest_email: guest_email,
      project_name: `Draft - ${shoot_type || content_type || 'Booking'}`,
      event_type: shoot_type || content_type || 'general',
      streaming_platforms: JSON.stringify([]),
      crew_roles: JSON.stringify([]),
      is_draft: 1,
      is_completed: 0,
      is_cancelled: 0,
      is_active: 1
    };

    const booking = await stream_project_booking.create(bookingData);

    // 3. Check if lead already exists
    const existingLead = await sales_leads.findOne({
      where: { guest_email, lead_status: 'in_progress_self_serve' },
      order: [['created_at', 'DESC']]
    });

    if (existingLead) {
      await existingLead.update({
        booking_id: booking.stream_project_booking_id,
        last_activity_at: new Date()
      });

      // --- FIX: USE UPDATE LOGIC INSTEAD OF APPEND ---
      // We send the Lead ID (existingLead.lead_id) as the key to find and update the existing row
      updateSheetRow('leads_data', existingLead.lead_id, [
        existingLead.lead_id,                 // A: Lead ID (Key)
        booking.stream_project_booking_id,    // B: Booking ID
        user_id || 'Guest',                   // C: User ID
        client_name || 'N/A',                 // D: Client Name
        guest_email,                          // E: Email
        booking.project_name,                 // F: Project Name
        content_type || 'N/A',                // G: Content Type
        shoot_type || 'N/A',                  // H: Shoot Type
        existingLead.lead_type,               // I: Lead Type
        'Interaction Updated',                // J: Status
        '',                                   // K: (Keep Rep Same)
        'Yes',                                // L: Is Draft
        new Date().toLocaleString()           // M: Timestamp (Updates in same row)
      ]).catch(err => console.error('Sheet Update Error:', err.message));

      return res.json({
        success: true,
        message: 'Lead tracking updated',
        data: { lead_id: existingLead.lead_id, booking_id: booking.stream_project_booking_id, is_new: false }
      });
    }

    // 4. Create new lead
    const lead = await sales_leads.create({
      booking_id: booking.stream_project_booking_id,
      user_id: user_id || null,
      guest_email: guest_email,
      client_name: client_name || null,
      lead_type: 'self_serve',
      lead_status: 'in_progress_self_serve'
    });

    // 5. Log activity
    await sales_lead_activities.create({
      lead_id: lead.lead_id,
      activity_type: 'created',
      activity_data: { source: 'early_interest', user_id, guest_email, content_type, shoot_type }
    });

    // 6. Auto-assign lead
    const assignedRep = await leadAssignmentService.autoAssignLead(lead.lead_id);

    // 7. --- FIX: ONLY STORE NAME AND APPEND NEW ROW ---
    appendToSheet('leads_data', [
      lead.lead_id,                         // A: Lead ID
      booking.stream_project_booking_id,    // B: Booking ID
      user_id || 'Guest',                   // C: User ID
      client_name || 'N/A',                 // D: Client Name
      guest_email,                          // E: Email
      booking.project_name,                 // F: Project Name
      content_type || 'N/A',                // G: Content Type
      shoot_type || 'N/A',                  // H: Shoot Type
      lead.lead_type,                       // I: Lead Type
      lead.lead_status,                     // J: Status
      assignedRep ? assignedRep.name : 'Pending', // <--- FIX: Access .name only
      booking.is_draft === 1 ? 'Yes' : 'No',// L: Is Draft
      new Date().toLocaleString()           // M: Timestamp
    ]).catch(err => console.error('Sheet Sync Error:', err.message));

    res.status(constants.CREATED.code).json({
      success: true,
      message: 'Lead tracking started',
      data: { lead_id: lead.lead_id, booking_id: booking.stream_project_booking_id, is_new: true, assigned_to: assignedRep }
    });

  } catch (error) {
    console.error('Error tracking early booking interest:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to track booking interest'
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

exports.getLeads = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      lead_type,
      assigned_to,
      search,
      range,
      start_date,
      end_date
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const whereClause = { [Op.and]: [] };

    if (start_date && end_date) {
      whereClause.created_at = {
        [Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`]
      };
    } else if (range === 'month') {
      whereClause[Op.and].push(
        Sequelize.where(Sequelize.fn('MONTH', Sequelize.col('sales_leads.created_at')), Sequelize.fn('MONTH', Sequelize.fn('CURDATE'))),
        Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('sales_leads.created_at')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
      );
    } else if (range === 'week') {
      whereClause[Op.and].push(
        Sequelize.where(Sequelize.fn('YEARWEEK', Sequelize.col('sales_leads.created_at'), 1), Sequelize.fn('YEARWEEK', Sequelize.fn('CURDATE'), 1))
      );
    } else if (range === 'year') {
      whereClause[Op.and].push(
        Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('sales_leads.created_at')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
      );
    }

    // Status & Type
    if (status) whereClause.lead_status = status;
    if (lead_type) whereClause.lead_type = lead_type;

    // Assignment Logic
    if (assigned_to) {
      if (assigned_to === 'unassigned') {
        whereClause.assigned_sales_rep_id = null;
      } else {
        whereClause.assigned_sales_rep_id = parseInt(assigned_to);
      }
    }

    if (search) {
      whereClause[Op.and].push({
        [Op.or]: [
          { client_name: { [Op.like]: `%${search}%` } },
          { guest_email: { [Op.like]: `%${search}%` } }
        ]
      });
    }

    // Fetch leads
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
          attributes: ['stream_project_booking_id', 'project_name', 'event_date', 'event_type', 'budget']
        }
      ],
      limit: parseInt(limit),
      offset: offset,
      order: [
        ['created_at', 'DESC'],
        ['lead_id', 'DESC'] 
      ] 
    });

    res.json({
      success: true,
      data: {
        leads: leads.map(lead => ({
          lead_id: lead.lead_id,
          client_name: lead.client_name,
          guest_email: lead.guest_email || lead.user?.email,
          lead_type: lead.lead_type,
          lead_status: lead.lead_status,
          assigned_sales_rep: lead.assigned_sales_rep,
          booking: lead.booking,
          last_activity_at: lead.last_activity_at,
          contacted_sales_at: lead.contacted_sales_at,
          created_at: lead.created_at
        })),
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leads',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get lead details by ID
 * GET /api/sales/leads/:id
 */
exports.getLeadById = async (req, res) => {
  try {
    const { id } = req.params;

    const lead = await sales_leads.findOne({
      where: { lead_id: id }, 
      include: [
        {
          model: users,
          as: 'assigned_sales_rep',
          attributes: ['id', 'name', 'email'],
          required: false
        },
        {
          model: stream_project_booking,
          as: 'booking',
          attributes: [
            'stream_project_booking_id', 
            'project_name', 
            'event_date', 
            'event_type', 
            'event_location',
            'duration_hours',
            'budget',
            'description'
          ],
          required: false
        },
        {
          model: discount_codes,
          as: 'discount_codes',
          required: false
        },
        {
          model: payment_links,
          as: 'payment_links',
          required: false
        },
        {
          model: sales_lead_activities,
          as: 'activities',
          required: false,
          include: [
            {
              model: users,
              as: 'performed_by',
              attributes: ['id', 'name'],
              required: false
            }
          ]
        },
        {
          model: users,
          as: 'user',
          attributes: ['phone_number'],
          required: false
        }
      ],
      order: [
        [{ model: sales_lead_activities, as: 'activities' }, 'created_at', 'DESC']
      ]
    });

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: `Lead with ID ${id} not found in the database.`
      });
    }

    res.json({
      success: true,
      data: lead
    });

  } catch (error) {
    console.error('Error fetching lead details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch lead details',
      error: error.message
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

exports.updateBookingCrew = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { crew_roles } = req.body;

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

    if (booking.is_completed === 1) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Cannot modify completed booking'
      });
    }

    // ONLY persist crew selection
    await booking.update({
      crew_roles: JSON.stringify(crew_roles)
    });

    return res.json({
      success: true,
      message: 'Crew roles saved',
      data: {
        booking_id: bookingId,
        crew_roles
      }
    });

  } catch (error) {
    console.error('Error updating booking crew:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to update crew details'
    });
  }
};

module.exports = exports;
