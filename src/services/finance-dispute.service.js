const db = require('../models');
const { S3UploadFiles, toAbsoluteBeigeAssetUrl } = require('../utils/common');

const DISPUTE_STATUSES = ['open', 'in_review', 'resolved', 'rejected', 'escalated'];
const DISPUTE_CATEGORIES = ['quality', 'payment_delay', 'wrong_deliverables', 'refund', 'payout_issues', 'other'];

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function toPositiveInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function stringifyMetadata(value) {
  if (!value) return null;
  try {
    return JSON.stringify(value);
  } catch (_) {
    return null;
  }
}

function toPlain(record) {
  if (!record) return null;
  if (typeof record.get === 'function') return record.get({ plain: true });
  if (typeof record.toJSON === 'function') return record.toJSON();
  return record;
}

function validateEnum(value, allowed, fallback) {
  const normalized = String(value || '').trim();
  return allowed.includes(normalized) ? normalized : fallback;
}

function creatorName(creator) {
  if (!creator) return null;
  return [creator.first_name, creator.last_name].filter(Boolean).join(' ').trim() || creator.email || null;
}

function buildInitials(nameOrRecord) {
  const name = typeof nameOrRecord === 'string'
    ? nameOrRecord
    : (nameOrRecord?.name || creatorName(nameOrRecord) || nameOrRecord?.email || '');
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function formatIssueType(category) {
  return String(category || 'other')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildDisputeCode(id) {
  return `DIS-${String(id).padStart(3, '0')}`;
}

function buildTemporaryDisputeCode() {
  return `DIS-TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function getRequesterName(dispute) {
  if (dispute.raised_by_type === 'creator') return creatorName(dispute.raised_by_creator || dispute.creator);
  if (dispute.raised_by_type === 'client') return dispute.raised_by_user?.name || dispute.client?.name || dispute.raised_by_user?.email || dispute.client?.email || null;
  return dispute.raised_by_user?.name || dispute.created_by?.name || 'Admin';
}

function formatTimelineEntry(log) {
  return {
    id: log.finance_dispute_resolution_log_id,
    action: log.action,
    from_status: log.from_status,
    to_status: log.to_status,
    amount: log.amount === null || log.amount === undefined ? null : toMoney(log.amount),
    notes: log.notes,
    created_at: log.created_at,
    performed_by: log.performed_by ? {
      id: log.performed_by.id,
      name: log.performed_by.name,
      email: log.performed_by.email
    } : null,
    metadata: parseJson(log.metadata_json, {})
  };
}

function formatDisputeRow(dispute) {
  const plain = toPlain(dispute);
  const requesterName = getRequesterName(plain);
  const invoiceLabel = plain.invoice?.invoice_number || (plain.invoice_send_history_id ? `INV-${plain.invoice_send_history_id}` : null);
  const shootId = plain.booking_id ? `SH-${String(plain.booking_id).padStart(3, '0')}` : null;

  return {
    dispute_id: plain.finance_dispute_id,
    dispute_code: plain.dispute_code,
    status: plain.status,
    priority: plain.priority,
    issue_type: formatIssueType(plain.category),
    category: plain.category,
    shoot_id: shootId,
    booking_id: plain.booking_id,
    invoice_id: invoiceLabel,
    invoice_send_history_id: plain.invoice_send_history_id,
    subject: plain.subject,
    description: plain.description,
    disputed_amount: toMoney(plain.disputed_amount),
    payout_hold_amount: toMoney(plain.payout_hold_amount),
    impacted_payout_amount: toMoney(plain.impacted_payout_amount),
    raised_by: {
      type: plain.raised_by_type,
      id: plain.raised_by_type === 'creator' ? plain.raised_by_creator_id : plain.raised_by_user_id,
      name: requesterName,
      initials: buildInitials(requesterName)
    },
    client: plain.client ? {
      id: plain.client.id,
      name: plain.client.name,
      email: plain.client.email,
      initials: buildInitials(plain.client)
    } : null,
    creator: plain.creator ? {
      id: plain.creator.crew_member_id,
      name: creatorName(plain.creator),
      email: plain.creator.email,
      initials: buildInitials(plain.creator)
    } : null,
    created_at: plain.created_at,
    updated_at: plain.updated_at,
    actions: buildAdminActions(plain.status)
  };
}

function buildAdminActions(status) {
  return {
    can_update: !['resolved', 'rejected'].includes(status),
    can_add_comment: true,
    can_hold_payout: !['resolved', 'rejected'].includes(status),
    can_resolve: !['resolved', 'rejected'].includes(status),
    can_reject: !['resolved', 'rejected'].includes(status),
    can_escalate: !['resolved', 'rejected', 'escalated'].includes(status)
  };
}

function includeForList() {
  return [
    { model: db.stream_project_booking, as: 'booking', required: false, attributes: ['stream_project_booking_id', 'project_name', 'user_id', 'guest_email', 'stripe_invoice_id'] },
    { model: db.invoice_send_history, as: 'invoice', required: false, attributes: ['invoice_send_history_id', 'invoice_number', 'invoice_url', 'invoice_pdf', 'payment_status'] },
    { model: db.users, as: 'client', required: false, attributes: ['id', 'name', 'email'] },
    { model: db.crew_members, as: 'creator', required: false, attributes: ['crew_member_id', 'first_name', 'last_name', 'email', 'primary_role'] },
    { model: db.users, as: 'raised_by_user', required: false, attributes: ['id', 'name', 'email'] },
    { model: db.crew_members, as: 'raised_by_creator', required: false, attributes: ['crew_member_id', 'first_name', 'last_name', 'email'] },
    { model: db.users, as: 'created_by', required: false, attributes: ['id', 'name', 'email'] }
  ];
}

function includeForDetails() {
  return [
    ...includeForList(),
    {
      model: db.finance_dispute_comments,
      as: 'comments',
      required: false,
      include: [
        { model: db.users, as: 'created_by', required: false, attributes: ['id', 'name', 'email'] },
        { model: db.crew_members, as: 'created_by_creator', required: false, attributes: ['crew_member_id', 'first_name', 'last_name', 'email'] }
      ]
    },
    {
      model: db.finance_dispute_attachments,
      as: 'attachments',
      required: false,
      include: [{ model: db.users, as: 'uploaded_by', required: false, attributes: ['id', 'name', 'email'] }]
    },
    {
      model: db.finance_dispute_payout_holds,
      as: 'payout_holds',
      required: false,
      include: [
        { model: db.crew_members, as: 'creator', required: false, attributes: ['crew_member_id', 'first_name', 'last_name', 'email'] },
        { model: db.creator_earnings, as: 'creator_earning', required: false },
        { model: db.creator_payout_requests, as: 'payout_request', required: false, attributes: ['creator_payout_request_id', 'request_code', 'status', 'amount'] }
      ]
    },
    {
      model: db.finance_dispute_resolution_logs,
      as: 'resolution_logs',
      required: false,
      include: [{ model: db.users, as: 'performed_by', required: false, attributes: ['id', 'name', 'email'] }]
    }
  ];
}

async function createAuditLog(disputeId, action, data = {}, transaction = null) {
  const log = await db.finance_dispute_resolution_logs.create({
    finance_dispute_id: disputeId,
    action,
    from_status: data.from_status || null,
    to_status: data.to_status || null,
    amount: data.amount === undefined ? null : toMoney(data.amount),
    notes: data.notes || null,
    metadata_json: stringifyMetadata(data.metadata || null),
    performed_by_user_id: data.userId || null
  }, { transaction });

  const dispute = data.dispute || await db.finance_disputes.findByPk(disputeId, { transaction });
  await db.activity_logs.create({
    activity_type: `finance_dispute_${action}`,
    title: `Finance dispute ${action.replace(/_/g, ' ')}`,
    description: data.notes || `${dispute?.dispute_code || disputeId} ${action.replace(/_/g, ' ')}`,
    reference_id: disputeId,
    reference_type: 'finance_dispute'
  }, { transaction });

  return log;
}

async function getDisputeOrThrow(disputeId, options = {}) {
  const id = toPositiveInt(disputeId);
  if (!id) {
    const error = new Error('Valid dispute ID is required');
    error.statusCode = 400;
    throw error;
  }

  const dispute = await db.finance_disputes.findByPk(id, {
    include: options.include || null,
    transaction: options.transaction || null
  });
  if (!dispute) {
    const error = new Error('Dispute not found');
    error.statusCode = 404;
    throw error;
  }
  return dispute;
}

async function hydrateBookingContext(payload, transaction = null) {
  const bookingId = toPositiveInt(payload.booking_id || payload.shoot_id);
  if (!bookingId) return {};

  const booking = await db.stream_project_booking.findByPk(bookingId, {
    include: [
      { model: db.users, as: 'user', required: false, attributes: ['id', 'name', 'email'] },
      { model: db.finance_project_breakdowns, as: 'finance_breakdown', required: false },
      { model: db.creator_earnings, as: 'creator_earnings', required: false }
    ],
    transaction
  });
  if (!booking) {
    const error = new Error('Booking not found');
    error.statusCode = 404;
    throw error;
  }

  const plain = booking.get({ plain: true });
  const invoice = payload.invoice_send_history_id
    ? await db.invoice_send_history.findByPk(payload.invoice_send_history_id, { transaction })
    : await db.invoice_send_history.findOne({ where: { booking_id: bookingId }, order: [['sent_at', 'DESC']], transaction });
  const breakdown = plain.finance_breakdown || null;

  return {
    booking_id: bookingId,
    invoice_send_history_id: invoice?.invoice_send_history_id || null,
    client_user_id: toPositiveInt(payload.client_user_id) || plain.user_id || breakdown?.client_user_id || null,
    currency: payload.currency || breakdown?.currency || 'USD',
    disputed_amount: payload.disputed_amount !== undefined ? toMoney(payload.disputed_amount) : toMoney(breakdown?.outstanding_amount || breakdown?.total_amount || 0),
    impacted_payout_amount: payload.impacted_payout_amount !== undefined
      ? toMoney(payload.impacted_payout_amount)
      : toMoney((plain.creator_earnings || []).reduce((sum, earning) => sum + Number(earning.net_earning_amount || 0), 0))
  };
}

function buildWhere(filters = {}) {
  const Op = db.Sequelize.Op;
  const where = {};
  const search = String(filters.search || filters.q || '').trim();

  if (filters.status) where.status = String(filters.status).split(',').map((status) => status.trim()).filter(Boolean);
  if (filters.category) where.category = filters.category;
  if (filters.raised_by_type) where.raised_by_type = filters.raised_by_type;
  if (filters.client_user_id || filters.client_id) where.client_user_id = filters.client_user_id || filters.client_id;
  if (filters.creator_id) where.creator_id = filters.creator_id;
  if (filters.booking_id || filters.shoot_id) where.booking_id = filters.booking_id || filters.shoot_id;
  if (filters.invoice_send_history_id) where.invoice_send_history_id = filters.invoice_send_history_id;
  if (filters.date_from || filters.date_to) {
    where.created_at = {};
    if (filters.date_from) where.created_at[Op.gte] = new Date(filters.date_from);
    if (filters.date_to) where.created_at[Op.lte] = new Date(filters.date_to);
  }

  if (search) {
    const numericSearch = search.match(/\d+/)?.[0];
    const term = `%${search}%`;
    where[Op.or] = [
      { dispute_code: { [Op.like]: term } },
      { subject: { [Op.like]: term } },
      { description: { [Op.like]: term } },
      { '$booking.project_name$': { [Op.like]: term } },
      { '$booking.guest_email$': { [Op.like]: term } },
      { '$booking.stripe_invoice_id$': { [Op.like]: term } },
      { '$invoice.invoice_number$': { [Op.like]: term } },
      { '$client.name$': { [Op.like]: term } },
      { '$client.email$': { [Op.like]: term } },
      { '$creator.first_name$': { [Op.like]: term } },
      { '$creator.last_name$': { [Op.like]: term } },
      { '$creator.email$': { [Op.like]: term } }
    ];
    if (numericSearch) {
      where[Op.or].push({ finance_dispute_id: Number(numericSearch) });
      where[Op.or].push({ booking_id: Number(numericSearch) });
      where[Op.or].push({ invoice_send_history_id: Number(numericSearch) });
    }
  }

  return where;
}

function getSort(filters = {}) {
  const sortBy = String(filters.sort_by || 'created_at');
  const sortDir = String(filters.sort_dir || filters.order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const allowed = new Set(['created_at', 'updated_at', 'disputed_amount', 'payout_hold_amount', 'impacted_payout_amount', 'status']);
  return [[allowed.has(sortBy) ? sortBy : 'created_at', sortDir]];
}

async function getAdminDisputesDashboard(filters = {}) {
  const Op = db.Sequelize.Op;
  const baseWhere = buildWhere({ ...filters, search: null, q: null });
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [total, open, inReview, resolvedLast30d, impactedPayout, recent] = await Promise.all([
    db.finance_disputes.count({ where: baseWhere }),
    db.finance_disputes.count({ where: { ...baseWhere, status: 'open' } }),
    db.finance_disputes.count({ where: { ...baseWhere, status: 'in_review' } }),
    db.finance_disputes.count({ where: { ...baseWhere, status: 'resolved', resolved_at: { [Op.gte]: thirtyDaysAgo } } }),
    db.finance_disputes.sum('impacted_payout_amount', { where: { ...baseWhere, status: { [Op.in]: ['open', 'in_review', 'escalated'] } } }),
    db.finance_disputes.findAll({
      where: baseWhere,
      limit: 5,
      order: [['created_at', 'DESC']],
      include: includeForList(),
      subQuery: false
    })
  ]);

  return {
    overview: {
      total_disputes: total,
      open_disputes: open,
      in_review: inReview,
      resolved_last_30d: resolvedLast30d,
      impacted_payout_total: toMoney(impactedPayout || 0)
    },
    filters: {
      statuses: DISPUTE_STATUSES,
      categories: DISPUTE_CATEGORIES,
      raised_by_types: ['client', 'creator', 'admin']
    },
    recent_disputes: recent.map(formatDisputeRow)
  };
}

async function listAdminDisputes(filters = {}) {
  const page = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;

  const result = await db.finance_disputes.findAndCountAll({
    where: buildWhere(filters),
    distinct: true,
    limit,
    offset,
    order: getSort(filters),
    include: includeForList(),
    subQuery: false
  });

  return {
    rows: result.rows.map(formatDisputeRow),
    pagination: {
      page,
      limit,
      total: result.count,
      total_pages: Math.ceil(result.count / limit)
    }
  };
}

function hasUploadedFiles(files) {
  if (!files) return false;
  if (Array.isArray(files)) return files.length > 0;
  if (typeof files === 'object') {
    return Object.values(files).some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value));
  }
  return false;
}

async function getClientContext(userContext = {}) {
  const userId = toPositiveInt(userContext.userId);
  if (!userId) {
    const error = new Error('Authentication required');
    error.statusCode = 401;
    throw error;
  }

  const user = await db.users.findByPk(userId, { attributes: ['id', 'name', 'email'] });
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 401;
    throw error;
  }

  return user.get({ plain: true });
}

function buildClientDisputeWhere(filters = {}, client = {}) {
  const Op = db.Sequelize.Op;
  const where = buildWhere(filters);
  const clientScope = [{ client_user_id: client.id }, { raised_by_user_id: client.id }];
  if (client.email) {
    where[Op.and] = [
      ...(where[Op.and] || []),
      {
        [Op.or]: [
          ...clientScope,
          { '$booking.guest_email$': client.email },
          { '$invoice.client_email$': client.email }
        ]
      }
    ];
  } else {
    where[Op.and] = [
      ...(where[Op.and] || []),
      { [Op.or]: clientScope }
    ];
  }
  return where;
}

async function assertClientCanAccessBooking(bookingId, client, transaction = null) {
  const id = toPositiveInt(bookingId);
  if (!id) {
    const error = new Error('booking_id is required');
    error.statusCode = 400;
    throw error;
  }

  const Op = db.Sequelize.Op;
  const booking = await db.stream_project_booking.findOne({
    where: {
      stream_project_booking_id: id,
      [Op.or]: [
        { user_id: client.id },
        ...(client.email ? [{ guest_email: client.email }] : [])
      ]
    },
    transaction
  });

  if (!booking) {
    const error = new Error('Booking not found for this client');
    error.statusCode = 404;
    throw error;
  }

  return booking;
}

async function listClientDisputes(filters = {}, userContext = {}) {
  const client = await getClientContext(userContext);
  const page = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;

  const result = await db.finance_disputes.findAndCountAll({
    where: buildClientDisputeWhere(filters, client),
    distinct: true,
    limit,
    offset,
    order: getSort(filters),
    include: includeForList(),
    subQuery: false
  });

  return {
    rows: result.rows.map(formatDisputeRow),
    pagination: {
      page,
      limit,
      total: result.count,
      total_pages: Math.ceil(result.count / limit)
    },
    filters: {
      statuses: DISPUTE_STATUSES,
      categories: DISPUTE_CATEGORIES
    }
  };
}

async function getClientDisputeDetails(disputeId, userContext = {}) {
  const client = await getClientContext(userContext);
  const dispute = await db.finance_disputes.findOne({
    where: {
      finance_dispute_id: toPositiveInt(disputeId),
      ...buildClientDisputeWhere({}, client)
    },
    include: includeForDetails(),
    subQuery: false
  });

  if (!dispute) {
    const error = new Error('Dispute not found');
    error.statusCode = 404;
    throw error;
  }

  const details = await getAdminDisputeDetails(dispute.finance_dispute_id);
  return {
    ...details,
    internal_comments: (details.internal_comments || []).filter((comment) => ['client', 'all'].includes(comment.visibility))
  };
}

async function createClientDispute(payload = {}, files = null, userContext = {}) {
  const client = await getClientContext(userContext);
  await assertClientCanAccessBooking(payload.booking_id || payload.shoot_id, client);

  const subject = String(payload.subject || payload.dispute_type || payload.category || payload.issue_type || 'Booking dispute').trim();
  const dispute = await createAdminDispute({
    ...payload,
    subject,
    raised_by_type: 'client',
    raised_by_user_id: client.id,
    client_user_id: client.id,
    status: 'open'
  }, { userId: client.id });

  if (hasUploadedFiles(files) || payload.attachments || payload.file_path) {
    await addDisputeAttachment(dispute.dispute_id, payload, files, { userId: client.id });
  }

  return getClientDisputeDetails(dispute.dispute_id, { userId: client.id });
}

async function addClientDisputeComment(disputeId, payload = {}, userContext = {}) {
  const client = await getClientContext(userContext);
  await getClientDisputeDetails(disputeId, { userId: client.id });
  return addDisputeComment(disputeId, {
    ...payload,
    visibility: 'all',
    comment_type: 'status_update'
  }, { userId: client.id });
}

async function addClientDisputeAttachment(disputeId, payload = {}, files = null, userContext = {}) {
  const client = await getClientContext(userContext);
  await getClientDisputeDetails(disputeId, { userId: client.id });
  return addDisputeAttachment(disputeId, payload, files, { userId: client.id });
}

async function getAdminDisputeDetails(disputeId) {
  const dispute = await getDisputeOrThrow(disputeId, { include: includeForDetails() });
  const plain = dispute.get({ plain: true });
  const row = formatDisputeRow(plain);
  const comments = [...(plain.comments || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const attachments = [...(plain.attachments || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const holds = [...(plain.payout_holds || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const timeline = [...(plain.resolution_logs || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  return {
    ...row,
    project: plain.booking ? {
      id: plain.booking.stream_project_booking_id,
      name: plain.booking.project_name,
      guest_email: plain.booking.guest_email
    } : null,
    invoice: plain.invoice ? {
      id: plain.invoice.invoice_send_history_id,
      invoice_number: plain.invoice.invoice_number,
      invoice_url: plain.invoice.invoice_url,
      invoice_pdf: plain.invoice.invoice_pdf,
      payment_status: plain.invoice.payment_status
    } : null,
    resolution: {
      type: plain.resolution_type,
      notes: plain.resolution_notes,
      resolved_at: plain.resolved_at,
      resolved_by: plain.resolved_by ? {
        id: plain.resolved_by.id,
        name: plain.resolved_by.name,
        email: plain.resolved_by.email
      } : null
    },
    timeline: timeline.map(formatTimelineEntry),
    internal_comments: comments.map((comment) => ({
      id: comment.finance_dispute_comment_id,
      comment_type: comment.comment_type,
      visibility: comment.visibility,
      body: comment.body,
      created_at: comment.created_at,
      created_by: comment.created_by ? {
        id: comment.created_by.id,
        name: comment.created_by.name,
        email: comment.created_by.email,
        initials: buildInitials(comment.created_by)
      } : null,
      created_by_creator: comment.created_by_creator ? {
        id: comment.created_by_creator.crew_member_id,
        name: creatorName(comment.created_by_creator),
        email: comment.created_by_creator.email,
        initials: buildInitials(comment.created_by_creator)
      } : null
    })),
    attachments: attachments.map((attachment) => ({
      id: attachment.finance_dispute_attachment_id,
      file_name: attachment.file_name,
      file_path: attachment.file_path,
      file_url: attachment.file_url || toAbsoluteBeigeAssetUrl(attachment.file_path),
      file_size_bytes: attachment.file_size_bytes,
      mime_type: attachment.mime_type,
      attachment_type: attachment.attachment_type,
      created_at: attachment.created_at
    })),
    payout_holds: holds.map((hold) => ({
      id: hold.finance_dispute_payout_hold_id,
      creator_id: hold.creator_id,
      creator_name: creatorName(hold.creator),
      creator_earning_id: hold.creator_earning_id,
      creator_payout_request_id: hold.creator_payout_request_id,
      payout_request_code: hold.payout_request?.request_code || null,
      currency: hold.currency,
      hold_amount: toMoney(hold.hold_amount),
      released_amount: toMoney(hold.released_amount),
      status: hold.status,
      reason: hold.reason,
      held_at: hold.held_at,
      released_at: hold.released_at
    }))
  };
}

async function createAdminDispute(payload = {}, options = {}) {
  const transaction = options.transaction || await db.sequelize.transaction();
  const externalTransaction = Boolean(options.transaction);

  try {
    const subject = String(payload.subject || '').trim();
    if (!subject) {
      const error = new Error('subject is required');
      error.statusCode = 400;
      throw error;
    }

    const context = await hydrateBookingContext(payload, transaction);
    const raisedByType = validateEnum(payload.raised_by_type, ['client', 'creator', 'admin'], 'admin');
    const creatorId = toPositiveInt(payload.creator_id || (raisedByType === 'creator' ? payload.raised_by_creator_id : null));
    const dispute = await db.finance_disputes.create({
      dispute_code: buildTemporaryDisputeCode(),
      booking_id: context.booking_id || null,
      invoice_send_history_id: toPositiveInt(payload.invoice_send_history_id) || context.invoice_send_history_id || null,
      finance_transaction_id: toPositiveInt(payload.finance_transaction_id),
      client_user_id: toPositiveInt(payload.client_user_id) || context.client_user_id || null,
      creator_id: creatorId,
      raised_by_type: raisedByType,
      raised_by_user_id: toPositiveInt(payload.raised_by_user_id) || (raisedByType !== 'creator' ? options.userId || null : null),
      raised_by_creator_id: toPositiveInt(payload.raised_by_creator_id) || (raisedByType === 'creator' ? creatorId : null),
      category: validateEnum(payload.category || payload.issue_type || payload.reason, DISPUTE_CATEGORIES, 'other'),
      subject,
      description: payload.description || null,
      status: validateEnum(payload.status, DISPUTE_STATUSES, 'open'),
      priority: validateEnum(payload.priority, ['low', 'medium', 'high', 'urgent'], 'medium'),
      currency: payload.currency || context.currency || 'USD',
      disputed_amount: payload.disputed_amount !== undefined ? toMoney(payload.disputed_amount) : context.disputed_amount,
      payout_hold_amount: toMoney(payload.payout_hold_amount || 0),
      impacted_payout_amount: payload.impacted_payout_amount !== undefined ? toMoney(payload.impacted_payout_amount) : context.impacted_payout_amount,
      metadata_json: stringifyMetadata(payload.metadata || null),
      created_by_user_id: options.userId || null,
      updated_by_user_id: options.userId || null,
      updated_at: new Date()
    }, { transaction });

    await dispute.update({ dispute_code: buildDisputeCode(dispute.finance_dispute_id) }, { transaction });
    await createAuditLog(dispute.finance_dispute_id, 'created', {
      to_status: dispute.status,
      amount: dispute.disputed_amount,
      notes: payload.description || 'Dispute created',
      userId: options.userId,
      dispute
    }, transaction);

    if (payload.comment) {
      await addDisputeComment(dispute.finance_dispute_id, { body: payload.comment }, { ...options, transaction });
    }

    if (!externalTransaction) await transaction.commit();
    return getAdminDisputeDetails(dispute.finance_dispute_id);
  } catch (error) {
    if (!externalTransaction && transaction && !transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function updateAdminDispute(disputeId, payload = {}, options = {}) {
  const transaction = options.transaction || await db.sequelize.transaction();
  const externalTransaction = Boolean(options.transaction);

  try {
    const dispute = await getDisputeOrThrow(disputeId, { transaction });
    const previousStatus = dispute.status;
    const updates = {};
    [
      'subject',
      'description',
      'priority',
      'currency',
      'resolution_notes'
    ].forEach((field) => {
      if (payload[field] !== undefined) updates[field] = payload[field];
    });

    if (payload.status !== undefined) updates.status = validateEnum(payload.status, DISPUTE_STATUSES, dispute.status);
    if (payload.category !== undefined || payload.issue_type !== undefined) updates.category = validateEnum(payload.category || payload.issue_type, DISPUTE_CATEGORIES, dispute.category);
    if (payload.booking_id !== undefined || payload.shoot_id !== undefined) updates.booking_id = toPositiveInt(payload.booking_id || payload.shoot_id);
    if (payload.invoice_send_history_id !== undefined) updates.invoice_send_history_id = toPositiveInt(payload.invoice_send_history_id);
    if (payload.client_user_id !== undefined) updates.client_user_id = toPositiveInt(payload.client_user_id);
    if (payload.creator_id !== undefined) updates.creator_id = toPositiveInt(payload.creator_id);
    if (payload.disputed_amount !== undefined) updates.disputed_amount = toMoney(payload.disputed_amount);
    if (payload.payout_hold_amount !== undefined) updates.payout_hold_amount = toMoney(payload.payout_hold_amount);
    if (payload.impacted_payout_amount !== undefined) updates.impacted_payout_amount = toMoney(payload.impacted_payout_amount);
    if (payload.metadata !== undefined) updates.metadata_json = stringifyMetadata(payload.metadata);
    updates.updated_by_user_id = options.userId || null;
    updates.updated_at = new Date();

    await dispute.update(updates, { transaction });
    await createAuditLog(dispute.finance_dispute_id, 'updated', {
      from_status: previousStatus,
      to_status: dispute.status,
      notes: payload.notes || 'Dispute updated',
      metadata: { changed_fields: Object.keys(updates) },
      userId: options.userId,
      dispute
    }, transaction);

    if (!externalTransaction) await transaction.commit();
    return getAdminDisputeDetails(dispute.finance_dispute_id);
  } catch (error) {
    if (!externalTransaction && transaction && !transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function addDisputeComment(disputeId, payload = {}, options = {}) {
  const transaction = options.transaction || await db.sequelize.transaction();
  const externalTransaction = Boolean(options.transaction);

  try {
    const dispute = await getDisputeOrThrow(disputeId, { transaction });
    const body = String(payload.body || payload.comment || '').trim();
    if (!body) {
      const error = new Error('comment body is required');
      error.statusCode = 400;
      throw error;
    }

    const comment = await db.finance_dispute_comments.create({
      finance_dispute_id: dispute.finance_dispute_id,
      comment_type: validateEnum(payload.comment_type, ['internal', 'status_update', 'resolution', 'system'], 'internal'),
      visibility: validateEnum(payload.visibility, ['internal', 'client', 'creator', 'all'], 'internal'),
      body,
      created_by_user_id: options.userId || payload.created_by_user_id || null,
      created_by_creator_id: toPositiveInt(payload.created_by_creator_id),
      metadata_json: stringifyMetadata(payload.metadata || null)
    }, { transaction });

    await dispute.update({ updated_at: new Date(), updated_by_user_id: options.userId || null }, { transaction });
    await createAuditLog(dispute.finance_dispute_id, 'comment_added', {
      notes: body.slice(0, 500),
      metadata: { comment_id: comment.finance_dispute_comment_id, visibility: comment.visibility },
      userId: options.userId,
      dispute
    }, transaction);

    if (!externalTransaction) await transaction.commit();
    return comment;
  } catch (error) {
    if (!externalTransaction && transaction && !transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function addDisputeAttachment(disputeId, payload = {}, files = null, options = {}) {
  const transaction = options.transaction || await db.sequelize.transaction();
  const externalTransaction = Boolean(options.transaction);

  try {
    const dispute = await getDisputeOrThrow(disputeId, { transaction });
    const rows = [];
    const uploadedFiles = files ? await S3UploadFiles(files) : [];
    const directAttachments = Array.isArray(payload.attachments) ? payload.attachments : [];

    for (const uploaded of uploadedFiles) {
      rows.push({
        finance_dispute_id: dispute.finance_dispute_id,
        file_name: uploaded.originalname || uploaded.file_path,
        file_path: uploaded.file_path,
        file_url: toAbsoluteBeigeAssetUrl(uploaded.file_path),
        attachment_type: validateEnum(payload.attachment_type, ['evidence', 'invoice', 'deliverable', 'refund_proof', 'payout_proof', 'other'], 'evidence'),
        uploaded_by_user_id: options.userId || null,
        metadata_json: stringifyMetadata({ file_type: uploaded.file_type })
      });
    }

    for (const attachment of directAttachments) {
      rows.push({
        finance_dispute_id: dispute.finance_dispute_id,
        file_name: attachment.file_name || attachment.name || attachment.file_path || attachment.file_url,
        file_path: attachment.file_path || attachment.file_url,
        file_url: attachment.file_url || toAbsoluteBeigeAssetUrl(attachment.file_path),
        file_size_bytes: attachment.file_size_bytes || null,
        mime_type: attachment.mime_type || null,
        attachment_type: validateEnum(attachment.attachment_type || payload.attachment_type, ['evidence', 'invoice', 'deliverable', 'refund_proof', 'payout_proof', 'other'], 'evidence'),
        uploaded_by_user_id: options.userId || null,
        metadata_json: stringifyMetadata(attachment.metadata || null)
      });
    }

    if (!rows.length && payload.file_path) {
      rows.push({
        finance_dispute_id: dispute.finance_dispute_id,
        file_name: payload.file_name || payload.file_path,
        file_path: payload.file_path,
        file_url: payload.file_url || toAbsoluteBeigeAssetUrl(payload.file_path),
        file_size_bytes: payload.file_size_bytes || null,
        mime_type: payload.mime_type || null,
        attachment_type: validateEnum(payload.attachment_type, ['evidence', 'invoice', 'deliverable', 'refund_proof', 'payout_proof', 'other'], 'evidence'),
        uploaded_by_user_id: options.userId || null,
        metadata_json: stringifyMetadata(payload.metadata || null)
      });
    }

    if (!rows.length) {
      const error = new Error('At least one attachment is required');
      error.statusCode = 400;
      throw error;
    }

    const attachments = await db.finance_dispute_attachments.bulkCreate(rows, { transaction });
    await dispute.update({ updated_at: new Date(), updated_by_user_id: options.userId || null }, { transaction });
    await createAuditLog(dispute.finance_dispute_id, 'attachment_added', {
      notes: `${attachments.length} attachment(s) added`,
      metadata: { attachment_ids: attachments.map((item) => item.finance_dispute_attachment_id) },
      userId: options.userId,
      dispute
    }, transaction);

    if (!externalTransaction) await transaction.commit();
    return attachments;
  } catch (error) {
    if (!externalTransaction && transaction && !transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function holdDisputePayout(disputeId, payload = {}, options = {}) {
  const transaction = options.transaction || await db.sequelize.transaction();
  const externalTransaction = Boolean(options.transaction);

  try {
    const dispute = await getDisputeOrThrow(disputeId, { transaction });
    const creatorId = toPositiveInt(payload.creator_id || dispute.creator_id);
    const amount = toMoney(payload.hold_amount || payload.amount || dispute.impacted_payout_amount || dispute.payout_hold_amount);
    if (!creatorId || !(amount > 0)) {
      const error = new Error('creator_id and positive hold_amount are required');
      error.statusCode = 400;
      throw error;
    }

    const hold = await db.finance_dispute_payout_holds.create({
      finance_dispute_id: dispute.finance_dispute_id,
      creator_id: creatorId,
      creator_earning_id: toPositiveInt(payload.creator_earning_id),
      creator_payout_request_id: toPositiveInt(payload.creator_payout_request_id),
      currency: payload.currency || dispute.currency || 'USD',
      hold_amount: amount,
      reason: payload.reason || dispute.subject,
      held_by_user_id: options.userId || null,
      metadata_json: stringifyMetadata(payload.metadata || null),
      updated_at: new Date()
    }, { transaction });

    if (hold.creator_earning_id) {
      await db.creator_earnings.update(
        { status: 'held', updated_at: new Date() },
        { where: { creator_earning_id: hold.creator_earning_id }, transaction }
      );
    }

    await dispute.update({
      status: dispute.status === 'open' ? 'in_review' : dispute.status,
      payout_hold_amount: toMoney(Number(dispute.payout_hold_amount || 0) + amount),
      impacted_payout_amount: toMoney(Math.max(Number(dispute.impacted_payout_amount || 0), amount)),
      updated_at: new Date(),
      updated_by_user_id: options.userId || null
    }, { transaction });

    await createAuditLog(dispute.finance_dispute_id, 'payout_hold_created', {
      from_status: dispute.status,
      to_status: dispute.status === 'open' ? 'in_review' : dispute.status,
      amount,
      notes: payload.reason || 'Payout hold created',
      metadata: { hold_id: hold.finance_dispute_payout_hold_id, creator_id: creatorId },
      userId: options.userId,
      dispute
    }, transaction);

    if (!externalTransaction) await transaction.commit();
    return hold;
  } catch (error) {
    if (!externalTransaction && transaction && !transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function closeDispute(disputeId, payload = {}, options = {}, closeStatus = 'resolved') {
  const transaction = options.transaction || await db.sequelize.transaction();
  const externalTransaction = Boolean(options.transaction);

  try {
    const dispute = await getDisputeOrThrow(disputeId, { transaction });
    const previousStatus = dispute.status;
    const resolutionType = validateEnum(
      payload.resolution_type || (closeStatus === 'rejected' ? 'no_action' : 'payout_release'),
      ['payout_release', 'refund', 'partial_refund', 'credit_compensation', 'payout_adjustment', 'no_action', 'other'],
      closeStatus === 'rejected' ? 'no_action' : 'payout_release'
    );

    if (payload.release_payout_holds || resolutionType === 'payout_release') {
      const holds = await db.finance_dispute_payout_holds.findAll({
        where: {
          finance_dispute_id: dispute.finance_dispute_id,
          status: ['held', 'partially_released']
        },
        transaction
      });
      for (const hold of holds) {
        await hold.update({
          status: 'released',
          released_amount: hold.hold_amount,
          released_by_user_id: options.userId || null,
          released_at: new Date(),
          updated_at: new Date()
        }, { transaction });
        if (hold.creator_earning_id) {
          await db.creator_earnings.update(
            { status: 'pending', updated_at: new Date() },
            { where: { creator_earning_id: hold.creator_earning_id, status: 'held' }, transaction }
          );
        }
      }
    }

    await dispute.update({
      status: closeStatus,
      resolution_type: resolutionType,
      resolution_notes: payload.resolution_notes || payload.notes || null,
      resolved_by_user_id: options.userId || null,
      resolved_at: new Date(),
      updated_by_user_id: options.userId || null,
      updated_at: new Date(),
      metadata_json: stringifyMetadata({
        ...parseJson(dispute.metadata_json, {}),
        refund_amount: payload.refund_amount === undefined ? undefined : toMoney(payload.refund_amount),
        credit_amount: payload.credit_amount === undefined ? undefined : toMoney(payload.credit_amount)
      })
    }, { transaction });

    await createAuditLog(dispute.finance_dispute_id, closeStatus === 'rejected' ? 'rejected' : (resolutionType.includes('refund') ? 'refunded' : 'resolved'), {
      from_status: previousStatus,
      to_status: closeStatus,
      amount: payload.refund_amount || payload.credit_amount || dispute.disputed_amount,
      notes: payload.resolution_notes || payload.notes || `${closeStatus} dispute`,
      metadata: {
        resolution_type: resolutionType,
        refund_amount: payload.refund_amount === undefined ? null : toMoney(payload.refund_amount),
        credit_amount: payload.credit_amount === undefined ? null : toMoney(payload.credit_amount)
      },
      userId: options.userId,
      dispute
    }, transaction);

    if (!externalTransaction) await transaction.commit();
    return getAdminDisputeDetails(dispute.finance_dispute_id);
  } catch (error) {
    if (!externalTransaction && transaction && !transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function escalateDispute(disputeId, payload = {}, options = {}) {
  const transaction = options.transaction || await db.sequelize.transaction();
  const externalTransaction = Boolean(options.transaction);

  try {
    const dispute = await getDisputeOrThrow(disputeId, { transaction });
    const previousStatus = dispute.status;
    await dispute.update({
      status: 'escalated',
      priority: payload.priority || dispute.priority || 'high',
      updated_by_user_id: options.userId || null,
      updated_at: new Date()
    }, { transaction });

    await createAuditLog(dispute.finance_dispute_id, 'escalated', {
      from_status: previousStatus,
      to_status: 'escalated',
      notes: payload.notes || payload.reason || 'Dispute escalated',
      metadata: {
        escalation_reason: payload.reason || null,
        assigned_team: payload.assigned_team || null
      },
      userId: options.userId,
      dispute
    }, transaction);

    if (!externalTransaction) await transaction.commit();
    return getAdminDisputeDetails(dispute.finance_dispute_id);
  } catch (error) {
    if (!externalTransaction && transaction && !transaction.finished) await transaction.rollback();
    throw error;
  }
}

module.exports = {
  listClientDisputes,
  getClientDisputeDetails,
  createClientDispute,
  addClientDisputeComment,
  addClientDisputeAttachment,
  getAdminDisputesDashboard,
  listAdminDisputes,
  getAdminDisputeDetails,
  createAdminDispute,
  updateAdminDispute,
  addDisputeComment,
  addDisputeAttachment,
  holdDisputePayout,
  resolveDispute: (disputeId, payload, options) => closeDispute(disputeId, payload, options, 'resolved'),
  rejectOrRefundDispute: (disputeId, payload, options) => closeDispute(disputeId, payload, options, payload?.resolution_type && payload.resolution_type !== 'no_action' ? 'resolved' : 'rejected'),
  escalateDispute
};
