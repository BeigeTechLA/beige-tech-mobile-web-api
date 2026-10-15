const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveCurrentQuotePaymentStatus } = require('../src/utils/quotePaymentStatusFilter');

test('current balance overrides an old paid quote or manual full payment', () => {
  assert.equal(resolveCurrentQuotePaymentStatus({
    paid_amount: 1300,
    due_amount: 1400,
    payment_status: 'partially_paid'
  }, 'paid'), 'partially_paid');
});

test('settled quote overrides an old partially paid status', () => {
  assert.equal(resolveCurrentQuotePaymentStatus({
    paid_amount: 2080,
    due_amount: 0,
    payment_status: 'paid'
  }, 'partially_paid'), 'paid');
});

test('zero balance with no payment due is paid', () => {
  assert.equal(resolveCurrentQuotePaymentStatus({
    paid_amount: 0,
    due_amount: 0,
    payment_status: 'no_payment_due'
  }, 'pending'), 'paid');
});
