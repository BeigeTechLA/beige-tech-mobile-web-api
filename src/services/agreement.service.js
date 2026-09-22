const db = require('../models');
const { Op } = db.Sequelize;

const GENERAL_SELECT = { is_deleted: 0 };
const shootSnapshot = (agreement) => ({
  assignment_id: agreement.assignment_id,
  creative_partner_id: agreement.creative_partner_id,
  role: agreement.role,
  compensation: agreement.compensation,
  production_date: agreement.production_date,
  location: agreement.location,
  call_time: agreement.call_time,
  expected_end_time: agreement.expected_end_time,
  scope_of_services: agreement.scope_of_services,
  equipment_requirements: agreement.equipment_requirements,
  deliverables: agreement.deliverables,
  approved_expenses: agreement.approved_expenses,
  special_instructions: agreement.special_instructions
});

const failure = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const nextVersion = (version) => `v${(Number(String(version || 'v0.0').replace(/^v/, '').split('.')[0]) || 0) + 1}.0`;

function requireAuthenticatedUserId(userId) {
  const normalizedUserId = Number(userId);
  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
    throw failure('Authenticated user id is required', 401);
  }
  return normalizedUserId;
}

async function resolveCreativePartnerId(userId) {
  userId = requireAuthenticatedUserId(userId);
  const crewMember = await db.crew_members.findOne({
    where: { user_id: userId, is_active: 1 },
    attributes: ['crew_member_id']
  });
  if (!crewMember) throw failure('Creative partner profile not found', 404);
  return crewMember.crew_member_id;
}

async function log(entry, transaction) {
  entry.actor_id = requireAuthenticatedUserId(entry.actor_id);
  return db.agreement_activity_log.create({ ...entry, is_deleted: 0 }, { transaction });
}

async function createGeneral(payload, actorId) {
  actorId = requireAuthenticatedUserId(actorId);
  const { agreement_name, agreement_title, description, effective_date, sections = [] } = payload;
  if (!agreement_name || !agreement_title || !effective_date || !Array.isArray(sections)) throw failure('agreement_name, agreement_title, effective_date and sections are required', 400);
  return db.sequelize.transaction(async (transaction) => {
    const agreement = await db.agreements.create({ agreement_name, agreement_title, description: description || null, effective_date, status: 'active', created_by: actorId, is_deleted: 0 }, { transaction });
    const version = await db.agreement_versions.create({ agreement_id: agreement.id, version_number: 'v1.0', effective_date, created_by: actorId, is_deleted: 0 }, { transaction });
    await db.agreement_sections.bulkCreate(sections.map((section, index) => ({ agreement_version_id: version.id, section_order: section.section_order || index + 1, section_title: section.section_title, section_body: section.section_body, is_deleted: 0 })), { transaction });
    await agreement.update({ current_version_id: version.id }, { transaction });
    await log({ agreement_type: 'general', agreement_ref_id: agreement.id, version_number: version.version_number, actor_type: 'admin', actor_id: actorId, action: 'Created agreement' }, transaction);
    return getGeneral(agreement.id, transaction);
  });
}

async function getGeneral(id, transaction) {
  const agreement = await db.agreements.findOne({ where: { id, ...GENERAL_SELECT }, transaction });
  if (!agreement) throw failure('General agreement not found', 404);
  const version = await db.agreement_versions.findOne({ where: { id: agreement.current_version_id, ...GENERAL_SELECT }, transaction });
  const sections = version ? await db.agreement_sections.findAll({ where: { agreement_version_id: version.id, ...GENERAL_SELECT }, order: [['section_order', 'ASC']], transaction }) : [];
  return { ...agreement.toJSON(), current_version: version, sections };
}

async function updateGeneral(id, payload, actorId) {
  actorId = requireAuthenticatedUserId(actorId);
  return db.sequelize.transaction(async (transaction) => {
    const agreement = await db.agreements.findOne({ where: { id, ...GENERAL_SELECT }, transaction, lock: transaction.LOCK.UPDATE });
    if (!agreement) throw failure('General agreement not found', 404);
    const current = await db.agreement_versions.findByPk(agreement.current_version_id, { transaction });
    const accepted = current && await db.cp_general_agreement_acceptance.count({ where: { agreement_version_id: current.id, status: 'accepted', ...GENERAL_SELECT }, transaction });
    if (accepted) {
      const version = await db.agreement_versions.create({ agreement_id: id, version_number: nextVersion(current.version_number), effective_date: payload.effective_date || agreement.effective_date, created_by: actorId, is_deleted: 0 }, { transaction });
      const sections = payload.sections || await db.agreement_sections.findAll({ where: { agreement_version_id: current.id, ...GENERAL_SELECT }, transaction });
      await db.agreement_sections.bulkCreate(sections.map((section, index) => ({ agreement_version_id: version.id, section_order: section.section_order || index + 1, section_title: section.section_title, section_body: section.section_body, is_deleted: 0 })), { transaction });
      await agreement.update({ agreement_name: payload.agreement_name || agreement.agreement_name, agreement_title: payload.agreement_title || agreement.agreement_title, description: payload.description ?? agreement.description, effective_date: payload.effective_date || agreement.effective_date, current_version_id: version.id }, { transaction });
      const affectedAcceptances = await db.cp_general_agreement_acceptance.findAll({ where: { agreement_version_id: current.id, ...GENERAL_SELECT }, transaction });
      for (const acceptance of affectedAcceptances) {
        await db.cp_general_agreement_acceptance.create({
          creative_partner_id: acceptance.creative_partner_id,
          agreement_version_id: version.id,
          project_id: acceptance.project_id,
          role: acceptance.role,
          status: 'pending',
          accepted_at: null,
          is_deleted: 0
        }, { transaction });
      }
      await log({ agreement_type: 'general', agreement_ref_id: id, version_number: version.version_number, actor_type: 'admin', actor_id: actorId, action: 'Created new agreement version' }, transaction);
    } else {
      await agreement.update({ agreement_name: payload.agreement_name || agreement.agreement_name, agreement_title: payload.agreement_title || agreement.agreement_title, description: payload.description ?? agreement.description, effective_date: payload.effective_date || agreement.effective_date }, { transaction });
    }
    return getGeneral(id, transaction);
  });
}

async function sendGeneral(id, crewMemberIds, actorId) {
  actorId = requireAuthenticatedUserId(actorId);
  if (!Array.isArray(crewMemberIds) || !crewMemberIds.length) throw failure('crew_member_ids is required', 400);
  return db.sequelize.transaction(async (transaction) => {
    const agreement = await db.agreements.findOne({ where: { id, ...GENERAL_SELECT }, transaction });
    if (!agreement || !agreement.current_version_id) throw failure('Active general agreement not found', 404);
    for (const creative_partner_id of crewMemberIds) {
      const crewMember = await db.crew_members.findOne({ where: { crew_member_id: creative_partner_id, is_active: 1 }, transaction });
      if (!crewMember) throw failure(`Creative partner ${creative_partner_id} not found`, 404);
      const acceptance = await db.cp_general_agreement_acceptance.findOne({ where: { creative_partner_id, agreement_version_id: agreement.current_version_id, ...GENERAL_SELECT }, transaction });
      if (acceptance) {
        await acceptance.update({ status: 'pending', accepted_at: null }, { transaction });
      } else {
        await db.cp_general_agreement_acceptance.create({ creative_partner_id, agreement_version_id: agreement.current_version_id, status: 'pending', accepted_at: null, is_deleted: 0 }, { transaction });
      }
    }
    await log({ agreement_type: 'general', agreement_ref_id: id, actor_type: 'admin', actor_id: actorId, action: 'Sent to CP' }, transaction);
  });
}

async function createShootRequest(payload, actorId) {
  actorId = requireAuthenticatedUserId(actorId);
  const required = ['project_name', 'project_id', 'crew_member_id', 'role'];
  if (required.some((key) => !payload[key])) throw failure(`${required.join(', ')} are required`, 400);
  const crewMember = await db.crew_members.findOne({ where: { crew_member_id: payload.crew_member_id, is_active: 1 } });
  if (!crewMember) throw failure('Creative partner not found', 404);
  const { crew_member_id, creative_partner_id, ...requestValues } = payload;
  return db.shoot_requests.create({ ...requestValues, creative_partner_id: crew_member_id, status: 'pending', created_by: actorId, is_deleted: 0 });
}

async function createShootAgreement(payload, actorId) {
  actorId = requireAuthenticatedUserId(actorId);
  const required = ['shoot_request_id', 'assignment_id', 'crew_member_id', 'role', 'compensation'];
  if (required.some((key) => payload[key] === undefined || payload[key] === null || payload[key] === '')) throw failure(`${required.join(', ')} are required`, 400);
  return db.sequelize.transaction(async (transaction) => {
    const request = await db.shoot_requests.findOne({ where: { id: payload.shoot_request_id, ...GENERAL_SELECT }, transaction });
    if (!request) throw failure('Shoot request not found', 404);
    const crewMember = await db.crew_members.findOne({ where: { crew_member_id: payload.crew_member_id, is_active: 1 }, transaction });
    if (!crewMember) throw failure('Creative partner not found', 404);
    if (Number(request.creative_partner_id) !== Number(payload.crew_member_id)) throw failure('Shoot agreement CP must match its request', 400);
    const { crew_member_id, creative_partner_id, ...agreementValues } = payload;
    const agreement = await db.shoot_agreements.create({ ...agreementValues, creative_partner_id: crew_member_id, status: 'pending', created_by: actorId, is_deleted: 0 }, { transaction });
    const version = await db.shoot_agreement_versions.create({ shoot_agreement_id: agreement.id, version_number: 'v1.0', compensation: agreement.compensation, status: 'pending', snapshot: shootSnapshot(agreement), created_by: actorId, is_deleted: 0 }, { transaction });
    await agreement.update({ current_version_id: version.id }, { transaction });
    await log({ agreement_type: 'shoot', agreement_ref_id: agreement.id, version_number: version.version_number, actor_type: 'admin', actor_id: actorId, action: 'Created agreement' }, transaction);
    return getShootAgreement(agreement.id, null, transaction);
  });
}

async function getShootAgreement(id, creativePartnerId = null, transaction) {
  const where = { id, ...GENERAL_SELECT };
  if (creativePartnerId) where.creative_partner_id = creativePartnerId;
  const agreement = await db.shoot_agreements.findOne({ where, transaction });
  if (!agreement) throw failure('Shoot agreement not found', 404);
  const [request, versions, activity] = await Promise.all([
    db.shoot_requests.findOne({ where: { id: agreement.shoot_request_id, ...GENERAL_SELECT }, transaction }),
    db.shoot_agreement_versions.findAll({ where: { shoot_agreement_id: id, ...GENERAL_SELECT }, order: [['created_at', 'DESC']], transaction }),
    db.agreement_activity_log.findAll({ where: { agreement_type: 'shoot', agreement_ref_id: id, ...GENERAL_SELECT }, order: [['created_at', 'DESC']], transaction })
  ]);
  return { ...agreement.toJSON(), shoot_request: request, versions, activity_log: activity };
}

async function updateShootAgreement(id, payload, actorId) {
  actorId = requireAuthenticatedUserId(actorId);
  return db.sequelize.transaction(async (transaction) => {
    const agreement = await db.shoot_agreements.findOne({ where: { id, ...GENERAL_SELECT }, transaction, lock: transaction.LOCK.UPDATE });
    if (!agreement) throw failure('Shoot agreement not found', 404);
    const { crew_member_id, creative_partner_id, ...updateValues } = payload;
    if (crew_member_id !== undefined) {
      const crewMember = await db.crew_members.findOne({ where: { crew_member_id, is_active: 1 }, transaction });
      if (!crewMember) throw failure('Creative partner not found', 404);
      if (Number(crew_member_id) !== Number(agreement.creative_partner_id)) throw failure('Creative partner cannot be changed for an existing shoot agreement', 400);
    }
    if (agreement.status === 'accepted') {
      const current = await db.shoot_agreement_versions.findByPk(agreement.current_version_id, { transaction });
      const values = { ...agreement.toJSON(), ...updateValues, id: undefined, status: 'pending', current_version_id: null };
      delete values.created_at; delete values.updated_at;
      await agreement.update({ ...updateValues, status: 'pending' }, { transaction });
      const version = await db.shoot_agreement_versions.create({ shoot_agreement_id: id, version_number: nextVersion(current?.version_number), compensation: agreement.compensation, status: 'pending', snapshot: shootSnapshot({ ...agreement.toJSON(), ...updateValues }), created_by: actorId, is_deleted: 0 }, { transaction });
      await agreement.update({ current_version_id: version.id }, { transaction });
      await db.shoot_requests.update({ status: 'pending' }, { where: { id: agreement.shoot_request_id }, transaction });
      await log({ agreement_type: 'shoot', agreement_ref_id: id, version_number: version.version_number, actor_type: 'admin', actor_id: actorId, action: 'Created new agreement version' }, transaction);
    } else await agreement.update(updateValues, { transaction });
    return getShootAgreement(id, null, transaction);
  });
}

async function sendShoot(id, actorId) {
  actorId = requireAuthenticatedUserId(actorId);
  return db.sequelize.transaction(async (transaction) => {
    const agreement = await db.shoot_agreements.findOne({ where: { id, ...GENERAL_SELECT }, transaction });
    if (!agreement) throw failure('Shoot agreement not found', 404);
    if (agreement.status === 'cancelled' || agreement.status === 'expired') throw failure('Agreement cannot be sent', 409);
    await agreement.update({ status: 'pending' }, { transaction });
    await log({ agreement_type: 'shoot', agreement_ref_id: id, actor_type: 'admin', actor_id: actorId, action: 'Sent to CP' }, transaction);
  });
}

async function acceptGeneral(versionId, creativePartnerId, actorId, confirmed) {
  actorId = requireAuthenticatedUserId(actorId);
  if (!confirmed) throw failure('confirmation is required', 400);
  return db.sequelize.transaction(async (transaction) => {
    const acceptance = await db.cp_general_agreement_acceptance.findOne({ where: { agreement_version_id: versionId, creative_partner_id: creativePartnerId, ...GENERAL_SELECT }, transaction, lock: transaction.LOCK.UPDATE });
    if (!acceptance) throw failure('General agreement was not sent to this CP', 404);
    if (acceptance.status === 'accepted') throw failure('Agreement is already accepted', 409);
    await acceptance.update({ status: 'accepted', accepted_at: new Date() }, { transaction });
    const version = await db.agreement_versions.findByPk(versionId, { transaction });
    await log({ agreement_type: 'general', agreement_ref_id: version.agreement_id, version_number: version.version_number, actor_type: 'cp', actor_id: actorId, action: 'Accepted' }, transaction);
    return acceptance;
  });
}

async function decideShoot(id, creativePartnerId, actorId, action) {
  actorId = requireAuthenticatedUserId(actorId);
  return db.sequelize.transaction(async (transaction) => {
    const agreement = await db.shoot_agreements.findOne({ where: { id, creative_partner_id: creativePartnerId, ...GENERAL_SELECT }, transaction, lock: transaction.LOCK.UPDATE });
    if (!agreement) throw failure('Shoot agreement not found', 404);
    if (['accepted', 'rejected'].includes(agreement.status)) throw failure('Agreement has already been decided', 409);
    if (action === 'accepted' && process.env.ENFORCE_GENERAL_AGREEMENT === 'true') {
      const current = await db.agreements.findOne({ where: { status: 'active', ...GENERAL_SELECT }, order: [['updated_at', 'DESC']], transaction });
      const general = current && await db.cp_general_agreement_acceptance.findOne({ where: { creative_partner_id: creativePartnerId, agreement_version_id: current.current_version_id, status: 'accepted', ...GENERAL_SELECT }, transaction });
      if (!general) throw failure('Current general agreement must be accepted first', 403);
    }
    await agreement.update({ status: action }, { transaction });
    await db.shoot_requests.update({ status: action === 'accepted' ? 'confirmed' : 'declined' }, { where: { id: agreement.shoot_request_id }, transaction });
    const version = await db.shoot_agreement_versions.findByPk(agreement.current_version_id, { transaction });
    if (version) await version.update({ status: action }, { transaction });
    await log({ agreement_type: 'shoot', agreement_ref_id: id, version_number: version?.version_number, actor_type: 'cp', actor_id: actorId, action: action === 'accepted' ? 'Accepted' : 'Rejected' }, transaction);
    return getShootAgreement(id, creativePartnerId, transaction);
  });
}

async function listMyRequests(creativePartnerId, status) {
  const where = { creative_partner_id: creativePartnerId, ...GENERAL_SELECT };
  if (status) where.status = String(status).toLowerCase();
  const [items, counts] = await Promise.all([db.shoot_requests.findAll({ where, order: [['created_at', 'DESC']] }), db.shoot_requests.findAll({ where: { creative_partner_id: creativePartnerId, ...GENERAL_SELECT }, attributes: ['status', [db.Sequelize.fn('COUNT', db.Sequelize.col('id')), 'count']], group: ['status'], raw: true })]);
  const agreements = await db.shoot_agreements.findAll({ where: { creative_partner_id: creativePartnerId, ...GENERAL_SELECT }, attributes: ['id', 'shoot_request_id', 'status'] });
  const byRequest = new Map(agreements.map((item) => [Number(item.shoot_request_id), { id: item.id, status: item.status }]));
  return { summary: counts.reduce((result, item) => ({ ...result, [item.status]: Number(item.count) }), { pending: 0, confirmed: 0, completed: 0, declined: 0 }), items: items.map((item) => ({ ...item.toJSON(), agreement: byRequest.get(Number(item.id)) || null })) };
}

module.exports = { createGeneral, getGeneral, updateGeneral, sendGeneral, createShootRequest, createShootAgreement, getShootAgreement, updateShootAgreement, sendShoot, acceptGeneral, decideShoot, listMyRequests, resolveCreativePartnerId };
