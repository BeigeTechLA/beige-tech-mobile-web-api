const DEFAULT_BASE_URL = process.env.EXTERNAL_FILE_MANAGER_API_BASE_URL || 'http://localhost:5002/v1/external-file-manager';
const INTERNAL_KEY = process.env.EXTERNAL_FILE_MANAGER_KEY || 'beige-internal-dev-key';
const { users, crew_members, assigned_crew } = require('../models');
const bookingTimelineService = require('../services/bookingTimeline.service');

const buildHeaders = () => ({
  'Content-Type': 'application/json',
  'x-internal-key': INTERNAL_KEY,
});

const getRequestUserId = (req) => req.userId || req.user?.userId || null;
const getRequestUserRole = (req) => req.userRole || req.user?.userRole || null;
const getNormalizedRequestUserRole = (req) => String(getRequestUserRole(req) || '').trim().toLowerCase();

const parseBookingIdFromFilepath = (filepath) => {
  const normalized = String(filepath || '').trim();
  if (!normalized) return null;

  const hashMatch = normalized.match(/#(\d+)/);
  if (hashMatch?.[1]) {
    return Number(hashMatch[1]);
  }

  return null;
};

const isCreatorPostProductionPath = (filepath) =>
  /(^|\/)post-production(\/|$)/i.test(String(filepath || ''));

const isPreProductionPath = (filepath) =>
  /(^|\/)pre-production(\/|$)/i.test(String(filepath || ''));

const isAdminRestrictedPostProductionUpload = (req, filepath) =>
  getNormalizedRequestUserRole(req) === 'admin' && isCreatorPostProductionPath(filepath);

const isPreProductionOnlyRole = (req) =>
  ['admin', 'sales_rep', 'sales_representative', 'sales', 'client'].includes(getNormalizedRequestUserRole(req));

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
  if (getRequestUserRole(req) !== 'creator') return;

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
  if (getRequestUserRole(req) !== 'creator') return;

  const bookingId = parseBookingIdFromFilepath(filepath);
  if (!bookingId) {
    const error = new Error('Invalid project file path');
    error.status = 400;
    throw error;
  }

  await ensureCreatorWorkspaceAccess(req, bookingId);
};

const getCreatorAcceptedProjectIds = async (req) => {
  if (getRequestUserRole(req) !== 'creator') return null;

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

exports.listWorkspaces = async (req, res) => {
  try {
    const result = await proxyRequest('/workspaces');

    if (getRequestUserRole(req) === 'creator') {
      const allowedProjectIds = await getCreatorAcceptedProjectIds(req);
      const allowedIdSet = new Set((allowedProjectIds || []).map((id) => String(id)));

      return res.status(200).json({
        ...result,
        data: {
          ...(result.data || {}),
          workspaces: (result.data?.workspaces || []).filter((workspace) =>
            allowedIdSet.has(String(workspace.externalId))
          ),
        },
      });
    }

    return res.status(200).json(result);
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

    if (getNormalizedRequestUserRole(req) === 'creator' && !isCreatorPostProductionPath(req.body.filepath)) {
      return res.status(403).json({
        success: false,
        message: 'Creators can upload files only in Post-Production',
      });
    }

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

    if (getNormalizedRequestUserRole(req) === 'creator' && !isCreatorPostProductionPath(req.body.filepath)) {
      return res.status(403).json({
        success: false,
        message: 'Creators can upload files only in Post-Production',
      });
    }

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
    await ensureCreatorWorkspaceAccess(req, req.body.externalId || req.body.bookingId);
    const result = await proxyRequest('/folder', {
      method: 'POST',
      body: JSON.stringify({
        externalId: req.body.externalId || req.body.bookingId,
        phase: req.body.phase,
        path: req.body.path,
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
