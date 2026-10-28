const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveSalesLeadBookingStatus } = require('../src/utils/salesLeadBookingStatus');

test('approved quote increase takes precedence over an earlier full manual payment', () => {
  assert.equal(resolveSalesLeadBookingStatus({
    baseStatus: 'Paid',
    leadStatus: 'booking_in_progress',
    manualProgress: { hasFullPayment: true },
    paymentSummary: {
      quote_total: 1600,
      paid_amount: 800,
      due_amount: 800,
      payment_status: 'partially_paid'
    }
  }), 'Partially Paid');
});

test('settled revised quote remains paid', () => {
  assert.equal(resolveSalesLeadBookingStatus({
    baseStatus: 'Paid',
    manualProgress: { hasFullPayment: true },
    paymentSummary: { paid_amount: 1600, due_amount: 0, payment_status: 'paid' }
  }), 'Paid');
});

test('a no-payment-due quote is settled even when no cash was collected', () => {
  assert.equal(resolveSalesLeadBookingStatus({
    baseStatus: 'Payment Link Sent',
    paymentSummary: { paid_amount: 0, due_amount: 0, payment_status: 'no_payment_due' }
  }), 'Paid');
});

test('an outstanding balance cannot remain Paid from an old booking marker', () => {
  assert.equal(resolveSalesLeadBookingStatus({
    baseStatus: 'Paid',
    paymentSummary: { paid_amount: 0, due_amount: 800, payment_status: 'pending' }
  }), 'Ready for Payment');
});

test('cancelled and abandoned leads stay Closed Lost even when payment exists', () => {
  for (const values of [
    { baseStatus: 'Closed – Lost', bookingCancelled: 1, paymentSummary: { paid_amount: 100, due_amount: 0, payment_status: 'paid' } },
    { baseStatus: 'Closed – Lost', leadStatus: 'abandoned', manualProgress: { hasFullPayment: true } }
  ]) {
    assert.equal(resolveSalesLeadBookingStatus(values), 'Closed - Lost');
  }
});
