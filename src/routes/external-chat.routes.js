const router = require('express').Router();
const externalChatController = require('../controllers/external-chat.controller');
const { authenticate } = require('../middleware/auth');

router.get('/rooms', authenticate, externalChatController.listChatRooms);
router.get('/directory', authenticate, externalChatController.getChatDirectory);
router.post('/room', authenticate, externalChatController.createChatRoom);
router.get('/room/:bookingId', authenticate, externalChatController.getChatRoom);
router.post('/room/:roomId/participants', authenticate, externalChatController.addChatParticipants);
router.delete('/room/:roomId/participants/:userId', authenticate, externalChatController.removeChatParticipant);
router.post('/messages/:roomId', authenticate, externalChatController.sendChatMessage);
router.get('/messages/:roomId', authenticate, externalChatController.getChatMessages);
router.post('/messages/:messageId/edit', authenticate, externalChatController.editChatMessage);
router.post('/messages/:messageId/delete', authenticate, externalChatController.deleteChatMessage);
router.post('/messages/:messageId/reaction', authenticate, externalChatController.reactToChatMessage);
router.get('/participants/:roomId', authenticate, externalChatController.getChatParticipants);

module.exports = router;
