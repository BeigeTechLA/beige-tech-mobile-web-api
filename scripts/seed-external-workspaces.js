/**
 * Backfill external file manager workspaces for legacy bookings.
 *
 * Usage:
 *   node scripts/seed-external-workspaces.js --paid-only
 *   node scripts/seed-external-workspaces.js --ids 101,102,103
 *   node scripts/seed-external-workspaces.js --json ./scripts/booking-ids.json
 *   node scripts/seed-external-workspaces.js --limit 50 --dry-run
 *
 * Notes:
 * - Uses existing external file manager sync logic.
 * - By default only paid, active, non-cancelled bookings are processed.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../src/models');
const externalFileManagerController = require('../src/controllers/external-file-manager.controller');

const args = process.argv.slice(2);

const hasFlag = (flag) => args.includes(flag);
const getFlagValue = (flag) => {
  const index = args.indexOf(flag);
  if (index === -1 || index === args.length - 1) return null;
  return args[index + 1];
};

const parseIdList = (value) => {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((id) => Number(String(id).trim()))
    .filter((id) => Number.isFinite(id) && id > 0);
};

const loadIdsFromJson = (jsonPath) => {
  if (!jsonPath) return [];
  const resolved = path.resolve(process.cwd(), jsonPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`JSON file not found: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, 'utf8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parseIdList(parsed);
  if (Array.isArray(parsed.bookingIds)) return parseIdList(parsed.bookingIds);
  throw new Error('JSON must be an array of ids or { "bookingIds": [ ... ] }');
};

const dryRun = hasFlag('--dry-run');
const includeUnpaid = hasFlag('--include-unpaid');
const includeCancelled = hasFlag('--include-cancelled');
const onlyInactive = hasFlag('--only-inactive');
const limit = Number(getFlagValue('--limit')) || null;

const idsFromArgs = parseIdList(getFlagValue('--ids') || getFlagValue('--booking-ids'));
const idsFromJson = loadIdsFromJson(getFlagValue('--json'));
const bookingIds = [...new Set([...idsFromArgs, ...idsFromJson])];

const { Op } = db.Sequelize;

async function loadBookings() {
  const where = {};

  if (bookingIds.length > 0) {
    where.stream_project_booking_id = bookingIds;
  } else {
    if (!includeUnpaid) {
      where.payment_completed_at = { [Op.not]: null };
    }
    if (!includeCancelled) {
      where.is_cancelled = 0;
    }
    if (!onlyInactive) {
      where.is_active = 1;
    }
  }

  const options = {
    where,
    order: [['stream_project_booking_id', 'ASC']],
  };

  if (limit && Number.isFinite(limit)) {
    options.limit = limit;
  }

  return db.stream_project_booking.findAll(options);
}

async function run() {
  try {
    console.log('Starting external workspace backfill...');
    console.log(`Dry run: ${dryRun ? 'yes' : 'no'}`);
    console.log(`Include unpaid: ${includeUnpaid ? 'yes' : 'no'}`);
    console.log(`Include cancelled: ${includeCancelled ? 'yes' : 'no'}`);
    console.log(`Only inactive: ${onlyInactive ? 'yes' : 'no'}`);
    if (limit) console.log(`Limit: ${limit}`);
    if (bookingIds.length) console.log(`Booking IDs: ${bookingIds.join(', ')}`);

    const bookings = await loadBookings();
    if (!bookings.length) {
      console.log('No bookings found for backfill.');
      process.exit(0);
    }

    console.log(`Found ${bookings.length} booking(s) to process.`);

    let successCount = 0;
    let failCount = 0;

    for (const booking of bookings) {
      const bookingId = booking.stream_project_booking_id;
      const label = `${bookingId} - ${booking.project_name || 'Untitled'}`;

      if (dryRun) {
        console.log(`[DRY RUN] Would sync workspace for ${label}`);
        continue;
      }

      try {
        const result = await externalFileManagerController.syncWorkspaceForBookingFromRecord(booking);
        if (result?.success) {
          successCount += 1;
          console.log(`[OK] Workspace synced for ${label}`);
        } else {
          failCount += 1;
          console.log(`[WARN] Workspace not synced for ${label}: ${result?.message || 'unknown response'}`);
        }
      } catch (error) {
        failCount += 1;
        console.log(`[ERROR] Workspace sync failed for ${label}: ${error.message}`);
      }
    }

    console.log(`Done. Success: ${successCount}, Failed: ${failCount}`);
    process.exit(failCount ? 1 : 0);
  } catch (error) {
    console.error('Backfill failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

run();
