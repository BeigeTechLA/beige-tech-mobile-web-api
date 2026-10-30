const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/models');
// These tests exercise state transitions only; never initialize email clients.
for (const dependency of ['../src/utils/emailService', '../src/services/business-notification.service']) {
  const filename = require.resolve(dependency);
  require.cache[filename] = { id: filename, filename, loaded: true, exports: {} };
}
const compensation = require('../src/services/cp-compensation.service');
const { acceptedCompensationWhere } = require('../src/utils/cp-compensation-eligibility');
const tx = { LOCK: { UPDATE: 'UPDATE' } };

test('an invitation stores an offer; acceptance submits it once for finance review', async (t) => {
  const assignment = { id: 1, crew_accept: 0, is_active: 1 };
  const earning = { creator_earning_id: 7, booking_id: 20, creator_id: 3, approval_status: 'draft',
    async update(values) { Object.assign(this, values); } };
  const events = [];
  t.mock.method(db.stream_project_booking, 'findByPk', async () => ({ stream_project_booking_id: 20 }));
  t.mock.method(db.assigned_crew, 'findOne', async ({ where }) =>
    where.crew_accept === 1 && assignment.crew_accept !== 1 ? null : assignment);
  t.mock.method(db.creator_earnings, 'findOne', async () => earning);
  t.mock.method(db.creator_earnings, 'findByPk', async () => earning);
  t.mock.method(db.creator_earning_compensation_items, 'update', async () => [1]);
  t.mock.method(db.creator_earning_compensation_items, 'bulkCreate', async rows => rows);
  t.mock.method(db.creator_earning_timeline_events, 'findOne', async () => null);
  t.mock.method(db.creator_earning_timeline_events, 'create', async row => { events.push(row); return row; });

  const result = await compensation.upsertCreatorCompensation({
    booking_id: 20, creator_id: 3, compensation_method: 'equal_split', items: [{ label: 'Base payout', amount: 83.33 }]
  }, { userId: 2, transaction: tx, approvalStatus: 'pending_approval', compensationSource: 'sales_admin' });
  assert.equal(result.approval_status, 'draft');
  assert.equal(earning.net_earning_amount, 83.33);
  assert.equal(earning.submitted_at, null);
  assert.equal(events.length, 0);
  await assert.rejects(() => compensation.approveCompensation(7, {}, { transaction: tx }), { statusCode: 409 });
  assert.equal(earning.approval_status, 'draft');

  assignment.crew_accept = 1;
  await compensation.submitAcceptedCreatorCompensation(7, tx);
  assert.equal(earning.approval_status, 'pending_approval');
  assert.ok(earning.submitted_at instanceof Date);
  assert.equal(JSON.parse(earning.metadata_json).awaiting_creator_acceptance, false);
  assert.equal(events.length, 1);
  await compensation.submitAcceptedCreatorCompensation(7, tx);
  assert.equal(events.length, 1, 'accepting a revision must not resubmit existing finance approval');
});

test('finance list and overview filter accepted assignments before counting or paginating', async (t) => {
  let listQuery;
  let overviewQuery;
  t.mock.method(db.creator_earnings, 'findAndCountAll', async options => { listQuery = options; return { count: 0, rows: [] }; });
  t.mock.method(db.creator_earnings, 'findAll', async options => { overviewQuery = options; return []; });
  t.mock.method(db.creator_payout_requests, 'findAll', async () => []);
  const list = await compensation.listCpCompensations({ view: 'creators' });
  const overview = await compensation.getCpCompensationOverview();
  assert.equal(list.rows.length, 0);
  assert.equal(overview.total_amount, 0);
  const expected = acceptedCompensationWhere()[db.Sequelize.Op.and];
  assert.deepEqual(listQuery.where[db.Sequelize.Op.and], expected);
  assert.deepEqual(overviewQuery.where[db.Sequelize.Op.and], expected);
  assert.match(expected[1].val, /accepted_cp\.crew_accept = 1 AND accepted_cp\.is_active = 1/);
  assert.match(expected[1].val, /creator_earnings.status = 'paid'/, 'retain completed payment history');
});

test('legacy pending offers cannot be approved, rejected or paid before CP acceptance', async (t) => {
  const earning = { creator_earning_id: 7, booking_id: 20, creator_id: 3, approval_status: 'pending_approval', status: 'pending' };
  t.mock.method(db.creator_earnings, 'findByPk', async () => earning);
  t.mock.method(db.assigned_crew, 'findOne', async () => null);
  await assert.rejects(() => compensation.approveCompensation(7, {}, { transaction: tx }), { statusCode: 409 });
  await assert.rejects(() => compensation.rejectCompensation(7, { rejection_reason: 'Review' }, { transaction: tx }), { statusCode: 409 });
  earning.approval_status = 'approved';
  await assert.rejects(() => compensation.processCompensationPayment(7, { amount: 83.33, payment_method: 'manual' }, { transaction: tx }), { statusCode: 409 });
});

test('finance cannot open shoot compensation details before any CP accepts', async (t) => {
  let query;
  t.mock.method(db.stream_project_booking, 'findByPk', async (_id, options) => {
    query = options;
    return { stream_project_booking_id: 20, creator_earnings: [] };
  });
  await assert.rejects(() => compensation.getCpCompensationDetails(20), { statusCode: 404 });
  const earningsInclude = query.include.find(include => include.as === 'creator_earnings');
  assert.deepEqual(earningsInclude.where[db.Sequelize.Op.and], acceptedCompensationWhere()[db.Sequelize.Op.and]);
});
