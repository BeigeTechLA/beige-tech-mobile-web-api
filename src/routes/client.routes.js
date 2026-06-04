const express = require('express');
const router = express.Router();

const client = require('../controllers/client.controller');
const { optionalAuth } = require('../middleware/auth');
const { requireAnyPermission } = require('../middleware/permission.middleware');

const clientDashboardView = requireAnyPermission(['client_dashboard.view'], { allowRoles: ['client'] });
const clientDashboardCreate = requireAnyPermission(['client_dashboard.create'], { allowRoles: ['client'] });
const clientAffiliateOverviewView = requireAnyPermission(['client_affiliate_overview.view'], { allowRoles: ['client'] });
const clientAffiliateOverviewOrFinancesView = requireAnyPermission([
  'client_affiliate_overview.view',
  'client_finances.view'
], { allowRoles: ['client'] });
const clientDashboardOrFileManagerView = requireAnyPermission([
  'client_dashboard.view',
  'client_file_manager.view',
  'client_find_yourself.view',
  'client_shoots.view'
], { allowRoles: ['client'] });
const clientDashboardOrShootsView = requireAnyPermission([
  'client_dashboard.view',
  'client_shoots.view'
], { allowRoles: ['client'] });

router.get('/get-dashboard-summary', optionalAuth, clientDashboardView, client.getClientDashboardSummary);
router.get('/credit/dashboard', optionalAuth, client.getClientCreditDashboard);
router.get('/credit/summary', optionalAuth, clientAffiliateOverviewOrFinancesView, client.getClientCreditSummary);
router.get('/credit/history', optionalAuth, clientAffiliateOverviewOrFinancesView, client.getClientCreditHistory);
router.get('/get-shoots-count-by-category', optionalAuth, clientDashboardView, client.getShootByCategoryForUser);
router.get('/get-shoot-status', optionalAuth, clientDashboardView, client.getShootStatusForUser);
router.get('/get-my-shoots', optionalAuth, clientDashboardOrFileManagerView, client.getAllProjectDetailsForUser);
router.get('/get-project/:project_id', optionalAuth, clientDashboardOrShootsView, client.getProjectDetailsForUser);
router.get('/get-booking-details/:booking_id', optionalAuth, clientDashboardView, client.getBookingDetailsById);
router.get('/project-form-status/:booking_id', client.getProjectFormStatusByBookingId);
router.get('/get-recent-activity', optionalAuth, clientDashboardView, client.getRecentActivityForUser);
router.post('/submit-project-form', optionalAuth, clientDashboardCreate, client.submitProjectForm);
router.get('/get-project-form-submission', optionalAuth, clientDashboardView, client.getPendingProjectForms);
router.post('/submit-project-form-guest', client.submitProjectFormGuest);

module.exports = router;
