/*
 * Rebuild finance rows from the canonical payment sources.
 *
 * Safe by default: without --apply this only reports the booking IDs that
 * would be reconciled.  With --apply it upserts finance records; it never
 * deletes bookings, payments, or historical finance rows.
 *
 * Usage:
 *   node scripts/backfill-finance-breakdowns.js
 *   node scripts/backfill-finance-breakdowns.js --apply
 *   node scripts/backfill-finance-breakdowns.js --apply --missing-only
 *   node scripts/backfill-finance-breakdowns.js --apply --booking-id=3502
 */
require('dotenv').config();

const db = require('../src/models');
const financeService = require('../src/services/finance.service');

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const missingOnly = args.has('--missing-only');
const bookingArg = [...args].find((arg) => arg.startsWith('--booking-id='));
const requestedBookingId = bookingArg ? Number(bookingArg.split('=')[1]) : null;
const concurrencyArg = [...args].find((arg) => arg.startsWith('--concurrency='));
const concurrency = concurrencyArg ? Number(concurrencyArg.split('=')[1]) : 8;
const limitArg = [...args].find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : null;

async function main() {
  if (bookingArg && (!Number.isInteger(requestedBookingId) || requestedBookingId <= 0)) {
    throw new Error('--booking-id must be a positive integer');
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 20) {
    throw new Error('--concurrency must be an integer between 1 and 20');
  }
  if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 1000)) {
    throw new Error('--limit must be an integer between 1 and 1000');
  }

  const whereBooking = requestedBookingId ? 'AND b.stream_project_booking_id = :bookingId' : '';
  const whereMissing = missingOnly ? 'AND fpb.booking_id IS NULL' : '';
  const candidates = await db.sequelize.query(
    `
      SELECT DISTINCT b.stream_project_booking_id AS booking_id
      FROM stream_project_booking b
      LEFT JOIN booking_payment_summary ps ON ps.booking_id = b.stream_project_booking_id
      LEFT JOIN booking_manual_payments mp ON mp.booking_id = b.stream_project_booking_id
      LEFT JOIN finance_project_breakdowns fpb ON fpb.booking_id = b.stream_project_booking_id
      WHERE COALESCE(b.is_draft, 0) = 0
        AND (
          b.payment_id IS NOT NULL
          OR ps.payment_status IN ('paid', 'partially_paid', 'no_payment_due')
          OR COALESCE(mp.amount, 0) > 0
        )
        ${whereBooking}
        ${whereMissing}
      ORDER BY b.stream_project_booking_id ASC
    `,
    {
      replacements: requestedBookingId ? { bookingId: requestedBookingId } : {},
      type: db.Sequelize.QueryTypes.SELECT
    }
  );

  const bookingIds = candidates.map((row) => Number(row.booking_id)).filter(Boolean).slice(0, limit || undefined);
  if (!apply) {
    console.log(JSON.stringify({ dry_run: true, missing_only: missingOnly, candidate_count: bookingIds.length, booking_ids: bookingIds }, null, 2));
    return;
  }

  const results = { reconciled: [], failed: [] };
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < bookingIds.length) {
      const bookingId = bookingIds[nextIndex++];
      try {
        await financeService.syncBookingFinance(bookingId);
        results.reconciled.push(bookingId);
      } catch (error) {
        results.failed.push({ booking_id: bookingId, error: error.message });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, bookingIds.length) }, worker));
  console.log(JSON.stringify({
    applied: true,
    missing_only: missingOnly,
    concurrency,
    candidate_count: bookingIds.length,
    reconciled_count: results.reconciled.length,
    failed_count: results.failed.length,
    failed: results.failed
  }, null, 2));
  if (results.failed.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.sequelize.close();
  });
