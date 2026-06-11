const express = require('express');
const router = express.Router();

const admin = require('../controllers/admin.controller');
const { authenticateAdmin, authMiddleware } = require('../middleware/auth');
const { requirePermission, requireAnyPermission } = require('../middleware/permission.middleware');

const dashboardView = requireAnyPermission([
  'admin_dashboard.view',
  'production_manager_dashboard.view',
  'production_manager_creative_partner.view'
], { allowRoles: ['production_manager'] });
const dashboardOrShootsView = requireAnyPermission([
  'admin_dashboard.view',
  'admin_shoots.view',
  'production_manager_dashboard.view'
], { allowRoles: ['production_manager'] });
const shootsView = requireAnyPermission(['admin_shoots.view']);
const shootsCreate = requireAnyPermission(['admin_shoots.create']);
const allowSalesRepRoles = { allowRoles: ['sales_rep', 'sales_admin'] };
const shootsEdit = requireAnyPermission([
  'admin_shoots.edit',
  'sales_rep_shoots.edit',
  'sales_admin_shoots.edit',
  'production_manager_shoots.edit'
], { allowRoles: ['sales_rep', 'sales_admin', 'production_manager'] });
const shootsDelete = requireAnyPermission([
  'admin_shoots.delete',
  'production_manager_shoots.delete'
], { allowRoles: ['production_manager'] });
const shootNotesView = requireAnyPermission([
  'admin_shoots.view',
  'production_manager_shoots.view'
], { allowRoles: ['production_manager'] });
const shootNotesCreate = requireAnyPermission([
  'admin_shoots.create',
  'production_manager_shoots.create'
], { allowRoles: ['production_manager'] });
const shootNotesEdit = requireAnyPermission([
  'admin_shoots.edit',
  'production_manager_shoots.edit'
], { allowRoles: ['production_manager'] });
const shootNotesDelete = requireAnyPermission([
  'admin_shoots.delete',
  'production_manager_shoots.delete'
], { allowRoles: ['production_manager'] });
const projectDetailView = requireAnyPermission([
  'admin_shoots.view',
  'admin_meetings.view',
  'admin_meetings.create',
  'sales_rep_shoots.view',
  'sales_rep_meetings.view',
  'sales_admin_shoots.view',
  'sales_admin_meetings.view',
  'creative_partner_request_shoots.view',
  'creative_partner_file_manager.view',
  'client_dashboard.view',
  'client_shoots.view',
  'client_meetings.view'
], { allowRoles: ['sales_rep', 'sales_admin', 'creative', 'client'] });
const projectListView = requireAnyPermission([
  'admin_dashboard.view',
  'admin_shoots.view',
  'admin_meetings.view',
  'admin_meetings.create',
  'sales_rep_shoots.view',
  'sales_admin_shoots.view',
  'client_shoots.view',
  'client_meetings.view',
  'production_manager_dashboard.view',
  'production_manager_shoots.view'
], { allowRoles: ['sales_rep', 'sales_admin', 'client', 'production_manager'] });
const projectFormView = requireAnyPermission([
  'admin_shoots.view',
  'sales_rep_shoots.view',
  'sales_admin_shoots.view',
  'client_shoots.view'
], { allowRoles: ['sales_rep', 'sales_admin', 'client'] });
const skillsView = requireAnyPermission([
  'admin_shoots.view',
  'admin_meetings.view',
  'admin_availability.view',
  'sales_rep_shoots.view',
  'sales_rep_meetings.view',
  'sales_admin_shoots.view'
], allowSalesRepRoles);
const crewAvailabilityView = requireAnyPermission([
  'admin_availability.view',
  'admin_shoots.view',
  'admin_shoots.edit',
  'production_manager_availability.view'
], { allowRoles: ['production_manager'] });
const adminSalesRepresentativeView = requireAnyPermission([
  'admin_sales_representative.view',
  'sales_admin_dashboard.view'
], { allowRoles: ['sales_admin'] });
const adminSalesRepresentativeEdit = requireAnyPermission([
  'admin_sales_representative.edit',
  'sales_admin_dashboard.edit'
], { allowRoles: ['sales_admin'] });
const salesRepSalesView = requireAnyPermission([
  'sales_rep_sales.view',
  'sales_admin_dashboard.view'
], {
  allowRoles: ['sales_rep', 'sales_admin']
});
const adminSalesRepresentativeAvailabilityView = requireAnyPermission([
  'admin_sales_representative.view',
  'admin_availability.view',
  'admin_shoots.view',
  'admin_shoots.edit',
  'admin_meetings.view',
  'sales_rep_shoots.view',
  'sales_rep_meetings.view',
  'sales_admin_dashboard.view',
  'sales_admin_shoots.view',
  'sales_admin_meetings.view',
  'client_shoots.view',
  'production_manager_creative_partner.view',
  'production_manager_availability.view'
], { allowRoles: ['sales_rep', 'sales_admin', 'client', 'production_manager'] });
const adminUsersView = requireAnyPermission(['admin_users.view']);
const adminUsersEdit = requireAnyPermission([
  'admin_users.edit',
  'production_manager_creative_partner.edit'
], { allowRoles: ['production_manager'] });
const adminUsersDelete = requireAnyPermission([
  'admin_users.delete',
  'production_manager_creative_partner.delete'
], { allowRoles: ['production_manager'] });
const adminUsersOrSalesRepresentativeView = requireAnyPermission([
  'admin_users.view',
  'admin_sales_representative.view',
  'production_manager_creative_partner.view'
], { allowRoles: ['production_manager'] });
const adminSalesRepresentativeOrSalesRepSalesView = requireAnyPermission([
  'admin_sales_representative.view',
  'sales_rep_sales.view',
  'sales_admin_dashboard.view'
], {
  allowRoles: ['sales_rep', 'sales_admin']
});
const shootsViewOrEdit = requireAnyPermission([
  'admin_shoots.view',
  'admin_shoots.edit',
  'sales_rep_shoots.view',
  'sales_rep_shoots.edit',
  'sales_admin_shoots.view',
  'sales_admin_shoots.edit'
], allowSalesRepRoles);

router.post('/create-project', authMiddleware, shootsCreate, admin.createProject);
router.post('/match-crew', admin.matchCrew);
router.post('/assignMatchCrew', admin.assignCrew);
router.post('/create-crew-member', admin.createCrewMember);
router.post('/matchEquipments', admin.matchEquipment);
router.post('/assignMatchEquipment', admin.saveMatchedEquipment);
router.get('/get-project/:project_id', authMiddleware, projectDetailView, admin.getProjectDetails);
router.put('/shoots/update-date-location/:project_id', authMiddleware, shootsEdit, admin.updateProjectDateLocation);
router.post('/shoots/update-onboarding-form', authMiddleware, admin.submitProjectFormByAdmin);
router.get('/get-active-projects', admin.getActiveProjects);
router.get('/recent-activity', authMiddleware, dashboardView, admin.getRecentActivity);
router.get('/get-projects', authMiddleware, projectListView, admin.getAllProjectDetails);
router.get('/get-upcoming-projects', admin.getUpcomingEvents);
router.get('/get-project-status', admin.getProjectStats);
router.post('/final-project-brief', admin.createProjectBrief);
router.post('/get-crew-members', authMiddleware, adminUsersOrSalesRepresentativeView, admin.getCrewMembers);
router.post('/get-approved-crew-members', authMiddleware, crewAvailabilityView, admin.getApprovedCrewMembers);
router.get('/crew-member/:crew_member_id', authMiddleware, adminSalesRepresentativeAvailabilityView, admin.getCrewMemberById);
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
router.get('/skills', authMiddleware, adminSalesRepresentativeAvailabilityView, admin.getSkills); 
router.get('/certifications', admin.getCertifications);
router.get('/equipment-by-location', admin.getEquipmentByLocation);
router.get('/equipment-autocomplete', admin.getEquipmentNameSuggestions);
router.get('/get-event-types', admin.getEventTypes),
router.get('/get-crew-member-name', admin.getCrewMembersByName)
router.get('/get-crew-count', admin.getCrewCount);
router.get('/get-pending-cp', authMiddleware, salesRepSalesView, admin.getAllPendingCrewMembers);
router.get('/:bookingId/get-booking-summary', admin.getBookingSummaryById);

// Dashboard statistics routes
router.get('/dashboard-chart-data', authMiddleware, dashboardView, admin.getDashboardChartData);
router.get('/get-dashboard-summary', authMiddleware, dashboardView, admin.getDashboardSummary)
router.get('/dashboard/revenue/total', authMiddleware, dashboardView, admin.getTotalRevenue)
router.get('/dashboard/revenue/monthly', authMiddleware, dashboardView, admin.getMonthlyRevenue)
router.get('/dashboard/revenue/weekly', authMiddleware, dashboardView, admin.getWeeklyRevenue)
router.get('/dashboard/payout/total', authMiddleware, dashboardView, admin.getTotalPayout);
router.get('/dashboard/payout/weekly-graph', authMiddleware, dashboardView, admin.getWeeklyPayoutGraph);
router.get('/dashboard/payout/pending', authMiddleware, dashboardView, admin.getPendingPayout);
router.get('/dashboard/cp/count', authMiddleware, dashboardView, admin.getTotalCPCount);
router.get('/dashboard/category-wise-cp/count', authMiddleware, dashboardView, admin.getCategoryWiseCPs);
router.get('/dashboard/shoot-status', authMiddleware, dashboardView, admin.getShootStatus)
router.get('/dashboard/top-creative-partners', authMiddleware, dashboardView, admin.getTopCreativePartners)
router.post('/dashboard-detail', authMiddleware, dashboardView, admin.getDashboardDetails);
router.post('/verify-crew-member', authMiddleware, adminUsersEdit, admin.verifyCrewMember);
router.get('/shoot-category-count', authMiddleware, dashboardOrShootsView, admin.getShootByCategory);
router.get('/get-post-production-members', admin.getPostProductionMembers);
router.post('/assign-post-production-member', authMiddleware, shootsEdit, admin.assignPostProductionMember);
router.get('/get-clients', authMiddleware, adminUsersView, admin.getClients);
router.put('/edit-client/:client_id', admin.editClient);
router.delete('/delete-client/:client_id', admin.deleteClient);
router.delete('/delete-project/:project_id', authMiddleware, shootsDelete, admin.deleteProject);
router.post('/upload-profile-photo', admin.uploadProfilePhoto);
router.get('/get-client-by-id/:id', authMiddleware, adminUsersView, admin.getClientById);
router.get('/get-clients-shoots/:clientId', authMiddleware, adminUsersView, admin.getClientsShoots);
router.get('/get-crew-for-lead', authMiddleware, adminSalesRepresentativeOrSalesRepSalesView, admin.searchCrewForLead);
router.post('/assign-crew-from-lead', authMiddleware, adminSalesRepresentativeEdit, admin.assignCrewBulkSmart);
router.post('/remove-assigned-crew',authMiddleware, admin.removeAssignedCrew);
router.get('/get-client-details-with-shoots/:userId', admin.getClientFullDetailsByUserId);
router.get('/check-cp-delete-status', authMiddleware, adminUsersDelete, admin.checkDeleteStatus);
router.post('/delete-cp', authMiddleware, adminUsersDelete, admin.executeDeleteCrewMember);
router.post('/get-project-fullfillment-stats/:project_id', authMiddleware, shootsView, admin.getProjectFulfillmentStatus);
router.get('/get-crew-for-shoot', authMiddleware, shootsViewOrEdit, admin.searchCrewForProject);
router.post('/assign-crew-from-shoot', authMiddleware, shootsEdit, admin.assignProjectCrewBulk);
router.post('/remove-project-crew',authMiddleware, admin.removeProjectAssignedCrew);
router.get('/get-project-form/:project_id', authMiddleware, projectFormView, admin.getProjectFormByProjectId);
router.post('/shoots/remind-onboarding-form/:project_id', authMiddleware, admin.sendOnboardingFormReminder);
router.post('/get-assigned-project-crew', admin.getAllAssignedRequests);
router.post('/crew-member-assigned-projects', authMiddleware, adminSalesRepresentativeView, admin.getAllAssignedRequests);
router.post('/roles/create', authMiddleware, admin.createRole);
router.get('/roles', authMiddleware, admin.getRoles);
router.post('/users/assign-role', authMiddleware, admin.assignRoleToUser);
router.put('/roles/update', authMiddleware, admin.updateRole);
router.delete('/roles/delete/:role_id', authMiddleware, admin.deleteRole);
router.get('/roles/:role_id', authMiddleware, admin.getRoleById);
router.get('/users/roles', authMiddleware, admin.getUsersWithRoles);
router.get('/users/:user_id/role-details', authMiddleware, admin.getUserRoleDetails);
router.get('/permissions/modules', authMiddleware, admin.getPermissionModules);
router.delete('/delete-user/:user_id', authMiddleware, admin.deleteUser);
router.post('/users/permissions/assign', authMiddleware, admin.assignPermissionsToUser);
router.put('/users/permissions/update', authMiddleware, admin.updateUserPermissions);
router.get('/users/:user_id/permissions', authMiddleware, admin.getUserPermissions);
router.delete('/users/:user_id/permissions/:module_key/:action_key', authMiddleware, admin.deleteUserPermission);
router.delete('/users/:user_id/permissions/:permission_id', authMiddleware, admin.deleteUserPermission);

router.get('/shoots/:bookingId/notes', authMiddleware, shootNotesView, admin.getShootNotes);
router.post('/shoots/:bookingId/notes', authMiddleware, shootNotesCreate, admin.uploadShootNoteAttachments, admin.addShootNote);
router.post('/shoots/:bookingId/notes/:noteId/replies', authMiddleware, shootNotesCreate, admin.uploadShootNoteAttachments, admin.replyToShootNote);
router.post('/shoots/:bookingId/notes/:noteId/reactions', authMiddleware, shootNotesEdit, admin.toggleShootNoteReaction);
router.delete('/shoots/:bookingId/notes/:noteId', authMiddleware, shootNotesDelete, admin.deleteShootNote);

module.exports = router;
