const router = require('express').Router();
const externalFileManagerController = require('../controllers/external-file-manager.controller');
const { authenticate } = require('../middleware/auth');

router.get('/workspaces', authenticate, externalFileManagerController.listWorkspaces);
router.get('/common-events', authenticate, externalFileManagerController.listCommonEvents);
router.post('/common-events', authenticate, externalFileManagerController.createCommonEvent);
router.post('/common-events/:eventExternalId/creator-folder', authenticate, externalFileManagerController.createCreatorEventFolder);
router.post('/face-scan/search', authenticate, externalFileManagerController.searchFaceMatches);
router.post('/face-scan/reindex', authenticate, externalFileManagerController.reindexFaceEmbeddings);
router.post('/workspace', authenticate, externalFileManagerController.createWorkspace);
router.get('/workspace/:bookingId', authenticate, externalFileManagerController.getWorkspace);
router.get('/workspace/:bookingId/files', authenticate, externalFileManagerController.getWorkspaceFiles);
router.post('/folder', authenticate, externalFileManagerController.createFolder);
router.post('/upload-policy', authenticate, externalFileManagerController.getUploadPolicy);
router.post('/file-uploaded', authenticate, externalFileManagerController.notifyFileUploaded);
router.post('/file-view-url', authenticate, externalFileManagerController.getFileViewUrl);
router.post('/file-download-url', authenticate, externalFileManagerController.getFileDownloadUrl);
router.post('/folder-download-url', authenticate, externalFileManagerController.getFolderDownloadUrl);
router.post('/delete', authenticate, externalFileManagerController.deleteEntry);

module.exports = router;
