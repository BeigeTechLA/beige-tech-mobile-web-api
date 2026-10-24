const router = require('express').Router();
const controller = require('../controllers/external-file-manager-workflow.controller');
const { authenticate } = require('../middleware/auth');
const { requireAnyPermission } = require('../middleware/permission.middleware');

const workflowView = requireAnyPermission([
  'admin_file_manager.view',
  'sales_rep_file_manager.view',
  'sales_admin_file_manager.view',
  'creative_partner_file_manager.view',
], { allowRoles: ['sales_rep', 'sales_admin', 'creative'] });

const workflowManage = requireAnyPermission([
  'admin_file_manager.create',
  'sales_rep_file_manager.create',
  'sales_admin_file_manager.create',
  'creative_partner_file_manager.create',
], { allowRoles: ['sales_rep', 'sales_admin', 'creative'] });

router.get('/workflow', authenticate, workflowView, controller.listWorkflows);
router.get('/workflow/storage-usage', authenticate, workflowView, controller.getStorageUsage);
router.get('/workflow/:bookingId', authenticate, workflowView, controller.getWorkflow);
router.put('/workflow/:bookingId/requirements', authenticate, workflowManage, controller.updateRequirements);
router.post('/workflow/:bookingId/start-editing', authenticate, workflowManage, controller.startEditing);
router.get('/workflow/:bookingId/progress', authenticate, workflowView, controller.getProgress);
router.post('/workflow/:bookingId/submit-approval', authenticate, workflowManage, controller.submitApproval);
router.post('/workflow/:bookingId/submit-revision', authenticate, workflowManage, controller.submitRevision);
router.post('/workflow/:bookingId/complete', authenticate, workflowManage, controller.complete);
router.get('/workflow/:bookingId/timeline', authenticate, workflowView, controller.getTimeline);
router.get('/workflow/:bookingId/next-action', authenticate, workflowView, controller.getNextAction);
router.get('/workflow/:bookingId/before-after', authenticate, workflowView, controller.getBeforeAfter);

module.exports = router;
