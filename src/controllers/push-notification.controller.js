const constants = require('../utils/constants');
const pushNotificationService = require('../services/push-notification.service');
const appNotificationService = require('../services/app-notification.service');

const getRequestUserId = (req) => req.userId || req.user?.id;
const getRequestUserType = (req) => req.userType || null;

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

exports.getNotificationPreferences = async (req, res) => {
  try {
    const result = await pushNotificationService.getNotificationPreferences({
      userId: getRequestUserId(req),
      sessionId: req.query.session_id,
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: 'Notification preferences fetched successfully.',
      data: result,
    });
  } catch (err) {
    console.error('getNotificationPreferences Error:', err);
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
    const userId = getRequestUserId(req);
    const title = 'Push notification test';
    const message = 'This is a test of your web push and notification inbox.';
    const notification = await appNotificationService.createAndPushNotification({
      userId,
      title,
      message,
      topic: 'system',
      category: 'system',
      type: 'push_module_test',
      actionLabel: 'View notification',
      appUserType: getRequestUserType(req),
      deliverySurfaces: ['web_app'],
      sendPush: false,
    });

    if (!notification) {
      return res.status(constants.OK.code).json({
        error: false,
        code: constants.OK.code,
        message: 'Test notification could not be saved.',
        data: { inbox_saved: false, push_success: false, reason: 'INBOX_SAVE_FAILED' },
      });
    }

    let pushResult = null;
    let pushError = null;
    try {
      const pushAllowed = await pushNotificationService.isPushCategoryAllowedForUser({ userId, category: 'system' });
      if (pushAllowed) {
        pushResult = await pushNotificationService.sendPushToUser({
          userId,
          title,
          body: message,
          data: {
            topic: 'system',
            category: 'system',
            type: 'push_module_test',
            notification_id: String(notification.notification_id),
          },
        });
      } else {
        pushError = 'PUSH_CATEGORY_MUTED';
      }
    } catch (err) {
      pushError = err.message || 'Push delivery request failed.';
    }

    const delivery = pushResult?.data?.success !== undefined || pushResult?.data?.debug
      ? pushResult.data
      : pushResult || {};
    const debug = delivery.debug || {};

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: 'Test notification saved; push delivery evaluated.',
      data: {
        notification_id: notification.notification_id,
        inbox_saved: true,
        push_success: Boolean(delivery.success),
        active_token_count: debug.active_token_count ?? null,
        success_count: debug.success_count ?? null,
        failure_count: debug.failure_count ?? null,
        reason: debug.reason || debug.failures?.[0]?.firebase_error_code || pushError || null,
      },
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
