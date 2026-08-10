require('dotenv').config();

const mysql = require('mysql2/promise');
let mongoose;
try {
  mongoose = require('mongoose');
} catch (_) {
  mongoose = require('../../beige-tech-mobile-web-api-2/node_modules/mongoose');
}

const MONGO_URL = process.env.MONGODB_URL;
const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const ROOM_ID = process.argv.find((arg) => arg.startsWith('--room-id='))?.split('=')[1] || null;

if (!MONGO_URL) {
  throw new Error('MONGODB_URL is required');
}

if (!DRY_RUN && !APPLY) {
  throw new Error('Pass --dry-run or --apply');
}

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeId = (value) => String(value || '').trim();

const pickExpectedClient = async (connection, booking) => {
  const bookingUserId = Number(booking.user_id);
  const bookingEmail = normalizeEmail(booking.guest_email);
  const lookups = [];

  if (bookingEmail) {
    lookups.push(['email', 'SELECT client_id, user_id, name, email FROM clients WHERE LOWER(email) = ? LIMIT 1', [bookingEmail]]);
  }
  if (Number.isFinite(bookingUserId)) {
    lookups.push(['user_id', 'SELECT client_id, user_id, name, email FROM clients WHERE user_id = ? LIMIT 1', [bookingUserId]]);
    lookups.push(['client_id', 'SELECT client_id, user_id, name, email FROM clients WHERE client_id = ? LIMIT 1', [bookingUserId]]);
  }

  for (const [source, sql, params] of lookups) {
    const [rows] = await connection.execute(sql, params);
    if (rows.length) {
      const client = rows[0];
      return {
        id: normalizeId(client.user_id || client.client_id || booking.user_id),
        name: client.name || client.email || booking.guest_email || `Client ${booking.user_id}`,
        email: client.email || booking.guest_email || null,
        source,
        client_id: normalizeId(client.client_id),
        user_id: normalizeId(client.user_id),
      };
    }
  }

  if (Number.isFinite(bookingUserId)) {
    const [users] = await connection.execute(
      'SELECT id, name, email FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
      [bookingUserId]
    );
    if (users.length) {
      const user = users[0];
      return {
        id: normalizeId(user.id),
        name: user.name || user.email || booking.guest_email || `Client ${booking.user_id}`,
        email: user.email || booking.guest_email || null,
        source: 'users.id',
        client_id: '',
        user_id: normalizeId(user.id),
      };
    }
  }

  return null;
};

const isMismatch = (snapshot, expected) => {
  if (!snapshot || !expected) return true;
  const snapshotId = normalizeId(snapshot.id);
  const snapshotEmail = normalizeEmail(snapshot.email);
  const expectedId = normalizeId(expected.id);
  const expectedEmail = normalizeEmail(expected.email);

  if (expectedEmail && snapshotEmail && expectedEmail !== snapshotEmail) return true;
  if (expectedId && snapshotId && expectedId !== snapshotId) return true;
  return false;
};

const main = async () => {
  const connection = await mysql.createConnection({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT || 3306),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASS,
  });

  await mongoose.connect(MONGO_URL);

  const [rows] = await connection.execute(
    `
      SELECT
        m.room_id,
        m.booking_id,
        b.user_id,
        b.guest_email,
        b.project_name
      FROM chat_room_mappings m
      INNER JOIN stream_project_booking b
        ON b.stream_project_booking_id = m.booking_id
      ${ROOM_ID ? 'WHERE m.room_id = ?' : ''}
      ORDER BY m.booking_id ASC
    `,
    ROOM_ID ? [ROOM_ID] : []
  );

  const collection = mongoose.connection.db.collection('chatrooms');
  const mismatches = [];
  let checked = 0;
  let updated = 0;

  for (const row of rows) {
    const room = await collection.findOne(
      { _id: new mongoose.Types.ObjectId(row.room_id) },
      { projection: { client_snapshot: 1, client_id: 1, external_order_ref: 1 } }
    );
    if (!room) continue;

    checked += 1;
    const expected = await pickExpectedClient(connection, row);
    if (!expected || !isMismatch(room.client_snapshot, expected)) continue;

    const mismatch = {
      room_id: row.room_id,
      booking_id: row.booking_id,
      project_name: row.project_name,
      current: room.client_snapshot || null,
      expected,
    };
    mismatches.push(mismatch);

    if (APPLY) {
      const update = {
        'client_snapshot.id': expected.id,
        'client_snapshot.name': expected.name,
        'client_snapshot.email': expected.email,
        'client_snapshot.role': 'client',
      };
      if (!room.client_snapshot?.added_at) {
        update['client_snapshot.added_at'] = new Date();
      }
      await collection.updateOne(
        { _id: room._id },
        {
          $set: update,
          $unset: { client_id: '' },
        }
      );
      updated += 1;
    }
  }

  console.log(JSON.stringify({
    mode: APPLY ? 'apply' : 'dry-run',
    checked,
    mismatches: mismatches.length,
    updated,
    details: mismatches,
  }, null, 2));

  await mongoose.disconnect();
  await connection.end();
};

main().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
