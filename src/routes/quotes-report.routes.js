const express = require('express');
const router = express.Router();
const quotesReportController = require('../controllers/quotes-report.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAnyPermission } = require('../middleware/permission.middleware');

const quotesReportView = requireAnyPermission([
  'admin_quotes.view',
  'sales_rep_quotes.view',
  'sales_admin_quotes.view'
], { allowRoles: ['sales_rep', 'sales_admin'] });

router.post('/generate-quotes-report', authenticate, quotesReportView, quotesReportController.generateQuotesReport);

module.exports = router;
