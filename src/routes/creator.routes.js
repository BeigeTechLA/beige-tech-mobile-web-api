console.log('✅ creator.routes.js loaded');

const express = require('express');
const router = express.Router();

const creator = require('../controllers/creator.contoller');
const { checkCreatorVerification } = require('../middleware/creatorVerification');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAnyPermission } = require('../middleware/permission.middleware');

const adminSalesRepresentativeView = requireAnyPermission([
  'admin_sales_representative.view',
  'sales_admin_dashboard.view',
  'crew_request_shoots.view'
], { allowRoles: ['sales_admin', 'creative'] });
const adminSalesRepresentativeAvailabilityView = requireAnyPermission([
  'admin_sales_representative.view',
  'admin_availability.view',
  'sales_admin_dashboard.view',
  'crew_dashboard.view',
  'crew_availability.view'
], { allowRoles: ['sales_admin', 'creative'] });
const crewDashboardView = requireAnyPermission(['crew_dashboard.view'], { allowRoles: ['creative'] });
const crewDashboardOrRequestShootsView = requireAnyPermission([
  'crew_dashboard.view',
  'crew_request_shoots.view'
], { allowRoles: ['creative'] });
const crewRequestShootsView = requireAnyPermission(['crew_request_shoots.view'], { allowRoles: ['creative'] });
const crewRequestShootsEdit = requireAnyPermission(['crew_request_shoots.edit'], { allowRoles: ['creative'] });
const crewAvailabilityCreate = requireAnyPermission(['crew_availability.create'], { allowRoles: ['creative'] });
const crewAvailabilityOrRequestShootsView = requireAnyPermission([
  'crew_availability.view',
  'crew_request_shoots.view'
], { allowRoles: ['creative'] });
const crewProfileView = requireAnyPermission(['crew_profile.view'], { allowRoles: ['creative'] });
const crewProfileCreate = requireAnyPermission(['crew_profile.create'], { allowRoles: ['creative'] });
const crewProfileEdit = requireAnyPermission(['crew_profile.edit'], { allowRoles: ['creative'] });

// router.use(checkCreatorVerification);

router.post('/dashboard-count', authenticate, crewDashboardView, creator.getDashboardCounts);
router.post('/pending-projects', authenticate, crewRequestShootsView, creator.getPendingRequests);
router.post('/confirmed-projects', creator.getConfirmedRequests);
router.post('/declined-projects', creator.getDeclinedRequests);
router.post('/completed-projects', creator.getCompletedProjectsByCrew);
router.post('/project-details', creator.getProjectDetails);
router.post('/accept-project', authenticate, crewRequestShootsEdit, creator.updateRequestStatus);
router.post('/upcoming-accepted-project', authenticate, crewAvailabilityOrRequestShootsView, creator.getAcceptedAndUpcomingProjects);
router.post('/accepted-shoots', authenticate, crewRequestShootsView, creator.getAcceptedShootsByCrew);
router.post('/availability', authenticate, adminSalesRepresentativeAvailabilityView, creator.getCrewAvailability);
router.post('/add-availability', authenticate, crewAvailabilityCreate, creator.setCrewAvailability);
router.post('/status-count', authenticate, adminSalesRepresentativeView, creator.getDashboardRequestCounts);
router.post('/get-crew-equipment', creator.getEquipmentOwnedByCrewMember);
router.post('/get-crew-equipment-count', creator.getCrewEquipmentCounts);
router.post('/get-profile-detail', authenticate, crewProfileView, creator.getProfile);
router.post('/edit-profile', authenticate, crewProfileEdit, creator.editProfile);
router.post('/profile/files/:file_type', authenticate, crewProfileCreate, creator.uploadProfileFiles);
router.post('/profile/upload-profile-photo', creator.uploadCPProfilePhoto);
router.post('/profile/add-portfolio-links', authenticate, crewProfileCreate, creator.addPortfolioLinks);
router.post('/profile/edit-portfolio-link/:crew_files_id', creator.editPortfolioLink);
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
router.post('/dashboard-details', authenticate, crewDashboardView, creator.getDashboardDetails);
router.post('/get-crew-stats', authenticate, crewDashboardView, creator.getCrewShootStats);
router.get('/get-random-crew', creator.getRandomCrewMembers);
router.post('/check-verification-status', authenticate, crewDashboardOrRequestShootsView, creator.checkVerificationStatus);
router.get('/check-cp-status', authenticate, crewDashboardOrRequestShootsView, creator.checkCrewStatus);


module.exports = router;
