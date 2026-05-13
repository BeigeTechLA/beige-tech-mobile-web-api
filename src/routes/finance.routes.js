const express = require('express');
const router = express.Router();
const financeController = require('../controllers/finance.controller');
const { authenticate, requireAdmin, requireSalesRepOrAdmin } = require('../middleware/auth.middleware');

router.get('/transactions', authenticate, requireSalesRepOrAdmin, financeController.listTransactions);
router.get('/shoots', authenticate, requireSalesRepOrAdmin, financeController.listShootBreakdowns);
router.get('/shoots/:bookingId', authenticate, requireSalesRepOrAdmin, financeController.getShootFinance);
router.get('/admin/creator-wallet-overview', authenticate, requireAdmin, financeController.getAdminCreatorWalletOverview);
router.get('/creator-wallets/:creatorId', authenticate, requireSalesRepOrAdmin, financeController.getCreatorWallet);
router.get('/creator-payouts', authenticate, requireSalesRepOrAdmin, financeController.listCreatorPayouts);
router.post('/creator-payout-accounts', authenticate, requireSalesRepOrAdmin, financeController.upsertCreatorPayoutAccount);
router.post('/creator-payouts/request', authenticate, requireSalesRepOrAdmin, financeController.requestCreatorPayout);
router.patch('/creator-payouts/:payoutRequestId/approve', authenticate, requireAdmin, financeController.approveCreatorPayout);
router.patch('/creator-payouts/:payoutRequestId/reject', authenticate, requireAdmin, financeController.rejectCreatorPayout);
router.patch('/creator-payouts/:payoutRequestId/paid', authenticate, requireAdmin, financeController.markCreatorPayoutPaid);
router.post('/creator-earnings/release', authenticate, requireAdmin, financeController.releaseCreatorEarnings);
router.post('/bookings/:bookingId/sync', authenticate, requireAdmin, financeController.syncBookingFinance);

module.exports = router;
