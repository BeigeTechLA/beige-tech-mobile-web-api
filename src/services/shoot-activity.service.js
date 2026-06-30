const { Op, QueryTypes } = require('sequelize');
const db = require('../models');

const USER_ATTRIBUTES = ['id', 'name', 'email', 'role', 'user_type'];
const RAW_FILE_CATEGORIES = new Set(['RAW_FOOTAGE', 'RAW_AUDIO']);

const toPositiveInt = (value) => {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

const toPlain = (record) => {
  if (!record) return null;
  return typeof record.get === 'function' ? record.get({ plain: true }) : record;
};

const toIso = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const compactName = (...parts) => parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

const getInitials = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');
};

const formatAmount = (amount) => {
  const numeric = Number(amount || 0);
  if (!Number.isFinite(numeric)) return '0';
  return numeric % 1 === 0 ? String(numeric) : numeric.toFixed(2);
};

const normalizeRole = (value, fallback = null) => {
  const role = String(value || '').trim();
  if (!role) return fallback;
  if (role.toLowerCase() === 'creator' || role.toLowerCase() === 'creative') return 'Creator';
  if (role.toLowerCase().includes('post')) return 'Post Production';
  if (role.toLowerCase() === 'client') return 'Client';
  if (role.toLowerCase() === 'admin') return 'Admin';
  return role.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

const serializeActor = (actor, fallbackRole = null) => {
  const plain = toPlain(actor);
  if (!plain) {
    return {
      actorName: null,
      actorRole: fallbackRole,
      actorAvatar: null,
    };
  }

  return {
    actorName: plain.name || compactName(plain.first_name, plain.last_name) || plain.email || null,
    actorRole: normalizeRole(plain.role, fallbackRole),
    actorAvatar: plain.avatar || plain.profile_image || plain.profile_photo || null,
  };
};

const serializeActivity = ({
  id,
  type,
  message,
  actor = null,
  actorName = null,
  actorRole = null,
  actorAvatar = null,
  targetName = null,
  targetRole = null,
  amount = null,
  createdAt,
  metadata = null,
}) => ({
  id: String(id),
  type,
  message,
  actorName,
  actorRole,
  actorAvatar,
  targetName,
  targetRole,
  amount,
  createdAt: toIso(createdAt),
  metadata,
  ...(actor ? serializeActor(actor, actorRole) : {}),
});

const getClientInfo = async (booking) => {
  const plainBooking = toPlain(booking);
  const clientUser = plainBooking?.user || plainBooking?.cms_project?.client || null;
  let name = clientUser?.name || plainBooking?.client_name || null;

  if (!name && plainBooking?.guest_email) {
    name = plainBooking.guest_email;
  }

  if (!name && plainBooking?.user_id) {
    const client = await db.clients.findOne({
      where: { user_id: plainBooking.user_id },
      attributes: ['name', 'email'],
      raw: true,
    });
    name = client?.name || client?.email || null;
  }

  return {
    name: name || 'Client',
    initials: getInitials(name || 'Client'),
    avatar: clientUser?.avatar || clientUser?.profile_image || null,
  };
};

const getBookingContext = async (bookingId) => {
  const normalizedBookingId = toPositiveInt(bookingId);
  if (!normalizedBookingId) {
    const error = new Error('Invalid booking ID');
    error.status = 400;
    throw error;
  }

  const booking = await db.stream_project_booking.findOne({
    where: { stream_project_booking_id: normalizedBookingId, is_active: 1 },
    include: [
      { model: db.users, as: 'user', required: false, attributes: USER_ATTRIBUTES },
      {
        model: db.projects,
        as: 'cms_project',
        required: false,
        include: [{ model: db.users, as: 'client', required: false, attributes: USER_ATTRIBUTES }],
      },
    ],
  });

  if (!booking) {
    const error = new Error('Booking not found');
    error.status = 404;
    throw error;
  }

  return booking;
};

const getCreatorAssignedActivities = async (bookingId) => {
  const assignments = await db.assigned_crew.findAll({
    where: { project_id: bookingId, is_active: 1 },
    include: [{
      model: db.crew_members,
      as: 'crew_member',
      required: false,
      attributes: ['crew_member_id', 'user_id', 'first_name', 'last_name', 'email', 'primary_role'],
    }],
    order: [['assigned_date', 'ASC'], ['created_at', 'ASC'], ['id', 'ASC']],
  });

  return assignments.map((assignment) => {
    const plain = toPlain(assignment);
    const crew = plain.crew_member || {};
    const name = compactName(crew.first_name, crew.last_name) || crew.email || 'Creator';
    return serializeActivity({
      id: `creator_assigned_${plain.id}`,
      type: 'creator_assigned',
      message: `${name} (Creator) is assigned to the shoot`,
      actorName: name,
      actorRole: 'Creator',
      actorAvatar: null,
      createdAt: plain.assigned_date || plain.created_at,
      metadata: {
        assignmentId: plain.id,
        crewMemberId: plain.crew_member_id,
        userId: crew.user_id || null,
        status: plain.status || null,
      },
    });
  });
};

const getTimelineMovedActivities = async (projectId) => {
  if (!projectId) return [];

  const history = await db.project_state_history.findAll({
    where: { project_id: projectId },
    include: [{ model: db.users, as: 'transitioner', required: false, attributes: USER_ATTRIBUTES }],
    order: [['created_at', 'ASC'], ['history_id', 'ASC']],
  });

  return history
    .map(toPlain)
    .filter((row) => {
      const fromState = String(row.from_state || '').toUpperCase();
      const toState = String(row.to_state || '').toUpperCase();
      return (
        ['RAW_UPLOADED', 'RAW_TECH_QC_PENDING', 'RAW_TECH_QC_APPROVED'].includes(fromState) &&
        ['EDIT_APPROVAL_PENDING', 'EDIT_IN_PROGRESS', 'INTERNAL_EDIT_REVIEW_PENDING'].includes(toState)
      );
    })
    .map((row) => serializeActivity({
      id: `timeline_moved_${row.history_id}`,
      type: 'timeline_moved',
      message: 'Timeline moved from shoot day to post production',
      actor: row.transitioner,
      actorRole: normalizeRole(row.transitioned_by_role, null),
      createdAt: row.created_at,
      metadata: {
        historyId: row.history_id,
        fromState: row.from_state,
        toState: row.to_state,
        transitionType: row.transition_type || null,
      },
    }));
};

const getFileUploadActivities = async (projectId) => {
  if (!projectId) return [];

  const files = await db.project_files.findAll({
    where: {
      project_id: projectId,
      is_deleted: { [Op.ne]: 1 },
      upload_status: 'COMPLETED',
    },
    include: [{ model: db.users, as: 'uploader', required: false, attributes: USER_ATTRIBUTES }],
    order: [['created_at', 'ASC'], ['file_id', 'ASC']],
  });

  return files.map((file) => {
    const plain = toPlain(file);
    const uploader = serializeActor(plain.uploader, 'Creator');
    const actorName = uploader.actorName || 'Unknown';
    const actorRole = uploader.actorRole || 'Creator';
    const isRaw = RAW_FILE_CATEGORIES.has(String(plain.file_category || '').toUpperCase()) ||
      String(plain.file_path || '').toLowerCase().includes('raw');

    return serializeActivity({
      id: `${isRaw ? 'raw_files_uploaded' : 'files_uploaded'}_${plain.file_id}`,
      type: isRaw ? 'raw_files_uploaded' : 'files_uploaded',
      message: isRaw
        ? `Raw Files are uploaded by ${actorName} (${actorRole})`
        : `Files are uploaded by ${actorName} (${actorRole})`,
      actorName,
      actorRole,
      actorAvatar: uploader.actorAvatar,
      createdAt: plain.created_at || plain.updated_at,
      metadata: {
        fileId: plain.file_id,
        fileName: plain.file_name,
        fileCategory: plain.file_category,
        filePath: plain.file_path,
      },
    });
  });
};

const getManualPartialPayments = async (bookingId, clientName) => {
  const rows = await db.sequelize.query(
    `SELECT booking_manual_payment_id, amount, payment_type, created_at
     FROM booking_manual_payments
     WHERE booking_id = :bookingId AND payment_type = 'partial'
     ORDER BY created_at ASC, booking_manual_payment_id ASC`,
    {
      replacements: { bookingId },
      type: QueryTypes.SELECT,
    }
  ).catch(() => []);

  return rows.map((row) => serializeActivity({
    id: `partial_payment_manual_${row.booking_manual_payment_id}`,
    type: 'partial_payment',
    message: `Partial payment of $${formatAmount(row.amount)} is made by ${clientName}`,
    actorName: clientName,
    actorRole: 'Client',
    amount: Number(row.amount || 0),
    createdAt: row.created_at,
    metadata: {
      paymentMethod: 'manual',
      manualPaymentId: row.booking_manual_payment_id,
      paymentType: row.payment_type,
    },
  }));
};

const getLeadPartialPaymentActivities = async (bookingId, clientName) => {
  const [salesLeads, clientLeads] = await Promise.all([
    db.sales_leads.findAll({
      where: { booking_id: bookingId },
      attributes: ['lead_id'],
      raw: true,
    }),
    db.client_leads.findAll({
      where: { booking_id: bookingId },
      attributes: ['lead_id'],
      raw: true,
    }),
  ]);

  const salesLeadIds = salesLeads.map((lead) => Number(lead.lead_id)).filter(Number.isFinite);
  const clientLeadIds = clientLeads.map((lead) => Number(lead.lead_id)).filter(Number.isFinite);

  const [salesActivities, clientActivities] = await Promise.all([
    salesLeadIds.length
      ? db.sales_lead_activities.findAll({
          where: { lead_id: { [Op.in]: salesLeadIds }, activity_type: 'payment_completed' },
          order: [['created_at', 'ASC'], ['activity_id', 'ASC']],
          raw: true,
        })
      : [],
    clientLeadIds.length
      ? db.client_lead_activities.findAll({
          where: { lead_id: { [Op.in]: clientLeadIds }, activity_type: 'payment_completed', is_active: 1 },
          order: [['created_at', 'ASC'], ['activity_id', 'ASC']],
          raw: true,
        })
      : [],
  ]);

  return [
    ...salesActivities.map((activity) => ({ ...activity, source: 'sales_lead_activities' })),
    ...clientActivities.map((activity) => ({ ...activity, source: 'client_lead_activities' })),
  ]
    .filter((activity) => {
      const data = activity.activity_data || {};
      return String(data.payment_type || '').toLowerCase() === 'partial';
    })
    .map((activity) => {
      const data = activity.activity_data || {};
      const amount = Number(data.amount || data.paid_amount_after || 0);
      return serializeActivity({
        id: `partial_payment_${activity.source}_${activity.activity_id}`,
        type: 'partial_payment',
        message: `Partial payment of $${formatAmount(amount)} is made by ${clientName}`,
        actorName: clientName,
        actorRole: 'Client',
        amount,
        createdAt: activity.created_at,
        metadata: {
          paymentMethod: data.payment_method || 'manual',
          paymentType: data.payment_type,
          source: activity.source,
          leadId: activity.lead_id,
          activityId: activity.activity_id,
        },
      });
    });
};

const getPostProductionMemberActivities = async (bookingId) => {
  const include = [{
    model: db.post_production_members,
    as: 'post_production_member',
    required: false,
    attributes: ['post_production_member_id', 'first_name', 'last_name', 'email'],
  }];

  if (db.assigned_post_production_member.rawAttributes.added_by_user_id) {
    include.push({ model: db.users, as: 'added_by', required: false, attributes: USER_ATTRIBUTES });
  }

  const assignments = await db.assigned_post_production_member.findAll({
    where: { project_id: bookingId, is_active: 1 },
    include,
    order: [['assigned_date', 'ASC'], ['created_at', 'ASC'], ['id', 'ASC']],
  });

  return assignments.map((assignment) => {
    const plain = toPlain(assignment);
    const target = plain.post_production_member || {};
    const targetName = compactName(target.first_name, target.last_name) || target.email || 'Post production member';
    const actor = serializeActor(plain.added_by, 'Admin');
    const actorName = actor.actorName || 'Admin';

    return serializeActivity({
      id: `post_production_member_added_${plain.id}`,
      type: 'post_production_member_added',
      message: `${actorName} added ${targetName} to post production team`,
      actorName,
      actorRole: actor.actorRole || 'Admin',
      actorAvatar: actor.actorAvatar,
      targetName,
      targetRole: 'Post Production',
      createdAt: plain.assigned_date || plain.created_at,
      metadata: {
        assignmentId: plain.id,
        postProductionMemberId: plain.post_production_member_id,
        addedByUserId: plain.added_by_user_id || null,
        historicalActorTracked: Boolean(plain.added_by_user_id),
      },
    });
  });
};

const getMeetingActivities = async (bookingId) => {
  const meetings = await db.project_meetings.findAll({
    where: { booking_id: bookingId, meeting_type: 'post_production' },
    include: [{ model: db.users, as: 'creator', required: false, attributes: USER_ATTRIBUTES }],
    order: [['created_at', 'ASC'], ['meeting_id', 'ASC']],
  });

  return meetings.map((meeting) => {
    const plain = toPlain(meeting);
    const actor = serializeActor(plain.creator, 'Post Production');
    return serializeActivity({
      id: `meeting_created_${plain.meeting_id}`,
      type: 'meeting_created',
      message: 'New Meeting Created by post production team',
      actorName: actor.actorName,
      actorRole: actor.actorRole || 'Post Production',
      actorAvatar: actor.actorAvatar,
      createdAt: plain.created_at,
      metadata: {
        meetingId: plain.meeting_id,
        meetingTitle: plain.meeting_title,
        meetingStatus: plain.meeting_status,
        meetingDateTime: toIso(plain.meeting_date_time),
      },
    });
  });
};

async function getShootActivityTimeline(bookingId) {
  const booking = await getBookingContext(bookingId);
  const plainBooking = toPlain(booking);
  const client = await getClientInfo(plainBooking);
  const projectId = plainBooking.cms_project?.project_id || null;
  const createdAt = plainBooking.created_at || plainBooking.cms_project?.created_at || null;

  const activityGroups = await Promise.all([
    getCreatorAssignedActivities(plainBooking.stream_project_booking_id),
    getTimelineMovedActivities(projectId),
    getFileUploadActivities(projectId),
    getManualPartialPayments(plainBooking.stream_project_booking_id, client.name),
    getLeadPartialPaymentActivities(plainBooking.stream_project_booking_id, client.name),
    getPostProductionMemberActivities(plainBooking.stream_project_booking_id),
    getMeetingActivities(plainBooking.stream_project_booking_id),
  ]);

  const activities = activityGroups
    .flat()
    .filter((activity) => activity.createdAt)
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());

  return {
    client,
    createdActivity: {
      message: `${client.name} Has Created a Shoot - Client`,
      createdAt: toIso(createdAt),
    },
    activities,
    trackingNotes: {
      timelineMoved: projectId ? 'Read from project_state_history; new state changes should continue logging there.' : 'No CMS project exists yet, so timeline history is unavailable.',
      postProductionMemberAdded: db.assigned_post_production_member.rawAttributes.added_by_user_id
        ? 'added_by_user_id is tracked going forward; older assignments may use Admin fallback.'
        : 'added_by_user_id is not present in the database yet; assignments use Admin fallback until migration is applied.',
    },
  };
}

module.exports = {
  getShootActivityTimeline,
};
