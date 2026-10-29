/**
 * Development-only CP payout timeline fixtures. No payments or messages sent.
 * node scripts/seed-cp-payout-timeline-demo.js             # inspect only
 * node scripts/seed-cp-payout-timeline-demo.js --apply     # create/refresh demos
 * node scripts/seed-cp-payout-timeline-demo.js --remove    # remove tagged demos
 * node scripts/seed-cp-payout-timeline-demo.js --verify    # check service/detail totals
 * Re-running --apply refreshes the dates relative to today without duplicates.
 */
const path = require('path');
const fs = require('fs');
const assert = require('node:assert/strict');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const EXPECTED_HOST = 'database-web-development.cijcqimc00a0.us-east-1.rds.amazonaws.com';
if (process.env.DATABASE_HOST !== EXPECTED_HOST || process.env.DATABASE_NAME !== 'revurge') {
  throw new Error('Refusing to run: this script is restricted to the verified development database.');
}
const db = require('../src/models');
const analytics = require('../src/services/finance-analytics.service');
const { getCanonicalCpEarningRows, payoutAmountsByEarningId } = require('../src/utils/cp-compensation-summary');
const { acceptedCompensationWhere } = require('../src/utils/cp-compensation-eligibility');
const MARKER = 'cp_payout_timeline_demo_v1';
const timezone = 'Asia/Kolkata';
const buckets = [
  { id: 'this_week', label: 'This Week', days: 2, amounts: [2400, 1800, 1200, 2600] },
  { id: 'next_week', label: 'Next Week', days: 9, amounts: [1600, 3200, 2400, 1800] },
  { id: '2_4_weeks', label: '2-4 Weeks', days: 20, amounts: [2400, 2000, 4400, 3200] },
  { id: 'overdue', label: 'Overdue', days: -3, amounts: [2800, 2200, 1800, 4000] }
];
const segments = [
  { id: 'upcoming', label: 'Upcoming', days: 2 },
  { id: 'dueSoon', label: 'Due Soon', days: 9 },
  { id: 'later', label: 'Later', days: 20 },
  { id: 'overdue', label: 'Overdue', days: -5 }
];
const parse = value => typeof value === 'string' ? JSON.parse(value || '{}') : value || {};
const plusDays = (day, offset) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
const demoName = bucket => `[DEV DEMO] CP Payout Timeline - ${bucket.label}`;
const demoEmail = segment => `cp-payout-demo-${segment.id.toLowerCase()}@example.invalid`;

async function readTimeline() {
  const earnings = await db.creator_earnings.findAll({ where: acceptedCompensationWhere(), raw: true });
  const ids = [...new Set(getCanonicalCpEarningRows(earnings).map(row => row.booking_id))];
  const bookings = ids.length ? await db.stream_project_booking.findAll({ where: { stream_project_booking_id: ids }, raw: true }) : [];
  const payouts = await db.creator_payout_requests.findAll({ raw: true });
  const data = analytics._private.buildAnalyticsData({ earnings, bookings, paidAmountsByEarningId: payoutAmountsByEarningId(payouts) }, analytics._private.resolveFilters({ timezone }));
  return {
    rows: data.creative_partners.payout_timeline.map(row => ({ ...row, total: Object.values(row.segments).reduce((a, b) => a + b, 0) })),
    outside_timeline: data.creative_partners.payout_timeline_unshown_amount
  };
}

async function applyDemo() {
  const today = analytics._private.dateKey(new Date(), timezone);
  const now = new Date();
  return db.sequelize.transaction(async transaction => {
    const creators = [];
    for (const segment of segments) {
      const [creator, created] = await db.crew_members.findOrCreate({
        where: { email: demoEmail(segment) },
        defaults: { first_name: 'Demo CP', last_name: segment.label, primary_role: '[2]', bio: MARKER, is_active: 1, is_available: 0, application_submission_email_sent_at: now },
        transaction
      });
      if (!created && creator.bio !== MARKER) throw new Error('Demo creator marker mismatch; refusing to modify existing data.');
      creators.push(creator);
    }
    const result = [];
    for (const bucket of buckets) {
      const [booking, created] = await db.stream_project_booking.findOrCreate({
        where: { project_name: demoName(bucket) },
        defaults: {
          description: MARKER, streaming_platforms: '[]', crew_roles: '[2]',
          guest_email: 'cp-payout-demo-client@example.invalid', event_date: plusDays(today, -20),
          time_zone: timezone, budget: bucket.amounts.reduce((a, b) => a + b, 0) * 2,
          is_active: 1, is_cancelled: 0
        }, transaction
      });
      if (!created && booking.description !== MARKER) throw new Error('Demo booking marker mismatch; refusing to modify existing data.');
      for (const [index, segment] of segments.entries()) {
        const creator = creators[index];
        const existing = await db.creator_earnings.findAll({ where: { booking_id: booking.stream_project_booking_id, creator_id: creator.crew_member_id }, transaction });
        if (existing.length > 1 || existing.some(row => parse(row.metadata_json).demo_seed !== MARKER || row.status === 'paid')) {
          throw new Error('Demo compensation has unexpected changes; refusing to overwrite it.');
        }
        if (existing.length) {
          const requests = await db.creator_payout_requests.findAll({ where: { creator_id: creator.crew_member_id }, transaction, raw: true });
          if (requests.length) throw new Error('Demo creator has payout activity; refusing to overwrite it.');
        }
        await db.assigned_crew.findOrCreate({
          where: { project_id: booking.stream_project_booking_id, crew_member_id: creator.crew_member_id },
          defaults: { crew_accept: 1, is_active: 1, status: 'assigned', responded_at: now, new_booking_email_sent_at: now }, transaction
        });
        const values = {
          booking_id: booking.stream_project_booking_id, creator_id: creator.crew_member_id,
          gross_amount: bucket.amounts[index], net_earning_amount: bucket.amounts[index],
          status: 'pending', approval_status: 'pending_approval', compensation_source: 'admin', compensation_method: 'manual',
          approval_notes: 'Development demo only. Do not approve or pay.',
          submitted_at: now, updated_at: now,
          cp_payment_due_email_sent_at: now, cp_payment_due_7_days_email_sent_at: now,
          cp_payment_overdue_1_day_email_sent_at: now, cp_payment_overdue_3_days_email_sent_at: now,
          metadata_json: JSON.stringify({ demo_seed: MARKER, demo_row: bucket.id, demo_segment: segment.id,
            due_date: plusDays(today, segment.days), original_payout_due_date: plusDays(today, segment.days),
            scheduled_payout_date: plusDays(today, bucket.days) })
        };
        const earning = existing[0] ? await existing[0].update(values, { transaction }) : await db.creator_earnings.create(values, { transaction });
        result.push({ earning_id: earning.creator_earning_id, booking_id: booking.stream_project_booking_id, creator_id: creator.crew_member_id, row: bucket.id, segment: segment.id, amount: bucket.amounts[index] });
      }
    }
    return result;
  });
}

async function removeDemo() {
  return db.sequelize.transaction(async transaction => {
    const bookings = await db.stream_project_booking.findAll({ where: { project_name: buckets.map(demoName), description: MARKER }, transaction });
    const creators = await db.crew_members.findAll({ where: { email: segments.map(demoEmail), bio: MARKER }, transaction });
    const bookingIds = bookings.map(row => row.stream_project_booking_id);
    const creatorIds = creators.map(row => row.crew_member_id);
    if (await db.creator_payout_requests.count({ where: { creator_id: creatorIds }, transaction })) throw new Error('Demo creator has payout activity; refusing removal.');
    const earnings = await db.creator_earnings.findAll({ where: { booking_id: bookingIds }, transaction });
    if (earnings.some(row => parse(row.metadata_json).demo_seed !== MARKER)) throw new Error('Demo booking has non-demo compensation; refusing removal.');
    await db.creator_earnings.destroy({ where: { creator_earning_id: earnings.map(row => row.creator_earning_id) }, transaction });
    await db.assigned_crew.destroy({ where: { project_id: bookingIds, crew_member_id: creatorIds }, transaction });
    await db.stream_project_booking.destroy({ where: { stream_project_booking_id: bookingIds, description: MARKER }, transaction });
    await db.crew_members.destroy({ where: { crew_member_id: creatorIds, bio: MARKER }, transaction });
    return { removed_earnings: earnings.length, removed_bookings: bookings.length, removed_creators: creators.length };
  });
}

async function main() {
  if (process.argv.includes('--apply') && process.argv.includes('--remove')) throw new Error('Choose apply or remove, not both.');
  const [rows] = await db.sequelize.query('SELECT DATABASE() AS database_name');
  if (rows[0].database_name !== 'revurge') throw new Error('Unexpected database name.');
  const before = await readTimeline();
  fs.writeFileSync('/tmp/cp-payout-development-timeline.json', JSON.stringify(before.rows.map(({ total, ...row }) => row), null, 2));
  console.log(JSON.stringify({ host: EXPECTED_HOST, database: rows[0].database_name, before }, null, 2));
  if (process.argv.includes('--apply')) console.log(JSON.stringify({ demo_records: await applyDemo(), after: await readTimeline() }, null, 2));
  if (process.argv.includes('--remove')) console.log(JSON.stringify({ removed: await removeDemo(), after: await readTimeline() }, null, 2));
  if (process.argv.includes('--verify')) {
    const data = await analytics.getAnalytics({ timezone });
    const timeline = data.creative_partners.payout_timeline;
    assert.equal(timeline.length, 4);
    for (const row of timeline) {
      assert.ok(Object.values(row.segments).every(amount => amount > 0), `${row.id} must have all four colors`);
      const detail = await analytics.getPayoutScheduleHistory({ bucket_id: row.id, timezone });
      assert.equal(detail.summary.total_pending, Number(Object.values(row.segments).reduce((a, b) => a + b, 0).toFixed(2)));
    }
    fs.writeFileSync('/tmp/cp-payout-development-timeline.json', JSON.stringify(timeline, null, 2));
    console.log(JSON.stringify({ analytics_service_verified: true, four_colors_per_row: true, detail_totals_match: true, timeline }, null, 2));
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.sequelize.close());
