const db = require('../models');
const { Op } = db.Sequelize;
const { generateGeneralAgreementPdfBuffer } = require('../utils/agreementPdf');

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

function historyDateRange(query) {
  const datePreset = String(query.date || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (datePreset) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);

    if (datePreset === 'today') {
      end.setDate(end.getDate() + 1);
    } else if (datePreset === 'this_week') {
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 7);
    } else if (datePreset === 'this_month') {
      start.setDate(1);
      end.setFullYear(start.getFullYear(), start.getMonth() + 1, 1);
    } else {
      throw failure('date must be today, this_week or this_month', 400);
    }
    return { [Op.gte]: start, [Op.lt]: end };
  }

  const startDate = query.start_date || query.date_on;
  const endDate = query.end_date || query.date_on;
  if (!startDate && !endDate) return null;

  const start = new Date(`${startDate || endDate}T00:00:00`);
  const end = new Date(`${endDate || startDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw failure('Invalid history date filter', 400);
  end.setDate(end.getDate() + 1);
  return { [Op.gte]: start, [Op.lt]: end };
}

function parseCreativePartnerRoleIds(primaryRole) {
  if (primaryRole === null || primaryRole === undefined || primaryRole === '') return [];
  let values = primaryRole;
  if (typeof values === 'string') {
    try {
      values = JSON.parse(values);
    } catch (_) {
      values = values.split(',');
    }
  }
  if (!Array.isArray(values)) values = [values];
  return [...new Set(values.map(Number).filter((roleId) => Number.isInteger(roleId) && roleId > 0))];
}

async function getGeneralHistory(query = {}) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const where = { ...GENERAL_SELECT };
  const versionWhere = { ...GENERAL_SELECT };
  const agreementWhere = { ...GENERAL_SELECT };
  const creativePartnerId = query.creative_partner_id || query.cp;
  const dateRange = historyDateRange(query);
  if (query.status) where.status = String(query.status).toLowerCase();
  if (creativePartnerId) where.creative_partner_id = Number(creativePartnerId);
  if (query.agreement_id) {
    const agreementId = Number(query.agreement_id);
    if (!Number.isInteger(agreementId) || agreementId <= 0) throw failure('Valid agreement_id is required', 400);
    agreementWhere.id = agreementId;
  }
  if (query.version) versionWhere.version_number = String(query.version).replace(/^v?/, 'v');
  if (dateRange) where.created_at = dateRange;
  if (query.search) {
    agreementWhere[Op.or] = [
      { agreement_name: { [Op.like]: `%${query.search}%` } },
      { agreement_title: { [Op.like]: `%${query.search}%` } }
    ];
  }
  const result = await db.cp_general_agreement_acceptance.findAndCountAll({
    where,
    include: [
      {
        model: db.crew_members,
        as: 'creative_partner',
        required: false,
        attributes: ['crew_member_id', 'first_name', 'last_name', 'primary_role'],
        include: [{
          model: db.crew_member_files,
          as: 'agreement_profile_photos',
          required: false,
          attributes: ['file_path'],
          where: { is_active: 1, file_type: 'profile_photo' }
        }]
      },
      {
        model: db.agreement_versions,
        required: true,
        where: versionWhere,
        attributes: ['id', 'agreement_id', 'version_number'],
        include: [{ model: db.agreements, as: 'agreement', required: true, where: agreementWhere, attributes: ['id'] }]
      }
    ],
    limit,
    offset: (page - 1) * limit,
    order: [['created_at', 'DESC']],
    distinct: true
  });
  const historyRows = result.rows.map((row) => {
    const item = row.toJSON();
    const creativePartner = item.creative_partner;
    item.agreement_id = item.agreement_version?.agreement?.id || null;
    if (creativePartner) {
      const [profilePhoto] = creativePartner.agreement_profile_photos || [];
      creativePartner.profile_photo = profilePhoto?.file_path || null;
      creativePartner._role_ids = parseCreativePartnerRoleIds(creativePartner.primary_role);
      delete creativePartner.agreement_profile_photos;
    }
    return item;
  });
  const roleIds = [...new Set(historyRows.flatMap((item) => item.creative_partner?._role_ids || []))];
  const roles = roleIds.length
    ? await db.crew_roles.findAll({ where: { role_id: { [Op.in]: roleIds }, is_active: 1 }, attributes: ['role_id', 'role_name'] })
    : [];
  const roleNamesById = new Map(roles.map((role) => [Number(role.role_id), role.role_name]));
  for (const item of historyRows) {
    const creativePartner = item.creative_partner;
    if (!creativePartner) continue;
    creativePartner.roles = creativePartner._role_ids.map((roleId) => roleNamesById.get(roleId)).filter(Boolean);
    creativePartner.role = creativePartner.roles.join(', ') || null;
    delete creativePartner._role_ids;
    delete creativePartner.primary_role;
  }
  const items = historyRows.map((item) => ({
    agreement_id: item.agreement_id,
    crew_member_id: item.creative_partner?.crew_member_id || null,
    creative_partner_name: item.creative_partner
      ? [item.creative_partner.first_name, item.creative_partner.last_name].filter(Boolean).join(' ')
      : null,
    profile_photo: item.creative_partner?.profile_photo || null,
    date: item.sent_at,
    role: item.creative_partner?.role || null,
    version: item.agreement_version?.version_number || null,
    status: item.status
  }));
  return { items, pagination: { page, limit, total: result.count } };
}

async function getShootHistory(query = {}) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const where = { ...GENERAL_SELECT };
  const requestWhere = { ...GENERAL_SELECT };
  const creativePartnerId = query.creative_partner_id || query.cp;
  const dateRange = historyDateRange(query);
  if (query.status) where.status = String(query.status).toLowerCase();
  if (creativePartnerId) where.creative_partner_id = Number(creativePartnerId);
  if (dateRange) where.created_at = dateRange;
  if (query.project) requestWhere.project_name = String(query.project);
  if (query.search) where[Op.or] = [{ assignment_id: { [Op.like]: `%${query.search}%` } }, { role: { [Op.like]: `%${query.search}%` } }];
  const result = await db.shoot_agreements.findAndCountAll({
    where,
    include: [
      { model: db.crew_members, as: 'creative_partner', required: false, attributes: ['crew_member_id', 'first_name', 'last_name', 'email'] },
      { model: db.shoot_requests, required: true, where: requestWhere }
    ],
    limit,
    offset: (page - 1) * limit,
    order: [['created_at', 'DESC']],
    distinct: true
  });
  return { items: result.rows, pagination: { page, limit, total: result.count } };
}

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
          status: 'pending',
          accepted_at: null,
          sent_at: new Date(),
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
    if (!agreement || !agreement.current_version_id || agreement.status !== 'active') throw failure('Active general agreement not found', 404);
    for (const creative_partner_id of crewMemberIds) {
      const crewMember = await db.crew_members.findOne({ where: { crew_member_id: creative_partner_id, is_active: 1 }, transaction });
      if (!crewMember) throw failure(`Creative partner ${creative_partner_id} not found`, 404);
      const acceptance = await db.cp_general_agreement_acceptance.findOne({ where: { creative_partner_id, agreement_version_id: agreement.current_version_id, ...GENERAL_SELECT }, transaction });
      if (acceptance) {
        await acceptance.update({ status: 'pending', accepted_at: null, sent_at: new Date() }, { transaction });
      } else {
        await db.cp_general_agreement_acceptance.create({ creative_partner_id, agreement_version_id: agreement.current_version_id, status: 'pending', accepted_at: null, sent_at: new Date(), is_deleted: 0 }, { transaction });
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
  versionId = Number(versionId);
  if (!Number.isInteger(versionId) || versionId <= 0) throw failure('Valid agreement version id is required', 400);
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

async function getCurrentGeneralForCreativePartner(creativePartnerId) {
  const acceptance = await db.cp_general_agreement_acceptance.findOne({
    where: { creative_partner_id: creativePartnerId, ...GENERAL_SELECT },
    include: [{
      model: db.agreement_versions,
      required: true,
      where: GENERAL_SELECT,
      include: [{ model: db.agreements, as: 'agreement', required: true, where: { ...GENERAL_SELECT, status: 'active' } }]
    }],
    order: [['created_at', 'DESC']]
  });
  if (!acceptance) throw failure('No general agreement has been sent to this CP', 404);

  const version = acceptance.agreement_version;
  const sections = await db.agreement_sections.findAll({
    where: { agreement_version_id: version.id, ...GENERAL_SELECT },
    order: [['section_order', 'ASC']]
  });
  return { agreement: version.agreement, current_version: version, sections, acceptance };
}

async function downloadGeneralAgreementPdf(id, creativePartnerId = null) {
  const agreement = await db.agreements.findOne({ where: { id, ...GENERAL_SELECT } });
  if (!agreement || !agreement.current_version_id) throw failure('General agreement not found', 404);

  const version = await db.agreement_versions.findOne({ where: { id: agreement.current_version_id, ...GENERAL_SELECT } });
  if (!version) throw failure('General agreement version not found', 404);

  const sections = await db.agreement_sections.findAll({
    where: { agreement_version_id: version.id, ...GENERAL_SELECT },
    order: [['section_order', 'ASC']]
  });

  let acceptance = null;
  let creativePartner = null;
  if (creativePartnerId) {
    acceptance = await db.cp_general_agreement_acceptance.findOne({
      where: { creative_partner_id: creativePartnerId, agreement_version_id: version.id, ...GENERAL_SELECT }
    });
    if (!acceptance) throw failure('General agreement was not sent to this CP', 404);
    creativePartner = await db.crew_members.findOne({
      where: { crew_member_id: creativePartnerId, is_active: 1 },
      attributes: ['crew_member_id', 'first_name', 'last_name', 'email']
    });
  }

  const buffer = await generateGeneralAgreementPdfBuffer({ agreement, version, sections, acceptance, creativePartner });
  return { buffer, filename: `general-agreement-${version.version_number}.pdf` };
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

async function roleSnapshot(primaryRole) {
  const roleIds = parseCreativePartnerRoleIds(primaryRole);
  if (!roleIds.length) return null;
  const roles = await db.crew_roles.findAll({ where: { role_id: { [Op.in]: roleIds }, is_active: 1 }, attributes: ['role_id', 'role_name'] });
  const names = new Map(roles.map((role) => [Number(role.role_id), role.role_name]));
  return roleIds.map((roleId) => names.get(roleId)).filter(Boolean).join(', ') || null;
}

function bookingSnapshot(booking) {
  return {
    booking_id: booking.stream_project_booking_id,
    project_name: booking.project_name,
    production_date: booking.event_date,
    location: booking.event_location,
    call_time: booking.start_time,
    expected_end_time: booking.end_time
  };
}

function parseJsonValue(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function validateShootDraft(payload) {
  const mode = String(payload.mode || '').toLowerCase();
  const recipients = Array.isArray(payload.recipients) ? payload.recipients : [];
  const sections = Array.isArray(payload.sections) ? payload.sections : [];
  if (!['individual', 'common'].includes(mode)) throw failure('mode must be individual or common', 400);
  if (!recipients.length) throw failure('At least one recipient is required', 400);
  if (!sections.length) throw failure('At least one agreement section is required', 400);
  const uniqueIds = new Set();
  for (const recipient of recipients) {
    const crewMemberId = Number(recipient.crew_member_id);
    const compensation = Number(recipient.compensation);
    if (!Number.isInteger(crewMemberId) || crewMemberId <= 0) throw failure('Valid crew_member_id is required for every recipient', 400);
    if (uniqueIds.has(crewMemberId)) throw failure('A creative partner can only appear once in an agreement request', 400);
    if (!Number.isFinite(compensation) || compensation < 0) throw failure('Valid compensation is required for every recipient', 400);
    uniqueIds.add(crewMemberId);
  }
  for (const section of sections) {
    if (!String(section.section_title || '').trim() || !String(section.section_body || '').trim()) {
      throw failure('Every agreement section needs a title and body', 400);
    }
  }
  return { mode, recipients, sections };
}

async function ensureAssignedCrew(bookingId, crewMemberId, transaction) {
  let assignment = await db.assigned_crew.findOne({ where: { project_id: bookingId, crew_member_id: crewMemberId, is_active: 1 }, transaction, lock: transaction.LOCK.UPDATE });
  if (!assignment) assignment = await db.assigned_crew.create({ project_id: bookingId, crew_member_id: crewMemberId, status: 'assigned', is_active: 1, crew_accept: 0 }, { transaction });
  return assignment;
}

async function syncShootAgreementRecipients(agreement, recipients, transaction) {
  const incomingIds = recipients.map((recipient) => Number(recipient.crew_member_id));
  const existingRecipients = await db.shoot_agreement_recipients.findAll({
    where: { shoot_agreement_id: agreement.id },
    transaction
  });
  const existingByCrewMember = new Map(existingRecipients.map((recipient) => [Number(recipient.crew_member_id), recipient]));

  for (const recipient of recipients) {
    const crewMemberId = Number(recipient.crew_member_id);
    const crewMember = await db.crew_members.findOne({ where: { crew_member_id: crewMemberId, is_active: 1 }, transaction });
    if (!crewMember) throw failure(`Creative partner ${crewMemberId} not found`, 404);
    const assignment = await ensureAssignedCrew(agreement.booking_id, crewMemberId, transaction);
    const values = {
      assigned_crew_id: assignment.id,
      role_snapshot: await roleSnapshot(crewMember.primary_role),
      compensation_snapshot: Number(recipient.compensation),
      compensation_items_snapshot: Array.isArray(recipient.compensation_items) ? recipient.compensation_items : null,
      is_active: 1
    };
    const existing = existingByCrewMember.get(crewMemberId);
    if (existing) await existing.update(values, { transaction });
    else await db.shoot_agreement_recipients.create({ shoot_agreement_id: agreement.id, crew_member_id: crewMemberId, ...values }, { transaction });
  }

  await db.shoot_agreement_recipients.update(
    { is_active: 0 },
    { where: { shoot_agreement_id: agreement.id, crew_member_id: { [Op.notIn]: incomingIds } }, transaction }
  );
}

async function syncShootAgreementVersionRecipients(agreement, version, transaction) {
  const recipients = await db.shoot_agreement_recipients.findAll({
    where: { shoot_agreement_id: agreement.id, is_active: 1 },
    transaction
  });
  await db.shoot_agreement_version_recipients.destroy({ where: { shoot_agreement_version_id: version.id }, transaction });
  await db.shoot_agreement_version_recipients.bulkCreate(recipients.map((recipient) => ({
    shoot_agreement_version_id: version.id,
    shoot_agreement_recipient_id: recipient.id,
    crew_member_id: recipient.crew_member_id,
    assigned_crew_id: recipient.assigned_crew_id,
    role_snapshot: recipient.role_snapshot,
    compensation_snapshot: recipient.compensation_snapshot,
    compensation_items_snapshot: recipient.compensation_items_snapshot
  })), { transaction });
}

async function createAgreementDocument(booking, mode, recipients, sections, actorId, transaction) {
  const agreement = await db.shoot_agreements.create({ booking_id: booking.stream_project_booking_id, agreement_mode: mode, status: 'draft', created_by: actorId, is_deleted: 0 }, { transaction });
  const version = await db.shoot_agreement_versions.create({ shoot_agreement_id: agreement.id, version_number: 'v1.0', project_snapshot: bookingSnapshot(booking), snapshot: { mode }, created_by: actorId, is_deleted: 0 }, { transaction });
  await db.shoot_agreement_sections.bulkCreate(sections.map((section, index) => ({ shoot_agreement_version_id: version.id, section_order: Number(section.section_order) || index + 1, section_title: String(section.section_title).trim(), section_body: String(section.section_body).trim() })), { transaction });
  await agreement.update({ current_version_id: version.id }, { transaction });
  for (const recipient of recipients) {
    const crewMemberId = Number(recipient.crew_member_id);
    const crewMember = await db.crew_members.findOne({ where: { crew_member_id: crewMemberId, is_active: 1 }, transaction });
    if (!crewMember) throw failure(`Creative partner ${crewMemberId} not found`, 404);
    const assignment = await ensureAssignedCrew(booking.stream_project_booking_id, crewMemberId, transaction);
    await db.shoot_agreement_recipients.create({
      shoot_agreement_id: agreement.id,
      crew_member_id: crewMemberId,
      assigned_crew_id: assignment.id,
      role_snapshot: await roleSnapshot(crewMember.primary_role),
      compensation_snapshot: Number(recipient.compensation),
      compensation_items_snapshot: Array.isArray(recipient.compensation_items) ? recipient.compensation_items : null
    }, { transaction });
  }
  await syncShootAgreementVersionRecipients(agreement, version, transaction);
  await log({ agreement_type: 'shoot', agreement_ref_id: agreement.id, version_number: version.version_number, actor_type: 'admin', actor_id: actorId, action: 'Created draft agreement' }, transaction);
  return agreement.id;
}

async function createShootAgreementDraft(bookingId, payload, actorId) {
  actorId = requireAuthenticatedUserId(actorId);
  bookingId = Number(bookingId);
  if (!Number.isInteger(bookingId) || bookingId <= 0) throw failure('Valid booking id is required', 400);
  const { mode, recipients, sections } = validateShootDraft(payload);
  return db.sequelize.transaction(async (transaction) => {
    const booking = await db.stream_project_booking.findByPk(bookingId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!booking) throw failure('Shoot booking not found', 404);
    const groups = mode === 'individual' ? recipients.map((recipient) => [recipient]) : [recipients];
    const agreementIds = [];
    for (const group of groups) agreementIds.push(await createAgreementDocument(booking, mode, group, sections, actorId, transaction));
    return Promise.all(agreementIds.map((agreementId) => getShootAgreementV2(agreementId, null, transaction)));
  });
}

async function getShootAgreementV2(id, creativePartnerId = null, transaction = null) {
  const agreement = await db.shoot_agreements.findOne({ where: { id, ...GENERAL_SELECT }, transaction });
  if (!agreement) throw failure('Shoot agreement not found', 404);
  const recipients = await db.shoot_agreement_version_recipients.findAll({
    where: { shoot_agreement_version_id: agreement.current_version_id },
    transaction,
    include: [{
      model: db.crew_members,
      as: 'creative_partner',
      attributes: ['crew_member_id', 'first_name', 'last_name'],
      include: [{
        model: db.crew_member_files,
        as: 'agreement_profile_photos',
        required: false,
        attributes: ['file_path'],
        where: { is_active: 1, file_type: 'profile_photo' }
      }]
    }]
  });
  if (creativePartnerId && !recipients.some((recipient) => Number(recipient.crew_member_id) === Number(creativePartnerId))) throw failure('Shoot agreement not found', 404);
  const [version, sections, versions, activity] = await Promise.all([
    db.shoot_agreement_versions.findByPk(agreement.current_version_id, { transaction }),
    db.shoot_agreement_sections.findAll({ where: { shoot_agreement_version_id: agreement.current_version_id }, order: [['section_order', 'ASC']], transaction }),
    db.shoot_agreement_versions.findAll({ where: { shoot_agreement_id: agreement.id, ...GENERAL_SELECT }, attributes: ['id', 'version_number', 'project_snapshot', 'created_at'], order: [['created_at', 'DESC']], transaction }),
    db.agreement_activity_log.findAll({ where: { agreement_type: 'shoot', agreement_ref_id: agreement.id, ...GENERAL_SELECT }, attributes: ['id', 'version_number', 'actor_type', 'actor_id', 'action', 'created_at'], order: [['created_at', 'DESC']], transaction })
  ]);
  const acceptances = version ? await db.shoot_agreement_acceptances.findAll({ where: { shoot_agreement_version_id: version.id }, transaction }) : [];
  const acceptanceByRecipient = new Map(acceptances.map((acceptance) => [Number(acceptance.shoot_agreement_recipient_id), acceptance.toJSON()]));
  const recipientData = recipients.map((recipient) => {
    const [profilePhoto] = recipient.creative_partner?.agreement_profile_photos || [];
    return {
      crew_member_id: recipient.crew_member_id,
      assignment_id: recipient.assigned_crew_id,
      creative_partner_name: [recipient.creative_partner?.first_name, recipient.creative_partner?.last_name].filter(Boolean).join(' '),
      profile_photo: profilePhoto?.file_path || null,
      role: recipient.role_snapshot,
      compensation: Number(recipient.compensation_snapshot),
      compensation_items: parseJsonValue(recipient.compensation_items_snapshot, []),
      status: acceptanceByRecipient.get(Number(recipient.shoot_agreement_recipient_id))?.status || agreement.status,
      accepted_at: acceptanceByRecipient.get(Number(recipient.shoot_agreement_recipient_id))?.accepted_at || null
    };
  });
  return {
    agreement_id: agreement.id,
    booking_id: agreement.booking_id,
    agreement_mode: agreement.agreement_mode,
    status: agreement.status,
    project: parseJsonValue(version?.project_snapshot),
    current_version: version ? {
      id: version.id,
      version: version.version_number,
      created_at: version.created_at,
      sections: sections.map((section) => ({
        section_order: section.section_order,
        section_title: section.section_title,
        section_body: section.section_body
      }))
    } : null,
    recipients: recipientData,
    version_history: versions.map((item) => ({ id: item.id, version: item.version_number, created_at: item.created_at, project: parseJsonValue(item.project_snapshot) })),
    activity_log: activity.map((item) => item.toJSON())
  };
}

async function sendShootAgreementV2(id, actorId) {
  actorId = requireAuthenticatedUserId(actorId);
  return db.sequelize.transaction(async (transaction) => {
    const agreement = await db.shoot_agreements.findOne({ where: { id, ...GENERAL_SELECT }, transaction, lock: transaction.LOCK.UPDATE });
    if (!agreement || !agreement.current_version_id) throw failure('Shoot agreement not found', 404);
    if (['cancelled', 'expired'].includes(agreement.status)) throw failure('Agreement cannot be sent', 409);
    if (agreement.status === 'accepted') throw failure('Create a new version before sending an accepted agreement again', 409);
    const recipients = await db.shoot_agreement_version_recipients.findAll({
      where: { shoot_agreement_version_id: agreement.current_version_id },
      transaction
    });
    if (!recipients.length) throw failure('Agreement has no recipients', 409);
    for (const recipient of recipients) {
      const [acceptance] = await db.shoot_agreement_acceptances.findOrCreate({ where: { shoot_agreement_recipient_id: recipient.shoot_agreement_recipient_id, shoot_agreement_version_id: agreement.current_version_id }, defaults: { status: 'pending', sent_at: new Date() }, transaction });
      if (acceptance.status === 'pending') await acceptance.update({ sent_at: new Date() }, { transaction });
    }
    await agreement.update({ status: 'sent' }, { transaction });
    await log({ agreement_type: 'shoot', agreement_ref_id: agreement.id, actor_type: 'admin', actor_id: actorId, action: 'Sent to CP' }, transaction);
    return getShootAgreementV2(agreement.id, null, transaction);
  });
}

async function updateShootAgreementV2(id, payload, actorId) {
  actorId = requireAuthenticatedUserId(actorId);
  const sections = Array.isArray(payload.sections) ? payload.sections : [];
  const recipients = Array.isArray(payload.recipients) ? payload.recipients : null;
  if (!sections.length) throw failure('At least one agreement section is required', 400);
  for (const section of sections) {
    if (!String(section.section_title || '').trim() || !String(section.section_body || '').trim()) throw failure('Every agreement section needs a title and body', 400);
  }
  return db.sequelize.transaction(async (transaction) => {
    const agreement = await db.shoot_agreements.findOne({ where: { id, ...GENERAL_SELECT }, transaction, lock: transaction.LOCK.UPDATE });
    if (!agreement || !agreement.current_version_id) throw failure('Shoot agreement not found', 404);
    if (agreement.status === 'cancelled' || agreement.status === 'expired') throw failure('Cancelled or expired agreements cannot be edited', 409);
    if (agreement.status !== 'draft' && payload.create_new_version !== true) {
      throw failure('create_new_version: true is required to change a sent, accepted, or rejected agreement', 409);
    }
    if (recipients) validateShootDraft({ mode: agreement.agreement_mode, recipients, sections });
    const current = await db.shoot_agreement_versions.findByPk(agreement.current_version_id, { transaction });
    let version = current;
    if (agreement.status === 'draft') {
      await db.shoot_agreement_sections.destroy({ where: { shoot_agreement_version_id: current.id }, transaction });
    } else {
      const booking = await db.stream_project_booking.findByPk(agreement.booking_id, { transaction });
      version = await db.shoot_agreement_versions.create({
        shoot_agreement_id: agreement.id,
        version_number: nextVersion(current.version_number),
        project_snapshot: booking ? bookingSnapshot(booking) : current.project_snapshot,
        snapshot: current.snapshot,
        created_by: actorId,
        is_deleted: 0
      }, { transaction });
      await agreement.update({ current_version_id: version.id, status: 'draft' }, { transaction });
    }
    await db.shoot_agreement_sections.bulkCreate(sections.map((section, index) => ({ shoot_agreement_version_id: version.id, section_order: Number(section.section_order) || index + 1, section_title: String(section.section_title).trim(), section_body: String(section.section_body).trim() })), { transaction });
    if (recipients) await syncShootAgreementRecipients(agreement, recipients, transaction);
    await syncShootAgreementVersionRecipients(agreement, version, transaction);
    await log({ agreement_type: 'shoot', agreement_ref_id: agreement.id, version_number: version.version_number, actor_type: 'admin', actor_id: actorId, action: version.id === current.id ? 'Updated draft agreement' : 'Created new agreement version' }, transaction);
    return getShootAgreementV2(agreement.id, null, transaction);
  });
}

async function decideShootV2(id, creativePartnerId, actorId, action) {
  actorId = requireAuthenticatedUserId(actorId);
  return db.sequelize.transaction(async (transaction) => {
    const agreement = await db.shoot_agreements.findOne({ where: { id, ...GENERAL_SELECT }, transaction, lock: transaction.LOCK.UPDATE });
    if (!agreement || !agreement.current_version_id) throw failure('Shoot agreement not found', 404);
    const recipient = await db.shoot_agreement_recipients.findOne({ where: { shoot_agreement_id: id, crew_member_id: creativePartnerId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!recipient) throw failure('Shoot agreement not found', 404);
    const acceptance = await db.shoot_agreement_acceptances.findOne({ where: { shoot_agreement_recipient_id: recipient.id, shoot_agreement_version_id: agreement.current_version_id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!acceptance) throw failure('Agreement has not been sent to this CP', 409);
    if (acceptance.status !== 'pending') throw failure('Agreement has already been decided', 409);
    await acceptance.update(action === 'accepted' ? { status: 'accepted', accepted_at: new Date() } : { status: 'rejected', rejected_at: new Date() }, { transaction });
    const allAcceptances = await db.shoot_agreement_acceptances.findAll({ where: { shoot_agreement_version_id: agreement.current_version_id }, transaction });
    if (allAcceptances.every((item) => item.status === 'accepted')) await agreement.update({ status: 'accepted' }, { transaction });
    await log({ agreement_type: 'shoot', agreement_ref_id: agreement.id, actor_type: 'cp', actor_id: actorId, action: action === 'accepted' ? 'Accepted' : 'Rejected' }, transaction);
    return getShootAgreementV2(agreement.id, creativePartnerId, transaction);
  });
}

async function getShootHistoryV2(query = {}) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const where = { ...GENERAL_SELECT };
  if (query.booking_id) where.booking_id = Number(query.booking_id);
  const agreements = await db.shoot_agreements.findAll({ where, order: [['created_at', 'DESC']] });
  const rows = [];
  for (const agreement of agreements) {
    const detail = await getShootAgreementV2(agreement.id);
    const snapshot = detail.project || {};
    for (const recipient of detail.recipients) {
      if (query.status && recipient.status !== String(query.status).toLowerCase()) continue;
      rows.push({
        agreement_id: detail.agreement_id,
        booking_id: detail.booking_id,
        project_name: snapshot.project_name || null,
        assignment_id: recipient.assignment_id,
        crew_member_id: recipient.crew_member_id,
        creative_partner_name: recipient.creative_partner_name,
        profile_photo: recipient.profile_photo,
        date: recipient.accepted_at || detail.current_version?.created_at || null,
        role: recipient.role,
        compensation: recipient.compensation,
        version: detail.current_version?.version || null,
        status: recipient.status
      });
    }
  }
  const total = rows.length;
  const items = rows.slice((page - 1) * limit, page * limit);
  return { items, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } };
}

module.exports = { createGeneral, getGeneral, getGeneralHistory, updateGeneral, sendGeneral, createShootRequest, createShootAgreement, getShootAgreement, getShootHistory, updateShootAgreement, sendShoot, acceptGeneral, getCurrentGeneralForCreativePartner, downloadGeneralAgreementPdf, decideShoot, listMyRequests, resolveCreativePartnerId, createShootAgreementDraft, getShootAgreementV2, getShootHistoryV2, sendShootAgreementV2, updateShootAgreementV2, decideShootV2 };
