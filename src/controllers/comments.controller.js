const db = require('../models');

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

  const payload = await response.json().catch(() => ({
    success: false,
    message: 'Invalid JSON response from comments service',
  }));

  if (!response.ok) {
    const error = new Error(payload.message || 'Comments request failed');
    error.status = response.status;
    error.payload = payload;
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
    return res.status(200).json(result ? { ...result, userId: enriched } : result);
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

    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};
