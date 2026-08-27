const express = require('express');
const router = express.Router();
const controller = require('../controllers/shift-management.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAnyPermission } = require('../middleware/permission.middleware');

const shiftManagementView = requireAnyPermission([
  'admin_sales_representative_shift_management.view'
], { allowAdminBypass: false });
const shiftManagementCreate = requireAnyPermission([
  'admin_sales_representative_shift_management.create'
], { allowAdminBypass: false });
const shiftManagementEdit = requireAnyPermission([
  'admin_sales_representative_shift_management.edit'
], { allowAdminBypass: false });
const shiftManagementDelete = requireAnyPermission([
  'admin_sales_representative_shift_management.delete'
], { allowAdminBypass: false });

router.use(authenticate);

// Shifts
router.get('/overview', shiftManagementView, controller.overview);
router.get('/hourly-lead-volume', shiftManagementView, controller.hourlyLeadVolume);
router.get('/active-now', shiftManagementView, controller.activeNow);
router.get('/recent-assignments', shiftManagementView, controller.recentAssignments);
router.post('/', shiftManagementCreate, controller.createShift);
router.get('/', shiftManagementView, controller.listShifts);
router.get('/salespeople', shiftManagementView, controller.listAllShiftSalespeople);
router.get('/:id', shiftManagementView, controller.getShift);
router.put('/:id', shiftManagementEdit, controller.updateShift);
router.patch('/:id/toggle', shiftManagementEdit, controller.toggleShift);
router.delete('/:id', shiftManagementDelete, controller.deleteShift);

// Shift salespeople links to existing users/sales-reps data
router.post('/:id/salespeople', shiftManagementEdit, controller.addSalesperson);
router.get('/:id/salespeople', shiftManagementView, controller.listSalespeople);
router.patch('/:id/salespeople/:salesRepId/toggle', shiftManagementEdit, controller.toggleSalesperson);
router.delete('/:id/salespeople/:salesRepId', shiftManagementDelete, controller.removeSalesperson);

// Round robin
router.get('/:id/round-robin', shiftManagementView, controller.getRoundRobin);
router.put('/:id/round-robin', shiftManagementEdit, controller.updateRoundRobin);

module.exports = router;
