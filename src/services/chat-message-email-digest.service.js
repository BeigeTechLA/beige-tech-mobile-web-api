const db = require('../models');
const emailService = require('../utils/emailService');

const BASE_URL = process.env.EXTERNAL_CHAT_API_BASE_URL || 'http://localhost:5002/v1/external-chat';
const INTERNAL_KEY = process.env.EXTERNAL_CHAT_KEY || process.env.EXTERNAL_FILE_MANAGER_KEY || 'beige-internal-dev-key';
const DIGEST_INTERVAL_HOURS = Math.max(1, Number.parseInt(process.env.CHAT_MESSAGE_EMAIL_DIGEST_INTERVAL_HOURS || '6', 10) || 6);
const CANDIDATE_LOOKBACK_HOURS = Math.max(24, DIGEST_INTERVAL_HOURS * 2);
let isRunning = false;

const toDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const toMySqlDateTime = (value) => {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 23).replace('T', ' ') : null;
};
const request = async (path) => {
  const response = await fetch(`${BASE_URL}${path}`, { headers: { 'x-internal-key': INTERNAL_KEY } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || `External chat request failed (${response.status})`);
  return payload || {};
};
const recipientsFrom = (participants = {}) => {
  const result = new Map();
  const add = (person, role = '') => {
    const email = String(person?.email || person || '').trim().toLowerCase();
    if (email.includes('@')) result.set(email, { email, name: String(person?.name || person?.email || '').trim(), role: String(person?.role || role).toLowerCase() });
  };
  add(participants.client, 'client');
  (participants.clients || []).forEach((person) => add(person, 'client'));
  add(participants.pm, 'pm');
  (participants.cps || []).forEach((person) => add(person, 'cp'));
  (participants.production || []).forEach((person) => add(person, 'production'));
  (participants.managers || []).forEach((person) => add(person, 'manager'));
  return [...result.values()];
};
const dashboardUrl = (role) => {
  const base = String(process.env.FRONTEND_URL || 'https://beige.app').replace(/\/$/, '');
  if (role === 'client') return `${base}/client/dashboard/messages`;
  if (role === 'cp') return `${base}/creative-partner/dashboard/messages`;
  if (role === 'sales_rep') return `${base}/sales/dashboard/messages`;
  return `${base}/admin/messages`;
};
const getState = async (roomId) => {
  const rows = await db.sequelize.query('SELECT last_message_at FROM chat_message_email_digests WHERE chat_room_id = :roomId LIMIT 1', { replacements: { roomId }, type: db.Sequelize.QueryTypes.SELECT });
  return rows[0] || null;
};
const saveState = (roomId, at) => db.sequelize.query(
  `INSERT INTO chat_message_email_digests (chat_room_id, last_message_at, last_email_sent_at)
   VALUES (:roomId, :at, UTC_TIMESTAMP(3))
   ON DUPLICATE KEY UPDATE last_message_at = VALUES(last_message_at), last_email_sent_at = UTC_TIMESTAMP(3)`,
  { replacements: { roomId, at: toMySqlDateTime(at) } }
);

const runChatMessageEmailDigestJob = async () => {
  if (isRunning) return { skipped: true, reason: 'already_running' };
  isRunning = true;
  try {
    const cutoff = new Date(Date.now() - DIGEST_INTERVAL_HOURS * 3600000);
    const since = new Date(Date.now() - CANDIDATE_LOOKBACK_HOURS * 3600000);
    const payload = await request(`/digest-candidates?since=${encodeURIComponent(since.toISOString())}`);
    const candidates = Array.isArray(payload.results) ? payload.results : [];
    let roomsNotified = 0;
    let emailsSent = 0;
    for (const candidate of candidates) {
      const roomId = String(candidate?.room_id || '').trim();
      const message = candidate?.latest_message;
      const messageAt = toDate(message?.createdAt);
      if (!roomId || !messageAt) continue;
      try {
        const state = await getState(roomId);
        if (messageAt <= (toDate(state?.last_message_at) || cutoff)) continue;
        const recipients = recipientsFrom(await request(`/participants/${encodeURIComponent(roomId)}`));
        if (!recipients.length) continue;
        const emailResult = await emailService.sendMessagingInitiatedTemplateEmail({
          recipients: recipients.map((recipient) => ({ ...recipient, data: { client_name: recipient.name || 'there', recipient_name: recipient.name, shoot_name: 'your conversation', chat_url: dashboardUrl(recipient.role) } })),
          data: { chat_room_id: roomId, chat_name: 'your conversation', project_name: 'your conversation', sender_name: message.sent_by_name || message.sent_by_email || '', message_preview: message.message || message.file_name || 'A new message was posted', event_type: 'six_hour_message_digest', sent_at: new Date().toISOString() },
        });
        if (!emailResult?.success) continue;
        await saveState(roomId, messageAt);
        roomsNotified += 1;
        emailsSent += emailResult.sentCount || recipients.length;
      } catch (error) {
        console.error(`[Chat Email Digest] Failed for room ${roomId}:`, error.message || error);
      }
    }
    console.log(`[Chat Email Digest] Completed: ${roomsNotified} room(s), ${emailsSent} email(s) sent`);
    return { rooms_notified: roomsNotified, emails_sent: emailsSent };
  } finally {
    isRunning = false;
  }
};

module.exports = { DIGEST_INTERVAL_HOURS, runChatMessageEmailDigestJob };
