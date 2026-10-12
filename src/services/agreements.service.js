const crypto = require('crypto');
const db = require('../models');
const { Op } = db.Sequelize;

const GENERAL = 'general';
const SHOOT = 'shoot';
const PENDING = 'pending_acceptance';

const error = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const plain = (value) => value && (typeof value.get === 'function' ? value.get({ plain: true }) : value);
const stringify = (value) => value == null ? null : (typeof value === 'string' ? value : JSON.stringify(value));
const parse = (value, fallback = null) => {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
};
const hashContent = (contentHtml, contentJson) => crypto.createHash('sha256')
  .update(`${contentHtml || ''}\n${stringify(contentJson) || ''}`)
  .digest('hex');

function documentPayload(document) {
  const row = plain(document);
  if (!row) return null;
  return {
    ...row,
    content_json: parse(row.content_json),
    snapshot: parse(row.snapshot_json, {}),
    snapshot_json: undefined
  };
}

async function event(documentId, eventType, actor = {}, metadata = {}, transaction) {
  return db.agreement_events.create({
    agreement_document_id: documentId,
    actor_user_id: actor.userId || null,
    actor_creator_id: actor.creatorId || null,
    event_type: eventType,
    metadata_json: stringify(metadata)
  }, { transaction });
}

async function templateById(id) {
  const template = await db.agreement_templates.findByPk(Number(id));
  if (!template) throw error('Agreement template not found', 404);
  return template;
}

async function createGeneralTemplate(payload, actor) {
  const title = String(payload.title || '').trim();
  const contentHtml = String(payload.content_html || '').trim();
  const version = String(payload.version || '').trim();
  if (!title || !contentHtml || !version) throw error('title, version and content_html are required');

  const contentJson = payload.content_json || null;
  return db.agreement_templates.create({
    agreement_type: GENERAL, title, description: payload.description || null, content_html: contentHtml,
    content_json: stringify(contentJson), version, content_hash: hashContent(contentHtml, contentJson),
    is_mandatory: payload.is_mandatory === false ? 0 : 1, created_by_user_id: actor.userId
  });
}

async function listGeneralTemplates() {
  const rows = await db.agreement_templates.findAll({ where: { agreement_type: GENERAL }, order: [['created_at', 'DESC']] });
  return rows.map(plain);
}

async function updateGeneralTemplate(id, payload, actor) {
  const template = await templateById(id);
  if (template.agreement_type !== GENERAL) throw error('Only general templates can be updated here');
  if (template.status !== 'draft') throw error('Published or retired templates are immutable; create a new version instead', 409);
  const contentHtml = payload.content_html == null ? template.content_html : String(payload.content_html).trim();
  const contentJson = payload.content_json === undefined ? template.content_json : stringify(payload.content_json);
  if (!contentHtml) throw error('content_html cannot be empty');
  await template.update({
    title: payload.title == null ? template.title : String(payload.title).trim(),
    description: payload.description === undefined ? template.description : payload.description,
    content_html: contentHtml, content_json: contentJson,
    content_hash: hashContent(contentHtml, contentJson),
    is_mandatory: payload.is_mandatory === undefined ? template.is_mandatory : Boolean(payload.is_mandatory),
    updated_at: new Date()
  });
  return template;
}

async function publishGeneralTemplate(id, actor) {
  return db.sequelize.transaction(async (transaction) => {
    const template = await db.agreement_templates.findByPk(Number(id), { transaction, lock: transaction.LOCK.UPDATE });
    if (!template) throw error('Agreement template not found', 404);
    if (template.agreement_type !== GENERAL || template.status !== 'draft') throw error('Only a draft general template can be published', 409);
    await db.agreement_templates.update({ status: 'retired', updated_at: new Date() }, {
      where: { agreement_type: GENERAL, status: 'published' }, transaction
    });
    await template.update({ status: 'published', effective_at: new Date(), published_at: new Date(), published_by_user_id: actor.userId }, { transaction });
    return template;
  });
}

async function getPublishedGeneralTemplate(transaction) {
  const template = await db.agreement_templates.findOne({
    where: { agreement_type: GENERAL, status: 'published' }, order: [['published_at', 'DESC']], transaction
  });
  if (!template) throw error('No published general agreement is available', 409);
  return template;
}

async function ensureGeneralDocument(creatorId, transaction) {
  const template = await getPublishedGeneralTemplate(transaction);
  let document = await db.agreement_documents.findOne({
    where: { agreement_type: GENERAL, creator_id: creatorId, agreement_template_id: template.agreement_template_id, is_current: 1 },
    transaction, lock: transaction.LOCK.UPDATE
  });
  if (!document) {
    document = await db.agreement_documents.create({
      agreement_type: GENERAL, agreement_template_id: template.agreement_template_id, creator_id: creatorId,
      version_no: 1, display_version: template.version, status: PENDING, is_current: 1,
      title: template.title, content_html: template.content_html, content_json: template.content_json,
      content_hash: template.content_hash, snapshot_json: stringify({ template_version: template.version, mandatory: Boolean(template.is_mandatory) })
    }, { transaction });
    await event(document.agreement_document_id, 'general_agreement_presented', { creatorId }, { template_id: template.agreement_template_id }, transaction);
  }
  return document;
}

async function getCurrentGeneralAgreement(creatorId) {
  const document = await db.sequelize.transaction((transaction) => ensureGeneralDocument(creatorId, transaction));
  return { acceptance_required: document.status !== 'accepted', agreement: documentPayload(document) };
}

async function creatorHasCurrentGeneralAcceptance(creatorId, transaction) {
  const template = await getPublishedGeneralTemplate(transaction);
  return Boolean(await db.agreement_documents.findOne({
    where: { agreement_type: GENERAL, creator_id: creatorId, agreement_template_id: template.agreement_template_id, status: 'accepted', is_current: 1 },
    transaction, lock: transaction.LOCK.UPDATE
  }));
}

async function getAssignmentContext(bookingId, assignmentId, transaction) {
  const assignment = await db.assigned_crew.findOne({
    where: { id: Number(assignmentId), project_id: Number(bookingId), is_active: 1 }, transaction, lock: transaction.LOCK.UPDATE
  });
  if (!assignment) throw error('Active crew assignment not found for this shoot', 404);
  const [booking, creator, earning] = await Promise.all([
    db.stream_project_booking.findByPk(Number(bookingId), { transaction }),
    db.crew_members.findByPk(Number(assignment.crew_member_id), { transaction }),
    db.creator_earnings.findOne({ where: { booking_id: Number(bookingId), creator_id: Number(assignment.crew_member_id) }, transaction })
  ]);
  if (!booking || !creator) throw error('Shoot or creative partner not found', 404);
  if (!earning) throw error('CP compensation must be configured before creating a shoot agreement', 409);
  return { assignment, booking, creator, earning };
}

function shootSnapshot({ assignment, booking, creator, earning }, payload = {}) {
  return {
    assignment_id: assignment.id, booking_id: booking.stream_project_booking_id, creator_id: creator.crew_member_id,
    creative_partner: { name: [creator.first_name, creator.last_name].filter(Boolean).join(' '), email: creator.email, role: creator.primary_role },
    shoot: {
      name: booking.project_name, type: booking.shoot_type || booking.event_type || null, date: booking.event_date,
      location: booking.event_location, start_time: booking.start_time, end_time: booking.end_time,
      scope: booking.description, equipment: parse(booking.equipments_needed, booking.equipments_needed),
      deliverables: booking.edits_needed ? booking.video_edit_types || booking.photo_edit_types : null,
      special_instructions: booking.special_instructions
    },
    compensation: { creator_earning_id: earning.creator_earning_id, amount: Number(earning.net_earning_amount || earning.gross_amount || 0), currency: earning.currency || 'USD' },
    extras: payload.snapshot_overrides || {}
  };
}

async function createShootAgreement(bookingId, assignmentId, payload, actor) {
  return db.sequelize.transaction(async (transaction) => {
    const context = await getAssignmentContext(bookingId, assignmentId, transaction);
    if (Number(context.assignment.crew_accept) !== 0) throw error('Only a pending assignment can receive a new shoot agreement', 409);
    const snapshot = shootSnapshot(context, payload);
    const contentHtml = String(payload.content_html || '').trim();
    if (!contentHtml) throw error('content_html is required');
    const contentJson = payload.content_json || null;
    const document = await db.agreement_documents.create({
      agreement_type: SHOOT, creator_id: context.creator.crew_member_id, booking_id: Number(bookingId), assignment_id: context.assignment.id,
      creator_earning_id: context.earning.creator_earning_id, version_no: 1, display_version: 'v1', status: 'draft', is_current: 1,
      title: String(payload.title || `Shoot Agreement — ${context.booking.project_name}`).trim(), content_html: contentHtml,
      content_json: stringify(contentJson), content_hash: hashContent(contentHtml, contentJson), snapshot_json: stringify(snapshot),
      currency: context.earning.currency || 'USD', compensation_amount: snapshot.compensation.amount, due_at: payload.due_at || null,
      created_by_user_id: actor.userId
    }, { transaction });
    await event(document.agreement_document_id, 'shoot_agreement_drafted', actor, { assignment_id: context.assignment.id }, transaction);
    return document;
  });
}

async function getDocument(id, options = {}) {
  const document = await db.agreement_documents.findByPk(Number(id), options);
  if (!document) throw error('Agreement not found', 404);
  return document;
}

async function updateShootDraft(id, payload, actor) {
  const document = await getDocument(id);
  if (document.agreement_type !== SHOOT || document.status !== 'draft') throw error('Only a draft shoot agreement can be edited', 409);
  const contentHtml = payload.content_html == null ? document.content_html : String(payload.content_html).trim();
  const contentJson = payload.content_json === undefined ? document.content_json : stringify(payload.content_json);
  if (!contentHtml) throw error('content_html cannot be empty');
  await document.update({ title: payload.title == null ? document.title : String(payload.title).trim(), content_html: contentHtml,
    content_json: contentJson, content_hash: hashContent(contentHtml, contentJson), due_at: payload.due_at === undefined ? document.due_at : payload.due_at,
    updated_at: new Date() });
  await event(document.agreement_document_id, 'shoot_agreement_draft_updated', actor, {}, null);
  return document;
}

async function notifyCreator(document, title, message, actor) {
  const creator = await db.crew_members.findByPk(document.creator_id, { attributes: ['user_id'] });
  if (!creator?.user_id || !db.app_notifications) return;
  await db.app_notifications.create({ user_id: creator.user_id, sender_user_id: actor.userId || null, title, message,
    topic: 'agreements', category: 'agreements', type: 'agreement_action_required', reference_id: String(document.agreement_document_id),
    reference_type: 'agreement_document', payload: { agreement_document_id: document.agreement_document_id, agreement_type: document.agreement_type },
    action_label: 'Review agreement', priority: 'high', app_user_type: 'creative_partner' });
}

async function sendShootAgreement(id, actor) {
  const document = await db.sequelize.transaction(async (transaction) => {
    const row = await getDocument(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (row.agreement_type !== SHOOT || !['draft', 'rejected'].includes(row.status)) throw error('Only a draft or rejected shoot agreement can be sent', 409);
    const assignment = await db.assigned_crew.findOne({ where: { id: row.assignment_id, crew_member_id: row.creator_id, is_active: 1 }, transaction, lock: transaction.LOCK.UPDATE });
    if (!assignment) throw error('The active crew assignment no longer exists', 409);
    await db.agreement_documents.update({ is_current: 0 }, { where: { assignment_id: row.assignment_id, agreement_document_id: { [Op.ne]: row.agreement_document_id }, is_current: 1 }, transaction });
    await row.update({ status: PENDING, is_current: 1, sent_at: new Date(), sent_by_user_id: actor.userId }, { transaction });
    await assignment.update({ status: 'awaiting_agreement', crew_accept: 0, responded_at: null }, { transaction });
    await event(row.agreement_document_id, 'shoot_agreement_sent', actor, { assignment_id: row.assignment_id }, transaction);
    return row;
  });
  await notifyCreator(document, 'Shoot agreement ready', 'Please review and respond to your shoot agreement before accepting this shoot.', actor);
  return document;
}

async function reviseShootAgreement(id, payload, actor) {
  return db.sequelize.transaction(async (transaction) => {
    const source = await getDocument(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (source.agreement_type !== SHOOT || source.status === 'cancelled') throw error('This shoot agreement cannot be revised', 409);
    const nextVersion = Number(source.version_no) + 1;
    const contentHtml = payload.content_html == null ? source.content_html : String(payload.content_html).trim();
    const contentJson = payload.content_json === undefined ? source.content_json : stringify(payload.content_json);
    const revision = await db.agreement_documents.create({
      agreement_type: SHOOT, agreement_template_id: source.agreement_template_id, creator_id: source.creator_id, booking_id: source.booking_id,
      assignment_id: source.assignment_id, creator_earning_id: source.creator_earning_id, parent_document_id: source.agreement_document_id,
      version_no: nextVersion, display_version: `v${nextVersion}`, status: 'draft', is_current: 0,
      title: payload.title == null ? source.title : String(payload.title).trim(), content_html: contentHtml, content_json: contentJson,
      content_hash: hashContent(contentHtml, contentJson), snapshot_json: source.snapshot_json, currency: source.currency,
      compensation_amount: source.compensation_amount, due_at: payload.due_at === undefined ? source.due_at : payload.due_at, created_by_user_id: actor.userId
    }, { transaction });
    await event(revision.agreement_document_id, 'shoot_agreement_revision_drafted', actor, { parent_document_id: source.agreement_document_id }, transaction);
    return revision;
  });
}

async function respondToAgreement(id, creatorId, action, payload = {}, request = {}, expectedAgreementType = null) {
  if (!['accepted', 'rejected'].includes(action)) throw error('Invalid agreement action');
  return db.sequelize.transaction(async (transaction) => {
    const document = await getDocument(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (Number(document.creator_id) !== Number(creatorId)) throw error('You cannot respond to this agreement', 403);
    if (expectedAgreementType && document.agreement_type !== expectedAgreementType) throw error('Agreement type does not match this response endpoint', 409);
    if (document.status !== PENDING || !document.is_current) throw error('This agreement is no longer awaiting your response', 409);
    if (action === 'accepted' && payload.accepted_terms !== true) throw error('accepted_terms must be true to accept an agreement');
    if (action === 'rejected' && !String(payload.rejection_reason || '').trim()) throw error('rejection_reason is required when rejecting an agreement');
    if (document.agreement_type === SHOOT && action === 'accepted' && !await creatorHasCurrentGeneralAcceptance(creatorId, transaction)) {
      throw error('Accept the current general agreement before accepting a shoot agreement', 409);
    }
    const now = new Date();
    await db.agreement_responses.create({ agreement_document_id: document.agreement_document_id, creator_id: creatorId, action,
      accepted_terms: action === 'accepted', signer_name: payload.signer_name || null, rejection_reason: payload.rejection_reason || null,
      comments: payload.comments || null, content_hash_at_response: document.content_hash, ip_address: request.ip || null,
      user_agent: request.userAgent || null, responded_at: now }, { transaction });
    await document.update({ status: action, responded_at: now }, { transaction });
    if (document.agreement_type === SHOOT) {
      const assignment = await db.assigned_crew.findOne({ where: { id: document.assignment_id, crew_member_id: creatorId, is_active: 1 }, transaction, lock: transaction.LOCK.UPDATE });
      if (!assignment) throw error('Active crew assignment no longer exists', 409);
      await assignment.update({ crew_accept: action === 'accepted' ? 1 : 2, status: action === 'accepted' ? 'confirmed' : 'rejected', responded_at: now }, { transaction });
      if (action === 'accepted' && document.creator_earning_id && db.creator_earning_timeline_events) {
        const timelineEvent = await db.creator_earning_timeline_events.findOne({
          where: { creator_earning_id: document.creator_earning_id, event_type: 'shoot_accepted' }, transaction, lock: transaction.LOCK.UPDATE
        });
        const values = {
          creator_earning_id: document.creator_earning_id,
          booking_id: document.booking_id,
          creator_id: creatorId,
          event_type: 'shoot_accepted',
          label: 'Shoot Agreement Accepted',
          sub_label: `Agreement ${document.display_version} accepted`,
          is_completed: 1,
          event_date: now,
          sort_order: 2
        };
        if (timelineEvent) await timelineEvent.update(values, { transaction });
        else await db.creator_earning_timeline_events.create(values, { transaction });
      }
    }
    await event(document.agreement_document_id, `agreement_${action}`, { creatorId }, { content_hash: document.content_hash }, transaction);
    return document;
  });
}

async function cancelAgreement(id, actor) {
  return db.sequelize.transaction(async (transaction) => {
    const document = await getDocument(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!['draft', PENDING].includes(document.status)) throw error('Only draft or pending agreements can be cancelled', 409);
    await document.update({ status: 'cancelled', is_current: 0, cancelled_at: new Date() }, { transaction });
    if (document.agreement_type === SHOOT) await db.assigned_crew.update({ status: 'assigned', crew_accept: 0 }, { where: { id: document.assignment_id, crew_accept: 0 }, transaction });
    await event(document.agreement_document_id, 'agreement_cancelled', actor, {}, transaction);
    return document;
  });
}

async function listDocuments(filters = {}, creatorId = null) {
  const where = {};
  if (filters.type) where.agreement_type = filters.type;
  if (filters.status) where.status = filters.status;
  if (filters.booking_id) where.booking_id = Number(filters.booking_id);
  if (creatorId) where.creator_id = Number(creatorId);
  const rows = await db.agreement_documents.findAll({ where, order: [['created_at', 'DESC']], limit: Math.min(Number(filters.limit) || 50, 100) });
  return rows.map(documentPayload);
}

async function getDocumentDetail(id, creatorId = null) {
  const document = await getDocument(id);
  if (creatorId && Number(document.creator_id) !== Number(creatorId)) throw error('You cannot view this agreement', 403);
  const responses = await db.agreement_responses.findAll({ where: { agreement_document_id: document.agreement_document_id }, order: [['responded_at', 'ASC']] });
  const events = await db.agreement_events.findAll({ where: { agreement_document_id: document.agreement_document_id }, order: [['occurred_at', 'ASC']] });
  return { agreement: documentPayload(document), responses: responses.map(plain), events: events.map(plain) };
}

module.exports = { createGeneralTemplate, listGeneralTemplates, templateById, updateGeneralTemplate, publishGeneralTemplate, getCurrentGeneralAgreement,
  createShootAgreement, updateShootDraft, sendShootAgreement, reviseShootAgreement, respondToAgreement, cancelAgreement, listDocuments, getDocumentDetail };
