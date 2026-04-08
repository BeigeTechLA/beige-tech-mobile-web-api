const router = require('express').Router();
const externalMeetingsController = require('../controllers/external-meetings.controller');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, externalMeetingsController.getAllMeetings);
router.get('/order/:orderId', authenticate, externalMeetingsController.getMeetingsByOrder);
router.get('/user/:userId', authenticate, externalMeetingsController.getMeetingsByUser);
router.post('/create-event', authenticate, externalMeetingsController.createMeetEvent);
router.post('/schedule/:meetingId', authenticate, externalMeetingsController.placeChangeRequest);
router.patch('/schedule/:meetingId/:status', authenticate, externalMeetingsController.updateChangeRequestStatus);
router.post('/', authenticate, externalMeetingsController.createMeeting);
router.get('/:meetingId', authenticate, externalMeetingsController.getMeetingById);
router.patch('/:meetingId', authenticate, externalMeetingsController.updateMeeting);
router.delete('/:meetingId', authenticate, externalMeetingsController.deleteMeeting);
router.post('/:meetingId/participants', authenticate, externalMeetingsController.addParticipants);
router.delete('/:meetingId/participants/:userId', authenticate, externalMeetingsController.removeParticipant);
router.patch('/:meetingId/respond', authenticate, externalMeetingsController.respondToMeetingInvitation);

module.exports = router;
