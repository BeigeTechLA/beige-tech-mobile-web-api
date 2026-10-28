const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/models');
const { _private } = require('../src/services/finance-dispute.service');

const { Op } = db.Sequelize;

test('analytics dispute drilldowns use the selected local calendar month', () => {
  const raised = _private.buildWhere({
    date_from: '2026-10-01', date_to: '2026-10-31', timezone: 'Asia/Kolkata'
  });
  assert.equal(raised.created_at[Op.gte].toISOString(), '2026-09-30T18:30:00.000Z');
  assert.equal(raised.created_at[Op.lt].toISOString(), '2026-10-31T18:30:00.000Z');

  const resolved = _private.buildWhere({
    status: 'resolved', date_field: 'resolved_at',
    date_from: '2026-10-01', date_to: '2026-10-31', timezone: 'America/New_York'
  });
  assert.equal(resolved.resolved_at[Op.gte].toISOString(), '2026-10-01T04:00:00.000Z');
  assert.equal(resolved.resolved_at[Op.lt].toISOString(), '2026-11-01T04:00:00.000Z');
  assert.equal(resolved.created_at, undefined);
  assert.deepEqual(resolved.status, ['resolved']);

  const afterDst = _private.buildWhere({
    date_from: '2026-11-01', date_to: '2026-11-30', timezone: 'America/New_York'
  });
  assert.equal(afterDst.created_at[Op.gte].toISOString(), '2026-11-01T04:00:00.000Z');
  assert.equal(afterDst.created_at[Op.lt].toISOString(), '2026-12-01T05:00:00.000Z');
});
