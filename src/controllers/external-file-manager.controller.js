const DEFAULT_BASE_URL = process.env.EXTERNAL_FILE_MANAGER_API_BASE_URL || 'http://localhost:5002/v1/external-file-manager';
const PUBLIC_BASE_URL = process.env.EXTERNAL_FILE_MANAGER_PUBLIC_BASE_URL || '';
const INTERNAL_KEY = process.env.EXTERNAL_FILE_MANAGER_KEY || 'beige-internal-dev-key';
const db = require('../models');
const { users, crew_members, assigned_crew, stream_project_booking } = db;
const bookingTimelineService = require('../services/bookingTimeline.service');

const FACE_SCAN_SERVICE_URL = process.env.FACE_SCAN_SERVICE_URL || '';
const FACE_SCAN_PROVIDER_TIMEOUT_MS = Math.max(15000, Number(process.env.FACE_SCAN_PROVIDER_TIMEOUT_MS || 300000));
const FACE_SCAN_MAX_CANDIDATES = Math.max(25, Number(process.env.FACE_SCAN_MAX_CANDIDATES || 80));
const FACE_SCAN_INDEX_CONCURRENCY = Math.max(1, Number(process.env.FACE_SCAN_INDEX_CONCURRENCY || 3));
const EXTERNAL_FILE_MANAGER_PROXY_TIMEOUT_MS = Math.max(
  15000,
  Number(process.env.EXTERNAL_FILE_MANAGER_PROXY_TIMEOUT_MS || 300000)
);
const COMMON_EVENT_ID_PREFIX = 'event_';
let commonEventsTableReadyPromise = null;
let commonEventCreatorFoldersTableReadyPromise = null;
let faceEmbeddingsTableReadyPromise = null;

const buildHeaders = () => ({
  'Content-Type': 'application/json',
  'x-internal-key': INTERNAL_KEY,
});

const INTERNAL_FILE_MANAGER_ORIGIN = (() => {
  try {
    return new URL(DEFAULT_BASE_URL).origin.toLowerCase();
  } catch (error) {
    return '';
  }
})();

const PUBLIC_FILE_MANAGER_ORIGIN = (() => {
  try {
    if (!PUBLIC_BASE_URL) return '';
    return new URL(PUBLIC_BASE_URL).origin;
  } catch (error) {
    return '';
  }
})();

const shouldRewriteToPublicOrigin = (origin, hostname) => {
  const normalizedHostname = String(hostname || '').toLowerCase();
  const isLocalHost =
    normalizedHostname === 'localhost' ||
    normalizedHostname === '127.0.0.1' ||
    normalizedHostname === '::1';

  if (isLocalHost) return true;
  if (INTERNAL_FILE_MANAGER_ORIGIN && String(origin || '').toLowerCase() === INTERNAL_FILE_MANAGER_ORIGIN) {
    return true;
  }
  return false;
};

const rewriteExternalServiceUrl = (rawUrl) => {
  const value = String(rawUrl || '').trim();
  if (!value) return value;
  if (!PUBLIC_FILE_MANAGER_ORIGIN) return value;

  try {
    const parsed = new URL(value);
    if (!shouldRewriteToPublicOrigin(parsed.origin, parsed.hostname)) {
      return value;
    }
    return `${PUBLIC_FILE_MANAGER_ORIGIN}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch (error) {
    return value;
  }
};

const withPublicUrl = (result) => {
  const currentUrl = result?.data?.url;
  if (typeof currentUrl !== 'string') return result;

  return {
    ...result,
    data: {
      ...(result.data || {}),
      url: rewriteExternalServiceUrl(currentUrl),
    },
  };
};

const getRequestUserId = (req) => req.userId || req.user?.userId || null;
const getRequestUserRole = (req) => req.userRole || req.user?.userRole || null;
const getNormalizedRequestUserRole = (req) => String(getRequestUserRole(req) || '').trim().toLowerCase();
const isAdminRole = (req) => ['admin', 'super_admin', 'superadmin', 'sales_admin'].includes(getNormalizedRequestUserRole(req));
const isCreatorRole = (req) => {
  const role = getNormalizedRequestUserRole(req);
  return ['creator', 'creative', 'Creative'].includes(role);
};
const isCommonEventExternalId = (value) =>
  String(value || '').trim().toLowerCase().startsWith(COMMON_EVENT_ID_PREFIX);

const extractCommonEventExternalIdFromPath = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  const match = normalized.match(/(event_[a-z0-9_]+)/);
  return match?.[1] || null;
};

const normalizeForPathMatch = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const parseBookingIdFromFilepath = (filepath) => {
  const normalized = String(filepath || '').trim();
  if (!normalized) return null;

  const hashMatch = normalized.match(/#(\d+)/);
  if (hashMatch?.[1]) {
    return Number(hashMatch[1]);
  }

  return null;
};

const ensureCommonEventsTable = async () => {
  if (!commonEventsTableReadyPromise) {
    commonEventsTableReadyPromise = db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS file_manager_common_events (
        event_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        event_name VARCHAR(255) NOT NULL,
        event_slug VARCHAR(255) NOT NULL,
        workspace_external_id VARCHAR(128) NOT NULL,
        root_path VARCHAR(1024) DEFAULT NULL,
        created_by_user_id BIGINT UNSIGNED DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (event_id),
        UNIQUE KEY uq_event_workspace_external_id (workspace_external_id),
        KEY idx_event_slug (event_slug),
        KEY idx_event_created_by (created_by_user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  await commonEventsTableReadyPromise;
};

const ensureCommonEventCreatorFoldersTable = async () => {
  if (!commonEventCreatorFoldersTableReadyPromise) {
    commonEventCreatorFoldersTableReadyPromise = db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS file_manager_common_event_creator_folders (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        workspace_external_id VARCHAR(128) NOT NULL,
        phase VARCHAR(16) NOT NULL DEFAULT 'pre',
        folder_path VARCHAR(1024) NOT NULL,
        folder_path_hash CHAR(64) AS (SHA2(folder_path, 256)) STORED,
        created_by_user_id BIGINT UNSIGNED NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_common_event_creator_folder (workspace_external_id, phase, folder_path_hash),
        KEY idx_common_event_creator_user (created_by_user_id),
        KEY idx_common_event_creator_workspace (workspace_external_id),
        KEY idx_common_event_creator_folder_path (folder_path(191))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  await commonEventCreatorFoldersTableReadyPromise;
};

const ensureFaceEmbeddingsTable = async () => {
  if (!faceEmbeddingsTableReadyPromise) {
    faceEmbeddingsTableReadyPromise = db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS file_manager_face_embeddings (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        external_id VARCHAR(128) NOT NULL,
        filepath VARCHAR(1024) NOT NULL,
        filepath_hash CHAR(64) AS (SHA2(filepath, 256)) STORED,
        embedding_json LONGTEXT NOT NULL,
        faces_count INT UNSIGNED NOT NULL DEFAULT 0,
        status VARCHAR(24) NOT NULL DEFAULT 'ready',
        error_message VARCHAR(255) DEFAULT NULL,
        indexed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_face_embedding_filepath (filepath_hash),
        KEY idx_face_embedding_external_status (external_id, status),
        KEY idx_face_embedding_updated (updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  await faceEmbeddingsTableReadyPromise;
};

const toEventSlug = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

const buildCommonEventExternalId = (eventName) => {
  const slug = toEventSlug(eventName) || 'event';
  return `${COMMON_EVENT_ID_PREFIX}${slug}_${Date.now()}`.slice(0, 120);
};

const listCommonEventRows = async () => {
  await ensureCommonEventsTable();

  const [rows] = await db.sequelize.query(`
    SELECT
      event_id,
      event_name,
      event_slug,
      workspace_external_id,
      root_path,
      created_by_user_id,
      created_at,
      updated_at
    FROM file_manager_common_events
    ORDER BY created_at DESC
  `);

  return Array.isArray(rows) ? rows : [];
};

const deleteCommonEventRowsByExternalId = async (externalId) => {
  const normalizedExternalId = String(externalId || '').trim().toLowerCase();
  if (!normalizedExternalId) return;

  await ensureCommonEventsTable();
  await ensureCommonEventCreatorFoldersTable();

  await db.sequelize.query(
    'DELETE FROM file_manager_common_event_creator_folders WHERE workspace_external_id = ?',
    { replacements: [normalizedExternalId] }
  );
  await db.sequelize.query(
    'DELETE FROM file_manager_common_events WHERE workspace_external_id = ?',
    { replacements: [normalizedExternalId] }
  );
  await ensureFaceEmbeddingsTable().catch(() => null);
  await db.sequelize
    .query('DELETE FROM file_manager_face_embeddings WHERE external_id = ?', {
      replacements: [normalizedExternalId],
    })
    .catch(() => null);
};

const findCommonEventByFilepath = async (filepath) => {
  const normalizedPath = String(filepath || '').trim().toLowerCase();
  if (!normalizedPath) return null;

  const rows = await listCommonEventRows();
  const pathTokens = normalizeForPathMatch(normalizedPath);

  return (
    rows.find((row) => {
      const externalId = String(row.workspace_external_id || '').trim().toLowerCase();
      const folderName = `event - ${String(row.event_name || '').trim().toLowerCase()}`;
      const folderTokens = normalizeForPathMatch(folderName);

      return (
        (externalId && normalizedPath.includes(externalId)) ||
        (folderName && normalizedPath.includes(folderName)) ||
        (folderTokens && pathTokens.includes(folderTokens))
      );
    }) || null
  );
};

const getUserDisplayName = async (userId) => {
  if (!userId) return null;
  const user = await users.findByPk(userId, {
    attributes: ['id', 'name', 'email'],
  });

  const nameCandidate = user?.name || user?.email || '';
  return String(nameCandidate || '').trim() || null;
};

const sanitizeFolderName = (value, fallback = 'Folder') => {
  const raw = String(value || '').trim();
  const safe = raw.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
  return (safe || fallback).slice(0, 120);
};

const sanitizeRelativeFolderPath = (value) =>
  String(value || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => sanitizeFolderName(segment, ''))
    .filter(Boolean)
    .join('/');

const normalizePathForAccess = (value) =>
  String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/+/g, '/')
    .trim();

const normalizeWorkspacePhase = (value, fallback = null) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');

  if (['pre', 'pre-production', 'preproduction'].includes(normalized)) return 'pre';
  if (['post', 'post-production', 'postproduction'].includes(normalized)) return 'post';
  return fallback;
};

const extractPhaseAndRelativePath = (value, fallbackPhase = null) => {
  const normalizedPath = normalizePathForAccess(value);
  if (!normalizedPath) {
    return {
      phase: fallbackPhase,
      relativePath: '',
    };
  }

  const segments = normalizedPath.split('/').filter(Boolean);
  const phaseIndex = segments.findIndex((segment) => {
    const normalizedSegment = String(segment || '').trim().toLowerCase();
    return normalizedSegment === 'pre-production' || normalizedSegment === 'post-production';
  });

  if (phaseIndex === -1) {
    return {
      phase: fallbackPhase,
      relativePath: normalizedPath,
    };
  }

  const phaseSegment = String(segments[phaseIndex] || '').toLowerCase();
  const phase = phaseSegment === 'post-production' ? 'post' : 'pre';
  const relativePath = segments.slice(phaseIndex + 1).join('/');

  return {
    phase,
    relativePath: normalizePathForAccess(relativePath),
  };
};

const isPathWithin = (basePath, candidatePath) => {
  const base = normalizePathForAccess(basePath);
  const candidate = normalizePathForAccess(candidatePath);
  if (!base || !candidate) return false;
  return candidate === base || candidate.startsWith(`${base}/`);
};

const listCreatorCommonEventFolders = async ({ eventExternalId, userId, phase = null }) => {
  if (!eventExternalId || !userId) return [];

  await ensureCommonEventCreatorFoldersTable();
  const replacements = [String(eventExternalId).trim().toLowerCase(), Number(userId)];
  let sql = `
    SELECT workspace_external_id, phase, folder_path, created_by_user_id
    FROM file_manager_common_event_creator_folders
    WHERE workspace_external_id = ?
      AND created_by_user_id = ?
  `;

  if (phase) {
    sql += ' AND phase = ?';
    replacements.push(String(phase).trim().toLowerCase());
  }

  const [rows] = await db.sequelize.query(sql, { replacements });
  return Array.isArray(rows) ? rows : [];
};

const ensureCreatorCommonEventRelativePathAccess = async ({
  req,
  eventExternalId,
  phase,
  relativePath,
  allowRoot = false,
  allowAncestorNavigation = false,
}) => {
  if (!isCreatorRole(req)) return;

  const normalizedEventExternalId = String(eventExternalId || '').trim().toLowerCase();
  if (!isCommonEventExternalId(normalizedEventExternalId)) return;

  const userId = getRequestUserId(req);
  if (!userId) {
    const error = new Error('Creator profile not found');
    error.status = 403;
    throw error;
  }

  const normalizedPhase = normalizeWorkspacePhase(phase, null);
  const normalizedRelativePath = normalizePathForAccess(relativePath);
  const creatorFolders = await listCreatorCommonEventFolders({
    eventExternalId: normalizedEventExternalId,
    userId,
    phase: normalizedPhase || null,
  });
  const allowedRoots = creatorFolders.map((row) => normalizePathForAccess(row.folder_path)).filter(Boolean);

  if (!allowedRoots.length) {
    const phaseLabel = normalizedPhase === 'post' ? 'Post-Production' : 'Pre-Production';
    const error = new Error(
      `Please create your own folder first, then access ${phaseLabel} in this common event`
    );
    error.status = 403;
    throw error;
  }

  if (!normalizedRelativePath) {
    if (allowRoot) return;
    const error = new Error('Folder path is required');
    error.status = 400;
    throw error;
  }

  const hasPathAccess = allowedRoots.some((rootPath) => {
    if (isPathWithin(rootPath, normalizedRelativePath)) return true;
    if (allowAncestorNavigation && isPathWithin(normalizedRelativePath, rootPath)) return true;
    return false;
  });
  if (!hasPathAccess) {
    const error = new Error('You can access only your own common event folder/files');
    error.status = 403;
    throw error;
  }
};

const ensureCreatorCommonEventFileAccess = async (req, filepath) => {
  if (!isCreatorRole(req)) return false;

  const normalizedFilepath = String(filepath || '').trim();
  if (!normalizedFilepath) return false;

  let eventExternalId = extractCommonEventExternalIdFromPath(normalizedFilepath);
  if (!eventExternalId) {
    const row = await findCommonEventByFilepath(normalizedFilepath);
    eventExternalId = row?.workspace_external_id || null;
  }

  if (!isCommonEventExternalId(eventExternalId)) return false;

  const { phase, relativePath } = extractPhaseAndRelativePath(normalizedFilepath);
  await ensureCreatorCommonEventRelativePathAccess({
    req,
    eventExternalId,
    phase,
    relativePath,
    allowRoot: false,
  });

  return true;
};

const getRelativePathForEntry = (entry, parentPath = '') => {
  const directPath = normalizePathForAccess(entry?.path || '');
  if (directPath) {
    const fromDirectPath = extractPhaseAndRelativePath(directPath).relativePath || directPath;
    return normalizePathForAccess(fromDirectPath);
  }

  const name = normalizePathForAccess(entry?.name || '');
  if (!name) return '';
  const parent = normalizePathForAccess(parentPath);
  return normalizePathForAccess(parent ? `${parent}/${name}` : name);
};

const isImageLikeFile = (file = {}) => {
  const contentType = String(file.contentType || '').toLowerCase();
  if (contentType.startsWith('image/')) return true;

  const fileName = String(file.name || file.path || '').toLowerCase();
  return /\.(jpg|jpeg|png|webp|heic|heif|bmp)$/i.test(fileName);
};

const isImageLikePath = (filepath = '') =>
  /\.(jpg|jpeg|png|webp|heic|heif|bmp)$/i.test(String(filepath || '').toLowerCase());

const parseExternalIdFromFilepath = (filepath = '') => {
  const commonEventExternalId = extractCommonEventExternalIdFromPath(filepath);
  if (commonEventExternalId) return commonEventExternalId;

  const bookingId = parseBookingIdFromFilepath(filepath);
  if (bookingId) return String(bookingId);
  return '';
};

const cosineSimilarity = (vectorA = [], vectorB = []) => {
  if (!Array.isArray(vectorA) || !Array.isArray(vectorB)) return 0;
  if (!vectorA.length || !vectorB.length || vectorA.length !== vectorB.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vectorA.length; i += 1) {
    const a = Number(vectorA[i] || 0);
    const b = Number(vectorB[i] || 0);
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB) + 1e-8;
  const rawScore = dot / denominator;
  const normalized = (rawScore + 1) / 2;
  return Math.max(0, Math.min(1, normalized));
};

const getBestFacePairScore = (queryEmbeddings = [], candidateEmbeddings = []) => {
  let bestScore = 0;
  let bestQueryIndex = -1;
  let bestCandidateIndex = -1;

  queryEmbeddings.forEach((queryEmbedding, queryIndex) => {
    candidateEmbeddings.forEach((candidateEmbedding, candidateIndex) => {
      const score = cosineSimilarity(queryEmbedding, candidateEmbedding);
      if (score > bestScore) {
        bestScore = score;
        bestQueryIndex = queryIndex;
        bestCandidateIndex = candidateIndex;
      }
    });
  });

  return {
    score: bestScore,
    queryFaceIndex: bestQueryIndex,
    candidateFaceIndex: bestCandidateIndex,
  };
};

const toEmbeddingArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

const runWithConcurrency = async (items = [], concurrency = 3, task = async () => null) => {
  const workers = Math.max(1, Number(concurrency) || 1);
  let index = 0;

  const runWorker = async () => {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      await task(items[currentIndex], currentIndex);
    }
  };

  await Promise.all(Array.from({ length: Math.min(workers, items.length || 1) }, runWorker));
};

const toPositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
};

const limitFaceScanCandidates = (candidates = [], limit = FACE_SCAN_MAX_CANDIDATES) =>
  (Array.isArray(candidates) ? candidates : []).slice(0, toPositiveInteger(limit, FACE_SCAN_MAX_CANDIDATES));

const fetchWorkspaceFiles = async (externalId, phase, path) => {
  const query = new URLSearchParams();
  if (phase) query.set('phase', phase);
  if (path) query.set('path', path);

  return proxyRequest(
    `/workspace/${encodeURIComponent(String(externalId))}/files${query.toString() ? `?${query.toString()}` : ''}`
  );
};

const collectWorkspaceImageCandidates = async (externalId) => {
  const collected = new Map();
  const phases = ['pre', 'post'];

  await Promise.allSettled(
    phases.map(async (phase) => {
      const rootListing = await fetchWorkspaceFiles(externalId, phase);
      const rootFiles = rootListing?.data?.files || [];
      const rootFolders = rootListing?.data?.folders || [];

      rootFiles.filter(isImageLikeFile).forEach((file) => {
        if (!file?.path) return;
        collected.set(file.path, {
          path: file.path,
          name: file.name,
          contentType: file.contentType,
          phase,
        });
      });

      await Promise.allSettled(
        rootFolders.map(async (folder) => {
          try {
            const nestedListing = await fetchWorkspaceFiles(externalId, phase, folder.name);
            (nestedListing?.data?.files || []).filter(isImageLikeFile).forEach((file) => {
              if (!file?.path) return;
              collected.set(file.path, {
                path: file.path,
                name: file.name,
                contentType: file.contentType,
                phase,
                folder: folder.name,
              });
            });
          } catch (error) {
            // Skip unreadable folders to keep scan flow resilient.
          }
        })
      );
    })
  );

  return [...collected.values()];
};

const enrichCandidatesWithViewUrls = async (candidates = []) => {
  const enriched = await Promise.all(
    (candidates || []).map(async (candidate) => {
      if (!candidate?.path) return candidate;

      try {
        const view = await proxyRequest('/file-view-url', {
          method: 'POST',
          body: JSON.stringify({
            filepath: candidate.path,
          }),
        });

        return {
          ...candidate,
          url: view?.data?.url || null,
        };
      } catch (error) {
        return {
          ...candidate,
          url: null,
        };
      }
    })
  );

  return enriched.filter((candidate) => candidate?.url);
};

const upsertFaceEmbeddingRecord = async ({
  externalId,
  filepath,
  embeddings = [],
  status = 'ready',
  errorMessage = null,
}) => {
  const normalizedExternalId = String(externalId || '').trim().toLowerCase();
  const normalizedFilepath = normalizePathForAccess(filepath);
  if (!normalizedExternalId || !normalizedFilepath) return;

  await ensureFaceEmbeddingsTable();
  await db.sequelize.query(
    `
    INSERT INTO file_manager_face_embeddings
    (external_id, filepath, embedding_json, faces_count, status, error_message, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON DUPLICATE KEY UPDATE
      external_id = VALUES(external_id),
      embedding_json = VALUES(embedding_json),
      faces_count = VALUES(faces_count),
      status = VALUES(status),
      error_message = VALUES(error_message),
      indexed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    `,
    {
      replacements: [
        normalizedExternalId,
        normalizedFilepath,
        JSON.stringify(Array.isArray(embeddings) ? embeddings : []),
        Array.isArray(embeddings) ? embeddings.length : 0,
        String(status || 'ready').slice(0, 24),
        errorMessage ? String(errorMessage).slice(0, 255) : null,
      ],
    }
  );
};

const deleteFaceEmbeddingRecordsByPath = async (filepath) => {
  const normalizedFilepath = normalizePathForAccess(filepath);
  if (!normalizedFilepath) return;
  await ensureFaceEmbeddingsTable();
  await db.sequelize.query(
    `
    DELETE FROM file_manager_face_embeddings
    WHERE filepath = ?
      OR filepath LIKE ?
    `,
    {
      replacements: [normalizedFilepath, `${normalizedFilepath}/%`],
    }
  );
};

const listFaceEmbeddingRecords = async (externalId) => {
  const normalizedExternalId = String(externalId || '').trim().toLowerCase();
  if (!normalizedExternalId) return [];

  await ensureFaceEmbeddingsTable();
  const [rows] = await db.sequelize.query(
    `
    SELECT filepath, embedding_json, faces_count, indexed_at, updated_at
    FROM file_manager_face_embeddings
    WHERE external_id = ?
      AND status = 'ready'
    ORDER BY updated_at DESC
    `,
    {
      replacements: [normalizedExternalId],
    }
  );

  return Array.isArray(rows) ? rows : [];
};

const fetchEmbeddingsFromFaceService = async ({ scanImageBase64, scanImageUrl }) => {
  if (!FACE_SCAN_SERVICE_URL) return [];

  const response = await fetch(`${FACE_SCAN_SERVICE_URL.replace(/\/+$/, '')}/embed`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      scanImageBase64: scanImageBase64 || undefined,
      scanImageUrl: scanImageUrl || undefined,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.detail || payload?.message || 'Failed to generate face embeddings';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return toEmbeddingArray(payload?.data?.embeddings || payload?.embeddings);
};

const indexFaceEmbeddingForFile = async ({ externalId, filepath, fileName = '', fileContentType = '' }) => {
  const normalizedExternalId = String(externalId || '').trim().toLowerCase();
  const normalizedFilepath = normalizePathForAccess(filepath);
  if (!normalizedExternalId || !normalizedFilepath) return { status: 'skipped', reason: 'invalid' };

  const looksLikeImage =
    String(fileContentType || '').toLowerCase().startsWith('image/') ||
    isImageLikePath(fileName) ||
    isImageLikePath(normalizedFilepath);
  if (!looksLikeImage) return { status: 'skipped', reason: 'not_image' };

  if (!FACE_SCAN_SERVICE_URL) return { status: 'skipped', reason: 'provider_missing' };

  try {
    const viewResult = await proxyRequest('/file-view-url', {
      method: 'POST',
      body: JSON.stringify({
        filepath: normalizedFilepath,
      }),
    });
    const scanImageUrl = viewResult?.data?.url || '';
    if (!scanImageUrl) {
      await upsertFaceEmbeddingRecord({
        externalId: normalizedExternalId,
        filepath: normalizedFilepath,
        embeddings: [],
        status: 'failed',
        errorMessage: 'Missing file view URL',
      });
      return { status: 'failed', reason: 'missing_view_url' };
    }

    const embeddings = await fetchEmbeddingsFromFaceService({ scanImageUrl });
    if (!embeddings.length) {
      await upsertFaceEmbeddingRecord({
        externalId: normalizedExternalId,
        filepath: normalizedFilepath,
        embeddings: [],
        status: 'failed',
        errorMessage: 'No face detected',
      });
      return { status: 'failed', reason: 'no_face' };
    }

    await upsertFaceEmbeddingRecord({
      externalId: normalizedExternalId,
      filepath: normalizedFilepath,
      embeddings,
      status: 'ready',
      errorMessage: null,
    });

    return { status: 'indexed', facesCount: embeddings.length };
  } catch (error) {
    await upsertFaceEmbeddingRecord({
      externalId: normalizedExternalId,
      filepath: normalizedFilepath,
      embeddings: [],
      status: 'failed',
      errorMessage: error?.message || 'Face indexing failed',
    });
    return { status: 'failed', reason: error?.message || 'Face indexing failed' };
  }
};

const searchFaceMatchesFromIndexedEmbeddings = async ({
  externalId,
  scanImageBase64,
  scanImageUrl,
  threshold,
  maxResults,
}) => {
  if (!FACE_SCAN_SERVICE_URL) {
    return {
      usedIndex: false,
      indexedCandidatesCount: 0,
      matches: [],
    };
  }

  const indexedRows = await listFaceEmbeddingRecords(externalId);
  if (!indexedRows.length) {
    return {
      usedIndex: false,
      indexedCandidatesCount: 0,
      matches: [],
    };
  }

  const queryEmbeddings = await fetchEmbeddingsFromFaceService({
    scanImageBase64,
    scanImageUrl,
  });
  if (!queryEmbeddings.length) {
    return {
      usedIndex: true,
      indexedCandidatesCount: indexedRows.length,
      matches: [],
    };
  }

  const safeThreshold = Math.max(0, Math.min(1, Number(threshold || 0.7)));
  const matches = [];
  indexedRows.forEach((row) => {
    const candidateEmbeddings = toEmbeddingArray(row.embedding_json);
    if (!candidateEmbeddings.length) return;

    const { score, queryFaceIndex, candidateFaceIndex } = getBestFacePairScore(
      queryEmbeddings,
      candidateEmbeddings
    );
    if (score < safeThreshold) return;

    matches.push({
      path: row.filepath,
      score,
      confidence: score,
      queryFaceIndex,
      candidateFaceIndex,
      queryFacesDetected: queryEmbeddings.length,
      candidateFacesDetected: candidateEmbeddings.length,
    });
  });

  matches.sort((a, b) => b.score - a.score);

  return {
    usedIndex: true,
    indexedCandidatesCount: indexedRows.length,
    matches: matches.slice(0, Math.max(1, Number(maxResults || 200))),
  };
};

const isCreatorPostProductionPath = (filepath) =>
  /(^|\/)post-production(\/|$)/i.test(String(filepath || ''));

const isPreProductionPath = (filepath) =>
  /(^|\/)pre-production(\/|$)/i.test(String(filepath || ''));

const isCreatorAllowedUploadPath = (filepath) =>
  isCreatorPostProductionPath(filepath) || isPreProductionPath(filepath);

const isAdminRestrictedPostProductionUpload = (req, filepath) =>
  getNormalizedRequestUserRole(req) === 'admin' && isCreatorPostProductionPath(filepath);

const isPreProductionOnlyRole = (req) =>
  ['admin', 'sales_rep', 'sales_representative', 'sales', 'client'].includes(getNormalizedRequestUserRole(req));

const getTodayDateOnly = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const ensureCreatorPostProductionUploadWindow = async (req, filepath) => {
  if (!isCreatorRole(req)) return;
  if (!isCreatorPostProductionPath(filepath)) return;

  const commonEventExternalId = extractCommonEventExternalIdFromPath(filepath);
  if (commonEventExternalId) return;

  const commonEventByPath = await findCommonEventByFilepath(filepath);
  if (commonEventByPath) return;

  const bookingId = parseBookingIdFromFilepath(filepath);
  if (!bookingId) {
    const error = new Error('Invalid project file path');
    error.status = 400;
    throw error;
  }

  const booking = await stream_project_booking.findOne({
    where: { stream_project_booking_id: Number(bookingId) },
    attributes: ['stream_project_booking_id', 'event_date'],
  });

  const eventDate = booking?.event_date ? String(booking.event_date).slice(0, 10) : null;
  if (!eventDate) {
    const error = new Error('Shoot date is not set for this project');
    error.status = 403;
    throw error;
  }

  const today = getTodayDateOnly();
  if (today < eventDate) {
    const error = new Error(`Post-Production uploads are allowed on or after shoot day (${eventDate})`);
    error.status = 403;
    throw error;
  }
};

const validateUploadAccessForPath = async (req, filepath) => {
  await ensureCreatorFileAccess(req, filepath);

  if (getNormalizedRequestUserRole(req) === 'creator' && !isCreatorAllowedUploadPath(filepath)) {
    const error = new Error('Creators can upload files only in Pre-Production or Post-Production');
    error.status = 403;
    throw error;
  }

  await ensureCreatorPostProductionUploadWindow(req, filepath);

  if (isAdminRestrictedPostProductionUpload(req, filepath)) {
    const error = new Error('Admin uploads are allowed only in Pre-Production');
    error.status = 403;
    throw error;
  }

  if (isPreProductionOnlyRole(req) && !isPreProductionPath(filepath)) {
    const error = new Error('Uploads are allowed only in Pre-Production');
    error.status = 403;
    throw error;
  }
};

const resolveCreatorCrewMemberId = async (userId) => {
  if (!userId) return null;

  const user = await users.findByPk(userId, {
    attributes: ['id', 'email'],
  });

  if (!user?.email) return null;

  const crewMember = await crew_members.findOne({
    where: { email: user.email },
    attributes: ['crew_member_id'],
  });

  return crewMember?.crew_member_id || null;
};

const ensureCreatorWorkspaceAccess = async (req, bookingId) => {
  if (!isCreatorRole(req)) return;

  if (isCommonEventExternalId(bookingId)) {
    return;
  }

  const normalizedBookingId = Number(bookingId);
  if (!normalizedBookingId) {
    const error = new Error('Invalid project reference');
    error.status = 400;
    throw error;
  }

  const crewMemberId = await resolveCreatorCrewMemberId(getRequestUserId(req));
  if (!crewMemberId) {
    const error = new Error('Creator profile not found');
    error.status = 403;
    throw error;
  }

  const assignment = await assigned_crew.findOne({
    where: {
      project_id: normalizedBookingId,
      crew_member_id: crewMemberId,
      crew_accept: 1,
    },
    attributes: ['id'],
  });

  if (!assignment) {
    const error = new Error('You do not have access to this project file manager');
    error.status = 403;
    throw error;
  }
};

const ensureCreatorFileAccess = async (req, filepath) => {
  if (!isCreatorRole(req)) return;

  const hasCommonEventAccess = await ensureCreatorCommonEventFileAccess(req, filepath);
  if (hasCommonEventAccess) {
    return;
  }

  const commonEventByPath = await findCommonEventByFilepath(filepath);
  if (commonEventByPath) {
    await ensureCreatorCommonEventFileAccess(req, filepath);
    return;
  }

  const bookingId = parseBookingIdFromFilepath(filepath);
  if (!bookingId) {
    const error = new Error('Invalid project file path');
    error.status = 400;
    throw error;
  }

  await ensureCreatorWorkspaceAccess(req, bookingId);
};

const getCreatorAcceptedProjectIds = async (req) => {
  if (!isCreatorRole(req)) return null;

  const crewMemberId = await resolveCreatorCrewMemberId(getRequestUserId(req));
  if (!crewMemberId) return [];

  const assignments = await assigned_crew.findAll({
    where: {
      crew_member_id: crewMemberId,
      crew_accept: 1,
    },
    attributes: ['project_id'],
  });

  return assignments
    .map((assignment) => Number(assignment.project_id))
    .filter(Boolean);
};

const proxyRequest = async (path, options = {}) => {
  const { timeoutMs: requestedTimeoutMs, ...requestOptions } = options || {};
  const controller = new AbortController();
  const timeoutMs = Math.max(
    15000,
    Number(requestedTimeoutMs || EXTERNAL_FILE_MANAGER_PROXY_TIMEOUT_MS)
  );
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(`${DEFAULT_BASE_URL}${path}`, {
      ...requestOptions,
      signal: controller.signal,
      headers: {
        ...buildHeaders(),
        ...(requestOptions.headers || {}),
      },
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error(`External file manager timed out after ${timeoutMs}ms`);
      timeoutError.status = 504;
      timeoutError.payload = {
        success: false,
        message: 'Request timed out while waiting for external file manager',
      };
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({
    success: false,
    message: 'Invalid JSON response from external file manager',
  }));

  if (!response.ok) {
    const error = new Error(payload.message || 'External file manager request failed');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};

const normalizeSegment = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/(shoot|event|project)/gi, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

const pickNameToken = (booking) => {
  const source = String(
    booking.project_name || booking.client_name || booking.notes || booking.guest_email || ''
  ).trim();
  if (!source) return 'client';

  const preferredChunk = source.split('-').map((part) => part.trim()).filter(Boolean).pop() || source;
  const firstWord = preferredChunk.split(/\s+/).filter(Boolean)[0] || preferredChunk;
  return normalizeSegment(firstWord) || 'client';
};

const buildWorkspaceFolderName = (booking) => {
  const bookingId = booking.stream_project_booking_id || booking.booking_id || 'new';
  const shootToken = normalizeSegment(booking.shoot_type || booking.event_type || 'booking') || 'booking';
  const nameToken = pickNameToken(booking);
  return `${shootToken}_${nameToken}_#${bookingId}`;
};

exports.syncWorkspaceForBooking = async ({ bookingId, folderName }) => {
  return proxyRequest('/workspace', {
    method: 'POST',
    body: JSON.stringify({
      externalId: String(bookingId),
      folderName,
    }),
  });
};

exports.syncWorkspaceForBookingFromRecord = async (booking) => {
  if (!booking?.stream_project_booking_id) {
    return { success: false, message: 'booking_id is required for workspace sync' };
  }

  return exports.syncWorkspaceForBooking({
    bookingId: booking.stream_project_booking_id,
    folderName: buildWorkspaceFolderName(booking),
  });
};

exports.createWorkspace = async (req, res) => {
  try {
    const bookingId = String(req.body.bookingId || req.body.externalId || "").trim();
    const folderName = String(req.body.folderName || "").trim();

    if (!bookingId || !folderName) {
      return res.status(400).json({
        success: false,
        message: 'bookingId and folderName are required',
      });
    }

    const result = await exports.syncWorkspaceForBooking({
      bookingId,
      folderName,
    });

    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.listCommonEvents = async (req, res) => {
  try {
    const rows = await listCommonEventRows();
    return res.status(200).json({
      success: true,
      data: rows.map((row) => ({
        eventId: row.event_id,
        eventName: row.event_name,
        eventSlug: row.event_slug,
        externalId: row.workspace_external_id,
        rootPath: row.root_path,
        createdByUserId: row.created_by_user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to load common events',
    });
  }
};

exports.createCommonEvent = async (req, res) => {
  try {
    if (!isAdminRole(req)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin can create a common event folder',
      });
    }

    const eventName = sanitizeFolderName(req.body.eventName || req.body.folderName, '');
    if (!eventName) {
      return res.status(400).json({
        success: false,
        message: 'eventName is required',
      });
    }

    await ensureCommonEventsTable();

    const eventSlug = toEventSlug(eventName) || `event_${Date.now()}`;
    const workspaceExternalId = String(req.body.externalId || buildCommonEventExternalId(eventName)).trim().toLowerCase();
    const workspaceFolderName = `Event - ${eventName}`;

    const workspaceResult = await proxyRequest('/workspace', {
      method: 'POST',
      body: JSON.stringify({
        externalId: workspaceExternalId,
        folderName: workspaceFolderName,
      }),
    });

    try {
      await proxyRequest('/folder', {
        method: 'POST',
        body: JSON.stringify({
          externalId: workspaceExternalId,
          phase: 'pre',
          folderName: 'Creative Partners',
        }),
      });
    } catch (error) {
      // Non-blocking helper folder creation.
    }

    const rootPath = workspaceResult?.data?.workspace?.rootPath || null;
    await db.sequelize.query(
      `
      INSERT INTO file_manager_common_events
      (event_name, event_slug, workspace_external_id, root_path, created_by_user_id)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        event_name = VALUES(event_name),
        event_slug = VALUES(event_slug),
        root_path = VALUES(root_path),
        updated_at = CURRENT_TIMESTAMP
      `,
      {
        replacements: [eventName, eventSlug, workspaceExternalId, rootPath, getRequestUserId(req) || null],
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Common event folder created successfully',
      data: {
        eventName,
        eventSlug,
        externalId: workspaceExternalId,
        workspace: workspaceResult?.data?.workspace || null,
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message || 'Failed to create common event folder',
    });
  }
};

exports.createCreatorEventFolder = async (req, res) => {
  try {
    const eventExternalId = String(req.params.eventExternalId || req.body.externalId || '').trim().toLowerCase();
    if (!isCommonEventExternalId(eventExternalId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid common event externalId is required',
      });
    }

    if (!isCreatorRole(req) && !isAdminRole(req)) {
      return res.status(403).json({
        success: false,
        message: 'Only creators or admin can create creative partner folders',
      });
    }

    await ensureCommonEventsTable();
    const [rows] = await db.sequelize.query(
      `SELECT event_id FROM file_manager_common_events WHERE workspace_external_id = ? LIMIT 1`,
      { replacements: [eventExternalId] }
    );

    if (!rows?.length) {
      return res.status(404).json({
        success: false,
        message: 'Common event folder not found',
      });
    }

    const userId = getRequestUserId(req);
    const profileName = await getUserDisplayName(userId);
    const requestedName = sanitizeFolderName(req.body.folderName, '');
    const folderName = requestedName || sanitizeFolderName(profileName ? `${profileName}` : `CP ${userId || ''}`, 'Creative Partner');
    const phase = normalizeWorkspacePhase(req.body.phase || req.body.state || req.body.stage, 'pre');
    const folderPath = sanitizeRelativeFolderPath(req.body.path);

    const result = await proxyRequest('/folder', {
      method: 'POST',
      body: JSON.stringify({
        externalId: eventExternalId,
        phase,
        path: folderPath || undefined,
        folderName,
      }),
    });

    if (isCreatorRole(req)) {
      const createdFolderPathFromProvider = result?.data?.folder?.path || result?.data?.folderPath || '';
      const normalizedPhase = normalizeWorkspacePhase(phase, 'pre');
      const createdFolderPath = sanitizeRelativeFolderPath(
        extractPhaseAndRelativePath(createdFolderPathFromProvider, normalizedPhase).relativePath
          || [folderPath, folderName].filter(Boolean).join('/')
      );

      if (createdFolderPath) {
        await ensureCommonEventCreatorFoldersTable();
        await db.sequelize.query(
          `
          INSERT INTO file_manager_common_event_creator_folders
          (workspace_external_id, phase, folder_path, created_by_user_id)
          VALUES (?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            updated_at = CURRENT_TIMESTAMP
          `,
          {
            replacements: [eventExternalId, normalizedPhase, createdFolderPath, userId],
          }
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Creative partner folder created',
      data: {
        externalId: eventExternalId,
        phase,
        path: folderPath || null,
        folderName,
        folder: result?.data?.folder || null,
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message || 'Failed to create creative partner folder',
    });
  }
};

exports.searchFaceMatches = async (req, res) => {
  try {
    const externalId = String(req.body.externalId || req.body.eventExternalId || '').trim().toLowerCase();
    if (!externalId) {
      return res.status(400).json({
        success: false,
        message: 'externalId is required',
      });
    }

    const scanImageBase64 = String(req.body.scanImageBase64 || '').trim();
    const scanImageUrl = String(req.body.scanImageUrl || '').trim();
    if (!scanImageBase64 && !scanImageUrl) {
      return res.status(400).json({
        success: false,
        message: 'scanImageBase64 or scanImageUrl is required',
      });
    }

    await ensureCreatorWorkspaceAccess(req, externalId);
    const proxyResult = await proxyRequest('/face-scan/search', {
      method: 'POST',
      body: JSON.stringify({
        externalId,
        scanImageBase64: scanImageBase64 || undefined,
        scanImageUrl: scanImageUrl || undefined,
        threshold: req.body.threshold,
        minScore: req.body.minScore,
        maxResults: req.body.maxResults,
        candidateLimit: req.body.candidateLimit,
        fallbackCandidateLimit: req.body.fallbackCandidateLimit,
        backgroundReindex: req.body.backgroundReindex,
        backgroundBatchLimit: req.body.backgroundBatchLimit,
        backgroundConcurrency: req.body.backgroundConcurrency,
        providerTimeoutMs: req.body.providerTimeoutMs,
      }),
    });

    return res.status(200).json(proxyResult);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message || 'Face scan search failed',
    });
  }
};

exports.getFaceScanIndexStatus = async (req, res) => {
  try {
    const externalId = String(req.params.externalId || req.query.externalId || '').trim().toLowerCase();
    if (!externalId) {
      return res.status(400).json({
        success: false,
        message: 'externalId is required',
      });
    }

    await ensureCreatorWorkspaceAccess(req, externalId);
    const proxyResult = await proxyRequest(`/face-scan/index-status/${encodeURIComponent(externalId)}`);

    return res.status(200).json(proxyResult);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message || 'Failed to fetch face index status',
    });
  }
};

// exports.searchFaceMatches = async (req, res) => {
//   req.setTimeout(120000); 
//   res.setTimeout(120000);

//   try {
//     const externalId = String(req.body.externalId || req.body.eventExternalId || '').trim().toLowerCase();
//     if (!externalId) {
//       return res.status(400).json({ success: false, message: 'externalId is required' });
//     }

//     const scanImageBase64 = String(req.body.scanImageBase64 || '').trim();
//     const scanImageUrl = String(req.body.scanImageUrl || '').trim();
//     if (!scanImageBase64 && !scanImageUrl) {
//       return res.status(400).json({ success: false, message: 'scanImageBase64 or scanImageUrl is required' });
//     }

//     await ensureCreatorWorkspaceAccess(req, externalId);

//     const imageCandidates = await collectWorkspaceImageCandidates(externalId);
//     const imageCandidatesWithUrls = await enrichCandidatesWithViewUrls(imageCandidates);

//     if (!FACE_SCAN_SERVICE_URL) {
//       return res.status(200).json({
//         success: true,
//         message: 'Face scan provider is not configured yet',
//         data: { externalId, scanMode: 'full_face_scan', integrated: false, candidatesCount: imageCandidatesWithUrls.length, matches: [] },
//       });
//     }

//     const controller = new AbortController();
//     const timeout = setTimeout(() => controller.abort(), 120000);

//     try {
//       const response = await fetch(`${FACE_SCAN_SERVICE_URL.replace(/\/+$/, '')}/search`, {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json',
//         },
//         signal: controller.signal,
//         body: JSON.stringify({
//           externalId,
//           scanMode: 'full_face_scan',
//           scanImageBase64: scanImageUrl ? undefined : (scanImageBase64 || undefined),
//           scanImageUrl: scanImageUrl || undefined,
//           candidates: imageCandidatesWithUrls.map(c => ({
//             id: c.id || c._id,
//             url: c.url || c.viewUrl
//           })),
//           threshold: Number(req.body.threshold || 0.7),
//           maxResults: Number(req.body.maxResults || 200),
//         }),
//       });

//       clearTimeout(timeout);

//       const providerPayload = await response.json().catch(() => null);
      
//       if (!response.ok) {
//         return res.status(502).json({
//           success: false,
//           message: providerPayload?.message || 'Face scan provider failed',
//         });
//       }

//       return res.status(200).json({
//         success: true,
//         message: 'Face scan completed',
//         data: {
//           externalId,
//           scanMode: 'full_face_scan',
//           integrated: true,
//           candidatesCount: imageCandidatesWithUrls.length,
//           matches: providerPayload?.data?.matches || providerPayload?.matches || [],
//           provider: providerPayload?.data?.provider || providerPayload?.provider || null,
//         },
//       });

//     } catch (fetchError) {
//       if (fetchError.name === 'AbortError') {
//         return res.status(504).json({
//           success: false,
//           message: 'The face scan service took too long to respond (Timeout)',
//         });
//       }
//       throw fetchError;
//     }

//   } catch (error) {
//     console.error('Face Scan Error:', error);
//     return res.status(error.status || 500).json(error.payload || {
//       success: false,
//       message: error.message || 'Face scan search failed',
//     });
//   }
// };

exports.listWorkspaces = async (req, res) => {
  try {
    const hasPaginationParams =
      typeof req.query.page !== 'undefined' || typeof req.query.limit !== 'undefined';
    const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(200, Math.max(1, Number.parseInt(String(req.query.limit || '24'), 10) || 24));
    const search = String(req.query.search || '').trim().toLowerCase();
    const result = await proxyRequest('/workspaces');
    const eventRows = await listCommonEventRows().catch(() => []);
    const eventWorkspaces = eventRows.map((row) => ({
      externalId: row.workspace_external_id,
      folderName: `Event - ${row.event_name}`,
      rootPath: row.root_path || null,
      fileCount: 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isCommonEvent: true,
      eventId: row.event_id,
      eventName: row.event_name,
    }));

    const existingByExternalId = new Set(
      (result.data?.workspaces || []).map((workspace) => String(workspace.externalId || '').trim().toLowerCase())
    );
    const missingEventWorkspaces = eventWorkspaces.filter(
      (workspace) => !existingByExternalId.has(String(workspace.externalId || '').trim().toLowerCase())
    );

    const verifiedMissingEventWorkspaces = (
      await Promise.all(
        missingEventWorkspaces.map(async (workspace) => {
          try {
            const lookup = await proxyRequest(`/workspace/${encodeURIComponent(String(workspace.externalId))}`);
            if (!lookup?.data?.workspace) return null;
            return workspace;
          } catch (error) {
            return null;
          }
        })
      )
    ).filter(Boolean);

    const mergedWorkspaces = [
      ...(result.data?.workspaces || []),
      ...verifiedMissingEventWorkspaces,
    ];

    let filteredWorkspaces = mergedWorkspaces;
    if (isCreatorRole(req)) {
      const allowedProjectIds = await getCreatorAcceptedProjectIds(req);
      const allowedIdSet = new Set((allowedProjectIds || []).map((id) => String(id)));
      filteredWorkspaces = mergedWorkspaces.filter((workspace) =>
        isCommonEventExternalId(workspace.externalId) || allowedIdSet.has(String(workspace.externalId))
      );
    }

    if (search) {
      filteredWorkspaces = filteredWorkspaces.filter((workspace) => {
        const folderName = String(workspace.folderName || '').toLowerCase();
        const externalId = String(workspace.externalId || '').toLowerCase();
        const eventName = String(workspace.eventName || '').toLowerCase();
        return (
          folderName.includes(search) ||
          externalId.includes(search) ||
          eventName.includes(search)
        );
      });
    }
    const total = filteredWorkspaces.length;
    const effectiveLimit = hasPaginationParams ? limit : Math.max(total, 1);
    const totalPages = Math.max(1, Math.ceil(total / effectiveLimit));
    const safePage = hasPaginationParams ? Math.min(page, totalPages) : 1;
    const offset = (safePage - 1) * effectiveLimit;
    const paginatedWorkspaces = filteredWorkspaces.slice(offset, offset + effectiveLimit);

    return res.status(200).json({
      ...result,
      data: {
        ...(result.data || {}),
        workspaces: paginatedWorkspaces,
        pagination: {
          page: safePage,
          limit: effectiveLimit,
          total,
          totalPages,
          hasNextPage: safePage < totalPages,
          hasPreviousPage: safePage > 1,
        },
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.getWorkspace = async (req, res) => {
  try {
    await ensureCreatorWorkspaceAccess(req, req.params.bookingId);
    const result = await proxyRequest(`/workspace/${req.params.bookingId}`);
    return res.status(200).json(result);
  } catch (error) {
    if (error.status === 404) {
      return res.status(200).json({
        success: true,
        message: 'Workspace not found',
        data: null,
      });
    }

    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

// Used by scripts to check existence without req/res
exports.getWorkspaceByBookingId = async (bookingId) => {
  const normalizedBookingId = String(bookingId || '').trim();
  if (!normalizedBookingId) {
    return { success: false, message: 'booking_id is required for workspace lookup', data: null };
  }

  try {
    return await proxyRequest(`/workspace/${normalizedBookingId}`);
  } catch (error) {
    if (error.status === 404) {
      return {
        success: true,
        message: 'Workspace not found',
        data: null,
      };
    }

    throw error;
  }
};

exports.getWorkspaceFiles = async (req, res) => {
  try {
    await ensureCreatorWorkspaceAccess(req, req.params.bookingId);
    const query = new URLSearchParams();
    if (req.query.phase) query.set('phase', req.query.phase);
    if (req.query.path) query.set('path', req.query.path);

    const result = await proxyRequest(
      `/workspace/${req.params.bookingId}/files${query.toString() ? `?${query.toString()}` : ''}`
    );

    if (isCreatorRole(req) && isCommonEventExternalId(req.params.bookingId)) {
      const phase = normalizeWorkspacePhase(req.query.phase, null);
      const requestedPath = sanitizeRelativeFolderPath(req.query.path || '');
      await ensureCreatorCommonEventRelativePathAccess({
        req,
        eventExternalId: req.params.bookingId,
        phase,
        relativePath: requestedPath,
        allowRoot: true,
        allowAncestorNavigation: true,
      });

      const creatorFolders = await listCreatorCommonEventFolders({
        eventExternalId: req.params.bookingId,
        userId: getRequestUserId(req),
        phase: phase || null,
      });
      const allowedRoots = creatorFolders.map((row) => normalizePathForAccess(row.folder_path)).filter(Boolean);
      const isAllowed = (entryPath) =>
        allowedRoots.some((rootPath) => isPathWithin(rootPath, entryPath) || isPathWithin(entryPath, rootPath));

      const filteredFolders = (result?.data?.folders || []).filter((folder) => {
        const entryPath = getRelativePathForEntry(folder, requestedPath);
        return entryPath && isAllowed(entryPath);
      });
      const filteredFiles = (result?.data?.files || []).filter((file) => {
        const entryPath = getRelativePathForEntry(file, requestedPath);
        return entryPath && isAllowed(entryPath);
      });

      return res.status(200).json({
        ...result,
        data: {
          ...(result.data || {}),
          folders: filteredFolders,
          files: filteredFiles,
        },
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    if (error.status === 404) {
      return res.status(200).json({
        success: true,
        message: 'Workspace not found',
        data: null,
      });
    }

    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.getUploadPolicy = async (req, res) => {
  try {
    await validateUploadAccessForPath(req, req.body.filepath);

    const result = await proxyRequest('/upload-policy', {
      method: 'POST',
      body: JSON.stringify({
        filepath: req.body.filepath,
        fileContentType: req.body.fileContentType,
        fileSize: req.body.fileSize,
        userId: getRequestUserId(req),
      }),
    });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.getUploadPoliciesBatch = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) {
      return res.status(400).json({
        success: false,
        message: 'items array is required',
      });
    }

    for (const item of items) {
      await validateUploadAccessForPath(req, item?.filepath);
    }

    const result = await proxyRequest('/upload-policies/batch', {
      method: 'POST',
      body: JSON.stringify({
        userId: getRequestUserId(req),
        items: items.map((item = {}) => ({
          filepath: item.filepath,
          fileContentType: item.fileContentType,
          fileSize: item.fileSize,
          userId: getRequestUserId(req),
        })),
      }),
    });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.notifyFileUploaded = async (req, res) => {
  try {
    await validateUploadAccessForPath(req, req.body.filepath);

    const result = await proxyRequest('/file-uploaded', {
      method: 'POST',
      body: JSON.stringify({
        filepath: req.body.filepath,
        fileContentType: req.body.fileContentType,
        fileSize: req.body.fileSize,
        fileName: req.body.fileName,
        userId: getRequestUserId(req),
      }),
    });

    try {
      await bookingTimelineService.applyUploadDrivenStatusTransition({
        filepath: req.body.filepath,
      });
    } catch (timelineError) {
      console.error('Timeline update skipped after file upload:', timelineError.message);
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.notifyFilesUploadedBatch = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) {
      return res.status(400).json({
        success: false,
        message: 'items array is required',
      });
    }

    for (const item of items) {
      await validateUploadAccessForPath(req, item?.filepath);
    }

    const result = await proxyRequest('/files-uploaded/batch', {
      method: 'POST',
      body: JSON.stringify({
        userId: getRequestUserId(req),
        items: items.map((item = {}) => ({
          filepath: item.filepath,
          fileContentType: item.fileContentType,
          fileSize: item.fileSize,
          fileName: item.fileName,
          userId: getRequestUserId(req),
        })),
      }),
    });

    const succeededItems = Array.isArray(result?.data?.items)
      ? result.data.items.filter((item) => item?.success && item?.filepath)
      : [];
    for (const item of succeededItems) {
      try {
        await bookingTimelineService.applyUploadDrivenStatusTransition({
          filepath: item.filepath,
        });
      } catch (timelineError) {
        console.error('Timeline update skipped after file upload batch item:', timelineError.message);
      }
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.reindexFaceEmbeddings = async (req, res) => {
  try {
    const externalId = String(req.body.externalId || req.body.eventExternalId || '').trim().toLowerCase();
    if (!externalId) {
      return res.status(400).json({
        success: false,
        message: 'externalId is required',
      });
    }

    await ensureCreatorWorkspaceAccess(req, externalId);

    const proxyResult = await proxyRequest('/face-scan/reindex', {
      method: 'POST',
      body: JSON.stringify({
        externalId,
        candidateLimit: req.body.candidateLimit,
        concurrency: req.body.concurrency,
        providerTimeoutMs: req.body.providerTimeoutMs,
      }),
    });

    return res.status(200).json(proxyResult);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message || 'Face embedding reindex failed',
    });
  }
};

exports.getFileViewUrl = async (req, res) => {
  try {
    await ensureCreatorFileAccess(req, req.body.filepath);
    const result = await proxyRequest('/file-view-url', {
      method: 'POST',
      body: JSON.stringify({
        filepath: req.body.filepath,
      }),
    });
    return res.status(200).json(withPublicUrl(result));
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.createFolder = async (req, res) => {
  try {
    const externalId = String(req.body.externalId || req.body.bookingId || '').trim();
    await ensureCreatorWorkspaceAccess(req, externalId);

    const isCommonEvent = isCommonEventExternalId(externalId);
    const phase = normalizeWorkspacePhase(
      req.body.phase || req.body.state || req.body.stage,
      isCommonEvent ? 'pre' : null
    );
    const path = sanitizeRelativeFolderPath(req.body.path);

    if (isCommonEvent && !phase) {
      return res.status(400).json({
        success: false,
        message: 'phase is required. Allowed values: pre, post, pre-production, post-production',
      });
    }

    if (isCommonEvent && isCreatorRole(req)) {
      if (!path) {
        return res.status(403).json({
          success: false,
          message: 'Creators can create folders only inside their own common event folder',
        });
      }

      await ensureCreatorCommonEventRelativePathAccess({
        req,
        eventExternalId: externalId,
        phase,
        relativePath: path,
        allowRoot: false,
      });
    }

    const result = await proxyRequest('/folder', {
      method: 'POST',
      body: JSON.stringify({
        externalId,
        phase: phase || req.body.phase,
        path: path || undefined,
        folderName: req.body.folderName || req.body.name,
      }),
    });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.getFileDownloadUrl = async (req, res) => {
  try {
    await ensureCreatorFileAccess(req, req.body.filepath);
    const result = await proxyRequest('/file-download-url', {
      method: 'POST',
      body: JSON.stringify({
        filepath: req.body.filepath,
      }),
    });
    return res.status(200).json(withPublicUrl(result));
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.getFolderDownloadUrl = async (req, res) => {
  try {
    const externalId = String(req.body.externalId || req.body.bookingId || '').trim();
    await ensureCreatorWorkspaceAccess(req, externalId);

    if (isCreatorRole(req) && isCommonEventExternalId(externalId)) {
      await ensureCreatorCommonEventRelativePathAccess({
        req,
        eventExternalId: externalId,
        phase: req.body.phase,
        relativePath: req.body.path,
        allowRoot: false,
      });
    }

    const result = await proxyRequest('/folder-download-url', {
      method: 'POST',
      body: JSON.stringify({
        externalId,
        phase: req.body.phase,
        path: req.body.path,
      }),
    });
    return res.status(200).json(withPublicUrl(result));
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.deleteEntry = async (req, res) => {
  try {
    const targetPath = req.body.filepath || req.body.path;
    await ensureCreatorFileAccess(req, targetPath);
    const result = await proxyRequest('/delete', {
      method: 'POST',
      body: JSON.stringify({
        filepath: targetPath,
      }),
    });

    const deletedPath = normalizePathForAccess(targetPath);
    if (deletedPath) {
      await deleteFaceEmbeddingRecordsByPath(deletedPath).catch(() => null);

      const rows = await listCommonEventRows().catch(() => []);
      const deletedRootRow = rows.find((row) => {
        const rootPath = normalizePathForAccess(row?.root_path || '');
        return rootPath && rootPath === deletedPath;
      });

      if (deletedRootRow?.workspace_external_id) {
        await deleteCommonEventRowsByExternalId(deletedRootRow.workspace_external_id);
      }
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};
