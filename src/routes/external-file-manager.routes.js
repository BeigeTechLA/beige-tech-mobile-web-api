const router = require('express').Router();
const externalFileManagerController = require('../controllers/external-file-manager.controller');
const { authenticate } = require('../middleware/auth');
const { requireAnyPermission } = require('../middleware/permission.middleware');

const fileManagerView = requireAnyPermission([
  'admin_file_manager.view',
  'sales_rep_file_manager.view',
  'sales_admin_file_manager.view',
  'crew_file_manager.view',
  'client_file_manager.view',
  'client_find_yourself.view'
], { allowRoles: ['sales_rep', 'sales_admin', 'creative', 'client'] });
const fileManagerCreate = requireAnyPermission([
  'admin_file_manager.create',
  'sales_rep_file_manager.create',
  'sales_admin_file_manager.create'
], { allowRoles: ['sales_rep', 'sales_admin'] });
const fileManagerDelete = requireAnyPermission([
  'admin_file_manager.delete'
]);
const shootOrFileManagerView = requireAnyPermission([
  'admin_shoots.view',
  'admin_meetings.view',
  'admin_file_manager.view',
  'sales_rep_shoots.view',
  'sales_rep_file_manager.view',
  'sales_rep_meetings.view',
  'sales_admin_shoots.view',
  'sales_admin_file_manager.view',
  'sales_admin_meetings.view',
  'crew_request_shoots.view',
  'crew_file_manager.view',
  'client_file_manager.view',
  'client_find_yourself.view',
  'client_shoots.view'
], { allowRoles: ['sales_rep', 'sales_admin', 'creative', 'client'] });

router.get('/workspaces', authenticate, fileManagerView, externalFileManagerController.listWorkspaces);
router.get('/common-events', authenticate, fileManagerView, externalFileManagerController.listCommonEvents);
router.post('/common-events', authenticate, fileManagerCreate, externalFileManagerController.createCommonEvent);
router.post('/common-events/:eventExternalId/creator-folder', authenticate, fileManagerCreate, externalFileManagerController.createCreatorEventFolder);
router.post('/face-scan/search', authenticate, fileManagerView, externalFileManagerController.searchFaceMatches);
router.get('/face-scan/index-status/:externalId', authenticate, fileManagerView, externalFileManagerController.getFaceScanIndexStatus);
router.post('/face-scan/reindex', authenticate, fileManagerCreate, externalFileManagerController.reindexFaceEmbeddings);
router.post('/workspace', authenticate, fileManagerCreate, externalFileManagerController.createWorkspace);
router.get('/workspace/:bookingId', authenticate, shootOrFileManagerView, externalFileManagerController.getWorkspace);
router.get('/workspace/:bookingId/files', authenticate, shootOrFileManagerView, externalFileManagerController.getWorkspaceFiles);
router.post('/folder', authenticate, fileManagerCreate, externalFileManagerController.createFolder);
router.post('/upload-policy', authenticate, fileManagerCreate, externalFileManagerController.getUploadPolicy);
router.post('/upload-policies/batch', authenticate, fileManagerCreate, externalFileManagerController.getUploadPoliciesBatch);
router.post('/file-uploaded', authenticate, fileManagerCreate, externalFileManagerController.notifyFileUploaded);
router.post('/files-uploaded/batch', authenticate, fileManagerCreate, externalFileManagerController.notifyFilesUploadedBatch);
router.post('/file-view-url', authenticate, fileManagerView, externalFileManagerController.getFileViewUrl);
router.post('/file-download-url', authenticate, fileManagerView, externalFileManagerController.getFileDownloadUrl);
router.post('/folder-download-url', authenticate, fileManagerView, externalFileManagerController.getFolderDownloadUrl);
router.post('/delete', authenticate, fileManagerDelete, externalFileManagerController.deleteEntry);
router.post('/share', authenticate, fileManagerCreate, externalFileManagerController.createShare);
router.get('/share', authenticate, fileManagerView, externalFileManagerController.listShares);
router.get('/share/access-logs', authenticate, fileManagerView, externalFileManagerController.listShareAccessLogs);
router.delete('/share', authenticate, fileManagerDelete, externalFileManagerController.revokeShare);
router.post('/share/request-otp', externalFileManagerController.requestShareOtp);
router.post('/share/verify-otp', externalFileManagerController.verifyShareOtp);
router.get('/share/:shareToken/content', externalFileManagerController.getSharedContent);
router.get('/share/:shareToken/view-url', externalFileManagerController.getSharedViewUrl);
router.get('/share/:shareToken/download-url', externalFileManagerController.getSharedDownloadUrl);

module.exports = router;
