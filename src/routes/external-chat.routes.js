const router = require('express').Router();
const externalChatController = require('../controllers/external-chat.controller');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission.middleware');

const messagesView = requirePermission('messages', 'view', { allowBaseRoles: true });
const messagesCreate = requirePermission('messages', 'create', { allowBaseRoles: true });
const messagesEdit = requirePermission('messages', 'edit', { allowBaseRoles: true });

router.get('/rooms', authenticate, messagesView, externalChatController.listChatRooms);
router.get('/directory', authenticate, messagesView, externalChatController.getChatDirectory);
router.post('/room', authenticate, messagesCreate, externalChatController.createChatRoom);
router.get('/room/:bookingId', authenticate, messagesView, externalChatController.getChatRoom);
router.post('/room/:roomId/participants', authenticate, messagesEdit, externalChatController.addChatParticipants);
router.delete('/room/:roomId/participants/:userId', authenticate, messagesEdit, externalChatController.removeChatParticipant);
router.patch('/room/:roomId/mark-read', authenticate, messagesView, externalChatController.markChatRoomRead);
router.post('/messages/:roomId', authenticate, messagesCreate, externalChatController.sendChatMessage);
router.get('/messages/:roomId', authenticate, messagesView, externalChatController.getChatMessages);
router.post('/messages/:messageId/edit', authenticate, messagesEdit, externalChatController.editChatMessage);
router.post('/messages/:messageId/delete', authenticate, messagesEdit, externalChatController.deleteChatMessage);
router.post('/messages/:messageId/reaction', authenticate, messagesCreate, externalChatController.reactToChatMessage);
router.get('/participants/:roomId', authenticate, messagesView, externalChatController.getChatParticipants);

module.exports = router;
