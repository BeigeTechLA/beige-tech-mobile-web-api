const constants = require('../utils/constants');
const appNotificationService = require('../services/app-notification.service');

const toInt = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const getRequestUserId = (req) => req.userId || req.user?.id || req.user?.userId;
const getRequestUserType = (req) => req.userType || req.user?.user_type || req.user?.userType || req.user?.userTypeId || null;

const handleError = (res, err, label) => {
  console.error(`${label} Error:`, err);
  return res.status(err.httpCode || constants.INTERNAL_SERVER_ERROR.code).json({
    error: true,
    code: err.httpCode || constants.INTERNAL_SERVER_ERROR.code,
    message: err.message || constants.INTERNAL_SERVER_ERROR.message,
    data: null
  });
};

exports.listNotifications = async (req, res) => {
  try {
    const data = await appNotificationService.listNotifications({
      userId: getRequestUserId(req),
      status: req.query.status || 'all',
      category: req.query.category,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
      deliverySurface: 'web_app',
      appUserType: getRequestUserType(req)
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: 'Notifications fetched.',
      data
    });
  } catch (err) {
    return handleError(res, err, 'listNotifications');
  }
};

exports.getCounts = async (req, res) => {
  try {
    const data = await appNotificationService.getCounts({
      userId: getRequestUserId(req),
      deliverySurface: 'web_app',
      appUserType: getRequestUserType(req)
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: 'Notification counts fetched.',
      data
    });
  } catch (err) {
    return handleError(res, err, 'getCounts');
  }
};

exports.getNotification = async (req, res) => {
  try {
    const notificationId = toInt(req.params.id);
    if (!notificationId) {
      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        code: constants.BAD_REQUEST.code,
        message: 'Invalid notification id.',
        data: null
      });
    }

    const data = await appNotificationService.getNotificationById({
      userId: getRequestUserId(req),
      notificationId,
      deliverySurface: 'web_app',
      appUserType: getRequestUserType(req)
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: 'Notification fetched.',
      data
    });
  } catch (err) {
    return handleError(res, err, 'getNotification');
  }
};

exports.markRead = async (req, res) => {
  try {
    const notificationId = toInt(req.params.id);
    if (!notificationId) {
      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        code: constants.BAD_REQUEST.code,
        message: 'Invalid notification id.',
        data: null
      });
    }

    await appNotificationService.markReadState({
      userId: getRequestUserId(req),
      notificationId,
      isRead: true,
      deliverySurface: 'web_app',
      appUserType: getRequestUserType(req)
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: 'Notification marked as read.',
      data: null
    });
  } catch (err) {
    return handleError(res, err, 'markRead');
  }
};

exports.markUnread = async (req, res) => {
  try {
    const notificationId = toInt(req.params.id);
    if (!notificationId) {
      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        code: constants.BAD_REQUEST.code,
        message: 'Invalid notification id.',
        data: null
      });
    }

    await appNotificationService.markReadState({
      userId: getRequestUserId(req),
      notificationId,
      isRead: false,
      deliverySurface: 'web_app',
      appUserType: getRequestUserType(req)
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: 'Notification marked as unread.',
      data: null
    });
  } catch (err) {
    return handleError(res, err, 'markUnread');
  }
};

exports.markAllRead = async (req, res) => {
  try {
    const data = await appNotificationService.markAllRead({
      userId: getRequestUserId(req),
      category: req.query.category || req.body.category,
      deliverySurface: 'web_app',
      appUserType: getRequestUserType(req)
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: 'Notifications marked as read.',
      data
    });
  } catch (err) {
    return handleError(res, err, 'markAllRead');
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    const notificationId = toInt(req.params.id);
    if (!notificationId) {
      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        code: constants.BAD_REQUEST.code,
        message: 'Invalid notification id.',
        data: null
      });
    }

    await appNotificationService.deleteNotification({
      userId: getRequestUserId(req),
      notificationId,
      deliverySurface: 'web_app',
      appUserType: getRequestUserType(req)
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: 'Notification deleted.',
      data: null
    });
  } catch (err) {
    return handleError(res, err, 'deleteNotification');
  }
};
