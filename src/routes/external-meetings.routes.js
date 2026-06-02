const router = require('express').Router();
const externalMeetingsController = require('../controllers/external-meetings.controller');
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireAnyPermission } = require('../middleware/permission.middleware');

const meetingsView = requirePermission('meetings', 'view', { allowBaseRoles: true });
const meetingsCreate = requirePermission('meetings', 'create', { allowBaseRoles: true });
const meetingsEdit = requirePermission('meetings', 'edit', { allowBaseRoles: true });
const meetingsDelete = requirePermission('meetings', 'delete', { allowBaseRoles: true });
const shootMeetingsView = requireAnyPermission(['shoots.view', 'meetings.view'], { allowBaseRoles: true });
const shootMeetingsCreate = requireAnyPermission(['shoots.edit', 'meetings.create'], { allowBaseRoles: true });
const shootMeetingsEdit = requireAnyPermission(['shoots.edit', 'meetings.edit'], { allowBaseRoles: true });

router.get('/', authenticate, meetingsView, externalMeetingsController.getAllMeetings);
router.get('/order/:orderId', authenticate, shootMeetingsView, externalMeetingsController.getMeetingsByOrder);
router.get('/user/:userId', authenticate, meetingsView, externalMeetingsController.getMeetingsByUser);
router.post('/create-event', authenticate, meetingsCreate, externalMeetingsController.createMeetEvent);
router.post('/schedule/:meetingId', authenticate, meetingsEdit, externalMeetingsController.placeChangeRequest);
router.patch('/schedule/:meetingId/:status', authenticate, meetingsEdit, externalMeetingsController.updateChangeRequestStatus);
router.post('/', authenticate, shootMeetingsCreate, externalMeetingsController.createMeeting);
router.get('/:meetingId', authenticate, meetingsView, externalMeetingsController.getMeetingById);
router.patch('/:meetingId', authenticate, meetingsEdit, externalMeetingsController.updateMeeting);
router.delete('/:meetingId', authenticate, meetingsDelete, externalMeetingsController.deleteMeeting);
router.post('/:meetingId/participants', authenticate, shootMeetingsEdit, externalMeetingsController.addParticipants);
router.delete('/:meetingId/participants/:userId', authenticate, meetingsEdit, externalMeetingsController.removeParticipant);
router.patch('/:meetingId/respond', authenticate, meetingsEdit, externalMeetingsController.respondToMeetingInvitation);

module.exports = router;
