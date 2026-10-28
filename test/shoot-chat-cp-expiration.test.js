const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/models');
const { getFinalShootEnd, runShootChatCpExpirationJob } = require('../src/services/shoot-chat-cp-expiration.service');

test('uses the final shoot day and its time zone', () => {
  const booking = { event_date: '2026-10-20', end_time: '18:00:00', time_zone: 'Asia/Kolkata' };
  const days = [
    { event_date: '2026-10-20', end_time: '18:00:00', time_zone: 'Asia/Kolkata' },
    { event_date: '2026-10-22', end_time: '20:00:00', time_zone: 'America/New_York' },
  ];
  assert.equal(getFinalShootEnd(booking, days).toISOString(), '2026-10-23T00:00:00.000Z');
});

test('handles an overnight final day and missing end time conservatively', () => {
  assert.equal(getFinalShootEnd({
    event_date: '2026-10-21', start_time: '22:00:00', end_time: '02:00:00', time_zone: 'Asia/Kolkata',
  }).toISOString(), '2026-10-21T20:30:00.000Z');
  assert.equal(getFinalShootEnd({
    event_date: '2026-10-21', time_zone: 'Asia/Kolkata',
  }).toISOString(), '2026-10-21T18:29:59.000Z');
});

test('removes only CPs after the cutoff and marks the room complete', async () => {
  const originalQuery = db.sequelize.query;
  const originalFindAll = db.stream_project_booking_days.findAll;
  const originalFetch = global.fetch;
  const calls = [];
  const updates = [];
  db.sequelize.query = async (sql, options) => {
    if (sql.startsWith('SELECT')) return [{
      mapping_id: 1, room_id: 'room-1', booking_id: 42,
      event_date: '2026-10-21', end_time: '18:00:00', time_zone: 'Asia/Kolkata',
    }];
    updates.push(options.replacements.mappingId);
    return [];
  };
  db.stream_project_booking_days.findAll = async () => [];
  global.fetch = async (url, options) => {
    calls.push({ url, method: options.method || 'GET', body: options.body });
    if (options.method === 'DELETE') return { ok: true, json: async () => ({ success: true }) };
    return { ok: true, json: async () => ({ cps: [{ id: 'cp-1' }], managers: [{ id: 'staff-1' }] }) };
  };
  try {
    const before = await runShootChatCpExpirationJob(new Date('2026-10-22T12:29:59Z'));
    assert.deepEqual(before, { rooms_checked: 0, cps_removed: 0 });
    assert.equal(calls.length, 0);

    const after = await runShootChatCpExpirationJob(new Date('2026-10-22T12:30:00Z'));
    assert.deepEqual(after, { rooms_checked: 1, cps_removed: 1 });
    assert.deepEqual(calls.map((call) => call.method), ['GET', 'DELETE']);
    assert.equal(JSON.parse(calls[1].body).role, 'cp');
    assert.deepEqual(updates, [1]);
  } finally {
    db.sequelize.query = originalQuery;
    db.stream_project_booking_days.findAll = originalFindAll;
    global.fetch = originalFetch;
  }
});
