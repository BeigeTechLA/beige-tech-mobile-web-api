const express = require('express');
const router = express.Router();
const notificationsController = require('../controllers/notifications.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.get('/', authenticate, notificationsController.getNotifications);
router.get('/unread-count', authenticate, notificationsController.getUnreadCount);
router.patch('/mark-all-read', authenticate, notificationsController.markAllAsRead);
router.patch('/:notificationId/read', authenticate, notificationsController.markAsRead);
router.patch('/:notificationId/archive', authenticate, notificationsController.archiveNotification);

module.exports = router;
