const agreementService = require('../services/agreement.service');
const { agreements, agreement_versions, cp_general_agreement_acceptance, shoot_agreements, shoot_requests, Sequelize } = require('../models');

const getAuthenticatedUserId = (req) => {
  const userId = Number(req.user?.userId || req.user?.id || req.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    const error = new Error('Authenticated user id is required');
    error.statusCode = 401;
    throw error;
  }
  return userId;
};

const respondError = (res, error, label) => {
  console.error(`${label}:`, error);
  return res.status(error.statusCode || 500).json({ error: true, message: error.statusCode ? error.message : 'Internal server error', data: null });
};

exports.createGeneralAgreement = async (req, res) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const data = await agreementService.createGeneral(req.body, actorId);
    return res.status(201).json({ error: false, message: 'General agreement created successfully', data });
  } catch (error) { return respondError(res, error, 'Create General Agreement Error'); }
};

exports.updateGeneralAgreement = async (req, res) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const data = await agreementService.updateGeneral(req.params.id, req.body, actorId);
    return res.status(200).json({ error: false, message: 'General agreement updated successfully', data });
  } catch (error) { return respondError(res, error, 'Update General Agreement Error'); }
};

exports.getGeneralAgreement = async (req, res) => {
  try {
    const data = await agreementService.getGeneral(req.params.id);
    return res.status(200).json({ error: false, message: 'General agreement fetched successfully', data });
  } catch (error) { return respondError(res, error, 'Get General Agreement Error'); }
};

exports.sendGeneralAgreement = async (req, res) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    await agreementService.sendGeneral(req.params.id, req.body.crew_member_ids, actorId);
    return res.status(200).json({ error: false, message: 'General agreement sent successfully', data: null });
  } catch (error) { return respondError(res, error, 'Send General Agreement Error'); }
};

exports.getGeneralAgreementHistory = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const where = { is_deleted: 0 };
    if (req.query.status) where.status = req.query.status;
    if (req.query.cp) where.creative_partner_id = req.query.cp;
    if (req.query.version) where.agreement_version_id = req.query.version;
    const result = await cp_general_agreement_acceptance.findAndCountAll({ where, include: [{ model: agreement_versions, required: false, where: { is_deleted: 0 }, include: [{ model: agreements, as: 'agreement', required: false, where: { is_deleted: 0 } }] }], limit, offset: (page - 1) * limit, order: [['created_at', 'DESC']], distinct: true });
    return res.status(200).json({ error: false, message: 'General agreement history fetched successfully', data: { items: result.rows, pagination: { page, limit, total: result.count } } });
  } catch (error) { return respondError(res, error, 'Get General Agreement History Error'); }
};

exports.createShootRequest = async (req, res) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const data = await agreementService.createShootRequest(req.body, actorId);
    return res.status(201).json({ error: false, message: 'Shoot request created successfully', data });
  } catch (error) { return respondError(res, error, 'Create Shoot Request Error'); }
};

exports.createShootAgreement = async (req, res) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const data = await agreementService.createShootAgreement(req.body, actorId);
    return res.status(201).json({ error: false, message: 'Shoot agreement created successfully', data });
  } catch (error) { return respondError(res, error, 'Create Shoot Agreement Error'); }
};

exports.updateShootAgreement = async (req, res) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const data = await agreementService.updateShootAgreement(req.params.id, req.body, actorId);
    return res.status(200).json({ error: false, message: 'Shoot agreement updated successfully', data });
  } catch (error) { return respondError(res, error, 'Update Shoot Agreement Error'); }
};

exports.getShootAgreement = async (req, res) => {
  try {
    const data = await agreementService.getShootAgreement(req.params.id);
    return res.status(200).json({ error: false, message: 'Shoot agreement fetched successfully', data });
  } catch (error) { return respondError(res, error, 'Get Shoot Agreement Error'); }
};

exports.sendShootAgreement = async (req, res) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    await agreementService.sendShoot(req.params.id, actorId);
    return res.status(200).json({ error: false, message: 'Shoot agreement sent successfully', data: null });
  } catch (error) { return respondError(res, error, 'Send Shoot Agreement Error'); }
};

exports.getShootAgreementHistory = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const where = { is_deleted: 0 };
    if (req.query.status) where.status = String(req.query.status).toLowerCase();
    if (req.query.cp) where.creative_partner_id = req.query.cp;
    if (req.query.search) where[Sequelize.Op.or] = [{ assignment_id: { [Sequelize.Op.like]: `%${req.query.search}%` } }, { role: { [Sequelize.Op.like]: `%${req.query.search}%` } }];
    const result = await shoot_agreements.findAndCountAll({ where, include: [{ model: shoot_requests, required: false }], limit, offset: (page - 1) * limit, order: [['created_at', 'DESC']], distinct: true });
    return res.status(200).json({ error: false, message: 'Shoot agreement history fetched successfully', data: { items: result.rows, pagination: { page, limit, total: result.count } } });
  } catch (error) { return respondError(res, error, 'Get Shoot Agreement History Error'); }
};

exports.getCurrentGeneralAgreement = async (req, res) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const agreement = await agreements.findOne({ where: { status: 'active', is_deleted: 0 }, order: [['updated_at', 'DESC']] });
    if (!agreement) return res.status(404).json({ error: true, message: 'No active general agreement found', data: null });
    const data = await agreementService.getGeneral(agreement.id);
    const crewMemberId = await agreementService.resolveCreativePartnerId(actorId);
    data.acceptance = await cp_general_agreement_acceptance.findOne({ where: { creative_partner_id: crewMemberId, agreement_version_id: agreement.current_version_id, is_deleted: 0 } });
    return res.status(200).json({ error: false, message: 'Current general agreement fetched successfully', data });
  } catch (error) { return respondError(res, error, 'Get Current General Agreement Error'); }
};

exports.acceptCurrentGeneralAgreement = async (req, res) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const crewMemberId = await agreementService.resolveCreativePartnerId(actorId);
    const data = await agreementService.acceptGeneral(req.params.versionId, crewMemberId, actorId, req.body.confirmed === true);
    return res.status(200).json({ error: false, message: 'General agreement accepted successfully', data });
  } catch (error) { return respondError(res, error, 'Accept General Agreement Error'); }
};

exports.getMyShootRequests = async (req, res) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const crewMemberId = await agreementService.resolveCreativePartnerId(actorId);
    const data = await agreementService.listMyRequests(crewMemberId, req.query.status);
    return res.status(200).json({ error: false, message: 'Shoot requests fetched successfully', data });
  } catch (error) { return respondError(res, error, 'Get My Shoot Requests Error'); }
};

exports.getMyShootRequest = async (req, res) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const crewMemberId = await agreementService.resolveCreativePartnerId(actorId);
    const data = await shoot_requests.findOne({ where: { id: req.params.id, creative_partner_id: crewMemberId, is_deleted: 0 } });
    if (!data) return res.status(404).json({ error: true, message: 'Shoot request not found', data: null });
    const agreement = await shoot_agreements.findOne({ where: { shoot_request_id: data.id, is_deleted: 0 }, attributes: ['id', 'status'] });
    return res.status(200).json({ error: false, message: 'Shoot request fetched successfully', data: { ...data.toJSON(), agreement } });
  } catch (error) { return respondError(res, error, 'Get My Shoot Request Error'); }
};

exports.getMyShootAgreement = async (req, res) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const crewMemberId = await agreementService.resolveCreativePartnerId(actorId);
    const data = await agreementService.getShootAgreement(req.params.id, crewMemberId);
    return res.status(200).json({ error: false, message: 'Shoot agreement fetched successfully', data });
  } catch (error) { return respondError(res, error, 'Get My Shoot Agreement Error'); }
};

exports.acceptShootAgreement = async (req, res) => {
  try {
    if (req.body.confirmed !== true) return res.status(400).json({ error: true, message: 'confirmation is required', data: null });
    const actorId = getAuthenticatedUserId(req);
    const crewMemberId = await agreementService.resolveCreativePartnerId(actorId);
    const data = await agreementService.decideShoot(req.params.id, crewMemberId, actorId, 'accepted');
    return res.status(200).json({ error: false, message: 'Shoot agreement accepted successfully', data });
  } catch (error) { return respondError(res, error, 'Accept Shoot Agreement Error'); }
};

exports.rejectShootAgreement = async (req, res) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const crewMemberId = await agreementService.resolveCreativePartnerId(actorId);
    const data = await agreementService.decideShoot(req.params.id, crewMemberId, actorId, 'rejected');
    return res.status(200).json({ error: false, message: 'Shoot agreement rejected successfully', data });
  } catch (error) { return respondError(res, error, 'Reject Shoot Agreement Error'); }
};

exports.getProfileAgreements = async (req, res) => {
  try {
    const actorId = getAuthenticatedUserId(req);
    const crewMemberId = await agreementService.resolveCreativePartnerId(actorId);
    const general = await cp_general_agreement_acceptance.findAll({ where: { creative_partner_id: crewMemberId, is_deleted: 0 }, include: [{ model: agreement_versions, required: false }] });
    const shoots = await shoot_agreements.findAll({ where: { creative_partner_id: crewMemberId, is_deleted: 0 }, attributes: ['id', 'assignment_id', 'status', 'current_version_id', 'created_at'] });
    return res.status(200).json({ error: false, message: 'Profile agreements fetched successfully', data: { general_agreements: general, shoot_agreements: shoots } });
  } catch (error) { return respondError(res, error, 'Get Profile Agreements Error'); }
};
