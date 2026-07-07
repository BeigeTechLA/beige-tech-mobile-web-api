const router = require('express').Router();
const externalMeetingsController = require('../controllers/external-meetings.controller');
const { authenticate } = require('../middleware/auth');
const { requireAnyPermission } = require('../middleware/permission.middleware');

const meetingsView = requireAnyPermission([
  'admin_meetings.view',
  'sales_rep_meetings.view',
  'sales_admin_meetings.view',
  'creative_partner_meetings.view',
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
  'production_manager_meetings.edit',
  'client_meetings.edit'
], { allowRoles: ['production_manager', 'creative', 'client'] });
const meetingsDelete = requireAnyPermission([
  'admin_meetings.delete',
  'client_meetings.delete'
], { allowRoles: ['client'] });
const shootMeetingsView = requireAnyPermission([
  'admin_shoots.view',
  'admin_meetings.view',
  'sales_rep_shoots.view',
  'sales_rep_meetings.view',
  'sales_admin_shoots.view',
  'sales_admin_meetings.view',
  'creative_partner_request_shoots.view',
  'client_shoots.view',
  'client_meetings.view',
], { allowRoles: ['sales_rep', 'sales_admin', 'creative', 'client'] });
const shootMeetingsCreate = requireAnyPermission([
  'admin_shoots.edit',
  'admin_meetings.create',
  'client_shoots.create',
  'client_meetings.create'
], { allowRoles: ['client'] });
const shootMeetingsEdit = requireAnyPermission([
  'admin_shoots.edit',
  'admin_meetings.edit',
  'client_shoots.edit',
  'client_meetings.edit'
], { allowRoles: ['client'] });

router.get('/', authenticate, meetingsView, externalMeetingsController.getAllMeetings);
router.get('/order/:orderId', authenticate, shootMeetingsView, externalMeetingsController.getMeetingsByOrder);
router.get('/user/:userId', authenticate, meetingsView, externalMeetingsController.getMeetingsByUser);
router.post('/create-event', authenticate, meetingsCreate, externalMeetingsController.createMeetEvent);
router.post('/update-event', authenticate, meetingsEdit, externalMeetingsController.updateMeetEvent);
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
