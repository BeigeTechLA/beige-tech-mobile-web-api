const { Op } = require('sequelize');
const db = require('../models');

const NOTIFICATION_CENTER_TYPES = {
  CP_REGISTRATION_APPROVAL: 'CP_REGISTRATION_APPROVAL',
  QUOTE_CHANGE_APPROVAL: 'QUOTE_CHANGE_APPROVAL',
  GENERAL: 'GENERAL',
};

const ADMIN_ROLE_NAMES = ['admin', 'Admin', 'sales_admin', 'Sales_Admin', 'Sales_admin'];

function stringifyMetadata(metadata) {
  if (!metadata) return null;
  try {
    return JSON.stringify(metadata);
  } catch (_) {
    return null;
  }
}

function parseMetadata(metadataJson) {
  if (!metadataJson) return null;
  if (typeof metadataJson === 'object') return metadataJson;
  try {
    return JSON.parse(metadataJson);
  } catch (_) {
    return null;
  }
}

function toNotificationJson(row) {
  const notification = typeof row.get === 'function' ? row.get({ plain: true }) : row;
  const currentUserState = Array.isArray(notification.user_states)
    ? notification.user_states[0]
    : null;

  return {
    ...notification,
    is_read: currentUserState ? currentUserState.is_read : notification.is_read,
    read_at: currentUserState ? currentUserState.read_at : notification.read_at,
    is_archived: currentUserState ? currentUserState.is_archived : notification.is_archived,
    archived_at: currentUserState ? currentUserState.archived_at : notification.archived_at,
    is_muted: currentUserState ? currentUserState.is_muted : notification.is_muted,
    muted_at: currentUserState ? currentUserState.muted_at : notification.muted_at,
    metadata: parseMetadata(notification.metadata_json),
    metadata_json: undefined,
    user_states: undefined,
  };
}

function toNotificationDetailJson(row) {
  const notification = toNotificationJson(row);
  const metadata = notification.metadata || {};

  return {
    notification,
    detail: {
      id: notification.notification_center_id,
      title: notification.title,
      message: notification.message,
      category: notification.category,
      type: notification.notification_type,
      priority: notification.priority,
      actor: {
        user_id: notification.actor_user_id || notification.actor?.id || null,
        name: notification.actor_name || notification.actor?.name || null,
        email: notification.actor?.email || null,
        avatar_url: notification.actor_avatar_url || null,
      },
      entity: {
        type: notification.entity_type,
        id: notification.entity_id,
      },
      action: {
        label: notification.action_label,
        url: notification.action_url,
        approve_api: metadata.approve_api || null,
        reject_api: metadata.reject_api || null,
      },
      state: {
        is_read: Boolean(notification.is_read),
        read_at: notification.read_at,
        is_archived: Boolean(notification.is_archived),
        archived_at: notification.archived_at,
        is_muted: Boolean(notification.is_muted),
        muted_at: notification.muted_at,
      },
      metadata,
      timeline: buildNotificationTimeline(notification),
      created_at: notification.created_at,
      updated_at: notification.updated_at,
      expires_at: notification.expires_at,
    },
  };
}

function buildNotificationTimeline(notification) {
  const timeline = [];

  if (notification.created_at) {
    timeline.push({
      label: 'Notification created',
      occurred_at: notification.created_at,
      type: 'created',
    });
  }

  if (notification.read_at) {
    timeline.push({
      label: 'Marked read',
      occurred_at: notification.read_at,
      type: 'read',
    });
  }

  if (notification.archived_at) {
    timeline.push({
      label: 'Archived',
      occurred_at: notification.archived_at,
      type: 'archived',
    });
  }

  if (notification.muted_at) {
    timeline.push({
      label: 'Muted similar',
      occurred_at: notification.muted_at,
      type: 'muted',
    });
  }

  return timeline;
}

function formatCurrency(value) {
  const numeric = Number(value || 0);
  return `$${numeric.toFixed(2)}`;
}

async function createNotification(recipientUserId, payload) {
  const notification = await db.notification_center.create({
    recipient_user_id: recipientUserId,
    recipient_scope: 'user',
    recipient_roles: null,
    notification_type: payload.notification_type || NOTIFICATION_CENTER_TYPES.GENERAL,
    category: payload.category || 'system',
    priority: payload.priority || 'medium',
    title: payload.title,
    message: payload.message || null,
    entity_type: payload.entity_type || null,
    entity_id: payload.entity_id || null,
    action_url: payload.action_url || null,
    action_label: payload.action_label || null,
    actor_user_id: payload.actor_user_id || null,
    actor_name: payload.actor_name || null,
    actor_avatar_url: payload.actor_avatar_url || null,
    metadata_json: stringifyMetadata(payload.metadata),
    expires_at: payload.expires_at || null,
    is_read: 0,
    is_archived: 0,
    is_muted: 0,
  });

  return toNotificationJson(notification);
}

async function createRoleNotification(recipientRoles, payload) {
  const normalizedRoles = [...new Set((recipientRoles || []).map(String).map(role => role.trim()).filter(Boolean))];
  if (!normalizedRoles.length) {
    return null;
  }

  const notification = await db.notification_center.create({
    recipient_user_id: null,
    recipient_scope: 'role',
    recipient_roles: normalizedRoles.join(','),
    notification_type: payload.notification_type || NOTIFICATION_CENTER_TYPES.GENERAL,
    category: payload.category || 'system',
    priority: payload.priority || 'medium',
    title: payload.title,
    message: payload.message || null,
    entity_type: payload.entity_type || null,
    entity_id: payload.entity_id || null,
    action_url: payload.action_url || null,
    action_label: payload.action_label || null,
    actor_user_id: payload.actor_user_id || null,
    actor_name: payload.actor_name || null,
    actor_avatar_url: payload.actor_avatar_url || null,
    metadata_json: stringifyMetadata(payload.metadata),
    expires_at: payload.expires_at || null,
    is_read: 0,
    is_archived: 0,
    is_muted: 0,
  });

  return toNotificationJson(notification);
}

async function createBulkNotifications(recipientUserIds, payload) {
  const uniqueUserIds = [...new Set((recipientUserIds || []).map(Number).filter(Boolean))];
  const results = {
    total: uniqueUserIds.length,
    created: 0,
    failed: 0,
    notifications: [],
  };

  for (const userId of uniqueUserIds) {
    try {
      const notification = await createNotification(userId, payload);
      results.created += 1;
      results.notifications.push(notification);
    } catch (error) {
      console.error(`Notification center create failed for user ${userId}:`, error);
      results.failed += 1;
    }
  }

  return results;
}

async function notifyAdmins(payload) {
  const notification = await createRoleNotification(ADMIN_ROLE_NAMES, payload);
  return {
    total: notification ? 1 : 0,
    created: notification ? 1 : 0,
    failed: notification ? 0 : 1,
    notifications: notification ? [notification] : [],
  };
}

async function notifyCpRegistrationApprovalRequired(params) {
  const {
    crewMemberId,
    name,
    email,
    location,
    roleName,
  } = params;

  const crewContext = await getCrewApprovalNotificationContext(crewMemberId);
  const displayName = name || crewContext.name || email || crewContext.email || `CP #${crewMemberId}`;
  const resolvedEmail = email || crewContext.email || null;
  const resolvedLocation = location || crewContext.location || null;
  const resolvedRoleName = roleName || crewContext.roleName || null;

  return notifyAdmins({
    notification_type: NOTIFICATION_CENTER_TYPES.CP_REGISTRATION_APPROVAL,
    category: 'approvals',
    priority: 'high',
    title: `New CP approval needed: ${displayName}`,
    message: `${displayName} registered as a Creative Partner and is waiting for approval.`,
    entity_type: 'crew_member',
    entity_id: crewMemberId,
    action_url: `/v1/admin/crew-member/${encodeURIComponent(String(crewMemberId))}`,
    action_label: 'Review CP',
    actor_name: displayName,
    metadata: {
      crew_member_id: crewMemberId,
      name: displayName,
      email: resolvedEmail,
      location: resolvedLocation,
      role_name: resolvedRoleName,
      review_api: `/v1/admin/crew-member/${crewMemberId}`,
      list_api: '/v1/admin/get-crew-members',
      approve_api: '/v1/admin/verify-crew-member',
      reject_api: '/v1/admin/verify-crew-member',
      approve_payload: {
        crew_member_id: crewMemberId,
        status: 1,
      },
      reject_payload: {
        crew_member_id: crewMemberId,
        status: 2,
      },
    },
  });
}

async function getCrewApprovalNotificationContext(crewMemberId) {
  if (!crewMemberId) {
    return {};
  }

  try {
    const crew = await db.crew_members.findByPk(crewMemberId, {
      attributes: ['crew_member_id', 'first_name', 'last_name', 'email', 'location', 'primary_role'],
      raw: true,
    });

    if (!crew) return {};

    const roleIds = parseRoleIds(crew.primary_role);
    let roleName = null;
    if (roleIds.length) {
      const roles = await db.crew_roles.findAll({
        where: { role_id: { [Op.in]: roleIds } },
        attributes: ['role_name'],
        raw: true,
      });
      roleName = roles.map((role) => role.role_name).filter(Boolean).join(', ') || null;
    }

    return {
      name: [crew.first_name, crew.last_name].filter(Boolean).join(' ').trim() || null,
      email: crew.email || null,
      location: crew.location || null,
      roleName,
    };
  } catch (error) {
    console.error('Failed to build CP notification context:', error);
    return {};
  }
}

function parseRoleIds(value) {
  if (!value) return [];

  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (Array.isArray(parsed)) {
      return parsed.map(Number).filter(Boolean);
    }
    const numeric = Number(parsed);
    return numeric ? [numeric] : [];
  } catch (_) {
    return String(value)
      .split(',')
      .map((entry) => Number(entry.trim()))
      .filter(Boolean);
  }
}

async function notifyQuoteChangeApprovalRequired(params) {
  const {
    activityId,
    quoteId,
    quoteNumber,
    clientName,
    requestType,
    previousTotal,
    newTotal,
    extraAmount,
    reducedAmount,
    requestedByUserId,
    requestedByName,
  } = params;

  const normalizedRequestType = requestType === 'decrease' ? 'decrease' : 'increase';
  const amount = normalizedRequestType === 'decrease'
    ? Number(reducedAmount || 0)
    : Number(extraAmount || 0);
  const quoteLabel = quoteNumber || (quoteId ? `Quote #${quoteId}` : 'Quote');

  return notifyAdmins({
    notification_type: NOTIFICATION_CENTER_TYPES.QUOTE_CHANGE_APPROVAL,
    category: 'approvals',
    priority: 'critical',
    title: `Quote ${normalizedRequestType} approval needed: ${quoteLabel}`,
    message: `${quoteLabel}${clientName ? ` for ${clientName}` : ''} has a ${normalizedRequestType} request of ${formatCurrency(amount)}.`,
    entity_type: 'sales_quote_activity',
    entity_id: activityId,
    action_url: `/sales/dashboard/quote-change-requests?approval_status=pending&request_type=${encodeURIComponent(normalizedRequestType)}&activity_id=${encodeURIComponent(String(activityId))}`,
    action_label: 'Review Request',
    actor_user_id: requestedByUserId || null,
    actor_name: requestedByName || null,
    metadata: {
      activity_id: activityId,
      quote_id: quoteId || null,
      quote_number: quoteNumber || null,
      client_name: clientName || null,
      request_type: normalizedRequestType,
      previous_total: Number(previousTotal || 0),
      new_total: Number(newTotal || 0),
      extra_amount: Number(extraAmount || 0),
      reduced_amount: Number(reducedAmount || 0),
      approve_api: '/v1/sales/dashboard/quote-change-requests/approve',
      reject_api: '/v1/sales/dashboard/quote-change-requests/reject',
    },
  });
}

async function listNotifications(userId, options = {}) {
  const page = Math.max(parseInt(options.page, 10) || 1, 1);
  const limit = Math.max(parseInt(options.limit, 10) || 20, 1);
  const offset = (page - 1) * limit;
  const userRole = await getUserRole(userId);

  const where = buildNotificationWhere(userId, userRole, options);

  if (options.category && options.category !== 'all') where.category = options.category;
  if (options.notificationType && options.notificationType !== 'all') {
    where.notification_type = options.notificationType;
  }

  const { count, rows } = await db.notification_center.findAndCountAll({
    where,
    include: [
      {
        model: db.users,
        as: 'actor',
        attributes: ['id', 'name', 'email'],
        required: false,
      },
      {
        model: db.notification_center_user_state,
        as: 'user_states',
        attributes: ['is_read', 'read_at', 'is_archived', 'archived_at', 'is_muted', 'muted_at'],
        where: { user_id: userId },
        required: false,
      },
    ],
    distinct: true,
    order: [['created_at', 'DESC'], ['notification_center_id', 'DESC']],
    limit,
    offset,
  });

  const unreadCount = await getUnreadCount(userId);

  return {
    notifications: rows.map(toNotificationJson),
    unread_count: unreadCount,
    pagination: {
      page,
      limit,
      total: count,
      total_pages: Math.ceil(count / limit),
      has_more: offset + rows.length < count,
    },
  };
}

async function getNotificationDetail(notificationId, userId) {
  const userRole = await getUserRole(userId);
  const notification = await db.notification_center.findOne({
    where: {
      notification_center_id: notificationId,
      ...buildNotificationWhere(userId, userRole, { archived: false }),
    },
    include: [
      {
        model: db.users,
        as: 'actor',
        attributes: ['id', 'name', 'email'],
        required: false,
      },
      {
        model: db.notification_center_user_state,
        as: 'user_states',
        attributes: ['is_read', 'read_at', 'is_archived', 'archived_at', 'is_muted', 'muted_at'],
        where: { user_id: userId },
        required: false,
      },
    ],
  });

  if (!notification) return null;
  return toNotificationDetailJson(notification);
}

async function getUnreadCount(userId) {
  const userRole = await getUserRole(userId);
  return db.notification_center.count({
    where: buildNotificationWhere(userId, userRole, { unreadOnly: true, archived: false }),
    distinct: true,
  });
}

async function markAsRead(notificationId, userId) {
  const canAccess = await canAccessNotification(notificationId, userId);
  if (!canAccess) return false;

  await upsertUserState(notificationId, userId, {
    is_read: 1,
    read_at: new Date(),
  });
  return true;
}

async function markAsUnread(notificationId, userId) {
  const canAccess = await canAccessNotification(notificationId, userId);
  if (!canAccess) return false;

  await upsertUserState(notificationId, userId, {
    is_read: 0,
    read_at: null,
  });
  return true;
}

async function markAllAsRead(userId) {
  const userRole = await getUserRole(userId);
  const notifications = await db.notification_center.findAll({
    where: buildNotificationWhere(userId, userRole, { unreadOnly: true, archived: false }),
    attributes: ['notification_center_id'],
    raw: true,
  });

  for (const notification of notifications) {
    await upsertUserState(notification.notification_center_id, userId, {
      is_read: 1,
      read_at: new Date(),
    });
  }

  return notifications.length;
}

async function archiveNotification(notificationId, userId) {
  const canAccess = await canAccessNotification(notificationId, userId);
  if (!canAccess) return false;

  await upsertUserState(notificationId, userId, {
    is_archived: 1,
    archived_at: new Date(),
  });
  return true;
}

async function muteSimilarNotifications(notificationId, userId) {
  const userRole = await getUserRole(userId);
  const notification = await db.notification_center.findOne({
    where: {
      notification_center_id: notificationId,
      ...buildNotificationWhere(userId, userRole, { archived: false, muted: false }),
    },
    attributes: ['notification_center_id', 'notification_type', 'category'],
    raw: true,
  });

  if (!notification) return null;

  const similarNotifications = await db.notification_center.findAll({
    where: {
      ...buildNotificationWhere(userId, userRole, { archived: false, muted: false }),
      notification_type: notification.notification_type,
      category: notification.category,
    },
    attributes: ['notification_center_id'],
    raw: true,
  });

  for (const item of similarNotifications) {
    await upsertUserState(item.notification_center_id, userId, {
      is_muted: 1,
      muted_at: new Date(),
    });
  }

  return {
    muted_count: similarNotifications.length,
    notification_type: notification.notification_type,
    category: notification.category,
  };
}

async function getUserRole(userId) {
  const user = await db.users.findByPk(userId, {
    include: [{
      model: db.user_type,
      as: 'userType',
      attributes: ['user_role'],
      required: false,
    }],
  });

  return user?.userType?.user_role || null;
}

function buildNotificationWhere(userId, userRole, options = {}) {
  const andConditions = [
    {
      [Op.or]: [
        { recipient_scope: 'all' },
        { recipient_scope: 'user', recipient_user_id: userId },
        userRole
          ? {
              [Op.and]: [
                { recipient_scope: 'role' },
                db.Sequelize.literal(`FIND_IN_SET(${db.sequelize.escape(String(userRole))}, recipient_roles) > 0`),
              ],
            }
          : null,
      ].filter(Boolean),
    },
    {
      [Op.or]: [
        { expires_at: null },
        { expires_at: { [Op.gt]: new Date() } },
      ],
    },
  ];

  if (options.archived) {
    andConditions.push(db.Sequelize.literal(`EXISTS (SELECT 1 FROM notification_center_user_state ncs WHERE ncs.notification_center_id = notification_center.notification_center_id AND ncs.user_id = ${Number(userId)} AND ncs.is_archived = 1)`));
  } else {
    andConditions.push(db.Sequelize.literal(`NOT EXISTS (SELECT 1 FROM notification_center_user_state ncs WHERE ncs.notification_center_id = notification_center.notification_center_id AND ncs.user_id = ${Number(userId)} AND ncs.is_archived = 1)`));
  }

  if (!options.muted) {
    andConditions.push(db.Sequelize.literal(`NOT EXISTS (SELECT 1 FROM notification_center_user_state ncs WHERE ncs.notification_center_id = notification_center.notification_center_id AND ncs.user_id = ${Number(userId)} AND ncs.is_muted = 1)`));
  }

  if (options.unreadOnly) {
    andConditions.push(db.Sequelize.literal(`NOT EXISTS (SELECT 1 FROM notification_center_user_state ncs WHERE ncs.notification_center_id = notification_center.notification_center_id AND ncs.user_id = ${Number(userId)} AND ncs.is_read = 1)`));
  }

  return { [Op.and]: andConditions };
}

async function canAccessNotification(notificationId, userId) {
  const userRole = await getUserRole(userId);
  const notification = await db.notification_center.findOne({
    where: {
      notification_center_id: notificationId,
      ...buildNotificationWhere(userId, userRole, { archived: false }),
    },
    attributes: ['notification_center_id'],
    raw: true,
  });

  return Boolean(notification);
}

async function upsertUserState(notificationId, userId, patch) {
  const now = new Date();
  const [state, created] = await db.notification_center_user_state.findOrCreate({
    where: {
      notification_center_id: notificationId,
      user_id: userId,
    },
    defaults: {
      notification_center_id: notificationId,
      user_id: userId,
      is_read: 0,
      is_archived: 0,
      is_muted: 0,
      created_at: now,
      updated_at: now,
      ...patch,
    },
  });

  if (!created) {
    await state.update({
      ...patch,
      updated_at: now,
    });
  }

  return state;
}

module.exports = {
  NOTIFICATION_CENTER_TYPES,
  createNotification,
  createRoleNotification,
  createBulkNotifications,
  notifyAdmins,
  notifyCpRegistrationApprovalRequired,
  notifyQuoteChangeApprovalRequired,
  listNotifications,
  getNotificationDetail,
  getUnreadCount,
  markAsRead,
  markAsUnread,
  markAllAsRead,
  archiveNotification,
  muteSimilarNotifications,
};
