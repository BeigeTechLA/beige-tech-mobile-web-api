const express = require('express');
const router = express.Router();
const pushNotificationController = require('../controllers/push-notification.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

router.post('/tokens', pushNotificationController.saveFcmToken);
router.delete('/tokens', pushNotificationController.removeFcmToken);
router.patch('/preferences', pushNotificationController.updateNotificationPreferences);
router.post('/test', pushNotificationController.sendTestPushToMe);

module.exports = router;
