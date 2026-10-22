const db = require('../models');

const BASE_URL = process.env.EXTERNAL_CHAT_API_BASE_URL || 'http://localhost:5002/v1/external-chat';
const INTERNAL_KEY = process.env.EXTERNAL_CHAT_KEY || process.env.EXTERNAL_FILE_MANAGER_KEY || 'beige-internal-dev-key';
const DEFAULT_TIME_ZONE = process.env.SHOOT_REMINDER_TIME_ZONE || process.env.APP_TIME_ZONE || 'Asia/Kolkata';
const PAGE_SIZE = 200;
const DAY_MS = 24 * 60 * 60 * 1000;
const INTERVAL_MINUTES = Math.max(5, Number.parseInt(process.env.SHOOT_CHAT_CP_EXPIRATION_INTERVAL_MINUTES || '30', 10) || 30);
let isRunning = false;

const dateOnly = (value) => value instanceof Date
  ? value.toISOString().slice(0, 10)
  : String(value || '').slice(0, 10);

const zonedDateTime = (date, time, timeZone) => {
  const day = dateOnly(date);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(time || ''));
  if (!match || !timeMatch) return null;

  const [, year, month, dayOfMonth] = match.map(Number);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] || 0);
  if (hour > 23 || minute > 59 || second > 59) return null;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const utcGuess = Date.UTC(year, month - 1, dayOfMonth, hour, minute, second);
  let timestamp = utcGuess;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = formatter.formatToParts(new Date(timestamp));
    const part = (type) => Number(parts.find((entry) => entry.type === type)?.value);
    const wallClock = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
    const corrected = timestamp + utcGuess - wallClock;
    if (corrected === timestamp) break;
    timestamp = corrected;
  }
  return new Date(timestamp);
};

const getFinalShootEnd = (booking, days = []) => {
  const entries = days.length ? days : [booking];
  const finalDate = entries.map((day) => dateOnly(day.event_date)).sort().at(-1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(finalDate || '')) return null;

  let latestEnd = null;
  for (const day of entries.filter((entry) => dateOnly(entry.event_date) === finalDate)) {
    const timeZone = day.time_zone || booking.time_zone || DEFAULT_TIME_ZONE;
    // Missing end time means the shoot may last until the end of its local day.
    const endTime = day.end_time || '23:59:59';
    let end = zonedDateTime(finalDate, endTime, timeZone);
    if (!end) return null;
    if (day.end_time && day.start_time && endTime <= String(day.start_time).slice(0, 8)) {
      const nextDate = new Date(`${finalDate}T00:00:00Z`);
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);
      end = zonedDateTime(nextDate.toISOString().slice(0, 10), endTime, timeZone);
    }
    if (!latestEnd || end > latestEnd) latestEnd = end;
  }
  return latestEnd;
};

const chatRequest = async (path, options = {}) => {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'x-internal-key': INTERNAL_KEY },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || `External chat request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload;
};

const removeCpsFromRoom = async (roomId) => {
  const path = `/participants/${encodeURIComponent(roomId)}`;
  const payload = await chatRequest(path);
  const participants = payload?.data?.cps || payload?.cps || [];
  let removed = 0;
  for (const cp of participants) {
    const id = String(cp?.id || cp?._id || cp || '').trim();
    if (!id || id === '[object Object]') continue;
    try {
      await chatRequest(`${path}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        body: JSON.stringify({ role: 'cp', adminId: 'beige-system', adminUser: { id: 'beige-system', name: 'Beige System' } }),
      });
      removed += 1;
    } catch (error) {
      // A second scheduler instance may have removed this CP after our GET.
      if (error.status !== 404) throw error;
    }
  }
  return removed;
};

const runShootChatCpExpirationJob = async (now = new Date()) => {
  if (isRunning) return { skipped: true, reason: 'already_running' };
  isRunning = true;
  let cursor = 0;
  let roomsChecked = 0;
  let cpsRemoved = 0;
  try {
    while (true) {
      const mappings = await db.sequelize.query(
        `SELECT m.id AS mapping_id, m.room_id, b.stream_project_booking_id AS booking_id,
                b.event_date, b.start_time, b.end_time, b.time_zone
         FROM chat_room_mappings m
         JOIN stream_project_booking b ON b.stream_project_booking_id = m.booking_id
         WHERE m.id > :cursor AND m.cp_expired_at IS NULL
         ORDER BY m.id ASC LIMIT ${PAGE_SIZE}`,
        { replacements: { cursor }, type: db.Sequelize.QueryTypes.SELECT }
      );
      if (!mappings.length) break;
      cursor = mappings[mappings.length - 1].mapping_id;
      const days = await db.stream_project_booking_days.findAll({
        where: { stream_project_booking_id: { [db.Sequelize.Op.in]: mappings.map((row) => row.booking_id) } },
        attributes: ['stream_project_booking_id', 'event_date', 'start_time', 'end_time', 'time_zone'],
        raw: true,
      });
      const daysByBooking = new Map();
      for (const day of days) {
        const key = String(day.stream_project_booking_id);
        if (!daysByBooking.has(key)) daysByBooking.set(key, []);
        daysByBooking.get(key).push(day);
      }

      for (const mapping of mappings) {
        try {
          const finalEnd = getFinalShootEnd(mapping, daysByBooking.get(String(mapping.booking_id)) || []);
          if (!finalEnd || finalEnd.getTime() + DAY_MS > now.getTime()) continue;
          roomsChecked += 1;
          cpsRemoved += await removeCpsFromRoom(mapping.room_id);
          await db.sequelize.query(
            'UPDATE chat_room_mappings SET cp_expired_at = UTC_TIMESTAMP() WHERE id = :mappingId AND cp_expired_at IS NULL',
            { replacements: { mappingId: mapping.mapping_id } }
          );
        } catch (error) {
          console.error(`[Shoot Chat CP Expiration] Room ${mapping.room_id} failed:`, error.message || error);
        }
      }
      if (mappings.length < PAGE_SIZE) break;
    }
    if (cpsRemoved) console.log(`[Shoot Chat CP Expiration] Removed ${cpsRemoved} CP(s) across ${roomsChecked} due room(s)`);
    return { rooms_checked: roomsChecked, cps_removed: cpsRemoved };
  } finally {
    isRunning = false;
  }
};

const startShootChatCpExpirationJob = () => {
  if (String(process.env.ENABLE_SHOOT_CHAT_CP_EXPIRATION_JOB || 'true').toLowerCase() !== 'true') return;
  const run = () => runShootChatCpExpirationJob().catch((error) => {
    console.error('[Shoot Chat CP Expiration] Job failed:', error.message || error);
  });
  run();
  setInterval(run, INTERVAL_MINUTES * 60 * 1000);
  console.log(`[Shoot Chat CP Expiration] Scheduled every ${INTERVAL_MINUTES} minutes`);
};

module.exports = { startShootChatCpExpirationJob, runShootChatCpExpirationJob, getFinalShootEnd };
