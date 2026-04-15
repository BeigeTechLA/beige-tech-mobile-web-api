const DEFAULT_BASE_URL = process.env.EXTERNAL_FILE_MANAGER_API_BASE_URL || 'http://localhost:5002/v1/external-file-manager';
const INTERNAL_KEY = process.env.EXTERNAL_FILE_MANAGER_KEY || 'beige-internal-dev-key';
const db = require('../models');
const { users, crew_members, assigned_crew, stream_project_booking } = db;
const bookingTimelineService = require('../services/bookingTimeline.service');

const FACE_SCAN_SERVICE_URL = process.env.FACE_SCAN_SERVICE_URL || '';
const COMMON_EVENT_ID_PREFIX = 'event_';
let commonEventsTableReadyPromise = null;

const buildHeaders = () => ({
  'Content-Type': 'application/json',
  'x-internal-key': INTERNAL_KEY,
});

const getRequestUserId = (req) => req.userId || req.user?.userId || null;
const getRequestUserRole = (req) => req.userRole || req.user?.userRole || null;
const getNormalizedRequestUserRole = (req) => String(getRequestUserRole(req) || '').trim().toLowerCase();
const isAdminRole = (req) => ['admin', 'super_admin', 'superadmin'].includes(getNormalizedRequestUserRole(req));
const isCreatorRole = (req) => getNormalizedRequestUserRole(req) === 'creator';

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

const normalizeWorkspacePhase = (value, fallback = null) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');

  if (['pre', 'pre-production', 'preproduction'].includes(normalized)) return 'pre';
  if (['post', 'post-production', 'postproduction'].includes(normalized)) return 'post';
  return fallback;
};

const isImageLikeFile = (file = {}) => {
  const contentType = String(file.contentType || '').toLowerCase();
  if (contentType.startsWith('image/')) return true;

  const fileName = String(file.name || file.path || '').toLowerCase();
  return /\.(jpg|jpeg|png|webp|heic|heif|bmp)$/i.test(fileName);
};

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

  for (const phase of phases) {
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

    for (const folder of rootFolders) {
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
    }
  }

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

  const commonEventExternalId = extractCommonEventExternalIdFromPath(filepath);
  if (commonEventExternalId) {
    return;
  }

  const commonEventByPath = await findCommonEventByFilepath(filepath);
  if (commonEventByPath) {
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
  const response = await fetch(`${DEFAULT_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...buildHeaders(),
      ...(options.headers || {}),
    },
  });

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

    const imageCandidates = await collectWorkspaceImageCandidates(externalId);
    const imageCandidatesWithUrls = await enrichCandidatesWithViewUrls(imageCandidates);
    if (!FACE_SCAN_SERVICE_URL) {
      return res.status(200).json({
        success: true,
        message: 'Face scan provider is not configured yet',
        data: {
          externalId,
          scanMode: 'full_face_scan',
          integrated: false,
          candidatesCount: imageCandidatesWithUrls.length,
          matches: [],
        },
      });
    }

    const response = await fetch(`${FACE_SCAN_SERVICE_URL.replace(/\/+$/, '')}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        externalId,
        scanMode: 'full_face_scan',
        scanImageBase64: scanImageBase64 || undefined,
        scanImageUrl: scanImageUrl || undefined,
        candidates: imageCandidatesWithUrls,
        threshold: Number(req.body.threshold || 0.7),
        maxResults: Number(req.body.maxResults || 200),
      }),
    });

    const providerPayload = await response.json().catch(() => null);
    if (!response.ok) {
      return res.status(502).json({
        success: false,
        message: providerPayload?.message || 'Face scan provider failed',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Face scan completed',
      data: {
        externalId,
        scanMode: 'full_face_scan',
        integrated: true,
        candidatesCount: imageCandidatesWithUrls.length,
        matches: providerPayload?.data?.matches || providerPayload?.matches || [],
        provider: providerPayload?.data?.provider || providerPayload?.provider || null,
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message || 'Face scan search failed',
    });
  }
};

exports.listWorkspaces = async (req, res) => {
  try {
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

    const existingByExternalId = new Set((result.data?.workspaces || []).map((workspace) => String(workspace.externalId)));
    const mergedWorkspaces = [
      ...(result.data?.workspaces || []),
      ...eventWorkspaces.filter((workspace) => !existingByExternalId.has(String(workspace.externalId))),
    ];

    if (isCreatorRole(req)) {
      const allowedProjectIds = await getCreatorAcceptedProjectIds(req);
      const allowedIdSet = new Set((allowedProjectIds || []).map((id) => String(id)));

      return res.status(200).json({
        ...result,
        data: {
          ...(result.data || {}),
          workspaces: mergedWorkspaces.filter((workspace) =>
            isCommonEventExternalId(workspace.externalId) || allowedIdSet.has(String(workspace.externalId))
          ),
        },
      });
    }

    return res.status(200).json({
      ...result,
      data: {
        ...(result.data || {}),
        workspaces: mergedWorkspaces,
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
    await ensureCreatorFileAccess(req, req.body.filepath);

    if (getNormalizedRequestUserRole(req) === 'creator' && !isCreatorAllowedUploadPath(req.body.filepath)) {
      return res.status(403).json({
        success: false,
        message: 'Creators can upload files only in Pre-Production or Post-Production',
      });
    }

    await ensureCreatorPostProductionUploadWindow(req, req.body.filepath);

    if (isAdminRestrictedPostProductionUpload(req, req.body.filepath)) {
      return res.status(403).json({
        success: false,
        message: 'Admin uploads are allowed only in Pre-Production',
      });
    }

    if (isPreProductionOnlyRole(req) && !isPreProductionPath(req.body.filepath)) {
      return res.status(403).json({
        success: false,
        message: 'Uploads are allowed only in Pre-Production',
      });
    }

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

exports.notifyFileUploaded = async (req, res) => {
  try {
    await ensureCreatorFileAccess(req, req.body.filepath);

    if (getNormalizedRequestUserRole(req) === 'creator' && !isCreatorAllowedUploadPath(req.body.filepath)) {
      return res.status(403).json({
        success: false,
        message: 'Creators can upload files only in Pre-Production or Post-Production',
      });
    }

    await ensureCreatorPostProductionUploadWindow(req, req.body.filepath);

    if (isAdminRestrictedPostProductionUpload(req, req.body.filepath)) {
      return res.status(403).json({
        success: false,
        message: 'Admin uploads are allowed only in Pre-Production',
      });
    }

    if (isPreProductionOnlyRole(req) && !isPreProductionPath(req.body.filepath)) {
      return res.status(403).json({
        success: false,
        message: 'Uploads are allowed only in Pre-Production',
      });
    }

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

exports.getFileViewUrl = async (req, res) => {
  try {
    await ensureCreatorFileAccess(req, req.body.filepath);
    const result = await proxyRequest('/file-view-url', {
      method: 'POST',
      body: JSON.stringify({
        filepath: req.body.filepath,
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
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.getFolderDownloadUrl = async (req, res) => {
  try {
    await ensureCreatorWorkspaceAccess(req, req.body.externalId || req.body.bookingId);
    const result = await proxyRequest('/folder-download-url', {
      method: 'POST',
      body: JSON.stringify({
        externalId: req.body.externalId || req.body.bookingId,
        phase: req.body.phase,
        path: req.body.path,
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

exports.deleteEntry = async (req, res) => {
  try {
    await ensureCreatorFileAccess(req, req.body.filepath || req.body.path);
    const result = await proxyRequest('/delete', {
      method: 'POST',
      body: JSON.stringify({
        filepath: req.body.filepath || req.body.path,
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
