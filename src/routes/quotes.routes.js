const express = require('express');
const router = express.Router();
const salesQuotesController = require('../controllers/sales-quotes.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAnyPermission } = require('../middleware/permission.middleware');

const adminQuotesView = requireAnyPermission([
  'admin_quotes.view',
  'sales_rep_quotes.view',
  'sales_admin_quotes.view',
  'client_quotes.view'
], { allowRoles: ['sales_rep', 'sales_admin', 'client'] });

router.get('/master-pricing/export', authenticate, adminQuotesView, salesQuotesController.exportMasterPricingExcel);

module.exports = router;
