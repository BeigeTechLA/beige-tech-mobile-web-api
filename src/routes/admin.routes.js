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
router.get('/get-crew-count', admin.getCrewCount)
// router.post('/login', auth.login);
router.get('/get-dashboard-summary', authenticateAdmin, admin.getDashboardSummary)
router.get('/dashboard/revenue/total', authenticateAdmin, admin.getTotalRevenue)
router.get('/dashboard/revenue/monthly', authenticateAdmin, admin.getMonthlyRevenue)
router.get('/dashboard/revenue/weekly', authenticateAdmin, admin.getWeeklyRevenue)
router.get('/dashboard/shoot-status', authenticateAdmin, admin.getShootStatus)
router.get('/dashboard/top-creative-partners', authenticateAdmin, admin.getTopCreativePartners)
router.post('/dashboard-detail', authenticateAdmin, admin.getDashboardDetails);
router.post('/verify-crew-member', admin.verifyCrewMember);
router.get('/shoot-category-count', admin.getShootByCategory);

module.exports = router;
