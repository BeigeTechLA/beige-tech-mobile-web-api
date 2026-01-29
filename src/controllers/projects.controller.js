/**
 * Projects Controller
 *
 * Handles CRUD operations, state management, feedback, and assignments
 * for post-shoot project workflow management.
 */

const db = require('../models');
const { Op } = require('sequelize');
const constants = require('../utils/constants');
const stateMachineService = require('../services/stateMachine.service');
const { PROJECT_STATES, ROLES, STATE_METADATA } = require('../config/stateTransitions');

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate unique project code in format PRJ-YYYY-NNNN
 * @returns {Promise<string>} Generated project code
 */
async function generateProjectCode() {
  const year = new Date().getFullYear();
  const prefix = `PRJ-${year}-`;

  // Find the highest existing project code for this year
  const latestProject = await db.projects.findOne({
    where: {
      project_code: {
        [Op.like]: `${prefix}%`,
      },
    },
    order: [['project_code', 'DESC']],
    attributes: ['project_code'],
  });

  let nextNumber = 1;
  if (latestProject && latestProject.project_code) {
    const currentNumber = parseInt(latestProject.project_code.split('-')[2], 10);
    if (!isNaN(currentNumber)) {
      nextNumber = currentNumber + 1;
    }
  }

  return `${prefix}${String(nextNumber).padStart(4, '0')}`;
}

/**
 * Map user_type to role string for state machine
 * @param {number} userType - User type ID
 * @returns {string} Role string
 */
function mapUserTypeToRole(userType) {
  const roleMap = {
    1: ROLES.CLIENT,    // Regular user/client
    2: ROLES.CREATOR,   // Creator
    3: ROLES.EDITOR,    // Editor
    4: ROLES.QC,        // QC reviewer
    5: ROLES.ADMIN,     // Admin
    6: ROLES.REVIEWER,  // Coverage reviewer
  };
  return roleMap[userType] || ROLES.CLIENT;
}

/**
 * Check if user has access to project
 * @param {Object} project - Project object
 * @param {number} userId - User ID
 * @param {string} userRole - User role
 * @returns {boolean}
 */
function hasProjectAccess(project, userId, userRole) {
  // Admins and QC have access to all projects
  if ([ROLES.ADMIN, ROLES.QC, ROLES.REVIEWER].includes(userRole)) {
    return true;
  }

  // Check if user is client owner
  if (project.client_user_id === userId) {
    return true;
  }

  // Check if user is assigned creator, editor, or QC
  if (
    project.assigned_creator_id === userId ||
    project.assigned_editor_id === userId ||
    project.assigned_qc_id === userId
  ) {
    return true;
  }

  return false;
}

/**
 * Format project response with state metadata
 * @param {Object} project - Project object
 * @returns {Object} Formatted project
 */
function formatProjectResponse(project) {
  const projectData = project.toJSON ? project.toJSON() : project;
  const stateMetadata = STATE_METADATA[projectData.current_state] || {};

  return {
    project_id: projectData.project_id,
    booking_id: projectData.booking_id,
    project_code: projectData.project_code,
    project_name: projectData.project_name,
    current_state: projectData.current_state,
    state_display_name: stateMetadata.displayName || projectData.current_state,
    state_category: stateMetadata.category || 'unknown',
    requires_action: stateMetadata.requiresAction || false,
    is_rejection_state: stateMetadata.isRejectionState || false,
    state_changed_at: projectData.state_changed_at,
    client_user_id: projectData.client_user_id,
    client: projectData.client
      ? {
          user_id: projectData.client.id,
          name: projectData.client.name,
          email: projectData.client.email,
        }
      : null,
    assigned_creator_id: projectData.assigned_creator_id,
    // Handle both 'creator' and 'assigned_creator' alias patterns
    assigned_creator: (projectData.creator || projectData.assigned_creator)
      ? {
          user_id: (projectData.creator || projectData.assigned_creator).id,
          name: (projectData.creator || projectData.assigned_creator).name,
          email: (projectData.creator || projectData.assigned_creator).email,
        }
      : null,
    assigned_editor_id: projectData.assigned_editor_id,
    // Handle both 'editor' and 'assigned_editor' alias patterns
    assigned_editor: (projectData.editor || projectData.assigned_editor)
      ? {
          user_id: (projectData.editor || projectData.assigned_editor).id,
          name: (projectData.editor || projectData.assigned_editor).name,
          email: (projectData.editor || projectData.assigned_editor).email,
        }
      : null,
    assigned_qc_id: projectData.assigned_qc_id,
    // Handle both 'qc_reviewer' and 'assigned_qc' alias patterns
    assigned_qc: (projectData.qc_reviewer || projectData.assigned_qc)
      ? {
          user_id: (projectData.qc_reviewer || projectData.assigned_qc).id,
          name: (projectData.qc_reviewer || projectData.assigned_qc).name,
          email: (projectData.qc_reviewer || projectData.assigned_qc).email,
        }
      : null,
    raw_upload_deadline: projectData.raw_upload_deadline,
    edit_delivery_deadline: projectData.edit_delivery_deadline,
    final_delivery_deadline: projectData.final_delivery_deadline,
    project_notes: projectData.project_notes,
    client_requirements: projectData.client_requirements,
    total_raw_size_bytes: projectData.total_raw_size_bytes,
    total_files_count: projectData.total_files_count,
    created_at: projectData.created_at,
    updated_at: projectData.updated_at,
  };
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * Create a new project from booking
 * POST /v1/projects/create
 */
exports.createProject = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const userId = req.user.userId;
    const userRole = mapUserTypeToRole(req.user.userTypeId);

    const {
      booking_id,
      project_name,
      client_user_id,
      assigned_creator_id,
      raw_upload_deadline,
      edit_delivery_deadline,
      final_delivery_deadline,
      project_notes,
      client_requirements,
    } = req.body;

    // Validate required fields
    if (!booking_id) {
      await transaction.rollback();
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'booking_id is required',
      });
    }

    // Verify booking exists
    const booking = await db.stream_project_booking.findOne({
      where: { stream_project_booking_id: booking_id },
    });

    if (!booking) {
      await transaction.rollback();
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Booking not found',
      });
    }

    // Check if project already exists for this booking
    const existingProject = await db.projects.findOne({
      where: { booking_id },
    });

    if (existingProject) {
      await transaction.rollback();
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Project already exists for this booking',
        data: { project_id: existingProject.project_id },
      });
    }

    // Generate project code
    const projectCode = await generateProjectCode();

    // Create project
    const project = await db.projects.create(
      {
        booking_id,
        project_code: projectCode,
        project_name: project_name || booking.project_name || `Project ${projectCode}`,
        current_state: PROJECT_STATES.RAW_UPLOADED,
        state_changed_at: new Date(),
        client_user_id: client_user_id || booking.user_id || userId,
        assigned_creator_id: assigned_creator_id || null,
        raw_upload_deadline: raw_upload_deadline || null,
        edit_delivery_deadline: edit_delivery_deadline || null,
        final_delivery_deadline: final_delivery_deadline || null,
        project_notes: project_notes || null,
        client_requirements: client_requirements || booking.description || null,
        total_raw_size_bytes: 0,
        total_files_count: 0,
      },
      { transaction }
    );

    // Create initial audit log entry
    await db.project_state_history.create(
      {
        project_id: project.project_id,
        from_state: PROJECT_STATES.RAW_UPLOADED,
        to_state: PROJECT_STATES.RAW_UPLOADED,
        transitioned_by_user_id: userId,
        transitioned_by_role: userRole,
        transition_reason: 'Project created',
        transition_type: 'MANUAL',
        ip_address: req.ip || req.connection?.remoteAddress,
        user_agent: req.headers['user-agent'],
      },
      { transaction }
    );

    await transaction.commit();

    // Fetch project with associations
    const createdProject = await db.projects.findOne({
      where: { project_id: project.project_id },
      include: [
        {
          model: db.users,
          as: 'client',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: db.users,
          as: 'creator',
          attributes: ['id', 'name', 'email'],
        },
      ],
    });

    res.status(constants.CREATED.code).json({
      success: true,
      message: 'Project created successfully',
      data: formatProjectResponse(createdProject),
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error creating project:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to create project',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get project by ID
 * GET /v1/projects/:id
 */
exports.getProject = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = mapUserTypeToRole(req.user.userTypeId);

    if (!id) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Project ID is required',
      });
    }

    const project = await db.projects.findOne({
      where: { project_id: id },
      include: [
        {
          model: db.users,
          as: 'client',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: db.users,
          as: 'creator',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: db.users,
          as: 'editor',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: db.users,
          as: 'qc_reviewer',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: db.stream_project_booking,
          as: 'booking',
          attributes: ['stream_project_booking_id', 'project_name', 'event_date', 'event_location'],
        },
      ],
    });

    if (!project) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Check access permissions
    if (!hasProjectAccess(project.toJSON(), userId, userRole)) {
      return res.status(constants.FORBIDDEN.code).json({
        success: false,
        message: 'You do not have access to this project',
      });
    }

    // Get valid transitions for user's role
    const validTransitions = stateMachineService.getValidTransitions(
      project.current_state,
      userRole
    );

    const response = formatProjectResponse(project);
    response.valid_transitions = validTransitions;
    response.booking = project.booking
      ? {
          booking_id: project.booking.stream_project_booking_id,
          project_name: project.booking.project_name,
          event_date: project.booking.event_date,
          event_location: project.booking.event_location,
        }
      : null;

    res.status(constants.OK.code).json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch project',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get projects for current user
 * GET /v1/projects/user
 */
exports.getProjectsByUser = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = mapUserTypeToRole(req.user.userTypeId);

    const {
      page = 1,
      limit = 20,
      status,
      state,
      search,
      sort_by = 'created_at',
      sort_order = 'DESC',
      date_from,
      date_to,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build where clause based on role
    const whereClause = {};

    // Role-based filtering (non-admin users see only their projects)
    if (![ROLES.ADMIN, ROLES.QC, ROLES.REVIEWER].includes(userRole)) {
      whereClause[Op.or] = [
        { client_user_id: userId },
        { assigned_creator_id: userId },
        { assigned_editor_id: userId },
        { assigned_qc_id: userId },
      ];
    }

    // State filter
    if (state) {
      whereClause.current_state = state;
    }

    // Status category filter (maps to state categories)
    if (status) {
      const statesByCategory = Object.entries(STATE_METADATA)
        .filter(([_, meta]) => meta.category === status)
        .map(([state]) => state);

      if (statesByCategory.length > 0) {
        whereClause.current_state = { [Op.in]: statesByCategory };
      }
    }

    // Date range filter
    if (date_from || date_to) {
      whereClause.created_at = {};
      if (date_from) {
        whereClause.created_at[Op.gte] = new Date(date_from);
      }
      if (date_to) {
        whereClause.created_at[Op.lte] = new Date(date_to);
      }
    }

    // Search filter
    if (search) {
      whereClause[Op.and] = whereClause[Op.and] || [];
      whereClause[Op.and].push({
        [Op.or]: [
          { project_name: { [Op.like]: `%${search}%` } },
          { project_code: { [Op.like]: `%${search}%` } },
        ],
      });
    }

    // Validate sort field
    const allowedSortFields = [
      'created_at',
      'updated_at',
      'state_changed_at',
      'project_name',
      'project_code',
    ];
    const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'created_at';
    const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { count, rows: projects } = await db.projects.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: db.users,
          as: 'client',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: db.users,
          as: 'creator',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: db.users,
          as: 'editor',
          attributes: ['id', 'name', 'email'],
        },
      ],
      order: [[sortField, sortDirection]],
      limit: parseInt(limit),
      offset,
      distinct: true,
    });

    const formattedProjects = projects.map(formatProjectResponse);

    res.status(constants.OK.code).json({
      success: true,
      data: {
        projects: formattedProjects,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil(count / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching user projects:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch projects',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Update project details
 * PUT /v1/projects/:id
 */
exports.updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = mapUserTypeToRole(req.user.userTypeId);

    const {
      project_name,
      raw_upload_deadline,
      edit_delivery_deadline,
      final_delivery_deadline,
      project_notes,
      client_requirements,
    } = req.body;

    const project = await db.projects.findOne({
      where: { project_id: id },
    });

    if (!project) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Check permissions - only admins and project owner can update
    const canUpdate =
      userRole === ROLES.ADMIN || project.client_user_id === userId;

    if (!canUpdate) {
      return res.status(constants.FORBIDDEN.code).json({
        success: false,
        message: 'You do not have permission to update this project',
      });
    }

    // Build update data
    const updateData = {
      updated_at: new Date(),
    };

    if (project_name !== undefined) updateData.project_name = project_name;
    if (raw_upload_deadline !== undefined) updateData.raw_upload_deadline = raw_upload_deadline;
    if (edit_delivery_deadline !== undefined) updateData.edit_delivery_deadline = edit_delivery_deadline;
    if (final_delivery_deadline !== undefined) updateData.final_delivery_deadline = final_delivery_deadline;
    if (project_notes !== undefined) updateData.project_notes = project_notes;
    if (client_requirements !== undefined) updateData.client_requirements = client_requirements;

    await project.update(updateData);

    // Fetch updated project with associations
    const updatedProject = await db.projects.findOne({
      where: { project_id: id },
      include: [
        {
          model: db.users,
          as: 'client',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: db.users,
          as: 'creator',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: db.users,
          as: 'editor',
          attributes: ['id', 'name', 'email'],
        },
      ],
    });

    res.status(constants.OK.code).json({
      success: true,
      message: 'Project updated successfully',
      data: formatProjectResponse(updatedProject),
    });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to update project',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/**
 * Transition project state
 * POST /v1/projects/:id/transition
 */
exports.transitionState = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const { to_state, reason, metadata } = req.body;

    if (!to_state) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'to_state is required',
      });
    }

    // Use state machine service for transition
    const result = await stateMachineService.transitionState(
      id,
      to_state,
      userId,
      reason,
      {
        ...metadata,
        ip_address: req.ip || req.connection?.remoteAddress,
        user_agent: req.headers['user-agent'],
      }
    );

    if (!result.success) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: result.error,
        data: result.project ? formatProjectResponse(result.project) : null,
      });
    }

    res.status(constants.OK.code).json({
      success: true,
      message: `Project transitioned to ${to_state}`,
      data: formatProjectResponse(result.project),
    });
  } catch (error) {
    console.error('Error transitioning project state:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to transition project state',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get project state history
 * GET /v1/projects/:id/history
 */
exports.getStateHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = mapUserTypeToRole(req.user.userTypeId);

    const { limit = 50, offset = 0 } = req.query;

    // Verify project exists and user has access
    const project = await db.projects.findOne({
      where: { project_id: id },
    });

    if (!project) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Project not found',
      });
    }

    if (!hasProjectAccess(project.toJSON(), userId, userRole)) {
      return res.status(constants.FORBIDDEN.code).json({
        success: false,
        message: 'You do not have access to this project',
      });
    }

    // Get state history
    const history = await stateMachineService.getStateHistory(id, {
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    // Format history entries
    const formattedHistory = history.map((entry) => ({
      history_id: entry.history_id,
      from_state: entry.from_state,
      from_state_display: STATE_METADATA[entry.from_state]?.displayName || entry.from_state,
      to_state: entry.to_state,
      to_state_display: STATE_METADATA[entry.to_state]?.displayName || entry.to_state,
      transitioned_by: entry.transitioner
        ? {
            user_id: entry.transitioner.id,
            name: entry.transitioner.name,
            email: entry.transitioner.email,
          }
        : null,
      transitioned_by_role: entry.transitioned_by_role,
      transition_reason: entry.transition_reason,
      transition_type: entry.transition_type,
      related_file_id: entry.related_file_id,
      related_feedback_id: entry.related_feedback_id,
      created_at: entry.created_at,
    }));

    res.status(constants.OK.code).json({
      success: true,
      data: {
        project_id: id,
        project_code: project.project_code,
        current_state: project.current_state,
        history: formattedHistory,
      },
    });
  } catch (error) {
    console.error('Error fetching state history:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch state history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get valid transitions for current user
 * GET /v1/projects/:id/valid-transitions
 */
exports.getValidTransitions = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = mapUserTypeToRole(req.user.userTypeId);

    const project = await db.projects.findOne({
      where: { project_id: id },
    });

    if (!project) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Project not found',
      });
    }

    if (!hasProjectAccess(project.toJSON(), userId, userRole)) {
      return res.status(constants.FORBIDDEN.code).json({
        success: false,
        message: 'You do not have access to this project',
      });
    }

    const validTransitions = stateMachineService.getValidTransitions(
      project.current_state,
      userRole
    );

    // Add display names to transitions
    const formattedTransitions = validTransitions.map((t) => ({
      ...t,
      to_state_display: STATE_METADATA[t.toState]?.displayName || t.toState,
    }));

    res.status(constants.OK.code).json({
      success: true,
      data: {
        project_id: id,
        current_state: project.current_state,
        current_state_display: STATE_METADATA[project.current_state]?.displayName,
        user_role: userRole,
        valid_transitions: formattedTransitions,
      },
    });
  } catch (error) {
    console.error('Error fetching valid transitions:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch valid transitions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// ============================================================================
// FEEDBACK MANAGEMENT
// ============================================================================

/**
 * Submit feedback for a project
 * POST /v1/projects/:id/feedback
 */
exports.submitFeedback = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = mapUserTypeToRole(req.user.userTypeId);

    const {
      feedback_type,
      feedback_text,
      related_file_id,
      video_timestamps,
      priority,
      attachments,
    } = req.body;

    // Validate required fields
    if (!feedback_type || !feedback_text) {
      await transaction.rollback();
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'feedback_type and feedback_text are required',
      });
    }

    // Verify project exists
    const project = await db.projects.findOne({
      where: { project_id: id },
    });

    if (!project) {
      await transaction.rollback();
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Check access
    if (!hasProjectAccess(project.toJSON(), userId, userRole)) {
      await transaction.rollback();
      return res.status(constants.FORBIDDEN.code).json({
        success: false,
        message: 'You do not have access to this project',
      });
    }

    // Create feedback entry
    const feedback = await db.project_feedback.create(
      {
        project_id: id,
        feedback_type,
        submitted_by_user_id: userId,
        submitted_by_role: userRole,
        related_file_id: related_file_id || null,
        feedback_text,
        video_timestamps: video_timestamps ? JSON.stringify(video_timestamps) : null,
        priority: priority || 'MEDIUM',
        attachments: attachments ? JSON.stringify(attachments) : null,
        status: 'PENDING',
      },
      { transaction }
    );

    // Auto-transition state if applicable (e.g., client feedback triggers state change)
    let transitionResult = null;
    if (
      feedback_type === 'CLIENT_PREVIEW_FEEDBACK' &&
      project.current_state === PROJECT_STATES.CLIENT_PREVIEW_READY
    ) {
      transitionResult = await stateMachineService.transitionState(
        id,
        PROJECT_STATES.CLIENT_FEEDBACK_RECEIVED,
        userId,
        'Client submitted feedback',
        { feedback_id: feedback.feedback_id }
      );
    }

    await transaction.commit();

    res.status(constants.CREATED.code).json({
      success: true,
      message: 'Feedback submitted successfully',
      data: {
        feedback_id: feedback.feedback_id,
        project_id: id,
        feedback_type,
        status: feedback.status,
        state_transitioned: transitionResult?.success || false,
        new_state: transitionResult?.project?.current_state || project.current_state,
        created_at: feedback.created_at,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error submitting feedback:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to submit feedback',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get feedback for a project
 * GET /v1/projects/:id/feedback
 */
exports.getProjectFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = mapUserTypeToRole(req.user.userTypeId);

    const {
      feedback_type,
      status,
      limit = 50,
      offset = 0,
    } = req.query;

    // Verify project exists
    const project = await db.projects.findOne({
      where: { project_id: id },
    });

    if (!project) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Check access
    if (!hasProjectAccess(project.toJSON(), userId, userRole)) {
      return res.status(constants.FORBIDDEN.code).json({
        success: false,
        message: 'You do not have access to this project',
      });
    }

    // Build where clause
    const whereClause = { project_id: id };

    if (feedback_type) {
      whereClause.feedback_type = feedback_type;
    }

    if (status) {
      whereClause.status = status;
    }

    const { count, rows: feedbackEntries } = await db.project_feedback.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: db.users,
          as: 'submitter',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: db.users,
          as: 'resolver',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: db.project_files,
          as: 'related_file',
          attributes: ['file_id', 'file_name', 'file_category'],
        },
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    const formattedFeedback = feedbackEntries.map((entry) => {
      const entryData = entry.toJSON();
      return {
        feedback_id: entryData.feedback_id,
        feedback_type: entryData.feedback_type,
        feedback_text: entryData.feedback_text,
        video_timestamps: entryData.video_timestamps
          ? JSON.parse(entryData.video_timestamps)
          : null,
        priority: entryData.priority,
        status: entryData.status,
        submitted_by: entryData.submitter
          ? {
              user_id: entryData.submitter.id,
              name: entryData.submitter.name,
              email: entryData.submitter.email,
            }
          : null,
        submitted_by_role: entryData.submitted_by_role,
        related_file: entryData.related_file
          ? {
              file_id: entryData.related_file.file_id,
              file_name: entryData.related_file.file_name,
              file_category: entryData.related_file.file_category,
            }
          : null,
        translated_for_creator: entryData.translated_for_creator,
        resolution_notes: entryData.resolution_notes,
        resolved_by: entryData.resolver
          ? {
              user_id: entryData.resolver.id,
              name: entryData.resolver.name,
            }
          : null,
        resolved_at: entryData.resolved_at,
        created_at: entryData.created_at,
        updated_at: entryData.updated_at,
      };
    });

    res.status(constants.OK.code).json({
      success: true,
      data: {
        project_id: id,
        feedback: formattedFeedback,
        pagination: {
          total: count,
          limit: parseInt(limit),
          offset: parseInt(offset),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching project feedback:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch project feedback',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// ============================================================================
// ASSIGNMENT MANAGEMENT
// ============================================================================

/**
 * Assign user to project
 * POST /v1/projects/:id/assign
 */
exports.assignUser = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = mapUserTypeToRole(req.user.userTypeId);

    const {
      role_type,
      assigned_user_id,
      assignment_notes,
      priority,
      deadline,
      estimated_hours,
      agreed_rate,
      rate_type,
    } = req.body;

    // Validate required fields
    if (!role_type || !assigned_user_id) {
      await transaction.rollback();
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'role_type and assigned_user_id are required',
      });
    }

    // Verify project exists
    const project = await db.projects.findOne({
      where: { project_id: id },
    });

    if (!project) {
      await transaction.rollback();
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Verify assigned user exists
    const assignedUser = await db.users.findOne({
      where: { id: assigned_user_id },
    });

    if (!assignedUser) {
      await transaction.rollback();
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'User to be assigned not found',
      });
    }

    // Check if assignment already exists
    const existingAssignment = await db.project_assignments.findOne({
      where: {
        project_id: id,
        assigned_user_id,
        role_type,
        status: { [Op.notIn]: ['CANCELLED', 'DECLINED'] },
      },
    });

    if (existingAssignment) {
      await transaction.rollback();
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'User is already assigned to this project in this role',
        data: { assignment_id: existingAssignment.assignment_id },
      });
    }

    // Create assignment
    const assignment = await db.project_assignments.create(
      {
        project_id: id,
        role_type,
        assigned_user_id,
        assigned_by_user_id: userId,
        status: 'PENDING_ACCEPTANCE',
        assignment_notes: assignment_notes || null,
        priority: priority || 'NORMAL',
        deadline: deadline || null,
        estimated_hours: estimated_hours || null,
        agreed_rate: agreed_rate || null,
        rate_type: rate_type || null,
      },
      { transaction }
    );

    // Update project's assigned user fields based on role
    const projectUpdate = {};
    if (role_type === 'CREATOR') {
      projectUpdate.assigned_creator_id = assigned_user_id;
    } else if (role_type === 'EDITOR') {
      projectUpdate.assigned_editor_id = assigned_user_id;
    } else if (role_type === 'QC_REVIEWER') {
      projectUpdate.assigned_qc_id = assigned_user_id;
    }

    if (Object.keys(projectUpdate).length > 0) {
      await project.update(projectUpdate, { transaction });
    }

    await transaction.commit();

    // Fetch assignment with user details
    const createdAssignment = await db.project_assignments.findOne({
      where: { assignment_id: assignment.assignment_id },
      include: [
        {
          model: db.users,
          as: 'assigned_user',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: db.users,
          as: 'assigned_by',
          attributes: ['id', 'name', 'email'],
        },
      ],
    });

    res.status(constants.CREATED.code).json({
      success: true,
      message: 'User assigned successfully',
      data: {
        assignment_id: createdAssignment.assignment_id,
        project_id: id,
        role_type: createdAssignment.role_type,
        status: createdAssignment.status,
        assigned_user: createdAssignment.assigned_user
          ? {
              user_id: createdAssignment.assigned_user.id,
              name: createdAssignment.assigned_user.name,
              email: createdAssignment.assigned_user.email,
            }
          : null,
        assigned_by: createdAssignment.assigned_by
          ? {
              user_id: createdAssignment.assigned_by.id,
              name: createdAssignment.assigned_by.name,
            }
          : null,
        priority: createdAssignment.priority,
        deadline: createdAssignment.deadline,
        created_at: createdAssignment.created_at,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error assigning user to project:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to assign user to project',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Update assignment status (accept/decline/complete)
 * PUT /v1/projects/assignments/:assignmentId
 */
exports.updateAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const userId = req.user.userId;

    const {
      status,
      response_notes,
      actual_hours,
    } = req.body;

    const assignment = await db.project_assignments.findOne({
      where: { assignment_id: assignmentId },
    });

    if (!assignment) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Assignment not found',
      });
    }

    // Only assigned user can update their own assignment status
    if (assignment.assigned_user_id !== userId) {
      return res.status(constants.FORBIDDEN.code).json({
        success: false,
        message: 'You can only update your own assignment',
      });
    }

    // Validate status transitions
    const validTransitions = {
      PENDING_ACCEPTANCE: ['ACCEPTED', 'DECLINED'],
      ACCEPTED: ['IN_PROGRESS', 'CANCELLED'],
      IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
    };

    if (status && !validTransitions[assignment.status]?.includes(status)) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: `Cannot transition from ${assignment.status} to ${status}`,
      });
    }

    // Build update data
    const updateData = { updated_at: new Date() };

    if (status) {
      updateData.status = status;

      if (['ACCEPTED', 'DECLINED'].includes(status)) {
        updateData.response_at = new Date();
      }

      if (status === 'IN_PROGRESS') {
        updateData.started_at = new Date();
      }

      if (status === 'COMPLETED') {
        updateData.completed_at = new Date();
      }
    }

    if (response_notes !== undefined) updateData.response_notes = response_notes;
    if (actual_hours !== undefined) updateData.actual_hours = actual_hours;

    await assignment.update(updateData);

    // Fetch updated assignment
    const updatedAssignment = await db.project_assignments.findOne({
      where: { assignment_id: assignmentId },
      include: [
        {
          model: db.users,
          as: 'assigned_user',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: db.projects,
          as: 'project',
          attributes: ['project_id', 'project_code', 'project_name'],
        },
      ],
    });

    res.status(constants.OK.code).json({
      success: true,
      message: 'Assignment updated successfully',
      data: {
        assignment_id: updatedAssignment.assignment_id,
        project: updatedAssignment.project
          ? {
              project_id: updatedAssignment.project.project_id,
              project_code: updatedAssignment.project.project_code,
              project_name: updatedAssignment.project.project_name,
            }
          : null,
        role_type: updatedAssignment.role_type,
        status: updatedAssignment.status,
        response_notes: updatedAssignment.response_notes,
        started_at: updatedAssignment.started_at,
        completed_at: updatedAssignment.completed_at,
        actual_hours: updatedAssignment.actual_hours,
        updated_at: updatedAssignment.updated_at,
      },
    });
  } catch (error) {
    console.error('Error updating assignment:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to update assignment',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get project assignments
 * GET /v1/projects/:id/assignments
 */
exports.getProjectAssignments = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = mapUserTypeToRole(req.user.userTypeId);

    // Verify project exists
    const project = await db.projects.findOne({
      where: { project_id: id },
    });

    if (!project) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Check access
    if (!hasProjectAccess(project.toJSON(), userId, userRole)) {
      return res.status(constants.FORBIDDEN.code).json({
        success: false,
        message: 'You do not have access to this project',
      });
    }

    const assignments = await db.project_assignments.findAll({
      where: { project_id: id },
      include: [
        {
          model: db.users,
          as: 'assigned_user',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: db.users,
          as: 'assigned_by',
          attributes: ['id', 'name', 'email'],
        },
      ],
      order: [['created_at', 'DESC']],
    });

    const formattedAssignments = assignments.map((a) => {
      const aData = a.toJSON();
      return {
        assignment_id: aData.assignment_id,
        role_type: aData.role_type,
        status: aData.status,
        priority: aData.priority,
        assigned_user: aData.assigned_user
          ? {
              user_id: aData.assigned_user.id,
              name: aData.assigned_user.name,
              email: aData.assigned_user.email,
            }
          : null,
        assigned_by: aData.assigned_by
          ? {
              user_id: aData.assigned_by.id,
              name: aData.assigned_by.name,
            }
          : null,
        deadline: aData.deadline,
        estimated_hours: aData.estimated_hours,
        actual_hours: aData.actual_hours,
        started_at: aData.started_at,
        completed_at: aData.completed_at,
        created_at: aData.created_at,
      };
    });

    res.status(constants.OK.code).json({
      success: true,
      data: {
        project_id: id,
        assignments: formattedAssignments,
      },
    });
  } catch (error) {
    console.error('Error fetching project assignments:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch project assignments',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// ============================================================================
// DASHBOARD UTILITIES
// ============================================================================

/**
 * Get projects requiring action for current user
 * GET /v1/projects/requiring-action
 */
exports.getProjectsRequiringAction = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = mapUserTypeToRole(req.user.userTypeId);

    const projects = await stateMachineService.getProjectsRequiringAction(userId, userRole);

    const formattedProjects = projects.map(formatProjectResponse);

    res.status(constants.OK.code).json({
      success: true,
      data: {
        count: formattedProjects.length,
        projects: formattedProjects,
      },
    });
  } catch (error) {
    console.error('Error fetching projects requiring action:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch projects requiring action',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
