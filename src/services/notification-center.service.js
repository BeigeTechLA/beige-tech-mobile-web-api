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
  return {
    ...notification,
    metadata: parseMetadata(notification.metadata_json),
    metadata_json: undefined,
  };
}

function formatCurrency(value) {
  const numeric = Number(value || 0);
  return `$${numeric.toFixed(2)}`;
}

async function getAdminUserIds() {
  const adminTypes = await db.user_type.findAll({
    where: {
      user_role: { [Op.in]: ADMIN_ROLE_NAMES },
      is_active: 1,
    },
    attributes: ['user_type_id'],
    raw: true,
  });

  const adminTypeIds = adminTypes.map((type) => Number(type.user_type_id)).filter(Boolean);
  if (!adminTypeIds.length) return [];

  const adminUsers = await db.users.findAll({
    where: {
      user_type: { [Op.in]: adminTypeIds },
      is_active: 1,
    },
    attributes: ['id'],
    raw: true,
  });

  return adminUsers.map((user) => Number(user.id)).filter(Boolean);
}

async function createNotification(recipientUserId, payload) {
  const notification = await db.notification_center.create({
    recipient_user_id: recipientUserId,
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
  const adminUserIds = await getAdminUserIds();
  if (!adminUserIds.length) {
    console.warn(`No active admin users found for notification center item: ${payload.title}`);
    return { total: 0, created: 0, failed: 0, notifications: [] };
  }

  return createBulkNotifications(adminUserIds, payload);
}

async function notifyCpRegistrationApprovalRequired(params) {
  const {
    crewMemberId,
    name,
    email,
    location,
    roleName,
  } = params;

  const displayName = name || email || `CP #${crewMemberId}`;

  return notifyAdmins({
    notification_type: NOTIFICATION_CENTER_TYPES.CP_REGISTRATION_APPROVAL,
    category: 'approvals',
    priority: 'high',
    title: `New CP approval needed: ${displayName}`,
    message: `${displayName} registered as a Creative Partner and is waiting for approval.`,
    entity_type: 'crew_member',
    entity_id: crewMemberId,
    action_url: `/admin/creative-partners?status=pending&crew_member_id=${encodeURIComponent(String(crewMemberId))}`,
    action_label: 'Review CP',
    actor_name: displayName,
    metadata: {
      crew_member_id: crewMemberId,
      name: displayName,
      email: email || null,
      location: location || null,
      role_name: roleName || null,
      approve_api: '/v1/admin/verify-crew-member',
      reject_api: '/v1/admin/verify-crew-member',
    },
  });
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

  const where = {
    recipient_user_id: userId,
    is_archived: options.archived ? 1 : 0,
    [Op.or]: [
      { expires_at: null },
      { expires_at: { [Op.gt]: new Date() } },
    ],
  };

  if (options.unreadOnly) where.is_read = 0;
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
    ],
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

async function getUnreadCount(userId) {
  return db.notification_center.count({
    where: {
      recipient_user_id: userId,
      is_read: 0,
      is_archived: 0,
      [Op.or]: [
        { expires_at: null },
        { expires_at: { [Op.gt]: new Date() } },
      ],
    },
  });
}

async function markAsRead(notificationId, userId) {
  const [updatedCount] = await db.notification_center.update(
    { is_read: 1, read_at: new Date(), updated_at: new Date() },
    {
      where: {
        notification_center_id: notificationId,
        recipient_user_id: userId,
      },
    }
  );

  return updatedCount > 0;
}

async function markAllAsRead(userId) {
  const [updatedCount] = await db.notification_center.update(
    { is_read: 1, read_at: new Date(), updated_at: new Date() },
    {
      where: {
        recipient_user_id: userId,
        is_read: 0,
      },
    }
  );

  return updatedCount;
}

async function archiveNotification(notificationId, userId) {
  const [updatedCount] = await db.notification_center.update(
    { is_archived: 1, archived_at: new Date(), updated_at: new Date() },
    {
      where: {
        notification_center_id: notificationId,
        recipient_user_id: userId,
      },
    }
  );

  return updatedCount > 0;
}

module.exports = {
  NOTIFICATION_CENTER_TYPES,
  createNotification,
  createBulkNotifications,
  notifyAdmins,
  notifyCpRegistrationApprovalRequired,
  notifyQuoteChangeApprovalRequired,
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  archiveNotification,
};
