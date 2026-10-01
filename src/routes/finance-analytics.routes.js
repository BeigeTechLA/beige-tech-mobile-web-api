const express = require('express');
const router = express.Router();
const financeAnalyticsController = require('../controllers/finance-analytics.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAnyPermission } = require('../middleware/permission.middleware');

const adminFinancePermissionOptions = { allowAdminBypass: false };
const adminFinancesView = requireAnyPermission(
  ['admin_finances_transactions.view'],
  adminFinancePermissionOptions
);

router.get('/overview', authenticate, adminFinancesView, financeAnalyticsController.getOverview);
router.get('/cp-analysis', authenticate, adminFinancesView, financeAnalyticsController.getCpAnalysis);
router.get('/top-cps-shoots', authenticate, adminFinancesView, financeAnalyticsController.getTopCpsShoots);
router.get('/clients', authenticate, adminFinancesView, financeAnalyticsController.getClientAnalytics);
router.get('/disputes', authenticate, adminFinancesView, financeAnalyticsController.getDisputesAnalytics);

module.exports = router;
