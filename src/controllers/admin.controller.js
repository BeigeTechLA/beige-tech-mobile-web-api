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
  event_type_master } = require('../models');

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


// exports.createProject = async (req, res) => {
//   try {
//     console.log("Controller - req.body:", req.body);
//     const {
//       project_name,
//       description,
//       event_type,
//       event_date,
//       duration_hours,
//       budget,
//       expected_viewers,
//       stream_quality,
//       crew_size_needed,
//       event_location,
//       streaming_platforms,
//       crew_roles,
//       required_skills,
//       equipments_needed,
//     } = req.body || {};
//     console.log("body", req.body);

//     if (!project_name) {
//       return res.status(constants.BAD_REQUEST.code).json({
//         error: true,
//         code: constants.BAD_REQUEST.code,
//         message: "project_name is required",
//         data: null,
//       });
//     }

//     const platformsArr = toArray(streaming_platforms);
//     const rolesArr = toArray(crew_roles);
//     const skillsArr = toArray(required_skills);
//     const eqIdsArr = toArray(equipments_needed);

//     if (platformsArr.length === 0) {
//       return res.status(constants.BAD_REQUEST.code).json({
//         error: true,
//         code: constants.BAD_REQUEST.code,
//         message: "Select at least one streaming platform",
//         data: null,
//       });
//     }

//     if (rolesArr.length === 0) {
//       return res.status(constants.BAD_REQUEST.code).json({
//         error: true,
//         code: constants.BAD_REQUEST.code,
//         message: "Select at least one crew role",
//         data: null,
//       });
//     }

//     if (skillsArr.length === 0) {
//       return res.status(constants.BAD_REQUEST.code).json({
//         error: true,
//         code: constants.BAD_REQUEST.code,
//         message: "Select at least one required skill",
//         data: null,
//       });
//     }

//    if (eqIdsArr.length === 0) {
//       return res.status(constants.BAD_REQUEST.code).json({
//         error: true,
//         code: constants.BAD_REQUEST.code,
//         message: "Select at least one equipment",
//         data: null,
//       });
//     }

//     const booking = await stream_project_booking.create({
//       project_name,
//       description,
//       event_type,
//       event_date: event_date || null,
//       duration_hours: duration_hours ?? null,
//       budget: budget ?? null,
//       expected_viewers: expected_viewers ?? null,
//       stream_quality: stream_quality || null,
//       crew_size_needed: crew_size_needed ?? null,
//       event_location: event_location || null,

//       streaming_platforms: toDbJson(platformsArr),
//       crew_roles: toDbJson(rolesArr),
//       skills_needed: toDbJson(skillsArr),
//       equipments_needed: toDbJson(eqIdsArr),
//       is_active: 1,
//       created_at: new Date()
//     });

//     return res.status(constants.CREATED.code).json({
//       error: false,
//       code: constants.CREATED.code,
//       message: "Booking saved successfully",
//       data: { id: booking.stream_project_booking_id, booking },
//     });

//   } catch (error) {
//     console.error("Create Booking Error:", error);
//     return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
//       error: true,
//       code: constants.INTERNAL_SERVER_ERROR.code,
//       message: error.message || constants.INTERNAL_SERVER_ERROR.message,
//       data: null,
//     });
//   }
// };


exports.createProject = async (req, res) => {
  try {
    console.log("Controller - req.body:", req.body);
    const {
      project_name,
      description,
      event_type,
      event_date,
      start_time,
      end_time,
      duration_hours,
      budget,
      expected_viewers,
      stream_quality,
      crew_size_needed,
      event_location,
      streaming_platforms,
      crew_roles,
      required_skills,
      equipments_needed,
      is_draft = 0,
      is_completed = 0,
      is_cancelled = 0
    } = req.body || {};

    console.log("body", req.body);

    if (!project_name) {
      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        code: constants.BAD_REQUEST.code,
        message: "project_name is required",
        data: null,
      });
    }

    const platformsArr = toArray(streaming_platforms);
    const rolesArr = toArray(crew_roles);
    const skillsArr = toArray(required_skills);
    const equipmentNamesArr = toArray(equipments_needed);

    if (platformsArr.length === 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        code: constants.BAD_REQUEST.code,
        message: "Select at least one streaming platform",
        data: null,
      });
    }

    if (rolesArr.length === 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        code: constants.BAD_REQUEST.code,
        message: "Select at least one crew role",
        data: null,
      });
    }

    if (skillsArr.length === 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        code: constants.BAD_REQUEST.code,
        message: "Select at least one required skill",
        data: null,
      });
    }

    if (equipmentNamesArr.length === 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        code: constants.BAD_REQUEST.code,
        message: "Select at least one equipment",
        data: null,
      });
    }

    const allEquipments = await equipment.findAll({
      where: {
        equipment_name: { [Sequelize.Op.in]: equipmentNamesArr }
      },
      attributes: ['equipment_id', 'equipment_name']
    });

    if (allEquipments.length !== equipmentNamesArr.length) {
      const existingNames = allEquipments.map(eq => eq.equipment_name);
      const missingNames = equipmentNamesArr.filter(name => !existingNames.includes(name));

      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        code: constants.BAD_REQUEST.code,
        message: `The following equipment names are invalid or not found: ${missingNames.join(', ')}`,
        data: null,
      });
    }

    const equipmentDetailsArr = allEquipments.map(eq => eq.equipment_name);

    const booking = await stream_project_booking.create({
      project_name,
      description,
      event_type,
      event_date: event_date || null,
      start_time: start_time || null,
      end_time: end_time || null,
      duration_hours: duration_hours ?? null,
      budget: budget ?? null,
      expected_viewers: expected_viewers ?? null,
      stream_quality: stream_quality || null,
      crew_size_needed: crew_size_needed ?? null,
      event_location: event_location || null,

      streaming_platforms: toDbJson(platformsArr),
      crew_roles: toDbJson(rolesArr),
      skills_needed: toDbJson(skillsArr),
      equipments_needed: toDbJson(equipmentDetailsArr),

      is_draft,
      is_completed,
      is_cancelled,

      is_active: 1,
      created_at: new Date()
    });

    const equipmentResponse = allEquipments.map(eq => ({
      equipment_id: eq.equipment_id,
      equipment_name: eq.equipment_name
    }));

    return res.status(constants.CREATED.code).json({
      error: false,
      code: constants.CREATED.code,
      message: "Booking saved successfully",
      data: { id: booking.stream_project_booking_id, booking, equipments: equipmentResponse },
    });

  } catch (error) {
    console.error("Create Booking Error:", error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: error.message || constants.INTERNAL_SERVER_ERROR.message,
      data: null,
    });
  }
};

exports.matchCrew = async (req, res) => {
  try {
    const { crew_roles, required_skills, crew_size_needed, location, hourly_rate } = req.body;

    if (!crew_roles || !required_skills) {
      return res.status(400).json({
        error: true,
        message: "crew_roles and required_skills are required",
      });
    }

    const rolesArr = Array.isArray(crew_roles)
      ? crew_roles.map(String)
      : [String(crew_roles)];

    const skillsArr = Array.isArray(required_skills)
      ? required_skills.map(String)
      : [String(required_skills)];

    const sizeNeeded = crew_size_needed ? parseInt(crew_size_needed) : null;

    const desiredHourlyRate = hourly_rate ? parseFloat(hourly_rate) : null;

    if (hourly_rate && isNaN(desiredHourlyRate)) {
      return res.status(400).json({
        error: true,
        message: "Invalid hourly_rate",
      });
    }

    const rateRange = 0.20;
    const lowerLimit = desiredHourlyRate ? desiredHourlyRate - (desiredHourlyRate * rateRange) : null;
    const upperLimit = desiredHourlyRate ? desiredHourlyRate + (desiredHourlyRate * rateRange) : null;

    let crewList = await crew_members.findAll({
      where: { is_active: 1 }
    });

    const parseSkills = (value) => {
      if (!value) return [];
      try {
        let parsed = JSON.parse(value);
        if (typeof parsed === "string") parsed = JSON.parse(parsed);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch { }
      return value.toString().split(",").map(s => s.trim());
    };

    let filtered = [];

    for (const crew of crewList) {
      const crewRole = crew.primary_role ? String(crew.primary_role) : null;
      const crewSkills = parseSkills(crew.skills || "[]");
      const crewLocation = crew.location ? crew.location.trim().toLowerCase() : "";
      const crewHourlyRate = crew.hourly_rate ? parseFloat(crew.hourly_rate) : null;

      const locationMatch = !location || crewLocation === location.trim().toLowerCase();

      const roleMatch = crewRole && rolesArr.includes(crewRole);

      const matchingSkills = crewSkills.filter(s => skillsArr.includes(s));
      const skillMatch = matchingSkills.length > 0;

      const hourlyRateMatch = !hourly_rate || (crewHourlyRate && crewHourlyRate >= lowerLimit && crewHourlyRate <= upperLimit);

      if (roleMatch && skillMatch && locationMatch && hourlyRateMatch) {
        filtered.push({
          ...crew.dataValues,
          matchCount: matchingSkills.length,
          hourly_rate: crewHourlyRate
        });
      }
    }

    filtered.sort((a, b) => b.matchCount - a.matchCount);

    // if (sizeNeeded && filtered.length > sizeNeeded) {
    //   filtered = filtered.slice(0, sizeNeeded);
    // }

    return res.status(200).json({
      error: false,
      message: "Crew matched successfully",
      data: filtered
    });
  } catch (error) {
    console.error("Match Crew Error:", error);
    return res.status(500).json({
      error: true,
      message: "Something went wrong",
      data: null,
    });
  }
};

// exports.matchCrew = async (req, res) => {
//   try {
//     const { crew_roles, required_skills, crew_size_needed, location, min_hourly_rate, max_hourly_rate } = req.body;

//     if (!crew_roles || !required_skills) {
//       return res.status(400).json({
//         error: true,
//         message: "crew_roles and required_skills are required",
//       });
//     }

//     const rolesArr = Array.isArray(crew_roles)
//       ? crew_roles.map(String)
//       : [String(crew_roles)];

//     const skillsArr = Array.isArray(required_skills)
//       ? required_skills.map(String)
//       : [String(required_skills)];

//     const sizeNeeded = crew_size_needed ? parseInt(crew_size_needed) : null;

//     const minRate = min_hourly_rate ? parseFloat(min_hourly_rate) : null;
//     const maxRate = max_hourly_rate ? parseFloat(max_hourly_rate) : null;

//     if ((min_hourly_rate && isNaN(minRate)) || (max_hourly_rate && isNaN(maxRate))) {
//       return res.status(400).json({
//         error: true,
//         message: "Invalid min_hourly_rate or max_hourly_rate",
//       });
//     }

//     let crewList = await crew_members.findAll({
//       where: { is_active: 1 }
//     });

//     const parseSkills = (value) => {
//       if (!value) return [];
//       try {
//         let parsed = JSON.parse(value);
//         if (typeof parsed === "string") parsed = JSON.parse(parsed);
//         if (Array.isArray(parsed)) return parsed.map(String);
//       } catch { }
//       return value.toString().split(",").map(s => s.trim());
//     };

//     let filtered = [];

//     for (const crew of crewList) {
//       const crewRole = crew.primary_role ? String(crew.primary_role) : null;
//       const crewSkills = parseSkills(crew.skills || "[]");
//       const crewLocation = crew.location ? crew.location.trim().toLowerCase() : "";
//       const crewHourlyRate = crew.hourly_rate ? parseFloat(crew.hourly_rate) : null;

//       // Check for location match
//       const locationMatch = !location || crewLocation === location.trim().toLowerCase();

//       const roleMatch = crewRole && rolesArr.includes(crewRole);

//       const matchingSkills = crewSkills.filter(s => skillsArr.includes(s));
//       const skillMatch = matchingSkills.length > 0;

//       const hourlyRateMatch = (!min_hourly_rate || crewHourlyRate >= minRate) && (!max_hourly_rate || crewHourlyRate <= maxRate);

//       if (roleMatch && skillMatch && locationMatch && hourlyRateMatch) {
//         filtered.push({
//           ...crew.dataValues,
//           matchCount: matchingSkills.length,
//           hourly_rate: crewHourlyRate
//         });
//       }
//     }

//     filtered.sort((a, b) => b.matchCount - a.matchCount);

//     if (sizeNeeded && filtered.length > sizeNeeded) {
//       filtered = filtered.slice(0, sizeNeeded);
//     }

//     return res.status(200).json({
//       error: false,
//       message: "Crew matched successfully",
//       data: filtered
//     });
//   } catch (error) {
//     console.error("Match Crew Error:", error);
//     return res.status(500).json({
//       error: true,
//       message: "Something went wrong",
//       data: null,
//     });
//   }
// };

exports.assignCrew = async (req, res) => {
  try {
    const { project_id, assigned_crew: crewIds } = req.body;
    console.log("ASSIGN CREW BODY:", req.body);

    // Validate input
    if (!crewIds || crewIds.length === 0) {
      return res.status(400).json({
        error: true,
        message: "No crew members selected",
      });
    }

    for (const crewId of crewIds) {
      await assigned_crew.create({
        project_id,
        crew_member_id: crewId,
        assigned_date: new Date(),
        status: 'assigned',
        is_active: 1,
      });
    }

    return res.status(200).json({
      error: false,
      message: 'Crew members assigned successfully',
    });

  } catch (error) {
    console.error('Error assigning crew:', error);
    return res.status(500).json({
      error: true,
      message: 'Error assigning crew',
    });
  }
};


exports.matchEquipment = async (req, res) => {
  try {
    const { crew_id, equipments_needed } = req.body;

    const crewArr = toIdArray(crew_id);
    const neededNamesArr = equipments_needed;

    if (crewArr.length === 0 || neededNamesArr.length === 0) {
      return res.status(400).json({
        error: true,
        message: "crew_id and equipments_needed are required",
      });
    }

    const allEquipments = await equipment.findAll({
      where: {
        equipment_name: { [Sequelize.Op.in]: neededNamesArr }
      },
      include: [
        { model: equipment_photos, as: "equipment_photos" },
        { model: equipment_documents, as: "equipment_documents" },
        { model: equipment_specs, as: "equipment_specs" },
        { model: equipment_accessories, as: "equipment_accessories" }
      ]
    });

    const eqMap = {};
    allEquipments.forEach(eq => {
      eqMap[eq.equipment_name] = eq;
    });

    if (Object.keys(eqMap).length === 0) {
      return res.status(404).json({
        error: true,
        message: "No equipment found with the provided names",
      });
    }

    const crews = await crew_members.findAll({
      where: { crew_member_id: crewArr }
    });

    const finalResult = [];

    for (const crew of crews) {
      let ownedNames = [];
      try {
        ownedNames = JSON.parse(crew.equipment_ownership);
      } catch (error) {
        ownedNames = Array.isArray(crew.equipment_ownership) ? crew.equipment_ownership : [];
      }

      ownedNames = ownedNames || [];

      const hasNames = neededNamesArr.filter(name => ownedNames.includes(name));
      const needNames = neededNamesArr.filter(name => !ownedNames.includes(name));

      const has = hasNames.map(name => eqMap[name] || { equipment_id: null, equipment_name: name, message: "Unknown" });
      const needs_pick = needNames.map(name => eqMap[name] || { equipment_id: null, equipment_name: name, message: "Unknown" });

      finalResult.push({
        crew_id: crew.crew_member_id,
        has,
        needs_pick
      });
    }

    return res.status(200).json({
      error: false,
      message: "Equipment matched successfully",
      data: finalResult
    });

  } catch (error) {
    console.error("Equipment Match Error:", error);
    return res.status(500).json({ error: true, message: "Server error" });
  }
};


exports.saveMatchedEquipment = async (req, res) => {
  try {
    const { project_id, assigned_equipment: equipmentIds } = req.body;

    if (!project_id || !equipmentIds || equipmentIds.length === 0) {
      return res.status(400).json({
        error: true,
        message: "Project ID and equipment IDs are required",
      });
    }

    const project = await stream_project_booking.findByPk(project_id);
    if (!project) {
      return res.status(404).json({
        error: true,
        message: "Project not found",
      });
    }

    for (const equipmentId of equipmentIds) {
      const equipmentRecord = await equipment.findByPk(equipmentId);
      if (!equipmentRecord) {
        return res.status(404).json({
          error: true,
          message: `Equipment with ID ${equipmentId} not found`,
        });
      }

      await assigned_equipment.create({
        project_id,
        equipment_id: equipmentId,
        assigned_date: new Date(),
        status: 'assigned',
        is_active: 1,
      });
    }

    return res.status(200).json({
      error: false,
      message: 'Matched equipment assigned to project successfully',
    });

  } catch (error) {
    console.error('Error saving matched equipment:', error);
    return res.status(500).json({
      error: true,
      message: 'Error saving matched equipment',
    });
  }
};


exports.getProjectDetails = async (req, res) => {
  try {
    const { project_id } = req.params;

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

// exports.getAllProjectDetails = async (req, res) => {
//   try {
//     const { status, event_type, search } = req.query;  // Get filters from query params
//     const today = new Date();

//     const whereConditions = {
//       is_active: 1
//     };

//     if (status) {
//       switch (status) {
//         case 'cancelled':
//           whereConditions.is_cancelled = 1;
//           break;

//         case 'completed':
//           whereConditions.is_completed = 1;
//           break;

//         case 'upcoming':
//           whereConditions.is_cancelled = 0;
//           whereConditions.event_date = { [Sequelize.Op.gt]: today };
//           break;

//         case 'draft':
//           whereConditions.is_draft = 1;
//           break;

//         default:
//           return res.status(400).json({
//             error: true,
//             message: 'Invalid status filter'
//           });
//       }
//     }


//     if (event_type) {
//       const eventType = await event_type_master.findOne({
//         where: { event_type_id: event_type }
//       });

//       if (eventType) {
//         whereConditions.event_type = event_type;
//       } else {
//         return res.status(400).json({
//           error: true,
//           message: 'Invalid event_type ID'
//         });
//       }
//     }

//     if (search) {
//       whereConditions.project_name = Sequelize.where(
//         Sequelize.fn('LOWER', Sequelize.col('project_name')),
//         {
//           [Sequelize.Op.like]: `%${search.toLowerCase()}%`
//         }
//       );
//     }


//     const [
//       total_active,
//       total_cancelled,
//       total_completed,
//       total_upcoming,
//       total_draft
//     ] = await Promise.all([
//       stream_project_booking.count({
//         where: { is_active: 1, is_cancelled: 0, is_completed: 0, is_draft: 0 }
//       }),

//       stream_project_booking.count({
//         where: { is_cancelled: 1 }
//       }),

//       stream_project_booking.count({
//         where: { is_completed: 1 }
//       }),

//       stream_project_booking.count({
//         where: {
//           is_cancelled: 0,
//           is_draft: 0,
//           event_date: { [Sequelize.Op.gt]: today }
//         }
//       }),

//       stream_project_booking.count({
//         where: { is_draft: 1 }
//       }),
//     ]);

//     const projects = await stream_project_booking.findAll({
//       where: whereConditions
//     });

//     if (!projects || projects.length === 0) {
//       return res.status(404).json({
//         error: true,
//         message: 'No active projects found',
//       });
//     }

//     const projectDetailsPromises = projects.map(async (project) => {
//       const assignedCrew = await assigned_crew.findAll({
//         where: { project_id: project.stream_project_booking_id, is_active: 1 },
//         include: [
//           {
//             model: crew_members,
//             as: 'crew_member',
//             attributes: ['crew_member_id', 'first_name', 'last_name', 'primary_role'],
//           },
//         ],
//       });

//       const assignedEquipment = await assigned_equipment.findAll({
//         where: { project_id: project.stream_project_booking_id, is_active: 1 },
//         include: [
//           {
//             model: equipment,
//             as: 'equipment',
//             attributes: ['equipment_id', 'equipment_name'],
//           },
//         ],
//       });

//       return {
//         project,
//         assignedCrew,
//         assignedEquipment,
//       };
//     });

//     const projectDetails = await Promise.all(projectDetailsPromises);

//     return res.status(200).json({
//       error: false,
//       message: 'All project details retrieved successfully',
//       data: {
//         stats: {
//           total_active,
//           total_cancelled,
//           total_completed,
//           total_upcoming,
//           total_draft
//         },
//         projects: projectDetails
//       },
//     });
//   } catch (error) {
//     console.error('Error fetching project details:', error);
//     return res.status(500).json({
//       error: true,
//       message: 'Internal server error',
//     });
//   }
// };


exports.getAllProjectDetails = async (req, res) => {
  try {
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
        where: { is_active: 1, is_cancelled: 0, is_completed: 0, is_draft: 0 }
      }),

      stream_project_booking.count({
        where: { is_cancelled: 1 }
      }),

      stream_project_booking.count({
        where: { is_completed: 1 }
      }),

      stream_project_booking.count({
        where: {
          is_cancelled: 0,
          is_draft: 0,
          event_date: { [Sequelize.Op.gt]: today }
        }
      }),

      stream_project_booking.count({
        where: { is_draft: 1 }
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
        message: 'No active projects found',
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
      };
    });

    const projectDetails = await Promise.all(projectDetailsPromises);

    return res.status(200).json({
      error: false,
      message: 'All project details retrieved successfully',
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
    console.error('Error fetching project details:', error);
    return res.status(500).json({
      error: true,
      message: 'Internal server error',
    });
  }
};

exports.getUpcomingEvents = async (req, res) => {
  try {
    const { search, event_type, status } = req.query;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const whereConditions = {
      is_cancelled: 0,
      is_draft: 0,
      event_date: { [Sequelize.Op.gt]: today }
    };

    if (search) {
      whereConditions.project_name = Sequelize.where(
        Sequelize.fn("LOWER", Sequelize.col("project_name")),
        {
          [Sequelize.Op.like]: `%${search.toLowerCase()}%`,
        }
      );
    }

    if (event_type && event_type !== "all") {
      whereConditions.event_type = event_type;
    }

    if (status && status !== "all") {
      switch (status) {
        case "cancelled":
          whereConditions.is_cancelled = 1;
          break;
        case "completed":
          whereConditions.is_completed = 1;
          break;
        case "upcoming":
          break;
        case "draft":
          whereConditions.is_draft = 1;
          break;
      }
    }

    const projects = await stream_project_booking.findAll({
      where: whereConditions,
      order: [["event_date", "ASC"]],
    });

    if (!projects.length) {
      return res.status(200).json({
        error: false,
        message: "No upcoming events found",
        data: { projects: [] },
      });
    }

    const projectDetails = await Promise.all(
      projects.map(async (project) => {
        const assignedCrew = await assigned_crew.findAll({
          where: { project_id: project.stream_project_booking_id, is_active: 1 },
          include: [
            {
              model: crew_members,
              as: "crew_member",
              attributes: ["crew_member_id", "first_name", "last_name", "primary_role"],
            },
          ],
        });

        const assignedEquipment = await assigned_equipment.findAll({
          where: { project_id: project.stream_project_booking_id, is_active: 1 },
          include: [
            {
              model: equipment,
              as: "equipment",
              attributes: ["equipment_id", "equipment_name"],
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
        };

      })
    );

    return res.status(200).json({
      error: false,
      message: "Upcoming events fetched successfully",
      data: {
        total_upcoming: projectDetails.length,
        projects: projectDetails,
      },
    });
  } catch (error) {
    console.error("Error in getUpcomingEvents:", error);
    return res.status(500).json({
      error: true,
      message: "Internal server error",
    });
  }
};


exports.getProjectStats = async (req, res) => {
  try {
    const today = new Date();

    const [
      total_active,
      total_cancelled,
      total_completed,
      total_upcoming
    ] = await Promise.all([

      stream_project_booking.count({
        where: {
          is_active: 1,
          is_cancelled: 0,
          is_completed: 0
        }
      }),

      stream_project_booking.count({
        where: {
          is_cancelled: 1
        }
      }),

      stream_project_booking.count({
        where: {
          is_completed: 1
        }
      }),

      stream_project_booking.count({
        where: {
          is_cancelled: 0,
          event_date: {
            [Sequelize.Op.gt]: today
          }
        }
      }),

    ]);

    return res.status(200).json({
      error: false,
      message: "Project stats fetched successfully",
      data: {
        total_active,
        total_cancelled,
        total_completed,
        total_upcoming
      }
    });

  } catch (error) {
    console.error("Project Stats Error:", error);
    return res.status(500).json({
      error: true,
      message: "Internal server error",
    });
  }
};


exports.getRecentActivity = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const activities = [];

    // Fetch recent requirements/projects (with created_at timestamp)
    const recentProjects = await stream_project_booking.findAll({
      where: { is_active: 1 },
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

    // Fetch recent equipment assignments
    const recentEquipmentAssignments = await equipment_assignments.findAll({
      where: { is_active: 1 },
      attributes: ['assignment_id', 'equipment_id', 'project_id', 'crew_member_id', 'check_out_date', 'created_at'],
      include: [
        {
          model: equipment,
          as: 'equipment',
          attributes: ['equipment_name']
        },
        {
          model: crew_members,
          as: 'crew_member',
          attributes: ['first_name', 'last_name']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: limit
    });

    recentEquipmentAssignments.forEach(assignment => {
      const equipmentName = assignment.equipment?.equipment_name || 'Unknown equipment';
      const crewName = assignment.crew_member
        ? `${assignment.crew_member.first_name} ${assignment.crew_member.last_name}`
        : 'Unknown crew';

      activities.push({
        type: 'equipment',
        title: 'Equipment Assigned',
        description: `${equipmentName} assigned to ${crewName}`,
        timestamp: assignment.created_at,
        icon: 'Package',
        metadata: {
          assignment_id: assignment.assignment_id,
          equipment_id: assignment.equipment_id,
          crew_member_id: assignment.crew_member_id
        }
      });
    });

    // Fetch recent crew assignments
    const recentCrewAssignments = await assigned_crew.findAll({
      where: { is_active: 1 },
      attributes: ['id', 'project_id', 'crew_member_id', 'assigned_date', 'status'],
      include: [
        {
          model: crew_members,
          as: 'crew_member',
          attributes: ['first_name', 'last_name', 'primary_role']
        },
        {
          model: stream_project_booking,
          as: 'project',
          attributes: ['project_name']
        }
      ],
      order: [['assigned_date', 'DESC']],
      limit: limit
    });

    recentCrewAssignments.forEach(assignment => {
      const crewName = assignment.crew_member
        ? `${assignment.crew_member.first_name} ${assignment.crew_member.last_name}`
        : 'Unknown crew';
      const role = assignment.crew_member?.primary_role || 'Crew member';
      const projectName = assignment.project?.project_name || 'Unknown project';

      activities.push({
        type: 'crew',
        title: 'Crew Assigned',
        description: `${crewName} (${role}) assigned to ${projectName}`,
        timestamp: assignment.assigned_date,
        icon: 'Users',
        metadata: {
          assignment_id: assignment.id,
          crew_member_id: assignment.crew_member_id,
          project_id: assignment.project_id
        }
      });
    });

    // Fetch recent tasks
    const recentTasks = await tasks.findAll({
      where: { is_active: 1 },
      attributes: ['assign_task_id', 'title', 'assigned_to', 'status', 'created_at'],
      include: [
        {
          model: crew_members,
          as: 'assigned_to_crew_member',
          attributes: ['first_name', 'last_name']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: limit
    });

    recentTasks.forEach(task => {
      const assigneeName = task.crew_member
        ? `${task.crew_member.first_name} ${task.crew_member.last_name}`
        : 'Unknown assignee';

      activities.push({
        type: 'task',
        title: 'Task Assigned',
        description: `"${task.title}" assigned to ${assigneeName}`,
        timestamp: task.created_at,
        icon: 'CheckSquare',
        metadata: {
          task_id: task.assign_task_id,
          assigned_to: task.assigned_to,
          status: task.status
        }
      });
    });

    // Sort all activities by timestamp (most recent first)
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Return only the most recent 'limit' activities
    const limitedActivities = activities.slice(0, limit);

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: 'Recent activities retrieved successfully',
      data: limitedActivities,
      total: limitedActivities.length
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

exports.getActiveProjects = async (req, res) => {
  try {
    const { search, category, status, date } = req.query;

    let whereConditions = {};

    // Search filter: case-insensitive text search in project_name and event_location
    if (search) {
      whereConditions[Op.or] = [
        Sequelize.where(
          Sequelize.fn('LOWER', Sequelize.col('project_name')),
          {
            [Op.like]: `%${search.toLowerCase()}%`
          }
        ),
        Sequelize.where(
          Sequelize.fn('LOWER', Sequelize.col('event_location')),
          {
            [Op.like]: `%${search.toLowerCase()}%`
          }
        )
      ];
    }

    // Category filter (event_type)
    if (category && category !== 'all') {
      whereConditions.event_type = category;
    }

    // Status filter - when no status specified, return ALL projects for dashboard map
    if (status) {
      switch (status.toLowerCase()) {
        case 'cancelled':
          whereConditions.is_cancelled = 1;
          break;
        case 'completed':
          whereConditions.is_completed = 1;
          break;
        case 'draft':
          whereConditions.is_draft = 1;
          break;
        case 'active':
          whereConditions.is_active = 1;
          whereConditions.is_cancelled = 0;
          whereConditions.is_completed = 0;
          whereConditions.is_draft = 0;
          break;
        default:
          break;
      }
    }

    // Date filter
    if (date) {
      if (date.toLowerCase() === 'today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        whereConditions.event_date = {
          [Op.gte]: today,
          [Op.lt]: tomorrow
        };
      } else {
        // Support specific date format (YYYY-MM-DD)
        try {
          const specificDate = new Date(date);
          if (!isNaN(specificDate.getTime())) {
            specificDate.setHours(0, 0, 0, 0);
            const nextDay = new Date(specificDate);
            nextDay.setDate(nextDay.getDate() + 1);

            whereConditions.event_date = {
              [Op.gte]: specificDate,
              [Op.lt]: nextDay
            };
          }
        } catch (e) {
          console.error('Invalid date format:', e);
        }
      }
    }

    const projects = await stream_project_booking.findAll({
      where: whereConditions,
      attributes: [
        'stream_project_booking_id',
        'project_name',
        'description',
        'event_type',
        'event_date',
        'duration_hours',
        'budget',
        'expected_viewers',
        'stream_quality',
        'crew_size_needed',
        'event_location',
        'streaming_platforms',
        'crew_roles',
        'skills_needed',
        'equipments_needed',
        'is_active',
        'is_cancelled',
        'is_completed',
        'is_draft',
        'created_at'
      ],
      order: [['created_at', 'DESC']]
    });

    // Fetch assigned crew counts for all projects
    const crewAssignments = await assigned_crew.findAll({
      attributes: [
        'project_id',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'crew_count']
      ],
      where: { is_active: 1 },
      group: ['project_id']
    });

    // Create a map of project_id to crew count
    const crewCountMap = {};
    crewAssignments.forEach(assignment => {
      const assignmentData = assignment.toJSON();
      crewCountMap[assignmentData.project_id] = parseInt(assignmentData.crew_count) || 0;
    });

    const transformedProjects = projects.map(project => {
      const projectData = project.toJSON();

      // Parse event_location if it's a JSON string
      if (projectData.event_location) {
        try {
          projectData.location_data = JSON.parse(projectData.event_location);
        } catch (e) {
          projectData.location_data = null;
        }
      }

      // Parse JSON arrays
      projectData.streaming_platforms = toArray(projectData.streaming_platforms);
      projectData.crew_roles = toArray(projectData.crew_roles);
      projectData.skills_needed = toArray(projectData.skills_needed);
      projectData.equipments_needed = toArray(projectData.equipments_needed);

      // Add assigned crew count
      projectData.assignedCrewCount = crewCountMap[projectData.stream_project_booking_id] || 0;

      return projectData;
    });

    return res.status(200).json({
      error: false,
      message: 'Active projects retrieved successfully',
      data: transformedProjects,
      filters: { search, category, status, date }
    });
  } catch (error) {
    console.error('Error fetching active projects:', error);
    return res.status(500).json({
      error: true,
      message: 'Internal server error',
    });
  }
};

exports.createProjectBrief = async (req, res) => {
  try {
    const {
      project_id,
      brief_title,
      project_overview,
      event_time,
      event_date,
      call_time_schedule,
      key_deliverables,
      special_instructions,
      main_contact_name,
      contact_phone,
      contact_email,
      assigned_crew,
      assigned_equipment
    } = req.body;

    const brief = await project_brief.create({
      project_id,
      brief_title,
      project_overview,
      event_time,
      event_date,
      call_time_schedule,
      key_deliverables,
      special_instructions,
      main_contact_name,
      contact_phone,
      contact_email,

      assigned_crew:
        typeof assigned_crew === "string"
          ? assigned_crew
          : JSON.stringify(assigned_crew),

      assigned_equipment:
        typeof assigned_equipment === "string"
          ? assigned_equipment
          : JSON.stringify(assigned_equipment),
    });

    res.json({
      error: false,
      message: "Project brief saved",
      data: brief
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: true, message: "Internal error" });
  }
};

// exports.createCrewMember = [
//   upload.fields([ 
//     { name: 'profile_photo', maxCount: 1 },
//     { name: 'resume', maxCount: 1 },
//     { name: 'certifications', maxCount: 10 },
//     { name: 'portfolio', maxCount: 1 }
//   ]),

//   async (req, res) => {
//     try {
//       const {
//         first_name,
//         last_name,
//         email,
//         phone_number,
//         location,
//         primary_role,
//         years_of_experience,
//         hourly_rate,
//         bio,
//         skills,
//         availability,
//         equipment_ownership,
//         working_distance
//       } = req.body;

//       if (!first_name || !last_name || !email) {
//         return res.status(constants.BAD_REQUEST.code).json({
//           error: true,
//           code: constants.BAD_REQUEST.code,
//           message: 'First name, last name, and email are required',
//           data: null,
//         });
//       }

//       const skillsArr = skills ? JSON.stringify(skills) : '[]';

//       const availabilityArr = toArray(availability);
//       const equipmentOwnershipArr = toArray(equipment_ownership);

//       const newCrewMember = await crew_members.create({
//         first_name,
//         last_name,
//         email,
//         phone_number,
//         location,
//         primary_role,
//         years_of_experience,
//         hourly_rate,
//         bio,
//         skills: skillsArr,
//         availability: JSON.stringify(availabilityArr),
//         equipment_ownership: JSON.stringify(equipmentOwnershipArr),
//         working_distance,
//         is_active: 1,
//       });

//       const filePaths = await S3UploadFiles(req.files);
//       console.log("filePaths------------------", filePaths);

//       for (let fileData of filePaths) {
//         await crew_member_files.create({
//           crew_member_id: newCrewMember.crew_member_id,
//           file_type: fileData.file_type,
//           file_path: fileData.file_path,
//         });
//       }

//       return res.status(constants.CREATED.code).json({
//         error: false,
//         code: constants.CREATED.code,
//         message: 'Crew member created successfully',
//         data: { crew_member_id: newCrewMember.crew_member_id, crew_member: newCrewMember },
//       });
//     } catch (error) {
//       console.error('Create Crew Member Error:', error);
//       return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
//         error: true,
//         code: constants.INTERNAL_SERVER_ERROR.code,
//         message: constants.INTERNAL_SERVER_ERROR.message,
//         data: null,
//       });
//     }
//   },
// ];

// exports.createCrewMember = [
//   upload.fields([
//     { name: 'profile_photo', maxCount: 1 },
//     { name: 'resume', maxCount: 1 },
//     { name: 'certifications', maxCount: 10 },
//     { name: 'portfolio', maxCount: 1 }
//   ]),

//   async (req, res) => {
//     try {
//       const {
//         first_name,
//         last_name,
//         email,
//         phone_number,
//         location,
//         primary_role,
//         years_of_experience,
//         hourly_rate,
//         bio,
//         skills,
//         availability,
//         equipment_ownership,
//         working_distance,

//         is_draft = 0
//       } = req.body;

//       let equipmentOwnershipArr = equipment_ownership;

//       if (typeof equipmentOwnershipArr === 'string') {
//         try {
//           equipmentOwnershipArr = JSON.parse(equipmentOwnershipArr);
//         } catch (error) {
//           return res.status(constants.BAD_REQUEST.code).json({
//             error: true,
//             code: constants.BAD_REQUEST.code,
//             message: 'Invalid format for equipment ownership.',
//             data: null,
//           });
//         }
//       }

//       equipmentOwnershipArr = Array.isArray(equipmentOwnershipArr)
//         ? equipmentOwnershipArr
//         : [equipmentOwnershipArr];

//       if (!first_name || !last_name || !email) {
//         return res.status(constants.BAD_REQUEST.code).json({
//           error: true,
//           code: constants.BAD_REQUEST.code,
//           message: 'First name, last name, and email are required',
//           data: null,
//         });
//       }

//       const skillsArr = skills ? JSON.stringify(skills) : '[]';
//       const availabilityArr = toArray(availability);

//       console.log('Equipment Ownership Array:', equipmentOwnershipArr);

//       const equipmentNames = await equipment.findAll({
//         where: {
//           equipment_name: { [Sequelize.Op.in]: equipmentOwnershipArr }
//         },
//         attributes: ['equipment_id', 'equipment_name']
//       });

//       console.log('Valid Equipment Names from the Database:', equipmentNames);

//       const validEquipmentDetails = equipmentNames.map(item => ({
//         equipment_id: item.equipment_id,
//         equipment_name: item.equipment_name
//       }));

//       const invalidEquipmentNames = equipmentOwnershipArr.filter(name =>
//         !validEquipmentDetails.some(item => item.equipment_name === name)
//       );

//       if (invalidEquipmentNames.length > 0) {
//         return res.status(constants.BAD_REQUEST.code).json({
//           error: true,
//           code: constants.BAD_REQUEST.code,
//           message: `Invalid equipment: ${invalidEquipmentNames.join(', ')}`,
//           data: null,
//         });
//       }

//       const newCrewMember = await crew_members.create({
//         first_name,
//         last_name,
//         email,
//         phone_number,
//         location,
//         primary_role,
//         years_of_experience,
//         hourly_rate,
//         bio,
//         skills: skillsArr,
//         availability: JSON.stringify(availabilityArr),
//         equipment_ownership: JSON.stringify(equipmentOwnershipArr),
//         working_distance,

//         is_draft: is_draft == 1 ? 1 : 0,
//         is_active: 1,
//       });

//       const filePaths = await S3UploadFiles(req.files);
//       console.log("filePaths------------------", filePaths);

//       for (let fileData of filePaths) {
//         await crew_member_files.create({
//           crew_member_id: newCrewMember.crew_member_id,
//           file_type: fileData.file_type,
//           file_path: fileData.file_path,
//         });
//       }

//       return res.status(constants.CREATED.code).json({
//         error: false,
//         code: constants.CREATED.code,
//         message: 'Crew member created successfully',
//         data: {
//           crew_member_id: newCrewMember.crew_member_id,
//           crew_member: newCrewMember,
//           equipment_details: validEquipmentDetails
//         },
//       });

//     } catch (error) {
//       console.error('Create Crew Member Error:', error);
//       return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
//         error: true,
//         code: constants.INTERNAL_SERVER_ERROR.code,
//         message: constants.INTERNAL_SERVER_ERROR.message,
//         data: null,
//       });
//     }
//   },
// ];


exports.createCrewMember = [
  upload.fields([
    { name: 'profile_photo', maxCount: 1 },
    { name: 'resume', maxCount: 1 },
    { name: 'certifications', maxCount: 10 },
    { name: 'portfolio', maxCount: 1 },
    { name: 'recent_work', maxCount: undefined }
  ]),

  async (req, res) => {
    try {
      const {
        first_name,
        last_name,
        email,
        phone_number,
        location,
        primary_role,
        years_of_experience,
        hourly_rate,
        bio,
        skills,
        availability,
        equipment_ownership,
        working_distance,
        is_draft = 0
      } = req.body;

      let equipmentOwnershipArr = equipment_ownership;

      if (typeof equipmentOwnershipArr === 'string') {
        try {
          equipmentOwnershipArr = JSON.parse(equipmentOwnershipArr);
        } catch (error) {
          return res.status(constants.BAD_REQUEST.code).json({
            error: true,
            code: constants.BAD_REQUEST.code,
            message: 'Invalid format for equipment ownership.',
            data: null,
          });
        }
      }

      equipmentOwnershipArr = Array.isArray(equipmentOwnershipArr)
        ? equipmentOwnershipArr
        : [equipmentOwnershipArr];

      if (!first_name || !last_name || !email) {
        return res.status(constants.BAD_REQUEST.code).json({
          error: true,
          code: constants.BAD_REQUEST.code,
          message: 'First name, last name, and email are required',
          data: null,
        });
      }

      const skillsArr = skills ? JSON.stringify(skills) : '[]';
      const availabilityArr = toArray(availability);

      console.log('Equipment Ownership Array:', equipmentOwnershipArr);

      const equipmentNames = await equipment.findAll({
        where: {
          equipment_name: { [Sequelize.Op.in]: equipmentOwnershipArr }
        },
        attributes: ['equipment_id', 'equipment_name']
      });

      console.log('Valid Equipment Names from the Database:', equipmentNames);

      const validEquipmentDetails = equipmentNames.map(item => ({
        equipment_id: item.equipment_id,
        equipment_name: item.equipment_name
      }));

      const invalidEquipmentNames = equipmentOwnershipArr.filter(name =>
        !validEquipmentDetails.some(item => item.equipment_name === name)
      );

      if (invalidEquipmentNames.length > 0) {
        return res.status(constants.BAD_REQUEST.code).json({
          error: true,
          code: constants.BAD_REQUEST.code,
          message: `Invalid equipment: ${invalidEquipmentNames.join(', ')}`,
          data: null,
        });
      }

      const newCrewMember = await crew_members.create({
        first_name,
        last_name,
        email,
        phone_number,
        location,
        primary_role,
        years_of_experience,
        hourly_rate,
        bio,
        skills: skillsArr,
        availability: JSON.stringify(availabilityArr),
        equipment_ownership: JSON.stringify(equipmentOwnershipArr),
        working_distance,
        is_draft: is_draft == 1 ? 1 : 0,
        is_active: 1,
      });

      const filePaths = await S3UploadFiles(req.files);
      console.log("filePaths------------------", filePaths);

      for (let fileData of filePaths) {
        if (fileData.fieldname === 'recent_work') {
          await crew_member_files.create({
            crew_member_id: newCrewMember.crew_member_id,
            file_type: fileData.file_type,
            file_path: fileData.file_path,
            file_category: 'recent_work',
          });
        } else {
          await crew_member_files.create({
            crew_member_id: newCrewMember.crew_member_id,
            file_type: fileData.file_type,
            file_path: fileData.file_path,
          });
        }
      }

      return res.status(constants.CREATED.code).json({
        error: false,
        code: constants.CREATED.code,
        message: 'Crew member created successfully',
        data: {
          crew_member_id: newCrewMember.crew_member_id,
          crew_member: newCrewMember,
          equipment_details: validEquipmentDetails
        },
      });

    } catch (error) {
      console.error('Create Crew Member Error:', error);
      return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
        error: true,
        code: constants.INTERNAL_SERVER_ERROR.code,
        message: constants.INTERNAL_SERVER_ERROR.message,
        data: null,
      });
    }
  },
];


// exports.getCrewMembers = async (req, res) => {
//   try {
//     let members = await crew_members.findAll({
//       where: { is_active: 1 },
//       include: [
//         {
//           model: crew_member_files,
//           as: 'crew_member_files',
//           attributes: ['crew_files_id', 'file_type', 'file_path']
//         }
//       ],
//       order: [
//         ['is_beige_member', 'ASC'],
//         ['crew_member_id', 'ASC']
//       ]
//     });

//     members = JSON.parse(JSON.stringify(members));

//     for (let m of members) {
//       let skillIds = [];

//       try {
//         if (m.skills) {
//           let once = JSON.parse(m.skills);
//           skillIds = JSON.parse(once);
//         }
//       } catch (e) {
//         skillIds = [];
//       }

//       const skillList = await skills_master.findAll({
//         where: { id: skillIds },
//         attributes: ['id', 'name']
//       });

//       m.skills = skillList;

//       const assignedTasks = await tasks.findAll({
//         where: {
//           assigned_to: m.crew_member_id,
//           is_active: 1
//         },
//         attributes: [
//           'assign_task_id',
//           'title',
//           'description',
//           'priority_id',
//           'category_id',
//           'due_date',
//           'due_time',
//           'estimated_duration',
//           'dependencies',
//           'additional_notes',
//           'checklist',
//           'status',
//           'created_at'
//         ],
//         order: [['assign_task_id', 'DESC']]
//       });

//       for (let t of assignedTasks) {
//         try {
//           t.dependencies = t.dependencies ? JSON.parse(t.dependencies) : [];
//         } catch {}
//         try {
//           t.checklist = t.checklist ? JSON.parse(t.checklist) : [];
//         } catch {}
//       }

//       m.assigned_tasks = assignedTasks;
//     }

//     return res.status(constants.OK.code).json({
//       error: false,
//       code: constants.OK.code,
//       message: "Crew members fetched successfully",
//       data: members
//     });

//   } catch (error) {
//     console.error("Get Crew Members Error:", error);
//     return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
//       error: true,
//       code: constants.INTERNAL_SERVER_ERROR.code,
//       message: constants.INTERNAL_SERVER_ERROR.message,
//       data: null,
//     });
//   }
// };

exports.getCrewMembers = async (req, res) => {
  try {
    let { page = 1, limit = 20, search, location } = req.body;
    page = parseInt(page);
    limit = parseInt(limit);

    const offset = (page - 1) * limit;

    const whereConditions = {
      is_active: 1,
    };

    if (search) {
      whereConditions.first_name = {
        [Sequelize.Op.like]: `%${search}%`,
      };
    }

    if (location) {
      whereConditions.location = {
        [Sequelize.Op.like]: `%${location}%`,
      };
    }

    const { count, rows: members } = await crew_members.findAndCountAll({
      where: whereConditions,
      include: [
        {
          model: crew_member_files,
          as: 'crew_member_files',
          attributes: ['crew_files_id', 'file_type', 'file_path'],
        }
      ],
      order: [
        ['is_beige_member', 'ASC'],
        ['crew_member_id', 'ASC'],
      ],
      limit,
      offset,
    });

    const processedMembers = members.map((member) => {
      const loc = member.location;

      if (!loc) return member;

      if (typeof loc === 'string' && (loc.startsWith('{') || loc.startsWith('['))) {
        try {
          const parsed = JSON.parse(loc);
          return {
            ...member.toJSON(),
            location: parsed.address || parsed || loc, 
          };
        } catch {
          return { ...member.toJSON(), location: loc };
        }
      }

      return { ...member.toJSON(), location: loc };
    });

    return res.status(200).json({
      error: false,
      message: "Crew members fetched successfully",
      pagination: {
        total_records: count,
        current_page: page,
        per_page: limit,
        total_pages: Math.ceil(count / limit),
      },
      data: processedMembers,
    });
  } catch (error) {
    console.error("Get Crew Members Error:", error);
    return res.status(500).json({
      error: true,
      message: "Internal server error",
    });
  }
};

exports.getCrewMemberById = async (req, res) => {
  try {
    const { crew_member_id } = req.params;

    let member = await crew_members.findOne({
      where: { crew_member_id },
      include: [
        {
          model: crew_member_files,
          as: 'crew_member_files',
          attributes: ['crew_member_id', 'file_type', 'file_path', 'created_at']
        }
      ]
    });

    if (!member) {
      return res.status(constants.NOT_FOUND.code).json({
        error: true,
        code: constants.NOT_FOUND.code,
        message: "Crew member not found",
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
      } else {
        member.location = loc;
      }
    }

    let skillIds = [];
    try {
      let raw = member.skills;

      if (raw) {
        let once = JSON.parse(raw);

        skillIds = JSON.parse(once);
      }
    } catch (err) {
      skillIds = [];
    }

    const skillList = await skills_master.findAll({
      where: { id: skillIds },
      attributes: ['id', 'name']
    });

    member = member.toJSON();
    member.skills = skillList;

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: "Crew member fetched successfully",
      data: member,
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


exports.deleteCrewMember = async (req, res) => {
  try {
    const { crew_member_id } = req.params;

    const member = await crew_members.findOne({ where: { crew_member_id } });

    if (!member) {
      return res.status(constants.NOT_FOUND.code).json({
        error: true,
        code: constants.NOT_FOUND.code,
        message: "Crew member not found",
        data: null,
      });
    }

    await crew_members.update(
      { is_active: 0 },
      { where: { crew_member_id } }
    );

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: "Crew member deleted successfully",
      data: { crew_member_id }
    });

  } catch (error) {
    console.error("Delete Crew Member Error:", error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null,
    });
  }
};

exports.updateCrewMember = [
  upload.fields([
    { name: 'profile_photo', maxCount: 1 },
    { name: 'resume', maxCount: 1 },
    { name: 'certifications', maxCount: 10 },
    { name: 'portfolio', maxCount: 1 },
    { name: 'recent_work', maxCount: undefined }
  ]),

  async (req, res) => {
    try {
      const { crew_member_id } = req.params;

      const member = await crew_members.findOne({
        where: { crew_member_id }
      });

      if (!member) {
        return res.status(constants.NOT_FOUND.code).json({
          error: true,
          code: constants.NOT_FOUND.code,
          message: "Crew member not found",
          data: null,
        });
      }

      const {
        first_name,
        last_name,
        email,
        phone_number,
        location,
        primary_role,
        years_of_experience,
        hourly_rate,
        bio,
        skills,
        availability,
        equipment_ownership,
        working_distance
      } = req.body;

      let equipmentOwnershipArr = equipment_ownership;

      if (typeof equipmentOwnershipArr === 'string') {
        try {
          equipmentOwnershipArr = JSON.parse(equipmentOwnershipArr);
        } catch (error) {
          return res.status(constants.BAD_REQUEST.code).json({
            error: true,
            code: constants.BAD_REQUEST.code,
            message: 'Invalid format for equipment ownership.',
            data: null,
          });
        }
      }

      equipmentOwnershipArr = Array.isArray(equipmentOwnershipArr) ? equipmentOwnershipArr : [equipmentOwnershipArr];

      const equipmentNames = await equipment.findAll({
        where: {
          equipment_name: { [Sequelize.Op.in]: equipmentOwnershipArr }
        },
        attributes: ['equipment_id', 'equipment_name']
      });

      const validEquipmentDetails = equipmentNames.map(item => ({
        equipment_id: item.equipment_id,
        equipment_name: item.equipment_name
      }));

      const invalidEquipmentNames = equipmentOwnershipArr.filter(name =>
        !validEquipmentDetails.some(item => item.equipment_name === name)
      );

      if (invalidEquipmentNames.length > 0) {
        return res.status(constants.BAD_REQUEST.code).json({
          error: true,
          code: constants.BAD_REQUEST.code,
          message: `The following equipment names are invalid: ${invalidEquipmentNames.join(', ')}`,
          data: null,
        });
      }

      const skillsJson = skills ? JSON.stringify(skills) : member.skills;
      const availabilityJson = availability ? JSON.stringify(toArray(availability)) : member.availability;

      await crew_members.update(
        {
          first_name,
          last_name,
          email,
          phone_number,
          location,
          primary_role,
          years_of_experience,
          hourly_rate,
          bio,
          skills: skillsJson,
          availability: availabilityJson,
          equipment_ownership: JSON.stringify(equipmentOwnershipArr),
          working_distance: working_distance ?? member.working_distance
        },
        { where: { crew_member_id } }
      );

      const filePaths = await S3UploadFiles(req.files);

      for (let fileData of filePaths) {
        if (fileData.fieldname === 'recent_work') {
          const existingRecentWork = await crew_member_files.findOne({
            where: {
              crew_member_id,
              file_type: 'recent_work'
            }
          });

          if (existingRecentWork) {
            await crew_member_files.update(
              { file_path: fileData.file_path },
              { where: { crew_files_id: existingRecentWork.crew_files_id } }
            );
          } else {
            await crew_member_files.create({
              crew_member_id,
              file_type: 'recent_work',
              file_path: fileData.file_path
            });
          }
        } else {
          const existing = await crew_member_files.findOne({
            where: {
              crew_member_id,
              file_type: fileData.file_type
            }
          });

          if (existing) {
            await crew_member_files.update(
              { file_path: fileData.file_path },
              { where: { crew_files_id: existing.crew_files_id } }
            );
          } else {
            await crew_member_files.create({
              crew_member_id,
              file_type: fileData.file_type,
              file_path: fileData.file_path
            });
          }
        }
      }

      return res.status(constants.OK.code).json({
        error: false,
        code: constants.OK.code,
        message: "Crew member updated successfully",
        data: { crew_member_id, equipment_details: validEquipmentDetails }
      });

    } catch (error) {
      console.error('Update Crew Member Error:', error);
      return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
        error: true,
        code: constants.INTERNAL_SERVER_ERROR.code,
        message: constants.INTERNAL_SERVER_ERROR.message,
        data: null,
      });
    }
  }
];

exports.createTask = async (req, res) => {
  try {
    const {
      title,
      description,

      priority_id,
      category_id,

      due_date,
      due_time,
      estimated_duration,

      dependencies,
      additional_notes,

      assigned_to,
      send_sms,
      send_email,

      checklist,
      status
    } = req.body;

    if (!title || !assigned_to) {
      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        code: constants.BAD_REQUEST.code,
        message: "Title and Assigned To are required",
        data: null,
      });
    }

    const member = await crew_members.findOne({
      where: {
        crew_member_id: assigned_to,
        is_active: 1
      }
    });

    if (!member) {
      return res.status(constants.OK.code).json({
        error: true,
        code: constants.OK.code,
        message: "Assigned crew member does not exist or is inactive",
        data: null,
      });
    }

    const newTask = await tasks.create({
      title,
      description,

      priority_id,
      category_id,

      due_date,
      due_time,
      estimated_duration,

      dependencies: dependencies ? JSON.stringify(dependencies) : null,
      additional_notes,

      assigned_to,
      send_sms: send_sms ?? 0,
      send_email: send_email ?? 0,

      checklist: checklist ? JSON.stringify(checklist) : null,
      status: status || 'assigned',

      is_active: 1
    });

    if (send_email === 1 || send_email === true) {
      try {
        const taskData = {
          assign_task_id: newTask.assign_task_id,
          title: newTask.title,
          description: newTask.description,
          priority_id: newTask.priority_id,
          due_date: newTask.due_date,
          due_time: newTask.due_time,
          estimated_duration: newTask.estimated_duration,
          additional_notes: newTask.additional_notes,
          status: newTask.status
        };

        const assigneeData = {
          first_name: member.first_name,
          last_name: member.last_name,
          email: member.email
        };

        await sendTaskAssignmentEmail(taskData, assigneeData);
        console.log(`Email notification sent to ${member.email} for task: ${newTask.title}`);
      } catch (emailError) {
        console.error('Failed to send email notification:', emailError);
        // Don't fail the task creation if email fails, just log it
      }
    }

    return res.status(constants.CREATED.code).json({
      error: false,
      code: constants.CREATED.code,
      message: "Task created successfully",
      data: newTask
    });

  } catch (error) {
    console.error("Create Task Error:", error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null,
    });
  }
};

exports.createEquipment = [
  upload.fields([
    { name: 'photos' },
    { name: 'manual' },
    { name: 'warranty' }
  ]),

  async (req, res) => {
    try {
      const {
        equipment_name,
        category_id,
        manufacturer,
        model_number,
        serial_number,
        description,

        storage_location,
        initial_status_id,

        purchase_price,
        daily_rental_rate,
        purchase_date,

        last_maintenance_date,
        next_maintenance_due,

        specs,
        accessories,

        is_draft = 0
      } = req.body;

      if (!equipment_name || !category_id) {
        return res.status(constants.BAD_REQUEST.code).json({
          error: true,
          code: constants.BAD_REQUEST.code,
          message: "equipment_name and category_id are required",
          data: null,
        });
      }

      const specsArr = toArray(specs);
      const accessoriesArr = toArray(accessories);

      const eq = await equipment.create({
        equipment_name,
        category_id,
        manufacturer,
        model_number,
        serial_number,
        description,

        storage_location,
        initial_status_id,

        purchase_price,
        daily_rental_rate,
        purchase_date,

        last_maintenance_date,
        next_maintenance_due,

        is_draft: is_draft == 1 ? 1 : 0,
        is_active: 1
      });

      if (specsArr.length > 0) {
        for (let s of specsArr) {
          await equipment_specs.create({
            equipment_id: eq.equipment_id,
            spec_name: s.name,
            spec_value: s.value,
            is_active: 1
          });
        }
      }

      if (accessoriesArr.length > 0) {
        for (let a of accessoriesArr) {
          await equipment_accessories.create({
            equipment_id: eq.equipment_id,
            accessory_name: a,
            is_active: 1
          });
        }
      }

      const filePaths = await S3UploadFiles(req.files);

      const photos = filePaths.filter(f => f.file_type === 'photos');
      const manuals = filePaths.filter(f => f.file_type === 'manual');
      const warranties = filePaths.filter(f => f.file_type === 'warranty');

      for (let p of photos) {
        await equipment_photos.create({
          equipment_id: eq.equipment_id,
          file_url: p.file_path,
          is_active: 1
        });
      }

      if (manuals.length > 0) {
        await equipment_documents.create({
          equipment_id: eq.equipment_id,
          doc_type: 'manual',
          file_url: manuals[0].file_path,
          is_active: 1
        });
      }

      if (warranties.length > 0) {
        await equipment_documents.create({
          equipment_id: eq.equipment_id,
          doc_type: 'warranty',
          file_url: warranties[0].file_path,
          is_active: 1
        });
      }

      return res.status(constants.CREATED.code).json({
        error: false,
        code: constants.CREATED.code,
        message: "Equipment created successfully",
        data: { equipment_id: eq.equipment_id }
      });

    } catch (error) {
      console.error("Create Equipment Error:", error);
      return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
        error: true,
        code: constants.INTERNAL_SERVER_ERROR.code,
        message: constants.INTERNAL_SERVER_ERROR.message,
        data: null,
      });
    }
  }
];


exports.getEquipment = async (req, res) => {
  try {
    const { search, category_id, location_id, group_by, limit = 50, page = 1 } = req.query; // Default to 50 records per page and page 1

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

    // Calculate offset based on page number
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Fetch equipment records with pagination
    const list = await equipment.findAll({
      where,
      include: [
        { model: equipment_photos, as: 'equipment_photos', attributes: ['photo_id', 'file_url', 'created_at'] },
        { model: equipment_documents, as: 'equipment_documents', attributes: ['document_id', 'doc_type', 'file_url', 'created_at'] },
        { model: equipment_specs, as: 'equipment_specs', attributes: ['spec_id', 'spec_name', 'spec_value'] },
        { model: equipment_accessories, as: 'equipment_accessories', attributes: ['accessory_id', 'accessory_name'] }
      ],
      order: [['equipment_id', 'DESC']],
      limit: parseInt(limit), // Apply limit
      offset: offset // Calculate offset based on page
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

    // Process storage_location similarly to event_location or location
    const processedList = list.map(item => {
      const loc = item.storage_location;  // Process storage_location field

      if (!loc) return item;  // If no location, return item as is

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

exports.getEquipmentById = async (req, res) => {
  try {
    const { equipment_id } = req.params;

    const item = await equipment.findOne({
      where: { equipment_id, is_active: 1 },
      include: [
        {
          model: equipment_photos,
          as: 'equipment_photos',
          attributes: ['photo_id', 'file_url', 'created_at']
        },
        {
          model: equipment_documents,
          as: 'equipment_documents',
          attributes: ['document_id', 'doc_type', 'file_url', 'created_at']
        },
        {
          model: equipment_specs,
          as: 'equipment_specs',
          attributes: ['spec_id', 'spec_name', 'spec_value']
        },
        {
          model: equipment_accessories,
          as: 'equipment_accessories',
          attributes: ['accessory_id', 'accessory_name']
        }
      ]
    });

    if (!item) {
      return res.status(constants.OK.code).json({
        error: true,
        code: constants.OK.code,
        message: "Equipment not found",
        data: null
      });
    }

    const loc = item.storage_location;

    if (loc) {
      if (typeof loc === 'string' && (loc.startsWith('{') || loc.startsWith('['))) {
        try {
          const parsed = JSON.parse(loc);
          item.storage_location = parsed.address || parsed || loc;
        } catch {
          item.storage_location = loc;
        }
      } else {
        item.storage_location = loc;
      }
    }

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: "Equipment fetched successfully",
      data: item
    });

  } catch (error) {
    console.error("Get Equipment by ID Error:", error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null
    });
  }
};

exports.deleteEquipment = async (req, res) => {
  try {
    const { equipment_id } = req.params;

    const equipmentItem = await equipment.findOne({
      where: { equipment_id, is_active: 1 }
    });

    if (!equipmentItem) {
      return res.status(constants.OK.code).json({
        error: true,
        code: constants.OK.code,
        message: "Equipment not found or already deleted",
        data: null
      });
    }

    await equipment.update(
      { is_active: 0 },
      { where: { equipment_id } }
    );

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: "Equipment deleted successfully",
      data: { equipment_id }
    });

  } catch (error) {
    console.error("Delete Equipment Error:", error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null
    });
  }
};

exports.updateEquipment = [
  upload.fields([
    { name: 'photos' },
    { name: 'manual' },
    { name: 'warranty' }
  ]),

  async (req, res) => {
    try {
      const { equipment_id } = req.params;

      const {
        equipment_name,
        category_id,
        manufacturer,
        model_number,
        serial_number,
        description,
        storage_location_id,
        initial_status_id,
        purchase_price,
        daily_rental_rate,
        purchase_date,
        last_maintenance_date,
        next_maintenance_due,
        specs,
        accessories
      } = req.body;

      const specsArr = toArray(specs);
      const accessoriesArr = toArray(accessories);

      const eq = await equipment.findOne({
        where: { equipment_id, is_active: 1 }
      });

      if (!eq) {
        return res.status(constants.OK.code).json({
          error: true,
          code: constants.OK.code,
          message: "Equipment not found",
          data: null
        });
      }

      await equipment.update(
        {
          equipment_name,
          category_id,
          manufacturer,
          model_number,
          serial_number,
          description,
          storage_location_id,
          initial_status_id,
          purchase_price,
          daily_rental_rate,
          purchase_date,
          last_maintenance_date,
          next_maintenance_due,
          is_active: 1
        },
        { where: { equipment_id } }
      );

      await equipment_specs.destroy({ where: { equipment_id } });
      if (specsArr.length > 0) {
        for (let s of specsArr) {
          await equipment_specs.create({
            equipment_id,
            spec_name: s.name,
            spec_value: s.value,
            is_active: 1
          });
        }
      }

      await equipment_accessories.destroy({ where: { equipment_id } });
      if (accessoriesArr.length > 0) {
        for (let a of accessoriesArr) {
          await equipment_accessories.create({
            equipment_id,
            accessory_name: a,
            is_active: 1
          });
        }
      }

      const uploadedFiles = await S3UploadFiles(req.files);

      const photos = uploadedFiles.filter(f => f.file_type === "photos");
      const manuals = uploadedFiles.filter(f => f.file_type === "manual");
      const warranties = uploadedFiles.filter(f => f.file_type === "warranty");

      if (manuals.length > 0) {
        await equipment_documents.update(
          { is_active: 0 },
          { where: { equipment_id, doc_type: "manual" } }
        );

        await equipment_documents.create({
          equipment_id,
          doc_type: "manual",
          file_url: manuals[0].file_path,
          is_active: 1
        });
      }

      if (warranties.length > 0) {
        await equipment_documents.update(
          { is_active: 0 },
          { where: { equipment_id, doc_type: "warranty" } }
        );

        await equipment_documents.create({
          equipment_id,
          doc_type: "warranty",
          file_url: warranties[0].file_path,
          is_active: 1
        });
      }

      if (photos.length > 0) {
        await equipment_photos.update(
          { is_active: 0 },
          { where: { equipment_id } }
        );

        for (let p of photos) {
          await equipment_photos.create({
            equipment_id,
            file_url: p.file_path,
            is_active: 1
          });
        }
      }

      return res.status(constants.OK.code).json({
        error: false,
        code: constants.OK.code,
        message: "Equipment updated successfully",
        data: { equipment_id }
      });

    } catch (error) {
      console.error("Update Equipment Error:", error);
      return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
        error: true,
        code: constants.INTERNAL_SERVER_ERROR.code,
        message: constants.INTERNAL_SERVER_ERROR.message,
        data: null
      });
    }
  }
];

exports.assignEquipment = async (req, res) => {
  try {
    const {
      equipment_id,
      project_id,            
      crew_member_id,
      check_out_date,
      expected_return_date,
      pickup_location,
      notes,
      checklist,
      send_email,
      rent_calculation
    } = req.body;

    if (!equipment_id || !crew_member_id) {
      return res.status(400).json({
        error: true,
        message: "equipment_id and crew_member_id are required"
      });
    }

    const crew = await crew_members.findOne({
      where: { crew_member_id, is_active: 1 }
    });

    if (!crew) {
      return res.status(400).json({
        error: true,
        message: "Invalid or inactive crew_member_id"
      });
    }

    if (project_id) {
      const project = await stream_project_booking.findOne({
        where: { stream_project_booking_id: project_id, is_active: 1 }
      });

      if (!project) {
        return res.status(400).json({
          error: true,
          message: "Invalid or inactive stream_project_booking_id"
        });
      }
    }

    const assignment = await equipment_assignments.create({
      equipment_id,
      project_id: project_id || null,  
      crew_member_id,
      check_out_date,
      expected_return_date,
      pickup_location,
      notes,
      send_email: send_email ? 1 : 0,
      rent_calculation: rent_calculation || null
    });

    if (checklist && Array.isArray(checklist)) {
      for (const item of checklist) {
        await assignment_checklist.create({
          assignment_id: assignment.assignment_id,
          checklist_id: item.id,
          value: item.checked ? 1 : 0
        });
      }
    }

    return res.status(200).json({
      error: false,
      message: "Equipment assigned successfully",
      data: assignment
    });

  } catch (err) {
    console.error("ASSIGN EQUIPMENT ERROR:", err);
    return res.status(500).json({
      error: true,
      message: "Server error"
    });
  }
};


exports.getAllAssignments = async (req, res) => {
  try {
    const list = await equipment_assignments.findAll({
      where: { is_active: 1 },

      include: [
        {
          model: equipment,
          as: "equipment",
          attributes: ["equipment_id", "equipment_name", "category_id"]
        },
        {
          model: stream_project_booking,
          as: "project",
          attributes: ["stream_project_booking_id", "project_name"]
        },
        {
          model: crew_members,
          as: "crew_member",
          attributes: ["crew_member_id", "first_name", "phone_number"]
        },
        {
          model: assignment_checklist,
          as: "assignment_checklists",
          include: [
            {
              model: checklist_master,
              as: "checklist",
              attributes: ["checklist_id", "checklist_text"]
            }
          ]
        }
      ],

      order: [["assignment_id", "DESC"]]
    });

    return res.status(200).json({
      error: false,
      message: "Assignments fetched successfully",
      data: list
    });

  } catch (err) {
    console.log(err);
    return res.status(500).json({
      error: true,
      message: "Server error"
    });
  }
};


exports.getAssignmentById = async (req, res) => {
  try {
    const id = req.params.id;

    const data = await equipment_assignments.findOne({
      where: { assignment_id: id, is_active: 1 },

      include: [
        {
          model: equipment,
          as: "equipment",
          attributes: ["equipment_id", "equipment_name", "category_id"]
        },
        {
          model: stream_project_booking,
          as: "project",
          attributes: ["stream_project_booking_id", "project_name"]
        },
        {
          model: crew_members,
          as: "crew_member",
          attributes: ["crew_member_id", "first_name", "phone_number"]
        },
        {
          model: assignment_checklist,
          as: "assignment_checklists",
          include: [
            {
              model: checklist_master,
              as: "checklist",
              attributes: ["checklist_id", "checklist_text"]
            }
          ]
        }
      ]
    });

    if (!data) {
      return res.status(404).json({
        error: true,
        message: "Assignment not found"
      });
    }

    return res.status(200).json({
      error: false,
      message: "Assignment fetched successfully",
      data
    });

  } catch (err) {
    console.log(err);
    return res.status(500).json({
      error: true,
      message: "Server error"
    });
  }
};

exports.returnEquipment = async (req, res) => {
  try {
    const {
      assignment_id,
      equipment_id,

      condition,
      inspection_notes,

      return_checklist,
      issues,
      mark_for_maintenance
    } = req.body;

    if (!assignment_id || !equipment_id) {
      return res.status(400).json({
        error: true,
        message: "assignment_id and equipment_id are required"
      });
    }

    const assignment = await equipment_assignments.findOne({
      where: { assignment_id, equipment_id }
    });

    if (!assignment) {
      return res.status(400).json({
        error: true,
        message: "Invalid assignment_id or equipment_id"
      });
    }

    const ret = await equipment_returns.create({
      assignment_id,
      equipment_id,
      condition,
      inspection_notes
    });

    if (Array.isArray(return_checklist)) {
      for (const c of return_checklist) {
        await equipment_return_checklist.create({
          return_id: ret.return_id,
          checklist_title: c.title,
          value: c.value ? 1 : 0
        });
      }
    }

    if (Array.isArray(issues)) {
      for (const i of issues) {
        await equipment_return_issues.create({
          return_id: ret.return_id,
          issue_title: i.title,
          severity: i.severity
        });
      }
    }

    let new_status = mark_for_maintenance == 1 ? "maintenance" : "available";

    await equipment.update(
      { initial_status_id: new_status },
      { where: { equipment_id } }
    );

    await equipment_assignments.update(
      { actual_return_date: new Date() },
      { where: { assignment_id } }
    );

    return res.status(200).json({
      error: false,
      message: "Equipment returned successfully",
      data: {
        return_id: ret.return_id,
        maintenance: mark_for_maintenance == 1 ? true : false
      }
    });

  } catch (err) {
    console.log("Return Equipment Error:", err);
    return res.status(500).json({
      error: true,
      message: "Server error"
    });
  }
};

exports.getEquipmentNameSuggestions = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim() === "") {
      return res.status(200).json({
        error: false,
        code: 200,
        message: "No search query provided",
        data: []
      });
    }

    const suggestions = await equipment.findAll({
      where: {
        is_active: 1,
        equipment_name: {
          [Op.like]: `%${query}%`
        }
      },
      attributes: ["equipment_id", "equipment_name"],
      limit: 10,
      order: [["equipment_name", "ASC"]]
    });

    return res.status(200).json({
      error: false,
      code: 200,
      message: "Suggestions fetched successfully",
      data: suggestions
    });

  } catch (error) {
    console.error("Equipment Suggestions Error:", error);
    return res.status(500).json({
      error: true,
      code: 500,
      message: "Internal Server Error",
      data: []
    });
  }
};

// ==================== MASTER DATA ENDPOINTS ====================

/**
 * GET Equipment Categories
 * Returns all equipment categories for dropdown/filter
 */
exports.getEquipmentCategories = async (req, res) => {
  try {
    const categories = await equipment_category.findAll({
      where: { is_active: 1 },
      attributes: ['category_id', 'name'],
      order: [['name', 'ASC']]
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: "Equipment categories fetched successfully",
      data: categories
    });

  } catch (error) {
    console.error("Get Equipment Categories Error:", error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null
    });
  }
};

/**
 * GET Checklist Templates
 * Returns all checklist master items for assignment/return checklists
 */
exports.getChecklistTemplates = async (req, res) => {
  try {
    const checklists = await checklist_master.findAll({
      where: { is_active: 1 },
      attributes: ['checklist_id', 'checklist_text'],
      order: [['checklist_id', 'ASC']]
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: "Checklist templates fetched successfully",
      data: checklists
    });

  } catch (error) {
    console.error("Get Checklist Templates Error:", error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null
    });
  }
};

/**
 * GET Crew Roles
 * Returns all crew roles for dropdown
 */
exports.getCrewRoles = async (req, res) => {
  try {
    const roles = await crew_roles.findAll({
      where: { is_active: 1 },
      attributes: ['role_id', 'role_name'],
      order: [['role_name', 'ASC']]
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: "Crew roles fetched successfully",
      data: roles
    });

  } catch (error) {
    console.error("Get Crew Roles Error:", error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null
    });
  }
};

/**
 * GET Skills Master
 * Returns all skills for dropdown/selection
 */
exports.getSkills = async (req, res) => {
  try {
    const skills = await skills_master.findAll({
      where: { is_active: 1 },
      attributes: ['id', 'name'],
      order: [['name', 'ASC']]
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: "Skills fetched successfully",
      data: skills
    });

  } catch (error) {
    console.error("Get Skills Error:", error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null
    });
  }
};

/**
 * GET Certifications Master
 * Returns all certifications for dropdown/selection
 */
exports.getCertifications = async (req, res) => {
  try {
    const certifications = await certifications_master.findAll({
      where: { is_active: 1 },
      attributes: ['id', 'name'],
      order: [['name', 'ASC']]
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: "Certifications fetched successfully",
      data: certifications
    });

  } catch (error) {
    console.error("Get Certifications Error:", error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null
    });
  }
};

/**
 * GET Equipment Statistics by Location
 * Groups equipment by storage location with counts
 */
exports.getEquipmentByLocation = async (req, res) => {
  try {
    // Get all equipment grouped by location
    const equipmentList = await equipment.findAll({
      where: { is_active: 1 },
      include: [
        { model: equipment_photos, as: 'equipment_photos', attributes: ['photo_id', 'file_url'] },
        { model: equipment_category, as: 'category', attributes: ['category_id', 'name'] }
      ],
      order: [['storage_location_id', 'ASC'], ['equipment_name', 'ASC']]
    });

    // Check for active assignments to determine in_use status
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

    // Group equipment by location
    const locationMap = {};

    equipmentList.forEach(item => {
      const locationId = item.storage_location_id || 0; // 0 for unassigned

      if (!locationMap[locationId]) {
        locationMap[locationId] = {
          storage_location_id: locationId,
          location_name: locationId === 0 ? 'Unassigned' : `Location ${locationId}`,
          equipment_count: 0,
          available_count: 0,
          in_use_count: 0,
          maintenance_count: 0,
          equipment: []
        };
      }

      const itemJson = item.toJSON();
      itemJson.in_use = !!inUseMap[item.equipment_id];
      itemJson.current_assignment = inUseMap[item.equipment_id] || null;

      locationMap[locationId].equipment.push(itemJson);
      locationMap[locationId].equipment_count++;

      // Count by status
      if (item.initial_status_id === 1) {
        locationMap[locationId].available_count++;
      } else if (item.initial_status_id === 2) {
        locationMap[locationId].in_use_count++;
      } else if (item.initial_status_id === 3) {
        locationMap[locationId].maintenance_count++;
      }
    });

    const locationsArray = Object.values(locationMap);

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: "Equipment grouped by location successfully",
      data: locationsArray
    });

  } catch (error) {
    console.error("Get Equipment By Location Error:", error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null
    });
  }
};

exports.getEventTypes = async (req, res) => {
  try {
    const eventTypes = await event_type_master.findAll({
      where: { is_active: 1 },
      attributes: ['event_type_id', 'event_type_name'],
      order: [['event_type_id', 'ASC']]
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: "Event types fetched successfully",
      data: eventTypes
    });

  } catch (error) {
    console.error("Get Event Types Error:", error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null
    });
  }
};

exports.getCrewMembersByName = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim() === "") {
      return res.status(200).json({
        error: false,
        code: 200,
        message: "No search query provided",
        data: []
      });
    }

    const crewMembers = await crew_members.findAll({
      where: {
        is_active: 1,
        [Op.or]: [
          { first_name: { [Op.like]: `%${query}%` } },
          { last_name: { [Op.like]: `%${query}%` } }
        ]
      },
      attributes: ['crew_member_id', 'first_name', 'last_name'],
      limit: 10,
      order: [['first_name', 'ASC']]
    });

    return res.status(200).json({
      error: false,
      code: 200,
      message: "Crew members fetched successfully",
      data: crewMembers
    });

  } catch (error) {
    console.error("Get Crew Members Error:", error);
    return res.status(500).json({
      error: true,
      code: 500,
      message: "Internal Server Error",
      data: []
    });
  }
};


exports.getCrewCount = async (req, res) => {
  try {
    const total = await crew_members.count({
      where: {
        is_active: 1,
        is_draft: 0
      }
    });

    return res.status(200).json({
      error: false,
      message: "Crew count fetched successfully",
      total_crew_members: total
    });

  } catch (error) {
    console.error("Get Crew Count Error:", error);
    return res.status(500).json({
      error: true,
      message: "Internal server error"
    });
  }
};
