const constants = require('../utils/constants');
const notificationCenterService = require('../services/notification-center.service');

exports.getNotifications = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
    const unreadOnly = ['true', '1'].includes(String(req.query.unread_only || '').toLowerCase());
    const archived = ['true', '1'].includes(String(req.query.archived || '').toLowerCase());
    const category = req.query.category ? String(req.query.category).trim() : null;
    const notificationType = req.query.type ? String(req.query.type).trim() : null;

    const data = await notificationCenterService.listNotifications(req.userId, {
      page,
      limit,
      unreadOnly,
      archived,
      category,
      notificationType,
    });

    return res.status(constants.OK.code).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const unread_count = await notificationCenterService.getUnreadCount(req.userId);
    return res.status(constants.OK.code).json({
      success: true,
      data: { unread_count },
    });
  } catch (error) {
    console.error('Get unread notification count error:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch unread notification count',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const notificationId = Number(req.params.notificationId || req.body.notification_id);
    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Invalid notification_id',
      });
    }

    const updated = await notificationCenterService.markAsRead(notificationId, req.userId);
    if (!updated) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Notification not found',
      });
    }

    return res.status(constants.OK.code).json({
      success: true,
      message: 'Notification marked as read',
    });
  } catch (error) {
    console.error('Mark notification read error:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to mark notification as read',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    const updated_count = await notificationCenterService.markAllAsRead(req.userId);
    return res.status(constants.OK.code).json({
      success: true,
      message: 'Notifications marked as read',
      data: { updated_count },
    });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to mark notifications as read',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

exports.archiveNotification = async (req, res) => {
  try {
    const notificationId = Number(req.params.notificationId || req.body.notification_id);
    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Invalid notification_id',
      });
    }

    const updated = await notificationCenterService.archiveNotification(notificationId, req.userId);
    if (!updated) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Notification not found',
      });
    }

    return res.status(constants.OK.code).json({
      success: true,
      message: 'Notification archived',
    });
  } catch (error) {
    console.error('Archive notification error:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to archive notification',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
