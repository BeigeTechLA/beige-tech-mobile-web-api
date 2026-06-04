const router = require('express').Router();
const externalMeetingsController = require('../controllers/external-meetings.controller');
const { authenticate } = require('../middleware/auth');
const { requireAnyPermission } = require('../middleware/permission.middleware');

const meetingsView = requireAnyPermission([
  'admin_meetings.view',
  'sales_rep_meetings.view',
  'sales_admin_meetings.view',
  'crew_meetings.view',
  'client_meetings.view',
  'production_manager_meetings.view'
], { allowRoles: ['sales_rep', 'sales_admin', 'creative', 'client', 'production_manager'] });
const meetingsCreate = requireAnyPermission([
  'admin_meetings.create',
  'sales_admin_shoots.create',
  'client_shoots.create',
  'client_meetings.create'
], { allowRoles: ['sales_admin', 'client'] });
const meetingsEdit = requireAnyPermission([
  'admin_meetings.edit',
  'production_manager_meetings.edit'
], { allowRoles: ['production_manager'] });
const meetingsDelete = requireAnyPermission([
  'admin_meetings.delete'
]);
const shootMeetingsView = requireAnyPermission([
  'admin_shoots.view',
  'admin_meetings.view',
  'sales_rep_shoots.view',
  'sales_rep_meetings.view',
  'sales_admin_shoots.view',
  'sales_admin_meetings.view',
  'crew_request_shoots.view',
  'client_shoots.view'
], { allowRoles: ['sales_rep', 'sales_admin', 'creative', 'client'] });
const shootMeetingsCreate = requireAnyPermission([
  'admin_shoots.edit',
  'admin_meetings.create'
]);
const shootMeetingsEdit = requireAnyPermission([
  'admin_shoots.edit',
  'admin_meetings.edit'
]);

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
