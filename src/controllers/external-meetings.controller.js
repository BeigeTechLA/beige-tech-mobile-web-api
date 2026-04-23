const { Op } = require('sequelize');
const db = require('../models');
const emailService = require('../utils/emailService');

const DEFAULT_BASE_URL = process.env.EXTERNAL_MEETINGS_API_BASE_URL || process.env.MEETINGS_API_BASE_URL || 'http://localhost:5002/v1';
const INTERNAL_KEY = process.env.EXTERNAL_MEETINGS_KEY || process.env.EXTERNAL_FILE_MANAGER_KEY || 'beige-internal-dev-key';

const VALID_SORT_FIELDS = new Set(['meeting_date_time', 'meeting_end_time', 'created_at', 'updated_at', 'meeting_title', 'meeting_status']);
const VALID_SORT_DIRECTIONS = new Set(['asc', 'desc']);
const VALID_STATUSES = new Set(['pending', 'confirmed', 'in_progress', 'change_request', 'completed', 'cancelled', 'rescheduled']);
const VALID_TYPES = new Set(['pre_production', 'post_production']);
const USER_TYPE_ROLE_MAP = {
  1: 'admin',
  2: 'creator',
  3: 'client',
  4: 'creative',
  5: 'sales_rep',
  6: 'production_manager',
  7: 'sales_admin',
};

let meetingsTableReadyPromise = null;

const buildHeaders = (req) => {
  const headers = {
    'Content-Type': 'application/json',
    'x-internal-key': INTERNAL_KEY,
  };

  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader) {
    headers.Authorization = authHeader;
  }

  return headers;
};

const proxyRequest = async (req, path, options = {}) => {
  const response = await fetch(`${DEFAULT_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...buildHeaders(req),
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({
    success: false,
    message: 'Invalid JSON response from meetings service',
  }));

  if (!response.ok) {
    const error = new Error(payload.message || 'External meetings request failed');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};

const safeJsonParse = (value, fallback) => {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

const toPositiveInt = (value) => {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

const normalizeRole = (value) => String(value || '').trim().toLowerCase();

const isAdminLikeRole = (role) =>
  ['admin', 'administrator', 'production_manager', 'pm', 'sales_admin'].includes(normalizeRole(role));

const getRequestUserId = (req) => req.user?.userId || null;
const getRequestUserRole = (req) => normalizeRole(req.user?.userRole || '');
const getParticipantKey = (participant) =>
  String(participant?.id || participant?.email || participant?.name || '').trim();
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const collectMeetingEmails = (state = {}, booking = null) => {
  const emails = new Set();
  const push = (value) => {
    const normalized = normalizeEmail(value);
    if (normalized) emails.add(normalized);
  };

  push(state?.client?.email);
  push(state?.admin?.email);
  (state?.cps || []).forEach((cp) => push(cp?.email));
  (state?.participants || []).forEach((participant) => push(participant?.email));
  push(booking?.guest_email);
  push(booking?.user?.email);

  return [...emails];
};
const matchesParticipantByIdentity = (participant, identities = new Set()) => {
  const participantId = String(participant?.id || '').trim();
  const participantEmail = normalizeEmail(participant?.email || '');
  if (participantId && identities.has(participantId)) return true;
  if (participantEmail && identities.has(`email:${participantEmail}`)) return true;
  return false;
};
const getResponseIdentityKeys = (entry) => {
  const keys = new Set();
  if (!entry || typeof entry !== 'object') return keys;

  const userId = String(entry.user_id || '').trim();
  const userEmail = normalizeEmail(entry.user_email || '');
  const participantIds = Array.isArray(entry.participant_ids) ? entry.participant_ids : [];

  if (userId) keys.add(userId);
  if (userEmail) keys.add(`email:${userEmail}`);
  participantIds
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .forEach((value) => keys.add(value));

  return keys;
};

const getMeetingState = (storedParticipants, booking) => {
  const fallbackParticipants = buildDefaultParticipants(booking);
  const normalizedStored = storedParticipants && typeof storedParticipants === 'object' ? storedParticipants : {};

  return {
    client: normalizedStored.client || fallbackParticipants.client || null,
    admin: normalizedStored.admin || fallbackParticipants.admin || null,
    cps: Array.isArray(normalizedStored.cps) && normalizedStored.cps.length ? normalizedStored.cps : fallbackParticipants.cps,
    participants: Array.isArray(normalizedStored.participants) && normalizedStored.participants.length
      ? normalizedStored.participants
      : fallbackParticipants.participants,
    participant_responses: Array.isArray(normalizedStored.participant_responses)
      ? normalizedStored.participant_responses
      : [],
    change_request: normalizedStored.change_request && typeof normalizedStored.change_request === 'object'
      ? normalizedStored.change_request
      : null,
  };
};

const serializeMeetingState = (state) => JSON.stringify({
  client: state.client || null,
  admin: state.admin || null,
  cps: Array.isArray(state.cps) ? state.cps : [],
  participants: Array.isArray(state.participants) ? state.participants : [],
  participant_responses: Array.isArray(state.participant_responses) ? state.participant_responses : [],
  change_request: state.change_request || null,
});

const isUserIncludedInMeetingState = (state, identities = new Set()) => {
  if (!state || !identities.size) return false;

  return [
    state.client,
    state.admin,
    ...(state.cps || []),
    ...(state.participants || []),
  ].some((participant) => matchesParticipantByIdentity(participant, identities));
};

const parsePagination = (req) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  return { page, limit, offset: (page - 1) * limit };
};

const parseSort = (sortBy) => {
  const [rawField, rawDirection] = String(sortBy || 'meeting_date_time:desc').split(':');
  const field = VALID_SORT_FIELDS.has(rawField) ? rawField : 'meeting_date_time';
  const direction = VALID_SORT_DIRECTIONS.has(String(rawDirection || '').toLowerCase()) ? String(rawDirection).toUpperCase() : 'DESC';
  return [[field, direction]];
};

const ensureMeetingsTable = async () => {
  if (!meetingsTableReadyPromise) {
    meetingsTableReadyPromise = db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS project_meetings (
        meeting_id INT NOT NULL AUTO_INCREMENT,
        booking_id INT NOT NULL,
        project_id INT NULL,
        created_by_user_id INT NULL,
        meeting_title VARCHAR(255) NULL,
        meeting_type ENUM('pre_production','post_production') NOT NULL DEFAULT 'post_production',
        meeting_status ENUM('pending','confirmed','in_progress','change_request','completed','cancelled','rescheduled') NOT NULL DEFAULT 'pending',
        meeting_platform VARCHAR(50) NULL,
        meeting_date_time DATETIME NOT NULL,
        meeting_end_time DATETIME NULL,
        description LONGTEXT NULL,
        meet_link VARCHAR(1000) NULL,
        participants_json LONGTEXT NULL,
        send_notification TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (meeting_id),
        KEY idx_project_meetings_booking (booking_id),
        KEY idx_project_meetings_project (project_id),
        KEY idx_project_meetings_created_by (created_by_user_id),
        KEY idx_project_meetings_status (meeting_status),
        KEY idx_project_meetings_datetime (meeting_date_time)
      )
    `);
  }

  await meetingsTableReadyPromise;
};

const getBookingContext = async (bookingId) => {
  const normalizedBookingId = toPositiveInt(bookingId);
  if (!normalizedBookingId) {
    const error = new Error('Invalid booking ID');
    error.status = 400;
    throw error;
  }

  const booking = await db.stream_project_booking.findOne({
    where: {
      stream_project_booking_id: normalizedBookingId,
      is_active: 1,
    },
    include: [
      {
        model: db.users,
        as: 'user',
        required: false,
        attributes: ['id', 'name', 'email', 'user_type'],
        include: [
          {
            model: db.user_type,
            as: 'userType',
            required: false,
            attributes: ['user_type_id', 'user_role'],
          },
        ],
      },
      {
        model: db.sales_leads,
        as: 'sales_leads',
        required: false,
        include: [
          {
            model: db.users,
            as: 'assigned_sales_rep',
            required: false,
            attributes: ['id', 'name', 'email', 'user_type'],
            include: [
              {
                model: db.user_type,
                as: 'userType',
                required: false,
                attributes: ['user_type_id', 'user_role'],
              },
            ],
          },
        ],
      },
      {
        model: db.assigned_crew,
        as: 'assigned_crews',
        required: false,
        where: {
          crew_accept: 1,
          is_active: 1,
        },
        include: [
          {
            model: db.crew_members,
            as: 'crew_member',
            required: false,
            attributes: ['crew_member_id', 'first_name', 'last_name', 'email'],
          },
        ],
      },
      {
        model: db.assigned_post_production_member,
        as: 'assigned_post_production_members',
        required: false,
        where: {
          is_active: 1,
        },
        include: [
          {
            model: db.post_production_members,
            as: 'post_production_member',
            required: false,
            attributes: ['post_production_member_id', 'first_name', 'last_name', 'email'],
          },
        ],
      },
      {
        model: db.projects,
        as: 'cms_project',
        required: false,
        include: [
          { model: db.users, as: 'client', required: false, attributes: ['id', 'name', 'email', 'user_type'] },
          { model: db.users, as: 'creator', required: false, attributes: ['id', 'name', 'email', 'user_type'] },
          { model: db.users, as: 'editor', required: false, attributes: ['id', 'name', 'email', 'user_type'] },
          { model: db.users, as: 'qc_reviewer', required: false, attributes: ['id', 'name', 'email', 'user_type'] },
        ],
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

const serializeUser = (user, fallbackRole) => {
  if (!user) return null;

  const plain = typeof user.get === 'function' ? user.get({ plain: true }) : user;
  const id = plain.id || plain.user_id || plain.post_production_member_id || plain.crew_member_id || null;
  const name = plain.name || [plain.first_name, plain.last_name].filter(Boolean).join(' ').trim() || plain.email || null;
  const userTypeId = toPositiveInt(plain.user_type);
  const userTypeRole = normalizeRole(plain?.userType?.user_role || plain?.user_role || '');
  const explicitRole = normalizeRole(plain.role || '');
  const resolvedRole = userTypeRole || USER_TYPE_ROLE_MAP[userTypeId] || explicitRole || fallbackRole || null;

  if (!id && !name && !plain.email) return null;

  return {
    id,
    name,
    email: plain.email || null,
    role: resolvedRole,
  };
};

const buildDefaultParticipants = (booking) => {
  const plainBooking = typeof booking.get === 'function' ? booking.get({ plain: true }) : booking;
  const salesLead = (plainBooking.sales_leads || []).find((lead) => lead?.assigned_sales_rep) || null;
  const client = serializeUser(plainBooking.cms_project?.client || plainBooking.user, 'client');
  const admin = serializeUser(salesLead?.assigned_sales_rep, 'sales_rep');

  const cps = (plainBooking.assigned_crews || [])
    .map((assignment) => serializeUser(assignment.crew_member, 'cp'))
    .filter(Boolean);

  const pmMembers = [
    serializeUser(plainBooking.cms_project?.creator, 'pm'),
    serializeUser(plainBooking.cms_project?.editor, 'pm'),
    serializeUser(plainBooking.cms_project?.qc_reviewer, 'pm'),
    ...(plainBooking.assigned_post_production_members || []).map((assignment) =>
      serializeUser(assignment.post_production_member, 'pm')
    ),
  ].filter(Boolean);

  const uniqueByKey = new Map();
  [...cps, ...pmMembers].forEach((participant) => {
    const key = String(participant.id || participant.email || participant.name || '');
    if (key && !uniqueByKey.has(key)) {
      uniqueByKey.set(key, participant);
    }
  });

  return {
    client,
    admin,
    cps,
    participants: Array.from(uniqueByKey.values()),
  };
};

const formatMeeting = (meeting, booking, storedParticipants) => {
  const plainMeeting = typeof meeting.get === 'function' ? meeting.get({ plain: true }) : meeting;
  const plainBooking = typeof booking.get === 'function' ? booking.get({ plain: true }) : booking;
  const participantData = getMeetingState(storedParticipants, booking);
  const createdBy = serializeUser(plainMeeting.creator, 'admin');

  return {
    id: plainMeeting.meeting_id,
    meeting_status: plainMeeting.meeting_status,
    meeting_date_time: plainMeeting.meeting_date_time,
    meeting_end_time: plainMeeting.meeting_end_time,
    meeting_type: plainMeeting.meeting_type,
    meeting_title: plainMeeting.meeting_title,
    description: plainMeeting.description,
    meetLink: plainMeeting.meet_link,
    duration: plainMeeting.meeting_end_time && plainMeeting.meeting_date_time
      ? Math.max(
          0,
          Math.round(
            (new Date(plainMeeting.meeting_end_time).getTime() - new Date(plainMeeting.meeting_date_time).getTime()) / 60000
          )
        )
      : null,
    order: {
      id: plainMeeting.booking_id,
      name: plainBooking.project_name || `Project #${plainMeeting.booking_id}`,
    },
    client: participantData.client,
    admin: participantData.admin,
    cps: participantData.cps,
    participants: participantData.participants,
    created_by: createdBy,
    participant_responses: participantData.participant_responses,
    change_request: participantData.change_request,
  };
};

const getMeetingByIdInternal = async (meetingId) => {
  await ensureMeetingsTable();
  const normalizedMeetingId = toPositiveInt(meetingId);
  if (!normalizedMeetingId) {
    const error = new Error('Invalid meeting ID');
    error.status = 400;
    throw error;
  }

  const meeting = await db.project_meetings.findByPk(normalizedMeetingId, {
    include: [
      {
        model: db.users,
        as: 'creator',
        required: false,
        attributes: ['id', 'name', 'email', 'user_type'],
        include: [
          {
            model: db.user_type,
            as: 'userType',
            required: false,
            attributes: ['user_type_id', 'user_role'],
          },
        ],
      },
    ],
  });

  if (!meeting) {
    const error = new Error('Meeting not found');
    error.status = 404;
    throw error;
  }

  const booking = await getBookingContext(meeting.booking_id);
  const storedParticipants = safeJsonParse(meeting.participants_json, null);

  return {
    meeting,
    booking,
    state: getMeetingState(storedParticipants, booking),
    formatted: formatMeeting(meeting, booking, storedParticipants),
  };
};

const getUserRecordById = async (userId) => {
  const normalizedUserId = toPositiveInt(userId);
  if (!normalizedUserId) return null;

  return db.users.findOne({
    where: {
      id: normalizedUserId,
      is_active: 1,
    },
    attributes: ['id', 'name', 'email'],
    raw: true,
  });
};

const getCrewRecordById = async (crewMemberId) => {
  const normalizedCrewId = toPositiveInt(crewMemberId);
  if (!normalizedCrewId) return null;

  return db.crew_members.findOne({
    where: {
      crew_member_id: normalizedCrewId,
      is_active: 1,
    },
    attributes: ['crew_member_id', 'first_name', 'last_name', 'email'],
    raw: true,
  });
};

const getCrewRecordIdsByEmail = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return [];

  const records = await db.crew_members.findAll({
    where: {
      email: normalizedEmail,
      is_active: 1,
    },
    attributes: ['crew_member_id'],
    raw: true,
  });

  return (records || [])
    .map((entry) => toPositiveInt(entry.crew_member_id))
    .filter(Boolean);
};

const buildManagerParticipants = async (userIds) => {
  const records = await Promise.all((userIds || []).map((userId) => getUserRecordById(userId)));
  return records
    .filter(Boolean)
    .map((user) => ({
      id: user.id,
      name: user.name || user.email || `User ${user.id}`,
      email: user.email || null,
      role: 'participant',
    }));
};

const buildCpParticipants = async (userIds) => {
  const records = await Promise.all((userIds || []).map((userId) => getCrewRecordById(userId)));
  return records
    .filter(Boolean)
    .map((crewMember) => ({
      id: crewMember.crew_member_id,
      name: [crewMember.first_name, crewMember.last_name].filter(Boolean).join(' ').trim() || crewMember.email || `CP ${crewMember.crew_member_id}`,
      email: crewMember.email || null,
      role: 'cp',
    }));
};

const mergeParticipantsByKey = (existingParticipants, nextParticipants) => {
  const merged = new Map();

  [...(existingParticipants || []), ...(nextParticipants || [])].forEach((participant) => {
    const key = getParticipantKey(participant);
    if (key) {
      merged.set(key, participant);
    }
  });

  return Array.from(merged.values());
};

const loadBookingsByIds = async (bookingIds) => {
  const normalizedIds = [...new Set((bookingIds || []).map(toPositiveInt).filter(Boolean))];
  if (!normalizedIds.length) return new Map();

  const bookings = await db.stream_project_booking.findAll({
    where: {
      stream_project_booking_id: normalizedIds,
      is_active: 1,
    },
    include: [
      {
        model: db.users,
        as: 'user',
        required: false,
        attributes: ['id', 'name', 'email'],
      },
      {
        model: db.sales_leads,
        as: 'sales_leads',
        required: false,
        include: [
          {
            model: db.users,
            as: 'assigned_sales_rep',
            required: false,
            attributes: ['id', 'name', 'email'],
          },
        ],
      },
      {
        model: db.assigned_crew,
        as: 'assigned_crews',
        required: false,
        where: {
          crew_accept: 1,
          is_active: 1,
        },
        include: [
          {
            model: db.crew_members,
            as: 'crew_member',
            required: false,
            attributes: ['crew_member_id', 'first_name', 'last_name', 'email'],
          },
        ],
      },
      {
        model: db.assigned_post_production_member,
        as: 'assigned_post_production_members',
        required: false,
        where: {
          is_active: 1,
        },
        include: [
          {
            model: db.post_production_members,
            as: 'post_production_member',
            required: false,
            attributes: ['post_production_member_id', 'first_name', 'last_name', 'email'],
          },
        ],
      },
      {
        model: db.projects,
        as: 'cms_project',
        required: false,
        include: [
          { model: db.users, as: 'client', required: false, attributes: ['id', 'name', 'email'] },
          { model: db.users, as: 'creator', required: false, attributes: ['id', 'name', 'email'] },
          { model: db.users, as: 'editor', required: false, attributes: ['id', 'name', 'email'] },
          { model: db.users, as: 'qc_reviewer', required: false, attributes: ['id', 'name', 'email'] },
        ],
      },
    ],
  });

  return new Map(bookings.map((booking) => [Number(booking.stream_project_booking_id), booking]));
};

const getAccessibleBookingIdsForUser = async (userId) => {
  const normalizedUserId = toPositiveInt(userId);
  if (!normalizedUserId) return [];

  const [bookings, projects, salesLeads] = await Promise.all([
    db.stream_project_booking.findAll({
      where: {
        user_id: normalizedUserId,
        is_active: 1,
      },
      attributes: ['stream_project_booking_id'],
      raw: true,
    }),
    db.projects.findAll({
      where: {
        [Op.or]: [
          { client_user_id: normalizedUserId },
          { assigned_creator_id: normalizedUserId },
          { assigned_editor_id: normalizedUserId },
          { assigned_qc_id: normalizedUserId },
        ],
      },
      attributes: ['booking_id'],
      raw: true,
    }),
    db.sales_leads.findAll({
      where: {
        assigned_sales_rep_id: normalizedUserId,
      },
      attributes: ['booking_id'],
      raw: true,
    }),
  ]);

  return [...new Set([
    ...bookings.map((item) => toPositiveInt(item.stream_project_booking_id)),
    ...projects.map((item) => toPositiveInt(item.booking_id)),
    ...salesLeads.map((item) => toPositiveInt(item.booking_id)),
  ].filter(Boolean))];
};

const buildMeetingWhere = ({ bookingId, userId, req, status, meetingType, accessibleBookingIds }) => {
  const where = {};

  if (bookingId) {
    where.booking_id = bookingId;
  }

  if (status && VALID_STATUSES.has(String(status).toLowerCase())) {
    where.meeting_status = String(status).toLowerCase();
  }

  if (meetingType && VALID_TYPES.has(String(meetingType).toLowerCase())) {
    where.meeting_type = String(meetingType).toLowerCase();
  }

  if (!userId || isAdminLikeRole(getRequestUserRole(req))) return where;

  where[Op.or] = [{ created_by_user_id: userId }];

  if ((accessibleBookingIds || []).length) {
    where[Op.or].push({
      booking_id: {
        [Op.in]: accessibleBookingIds,
      },
    });
  }

  return where;
};

const fetchMeetings = async ({ req, bookingId = null, userId = null }) => {
  await ensureMeetingsTable();

  const { page, limit, offset } = parsePagination(req);
  const order = parseSort(req.query.sortBy);
  const isRestrictedUser = !!userId && !isAdminLikeRole(getRequestUserRole(req));
  const requestUser = isRestrictedUser ? await getUserRecordById(userId) : null;
  const requestCrewIds = isRestrictedUser
    ? await getCrewRecordIdsByEmail(requestUser?.email)
    : [];
  const identityKeys = new Set([
    String(userId || '').trim(),
    ...requestCrewIds.map((id) => String(id)),
    ...(requestUser?.email ? [`email:${normalizeEmail(requestUser.email)}`] : []),
  ].filter(Boolean));
  const accessibleBookingIds =
    isRestrictedUser
      ? await getAccessibleBookingIdsForUser(userId)
      : [];
  const where = buildMeetingWhere({
    bookingId,
    userId: isRestrictedUser ? null : userId,
    req,
    status: req.query.status,
    meetingType: req.query.meeting_type,
    accessibleBookingIds,
  });

  const queryOptions = {
    where,
    include: [
      {
        model: db.stream_project_booking,
        as: 'booking',
        required: true,
        attributes: ['stream_project_booking_id', 'project_name', 'user_id', 'guest_email'],
        include: [
          {
            model: db.sales_leads,
            as: 'sales_leads',
            required: false,
            attributes: ['lead_id', 'assigned_sales_rep_id'],
          },
        ],
      },
      {
        model: db.projects,
        as: 'project',
        required: false,
        attributes: ['project_id', 'client_user_id', 'assigned_creator_id', 'assigned_editor_id', 'assigned_qc_id'],
      },
      {
        model: db.users,
        as: 'creator',
        required: false,
        attributes: ['id', 'name', 'email', 'user_type'],
        include: [
          {
            model: db.user_type,
            as: 'userType',
            required: false,
            attributes: ['user_type_id', 'user_role'],
          },
        ],
      },
    ],
    order,
    distinct: true,
  };

  if (!isRestrictedUser) {
    queryOptions.limit = limit;
    queryOptions.offset = offset;
  }

  const { count, rows } = await db.project_meetings.findAndCountAll(queryOptions);

  const bookingMap = await loadBookingsByIds(rows.map((meeting) => meeting.booking_id));
  const filteredResults = rows
    .map((meeting) => {
      const booking = bookingMap.get(Number(meeting.booking_id));
      if (!booking) return null;
      const storedParticipants = safeJsonParse(meeting.participants_json, null);
      const state = getMeetingState(storedParticipants, booking);

      if (
        isRestrictedUser &&
        Number(meeting.created_by_user_id) !== Number(userId) &&
        !(accessibleBookingIds || []).includes(Number(meeting.booking_id)) &&
        !isUserIncludedInMeetingState(state, identityKeys)
      ) {
        return null;
      }

      return formatMeeting(meeting, booking, state);
    })
    .filter(Boolean);

  const results = isRestrictedUser
    ? filteredResults.slice(offset, offset + limit)
    : filteredResults;
  const totalResults = isRestrictedUser ? filteredResults.length : count;

  return {
    results,
    page,
    limit,
    totalPages: totalResults ? Math.ceil(totalResults / limit) : 0,
    totalResults,
  };
};

exports.getMeetingsByOrder = async (req, res) => {
  try {
    const bookingId = toPositiveInt(req.params.orderId);
    if (!bookingId) {
      return res.status(400).json({
        message: 'Invalid booking ID',
      });
    }

    await getBookingContext(bookingId);
    const result = await fetchMeetings({ req, bookingId });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      message: error.message || 'Failed to load meetings',
    });
  }
};

exports.getAllMeetings = async (req, res) => {
  try {
    const result = await fetchMeetings({ req });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      message: error.message || 'Failed to load meetings',
    });
  }
};

exports.getMeetingsByUser = async (req, res) => {
  try {
    const userId = toPositiveInt(req.params.userId);
    if (!userId) {
      return res.status(400).json({
        message: 'Invalid user ID',
      });
    }

    const result = await fetchMeetings({ req, userId });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      message: error.message || 'Failed to load meetings',
    });
  }
};

exports.getMeetingById = async (req, res) => {
  try {
    const result = await getMeetingByIdInternal(req.params.meetingId);
    return res.status(200).json(result.formatted);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      message: error.message || 'Failed to load meeting details',
    });
  }
};

exports.createMeeting = async (req, res) => {
  try {
    await ensureMeetingsTable();

    const bookingId = toPositiveInt(req.body.order_id || req.body.booking_id);
    const meetingDateTime = req.body.meeting_date_time ? new Date(req.body.meeting_date_time) : null;
    const meetingEndTime = req.body.meeting_end_time ? new Date(req.body.meeting_end_time) : null;
    const createdByUserId = toPositiveInt(req.body.created_by_id || req.body.created_by_user_id || getRequestUserId(req));
    const meetingStatus = String(req.body.meeting_status || 'pending').toLowerCase();
    const meetingType = String(req.body.meeting_type || 'post_production').toLowerCase();

    if (!bookingId) {
      return res.status(400).json({
        message: 'booking_id or order_id is required',
      });
    }

    if (!meetingDateTime || Number.isNaN(meetingDateTime.getTime())) {
      return res.status(400).json({
        message: 'Valid meeting_date_time is required',
      });
    }

    if (meetingEndTime && Number.isNaN(meetingEndTime.getTime())) {
      return res.status(400).json({
        message: 'meeting_end_time must be a valid date',
      });
    }

    if (meetingEndTime && meetingEndTime.getTime() <= meetingDateTime.getTime()) {
      return res.status(400).json({
        message: 'meeting_end_time must be after meeting_date_time',
      });
    }

    if (!VALID_STATUSES.has(meetingStatus)) {
      return res.status(400).json({
        message: 'Invalid meeting_status value',
      });
    }

    if (!VALID_TYPES.has(meetingType)) {
      return res.status(400).json({
        message: 'Invalid meeting_type value',
      });
    }

    const booking = await getBookingContext(bookingId);
    const plainBooking = booking.get({ plain: true });
    const participants = {
      ...buildDefaultParticipants(booking),
      participant_responses: [],
      change_request: null,
    };

    const createdMeeting = await db.project_meetings.create({
      booking_id: bookingId,
      project_id: plainBooking.cms_project?.project_id || null,
      created_by_user_id: createdByUserId || null,
      meeting_title: String(req.body.meeting_title || '').trim() || null,
      meeting_type: meetingType,
      meeting_status: meetingStatus,
      meeting_platform: String(req.body.meeting_platform || (req.body.meetLink ? 'custom' : 'google')).trim() || null,
      meeting_date_time: meetingDateTime,
      meeting_end_time: meetingEndTime || null,
      description: String(req.body.description || '').trim() || null,
      meet_link: String(req.body.meetLink || req.body.meet_link || '').trim() || null,
      participants_json: serializeMeetingState(participants),
      send_notification: req.body.send_notification === false ? 0 : 1,
    });

    const meetingWithCreator = await db.project_meetings.findByPk(createdMeeting.meeting_id, {
      include: [
        {
          model: db.users,
          as: 'creator',
          required: false,
          attributes: ['id', 'name', 'email', 'user_type'],
          include: [
            {
              model: db.user_type,
              as: 'userType',
              required: false,
              attributes: ['user_type_id', 'user_role'],
            },
          ],
        },
      ],
    });

    if (req.body.send_notification !== false) {
      const recipients = collectMeetingEmails(participants, plainBooking);
      if (recipients.length) {
        const creator = meetingWithCreator?.creator
          ? (typeof meetingWithCreator.creator.get === 'function'
            ? meetingWithCreator.creator.get({ plain: true })
            : meetingWithCreator.creator)
          : null;
        await emailService.sendMeetingScheduledTemplateEmail({
          recipients,
          data: {
            meeting_id: String(createdMeeting.meeting_id),
            order_id: String(bookingId),
            order_name: plainBooking?.project_name || `Project #${bookingId}`,
            meeting_title: String(req.body.meeting_title || '').trim() || `Meeting for project ${bookingId}`,
            meeting_type: meetingType,
            meeting_status: meetingStatus,
            meeting_date_time: meetingDateTime?.toISOString?.() || '',
            meeting_end_time: meetingEndTime?.toISOString?.() || '',
            meet_link: String(req.body.meetLink || req.body.meet_link || '').trim() || '',
            created_by_name: creator?.name || '',
            sent_at: new Date().toISOString(),
          },
        });
      }
    }

    return res.status(201).json(
      formatMeeting(meetingWithCreator || createdMeeting, booking, participants)
    );
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      message: error.message || 'Failed to create meeting',
    });
  }
};

exports.updateMeeting = async (req, res) => {
  try {
    const { meeting, booking, state } = await getMeetingByIdInternal(req.params.meetingId);
    const updates = {};

    if (req.body.meeting_title !== undefined) {
      updates.meeting_title = String(req.body.meeting_title || '').trim() || null;
    }

    if (req.body.description !== undefined) {
      updates.description = String(req.body.description || '').trim() || null;
    }

    if (req.body.meetLink !== undefined || req.body.meet_link !== undefined) {
      updates.meet_link = String(req.body.meetLink || req.body.meet_link || '').trim() || null;
    }

    if (req.body.meeting_status !== undefined) {
      const nextStatus = String(req.body.meeting_status || '').toLowerCase();
      if (!VALID_STATUSES.has(nextStatus)) {
        return res.status(400).json({ message: 'Invalid meeting_status value' });
      }
      updates.meeting_status = nextStatus;
    }

    if (req.body.meeting_type !== undefined) {
      const nextType = String(req.body.meeting_type || '').toLowerCase();
      if (!VALID_TYPES.has(nextType)) {
        return res.status(400).json({ message: 'Invalid meeting_type value' });
      }
      updates.meeting_type = nextType;
    }

    if (req.body.meeting_date_time !== undefined) {
      const nextStart = new Date(req.body.meeting_date_time);
      if (Number.isNaN(nextStart.getTime())) {
        return res.status(400).json({ message: 'Valid meeting_date_time is required' });
      }
      updates.meeting_date_time = nextStart;
    }

    if (req.body.meeting_end_time !== undefined) {
      const nextEnd = req.body.meeting_end_time ? new Date(req.body.meeting_end_time) : null;
      if (nextEnd && Number.isNaN(nextEnd.getTime())) {
        return res.status(400).json({ message: 'meeting_end_time must be a valid date' });
      }
      updates.meeting_end_time = nextEnd;
    }

    await meeting.update(updates);

    return res.status(200).json(formatMeeting(meeting, booking, state));
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      message: error.message || 'Failed to update meeting',
    });
  }
};

exports.deleteMeeting = async (req, res) => {
  try {
    const { meeting } = await getMeetingByIdInternal(req.params.meetingId);
    await meeting.destroy();
    return res.status(204).send();
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      message: error.message || 'Failed to delete meeting',
    });
  }
};

exports.placeChangeRequest = async (req, res) => {
  try {
    const { meeting, booking, state } = await getMeetingByIdInternal(req.params.meetingId);
    const requestedTime = req.body.requested_time || req.body.request_date_time || null;
    const nextState = {
      ...state,
      change_request: {
        requested_by: String(req.body.requested_by || getRequestUserRole(req) || 'participant'),
        request_type: 'schedule_change',
        request_status: 'pending',
        request_date_time: requestedTime,
      },
    };

    await meeting.update({
      meeting_status: 'change_request',
      participants_json: serializeMeetingState(nextState),
    });

    return res.status(200).json(formatMeeting(meeting, booking, nextState));
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      message: error.message || 'Failed to place change request',
    });
  }
};

exports.updateChangeRequestStatus = async (req, res) => {
  try {
    const { meeting, booking, state } = await getMeetingByIdInternal(req.params.meetingId);
    const nextStatus = String(req.params.status || '').toLowerCase();
    if (!['approved', 'rejected'].includes(nextStatus)) {
      return res.status(400).json({ message: 'Invalid change request status' });
    }

    const nextState = {
      ...state,
      change_request: state.change_request
        ? { ...state.change_request, request_status: nextStatus }
        : {
            requested_by: 'participant',
            request_type: 'schedule_change',
            request_status: nextStatus,
            request_date_time: null,
          },
    };

    await meeting.update({
      meeting_status: nextStatus === 'approved' ? 'rescheduled' : meeting.meeting_status,
      participants_json: serializeMeetingState(nextState),
    });

    return res.status(200).json(formatMeeting(meeting, booking, nextState));
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      message: error.message || 'Failed to update change request status',
    });
  }
};

exports.addParticipants = async (req, res) => {
  try {
    const { meeting, booking, state } = await getMeetingByIdInternal(req.params.meetingId);
    const role = String(req.body.role || '').toLowerCase();
    const userIds = Array.isArray(req.body.user_ids) ? req.body.user_ids : [];

    if (!['cp', 'manager'].includes(role)) {
      return res.status(400).json({ message: 'role must be cp or manager' });
    }

    const additions = role === 'cp'
      ? await buildCpParticipants(userIds)
      : await buildManagerParticipants(userIds);

    const nextState = {
      ...state,
      cps: role === 'cp' ? mergeParticipantsByKey(state.cps, additions) : state.cps,
      participants: role === 'manager' ? mergeParticipantsByKey(state.participants, additions) : state.participants,
    };

    await meeting.update({
      participants_json: serializeMeetingState(nextState),
    });

    const addedRecipients = additions.map((participant) => normalizeEmail(participant?.email)).filter(Boolean);
    if (addedRecipients.length) {
      const plainBooking = typeof booking?.get === 'function' ? booking.get({ plain: true }) : booking;
      await emailService.sendMeetingScheduledTemplateEmail({
        recipients: addedRecipients,
        data: {
          meeting_id: String(meeting.meeting_id),
          order_id: String(booking?.stream_project_booking_id || ''),
          order_name: plainBooking?.project_name || `Project #${booking?.stream_project_booking_id || ''}`,
          meeting_title: String(meeting.meeting_title || '').trim() || `Meeting for project ${booking?.stream_project_booking_id || ''}`,
          meeting_type: meeting.meeting_type || '',
          meeting_status: meeting.meeting_status || '',
          meeting_date_time: meeting.meeting_date_time ? new Date(meeting.meeting_date_time).toISOString() : '',
          meeting_end_time: meeting.meeting_end_time ? new Date(meeting.meeting_end_time).toISOString() : '',
          meet_link: meeting.meet_link || '',
          created_by_name: '',
          sent_at: new Date().toISOString(),
        },
      });
    }

    return res.status(200).json(formatMeeting(meeting, booking, nextState));
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      message: error.message || 'Failed to add participants',
    });
  }
};

exports.removeParticipant = async (req, res) => {
  try {
    const { meeting, booking, state } = await getMeetingByIdInternal(req.params.meetingId);
    const role = String(req.body?.role || req.query?.role || 'participant').toLowerCase();
    const targetUserId = String(req.params.userId || '').trim();

    const removeById = (participants) =>
      (participants || []).filter((participant) => String(participant?.id || '') !== targetUserId);

    const nextResponses = (state.participant_responses || []).filter((entry) => {
      const raw = entry?.user_id;
      const entryId = typeof raw === 'object' ? String(raw?.id || raw?._id || '') : String(raw || '');
      return entryId !== targetUserId;
    });

    const nextState = {
      ...state,
      participant_responses: nextResponses,
      cps: role === 'cp' ? removeById(state.cps) : state.cps,
      participants: ['manager', 'participant', 'admin'].includes(role) ? removeById(state.participants) : state.participants,
      client: role === 'client' && String(state.client?.id || '') === targetUserId ? null : state.client,
    };

    await meeting.update({
      participants_json: serializeMeetingState(nextState),
    });

    return res.status(200).json(formatMeeting(meeting, booking, nextState));
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      message: error.message || 'Failed to remove participant',
    });
  }
};

exports.respondToMeetingInvitation = async (req, res) => {
  try {
    const { meeting, booking, state } = await getMeetingByIdInternal(req.params.meetingId);
    const userId = getRequestUserId(req);
    const response = String(req.body.response || '').toLowerCase();

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!['accepted', 'declined'].includes(response)) {
      return res.status(400).json({ message: 'response must be accepted or declined' });
    }

    const requestUser = await getUserRecordById(userId);
    const requestUserEmail = normalizeEmail(requestUser?.email || '');
    const requestCrewIds = requestUserEmail ? await getCrewRecordIdsByEmail(requestUserEmail) : [];
    const responseIdentityKeys = new Set([
      String(userId),
      ...(requestUserEmail ? [`email:${requestUserEmail}`] : []),
      ...requestCrewIds.map((value) => String(value)),
    ]);

    const filteredResponses = (state.participant_responses || []).filter((entry) => {
      const entryKeys = getResponseIdentityKeys(entry);
      return !Array.from(responseIdentityKeys).some((key) => entryKeys.has(key));
    });

    const nextState = {
      ...state,
      participant_responses: [
        ...filteredResponses,
        {
          user_id: String(userId),
          user_email: requestUserEmail || null,
          participant_ids: requestCrewIds.map((value) => String(value)),
          response,
          responded_at: new Date().toISOString(),
        },
      ],
    };

    await meeting.update({
      participants_json: serializeMeetingState(nextState),
    });

    return res.status(200).json(formatMeeting(meeting, booking, nextState));
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      message: error.message || 'Failed to update invitation response',
    });
  }
};

exports.createMeetEvent = async (req, res) => {
  try {
    const userId = req.body?.userId || req.query?.userId || '';
    const query = userId ? `?userId=${encodeURIComponent(String(userId))}` : '';
    const payload = { ...(req.body || {}) };
    delete payload.userId;

    const result = await proxyRequest(req, `/create-event${query}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      message: error.message || 'Failed to create event',
    });
  }
};
