const agreements = require('../services/agreements.service');
const creatorEarnings = require('../services/creator-earnings.service');

function userId(req) { return req.userId || req.user?.userId || req.user?.id || null; }
function actor(req) { return { userId: userId(req) }; }
function requestContext(req) { return { ip: req.ip || req.headers['x-forwarded-for'] || null, userAgent: req.get('user-agent') || null }; }

async function creatorId(req) {
  const creator = await creatorEarnings.resolveCreatorForUser(userId(req));
  if (!creator) {
    const err = new Error('Creative partner profile not found for logged-in user');
    err.statusCode = 404;
    throw err;
  }
  return creator.creator_id;
}

function send(res, status, data, message) { return res.status(status).json({ success: true, ...(message ? { message } : {}), data }); }
function fail(res, error, fallback) {
  console.error('Agreement API error:', error);
  return res.status(error.statusCode || 500).json({ success: false, message: error.message || fallback });
}

exports.createGeneralTemplate = async (req, res) => { try { return send(res, 201, await agreements.createGeneralTemplate(req.body, actor(req)), 'General agreement draft created'); } catch (e) { return fail(res, e, 'Failed to create general agreement'); } };
exports.listGeneralTemplates = async (_req, res) => { try { return send(res, 200, await agreements.listGeneralTemplates()); } catch (e) { return fail(res, e, 'Failed to list general agreements'); } };
exports.getGeneralTemplate = async (req, res) => { try { const template = await agreements.templateById(req.params.templateId); const row = template.get({ plain: true }); return send(res, 200, { ...row, content_json: row.content_json ? JSON.parse(row.content_json) : null }); } catch (e) { return fail(res, e, 'Failed to fetch general agreement'); } };
exports.updateGeneralTemplate = async (req, res) => { try { return send(res, 200, await agreements.updateGeneralTemplate(req.params.templateId, req.body, actor(req)), 'General agreement draft updated'); } catch (e) { return fail(res, e, 'Failed to update general agreement'); } };
exports.deleteGeneralTemplate = async (req, res) => { try { return send(res, 200, await agreements.deleteGeneralTemplate(req.params.templateId), 'General agreement deleted'); } catch (e) { return fail(res, e, 'Failed to delete general agreement'); } };
exports.publishGeneralTemplate = async (req, res) => { try { return send(res, 200, await agreements.publishGeneralTemplate(req.params.templateId, actor(req)), 'General agreement published'); } catch (e) { return fail(res, e, 'Failed to publish general agreement'); } };

exports.createShootAgreement = async (req, res) => { try { return send(res, 201, await agreements.createShootAgreement(req.params.bookingId, req.params.assignmentId, req.body, actor(req)), 'Shoot agreement draft created'); } catch (e) { return fail(res, e, 'Failed to create shoot agreement'); } };
exports.updateShootDraft = async (req, res) => { try { return send(res, 200, await agreements.updateShootDraft(req.params.agreementId, req.body, actor(req)), 'Shoot agreement draft updated'); } catch (e) { return fail(res, e, 'Failed to update shoot agreement'); } };
exports.sendShootAgreement = async (req, res) => { try { return send(res, 200, await agreements.sendShootAgreement(req.params.agreementId, actor(req)), 'Shoot agreement sent'); } catch (e) { return fail(res, e, 'Failed to send shoot agreement'); } };
exports.reviseShootAgreement = async (req, res) => { try { return send(res, 201, await agreements.reviseShootAgreement(req.params.agreementId, req.body, actor(req)), 'Shoot agreement revision draft created'); } catch (e) { return fail(res, e, 'Failed to revise shoot agreement'); } };
exports.cancelAgreement = async (req, res) => { try { return send(res, 200, await agreements.cancelAgreement(req.params.agreementId, actor(req)), 'Agreement cancelled'); } catch (e) { return fail(res, e, 'Failed to cancel agreement'); } };
exports.listAdminDocuments = async (req, res) => { try { return send(res, 200, await agreements.listDocuments(req.query)); } catch (e) { return fail(res, e, 'Failed to list agreements'); } };
exports.getAdminDocument = async (req, res) => { try { return send(res, 200, await agreements.getDocumentDetail(req.params.agreementId)); } catch (e) { return fail(res, e, 'Failed to fetch agreement'); } };

exports.getCurrentGeneralAgreement = async (req, res) => { try { return send(res, 200, await agreements.getCurrentGeneralAgreement(await creatorId(req))); } catch (e) { return fail(res, e, 'Failed to fetch general agreement'); } };
exports.acceptCurrentGeneralAgreement = async (req, res) => { try { const id = Number(req.params.agreementId); return send(res, 200, await agreements.respondToAgreement(id, await creatorId(req), 'accepted', req.body, requestContext(req), 'general'), 'General agreement accepted'); } catch (e) { return fail(res, e, 'Failed to accept general agreement'); } };
exports.listCreatorDocuments = async (req, res) => { try { return send(res, 200, await agreements.listDocuments(req.query, await creatorId(req))); } catch (e) { return fail(res, e, 'Failed to list agreements'); } };
exports.getCreatorDocument = async (req, res) => { try { return send(res, 200, await agreements.getDocumentDetail(req.params.agreementId, await creatorId(req))); } catch (e) { return fail(res, e, 'Failed to fetch agreement'); } };
exports.acceptShootAgreement = async (req, res) => { try { return send(res, 200, await agreements.respondToAgreement(req.params.agreementId, await creatorId(req), 'accepted', req.body, requestContext(req), 'shoot'), 'Shoot agreement accepted and shoot confirmed'); } catch (e) { return fail(res, e, 'Failed to accept shoot agreement'); } };
exports.rejectShootAgreement = async (req, res) => { try { return send(res, 200, await agreements.respondToAgreement(req.params.agreementId, await creatorId(req), 'rejected', req.body, requestContext(req), 'shoot'), 'Shoot agreement rejected'); } catch (e) { return fail(res, e, 'Failed to reject shoot agreement'); } };
