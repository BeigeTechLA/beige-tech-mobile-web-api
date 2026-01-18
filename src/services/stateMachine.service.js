/**
 * State Machine Service
 *
 * Orchestrates state transitions for project workflow management.
 * Handles validation, execution, audit logging, and notification triggers.
 */

const db = require('../models');
const {
  PROJECT_STATES,
  ROLES,
  isValidTransition,
  isRoleAllowed,
  requiresReason,
  getValidTransitionsForRole,
  STATE_METADATA,
} = require('../config/stateTransitions');

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate if a state transition is allowed for a user
 * @param {number} projectId - Project ID
 * @param {string} toState - Desired state
 * @param {number} userId - User ID performing transition
 * @param {string} userRole - User role (CREATOR, CLIENT, ADMIN, QC, EDITOR, SYSTEM)
 * @param {string} [reason] - Reason for transition (required for certain transitions)
 * @returns {Promise<Object>} { allowed: boolean, error: string|null, project: Object|null }
 */
async function canTransition(projectId, toState, userId, userRole, reason = null) {
  try {
    // Fetch project with current state
    const project = await db.projects.findOne({
      where: { project_id: projectId },
      include: [
        {
          model: db.users,
          as: 'client',
          attributes: ['user_id', 'email', 'first_name', 'last_name'],
        },
        {
          model: db.users,
          as: 'creator',
          attributes: ['user_id', 'email', 'first_name', 'last_name'],
        },
        {
          model: db.users,
          as: 'editor',
          attributes: ['user_id', 'email', 'first_name', 'last_name'],
        },
      ],
    });

    if (!project) {
      return {
        allowed: false,
        error: 'Project not found',
        project: null,
      };
    }

    const currentState = project.current_state;

    // Validate state exists
    if (!PROJECT_STATES[toState]) {
      return {
        allowed: false,
        error: `Invalid target state: ${toState}`,
        project: null,
      };
    }

    // Check if transition is valid
    if (!isValidTransition(currentState, toState)) {
      return {
        allowed: false,
        error: `Invalid transition from ${currentState} to ${toState}`,
        project: project.toJSON(),
      };
    }

    // Check role permissions
    if (!isRoleAllowed(currentState, toState, userRole)) {
      return {
        allowed: false,
        error: `Role ${userRole} is not allowed to transition from ${currentState} to ${toState}`,
        project: project.toJSON(),
      };
    }

    // Check if reason is required
    if (requiresReason(currentState, toState) && (!reason || reason.trim() === '')) {
      return {
        allowed: false,
        error: 'Transition reason is required',
        project: project.toJSON(),
      };
    }

    // Additional role-specific validations
    const validationResult = await validateRoleSpecificRules(
      project.toJSON(),
      userId,
      userRole,
      toState
    );

    if (!validationResult.valid) {
      return {
        allowed: false,
        error: validationResult.error,
        project: project.toJSON(),
      };
    }

    return {
      allowed: true,
      error: null,
      project: project.toJSON(),
    };
  } catch (error) {
    console.error('Error validating transition:', error);
    return {
      allowed: false,
      error: 'Internal error during validation',
      project: null,
    };
  }
}

/**
 * Validate role-specific business rules
 * @param {Object} project - Project object
 * @param {number} userId - User ID
 * @param {string} userRole - User role
 * @param {string} toState - Target state
 * @returns {Promise<Object>} { valid: boolean, error: string|null }
 */
async function validateRoleSpecificRules(project, userId, userRole, toState) {
  // CREATOR can only transition their own assigned projects
  if (userRole === ROLES.CREATOR) {
    if (project.assigned_creator_id !== userId) {
      return {
        valid: false,
        error: 'Creator can only transition projects assigned to them',
      };
    }
  }

  // CLIENT can only transition their own projects
  if (userRole === ROLES.CLIENT) {
    if (project.client_user_id !== userId) {
      return {
        valid: false,
        error: 'Client can only transition their own projects',
      };
    }
  }

  // EDITOR can only transition projects assigned to them
  if (userRole === ROLES.EDITOR) {
    if (project.assigned_editor_id !== userId) {
      return {
        valid: false,
        error: 'Editor can only transition projects assigned to them',
      };
    }
  }

  // ADMIN and QC have no ownership restrictions
  // SYSTEM has no restrictions (automated transitions)

  return { valid: true, error: null };
}

// ============================================================================
// STATE TRANSITION EXECUTION
// ============================================================================

/**
 * Execute a state transition
 * @param {number} projectId - Project ID
 * @param {string} toState - Desired state
 * @param {number} userId - User ID performing transition
 * @param {string} [reason] - Reason for transition
 * @param {Object} [metadata] - Additional metadata (file_ids, feedback_id, etc.)
 * @returns {Promise<Object>} { success: boolean, project: Object|null, error: string|null }
 */
async function transitionState(projectId, toState, userId, reason = null, metadata = {}) {
  const transaction = await db.sequelize.transaction();

  try {
    // Fetch user to get role
    const user = await db.users.findOne({
      where: { user_id: userId },
      attributes: ['user_id', 'role'],
    });

    if (!user) {
      await transaction.rollback();
      return {
        success: false,
        project: null,
        error: 'User not found',
      };
    }

    const userRole = user.role;

    // Validate transition
    const validation = await canTransition(projectId, toState, userId, userRole, reason);

    if (!validation.allowed) {
      await transaction.rollback();
      return {
        success: false,
        project: validation.project,
        error: validation.error,
      };
    }

    const project = validation.project;
    const fromState = project.current_state;

    // Update project state
    const updatedProject = await db.projects.update(
      {
        current_state: toState,
        state_changed_at: new Date(),
        updated_at: new Date(),
      },
      {
        where: { project_id: projectId },
        transaction,
      }
    );

    if (!updatedProject || updatedProject[0] === 0) {
      await transaction.rollback();
      return {
        success: false,
        project: null,
        error: 'Failed to update project state',
      };
    }

    // Create audit log entry
    const auditLog = await createAuditLog(
      projectId,
      fromState,
      toState,
      userId,
      reason,
      metadata,
      transaction
    );

    if (!auditLog) {
      await transaction.rollback();
      return {
        success: false,
        project: null,
        error: 'Failed to create audit log',
      };
    }

    // Commit transaction
    await transaction.commit();

    // Fetch updated project
    const finalProject = await db.projects.findOne({
      where: { project_id: projectId },
      include: [
        {
          model: db.users,
          as: 'client',
          attributes: ['user_id', 'email', 'first_name', 'last_name'],
        },
        {
          model: db.users,
          as: 'creator',
          attributes: ['user_id', 'email', 'first_name', 'last_name'],
        },
        {
          model: db.users,
          as: 'editor',
          attributes: ['user_id', 'email', 'first_name', 'last_name'],
        },
      ],
    });

    // Trigger notifications (non-blocking)
    triggerNotifications(finalProject.toJSON(), fromState, toState, userId, auditLog.toJSON())
      .catch(error => {
        console.error('Error triggering notifications:', error);
        // Don't fail the transition if notification fails
      });

    return {
      success: true,
      project: finalProject.toJSON(),
      error: null,
    };
  } catch (error) {
    await transaction.rollback();
    console.error('Error executing state transition:', error);
    return {
      success: false,
      project: null,
      error: 'Internal error during state transition',
    };
  }
}

/**
 * Bulk transition multiple projects to a state (admin only)
 * @param {Array<number>} projectIds - Array of project IDs
 * @param {string} toState - Desired state
 * @param {number} userId - Admin user ID
 * @param {string} reason - Reason for bulk transition
 * @returns {Promise<Object>} { success: number, failed: number, results: Array }
 */
async function bulkTransitionState(projectIds, toState, userId, reason) {
  const results = [];
  let successCount = 0;
  let failedCount = 0;

  for (const projectId of projectIds) {
    const result = await transitionState(projectId, toState, userId, reason);

    if (result.success) {
      successCount++;
    } else {
      failedCount++;
    }

    results.push({
      projectId,
      success: result.success,
      error: result.error,
    });
  }

  return {
    success: successCount,
    failed: failedCount,
    results,
  };
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

/**
 * Create audit log entry for state transition
 * @param {number} projectId - Project ID
 * @param {string} fromState - Previous state
 * @param {string} toState - New state
 * @param {number} userId - User who performed transition
 * @param {string} reason - Reason for transition
 * @param {Object} metadata - Additional metadata
 * @param {Object} transaction - Sequelize transaction
 * @returns {Promise<Object>} Audit log entry
 */
async function createAuditLog(
  projectId,
  fromState,
  toState,
  userId,
  reason,
  metadata = {},
  transaction = null
) {
  try {
    const auditEntry = await db.project_state_history.create(
      {
        project_id: projectId,
        from_state: fromState,
        to_state: toState,
        transitioned_by: userId,
        transition_reason: reason,
        related_file_ids: metadata.file_ids || null,
        related_feedback_id: metadata.feedback_id || null,
        metadata: metadata.additional || null,
        transitioned_at: new Date(),
      },
      { transaction }
    );

    return auditEntry;
  } catch (error) {
    console.error('Error creating audit log:', error);
    throw error;
  }
}

/**
 * Get state history for a project
 * @param {number} projectId - Project ID
 * @param {Object} options - Query options (limit, offset, orderBy)
 * @returns {Promise<Array>} State history entries
 */
async function getStateHistory(projectId, options = {}) {
  try {
    const { limit = 50, offset = 0, orderBy = 'DESC' } = options;

    const history = await db.project_state_history.findAll({
      where: { project_id: projectId },
      include: [
        {
          model: db.users,
          as: 'transitioner',
          attributes: ['user_id', 'email', 'first_name', 'last_name', 'role'],
        },
      ],
      order: [['transitioned_at', orderBy]],
      limit,
      offset,
    });

    return history.map(h => h.toJSON());
  } catch (error) {
    console.error('Error fetching state history:', error);
    throw error;
  }
}

// ============================================================================
// VALID TRANSITIONS
// ============================================================================

/**
 * Get valid next states for a project based on current state and user role
 * @param {string} currentState - Current project state
 * @param {string} userRole - User role
 * @returns {Array<Object>} Valid transitions with descriptions
 */
function getValidTransitions(currentState, userRole) {
  return getValidTransitionsForRole(currentState, userRole);
}

/**
 * Get all possible next states from current state (regardless of role)
 * @param {string} currentState - Current project state
 * @returns {Array<Object>} All possible transitions
 */
function getAllValidTransitions(currentState) {
  const allRoles = Object.values(ROLES);
  const transitionsSet = new Set();
  const transitionsMap = new Map();

  for (const role of allRoles) {
    const roleTransitions = getValidTransitionsForRole(currentState, role);

    for (const transition of roleTransitions) {
      if (!transitionsSet.has(transition.toState)) {
        transitionsSet.add(transition.toState);
        transitionsMap.set(transition.toState, {
          ...transition,
          allowedRoles: [role],
        });
      } else {
        const existing = transitionsMap.get(transition.toState);
        existing.allowedRoles.push(role);
      }
    }
  }

  return Array.from(transitionsMap.values());
}

// ============================================================================
// NOTIFICATION TRIGGERS
// ============================================================================

/**
 * Trigger notifications for state transition
 * @param {Object} project - Project object
 * @param {string} fromState - Previous state
 * @param {string} toState - New state
 * @param {number} transitionedBy - User ID who performed transition
 * @param {Object} auditLog - Audit log entry
 * @returns {Promise<void>}
 */
async function triggerNotifications(project, fromState, toState, transitionedBy, auditLog) {
  try {
    // Import notification service (avoid circular dependency)
    const notificationService = require('./notification.service');

    const stateMetadata = STATE_METADATA[toState];

    // Determine who needs to be notified based on action owner
    const recipientIds = [];

    if (stateMetadata.actionOwner) {
      const owners = Array.isArray(stateMetadata.actionOwner)
        ? stateMetadata.actionOwner
        : [stateMetadata.actionOwner];

      for (const owner of owners) {
        switch (owner) {
          case ROLES.CREATOR:
            if (project.assigned_creator_id) {
              recipientIds.push(project.assigned_creator_id);
            }
            break;
          case ROLES.CLIENT:
            if (project.client_user_id) {
              recipientIds.push(project.client_user_id);
            }
            break;
          case ROLES.EDITOR:
            if (project.assigned_editor_id) {
              recipientIds.push(project.assigned_editor_id);
            }
            break;
          case ROLES.QC:
          case ROLES.ADMIN:
          case ROLES.REVIEWER:
            // Fetch all users with this role
            const roleUsers = await db.users.findAll({
              where: { role: owner, is_active: 1 },
              attributes: ['user_id'],
            });
            recipientIds.push(...roleUsers.map(u => u.user_id));
            break;
        }
      }
    }

    // Remove duplicates and the user who performed the transition
    const uniqueRecipients = [...new Set(recipientIds)].filter(
      id => id !== transitionedBy
    );

    if (uniqueRecipients.length === 0) {
      return; // No one to notify
    }

    // Create notification for each recipient
    await notificationService.createStateTransitionNotification({
      projectId: project.project_id,
      projectName: project.project_name,
      projectCode: project.project_code,
      fromState,
      toState,
      transitionedBy,
      recipientIds: uniqueRecipients,
      reason: auditLog.transition_reason,
    });
  } catch (error) {
    console.error('Error in triggerNotifications:', error);
    // Don't throw - notifications are non-critical
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get state metadata
 * @param {string} state - State name
 * @returns {Object|null} State metadata
 */
function getStateMetadata(state) {
  return STATE_METADATA[state] || null;
}

/**
 * Check if a state is a rejection state
 * @param {string} state - State name
 * @returns {boolean}
 */
function isRejectionState(state) {
  const metadata = STATE_METADATA[state];
  return metadata ? metadata.isRejectionState : false;
}

/**
 * Check if a state requires action
 * @param {string} state - State name
 * @returns {boolean}
 */
function requiresAction(state) {
  const metadata = STATE_METADATA[state];
  return metadata ? metadata.requiresAction : false;
}

/**
 * Get projects requiring action for a user
 * @param {number} userId - User ID
 * @param {string} userRole - User role
 * @returns {Promise<Array>} Projects requiring action
 */
async function getProjectsRequiringAction(userId, userRole) {
  try {
    // Build where clause based on role
    let whereClause = {};

    switch (userRole) {
      case ROLES.CREATOR:
        whereClause.assigned_creator_id = userId;
        break;
      case ROLES.CLIENT:
        whereClause.client_user_id = userId;
        break;
      case ROLES.EDITOR:
        whereClause.assigned_editor_id = userId;
        break;
      case ROLES.QC:
      case ROLES.ADMIN:
      case ROLES.REVIEWER:
        // For admin roles, no user-specific filter
        break;
      default:
        return [];
    }

    // Get all states that require action
    const actionStates = Object.entries(STATE_METADATA)
      .filter(([_, metadata]) => metadata.requiresAction)
      .filter(([_, metadata]) => {
        if (!metadata.actionOwner) return false;
        const owners = Array.isArray(metadata.actionOwner)
          ? metadata.actionOwner
          : [metadata.actionOwner];
        return owners.includes(userRole);
      })
      .map(([state]) => state);

    if (actionStates.length === 0) {
      return [];
    }

    whereClause.current_state = { [db.Sequelize.Op.in]: actionStates };

    const projects = await db.projects.findAll({
      where: whereClause,
      include: [
        {
          model: db.users,
          as: 'client',
          attributes: ['user_id', 'email', 'first_name', 'last_name'],
        },
        {
          model: db.users,
          as: 'creator',
          attributes: ['user_id', 'email', 'first_name', 'last_name'],
        },
        {
          model: db.users,
          as: 'editor',
          attributes: ['user_id', 'email', 'first_name', 'last_name'],
        },
      ],
      order: [['state_changed_at', 'ASC']],
    });

    return projects.map(p => p.toJSON());
  } catch (error) {
    console.error('Error fetching projects requiring action:', error);
    throw error;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Core functions
  canTransition,
  transitionState,
  bulkTransitionState,

  // Audit logging
  createAuditLog,
  getStateHistory,

  // Valid transitions
  getValidTransitions,
  getAllValidTransitions,

  // Utilities
  getStateMetadata,
  isRejectionState,
  requiresAction,
  getProjectsRequiringAction,

  // Trigger notifications
  triggerNotifications,
};
