const express = require('express');
const router = express.Router();

const appNotificationController = require('../controllers/app-notification.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/', appNotificationController.listNotifications);
router.get('/counts', appNotificationController.getCounts);
router.get('/:id', appNotificationController.getNotification);
router.patch('/read-all', appNotificationController.markAllRead);
router.patch('/:id/read', appNotificationController.markRead);
router.patch('/:id/unread', appNotificationController.markUnread);
router.delete('/:id', appNotificationController.deleteNotification);

module.exports = router;
