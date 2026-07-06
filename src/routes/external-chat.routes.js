const router = require('express').Router();
const externalChatController = require('../controllers/external-chat.controller');
const { authenticate } = require('../middleware/auth');
const { requireAnyPermission } = require('../middleware/permission.middleware');

const messagesView = requireAnyPermission([
  'admin_messages.view',
  'sales_rep_messages.view',
  'sales_admin_messages.view',
  'production_manager_messages.view',
  'creative_partner_messages.view',
  'client_messages.view'
], { allowRoles: ['sales_rep', 'sales_admin', 'production_manager', 'creative', 'client'] });
const messagesCreate = requireAnyPermission([
  'admin_messages.create'
]);
const messagesEdit = requireAnyPermission([
  'admin_messages.edit'
]);
const shootMessagesView = requireAnyPermission([
  'admin_shoots.view',
  'admin_messages.view',
  'sales_rep_messages.view',
  'sales_admin_messages.view',
  'creative_partner_request_shoots.view',
  'creative_partner_messages.view',
  'client_messages.view',
  'client_shoots.view'
], { allowRoles: ['sales_rep', 'sales_admin', 'creative', 'client'] });
const directoryView = requireAnyPermission([
  'admin_shoots.view',
  'admin_messages.view',
  'admin_meetings.view',
  'admin_meetings.create',
  'admin_meetings.edit',
  'sales_rep_messages.view',
  'sales_admin_messages.view',
  'creative_partner_messages.view',
  'client_meetings.view',
  'client_shoots.view'
], { allowRoles: ['sales_rep', 'sales_admin', 'client', 'creative'] });
const shootMessagesCreate = requireAnyPermission([
  'admin_shoots.edit',
  'admin_messages.create',
  'sales_rep_messages.create',
  'sales_admin_messages.create',
  'client_messages.create',
  'creative_partner_messages.create'
], { allowRoles: ['sales_rep', 'sales_admin', 'client', 'creative'] });
const shootMessagesEdit = requireAnyPermission([
  'admin_shoots.edit',
  'admin_messages.edit',
  'sales_admin_messages.edit',
  'sales_rep_messages.edit',
  'client_messages.edit',
  'creative_partner_messages.edit'
], { allowRoles: ['sales_rep', 'sales_admin', 'client', 'creative'] });

router.get('/rooms', authenticate, messagesView, externalChatController.listChatRooms);
router.get('/directory', authenticate, directoryView, externalChatController.getChatDirectory);
router.post('/room', authenticate, shootMessagesCreate, externalChatController.createChatRoom);
router.get('/room/:bookingId', authenticate, shootMessagesView, externalChatController.getChatRoom);
router.post('/room/:roomId/participants', authenticate, shootMessagesEdit, externalChatController.addChatParticipants);
router.delete('/room/:roomId/participants/:userId', authenticate, shootMessagesEdit, externalChatController.removeChatParticipant);
router.patch('/room/:roomId/mark-read', authenticate, shootMessagesView, externalChatController.markChatRoomRead);
router.post('/messages/:roomId', authenticate, shootMessagesCreate, externalChatController.sendChatMessage);
router.get('/messages/:roomId', authenticate, shootMessagesView, externalChatController.getChatMessages);
router.post('/messages/:messageId/edit', authenticate, shootMessagesEdit, externalChatController.editChatMessage);
router.post('/messages/:messageId/delete', authenticate, shootMessagesEdit, externalChatController.deleteChatMessage);
router.post('/messages/:messageId/reaction', authenticate, shootMessagesCreate, externalChatController.reactToChatMessage);
router.get('/participants/:roomId', authenticate, shootMessagesView, externalChatController.getChatParticipants);

module.exports = router;
