const express = require('express');
const router = express.Router();
const notificationPreferenceController = require('../controllers/notification-preference.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/', notificationPreferenceController.getPreferences);
router.get('/email', notificationPreferenceController.getEmailPreferences);
router.patch('/email', notificationPreferenceController.updateEmailPreferences);

module.exports = router;
