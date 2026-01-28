console.log('✅ creator.routes.js loaded');

const express = require('express');
const router = express.Router();

const creator = require('../controllers/creator.contoller');
const { checkCreatorVerification } = require('../middleware/creatorVerification');

// router.use(checkCreatorVerification);

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
router.post('/get-profile-detail', creator.getProfile);
router.post('/edit-profile', creator.editProfile);
router.post('/profile/files/:file_type', creator.uploadProfileFiles);
router.delete('/profile-file/:crew_files_id', creator.deleteProfileFile);
router.get('/equipment', creator.getMyEquipment);
router.get('/equipment/:equipment_id', creator.getMyEquipmentById);
router.post('/equipment', creator.saveMyEquipment);
router.post('/equipment/:crew_equipment_id/photos', creator.uploadCrewEquipmentPhotos);
router.delete('/equipment/:id', creator.deleteMyEquipment);
router.get('/recent-activity', creator.getRecentActivity);
router.get('/get-equipments', creator.getEquipment);
router.post('/request-equipment', creator.submitEquipmentRequest);
router.get('/my-equipment-requests', creator.getEquipmentRequests);
router.post('/equipment/delete-photo', creator.deleteEquipmentPhoto);
router.post('/dashboard-details', creator.getDashboardDetails);
router.post('/get-crew-stats', creator.getCrewShootStats);


module.exports = router;