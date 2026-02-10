const express = require('express');
const router = express.Router();

const admin = require('../controllers/admin.controller');
const { authenticateAdmin } = require('../middleware/auth');

router.post('/create-project', admin.createProject);
router.post('/match-crew', admin.matchCrew);
router.post('/assignMatchCrew', admin.assignCrew);
router.post('/create-crew-member', admin.createCrewMember);
router.post('/matchEquipments', admin.matchEquipment);
router.post('/assignMatchEquipment', admin.saveMatchedEquipment);
router.get('/get-project/:project_id', admin.getProjectDetails);
router.get('/get-active-projects', admin.getActiveProjects);
router.get('/recent-activity', admin.getRecentActivity);
router.get('/get-projects', admin.getAllProjectDetails);
router.get('/get-upcoming-projects', admin.getUpcomingEvents);
router.get('/get-project-status', admin.getProjectStats);
router.post('/final-project-brief', admin.createProjectBrief);
router.post('/get-crew-members', admin.getCrewMembers);
router.post('/get-approved-crew-members', admin.getApprovedCrewMembers);
router.get('/crew-member/:crew_member_id', admin.getCrewMemberById);
router.delete('/delete-crew-member/:crew_member_id', admin.deleteCrewMember);
router.put('/edit-crew-member/:crew_member_id', admin.updateCrewMember);
router.post('/assign_task', admin.createTask);
router.post('/create_equipment', admin.createEquipment);
router.get('/get-equipments', admin.getEquipment);
router.get('/get-equipment-by-id/:equipment_id', admin.getEquipmentById);
router.delete('/delete-equipment/:equipment_id', admin.deleteEquipment);
router.put('/update-equipment/:equipment_id', admin.updateEquipment);
router.post('/assign-equipment', admin.assignEquipment);
router.get('/get-equipment-assignment', admin.getAllAssignments);
router.get('/get-equipment-assignment-by-id/:id', admin.getAssignmentById);
router.post('/return-equipment', admin.returnEquipment)
router.get('/equipment-categories', admin.getEquipmentCategories);
router.get('/checklist-templates', admin.getChecklistTemplates);
router.get('/crew-roles', admin.getCrewRoles);
router.get('/skills', admin.getSkills); 
router.get('/certifications', admin.getCertifications);
router.get('/equipment-by-location', admin.getEquipmentByLocation);
router.get('/equipment-autocomplete', admin.getEquipmentNameSuggestions);
router.get('/get-event-types', admin.getEventTypes),
router.get('/get-crew-member-name', admin.getCrewMembersByName)
router.get('/get-crew-count', admin.getCrewCount);
router.get('/get-pending-cp', admin.getAllPendingCrewMembers);

// Dashboard statistics routes
router.get('/get-dashboard-summary', admin.getDashboardSummary);
router.get('/dashboard-chart-data', admin.getDashboardChartData);
router.get('/dashboard/revenue/total', admin.getTotalRevenue);
router.get('/dashboard/revenue/monthly', admin.getMonthlyRevenue);
router.get('/dashboard/revenue/weekly', admin.getWeeklyRevenue);
// router.get('/shoot-category-count', admin.getShootCategoryCount); // TODO: Implement this function

// router.post('/login', auth.login);
router.get('/get-dashboard-summary', admin.getDashboardSummary)
router.get('/dashboard/revenue/total', authenticateAdmin, admin.getTotalRevenue)
router.get('/dashboard/revenue/monthly', authenticateAdmin, admin.getMonthlyRevenue)
router.get('/dashboard/revenue/weekly', authenticateAdmin, admin.getWeeklyRevenue)
router.get('/dashboard/payout/total', authenticateAdmin, admin.getTotalPayout);
router.get('/dashboard/payout/weekly-graph', authenticateAdmin, admin.getWeeklyPayoutGraph);
router.get('/dashboard/payout/pending', authenticateAdmin, admin.getPendingPayout);
router.get('/dashboard/cp/count', authenticateAdmin, admin.getTotalCPCount);
router.get('/dashboard/category-wise-cp/count', authenticateAdmin, admin.getCategoryWiseCPs);
router.get('/dashboard/shoot-status', authenticateAdmin, admin.getShootStatus)
router.get('/dashboard/top-creative-partners', authenticateAdmin, admin.getTopCreativePartners)
router.post('/dashboard-detail', authenticateAdmin, admin.getDashboardDetails);
router.post('/verify-crew-member', admin.verifyCrewMember);
router.get('/shoot-category-count', admin.getShootByCategory);
router.get('/get-post-production-members', admin.getPostProductionMembers);
router.post('/assign-post-production-member', admin.assignPostProductionMember);
router.get('/get-clients', admin.getClients);
router.put('/edit-client/:client_id', admin.editClient);
router.delete('/delete-client/:client_id', admin.deleteClient);
router.delete('/delete-project/:project_id', admin.deleteProject);
router.post('/upload-profile-photo', admin.uploadProfilePhoto);

module.exports = router;
