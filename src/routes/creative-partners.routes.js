const express = require('express');
const router = express.Router();
const admin = require('../controllers/admin.controller');
const { authMiddleware } = require('../middleware/auth');
const { requireAnyPermission } = require('../middleware/permission.middleware');

const adminUsersOrSalesRepresentativeView = requireAnyPermission([
  'admin_users.view',
  'admin_sales_representative.view',
  'sales_rep_sales.view',
  'sales_admin_dashboard.view'
], { allowRoles: ['sales_rep', 'sales_admin'] });

router.get(
  '/details-pending/export',
  authMiddleware,
  adminUsersOrSalesRepresentativeView,
  admin.exportDetailsPendingCreativePartnersExcel
);

module.exports = router;
