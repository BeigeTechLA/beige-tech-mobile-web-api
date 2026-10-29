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

// A room can legitimately point to a different booking client, so never infer
// identity from booking data. Only migrate a snapshot when its own old ID and
// email exactly match one clients row with a non-empty platform user_id.
const findVerifiedSnapshotClient = async (connection, snapshot) => {
  const clientId = Number(snapshot?.id);
  const email = normalizeEmail(snapshot?.email);
  if (!Number.isFinite(clientId) || !email) return null;

  const [rows] = await connection.execute(
    `
      SELECT client_id, user_id, name, email
      FROM clients
      WHERE client_id = ?
        AND LOWER(email) = ?
        AND user_id IS NOT NULL
      LIMIT 2
    `,
    [clientId, email]
  );

  if (rows.length !== 1) return null;
  const client = rows[0];
  const userId = normalizeId(client.user_id);
  if (!userId || userId === normalizeId(snapshot.id)) return null;

  return {
    id: userId,
    name: client.name || snapshot.name || client.email,
    email: client.email,
    client_id: normalizeId(client.client_id),
    user_id: userId,
  };
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
  const skipped = [];
  let checked = 0;
  let updated = 0;

  for (const row of rows) {
    const room = await collection.findOne(
      { _id: new mongoose.Types.ObjectId(row.room_id) },
      { projection: { client_snapshot: 1, client_id: 1, external_order_ref: 1 } }
    );
    if (!room) continue;

    checked += 1;
    const expected = await findVerifiedSnapshotClient(connection, room.client_snapshot);
    if (!expected) {
      skipped.push({
        room_id: row.room_id,
        booking_id: row.booking_id,
        project_name: row.project_name,
        current: room.client_snapshot || null,
        reason: 'NO_EXACT_CLIENT_ID_AND_EMAIL_MAPPING',
      });
      continue;
    }

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
      };
      await collection.updateOne(
        {
          _id: room._id,
          'client_snapshot.id': normalizeId(room.client_snapshot?.id),
          'client_snapshot.email': room.client_snapshot?.email,
        },
        {
          $set: update,
        }
      );
      updated += 1;
    }
  }

  console.log(JSON.stringify({
    mode: APPLY ? 'apply' : 'dry-run',
    checked,
    mismatches: mismatches.length,
    skipped: skipped.length,
    updated,
    details: mismatches,
    skipped_details: skipped,
  }, null, 2));

  await mongoose.disconnect();
  await connection.end();
};

main().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
