const test = require('node:test');
const assert = require('node:assert/strict');

const { _private } = require('../src/services/quote-analytics.service');

test('a deal is won only after full payment, while partial cash still counts as collected revenue', () => {
  const paid = _private.resolvePaymentState({
    quote: { total: 1000, status: 'accepted' },
    paymentSummary: {
      paid_amount: 1000,
      credit_used_amount: 0,
      due_amount: 0,
      payment_status: 'paid'
    }
  });
  const partial = _private.resolvePaymentState({
    quote: { total: 1000, status: 'partially_paid' },
    paymentSummary: {
      paid_amount: 400,
      credit_used_amount: 0,
      due_amount: 600,
      payment_status: 'partially_paid'
    }
  });

  assert.equal(paid.fullPaid, true);
  assert.equal(paid.collectedAmount, 1000);
  assert.equal(partial.fullPaid, false);
  assert.equal(partial.collectedAmount, 400);

  const metrics = _private.summarizeCohort([
    { quoteValue: 1000, fullPaid: true, collectedAmount: 1000 },
    { quoteValue: 1000, fullPaid: false, collectedAmount: 400 }
  ]);

  assert.deepEqual(metrics, {
    quote_value: 2000,
    quotes_sent: 2,
    deals_won: 1,
    won_revenue: 1000,
    collected_revenue: 1400,
    win_rate: 50,
    quote_to_cash_conversion: 70,
    average_deal_size: 1000
  });
});

test('custom date ranges include both selected calendar dates', () => {
  const range = _private.resolveDateRange({
    date_preset: 'custom',
    start_date: '2026-09-01',
    end_date: '2026-09-03'
  });

  assert.equal(range.start_date, '2026-09-01');
  assert.equal(range.end_date, '2026-09-03');
  assert.equal(range.endExclusive.getDate(), 4);
});

test('quote analytics defaults to an unbounded all-time sent cohort', () => {
  const range = _private.resolveDateRange({}, new Date('2026-09-18T12:00:00.000Z'));

  assert.equal(range.preset, 'all_time');
  assert.equal(_private.buildAnalyticsData([
    {
      quoteStatus: 'paid', quoteValue: 1000, collectedAmount: 1000,
      outstandingAmount: 0, fullPaid: true, paymentStatus: 'paid',
      sentAt: new Date('2024-01-10T08:00:00.000Z'), repId: 1,
      salesRep: { id: 1, name: 'Alex', email: 'alex@example.com' },
      shootTypeKey: '', leadSourceKey: '', customerType: 'new'
    }
  ], {}, new Date('2026-09-18T12:00:00.000Z')).overview.quotes_sent, 1);
});

test('performance chart always returns the rolling six calendar months', () => {
  const now = new Date('2026-09-18T12:00:00.000Z');
  const data = _private.buildAnalyticsData([
    {
      quoteStatus: 'paid', quoteValue: 1000, collectedAmount: 1000,
      outstandingAmount: 0, fullPaid: true, paymentStatus: 'paid',
      sentAt: new Date('2026-04-10T08:00:00.000Z'), repId: 1,
      salesRep: { id: 1, name: 'Alex', email: 'alex@example.com' },
      shootTypeKey: '', leadSourceKey: '', customerType: 'new'
    },
    {
      quoteStatus: 'paid', quoteValue: 500, collectedAmount: 500,
      outstandingAmount: 0, fullPaid: true, paymentStatus: 'paid',
      sentAt: new Date('2026-09-10T08:00:00.000Z'), repId: 1,
      salesRep: { id: 1, name: 'Alex', email: 'alex@example.com' },
      shootTypeKey: '', leadSourceKey: '', customerType: 'new'
    }
  ], {}, now);

  assert.equal(data.performance_chart.length, 6);
  assert.deepEqual(data.performance_chart.map((item) => item.date), [
    '2026-04-01', '2026-05-01', '2026-06-01',
    '2026-07-01', '2026-08-01', '2026-09-01'
  ]);
  assert.equal(data.performance_chart[0].quotes_sent, 1);
  assert.equal(data.performance_chart[5].quotes_sent, 1);
});

test('an active unpaid quote becomes overdue 48 hours after its last contact', () => {
  const now = new Date('2026-09-18T12:00:00.000Z');
  const base = {
    quoteStatus: 'sent',
    fullPaid: false,
    sentAt: new Date('2026-09-10T12:00:00.000Z')
  };

  assert.equal(_private.isOverdue({
    ...base,
    lastContactedAt: new Date('2026-09-16T12:00:00.000Z')
  }, now), true);
  assert.equal(_private.isOverdue({
    ...base,
    lastContactedAt: new Date('2026-09-17T12:01:00.000Z')
  }, now), false);
});

test('current pipeline is not restricted to the selected sent-date cohort', () => {
  const now = new Date('2026-09-18T12:00:00.000Z');
  const records = [
    {
      quoteStatus: 'paid',
      quoteValue: 1000,
      collectedAmount: 1000,
      outstandingAmount: 0,
      fullPaid: true,
      paymentStatus: 'paid',
      sentAt: new Date('2026-09-18T08:00:00.000Z'),
      repId: 1,
      salesRep: { id: 1, name: 'Alex', email: 'alex@example.com' },
      shootTypeKey: '',
      leadSourceKey: '',
      customerType: 'new'
    },
    {
      quoteStatus: 'sent',
      quoteValue: 500,
      collectedAmount: 0,
      outstandingAmount: 500,
      fullPaid: false,
      paymentStatus: 'unpaid',
      sentAt: new Date('2026-08-01T08:00:00.000Z'),
      repId: 1,
      salesRep: { id: 1, name: 'Alex', email: 'alex@example.com' },
      shootTypeKey: '',
      leadSourceKey: '',
      customerType: 'new'
    }
  ];

  const data = _private.buildAnalyticsData(records, { date_preset: 'today' }, now);
  assert.equal(data.overview.quotes_sent, 1);
  assert.equal(data.overview.deals_won, 1);
  assert.equal(data.overview.open_pipeline.count, 1);
  assert.equal(data.overview.open_pipeline.value, 500);
});
