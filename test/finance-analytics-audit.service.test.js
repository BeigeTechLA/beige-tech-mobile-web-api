const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { _private: analytics } = require('../src/services/finance-analytics.service');
const { _private: audit } = require('../src/services/finance-analytics-audit.service');

test('reconciliation workbook exposes source rows and matches dashboard metrics', async () => {
  const filters = analytics.resolveFilters({ start_date: '2026-10-01', end_date: '2026-10-31', timezone: 'UTC' });
  const data = analytics.buildAnalyticsData({
    bookings: [
      { stream_project_booking_id: 1, user_id: 10, project_name: 'Paid shoot', payment_completed_at: '2026-10-01T10:00:00Z', event_date: '2026-09-20' },
      { stream_project_booking_id: 2, user_id: 11, project_name: 'Partial shoot', payment_completed_at: '2026-10-02T10:00:00Z', event_date: '2026-09-21' }
    ],
    users: [{ id: 10, name: 'Client A' }, { id: 11, name: 'Client B' }],
    creators: [{ crew_member_id: 20, first_name: 'Partner', last_name: 'A' }],
    breakdowns: [
      { booking_id: 1, client_user_id: 10, payment_status: 'paid', total_amount: 1000, collected_amount: 1000 },
      { booking_id: 2, client_user_id: 11, payment_status: 'partially_paid', total_amount: 800, collected_amount: 300 }
    ],
    clientPaymentBookings: [
      { booking_id: 1, client_user_id: 10, payment_status: 'paid', total_amount: 1000, collected_amount: 1000, activity_date: '2026-10-01T10:00:00Z' },
      { booking_id: 2, client_user_id: 11, payment_status: 'partially_paid', total_amount: 800, collected_amount: 300, activity_date: '2026-10-02T10:00:00Z' }
    ],
    transactions: [
      { finance_transaction_id: 1, booking_id: 1, transaction_type: 'client_payment', status: 'paid', gross_amount: 1000, transaction_date: '2026-10-01T10:00:00Z' },
      { finance_transaction_id: 2, booking_id: 2, transaction_type: 'client_payment', status: 'paid', gross_amount: 300, transaction_date: '2026-10-02T10:00:00Z' },
      { finance_transaction_id: 3, booking_id: 1, transaction_type: 'refund', status: 'paid', gross_amount: 100, transaction_date: '2026-10-03T10:00:00Z' }
    ],
    earnings: [{ creator_earning_id: 1, booking_id: 1, creator_id: 20, net_earning_amount: 250, status: 'paid', approval_status: 'approved', updated_at: '2026-10-04T10:00:00Z' }],
    disputes: [{ finance_dispute_id: 1, booking_id: 1, status: 'open', category: 'quality', created_at: '2026-10-05T10:00:00Z' }]
  }, filters, new Date('2026-10-10T00:00:00Z'), true);

  const buffer = await audit.buildWorkbook(data);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const summary = workbook.getWorksheet('Summary');
  const checks = new Map(summary.getRows(2, summary.rowCount - 1).map((row) => [row.getCell(1).value, row]));
  assert.equal(checks.get('Gross Revenue').getCell(2).value, 1800);
  assert.equal(checks.get('Pending Revenue').getCell(3).value, 500);
  assert.equal(checks.get('Refunds').getCell(3).value, 100);
  assert.equal(checks.get('Top CPs By Shoots ranking').getCell(4).value, 0);
  assert.equal(checks.get('Top Clients By Shoots ranking').getCell(4).value, 0);
  assert.equal(checks.get('Top Dispute Reasons ranking').getCell(4).value, 0);
  for (const row of checks.values()) {
    if (typeof row.getCell(4).value === 'number') assert.equal(row.getCell(4).value, 0, String(row.getCell(1).value));
  }
  assert.equal(workbook.getWorksheet('Revenue').rowCount, 3);
  assert.equal(workbook.getWorksheet('CP Compensation').rowCount, 2);
  assert.equal(workbook.getWorksheet('Disputes').rowCount, 2);
});

test('reconciliation workbook supports an empty date range without false differences', async () => {
  const filters = analytics.resolveFilters({ start_date: '2026-10-01', end_date: '2026-10-01', timezone: 'UTC' });
  const data = analytics.buildAnalyticsData({}, filters, new Date('2026-10-01T00:00:00Z'), true);
  const buffer = await audit.buildWorkbook(data);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const summary = workbook.getWorksheet('Summary');
  summary.eachRow((row, number) => {
    if (number > 1 && typeof row.getCell(4).value === 'number') {
      assert.equal(row.getCell(4).value, 0, String(row.getCell(1).value));
    }
  });
  assert.equal(workbook.getWorksheet('Revenue').rowCount, 1);
});
