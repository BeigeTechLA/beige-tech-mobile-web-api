const express = require('express');
const router = express.Router();
const controller = require('../controllers/shift-management.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAnyPermission } = require('../middleware/permission.middleware');

const shiftManagementView = requireAnyPermission([
  'admin_sales_representative.view',
  'admin_sales_representative_dashboard.view',
  'admin_sales_representative_shift_management.view',
  'sales_admin_sales_people.view',
  'sales_rep_sales.view'
], { allowRoles: ['sales_rep', 'sales_admin'] });

router.use(authenticate, shiftManagementView);

// Shifts
router.get('/overview', controller.overview);
router.get('/hourly-lead-volume', controller.hourlyLeadVolume);
router.get('/active-now', controller.activeNow);
router.get('/recent-assignments', controller.recentAssignments);
router.post('/', controller.createShift);
router.get('/', controller.listShifts);
router.get('/salespeople', controller.listAllShiftSalespeople);
router.get('/:id', controller.getShift);
router.put('/:id', controller.updateShift);
router.patch('/:id/toggle', controller.toggleShift);
router.delete('/:id', controller.deleteShift);

// Shift salespeople links to existing users/sales-reps data
router.post('/:id/salespeople', controller.addSalesperson);
router.get('/:id/salespeople', controller.listSalespeople);
router.patch('/:id/salespeople/:salesRepId/toggle', controller.toggleSalesperson);
router.delete('/:id/salespeople/:salesRepId', controller.removeSalesperson);

// Round robin
router.get('/:id/round-robin', controller.getRoundRobin);
router.put('/:id/round-robin', controller.updateRoundRobin);

module.exports = router;
