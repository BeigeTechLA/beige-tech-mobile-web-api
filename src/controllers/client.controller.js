const constants = require('../utils/constants');
const { Sequelize } = require('../models')
const multer = require('multer');
const path = require('path');
const common_model = require('../utils/common_model');
const { Op } = require('sequelize');
const { S3UploadFiles } = require('../utils/common.js');
const { sendTaskAssignmentEmail } = require('../utils/emailService');
const { stream_project_booking, crew_members, crew_member_files, tasks, equipment, crew_roles,
  equipment_accessories,
  equipment_category,
  equipment_documents,
  equipment_photos,
  equipment_specs,
  equipment_assignments,
  assignment_checklist,
  checklist_master,
  equipment_returns,
  equipment_return_checklist,
  equipment_return_issues,
  skills_master,
  certifications_master,
  assigned_crew,
  assigned_equipment,
  project_brief,
  event_type_master, payment_transactions, assigned_post_production_member, post_production_members } = require('../models');

function toArray(value) {
  if (!value) return [];

  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch (_) { }

  if (typeof value === "string") {
    return value
      .split(',')
      .map(v => v.trim())
      .filter(v => v !== "");
  }

  return [];
}

function toDbJson(value) {
  try {
    const arr = toArray(value);
    return JSON.stringify(arr);   // ✅ ALWAYS return STRING
  } catch (e) {
    return "[]";
  }
}

const toIdArray = (value) => {
  if (!value) return [];

  try {
    if (Array.isArray(value)) {
      return value.map(v => Number(v));
    }

    if (typeof value === "string" && value.trim().startsWith("[")) {
      return JSON.parse(value).map(v => Number(v));
    }

    if (typeof value === "string") {
      return value.split(",").map(v => Number(v.trim()));
    }

    // Fallback: single number
    return [Number(value)];

  } catch (err) {
    console.log("toIdArray Parse Error:", err);
    return [];
  }
};


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../public/uploads/media'));
  },
  filename: (req, file, cb) => {
    const filename = Date.now() + path.extname(file.originalname);
    cb(null, filename);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Only JPEG, PNG, and PDF are allowed.'));
    }
    cb(null, true);
  },
});

function uploadFiles(files) {
  const filePaths = [];
  if (files) {
    for (let fileKey in files) {
      const file = files[fileKey];
      filePaths.push({
        file_type: fileKey,
        file_path: `/uploads/${file[0].filename}`,
      });
    }
  }
  return filePaths;
}

exports.getClientDashboardSummary = async (req, res) => {
  try {
    // const { user_id } = req.body;
    const user_id = req.user.userId;

    if (!user_id) {
      return res.status(400).json({
        error: true,
        message: "user_id is required"
      });
    }

    const [
      total_shoots,
      active_shoots,
      completed_shoots,
    ] = await Promise.all([
      stream_project_booking.count({
        where: { user_id, is_active: 1 }
      }),

      stream_project_booking.count({
        where: { user_id, is_active: 1, is_completed: 0, is_cancelled: 0 }
      }),

      stream_project_booking.count({
        where: { user_id, is_active: 1, is_completed: 1 }
      })
    ]);

    return res.status(200).json({
      error: false,
      message: "Client dashboard summary fetched successfully",
      data: {
        total_shoots: { count: total_shoots, growth: 3 },
        active_shoots: { count: active_shoots, growth: 3 },
        completed_shoots: { count: completed_shoots, growth: 3 },
      }
    });
  } catch (error) {
    console.error("Get Client Dashboard Summary:", error);
    return res.status(500).json({
      error: true,
      message: "Internal server error"
    });
  }
};


exports.getShootByCategoryForUser = async (req, res) => {
  try {
    // const { user_id } = req.body;
    const user_id = req.user.userId;
    const activeTab = (req.query.tab || 'all').toLowerCase();

    const videoSkillIds = [1, 2, 3, 4, 11, 12, 13, 14, 17, 24, 29, 30, 31, 32, 33, 34, 35, 36];
    const photoSkillIds = [5, 6, 7, 8, 15, 16, 37];

    const categoryConfig = {
      corporate: { label: 'Corporate Events', color: '#3B82F6', matches: ['corporate', '4', '18'] },
      wedding: { label: 'Wedding', color: '#22C55E', matches: ['wedding', '19', '14', '15'] },
      private: { label: 'Private Events', color: '#8B5CF6', matches: ['private', '20'] },
      commercial: { label: 'Commercial & Advertising', color: '#F59E0B', matches: ['brand_product', '1', '2', '6', '21', '26'] },
      social: { label: 'Social Content', color: '#06B6D4', matches: ['social_content', '3', '5', '22'] },
      podcasts: { label: 'Podcasts & Shows', color: '#EC4899', matches: ['podcast', 'podcasts', '7', '23'] },
      music: { label: 'Music Videos', color: '#EF4444', matches: ['music', '24'] },
      narrative: { label: 'Short Films & Narrative', color: '#6366F1', matches: ['short_films', '25'] }
    };

    const bookings = await stream_project_booking.findAll({
      attributes: ['event_type', 'skills_needed', 'stream_project_booking_id'],
      where: { is_active: 1, user_id },
      raw: true
    });

    let grandTotal = 0;
    const finalResults = {};
    
    Object.keys(categoryConfig).forEach(key => {
      finalResults[key] = { label: categoryConfig[key].label, count: 0, color: categoryConfig[key].color };
    });

    bookings.forEach(booking => {
      const skills = String(booking.skills_needed || '').toLowerCase();
      const eventType = String(booking.event_type || '').toLowerCase();

      let includeInTab = false;
      
      if (activeTab === 'all') {
        includeInTab = true;
      } else {
        const isVideo = skills.includes('video') || videoSkillIds.some(id => skills.includes(String(id)));
        const isPhoto = skills.includes('photo') || photoSkillIds.some(id => skills.includes(String(id)));
        
        if (activeTab === 'videography' && isVideo) includeInTab = true;
        if (activeTab === 'photography' && isPhoto) includeInTab = true;
      }

      if (includeInTab) {
        for (const [key, config] of Object.entries(categoryConfig)) {
          if (config.matches.includes(eventType)) {
            finalResults[key].count += 1;
            grandTotal += 1;
            break;
          }
        }
      }
    });

    const data = Object.values(finalResults).map(item => ({
      label: item.label,
      count: item.count,
      percentage: grandTotal > 0 ? Math.round((item.count / grandTotal) * 100) : 0,
      color: item.color
    }));

    return res.status(200).json({
      error: false,
      message: `Stats for ${activeTab} fetched successfully for user ${user_id}`,
      data: {
        active_tab: activeTab,
        total_count: grandTotal,
        categories: data
      }
    });

  } catch (error) {
    console.error('Shoot By Category Error for User:', error);
    return res.status(500).json({ error: true, message: 'Internal server error' });
  }
};

exports.getShootStatusForUser = async (req, res) => {
  try {
    // const { user_id } = req.body;
    const user_id = req.user.userId;
    const range = req.query.range || 'all';

    let dateFilter = {};
    if (range === 'month') {
      dateFilter = {
        created_at: {
          [Op.gte]: Sequelize.literal("DATE_FORMAT(CURDATE(), '%Y-%m-01')")
        }
      };
    }

    const [
      totalShoots,
      successfulShoots,
      pendingShoots,
      rejectedShoots,
      cancelledShoots
    ] = await Promise.all([
      stream_project_booking.count({ where: { user_id, ...dateFilter } }),

      stream_project_booking.count({
        where: { user_id, is_completed: 1, ...dateFilter }
      }),

      stream_project_booking.count({
        where: {
          user_id,
          is_completed: 0,
          is_cancelled: 0,
          is_active: 1,
          ...dateFilter
        }
      }),

      stream_project_booking.count({
        where: { user_id, is_cancelled: 1, ...dateFilter }
      }),

      stream_project_booking.count({
        where: { user_id, is_active: 0, is_cancelled: 1, ...dateFilter }
      })
    ]);

    return res.status(200).json({
      error: false,
      data: {
        total: totalShoots,
        breakdown: [
          {
            label: 'Completed Shoots',
            count: successfulShoots,
            color: '#A78BFA'
          },
          {
            label: 'Pending Shoots',
            count: pendingShoots,
            color: '#38BDF8'
          },
          {
            label: 'Rejected Shoots',
            count: rejectedShoots,
            color: '#FBBF24'
          },
          {
            label: 'Cancelled Shoots',
            count: cancelledShoots,
            color: '#34D399'
          }
        ]
      }
    });
  } catch (err) {
    console.error('Shoot Status Error for User:', err);
    return res.status(500).json({ error: true, message: 'Internal server error' });
  }
};


exports.getAllProjectDetailsForUser = async (req, res) => {
  try {
    // const { user_id } = req.body; 
    const user_id = req.user.userId;
    let { status, event_type, search, limit, page } = req.query;
    const today = new Date();

    const noPagination = !limit && !page;

    let pageNumber = null;
    let pageSize = null;
    let offset = null;

    if (!noPagination) {
      pageNumber = parseInt(page ?? 1, 10);
      pageSize = parseInt(limit ?? 10, 10);
      offset = (pageNumber - 1) * pageSize;
    }

    const whereConditions = {
      user_id, 
      is_active: 1
    };

    // ----------- STATUS FILTER ----------- 
    if (status) {
      switch (status) {
        case 'cancelled':
          whereConditions.is_cancelled = 1;
          break;
        case 'completed':
          whereConditions.is_completed = 1;
          break;
        case 'upcoming':
          whereConditions.is_cancelled = 0;
          whereConditions.event_date = { [Sequelize.Op.gt]: today };
          break;
        case 'draft':
          whereConditions.is_draft = 1;
          break;
        default:
          return res.status(400).json({
            error: true,
            message: 'Invalid status filter'
          });
      }
    }

    // ----------- EVENT TYPE FILTER ----------- 
    if (event_type) {
      const eventType = await event_type_master.findOne({
        where: { event_type_id: event_type }
      });

      if (!eventType) {
        return res.status(400).json({
          error: true,
          message: 'Invalid event_type ID'
        });
      }
      whereConditions.event_type = event_type;
    }

    // ----------- SEARCH FILTER ----------- 
    if (search) {
      whereConditions.project_name = Sequelize.where(
        Sequelize.fn('LOWER', Sequelize.col('project_name')),
        {
          [Sequelize.Op.like]: `%${search.toLowerCase()}%`
        }
      );
    }

    // ----------- STATS COUNTS ----------- 
    const [
      total_active,
      total_cancelled,
      total_completed,
      total_upcoming,
      total_draft
    ] = await Promise.all([
      stream_project_booking.count({
        where: { ...whereConditions, is_cancelled: 0, is_completed: 0, is_draft: 0 }
      }),
      stream_project_booking.count({
        where: { ...whereConditions, is_cancelled: 1 }
      }),
      stream_project_booking.count({
        where: { ...whereConditions, is_completed: 1 }
      }),
      stream_project_booking.count({
        where: { ...whereConditions, is_cancelled: 0, is_draft: 0, event_date: { [Sequelize.Op.gt]: today } }
      }),
      stream_project_booking.count({
        where: { ...whereConditions, is_draft: 1 }
      }),
    ]);

    const projects = await stream_project_booking.findAll({
      where: whereConditions,
      ...(noPagination ? {} : { limit: pageSize, offset }),
      order: [['event_date', 'DESC']],
    });

    if (!projects || projects.length === 0) {
      return res.status(404).json({
        error: true,
        message: 'No active projects found for this user',
      });
    }

    const projectDetailsPromises = projects.map(async (project) => {
      const assignedCrew = await assigned_crew.findAll({
        where: { project_id: project.stream_project_booking_id, is_active: 1 },
        include: [
          {
            model: crew_members,
            as: 'crew_member',
            attributes: ['crew_member_id', 'first_name', 'last_name', 'primary_role'],
          },
        ],
      });

      const assignedEquipment = await assigned_equipment.findAll({
        where: { project_id: project.stream_project_booking_id, is_active: 1 },
        include: [
          {
            model: equipment,
            as: 'equipment',
            attributes: ['equipment_id', 'equipment_name'],
          },
        ],
      });

      const assignedPostProductionMembers = await assigned_post_production_member.findAll({
        where: { project_id: project.stream_project_booking_id, is_active: 1 },
        include: [
          {
            model: post_production_members,
            as: 'post_production_member',
            attributes: ['post_production_member_id', 'first_name', 'last_name', 'email'],
          },
        ],
      });

      return {
        project: {
          ...project.toJSON(),
          event_location: (() => {
            const loc = project.event_location;
            if (!loc) return null;
            if (typeof loc === "string" && (loc.startsWith("{") || loc.startsWith("["))) {
              try {
                const parsed = JSON.parse(loc);
                return parsed.address || parsed || loc;
              } catch {
                return loc;
              }
            }
            return loc;
          })()
        },
        assignedCrew,
        assignedEquipment,
        assignedPostProductionMembers,
      };
    });

    const projectDetails = await Promise.all(projectDetailsPromises);

    return res.status(200).json({
      error: false,
      message: 'All project details retrieved successfully for user',
      data: {
        stats: {
          total_active,
          total_cancelled,
          total_completed,
          total_upcoming,
          total_draft
        },
        projects: projectDetails,
        pagination: noPagination
          ? null
          : {
            page: pageNumber,
            limit: pageSize,
            totalRecords:
              total_active +
              total_cancelled +
              total_completed +
              total_upcoming +
              total_draft,
          }
      },
    });
  } catch (error) {
    console.error('Error fetching project details for user:', error);
    return res.status(500).json({
      error: true,
      message: 'Internal server error',
    });
  }
};

exports.getProjectDetailsForUser = async (req, res) => {
  try {
    const { project_id } = req.params;
    const user_id = req.user.userId;

    console.log('Received project_id:', project_id);
    console.log('Received user_id:', user_id);
    console.log('Requesting user_id from req.user:', req.user);

    if (!project_id || !user_id) {
      return res.status(400).json({
        error: true,
        message: 'Project ID and User ID are required',
      });
    }

    console.log('Project ID:', project_id);
    console.log('User ID:', user_id);

    const project = await stream_project_booking.findOne({
      where: {
        stream_project_booking_id: project_id,
        user_id,
        is_active: 1,
      },
    });

    if (!project) {
      return res.status(404).json({
        error: true,
        message: 'Project not found or does not belong to the user',
      });
    }

    const assignedCrew = await assigned_crew.findAll({
      where: { project_id: project.stream_project_booking_id, is_active: 1 },
      include: [
        {
          model: crew_members,
          as: 'crew_member',
          attributes: ['crew_member_id', 'first_name', 'last_name', 'primary_role'],
        },
      ],
    });

    const assignedEquipment = await assigned_equipment.findAll({
      where: { project_id: project.stream_project_booking_id, is_active: 1 },
      include: [
        {
          model: equipment,
          as: 'equipment',
          attributes: ['equipment_id', 'equipment_name'],
        },
      ],
    });

    const assignedPostProductionMembers = await assigned_post_production_member.findAll({
      where: { project_id: project.stream_project_booking_id, is_active: 1 },
      include: [
        {
          model: post_production_members,
          as: 'post_production_member',
          attributes: ['post_production_member_id', 'first_name', 'last_name', 'email'],
        },
      ],
    });

    return res.status(200).json({
      error: false,
      message: 'Project details retrieved successfully',
      data: {
        project,
        assignedCrew,
        assignedEquipment,
        assignedPostProductionMembers,
      },
    });
  } catch (error) {
    console.error('Error fetching project details for user:', error);
    return res.status(500).json({
      error: true,
      message: 'Internal server error',
    });
  }
};

exports.getRecentActivityForUser = async (req, res) => {
  try {
    // const { user_id } = req.body;
    const user_id = req.user.userId;
    const limit = parseInt(req.query.limit) || 10;
    const activities = [];

    if (!user_id) {
      return res.status(400).json({
        error: true,
        message: 'User ID is required',
      });
    }

    console.log('User ID:', user_id);

    const recentProjects = await stream_project_booking.findAll({
      where: { is_active: 1, user_id },
      attributes: ['stream_project_booking_id', 'project_name', 'event_location', 'created_at'],
      order: [['created_at', 'DESC']],
      limit: limit
    });

    recentProjects.forEach(project => {
      let locationText = 'Unknown location';
      try {
        const locationData = JSON.parse(project.event_location);
        locationText = locationData.address || locationData.name || 'Unknown location';
      } catch (e) {
        locationText = project.event_location || 'Unknown location';
      }

      activities.push({
        type: 'requirement',
        title: 'New Requirement Created',
        description: `${project.project_name} at ${locationText}`,
        timestamp: project.created_at,
        icon: 'FileText',
        metadata: {
          project_id: project.stream_project_booking_id,
          project_name: project.project_name
        }
      });
    });

    // Sort all activities by timestamp (most recent first)
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Return only the most recent 'limit' activities
    const limitedActivities = activities.slice(0, limit);

    return res.status(200).json({
      error: false,
      message: 'Recent project activities retrieved successfully for user',
      data: limitedActivities,
      total: limitedActivities.length
    });

  } catch (error) {
    console.error('Get Recent Project Activity Error for User:', error);
    return res.status(500).json({
      error: true,
      message: 'Internal server error',
    });
  }
};
