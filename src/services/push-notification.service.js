const constants = require('../utils/constants');
const db = require('../models');

const modelNotificationPreferences = db.user_notification_preferences;
const modelUsers = db.users;
const CRITICAL_PRIORITIES = new Set(['critical', 'urgent']);
const DEFAULT_TOPICS = {
  shoots: true,
  messages: true,
  meetings: true,
  files: true,
};
const ALLOWED_TOPICS = new Set(Object.keys(DEFAULT_TOPICS));

const normalizeString = (value) => {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
};

const normalizeBoolean = (value, fallback = true) => {
  if (value == null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;

  return fallback;
};

const normalizeTopics = (topics = null) => {
  if (!topics || typeof topics !== 'object' || Array.isArray(topics)) return null;

  return Object.fromEntries(
    Object.entries(topics)
      .map(([key, value]) => [normalizeString(key)?.toLowerCase(), normalizeBoolean(value, true)])
      .filter(([key]) => key && ALLOWED_TOPICS.has(key))
  );
};

const parseJsonObject = (value) => {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
};

const preferenceToPlain = (preference) => (
  preference && typeof preference.get === 'function'
    ? preference.get({ plain: true })
    : preference
);

const normalizeNotificationPreferences = (notificationPreferences = {}) => {
  const topics = normalizeTopics(notificationPreferences.topics);

  return {
    push_enabled: normalizeBoolean(notificationPreferences.push_enabled, true),
    ...(topics ? { topics } : {}),
  };
};

const normalizeEmailNotificationPreferences = (notificationPreferences = {}) => {
  const topics = normalizeTopics(notificationPreferences.email_topics || notificationPreferences.topics);

  return {
    email_enabled: normalizeBoolean(notificationPreferences.email_enabled, true),
    ...(topics ? { email_topics: topics } : {}),
  };
};

const withDefaultTopics = (topics = null) => ({
  ...DEFAULT_TOPICS,
  ...(normalizeTopics(parseJsonObject(topics)) || {}),
});

const formatUserNotificationPreference = (preference = null) => {
  const plain = preferenceToPlain(preference) || {};

  return {
    push_enabled: normalizeBoolean(plain.push_enabled, true),
    email_enabled: normalizeBoolean(plain.email_enabled, true),
    topics: withDefaultTopics(plain.topics),
    email_topics: withDefaultTopics(plain.email_topics),
  };
};

const saveInWebNotificationPreferencesForUser = async ({
  userId,
  notificationPreferences,
}) => {
  if (!userId || !notificationPreferences || typeof notificationPreferences !== 'object') return null;

  const normalized = normalizeNotificationPreferences(notificationPreferences);
  const payload = {
    user_id: userId,
    push_enabled: normalized.push_enabled ? 1 : 0,
    topics: normalized.topics || null,
    raw_preferences: normalized,
    updated_at: new Date(),
  };

  const existing = await modelNotificationPreferences.findOne({ where: { user_id: userId } });
  if (existing) {
    await existing.update(payload);
    return existing.reload();
  }

  return modelNotificationPreferences.create(payload);
};

const getPreferenceByTarget = async ({ userId = null, email = null }) => {
  if (userId) {
    const preference = preferenceToPlain(await modelNotificationPreferences.findOne({
      where: { user_id: userId },
      order: [
        ['updated_at', 'DESC'],
        ['preference_id', 'DESC'],
      ],
      raw: true,
    }));

    if (preference || !email) return preference;
  }

  const normalizedEmail = normalizeString(email)?.toLowerCase();
  if (!normalizedEmail) return null;

  const user = await modelUsers.findOne({
    where: { email: normalizedEmail, is_active: 1 },
    attributes: ['id'],
    raw: true,
  });
  let resolvedUserId = user?.id || null;

  if (!resolvedUserId && db.crew_members) {
    const crewMember = await db.crew_members.findOne({
      where: { email: normalizedEmail, is_active: 1 },
      attributes: ['user_id', 'email'],
      raw: true,
    });
    resolvedUserId = crewMember?.user_id || null;

    if (!resolvedUserId && crewMember?.email) {
      const crewUser = await modelUsers.findOne({
        where: { email: normalizeString(crewMember.email)?.toLowerCase(), is_active: 1 },
        attributes: ['id'],
        raw: true,
      });
      resolvedUserId = crewUser?.id || null;
    }
  }

  if (!resolvedUserId) return null;

  return preferenceToPlain(await modelNotificationPreferences.findOne({
    where: { user_id: resolvedUserId },
    order: [
      ['updated_at', 'DESC'],
      ['preference_id', 'DESC'],
    ],
    raw: true,
  }));
};

const isCriticalPriority = (priority = '') => CRITICAL_PRIORITIES.has(String(priority || '').trim().toLowerCase());

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

  const result = await callThirdPartyPushApi({
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

  if (notificationPreferences) {
    await saveInWebNotificationPreferencesForUser({ userId, notificationPreferences });
  }

  return result;
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

  const result = await callThirdPartyPushApi({
    method: 'PATCH',
    path: '/v1/internal/push/preferences',
    data: {
      user_id: userId,
      session_id: normalizedSessionId,
      notification_preferences: notificationPreferences,
    },
  });

  await saveInWebNotificationPreferencesForUser({ userId, notificationPreferences });

  return result;
};

exports.getNotificationPreferences = async ({
  userId,
  sessionId,
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

  const params = new URLSearchParams({
    user_id: String(userId),
    session_id: normalizedSessionId,
  });

  return callThirdPartyPushApi({
    method: 'GET',
    path: `/v1/internal/push/preferences?${params.toString()}`,
  });
};

exports.getUserNotificationPreferences = async ({ userId }) => {
  if (!userId) {
    const error = new Error('Authenticated user is required.');
    error.httpCode = constants.UNAUTHORIZED.code;
    throw error;
  }

  const preference = await modelNotificationPreferences.findOne({
    where: { user_id: userId },
    raw: true,
  });

  return formatUserNotificationPreference(preference);
};

exports.updateEmailNotificationPreferences = async ({
  userId,
  notificationPreferences,
}) => {
  if (!userId) {
    const error = new Error('Authenticated user is required.');
    error.httpCode = constants.UNAUTHORIZED.code;
    throw error;
  }

  if (!notificationPreferences || typeof notificationPreferences !== 'object') {
    const error = new Error('notification_preferences is required.');
    error.httpCode = constants.BAD_REQUEST.code;
    throw error;
  }

  const normalized = normalizeEmailNotificationPreferences(notificationPreferences);
  const payload = {
    user_id: userId,
    email_enabled: normalized.email_enabled ? 1 : 0,
    ...(normalized.email_topics ? { email_topics: normalized.email_topics } : {}),
    updated_at: new Date(),
  };

  const existing = await modelNotificationPreferences.findOne({ where: { user_id: userId } });
  if (existing) {
    await existing.update(payload);
    return formatUserNotificationPreference(await existing.reload());
  }

  return formatUserNotificationPreference(await modelNotificationPreferences.create(payload));
};

exports.isEmailAllowedForUser = async ({
  userId = null,
  email = null,
  topic = null,
  priority = 'normal',
}) => {
  if (isCriticalPriority(priority)) return true;

  const preference = await getPreferenceByTarget({ userId, email });
  if (!preference) return true;
  if (!normalizeBoolean(preference.email_enabled, true)) return false;

  const normalizedTopic = normalizeString(topic)?.toLowerCase();
  const topics = parseJsonObject(preference.email_topics);
  if (normalizedTopic && topics && Object.prototype.hasOwnProperty.call(topics, normalizedTopic)) {
    return normalizeBoolean(topics[normalizedTopic], true);
  }

  return true;
};

exports.filterEmailRecipientsByPreference = async ({
  recipients = [],
  topic = null,
  priority = 'normal',
}) => {
  if (!Array.isArray(recipients) || !recipients.length || isCriticalPriority(priority)) {
    return Array.isArray(recipients) ? recipients : [];
  }

  const filtered = [];
  for (const recipient of recipients) {
    const email = typeof recipient === 'string' ? recipient : recipient?.email;
    const userId = typeof recipient === 'object'
      ? (recipient.user_id || recipient.userId || recipient.id || null)
      : null;
    const allowed = await exports.isEmailAllowedForUser({ userId, email, topic, priority });
    if (allowed) filtered.push(recipient);
  }

  return filtered;
};

exports.isInAppNotificationAllowedForUser = async ({
  userId,
  topic = null,
  priority = 'normal',
}) => {
  if (isCriticalPriority(priority)) return true;
  if (!userId) return true;

  const preference = await modelNotificationPreferences.findOne({
    where: { user_id: userId },
    raw: true,
  });
  if (!preference) return true;
  if (!normalizeBoolean(preference.push_enabled, true)) return false;

  const normalizedTopic = normalizeString(topic)?.toLowerCase();
  const topics = parseJsonObject(preference.topics);
  if (normalizedTopic && topics && Object.prototype.hasOwnProperty.call(topics, normalizedTopic)) {
    return normalizeBoolean(topics[normalizedTopic], true);
  }

  return true;
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
