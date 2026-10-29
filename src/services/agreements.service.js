const crypto = require('crypto');
const db = require('../models');
const businessNotifications = require('./business-notification.service');
const cpCompensation = require('./cp-compensation.service');
const { validateAgreementSignature } = require('../utils/agreement-signature');
const { assertCrewPositionAvailable, closeUnavailableCrewRequests } = require('./crew-acceptance.service');
const { Op } = db.Sequelize;

const GENERAL = 'general';
const SHOOT = 'shoot';
const PENDING = 'pending_acceptance';
// Canonical Creative Partner role IDs. These match creator search, compensation,
// shoot details, and lead screens; do not derive display labels from crew_roles.
const CREATOR_ROLE_LABELS = {
  1: 'Videographer',
  2: 'Photographer',
  3: 'Editor',
  4: 'Producer',
  5: 'Director',
  9: 'Videographer',
  10: 'Photographer',
  11: 'Editor'
};

const error = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const plain = (value) => value && (typeof value.get === 'function' ? value.get({ plain: true }) : value);
const stringify = (value) => value == null ? null : (typeof value === 'string' ? value : JSON.stringify(value));
const parse = (value, fallback = null) => {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
};
const visibleText = (value) => String(value || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&(?:nbsp|#160|#xA0);/gi, ' ')
  .replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, 'x')
  .trim();
function validateAgreementContent(contentHtml, contentJson) {
  if (!visibleText(contentHtml)) throw error('Agreement content is required');
  const htmlSections = String(contentHtml).match(/<section\b[^>]*>[\s\S]*?<\/section>/gi);
  if (htmlSections) htmlSections.forEach((section, index) => {
    const body = section.replace(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi, '');
    if (!visibleText(body)) throw error(`Section ${index + 1} needs a title and content`);
  });
  const content = parse(contentJson);
  if (contentJson != null) {
    if (!content || typeof content !== 'object') throw error('Agreement sections are required');
    if (!Array.isArray(content.sections) || !content.sections.length) {
      throw error('Add at least one agreement section with a title and content');
    }
    content.sections.forEach((section, index) => {
      if (!section || !String(section.title || '').trim() || !visibleText(section.content)) {
        throw error(`Section ${index + 1} needs a title and content`);
      }
    });
  }
}
const hashContent = (contentHtml, contentJson) => crypto.createHash('sha256')
  .update(`${contentHtml || ''}\n${stringify(contentJson) || ''}`)
  .digest('hex');

function roleIds(value) {
  if (value == null || value === '') return [];
  if (typeof value === 'number') return [value];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return (Array.isArray(parsed) ? parsed : [parsed]).map(Number).filter(Number.isFinite);
  } catch (_) {
    return String(value).split(',').map((id) => Number(id.trim())).filter(Number.isFinite);
  }
}

function creatorRoleNames(primaryRole) {
  const ids = roleIds(primaryRole);
  if (!ids.length) return null;
  return [...new Set(ids.map((id) => CREATOR_ROLE_LABELS[id]).filter(Boolean))].join(', ') || null;
}

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

async function documentPayloadWithCreativePartner(document) {
  const payload = documentPayload(document);
  if (!payload || !payload.creator_id) return payload;

  const creator = await db.crew_members.findByPk(payload.creator_id, {
    attributes: ['crew_member_id', 'first_name', 'last_name', 'email', 'primary_role']
  });
  if (!creator) return payload;

  const partner = plain(creator);
  const currentSnapshot = payload.snapshot && typeof payload.snapshot === 'object' ? payload.snapshot : {};
  const resolvedRole = creatorRoleNames(partner.primary_role);
  return {
    ...payload,
    snapshot: {
      ...currentSnapshot,
      creative_partner: {
        ...(currentSnapshot.creative_partner || {}),
        id: partner.crew_member_id,
        name: [partner.first_name, partner.last_name].filter(Boolean).join(' '),
        email: partner.email || null,
        role: resolvedRole || currentSnapshot.creative_partner?.role || null
      }
    }
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

function nextGeneralTemplateVersion(rows) {
  let highestMajor = 0;
  let highestMinor = -1;

  for (const row of rows) {
    const version = String(row.version || '').trim();
    const match = version.match(/^(?:v(?:ersion)?\s*)?(\d+)(?:\.(\d+))?/i);
    if (!match) continue;
    const major = Number(match[1]);
    const minor = Number(match[2] || 0);
    if (major > highestMajor || (major === highestMajor && minor > highestMinor)) {
      highestMajor = major;
      highestMinor = minor;
    }
  }

  return highestMinor < 0 ? '1.0' : `${highestMajor}.${highestMinor + 1}`;
}

async function createGeneralTemplate(payload, actor) {
  const title = String(payload.title || '').trim();
  const contentHtml = String(payload.content_html || '').trim();
  if (!title || !contentHtml) throw error('title and content_html are required');

  const contentJson = payload.content_json || null;
  validateAgreementContent(contentHtml, contentJson);
  return db.sequelize.transaction(async (transaction) => {
    const sourceTemplateId = Number(payload.source_template_id || 0);
    const activeTemplate = await db.agreement_templates.findOne({
      where: { agreement_type: GENERAL, status: { [Op.in]: ['draft', 'published'] } },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (activeTemplate && !sourceTemplateId) {
      throw error('A general agreement already exists. Edit it to publish a new version.', 409);
    }
    if (sourceTemplateId) {
      const source = await db.agreement_templates.findByPk(sourceTemplateId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!source || source.agreement_type !== GENERAL) throw error('Source general agreement not found', 404);
    }
    const existingTemplates = await db.agreement_templates.findAll({
      where: { agreement_type: GENERAL },
      attributes: ['version'],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const version = nextGeneralTemplateVersion(existingTemplates.map(plain));
    return db.agreement_templates.create({
      agreement_type: GENERAL, title, description: payload.description || null, content_html: contentHtml,
      content_json: stringify(contentJson), version, content_hash: hashContent(contentHtml, contentJson),
      is_mandatory: payload.is_mandatory === false ? 0 : 1, effective_at: payload.effective_at || null, created_by_user_id: actor.userId
    }, { transaction });
  });
}

async function listGeneralTemplates() {
  const rows = await db.agreement_templates.findAll({ where: { agreement_type: GENERAL }, order: [['created_at', 'DESC']] });
  return rows.map((template) => {
    const row = plain(template);
    return { ...row, content_json: parse(row.content_json) };
  });
}

async function deleteGeneralTemplate(id) {
  return db.sequelize.transaction(async (transaction) => {
    const template = await db.agreement_templates.findByPk(Number(id), { transaction, lock: transaction.LOCK.UPDATE });
    if (!template || template.agreement_type !== GENERAL) throw error('General agreement not found', 404);
    const documentCount = await db.agreement_documents.count({ where: { agreement_template_id: template.agreement_template_id }, transaction });
    if (documentCount > 0) throw error('This general agreement has been presented to Creative Partners and cannot be deleted. Create a new version instead.', 409);
    await template.destroy({ transaction });
    return { agreement_template_id: Number(id), deleted: true };
  });
}

async function updateGeneralTemplate(id, payload, actor) {
  const template = await templateById(id);
  if (template.agreement_type !== GENERAL) throw error('Only general templates can be updated here');
  if (template.status !== 'draft') throw error('Published or retired templates are immutable; create a new version instead', 409);
  const contentHtml = payload.content_html == null ? template.content_html : String(payload.content_html).trim();
  const contentJson = payload.content_json === undefined ? template.content_json : stringify(payload.content_json);
  if (!contentHtml) throw error('content_html cannot be empty');
  validateAgreementContent(contentHtml, contentJson);
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
  const result = await db.sequelize.transaction(async (transaction) => {
    const template = await db.agreement_templates.findByPk(Number(id), { transaction, lock: transaction.LOCK.UPDATE });
    if (!template) throw error('Agreement template not found', 404);
    if (template.agreement_type !== GENERAL || template.status !== 'draft') throw error('Only a draft general template can be published', 409);
    validateAgreementContent(template.content_html, template.content_json);
    const previous = await db.agreement_templates.findOne({ where: { agreement_type: GENERAL, status: 'published' }, transaction });
    const previousDocuments = previous ? await db.agreement_documents.findAll({
      where: { agreement_type: GENERAL, agreement_template_id: previous.agreement_template_id, is_current: 1 },
      attributes: ['creator_id'], transaction
    }) : [];
    await db.agreement_templates.update({ status: 'retired', updated_at: new Date() }, {
      where: { agreement_type: GENERAL, status: 'published' }, transaction
    });
    await template.update({ status: 'published', effective_at: template.effective_at || new Date(), published_at: new Date(), published_by_user_id: actor.userId }, { transaction });
    const documents = [];
    for (const creatorId of new Set(previousDocuments.map((row) => Number(row.creator_id)))) {
      documents.push(await ensureGeneralDocument(creatorId, transaction));
    }
    return { template, documents };
  });
  await Promise.allSettled(result.documents.map((document) => notifyCreator(document,
    'General agreement updated', `The general agreement has been updated to ${result.template.version}. Please review, sign and accept it again.`, actor)));
  return result.template;
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
    const creator = await db.crew_members.findByPk(creatorId, { transaction });
    if (!creator) throw error('Creative Partner not found', 404);
    const partner = plain(creator);
    const partnerRole = creatorRoleNames(partner.primary_role);
    document = await db.agreement_documents.create({
      agreement_type: GENERAL, agreement_template_id: template.agreement_template_id, creator_id: creatorId,
      version_no: 1, display_version: template.version, status: PENDING, is_current: 1,
      title: template.title, content_html: template.content_html, content_json: template.content_json,
      content_hash: template.content_hash,
      snapshot_json: stringify({
        template_version: template.version,
        mandatory: Boolean(template.is_mandatory),
        creative_partner: {
          id: partner.crew_member_id,
          name: [partner.first_name, partner.last_name].filter(Boolean).join(' '),
          email: partner.email || null,
          role: partnerRole || null
        }
      })
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

async function shootSnapshot({ assignment, booking, creator, earning }, payload = {}, transaction) {
  const partnerRole = creatorRoleNames(creator.primary_role);
  return {
    assignment_id: assignment.id, booking_id: booking.stream_project_booking_id, creator_id: creator.crew_member_id,
    creative_partner: { name: [creator.first_name, creator.last_name].filter(Boolean).join(' '), email: creator.email, role: partnerRole },
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
    const existingSentAgreement = await db.agreement_documents.findOne({
      where: {
        agreement_type: SHOOT,
        assignment_id: context.assignment.id,
        is_current: 1,
        status: { [Op.in]: [PENDING, 'accepted'] }
      },
      // The assignment row above serializes requests for this recipient.
      // A locking read here can gap-lock an empty agreement range and deadlock
      // concurrent drafts for other recipients when they insert their rows.
      transaction
    });
    if (existingSentAgreement) {
      throw error('A current shoot agreement has already been sent for this Creative Partner', 409);
    }
    const snapshot = await shootSnapshot(context, payload, transaction);
    const contentHtml = String(payload.content_html || '').trim();
    if (!contentHtml) throw error('content_html is required');
    const contentJson = payload.content_json || null;
    validateAgreementContent(contentHtml, contentJson);
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

// The first agreement for new CPs is committed with assignment and finance
// submission. A failed validation or database write rolls all three back.
async function assignCompensateAndSend(bookingId, payload = {}, actor = {}) {
  const compensation = payload.compensation || {};
  const creators = compensation.creators;
  const agreement = payload.agreement || {};
  if (!Array.isArray(creators) || !creators.length) throw error('Creative partners and compensation are required');
  const ids = creators.map((row) => Number(row.creator_id));
  if (ids.some((id) => !Number.isInteger(id) || id <= 0) || new Set(ids).size !== ids.length) throw error('Creative partner IDs must be unique and valid');
  if (Number(compensation.booking_id) !== Number(bookingId)) throw error('Compensation booking does not match shoot');
  for (const id of ids) {
    const recipientAgreement = payload.agreements?.[id] || agreement;
    validateAgreementContent(recipientAgreement.content_html, recipientAgreement.content_json);
  }

  const documents = await db.sequelize.transaction(async (transaction) => {
    const booking = await db.stream_project_booking.findByPk(Number(bookingId), { transaction, lock: transaction.LOCK.UPDATE });
    if (!booking) throw error('Shoot not found', 404);
    const partners = await db.crew_members.findAll({ where: { crew_member_id: ids }, transaction });
    if (partners.length !== ids.length) throw error('One or more Creative Partners were not found', 404);
    const existing = await db.assigned_crew.findAll({ where: { project_id: Number(bookingId), crew_member_id: ids, is_active: 1 }, transaction });
    if (existing.length) throw error('One or more Creative Partners are already assigned to this shoot', 409);
    for (const creatorId of ids) await assertCrewPositionAvailable(booking, creatorId, transaction);
    const assignments = [];
    for (const creatorId of ids) {
      assignments.push(await db.assigned_crew.create({
        project_id: Number(bookingId), crew_member_id: creatorId, assigned_date: new Date(),
        status: 'selected', crew_accept: 0, is_active: 1, organization_type: 1
      }, { transaction }));
    }
    const finance = await cpCompensation.submitSalesAdminCompensation(compensation, { userId: actor.userId, transaction });
    const byId = new Map(finance.creators.map((row) => [Number(row.creator_id), row]));
    const sent = [];
    for (const assignment of assignments) {
      const creatorId = Number(assignment.crew_member_id);
      const partner = partners.find((row) => Number(row.crew_member_id) === creatorId);
      const earning = byId.get(creatorId);
      if (!earning) throw error('Compensation was not created for every Creative Partner', 409);
      const recipientAgreement = payload.agreements?.[creatorId] || agreement;
      const html = String(recipientAgreement.content_html).trim();
      const snapshot = await shootSnapshot({ assignment, booking, creator: partner, earning: {
        creator_earning_id: earning.creator_earning_id, net_earning_amount: earning.total_compensation, currency: 'USD'
      } }, recipientAgreement, transaction);
      const contentJson = recipientAgreement.content_json || null;
      const document = await db.agreement_documents.create({
        agreement_type: SHOOT, creator_id: creatorId, booking_id: Number(bookingId), assignment_id: assignment.id,
        creator_earning_id: earning.creator_earning_id, version_no: 1, display_version: 'v1', status: PENDING, is_current: 1,
        title: String(recipientAgreement.title || `Shoot Agreement — ${booking.project_name}`).trim(), content_html: html,
        content_json: stringify(contentJson), content_hash: hashContent(html, contentJson), snapshot_json: stringify(snapshot),
        currency: 'USD', compensation_amount: earning.total_compensation, due_at: recipientAgreement.due_at || null,
        created_by_user_id: actor.userId, sent_by_user_id: actor.userId, sent_at: new Date()
      }, { transaction });
      await event(document.agreement_document_id, 'shoot_agreement_sent', actor, { assignment_id: assignment.id }, transaction);
      sent.push(document);
    }
    return sent;
  });

  await Promise.allSettled(documents.map((document) =>
    notifyCreator(document, 'Shoot agreement ready', 'Please review and respond to your shoot agreement before accepting this shoot.', actor)
  ));
  return { booking_id: Number(bookingId), agreement_document_ids: documents.map((row) => row.agreement_document_id) };
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
  validateAgreementContent(contentHtml, contentJson);
  await document.update({ title: payload.title == null ? document.title : String(payload.title).trim(), content_html: contentHtml,
    content_json: contentJson, content_hash: hashContent(contentHtml, contentJson), due_at: payload.due_at === undefined ? document.due_at : payload.due_at,
    updated_at: new Date() });
  await event(document.agreement_document_id, 'shoot_agreement_draft_updated', actor, {}, null);
  return document;
}

async function notifyCreator(document, title, message, actor) {
  try {
    const creator = await db.crew_members.findByPk(document.creator_id, { attributes: ['user_id'] });
    return businessNotifications.notify({ userId: creator?.user_id, appUserType: '2', senderUserId: actor.userId || null,
      title, message, topic: document.agreement_type === GENERAL ? 'profile' : 'shoots', category: 'agreements', type: 'agreement_action_required',
      referenceId: String(document.agreement_document_id), referenceType: 'agreement_document',
      payload: { agreement_document_id: String(document.agreement_document_id), agreement_type: document.agreement_type, booking_id: String(document.booking_id || '') },
      actionLabel: 'Review agreement', priority: 'high' });
  } catch (notificationError) {
    console.error('[AgreementNotification] Creator lookup failed:', notificationError);
    return null;
  }
}

async function lockAgreementAndBooking(id, transaction) {
  const hint = await getDocument(id, { transaction });
  let booking = null;
  if (hint.agreement_type === SHOOT) {
    booking = await db.stream_project_booking.findByPk(hint.booking_id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!booking) throw error('Shoot not found', 404);
  }
  const document = await getDocument(id, { transaction, lock: transaction.LOCK.UPDATE });
  return { document, booking };
}

async function sendShootAgreement(id, actor) {
  const document = await db.sequelize.transaction(async (transaction) => {
    const { document: row, booking } = await lockAgreementAndBooking(id, transaction);
    if (row.agreement_type !== SHOOT || !['draft', 'rejected'].includes(row.status)) throw error('Only a draft or rejected shoot agreement can be sent', 409);
    validateAgreementContent(row.content_html, row.content_json);
    const assignment = await db.assigned_crew.findOne({ where: { id: row.assignment_id, crew_member_id: row.creator_id, is_active: 1 }, transaction, lock: transaction.LOCK.UPDATE });
    if (!assignment) throw error('The active crew assignment no longer exists', 409);
    await assertCrewPositionAvailable(booking, row.creator_id, transaction);
    await db.agreement_documents.update({ is_current: 0 }, { where: { assignment_id: row.assignment_id, agreement_document_id: { [Op.ne]: row.agreement_document_id }, is_current: 1 }, transaction });
    await row.update({ status: PENDING, is_current: 1, sent_at: new Date(), sent_by_user_id: actor.userId }, { transaction });
    // The agreement document is the source of truth for the awaiting-response
    // state. Keep the legacy assignment status unchanged because older
    // environments restrict that column to a fixed set of values.
    // A revision does not release a position that this CP already accepted.
    if (Number(assignment.crew_accept) !== 1) {
      await assignment.update({ crew_accept: 0, responded_at: null }, { transaction });
    }
    await event(row.agreement_document_id, 'shoot_agreement_sent', actor, { assignment_id: row.assignment_id }, transaction);
    return row;
  });
  if (document.parent_document_id) {
    const shootName = documentPayload(document).snapshot?.shoot?.name || `Shoot #${document.booking_id}`;
    await notifyCreator(document, `Shoot agreement updated — ${shootName}`,
      `The agreement for ${shootName} has been updated to ${document.display_version}. Please review, sign and accept it again.`, actor);
  } else {
    await notifyCreator(document, 'Shoot agreement ready', 'Please review and respond to your shoot agreement before accepting this shoot.', actor);
  }
  return document;
}

async function reviseShootAgreement(id, payload, actor) {
  return db.sequelize.transaction(async (transaction) => {
    const source = await getDocument(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (source.agreement_type !== SHOOT) throw error('Only shoot agreements can be revised', 409);
    const canReviseCurrent = Boolean(source.is_current) && ['accepted', PENDING, 'rejected'].includes(source.status);
    if (!canReviseCurrent && source.status === 'cancelled' && !source.is_current) {
      const activeVersion = await db.agreement_documents.findOne({
        where: { agreement_type: SHOOT, assignment_id: source.assignment_id, is_current: 1 },
        attributes: ['agreement_document_id'], transaction, lock: transaction.LOCK.UPDATE
      });
      if (activeVersion) throw error('A current shoot agreement already exists. Create a version from that agreement instead.', 409);
      const assignment = await db.assigned_crew.findOne({
        where: { id: source.assignment_id, crew_member_id: source.creator_id, is_active: 1 },
        transaction, lock: transaction.LOCK.UPDATE
      });
      if (!assignment) throw error('The CP request is no longer active for this shoot', 409);
    } else if (!canReviseCurrent) {
      throw error('Only a current sent or cancelled shoot agreement can be revised', 409);
    }
    const existingDraft = await db.agreement_documents.findOne({ where: { assignment_id: source.assignment_id, status: 'draft' }, transaction });
    if (existingDraft) throw error('A draft revision already exists for this shoot agreement', 409);
    const versions = await db.agreement_documents.findAll({
      where: { assignment_id: source.assignment_id }, attributes: ['version_no'], transaction, lock: transaction.LOCK.UPDATE
    });
    const nextVersion = Math.max(0, ...versions.map((row) => Number(row.version_no) || 0)) + 1;
    const contentHtml = payload.content_html == null ? source.content_html : String(payload.content_html).trim();
    const contentJson = payload.content_json === undefined ? source.content_json : stringify(payload.content_json);
    validateAgreementContent(contentHtml, contentJson);
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
  const respondedDocument = await db.sequelize.transaction(async (transaction) => {
    const { document, booking } = await lockAgreementAndBooking(id, transaction);
    if (Number(document.creator_id) !== Number(creatorId)) throw error('You cannot respond to this agreement', 403);
    if (expectedAgreementType && document.agreement_type !== expectedAgreementType) throw error('Agreement type does not match this response endpoint', 409);
    if (document.status !== PENDING || !document.is_current) throw error('This agreement is no longer awaiting your response', 409);
    if (action === 'accepted' && payload.accepted_terms !== true) throw error('accepted_terms must be true to accept an agreement');
    const signature = action === 'accepted' ? validateAgreementSignature(payload.signature_data_url) : null;
    const signerName = String(payload.signer_name || '').trim();
    if (action === 'accepted' && (!signerName || signerName.length > 255)) throw error('Signer name is required');
    if (action === 'rejected' && !String(payload.rejection_reason || '').trim()) throw error('rejection_reason is required when rejecting an agreement');
    if (document.agreement_type === SHOOT && action === 'accepted' && !await creatorHasCurrentGeneralAcceptance(creatorId, transaction)) {
      throw error('Accept the current general agreement before accepting a shoot agreement', 409);
    }
    if (document.agreement_type === SHOOT && action === 'accepted') {
      await assertCrewPositionAvailable(booking, creatorId, transaction);
    }
    const now = new Date();
    await db.agreement_responses.create({ agreement_document_id: document.agreement_document_id, creator_id: creatorId, action,
      accepted_terms: action === 'accepted', signer_name: action === 'accepted' ? signerName : null,
      signature_data_url: signature?.dataUrl || null, signature_sha256: signature?.sha256 || null,
      rejection_reason: payload.rejection_reason || null,
      comments: payload.comments || null, content_hash_at_response: document.content_hash, ip_address: request.ip || null,
      user_agent: request.userAgent || null, responded_at: now }, { transaction });
    await document.update({ status: action, responded_at: now }, { transaction });
    if (document.agreement_type === SHOOT) {
      const assignment = await db.assigned_crew.findOne({ where: { id: document.assignment_id, crew_member_id: creatorId, is_active: 1 }, transaction, lock: transaction.LOCK.UPDATE });
      if (!assignment) throw error('Active crew assignment no longer exists', 409);
      await assignment.update({ crew_accept: action === 'accepted' ? 1 : 2, status: action === 'accepted' ? 'confirmed' : 'rejected', responded_at: now }, { transaction });
      if (action === 'accepted') {
        await cpCompensation.submitAcceptedCreatorCompensation(document.creator_earning_id, transaction);
        await closeUnavailableCrewRequests(booking, transaction);
      }
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
    await event(document.agreement_document_id, `agreement_${action}`, { creatorId }, {
      content_hash: document.content_hash, signature_sha256: signature?.sha256 || null
    }, transaction);
    return document;
  });
  if (respondedDocument.agreement_type === SHOOT) {
    const ownerId = await businessNotifications.bookingOwner(respondedDocument.booking_id)
      .catch((lookupError) => { console.error('[AgreementNotification] Owner lookup failed:', lookupError); return null; });
    await businessNotifications.notify({
      userId: ownerId || respondedDocument.sent_by_user_id || respondedDocument.created_by_user_id,
      title: action === 'accepted' ? 'Creator accepted shoot agreement' : 'Creator rejected shoot agreement',
      message: action === 'accepted'
        ? `The creator accepted the agreement for booking ${respondedDocument.booking_id}.`
        : `The creator rejected the agreement for booking ${respondedDocument.booking_id}. Review the shoot team.`,
      topic: 'shoots', category: 'agreements', type: `shoot_agreement_${action}`,
      referenceType: 'booking', referenceId: String(respondedDocument.booking_id),
      payload: { booking_id: String(respondedDocument.booking_id), agreement_document_id: String(respondedDocument.agreement_document_id) },
      priority: action === 'rejected' ? 'high' : 'normal'
    });
    if (action === 'accepted') {
      const booking = await db.stream_project_booking.findByPk(respondedDocument.booking_id, { attributes: ['user_id'] });
      await businessNotifications.notify({
        userId: booking?.user_id,
        title: 'Creator confirmed for your shoot',
        message: `A creator confirmed their assignment for shoot ${respondedDocument.booking_id}. Review your shoot team.`,
        topic: 'shoots', category: 'shoots', type: 'shoot_creator_confirmed',
        referenceType: 'booking', referenceId: String(respondedDocument.booking_id),
        payload: { booking_id: String(respondedDocument.booking_id) }
      });
    }
  }
  return respondedDocument;
}

async function cancelAgreement(id, actor) {
  return db.sequelize.transaction(async (transaction) => {
    const { document } = await lockAgreementAndBooking(id, transaction);
    if (!['draft', PENDING].includes(document.status)) throw error('Only draft or pending agreements can be cancelled', 409);
    const wasPending = document.status === PENDING;
    await document.update({ status: 'cancelled', is_current: 0, cancelled_at: new Date() }, { transaction });
    if (document.agreement_type === SHOOT && wasPending) {
      const previous = document.parent_document_id
        ? await db.agreement_documents.findByPk(document.parent_document_id, { transaction, lock: transaction.LOCK.UPDATE }) : null;
      if (previous && ['accepted', PENDING, 'rejected'].includes(previous.status)) {
        await previous.update({ is_current: 1 }, { transaction });
        await db.assigned_crew.update({ crew_accept: previous.status === 'accepted' ? 1 : 0 }, { where: { id: document.assignment_id }, transaction });
      }
      // Without a previous accepted version, leave the CP request row and its
      // status untouched. Its existing crew_accept=0 state keeps the request
      // available for a replacement agreement.
    }
    await event(document.agreement_document_id, 'agreement_cancelled', actor, {}, transaction);
    return document;
  });
}

async function listDocuments(filters = {}, creatorId = null) {
  const where = {};
  if (filters.type) where.agreement_type = filters.type;
  if (Number(filters.booking_id)) where.booking_id = Number(filters.booking_id);
  if (filters.status) where.status = filters.status;
  if (filters.booking_id) where.booking_id = Number(filters.booking_id);
  if (filters.search) {
    const search = `%${String(filters.search).trim()}%`;
    where[Op.or] = [
      { title: { [Op.like]: search } },
      { snapshot_json: { [Op.like]: search } }
    ];
  }
  if (creatorId) {
    where.creator_id = Number(creatorId);
    // Drafts and cancelled versions have never been sent for CP review.
    where.status = filters.status && !['draft', 'cancelled'].includes(filters.status)
      ? filters.status : { [Op.notIn]: ['draft', 'cancelled'] };
  }
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 100);
  const page = Math.max(Number(filters.page) || 1, 1);
  const query = { where, order: [['created_at', 'DESC'], ['agreement_document_id', 'DESC']] };
  if (Number(filters.page) > 0) {
    const { count, rows } = await db.agreement_documents.findAndCountAll({
      ...query,
      limit,
      offset: (page - 1) * limit
    });
    return {
      items: await Promise.all(rows.map(documentPayloadWithCreativePartner)),
      total: count,
      page,
      limit
    };
  }
  const rows = await db.agreement_documents.findAll({ ...query, limit });
  return Promise.all(rows.map(documentPayloadWithCreativePartner));
}

async function getDocumentDetail(id, creatorId = null) {
  const document = await getDocument(id);
  if (creatorId && Number(document.creator_id) !== Number(creatorId)) throw error('You cannot view this agreement', 403);
  if (creatorId && ['draft', 'cancelled'].includes(document.status)) throw error('Agreement not available for Creative Partner review', 404);
  const responses = await db.agreement_responses.findAll({ where: { agreement_document_id: document.agreement_document_id }, order: [['responded_at', 'ASC']] });
  const events = await db.agreement_events.findAll({ where: { agreement_document_id: document.agreement_document_id }, order: [['occurred_at', 'ASC']] });
  return { agreement: await documentPayloadWithCreativePartner(document), responses: responses.map(plain), events: events.map(plain) };
}

module.exports = { createGeneralTemplate, listGeneralTemplates, templateById, updateGeneralTemplate, deleteGeneralTemplate, publishGeneralTemplate, getCurrentGeneralAgreement,
  createShootAgreement, assignCompensateAndSend, updateShootDraft, sendShootAgreement, reviseShootAgreement, respondToAgreement, cancelAgreement, listDocuments, getDocumentDetail };
