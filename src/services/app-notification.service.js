const { Op } = require('sequelize');
const db = require('../models');
const constants = require('../utils/constants');
const pushNotificationService = require('./push-notification.service');

const VALID_STATUSES = new Set(['all', 'read', 'unread']);
const PROJECT_CATEGORIES = ['projects', 'project', 'shoots', 'meetings', 'proposals'];
const DEFAULT_DELIVERY_SURFACES = ['mobile_app', 'web_app'];

const httpError = (httpCode, message) => {
  const error = new Error(message);
  error.httpCode = httpCode;
  return error;
};

const normalizeString = (value) => {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
};

const normalizePage = (value) => Math.max(parseInt(value, 10) || 1, 1);

const normalizeLimit = (value) => {
  const parsed = parseInt(value, 10) || 20;
  return Math.min(Math.max(parsed, 1), 100);
};

const normalizePayload = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key,
      value == null || typeof value === 'object' ? value : String(value)
    ])
  );
};

const getNotificationModel = () => {
  if (!db.app_notifications) {
    throw httpError(constants.INTERNAL_SERVER_ERROR.code, 'app_notifications model is not registered.');
  }
  return db.app_notifications;
};

const normalizeDeliverySurface = (value, fallback = 'web_app') => {
  const normalized = normalizeString(value)?.toLowerCase();
  return ['mobile_app', 'web_app'].includes(normalized) ? normalized : fallback;
};

const normalizeDeliverySurfaces = (values = null, fallback = DEFAULT_DELIVERY_SURFACES) => {
  const source = Array.isArray(values) && values.length ? values : fallback;
  const surfaces = source
    .map((value) => normalizeDeliverySurface(value, null))
    .filter(Boolean);

  return [...new Set(surfaces)].length ? [...new Set(surfaces)] : [...DEFAULT_DELIVERY_SURFACES];
};

const normalizeAppUserType = (value) => normalizeString(value);

const buildSurfaceWhere = ({ deliverySurface = 'web_app', appUserType = null }) => {
  const normalizedSurface = normalizeDeliverySurface(deliverySurface, 'web_app');
  const surfaceWhere = { delivery_surface: normalizedSurface };
  const normalizedAppUserType = normalizeAppUserType(appUserType);

  if (normalizedAppUserType) {
    surfaceWhere[Op.and] = [
      {
        [Op.or]: [
          { app_user_type: normalizedAppUserType },
          { app_user_type: null }
        ]
      }
    ];
  }

  return surfaceWhere;
};

const buildFilterWhere = ({
  userId,
  status = 'all',
  category = null,
  search = null,
  deliverySurface = 'web_app',
  appUserType = null
}) => {
  const where = {
    user_id: userId,
    is_active: 1,
    ...buildSurfaceWhere({ deliverySurface, appUserType })
  };

  if (status === 'read') where.is_read = 1;
  if (status === 'unread') where.is_read = 0;

  const normalizedCategory = normalizeString(category)?.toLowerCase();
  if (normalizedCategory) {
    if (normalizedCategory === 'mentions') {
      where.type = 'mention';
    } else if (normalizedCategory === 'projects') {
      where.category = { [Op.in]: PROJECT_CATEGORIES };
    } else {
      where.category = normalizedCategory;
    }
  }

  const normalizedSearch = normalizeString(search);
  if (normalizedSearch) {
    where[Op.or] = [
      { title: { [Op.like]: `%${normalizedSearch}%` } },
      { message: { [Op.like]: `%${normalizedSearch}%` } },
      { type: { [Op.like]: `%${normalizedSearch}%` } }
    ];
  }

  return where;
};

const formatNotification = (notification) => {
  const data = typeof notification.toJSON === 'function' ? notification.toJSON() : notification;

  return {
    id: data.notification_id,
    notification_id: data.notification_id,
    title: data.title,
    message: data.message,
    topic: data.topic,
    delivery_surface: data.delivery_surface || 'web_app',
    app_user_type: data.app_user_type || null,
    category: data.category,
    type: data.type,
    reference_id: data.reference_id,
    reference_type: data.reference_type,
    payload: data.payload || null,
    action_label: data.action_label,
    priority: data.priority || 'normal',
    is_read: Boolean(data.is_read),
    read_at: data.read_at,
    created_at: data.created_at,
    sender: data.sender_user ? {
      id: data.sender_user.id,
      name: data.sender_user.name,
      email: data.sender_user.email
    } : null
  };
};

const groupByRelativeDay = (items) => {
  const todayDate = new Date().toDateString();
  const yesterdayDate = new Date(Date.now() - 86400000).toDateString();
  const grouped = { today: [], yesterday: [], earlier: [] };

  items.forEach((item) => {
    const itemDate = new Date(item.created_at).toDateString();
    if (itemDate === todayDate) grouped.today.push(item);
    else if (itemDate === yesterdayDate) grouped.yesterday.push(item);
    else grouped.earlier.push(item);
  });

  return grouped;
};

exports.createNotification = async ({
  userId,
  senderUserId = null,
  title,
  message,
  topic,
  category = null,
  type,
  referenceId = null,
  referenceType = null,
  payload = null,
  actionLabel = null,
  priority = 'normal',
  deliverySurface = 'web_app',
  appUserType = null
}) => {
  const modelNotification = getNotificationModel();
  const normalizedTopic = normalizeString(topic)?.toLowerCase();
  const normalizedDeliverySurface = normalizeDeliverySurface(deliverySurface, 'web_app');
  const normalizedAppUserType = normalizeAppUserType(appUserType);
  const normalizedCategory = normalizeString(category)?.toLowerCase() || normalizedTopic;
  const normalizedType = normalizeString(type);
  const normalizedTitle = normalizeString(title);
  const normalizedMessage = normalizeString(message);

  if (!userId) throw httpError(constants.BAD_REQUEST.code, 'userId is required.');
  if (!normalizedTitle) throw httpError(constants.BAD_REQUEST.code, 'title is required.');
  if (!normalizedMessage) throw httpError(constants.BAD_REQUEST.code, 'message is required.');
  if (!normalizedTopic) throw httpError(constants.BAD_REQUEST.code, 'topic is required.');
  if (!normalizedType) throw httpError(constants.BAD_REQUEST.code, 'type is required.');

  const normalizedPayload = normalizePayload({
    topic: normalizedTopic,
    category: normalizedCategory,
    type: normalizedType,
    ...(payload || {})
  });

  return modelNotification.create({
    user_id: userId,
    sender_user_id: senderUserId || null,
    title: normalizedTitle,
    message: normalizedMessage,
    topic: normalizedTopic,
    delivery_surface: normalizedDeliverySurface,
    app_user_type: normalizedAppUserType,
    category: normalizedCategory,
    type: normalizedType,
    reference_id: normalizeString(referenceId),
    reference_type: normalizeString(referenceType),
    payload: normalizedPayload,
    action_label: normalizeString(actionLabel),
    priority: normalizeString(priority) || 'normal'
  });
};

exports.createAndPushNotification = async ({
  userId,
  senderUserId = null,
  title,
  message,
  topic,
  category = null,
  type,
  referenceId = null,
  referenceType = null,
  payload = null,
  actionLabel = null,
  priority = 'normal',
  pushTitle = null,
  pushBody = null,
  sendPush = true,
  deliverySurface = 'web_app',
  deliverySurfaces = DEFAULT_DELIVERY_SURFACES,
  appUserType = null,
  dedupeWindowSeconds = 0
}) => {
  /*
  const pushData = normalizePayload({
    topic,
    category: category || topic,
    type,
    ...(payload || {})
  });
  const targetSurfaces = normalizeDeliverySurfaces(deliverySurfaces, [deliverySurface]);
  const dedupeSeconds = Math.max(parseInt(dedupeWindowSeconds, 10) || 0, 0);

  if (dedupeSeconds > 0) {
    const modelNotification = getNotificationModel();
    const existingNotification = await modelNotification.findOne({
      where: {
        user_id: userId,
        is_active: 1,
        topic: normalizeString(topic)?.toLowerCase(),
        category: normalizeString(category || topic)?.toLowerCase(),
        type: normalizeString(type),
        reference_id: normalizeString(referenceId),
        reference_type: normalizeString(referenceType),
        delivery_surface: { [Op.in]: targetSurfaces },
        created_at: { [Op.gte]: new Date(Date.now() - dedupeSeconds * 1000) }
      },
      order: [['created_at', 'DESC'], ['notification_id', 'DESC']]
    });

    if (existingNotification) return existingNotification;
  }

  if (sendPush) {
    try {
      await pushNotificationService.sendPushToUser({
        userId,
        title: pushTitle || title,
        body: pushBody || message,
        data: pushData || {
          topic,
          category: category || topic,
          type
        }
      });
    } catch (err) {
      console.error('[AppNotification] Push send failed:', {
        user_id: userId,
        topic,
        type,
        message: err.message
      });
    }
  }

  const inWebAllowed = await pushNotificationService.isInAppNotificationAllowedForUser({
    userId,
    topic: category || topic,
    priority
  });

  if (!inWebAllowed) return null;

  const notifications = await Promise.all(targetSurfaces.map((surface) => (
    exports.createNotification({
      userId,
      senderUserId,
      title,
      message,
      topic,
      category,
      type,
      referenceId,
      referenceType,
      payload,
      actionLabel,
      priority,
      deliverySurface: surface,
      appUserType
    })
  )));

  return notifications[0] || null;
  */

  return null;
};

exports.listNotifications = async ({
  userId,
  status = 'all',
  category,
  search,
  page,
  limit,
  deliverySurface = 'web_app',
  appUserType = null
}) => {
  const modelNotification = getNotificationModel();
  const normalizedStatus = VALID_STATUSES.has(String(status).toLowerCase())
    ? String(status).toLowerCase()
    : 'all';
  const p = normalizePage(page);
  const l = normalizeLimit(limit);
  const where = buildFilterWhere({
    userId,
    status: normalizedStatus,
    category,
    search,
    deliverySurface,
    appUserType
  });

  const { rows, count } = await modelNotification.findAndCountAll({
    where,
    include: [{
      model: db.users,
      as: 'sender_user',
      attributes: ['id', 'name', 'email'],
      required: false
    }],
    order: [['created_at', 'DESC'], ['notification_id', 'DESC']],
    offset: (p - 1) * l,
    limit: l
  });

  const items = rows.map(formatNotification);

  return {
    items,
    grouped: groupByRelativeDay(items),
    pagination: {
      total: count,
      page: p,
      limit: l,
      total_pages: Math.ceil(count / l)
    }
  };
};

exports.getCounts = async ({ userId, deliverySurface = 'web_app', appUserType = null }) => {
  const modelNotification = getNotificationModel();
  const baseWhere = {
    user_id: userId,
    is_active: 1,
    ...buildSurfaceWhere({ deliverySurface, appUserType })
  };

  const [
    all,
    unread,
    mentions,
    payments,
    projects,
    files,
    messages,
    meetings
  ] = await Promise.all([
    modelNotification.count({ where: baseWhere }),
    modelNotification.count({ where: { ...baseWhere, is_read: 0 } }),
    modelNotification.count({ where: { ...baseWhere, type: 'mention' } }),
    modelNotification.count({ where: { ...baseWhere, category: 'payments' } }),
    modelNotification.count({ where: { ...baseWhere, category: { [Op.in]: PROJECT_CATEGORIES } } }),
    modelNotification.count({ where: { ...baseWhere, category: 'files' } }),
    modelNotification.count({ where: { ...baseWhere, category: 'messages' } }),
    modelNotification.count({ where: { ...baseWhere, category: 'meetings' } })
  ]);

  return { all, unread, mentions, payments, projects, files, messages, meetings };
};

exports.getNotificationById = async ({
  userId,
  notificationId,
  deliverySurface = 'web_app',
  appUserType = null
}) => {
  const modelNotification = getNotificationModel();
  const notification = await modelNotification.findOne({
    where: {
      notification_id: notificationId,
      user_id: userId,
      is_active: 1,
      ...buildSurfaceWhere({ deliverySurface, appUserType })
    },
    include: [{
      model: db.users,
      as: 'sender_user',
      attributes: ['id', 'name', 'email'],
      required: false
    }]
  });

  if (!notification) throw httpError(constants.NOT_FOUND.code, 'Notification not found.');

  return formatNotification(notification);
};

exports.markReadState = async ({
  userId,
  notificationId,
  isRead,
  deliverySurface = 'web_app',
  appUserType = null
}) => {
  const modelNotification = getNotificationModel();
  const [affected] = await modelNotification.update(
    {
      is_read: isRead ? 1 : 0,
      read_at: isRead ? new Date() : null
    },
    {
      where: {
        notification_id: notificationId,
        user_id: userId,
        is_active: 1,
        ...buildSurfaceWhere({ deliverySurface, appUserType })
      }
    }
  );

  if (!affected) throw httpError(constants.NOT_FOUND.code, 'Notification not found.');
};

exports.markAllRead = async ({
  userId,
  category = null,
  deliverySurface = 'web_app',
  appUserType = null
}) => {
  const modelNotification = getNotificationModel();
  const where = buildFilterWhere({
    userId,
    status: 'unread',
    category,
    deliverySurface,
    appUserType
  });

  const [affected] = await modelNotification.update(
    {
      is_read: 1,
      read_at: new Date()
    },
    { where }
  );

  return { updated_count: affected };
};

exports.deleteNotification = async ({
  userId,
  notificationId,
  deliverySurface = 'web_app',
  appUserType = null
}) => {
  const modelNotification = getNotificationModel();
  const [affected] = await modelNotification.update(
    { is_active: 0 },
    {
      where: {
        notification_id: notificationId,
        user_id: userId,
        is_active: 1,
        ...buildSurfaceWhere({ deliverySurface, appUserType })
      }
    }
  );

  if (!affected) throw httpError(constants.NOT_FOUND.code, 'Notification not found.');
};
