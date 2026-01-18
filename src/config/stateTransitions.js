/**
 * State Transitions Configuration
 *
 * Defines the 18-state workflow for post-shoot project management.
 * Includes state constants, transition rules, and permission requirements.
 */

// ============================================================================
// STATE CONSTANTS
// ============================================================================

const PROJECT_STATES = {
  // Initial Upload Phase
  RAW_UPLOADED: 'RAW_UPLOADED',

  // Technical QC Phase
  RAW_TECH_QC_PENDING: 'RAW_TECH_QC_PENDING',
  RAW_TECH_QC_APPROVED: 'RAW_TECH_QC_APPROVED',
  RAW_TECH_QC_REJECTED: 'RAW_TECH_QC_REJECTED',

  // Coverage Review Phase
  COVERAGE_REVIEW_PENDING: 'COVERAGE_REVIEW_PENDING',
  COVERAGE_REJECTED: 'COVERAGE_REJECTED',

  // Edit Phase
  EDIT_APPROVAL_PENDING: 'EDIT_APPROVAL_PENDING',
  EDIT_IN_PROGRESS: 'EDIT_IN_PROGRESS',
  INTERNAL_EDIT_REVIEW_PENDING: 'INTERNAL_EDIT_REVIEW_PENDING',

  // Client Review Phase
  CLIENT_PREVIEW_READY: 'CLIENT_PREVIEW_READY',
  CLIENT_FEEDBACK_RECEIVED: 'CLIENT_FEEDBACK_RECEIVED',
  FEEDBACK_INTERNAL_REVIEW: 'FEEDBACK_INTERNAL_REVIEW',

  // Revision Phase
  REVISION_IN_PROGRESS: 'REVISION_IN_PROGRESS',
  REVISION_QC_PENDING: 'REVISION_QC_PENDING',

  // Final Delivery Phase
  FINAL_EXPORT_PENDING: 'FINAL_EXPORT_PENDING',
  READY_FOR_DELIVERY: 'READY_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',

  // Terminal State
  PROJECT_CLOSED: 'PROJECT_CLOSED',
};

// ============================================================================
// ROLE CONSTANTS
// ============================================================================

const ROLES = {
  SYSTEM: 'SYSTEM',           // Automated system transitions
  CREATOR: 'CREATOR',         // Content creators (photographers/videographers)
  CLIENT: 'CLIENT',           // Project clients
  EDITOR: 'EDITOR',           // Video/photo editors
  QC: 'QC',                   // Quality control team
  ADMIN: 'ADMIN',             // Platform administrators
  REVIEWER: 'REVIEWER',       // Coverage reviewers
};

// ============================================================================
// TRANSITION MAP
// ============================================================================

/**
 * Defines allowed state transitions with permission requirements
 * Structure: { fromState: { toState: { roles: [], requiresReason: boolean } } }
 */
const STATE_TRANSITIONS = {
  // RAW_UPLOADED can transition to QC pending (system auto-transition)
  [PROJECT_STATES.RAW_UPLOADED]: {
    [PROJECT_STATES.RAW_TECH_QC_PENDING]: {
      roles: [ROLES.SYSTEM, ROLES.ADMIN],
      requiresReason: false,
      description: 'Upload completed, ready for technical QC',
    },
  },

  // RAW_TECH_QC_PENDING can be approved or rejected by QC/Admin
  [PROJECT_STATES.RAW_TECH_QC_PENDING]: {
    [PROJECT_STATES.RAW_TECH_QC_APPROVED]: {
      roles: [ROLES.QC, ROLES.ADMIN],
      requiresReason: false,
      description: 'Technical QC passed',
    },
    [PROJECT_STATES.RAW_TECH_QC_REJECTED]: {
      roles: [ROLES.QC, ROLES.ADMIN],
      requiresReason: true,
      description: 'Technical QC failed - requires re-upload',
    },
  },

  // RAW_TECH_QC_REJECTED loops back to RAW_UPLOADED (creator re-uploads)
  [PROJECT_STATES.RAW_TECH_QC_REJECTED]: {
    [PROJECT_STATES.RAW_UPLOADED]: {
      roles: [ROLES.CREATOR, ROLES.SYSTEM, ROLES.ADMIN],
      requiresReason: false,
      description: 'Creator re-uploaded corrected files',
    },
  },

  // RAW_TECH_QC_APPROVED moves to coverage review
  [PROJECT_STATES.RAW_TECH_QC_APPROVED]: {
    [PROJECT_STATES.COVERAGE_REVIEW_PENDING]: {
      roles: [ROLES.SYSTEM, ROLES.ADMIN],
      requiresReason: false,
      description: 'Ready for coverage review',
    },
  },

  // COVERAGE_REVIEW_PENDING can be approved or rejected
  [PROJECT_STATES.COVERAGE_REVIEW_PENDING]: {
    [PROJECT_STATES.EDIT_APPROVAL_PENDING]: {
      roles: [ROLES.REVIEWER, ROLES.ADMIN],
      requiresReason: false,
      description: 'Coverage approved, ready for edit assignment',
    },
    [PROJECT_STATES.COVERAGE_REJECTED]: {
      roles: [ROLES.REVIEWER, ROLES.ADMIN],
      requiresReason: true,
      description: 'Coverage insufficient - escalation required',
    },
  },

  // COVERAGE_REJECTED requires admin intervention (terminal rejection state)
  [PROJECT_STATES.COVERAGE_REJECTED]: {
    [PROJECT_STATES.COVERAGE_REVIEW_PENDING]: {
      roles: [ROLES.ADMIN],
      requiresReason: true,
      description: 'Admin override - retry coverage review',
    },
  },

  // EDIT_APPROVAL_PENDING transitions when editor is assigned
  [PROJECT_STATES.EDIT_APPROVAL_PENDING]: {
    [PROJECT_STATES.EDIT_IN_PROGRESS]: {
      roles: [ROLES.ADMIN, ROLES.EDITOR],
      requiresReason: false,
      description: 'Editor assigned and started work',
    },
  },

  // EDIT_IN_PROGRESS transitions when draft is uploaded
  [PROJECT_STATES.EDIT_IN_PROGRESS]: {
    [PROJECT_STATES.INTERNAL_EDIT_REVIEW_PENDING]: {
      roles: [ROLES.EDITOR, ROLES.ADMIN],
      requiresReason: false,
      description: 'Draft uploaded for internal review',
    },
  },

  // INTERNAL_EDIT_REVIEW_PENDING can be approved or sent back for revision
  [PROJECT_STATES.INTERNAL_EDIT_REVIEW_PENDING]: {
    [PROJECT_STATES.CLIENT_PREVIEW_READY]: {
      roles: [ROLES.QC, ROLES.ADMIN],
      requiresReason: false,
      description: 'Internal review passed - ready for client',
    },
    [PROJECT_STATES.EDIT_IN_PROGRESS]: {
      roles: [ROLES.QC, ROLES.ADMIN],
      requiresReason: true,
      description: 'Internal review failed - needs revision',
    },
  },

  // CLIENT_PREVIEW_READY transitions when client submits feedback
  [PROJECT_STATES.CLIENT_PREVIEW_READY]: {
    [PROJECT_STATES.CLIENT_FEEDBACK_RECEIVED]: {
      roles: [ROLES.CLIENT, ROLES.ADMIN, ROLES.SYSTEM],
      requiresReason: false,
      description: 'Client submitted feedback',
    },
  },

  // CLIENT_FEEDBACK_RECEIVED moves to internal review
  [PROJECT_STATES.CLIENT_FEEDBACK_RECEIVED]: {
    [PROJECT_STATES.FEEDBACK_INTERNAL_REVIEW]: {
      roles: [ROLES.SYSTEM, ROLES.ADMIN],
      requiresReason: false,
      description: 'Feedback ready for internal review',
    },
  },

  // FEEDBACK_INTERNAL_REVIEW determines if revision is needed
  [PROJECT_STATES.FEEDBACK_INTERNAL_REVIEW]: {
    [PROJECT_STATES.REVISION_IN_PROGRESS]: {
      roles: [ROLES.ADMIN, ROLES.QC],
      requiresReason: true,
      description: 'Client requested changes - revision needed',
    },
    [PROJECT_STATES.FINAL_EXPORT_PENDING]: {
      roles: [ROLES.ADMIN, ROLES.QC],
      requiresReason: false,
      description: 'No changes needed - proceed to export',
    },
  },

  // REVISION_IN_PROGRESS transitions when revision is uploaded
  [PROJECT_STATES.REVISION_IN_PROGRESS]: {
    [PROJECT_STATES.REVISION_QC_PENDING]: {
      roles: [ROLES.EDITOR, ROLES.ADMIN],
      requiresReason: false,
      description: 'Revision uploaded for QC',
    },
  },

  // REVISION_QC_PENDING can be approved or rejected
  [PROJECT_STATES.REVISION_QC_PENDING]: {
    [PROJECT_STATES.FINAL_EXPORT_PENDING]: {
      roles: [ROLES.QC, ROLES.ADMIN],
      requiresReason: false,
      description: 'Revision approved - ready for export',
    },
    [PROJECT_STATES.REVISION_IN_PROGRESS]: {
      roles: [ROLES.QC, ROLES.ADMIN],
      requiresReason: true,
      description: 'Revision rejected - needs more work',
    },
  },

  // FINAL_EXPORT_PENDING transitions when export is ready
  [PROJECT_STATES.FINAL_EXPORT_PENDING]: {
    [PROJECT_STATES.READY_FOR_DELIVERY]: {
      roles: [ROLES.EDITOR, ROLES.ADMIN, ROLES.SYSTEM],
      requiresReason: false,
      description: 'Final export completed',
    },
  },

  // READY_FOR_DELIVERY transitions when client receives files
  [PROJECT_STATES.READY_FOR_DELIVERY]: {
    [PROJECT_STATES.DELIVERED]: {
      roles: [ROLES.ADMIN, ROLES.SYSTEM],
      requiresReason: false,
      description: 'Files delivered to client',
    },
  },

  // DELIVERED transitions to closed when client confirms satisfaction
  [PROJECT_STATES.DELIVERED]: {
    [PROJECT_STATES.PROJECT_CLOSED]: {
      roles: [ROLES.ADMIN, ROLES.CLIENT],
      requiresReason: false,
      description: 'Project completed and closed',
    },
  },

  // PROJECT_CLOSED is terminal - no transitions allowed
  [PROJECT_STATES.PROJECT_CLOSED]: {},
};

// ============================================================================
// REJECTION LOOPS
// ============================================================================

/**
 * Defines states that represent rejection loops and their recovery paths
 */
const REJECTION_LOOPS = {
  [PROJECT_STATES.RAW_TECH_QC_REJECTED]: {
    recoveryState: PROJECT_STATES.RAW_UPLOADED,
    requiredAction: 'Creator must re-upload corrected files',
    canBeOverridden: false,
  },
  [PROJECT_STATES.COVERAGE_REJECTED]: {
    recoveryState: PROJECT_STATES.COVERAGE_REVIEW_PENDING,
    requiredAction: 'Admin must review and determine resolution',
    canBeOverridden: true,
  },
};

// ============================================================================
// STATE METADATA
// ============================================================================

/**
 * Additional metadata for each state
 */
const STATE_METADATA = {
  [PROJECT_STATES.RAW_UPLOADED]: {
    displayName: 'RAW Files Uploaded',
    category: 'upload',
    isRejectionState: false,
    requiresAction: false,
    actionOwner: null,
  },
  [PROJECT_STATES.RAW_TECH_QC_PENDING]: {
    displayName: 'Technical QC Pending',
    category: 'qc',
    isRejectionState: false,
    requiresAction: true,
    actionOwner: [ROLES.QC, ROLES.ADMIN],
  },
  [PROJECT_STATES.RAW_TECH_QC_APPROVED]: {
    displayName: 'Technical QC Approved',
    category: 'qc',
    isRejectionState: false,
    requiresAction: false,
    actionOwner: null,
  },
  [PROJECT_STATES.RAW_TECH_QC_REJECTED]: {
    displayName: 'Technical QC Rejected',
    category: 'qc',
    isRejectionState: true,
    requiresAction: true,
    actionOwner: [ROLES.CREATOR],
  },
  [PROJECT_STATES.COVERAGE_REVIEW_PENDING]: {
    displayName: 'Coverage Review Pending',
    category: 'review',
    isRejectionState: false,
    requiresAction: true,
    actionOwner: [ROLES.REVIEWER, ROLES.ADMIN],
  },
  [PROJECT_STATES.COVERAGE_REJECTED]: {
    displayName: 'Coverage Rejected',
    category: 'review',
    isRejectionState: true,
    requiresAction: true,
    actionOwner: [ROLES.ADMIN],
  },
  [PROJECT_STATES.EDIT_APPROVAL_PENDING]: {
    displayName: 'Edit Approval Pending',
    category: 'edit',
    isRejectionState: false,
    requiresAction: true,
    actionOwner: [ROLES.ADMIN],
  },
  [PROJECT_STATES.EDIT_IN_PROGRESS]: {
    displayName: 'Edit In Progress',
    category: 'edit',
    isRejectionState: false,
    requiresAction: true,
    actionOwner: [ROLES.EDITOR],
  },
  [PROJECT_STATES.INTERNAL_EDIT_REVIEW_PENDING]: {
    displayName: 'Internal Edit Review',
    category: 'review',
    isRejectionState: false,
    requiresAction: true,
    actionOwner: [ROLES.QC, ROLES.ADMIN],
  },
  [PROJECT_STATES.CLIENT_PREVIEW_READY]: {
    displayName: 'Client Preview Ready',
    category: 'client',
    isRejectionState: false,
    requiresAction: true,
    actionOwner: [ROLES.CLIENT],
  },
  [PROJECT_STATES.CLIENT_FEEDBACK_RECEIVED]: {
    displayName: 'Client Feedback Received',
    category: 'client',
    isRejectionState: false,
    requiresAction: false,
    actionOwner: null,
  },
  [PROJECT_STATES.FEEDBACK_INTERNAL_REVIEW]: {
    displayName: 'Feedback Internal Review',
    category: 'review',
    isRejectionState: false,
    requiresAction: true,
    actionOwner: [ROLES.ADMIN, ROLES.QC],
  },
  [PROJECT_STATES.REVISION_IN_PROGRESS]: {
    displayName: 'Revision In Progress',
    category: 'revision',
    isRejectionState: false,
    requiresAction: true,
    actionOwner: [ROLES.EDITOR],
  },
  [PROJECT_STATES.REVISION_QC_PENDING]: {
    displayName: 'Revision QC Pending',
    category: 'qc',
    isRejectionState: false,
    requiresAction: true,
    actionOwner: [ROLES.QC, ROLES.ADMIN],
  },
  [PROJECT_STATES.FINAL_EXPORT_PENDING]: {
    displayName: 'Final Export Pending',
    category: 'delivery',
    isRejectionState: false,
    requiresAction: true,
    actionOwner: [ROLES.EDITOR, ROLES.ADMIN],
  },
  [PROJECT_STATES.READY_FOR_DELIVERY]: {
    displayName: 'Ready for Delivery',
    category: 'delivery',
    isRejectionState: false,
    requiresAction: true,
    actionOwner: [ROLES.ADMIN],
  },
  [PROJECT_STATES.DELIVERED]: {
    displayName: 'Delivered',
    category: 'delivery',
    isRejectionState: false,
    requiresAction: true,
    actionOwner: [ROLES.CLIENT, ROLES.ADMIN],
  },
  [PROJECT_STATES.PROJECT_CLOSED]: {
    displayName: 'Project Closed',
    category: 'complete',
    isRejectionState: false,
    requiresAction: false,
    actionOwner: null,
  },
};

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Check if a state transition is valid
 * @param {string} fromState - Current state
 * @param {string} toState - Desired state
 * @returns {boolean}
 */
function isValidTransition(fromState, toState) {
  if (!STATE_TRANSITIONS[fromState]) {
    return false;
  }
  return toState in STATE_TRANSITIONS[fromState];
}

/**
 * Check if a role is allowed to perform a transition
 * @param {string} fromState - Current state
 * @param {string} toState - Desired state
 * @param {string} role - User role
 * @returns {boolean}
 */
function isRoleAllowed(fromState, toState, role) {
  if (!isValidTransition(fromState, toState)) {
    return false;
  }

  const transition = STATE_TRANSITIONS[fromState][toState];
  return transition.roles.includes(role);
}

/**
 * Check if a transition requires a reason
 * @param {string} fromState - Current state
 * @param {string} toState - Desired state
 * @returns {boolean}
 */
function requiresReason(fromState, toState) {
  if (!isValidTransition(fromState, toState)) {
    return false;
  }

  const transition = STATE_TRANSITIONS[fromState][toState];
  return transition.requiresReason;
}

/**
 * Get all valid transitions from a state
 * @param {string} fromState - Current state
 * @returns {Array<string>}
 */
function getValidTransitions(fromState) {
  if (!STATE_TRANSITIONS[fromState]) {
    return [];
  }
  return Object.keys(STATE_TRANSITIONS[fromState]);
}

/**
 * Get valid transitions for a specific role
 * @param {string} fromState - Current state
 * @param {string} role - User role
 * @returns {Array<Object>}
 */
function getValidTransitionsForRole(fromState, role) {
  const transitions = STATE_TRANSITIONS[fromState] || {};

  return Object.entries(transitions)
    .filter(([_, config]) => config.roles.includes(role))
    .map(([toState, config]) => ({
      toState,
      requiresReason: config.requiresReason,
      description: config.description,
    }));
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  PROJECT_STATES,
  ROLES,
  STATE_TRANSITIONS,
  REJECTION_LOOPS,
  STATE_METADATA,

  // Helper functions
  isValidTransition,
  isRoleAllowed,
  requiresReason,
  getValidTransitions,
  getValidTransitionsForRole,
};
