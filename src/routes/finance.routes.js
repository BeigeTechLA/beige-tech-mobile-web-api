const express = require('express');
const router = express.Router();
const financeController = require('../controllers/finance.controller');
const { authenticate, requireAdmin, requireSalesRepOrAdmin } = require('../middleware/auth.middleware');

router.get('/transactions', authenticate, requireSalesRepOrAdmin, financeController.listTransactions);
router.get('/shoots', authenticate, requireSalesRepOrAdmin, financeController.listShootBreakdowns);
router.get('/shoots/:bookingId', authenticate, requireSalesRepOrAdmin, financeController.getShootFinance);
router.post('/bookings/:bookingId/sync', authenticate, requireAdmin, financeController.syncBookingFinance);

module.exports = router;
