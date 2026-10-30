const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const db = require('../models');

const GOOGLE_PROVIDER = 'google';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';
const BULK_SYNC_DELAY_MS = Math.max(100, Number(process.env.FINANCE_GOOGLE_CALENDAR_SYNC_DELAY_MS || 250));
const FINANCE_CALENDAR_TIMEZONE = String(process.env.FINANCE_GOOGLE_CALENDAR_TIMEZONE || 'America/Los_Angeles').trim();
const CP_PAYMENT_REMINDER_TIME = '10:00:00';
const CP_PAYMENT_EVENT_END_TIME = '10:15:00';

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const isRateLimitError = (error) => {
  const status = Number(error?.code || error?.status || error?.response?.status);
  const message = String(error?.message || error?.response?.data?.error?.message || '').toLowerCase();
  return status === 429 || message.includes('rate limit') || message.includes('quota exceeded');
};

async function withGoogleRateLimitRetry(work, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      if (!isRateLimitError(error) || attempt === attempts - 1) throw error;
      await sleep(1000 * (attempt + 1));
    }
  }
  throw lastError;
}

const getEncryptionKey = () => crypto
  .createHash('sha256')
  .update(String(process.env.CALENDAR_TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET || 'beige-calendar-token-key'))
  .digest();

function encrypt(value) {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

function decrypt(value) {
  if (!value) return null;
  const input = Buffer.from(String(value), 'base64');
  const iv = input.subarray(0, 12);
  const tag = input.subarray(12, 28);
  const encrypted = input.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function getGoogleOAuthClient() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || process.env.GOOGLE_CALENDAR_CLIENT_SECRETE || process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.FINANCE_GOOGLE_CALENDAR_REDIRECT_URI ||
    `${String(process.env.API_BASE_URL || 'http://localhost:5001/v1').replace(/\/+$/, '')}/finance/google-calendar/callback`;

  if (!clientId || !clientSecret) {
    const error = new Error('Google Calendar OAuth is not configured');
    error.statusCode = 500;
    throw error;
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getFrontendBaseUrl() {
  return String(process.env.FRONTEND_URL || 'https://beige.app').replace(/\/+$/, '');
}

async function getConnection() {
  return db.finance_calendar_connections.findOne({ where: { provider: GOOGLE_PROVIDER } });
}

async function getAuthorizedClient(connection) {
  if (!connection || connection.disconnected_at || !connection.refresh_token_encrypted) {
    const error = new Error('Finance Google Calendar is not connected');
    error.statusCode = 409;
    throw error;
  }
  const oauth2Client = getGoogleOAuthClient();
  oauth2Client.setCredentials({
    access_token: decrypt(connection.access_token_encrypted),
    refresh_token: decrypt(connection.refresh_token_encrypted),
    expiry_date: connection.token_expiry ? new Date(connection.token_expiry).getTime() : undefined
  });
  return oauth2Client;
}

async function persistRefreshedTokens(connection, oauth2Client) {
  const tokens = oauth2Client.credentials || {};
  await connection.update({
    access_token_encrypted: tokens.access_token ? encrypt(tokens.access_token) : connection.access_token_encrypted,
    refresh_token_encrypted: tokens.refresh_token ? encrypt(tokens.refresh_token) : connection.refresh_token_encrypted,
    token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date) : connection.token_expiry
  });
}

function buildGoogleAuthUrl({ userId }) {
  const oauth2Client = getGoogleOAuthClient();
  const state = jwt.sign({ provider: GOOGLE_PROVIDER, user_id: userId, scope: 'finance_calendar' }, process.env.JWT_SECRET, { expiresIn: '15m' });
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [CALENDAR_SCOPE],
    state
  });
}

async function connectGoogle({ code, state }) {
  const decoded = jwt.verify(state, process.env.JWT_SECRET);
  if (decoded.provider !== GOOGLE_PROVIDER || decoded.scope !== 'finance_calendar') {
    const error = new Error('Invalid finance Google Calendar connection state');
    error.statusCode = 400;
    throw error;
  }

  const oauth2Client = getGoogleOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  let accountEmail = null;
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    accountEmail = (await oauth2.userinfo.get())?.data?.email || null;
  } catch (_) {
    // The connection remains usable even when Google does not return profile data.
  }

  const [connection] = await db.finance_calendar_connections.findOrCreate({
    where: { provider: GOOGLE_PROVIDER },
    defaults: { provider: GOOGLE_PROVIDER }
  });

  await connection.update({
    provider_account_email: accountEmail || connection.provider_account_email,
    access_token_encrypted: encrypt(tokens.access_token),
    refresh_token_encrypted: tokens.refresh_token ? encrypt(tokens.refresh_token) : connection.refresh_token_encrypted,
    token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    sync_status: 'connected',
    last_sync_error: null,
    disconnected_at: null
  });

  return getConnectionStatus();
}

async function getConnectionStatus() {
  const connection = await getConnection();
  if (!connection || connection.disconnected_at || !connection.refresh_token_encrypted) {
    return { provider: GOOGLE_PROVIDER, connected: false, sync_status: 'not_connected' };
  }
  return {
    provider: GOOGLE_PROVIDER,
    connected: true,
    provider_account_email: connection.provider_account_email,
    selected_calendar_id: connection.selected_calendar_id,
    selected_calendar_name: connection.selected_calendar_name,
    sync_status: connection.sync_status,
    last_synced_at: connection.last_synced_at,
    last_sync_error: connection.last_sync_error
  };
}

async function listGoogleCalendars() {
  const connection = await getConnection();
  const oauth2Client = await getAuthorizedClient(connection);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const response = await calendar.calendarList.list();
  await persistRefreshedTokens(connection, oauth2Client);
  return (response.data.items || []).map((item) => ({
    id: item.id,
    name: item.summaryOverride || item.summary || item.id,
    primary: Boolean(item.primary),
    access_role: item.accessRole || null
  }));
}

async function selectGoogleCalendar(calendarId) {
  const normalizedId = String(calendarId || '').trim();
  if (!normalizedId) {
    const error = new Error('calendar_id is required');
    error.statusCode = 400;
    throw error;
  }
  const connection = await getConnection();
  const oauth2Client = await getAuthorizedClient(connection);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const response = await calendar.calendarList.get({ calendarId: normalizedId });
  await persistRefreshedTokens(connection, oauth2Client);
  await connection.update({
    selected_calendar_id: normalizedId,
    selected_calendar_name: response.data.summaryOverride || response.data.summary || normalizedId,
    sync_status: 'connected',
    last_sync_error: null
  });
  return getConnectionStatus();
}

async function disconnectGoogle() {
  const connection = await getConnection();
  if (connection) {
    await connection.update({
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      token_expiry: null,
      selected_calendar_id: null,
      selected_calendar_name: null,
      sync_status: 'not_connected',
      disconnected_at: new Date()
    });
  }
  return { provider: GOOGLE_PROVIDER, connected: false, sync_status: 'not_connected' };
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function toDateOnly(value) {
  const match = String(value || '').match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function addDays(dateOnly, days) {
  const date = new Date(`${dateOnly}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function resolveDueDate(earning) {
  const metadata = parseJson(earning.metadata_json);
  return toDateOnly(metadata.due_date || metadata.payout_due_date) ||
    (toDateOnly(earning.booking?.event_date) ? addDays(toDateOnly(earning.booking.event_date), 15) : null);
}

async function getRemainingBalance(earning) {
  const [advances, payouts] = await Promise.all([
    db.creator_earning_advances.findAll({
      where: { creator_earning_id: earning.creator_earning_id, status: 'processed' },
      attributes: ['amount']
    }),
    db.creator_payout_requests.findAll({
      where: {
        creator_id: earning.creator_id,
        status: { [db.Sequelize.Op.in]: ['requested', 'approved', 'processing', 'paid'] }
      },
      attributes: ['amount', 'metadata_json']
    })
  ]);

  const payoutTotals = payouts.reduce((total, payout) => {
    const metadata = parseJson(payout.metadata_json);
    return metadata.source === 'cp_compensation' && Number(metadata.creator_earning_id) === Number(earning.creator_earning_id)
      ? total + Number(payout.amount || 0)
      : total;
  }, 0);
  const advanceTotal = advances.reduce((total, advance) => total + Number(advance.amount || 0), 0);
  // An advance that has a payout request is already included in payoutTotals.
  const payoutAdvanceTotal = payouts.reduce((total, payout) => {
    const metadata = parseJson(payout.metadata_json);
    return metadata.source === 'cp_compensation' && Number(metadata.creator_earning_id) === Number(earning.creator_earning_id) && metadata.payment_scope === 'advance'
      ? total + Number(payout.amount || 0)
      : total;
  }, 0);
  const paid = payoutTotals + Math.max(advanceTotal - payoutAdvanceTotal, 0);
  return Math.max(Number(earning.net_earning_amount || earning.gross_amount || 0) - paid, 0);
}

function buildEventBody({ earning, remainingBalance, dueDate }) {
  const booking = earning.booking || {};
  const creator = earning.creator || {};
  const cpName = [creator.first_name, creator.last_name].filter(Boolean).join(' ') || 'Creative Partner';
  const today = new Date().toISOString().slice(0, 10);
  const overdue = dueDate < today;
  const frontendBase = getFrontendBaseUrl();
  const dashboardLink = `${frontendBase}/admin/finances/cpCompensation?booking_id=${encodeURIComponent(earning.booking_id)}`;
  const status = overdue ? 'OVERDUE' : (earning.status === 'paid' ? 'Paid' : 'Approved');
  const eventStart = `${dueDate}T${CP_PAYMENT_REMINDER_TIME}`;
  const eventEnd = `${dueDate}T${CP_PAYMENT_EVENT_END_TIME}`;
  return {
    summary: `${overdue ? 'OVERDUE — ' : ''}CP Payment Due — ${booking.project_name || `Booking #${earning.booking_id}`}`,
    description: [
      `Booking: #${earning.booking_id}`,
      `Creative Partner: ${cpName}`,
      `Remaining Amount: $${remainingBalance.toFixed(2)}`,
      `Status: ${status}`,
      `Due Date: ${dueDate}`,
      `Open in Beige: ${dashboardLink}`
    ].join('\n'),
    // A timed event is required for an exact Google Calendar push reminder.
    // `popup` is delivered by the connected Google Calendar account.
    start: { dateTime: eventStart, timeZone: FINANCE_CALENDAR_TIMEZONE },
    end: { dateTime: eventEnd, timeZone: FINANCE_CALENDAR_TIMEZONE },
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 0 }]
    },
    colorId: overdue ? '11' : '5',
    extendedProperties: {
      private: {
        beige_source: 'cp_compensation',
        creator_earning_id: String(earning.creator_earning_id),
        booking_id: String(earning.booking_id)
      }
    }
  };
}

async function loadEarning(creatorEarningId) {
  return db.creator_earnings.findByPk(creatorEarningId, {
    include: [
      { model: db.stream_project_booking, as: 'booking', required: true, attributes: ['stream_project_booking_id', 'project_name', 'event_date'] },
      { model: db.crew_members, as: 'creator', required: false, attributes: ['crew_member_id', 'first_name', 'last_name'] }
    ]
  });
}

async function deleteEarningEvent({ earning, connection, calendar }) {
  const calendarId = earning.finance_google_calendar_id || connection.selected_calendar_id;
  if (earning.finance_google_calendar_event_id && calendarId) {
    try {
      await withGoogleRateLimitRetry(() => calendar.events.delete({ calendarId, eventId: earning.finance_google_calendar_event_id }));
    } catch (error) {
      const status = Number(error.code || error.status || error.response?.status);
      if (status !== 404 && status !== 410) throw error;
    }
  }
  await earning.update({
    finance_google_calendar_event_id: null,
    finance_google_calendar_id: null,
    finance_google_calendar_synced_at: new Date(),
    finance_google_calendar_sync_error: null
  });
  return { action: 'deleted', creator_earning_id: earning.creator_earning_id };
}

async function syncEarning(creatorEarningId) {
  const earning = await loadEarning(creatorEarningId);
  if (!earning) return { skipped: true, reason: 'creator_earning_not_found' };
  const connection = await getConnection();
  if (!connection || connection.disconnected_at || !connection.refresh_token_encrypted || !connection.selected_calendar_id) {
    return { skipped: true, reason: 'finance_google_calendar_not_connected' };
  }

  try {
    const oauth2Client = await getAuthorizedClient(connection);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const remainingBalance = await getRemainingBalance(earning);
    const dueDate = resolveDueDate(earning);
    const shouldDelete = earning.approval_status !== 'approved' || earning.status === 'paid' || remainingBalance <= 0 || !dueDate;

    if (shouldDelete) {
      const result = await deleteEarningEvent({ earning, connection, calendar });
      await persistRefreshedTokens(connection, oauth2Client);
      return result;
    }

    const requestBody = buildEventBody({ earning, remainingBalance, dueDate });
    let event;
    if (earning.finance_google_calendar_event_id && earning.finance_google_calendar_id === connection.selected_calendar_id) {
      try {
        event = await withGoogleRateLimitRetry(() => calendar.events.update({
          calendarId: connection.selected_calendar_id,
          eventId: earning.finance_google_calendar_event_id,
          requestBody
        }));
      } catch (error) {
        const status = Number(error.code || error.status || error.response?.status);
        if (status !== 404 && status !== 410) throw error;
      }
    }
    if (!event) {
      event = await withGoogleRateLimitRetry(() => calendar.events.insert({
        calendarId: connection.selected_calendar_id,
        requestBody
      }));
    }

    await earning.update({
      finance_google_calendar_event_id: event.data.id,
      finance_google_calendar_id: connection.selected_calendar_id,
      finance_google_calendar_synced_at: new Date(),
      finance_google_calendar_sync_error: null
    });
    await persistRefreshedTokens(connection, oauth2Client);
    await connection.update({ sync_status: 'connected', last_synced_at: new Date(), last_sync_error: null });
    return { action: earning.finance_google_calendar_event_id === event.data.id ? 'updated' : 'created', creator_earning_id: earning.creator_earning_id, event_id: event.data.id };
  } catch (error) {
    await earning.update({ finance_google_calendar_sync_error: error.message }).catch(() => null);
    await connection.update({ sync_status: 'failed', last_sync_error: error.message }).catch(() => null);
    throw error;
  }
}

async function syncAllOpenEarnings() {
  const earnings = await db.creator_earnings.findAll({
    // Approved earnings may need an event created/updated. Rows that already
    // have a Calendar event must also be revisited so a failed immediate sync
    // can later remove the event after payment or rejection.
    where: {
      [db.Sequelize.Op.or]: [
        { approval_status: 'approved' },
        { finance_google_calendar_event_id: { [db.Sequelize.Op.ne]: null } }
      ]
    },
    attributes: ['creator_earning_id']
  });
  const results = [];
  // Google Calendar has per-user request limits. Run sequentially so an
  // initial sync of many historical payouts does not leave events unsynced.
  for (const [index, earning] of earnings.entries()) {
    try {
      results.push({ status: 'fulfilled', value: await syncEarning(earning.creator_earning_id) });
    } catch (error) {
      results.push({ status: 'rejected', reason: error });
    }
    if (index < earnings.length - 1) await sleep(BULK_SYNC_DELAY_MS);
  }
  return results;
}

module.exports = {
  buildGoogleAuthUrl,
  connectGoogle,
  disconnectGoogle,
  getConnectionStatus,
  getFrontendBaseUrl,
  getAuthorizedClient,
  getConnection,
  listGoogleCalendars,
  persistRefreshedTokens,
  selectGoogleCalendar,
  syncAllOpenEarnings,
  syncEarning
};
