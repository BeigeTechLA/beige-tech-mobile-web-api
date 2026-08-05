const constants = require('../utils/constants');
const pushNotificationService = require('../services/push-notification.service');

const getRequestUserId = (req) => req.userId || req.user?.id;
const getRequestUserType = (req) => req.userRole || req.user?.user_type || null;

exports.saveFcmToken = async (req, res) => {
  try {
    const tokenRecord = await pushNotificationService.saveUserFcmToken({
      userId: getRequestUserId(req),
      fcmToken: req.body.fcm_token || req.body.registrationToken,
      sessionId: req.body.session_id,
      deviceType: req.body.device_type || 'web',
      appUserType: getRequestUserType(req),
      notificationPreferences: req.body.notification_preferences,
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: 'FCM token saved successfully.',
      data: tokenRecord,
    });
  } catch (err) {
    console.error('saveFcmToken Error:', err);
    return res.status(err.httpCode || constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: err.httpCode || constants.INTERNAL_SERVER_ERROR.code,
      message: err.message || constants.INTERNAL_SERVER_ERROR.message,
      data: null,
    });
  }
};

exports.removeFcmToken = async (req, res) => {
  try {
    await pushNotificationService.removeUserFcmToken({
      userId: getRequestUserId(req),
      fcmToken: req.body.fcm_token || req.body.registrationToken,
      sessionId: req.body.session_id,
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: 'FCM token removed successfully.',
      data: null,
    });
  } catch (err) {
    console.error('removeFcmToken Error:', err);
    return res.status(err.httpCode || constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: err.httpCode || constants.INTERNAL_SERVER_ERROR.code,
      message: err.message || constants.INTERNAL_SERVER_ERROR.message,
      data: null,
    });
  }
};

exports.updateNotificationPreferences = async (req, res) => {
  try {
    const result = await pushNotificationService.updateNotificationPreferences({
      userId: getRequestUserId(req),
      sessionId: req.body.session_id,
      notificationPreferences: req.body.notification_preferences,
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: 'Notification preferences updated successfully.',
      data: result,
    });
  } catch (err) {
    console.error('updateNotificationPreferences Error:', err);
    return res.status(err.httpCode || constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: err.httpCode || constants.INTERNAL_SERVER_ERROR.code,
      message: err.message || constants.INTERNAL_SERVER_ERROR.message,
      data: null,
    });
  }
};

exports.sendTestPushToMe = async (req, res) => {
  try {
    const result = await pushNotificationService.sendPushToUser({
      userId: getRequestUserId(req),
      title: req.body.title || 'Test notification',
      body: req.body.body || 'Push notification test successful.',
      data: req.body.data || {
        topic: 'system',
        category: 'system',
        type: 'test',
      },
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: 'Push notification processed.',
      data: result,
    });
  } catch (err) {
    console.error('sendTestPushToMe Error:', err);
    return res.status(err.httpCode || constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: err.httpCode || constants.INTERNAL_SERVER_ERROR.code,
      message: err.message || constants.INTERNAL_SERVER_ERROR.message,
      data: null,
    });
  }
};
