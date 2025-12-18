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
  crew_availability } = require('../models');

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
  limits: { fileSize: 10 * 1024 * 1024 },
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


exports.getDashboardCounts = async (req, res) => {
  try {
    const { creator_id } = req.body || req.query;

    if (!creator_id) {
      return res.status(400).json({
        error: true,
        message: "creator_id is required",
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
            crew_member_id: creator_id,
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
            crew_member_id: creator_id,
          },
          required: true,
        },
      ],
    });

    const pendingRequests = await assigned_crew.count({
      where: {
        crew_accept: 0,
        crew_member_id: creator_id,
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
      return res.status(400).json({
        error: true,
        message: "crew_member_id is required",
      });
    }

    const pendingRequests = await assigned_crew.findAll({
      where: {
        crew_member_id: crew_member_id,
        crew_accept: 0,
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

    if (pendingRequests.length === 0) {
      return res.status(404).json({
        error: true,
        message: "No pending requests found for the given crew member.",
      });
    }

    const projectDetails = pendingRequests.map((request) => {
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
      message: "Pending requests fetched successfully",
      data: projectDetails,
    });
  } catch (error) {
    console.error('Error fetching pending requests:', error);
    return res.status(500).json({
      error: true,
      message: 'Something went wrong while fetching pending requests',
    });
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

    if (!crew_member_id || !project_id || !crew_accept) {
      return res.status(400).json({
        error: true,
        message: "crew_member_id, project_id and crew_accept are required.",
      });
    }

    if (![1, 2].includes(crew_accept)) {
      return res.status(400).json({
        error: true,
        message: "Invalid crew_accept value. Allowed values: 1 (Accept), 2 (Decline).",
      });
    }

    const pendingRequest = await assigned_crew.findOne({
      where: {
        crew_member_id,
        project_id,
        crew_accept: 0,
      },
    });

    if (!pendingRequest) {
      return res.status(404).json({
        error: true,
        message: "No pending request found for this crew member and project.",
      });
    }

    pendingRequest.crew_accept = crew_accept;
    await pendingRequest.save();

    return res.status(200).json({
      error: false,
      message:
        crew_accept === 1
          ? "Request accepted successfully."
          : "Request declined successfully.",
    });

  } catch (error) {
    console.error("Error updating request status:", error);
    return res.status(500).json({
      error: true,
      message: "Something went wrong while updating the request status.",
    });
  }
};


exports.getAcceptedAndUpcomingProjects = async (req, res) => {
  try {
    const { crew_member_id } = req.body || req.query;

    if (!crew_member_id) {
      return res.status(400).json({
        error: true,
        message: "crew_member_id is required",
      });
    }

    const projects = await assigned_crew.findAll({
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
            event_date: { [Sequelize.Op.gt]: new Date() },
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

    if (projects.length === 0) {
      return res.status(404).json({
        error: true,
        message: "No accepted upcoming projects found for the given crew member.",
      });
    }

    const projectDetails = projects.map((request) => {
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
      message: "Accepted and upcoming projects fetched successfully",
      data: projectDetails,
    });
  } catch (error) {
    console.error('Error fetching accepted upcoming projects:', error);
    return res.status(500).json({
      error: true,
      message: 'Something went wrong while fetching accepted upcoming projects',
    });
  }
};


exports.getCrewAvailability = async (req, res) => {
  try {
    const { crew_member_id, year, month } = req.body || req.query;

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
      availability = JSON.parse(crewMember.availability || '[]');
    } catch (err) {
      availability = [];
    }

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
            event_date: { [Sequelize.Op.gte]: moment(`${year}-${month}-01`).startOf('month').toDate() },
            event_date: { [Sequelize.Op.lte]: moment(`${year}-${month}-01`).endOf('month').toDate() },
          },
          attributes: ['event_date', 'stream_project_booking_id', 'project_name', 'start_time', 'end_time', 'event_location'],
        },
      ],
    });

    const customAvailability = await crew_availability.findAll({
      where: {
        crew_member_id,
        date: {
          [Sequelize.Op.gte]: moment(`${year}-${month}-01`).startOf('month').toDate(),
          [Sequelize.Op.lte]: moment(`${year}-${month}-01`).endOf('month').toDate(),
        },
      },
    });

    const calendar = {};

    const daysInMonth = moment(`${year}-${month}`, "YYYY-MM").daysInMonth();
    for (let day = 1; day <= daysInMonth; day++) {
      const date = moment(`${year}-${month}-${day}`, "YYYY-MM-DD");

      calendar[date.format('YYYY-MM-DD')] = {
        available: false,
        projectAssigned: false,
        projectDetails: null,
        customAvailabilityStatus: null,
      };

      if (availability.includes(date.format('dddd'))) {
        calendar[date.format('YYYY-MM-DD')].available = true;
      }

      const customAvailabilityForDay = customAvailability.find(avail => moment(avail.date).isSame(date, 'day'));
      if (customAvailabilityForDay) {
        calendar[date.format('YYYY-MM-DD')].available = customAvailabilityForDay.availability_status === '1';
        calendar[date.format('YYYY-MM-DD')].customAvailabilityStatus = customAvailabilityForDay.availability_status;
      }
    }

    for (let project of acceptedProjects) {
      const eventDate = moment(project.project.event_date).format('YYYY-MM-DD');
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
    console.error('Error fetching crew availability:', error);
    return res.status(500).json({
      error: true,
      message: 'Something went wrong while fetching crew availability',
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
    const {
      crew_member_id,
      date,
      availability_status,
      start_time,
      end_time,
      location,
      recurrence,
      notes,
      is_full_day // NEW FIELD
    } = req.body;

    if (!crew_member_id || !date || !availability_status) {
      return res.status(400).json({
        error: true,
        message: "crew_member_id, date, and availability_status are required",
      });
    }

    // Default is_full_day to 0 if not provided
    const fullDayValue = is_full_day !== undefined ? is_full_day : 0;

    const existingAvailability = await crew_availability.findOne({
      where: {
        crew_member_id,
        date,
      },
    });

    if (existingAvailability) {
      existingAvailability.availability_status = availability_status;
      existingAvailability.start_time = start_time;
      existingAvailability.end_time = end_time;
      existingAvailability.location = location;
      existingAvailability.recurrence = recurrence;
      existingAvailability.notes = notes;
      existingAvailability.is_full_day = fullDayValue; // ✅ update field

      await existingAvailability.save();

      return res.status(200).json({
        error: false,
        message: "Crew availability updated successfully",
        data: existingAvailability,
      });
    }

    const newAvailability = await crew_availability.create({
      crew_member_id,
      date,
      availability_status,
      start_time,
      end_time,
      location,
      recurrence,
      notes,
      is_full_day: fullDayValue, // ✅ insert field
    });

    return res.status(201).json({
      error: false,
      message: "Crew availability added successfully",
      data: newAvailability,
    });
  } catch (error) {
    console.error("Error setting crew availability:", error);
    return res.status(500).json({
      error: true,
      message: "Something went wrong while setting crew availability",
    });
  }
};


exports.getDashboardRequestCounts = async (req, res) => {
  try {
    const { creator_id } = req.body || req.query;

    if (!creator_id) {
      return res.status(400).json({
        error: true,
        message: "creator_id is required",
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
            crew_member_id: creator_id,
          },
          required: true,
        },
      ],
    });

    const pendingRequests = await assigned_crew.count({
      where: {
        crew_member_id: creator_id,
        crew_accept: 0,
      },
      include: [
        {
          model: stream_project_booking,
          as: "project",
          where: {
            is_completed: 0,
          },
          required: true,
        },
      ],
    });

    const confirmedRequests = await assigned_crew.count({
      where: {
        crew_member_id: creator_id,
        crew_accept: 1,
      },
      include: [
        {
          model: stream_project_booking,
          as: "project",
          required: true,
        },
      ],
    });

    const declinedRequests = await assigned_crew.count({
      where: {
        crew_member_id: creator_id,
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

    return res.status(200).json({
      error: false,
      message: "Dashboard request counts fetched successfully",
      data: {
        pendingRequests,
        confirmedRequests,
        declinedRequests,
        completedShoots,
      },
    });
  } catch (error) {
    console.error("Error fetching dashboard request counts:", error);
    return res.status(500).json({
      error: true,
      message: "Something went wrong while fetching dashboard request counts",
    });
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
