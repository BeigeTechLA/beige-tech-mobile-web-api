const constants = require('../utils/constants');
const pushNotificationService = require('../services/push-notification.service');

const getRequestUserId = (req) => req.userId || req.user?.id || req.user?.userId;

const handleError = (res, err, label) => {
  console.error(`${label} Error:`, err);
  return res.status(err.httpCode || constants.INTERNAL_SERVER_ERROR.code).json({
    error: true,
    code: err.httpCode || constants.INTERNAL_SERVER_ERROR.code,
    message: err.message || constants.INTERNAL_SERVER_ERROR.message,
    data: null,
  });
};

exports.getPreferences = async (req, res) => {
  try {
    const data = await pushNotificationService.getUserNotificationPreferences({
      userId: getRequestUserId(req),
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: 'Notification preferences fetched successfully.',
      data,
    });
  } catch (err) {
    return handleError(res, err, 'getPreferences');
  }
};

exports.getEmailPreferences = async (req, res) => {
  try {
    const data = await pushNotificationService.getUserNotificationPreferences({
      userId: getRequestUserId(req),
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: 'Email notification preferences fetched successfully.',
      data: {
        email_enabled: data.email_enabled,
        email_topics: data.email_topics,
      },
    });
  } catch (err) {
    return handleError(res, err, 'getEmailPreferences');
  }
};

exports.updateEmailPreferences = async (req, res) => {
  try {
    const data = await pushNotificationService.updateEmailNotificationPreferences({
      userId: getRequestUserId(req),
      notificationPreferences: req.body.notification_preferences || req.body,
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: 'Email notification preferences updated successfully.',
      data: {
        email_enabled: data.email_enabled,
        email_topics: data.email_topics,
      },
    });
  } catch (err) {
    return handleError(res, err, 'updateEmailPreferences');
  }
};
