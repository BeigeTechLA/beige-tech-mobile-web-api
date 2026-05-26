const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const notification = require('../controllers/notification.controller');

router.get('/', authMiddleware, notification.getNotifications);
router.get('/unread-count', authMiddleware, notification.getUnreadCount);
router.get('/preferences', authMiddleware, notification.getPreferences);
router.put('/mark-all-read', authMiddleware, notification.markAllAsRead);
router.put('/:notification_id/read', authMiddleware, notification.markAsRead);
router.delete('/:notification_id', authMiddleware, notification.deleteNotification);

module.exports = router;
