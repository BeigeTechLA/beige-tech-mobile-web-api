const db = require('../models');
const emailService = require('../utils/emailService');

const DEFAULT_BASE_URL = process.env.INTERNAL_API_BASE_URL || 'http://localhost:5002/v1/comments';
const INTERNAL_KEY = process.env.EXTERNAL_CHAT_KEY || process.env.EXTERNAL_FILE_MANAGER_KEY || 'beige-internal-dev-key';

const buildHeaders = () => ({
  'Content-Type': 'application/json',
  'x-internal-key': INTERNAL_KEY,
});

const proxyRequest = async (path = '', options = {}) => {
  const response = await fetch(`${DEFAULT_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...buildHeaders(),
      ...(options.headers || {}),
    },
  });

  const responseText = await response.text();
  let payload = null;

  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch (error) {
      payload = {
        success: false,
        message: 'Invalid JSON response from comments service',
      };
    }
  }

  if (!response.ok) {
    const error = new Error(payload?.message || 'Comments request failed');
    error.status = response.status;
    error.payload = payload || {
      success: false,
      message: 'Comments request failed',
    };
    throw error;
  }

  return payload;
};

const normalizeUserId = (value) => {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number') {
    const normalized = String(value).trim();
    return normalized || null;
  }

  const nested = value.id ?? value.user_id ?? value._id ?? null;
  if (nested == null) return null;
  const normalized = String(nested).trim();
  return normalized || null;
};

const collectCommentUserIds = (comments = []) => {
  const collected = new Set();

  const visit = (comment) => {
    const normalizedId = normalizeUserId(comment?.userId);
    if (normalizedId) {
      collected.add(normalizedId);
    }

    (comment?.replies || []).forEach(visit);
  };

  comments.forEach(visit);
  return [...collected];
};

const loadUsersByIds = async (ids = []) => {
  const numericIds = ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
  if (!numericIds.length) return new Map();

  const users = await db.users.findAll({
    where: { id: numericIds },
    attributes: ['id', 'name', 'email', 'user_type'],
    include: [
      {
        model: db.user_type,
        as: 'userType',
        required: false,
        attributes: ['user_type_id', 'user_role'],
      },
    ],
  });

  return new Map(
    users.map((user) => {
      const plain = user.get({ plain: true });
      return [
        String(plain.id),
        {
          id: String(plain.id),
          name: plain.name || plain.email || String(plain.id),
          email: plain.email || null,
          role: plain.userType?.user_role || null,
          user_type: plain.user_type ?? plain.userType?.user_type_id ?? null,
          profile_picture: null,
        },
      ];
    })
  );
};

const enrichUserRef = (value, userMap) => {
  const normalizedId = normalizeUserId(value);
  if (normalizedId && userMap.has(normalizedId)) {
    return userMap.get(normalizedId);
  }

  if (value && typeof value === 'object') {
    return {
      id: normalizedId,
      name: value.name || value.email || normalizedId || 'Unknown User',
      email: value.email || null,
      role: value.role || null,
      user_type: value.user_type || null,
      profile_picture: value.profile_picture || null,
    };
  }

  return {
    id: normalizedId,
    name: normalizedId || 'Unknown User',
    email: null,
    role: null,
    user_type: null,
    profile_picture: null,
  };
};

const enrichComments = async (comments = []) => {
  const userMap = await loadUsersByIds(collectCommentUserIds(comments));

  const visit = (comment) => ({
    ...comment,
    userId: enrichUserRef(comment?.userId, userMap),
    replies: (comment?.replies || []).map(visit),
  });

  return comments.map(visit);
};

const normalizeEmailAddress = (value) => String(value || '').trim().toLowerCase();

const parseBookingIdFromFilepath = (filepath) => {
  const normalized = String(filepath || '').trim();
  if (!normalized) return null;

  const hashMatch = normalized.match(/#(\d+)/);
  if (hashMatch?.[1]) return Number(hashMatch[1]);

  return null;
};

const normalizePathSegmentKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const isEditedRevisionVersionPath = (filepath) => {
  const segments = String(filepath || '')
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .map(normalizePathSegmentKey)
    .filter(Boolean);

  const postProductionIndex = segments.indexOf('postproduction');
  if (postProductionIndex === -1) return false;

  return (
    segments[postProductionIndex + 1] === 'edits' &&
    segments[postProductionIndex + 2] === 'revisions' &&
    /^version0*[1-9]\d*$/.test(segments[postProductionIndex + 3] || '')
  );
};

const getEditedRevisionVersionLabel = (filepath) => {
  const segments = String(filepath || '')
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);

  return segments.find((segment) =>
    /^version\s*0*[1-9]\d*$/i.test(String(segment || '').replace(/[^a-z0-9]+/gi, ''))
  ) || '';
};

const getFileNameFromPath = (filepath) =>
  String(filepath || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';

const buildAdminDashboardUrl = () => {
  const frontendUrl = String(process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');
  if (!frontendUrl) return '';
  return `${frontendUrl}/admin/dashboard`;
};

const buildCreatorDashboardUrl = () => {
  const frontendUrl = String(process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');
  if (!frontendUrl) return '';
  return `${frontendUrl}/creator/dashboard`;
};

const parseRecipientEnvList = (...values) =>
  values
    .flatMap((value) => String(value || '').split(','))
    .map((value) => normalizeEmailAddress(value))
    .filter(Boolean);

const getAdminNotificationRecipients = () =>
  parseRecipientEnvList(
    process.env.REVISION_COMMENT_ADDED_ADMIN_EMAIL,
    process.env.FILES_FOR_EDITING_INTERNAL_TEAM_EMAIL,
    process.env.POST_PRODUCTION_TEAM_EMAIL,
    process.env.ADMIN_NOTIFICATION_EMAIL,
    process.env.SALES_NOTIFICATION_EMAIL
  );

const getBookingWithAssignedCrew = async (bookingId) => {
  if (!bookingId) return null;

  return db.stream_project_booking.findOne({
    where: {
      stream_project_booking_id: Number(bookingId),
      is_active: 1,
    },
    include: [
      {
        model: db.assigned_crew,
        as: 'assigned_crews',
        required: false,
        where: { is_active: 1 },
        include: [
          {
            model: db.crew_members,
            as: 'crew_member',
            required: false,
            attributes: ['crew_member_id', 'first_name', 'last_name', 'email'],
          },
        ],
      },
    ],
  });
};

const buildAssignedCreativePartnerRecipients = (booking) => {
  const seenEmails = new Set();
  const assignedCrews = Array.isArray(booking?.assigned_crews) ? booking.assigned_crews : [];

  return assignedCrews
    .map((assignment) => {
      const crew = assignment?.crew_member;
      const email = normalizeEmailAddress(crew?.email);
      if (!email || seenEmails.has(email)) return null;
      seenEmails.add(email);

      const name = [crew?.first_name, crew?.last_name].filter(Boolean).join(' ').trim() || 'Creative Partner';
      return {
        email,
        name,
        data: {
          first_name: name,
          recipient_name: name,
          frontend_url: buildCreatorDashboardUrl() || buildAdminDashboardUrl(),
        },
      };
    })
    .filter(Boolean);
};

const isClientCommentAuthor = (userRef) => {
  const role = String(userRef?.role || '').trim().toLowerCase();
  const userType = Number(userRef?.user_type);
  return role === 'client' || userType === 3;
};

const sendRevisionCommentAddedEmailIfNeeded = async ({ comment }) => {
  try {
    const filepath = String(comment?.fileMetaId || '').trim();
    if (!filepath || !isEditedRevisionVersionPath(filepath)) return;
    if (!isClientCommentAuthor(comment?.userId)) return;

    const bookingId = parseBookingIdFromFilepath(filepath);
    if (!bookingId) return;

    const booking = await getBookingWithAssignedCrew(bookingId);
    if (!booking) return;

    const plainBooking = typeof booking.get === 'function' ? booking.get({ plain: true }) : booking;
    const bookingReference = String(plainBooking?.stream_project_booking_id || bookingId);
    const projectName = String(
      plainBooking?.project_name ||
      plainBooking?.client_name ||
      `Booking #${bookingReference}`
    );
    const commenterName = String(comment?.userId?.name || comment?.userId?.email || 'Client');

    const recipients = [
      ...buildAssignedCreativePartnerRecipients(plainBooking),
      ...getAdminNotificationRecipients().map((email) => ({
        email,
        name: 'Admin',
        data: {
          first_name: 'Admin',
          recipient_name: 'Admin',
          frontend_url: buildAdminDashboardUrl(),
          dashboard_link: buildAdminDashboardUrl(),
        },
      })),
    ];

    const seenEmails = new Set();
    const uniqueRecipients = recipients.filter((recipient) => {
      const email = normalizeEmailAddress(recipient?.email);
      if (!email || seenEmails.has(email)) return false;
      seenEmails.add(email);
      return true;
    });
    if (!uniqueRecipients.length) return;

    const emailResult = await emailService.sendRevisionCommentAddedEmail({
      recipients: uniqueRecipients,
      data: {
        shoot_name: projectName,
        project_name: projectName,
        booking_id: bookingReference,
        order_id: bookingReference,
        file_name: getFileNameFromPath(filepath),
        current_version: getEditedRevisionVersionLabel(filepath),
        version: getEditedRevisionVersionLabel(filepath),
        comment: comment?.comment || '',
        commented_by: commenterName,
        comment_time: comment?.createdAt || new Date().toISOString(),
        created_at: comment?.createdAt || new Date().toISOString(),
        frontend_url: buildAdminDashboardUrl(),
        dashboard_link: buildAdminDashboardUrl(),
      },
    });

    if (!emailResult?.success) {
      console.error(
        'Revision comment added email failed:',
        emailResult?.error || emailResult?.failedRecipients || 'Unknown email error'
      );
    }
  } catch (error) {
    console.error('Revision comment added email trigger failed:', error?.message || error);
  }
};

exports.listComments = async (req, res) => {
  try {
    const query = new URLSearchParams();
    if (req.query.metaId) {
      query.set('metaId', String(req.query.metaId));
    }

    const result = await proxyRequest(query.toString() ? `?${query.toString()}` : '');
    const enriched = Array.isArray(result) ? await enrichComments(result) : result;
    return res.status(200).json(enriched);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.addComment = async (req, res) => {
  try {
    const result = await proxyRequest('', {
      method: 'POST',
      body: JSON.stringify(req.body || {}),
    });
    const enriched = result ? enrichUserRef({ ...(result.userId || {}), id: req.body?.user_id }, await loadUsersByIds([req.body?.user_id])) : result;
    const responsePayload = result ? { ...result, userId: enriched } : result;
    if (responsePayload) {
      await sendRevisionCommentAddedEmailIfNeeded({ comment: responsePayload });
    }
    return res.status(200).json(responsePayload);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.replyToComment = async (req, res) => {
  try {
    const result = await proxyRequest(`/${req.params.commentId}/reply`, {
      method: 'POST',
      body: JSON.stringify(req.body || {}),
    });
    const enriched = result ? enrichUserRef({ ...(result.userId || {}), id: req.body?.user_id }, await loadUsersByIds([req.body?.user_id])) : result;
    return res.status(200).json(result ? { ...result, userId: enriched } : result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.deleteComment = async (req, res) => {
  try {
    const result = await proxyRequest(`/${req.params.commentId}`, {
      method: 'DELETE',
      body: JSON.stringify(req.body || {}),
    });

    return res.status(200).json(result || {
      success: true,
      message: 'Comment deleted successfully',
    });
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};
