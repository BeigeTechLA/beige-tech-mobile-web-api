const express = require('express');
const router = express.Router();
const agreementController = require('../controllers/agreement.controller');
const { authMiddleware } = require('../middleware/auth');
const { requireAnyPermission } = require('../middleware/permission.middleware');

const adminRoles = { allowRoles: ['admin', 'sales_admin', 'production_manager'] };
const cpRoles = { allowRoles: ['creative_partner', 'creator', 'creative'] };
const agreementsView = requireAnyPermission(['admin_agreements.view'], adminRoles);
const agreementsCreate = requireAnyPermission(['admin_agreements.create'], adminRoles);
const agreementsEdit = requireAnyPermission(['admin_agreements.edit'], adminRoles);
const cpAgreementView = requireAnyPermission(['creative_partner_agreements.view'], cpRoles);
const cpAgreementEdit = requireAnyPermission(['creative_partner_agreements.edit'], cpRoles);

router.post('/admin/general-agreements', authMiddleware, agreementsCreate, agreementController.createGeneralAgreement);
router.put('/admin/general-agreements/:id', authMiddleware, agreementsEdit, agreementController.updateGeneralAgreement);
router.get('/admin/general-agreements/history', authMiddleware, agreementsView, agreementController.getGeneralAgreementHistory);
router.get('/admin/general-agreements/:id', authMiddleware, agreementsView, agreementController.getGeneralAgreement);
router.post('/admin/general-agreements/:id/send', authMiddleware, agreementsEdit, agreementController.sendGeneralAgreement);
router.post('/admin/shoot-requests', authMiddleware, agreementsCreate, agreementController.createShootRequest);
router.post('/admin/shoot-agreements', authMiddleware, agreementsCreate, agreementController.createShootAgreement);
router.put('/admin/shoot-agreements/:id', authMiddleware, agreementsEdit, agreementController.updateShootAgreement);
router.get('/admin/shoot-agreements/history', authMiddleware, agreementsView, agreementController.getShootAgreementHistory);
router.get('/admin/shoot-agreements/:id', authMiddleware, agreementsView, agreementController.getShootAgreement);
router.post('/admin/shoot-agreements/:id/send', authMiddleware, agreementsEdit, agreementController.sendShootAgreement);
router.get('/cp/general-agreement/current', authMiddleware, cpAgreementView, agreementController.getCurrentGeneralAgreement);
router.post('/cp/general-agreement/:versionId/accept', authMiddleware, cpAgreementEdit, agreementController.acceptCurrentGeneralAgreement);
router.get('/cp/shoot-requests', authMiddleware, cpAgreementView, agreementController.getMyShootRequests);
router.get('/cp/shoot-requests/:id', authMiddleware, cpAgreementView, agreementController.getMyShootRequest);
router.get('/cp/shoot-agreements/:id', authMiddleware, cpAgreementView, agreementController.getMyShootAgreement);
router.post('/cp/shoot-agreements/:id/accept', authMiddleware, cpAgreementEdit, agreementController.acceptShootAgreement);
router.post('/cp/shoot-agreements/:id/reject', authMiddleware, cpAgreementEdit, agreementController.rejectShootAgreement);
router.get('/cp/profile/agreements', authMiddleware, cpAgreementView, agreementController.getProfileAgreements);

module.exports = router;
