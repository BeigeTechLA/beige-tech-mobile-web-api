const express = require('express');
const router = express.Router();
const controller = require('../controllers/shift-management.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAnyPermission } = require('../middleware/permission.middleware');

// Read-only immutable audit log. No create/update/delete routes.
const assignmentHistoryView = requireAnyPermission([
  'admin_sales_representative.view',
  'admin_sales_representative_shift_management.view',
  'sales_admin_sales_people.view',
  'sales_rep_sales.view'
], { allowRoles: ['sales_rep', 'sales_admin'] });

router.get('/', authenticate, assignmentHistoryView, controller.assignmentHistory);

module.exports = router;
