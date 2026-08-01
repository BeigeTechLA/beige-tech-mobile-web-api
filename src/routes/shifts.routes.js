const express = require('express');
const router = express.Router();
const controller = require('../controllers/shift-management.controller');
const { authenticate, requireSalesRepOrAdmin } = require('../middleware/auth.middleware');

router.use(authenticate, requireSalesRepOrAdmin);

// Shifts
router.get('/overview', controller.overview);
router.get('/hourly-lead-volume', controller.hourlyLeadVolume);
router.get('/active-now', controller.activeNow);
router.get('/recent-assignments', controller.recentAssignments);
router.post('/', controller.createShift);
router.get('/', controller.listShifts);
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
