const express = require('express');
const router = express.Router();
const controller = require('../controllers/agreements.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAnyPermission } = require('../middleware/permission.middleware');

const adminView = requireAnyPermission(['admin_agreements.view'], { allowAdminBypass: false });
const adminCreate = requireAnyPermission(['admin_agreements.create'], { allowAdminBypass: false });
const adminEdit = requireAnyPermission(['admin_agreements.edit'], { allowAdminBypass: false });
const adminSend = requireAnyPermission(['admin_agreements.send'], { allowAdminBypass: false });
const adminCancel = requireAnyPermission(['admin_agreements.cancel'], { allowAdminBypass: false });

router.post('/admin/general', authenticate, adminCreate, controller.createGeneralTemplate);
router.get('/admin/general', authenticate, adminView, controller.listGeneralTemplates);
router.get('/admin/general/:templateId', authenticate, adminView, controller.getGeneralTemplate);
router.patch('/admin/general/:templateId', authenticate, adminEdit, controller.updateGeneralTemplate);
router.delete('/admin/general/:templateId', authenticate, adminCancel, controller.deleteGeneralTemplate);
router.post('/admin/general/:templateId/publish', authenticate, adminSend, controller.publishGeneralTemplate);

router.get('/admin', authenticate, adminView, controller.listAdminDocuments);
router.post('/admin/shoots/:bookingId/assignments/:assignmentId', authenticate, adminCreate, controller.createShootAgreement);
router.get('/admin/:agreementId', authenticate, adminView, controller.getAdminDocument);
router.patch('/admin/:agreementId', authenticate, adminEdit, controller.updateShootDraft);
router.post('/admin/:agreementId/send', authenticate, adminSend, controller.sendShootAgreement);
router.post('/admin/:agreementId/revise', authenticate, adminEdit, controller.reviseShootAgreement);
router.post('/admin/:agreementId/cancel', authenticate, adminCancel, controller.cancelAgreement);

router.get('/creator/general/current', authenticate, controller.getCurrentGeneralAgreement);
router.post('/creator/general/:agreementId/accept', authenticate, controller.acceptCurrentGeneralAgreement);
router.get('/creator', authenticate, controller.listCreatorDocuments);
router.get('/creator/:agreementId', authenticate, controller.getCreatorDocument);
router.post('/creator/:agreementId/accept', authenticate, controller.acceptShootAgreement);
router.post('/creator/:agreementId/reject', authenticate, controller.rejectShootAgreement);

module.exports = router;
