/**
 * Projects Routes
 *
 * API routes for CMS project management, state transitions,
 * file uploads, feedback, and assignments.
 */

const router = require('express').Router();
const projectsController = require('../controllers/projects.controller');
const filesController = require('../controllers/project-files.controller');
const { authenticate } = require('../middleware/auth');

// ============================================================================
// ROLE-BASED MIDDLEWARE
// ============================================================================

/**
 * Middleware to check if user has required role
 * @param {Array<string>} allowedRoles - Array of allowed role strings
 */
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    const userRole = mapUserTypeToRole(req.user.userTypeId);

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
      });
    }

    next();
  };
};

/**
 * Map user_type to role string
 */
function mapUserTypeToRole(userType) {
  const roleMap = {
    1: 'CLIENT',
    2: 'CREATOR',
    3: 'EDITOR',
    4: 'QC',
    5: 'ADMIN',
    6: 'REVIEWER',
  };
  return roleMap[userType] || 'CLIENT';
}

// ============================================================================
// PROJECT CRUD ROUTES
// ============================================================================

/**
 * @route   POST /v1/projects/create
 * @desc    Create a new project from booking
 * @access  Authenticated
 * @body    { booking_id, project_name?, client_user_id?, assigned_creator_id?, deadlines... }
 */
router.post('/create', authenticate, projectsController.createProject);

/**
 * @route   GET /v1/projects/user
 * @desc    Get projects for current user (filtered by role)
 * @access  Authenticated
 * @query   page, limit, status, state, search, sort_by, sort_order, date_from, date_to
 */
router.get('/user', authenticate, projectsController.getProjectsByUser);

/**
 * @route   GET /v1/projects/requiring-action
 * @desc    Get projects requiring action for current user
 * @access  Authenticated
 */
router.get('/requiring-action', authenticate, projectsController.getProjectsRequiringAction);

/**
 * @route   GET /v1/projects/:id
 * @desc    Get project by ID
 * @access  Authenticated (with project access)
 */
router.get('/:id', authenticate, projectsController.getProject);

/**
 * @route   PUT /v1/projects/:id
 * @desc    Update project details
 * @access  Authenticated (admin or project owner)
 * @body    { project_name?, deadlines?, project_notes?, client_requirements? }
 */
router.put('/:id', authenticate, projectsController.updateProject);

// ============================================================================
// STATE MANAGEMENT ROUTES
// ============================================================================

/**
 * @route   POST /v1/projects/:id/transition
 * @desc    Transition project to a new state
 * @access  Authenticated (role-based permissions via state machine)
 * @body    { to_state, reason?, metadata? }
 */
router.post('/:id/transition', authenticate, projectsController.transitionState);

/**
 * @route   GET /v1/projects/:id/history
 * @desc    Get project state history (audit trail)
 * @access  Authenticated (with project access)
 * @query   limit, offset
 */
router.get('/:id/history', authenticate, projectsController.getStateHistory);

/**
 * @route   GET /v1/projects/:id/valid-transitions
 * @desc    Get valid next states for current user
 * @access  Authenticated (with project access)
 */
router.get('/:id/valid-transitions', authenticate, projectsController.getValidTransitions);

// ============================================================================
// FEEDBACK ROUTES
// ============================================================================

/**
 * @route   POST /v1/projects/:id/feedback
 * @desc    Submit feedback for a project
 * @access  Authenticated (with project access)
 * @body    { feedback_type, feedback_text, related_file_id?, video_timestamps?, priority?, attachments? }
 */
router.post('/:id/feedback', authenticate, projectsController.submitFeedback);

/**
 * @route   GET /v1/projects/:id/feedback
 * @desc    Get all feedback for a project
 * @access  Authenticated (with project access)
 * @query   feedback_type?, status?, limit, offset
 */
router.get('/:id/feedback', authenticate, projectsController.getProjectFeedback);

// ============================================================================
// ASSIGNMENT ROUTES
// ============================================================================

/**
 * @route   POST /v1/projects/:id/assign
 * @desc    Assign a user to the project
 * @access  Authenticated (admin only)
 * @body    { role_type, assigned_user_id, assignment_notes?, priority?, deadline?, estimated_hours?, agreed_rate?, rate_type? }
 */
router.post('/:id/assign', authenticate, requireRole(['ADMIN']), projectsController.assignUser);

/**
 * @route   GET /v1/projects/:id/assignments
 * @desc    Get all assignments for a project
 * @access  Authenticated (with project access)
 */
router.get('/:id/assignments', authenticate, projectsController.getProjectAssignments);

/**
 * @route   PUT /v1/projects/assignments/:assignmentId
 * @desc    Update assignment status (accept/decline/complete)
 * @access  Authenticated (assigned user only)
 * @body    { status?, response_notes?, actual_hours? }
 */
router.put('/assignments/:assignmentId', authenticate, projectsController.updateAssignment);

// ============================================================================
// FILE UPLOAD ROUTES - CHUNKED UPLOAD
// ============================================================================

/**
 * @route   POST /v1/projects/:id/files/initiate-upload
 * @desc    Initiate a chunked file upload session
 * @access  Authenticated (with project access)
 * @body    { file_name, file_size, file_category, chunk_size?, mime_type? }
 * @returns { session_id, file_id, chunk_size, total_chunks }
 */
router.post('/:id/files/initiate-upload', authenticate, filesController.initiateUpload);

/**
 * @route   POST /v1/projects/:id/files/upload-chunk
 * @desc    Upload a single chunk
 * @access  Authenticated (session owner)
 * @body    { session_id, chunk_index, chunk_data (base64), chunk_hash? }
 */
router.post('/:id/files/upload-chunk', authenticate, filesController.uploadChunk);

/**
 * @route   POST /v1/projects/:id/files/complete-upload
 * @desc    Complete chunked upload and merge files
 * @access  Authenticated (session owner)
 * @body    { session_id, file_hash? }
 */
router.post('/:id/files/complete-upload', authenticate, filesController.completeUpload);

/**
 * @route   POST /v1/projects/:id/files/cancel-upload
 * @desc    Cancel upload and clean up temp files
 * @access  Authenticated (session owner)
 * @body    { session_id }
 */
router.post('/:id/files/cancel-upload', authenticate, filesController.cancelUpload);

// ============================================================================
// FILE MANAGEMENT ROUTES
// ============================================================================

/**
 * @route   GET /v1/projects/:id/files
 * @desc    Get all files for a project
 * @access  Authenticated (with project access)
 * @query   file_category?, upload_status?, validation_status?, limit, offset
 */
router.get('/:id/files', authenticate, filesController.getProjectFiles);

/**
 * @route   GET /v1/projects/files/:fileId
 * @desc    Get file details by ID
 * @access  Authenticated (with project access)
 */
router.get('/files/:fileId', authenticate, filesController.getFileDetails);

/**
 * @route   GET /v1/projects/files/:fileId/download-url
 * @desc    Generate presigned download URL for a file
 * @access  Authenticated (with project access)
 * @query   expires_in? (seconds, default 3600)
 */
router.get('/files/:fileId/download-url', authenticate, filesController.getDownloadUrl);

/**
 * @route   DELETE /v1/projects/files/:fileId
 * @desc    Soft delete a file
 * @access  Authenticated (admin or file uploader)
 */
router.delete('/files/:fileId', authenticate, filesController.deleteFile);

module.exports = router;
