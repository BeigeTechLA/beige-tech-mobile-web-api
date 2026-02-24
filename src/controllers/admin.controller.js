const constants = require('../utils/constants');
const { Sequelize, users, affiliates } = require('../models')
const multer = require('multer');
const path = require('path');
const common_model = require('../utils/common_model');
const { Op } = require('sequelize');
const { S3UploadFiles } = require('../utils/common.js');
const moment = require('moment');
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
  event_type_master,
  payment_transactions,
  assigned_post_production_member,
  post_production_members,
  clients,sales_leads, sales_lead_activities,
  payments } = require('../models');
  const { deleteSheetRow, updateSheetRow } = require('../utils/googleSheets');
const leadAssignmentService = require('../services/lead-assignment.service');

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
    const allowedTypes = ['image/jpeg', 'image/png','image/webp', 'image/jfif', 'image/jpg', 'application/pdf'];
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

function buildDateFilter(req) {
  const { range, start_date, end_date } = req.query;

  if (start_date && end_date) {
    return {
      created_at: {
        [Op.between]: [
          `${start_date} 00:00:00`,
          `${end_date} 23:59:59`
        ]
      }
    };
  }

  if (range === 'month') {
    return {
      created_at: {
        [Op.gte]: Sequelize.literal("DATE_FORMAT(CURDATE(), '%Y-%m-01')")
      }
    };
  }

  if (range === 'week') {
    return {
      created_at: {
        [Op.gte]: Sequelize.literal("DATE_SUB(NOW(), INTERVAL 7 DAY)")
      }
    };
  }

  if (range === 'year') {
    return {
      created_at: {
        [Op.gte]: Sequelize.literal("DATE_FORMAT(CURDATE(), '%Y-01-01')")
      }
    };
  }

  return {};
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
    const { crew_roles, required_skills, location, hourly_rate } = req.body;

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
      return res.status(400).json({ error: true, message: 'Project ID is required' });
    }

    // 1. Fetch main project and masters
    const [project, allEventMasterTypes, allRoles] = await Promise.all([
      stream_project_booking.findOne({
        where: { stream_project_booking_id: project_id, is_active: 1 },
      }),
      event_type_master.findAll({ attributes: ['event_type_id', 'event_type_name'], raw: true }),
      crew_roles.findAll({ attributes: ['role_id', 'role_name'], raw: true })
    ]);

    if (!project) {
      return res.status(404).json({ error: true, message: 'Project not found' });
    }

    // 2. Fetch Associations + Payment Amount
    const [crew, equip, postProd, paymentData] = await Promise.all([
      assigned_crew.findAll({
        where: { project_id: project.stream_project_booking_id, is_active: 1 },
        include: [{ 
            model: crew_members, 
            as: 'crew_member', 
            attributes: ['crew_member_id', 'first_name', 'last_name', 'primary_role'] 
        }],
      }),
      assigned_equipment.findAll({
        where: { project_id: project.stream_project_booking_id, is_active: 1 },
        include: [{ model: equipment, as: 'equipment', attributes: ['equipment_id', 'equipment_name'] }],
      }),
      assigned_post_production_member.findAll({
        where: { project_id: project.stream_project_booking_id, is_active: 1 },
        include: [{ model: post_production_members, as: 'post_production_member', attributes: ['post_production_member_id', 'first_name', 'last_name', 'email'] }],
      }),
      // FETCH PAYMENT AMOUNT HERE
      payment_transactions.findOne({
        where: { payment_id: project.payment_id },
        attributes: ['total_amount'],
        raw: true
      })
    ]);

    // 3. Process Event Type Labels
    const rawTypes = project.event_type ? project.event_type.split(',') : [];
    const eventTypeLabels = rawTypes.map(t => {
      const val = t.trim();
      const masterMatch = allEventMasterTypes.find(m => String(m.event_type_id) === val);
      if (masterMatch) return masterMatch.event_type_name;

      const stringMap = { 'videographer': 'Videography', 'photographer': 'Photography' };
      return stringMap[val.toLowerCase()] || val.charAt(0).toUpperCase() + val.slice(1);
    });

    // 4. Process Crew Roles
    const processedCrew = crew.map(assignment => {
      const crewMember = assignment.crew_member ? assignment.crew_member.toJSON() : null;
      let roleName = "N/A";

      if (crewMember && crewMember.primary_role) {
        try {
          let roleIds = [];
          const rawRole = crewMember.primary_role;
          if (typeof rawRole === 'string' && (rawRole.startsWith('[') || rawRole.startsWith('{'))) {
            roleIds = JSON.parse(rawRole);
          } else {
            roleIds = [rawRole];
          }

          const names = allRoles
            .filter(r => roleIds.includes(String(r.role_id)) || roleIds.includes(Number(r.role_id)))
            .map(r => r.role_name);
          
          if (names.length > 0) roleName = names.join(", ");
        } catch (e) {
          console.error("Role processing error:", e);
        }
      }

      return {
        ...assignment.toJSON(),
        crew_member: crewMember ? { ...crewMember, role_name: roleName } : null
      };
    });

    // 5. Final Response
    return res.status(200).json({
      error: false,
      message: 'Project details retrieved successfully',
      data: {
        project: {
          ...project.toJSON(),
          total_paid_amount: paymentData ? paymentData.total_amount : 0, // ADDED THIS LINE
          event_type_labels: eventTypeLabels.join(', ')
        },
        assignedCrew: processedCrew,
        assignedEquipment: equip,
        assignedPostProductionMembers: postProd,
      },
    });
  } catch (error) {
    console.error('Error fetching project details:', error);
    return res.status(500).json({ error: true, message: 'Internal server error' });
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


// exports.getAllProjectDetails = async (req, res) => {
//   try {
//     let { status, event_type, search, limit, page, range, start_date, end_date } = req.query;
//     const today = new Date();

//     const noPagination = !limit && !page;

//     let pageNumber = null;
//     let pageSize = null;
//     let offset = null;

//     if (!noPagination) {
//       pageNumber = parseInt(page ?? 1, 10);
//       pageSize = parseInt(limit ?? 10, 10);
//       offset = (pageNumber - 1) * pageSize;
//     }

//     // ----------- IMPROVED DATE RANGE FILTER LOGIC -----------
//     let dateFilter = {};

//     if (start_date && end_date) {
//       dateFilter = {
//         event_date: {
//           [Sequelize.Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`]
//         }
//       };
//     } else if (range === 'month') {
//       dateFilter = {
//         [Sequelize.Op.and]: [
//             Sequelize.where(Sequelize.fn('MONTH', Sequelize.col('event_date')), Sequelize.fn('MONTH', Sequelize.fn('CURDATE'))),
//             Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('event_date')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
//         ]
//       };
//     } else if (range === 'week') {
//       dateFilter = {
//         [Sequelize.Op.and]: [
//             Sequelize.where(Sequelize.fn('YEARWEEK', Sequelize.col('event_date'), 1), Sequelize.fn('YEARWEEK', Sequelize.fn('CURDATE'), 1))
//         ]
//       };
//     } else if (range === 'year') {
//       dateFilter = {
//         [Sequelize.Op.and]: [
//             Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('event_date')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
//         ]
//       };
//     }

//     const whereConditions = {
//       is_active: 1,
//       ...dateFilter
//     };

//     // ----------- STATUS FILTER -----------
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
//           whereConditions.is_draft = 0;
//           whereConditions.event_date = {
//             ...(dateFilter.event_date || {}),
//             [Sequelize.Op.gt]: today
//           };
//           break;
//         case 'draft':
//           whereConditions.is_draft = 1;
//           break;
//         default:
//           return res.status(400).json({ error: true, message: 'Invalid status filter' });
//       }
//     }

//     // ----------- EVENT TYPE FILTER -----------
//     if (event_type) {
//       whereConditions.event_type = event_type;
//     }

//     // ----------- SEARCH FILTER -----------
//     if (search) {
//       whereConditions.project_name = Sequelize.where(
//         Sequelize.fn('LOWER', Sequelize.col('project_name')),
//         { [Sequelize.Op.like]: `%${search.toLowerCase()}%` }
//       );
//     }

//     // ----------- STATS COUNTS (Respecting Date Filter) -----------
//     const [
//       total_active,
//       total_cancelled,
//       total_completed,
//       total_upcoming,
//       total_draft
//     ] = await Promise.all([
//       stream_project_booking.count({
//         where: { is_active: 1, is_cancelled: 0, is_completed: 0, is_draft: 0, ...dateFilter }
//       }),
//       stream_project_booking.count({
//         where: { is_cancelled: 1, ...dateFilter }
//       }),
//       stream_project_booking.count({
//         where: { is_completed: 1, ...dateFilter }
//       }),
//       stream_project_booking.count({
//         where: {
//           is_cancelled: 0,
//           is_draft: 0,
//           ...dateFilter,
//           event_date: {
//             ...(dateFilter.event_date || {}),
//             [Sequelize.Op.gt]: today
//           }
//         }
//       }),
//       stream_project_booking.count({
//         where: { is_draft: 1, ...dateFilter }
//       }),
//     ]);

//     const projects = await stream_project_booking.findAll({
//       where: whereConditions,
//       ...(noPagination ? {} : { limit: pageSize, offset }),
//       order: [['event_date', 'DESC']],
//     });

//     if (!projects || projects.length === 0) {
//       return res.status(200).json({
//         error: false,
//         message: 'No projects found',
//         data: {
//             stats: { total_active, total_cancelled, total_completed, total_upcoming, total_draft },
//             projects: []
//         }
//       });
//     }

//     const projectDetailsPromises = projects.map(async (project) => {
//       const assignedCrew = await assigned_crew.findAll({
//         where: { project_id: project.stream_project_booking_id, is_active: 1 },
//         include: [{ model: crew_members, as: 'crew_member', attributes: ['crew_member_id', 'first_name', 'last_name', 'primary_role'] }],
//       });

//       const assignedEquipment = await assigned_equipment.findAll({
//         where: { project_id: project.stream_project_booking_id, is_active: 1 },
//         include: [{ model: equipment, as: 'equipment', attributes: ['equipment_id', 'equipment_name'] }],
//       });

//       const assignedPostProd = await assigned_post_production_member.findAll({
//         where: { project_id: project.stream_project_booking_id, is_active: 1 },
//         include: [{ model: post_production_members, as: 'post_production_member', attributes: ['post_production_member_id', 'first_name', 'last_name', 'email'] }],
//       });

//       return {
//         project: {
//           ...project.toJSON(),
//           event_location: (() => {
//             const loc = project.event_location;
//             if (!loc) return null;
//             try {
//               if (typeof loc === "string" && (loc.startsWith("{") || loc.startsWith("["))) {
//                 const parsed = JSON.parse(loc);
//                 return parsed.address || parsed;
//               }
//             } catch (e) { return loc; }
//             return loc;
//           })()
//         },
//         assignedCrew,
//         assignedEquipment,
//         assignedPostProductionMembers: assignedPostProd,
//       };
//     });

//     const projectDetails = await Promise.all(projectDetailsPromises);

//     return res.status(200).json({
//       error: false,
//       message: 'All project details retrieved successfully',
//       data: {
//         stats: { total_active, total_cancelled, total_completed, total_upcoming, total_draft },
//         projects: projectDetails,
//         pagination: noPagination ? null : {
//             page: pageNumber,
//             limit: pageSize,
//             totalRecords: total_active + total_cancelled + total_completed + total_upcoming + total_draft,
//           }
//       },
//     });
//   } catch (error) {
//     console.error('Error fetching project details:', error);
//     return res.status(500).json({ error: true, message: 'Internal server error' });
//   }
// };

// exports.getAllProjectDetails = async (req, res) => {
//   try {
//     let { status, event_type, search, limit, page, range, start_date, end_date } = req.query;
//     const today = new Date();
//     const noPagination = !limit && !page;

//     let pageNumber = null, pageSize = null, offset = null;
//     if (!noPagination) {
//       pageNumber = parseInt(page ?? 1, 10);
//       pageSize = parseInt(limit ?? 10, 10);
//       offset = (pageNumber - 1) * pageSize;
//     }

//     // 1. Setup Date Filters
//     let dateFilter = {};
//     if (start_date && end_date) {
//       dateFilter = { event_date: { [Sequelize.Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`] } };
//     } else if (range === 'month') {
//       dateFilter = { [Sequelize.Op.and]: [
//         Sequelize.where(Sequelize.fn('MONTH', Sequelize.col('event_date')), Sequelize.fn('MONTH', Sequelize.fn('CURDATE'))),
//         Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('event_date')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
//       ]};
//     }

//     const whereConditions = { is_active: 1, ...dateFilter };

//     // 2. Status & Search Filters
//     if (status) {
//       if (status === 'cancelled') whereConditions.is_cancelled = 1;
//       else if (status === 'completed') whereConditions.is_completed = 1;
//       else if (status === 'upcoming') {
//         whereConditions.is_cancelled = 0; whereConditions.is_draft = 0;
//         whereConditions.event_date = { ...(dateFilter.event_date || {}), [Sequelize.Op.gt]: today };
//       }
//       else if (status === 'draft') whereConditions.is_draft = 1;
//     }
//     if (event_type) whereConditions.event_type = event_type;
//     if (search) {
//       whereConditions.project_name = Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('project_name')), { [Sequelize.Op.like]: `%${search.toLowerCase()}%` });
//     }

//     // 3. Fetch Stats + Event Type Master in parallel
//     const [
//       total_active, total_cancelled, total_completed, total_upcoming, total_draft,
//       allEventMasterTypes // Fetch names for numeric IDs like '6'
//     ] = await Promise.all([
//       stream_project_booking.count({ where: { is_active: 1, is_cancelled: 0, is_completed: 0, is_draft: 0, ...dateFilter } }),
//       stream_project_booking.count({ where: { is_cancelled: 1, ...dateFilter } }),
//       stream_project_booking.count({ where: { is_completed: 1, ...dateFilter } }),
//       stream_project_booking.count({ where: { is_cancelled: 0, is_draft: 0, ...dateFilter, event_date: { [Sequelize.Op.gt]: today } } }),
//       stream_project_booking.count({ where: { is_draft: 1, ...dateFilter } }),
//       event_type_master.findAll({ attributes: ['event_type_id', 'event_type_name'], raw: true })
//     ]);

//     const projects = await stream_project_booking.findAll({
//       where: whereConditions,
//       ...(noPagination ? {} : { limit: pageSize, offset }),
//       order: [['event_date', 'DESC']],
//     });

//     // 4. Processing Loop
//     const projectDetails = await Promise.all(projects.map(async (project) => {
//       const [assignedCrewData, assignedEquipData, assignedPostProdData] = await Promise.all([
//         assigned_crew.findAll({
//           where: { project_id: project.stream_project_booking_id, is_active: 1 },
//           include: [{ model: crew_members, as: 'crew_member', attributes: ['crew_member_id', 'first_name', 'last_name', 'primary_role'] }],
//         }),
//         assigned_equipment.findAll({
//           where: { project_id: project.stream_project_booking_id, is_active: 1 },
//           include: [{ model: equipment, as: 'equipment', attributes: ['equipment_id', 'equipment_name'] }],
//         }),
//         assigned_post_production_member.findAll({
//           where: { project_id: project.stream_project_booking_id, is_active: 1 },
//           include: [{ model: post_production_members, as: 'post_production_member', attributes: ['post_production_member_id', 'first_name', 'last_name', 'email'] }],
//         })
//       ]);

//       // --- NEW LOGIC: Map Event Type to Labels ---
//       const rawTypes = project.event_type ? project.event_type.split(',') : [];
//       const formattedTypes = rawTypes.map(t => {
//         const val = t.trim();
//         // Check if it's a numeric ID in the master table
//         const masterMatch = allEventMasterTypes.find(m => String(m.event_type_id) === val);
//         if (masterMatch) return masterMatch.event_type_name;

//         // Custom mapping for string-based database values
//         const stringMap = {
//           'videographer': 'Videography',
//           'photographer': 'Photography'
//         };
//         return stringMap[val.toLowerCase()] || val.charAt(0).toUpperCase() + val.slice(1);
//       });

//       return {
//         project: {
//           ...project.toJSON(),
//           event_type_labels: formattedTypes.join(', '), // New field: "Videography, Photography"
//           event_location: (() => {
//             const loc = project.event_location;
//             if (!loc) return null;
//             try {
//               if (typeof loc === "string" && (loc.startsWith("{") || loc.startsWith("["))) {
//                 const parsed = JSON.parse(loc);
//                 return parsed.address || parsed;
//               }
//             } catch (e) { return loc; }
//             return loc;
//           })()
//         },
//         assignedCrew: assignedCrewData,
//         assignedEquipment: assignedEquipData,
//         assignedPostProductionMembers: assignedPostProdData,
//       };
//     }));

//     return res.status(200).json({
//       error: false,
//       message: 'All project details retrieved successfully',
//       data: {
//         stats: { total_active, total_cancelled, total_completed, total_upcoming, total_draft },
//         projects: projectDetails,
//         pagination: noPagination ? null : {
//             page: pageNumber,
//             limit: pageSize,
//             totalRecords: total_active + total_cancelled + total_completed + total_upcoming + total_draft,
//         }
//       },
//     });
//   } catch (error) {
//     console.error('Error fetching project details:', error);
//     return res.status(500).json({ error: true, message: 'Internal server error' });
//   }
// };


// exports.getAllProjectDetails = async (req, res) => {
//   try {
//     let { status, event_type, search, limit, page, range, start_date, end_date, date_on } = req.query;
//     const today = new Date();
//     const noPagination = !limit && !page;

//     let pageNumber = null, pageSize = null, offset = null;
//     if (!noPagination) {
//       pageNumber = parseInt(page ?? 1, 10);
//       pageSize = parseInt(limit ?? 10, 10);
//       offset = (pageNumber - 1) * pageSize;
//     }

//     // 1. Setup Date Filters
//     let dateFilter = {};
    
//     if (start_date && end_date) {
//       dateFilter = { event_date: { [Sequelize.Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`] } };
//     } else if (range === 'month') {
//       dateFilter = { [Sequelize.Op.and]: [
//         Sequelize.where(Sequelize.fn('MONTH', Sequelize.col('event_date')), Sequelize.fn('MONTH', Sequelize.fn('CURDATE'))),
//         Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('event_date')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
//       ]};
//     } else if (range === 'week') {
//       dateFilter = { [Sequelize.Op.and]: [
//         Sequelize.where(Sequelize.fn('WEEK', Sequelize.col('event_date')), Sequelize.fn('WEEK', Sequelize.fn('CURDATE'))),
//         Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('event_date')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
//       ]};
//     } else if (range === 'all') {
//       dateFilter = { event_date: { [Sequelize.Op.ne]: null } };  // Optional check to ensure event_date is not null
//     } else if (date_on) {
//       // If custom date is provided
//       dateFilter = { event_date: { [Sequelize.Op.eq]: `${date_on} 00:00:00` } };
//     }

//     // --- Filter for Paid Projects Only ---
//     const paidOnlyFilter = { 
//       payment_id: { [Sequelize.Op.ne]: null },
//       is_active: 1 
//     };

//     const whereConditions = { ...paidOnlyFilter, ...dateFilter };

//     // 2. Status & Search Filters
//     if (status) {
//       if (status === 'cancelled') whereConditions.is_cancelled = 1;
//       else if (status === 'completed') whereConditions.is_completed = 1;
//       else if (status === 'upcoming') {
//         whereConditions.is_cancelled = 0; 
//         whereConditions.is_draft = 0;
//         whereConditions.event_date = { ...(dateFilter.event_date || {}), [Sequelize.Op.gt]: today };
//       }
//       else if (status === 'draft') whereConditions.is_draft = 1;
//     }
    
//     if (event_type) whereConditions.event_type = event_type;
    
//     if (search) {
//       whereConditions.project_name = Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('project_name')), { 
//         [Sequelize.Op.like]: `%${search.toLowerCase()}%` 
//       });
//     }

//     const [
//       total_active, total_cancelled, total_completed, total_upcoming, total_draft,
//       allEventMasterTypes 
//     ] = await Promise.all([
//       stream_project_booking.count({ where: { ...paidOnlyFilter, is_cancelled: 0, is_completed: 0, is_draft: 0, ...dateFilter } }),
//       stream_project_booking.count({ where: { ...paidOnlyFilter, is_cancelled: 1, ...dateFilter } }),
//       stream_project_booking.count({ where: { ...paidOnlyFilter, is_completed: 1, ...dateFilter } }),
//       stream_project_booking.count({ where: { ...paidOnlyFilter, is_cancelled: 0, is_draft: 0, ...dateFilter, event_date: { [Sequelize.Op.gt]: today } } }),
//       stream_project_booking.count({ where: { ...paidOnlyFilter, is_draft: 1, ...dateFilter } }),
//       event_type_master.findAll({ attributes: ['event_type_id', 'event_type_name'], raw: true })
//     ]);

//     const projects = await stream_project_booking.findAll({
//       where: whereConditions,
//       ...(noPagination ? {} : { limit: pageSize, offset }),
//       order: [['event_date', 'ASC']],
//     });

//     const projectDetails = await Promise.all(projects.map(async (project) => {
//       const [assignedCrewData, assignedEquipData, assignedPostProdData, paymentData] = await Promise.all([
//         assigned_crew.findAll({
//           where: { project_id: project.stream_project_booking_id, is_active: 1 },
//           include: [{ model: crew_members, as: 'crew_member', attributes: ['crew_member_id', 'first_name', 'last_name', 'primary_role'] }],
//         }),
//         assigned_equipment.findAll({
//           where: { project_id: project.stream_project_booking_id, is_active: 1 },
//           include: [{ model: equipment, as: 'equipment', attributes: ['equipment_id', 'equipment_name'] }],
//         }),
//         assigned_post_production_member.findAll({
//           where: { project_id: project.stream_project_booking_id, is_active: 1 },
//           include: [{ model: post_production_members, as: 'post_production_member', attributes: ['post_production_member_id', 'first_name', 'last_name', 'email'] }],
//         }),
//         payment_transactions.findOne({
//           where: { payment_id: project.payment_id },
//           attributes: ['total_amount']
//         })
//       ]);

//       const rawTypes = project.event_type ? project.event_type.split(',') : [];
//       const formattedTypes = rawTypes.map(t => {
//         const val = t.trim();
//         const masterMatch = allEventMasterTypes.find(m => String(m.event_type_id) === val);
//         if (masterMatch) return masterMatch.event_type_name;
//         const stringMap = { 'videographer': 'Videography', 'photographer': 'Photography' };
//         return stringMap[val.toLowerCase()] || val.charAt(0).toUpperCase() + val.slice(1);
//       });

//       return {
//         project: {
//           ...project.toJSON(),
//           total_paid_amount: paymentData ? paymentData.total_amount : 0,
//           event_type_labels: formattedTypes.join(', '),
//           event_location: (() => {
//             const loc = project.event_location;
//             if (!loc) return null;
//             try {
//               if (typeof loc === "string" && (loc.startsWith("{") || loc.startsWith("["))) {
//                 const parsed = JSON.parse(loc);
//                 return parsed.address || parsed;
//               }
//             } catch (e) { return loc; }
//             return loc;
//           })()
//         },
//         assignedCrew: assignedCrewData,
//         assignedEquipment: assignedEquipData,
//         assignedPostProductionMembers: assignedPostProdData,
//       };
//     }));

//     return res.status(200).json({
//       error: false,
//       message: 'Paid project details with amounts retrieved successfully',
//       data: {
//         stats: { total_active, total_cancelled, total_completed, total_upcoming, total_draft },
//         projects: projectDetails,
//         pagination: noPagination ? null : {
//             page: pageNumber,
//             limit: pageSize,
//             totalRecords: total_active + total_cancelled + total_completed + total_upcoming + total_draft,
//         }
//       },
//     });
//   } catch (error) {
//     console.error('Error fetching project details:', error);
//     return res.status(500).json({ error: true, message: 'Internal server error' });
//   }
// };


exports.getAllProjectDetails = async (req, res) => {
  try {
    // 1. Added 'category' to the query parameters
    let { status, event_type, search, limit, page, range, start_date, end_date, date_on, category } = req.query;
    const today = new Date();
    const noPagination = !limit && !page;

    let pageNumber = null, pageSize = null, offset = null;
    if (!noPagination) {
      pageNumber = parseInt(page ?? 1, 10);
      pageSize = parseInt(limit ?? 10, 10);
      offset = (pageNumber - 1) * pageSize;
    }

    // --- Category Keyword Configuration (Matches your other API) ---
    const categoryConfig = {
      corporate: ['corporate'],
      wedding: ['wedding'],
      private: ['private'],
      commercial: ['commercial', 'brand', 'advertising'],
      social: ['social'],
      podcasts: ['podcast'],
      music: ['music'],
      narrative: ['narrative', 'short film']
    };

    // Setup Date Filters
    let dateFilter = {};
    if (start_date && end_date) {
      dateFilter = { event_date: { [Sequelize.Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`] } };
    } else if (range === 'month') {
      dateFilter = { [Sequelize.Op.and]: [
        Sequelize.where(Sequelize.fn('MONTH', Sequelize.col('event_date')), Sequelize.fn('MONTH', Sequelize.fn('CURDATE'))),
        Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('event_date')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
      ]};
    } else if (range === 'week') {
      dateFilter = { [Sequelize.Op.and]: [
        Sequelize.where(Sequelize.fn('WEEK', Sequelize.col('event_date')), Sequelize.fn('WEEK', Sequelize.fn('CURDATE'))),
        Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('event_date')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
      ]};
    } else if (range === 'all') {
      dateFilter = { event_date: { [Sequelize.Op.ne]: null } };
    } else if (date_on) {
      dateFilter = { event_date: { [Sequelize.Op.eq]: `${date_on} 00:00:00` } };
    }

    const paidOnlyFilter = { 
      payment_id: { [Sequelize.Op.ne]: null },
      is_active: 1 
    };

    let whereConditions = { ...paidOnlyFilter, ...dateFilter };

    // 2. NEW: Category Filter Logic
    // This checks if project_name contains any of the keywords for the selected category
    if (category && categoryConfig[category.toLowerCase()]) {
      const keywords = categoryConfig[category.toLowerCase()];
      const categoryConditions = keywords.map(word => ({
        project_name: { [Sequelize.Op.like]: `%${word}%` }
      }));
      
      // We use [Sequelize.Op.or] because a commercial project might be 'brand' OR 'advertising'
      whereConditions = {
        ...whereConditions,
        [Sequelize.Op.or]: categoryConditions
      };
    }

    // 3. Status & Search Filters
    if (status) {

      const statusLower = status.toLowerCase().replace(/\s+/g, '');

      const statusMap = {
        'initiated': 0,
        'preproduction': 1,
        'postproduction': 2,
        'revision': 3,
        'completed': 4,
        'cancelled': 5
      };

      if (statusMap.hasOwnProperty(statusLower)) {
        whereConditions.status = statusMap[statusLower];
      }

      else if (statusLower === 'shootday') {

        whereConditions.status = {
          [Sequelize.Op.notIn]: [4, 5]
        };
        whereConditions = {
          ...whereConditions,
          [Sequelize.Op.and]: [
            ...(whereConditions[Sequelize.Op.and] || []),
            Sequelize.where(
              Sequelize.fn('DATE', Sequelize.col('event_date')),
              Sequelize.fn('CURDATE')
            )
          ]
        };
      }

      else if (statusLower === 'upcoming') {

        whereConditions.status = {
          [Sequelize.Op.notIn]: [4, 5]
        };

        whereConditions.event_date = {
          ...(whereConditions.event_date || {}),
          [Sequelize.Op.gt]: today
        };
      }

      else if (statusLower === 'draft') {
        whereConditions.is_draft = 1;
      }
    }

    
    if (event_type) whereConditions.event_type = event_type;
    
    if (search) {
      // If category filter is already using Op.or, we must be careful not to overwrite it
      const searchCondition = Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('project_name')), { 
        [Sequelize.Op.like]: `%${search.toLowerCase()}%` 
      });
      
      if (whereConditions[Sequelize.Op.or]) {
        // If both category AND search are used, we wrap them in an Op.and
        whereConditions = {
            [Sequelize.Op.and]: [
                { [Sequelize.Op.or]: whereConditions[Sequelize.Op.or] },
                searchCondition
            ],
            ...paidOnlyFilter,
            ...dateFilter
        };
      } else {
        whereConditions.project_name = searchCondition;
      }
    }

    // 4. Get Counts and Projects
    // Note: I updated the counts to use 'whereConditions' so they react to the category filter
    const [
      total_active, total_cancelled, total_completed, total_upcoming, total_draft,
      allEventMasterTypes 
    ] = await Promise.all([
      stream_project_booking.count({ where: { ...whereConditions, is_cancelled: 0, is_completed: 0, is_draft: 0 } }),
      stream_project_booking.count({ where: { ...whereConditions, is_cancelled: 1 } }),
      stream_project_booking.count({ where: { ...whereConditions, is_completed: 1 } }),
      stream_project_booking.count({ where: { ...whereConditions, is_cancelled: 0, is_draft: 0, event_date: { [Sequelize.Op.gt]: today } } }),
      stream_project_booking.count({ where: { ...whereConditions, is_draft: 1 } }),
      event_type_master.findAll({ attributes: ['event_type_id', 'event_type_name'], raw: true })
    ]);

    const projects = await stream_project_booking.findAll({
      where: whereConditions,
      ...(noPagination ? {} : { limit: pageSize, offset }),
      order: [['event_date', 'ASC']],
    });

    const projectDetails = await Promise.all(projects.map(async (project) => {
      const [assignedCrewData, assignedEquipData, assignedPostProdData, paymentData] = await Promise.all([
        assigned_crew.findAll({
          where: { project_id: project.stream_project_booking_id, is_active: 1 },
          include: [{ model: crew_members, as: 'crew_member', attributes: ['crew_member_id', 'first_name', 'last_name', 'primary_role'] }],
        }),
        assigned_equipment.findAll({
          where: { project_id: project.stream_project_booking_id, is_active: 1 },
          include: [{ model: equipment, as: 'equipment', attributes: ['equipment_id', 'equipment_name'] }],
        }),
        assigned_post_production_member.findAll({
          where: { project_id: project.stream_project_booking_id, is_active: 1 },
          include: [{ model: post_production_members, as: 'post_production_member', attributes: ['post_production_member_id', 'first_name', 'last_name', 'email'] }],
        }),
        payment_transactions.findOne({
          where: { payment_id: project.payment_id },
          attributes: ['total_amount']
        })
      ]);

      const rawTypes = project.event_type ? project.event_type.split(',') : [];
      const formattedTypes = rawTypes.map(t => {
        const val = t.trim();
        const masterMatch = allEventMasterTypes.find(m => String(m.event_type_id) === val);
        if (masterMatch) return masterMatch.event_type_name;
        const stringMap = { 'videographer': 'Videography', 'photographer': 'Photography' };
        return stringMap[val.toLowerCase()] || val.charAt(0).toUpperCase() + val.slice(1);
      });

      return {
        project: {
          ...project.toJSON(),
          total_paid_amount: paymentData ? paymentData.total_amount : 0,
          event_type_labels: formattedTypes.join(', '),
          event_location: (() => {
            const loc = project.event_location;
            if (!loc) return null;
            try {
              if (typeof loc === "string" && (loc.startsWith("{") || loc.startsWith("["))) {
                const parsed = JSON.parse(loc);
                return parsed.address || parsed;
              }
            } catch (e) { return loc; }
            return loc;
          })()
        },
        assignedCrew: assignedCrewData,
        assignedEquipment: assignedEquipData,
        assignedPostProductionMembers: assignedPostProdData,
      };
    }));

    return res.status(200).json({
      error: false,
      message: 'Filtered project details retrieved successfully',
      data: {
        stats: { total_active, total_cancelled, total_completed, total_upcoming, total_draft },
        projects: projectDetails,
        pagination: noPagination ? null : {
            page: pageNumber,
            limit: pageSize,
            totalRecords: total_active + total_cancelled + total_completed + total_upcoming + total_draft,
        }
      },
    });
  } catch (error) {
    console.error('Error fetching project details:', error);
    return res.status(500).json({ error: true, message: 'Internal server error' });
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
        let {
            page = 1,
            limit = 20,
            search,
            location,
            status,
            range,
            start_date,
            end_date
        } = req.body;

        page = parseInt(page);
        limit = parseInt(limit);
        const offset = (page - 1) * limit;

        let conditions = [{ is_active: 1 }];

        if (status) {
            if (status === 'pending') conditions.push({ is_crew_verified: 0 });
            else if (status === 'approved') conditions.push({ is_crew_verified: 1 });
            else if (status === 'rejected') conditions.push({ is_crew_verified: 2 });
        }

        if (start_date && end_date) {
            conditions.push({
                'created_at': { [Sequelize.Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`] }
            });
        } else if (range === 'month') {
            conditions.push(
                Sequelize.where(Sequelize.fn('MONTH', Sequelize.col('crew_members.created_at')), Sequelize.fn('MONTH', Sequelize.fn('CURDATE'))),
                Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('crew_members.created_at')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
            );
        }

        if (search) conditions.push({ first_name: { [Sequelize.Op.like]: `%${search}%` } });
        if (location) conditions.push({ location: { [Sequelize.Op.like]: `%${location}%` } });

        const [{ count, rows: members }, allRoles] = await Promise.all([
            crew_members.findAndCountAll({
                where: { [Sequelize.Op.and]: conditions },
                distinct: true,
                col: 'crew_member_id',
                include: [{
                    model: crew_member_files,
                    as: 'crew_member_files',
                    attributes: ['crew_files_id', 'file_type', 'file_path'],
                }],
                order: [
                    ['is_crew_verified', 'ASC'],
                    ['is_beige_member', 'ASC'],
                    ['crew_member_id', 'DESC'],
                ],
                limit,
                offset,
            }),
            crew_roles.findAll({ attributes: ['role_id', 'role_name'], raw: true })
        ]);

        const processedMembers = members.map((member) => {
            const memberData = member.get({ clone: true });

            let statusLabel = 'pending';
            if (member.is_crew_verified === 1) statusLabel = 'approved';
            else if (member.is_crew_verified === 2) statusLabel = 'rejected';

            let finalLocation = memberData.location;
            if (finalLocation && typeof finalLocation === 'string' && (finalLocation.startsWith('{') || finalLocation.startsWith('['))) {
                try {
                    const parsed = JSON.parse(finalLocation);
                    finalLocation = parsed.address || parsed || finalLocation;
                } catch { }
            }

            let roleNames = [];
            const rawRole = memberData.primary_role;
            if (rawRole) {
                let roleIds = [];
                try {
                    const parsed = JSON.parse(rawRole);
                    roleIds = Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
                } catch (e) {
                    roleIds = [String(rawRole)];
                }
                roleNames = allRoles
                    .filter(r => roleIds.includes(String(r.role_id)))
                    .map(r => r.role_name);
            }

            return {
                ...memberData,
                location: finalLocation,
                status: statusLabel,
                role: roleNames.length > 0 ? { role_name: roleNames.join(", ") } : null
            };
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
        return res.status(500).json({ error: true, message: "Internal server error" });
    }
};

exports.verifyCrewMember = async (req, res) => {
  try {
    const { crew_member_id, status } = req.body;

    if (!crew_member_id || (status !== 1 && status !== 2)) {
      return res.status(400).json({
        error: true,
        message: "Missing or invalid 'crew_member_id' or 'status'.",
      });
    }

    const updatedMember = await crew_members.update(
      { is_crew_verified: status },
      { where: { crew_member_id } }
    );

    if (updatedMember[0] === 0) {
      return res.status(404).json({ error: true, message: "Crew member not found." });
    }

    try {
      if (status === 1) {
        await deleteSheetRow('Crew_data', crew_member_id);
      } else if (status === 2) {
        await updateSheetRow('Crew_data', crew_member_id, {
          'H': 'rejected'
        });
      }
    } catch (sheetErr) {
      console.error("Google Sheets Sync Error:", sheetErr.message);
    }

    return res.status(200).json({
      error: false,
      message: `Crew member ${status === 1 ? 'approved and removed from sheet' : 'rejected in sheet'} successfully.`,
    });
  } catch (error) {
    console.error("Verify Crew Member Error:", error);
    return res.status(500).json({ error: true, message: "Internal server error" });
  }
};


exports.getCrewMemberById = async (req, res) => {
    try {
        const { crew_member_id } = req.params;

        let member = await crew_members.findOne({
            where: { crew_member_id },
            include: [{
                model: crew_member_files,
                as: 'crew_member_files',
                attributes: ['crew_member_id', 'file_type', 'file_path', 'created_at', 'title', 'tag'],
                where: { is_active: 1 },
                required: false
            }]
        });

        if (!member) {
            return res.status(404).json({ error: true, message: "Crew member not found" });
        }

        const loc = member.location;
        if (loc && typeof loc === 'string' && (loc.startsWith('{') || loc.startsWith('['))) {
            try {
                const parsed = JSON.parse(loc);
                member.location = parsed.address || parsed || loc;
            } catch { }
        }

        let skillIds = [];
        try {
            const rawSkills = member.skills;
            if (rawSkills) {
                const parsedSkills = typeof rawSkills === 'string' ? JSON.parse(rawSkills) : rawSkills;
                skillIds = Array.isArray(parsedSkills) ? parsedSkills.map(id => parseInt(id)) : [parseInt(parsedSkills)];
            }
        } catch (err) { skillIds = []; }

        let roleIds = [];
        try {
            const rawRole = member.primary_role;
            if (rawRole) {
                const parsedRole = (typeof rawRole === 'string' && (rawRole.startsWith('[') || rawRole.startsWith('{'))) 
                    ? JSON.parse(rawRole) 
                    : rawRole;
                roleIds = Array.isArray(parsedRole) ? parsedRole.map(id => String(id)) : [String(parsedRole)];
            }
        } catch (err) { roleIds = []; }

        const [skillList, roleList] = await Promise.all([
            skills_master.findAll({ where: { id: skillIds }, attributes: ['id', 'name'] }),
            crew_roles.findAll({ where: { role_id: roleIds }, attributes: ['role_id', 'role_name'] })
        ]);

        const memberJson = member.toJSON();
        memberJson.skills = skillList;
        memberJson.role = roleList.length > 0 
            ? { role_name: roleList.map(r => r.role_name).join(", ") } 
            : null;

        return res.status(200).json({
            error: false,
            message: "Crew member fetched successfully",
            data: memberJson,
        });

    } catch (error) {
        console.error("Get Crew Member By ID Error:", error);
        return res.status(500).json({ error: true, message: "Internal server error" });
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
    const {
      search,
      category_id,
      location_id,
      limit = 50,
      page = 1
    } = req.query;

    // 1. Build the base filter
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

    // 2. Define "Today" boundaries
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    // 3. GET ASSIGNMENTS FOR TODAY (Summing units from both tables)
    const inUseMap = {}; // equipment_id -> total_units_out

    // A. Random/Manual Assignments
    const directAssignments = await equipment_assignments.findAll({
      where: {
        check_out_date: { [Op.lte]: endOfToday },
        expected_return_date: { [Op.gte]: startOfToday },
        is_active: 1
      },
      attributes: ['equipment_id'],
      raw: true
    });
    directAssignments.forEach(a => {
      inUseMap[a.equipment_id] = (inUseMap[a.equipment_id] || 0) + 1;
    });

    // B. Project Based Assignments (Matched via stream_project_booking event_date)
    const projectAssignments = await assigned_equipment.findAll({
      where: { is_active: 1 },
      include: [{
        model: stream_project_booking,
        as: 'project', 
        where: { event_date: { [Op.between]: [startOfToday, endOfToday] } },
        attributes: []
      }],
      attributes: ['equipment_id'],
      raw: true
    });
    projectAssignments.forEach(a => {
      inUseMap[a.equipment_id] = (inUseMap[a.equipment_id] || 0) + 1;
    });

    // 4. CALCULATE GLOBAL SUMMARY (Calculated across all equipment matching filters)
    const allMatchingEquipment = await equipment.findAll({
      where,
      attributes: ['equipment_id', 'quantity', 'initial_status_id'],
      raw: true
    });

    let summaryStats = {
      total_equipment_types: allMatchingEquipment.length,
      available_equipment_types: 0,
      in_use_equipment_types: 0,
      maintenance_equipment_types: 0,
      // Raw unit counts
      total_units_count: 0,
      units_in_use_count: 0
    };

    allMatchingEquipment.forEach(item => {
      const unitsOut = inUseMap[item.equipment_id] || 0;
      const totalQty = parseInt(item.quantity) || 0;

      summaryStats.total_units_count += totalQty;
      summaryStats.units_in_use_count += unitsOut;

      // Type-based logic (What you asked for):
      // 1. Available Equipment: Count if at least one unit is NOT in use
      if (totalQty > unitsOut) {
        summaryStats.available_equipment_types++;
      }

      // 2. In Use Equipment: Count if at least one unit IS in use
      if (unitsOut > 0) {
        summaryStats.in_use_equipment_types++;
      }

      // 3. Maintenance Count (Status 2)
      if (item.initial_status_id == 2) {
        summaryStats.maintenance_equipment_types++;
      }
    });

    // 5. FETCH PAGINATED LIST
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const list = await equipment.findAll({
      where,
      include: [
        { model: equipment_photos, as: 'equipment_photos', attributes: ['photo_id', 'file_url'] },
        { model: equipment_documents, as: 'equipment_documents', attributes: ['document_id', 'doc_type', 'file_url'] },
        { model: equipment_specs, as: 'equipment_specs', attributes: ['spec_name', 'spec_value'] },
        { model: equipment_accessories, as: 'equipment_accessories', attributes: ['accessory_name'] }
      ],
      order: [['equipment_id', 'ASC']],
      limit: parseInt(limit),
      offset
    });

    // 6. PROCESS PAGINATED LIST
    const processedList = list.map(item => {
      const eq = item.toJSON();
      const unitsOut = inUseMap[eq.equipment_id] || 0;
      const totalQty = parseInt(eq.quantity) || 0;

      eq.units_in_use = unitsOut;
      eq.units_available = Math.max(0, totalQty - unitsOut);
      eq.is_available = (totalQty > unitsOut) ? 1 : 0; 

      if (eq.storage_location && typeof eq.storage_location === 'string' && (eq.storage_location.startsWith('{') || eq.storage_location.startsWith('['))) {
        try {
          const parsed = JSON.parse(eq.storage_location);
          eq.storage_location = parsed.address || parsed;
        } catch (e) {}
      }
      return eq;
    });

    return res.status(200).json({
      error: false,
      code: 200,
      summary: {
        // Equipment Type Counts (Count as 1 even if qty is 10)
        total_equipment: summaryStats.total_equipment_types,
        available_equipment: summaryStats.available_equipment_types,
        in_use_equipment: summaryStats.in_use_equipment_types,
        maintenance_equipment: summaryStats.maintenance_equipment_types,
        
        // Raw Unit Counts (Sum of all quantities)
        unit_summary: {
          total_units: summaryStats.total_units_count,
          units_in_use: summaryStats.units_in_use_count,
          units_available: summaryStats.total_units_count - summaryStats.units_in_use_count
        }
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

exports.getDashboardSummary = async (req, res) => {
  try {
    const { date_on } = req.query;
    
    let standardDateFilter = buildDateFilter(req);

    let bookingDateFilter = { ...standardDateFilter };

    if (date_on) {
      if (date_on.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const dayRange = {
          [Op.between]: [`${date_on} 00:00:00`, `${date_on} 23:59:59`]
        };

        bookingDateFilter = { event_date: dayRange };
        standardDateFilter = { created_at: dayRange };
      } 
      
      else if (date_on === 'event_date' && standardDateFilter.created_at) {
        bookingDateFilter = { event_date: standardDateFilter.created_at };
      }
    }

    const [
      total_shoots,
      active_shoots,
      completed_shoots,
      total_clients,
      total_CPs,
      approved_CPs,
      pending_CPs,
      rejected_CPs
    ] = await Promise.all([
      stream_project_booking.count({
        where: { is_active: 1, is_draft: 0, ...bookingDateFilter }
      }),

      stream_project_booking.count({
        where: { is_active: 1, is_completed: 0, is_cancelled: 0, is_draft: 0, ...bookingDateFilter }
      }),

      stream_project_booking.count({
        where: { is_active: 1, is_completed: 1, ...bookingDateFilter }
      }),

      clients.count({
        where: { is_active: 1, ...standardDateFilter }
      }),

      crew_members.count({
        where: { is_active: 1, ...standardDateFilter }
      }),

      crew_members.count({
        where: { is_active: 1, is_crew_verified: 1, ...standardDateFilter }
      }),

      crew_members.count({
        where: { is_active: 1, is_crew_verified: 0, ...standardDateFilter }
      }),

      crew_members.count({
        where: { is_active: 1, is_crew_verified: 2, ...standardDateFilter }
      })
    ]);

    return res.status(200).json({
      error: false,
      message: "Dashboard summary fetched successfully",
      data: {
        total_shoots: { count: total_shoots, growth: 3 },
        active_shoots: { count: active_shoots, growth: 3 },
        completed_shoots: { count: completed_shoots, growth: 3 },
        total_clients: { count: total_clients, growth: 3 },
        total_CPs: { count: total_CPs, growth: 3 },
        approved_CPs: { count: approved_CPs, growth: 3 },
        pending_CPs: { count: pending_CPs, growth: 3 },
        rejected_CPs: { count: rejected_CPs, growth: 3 }
      }
    });
  } catch (error) {
    console.error("Get Dashboard Summary:", error);
    return res.status(500).json({
      error: true,
      message: "Internal server error"
    });
  }
};


exports.getDashboardChartData = async (req, res) => {
    try {
        const { date_on } = req.query;

        let standardDateFilter = buildDateFilter(req);
        let bookingDateFilter = { ...standardDateFilter };

        if (date_on) {
            if (date_on.match(/^\d{4}-\d{2}-\d{2}$/)) {
                const dayRange = { [Op.between]: [`${date_on} 00:00:00`, `${date_on} 23:59:59`] };
                bookingDateFilter = { event_date: dayRange };
                standardDateFilter = { created_at: dayRange };
            } else if (date_on === 'event_date' && standardDateFilter.created_at) {
                bookingDateFilter = { event_date: standardDateFilter.created_at };
            }
        }

        const chartStartDate = moment().subtract(5, 'months').startOf('month').format('YYYY-MM-DD HH:mm:ss');
        const chartEndDate = moment().endOf('day').format('YYYY-MM-DD HH:mm:ss');
        const chartMonthRange = { [Op.between]: [chartStartDate, chartEndDate] };

        const shootDateCol = (date_on === 'event_date') ? 'event_date' : 'created_at';
        const paidShootFilter = { payment_id: { [Op.ne]: null } };

        const [
            total_shoots, active_shoots, completed_shoots, total_clients, total_CPs,
            approved_CPs, pending_CPs, rejected_CPs,
            total_leads,
            paid_leads,
            chartShoots, chartClients, chartCPs,
            chartUnpaidLeads
        ] = await Promise.all([
            stream_project_booking.count({ where: { is_active: 1, is_draft: 0, ...paidShootFilter, ...bookingDateFilter } }),
            stream_project_booking.count({ where: { is_active: 1, is_completed: 0, is_cancelled: 0, is_draft: 0, ...paidShootFilter, ...bookingDateFilter } }),
            stream_project_booking.count({ where: { is_active: 1, is_completed: 1, ...paidShootFilter, ...bookingDateFilter } }),
            
            clients.count({ where: { is_active: 1, ...standardDateFilter } }),
            crew_members.count({ where: { is_active: 1, ...standardDateFilter } }),
            crew_members.count({ where: { is_active: 1, is_crew_verified: 1, ...standardDateFilter } }),
            crew_members.count({ where: { is_active: 1, is_crew_verified: 0, ...standardDateFilter } }),
            crew_members.count({ where: { is_active: 1, is_crew_verified: 2, ...standardDateFilter } }),

            sales_leads.count({ where: { ...standardDateFilter } }),
            sales_leads.count({
                include: [{
                    model: stream_project_booking,
                    as: 'booking',
                    where: { payment_id: { [Op.ne]: null } },
                    required: true
                }],
                where: { ...standardDateFilter }
            }),

            stream_project_booking.findAll({
                attributes: [
                    [Sequelize.fn('DATE_FORMAT', Sequelize.col(shootDateCol), '%Y-%m'), 'month'],
                    [Sequelize.literal('SUM(CASE WHEN is_completed = 0 AND is_cancelled = 0 AND payment_id IS NOT NULL THEN 1 ELSE 0 END)'), 'active'],
                    [Sequelize.literal('SUM(CASE WHEN is_completed = 1 AND payment_id IS NOT NULL THEN 1 ELSE 0 END)'), 'completed'],
                    [Sequelize.literal('SUM(CASE WHEN payment_id IS NOT NULL THEN 1 ELSE 0 END)'), 'total']
                ],
                where: { is_active: 1, ...paidShootFilter, [shootDateCol]: chartMonthRange },
                group: [Sequelize.fn('DATE_FORMAT', Sequelize.col(shootDateCol), '%Y-%m')],
                raw: true
            }),
            clients.findAll({
                attributes: [
                    [Sequelize.fn('DATE_FORMAT', Sequelize.col('created_at'), '%Y-%m'), 'month'],
                    [Sequelize.fn('COUNT', Sequelize.literal('*')), 'count']
                ],
                where: { is_active: 1, created_at: chartMonthRange },
                group: [Sequelize.fn('DATE_FORMAT', Sequelize.col('created_at'), '%Y-%m')],
                raw: true
            }),
            crew_members.findAll({
                attributes: [
                    [Sequelize.fn('DATE_FORMAT', Sequelize.col('created_at'), '%Y-%m'), 'month'],
                    [Sequelize.fn('COUNT', Sequelize.literal('*')), 'count']
                ],
                where: { is_active: 1, created_at: chartMonthRange },
                group: [Sequelize.fn('DATE_FORMAT', Sequelize.col('created_at'), '%Y-%m')],
                raw: true
            }),
            sales_leads.findAll({
                attributes: [
                    [Sequelize.fn('DATE_FORMAT', Sequelize.col('sales_leads.created_at'), '%Y-%m'), 'month'],
                    [Sequelize.fn('COUNT', Sequelize.literal('*')), 'count']
                ],
                include: [{
                    model: stream_project_booking,
                    as: 'booking',
                    required: false
                }],
                where: { 
                    created_at: chartMonthRange,
                    [Op.or]: [
                        { '$booking.payment_id$': null },
                        { '$booking.stream_project_booking_id$': null }
                    ]
                },
                group: [Sequelize.fn('DATE_FORMAT', Sequelize.col('sales_leads.created_at'), '%Y-%m')],
                raw: true
            })
        ]);

        const unpaid_leads = total_leads - paid_leads;

        const generateSixMonthData = (dbResults, type) => {
            const result = [];
            for (let i = 5; i >= 0; i--) {
                const m = moment().subtract(i, 'months');
                const monthKey = m.format('YYYY-MM');
                const dbRow = dbResults.find(r => r.month === monthKey);

                if (type === 'shoots') {
                    result.push({
                        label: m.format('MMM'),
                        total: dbRow ? parseInt(dbRow.total) || 0 : 0,
                        active: dbRow ? parseInt(dbRow.active) || 0 : 0,
                        completed: dbRow ? parseInt(dbRow.completed) || 0 : 0
                    });
                } else {
                    result.push({
                        label: m.format('MMM'),
                        count: dbRow ? parseInt(dbRow.count) || 0 : 0
                    });
                }
            }
            return result;
        };

        const shootChartData = generateSixMonthData(chartShoots, 'shoots');
        const clientChartData = generateSixMonthData(chartClients, 'others');
        const cpChartData = generateSixMonthData(chartCPs, 'others');
        const leadChartData = generateSixMonthData(chartUnpaidLeads, 'others');

        return res.status(200).json({
            error: false,
            message: "Dashboard data fetched successfully",
            summary: {
                total_shoots: { count: total_shoots, growth: 3 },
                active_shoots: { count: active_shoots, growth: 3 },
                completed_shoots: { count: completed_shoots, growth: 3 },
                total_clients: { count: total_clients, growth: 0 },
                total_CPs: { count: total_CPs, growth: 3 },
                approved_CPs: { count: approved_CPs, growth: 3 },
                pending_CPs: { count: pending_CPs, growth: 3 },
                rejected_CPs: { count: rejected_CPs, growth: 3 },
                // SUMMARY DATA
                total_leads: { count: total_leads, growth: 0 },
                paid_leads: { count: paid_leads, growth: 0 },
                unpaid_leads: { count: unpaid_leads, growth: 0 }
            },
            charts: {
                total_shoots: shootChartData.map(d => ({ label: d.label, value: d.total })),
                active_shoots: shootChartData.map(d => ({ label: d.label, value: d.active })),
                completed_shoots: shootChartData.map(d => ({ label: d.label, value: d.completed })),
                total_clients: clientChartData.map(d => ({ label: d.label, value: d.count })),
                total_CPs: cpChartData.map(d => ({ label: d.label, value: d.count })),
                unpaid_leads: leadChartData.map(d => ({ label: d.label, value: d.count }))
            }
        });

    } catch (error) {
        console.error("Dashboard API Error:", error);
        return res.status(500).json({ error: true, message: "Internal server error" });
    }
};

exports.getTotalRevenue = async (req, res) => {
  try {
    const totalRevenue = await payment_transactions.sum('total_amount', {
      where: { status: 'succeeded' }
    });

    return res.status(200).json({
      error: false,
      data: {
        total_revenue: Number(totalRevenue || 0)
      }
    });
  } catch (err) {
    console.error('Total Revenue Error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.getMonthlyRevenue = async (req, res) => {
  try {
    const data = await payment_transactions.findAll({
      attributes: [
        [Sequelize.fn('DATE_FORMAT', Sequelize.col('created_at'), '%b'), 'month'],
        [Sequelize.fn('SUM', Sequelize.col('cp_cost')), 'base_revenue'],
        [Sequelize.fn('SUM', Sequelize.col('beige_margin_amount')), 'margin_revenue'],
        [Sequelize.fn('SUM', Sequelize.col('total_amount')), 'total_revenue']
      ],
      where: { status: 'succeeded' },
      group: [Sequelize.fn('MONTH', Sequelize.col('created_at'))],
      order: [[Sequelize.fn('MONTH', Sequelize.col('created_at')), 'ASC']],
      limit: 6
    });

    return res.status(200).json({
      error: false,
      data
    });
  } catch (err) {
    console.error('Monthly Revenue Error:', err);
    return res.status(500).json({ error: true });
  }
};

exports.getWeeklyRevenue = async (req, res) => {
  try {
    const current = await payment_transactions.sum('total_amount', {
      where: {
        status: 'succeeded',
        created_at: {
          [Op.gte]: Sequelize.literal('DATE_SUB(CURDATE(), INTERVAL 7 DAY)')
        }
      }
    });

    const previous = await payment_transactions.sum('total_amount', {
      where: {
        status: 'succeeded',
        created_at: {
          [Op.between]: [
            Sequelize.literal('DATE_SUB(CURDATE(), INTERVAL 14 DAY)'),
            Sequelize.literal('DATE_SUB(CURDATE(), INTERVAL 7 DAY)')
          ]
        }
      }
    });

    const growth =
      previous && previous > 0
        ? (((current - previous) / previous) * 100).toFixed(1)
        : 0;

    return res.status(200).json({
      error: false,
      data: {
        weekly_revenue: Number(current || 0),
        growth_percent: Number(growth)
      }
    });
  } catch (err) {
    console.error('Weekly Revenue Error:', err);
    return res.status(500).json({ error: true });
  }
};

exports.getTotalPayout = async (req, res) => {
  try {
    const totalPayout = await payment_transactions.sum('cp_cost', {
      where: { status: 'succeeded' }
    });

    return res.status(200).json({
      error: false,
      data: {
        total_payout: Number(totalPayout || 0)
      }
    });
  } catch (err) {
    console.error('Total Payout Error:', err);
    return res.status(500).json({ error: true });
  }
};

exports.getWeeklyPayoutGraph = async (req, res) => {
  try {
    const data = await payment_transactions.findAll({
      attributes: [
        [Sequelize.fn('DAYNAME', Sequelize.col('created_at')), 'day'],
        [Sequelize.fn('SUM', Sequelize.col('cp_cost')), 'amount']
      ],
      where: {
        status: 'succeeded',
        created_at: {
          [Op.gte]: Sequelize.literal('DATE_SUB(CURDATE(), INTERVAL 7 DAY)')
        }
      },
      group: [Sequelize.fn('DAYOFWEEK', Sequelize.col('created_at'))],
      order: [[Sequelize.fn('DAYOFWEEK', Sequelize.col('created_at')), 'ASC']]
    });

    return res.status(200).json({
      error: false,
      data
    });
  } catch (err) {
    console.error('Weekly Payout Graph Error:', err);
    return res.status(500).json({ error: true });
  }
};

exports.getPendingPayout = async (req, res) => {
  try {
    const pending = await payment_transactions.sum('cp_cost', {
      where: { status: 'pending' }
    });

    return res.status(200).json({
      error: false,
      data: {
        pending_payout: Number(pending || 0),
        growth_percent: 0
      }
    });
  } catch (err) {
    console.error('Pending Payout Error:', err);
    return res.status(500).json({ error: true });
  }
};

exports.getTotalCPCount = async (req, res) => {
  try {
    const totalCPs = await crew_members.count({
      where: { is_active: 1 }
    });

    return res.status(200).json({
      error: false,
      data: {
        total_cps: totalCPs
      }
    });
  } catch (err) {
    console.error('CP Count Error:', err);
    return res.status(500).json({ error: true });
  }
};

// exports.getCategoryWiseCPs = async (req, res) => {
//   try {
//     const data = await crew_members.findAll({
//       attributes: [
//         'primary_role',
//         [Sequelize.fn('COUNT', Sequelize.col('crew_member_id')), 'count']
//       ],
//       where: { is_active: 1 },
//       group: ['primary_role']
//     });

//     return res.status(200).json({
//       error: false,
//       data
//     });
//   } catch (err) {
//     console.error('Category Wise CP Error:', err);
//     return res.status(500).json({ error: true });
//   }
// };

exports.getCategoryWiseCPs = async (req, res) => {
  try {
    const data = await crew_roles.findAll({
      attributes: [
        'role_id',
        'role_name',
        [
          Sequelize.fn(
            'COUNT',
            Sequelize.fn(
              'DISTINCT',
              Sequelize.col('crew_members.crew_member_id')
            )
          ),
          'count'
        ]
      ],
      include: [
        {
          model: crew_members,
          as: 'crew_members',
          attributes: [],
          required: true,
          where: {
            is_active: 1,
            [Op.or]: [
              // primary_role = "1"
              Sequelize.where(
                Sequelize.col('crew_members.primary_role'),
                Sequelize.col('crew_roles.role_id')
              ),

              // primary_role contains "1" inside JSON array
              Sequelize.literal(
                `JSON_CONTAINS(crew_members.primary_role, CONCAT('"', crew_roles.role_id, '"'))`
              )
            ]
          }
        }
      ],
      group: ['crew_roles.role_id'],
      order: [[Sequelize.literal('count'), 'DESC']]
    });

    return res.status(200).json({
      error: false,
      data
    });
  } catch (err) {
    console.error('Category Wise CP Error:', err);
    return res.status(500).json({
      error: true,
      message: 'Failed to fetch category wise CPs'
    });
  }
};

exports.getShootStatus = async (req, res) => {
  try {
    const { range, start_date, end_date } = req.query;

    let dateFilter = {};

    if (start_date && end_date) {
      dateFilter = {
        event_date: {
          [Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`]
        }
      };
    } else if (range === 'month') {
      dateFilter = {
        [Op.and]: [
          Sequelize.where(Sequelize.fn('MONTH', Sequelize.col('event_date')), Sequelize.fn('MONTH', Sequelize.fn('CURDATE'))),
          Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('event_date')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
        ]
      };
    } else if (range === 'week') {
      dateFilter = {
        [Op.and]: [
          Sequelize.where(Sequelize.fn('YEARWEEK', Sequelize.col('event_date'), 1), Sequelize.fn('YEARWEEK', Sequelize.fn('CURDATE'), 1))
        ]
      };
    } else if (range === 'year') {
      dateFilter = {
        [Op.and]: [
          Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('event_date')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
        ]
      };
    } else if (range === 'all' || !range) {
      dateFilter = {};
    }

    const paidFilter = { payment_id: { [Op.ne]: null } };

    const [
      totalShoots,
      successfulShoots,
      pendingShoots,
      rejectedShoots,
      cancelledShoots
    ] = await Promise.all([
      stream_project_booking.count({ 
        where: { ...paidFilter, ...dateFilter } 
      }),

      stream_project_booking.count({
        where: { is_completed: 1, ...paidFilter, ...dateFilter }
      }),

      stream_project_booking.count({
        where: {
          is_completed: 0,
          is_cancelled: 0,
          is_active: 1,
          ...paidFilter,
          ...dateFilter
        }
      }),

      stream_project_booking.count({
        where: { is_cancelled: 1, ...paidFilter, ...dateFilter }
      }),

      stream_project_booking.count({
        where: { is_active: 0, is_cancelled: 1, ...paidFilter, ...dateFilter }
      })
    ]);

    return res.status(200).json({
      error: false,
      message: "Paid shoot status summary fetched successfully",
      data: {
        total: totalShoots,
        breakdown: [
          {
            label: 'Successful Shoots',
            count: successfulShoots,
            color: '#A78BFA' // purple
          },
          {
            label: 'Pending Shoots',
            count: pendingShoots,
            color: '#38BDF8' // blue
          },
          {
            label: 'Rejected Shoots',
            count: rejectedShoots,
            color: '#FBBF24' // yellow
          },
          {
            label: 'Cancelled Shoots',
            count: cancelledShoots,
            color: '#34D399' // green
          }
        ]
      }
    });
  } catch (err) {
    console.error('Shoot Status Error:', err);
    return res.status(500).json({ 
      error: true, 
      message: "Internal server error" 
    });
  }
};

exports.getTopCreativePartners = async (req, res) => {
  try {
    const { range, start_date, end_date } = req.query;
    
    const limit = Number(req.query.limit || 10);

    let dateFilter = {};

    if (start_date && end_date) {
      dateFilter = {
        created_at: {
          [Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`]
        }
      };
    } else if (range === 'month') {
      dateFilter = {
        created_at: {
          [Op.gte]: Sequelize.literal("DATE_FORMAT(CURDATE(), '%Y-%m-01')")
        }
      };
    } else if (range === 'week') {
      dateFilter = {
        created_at: {
          [Op.gte]: Sequelize.literal("DATE_SUB(NOW(), INTERVAL 7 DAY)")
        }
      };
    } else if (range === 'year') {
      dateFilter = {
        created_at: {
          [Op.gte]: Sequelize.literal("DATE_FORMAT(CURDATE(), '%Y-01-01')")
        }
      };
    }

    const partners = await payment_transactions.findAll({
      attributes: [
        'creator_id',
        [Sequelize.fn('SUM', Sequelize.col('total_amount')), 'total_earnings']
      ],
      where: {
        status: 'succeeded',
        ...dateFilter
      },
      include: [
        {
          model: crew_members,
          as: 'creator',
          attributes: ['crew_member_id', 'first_name', 'last_name', 'email'],
          include: [
            {
              model: crew_member_files,
              as: 'crew_member_files',
              attributes: ['file_path'],
              where: {
                file_type: 'profile_photo',
                is_active: 1
              },
              required: false,
              separate: true,
              limit: 1,
              order: [['created_at', 'DESC']]
            }
          ]
        }
      ],
      group: ['creator_id'],
      order: [[Sequelize.literal('total_earnings'), 'DESC']],
      limit: limit
    });

    const result = partners
      .filter(p => p.creator)
      .map(p => {
        const files = p.creator.crew_member_files || [];
        const photo = files.length ? `${files[0].file_path}` : null;

        return {
          id: p.creator_id,
          name: `${p.creator.first_name} ${p.creator.last_name}`,
          email: p.creator.email,
          total_earnings: Number(p.get('total_earnings') || 0),
          avatar: photo
        };
      });

    return res.status(200).json({
      error: false,
      message: "Top creative partners fetched successfully",
      data: result
    });
  } catch (err) {
    console.error('Top Creative Partners Error:', err);
    return res.status(500).json({
      error: true,
      message: 'Internal server error'
    });
  }
};


exports.getDashboardDetails = async (req, res) => {
  try {
    const creator_id = req.body.crew_member_id;
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
        crew_member_id: creator_id,
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
        crew_member_id: creator_id,
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

exports.getShootByCategory = async (req, res) => {
  try {
    const activeTab = (req.query.tab || 'all').toLowerCase();

    // Fallback Skill IDs for deeper verification if needed
    const videoSkillIds = [1, 2, 3, 4, 11, 12, 13, 14, 17, 24, 29, 30, 31, 32, 33, 34, 35, 36];
    const photoSkillIds = [5, 6, 7, 8, 15, 16, 37];

    const categoryConfig = {
      corporate: { label: 'Corporate Events', color: '#3B82F6', matches: ['corporate'] },
      wedding: { label: 'Wedding', color: '#22C55E', matches: ['wedding'] },
      private: { label: 'Private Events', color: '#8B5CF6', matches: ['private'] },
      commercial: { label: 'Commercial & Advertising', color: '#F59E0B', matches: ['commercial', 'brand', 'advertising'] },
      social: { label: 'Social Content', color: '#06B6D4', matches: ['social'] },
      podcasts: { label: 'Podcasts & Shows', color: '#EC4899', matches: ['podcast'] },
      music: { label: 'Music Videos', color: '#EF4444', matches: ['music'] },
      narrative: { label: 'Short Films & Narrative', color: '#6366F1', matches: ['narrative', 'short film'] }
    };

    // 1. Fetch Paid Bookings
    const bookings = await stream_project_booking.findAll({
      attributes: ['project_name', 'event_type', 'skills_needed', 'stream_project_booking_id', 'payment_id'],
      where: { 
        is_active: 1,
        payment_id: { [Sequelize.Op.ne]: null } // Paid projects only
      },
      raw: true
    });

    let grandTotal = 0;
    const finalResults = {};
    
    Object.keys(categoryConfig).forEach(key => {
      finalResults[key] = { label: categoryConfig[key].label, count: 0, color: categoryConfig[key].color };
    });

    // 2. Processing Loop
    bookings.forEach(booking => {
      const eventType = String(booking.event_type || '').toLowerCase();
      const projectName = String(booking.project_name || '').toLowerCase();
      const skills = String(booking.skills_needed || '').toLowerCase();

      let includeInTab = false;
      
      // NEW TAB LOGIC: Checking event_type for "videographer" or "photographer"
      if (activeTab === 'all') {
        includeInTab = true;
      } else {
        // Check if event_type string contains the roles
        const isVideo = eventType.includes('videographer') || eventType.includes('video') || videoSkillIds.some(id => skills.includes(String(id)));
        const isPhoto = eventType.includes('photographer') || eventType.includes('photo') || photoSkillIds.some(id => skills.includes(String(id)));
        
        if (activeTab === 'videography' && isVideo) includeInTab = true;
        if (activeTab === 'photography' && isPhoto) includeInTab = true;
      }

      // CATEGORY LOGIC: Based on Project Name
      if (includeInTab) {
        for (const [key, config] of Object.entries(categoryConfig)) {
          // Check if category keyword (like 'music') exists in project_name
          if (config.matches.some(keyword => projectName.includes(keyword))) {
            finalResults[key].count += 1;
            grandTotal += 1;
            break; 
          }
        }
      }
    });

    // 3. Format response
    const data = Object.values(finalResults).map(item => ({
      label: item.label,
      count: item.count,
      percentage: grandTotal > 0 ? Math.round((item.count / grandTotal) * 100) : 0,
      color: item.color
    }));

    return res.status(200).json({
      error: false,
      message: `Stats for ${activeTab} retrieved successfully`,
      data: {
        active_tab: activeTab,
        total_count: grandTotal,
        categories: data
      }
    });

  } catch (error) {
    console.error('Shoot By Category Error:', error);
    return res.status(500).json({ error: true, message: 'Internal server error' });
  }
};

// Controller to fetch all post production members
exports.getPostProductionMembers = async (req, res) => {
  try {
    const postProductionMembers = await post_production_members.findAll({
      where: { is_active: 1 }, // Optional filter for active members
      attributes: ['post_production_member_id', 'first_name', 'last_name', 'email', 'is_active'],
    });

    if (!postProductionMembers || postProductionMembers.length === 0) {
      return res.status(404).json({
        error: true,
        message: 'No post-production members found',
      });
    }

    return res.status(200).json({
      error: false,
      message: 'Post-production members fetched successfully',
      data: postProductionMembers,
    });
  } catch (error) {
    console.error('Error fetching post production members:', error);
    return res.status(500).json({
      error: true,
      message: 'Internal server error',
    });
  }
};


exports.assignPostProductionMember = async (req, res) => {
  try {
    const { project_id, post_production_member_id } = req.body;

    if (!project_id || !post_production_member_id) {
      return res.status(400).json({
        error: true,
        message: 'Project ID and Post Production Member ID are required',
      });
    }

    const postProductionMember = await post_production_members.findOne({
      where: { post_production_member_id, is_active: 1 },
    });

    if (!postProductionMember) {
      return res.status(404).json({
        error: true,
        message: 'Post production member not found or inactive',
      });
    }

    const project = await stream_project_booking.findOne({
      where: { stream_project_booking_id: project_id, is_active: 1 },
    });

    if (!project) {
      return res.status(404).json({
        error: true,
        message: 'Project not found or inactive',
      });
    }

    const assignedPostProductionMember = await assigned_post_production_member.create({
      project_id,
      post_production_member_id,
      assigned_date: new Date(),
      status: 'assigned',
      is_active: 1,
    });

    return res.status(201).json({
      error: false,
      message: 'Post production member assigned successfully',
      data: assignedPostProductionMember,
    });
  } catch (error) {
    console.error('Error assigning post production member:', error);
    return res.status(500).json({
      error: true,
      message: 'Internal server error',
    });
  }
};

exports.getClients = async (req, res) => {
  try {
    let { page = 1, limit = 20, search, range, start_date, end_date } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;

    const whereConditions = { is_active: 1 };

    if (start_date && end_date) {
      whereConditions.created_at = {
        [Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`]
      };
    } else if (range === 'month') {
      whereConditions[Op.and] = [
        Sequelize.where(
          Sequelize.fn('MONTH', Sequelize.col('clients.created_at')),
          Sequelize.fn('MONTH', Sequelize.fn('CURDATE'))
        ),
        Sequelize.where(
          Sequelize.fn('YEAR', Sequelize.col('clients.created_at')),
          Sequelize.fn('YEAR', Sequelize.fn('CURDATE'))
        )
      ];
    } else if (range === 'week') {
      whereConditions[Op.and] = [
        Sequelize.where(
          Sequelize.fn('WEEK', Sequelize.col('clients.created_at')),
          Sequelize.fn('WEEK', Sequelize.fn('CURDATE'))
        ),
        Sequelize.where(
          Sequelize.fn('YEAR', Sequelize.col('clients.created_at')),
          Sequelize.fn('YEAR', Sequelize.fn('CURDATE'))
        )
      ];
    }

    if (search) {
      const searchFilter = {
        [Op.or]: [
          { name: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } }
        ]
      };

      if (whereConditions[Op.and]) {
        whereConditions[Op.and].push(searchFilter);
      } else {
        whereConditions[Op.or] = searchFilter[Op.or];
      }
    }

    const { count, rows } = await clients.findAndCountAll({
      where: whereConditions,
      limit,
      offset,
      order: [['created_at', 'DESC']],
      include: [
        {
          model: users,
          as: 'user',
          attributes: ['id'],
          include: [
            {
              model: sales_leads,
              as: 'sales_leads', 
              required: false,
              separate: true,
              limit: 1,
              order: [['created_at', 'DESC']],
              include: [
                {
                  model: stream_project_booking,
                  as: 'booking',
                  required: false
                }
              ]
            }
          ]
        }
      ]
    });

    const data = rows.map(client => {
      const lead = client.user?.sales_leads?.[0] || null;
      const booking = lead?.booking || null;

      return {
        ...client.toJSON(),
        intent: leadAssignmentService.getClientIntent({ lead, booking }),
        booking_status: leadAssignmentService.getClientBookingStatus(booking)
      };
    });

    return res.status(200).json({
      error: false,
      message: 'Clients fetched successfully',
      data,
      pagination: {
        total_records: count,
        current_page: page,
        per_page: limit,
        total_pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error("Get Clients Error:", error);
    return res.status(500).json({
      error: true,
      message: 'Internal server error'
    });
  }
};


exports.editClient = async (req, res) => {
  try {
    const { client_id } = req.params;
    const { name, email, phone_number } = req.body;

    if (!name || !email || !phone_number) {
      return res.status(400).json({
        error: true,
        message: 'Name, email, and phone number are required'
      });
    }

    const client = await clients.findOne({
      where: { client_id, is_active: 1 }
    });

    if (!client) {
      return res.status(404).json({
        error: true,
        message: 'Client not found or inactive'
      });
    }

    const user = await users.findOne({
      where: { id: client.user_id, is_active: 1 }
    });

    if (!user) {
      return res.status(404).json({
        error: true,
        message: 'Associated user not found or inactive'
      });
    }

    const updatedClient = await clients.update(
      {
        name,
        email,
        phone_number
      },
      {
        where: { client_id }
      }
    );

    const updatedUser = await users.update(
      {
        name,
        email,
        phone_number
      },
      {
        where: { id: client.user_id }
      }
    );

    return res.status(200).json({
      error: false,
      message: 'Client and user updated successfully',
      data: {
        client: updatedClient,
        user: updatedUser
      }
    });

  } catch (error) {
    console.error("Error updating client:", error);
    return res.status(500).json({
      error: true,
      message: 'Internal server error'
    });
  }
};

exports.deleteClient = async (req, res) => {
  try {
    const { client_id } = req.params; // Assuming client_id is passed as a parameter

    // Find the client by client_id
    const client = await clients.findOne({
      where: { client_id, is_active: 1 } // Only proceed if the client is active
    });

    if (!client) {
      return res.status(404).json({
        error: true,
        message: 'Client not found or already inactive'
      });
    }

    // Find the associated user using the user_id from the client
    const user = await users.findOne({
      where: { id: client.user_id, is_active: 1 } // Ensure user is active
    });

    if (!user) {
      return res.status(404).json({
        error: true,
        message: 'Associated user not found or inactive'
      });
    }

    // Soft delete the client by setting is_active to 0
    await client.update({ is_active: 0 });

    // Soft delete the associated user by setting is_active to 0
    await user.update({ is_active: 0 });

    return res.status(200).json({
      error: false,
      message: 'Client and associated user deactivated successfully'
    });

  } catch (error) {
    console.error("Error deleting client:", error);
    return res.status(500).json({
      error: true,
      message: 'Internal server error'
    });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    const { project_id } = req.params;

    if (!project_id) {
      return res.status(400).json({
        success: false,
        message: 'Project ID is required'
      });
    }

    const project = await stream_project_booking.findOne({
      where: { stream_project_booking_id: project_id }
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    await assigned_crew.update({ is_active: 0 }, { where: { project_id: project.stream_project_booking_id } });
    await assigned_equipment.update({ is_active: 0 }, { where: { project_id: project.stream_project_booking_id } });
    await assigned_post_production_member.update({ is_active: 0 }, { where: { project_id: project.stream_project_booking_id } });

    await project.update({ is_active: 0 });

    return res.status(200).json({
      success: true,
      message: 'Project deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting project:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during project deletion',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.uploadProfilePhoto = [
  upload.single('profile_photo'),

  async (req, res) => {
    try {
      const { crew_member_id } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(constants.BAD_REQUEST.code).json({
          error: true,
          code: constants.BAD_REQUEST.code,
          message: 'Profile photo is required.',
          data: null,
        });
      }

      console.log('Uploaded file:', file);

      const existingProfilePhoto = await crew_member_files.findOne({
        where: {
          crew_member_id,
          file_type: 'profile_photo'
        }
      });

      const filePaths = await S3UploadFiles({ profile_photo: [file] });

      const filePath = filePaths.length > 0 ? filePaths[0].file_path : null;

      if (!filePath) {
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
          error: true,
          code: constants.INTERNAL_SERVER_ERROR.code,
          message: 'Error uploading the profile photo.',
          data: null,
        });
      }

      if (existingProfilePhoto) {
        await crew_member_files.update({
          file_type: 'profile_photo',
          file_path: filePath,
        }, {
          where: {
            crew_member_id,
            file_type: 'profile_photo'
          }
        });
      } else {
        await crew_member_files.create({
          crew_member_id,
          file_type: 'profile_photo',
          file_path: filePath, 
        });
      }

      return res.status(constants.CREATED.code).json({
        error: false,
        code: constants.CREATED.code,
        message: 'Profile photo uploaded and replaced successfully.',
        data: { file_path: filePath },
      });
    } catch (error) {
      console.error('Error in uploading profile photo:', error);
      return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
        error: true,
        code: constants.INTERNAL_SERVER_ERROR.code,
        message: constants.INTERNAL_SERVER_ERROR.message,
        data: null,
      });
    }
  },
];

exports.getAllPendingCrewMembers = async (req, res) => {
  try {
    // 1. Fetch all pending members (is_crew_verified: 0) and ALL roles in parallel
    const [members, allRoles] = await Promise.all([
      crew_members.findAll({
        where: { 
          is_active: 1, 
          is_crew_verified: 0  // Hardcoded for Pending
        },
        include: [
          {
            model: crew_member_files,
            as: 'crew_member_files',
            attributes: ['crew_files_id', 'file_type', 'file_path'],
          }
        ],
        order: [['created_at', 'DESC']], // Newest applications at the top
      }),
      crew_roles.findAll({ attributes: ['role_id', 'role_name'], raw: true })
    ]);

    // 2. DATA PROCESSING
    const processedMembers = members.map((member) => {
      const memberData = member.toJSON();
      
      // Handle Location Parsing
      const loc = member.location;
      let finalLocation = loc;
      if (loc && typeof loc === 'string' && (loc.startsWith('{') || loc.startsWith('['))) {
        try {
          const parsed = JSON.parse(loc);
          finalLocation = parsed.address || parsed || loc;
        } catch { finalLocation = loc; }
      }

      // Handle Role Mapping from JSON string to Names
      let roleNames = [];
      try {
        const roleIds = JSON.parse(memberData.primary_role || "[]");
        roleNames = allRoles
            .filter(r => roleIds.includes(String(r.role_id)) || roleIds.includes(Number(r.role_id)))
            .map(r => r.role_name);
      } catch (e) {
        console.error("Role parsing error", e);
      }

      return { 
        ...memberData, 
        location: finalLocation, 
        status: 'pending',
        role: roleNames.length > 0 ? { role_name: roleNames.join(", ") } : null 
      };
    });

    return res.status(200).json({
      error: false,
      message: "All pending crew members fetched successfully",
      total_pending: processedMembers.length,
      data: processedMembers,
    });
  } catch (error) {
    console.error("Get All Pending Crew Members Error:", error);
    return res.status(500).json({ error: true, message: "Internal server error" });
  }
};

exports.getApprovedCrewMembers = async (req, res) => {
    try {
        let {
            page = 1,
            limit = 20,
            search,
            location,
            start_date,
            end_date,
            sort_by = 'crew_member_id',
            sort_order = 'DESC'
        } = req.body;

        page = parseInt(page);
        limit = parseInt(limit);
        const offset = (page - 1) * limit;

        // 1. Setup Base Conditions
        let conditions = [{ is_active: 1 }, { is_crew_verified: 1 }];

        if (start_date && end_date) {
            conditions.push({ 'created_at': { [Sequelize.Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`] } });
        }
        
        if (location) conditions.push({ location: { [Sequelize.Op.like]: `%${location}%` } });

        // 2. Advanced Search Logic (Name, Email, ID AND Roles)
        if (search) {
            // First, find any role IDs that match the search string (e.g., "video" matches "Videographer")
            const matchingRoles = await crew_roles.findAll({
                where: { role_name: { [Sequelize.Op.like]: `%${search}%` } },
                attributes: ['role_id'],
                raw: true
            });

            const roleIds = matchingRoles.map(r => r.role_id.toString());

            let searchOrConditions = [
                { first_name: { [Sequelize.Op.like]: `%${search}%` } },
                { last_name: { [Sequelize.Op.like]: `%${search}%` } },
                { email: { [Sequelize.Op.like]: `%${search}%` } },
                { crew_member_id: { [Sequelize.Op.like]: `%${search}%` } }
            ];

            // If we found matching roles, add a condition to check the primary_role column
            roleIds.forEach(id => {
                searchOrConditions.push({ 
                    primary_role: { [Sequelize.Op.like]: `%${id}%` } 
                });
            });

            conditions.push({ [Sequelize.Op.or]: searchOrConditions });
        }

        // 3. Setup Sorting
        let orderColumn = 'crew_member_id';
        if (sort_by === 'first_name') orderColumn = 'first_name';
        if (sort_by === 'status') orderColumn = 'status';
        if (sort_by === 'created_at') orderColumn = 'created_at';

        const orderDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // 4. Query Database
        const [{ count, rows: members }, allRoles] = await Promise.all([
            crew_members.findAndCountAll({
                where: { [Sequelize.Op.and]: conditions },
                distinct: true,
                col: 'crew_member_id',
                include: [{
                    model: crew_member_files,
                    as: 'crew_member_files',
                    attributes: ['crew_files_id', 'file_type', 'file_path'],
                }],
                order: [[orderColumn, orderDirection]],
                limit,
                offset,
            }),
            crew_roles.findAll({ attributes: ['role_id', 'role_name'], raw: true })
        ]);

        // 5. Process Data for Frontend
        const processedMembers = members.map((member) => {
            const memberData = member.get({ clone: true });
            
            let roleNames = [];
            const rawRole = memberData.primary_role;
            if (rawRole) {
                let roleIds = [];
                try {
                    const parsed = JSON.parse(rawRole);
                    roleIds = Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
                } catch (e) { roleIds = [String(rawRole)]; }
                
                roleNames = allRoles
                    .filter(r => roleIds.includes(String(r.role_id)))
                    .map(r => r.role_name);
            }

            return {
                ...memberData,
                status: 'approved',
                role: { role_name: roleNames.length > 0 ? roleNames.join(", ") : "N/A" }
            };
        });

        return res.status(200).json({
            error: false,
            message: "Success",
            pagination: {
                total_records: count,
                current_page: page,
                per_page: limit,
                total_pages: Math.ceil(count / limit),
            },
            data: processedMembers,
        });

    } catch (error) {
        console.error("API Error:", error);
        return res.status(500).json({ error: true, message: "Internal error" });
    }
};

exports.getClientById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        error: true,
        message: 'Client ID is required'
      });
    }

    // 1️⃣ Get Client
    const client = await clients.findOne({
      where: {
        client_id: id,
        is_active: 1
      }
    });

    if (!client) {
      return res.status(404).json({
        error: true,
        message: 'Client not found'
      });
    }

    // 2️⃣ Get User Details
    const user = await users.findOne({
      where: { id: client.user_id },
      attributes: { exclude: ['password_hash'] } // never return password
    });

    // 3️⃣ Get Affiliate Details
    const affiliate = await affiliates.findOne({
      where: { user_id: client.user_id }
    });

    return res.status(200).json({
      error: false,
      message: 'Client details fetched successfully',
      data: {
        client: client,
        user: user,
        affiliate: affiliate
      }
    });

  } catch (error) {
    console.error('Get Client By ID Error:', error);
    return res.status(500).json({
      error: true,
      message: 'Internal server error'
    });
  }
};

exports.getClientsShoots = async (req, res) => {
  try {
    const { clientId } = req.params;
    let { status, event_type, search, limit, page, range, start_date, end_date } = req.query;

    if (!clientId) {
      return res.status(400).json({ error: true, message: "clientId is required" });
    }

    const today = new Date();

    // 1️⃣ Get client to find user_id
    const client = await clients.findOne({
      where: { client_id: clientId, is_active: 1 }
    });

    if (!client) {
      return res.status(404).json({ error: true, message: "Client not found" });
    }

    const user_id = client.user_id;

    // -------- PAGINATION --------
    const noPagination = !limit && !page;
    let pageNumber = null;
    let pageSize = null;
    let offset = null;

    if (!noPagination) {
      pageNumber = parseInt(page ?? 1, 10);
      pageSize = parseInt(limit ?? 10, 10);
      offset = (pageNumber - 1) * pageSize;
    }

    // -------- DATE FILTER --------
    let dateFilter = {};

    if (start_date && end_date) {
      dateFilter = {
        event_date: {
          [Sequelize.Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`]
        }
      };
    } else if (range === 'month') {
      dateFilter = {
        [Sequelize.Op.and]: [
          Sequelize.where(
            Sequelize.fn('MONTH', Sequelize.col('event_date')),
            Sequelize.fn('MONTH', Sequelize.fn('CURDATE'))
          ),
          Sequelize.where(
            Sequelize.fn('YEAR', Sequelize.col('event_date')),
            Sequelize.fn('YEAR', Sequelize.fn('CURDATE'))
          )
        ]
      };
    } else if (range === 'week') {
      dateFilter = {
        [Sequelize.Op.and]: [
          Sequelize.where(
            Sequelize.fn('YEARWEEK', Sequelize.col('event_date'), 1),
            Sequelize.fn('YEARWEEK', Sequelize.fn('CURDATE'), 1)
          )
        ]
      };
    }

    // -------- BASE WHERE --------
    const whereConditions = {
      user_id,
      is_active: 1,
      ...dateFilter
    };

    // -------- STATUS FILTER --------
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
          whereConditions.is_draft = 0;
          whereConditions.event_date = {
            ...(dateFilter.event_date || {}),
            [Sequelize.Op.gt]: today
          };
          break;
        case 'draft':
          whereConditions.is_draft = 1;
          break;
      }
    }

    if (event_type) {
      whereConditions.event_type = event_type;
    }

    if (search) {
      whereConditions.project_name = Sequelize.where(
        Sequelize.fn('LOWER', Sequelize.col('project_name')),
        { [Sequelize.Op.like]: `%${search.toLowerCase()}%` }
      );
    }

    // -------- COUNTS --------
    const [
      total_active,
      total_cancelled,
      total_completed,
      total_upcoming,
      total_draft
    ] = await Promise.all([
      stream_project_booking.count({
        where: { user_id, is_active: 1, is_cancelled: 0, is_completed: 0, is_draft: 0 }
      }),
      stream_project_booking.count({
        where: { user_id, is_cancelled: 1 }
      }),
      stream_project_booking.count({
        where: { user_id, is_completed: 1 }
      }),
      stream_project_booking.count({
        where: {
          user_id,
          is_cancelled: 0,
          is_draft: 0,
          event_date: { [Sequelize.Op.gt]: today }
        }
      }),
      stream_project_booking.count({
        where: { user_id, is_draft: 1 }
      }),
    ]);

    // -------- FETCH PROJECTS --------
    const projects = await stream_project_booking.findAll({
      where: whereConditions,
      ...(noPagination ? {} : { limit: pageSize, offset }),
      order: [['event_date', 'DESC']]
    });

    // -------- FETCH ASSOCIATED DATA --------
    const projectDetails = await Promise.all(
  projects.map(async (project) => {

    const [
      assignedCrew,
      assignedEquipment,
      assignedPostProd,
      paymentData
    ] = await Promise.all([
      assigned_crew.findAll({
        where: { project_id: project.stream_project_booking_id, is_active: 1 },
        include: [{ model: crew_members, as: 'crew_member' }]
      }),
      assigned_equipment.findAll({
        where: { project_id: project.stream_project_booking_id, is_active: 1 },
        include: [{ model: equipment, as: 'equipment' }]
      }),
      assigned_post_production_member.findAll({
        where: { project_id: project.stream_project_booking_id, is_active: 1 },
        include: [{ model: post_production_members, as: 'post_production_member' }]
      }),
      payment_transactions.findOne({
        where: { payment_id: project.payment_id },
        attributes: ['total_amount']
      })
    ]);

    // -------- FORMAT EVENT TYPES --------
    const rawTypes = project.event_type ? project.event_type.split(',') : [];
    const formattedTypes = rawTypes.map(t => {
      const val = t.trim();
      const stringMap = {
        'videographer': 'Videography',
        'photographer': 'Photography'
      };
      return stringMap[val?.toLowerCase()] ||
        val.charAt(0).toUpperCase() + val.slice(1);
    });

    return {
      project: {
        ...project.toJSON(),
        total_paid_amount: paymentData ? paymentData.total_amount : 0,
        event_type_labels: formattedTypes.join(', '),
        event_location: (() => {
          const loc = project.event_location;
          if (!loc) return null;
          try {
            if (typeof loc === "string" && (loc.startsWith("{") || loc.startsWith("["))) {
              const parsed = JSON.parse(loc);
              return parsed.address || parsed;
            }
          } catch (e) {
            return loc;
          }
          return loc;
        })()
      },
      assignedCrew,
      assignedEquipment,
      assignedPostProductionMembers: assignedPostProd
    };
  })
);

    // 🔥 -------- SEPARATE PAID & UNPAID/DRAFT --------
    const paid = [];
    const unpaid_or_draft = [];

    projectDetails.forEach(item => {
      const proj = item.project;

      if (proj.payment_id && proj.is_draft !== 1) {
        paid.push(item);
      } else {
        unpaid_or_draft.push(item);
      }
    });

    return res.status(200).json({
      error: false,
      message: 'Client shoots fetched successfully',
      data: {
        client: client,
        stats: {
          total_active,
          total_cancelled,
          total_completed,
          total_upcoming,
          total_draft
        },
        projects: {
          paid,
          unpaid_or_draft
        },
        pagination: noPagination ? null : {
          page: pageNumber,
          limit: pageSize
        }
      }
    });

  } catch (error) {
    console.error('Admin Get Client Shoots Error:', error);
    return res.status(500).json({ error: true, message: 'Internal server error' });
  }
};

exports.searchCrewForLead = async (req, res) => {
    try {
        const { lead_id, role_type, search_query, date } = req.query;

        let projectDate;
        let currentBookingId = null;

        // -----------------------------
        // -----------------------------
        if (lead_id) {
            const lead = await sales_leads.findOne({
                where: { lead_id },
                include: [{ model: stream_project_booking, as: 'booking' }]
            });

            if (!lead || !lead.booking) {
                return res.status(404).json({
                    success: false,
                    message: "Lead/Booking not found"
                });
            }

            projectDate = lead.booking.event_date;
            currentBookingId = lead.booking.booking_id; // Store to exclude already assigned
        } else {
            if (!date) {
                return res.status(400).json({
                    success: false,
                    message: "Date is required when lead_id is not provided"
                });
            }
            projectDate = date;
        }

        // ---------------------------------------------------------
        // 2️⃣ Get IDs to Exclude (Busy elsewhere OR already on this lead)
        // ---------------------------------------------------------
        
        // A: Get crew busy on this date (Accepted elsewhere)
        const busyCrewRecords = await assigned_crew.findAll({
            where: { crew_accept: 1 },
            include: [{
                model: stream_project_booking,
                as: 'project',
                where: { event_date: projectDate }
            }],
            attributes: ['crew_member_id']
        });

        // B: Get crew already assigned to THIS specific lead (Pending, Accepted, or Rejected)
        let alreadyAssignedToThisLead = [];
        if (currentBookingId) {
            const currentAssignments = await assigned_crew.findAll({
                where: { booking_id: currentBookingId },
                attributes: ['crew_member_id']
            });
            alreadyAssignedToThisLead = currentAssignments.map(a => a.crew_member_id);
        }

        // Combine unique IDs to exclude
        const busyIds = busyCrewRecords.map(r => r.crew_member_id);
        const excludeIds = [...new Set([...busyIds, ...alreadyAssignedToThisLead])];

        // -----------------------------
        // 3️⃣ Role Mapping
        // -----------------------------
        const ROLE_GROUPS = {
            videographer: ["9", "1"],
            photographer: ["10", "2"],
            cinematographer: ["11", "3"]
        };

        const requestedRoles = role_type
            ? role_type.split(",").map(r => r.trim().toLowerCase())
            : [];

        let targetRoleIds = [];
        requestedRoles.forEach(role => {
            if (ROLE_GROUPS[role]) {
                targetRoleIds.push(...ROLE_GROUPS[role]);
            }
        });

        targetRoleIds = [...new Set(targetRoleIds)];

        // -----------------------------
        // 4️⃣ Crew Filter Conditions
        // -----------------------------
        let crewWhere = {
            is_active: true,
            is_available: true,
            is_crew_verified: 1,
            // Exclude anyone busy or already on this lead
            crew_member_id: { [Op.notIn]: excludeIds.length ? excludeIds : [0] }
        };

        if (targetRoleIds.length > 0) {
            crewWhere[Op.or] = targetRoleIds.map(id => ({
                primary_role: { [Op.like]: `%${id}%` }
            }));
        }

        if (search_query) {
            crewWhere[Op.and] = [{
                [Op.or]: [
                    { first_name: { [Op.like]: `%${search_query}%` } },
                    { last_name: { [Op.like]: `%${search_query}%` } }, // Added last name search
                    { location: { [Op.like]: `%${search_query}%` } }
                ]
            }];
        }

        // -----------------------------
        // 5️⃣ Fetch Available Crew (Including Profile Photo)
        // -----------------------------
        const availableCrew = await crew_members.findAll({
            where: crewWhere,
            include: [
                {
                    model: crew_member_files,
                    as: "crew_member_files",
                    attributes: ["file_path"],
                    where: {
                        is_active: 1,
                        file_type: "profile_photo",
                    },
                    required: false, // Left join
                }
            ],
            limit: 50
        });

        // -----------------------------
        // 6️⃣ Safe Role Parsing & Photo Mapping
        // -----------------------------
        const crewWithRoles = availableCrew.map(crewMember => {
            let matchedRoles = [];
            let rawRoles = [];

            try {
                if (crewMember.primary_role) {
                    if (Array.isArray(crewMember.primary_role)) {
                        rawRoles = crewMember.primary_role;
                    } else if (typeof crewMember.primary_role === "string") {
                        try {
                            const parsed = JSON.parse(crewMember.primary_role);
                            rawRoles = Array.isArray(parsed) ? parsed : [parsed];
                        } catch {
                            rawRoles = crewMember.primary_role.split(',').map(r => r.trim());
                        }
                    } else {
                        rawRoles = [crewMember.primary_role];
                    }
                }
            } catch (e) {
                rawRoles = [];
            }

            const stringRoleIds = rawRoles.map(String);

            if (stringRoleIds.some(id => ROLE_GROUPS.videographer.includes(id))) matchedRoles.push("videographer");
            if (stringRoleIds.some(id => ROLE_GROUPS.photographer.includes(id))) matchedRoles.push("photographer");
            if (stringRoleIds.some(id => ROLE_GROUPS.cinematographer.includes(id))) matchedRoles.push("cinematographer");

            // Extract profile photo path safely
            const profilePhoto = crewMember.crew_member_files && crewMember.crew_member_files.length > 0 
                ? crewMember.crew_member_files[0].file_path 
                : null;

            const crewJson = crewMember.toJSON();
            delete crewJson.crew_member_files; // Clean up the raw include

            return {
                ...crewJson,
                profile_photo: profilePhoto,
                role_names: matchedRoles.length > 0 ? matchedRoles : ["Unspecified"],
                role: matchedRoles.length > 0 ? matchedRoles.join(", ") : "Unspecified"
            };
        });

        res.json({
            success: true,
            project_date: projectDate,
            available_count: crewWithRoles.length,
            data: crewWithRoles
        });

    } catch (error) {
        console.error("searchCrewForLead error:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.assignCrewBulkSmart = async (req, res) => {
    try {
        const assigned_by_user_id = req.user?.userId;
        const { lead_id, crew_member_ids } = req.body;

        if (!Array.isArray(crew_member_ids) || crew_member_ids.length === 0) {
            return res.status(400).json({ success: false, message: "No crew members selected." });
        }

        const ROLE_GROUPS = {
            videographer: ["9", "1"],
            photographer: ["10", "2"],
            cinematographer: ["11", "3"]
        };

        const ID_TO_ROLE_MAP = {};
        Object.entries(ROLE_GROUPS).forEach(([roleName, ids]) => {
            ids.forEach(id => { ID_TO_ROLE_MAP[String(id)] = roleName; });
        });

        const lead = await sales_leads.findOne({
            where: { lead_id },
            include: [{ 
                model: stream_project_booking, 
                as: 'booking',
                include: [{ 
                    model: assigned_crew, 
                    as: 'assigned_crews', 
                    where: { crew_accept: { [Op.ne]: 2 } }, 
                    required: false,
                    include: [{ model: crew_members, as: 'crew_member' }]
                }]
            }]
        });
        if (!lead || !lead.booking) {
            return res.status(404).json({ success: false, message: "Lead or booking not found." });
        }

        const booking = lead.booking;
        const requestedLimits = typeof booking.crew_roles === 'string' ? JSON.parse(booking.crew_roles) : (booking.crew_roles || {});

        let currentCounts = { videographer: 0, photographer: 0, cinematographer: 0 };
                if (booking.assigned_crews) {
            booking.assigned_crews.forEach(ac => {
                if (ac.crew_member?.primary_role) {
                    try {
                        const parsed = JSON.parse(ac.crew_member.primary_role);
                        const roles = Array.isArray(parsed) ? parsed : [parsed];
                        roles.forEach(id => {
                            const roleName = ID_TO_ROLE_MAP[String(id)];
                            if (roleName) currentCounts[roleName]++;
                        });
                    } catch (e) { console.error("Parse error in existing crew", e); }
                }
            });
        }

        const newCrewDetails = await crew_members.findAll({
            where: { crew_member_id: crew_member_ids }
        });

        const assignmentsToCreate = [];
        let errors = [];
        let hasAcceptedCrew = true;

        newCrewDetails.forEach(crew => {
            let roles = [];
            try {
                const parsed = JSON.parse(crew.primary_role || "[]");
                roles = Array.isArray(parsed) ? parsed : [parsed];
            } catch (e) {
                roles = [crew.primary_role];
            }

            let roleDetected = null;
            roles.forEach(id => {
                if (ID_TO_ROLE_MAP[String(id)]) roleDetected = ID_TO_ROLE_MAP[String(id)];
            });

            if (roleDetected) {
                const limit = requestedLimits[roleDetected] || 0;
                
                if (currentCounts[roleDetected] + 1 > limit) {
                    errors.push(`Cannot add ${crew.first_name} (${roleDetected}). Limit of ${limit} reached.`);
                } else {
                    currentCounts[roleDetected]++;
                    assignmentsToCreate.push({
                        project_id: booking.stream_project_booking_id,
                        crew_member_id: crew.crew_member_id,
                        assigned_date: new Date(),
                        status: 'selected',
                        crew_accept: 0,
                        is_active: 1,
                        organization_type: 1
                    });
                }
            } else {
                errors.push(`Crew member ${crew.first_name} has an unknown role and cannot be assigned.`);
            }
        });

        if (errors.length > 0 && assignmentsToCreate.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: "Assignments failed validation.", 
                errors: errors 
            });
        }

        if (assignmentsToCreate.length > 0) {
            await assigned_crew.bulkCreate(assignmentsToCreate);
            await sales_lead_activities.create({
                lead_id: lead_id,
                activity_type: 'bulk_crew_assigned',
                notes: `Sales rep assigned ${assignmentsToCreate.length} crew members.`,
                performed_by_user_id: assigned_by_user_id
            });
        }

        res.json({ 
            success: true, 
            message: `${assignmentsToCreate.length} crew members assigned successfully.`,
            errors: errors.length > 0 ? errors : undefined 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.removeAssignedCrew = async (req, res) => {
    try {
      const assigned_by_user_id = req.user?.userId; // Assuming you have user info in req.user
        const { lead_id, crew_member_id } = req.body;

        if (!lead_id || !crew_member_id) {
            return res.status(400).json({ success: false, message: "lead_id and crew_member_id are required." });
        }

        const lead = await sales_leads.findOne({
            where: { lead_id },
            attributes: ['lead_id', 'booking_id']
        });

        if (!lead || !lead.booking_id) {
            return res.status(404).json({ success: false, message: "Lead or associated booking not found." });
        }

        const assignment = await assigned_crew.findOne({
            where: {
                project_id: lead.booking_id,
                crew_member_id: crew_member_id,
                is_active: 1
            },
            include: [{ 
                model: crew_members, 
                as: 'crew_member', 
                attributes: ['first_name', 'last_name'] 
            }]
        });

        if (!assignment) {
            return res.status(404).json({ 
                success: false, 
                message: "This crew member is not currently assigned to this project or is already inactive." 
            });
        }

        await assignment.update({ is_active: 0 });

        const crewName = assignment.crew_member 
            ? `${assignment.crew_member.first_name} ${assignment.crew_member.last_name}` 
            : `ID: ${crew_member_id}`;

        await sales_lead_activities.create({
            lead_id: lead_id,
            activity_type: 'crew_removed',
            notes: `Sales rep removed ${crewName} from the project.`,
            performed_by_user_id: assigned_by_user_id,
            created_at: new Date()
        });

        res.json({
            success: true,
            message: "Crew member removed from project successfully."
        });

    } catch (error) {
        console.error('RemoveCrew Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};



exports.getClientFullDetailsByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    let { status, event_type, search, limit, page, range, start_date, end_date } = req.query;

    if (!userId) {
      return res.status(400).json({ error: true, message: "User ID is required" });
    }

    // 1️⃣ Get User, Client, and Affiliate Details
    const [user, client, affiliate] = await Promise.all([
      users.findOne({
        where: { id: userId },
        attributes: { exclude: ['password_hash'] }
      }),
      clients.findOne({
        where: { user_id: userId, is_active: 1 }
      }),
      affiliates.findOne({
        where: { user_id: userId }
      })
    ]);

    if (!user) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }

    const today = new Date();

    // -------- 2️⃣ PAGINATION LOGIC --------
    const noPagination = !limit && !page;
    let pageNumber = parseInt(page ?? 1, 10);
    let pageSize = parseInt(limit ?? 10, 10);
    let offset = (pageNumber - 1) * pageSize;

    // -------- 3️⃣ DATE FILTER LOGIC --------
    let dateFilter = {};
    if (start_date && end_date) {
      dateFilter = {
        event_date: { [Sequelize.Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`] }
      };
    } else if (range === 'month') {
      dateFilter = {
        [Sequelize.Op.and]: [
          Sequelize.where(Sequelize.fn('MONTH', Sequelize.col('event_date')), Sequelize.fn('MONTH', Sequelize.fn('CURDATE'))),
          Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('event_date')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
        ]
      };
    } else if (range === 'week') {
      dateFilter = {
        [Sequelize.Op.and]: [
          Sequelize.where(Sequelize.fn('YEARWEEK', Sequelize.col('event_date'), 1), Sequelize.fn('YEARWEEK', Sequelize.fn('CURDATE'), 1))
        ]
      };
    }

    // -------- 4️⃣ BASE WHERE CONDITIONS --------
    const whereConditions = {
      user_id: userId,
      is_active: 1,
      ...dateFilter
    };

    if (status) {
      switch (status) {
        case 'cancelled': whereConditions.is_cancelled = 1; break;
        case 'completed': whereConditions.is_completed = 1; break;
        case 'upcoming':
          whereConditions.is_cancelled = 0;
          whereConditions.is_draft = 0;
          whereConditions.event_date = { ...(dateFilter.event_date || {}), [Sequelize.Op.gt]: today };
          break;
        case 'draft': whereConditions.is_draft = 1; break;
      }
    }

    if (event_type) whereConditions.event_type = event_type;
    if (search) {
      whereConditions.project_name = Sequelize.where(
        Sequelize.fn('LOWER', Sequelize.col('project_name')),
        { [Sequelize.Op.like]: `%${search.toLowerCase()}%` }
      );
    }

    // -------- 5️⃣ STATS COUNTS --------
    const [
      total_active, total_cancelled, total_completed, total_upcoming, total_draft
    ] = await Promise.all([
      stream_project_booking.count({ where: { user_id: userId, is_active: 1, is_cancelled: 0, is_completed: 0, is_draft: 0 } }),
      stream_project_booking.count({ where: { user_id: userId, is_cancelled: 1 } }),
      stream_project_booking.count({ where: { user_id: userId, is_completed: 1 } }),
      stream_project_booking.count({ where: { user_id: userId, is_cancelled: 0, is_draft: 0, event_date: { [Sequelize.Op.gt]: today } } }),
      stream_project_booking.count({ where: { user_id: userId, is_draft: 1 } }),
    ]);

    // -------- 6️⃣ FETCH PROJECTS & ASSOCIATED DATA --------
    const projects = await stream_project_booking.findAll({
      where: whereConditions,
      ...(noPagination ? {} : { limit: pageSize, offset }),
      order: [['event_date', 'DESC']]
    });

    const projectDetails = await Promise.all(
      projects.map(async (project) => {
        const [assignedCrew, assignedEquipment, assignedPostProd, paymentData] = await Promise.all([
          assigned_crew.findAll({
            where: { project_id: project.stream_project_booking_id, is_active: 1 },
            include: [{ model: crew_members, as: 'crew_member' }]
          }),
          assigned_equipment.findAll({
            where: { project_id: project.stream_project_booking_id, is_active: 1 },
            include: [{ model: equipment, as: 'equipment' }]
          }),
          assigned_post_production_member.findAll({
            where: { project_id: project.stream_project_booking_id, is_active: 1 },
            include: [{ model: post_production_members, as: 'post_production_member' }]
          }),
          payment_transactions.findOne({
            where: { payment_id: project.payment_id },
            attributes: ['total_amount']
          })
        ]);

        // Format event types
        const rawTypes = project.event_type ? project.event_type.split(',') : [];
        const formattedTypes = rawTypes.map(t => {
          const val = t.trim().toLowerCase();
          const map = { 'videographer': 'Videography', 'photographer': 'Photography' };
          return map[val] || val.charAt(0).toUpperCase() + val.slice(1);
        });

        return {
          ...project.toJSON(),
          total_paid_amount: paymentData ? paymentData.total_amount : 0,
          event_type_labels: formattedTypes.join(', '),
          event_location_formatted: (() => {
            try {
              const loc = project.event_location;
              if (typeof loc === "string" && (loc.startsWith("{") || loc.startsWith("["))) {
                const parsed = JSON.parse(loc);
                return parsed.address || parsed;
              }
              return loc;
            } catch (e) { return project.event_location; }
          })(),
          assignedCrew,
          assignedEquipment,
          assignedPostProductionMembers: assignedPostProd
        };
      })
    );

    // -------- 7️⃣ SEPARATE PAID & UNPAID --------
    const paid = [];
    const unpaid_or_draft = [];
    projectDetails.forEach(item => {
      if (item.payment_id && item.is_draft !== 1) {
        paid.push(item);
      } else {
        unpaid_or_draft.push(item);
      }
    });

    // -------- 8️⃣ FINAL RESPONSE --------
    return res.status(200).json({
      error: false,
      message: 'Client full details and shoots fetched successfully',
      data: {
        profile: {
          user,
          client,
          affiliate
        },
        stats: {
          total_active,
          total_cancelled,
          total_completed,
          total_upcoming,
          total_draft
        },
        projects: {
          paid,
          unpaid_or_draft
        },
        pagination: noPagination ? null : {
          page: pageNumber,
          limit: pageSize
        }
      }
    });

  } catch (error) {
    console.error('Get Full Client Details Error:', error);
    return res.status(500).json({ error: true, message: 'Internal server error' });
  }
};