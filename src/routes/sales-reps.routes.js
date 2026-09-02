const express = require('express');
const router = express.Router();
const controller = require('../controllers/shift-management.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAnyPermission } = require('../middleware/permission.middleware');

const salesRepresentativeView = requireAnyPermission([
  'admin_sales_representative.view',
  'sales_admin_sales_people.view',
  'sales_rep_sales.view'
], { allowRoles: ['sales_rep', 'sales_admin'] });

router.get('/:id/leads', authenticate, salesRepresentativeView, controller.salesRepLeads);
router.get('/:id/quotes', authenticate, salesRepresentativeView, controller.salesRepQuotes);

module.exports = router;
