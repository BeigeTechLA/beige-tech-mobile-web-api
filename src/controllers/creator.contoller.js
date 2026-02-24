const constants = require('../utils/constants');
const { Sequelize } = require('../models')
const multer = require('multer');
const path = require('path');
const common_model = require('../utils/common_model');
const { Op } = require('sequelize');
const { S3UploadFiles } = require('../utils/common.js');
const { sendTaskAssignmentEmail } = require('../utils/emailService');
const { stream_project_booking, crew_members, crew_member_files, tasks, equipment,
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
  event_type_master,
  crew_availability,
  crew_equipment, crew_equipment_photos, activity_logs, equipment_request , crew_roles} = require('../models');

const moment = require('moment');


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
    return JSON.stringify(arr);
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
    const allowedTypes = ['image/jpeg', 'image/png','image/webp', 'image/jfif', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Only JPEG, JPG, WEBP, JFIF, PNG, and PDF are allowed.'));
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


exports.getDashboardCounts = async (req, res) => {
  try {
    const { crew_member_id } = req.body || req.query;

    if (!crew_member_id) {
      return res.status(400).json({
        error: true,
        message: "crew_member_id is required",
      });
    }

    const completedShoots = await stream_project_booking.count({
      where: {
        is_completed: 1,
      },
      include: [
        {
          model: assigned_crew,
          as: "assigned_crews",
          where: {
            crew_member_id: crew_member_id,
          },
          required: true,
        },
      ],
    });

    const upcomingShoots = await stream_project_booking.count({
      where: {
        event_date: { [Sequelize.Op.gt]: new Date() },
      },
      include: [
        {
          model: assigned_crew,
          as: "assigned_crews",
          where: {
            crew_member_id: crew_member_id,
          },
          required: true,
        },
      ],
    });

    const pendingRequests = await assigned_crew.count({
      where: {
        crew_accept: 0,
        crew_member_id: crew_member_id,
      },
      include: [
        {
          model: stream_project_booking,
          as: "project",
          required: true,
          where: {
            is_completed: 0,
          },
        },
      ],
    });

    const equipmentRequests = 5;

    return res.status(200).json({
      error: false,
      message: 'Dashboard counts fetched successfully',
      data: {
        completedShoots,
        upcomingShoots,
        pendingRequests,
        equipmentRequests,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard counts:', error);
    return res.status(500).json({
      error: true,
      message: 'Something went wrong while fetching dashboard counts',
    });
  }
};


exports.getPendingRequests = async (req, res) => {
  try {
    const { crew_member_id } = req.body || req.query;

    if (!crew_member_id) {
      return res.status(400).json({ error: true, message: "crew_member_id is required" });
    }

    const ROLE_GROUPS = {
      videographer: ["9", "1"],
      photographer: ["10", "2"],
      cinematographer: ["11", "3"],
    };

    const ID_TO_ROLE_MAP = {};
    Object.entries(ROLE_GROUPS).forEach(([roleName, ids]) => {
      ids.forEach(id => { ID_TO_ROLE_MAP[String(id)] = roleName; });
    });

    const currentCrew = await crew_members.findOne({ where: { crew_member_id } });
    if (!currentCrew) return res.status(404).json({ error: true, message: "Crew member not found" });

    const myRoleIds = JSON.parse(currentCrew.primary_role || "[]");
    const myCategories = [...new Set(myRoleIds.map(id => ID_TO_ROLE_MAP[String(id)]).filter(Boolean))];
    const pendingRequests = await assigned_crew.findAll({
      where: { crew_member_id, crew_accept: 0 },
      include: [
        {
          model: stream_project_booking,
          as: "project",
          required: true,
          where: { is_completed: 0 },
          include: [
            { 
              model: assigned_crew, as: 'assigned_crews', 
              where: { crew_accept: 1 },
              required: false,
              include: [{ model: crew_members, as: 'crew_member' }]
            }
          ]
        },
      ],
    });

    const filteredDetails = pendingRequests.filter((request) => {
      const project = request.project;
      const requestedLimits = typeof project.crew_roles === 'string' 
          ? JSON.parse(project.crew_roles || '{}') 
          : (project.crew_roles || {});

      let acceptedCounts = { videographer: 0, photographer: 0, cinematographer: 0 };
      
      if (project.assigned_crews) {
        project.assigned_crews.forEach(ac => {
          const acRoles = JSON.parse(ac.crew_member?.primary_role || "[]");
          let assignedTo = acRoles.map(id => ID_TO_ROLE_MAP[String(id)]).find(cat => 
            cat && acceptedCounts[cat] < (requestedLimits[cat] || 0)
          );
          if (assignedTo) acceptedCounts[assignedTo]++;
        });
      }

      const hasAvailableSlot = myCategories.some(cat => 
        acceptedCounts[cat] < (requestedLimits[cat] || 0)
      );

      return hasAvailableSlot;
    });

    if (filteredDetails.length === 0) {
      return res.status(200).json({
        error: false,
        message: "No available pending requests found.",
        data: []
      });
    }

    const projectDetails = filteredDetails.map((request) => ({
      project_id: request.project.stream_project_booking_id,
      project_name: request.project.project_name,
      event_date: request.project.event_date,
      start_time: request.project.start_time,
      end_time: request.project.end_time,
      event_location: request.project.event_location,
      budget: request.project.budget,
      is_completed: request.project.is_completed,
    }));

    return res.status(200).json({
      error: false,
      message: "Pending requests fetched successfully",
      data: projectDetails,
    });

  } catch (error) {
    console.error('Error fetching pending requests:', error);
    return res.status(500).json({ error: true, message: 'Internal server error' });
  }
};
exports.getConfirmedRequests = async (req, res) => {
  try {
    const { crew_member_id } = req.body || req.query;

    if (!crew_member_id) {
      return res.status(400).json({
        error: true,
        message: "crew_member_id is required",
      });
    }

    const confirmedRequests = await assigned_crew.findAll({
      where: {
        crew_member_id: crew_member_id,
        crew_accept: 1,
      },
      include: [
        {
          model: stream_project_booking,
          as: "project",
          required: true,
          where: {
            is_completed: 0,
          },
          attributes: [
            "stream_project_booking_id",
            "project_name",
            "event_date",
            "start_time",
            "end_time",
            "event_location",
            "budget",
            "is_completed",
          ],
        },
      ],
    });

    if (confirmedRequests.length === 0) {
      return res.status(404).json({
        error: true,
        message: "No confirmed requests found for the given crew member.",
      });
    }

    const projectDetails = confirmedRequests.map((request) => {
      return {
        project_id: request.project.stream_project_booking_id,
        project_name: request.project.project_name,
        event_date: request.project.event_date,
        start_time: request.project.start_time,
        end_time: request.project.end_time,
        event_location: request.project.event_location,
        budget: request.project.budget,
        is_completed: request.project.is_completed,
      };
    });

    return res.status(200).json({
      error: false,
      message: "Confirmed requests fetched successfully",
      data: projectDetails,
    });
  } catch (error) {
    console.error('Error fetching confirmed requests:', error);
    return res.status(500).json({
      error: true,
      message: 'Something went wrong while fetching confirmed requests',
    });
  }
};

exports.getDeclinedRequests = async (req, res) => {
  try {
    const { crew_member_id } = req.body || req.query;

    if (!crew_member_id) {
      return res.status(400).json({
        error: true,
        message: "crew_member_id is required",
      });
    }

    const declinedRequests = await assigned_crew.findAll({
      where: {
        crew_member_id: crew_member_id,
        crew_accept: 2,
      },
      include: [
        {
          model: stream_project_booking,
          as: "project",
          required: true,
          where: {
            is_completed: 0,
          },
          attributes: [
            "stream_project_booking_id",
            "project_name",
            "event_date",
            "start_time",
            "end_time",
            "event_location",
            "budget",
            "is_completed",
          ],
        },
      ],
    });

    if (declinedRequests.length === 0) {
      return res.status(404).json({
        error: true,
        message: "No declined requests found for the given crew member.",
      });
    }

    const projectDetails = declinedRequests.map((request) => {
      return {
        project_id: request.project.stream_project_booking_id,
        project_name: request.project.project_name,
        event_date: request.project.event_date,
        start_time: request.project.start_time,
        end_time: request.project.end_time,
        event_location: request.project.event_location,
        budget: request.project.budget,
        is_completed: request.project.is_completed,
      };
    });

    return res.status(200).json({
      error: false,
      message: "Declined requests fetched successfully",
      data: projectDetails,
    });
  } catch (error) {
    console.error('Error fetching declined requests:', error);
    return res.status(500).json({
      error: true,
      message: 'Something went wrong while fetching declined requests',
    });
  }
};


exports.getProjectDetails = async (req, res) => {
  try {
    const { project_id } = req.body || req.query;
    if (!project_id) {
      return res.status(400).json({
        error: true,
        message: 'Project ID is required',
      });
    }

    console.log('Project ID:', project_id);

    const project = await stream_project_booking.findOne({
      where: { stream_project_booking_id: project_id, is_active: 1 },
    });

    if (!project) {
      return res.status(404).json({
        error: true,
        message: 'Project not found',
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

    return res.status(200).json({
      error: false,
      message: 'Project details retrieved successfully',
      data: {
        project,
        assignedCrew,
        assignedEquipment,
      },
    });
  } catch (error) {
    console.error('Error fetching project details:', error);
    return res.status(500).json({
      error: true,
      message: 'Internal server error',
    });
  }
};

exports.updateRequestStatus = async (req, res) => {
  try {
    const { crew_member_id, project_id, crew_accept } = req.body;

    if (!crew_member_id || !project_id || crew_accept === undefined) {
      return res.status(400).json({
        error: true,
        message: "crew_member_id, project_id and crew_accept are required.",
      });
    }

    if (crew_accept === 2) {
      await assigned_crew.update(
        { crew_accept: 2 },
        { where: { crew_member_id, project_id, crew_accept: 0 } }
      );
      return res.status(200).json({ error: false, message: "Request declined successfully." });
    }

    if (crew_accept === 1) {
      const ROLE_GROUPS = {
        videographer: ["9", "1"],
        photographer: ["10", "2"],
        cinematographer: ["11", "3"],
      };

      const ID_TO_ROLE_MAP = {};
      Object.entries(ROLE_GROUPS).forEach(([roleName, ids]) => {
        ids.forEach(id => { ID_TO_ROLE_MAP[String(id)] = roleName; });
      });

      const project = await stream_project_booking.findOne({
        where: { stream_project_booking_id: project_id },
        include: [
          { 
            model: assigned_crew, as: 'assigned_crews', 
            where: { crew_accept: 1 }, 
            required: false,
            include: [{ model: crew_members, as: 'crew_member' }]
          }
        ]
      });

      const currentCrew = await crew_members.findOne({ where: { crew_member_id } });
      
      if (!project || !currentCrew) {
        return res.status(404).json({ error: true, message: "Project or Crew Member not found." });
      }

      const requestedLimits = typeof project.crew_roles === 'string' 
          ? JSON.parse(project.crew_roles) 
          : (project.crew_roles || {});

      const crewRoleIds = typeof currentCrew.primary_role === 'string'
          ? JSON.parse(currentCrew.primary_role)
          : (currentCrew.primary_role || []);

      const crewCategories = [...new Set(crewRoleIds.map(id => ID_TO_ROLE_MAP[String(id)]).filter(Boolean))];

      let currentAcceptedCounts = { videographer: 0, photographer: 0, cinematographer: 0 };
      if (project.assigned_crews) {
        project.assigned_crews.forEach(ac => {
          const acRoles = JSON.parse(ac.crew_member?.primary_role || "[]");
          let assignedTo = acRoles.map(id => ID_TO_ROLE_MAP[String(id)]).find(cat => 
            cat && currentAcceptedCounts[cat] < (requestedLimits[cat] || 0)
          );
          if (assignedTo) currentAcceptedCounts[assignedTo]++;
        });
      }

      const availableCategory = crewCategories.find(cat => 
        currentAcceptedCounts[cat] < (requestedLimits[cat] || 0)
      );

      if (!availableCategory) {
        return res.status(200).json({
          error: true,
          message: `The project slots for ${crewCategories.join(' / ')} are already full.`
        });
      }

      // All good! Proceed with acceptance
      const updateResult = await assigned_crew.update(
        { crew_accept: 1 },
        { where: { crew_member_id, project_id, crew_accept: 0 } }
      );

      if (updateResult[0] === 0) {
        return res.status(404).json({ error: true, message: "No pending request found or already accepted." });
      }

      return res.status(200).json({ error: false, message: "Request accepted successfully." });
    }

  } catch (error) {
    console.error("Error updating request status:", error);
    return res.status(500).json({ error: true, message: error.message });
  }
};


// exports.getAcceptedAndUpcomingProjects = async (req, res) => {
//   try {
//     const { crew_member_id } = req.body || req.query;

//     if (!crew_member_id) {
//       return res.status(400).json({
//         error: true,
//         message: "crew_member_id is required",
//       });
//     }

//     const projects = await assigned_crew.findAll({
//       where: {
//         crew_member_id: crew_member_id,
//         crew_accept: 1,
//       },
//       include: [
//         {
//           model: stream_project_booking,
//           as: "project",
//           required: true,
//           where: {
//             event_date: { [Sequelize.Op.gt]: new Date() },
//           },
//           attributes: [
//             "stream_project_booking_id",
//             "project_name",
//             "event_date",
//             "start_time",
//             "end_time",
//             "event_location",
//             "budget",
//             "is_completed",
//           ],
//         },
//       ],
//     });

//     if (projects.length === 0) {
//       return res.status(200).json({
//         error: true,
//         message: "No accepted upcoming projects found for the given crew member.",
//       });
//     }

//     const projectDetails = projects.map((request) => {
//       return {
//         project_id: request.project.stream_project_booking_id,
//         project_name: request.project.project_name,
//         event_date: request.project.event_date,
//         start_time: request.project.start_time,
//         end_time: request.project.end_time,
//         event_location: request.project.event_location,
//         budget: request.project.budget,
//         is_completed: request.project.is_completed,
//       };
//     });

//     return res.status(200).json({
//       error: false,
//       message: "Accepted and upcoming projects fetched successfully",
//       data: projectDetails,
//     });
//   } catch (error) {
//     console.error('Error fetching accepted upcoming projects:', error);
//     return res.status(500).json({
//       error: true,
//       message: 'Something went wrong while fetching accepted upcoming projects',
//     });
//   }
// };

exports.getAcceptedAndUpcomingProjects = async (req, res) => {
  try {
    const { crew_member_id } = req.body || req.query;

    if (!crew_member_id) {
      return res.status(400).json({
        error: true,
        message: "crew_member_id is required",
      });
    }

    const today = new Date();

    const projects = await assigned_crew.findAll({
      where: {
        crew_member_id,
        crew_accept: 1,
      },
      include: [
        {
          model: stream_project_booking,
          as: "project",
          required: true,
          attributes: [
            "stream_project_booking_id",
            "project_name",
            "event_date",
            "start_time",
            "end_time",
            "event_location",
            "budget",
            "is_completed",
          ],
        },
      ],
      order: [
        [
          Sequelize.literal(`
            CASE 
              WHEN project.event_date >= CURDATE() THEN 0 
              ELSE 1 
            END
          `),
          "ASC",
        ],

        [{ model: stream_project_booking, as: "project" }, "event_date", "ASC"],
      ],
    });

    if (!projects.length) {
      return res.status(200).json({
        error: false,
        message: "No accepted projects found for the given crew member.",
        data: [],
      });
    }

    const projectDetails = projects.map((request) => ({
      project_id: request.project.stream_project_booking_id,
      project_name: request.project.project_name,
      event_date: request.project.event_date,
      start_time: request.project.start_time,
      end_time: request.project.end_time,
      event_location: request.project.event_location,
      budget: request.project.budget,
      is_completed: request.project.is_completed,
    }));

    return res.status(200).json({
      error: false,
      message: "Accepted projects fetched successfully",
      data: projectDetails,
    });
  } catch (error) {
    console.error("Error fetching accepted projects:", error);
    return res.status(500).json({
      error: true,
      message: "Something went wrong while fetching accepted projects",
    });
  }
};



exports.getCrewAvailability = async (req, res) => {
  try {
    // const crew_member_id = req.body;
    const { year, month, crew_member_id } = req.body || req.query;

    if (!crew_member_id || !year || !month) {
      return res.status(400).json({
        error: true,
        message: "crew_member_id, year, and month are required",
      });
    }

    const crewMember = await crew_members.findOne({
      where: { crew_member_id },
    });

    if (!crewMember) {
      return res.status(404).json({
        error: true,
        message: "Crew member not found",
      });
    }

    let availability = [];
    try {
      availability = JSON.parse(crewMember.availability || "[]");
    } catch {
      availability = [];
    }

    const monthStart = moment(`${year}-${month}-01`).startOf("month").toDate();
    const monthEnd = moment(`${year}-${month}-01`).endOf("month").toDate();

    const acceptedProjects = await assigned_crew.findAll({
      where: {
        crew_member_id,
        crew_accept: 1,
      },
      include: [
        {
          model: stream_project_booking,
          as: "project",
          where: {
            event_date: {
              [Sequelize.Op.between]: [monthStart, monthEnd],
            },
          },
          attributes: [
            "event_date",
            "stream_project_booking_id",
            "project_name",
            "start_time",
            "end_time",
            "event_location",
          ],
        },
      ],
    });

    const customAvailability = await crew_availability.findAll({
      where: {
        crew_member_id,
        [Sequelize.Op.or]: [
          {
            recurrence: 1,
            date: { [Sequelize.Op.between]: [monthStart, monthEnd] },
          },
          {
            recurrence: { [Sequelize.Op.ne]: 1 },
            recurrence_until: { [Sequelize.Op.gte]: monthStart },
          },
        ],
      },
      order: [["created_at", "DESC"]], // Always fetch the latest entry
    });

    const appliesOnDate = (rule, dateMoment) => {
      const start = moment(rule.date);
      const end = rule.recurrence_until
        ? moment(rule.recurrence_until)
        : start;

      if (
        dateMoment.isBefore(start, "day") ||
        dateMoment.isAfter(end, "day")
      ) {
        return false;
      }

      switch (rule.recurrence) {
        case 1:
          return dateMoment.isSame(start, "day");

        case 2:
          return true;

        case 3: {
          if (!rule.recurrence_days) return false;

          const days = JSON.parse(rule.recurrence_days)
            .map(d => d.toLowerCase().slice(0, 3));

          const currentDay = dateMoment
            .format("ddd")
            .toLowerCase();

          return days.includes(currentDay);
        }

        case 4:
          return (
            dateMoment.date() === Number(rule.recurrence_day_of_month)
          );

        default:
          return false;
      }
    };

    const calendar = {};
    const daysInMonth = moment(`${year}-${month}`, "YYYY-MM").daysInMonth();

    for (let day = 1; day <= daysInMonth; day++) {
      const date = moment(`${year}-${month}-${day}`, "YYYY-MM-DD");
      const key = date.format("YYYY-MM-DD");

      calendar[key] = {
        available: false,
        projectAssigned: false,
        projectDetails: null,
        customAvailabilityStatus: null,
        start_time: null,
        end_time: null,
        is_full_day: 1,
      };

      if (availability.includes(date.format("dddd"))) {
        calendar[key].available = true;
      }

      const rule = customAvailability.find((r) =>
        appliesOnDate(r, date)
      );

      if (rule) {
        calendar[key].available = rule.availability_status == "1";
        calendar[key].customAvailabilityStatus =
          rule.availability_status;

        if (rule.is_full_day === 0) {
          calendar[key].start_time = rule.start_time;
          calendar[key].end_time = rule.end_time;
        }
      }
    }

    for (const project of acceptedProjects) {
      const eventDate = moment(
        project.project.event_date
      ).format("YYYY-MM-DD");

      if (calendar[eventDate]) {
        calendar[eventDate].available = false;
        calendar[eventDate].projectAssigned = true;
        calendar[eventDate].projectDetails = {
          project_id: project.project.stream_project_booking_id,
          project_name: project.project.project_name,
          start_time: project.project.start_time,
          end_time: project.project.end_time,
          event_location: project.project.event_location,
        };
      }
    }

    return res.status(200).json({
      error: false,
      message: "Crew member availability fetched successfully",
      data: {
        crew_member_id: crewMember.crew_member_id,
        availability: calendar,
      },
    });
  } catch (error) {
    console.error("Error fetching crew availability:", error);
    return res.status(500).json({
      error: true,
      message: "Something went wrong while fetching crew availability",
    });
  }
};


// exports.setCrewAvailability = async (req, res) => {
//   try {
//     const { crew_member_id, date, availability_status, start_time, end_time, location, recurrence, notes } = req.body;

//     if (!crew_member_id || !date || !availability_status) {
//       return res.status(400).json({
//         error: true,
//         message: "crew_member_id, date, and availability_status are required",
//       });
//     }

//     const existingAvailability = await crew_availability.findOne({
//       where: {
//         crew_member_id,
//         date,
//       },
//     });

//     if (existingAvailability) {
//       existingAvailability.availability_status = availability_status;
//       existingAvailability.start_time = start_time;
//       existingAvailability.end_time = end_time;
//       existingAvailability.location = location;
//       existingAvailability.recurrence = recurrence;
//       existingAvailability.notes = notes;

//       await existingAvailability.save();

//       return res.status(200).json({
//         error: false,
//         message: "Crew availability updated successfully",
//         data: existingAvailability,
//       });
//     }

//     const newAvailability = await crew_availability.create({
//       crew_member_id,
//       date,
//       availability_status,
//       start_time,
//       end_time,
//       location,
//       recurrence,
//       notes,
//     });

//     return res.status(201).json({
//       error: false,
//       message: "Crew availability added successfully",
//       data: newAvailability,
//     });
//   } catch (error) {
//     console.error("Error setting crew availability:", error);
//     return res.status(500).json({
//       error: true,
//       message: "Something went wrong while setting crew availability",
//     });
//   }
// };


exports.setCrewAvailability = async (req, res) => {
  try {
    // const crew_member_id = req.user.crew_member_id;
    const {
      crew_member_id,
      date,
      availability_status,
      start_time,
      end_time,
      location,
      notes,
      is_full_day = 0,
      recurrence = 1,
      recurrence_days = null,
      recurrence_until = null,
      recurrence_day_of_month = null
    } = req.body;

    if (!crew_member_id || !date || !availability_status) {
      return res.status(400).json({
        error: true,
        message: "crew_member_id, date, and availability_status are required",
      });
    }

    /* Validate recurrence */
    if (recurrence !== 1 && !recurrence_until) {
      return res.status(400).json({
        error: true,
        message: "recurrence_until is required for recurring availability"
      });
    }

    if (recurrence === 3 && (!recurrence_days || !recurrence_days.length)) {
      return res.status(400).json({
        error: true,
        message: "recurrence_days required for weekly recurrence"
      });
    }

    if (recurrence === 4 && !recurrence_day_of_month) {
      return res.status(400).json({
        error: true,
        message: "recurrence_day_of_month required for monthly recurrence"
      });
    }

    const payload = {
      crew_member_id,
      date,
      availability_status,
      start_time,
      end_time,
      location,
      notes,
      is_full_day,
      recurrence,
      recurrence_until,
      recurrence_days: recurrence_days ? JSON.stringify(recurrence_days) : null,
      recurrence_day_of_month
    };

    const availability = await crew_availability.create(payload);

    // await common.logActivity({
    //   crew_member_id,
    //   activity_type: 'availability_updated',
    //   title: 'Availability Updated',
    //   description: `Availability set starting ${date}`,
    //   reference_type: 'availability',
    //   reference_id: availability.availability_id
    // });

    return res.status(200).json({
      error: false,
      message: "Availability saved successfully",
      data: availability
    });
  } catch (error) {
    console.error("setCrewAvailability error:", error);
    return res.status(500).json({
      error: true,
      message: "Something went wrong while setting crew availability"
    });
  }
};


exports.getDashboardRequestCounts = async (req, res) => {
  try {
    const { creator_id } = req.body || req.query;

    if (!creator_id) {
      return res.status(400).json({ error: true, message: "creator_id is required" });
    }

    const ROLE_GROUPS = {
      videographer: ["9", "1"],
      photographer: ["10", "2"],
      cinematographer: ["11", "3"],
    };
    const ID_TO_ROLE_MAP = {};
    Object.entries(ROLE_GROUPS).forEach(([roleName, ids]) => {
      ids.forEach(id => { ID_TO_ROLE_MAP[String(id)] = roleName; });
    });

    const currentCrew = await crew_members.findOne({ where: { crew_member_id: creator_id } });
    if (!currentCrew) return res.status(404).json({ error: true, message: "Creator not found" });

    const myRoleIds = JSON.parse(currentCrew.primary_role || "[]");
    const myCategories = [...new Set(myRoleIds.map(id => ID_TO_ROLE_MAP[String(id)]).filter(Boolean))];

    const pendingRecords = await assigned_crew.findAll({
      where: { crew_member_id: creator_id, crew_accept: 0 },
      include: [{
        model: stream_project_booking, as: "project",
        where: { is_completed: 0 },
        include: [{ 
          model: assigned_crew, as: 'assigned_crews', 
          where: { crew_accept: 1 }, required: false,
          include: [{ model: crew_members, as: 'crew_member' }]
        }]
      }]
    });

    let smartPendingCount = 0;
    pendingRecords.forEach((record) => {
      const project = record.project;
      const requestedLimits = typeof project.crew_roles === 'string' ? JSON.parse(project.crew_roles || '{}') : (project.crew_roles || {});

      let acceptedCounts = { videographer: 0, photographer: 0, cinematographer: 0 };
      if (project.assigned_crews) {
        project.assigned_crews.forEach(ac => {
          const acRoles = JSON.parse(ac.crew_member?.primary_role || "[]");
          let assignedTo = acRoles.map(id => ID_TO_ROLE_MAP[String(id)]).find(cat => 
            cat && acceptedCounts[cat] < (requestedLimits[cat] || 0)
          );
          if (assignedTo) acceptedCounts[assignedTo]++;
        });
      }

      const hasAvailableSlot = myCategories.some(cat => 
        acceptedCounts[cat] < (requestedLimits[cat] || 0)
      );

      if (hasAvailableSlot) smartPendingCount++;
    });

    const confirmedRequests = await assigned_crew.count({
      where: { crew_member_id: creator_id, crew_accept: 1 }
    });

    const declinedRequests = await assigned_crew.count({
      where: { crew_member_id: creator_id, crew_accept: 2 }
    });

    const completedShoots = await stream_project_booking.count({
      where: { is_completed: 1 },
      include: [{
        model: assigned_crew, as: "assigned_crews",
        where: { crew_member_id: creator_id, crew_accept: 1 },
        required: true,
      }]
    });

    return res.status(200).json({
      error: false,
      message: "Dashboard request counts fetched successfully",
      data: {
        pendingRequests: smartPendingCount,
        confirmedRequests,
        declinedRequests,
        completedShoots,
      },
    });
  } catch (error) {
    console.error("Error fetching dashboard request counts:", error);
    return res.status(500).json({ error: true, message: error.message });
  }
};


exports.getCompletedProjectsByCrew = async (req, res) => {
  try {
    const { crew_member_id } = req.body || req.query;

    if (!crew_member_id) {
      return res.status(400).json({
        error: true,
        message: "crew_member_id is required",
      });
    }

    const completedProjects = await stream_project_booking.findAll({
      where: {
        is_completed: 1,
      },
      include: [
        {
          model: assigned_crew,
          as: "assigned_crews",
          where: {
            crew_member_id: crew_member_id,
          },
          required: true,
          attributes: [
            "id",
            "crew_member_id",
            "crew_accept",
          ],
        },
      ],
      order: [["event_date", "DESC"]],
    });

    return res.status(200).json({
      error: false,
      message: "Completed projects fetched successfully",
      data: completedProjects,
    });
  } catch (error) {
    console.error("Error fetching completed projects:", error);
    return res.status(500).json({
      error: true,
      message: "Something went wrong while fetching completed projects",
    });
  }
};


exports.getEquipmentOwnedByCrewMember = [
  async (req, res) => {
    try {
      const { crew_member_id } = req.body || req.query;

      if (!crew_member_id) {
        return res.status(constants.BAD_REQUEST.code).json({
          error: true,
          code: constants.BAD_REQUEST.code,
          message: "Crew member ID is required",
          data: null,
        });
      }

      const crewMember = await crew_members.findOne({
        where: { crew_member_id },
        attributes: ['equipment_ownership']
      });

      if (!crewMember) {
        return res.status(constants.NOT_FOUND.code).json({
          error: true,
          code: constants.NOT_FOUND.code,
          message: "Crew member not found",
          data: null,
        });
      }

      const equipmentOwnershipArr = JSON.parse(crewMember.equipment_ownership);

      if (!Array.isArray(equipmentOwnershipArr) || equipmentOwnershipArr.length === 0) {
        return res.status(constants.NOT_FOUND.code).json({
          error: true,
          code: constants.NOT_FOUND.code,
          message: "No equipment ownership found for this crew member",
          data: null,
        });
      }

      const equipmentDetails = await equipment.findAll({
        where: {
          equipment_name: { [Sequelize.Op.in]: equipmentOwnershipArr },
        },
      });

      if (equipmentDetails.length === 0) {
        return res.status(constants.NOT_FOUND.code).json({
          error: true,
          code: constants.NOT_FOUND.code,
          message: "No equipment found for the owned items",
          data: null,
        });
      }

      if (!constants.OK || !constants.OK.code) {
        console.error('constants.OK is undefined or missing "code"');
        return res.status(500).json({
          error: true,
          message: 'Server configuration error: constants.OK is undefined',
        });
      }

      return res.status(constants.OK.code).json({
        error: false,
        code: constants.OK.code,
        message: "Equipment details fetched successfully",
        data: equipmentDetails,
      });
    } catch (error) {
      console.error("Get Equipment Owned by Crew Member Error:", error);
      return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
        error: true,
        code: constants.INTERNAL_SERVER_ERROR.code,
        message: constants.INTERNAL_SERVER_ERROR.message,
        data: null,
      });
    }
  },
];

exports.getCrewEquipmentCounts = [
  async (req, res) => {
    try {
      const { crew_member_id } = req.body || req.query;

      if (!crew_member_id) {
        return res.status(constants.BAD_REQUEST.code).json({
          error: true,
          code: constants.BAD_REQUEST.code,
          message: "Crew member ID is required",
          data: null,
        });
      }

      const crewMember = await crew_members.findOne({
        where: { crew_member_id },
        attributes: ["equipment_ownership"],
      });

      if (!crewMember) {
        return res.status(constants.NOT_FOUND.code).json({
          error: true,
          code: constants.NOT_FOUND.code,
          message: "Crew member not found",
          data: null,
        });
      }

      let equipmentOwnershipArr = [];

      try {
        equipmentOwnershipArr = JSON.parse(crewMember.equipment_ownership);
      } catch (err) {
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
          error: true,
          code: constants.INTERNAL_SERVER_ERROR.code,
          message: "Invalid equipment ownership data",
          data: null,
        });
      }

      if (!Array.isArray(equipmentOwnershipArr) || equipmentOwnershipArr.length === 0) {
        return res.status(constants.OK.code).json({
          error: false,
          code: constants.OK.code,
          message: "No equipment owned by this crew member",
          data: {
            total_equipment: 0,
            total_amount: 0,
            available: 0,
            in_use: 0,
          },
        });
      }

      // Fetch equipment prices
      const equipmentList = await equipment.findAll({
        where: {
          equipment_name: {
            [Sequelize.Op.in]: equipmentOwnershipArr,
          },
        },
        attributes: ["purchase_price"],
      });

      // Calculate totals
      const total_equipment = equipmentList.length;

      const total_amount = equipmentList.reduce((sum, item) => {
        return sum + parseFloat(item.purchase_price || 0);
      }, 0);

      return res.status(constants.OK.code).json({
        error: false,
        code: constants.OK.code,
        message: "Equipment counts fetched successfully",
        data: {
          total_equipment,
          total_amount,
          available: total_equipment,
          in_use: 0,
        },
      });
    } catch (error) {
      console.error("Get Crew Equipment Counts Error:", error);
      return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
        error: true,
        code: constants.INTERNAL_SERVER_ERROR.code,
        message: constants.INTERNAL_SERVER_ERROR.message,
        data: null,
      });
    }
  },
];

exports.getProfile = async (req, res) => {
  try {
    const { crew_member_id } = req.body; 

    console.log("Fetching profile for ID:", crew_member_id);

    if (!crew_member_id) {
      return res.status(400).json({
        error: true,
        message: "crew_member_id is required in request body"
      });
    }

    let member = await crew_members.findOne({
      where: { crew_member_id: crew_member_id },
      include: [
        {
          model: crew_member_files,
          as: 'crew_member_files',
          attributes: ['crew_files_id','crew_member_id', 'file_type', 'file_path', 'created_at', 'title', 'tag'],
          where: { is_active: 1 },
          required: false
        }
      ]
    });

    if (!member) {
      return res.status(constants.NOT_FOUND.code).json({
        error: true,
        code: constants.NOT_FOUND.code,
        message: `Crew member with ID ${crew_member_id} not found`,
        data: null,
      });
    }

    const loc = member.location;
    if (loc) {
      if (typeof loc === 'string' && (loc.startsWith('{') || loc.startsWith('['))) {
        try {
          const parsed = JSON.parse(loc);
          member.location = parsed.address || parsed || loc;
        } catch {
          member.location = loc;
        }
      }
    }

    let skillIds = [];
    try {
      let raw = member.skills;
      if (raw) {
        skillIds = typeof raw === 'string' ? JSON.parse(raw) : raw; 
        skillIds = skillIds.map(id => parseInt(id));
      }
    } catch (err) {
      console.error("Skills parsing error:", err);
      skillIds = [];
    }

    const skillList = await skills_master.findAll({
      where: { id: skillIds },
      attributes: ['id', 'name']
    });

    let result = member.toJSON();
    result.skills = skillList;

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: "Crew member fetched successfully",
      data: result,
    });

  } catch (error) {
    console.error("Get Crew Member Error:", error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null,
    });
  }
};

exports.editProfile = async (req, res) => {
  try {
    // const crew_member_id = req.body;
    const {
      crew_member_id,
      first_name,
      last_name,
      email,
      phone_number,
      location,
      working_distance,
      primary_role,
      years_of_experience,
      hourly_rate,
      bio,
      skills,
      social_media_links
    } = req.body;

    const crewMember = await crew_members.findOne({
      where: { crew_member_id }
    });

    if (!crewMember) {
      return res.status(constants.NOT_FOUND.code).json({
        error: true,
        code: constants.NOT_FOUND.code,
        message: "Crew member not found",
        data: null,
      });
    }

    if (email && email !== crewMember.email) {
      const existingEmail = await crew_members.findOne({
        where: { email, crew_member_id: { [Sequelize.Op.ne]: crew_member_id } }
      });
      if (existingEmail) {
        return res.status(constants.BAD_REQUEST.code).json({
          error: true,
          code: constants.BAD_REQUEST.code,
          message: "Email already exists",
          data: null,
        });
      }
    }

    // Prepare update data
    const updateData = {};

    if (first_name !== undefined) updateData.first_name = first_name;
    if (last_name !== undefined) updateData.last_name = last_name;
    if (email !== undefined) updateData.email = email;
    if (phone_number !== undefined) updateData.phone_number = phone_number;
    if (location !== undefined) updateData.location = JSON.stringify(location);
    if (working_distance !== undefined) updateData.working_distance = working_distance;
    if (years_of_experience !== undefined) updateData.years_of_experience = years_of_experience;
    if (hourly_rate !== undefined) updateData.hourly_rate = hourly_rate;
    if (bio !== undefined) updateData.bio = bio;

    if (primary_role !== undefined) {
      updateData.primary_role = Array.isArray(primary_role) 
        ? JSON.stringify(primary_role) 
        : primary_role;
    }

    if (skills !== undefined) {
      updateData.skills = Array.isArray(skills) ? JSON.stringify(skills) : skills;
    }

    if (social_media_links !== undefined) {
      if (Array.isArray(social_media_links)) {
        const sanitizedLinks = social_media_links
          .filter(item => item.platform && item.url)
          .map(item => ({ platform: item.platform, url: item.url }));
        updateData.social_media_links = JSON.stringify(sanitizedLinks);
      } else {
        updateData.social_media_links = social_media_links;
      }
    }

    const oldEmail = crewMember.email;
    await crewMember.update(updateData);

    if (email && email !== oldEmail) {
      await User.update({ email: email }, { where: { email: oldEmail } });
    }

    const updatedMember = await crew_members.findOne({
      where: { crew_member_id },
      include: [
        {
          model: crew_member_files,
          as: 'crew_member_files',
          attributes: ['crew_member_id', 'file_type', 'file_path', 'created_at']
        }
      ]
    });

    const responseData = updatedMember.toJSON();

    try {
      if (responseData.primary_role) {
        responseData.primary_role = JSON.parse(responseData.primary_role);
      } else {
        responseData.primary_role = [];
      }
    } catch (e) {
      responseData.primary_role = responseData.primary_role ? [responseData.primary_role] : [];
    }

    let skillIds = [];
    try {
      if (updatedMember.skills) {
        skillIds = JSON.parse(updatedMember.skills).map(id => parseInt(id));
      }
    } catch (err) { skillIds = []; }
    
    responseData.skills = await skills_master.findAll({
      where: { id: skillIds },
      attributes: ['id', 'name']
    });

    try {
      responseData.social_media_links = responseData.social_media_links ? JSON.parse(responseData.social_media_links) : [];
    } catch (e) { responseData.social_media_links = []; }

    try {
      if (typeof responseData.location === 'string') {
        const parsedLoc = JSON.parse(responseData.location);
        responseData.location = parsedLoc.address || parsedLoc;
      }
    } catch (e) { /* keep as is */ }

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: "Profile updated successfully",
      data: responseData,
    });

  } catch (error) {
    console.error("Edit Profile Error:", error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null,
    });
  }
};

exports.uploadProfileFiles = [
  upload.array('files[]', 10),

  async (req, res) => {
    try {
      const crew_member_id = req.user?.crew_member_id || req.body.crew_member_id;
      const { file_type } = req.params;

      const singleFileTypes = [
        'profile_photo',
        'resume',
        'portfolio'
      ];

      const allowedTypes = [
        ...singleFileTypes,
        'certifications',
        'recent_work',
        'equipment_photo'
      ];

      if (!allowedTypes.includes(file_type)) {
        return res.status(constants.BAD_REQUEST.code).json({
          error: true,
          code: constants.BAD_REQUEST.code,
          message: 'Invalid file type',
          data: null
        });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(constants.BAD_REQUEST.code).json({
          error: true,
          code: constants.BAD_REQUEST.code,
          message: 'No files uploaded',
          data: null
        });
      }

      const filesForUpload = { [file_type]: req.files };
      const uploadedFiles = await S3UploadFiles(filesForUpload);

      /* SINGLE FILE TYPES → UPDATE OR CREATE */
      if (singleFileTypes.includes(file_type)) {
        await crew_member_files.destroy({
          where: { crew_member_id, file_type }
        });

        // Insert only ONE (latest) file
        await crew_member_files.create({
          crew_member_id,
          file_type,
          file_path: uploadedFiles[0].file_path,
          // If title/tag provided even for portfolio
          title: Array.isArray(req.body.title) ? req.body.title[0] : req.body.title || null,
          tag: Array.isArray(req.body.tag) ? req.body.tag[0] : req.body.tag || "[]"
        });
      } 
      /* MULTI FILE TYPES → BULK CREATE (e.g. recent_work) */
      else {
        const records = uploadedFiles.map((file, index) => {
          let finalTitle = null;
          let finalTags = "[]";

          if (file_type === 'recent_work') {
            // Extract Title from body
            if (req.body.title) {
              finalTitle = Array.isArray(req.body.title) 
                ? req.body.title[index] 
                : req.body.title;
            }

            // Extract Tags from body
            if (req.body.tag) {
              finalTags = Array.isArray(req.body.tag) 
                ? req.body.tag[index] 
                : req.body.tag;
            }
          } else {
            // Default logic for certifications/other
            finalTitle = file_type.charAt(0).toUpperCase() + file_type.slice(1);
          }

          return {
            crew_member_id,
            file_type,
            file_path: file.file_path,
            title: finalTitle || "Untitled",
            tag: finalTags || "[]",
            is_active: true
          };
        });

        await crew_member_files.bulkCreate(records);
      }

      // await common.logActivity({
      //   crew_member_id,
      //   activity_type: 'profile_file_uploaded',
      //   title: 'Profile File Uploaded',
      //   description: `${file_type.replace('_', ' ')} uploaded successfully`,
      //   reference_id: crew_member_id,
      //   reference_type: 'crew_profile'
      // });

      return res.status(constants.OK.code).json({
        error: false,
        code: constants.OK.code,
        message: 'Files uploaded successfully',
        data: {}
      });

    } catch (err) {
      console.error(err);
      return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
        error: true,
        code: constants.INTERNAL_SERVER_ERROR.code,
        message: constants.INTERNAL_SERVER_ERROR.message,
        data: null
      });
    }
  }
];

exports.addPortfolioLinks = async (req, res) => {
  try {
    const crew_member_id = req.user?.crew_member_id || req.body.crew_member_id;
    const { portfolio_links } = req.body;

    // 1. Validation
    if (!crew_member_id) {
      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        code: constants.BAD_REQUEST.code,
        message: 'Crew member ID is required',
        data: null
      });
    }

    if (!portfolio_links || (Array.isArray(portfolio_links) && portfolio_links.length === 0)) {
      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        code: constants.BAD_REQUEST.code,
        message: 'No links provided',
        data: null
      });
    }

    // 2. Parse links if they are sent as a string (common in multipart/form-data)
    let linksArray = [];
    try {
      linksArray = typeof portfolio_links === 'string' ? JSON.parse(portfolio_links) : portfolio_links;
    } catch (e) {
      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        code: constants.BAD_REQUEST.code,
        message: 'Invalid JSON format for links',
        data: null
      });
    }

    // 3. Prepare records for the database
    const records = linksArray.map((link) => {
      return {
        crew_member_id,
        file_type: 'link',      // Unique type for links
        file_path: link.url,              // The actual URL (YouTube/Vimeo)
        title: link.title || "Untitled",  // User provided title
        tag: link.platform || "other",    // Platform name (youtube, vimeo, drive)
        is_active: 1
      };
    });

    // 4. Save to database
    await crew_member_files.bulkCreate(records);

    // 5. Success Response (Matching your format)
    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: 'Portfolio links added successfully',
      data: {}
    });

  } catch (err) {
    console.error('addPortfolioLinks error:', err);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null
    });
  }
};

exports.editPortfolioLink = async (req, res) => {
  try {
    const crew_member_id = req.user?.crew_member_id || req.body.crew_member_id;
    const { crew_files_id } = req.params;
    const { url, title, platform } = req.body;

    // 1. Validation
    if (!crew_files_id || !crew_member_id) {
      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        code: constants.BAD_REQUEST.code,
        message: 'File ID and Member ID are required',
        data: null
      });
    }

    // 2. Find the existing link record
    const linkRecord = await crew_member_files.findOne({
      where: {
        crew_files_id,
        crew_member_id,
        file_type: ['link', 'portfolio_link'], // Ensure we are only editing a link
        is_active: 1
      }
    });

    if (!linkRecord) {
      return res.status(constants.NOT_FOUND.code).json({
        error: true,
        code: constants.NOT_FOUND.code,
        message: 'Portfolio link not found',
        data: null
      });
    }

    // 3. Update the fields (only if they are provided in the request)
    await linkRecord.update({
      file_path: url || linkRecord.file_path,
      title: title || linkRecord.title,
      tag: platform || linkRecord.tag
    });

    // 4. Success Response
    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: 'Portfolio link updated successfully',
      data: {}
    });

  } catch (err) {
    console.error('editPortfolioLink error:', err);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null
    });
  }
};

exports.deleteProfileFile = async (req, res) => {
  try {
    const crew_member_id = req.body.crew_member_id;
    const { crew_files_id } = req.params;

    if (!crew_files_id) {
      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        code: constants.BAD_REQUEST.code,
        message: 'File ID is required',
        data: null
      });
    }

    const file = await crew_member_files.findOne({
      where: {
        crew_files_id,
        crew_member_id,
        is_active: 1
      }
    });

    if (!file) {
      return res.status(constants.NOT_FOUND.code).json({
        error: true,
        code: constants.NOT_FOUND.code,
        message: 'File not found',
        data: null
      });
    }

    /* OPTIONAL: Delete from S3 */
    // if (file.file_path) {
    //   try {
    //     await deleteFromS3(file.file_path); // your S3 helper
    //   } catch (s3Err) {
    //     console.error('S3 delete failed:', s3Err);
    //     // continue — DB delete should not depend on S3
    //   }
    // }

    await file.update({ is_active: 0 });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: 'File deleted successfully',
      data: {}
    });

  } catch (err) {
    console.error('deleteProfileFile error:', err);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null
    });
  }
};

exports.getMyEquipment = async (req, res) => {
  try {
    const crew_member_id = req.user.crew_member_id || req.body;

    const data = await crew_equipment.findAll({
      where: {
        crew_member_id,
        is_active: 1
      },
      include: [{
        model: equipment,
        as: 'equipment',
        attributes: [
          'equipment_id',
          'equipment_name',
          'manufacturer',
          'model_number'
        ]
      },
      {
        model: crew_equipment_photos,
        as: 'crew_equipment_photos',
        attributes: [
          'crew_equipment_photo_id',
          'file_url',
          'sort_order'
        ]
      }],
      order: [['created_at', 'DESC']]
    });
    
    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: constants.OK.message,
      data: data
    });

  } catch (err) {
    console.error(err);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null,
    });
  }
};

exports.getMyEquipmentById = async (req, res) => {
  try {
    const crew_member_id = req.user.crew_member_id || req.body;
    const { equipment_id } = req.params;

    const record = await crew_equipment.findOne({
      where: {
        crew_member_id,
        equipment_id,
        is_active: 1
      },
      include: [{
        model: equipment,
        as: 'equipment',
        attributes: ['equipment_name', 'manufacturer', 'model_number']
      }]
    });

    if (!record) {
      return res.status(constants.NOT_FOUND.code).json({
        error: false,
        code: constants.NOT_FOUND.code,
        message: constants.NOT_FOUND.message,
        data: data
      });
    }

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: constants.OK.message,
      data: record
    });

  } catch (err) {
    console.error(err);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null,
    });
  }
};

exports.saveMyEquipment = async (req, res) => {
  try {
    const crew_member_id = req.user.crew_member_id || req.body;

    const {
      crew_equipment_id,
      equipment_name,
      category_id,
      manufacturer,
      model,
      model_number,
      serial_number,
      description,
      market_price,
      rental_price,
      rental_price_type,
      is_available_for_rent,
      storage_location,
      condition_notes,
      last_maintenance_date,  // New field added
      equipment_on_maintenance,  // New field added
      is_draft = 0
    } = req.body;

    if (!equipment_name) {
      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        code: constants.BAD_REQUEST.code,
        message: 'Equipment name is required',
        data: null
      });
    }

    let record;

    if (!crew_equipment_id) {
      // Create new equipment record
      record = await crew_equipment.create({
        crew_member_id,
        equipment_name,
        category_id,
        manufacturer,
        model,
        model_number,
        serial_number,
        description,
        market_price,
        rental_price,
        rental_price_type,
        is_available_for_rent,
        storage_location,
        condition_notes,
        last_maintenance_date,  // Add new field to create
        equipment_on_maintenance,  // Add new field to create
        is_draft,
        is_completed: is_draft ? 0 : 1,
        is_active: 1
      });
      await common.logActivity({
        crew_member_id,
        activity_type: 'equipment_added',
        title: 'Equipment Added',
        description: `${equipment_name} was added to your equipment list`,
        reference_id: record.crew_equipment_id,
        reference_type: 'crew_equipment'
      });
    } else {
      // Update existing equipment record
      record = await crew_equipment.findOne({
        where: {
          crew_equipment_id,
          crew_member_id,
          is_active: 1
        }
      });

      if (!record) {
        return res.status(constants.NOT_FOUND.code).json({
          error: true,
          code: constants.NOT_FOUND.code,
          message: 'Equipment not found',
          data: null
        });
      }

      await record.update({
        equipment_name,
        category_id,
        manufacturer,
        model,
        model_number,
        serial_number,
        description,
        market_price,
        rental_price,
        rental_price_type,
        is_available_for_rent,
        storage_location,
        condition_notes,
        last_maintenance_date,  // Add new field to update
        equipment_on_maintenance,  // Add new field to update
        is_draft,
        is_completed: is_draft ? 0 : 1
      });
      await common.logActivity({
        crew_member_id,
        activity_type: 'equipment_updated',
        title: 'Equipment Updated',
        description: `${equipment_name} details were updated`,
        reference_id: record.crew_equipment_id,
        reference_type: 'crew_equipment'
      });
    }

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: 'Crew equipment saved successfully',
      data: {
        crew_equipment_id: record.crew_equipment_id
      }
    });

  } catch (err) {
    console.error('saveMyEquipment error:', err);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null
    });
  }
};


exports.uploadCrewEquipmentPhotos = [
  upload.array('photos[]', 10),

  async (req, res) => {
    try {
      const crew_member_id = req.user.crew_member_id || req.body;
      const { crew_equipment_id } = req.params;

      console.log('FILES:', req.files); // should NOT be empty now

      const equipment = await crew_equipment.findOne({
        where: {
          crew_equipment_id: crew_equipment_id,
          crew_member_id,
          is_active: 1
        }
      });

      if (!equipment) {
        return res.status(constants.NOT_FOUND.code).json({
          error: true,
          code: constants.NOT_FOUND.code,
          message: 'Crew equipment not found',
          data: null
        });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(constants.BAD_REQUEST.code).json({
          error: true,
          code: constants.BAD_REQUEST.code,
          message: 'No images uploaded',
          data: null
        });
      }

      const uploadedFiles = await S3UploadFiles({ photos: req.files });

      let sortOrder = 0;

      let files = [];
      for (const file of uploadedFiles) {
        files.push({
          crew_equipment_id,
          file_url: file.file_path,
          sort_order: sortOrder++
        });
      }
      await crew_equipment_photos.bulkCreate(files);

      return res.status(constants.OK.code).json({
        error: false,
        code: constants.OK.code,
        message: 'Equipment photos uploaded successfully',
        data: {}
      });

    } catch (err) {
      console.error(err);
      return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
        error: true,
        code: constants.INTERNAL_SERVER_ERROR.code,
        message: constants.INTERNAL_SERVER_ERROR.message,
        data: null
      });
    }
  }
];

exports.deleteMyEquipment = async (req, res) => {
  try {
    const crew_member_id = req.user.crew_member_id || req.body;
    const { id } = req.params;

    const record = await crew_equipment.findOne({
      where: {
        crew_equipment_id: id,
        crew_member_id,
        is_active: 1
      }
    });

    if (!record) {
      return res.status(constants.NOT_FOUND.code).json({
        error: true,
        code: constants.NOT_FOUND.code,
        message: 'Equipment not found',
        data: null
      });
    }

    await record.update({ is_active: 0 });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: 'Equipment deleted successfully',
      data: {}
    });

  } catch (err) {
    console.error(err);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null
    });
  }
};

exports.getRecentActivity = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    console.log(req.user.crew_member_id)

    const recentActivities = await activity_logs.findAll({
      where: {
        is_active: 1,
        crew_member_id: req.user.crew_member_id || req.body,
      },
      attributes: ['activity_id', 'crew_member_id', 'activity_type', 'title', 'description', 'reference_id', 'reference_type', 'created_at'],
      include: [
        {
          model: crew_members,
          as: 'crew_member',
          attributes: ['first_name', 'last_name', 'primary_role'],
          required: false
        }
      ],
      order: [['created_at', 'DESC']],
      limit: limit
    });

    // Map activity types to icons
    const iconMap = {
      'project_assigned': 'FileText',
      'request_accepted': 'Users',
      'equipment_booked': 'Package',
      'equipment_assigned': 'Package',
      'task_assigned': 'CheckSquare',
      'crew_member_added': 'Users',
      'equipment_added': 'Package',
      'equipment_updated': 'Package'
    };

    // Transform the data to match the expected response format
    const activities = recentActivities.map(activity => {
      const crewName = activity.crew_member
        ? `${activity.crew_member.first_name} ${activity.crew_member.last_name}`
        : 'System';

      return {
        type: activity.activity_type,
        title: activity.title,
        description: activity.description,
        timestamp: activity.created_at,
        icon: iconMap[activity.activity_type] || 'Activity',
        metadata: {
          activity_id: activity.activity_id,
          crew_member_id: activity.crew_member_id,
          reference_id: activity.reference_id,
          reference_type: activity.reference_type,
          crew_name: crewName
        }
      };
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: 'Recent activities retrieved successfully',
      data: activities,
      total: activities.length
    });

  } catch (error) {
    console.error('Get Recent Activity Error:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null
    });
  }
};

exports.getEquipment = async (req, res) => {
  try {
    const { search, category_id, location_id, group_by } = req.query;

    let where = { is_active: 1 };

    if (search) {
      where[Op.or] = [
        { equipment_name: { [Op.like]: `%${search}%` } },
        { manufacturer: { [Op.like]: `%${search}%` } },
        { model_number: { [Op.like]: `%${search}%` } },
        { serial_number: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } }
      ];
    }

    if (category_id) where.category_id = category_id;
    if (location_id) where.storage_location_id = location_id;

    const list = await equipment.findAll({
      where,
      include: [
        { model: equipment_photos, as: 'equipment_photos', attributes: ['photo_id', 'file_url', 'created_at'] },
        { model: equipment_documents, as: 'equipment_documents', attributes: ['document_id', 'doc_type', 'file_url', 'created_at'] },
        { model: equipment_specs, as: 'equipment_specs', attributes: ['spec_id', 'spec_name', 'spec_value'] },
        { model: equipment_accessories, as: 'equipment_accessories', attributes: ['accessory_id', 'accessory_name'] }
      ],
      order: [['equipment_id', 'ASC']]
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeAssignments = await equipment_assignments.findAll({
      where: {
        check_out_date: { [Op.lte]: today },
        expected_return_date: { [Op.gte]: today }
      }
    });

    const inUseMap = {};
    activeAssignments.forEach(a => {
      inUseMap[a.equipment_id] = a;
    });

    const processedList = list.map(item => {
      const loc = item.storage_location; 

      if (!loc) return item;

      if (typeof loc === 'string' && (loc.startsWith('{') || loc.startsWith('['))) {
        try {
          const parsed = JSON.parse(loc);
          return {
            ...item.toJSON(),
            storage_location: parsed.address || parsed || loc,
          };
        } catch {
          return { ...item.toJSON(), storage_location: loc };
        }
      }

      return { ...item.toJSON(), storage_location: loc };
    });

    const total_equipment = await equipment.count({ where });

    const status_1_count = processedList.filter(i => i.initial_status_id == 1).length;
    const status_2_count = processedList.filter(i => i.initial_status_id == 2).length;
    const status_3_count = processedList.filter(i => i.initial_status_id == 3).length;

    const in_use_today_count = Object.keys(inUseMap).length;

    return res.status(200).json({
      error: false,
      code: 200,
      summary: {
        total_equipment,
        status_1_count,
        status_2_count,
        status_3_count,
        in_use_today_count
      },
      message: "Equipment fetched successfully",
      data: processedList
    });

  } catch (error) {
    console.error("Get Equipment Error:", error);
    return res.status(500).json({
      error: true,
      code: 500,
      message: "Internal Server Error",
      data: null
    });
  }
};

exports.submitEquipmentRequest = async (req, res) => {
  try {
    const crew_member_id = req.user.crew_member_id || req.body;

    const { 
      rental_purpose, 
      projectId, 
      otherPurposeReason, 
      checkoutDate, 
      expectedReturnDate,
      equipmentId 
    } = req.body;

    if (!crew_member_id || !equipmentId || rental_purpose === undefined) {
      return res.status(400).json({
        error: true,
        message: "Crew member ID, equipment ID, and rental purpose are required",
      });
    }

    if (rental_purpose === 2) {
      if (!checkoutDate || !expectedReturnDate) {
        return res.status(400).json({
          error: true,
          message: "Checkout date and expected return date are required for 'Other' rental purpose",
        });
      }
    }

    const crewMember = await crew_members.findOne({
      where: { crew_member_id },
    });

    if (!crewMember) {
      return res.status(404).json({
        error: true,
        message: "Crew member not found",
      });
    }

    const newRequest = {
      crew_member_id,
      rental_purpose: rental_purpose === 1 ? 1 : 2, 
      project_id: rental_purpose === 1 ? projectId : null,
      purpose: rental_purpose === 2 ? otherPurposeReason : null,
      equipment_id: equipmentId,
      admin_accept: 0,
      is_active: 1,
      created_at: new Date(),
      checkout_date: rental_purpose === 2 ? checkoutDate : null,
      expected_return_date: rental_purpose === 2 ? expectedReturnDate : null,
    };

    const equipmentRequest = await equipment_requests.create(newRequest);

    return res.status(201).json({
      error: false,
      message: "Equipment request submitted successfully",
      data: equipmentRequest,
    });
  } catch (error) {
    console.error("Error submitting equipment request:", error);
    return res.status(500).json({
      error: true,
      message: "Something went wrong while submitting the equipment request",
    });
  }
};

exports.getEquipmentRequests = async (req, res) => {
  try {
    const crew_member_id = req.user.crew_member_id || req.body;

    if (!crew_member_id) {
      return res.status(400).json({
        error: true,
        message: "Crew member ID is required",
      });
    }

    const equipmentRequests = await equipment_requests.findAll({
      where: { crew_member_id },
      include: [
        {
          model: equipment,
          as: 'equipment',
          attributes: ['equipment_id', 'equipment_name'],
        },
        {
          model: stream_project_booking, 
          as: 'project',
          attributes: ['stream_project_booking_id', 'project_name', 'event_date'],
        },
      ],
    });

    if (equipmentRequests.length === 0) {
      return res.status(200).json({
        error: false,
        message: "No equipment requests found for this crew member",
        data: [],
      });
    }

    return res.status(200).json({
      error: false,
      message: "Equipment requests fetched successfully",
      data: equipmentRequests.map(request => {
        return {
          ...request.toJSON(),
          equipment: request.equipment,
          project: request.project,
        };
      }),
    });
  } catch (error) {
    console.error("Error fetching equipment requests:", error);
    return res.status(500).json({
      error: true,
      message: "Something went wrong while fetching the equipment requests",
    });
  }
};

exports.deleteEquipmentPhoto = async (req, res) => {
  try {
    const { crew_equipment_photo_id } = req.body; 

    if (!crew_equipment_photo_id) {
      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        code: constants.BAD_REQUEST.code,
        message: 'Photo ID is required',
        data: null
      });
    }

    const photo = await crew_equipment_photos.findOne({
      where: { crew_equipment_photo_id }
    });

    if (!photo) {
      return res.status(constants.NOT_FOUND.code).json({
        error: true,
        code: constants.NOT_FOUND.code,
        message: 'Photo not found',
        data: null
      });
    }

    // Delete the record from the database
    await photo.destroy();

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: 'Photo deleted successfully',
      success: true,
      data: null
    });

  } catch (err) {
    console.error('deleteEquipmentPhoto error:', err);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null
    });
  }
};

exports.getDashboardDetails = async (req, res) => {
  try {
    const crew_member_id = req.user?.crew_member_id || req.body.crew_member_id;
    const { date_filter, start_date, end_date, status } = req.body;

    const projectWhere = {};

    if (status === 'active') {
      projectWhere.is_completed = 0;
      projectWhere.is_cancelled = 0;
    }

    if (status == 'completed') {
      projectWhere.is_completed = 1;
    }

    if (status === 'cancelled') {
      projectWhere.is_cancelled = 1;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (date_filter === 'today') {
      projectWhere.event_date = today;
    }

    if (date_filter === 'upcoming') {
      projectWhere.event_date = {
        [Sequelize.Op.gt]: today
      };
    }

    if (date_filter === 'this_week') {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);

      projectWhere.event_date = {
        [Sequelize.Op.between]: [startOfWeek, endOfWeek]
      };
    }

    if (date_filter === 'this_month') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

      projectWhere.event_date = {
        [Sequelize.Op.between]: [startOfMonth, endOfMonth]
      };
    }

    if (date_filter === 'custom' && start_date && end_date) {
      projectWhere.event_date = {
        [Sequelize.Op.between]: [start_date, end_date]
      };
    }

    console.log("projectWhere---------", projectWhere);
    const allShoots = await assigned_crew.findAll({
      where: {
        crew_accept: 1,
        crew_member_id: crew_member_id,
      },
      include: [
        {
          model: stream_project_booking,
          as: "project",
          where: projectWhere,
          required: true,
        },
      ],
      order: [
        [{ model: stream_project_booking, as: "project" }, "event_date", "ASC"]
      ]
    });

    // Pending Requests (Assigned projects with crew_accept = 0)
    const pendingRequests = await assigned_crew.findAll({
      where: {
        crew_accept: 0,
        crew_member_id: crew_member_id,
      },
      include: [
        {
          model: stream_project_booking,
          as: "project",
          where: {
            ...projectWhere,
            is_completed: 0
          },
          required: true,
        },
      ],
    });

    return res.status(200).json({
      error: false,
      message: 'Dashboard details fetched successfully',
      data: {
        allShoots,
        pendingRequests,
        equipmentRequests: 5,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard details:', error);
    return res.status(500).json({
      error: true,
      message: 'Something went wrong while fetching dashboard details',
    });
  }
};

exports.getCrewShootStats = async (req, res) => {
  try {
    const { crew_member_id } = req.body || req.query;

    if (!crew_member_id) {
      return res.status(400).json({
        error: true,
        message: "crew_member_id is required",
      });
    }

    const today = new Date();

    /** 1️⃣ Completed Shoots */
    const completedShoots = await stream_project_booking.count({
      where: {
        is_completed: 1,
      },
      include: [
        {
          model: assigned_crew,
          as: "assigned_crews",
          required: true,
          where: { crew_member_id },
        },
      ],
    });

    /** 2️⃣ Pending Shoots (accepted, upcoming, not completed) */
    const pendingShoots = await stream_project_booking.count({
      where: {
        is_completed: 0,
        event_date: { [Sequelize.Op.gt]: today },
      },
      include: [
        {
          model: assigned_crew,
          as: "assigned_crews",
          required: true,
          where: {
            crew_member_id,
            crew_accept: 1,
          },
        },
      ],
    });

    /** 3️⃣ Rejected Shoots */
    const rejectedShoots = await assigned_crew.count({
      where: {
        crew_member_id,
        crew_accept: 2,
      },
      include: [
        {
          model: stream_project_booking,
          as: "project",
          required: true,
        },
      ],
    });

    /** 4️⃣ Shoot Requests */
    const shootRequests = await assigned_crew.count({
      where: {
        crew_member_id,
        crew_accept: 0,
      },
      include: [
        {
          model: stream_project_booking,
          as: "project",
          required: true,
          where: { is_completed: 0 },
        },
      ],
    });

    /** 5️⃣ Photography Shoots (crew_roles + skills_needed from booking table) */
    const photographyShoots = await stream_project_booking.count({
      where: {
        crew_roles: 10,
        skills_needed: {
          [Sequelize.Op.like]: "%photographer%",
        },
      },
      include: [
        {
          model: assigned_crew,
          as: "assigned_crews",
          required: true,
          where: { crew_member_id },
        },
      ],
    });

    return res.status(200).json({
      error: false,
      message: "Crew shoot stats fetched successfully",
      data: {
        completedShoots,
        pendingShoots,
        rejectedShoots,
        shootRequests,
        photographyShoots,
      },
    });
  } catch (error) {
    console.error("Error fetching crew shoot stats:", error);
    return res.status(500).json({
      error: true,
      message: "Something went wrong while fetching crew shoot stats",
    });
  }
};


exports.getRandomCrewMembers = async (req, res) => {
  try {
    const members = await crew_members.findAll({
      where: {
        is_active: 1,
        is_crew_verified: 1,
      },
      include: [
        {
          model: crew_member_files,
          as: 'crew_member_files',
          attributes: ['crew_files_id', 'file_type', 'file_path'],
        },
        {
          model: crew_roles,
          as: 'role',
          attributes: ['role_name'],
        },
      ],
      order: Sequelize.literal('RAND()'),
      limit: 5,
    });

    const processedMembers = members.map((member) => {
      let loc = member.location;
      let finalLocation = loc;

      if (loc && typeof loc === 'string' && (loc.startsWith('{') || loc.startsWith('['))) {
        try {
          const parsed = JSON.parse(loc);
          finalLocation = parsed.address || parsed || loc;
        } catch {
          finalLocation = loc;
        }
      }

      let firstName = member.first_name || '';
      let lastName = member.last_name || '';

      const formattedFirstName =
        firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();

      const formattedLastName =
        lastName ? lastName.charAt(0).toUpperCase() : '';

      return {
        ...member.toJSON(),
        first_name: formattedFirstName,
        last_name: formattedLastName,
        location: finalLocation,
        status: 'approved',
      };
    });

    return res.status(200).json({
      error: false,
      message: 'Random crew members fetched successfully',
      data: processedMembers,
    });
  } catch (error) {
    console.error('Get Random Crew Members Error:', error);
    return res.status(500).json({
      error: true,
      message: 'Internal server error',
    });
  }
};


exports.checkVerificationStatus = async (req, res) => {
  try {
    const { crew_member_id } = req.body;

    if (!crew_member_id) {
      return res.status(400).json({
        error: true,
        message: "crew_member_id is required"
      });
    }

    const member = await crew_members.findOne({
      where: { crew_member_id: crew_member_id },
      attributes: ['crew_member_id', 'is_crew_verified', 'first_name', 'email']
    });

    if (!member) {
      return res.status(constants.NOT_FOUND.code).json({
        error: true,
        code: constants.NOT_FOUND.code,
        message: `Crew member not found`,
        data: null,
      });
    }

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: "Status fetched successfully",
      data: {
        is_crew_verified: member.is_crew_verified,
        name: member.name,
        email: member.email
      },
    });

  } catch (error) {
    console.error("Check Verification Error:", error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null,
    });
  }
};