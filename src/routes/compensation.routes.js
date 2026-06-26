const express = require('express');
const router = express.Router();

const compensation = require('../controllers/compensation.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAnyPermission } = require('../middleware/permission.middleware');

const canView = requireAnyPermission(['admin_finances.view', 'production_manager_shoots.view']);
const canEdit = requireAnyPermission(['admin_finances.create', 'production_manager_shoots.edit']);
const adminOnly = requireAnyPermission(['admin_finances.view']);

// ─── GET 

router.get('/booking/:bookingId', authenticate, canView, compensation.getBookingCompensations);
router.get('/booking/:bookingId/summary', authenticate, canView, compensation.getCompensationSummary);
router.get('/booking/:bookingId/cp/:crewMemberId', authenticate, canView, compensation.getCpCompensation);
router.get('/booking/:bookingId/logs', authenticate, adminOnly, compensation.getCompensationLogs);

// ─── POST

router.post('/booking/:bookingId/save', authenticate, canEdit, compensation.saveCompensations);
router.post('/booking/:bookingId/submit', authenticate, canEdit, compensation.submitToFinance);
router.post('/booking/:bookingId/cp/:crewMemberId/advance', authenticate, canEdit, compensation.addAdvancePayment);

// ─── PATCH 

router.patch('/booking/:bookingId/cp/:crewMemberId/advance/:advanceId/cancel', authenticate, canEdit, compensation.cancelAdvance);

module.exports = router;


