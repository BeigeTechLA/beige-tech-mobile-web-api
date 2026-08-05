const constants = require('../utils/constants');

const normalizeString = (value) => {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
};

const getThirdPartyPushConfig = () => {
  const baseUrl = normalizeString(process.env.THIRD_PARTY_API_BASE_URL);
  const internalApiKey = normalizeString(process.env.PUSH_NOTIFICATION_INTERNAL_API_KEY);

  if (!baseUrl || !internalApiKey) {
    const error = new Error('Third Party push notification configuration is missing.');
    error.httpCode = constants.INTERNAL_SERVER_ERROR.code;
    throw error;
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    internalApiKey,
  };
};

const parseThirdPartyResponse = async (response) => {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (_) {
    return { message: text };
  }
};

const logThirdPartyPushSendResult = ({ path, data, responseData }) => {
  if (path !== '/v1/internal/push/send') return;

  const result = responseData?.data?.success !== undefined || responseData?.data?.debug
    ? responseData.data
    : responseData || {};
  const debug = result.debug || {};

  console.log('Third Party push send result:', {
    user_id: data?.user_id,
    topic: data?.data?.topic || data?.data?.category || null,
    type: data?.data?.type || null,
    success: result.success,
    response_keys: responseData && typeof responseData === 'object' ? Object.keys(responseData) : [],
    data_keys: responseData?.data && typeof responseData.data === 'object' ? Object.keys(responseData.data) : [],
    active_token_count: debug.active_token_count,
    preference_allowed_token_count: debug.preference_allowed_token_count,
    preference_blocked_token_count: debug.preference_blocked_token_count,
    success_count: debug.success_count,
    failure_count: debug.failure_count,
    reason: debug.reason || null,
    failures: Array.isArray(debug.failures)
      ? debug.failures.map((failure) => ({
        token_id: failure.token_id,
        session_id: failure.session_id,
        app_user_type: failure.app_user_type,
        device_type: failure.device_type,
        error_message: failure.error_message,
        firebase_error_code: failure.firebase_error_code,
        http_code: failure.http_code,
        is_permanent_token_error: failure.is_permanent_token_error,
      }))
      : [],
  });
};

const callThirdPartyPushApi = async ({ method, path, data = null }) => {
  const { baseUrl, internalApiKey } = getThirdPartyPushConfig();

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'x-internal-api-key': internalApiKey,
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
      signal: AbortSignal.timeout(15000),
    });

    const responseData = await parseThirdPartyResponse(response);

    if (!response.ok) {
      const error = new Error(
        responseData?.message ||
        responseData?.error ||
        'Third Party push notification request failed.'
      );
      error.httpCode = response.status;
      error.responseData = responseData;
      throw error;
    }

    logThirdPartyPushSendResult({ path, data, responseData });
    return responseData;
  } catch (err) {
    if (path === '/v1/internal/push/send') {
      console.error('Third Party push send request failed:', {
        user_id: data?.user_id,
        topic: data?.data?.topic || data?.data?.category || null,
        type: data?.data?.type || null,
        status: err.httpCode || null,
        response: err.responseData || null,
        message: err.message,
      });
    }

    const error = new Error(err.message || 'Third Party push notification request failed.');
    error.httpCode = err.httpCode || constants.INTERNAL_SERVER_ERROR.code;
    throw error;
  }
};

exports.saveUserFcmToken = async ({
  userId,
  fcmToken,
  sessionId = null,
  deviceType,
  appUserType = null,
  notificationPreferences = null,
}) => {
  const token = normalizeString(fcmToken);
  const normalizedDeviceType = normalizeString(deviceType)?.toLowerCase();

  if (!userId) {
    const error = new Error('Authenticated user is required.');
    error.httpCode = constants.UNAUTHORIZED.code;
    throw error;
  }

  if (!token) {
    const error = new Error('fcm_token is required.');
    error.httpCode = constants.BAD_REQUEST.code;
    throw error;
  }

  if (!normalizedDeviceType) {
    const error = new Error('device_type is required.');
    error.httpCode = constants.BAD_REQUEST.code;
    throw error;
  }

  return callThirdPartyPushApi({
    method: 'POST',
    path: '/v1/internal/push/tokens',
    data: {
      user_id: userId,
      registrationToken: token,
      session_id: normalizeString(sessionId),
      device_type: normalizedDeviceType,
      app_user_type: appUserType,
      notification_preferences: notificationPreferences || undefined,
    },
  });
};

exports.removeUserFcmToken = async ({ userId, fcmToken = null, sessionId = null }) => {
  const token = normalizeString(fcmToken);
  const normalizedSessionId = normalizeString(sessionId);

  if (!userId) {
    const error = new Error('Authenticated user is required.');
    error.httpCode = constants.UNAUTHORIZED.code;
    throw error;
  }

  if (!token && !normalizedSessionId) {
    const error = new Error('fcm_token or session_id is required.');
    error.httpCode = constants.BAD_REQUEST.code;
    throw error;
  }

  return callThirdPartyPushApi({
    method: 'DELETE',
    path: '/v1/internal/push/tokens',
    data: {
      user_id: userId,
      registrationToken: token || undefined,
      session_id: normalizedSessionId || undefined,
    },
  });
};

exports.updateNotificationPreferences = async ({
  userId,
  sessionId,
  notificationPreferences,
}) => {
  const normalizedSessionId = normalizeString(sessionId);

  if (!userId) {
    const error = new Error('Authenticated user is required.');
    error.httpCode = constants.UNAUTHORIZED.code;
    throw error;
  }

  if (!normalizedSessionId) {
    const error = new Error('session_id is required.');
    error.httpCode = constants.BAD_REQUEST.code;
    throw error;
  }

  if (!notificationPreferences || typeof notificationPreferences !== 'object') {
    const error = new Error('notification_preferences is required.');
    error.httpCode = constants.BAD_REQUEST.code;
    throw error;
  }

  return callThirdPartyPushApi({
    method: 'PATCH',
    path: '/v1/internal/push/preferences',
    data: {
      user_id: userId,
      session_id: normalizedSessionId,
      notification_preferences: notificationPreferences,
    },
  });
};

exports.sendPushToUser = async ({
  userId,
  title,
  body,
  data = {},
}) => {
  if (!userId) {
    const error = new Error('userId is required.');
    error.httpCode = constants.BAD_REQUEST.code;
    throw error;
  }

  return callThirdPartyPushApi({
    method: 'POST',
    path: '/v1/internal/push/send',
    data: {
      user_id: userId,
      title,
      body,
      data,
    },
  });
};
