const express = require('express');
const router = express.Router();

const client = require('../controllers/client.controller');
const { optionalAuth } = require('../middleware/auth');

router.get('/get-dashboard-summary', optionalAuth, client.getClientDashboardSummary);
router.get('/get-shoots-count-by-category', optionalAuth, client.getShootByCategoryForUser);
router.get('/get-shoot-status', optionalAuth, client.getShootStatusForUser);
router.get('/get-my-shoots', optionalAuth, client.getAllProjectDetailsForUser);
router.get('/get-project/:project_id', optionalAuth, client.getProjectDetailsForUser);
router.get('/get-recent-activity', optionalAuth, client.getRecentActivityForUser);
router.post('/submit-project-form',optionalAuth, client.submitProjectForm);
router.get('/get-project-form-submission', optionalAuth, client.getPendingProjectForms);
router.post('/submit-project-form-guest', client.submitProjectFormGuest);

module.exports = router;