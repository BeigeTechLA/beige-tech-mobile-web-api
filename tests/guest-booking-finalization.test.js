const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function loadModule(relativePath, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, relativePath), 'utf8'), {
    module,
    exports: module.exports,
    console,
    process: { env: { NODE_ENV: 'test' } },
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    }
  }, { filename: relativePath });
  return module.exports;
}

function fixture({ summary = null, bookingFields = {} } = {}) {
  const writes = [];
  const booking = {
    stream_project_booking_id: 5816,
    is_draft: 1,
    payment_id: null,
    payment_completed_at: null,
    booking_days: [],
    ...bookingFields,
    async update(data) {
      writes.push(data);
      Object.assign(this, data);
    }
  };
  const db = {
    stream_project_booking: { findOne: async () => booking },
    Sequelize: { QueryTypes: { SELECT: 'SELECT' } },
    sequelize: {
      query: async (_sql, options) => {
        assert.equal(Number(options.replacements.bookingId), 5816);
        return summary ? [summary] : [];
      },
      transaction: async () => ({ commit: async () => {}, rollback: async () => {} })
    }
  };
  const paymentService = loadModule('src/services/booking-payment-summary.service.js', {
    '../models': db
  });
  const controller = loadModule('src/controllers/guest-bookings.controller.js', {
    '../models': db,
    '../utils/constants': require('../src/utils/constants'),
    '../utils/locationHelpers': require('../src/utils/locationHelpers'),
    '../utils/timezone': require('../src/utils/timezone'),
    '../services/booking-payment-summary.service': paymentService,
    '../utils/googleSheetsService': {},
    '../utils/googleSheets': {},
    'googleapis/build/src/apis/content': {},
    '../utils/emailService': {},
    '../services/account-credit.service': {},
    './affiliate.controller': {},
    '../services/push-notification.service': {}
  });
  return { controller, booking, writes };
}

async function finalize(controller) {
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  await controller.updateGuestBooking({
    params: { id: '5816' },
    body: { order_name: 'V4 checkout', quote_id: 123, is_draft: false }
  }, res);
  return res;
}

test('Confirm & Pay finalizes and retries an unpaid guest booking without a payment summary', async () => {
  const { controller, booking, writes } = fixture();
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await finalize(controller);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.booking_id, 5816);
    assert.equal(res.body.data.is_draft, false);
    assert.equal(booking.quote_id, 123);
  }
  assert.equal(writes.length, 2);
});

test('an unpaid booking with a pending payment summary can proceed to checkout', async () => {
  const { controller, writes } = fixture({ summary: {
    quote_total: 5700, due_amount: 5700, paid_amount: 0,
    credit_used_amount: 0, payment_status: 'pending'
  } });
  const res = await finalize(controller);
  assert.equal(res.statusCode, 200);
  assert.equal(writes.length, 1);
});

const protectedBookings = [
  ['payment reference', { bookingFields: { payment_id: 42 } }],
  ['payment completion timestamp', { bookingFields: { payment_completed_at: '2026-10-30T10:00:00Z' } }],
  ['fully paid summary', { summary: {
    quote_total: 5700, due_amount: 0, paid_amount: 5700, payment_status: 'paid'
  } }],
  ['partially paid summary', { summary: {
    quote_total: 5700, due_amount: 4700, paid_amount: 1000, payment_status: 'partially_paid'
  } }],
  ['applied account credit', { summary: {
    quote_total: 5700, due_amount: 4700, paid_amount: 0,
    credit_used_amount: 1000, payment_status: 'pending'
  } }],
  ['persisted no-payment-due confirmation', { summary: {
    quote_total: 0, due_amount: 0, paid_amount: 0, payment_status: 'no_payment_due'
  } }]
];

for (const [name, options] of protectedBookings) {
  test(`guest finalization still rejects a booking with ${name}`, async () => {
    const { controller, writes } = fixture(options);
    const res = await finalize(controller);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /Confirmed bookings cannot be edited/);
    assert.equal(writes.length, 0);
  });
}
