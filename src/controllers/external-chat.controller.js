const db = require('../models');
const emailService = require('../utils/emailService');

const DEFAULT_BASE_URL = process.env.EXTERNAL_CHAT_API_BASE_URL || 'http://localhost:5002/v1/external-chat';
const INTERNAL_KEY = process.env.EXTERNAL_CHAT_KEY || process.env.EXTERNAL_FILE_MANAGER_KEY || 'beige-internal-dev-key';

const buildHeaders = () => ({
  'Content-Type': 'application/json',
  'x-internal-key': INTERNAL_KEY,
});

const normalizeSegment = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/(shoot|event|project)/gi, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

const pickNameToken = (booking) => {
  const source = String(
    booking?.project_name || booking?.client_name || booking?.notes || booking?.guest_email || ''
  ).trim();
  if (!source) return 'client';

  const preferredChunk = source.split('-').map((part) => part.trim()).filter(Boolean).pop() || source;
  const firstWord = preferredChunk.split(/\s+/).filter(Boolean)[0] || preferredChunk;
  return normalizeSegment(firstWord) || 'client';
};

const buildChatRoomName = (booking) => {
  const bookingId = booking?.stream_project_booking_id || booking?.booking_id || booking?.id || 'new';
  const shootToken = normalizeSegment(booking?.shoot_type || booking?.event_type || 'booking') || 'booking';
  const nameToken = pickNameToken(booking);
  return `${shootToken}_${nameToken}_#${bookingId}`;
};

const shouldReplaceRoomName = (roomName, bookingId) => {
  const normalizedName = String(roomName || '').trim().toLowerCase();
  const normalizedBookingId = String(bookingId || '').trim().toLowerCase();
  if (!normalizedName) return true;
  if (!normalizedBookingId) return false;
  return normalizedName === normalizedBookingId || normalizedName.startsWith(`${normalizedBookingId}_`);
};

const proxyRequest = async (path, options = {}) => {
  const response = await fetch(`${DEFAULT_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...buildHeaders(),
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({
    success: false,
    message: 'Invalid JSON response from external chat service',
  }));

  if (!response.ok) {
    const error = new Error(payload.message || 'External chat request failed');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};

const isInvalidExternalOrderReference = (error) => {
  const message = String(error?.payload?.message || error?.message || '').toLowerCase();
  return (
    message.includes('cast to objectid failed') ||
    message.includes('order not found') ||
    message.includes('chat room not found for this order')
  );
};

const isDuplicateChatCreateError = (error) => {
  const message = String(error?.payload?.message || error?.message || '').toLowerCase();
  return message.includes('duplicate key error') || message.includes('chat room already exists');
};

const getAssignedSalesRepForBooking = async (bookingId) => {
  if (!bookingId) return null;

  const lead = await db.sales_leads.findOne({
    where: { booking_id: bookingId },
    include: [
      {
        model: db.users,
        as: 'assigned_sales_rep',
        required: false,
        attributes: ['id', 'name', 'email'],
      },
    ],
  });

  return lead?.assigned_sales_rep ? lead.assigned_sales_rep.get({ plain: true }) : null;
};

const getBookingRecord = async (bookingId) => {
  if (!bookingId) return null;

  const booking = await db.stream_project_booking.findOne({
    where: {
      stream_project_booking_id: bookingId,
    },
    raw: true,
  });

  return booking || null;
};

const normalizeClientEntity = (value) => {
  if (!value) return null;
  if (typeof value === 'string' || typeof value === 'number') {
    const primitiveId = String(value).trim();
    return primitiveId ? { id: primitiveId } : null;
  }

  const id = String(value.id || value._id || value.client_id || value.user_id || '').trim();
  const email = String(value.email || '').trim().toLowerCase();
  const name = String(value.name || '').trim();

  if (!id && !email && !name) {
    return null;
  }

  return {
    id: id || undefined,
    name: name || email || undefined,
    email: email || undefined,
    role: value.role || 'client',
  };
};

const enrichChatRoomSnapshot = async (room) => {
  if (!room) return room;

  const enrichedManagers = await enrichParticipantCollection(room.manager_ids || [], 'manager');
  const enrichedCps = await enrichParticipantCollection(room.cp_ids || [], 'cp');
  const enrichedProduction = await enrichParticipantCollection(room.production_ids || [], 'production');
  const normalizedClientSnapshot = normalizeClientEntity(room.client_snapshot);
  const normalizedClient = normalizeClientEntity(room.client_id);
  const enrichedClient = normalizedClientSnapshot
    ? (await enrichParticipantCollection([normalizedClientSnapshot], 'client'))[0] || normalizedClientSnapshot
    : normalizedClient
      ? (await enrichParticipantCollection([normalizedClient], 'client'))[0] || normalizedClient
      : null;

  return {
    ...room,
    manager_ids: enrichedManagers,
    cp_ids: enrichedCps,
    production_ids: enrichedProduction,
    client_snapshot: normalizedClientSnapshot ? enrichedClient : room.client_snapshot,
    client_id: normalizedClientSnapshot ? room.client_id : enrichedClient,
  };
};

const decorateChatRoom = async (room) => {
  if (!room) return room;

  const bookingId = room.external_order_ref || room.order_id?.id || room.order_id || null;
  if (!bookingId) return room;

  const booking = await getBookingRecord(bookingId);
  if (!booking) return room;

  if (!shouldReplaceRoomName(room.name, bookingId)) {
    return enrichChatRoomSnapshot({
      ...room,
      display_name: room.name,
    });
  }

  const displayName = buildChatRoomName(booking);
  return enrichChatRoomSnapshot({
    ...room,
    name: displayName,
    display_name: displayName,
  });
};

const getAssignedCpsForBooking = async (bookingId) => {
  if (!bookingId) return [];

  const assignments = await db.assigned_crew.findAll({
    where: {
      project_id: bookingId,
      is_active: 1,
    },
    include: [
      {
        model: db.crew_members,
        as: 'crew_member',
        attributes: ['crew_member_id', 'first_name', 'last_name', 'email'],
        required: false,
      },
    ],
  });

  return assignments.map((assignment) => assignment.get({ plain: true }));
};

const getPlatformUserById = async (userId) => {
  const normalizedUserId = Number(userId);
  if (!Number.isFinite(normalizedUserId)) return null;

  const user = await db.users.findOne({
    where: {
      id: normalizedUserId,
      is_active: 1,
    },
    attributes: ['id', 'name', 'email'],
    raw: true,
  });

  return user || null;
};

const getRoleFromUserType = (userType) => {
  if (Number(userType) === 1) return 'admin';
  if (Number(userType) === 5) return 'sales_rep';
  if (Number(userType) === 6) return 'pm';
  return 'manager';
};

const shouldUseProvidedName = (value, fallbackId = '') => {
  const name = String(value || '').trim();
  if (!name) return false;
  if (name.toLowerCase() === 'participant') return false;
  if (fallbackId && name === String(fallbackId)) return false;
  return true;
};

const shouldUseProvidedEmail = (value) => {
  const email = String(value || '').trim();
  return Boolean(email && email.toLowerCase() !== 'no email');
};

const isBogusParticipantValue = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized || normalized === '[object object]' || normalized.startsWith('{') || normalized === 'undefined' || normalized === 'null';
};

const enrichParticipantCollection = async (items = [], fallbackRole = 'member') => {
  const normalizedItems = Array.isArray(items)
    ? items.filter((item) => {
        const id = item?.id ?? item;
        const email = item?.email;
        const name = item?.name;
        return !isBogusParticipantValue(id) || !isBogusParticipantValue(email) || !isBogusParticipantValue(name);
      })
    : [];
  if (!normalizedItems.length) return [];

  const ids = normalizedItems
    .map((item) => Number(item?.id ?? item))
    .filter(Number.isFinite);

  const uniqueIds = [...new Set(ids)];
  const [staff, clients, cps] = await Promise.all([
    uniqueIds.length
      ? db.users.findAll({
          where: { id: uniqueIds, is_active: 1 },
          attributes: ['id', 'name', 'email', 'user_type'],
          raw: true,
        })
      : [],
    uniqueIds.length
      ? db.clients.findAll({
          where: { client_id: uniqueIds },
          attributes: ['client_id', 'name', 'email'],
          raw: true,
        })
      : [],
    uniqueIds.length
      ? db.crew_members.findAll({
          where: { crew_member_id: uniqueIds },
          attributes: ['crew_member_id', 'first_name', 'last_name', 'email', 'primary_role'],
          include: [
            {
              model: db.crew_member_files,
              as: 'crew_member_files',
              attributes: ['file_path', 'file_type'],
              where: { file_type: 'profile_photo' },
              required: false,
            },
          ],
        })
      : [],
  ]);

  const staffMap = new Map(staff.map((user) => [String(user.id), user]));
  const clientMap = new Map(clients.map((client) => [String(client.client_id), client]));
  const cpMap = new Map(
    cps.map((cpRecord) => {
      const plain = cpRecord.get({ plain: true });
      return [String(plain.crew_member_id), plain];
    })
  );

  return normalizedItems.map((item) => {
    const id = String(item?.id ?? item ?? '');
    const staffUser = staffMap.get(id);
    const client = clientMap.get(id);
    const cp = cpMap.get(id);
    const profilePhoto = Array.isArray(cp?.crew_member_files) ? cp.crew_member_files[0] : null;

    if (staffUser) {
      return {
        ...item,
        id,
        name: shouldUseProvidedName(item?.name, id) ? item.name : staffUser.name || staffUser.email || id,
        email: shouldUseProvidedEmail(item?.email) ? item.email : staffUser.email || null,
        role: item?.role && item.role !== 'manager' ? item.role : getRoleFromUserType(staffUser.user_type),
      };
    }

    if (client) {
      return {
        ...item,
        id,
        name: shouldUseProvidedName(item?.name, id) ? item.name : client.name || client.email || id,
        email: shouldUseProvidedEmail(item?.email) ? item.email : client.email || null,
        role: 'client',
      };
    }

    if (cp) {
      return {
        ...item,
        id,
        name: shouldUseProvidedName(item?.name, id)
          ? item.name
          : `${cp.first_name || ''} ${cp.last_name || ''}`.trim() || cp.email || id,
        email: shouldUseProvidedEmail(item?.email) ? item.email : cp.email || null,
        role: 'cp',
        subtitle: item?.subtitle || cp.primary_role || 'Creative Partner',
        profileImage: item?.profileImage || profilePhoto?.file_path || null,
      };
    }

    return {
      ...item,
      id,
      role: item?.role || fallbackRole,
    };
  }).filter((item) => !isBogusParticipantValue(item?.id) || !isBogusParticipantValue(item?.email) || !isBogusParticipantValue(item?.name));
};

const enrichParticipantPayload = async (payload = {}) => {
  const client = payload?.client
    ? (await enrichParticipantCollection([payload.client], 'client'))[0] || payload.client
    : null;

  return {
    ...payload,
    client,
    cps: await enrichParticipantCollection(payload?.cps || [], 'cp'),
    pm: payload?.pm
      ? ((await enrichParticipantCollection([payload.pm], 'pm'))[0] || payload.pm)
      : null,
    production: await enrichParticipantCollection(payload?.production || [], 'production'),
    managers: await enrichParticipantCollection(payload?.managers || [], 'manager'),
  };
};

const extractParticipantEnvelope = (payload = {}) => {
  if (
    payload &&
    typeof payload === 'object' &&
    ('client' in payload || 'cps' in payload || 'pm' in payload || 'production' in payload || 'managers' in payload)
  ) {
    return { envelope: payload, wrapped: false };
  }

  if (
    payload?.data &&
    typeof payload.data === 'object' &&
    ('client' in payload.data || 'cps' in payload.data || 'pm' in payload.data || 'production' in payload.data || 'managers' in payload.data)
  ) {
    return { envelope: payload.data, wrapped: true };
  }

  return { envelope: null, wrapped: false };
};

const normalizeEmailAddress = (value) => String(value || '').trim().toLowerCase();

const extractChatRecipientEmails = (envelope = {}) => {
  const emails = new Set();
  const push = (value) => {
    const normalized = normalizeEmailAddress(value);
    if (normalized) emails.add(normalized);
  };

  push(envelope?.client?.email);
  push(envelope?.pm?.email);
  (envelope?.cps || []).forEach((participant) => push(participant?.email));
  (envelope?.production || []).forEach((participant) => push(participant?.email));
  (envelope?.managers || []).forEach((participant) => push(participant?.email));

  return [...emails];
};

const resolveChatEnvelopeForNotifications = async (roomId) => {
  if (!roomId) return null;
  const participantPayload = await proxyRequest(`/participants/${roomId}`);
  const { envelope } = extractParticipantEnvelope(participantPayload);
  if (!envelope) return null;
  return enrichParticipantPayload(envelope);
};

const toObject = (value) => (value && typeof value === 'object' ? value : null);

const resolveChatOrderId = (payload = {}) =>
  String(
    payload?.order_id ||
      payload?.external_order_ref ||
      payload?.data?.order_id ||
      payload?.data?.external_order_ref ||
      ''
  ).trim();

const resolveChatDisplayName = (payload = {}) =>
  String(
    payload?.chat_name ||
      payload?.name ||
      payload?.display_name ||
      payload?.data?.chat_name ||
      payload?.data?.name ||
      payload?.data?.display_name ||
      ''
  ).trim();

const sendChatNotificationTemplate = async ({
  roomId,
  sender,
  eventType = 'message_created',
  messagePreview = '',
  fallbackPayload = {},
}) => {
  try {
    const envelope = await resolveChatEnvelopeForNotifications(roomId);
    const recipients = extractChatRecipientEmails(envelope || {});
    if (!recipients.length) return;

    const roomPayload = toObject(fallbackPayload?.data) || toObject(fallbackPayload) || {};
    await emailService.sendMessagingInitiatedTemplateEmail({
      recipients,
      data: {
        chat_room_id: roomId,
        chat_name: resolveChatDisplayName(roomPayload),
        order_id: resolveChatOrderId(roomPayload),
        sender_id: sender?.id != null ? String(sender.id) : '',
        sender_name: sender?.name || sender?.email || '',
        message_preview: String(messagePreview || ''),
        event_type: eventType,
        sent_at: new Date().toISOString(),
      },
    });
  } catch (notificationError) {
    console.error('Chat email notification failed:', notificationError?.message || notificationError);
  }
};

const getActiveStaffDirectory = async (search = '') => {
  const where = {
    is_active: 1,
    user_type: {
      [db.Sequelize.Op.in]: [1, 5, 6],
    },
  };

  if (search) {
    where[db.Sequelize.Op.or] = [
      { name: { [db.Sequelize.Op.like]: `%${search}%` } },
      { email: { [db.Sequelize.Op.like]: `%${search}%` } },
    ];
  }

  const users = await db.users.findAll({
    where,
    attributes: ['id', 'name', 'email', 'user_type'],
    order: [['name', 'ASC']],
  });

  return users
    .map((user) => user.get({ plain: true }))
    .map((user) => ({
      id: String(user.id),
      name: user.name || user.email || `User ${user.id}`,
      email: user.email || null,
      role:
        Number(user.user_type) === 1
          ? 'admin'
          : Number(user.user_type) === 5
            ? 'sales_rep'
            : 'pm',
      source: 'staff',
    }));
};

const getClientDirectory = async (search = '') => {
  const where = {
    is_active: 1,
  };

  if (search) {
    where[db.Sequelize.Op.or] = [
      { name: { [db.Sequelize.Op.like]: `%${search}%` } },
      { email: { [db.Sequelize.Op.like]: `%${search}%` } },
    ];
  }

  const clients = await db.clients.findAll({
    where,
    attributes: ['client_id', 'user_id', 'name', 'email', 'phone_number'],
    order: [['name', 'ASC']],
  });

  return clients
    .map((client) => client.get({ plain: true }))
    .map((client) => ({
      id: String(client.client_id || client.user_id),
      client_id: client.client_id != null ? String(client.client_id) : null,
      user_id: client.user_id != null ? String(client.user_id) : null,
      name: client.name || client.email || `Client ${client.client_id || client.user_id}`,
      email: client.email || null,
      phone_number: client.phone_number || null,
      role: 'client',
      source: 'client',
    }));
};

const getCreativePartnerDirectory = async (search = '') => {
  const where = {
    is_active: 1,
    is_crew_verified: 1,
  };

  if (search) {
    where[db.Sequelize.Op.or] = [
      { first_name: { [db.Sequelize.Op.like]: `%${search}%` } },
      { last_name: { [db.Sequelize.Op.like]: `%${search}%` } },
      { email: { [db.Sequelize.Op.like]: `%${search}%` } },
    ];
  }

  const cps = await db.crew_members.findAll({
    where,
    attributes: ['crew_member_id', 'first_name', 'last_name', 'email', 'primary_role'],
    include: [
      {
        model: db.crew_member_files,
        as: 'crew_member_files',
        attributes: ['file_path', 'file_type'],
        where: {
          file_type: 'profile_photo',
        },
        required: false,
      },
    ],
    // limit: 50,
    order: [['first_name', 'ASC'], ['last_name', 'ASC']],
  });

  return cps.map((cp) => {
    const plain = cp.get({ plain: true });
    const profilePhoto = Array.isArray(plain.crew_member_files) ? plain.crew_member_files[0] : null;
    return {
      id: String(plain.crew_member_id),
      name: `${plain.first_name || ''} ${plain.last_name || ''}`.trim() || plain.email || `CP ${plain.crew_member_id}`,
      email: plain.email || null,
      role: 'cp',
      subtitle: plain.primary_role || 'Creative Partner',
      profileImage: profilePhoto?.file_path || null,
      source: 'cp',
    };
  });
};

const buildDirectRoomName = ({ roomName, client, participants = [] }) => {
  if (String(roomName || '').trim()) return String(roomName).trim();

  const directCounterpart =
    client ||
    participants.find((participant) => participant.role === 'client') ||
    participants.find((participant) => participant.role !== 'manager');

  const label = normalizeSegment(directCounterpart?.name || directCounterpart?.email || 'conversation') || 'conversation';
  const suffix = directCounterpart?.id || Date.now();
  return `direct_${label}_#${suffix}`;
};

const normalizePrimitive = (value) => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim();
  }

  return '';
};

const normalizeParticipantInput = (participant) => {
  if (!participant) return null;

  const id =
    normalizePrimitive(participant.id) ||
    normalizePrimitive(participant.client_id) ||
    normalizePrimitive(participant.user_id);
  const email = normalizePrimitive(participant.email).toLowerCase() || null;
  const name = normalizePrimitive(participant.name) || email || id;
  const role = String(participant.role || 'manager').trim().toLowerCase();

  if (!id && !email) return null;

  return {
    id: id || email,
    email,
    name: name || email || id,
    role,
  };
};

const resolveClientParticipant = async (participant) => {
  const normalized = normalizeParticipantInput(participant ? { ...participant, role: 'client' } : null);
  if (!normalized) return null;

  const numericId = Number(normalized.id);
  const normalizedEmail = normalized.email ? String(normalized.email).trim().toLowerCase() : null;
  const orConditions = [];

  if (Number.isFinite(numericId)) {
    orConditions.push({ client_id: numericId });
    orConditions.push({ user_id: numericId });
  }
  if (normalizedEmail) {
    orConditions.push({ email: normalizedEmail });
  }

  let clientRecord = null;
  if (orConditions.length) {
    clientRecord = await db.clients.findOne({
      where: {
        [db.Sequelize.Op.or]: orConditions,
      },
      attributes: ['client_id', 'user_id', 'name', 'email'],
      raw: true,
    });
  }

  const userLookupConditions = [];
  if (clientRecord?.user_id != null) {
    userLookupConditions.push({ id: Number(clientRecord.user_id) });
  }
  if (Number.isFinite(numericId)) {
    userLookupConditions.push({ id: numericId });
  }
  if (normalizedEmail) {
    userLookupConditions.push({ email: normalizedEmail });
  }

  let userRecord = null;
  if (userLookupConditions.length) {
    userRecord = await db.users.findOne({
      where: {
        [db.Sequelize.Op.or]: userLookupConditions,
        is_active: 1,
      },
      attributes: ['id', 'name', 'email'],
      raw: true,
    });
  }

  if (!clientRecord && !userRecord) {
    return null;
  }

  return {
    id: String(clientRecord?.client_id || userRecord?.id || normalized.id),
    name: clientRecord?.name || userRecord?.name || normalized.name || normalized.email || 'Client',
    email: clientRecord?.email || userRecord?.email || normalized.email || null,
    role: 'client',
  };
};

const buildParticipants = ({ salesRep = null, selectedCps = [] }) => {
  const participants = [];
  const seen = new Set();

  const participantKey = (user) => String(user?.email || user?.id || '').trim().toLowerCase();

  const pushParticipant = (user, role = 'manager') => {
    const key = participantKey(user);
    if (!key || seen.has(key)) return;
    participants.push({
      id: user?.id != null ? String(user.id) : undefined,
      email: user?.email || undefined,
      name: user?.name || undefined,
      role,
    });
    seen.add(key);
  };

  if (salesRep) pushParticipant(salesRep, 'sales_rep');
  selectedCps.forEach((cp) => pushParticipant(cp, 'cp'));

  return participants;
};

exports.getChatRoomByBooking = async (bookingId) => {
  if (!bookingId) {
    return { success: false, message: 'booking_id is required', data: null };
  }

  try {
    return await proxyRequest(`/order/${bookingId}`);
  } catch (error) {
    if (error.status === 404 || isInvalidExternalOrderReference(error)) {
      return {
        success: true,
        message: 'Chat room not found',
        data: null,
      };
    }

    throw error;
  }
};

exports.createChatRoomForBooking = async ({ bookingId = null, participants, adminId = null, roomName = null, externalRef = null }) => {
  const adminUser = adminId != null ? await getPlatformUserById(adminId) : null;
  const booking = bookingId ? await getBookingRecord(bookingId) : null;
  const normalizedExternalRef = String(externalRef || bookingId || '').trim() || `direct:${Date.now()}`;
  try {
    return await proxyRequest('/room', {
      method: 'POST',
      body: JSON.stringify({
        order_id: bookingId ? String(bookingId) : undefined,
        external_order_ref: normalizedExternalRef,
        name: roomName || buildChatRoomName(booking || { booking_id: bookingId }),
        participants,
        adminId: adminId != null ? String(adminId) : null,
        adminUser: adminUser
          ? {
              id: String(adminUser.id),
              email: adminUser.email,
              name: adminUser.name,
              role: 'admin',
            }
          : null,
      }),
    });
  } catch (error) {
    if (bookingId && isDuplicateChatCreateError(error)) {
      const existingRoom = await exports.getChatRoomByBooking(bookingId);
      if (existingRoom?.data) {
        return {
          success: true,
          message: 'Chat room already exists',
          data: existingRoom.data,
          created: false,
        };
      }

      return {
        success: false,
        message: 'Chat room already exists or could not be created for this project',
        data: null,
        created: false,
      };
    }

    throw error;
  }
};

exports.createChatRoom = async (req, res) => {
  try {
    const bookingId = String(req.body.bookingId || req.body.orderId || req.body.externalId || '').trim();
    const booking = bookingId ? await getBookingRecord(bookingId) : null;
    const requestedCpIds = Array.isArray(req.body.selectedCpIds)
      ? req.body.selectedCpIds.map((id) => Number(id)).filter(Number.isFinite)
      : [];
    const requestedParticipants = Array.isArray(req.body.participants)
      ? (
          await Promise.all(
            req.body.participants.map(async (participant) => {
              const normalizedRole = String(participant?.role || '').trim().toLowerCase();
              if (normalizedRole === 'client') {
                return resolveClientParticipant(participant);
              }

              return normalizeParticipantInput(participant);
            })
          )
        ).filter(Boolean)
      : [];
    const directClient = await resolveClientParticipant(req.body.client);
    const bookingClient = booking
      ? await resolveClientParticipant({
          id: booking.client_id || booking.user_id || null,
          email: booking.guest_email || null,
          name: booking.client_name || null,
          role: 'client',
        })
      : null;
    const roomType = String(req.body.roomType || (bookingId ? 'project' : 'direct')).toLowerCase();

    if (!bookingId && roomType === 'project') {
      return res.status(400).json({
        success: false,
        message: 'bookingId is required for project conversations',
      });
    }

    const [salesRep, assignedCps] = bookingId
      ? await Promise.all([
          getAssignedSalesRepForBooking(bookingId),
          getAssignedCpsForBooking(bookingId),
        ])
      : [null, []];

    const existingChat = bookingId ? await exports.getChatRoomByBooking(bookingId) : null;
    if (existingChat?.data && roomType === 'project') {
      return res.status(200).json({
        success: true,
        message: 'Chat room already exists',
        data: existingChat.data,
        created: false,
      });
    }

    let participants = [];
    let selectedCpIds = [];

    if (bookingId) {
      const validAssignedCpIds = new Set(
        assignedCps
          .map((assignment) => Number(assignment.crew_member_id || assignment.crew_member?.crew_member_id))
          .filter(Number.isFinite)
      );

      selectedCpIds = requestedCpIds.filter((id) => validAssignedCpIds.has(id));
      const selectedCps = assignedCps
        .filter((assignment) => selectedCpIds.includes(Number(assignment.crew_member_id || assignment.crew_member?.crew_member_id)))
        .map((assignment) => ({
          id: assignment.crew_member_id || assignment.crew_member?.crew_member_id,
          email: assignment.crew_member?.email || null,
          name: `${assignment.crew_member?.first_name || ''} ${assignment.crew_member?.last_name || ''}`.trim() || null,
          role: 'cp',
        }));

      participants = buildParticipants({
        salesRep,
        selectedCps,
      });

      if (bookingClient) {
        participants.push(bookingClient);
      }
    }

    const mergedParticipants = [...participants, ...requestedParticipants];
    if (directClient) mergedParticipants.push(directClient);

    const result = await exports.createChatRoomForBooking({
      bookingId,
      participants: mergedParticipants,
      adminId: req.user?.userId || null,
      roomName: bookingId
        ? buildChatRoomName(booking || { booking_id: bookingId })
        : buildDirectRoomName({ roomName: req.body.roomName, client: directClient, participants: mergedParticipants }),
      externalRef: bookingId || req.body.externalRef || `direct:${req.user?.userId || 'user'}:${directClient?.id || Date.now()}`,
    });

    const decoratedRoom = result?.data ? await decorateChatRoom(result.data) : result?.data;
    return res.status(200).json({
      ...result,
      data: decoratedRoom,
      created: result?.created !== false,
      selected_cp_ids: selectedCpIds,
    });
  } catch (error) {
    if (isInvalidExternalOrderReference(error)) {
      return res.status(200).json({
        success: false,
        message: 'Chat is not available for this project yet',
        data: null,
        created: false,
      });
    }

    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.getChatDirectory = async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const [staff, clients, creativePartners] = await Promise.all([
      getActiveStaffDirectory(search),
      getClientDirectory(search),
      getCreativePartnerDirectory(search),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        staff,
        clients,
        creativePartners,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to load chat directory',
    });
  }
};

exports.addChatParticipants = async (req, res) => {
  try {
    const participants = Array.isArray(req.body.participants)
      ? req.body.participants.map((participant) => normalizeParticipantInput(participant)).filter(Boolean)
      : [];
    const explicitRole = String(req.body.role || '').trim().toLowerCase();

    if (participants.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'participants are required',
      });
    }

    const adminUser = await getPlatformUserById(req.user?.userId || null);
    const groupedParticipants = participants.reduce((acc, participant) => {
      const role = explicitRole || participant.role || 'manager';
      if (!acc[role]) acc[role] = [];
      acc[role].push(participant);
      return acc;
    }, {});

    const results = [];
    for (const [role, items] of Object.entries(groupedParticipants)) {
      const result = await proxyRequest(`/participants/${req.params.roomId}`, {
        method: 'POST',
        body: JSON.stringify({
          role,
          participants: items,
          adminId: req.user?.userId != null ? String(req.user.userId) : null,
          adminUser: adminUser
            ? {
                id: String(adminUser.id),
                email: adminUser.email,
                name: adminUser.name,
                role: 'admin',
              }
            : null,
        }),
      });
      results.push(result);
    }

    await sendChatNotificationTemplate({
      roomId: req.params.roomId,
      sender: adminUser || {
        id: req.user?.userId || '',
        email: req.user?.email || '',
        name: req.user?.name || `User ${req.user?.userId || ''}`.trim(),
      },
      eventType: 'participant_added',
      messagePreview: `${participants.length} participant(s) added`,
      fallbackPayload: results[results.length - 1] || {},
    });

    return res.status(200).json({
      success: true,
      data: results,
    });
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.removeChatParticipant = async (req, res) => {
  try {
    const role = String(req.body.role || '').trim().toLowerCase();

    if (!role) {
      return res.status(400).json({
        success: false,
        message: 'role is required',
      });
    }

    const adminUser = await getPlatformUserById(req.user?.userId || null);
    const result = await proxyRequest(`/participants/${req.params.roomId}/${req.params.userId}`, {
      method: 'DELETE',
      body: JSON.stringify({
        role,
        adminId: req.user?.userId != null ? String(req.user.userId) : null,
        adminUser: adminUser
          ? {
              id: String(adminUser.id),
              email: adminUser.email,
              name: adminUser.name,
              role: 'admin',
            }
          : null,
      }),
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message || 'Failed to remove participant',
    });
  }
};

exports.getChatRoom = async (req, res) => {
  try {
    const result = await exports.getChatRoomByBooking(req.params.bookingId);
    if (result?.data) {
      result.data = await decorateChatRoom(result.data);
    }
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.listChatRooms = async (req, res) => {
  try {
    const query = new URLSearchParams();
    if (req.query.page) query.set('page', req.query.page);
    if (req.query.limit) query.set('limit', req.query.limit);
    if (req.query.sortBy) query.set('sortBy', req.query.sortBy);
    if (req.query.search) query.set('search', req.query.search);

    const result = await proxyRequest(`/rooms${query.toString() ? `?${query.toString()}` : ''}`);
    const rooms = result?.data?.results || result?.data?.rooms || result?.results || [];
    if (Array.isArray(rooms) && rooms.length) {
      const decoratedRooms = await Promise.all(rooms.map((room) => decorateChatRoom(room)));
      if (Array.isArray(result?.data?.results)) {
        result.data.results = decoratedRooms;
      } else if (Array.isArray(result?.data?.rooms)) {
        result.data.rooms = decoratedRooms;
      } else if (Array.isArray(result?.results)) {
        result.results = decoratedRooms;
      }
    }
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.getChatMessages = async (req, res) => {
  try {
    const query = new URLSearchParams();
    if (req.query.page) query.set('page', req.query.page);
    if (req.query.limit) query.set('limit', req.query.limit);
    if (req.query.sortBy) query.set('sortBy', req.query.sortBy);

    const result = await proxyRequest(
      `/messages/${req.params.roomId}${query.toString() ? `?${query.toString()}` : ''}`
    );
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.getChatParticipants = async (req, res) => {
  try {
    const result = await proxyRequest(`/participants/${req.params.roomId}`);
    const { envelope, wrapped } = extractParticipantEnvelope(result);
    if (envelope) {
      const enriched = await enrichParticipantPayload(envelope);
      if (wrapped) {
        result.data = enriched;
      } else {
        return res.status(200).json(enriched);
      }
    }
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.sendChatMessage = async (req, res) => {
  try {
    const platformUser = await getPlatformUserById(req.user?.userId || null);
    const sender = platformUser || {
      id: String(req.user?.userId || ''),
      email: null,
      name: `User ${req.user?.userId || ''}`.trim(),
    };

    const result = await proxyRequest(`/messages/${req.params.roomId}`, {
      method: 'POST',
      body: JSON.stringify({
        message: req.body.message,
        replyTo: req.body.replyTo || null,
        sender: {
          id: sender.id != null ? String(sender.id) : null,
          email: sender.email || null,
          name: sender.name || sender.email || 'Beige User',
        },
      }),
    });

    await sendChatNotificationTemplate({
      roomId: req.params.roomId,
      sender,
      eventType: 'message_created',
      messagePreview: String(req.body.message || ''),
      fallbackPayload: result || {},
    });

    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.editChatMessage = async (req, res) => {
  try {
    const platformUser = await getPlatformUserById(req.user?.userId || null);
    const sender = platformUser || {
      id: String(req.user?.userId || ''),
      email: null,
      name: `User ${req.user?.userId || ''}`.trim(),
    };

    const result = await proxyRequest(`/messages/${req.params.messageId}/edit`, {
      method: 'POST',
      body: JSON.stringify({
        content: req.body.content,
        sender: {
          id: sender.id != null ? String(sender.id) : null,
          email: sender.email || null,
          name: sender.name || sender.email || 'Beige User',
        },
      }),
    });

    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.deleteChatMessage = async (req, res) => {
  try {
    const platformUser = await getPlatformUserById(req.user?.userId || null);
    const sender = platformUser || {
      id: String(req.user?.userId || ''),
      email: null,
      name: `User ${req.user?.userId || ''}`.trim(),
    };

    const result = await proxyRequest(`/messages/${req.params.messageId}/delete`, {
      method: 'POST',
      body: JSON.stringify({
        sender: {
          id: sender.id != null ? String(sender.id) : null,
          email: sender.email || null,
          name: sender.name || sender.email || 'Beige User',
        },
      }),
    });

    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.reactToChatMessage = async (req, res) => {
  try {
    const platformUser = await getPlatformUserById(req.user?.userId || null);
    const sender = platformUser || {
      id: String(req.user?.userId || ''),
      email: null,
      name: `User ${req.user?.userId || ''}`.trim(),
    };

    const result = await proxyRequest(`/messages/${req.params.messageId}/reaction`, {
      method: 'POST',
      body: JSON.stringify({
        emoji: req.body.emoji,
        sender: {
          id: sender.id != null ? String(sender.id) : null,
          email: sender.email || null,
          name: sender.name || sender.email || 'Beige User',
        },
      }),
    });

    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};
