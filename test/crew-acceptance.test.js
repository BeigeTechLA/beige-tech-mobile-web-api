const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/models');
const notifications = { bookingOwner: async () => null, notify: async () => {} };
const submitted = [];
for (const [dependency, exports] of [
  ['../src/services/business-notification.service', notifications],
  ['../src/services/cp-compensation.service', { submitAcceptedCreatorCompensation: async (id) => submitted.push(id) }]
]) {
  const filename = require.resolve(dependency);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
const agreements = require('../src/services/agreements.service');
const { assertCrewPositionAvailable, closeUnavailableCrewRequests } = require('../src/services/crew-acceptance.service');
const { Op } = db.Sequelize;
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

test('ten concurrent responses fill three roles once and close remaining requests', async (t) => {
  submitted.length = 0;
  const booking = { stream_project_booking_id: 20, crew_roles: '{"photographer":1,"videographer":1,"hybrid":1}' };
  const partners = Array.from({ length: 10 }, (_, index) => ({ crew_member_id: index + 1, primary_role: '[9,10]' }));
  const mutable = (values) => ({ ...values, async update(next) { Object.assign(this, next); } });
  const assignments = partners.map(cp => mutable({ id: cp.crew_member_id, project_id: 20, crew_member_id: cp.crew_member_id, crew_accept: 0, is_active: 1, crew_member: cp }));
  const docs = partners.map(cp => mutable({ agreement_document_id: cp.crew_member_id, assignment_id: cp.crew_member_id,
    creator_id: cp.crew_member_id, creator_earning_id: cp.crew_member_id, booking_id: 20,
    agreement_type: 'shoot', status: 'pending_acceptance', is_current: 1 }));
  const responses = [];
  const cancelledEarnings = [];
  // Simulate the database's booking row lock, not a global transaction lock.
  // The test fails if the response path omits the booking lock.
  let queue = Promise.resolve();
  t.mock.method(db.sequelize, 'transaction', async callback => {
    const tx = { LOCK: { UPDATE: 'UPDATE' }, bookingLocked: false, release: null };
    try { return await callback(tx); } finally { tx.release?.(); }
  });
  t.mock.method(db.stream_project_booking, 'findByPk', async (_id, options = {}) => {
    if (options.lock) {
      const previous = queue;
      queue = new Promise(resolve => { options.transaction.release = resolve; });
      await previous;
      options.transaction.bookingLocked = true;
    }
    return booking;
  });
  t.mock.method(db.agreement_documents, 'findByPk', async (id, options = {}) => {
    if (options.lock) assert.equal(options.transaction.bookingLocked, true, 'lock booking before agreement');
    return docs.find(doc => doc.agreement_document_id === Number(id));
  });
  t.mock.method(db.agreement_templates, 'findOne', async () => ({ agreement_template_id: 1 }));
  t.mock.method(db.agreement_documents, 'findOne', async () => ({ status: 'accepted' }));
  t.mock.method(db.crew_members, 'findByPk', async id => partners.find(cp => cp.crew_member_id === Number(id)));
  t.mock.method(db.assigned_crew, 'findAll', async ({ where, transaction, lock }) => {
    assert.equal(transaction.bookingLocked, true);
    assert.equal(lock, transaction.LOCK.UPDATE, 'capacity reads must be current locking reads');
    return assignments.filter(row => row.is_active === where.is_active && row.crew_accept === where.crew_accept);
  });
  t.mock.method(db.assigned_crew, 'findOne', async ({ where }) => assignments.find(row => row.id === where.id && row.is_active === 1));
  t.mock.method(db.agreement_documents, 'findAll', async ({ where }) => docs.filter(doc =>
    where.assignment_id[Op.in].includes(doc.assignment_id) && where.status[Op.in].includes(doc.status)));
  t.mock.method(db.assigned_crew, 'update', async (values, { where }) => {
    assignments.filter(row => where.id[Op.in].includes(row.id)).forEach(row => Object.assign(row, values));
  });
  t.mock.method(db.creator_earnings, 'update', async (_values, { where }) => cancelledEarnings.push(...where.creator_id[Op.in]));
  t.mock.method(db.agreement_responses, 'create', async values => { responses.push(values); return values; });
  t.mock.method(db.agreement_events, 'create', async values => values);
  t.mock.method(db.creator_earning_timeline_events, 'findOne', async () => null);
  t.mock.method(db.creator_earning_timeline_events, 'create', async values => values);

  const results = await Promise.allSettled(partners.map(cp => agreements.respondToAgreement(
    cp.crew_member_id, cp.crew_member_id, 'accepted', { accepted_terms: true, signer_name: 'CP', signature_data_url: png }
  )));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 3);
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason.statusCode === 409).length, 7);
  assert.equal(assignments.filter(row => row.crew_accept === 1 && row.is_active === 1).length, 3);
  assert.equal(assignments.filter(row => row.is_active === 0).length, 7);
  assert.equal(docs.filter(doc => doc.status === 'cancelled' && doc.is_current === 0).length, 7);
  assert.deepEqual(submitted, [1, 2, 3]);
  assert.equal(responses.length, 3);
  assert.equal(cancelledEarnings.length, 7);
  await assert.rejects(() => agreements.getDocumentDetail(4, 4), { statusCode: 404 });
});

test('filling photography closes photo-only requests while preserving video and hybrid candidates', async (t) => {
  const booking = { stream_project_booking_id: 20, crew_roles: { photographer: 1, videographer: 1, hybrid: 1 } };
  const accepted = [{ id: 1, crew_member_id: 1, crew_member: { primary_role: '[10]' } }];
  const pending = [
    { id: 2, crew_member_id: 2, crew_member: { primary_role: '[10]' } },
    { id: 3, crew_member_id: 3, crew_member: { primary_role: '[9]' } },
    { id: 4, crew_member_id: 4, crew_member: { primary_role: '[9,10]' } }
  ];
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  let closedIds;
  t.mock.method(db.assigned_crew, 'findAll', async ({ where }) => where.crew_accept === 1 ? accepted : pending);
  t.mock.method(db.crew_members, 'findByPk', async id => pending.find(row => row.crew_member_id === id)?.crew_member);
  t.mock.method(db.agreement_documents, 'findAll', async () => []);
  t.mock.method(db.assigned_crew, 'update', async (_values, { where }) => { closedIds = where.id[Op.in]; });
  t.mock.method(db.creator_earnings, 'update', async () => []);
  await assert.rejects(() => assertCrewPositionAvailable(booking, 2, transaction), { statusCode: 409 });
  await assert.doesNotReject(() => assertCrewPositionAvailable(booking, 3, transaction));
  await assert.doesNotReject(() => assertCrewPositionAvailable(booking, 4, transaction));
  await closeUnavailableCrewRequests(booking, transaction);
  assert.deepEqual(closedIds, [2]);
});
