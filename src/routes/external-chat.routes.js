const router = require('express').Router();
const externalChatController = require('../controllers/external-chat.controller');
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireAnyPermission } = require('../middleware/permission.middleware');

const messagesView = requirePermission('messages', 'view', { allowBaseRoles: true });
const messagesCreate = requirePermission('messages', 'create', { allowBaseRoles: true });
const messagesEdit = requirePermission('messages', 'edit', { allowBaseRoles: true });
const shootMessagesView = requireAnyPermission(['shoots.view', 'messages.view'], { allowBaseRoles: true });
const shootMessagesCreate = requireAnyPermission(['shoots.edit', 'messages.create'], { allowBaseRoles: true });
const shootMessagesEdit = requireAnyPermission(['shoots.edit', 'messages.edit'], { allowBaseRoles: true });

router.get('/rooms', authenticate, messagesView, externalChatController.listChatRooms);
router.get('/directory', authenticate, shootMessagesView, externalChatController.getChatDirectory);
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
