const express = require('express');
const router = express.Router();
const shootsReportController = require('../controllers/shoots-report.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAnyPermission } = require('../middleware/permission.middleware');

const shootsReportView = requireAnyPermission([
  'admin_quotes.view',
  'sales_rep_quotes.view',
  'sales_admin_quotes.view'
], { allowRoles: ['sales_rep', 'sales_admin'] });

router.post('/generate-shoots-report', authenticate, shootsReportView, shootsReportController.generateShootsReport);

module.exports = router;
