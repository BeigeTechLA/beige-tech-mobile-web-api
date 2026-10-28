const { Op } = require('sequelize');
const db = require('../models');
const emailService = require('../utils/emailService');
const externalFileManager = require('./external-file-manager.controller');

const { stream_project_booking, users, crew_members, assigned_crew } = db;

const getPlain = (value) => (typeof value?.get === 'function' ? value.get({ plain: true }) : value);
const normalizeId = (value) => String(value || '').trim();
const getRequestUserId = externalFileManager.getRequestUserId;

const responseError = (res, error) => res.status(error.status || 500).json(error.payload || {
  success: false,
  message: error.message || 'Unable to process file manager workflow',
});

const workflowError = (message, status = 400) => Object.assign(new Error(message), { status });

const parseRoleValues = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [value];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    return value.split(',');
  }
};

const isEditorCrewMember = (crew) => parseRoleValues(crew?.primary_role)
  .some((role) => ['3', 'editor'].includes(String(role || '').trim().toLowerCase()));

const getServiceType = (booking) => {
  const photo = parseRoleValues(booking?.photo_edit_types).filter(Boolean).length > 0;
  const video = parseRoleValues(booking?.video_edit_types).filter(Boolean).length > 0;
  if (photo && video) return 'Photo+Video';
  if (video) return 'Video Editing';
  return 'Photos Retouching';
};

const fullName = (crew) => [crew?.first_name, crew?.last_name].filter(Boolean).join(' ').trim() || null;

const bookingInclude = [
  { model: users, as: 'user', required: false, attributes: ['id', 'name', 'email'] },
  {
    model: assigned_crew,
    as: 'assigned_crews',
    required: false,
    where: { is_active: 1 },
    include: [{
      model: crew_members,
      as: 'crew_member',
      required: false,
      attributes: ['crew_member_id', 'user_id', 'first_name', 'last_name', 'email', 'primary_role'],
    }],
  },
];

const getBooking = async (bookingId) => {
  const id = Number(bookingId);
  if (!Number.isInteger(id) || id <= 0) throw workflowError('Invalid booking reference');
  const booking = await stream_project_booking.findOne({
    where: { stream_project_booking_id: id, is_active: 1 },
    include: bookingInclude,
  });
  if (!booking) throw workflowError('Booking not found', 404);
  return getPlain(booking);
};

const getEditorType = (workflowEditorType, crew) => {
  const normalizedWorkflowEditorType = String(workflowEditorType || '').trim().toLowerCase();
  if (['internal', 'external'].includes(normalizedWorkflowEditorType)) return normalizedWorkflowEditorType;
  if (!crew) return null;
  return Number(crew.is_beige_member) === 1 ? 'internal' : 'external';
};

const getEditors = (booking, workflowEditorType, requestUserId) => {
  const editors = (booking?.assigned_crews || [])
    .filter((item) => isEditorCrewMember(item?.crew_member))
    .map((assignment) => {
      const crew = assignment.crew_member;
      return {
        id: crew.user_id || crew.crew_member_id || null,
        name: fullName(crew) || crew.email || null,
        email: crew.email || null,
        editorType: getEditorType(workflowEditorType, crew),
      };
    });

  if (!requestUserId) return editors;
  return editors.sort((left, right) => {
    const leftIsRequester = String(left.id || '') === String(requestUserId);
    const rightIsRequester = String(right.id || '') === String(requestUserId);
    return Number(rightIsRequester) - Number(leftIsRequester);
  });
};

const getWorkflowRequirements = (booking, workflowRequirements) => {
  const sqlBrief = booking.description || booking.special_instructions || '';
  const workflowBrief = typeof workflowRequirements?.brief === 'string' ? workflowRequirements.brief.trim() : '';
  return {
    editingRequirements: '',
    requiredFormat: '',
    deliverablesText: '',
    revisionRounds: null,
    brief: '',
    requiredCount: null,
    ...(workflowRequirements && typeof workflowRequirements === 'object' ? workflowRequirements : {}),
    brief: workflowBrief || sqlBrief,
  };
};

const getBookingEnrichment = (booking, workflow = {}, requestUserId = null) => {
  const editors = getEditors(booking, workflow.editorType, requestUserId);
  const editor = editors[0] || null;
  const requirements = getWorkflowRequirements(booking, workflow.requirements);
  return {
    bookingId: booking.stream_project_booking_id,
    orderId: String(booking.stream_project_booking_id),
    projectName: booking.project_name || booking.client_name || `Booking #${booking.stream_project_booking_id}`,
    shootId: String(booking.stream_project_booking_id),
    serviceType: getServiceType(booking),
    producer: booking.user ? { id: booking.user.id, name: booking.user.name || booking.user.email, email: booking.user.email } : null,
    editor,
    editors,
    editorType: editor?.editorType || getEditorType(workflow.editorType, null),
    dueDate: workflow.dueDate != null ? workflow.dueDate : booking.estimated_delivery_date || null,
    brief: requirements.brief,
  };
};

const getCurrentCrewMember = async (req) => {
  const userId = getRequestUserId(req);
  if (!userId) return null;
  const user = await users.findByPk(userId, { attributes: ['id', 'email'] });
  return crew_members.findOne({
    where: {
      [Op.or]: [
        { user_id: userId },
        ...(user?.email ? [{ email: user.email }] : []),
      ],
      is_active: 1,
    },
    attributes: ['crew_member_id', 'user_id', 'primary_role'],
  });
};

const getActiveAssignedBookingIds = async (crewMemberId) => {
  if (!crewMemberId) return [];
  const assignments = await assigned_crew.findAll({
    where: { crew_member_id: crewMemberId, is_active: 1 },
    attributes: ['project_id'],
    raw: true,
  });
  return [...new Set(assignments.map((assignment) => Number(assignment.project_id)).filter(Boolean))];
};

const ensureBookingAccess = async (req, booking) => {
  await externalFileManager.ensureCreatorWorkspaceAccess(req, booking.stream_project_booking_id);
  if (externalFileManager.isAdminRole(req)) return;
  if (String(booking.user_id || '') === String(getRequestUserId(req) || '')) return;

  const crew = getPlain(await getCurrentCrewMember(req));
  if (!crew) throw workflowError('You do not have access to this workflow', 403);
  const assignedBookingIds = await getActiveAssignedBookingIds(crew.crew_member_id);
  if (!assignedBookingIds.includes(Number(booking.stream_project_booking_id))) {
    throw workflowError('You do not have access to this workflow', 403);
  }
};

const ensureEditorAccess = async (req, booking) => {
  await ensureBookingAccess(req, booking);
  const crew = getPlain(await getCurrentCrewMember(req));
  if (!crew || !isEditorCrewMember(crew)) {
    throw workflowError('Only the assigned editor can perform this workflow action', 403);
  }
  const assignment = await assigned_crew.findOne({
    where: { project_id: booking.stream_project_booking_id, crew_member_id: crew.crew_member_id, is_active: 1 },
    attributes: ['id'],
  });
  if (!assignment) throw workflowError('Only the assigned editor can perform this workflow action', 403);
};

const ensureProducerOrAdmin = async (req, booking) => {
  await ensureBookingAccess(req, booking);
  if (!externalFileManager.isAdminRole(req) && String(booking.user_id || '') !== String(getRequestUserId(req) || '')) {
    throw workflowError('Only the booking producer can perform this workflow action', 403);
  }
};

const buildActorPayload = async (req, body = {}) => {
  const safeBody = { ...(body || {}) };
  delete safeBody.by;
  delete safeBody.byName;
  delete safeBody.userId;
  delete safeBody.authorName;
  const authenticatedUserId = getRequestUserId(req);
  const authenticatedUserName = await externalFileManager
    .getUserDisplayName(authenticatedUserId)
    .catch(() => null) || 'Beige User';
  return {
    ...safeBody,
    by: authenticatedUserId,
    userId: authenticatedUserId,
    byName: authenticatedUserName,
    authorName: authenticatedUserName,
  };
};

const notifyWorkflowSubmission = async ({ booking, type, summary, submittedByName, notes }) => {
  try {
    const enrichment = getBookingEnrichment(booking);
    const bookingId = String(booking.stream_project_booking_id);
    const fileCount = Number(summary?.fileCount || 0);
    const recipients = externalFileManager.buildFilesForEditingInternalRecipients(booking);
    const message = `${submittedByName} submitted ${fileCount || 'edited'} file${fileCount === 1 ? '' : 's'} for ${type === 'revision_submitted' ? 'revision approval' : 'approval'}.`;

    await Promise.all([
      emailService.sendFilesForEditingInternalTeamEmail({
        recipients,
        data: {
          shoot_name: enrichment.projectName,
          project_name: enrichment.projectName,
          booking_id: bookingId,
          order_id: bookingId,
          total_files: fileCount || 1,
          submitted_by: submittedByName,
          submission_time: externalFileManager.formatEditingSubmissionTime(),
          notes: notes || '',
          dashboard_link: externalFileManager.buildAdminDashboardUrl(),
        },
      }),
      externalFileManager.sendClientFilePush({
        booking,
        type,
        title: type === 'revision_submitted' ? 'Revision submitted' : 'Files submitted for approval',
        body: message,
        data: { total_files: String(fileCount), notes: notes || '' },
      }),
      externalFileManager.sendAssignedCpFilePush({
        booking,
        type,
        title: type === 'revision_submitted' ? 'Revision submitted' : 'Files submitted for approval',
        body: message,
        data: { total_files: String(fileCount), notes: notes || '' },
      }),
    ]);
  } catch (error) {
    console.error('Workflow submission notification failed:', error.message || error);
  }
};

const notifyEditingStarted = async ({ booking, startedByName }) => {
  try {
    await externalFileManager.sendClientFilePush({
      booking,
      type: 'editing_started',
      title: 'Editing started',
      body: `${startedByName} started editing your files.`,
    });
  } catch (error) {
    console.error('Workflow start notification failed:', error.message || error);
  }
};

const proxyForBooking = async (req, res, action) => {
  try {
    const booking = await getBooking(req.params.bookingId);
    const result = await action(booking);
    return res.status(200).json(result);
  } catch (error) {
    return responseError(res, error);
  }
};

const buildVisibleWorkflowQuery = ({ orderIds, query = {}, status } = {}) => {
  const params = new URLSearchParams();
  ['search', 'sortBy', 'sortOrder', 'page', 'limit'].forEach((key) => {
    if (query[key] != null && String(query[key]).trim()) params.set(key, String(query[key]));
  });
  params.set('tab', 'linked');
  if (status) params.set('status', status);
  (orderIds.length ? orderIds : ['__no_visible_workflows__'])
    .forEach((id) => params.append('orderIds', id));
  return params;
};

exports.listWorkflows = async (req, res) => {
  try {
    const userId = getRequestUserId(req);
    const where = { is_active: 1 };
    if (!externalFileManager.isAdminRole(req)) {
      const crew = getPlain(await getCurrentCrewMember(req));
      if (crew) {
        const assignedBookingIds = await getActiveAssignedBookingIds(crew.crew_member_id);
        where[Op.or] = [{ user_id: userId }, { stream_project_booking_id: assignedBookingIds }];
      } else {
        where.user_id = userId;
      }
    }
    const bookings = (await stream_project_booking.findAll({ where, include: bookingInclude })).map(getPlain);
    const visibleOrderIds = bookings.map((booking) => String(booking.stream_project_booking_id));
    const query = buildVisibleWorkflowQuery({ orderIds: visibleOrderIds, query: req.query, status: req.query.status });
    const upstream = await externalFileManager.proxyRequest(`/workflows?${query.toString()}`);
    // web-api-2's current status aggregation is global. Re-count through its
    // already-filtered list endpoint so this gateway never disclose statuses
    // for bookings outside the caller's SQL-authorized scope.
    const statusKeys = ['in_progress', 'submitted', 'revision_requested', 'resubmitted', 'approved', 'completed'];
    const countQuery = { ...req.query, page: 1, limit: 1 };
    delete countQuery.status;
    const countResults = await Promise.all([
      externalFileManager.proxyRequest(`/workflows?${buildVisibleWorkflowQuery({ orderIds: visibleOrderIds, query: countQuery }).toString()}`),
      ...statusKeys.map((status) => externalFileManager.proxyRequest(
        `/workflows?${buildVisibleWorkflowQuery({ orderIds: visibleOrderIds, query: countQuery, status }).toString()}`
      )),
    ]);
    const statusCounts = { all: Number(countResults[0]?.data?.pagination?.total || 0) };
    statusKeys.forEach((status, index) => {
      statusCounts[status] = Number(countResults[index + 1]?.data?.pagination?.total || 0);
    });
    const bookingById = new Map(bookings.map((booking) => [String(booking.stream_project_booking_id), booking]));
    return res.status(200).json({
      ...upstream,
      data: {
        ...(upstream.data || {}),
        statusCounts,
        items: (upstream.data?.items || []).map((item) => ({
          ...item,
          ...(bookingById.has(String(item.orderId))
            ? getBookingEnrichment(bookingById.get(String(item.orderId)), item, getRequestUserId(req))
            : {}),
        })),
      },
    });
  } catch (error) {
    return responseError(res, error);
  }
};

exports.getWorkflow = (req, res) => proxyForBooking(req, res, async (booking) => {
  await ensureBookingAccess(req, booking);
  const upstream = await externalFileManager.proxyRequest(`/workflows/${encodeURIComponent(booking.stream_project_booking_id)}`);
  const enrichment = getBookingEnrichment(booking, upstream.data || {}, getRequestUserId(req));
  return {
    ...upstream,
    data: {
      ...(upstream.data || {}),
      ...enrichment,
      requirements: {
        ...getWorkflowRequirements(booking, upstream.data?.requirements),
        brief: enrichment.brief,
      },
    },
  };
});

exports.updateRequirements = (req, res) => proxyForBooking(req, res, async (booking) => {
  await ensureProducerOrAdmin(req, booking);
  const enrichment = getBookingEnrichment(booking);
  const payload = await buildActorPayload(req, req.body || {});
  payload.dueDate = enrichment.dueDate;
  payload.producerId = enrichment.producer?.id || null;
  payload.producerName = enrichment.producer?.name || null;
  payload.editorId = enrichment.editor?.id || null;
  payload.editorName = enrichment.editor?.name || null;
  payload.editorType = enrichment.editorType;
  return externalFileManager.proxyRequest(`/workflows/${encodeURIComponent(booking.stream_project_booking_id)}/requirements`, { method: 'PUT', body: JSON.stringify(payload) });
});

exports.startEditing = (req, res) => proxyForBooking(req, res, async (booking) => {
  await ensureEditorAccess(req, booking);
  const payload = await buildActorPayload(req, req.body || {});
  const result = await externalFileManager.proxyRequest(`/workflows/${encodeURIComponent(booking.stream_project_booking_id)}/start-editing`, { method: 'POST', body: JSON.stringify(payload) });
  await notifyEditingStarted({ booking, startedByName: payload.byName });
  return result;
});

exports.getProgress = (req, res) => proxyForBooking(req, res, async (booking) => {
  await ensureBookingAccess(req, booking);
  const query = req.query.version ? `?version=${encodeURIComponent(String(req.query.version))}` : '';
  return externalFileManager.proxyRequest(`/workflows/${encodeURIComponent(booking.stream_project_booking_id)}/progress${query}`);
});

exports.getActivity = (req, res) => proxyForBooking(req, res, async (booking) => {
  await ensureBookingAccess(req, booking);
  const query = new URLSearchParams();
  ['page', 'limit'].forEach((key) => {
    if (req.query[key] != null && String(req.query[key]).trim()) query.set(key, String(req.query[key]));
  });
  const upstream = await externalFileManager.proxyRequest(
    `/workflows/${encodeURIComponent(booking.stream_project_booking_id)}/activity${query.toString() ? `?${query.toString()}` : ''}`
  );
  return {
    ...upstream,
    data: {
      items: (upstream.data?.items || []).map((item) => ({
        action: item.action,
        actorName: item.actorName,
        fileCount: item.fileCount,
        metadata: item.metadata,
        createdAt: item.createdAt,
      })),
      pagination: upstream.data?.pagination,
    },
  };
});

const submitWorkflow = (path, type) => (req, res) => proxyForBooking(req, res, async (booking) => {
  await ensureEditorAccess(req, booking);
  const payload = await buildActorPayload(req, { notes: req.body?.notes });
  const result = await externalFileManager.proxyRequest(`/workflows/${encodeURIComponent(booking.stream_project_booking_id)}/${path}`, { method: 'POST', body: JSON.stringify(payload) });
  await notifyWorkflowSubmission({ booking, type, summary: result?.data?.summary, submittedByName: payload.byName, notes: payload.notes });
  return result;
});

exports.submitApproval = submitWorkflow('submit-approval', 'files_submitted_for_approval');
exports.submitRevision = submitWorkflow('submit-revision', 'revision_submitted');

exports.complete = (req, res) => proxyForBooking(req, res, async (booking) => {
  await ensureProducerOrAdmin(req, booking);
  return externalFileManager.proxyRequest(`/workflows/${encodeURIComponent(booking.stream_project_booking_id)}/complete`, { method: 'POST', body: JSON.stringify(await buildActorPayload(req, req.body || {})) });
});

['timeline', 'next-action'].forEach((endpoint) => {
  exports[endpoint === 'next-action' ? 'getNextAction' : 'getTimeline'] = (req, res) => proxyForBooking(req, res, async (booking) => {
    await ensureBookingAccess(req, booking);
    return externalFileManager.proxyRequest(`/workflows/${encodeURIComponent(booking.stream_project_booking_id)}/${endpoint}`);
  });
});

exports.getBeforeAfter = (req, res) => proxyForBooking(req, res, async (booking) => {
  await ensureBookingAccess(req, booking);
  const path = normalizeId(req.query.path);
  if (!path) throw workflowError('path is required');
  return externalFileManager.proxyRequest(`/workflows/${encodeURIComponent(booking.stream_project_booking_id)}/before-after?path=${encodeURIComponent(path)}`);
});

exports.getStorageUsage = async (req, res) => {
  try {
    if (req.query.bookingId) {
      const booking = await getBooking(req.query.bookingId);
      await ensureBookingAccess(req, booking);
      return res.status(200).json(await externalFileManager.proxyRequest(`/workflows-storage-usage?orderId=${encodeURIComponent(booking.stream_project_booking_id)}`));
    }
    return res.status(200).json(await externalFileManager.proxyRequest('/workflows-storage-usage'));
  } catch (error) {
    return responseError(res, error);
  }
};
