const { Op } = require('sequelize');
const db = require('../models');
const config = require('../config/config');

const VALID_ACTIONS = new Set(['created', 'deleted']);
const VALID_STAGES = new Set(['pre_production', 'post_production']);
const WEB_API_2_HISTORY_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.WEB_API_2_HISTORY_TIMEOUT_MS || 5000)
);
const WEB_API_2_HISTORY_PAGE_LIMIT = Math.max(
  1,
  Math.min(100, Number.parseInt(process.env.WEB_API_2_HISTORY_PAGE_LIMIT || '100', 10))
);
const WEB_API_2_HISTORY_MAX_PAGES = Math.max(
  1,
  Number.parseInt(process.env.WEB_API_2_HISTORY_MAX_PAGES || '100', 10)
);

const normalizeAction = (value) => {
  const action = String(value || '').trim().toLowerCase();
  return VALID_ACTIONS.has(action) ? action : null;
};

const normalizeStage = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_');

  if (['pre', 'preproduction', 'pre_production'].includes(normalized)) return 'pre_production';
  if (['post', 'postproduction', 'post_production'].includes(normalized)) return 'post_production';
  return null;
};

const normalizePositiveInteger = (value, fallback, max = null) => {
  const parsed = Number.parseInt(value, 10);
  const nextValue = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return max ? Math.min(nextValue, max) : nextValue;
};

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

const parseEndDate = (value) => {
  const date = parseDate(value);
  if (!date) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim())) {
    date.setHours(23, 59, 59, 999);
  }
  return date;
};

const toPlainLog = (value) => {
  if (!value) return {};
  if (typeof value.get === 'function') return value.get({ plain: true });
  return value;
};

const normalizeLogEntry = (entry, source) => {
  const plain = toPlainLog(entry);
  const performedBy =
    plain.performedBy ||
    plain.performed_by ||
    plain.performed_by_name ||
    plain.performedByName ||
    null;

  return {
    id: plain.id || plain._id || plain.activity_id || null,
    source,
    clientId: plain.clientId || plain.client_id || null,
    clientName: plain.clientName || plain.client_name || null,
    action: normalizeAction(plain.action),
    folderName: plain.folderName || plain.folder_name || null,
    stage: normalizeStage(plain.stage),
    performedByUserId: plain.performedByUserId || plain.performed_by_user_id || null,
    performedBy,
    performedByName: plain.performedByName || plain.performed_by_name || performedBy,
    createdAt: plain.createdAt || plain.created_at || null,
  };
};

const normalizeHistoryResponseLogs = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.logs)) return payload.data.logs;
  if (Array.isArray(payload?.logs)) return payload.logs;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
};

const buildHistoryFilterParams = (filters = {}) => {
  const params = new URLSearchParams();
  const filterKeys = ['clientId', 'stage', 'action', 'startDate', 'endDate', 'fromDate', 'toDate', 'dateFrom', 'dateTo'];

  for (const key of filterKeys) {
    const value = filters[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      params.set(key, String(value).trim());
    }
  }

  return params;
};

const fetchWebApi2HistoryPage = async (baseUrl, params, page, authorization) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEB_API_2_HISTORY_TIMEOUT_MS);

  try {
    const pageParams = new URLSearchParams(params);
    pageParams.set('page', String(page));
    pageParams.set('limit', String(WEB_API_2_HISTORY_PAGE_LIMIT));

    const headers = {
      'Content-Type': 'application/json',
    };
    if (process.env.EXTERNAL_FILE_MANAGER_KEY) {
      headers['x-internal-key'] = process.env.EXTERNAL_FILE_MANAGER_KEY;
    }
    if (authorization) {
      headers.Authorization = authorization;
    }

    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/history?${pageParams.toString()}`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(payload?.message || `web-api-2 history request failed with ${response.status}`);
    }

    return payload || {};
  } finally {
    clearTimeout(timeout);
  }
};

const fetchWebApi2HistoryLogs = async (filters = {}, options = {}) => {
  const baseUrl = String(config.externalServices?.webApi2BaseUrl || '').trim();
  if (!baseUrl) return [];

  const params = buildHistoryFilterParams(filters);
  const logs = [];
  let totalPages = 1;

  for (let page = 1; page <= Math.min(totalPages, WEB_API_2_HISTORY_MAX_PAGES); page += 1) {
    const payload = await fetchWebApi2HistoryPage(baseUrl, params, page, options.authorization);
    const pageLogs = normalizeHistoryResponseLogs(payload);
    logs.push(...pageLogs);

    const pagination = payload?.pagination || payload?.data?.pagination || {};
    const nextTotalPages = Number.parseInt(pagination.totalPages || pagination.total_pages, 10);
    totalPages = Number.isFinite(nextTotalPages) && nextTotalPages > 0
      ? nextTotalPages
      : page + (pageLogs.length >= WEB_API_2_HISTORY_PAGE_LIMIT ? 1 : 0);

    if (!pageLogs.length || page >= totalPages) break;
  }

  return logs;
};

const recordFileActivity = async ({
  clientId,
  clientName,
  action,
  folderName,
  stage,
  performedByUserId,
  performedByName,
}) => {
  const normalizedAction = normalizeAction(action);
  const normalizedStage = normalizeStage(stage);
  const normalizedFolderName = String(folderName || '').trim();

  if (!normalizedAction || !normalizedStage || !normalizedFolderName) {
    return null;
  }

  return db.file_activity_logs.create({
    client_id: clientId ? String(clientId).trim() : null,
    client_name: clientName ? String(clientName).trim() : null,
    action: normalizedAction,
    folder_name: normalizedFolderName,
    stage: normalizedStage,
    performed_by_user_id: performedByUserId || null,
    performed_by_name: performedByName ? String(performedByName).trim() : null,
  });
};

const listLocalFileActivityHistory = async (filters = {}) => {
  const where = {};

  if (filters.clientId) {
    where.client_id = String(filters.clientId).trim();
  }

  const stage = normalizeStage(filters.stage);
  if (stage) {
    where.stage = stage;
  }

  const action = normalizeAction(filters.action);
  if (action) {
    where.action = action;
  }

  const startDate = parseDate(filters.startDate || filters.fromDate || filters.dateFrom);
  const endDate = parseEndDate(filters.endDate || filters.toDate || filters.dateTo);
  if (startDate || endDate) {
    where.created_at = {};
    if (startDate) where.created_at[Op.gte] = startDate;
    if (endDate) where.created_at[Op.lte] = endDate;
  }

  return db.file_activity_logs.findAll({
    where,
    order: [['created_at', 'DESC']],
  });
};

const listFileActivityHistory = async (filters = {}, options = {}) => {
  const page = normalizePositiveInteger(filters.page, 1);
  const limit = normalizePositiveInteger(filters.limit, 25, 100);
  const offset = (page - 1) * limit;

  const localLogs = (await listLocalFileActivityHistory(filters))
    .map((entry) => normalizeLogEntry(entry, 'web-api'));
  let remoteLogs = [];
  let remoteError = null;

  try {
    remoteLogs = (await fetchWebApi2HistoryLogs(filters, options))
      .map((entry) => normalizeLogEntry(entry, 'web-api-2'));
  } catch (error) {
    remoteError = error;
    console.warn('Failed to fetch web-api-2 file activity history:', error?.message || error);
  }

  const logs = [...localLogs, ...remoteLogs]
    .filter((entry) => entry.action && entry.stage && entry.folderName)
    .sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });
  const count = logs.length;

  return {
    logs: logs.slice(offset, offset + limit),
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    },
    sources: {
      webApi: {
        total: localLogs.length,
      },
      webApi2: {
        total: remoteLogs.length,
        available: !remoteError,
      },
    },
  };
};

module.exports = {
  normalizeStage,
  recordFileActivity,
  listFileActivityHistory,
};
