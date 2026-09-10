const express = require('express');
const router = express.Router();
const controller = require('../controllers/shift-management.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAnyPermission } = require('../middleware/permission.middleware');

const shiftManagementView = requireAnyPermission([
  'admin_sales_representative_shift_management.view',
  'sales_admin_sales_people.view',
  'sales_rep_sales.view'
], { allowRoles: ['sales_rep', 'sales_admin'] });
const shiftManagementCreate = requireAnyPermission([
  'admin_sales_representative_shift_management.create',
], { allowRoles: ['sales_rep', 'sales_admin'] });
const shiftManagementEdit = requireAnyPermission([
  'admin_sales_representative_shift_management.edit',
], { allowRoles: ['sales_rep', 'sales_admin'] });
const shiftManagementDelete = requireAnyPermission([
  'admin_sales_representative_shift_management.delete',
], { allowRoles: ['sales_rep', 'sales_admin'] });

router.use(authenticate, shiftManagementView);

// Shifts
router.get('/overview', controller.overview);
router.get('/hourly-lead-volume', controller.hourlyLeadVolume);
router.get('/active-now', controller.activeNow);
router.get('/recent-assignments', controller.recentAssignments);
router.post('/', shiftManagementCreate, controller.createShift);
router.get('/', controller.listShifts);
router.get('/salespeople', controller.listAllShiftSalespeople);
router.get('/:id', controller.getShift);
router.put('/:id', shiftManagementEdit, controller.updateShift);
router.patch('/:id/toggle', shiftManagementEdit, controller.toggleShift);
router.delete('/:id', shiftManagementDelete, controller.deleteShift);

// Shift salespeople links to existing users/sales-reps data
router.post('/:id/salespeople', shiftManagementEdit, controller.addSalesperson);
router.get('/:id/salespeople', controller.listSalespeople);
router.patch('/:id/salespeople/:salesRepId/toggle', shiftManagementEdit, controller.toggleSalesperson);
router.delete('/:id/salespeople/:salesRepId', shiftManagementDelete, controller.removeSalesperson);

// Round robin
router.get('/:id/round-robin', controller.getRoundRobin);
router.put('/:id/round-robin', shiftManagementEdit, controller.updateRoundRobin);

module.exports = router;
