const express = require('express');
const router = express.Router();
const controller = require('../controllers/shift-management.controller');
const { authenticate, requireSalesRepOrAdmin } = require('../middleware/auth.middleware');
const { requireAnyPermission } = require('../middleware/permission.middleware');

const salesRepresentativeDashboardView = requireAnyPermission([
  'admin_sales_representative_dashboard.view',
  'sales_rep_sales.view',
  'sales_admin_dashboard.view'
], { allowAdminBypass: false, allowRoles: ['sales_rep', 'sales_admin'] });

router.get('/:id/leads', authenticate, requireSalesRepOrAdmin, salesRepresentativeDashboardView, controller.salesRepLeads);
router.get('/:id/quotes', authenticate, requireSalesRepOrAdmin, salesRepresentativeDashboardView, controller.salesRepQuotes);

module.exports = router;
