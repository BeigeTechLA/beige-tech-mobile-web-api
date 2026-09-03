const router = require('express').Router();
const externalFileManagerController = require('../controllers/external-file-manager.controller');
const { authenticate } = require('../middleware/auth');
const { requireAnyPermission } = require('../middleware/permission.middleware');

const fileManagerDelete = requireAnyPermission([
  'admin_file_manager.delete',
  'sales_rep_file_manager.delete',
  'sales_admin_file_manager.delete',
  'creative_partner_file_manager.delete',
  'client_file_manager.delete'
], { allowRoles: ['sales_rep', 'sales_admin', 'creative', 'client'] });

router.post('/folders/:folderId/deletion-request', authenticate, fileManagerDelete, externalFileManagerController.handleFolderDeletionRequest);

module.exports = router;
