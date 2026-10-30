const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const db = require('../src/models');
const service = require('../src/services/finance-analytics.service');
const { _private: audit } = require('../src/services/finance-analytics-audit.service');
const { _private: analytics } = service;

const today = new Date('2026-10-10T12:00:00Z');
const filters = analytics.resolveFilters({ timezone: 'UTC' });
const earning = (id, due, scheduled, extra = {}) => ({
  creator_earning_id: id, booking_id: id, creator_id: 20, status: 'earned',
  approval_status: 'approved', net_earning_amount: 100,
  created_at: '2026-09-01T12:00:00Z',
  metadata_json: JSON.stringify({ due_date: due, scheduled_payout_date: scheduled }), ...extra
});

test('every schedule row can contain all four colors, with each remaining balance counted once', () => {
  const dates = ['2026-10-10', '2026-10-17', '2026-10-24', '2026-10-09'];
  const earnings = dates.flatMap((schedule, i) => dates.map((due, j) => earning(i * 4 + j + 1, due, schedule)));
  const result = analytics.buildAnalyticsData({ earnings, paidAmountsByEarningId: new Map([[1, 40]]) }, filters, today);
  const rows = result.creative_partners.payout_timeline;
  assert.deepEqual(rows[0].segments, { upcoming: 60, dueSoon: 100, later: 100, overdue: 100 });
  for (const row of rows.slice(1)) assert.deepEqual(row.segments, { upcoming: 100, dueSoon: 100, later: 100, overdue: 100 });
  assert.equal(rows.reduce((sum, row) => sum + Object.values(row.segments).reduce((a, b) => a + b, 0), 0), 1560);
});

test('schedule boundaries, missing dates and beyond-horizon balances are explicit', () => {
  const cases = [
    ['2026-10-09', 'overdue'], ['2026-10-10', 'this_week'], ['2026-10-16', 'this_week'],
    ['2026-10-17', 'next_week'], ['2026-10-23', 'next_week'], ['2026-10-24', '2_4_weeks'],
    ['2026-11-06', '2_4_weeks'], ['2026-11-07', null], [null, null]
  ];
  for (const [date, bucket] of cases) assert.equal(analytics.payoutBucket(date, '2026-10-10'), bucket);
  const data = analytics.buildAnalyticsData({ earnings: [
    earning(1, '2026-10-10', '2026-11-07'), earning(2, '2026-11-07', '2026-10-10'), earning(3, null, null),
    earning(4, '2026-10-10', '2026-10-10', { status: 'paid' }),
    earning(5, '2026-10-10', '2026-10-10', { status: 'cancelled' }),
    earning(6, '2026-10-10', '2026-10-10', { approval_status: 'draft' })
  ] }, filters, today);
  assert.equal(data.creative_partners.payout_timeline_unshown_amount, 300);
  assert.ok(data.creative_partners.payout_timeline.every(row => Object.values(row.segments).every(value => value === 0)));
});

test('legacy payouts default to their due date and rescheduling preserves the stored original deadline', () => {
  assert.deepEqual(analytics.payoutDates(earning(1, '2026-10-09'), {}), {
    original_due_date: '2026-10-09', scheduled_payout_date: '2026-10-09'
  });
  assert.deepEqual(analytics.payoutDates({ metadata_json: JSON.stringify({
    due_date: '2026-11-01', original_payout_due_date: '2026-10-09', scheduled_payout_date: '2026-10-12'
  }) }, {}), { original_due_date: '2026-10-09', scheduled_payout_date: '2026-10-12' });
  assert.deepEqual(analytics.payoutDates({ metadata_json: '{}' }, { event_date: '2026-09-25' }), {
    original_due_date: '2026-10-10', scheduled_payout_date: '2026-10-10'
  });
});

function mockHistory(t, earnings, requests = []) {
  t.mock.method(db.creator_earnings, 'findAll', async () => earnings);
  t.mock.method(db.creator_payout_requests, 'findAll', async () => requests);
  t.mock.method(db.stream_project_booking, 'findAll', async () => earnings.map(row => ({ stream_project_booking_id: row.booking_id, project_name: 'Shoot' })));
  t.mock.method(db.crew_members, 'findAll', async () => [{ crew_member_id: 20, first_name: 'Partner' }]);
}

test('segment detail totals match the chart, including partial payouts and scheduled-date filters in negative timezones', async (t) => {
  const earnings = [earning(1, '2026-09-25', '2026-10-10'), earning(2, '2026-10-20', '2026-10-10'), earning(3, '2026-10-10', '2026-10-17')];
  const requests = [{ status: 'paid', amount: 40, metadata_json: '{"creator_earning_id":1}' }];
  mockHistory(t, earnings, requests);
  const query = { start_date: '2026-10-10', end_date: '2026-10-10', timezone: 'America/Los_Angeles' };
  const chart = analytics.buildAnalyticsData({ earnings, paidAmountsByEarningId: new Map([[1, 40]]) }, analytics.resolveFilters(query), today);
  const row = chart.creative_partners.payout_timeline[0];
  assert.deepEqual(row.segments, { upcoming: 0, dueSoon: 100, later: 0, overdue: 60 });
  const all = await service.getPayoutScheduleHistory({ ...query, bucket_id: 'this_week' }, today);
  assert.equal(all.summary.total_pending, 160);
  for (const segment of Object.keys(row.segments)) {
    const detail = await service.getPayoutScheduleHistory({ ...query, bucket_id: 'this_week', segment_id: segment }, today);
    assert.equal(detail.summary.total_pending, row.segments[segment]);
  }
  const overdue = await service.getPayoutScheduleHistory({ ...query, bucket_id: 'this_week', segment_id: 'overdue' }, today);
  assert.equal(overdue.rows[0].due_date, '2026-09-25');
  assert.equal(overdue.rows[0].scheduled_payout_date, '2026-10-10');
  await assert.rejects(() => service.getPayoutScheduleHistory({ bucket_id: 'this_week', segment_id: 'invalid' }), { statusCode: 400 });
});

test('timezone determines today without shifting stored payout dates', () => {
  const earnings = [earning(1, '2026-10-10', '2026-10-10')];
  const now = new Date('2026-10-11T01:00:00Z');
  const west = analytics.buildAnalyticsData({ earnings }, analytics.resolveFilters({ timezone: 'America/Los_Angeles' }), now);
  const east = analytics.buildAnalyticsData({ earnings }, analytics.resolveFilters({ timezone: 'Asia/Kolkata' }), now);
  assert.equal(west.creative_partners.payout_timeline[0].segments.upcoming, 100);
  assert.equal(east.creative_partners.payout_timeline[3].segments.overdue, 100);
});

test('payouts outside the chart remain available for rescheduling in the detail panel', async (t) => {
  const earnings = [earning(1, '2026-10-10', '2026-11-07'), earning(2, '2026-11-07', '2026-10-10'), earning(3, null, null)];
  mockHistory(t, earnings);
  const result = await service.getPayoutScheduleHistory({ bucket_id: 'outside', timezone: 'UTC' }, today);
  assert.equal(result.summary.total_pending, 300);
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows.find(row => row.id === '3').due_date, null);
});

function mockScheduleWrite(t, row, { requests = [], siblings = [row] } = {}) {
  const tx = { LOCK: { UPDATE: 'UPDATE' } };
  t.mock.method(db.sequelize, 'transaction', async callback => callback(tx));
  t.mock.method(db.creator_earnings, 'findOne', async options => {
    assert.equal(options.lock, 'UPDATE');
    assert.equal(options.transaction, tx);
    return row;
  });
  t.mock.method(db.creator_earnings, 'findAll', async () => siblings);
  t.mock.method(db.creator_payout_requests, 'findAll', async () => requests);
  t.mock.method(db.stream_project_booking, 'findByPk', async () => ({}));
  row.update = async (values, options) => { assert.equal(options.transaction, tx); Object.assign(row, values); };
}

test('schedule writes preserve due dates and unrelated metadata, retain history, and allow re-scheduling', async (t) => {
  const row = earning(1, '2026-10-09');
  row.metadata_json = JSON.stringify({ due_date: '2026-10-09', payout_due_date: '2026-10-09', notes: 'Keep me' });
  mockScheduleWrite(t, row);
  await service.updatePayoutSchedule(1, { scheduled_payout_date: '2026-10-12' }, 99);
  await service.updatePayoutSchedule(1, { scheduled_payout_date: '2026-10-20' }, 98);
  const metadata = JSON.parse(row.metadata_json);
  assert.equal(metadata.due_date, '2026-10-09');
  assert.equal(metadata.payout_due_date, '2026-10-09');
  assert.equal(metadata.original_payout_due_date, '2026-10-09');
  assert.equal(metadata.scheduled_payout_date, '2026-10-20');
  assert.equal(metadata.notes, 'Keep me');
  assert.equal(metadata.payout_schedule_history.length, 2);
  assert.equal(metadata.payout_schedule_history[1].previous_date, '2026-10-12');
  assert.equal(metadata.payout_schedule_updated_by_user_id, 98);
});

test('schedule writes reject invalid dates and identifiers before reaching the database', async () => {
  for (const date of ['2026-02-30', 'invalid', '', '2026-10-10T00:00:00Z']) {
    await assert.rejects(() => service.updatePayoutSchedule(1, { scheduled_payout_date: date }), { statusCode: 400 });
  }
  await assert.rejects(() => service.updatePayoutSchedule('1abc', { scheduled_payout_date: '2026-10-10' }), { statusCode: 400 });
});

test('fully paid, cancelled, draft and superseded earnings cannot be scheduled', async (t) => {
  for (const scenario of ['paid', 'cancelled', 'draft', 'superseded', 'settled']) {
    await t.test(scenario, async (subtest) => {
      const row = earning(1, '2026-10-09', null, scenario === 'draft' ? { approval_status: 'draft' } : scenario === 'paid' || scenario === 'cancelled' ? { status: scenario } : {});
      mockScheduleWrite(subtest, row, {
        siblings: scenario === 'superseded' ? [row, { ...row, creator_earning_id: 2 }] : [row],
        requests: scenario === 'settled' ? [{ status: 'paid', amount: 100, metadata_json: '{"creator_earning_id":1}' }] : []
      });
      await assert.rejects(() => service.updatePayoutSchedule(1, { scheduled_payout_date: '2026-10-12' }), { statusCode: 409 });
    });
  }
});

test('reconciliation matches every stacked segment when original deadlines fall outside the schedule filter', async () => {
  const data = analytics.buildAnalyticsData({ earnings: [
    earning(1, '2026-09-25', '2026-10-10'), earning(2, '2026-10-20', '2026-10-10')
  ] }, analytics.resolveFilters({ start_date: '2026-10-10', end_date: '2026-10-10', timezone: 'UTC' }), today, true);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await audit.buildWorkbook(data));
  const summary = workbook.getWorksheet('Summary');
  let timelineChecks = 0;
  summary.eachRow((row) => {
    if (String(row.getCell(1).value).startsWith('CP Timeline')) {
      timelineChecks++;
      assert.equal(row.getCell(4).value, 0, String(row.getCell(1).value));
    }
  });
  assert.equal(timelineChecks, 20);
});
