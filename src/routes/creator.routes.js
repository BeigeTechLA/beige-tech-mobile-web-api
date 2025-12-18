console.log('✅ creator.routes.js loaded');

const express = require('express');
const router = express.Router();

const creator = require('../controllers/creator.contoller');

router.post('/dashboard-count', creator.getDashboardCounts);
router.post('/pending-projects', creator.getPendingRequests);
router.post('/confirmed-projects', creator.getConfirmedRequests);
router.post('/declined-projects', creator.getDeclinedRequests);
router.post('/completed-projects', creator.getCompletedProjectsByCrew);
router.post('/project-details', creator.getProjectDetails);
router.post('/accept-project', creator.updateRequestStatus);
router.post('/upcoming-accepted-project', creator.getAcceptedAndUpcomingProjects);
router.post('/availability', creator.getCrewAvailability);
router.post('/add-availability', creator.setCrewAvailability);
router.post('/status-count', creator.getDashboardRequestCounts);
router.post('/get-crew-equipment', creator.getEquipmentOwnedByCrewMember);
router.post('/get-crew-equipment-count', creator.getCrewEquipmentCounts);

module.exports = router;