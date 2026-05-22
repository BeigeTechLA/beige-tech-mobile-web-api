const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const financeController = require('../controllers/finance.controller');
const { authenticate, requireAdmin, requireSalesRepOrAdmin } = require('../middleware/auth.middleware');

const disputeUploadDir = path.join(__dirname, '../../public/uploads/media');
fs.mkdirSync(disputeUploadDir, { recursive: true });
const disputeUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, disputeUploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '');
      const base = path.basename(file.originalname || 'dispute-attachment', ext).replace(/[^a-z0-9_-]/gi, '_');
      cb(null, `${base}_${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 }
});

router.get('/transactions', authenticate, requireSalesRepOrAdmin, financeController.listTransactions);
router.get('/shoots', authenticate, requireSalesRepOrAdmin, financeController.listShootBreakdowns);
router.get('/shoots/:bookingId', authenticate, requireSalesRepOrAdmin, financeController.getShootFinance);
router.get('/admin/payouts-screen', authenticate, requireAdmin, financeController.getAdminPayoutsScreen);
router.get('/admin/creator-wallet-overview', authenticate, requireAdmin, financeController.getAdminCreatorWalletOverview);
router.get('/admin/disputes/dashboard', authenticate, requireAdmin, financeController.getAdminDisputesDashboard);
router.get('/admin/disputes', authenticate, requireAdmin, financeController.listAdminDisputes);
router.post('/admin/disputes', authenticate, requireAdmin, financeController.createAdminDispute);
router.get('/admin/disputes/:disputeId', authenticate, requireAdmin, financeController.getAdminDisputeDetails);
router.patch('/admin/disputes/:disputeId', authenticate, requireAdmin, financeController.updateAdminDispute);
router.post('/admin/disputes/:disputeId/comments', authenticate, requireAdmin, financeController.addDisputeComment);
router.post('/admin/disputes/:disputeId/attachments', authenticate, requireAdmin, disputeUpload.fields([{ name: 'attachment', maxCount: 5 }, { name: 'attachments', maxCount: 10 }, { name: 'file', maxCount: 5 }]), financeController.addDisputeAttachment);
router.post('/admin/disputes/:disputeId/hold-payout', authenticate, requireAdmin, financeController.holdDisputePayout);
router.post('/admin/disputes/:disputeId/resolve', authenticate, requireAdmin, financeController.resolveDispute);
router.post('/admin/disputes/:disputeId/reject-refund', authenticate, requireAdmin, financeController.rejectOrRefundDispute);
router.post('/admin/disputes/:disputeId/escalate', authenticate, requireAdmin, financeController.escalateDispute);
router.get('/admin/credit-points/dashboard', authenticate, requireAdmin, financeController.getAdminCreditPointsDashboard);
router.get('/admin/credit-points/users', authenticate, requireAdmin, financeController.getAdminCreditPointUserDetails);
router.get('/admin/credit-points/users/:userId', authenticate, requireAdmin, financeController.getAdminCreditPointUserDetails);
router.post('/admin/credit-points/manual', authenticate, requireAdmin, financeController.createAdminManualCredit);
router.get('/admin/credit-points/export', authenticate, requireAdmin, financeController.listAdminCreditPointTransactions);
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
