const assert = require('node:assert/strict');
const test = require('node:test');

const modelsPath = require.resolve('../src/models');
const servicePath = require.resolve('../src/services/booking-payment-summary.service');

function loadServiceWithRows(rowsByLookup) {
  const calls = [];
  const mockDb = {
    Sequelize: { QueryTypes: { SELECT: 'SELECT' } },
    sequelize: {
      async query(sql, options) {
        calls.push({ sql, replacements: options.replacements });
        if (sql.includes('WHERE booking_id = :bookingId')) {
          return rowsByLookup.booking || [];
        }
        if (sql.includes('WHERE sales_quote_id = :salesQuoteId')) {
          return rowsByLookup.salesQuote || [];
        }
        throw new Error(`Unexpected query in test: ${sql}`);
      }
    }
  };

  require.cache[modelsPath] = {
    id: modelsPath,
    filename: modelsPath,
    loaded: true,
    exports: mockDb
  };
  delete require.cache[servicePath];

  return {
    service: require(servicePath),
    calls
  };
}

test.afterEach(() => {
  delete require.cache[servicePath];
  delete require.cache[modelsPath];
});

test('booking lookup never falls back to a colliding sales quote ID', async () => {
  const unrelatedPaidSummary = {
    booking_id: 2685,
    sales_quote_id: 579,
    quote_total: 1400,
    paid_amount: 1400,
    credit_used_amount: 0,
    credit_created_amount: 0,
    due_amount: 0,
    payment_status: 'paid'
  };
  const { service, calls } = loadServiceWithRows({
    booking: [],
    salesQuote: [unrelatedPaidSummary]
  });

  const state = await service.resolveBookingPaymentState({
    bookingId: 2804,
    salesQuoteId: 579,
    quoteTotal: 300
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /WHERE booking_id = :bookingId/);
  assert.deepEqual(calls[0].replacements, { bookingId: 2804 });
  assert.equal(state.hasSummary, false);
  assert.equal(state.quoteTotal, 300);
  assert.equal(state.dueAmount, 300);
  assert.equal(state.requiresPayment, true);
});

test('sales quote lookup remains available when no booking ID exists', async () => {
  const quoteSummary = {
    booking_id: 2685,
    sales_quote_id: 579,
    quote_total: 1400,
    paid_amount: 1400,
    credit_used_amount: 0,
    credit_created_amount: 0,
    due_amount: 0,
    payment_status: 'paid'
  };
  const { service, calls } = loadServiceWithRows({
    booking: [],
    salesQuote: [quoteSummary]
  });

  const state = await service.resolveBookingPaymentState({ salesQuoteId: 579 });

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /WHERE sales_quote_id = :salesQuoteId/);
  assert.equal(state.hasSummary, true);
  assert.equal(state.paymentSummary.booking_id, 2685);
  assert.equal(state.isPaid, true);
});
