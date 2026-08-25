const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const moment = require('moment');
const { google } = require('googleapis');
const { Op } = require('sequelize');
const db = require('../models');

const {
  assigned_crew,
  creator_availability_blocks,
  creator_availability_rules,
  creator_calendar_connections,
  crew_members,
  stream_project_booking,
} = db;

const GOOGLE_PROVIDER = 'google';
const GOOGLE_BUSY_SOURCE = 'google_calendar';
const DEFAULT_TIMEZONE = 'Asia/Kolkata';
const DEFAULT_SYNC_PAST_DAYS = 7;
const DEFAULT_SYNC_FUTURE_DAYS = 90;
const GOOGLE_FREEBUSY_CHUNK_DAYS = 30;
const GOOGLE_AUTO_SYNC_STALE_MINUTES = 5;

const getEncryptionKey = () =>
  crypto
    .createHash('sha256')
    .update(String(process.env.CALENDAR_TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET || 'beige-calendar-token-key'))
    .digest();

const encrypt = (value) => {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
};

const decrypt = (value) => {
  if (!value) return null;
  const [ivText, tagText, encryptedText] = String(value).split(':');
  if (!ivText || !tagText || !encryptedText) return null;
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivText, 'base64'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
};

const getGoogleOAuthClient = () => {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret =
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET ||
    process.env.GOOGLE_CALENDAR_CLIENT_SECRETE ||
    process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_CALENDAR_REDIRECT_URI ||
    process.env.GOOGLE_CREATOR_CALENDAR_REDIRECT_URI ||
    `${String(process.env.API_BASE_URL || 'http://localhost:5001/v1').replace(/\/+$/, '')}/creator/calendar/google/callback`;

  if (!clientId || !clientSecret) {
    const error = new Error('Google Calendar OAuth is not configured');
    error.statusCode = 500;
    throw error;
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};

const parseJsonArray = (value, fallback = []) => {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
};

const normalizeCrewMemberId = async ({ crew_member_id, user_id }) => {
  if (crew_member_id) return Number(crew_member_id);
  if (!user_id) return null;
  const crewMember = await crew_members.findOne({
    where: { user_id },
    attributes: ['crew_member_id'],
  });
  return crewMember?.crew_member_id || null;
};

const assertValidTimeRange = (startTime, endTime) => {
  const start = moment(startTime, 'HH:mm:ss', true).isValid()
    ? moment(startTime, 'HH:mm:ss')
    : moment(startTime, 'HH:mm', true);
  const end = moment(endTime, 'HH:mm:ss', true).isValid()
    ? moment(endTime, 'HH:mm:ss')
    : moment(endTime, 'HH:mm', true);

  if (!start.isValid() || !end.isValid() || !end.isAfter(start)) {
    const error = new Error('A valid start_time and end_time are required');
    error.statusCode = 400;
    throw error;
  }
};

const normalizeRulePayload = (rule, crewMemberId) => {
  const day = Number(rule.day_of_week);
  if (!Number.isInteger(day) || day < 0 || day > 6) {
    const error = new Error('day_of_week must be between 0 and 6');
    error.statusCode = 400;
    throw error;
  }

  assertValidTimeRange(rule.start_time, rule.end_time);

  return {
    crew_member_id: crewMemberId,
    day_of_week: day,
    start_time: rule.start_time,
    end_time: rule.end_time,
    timezone: rule.timezone || DEFAULT_TIMEZONE,
    minimum_notice_minutes: Number(rule.minimum_notice_minutes ?? 1440),
    is_active: rule.is_active === undefined ? 1 : Number(Boolean(rule.is_active)),
  };
};

const listRules = async (crewMemberId) =>
  creator_availability_rules.findAll({
    where: { crew_member_id: crewMemberId },
    order: [['day_of_week', 'ASC'], ['start_time', 'ASC']],
  });

const replaceRules = async (crewMemberId, rules) => {
  if (!Array.isArray(rules)) {
    const error = new Error('rules must be an array');
    error.statusCode = 400;
    throw error;
  }

  const normalized = rules.map((rule) => normalizeRulePayload(rule, crewMemberId));

  return db.sequelize.transaction(async (transaction) => {
    await creator_availability_rules.destroy({
      where: { crew_member_id: crewMemberId },
      transaction,
    });

    if (!normalized.length) return [];

    return creator_availability_rules.bulkCreate(normalized, { transaction });
  });
};

const createManualBlock = async (crewMemberId, payload) => {
  const startAt = moment(payload.start_at);
  const endAt = moment(payload.end_at);

  if (!startAt.isValid() || !endAt.isValid() || !endAt.isAfter(startAt)) {
    const error = new Error('A valid start_at and end_at are required');
    error.statusCode = 400;
    throw error;
  }

  return creator_availability_blocks.create({
    crew_member_id: crewMemberId,
    source: 'manual',
    source_external_id: payload.source_external_id || null,
    start_at: startAt.toDate(),
    end_at: endAt.toDate(),
    timezone: payload.timezone || DEFAULT_TIMEZONE,
    status: payload.status || 'unavailable',
    metadata_json: payload.notes ? { notes: String(payload.notes) } : null,
  });
};

const listBlocks = async (crewMemberId, { start_at, end_at } = {}) => {
  const where = {
    crew_member_id: crewMemberId,
    status: { [Op.ne]: 'cancelled' },
  };

  if (start_at && end_at) {
    where.start_at = { [Op.lt]: moment(end_at).toDate() };
    where.end_at = { [Op.gt]: moment(start_at).toDate() };
  }

  return creator_availability_blocks.findAll({
    where,
    order: [['start_at', 'ASC']],
  });
};

const deleteManualBlock = async (crewMemberId, blockId) =>
  creator_availability_blocks.update(
    { status: 'cancelled' },
    {
      where: {
        id: blockId,
        crew_member_id: crewMemberId,
        source: 'manual',
      },
    }
  );

const buildGoogleAuthUrl = ({ crewMemberId, userId }) => {
  const oauth2Client = getGoogleOAuthClient();
  const state = jwt.sign(
    { crew_member_id: crewMemberId, user_id: userId, provider: GOOGLE_PROVIDER },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.freebusy'],
    state,
  });
};

const connectGoogle = async ({ code, state }) => {
  const decoded = jwt.verify(state, process.env.JWT_SECRET);
  if (decoded.provider !== GOOGLE_PROVIDER || !decoded.crew_member_id) {
    const error = new Error('Invalid Google Calendar connection state');
    error.statusCode = 400;
    throw error;
  }

  const oauth2Client = getGoogleOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  let providerAccountEmail = null;
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const profile = await oauth2.userinfo.get();
    providerAccountEmail = profile?.data?.email || null;
  } catch (_) {
    providerAccountEmail = null;
  }

  const [connection] = await creator_calendar_connections.findOrCreate({
    where: { crew_member_id: decoded.crew_member_id, provider: GOOGLE_PROVIDER },
    defaults: {
      crew_member_id: decoded.crew_member_id,
      provider: GOOGLE_PROVIDER,
    },
  });

  await connection.update({
    provider_account_email: providerAccountEmail,
    access_token_encrypted: encrypt(tokens.access_token),
    refresh_token_encrypted: encrypt(tokens.refresh_token || decrypt(connection.refresh_token_encrypted)),
    token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    selected_calendar_ids_json: ['primary'],
    sync_status: 'connected',
    last_sync_error: null,
    disconnected_at: null,
  });

  try {
    await syncGoogleBusyBlocks(decoded.crew_member_id);
  } catch (error) {
    console.error('Initial Google Calendar sync failed after connect:', error.message);
  }

  return connection;
};

const getConnectionStatus = async (crewMemberId) => {
  const connection = await creator_calendar_connections.findOne({
    where: { crew_member_id: crewMemberId, provider: GOOGLE_PROVIDER },
  });

  if (!connection || connection.disconnected_at) {
    return { provider: GOOGLE_PROVIDER, connected: false, sync_status: 'not_connected' };
  }

  return {
    provider: GOOGLE_PROVIDER,
    connected: connection.sync_status !== 'revoked',
    provider_account_email: connection.provider_account_email,
    sync_status: connection.sync_status,
    last_synced_at: connection.last_synced_at,
    last_sync_error: connection.last_sync_error,
  };
};

const syncGoogleBusyBlocks = async (crewMemberId, options = {}) => {
  const connection = await creator_calendar_connections.findOne({
    where: {
      crew_member_id: crewMemberId,
      provider: GOOGLE_PROVIDER,
      disconnected_at: { [Op.is]: null },
    },
  });

  if (!connection) {
    const error = new Error('Google Calendar is not connected');
    error.statusCode = 404;
    throw error;
  }

  await connection.update({ sync_status: 'syncing', last_sync_error: null });

  const timeMin = moment().subtract(options.pastDays || DEFAULT_SYNC_PAST_DAYS, 'days').startOf('day');
  const timeMax = moment().add(options.futureDays || DEFAULT_SYNC_FUTURE_DAYS, 'days').endOf('day');

  try {
    const oauth2Client = getGoogleOAuthClient();
    oauth2Client.setCredentials({
      access_token: decrypt(connection.access_token_encrypted),
      refresh_token: decrypt(connection.refresh_token_encrypted),
      expiry_date: connection.token_expiry ? new Date(connection.token_expiry).getTime() : undefined,
    });

    const selectedCalendarIds = parseJsonArray(connection.selected_calendar_ids_json, ['primary']);
    const blocks = [];
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    let chunkStart = timeMin.clone();

    while (chunkStart.isBefore(timeMax)) {
      const chunkEnd = moment.min(
        chunkStart.clone().add(GOOGLE_FREEBUSY_CHUNK_DAYS, 'days'),
        timeMax
      );

      const response = await calendar.freebusy.query({
        requestBody: {
          timeMin: chunkStart.toISOString(),
          timeMax: chunkEnd.toISOString(),
          items: selectedCalendarIds.map((id) => ({ id })),
        },
      });

      const calendars = response?.data?.calendars || {};

      Object.entries(calendars).forEach(([calendarId, calendarData]) => {
        (calendarData.busy || []).forEach((busy, index) => {
          if (!busy.start || !busy.end) return;
          blocks.push({
            crew_member_id: crewMemberId,
            source: GOOGLE_BUSY_SOURCE,
            source_external_id: `${calendarId}:${busy.start}:${busy.end}:${index}`,
            start_at: moment(busy.start).toDate(),
            end_at: moment(busy.end).toDate(),
            timezone: DEFAULT_TIMEZONE,
            status: 'unavailable',
            metadata_json: { provider: GOOGLE_PROVIDER, calendar_id: calendarId },
          });
        });
      });

      chunkStart = chunkEnd;
    }

    await db.sequelize.transaction(async (transaction) => {
      await creator_availability_blocks.destroy({
        where: {
          crew_member_id: crewMemberId,
          source: GOOGLE_BUSY_SOURCE,
          start_at: { [Op.gte]: timeMin.toDate() },
          end_at: { [Op.lte]: timeMax.toDate() },
        },
        transaction,
      });

      if (blocks.length) {
        await creator_availability_blocks.bulkCreate(blocks, { transaction });
      }
    });

    const refreshedTokens = oauth2Client.credentials || {};
    await connection.update({
      access_token_encrypted: refreshedTokens.access_token
        ? encrypt(refreshedTokens.access_token)
        : connection.access_token_encrypted,
      token_expiry: refreshedTokens.expiry_date
        ? new Date(refreshedTokens.expiry_date)
        : connection.token_expiry,
      sync_status: 'connected',
      last_synced_at: new Date(),
      last_sync_error: null,
    });

    return { imported_blocks: blocks.length, time_min: timeMin.toISOString(), time_max: timeMax.toISOString() };
  } catch (error) {
    error.statusCode = Number(error.statusCode || error.status) || undefined;
    await connection.update({
      sync_status: 'failed',
      last_sync_error: error.message,
    });
    throw error;
  }
};

const syncStaleGoogleBusyBlocks = async (crewMemberId, options = {}) => {
  const staleMinutes = Number(options.staleMinutes || GOOGLE_AUTO_SYNC_STALE_MINUTES);
  const connection = await creator_calendar_connections.findOne({
    where: {
      crew_member_id: crewMemberId,
      provider: GOOGLE_PROVIDER,
      disconnected_at: { [Op.is]: null },
    },
  });

  if (!connection || connection.sync_status === 'revoked' || connection.sync_status === 'syncing') {
    return { skipped: true, reason: 'not_connected_or_syncing' };
  }

  const lastTouch = connection.last_synced_at || connection.updated_at || connection.created_at;
  const isFresh = lastTouch && moment().diff(moment(lastTouch), 'minutes') < staleMinutes;

  if (isFresh) {
    return { skipped: true, reason: 'fresh' };
  }

  return syncGoogleBusyBlocks(crewMemberId, options);
};

const disconnectGoogle = async (crewMemberId) => {
  const connection = await creator_calendar_connections.findOne({
    where: { crew_member_id: crewMemberId, provider: GOOGLE_PROVIDER },
  });

  if (connection) {
    await connection.update({
      sync_status: 'revoked',
      disconnected_at: new Date(),
      access_token_encrypted: null,
      refresh_token_encrypted: null,
    });
  }

  await creator_availability_blocks.destroy({
    where: {
      crew_member_id: crewMemberId,
      source: GOOGLE_BUSY_SOURCE,
    },
  });
};

const timeOnDate = (date, time) => moment(`${date.format('YYYY-MM-DD')} ${time}`, 'YYYY-MM-DD HH:mm:ss').toDate();

const subtractBlocks = (windows, blocks) => {
  let remaining = windows;

  blocks.forEach((block) => {
    const blockStart = moment(block.start_at);
    const blockEnd = moment(block.end_at);
    const next = [];

    remaining.forEach((window) => {
      const windowStart = moment(window.start_at);
      const windowEnd = moment(window.end_at);

      if (!blockStart.isBefore(windowEnd) || !blockEnd.isAfter(windowStart)) {
        next.push(window);
        return;
      }

      if (blockStart.isAfter(windowStart)) {
        next.push({ ...window, end_at: blockStart.toDate() });
      }

      if (blockEnd.isBefore(windowEnd)) {
        next.push({ ...window, start_at: blockEnd.toDate() });
      }
    });

    remaining = next;
  });

  return remaining;
};

const getBeigeBookingBlocks = async (crewMemberId, startAt, endAt) => {
  const assignments = await assigned_crew.findAll({
    where: {
      crew_member_id: crewMemberId,
      crew_accept: 1,
      is_active: 1,
    },
    include: [
      {
        model: stream_project_booking,
        as: 'project',
        required: true,
        where: {
          event_date: {
            [Op.between]: [
              moment(startAt).format('YYYY-MM-DD'),
              moment(endAt).format('YYYY-MM-DD'),
            ],
          },
          [Op.or]: [{ is_cancelled: 0 }, { is_cancelled: null }],
        },
        attributes: ['stream_project_booking_id', 'event_date', 'start_time', 'end_time', 'project_name'],
      },
    ],
  });

  return assignments
    .filter((assignment) => assignment.project?.event_date)
    .map((assignment) => {
      const project = assignment.project;
      const day = moment(project.event_date);
      return {
        source: 'beige_booking',
        source_external_id: String(project.stream_project_booking_id),
        start_at: project.start_time ? timeOnDate(day, project.start_time) : day.startOf('day').toDate(),
        end_at: project.end_time ? timeOnDate(day, project.end_time) : day.endOf('day').toDate(),
        metadata_json: { label: 'Booked by BEIGE', project_id: project.stream_project_booking_id },
      };
    });
};

const calculateAvailability = async (crewMemberId, { start_at, end_at }) => {
  const startAt = moment(start_at).startOf('day');
  const endAt = moment(end_at).endOf('day');

  if (!startAt.isValid() || !endAt.isValid() || endAt.isBefore(startAt)) {
    const error = new Error('A valid start_at and end_at range is required');
    error.statusCode = 400;
    throw error;
  }

  const rules = await creator_availability_rules.findAll({
    where: { crew_member_id: crewMemberId, is_active: 1 },
  });

  const windows = [];
  for (const day = startAt.clone(); day.isSameOrBefore(endAt, 'day'); day.add(1, 'day')) {
    const dayRules = rules.filter((rule) => Number(rule.day_of_week) === day.day());
    dayRules.forEach((rule) => {
      windows.push({
        source: 'creator_rule',
        start_at: timeOnDate(day, rule.start_time),
        end_at: timeOnDate(day, rule.end_time),
        timezone: rule.timezone,
      });
    });
  }

  const storedBlocks = await listBlocks(crewMemberId, {
    start_at: startAt.toDate(),
    end_at: endAt.toDate(),
  });
  const beigeBlocks = await getBeigeBookingBlocks(crewMemberId, startAt.toDate(), endAt.toDate());
  const blocks = [...storedBlocks, ...beigeBlocks].sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  const available_windows = subtractBlocks(windows, blocks);

  return {
    crew_member_id: crewMemberId,
    range: {
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
    },
    available_windows,
    blocks,
  };
};

module.exports = {
  buildGoogleAuthUrl,
  calculateAvailability,
  connectGoogle,
  createManualBlock,
  deleteManualBlock,
  disconnectGoogle,
  getConnectionStatus,
  listBlocks,
  listRules,
  normalizeCrewMemberId,
  replaceRules,
  syncGoogleBusyBlocks,
  syncStaleGoogleBusyBlocks,
};
