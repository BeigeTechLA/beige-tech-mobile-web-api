const express = require('express');
const router = express.Router();
const leadsReportController = require('../controllers/leads-report.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAnyPermission } = require('../middleware/permission.middleware');

const leadsReportView = requireAnyPermission([
  'admin_quotes.view',
  'sales_rep_quotes.view',
  'sales_admin_quotes.view'
], { allowRoles: ['sales_rep', 'sales_admin'] });

router.post('/generate-leads-report', authenticate, leadsReportView, leadsReportController.generateLeadsReport);

module.exports = router;
