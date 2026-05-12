const express = require('express');
const router = express.Router();

const studioManagementController = require('../controllers/studio-management.controller');
const { authenticateAdmin } = require('../middleware/auth');

router.post('/media/upload', authenticateAdmin, studioManagementController.uploadStudioMedia);
router.post('/', authenticateAdmin, studioManagementController.createStudio);
router.get('/', authenticateAdmin, studioManagementController.getStudios);
router.get('/dashboard', authenticateAdmin, studioManagementController.getStudioDashboard);
router.get('/requests', authenticateAdmin, studioManagementController.getStudioRequests);
router.get('/requests/:studioBookingId', authenticateAdmin, studioManagementController.getStudioRequestById);
router.patch('/requests/:studioBookingId/status', authenticateAdmin, studioManagementController.updateStudioRequestStatus);
router.get('/:studioId', authenticateAdmin, studioManagementController.getStudioById);
router.put('/:studioId', authenticateAdmin, studioManagementController.updateStudio);
router.post('/:studioId/reviews', authenticateAdmin, studioManagementController.createStudioReview);

module.exports = router;
