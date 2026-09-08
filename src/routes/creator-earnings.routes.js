const express = require('express');
const router = express.Router();
const creatorEarningsController = require('../controllers/creator-earnings.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAnyPermission } = require('../middleware/permission.middleware');

const adminCpCompensationEdit = requireAnyPermission(['admin_finances_cp_compensation.edit'], { allowAdminBypass: false });

router.get('/me/dashboard', authenticate, creatorEarningsController.getCreatorEarningsDashboard);
router.get('/me/earnings', authenticate, creatorEarningsController.getCreatorEarningsList);
router.get('/me/earnings/:earningId/timeline', authenticate, creatorEarningsController.getPayoutTimeline);
router.get('/me/earnings/:earningId', authenticate, creatorEarningsController.getCreatorEarningDetails);
router.post('/me/bookings/:bookingId/accept', authenticate, creatorEarningsController.acceptShoot);
router.post('/me/bookings/:bookingId/decline', authenticate, creatorEarningsController.declineShoot);
router.post('/me/bookings/:bookingId/respond', authenticate, creatorEarningsController.respondToEarning);

router.get('/creator/:creatorId/dashboard', authenticate, creatorEarningsController.getCreatorEarningsDashboard);
router.get('/creator/:creatorId/earnings', authenticate, creatorEarningsController.getCreatorEarningsList);
router.get('/creator/:creatorId/earnings/:earningId/timeline', authenticate, creatorEarningsController.getPayoutTimeline);
router.get('/creator/:creatorId/earnings/:earningId', authenticate, creatorEarningsController.getCreatorEarningDetails);
router.post('/creator/:creatorId/bookings/:bookingId/accept', authenticate, creatorEarningsController.acceptShoot);
router.post('/creator/:creatorId/bookings/:bookingId/decline', authenticate, creatorEarningsController.declineShoot);
router.post('/creator/:creatorId/bookings/:bookingId/respond', authenticate, creatorEarningsController.respondToEarning);

router.post('/admin/earnings/advance', authenticate, adminCpCompensationEdit, creatorEarningsController.addAdvancePayment);
router.put('/admin/earnings/:earningId/compensation', authenticate, adminCpCompensationEdit, creatorEarningsController.upsertCompensationItems);

module.exports = router;
