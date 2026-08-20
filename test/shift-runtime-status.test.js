const assert = require('assert');
const {
  getShiftRuntimeStatus,
  decorateShiftWithRuntimeStatus,
  selectNextRoundRobinAssigneeId
} = require('../src/services/shift-management.service');

const activeShift = {
  status: 'active',
  active_days: ['Mon'],
  start_time: '09:00:00',
  end_time: '17:00:00'
};

const activeNow = new Date('2026-08-10T04:30:00Z');
const wrongDay = new Date('2026-08-11T04:30:00Z');

assert.strictEqual(getShiftRuntimeStatus(activeShift, activeNow), 'active');
assert.strictEqual(getShiftRuntimeStatus(activeShift, wrongDay), 'inactive');
assert.strictEqual(getShiftRuntimeStatus({ ...activeShift, status: 'inactive' }, activeNow), 'inactive');

const decorated = decorateShiftWithRuntimeStatus(activeShift, activeNow);
assert.strictEqual(decorated.status, 'active');
assert.strictEqual(decorated.stored_status, 'active');

const rrLinks = [
  { sales_rep_id: 1, user_status: true, assignment_order: 1 },
  { sales_rep_id: 2, user_status: false, assignment_order: 2 },
  { sales_rep_id: 3, user_status: true, assignment_order: 3 }
];

assert.strictEqual(selectNextRoundRobinAssigneeId(rrLinks, null), 1);
assert.strictEqual(selectNextRoundRobinAssigneeId(rrLinks, 1), 3);
assert.strictEqual(selectNextRoundRobinAssigneeId(rrLinks, 2), 3);

console.log('shift runtime status tests passed');
