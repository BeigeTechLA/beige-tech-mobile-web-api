const test = require('node:test');
const assert = require('node:assert/strict');

const { _private } = require('../src/services/finance-analytics.service');

const filters = _private.resolveFilters({
  start_date: '2026-10-01',
  end_date: '2026-10-31',
  timezone: 'UTC'
});

test('Finance Analytics includes paid and partially paid shoots, while retaining partial outstanding balance', () => {
  const data = _private.buildAnalyticsData({
    bookings: [
      { stream_project_booking_id: 1, user_id: 10, payment_completed_at: '2026-10-01T10:00:00Z', event_date: '2026-10-01' },
      { stream_project_booking_id: 2, user_id: 11, payment_completed_at: '2026-10-02T10:00:00Z', event_date: '2026-10-02' }
    ],
    users: [{ id: 10, name: 'Paid Client' }, { id: 11, name: 'Partial Client' }],
    breakdowns: [
      { booking_id: 1, client_user_id: 10, payment_status: 'paid', total_amount: 1000, collected_amount: 1000, outstanding_amount: 0, calculated_at: '2026-10-01T10:00:00Z' },
      { booking_id: 2, client_user_id: 11, payment_status: 'partially_paid', total_amount: 800, collected_amount: 300, outstanding_amount: 500, calculated_at: '2026-10-02T10:00:00Z' },
      { booking_id: 3, payment_status: 'pending', total_amount: 999, collected_amount: 0, outstanding_amount: 999, calculated_at: '2026-10-03T10:00:00Z' }
    ],
    transactions: [], earnings: [], disputes: [], creators: []
  }, filters, new Date('2026-10-10T00:00:00Z'));

  assert.equal(data.revenue.gross_revenue.amount, 1800);
  assert.equal(data.revenue.pending_revenue.amount, 1499);
  assert.equal(data.clients.average_spend_per_shoot.amount, 900);
  assert.deepEqual(data.clients.payment_overview.map((item) => [item.id, item.clients]), [
    ['fully_paid', 1], ['partially_paid', 1], ['pending', 1]
  ]);
});

test('Finance Analytics excludes pending shoots from Top Clients rankings', () => {
  const data = _private.buildAnalyticsData({
    bookings: [
      { stream_project_booking_id: 1, user_id: 10, payment_completed_at: '2026-10-01T10:00:00Z' },
      { stream_project_booking_id: 2, user_id: 10, payment_completed_at: '2026-10-02T10:00:00Z' }
    ],
    users: [{ id: 10, name: 'Client' }],
    breakdowns: [
      { booking_id: 1, client_user_id: 10, payment_status: 'paid', total_amount: 1000, collected_amount: 1000, calculated_at: '2026-10-01T10:00:00Z' },
      { booking_id: 2, client_user_id: 10, payment_status: 'pending', total_amount: 5000, collected_amount: 0, calculated_at: '2026-10-02T10:00:00Z' }
    ],
    transactions: [], earnings: [], disputes: [], creators: []
  }, filters, new Date('2026-10-10T00:00:00Z'));

  assert.deepEqual(data.clients.top_by_shoots, [{
    id: 'user:10', name: 'Client', shoots: 1, spend: 1000, collected: 1000, outstanding: 0, status: 'fully_paid'
  }]);
});

test('Finance Analytics excludes pending bookings from Top Clients when the booking payment source is available', () => {
  const data = _private.buildAnalyticsData({
    bookings: [
      { stream_project_booking_id: 1, user_id: 10 },
      { stream_project_booking_id: 2, user_id: 10 },
      { stream_project_booking_id: 3, user_id: 11 }
    ],
    users: [{ id: 10, name: 'Paying Client' }, { id: 11, name: 'Pending Client' }],
    clientPaymentBookings: [
      { booking_id: 1, client_user_id: 10, payment_status: 'paid', total_amount: 1000, collected_amount: 1000, activity_date: '2026-10-01T10:00:00Z' },
      { booking_id: 2, client_user_id: 10, payment_status: 'pending', total_amount: 5000, collected_amount: 0, activity_date: '2026-10-02T10:00:00Z' },
      { booking_id: 3, client_user_id: 11, payment_status: 'pending', total_amount: 2000, collected_amount: 0, activity_date: '2026-10-03T10:00:00Z' }
    ]
  }, filters, new Date('2026-10-10T00:00:00Z'));

  assert.deepEqual(data.clients.top_by_shoots.map(({ id, shoots, spend }) => ({ id, shoots, spend })), [
    { id: 'user:10', shoots: 1, spend: 1000 }
  ]);
});

test('Finance Analytics subtracts paid refunds and groups each client only once', () => {
  const data = _private.buildAnalyticsData({
    bookings: [{ stream_project_booking_id: 1, user_id: 10, payment_completed_at: '2026-10-01T10:00:00Z', event_date: '2026-10-01' }],
    users: [{ id: 10, name: 'One Client' }],
    breakdowns: [{ booking_id: 1, client_user_id: 10, payment_status: 'paid', total_amount: 1000, collected_amount: 1000, outstanding_amount: 0, calculated_at: '2026-10-01T10:00:00Z' }],
    transactions: [{ finance_transaction_id: 1, booking_id: 1, transaction_type: 'refund', status: 'paid', gross_amount: 125, transaction_date: '2026-10-03T10:00:00Z' }],
    earnings: [], disputes: [], creators: []
  }, filters, new Date('2026-10-10T00:00:00Z'));

  assert.equal(data.revenue.refund_amount, 125);
  assert.equal(data.revenue.net_revenue.amount, 875);
  assert.equal(data.clients.payment_overview.find((item) => item.id === 'fully_paid').clients, 1);
});

test('Finance Analytics calculates CP margin from total CP payout divided by eligible shoot revenue', () => {
  const data = _private.buildAnalyticsData({
    bookings: [{ stream_project_booking_id: 1, user_id: 10, payment_completed_at: '2026-10-01T10:00:00Z', event_date: '2026-10-01' }],
    users: [{ id: 10, name: 'Client' }],
    creators: [{ crew_member_id: 20, first_name: 'Creative', last_name: 'Partner' }],
    breakdowns: [{ booking_id: 1, client_user_id: 10, payment_status: 'paid', total_amount: 1000, collected_amount: 1000, outstanding_amount: 0, calculated_at: '2026-10-01T10:00:00Z' }],
    transactions: [],
    earnings: [{ creator_earning_id: 1, booking_id: 1, creator_id: 20, net_earning_amount: 300, status: 'paid', approval_status: 'approved', metadata_json: '{"due_date":"2026-10-15"}', created_at: '2026-10-01T10:00:00Z' }],
    disputes: []
  }, filters, new Date('2026-10-10T00:00:00Z'));

  assert.equal(data.revenue.cp_payout.total_amount, 300);
  assert.equal(data.creative_partners.averages.cp_payout_percent_of_revenue, 30);
  assert.equal(data.creative_partners.averages.cps_per_shoot, 1);
});

test('Finance Analytics excludes draft system earnings until compensation is submitted', () => {
  const data = _private.buildAnalyticsData({
    bookings: [{ stream_project_booking_id: 1, payment_completed_at: '2026-10-01T10:00:00Z', event_date: '2026-10-01' }],
    creators: [{ crew_member_id: 20, first_name: 'Draft', last_name: 'Creator' }],
    breakdowns: [{ booking_id: 1, payment_status: 'paid', total_amount: 1000, collected_amount: 1000, calculated_at: '2026-10-01T10:00:00Z' }],
    transactions: [],
    earnings: [{
      creator_earning_id: 1,
      booking_id: 1,
      creator_id: 20,
      net_earning_amount: 5000,
      status: 'pending',
      approval_status: 'draft',
      compensation_source: 'system',
      created_at: '2026-10-01T10:00:00Z'
    }],
    disputes: [],
    users: []
  }, filters, new Date('2026-10-10T00:00:00Z'));

  assert.equal(data.revenue.cp_payout.total_amount, 0);
  assert.deepEqual(data.creative_partners.top_by_payout, []);
  assert.deepEqual(data.creative_partners.top_by_shoots, []);
});

test('Finance Analytics excludes unpaid compensation from Top CP payout rankings', () => {
  const data = _private.buildAnalyticsData({
    bookings: [{ stream_project_booking_id: 1, payment_completed_at: '2026-10-01T10:00:00Z', event_date: '2026-10-01' }],
    creators: [{ crew_member_id: 20, first_name: 'Unpaid', last_name: 'Creator' }],
    breakdowns: [{ booking_id: 1, payment_status: 'paid', total_amount: 1000, collected_amount: 1000, calculated_at: '2026-10-01T10:00:00Z' }],
    transactions: [],
    earnings: [{
      creator_earning_id: 1,
      booking_id: 1,
      creator_id: 20,
      net_earning_amount: 300,
      status: 'earned',
      approval_status: 'approved',
      created_at: '2026-10-01T10:00:00Z'
    }],
    disputes: [],
    users: []
  }, filters, new Date('2026-10-10T00:00:00Z'));

  assert.equal(data.revenue.cp_payout.payable_amount, 300);
  assert.deepEqual(data.creative_partners.top_by_payout, []);
  assert.deepEqual(data.creative_partners.top_by_shoots, []);
});

test('Finance Analytics includes a paid CP payout without a client finance breakdown', () => {
  const data = _private.buildAnalyticsData({
    bookings: [{ stream_project_booking_id: 99, event_date: '2026-10-01' }],
    creators: [{ crew_member_id: 20, first_name: 'Paid', last_name: 'Creator' }],
    breakdowns: [],
    transactions: [],
    earnings: [{
      creator_earning_id: 1,
      booking_id: 99,
      creator_id: 20,
      net_earning_amount: 250,
      status: 'paid',
      approval_status: 'approved',
      updated_at: '2026-10-01T10:00:00Z'
    }],
    disputes: [],
    users: []
  }, filters, new Date('2026-10-10T00:00:00Z'));

  assert.deepEqual(data.creative_partners.top_by_payout.map(({ name, shoots, payout }) => ({ name, shoots, payout })), [
    { name: 'Paid Creator', shoots: 1, payout: 250 }
  ]);
});

test('Finance Analytics timeline and overdue list use the remaining balance after a partial CP payout', () => {
  const data = _private.buildAnalyticsData({
    bookings: [{ stream_project_booking_id: 1, event_date: '2026-09-20' }],
    creators: [{ crew_member_id: 20, first_name: 'Partial', last_name: 'Creator' }],
    earnings: [{
      creator_earning_id: 1, booking_id: 1, creator_id: 20,
      net_earning_amount: 500, status: 'earned', approval_status: 'approved',
      metadata_json: '{"due_date":"2026-10-05"}', created_at: '2026-09-20T10:00:00Z'
    }],
    paidAmountsByEarningId: new Map([[1, 200]])
  }, filters, new Date('2026-10-10T00:00:00Z'));

  assert.deepEqual(data.revenue.cp_payout, { paid_amount: 200, payable_amount: 300, total_amount: 500 });
  assert.equal(data.creative_partners.payout_timeline.find((row) => row.id === 'overdue').segments.overdue, 300);
  assert.equal(data.creative_partners.top_overdue[0].amount, 300);
});

test('Finance Analytics counts a refund in its transaction period even when the sale was earlier', () => {
  const data = _private.buildAnalyticsData({
    bookings: [{ stream_project_booking_id: 1, payment_completed_at: '2026-09-20T10:00:00Z' }],
    breakdowns: [{
      booking_id: 1, payment_status: 'paid', total_amount: 1000,
      collected_amount: 1000, calculated_at: '2026-09-20T10:00:00Z'
    }],
    transactions: [{
      finance_transaction_id: 1, booking_id: 1, transaction_type: 'refund',
      status: 'paid', gross_amount: 100, transaction_date: '2026-10-03T10:00:00Z'
    }]
  }, filters, new Date('2026-10-10T00:00:00Z'));

  assert.equal(data.revenue.gross_revenue.amount, 0);
  assert.equal(data.revenue.refund_amount, 100);
  assert.equal(data.revenue.net_revenue.amount, -100);
  assert.equal(data.revenue.series.find((row) => row.date === '2026-10-03').refunds, 100);
});

test('Finance Analytics includes a later client installment in recovered payments for its transaction period', () => {
  const data = _private.buildAnalyticsData({
    bookings: [{ stream_project_booking_id: 1, payment_completed_at: '2026-09-20T10:00:00Z' }],
    breakdowns: [{
      booking_id: 1, payment_status: 'partially_paid', total_amount: 1000,
      collected_amount: 600, calculated_at: '2026-09-20T10:00:00Z'
    }],
    transactions: [
      { finance_transaction_id: 1, booking_id: 1, transaction_type: 'client_payment', status: 'paid', gross_amount: 200, transaction_date: '2026-09-20T10:00:00Z' },
      { finance_transaction_id: 2, booking_id: 1, transaction_type: 'client_payment', status: 'paid', gross_amount: 400, transaction_date: '2026-10-03T10:00:00Z' }
    ]
  }, filters, new Date('2026-10-10T00:00:00Z'));

  assert.equal(data.revenue.gross_revenue.amount, 0);
  assert.equal(data.clients.outstanding.recovered_amount, 400);
  assert.deepEqual(data.clients.outstanding.recovered_series, [{ name: '2026-10-03', value: 400 }]);
});
