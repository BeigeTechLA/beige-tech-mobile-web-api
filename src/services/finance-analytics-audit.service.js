const ExcelJS = require('exceljs');
const financeAnalyticsService = require('./finance-analytics.service');

const round = (value) => Number(Number(value || 0).toFixed(2));
const sum = (rows, field) => round(rows.reduce((total, row) => total + Number(row[field] || 0), 0));
const count = (rows, predicate) => rows.filter(predicate).length;

function addSheet(workbook, name, columns, rows) {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = columns.map(([header, key, width]) => ({ header, key, width: width || 18 }));
  rows.forEach((row) => sheet.addRow(row));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(columns.length).letter}${Math.max(sheet.rowCount, 1)}` };
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF243247' } };
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 1) return;
    if (rowNumber % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F5F8' } };
  });
  return sheet;
}

function buildWorkbook(data) {
  const { audit, filters, revenue, creative_partners: cps, clients, disputes } = data;
  if (!audit) throw new Error('Analytics audit rows are required');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Beige Finance Analytics';
  workbook.created = new Date();

  const revenueRows = audit.revenue.map((row) => ({ ...row, in_range: row.in_range ? 'Yes' : 'No' }));
  const cpRows = audit.cp.map((row) => ({ ...row, in_range: row.in_range ? 'Yes' : 'No', timeline_in_range: row.timeline_in_range ? 'Yes' : 'No' }));
  const clientBookingRows = audit.client_bookings.map((row) => ({ ...row, included: row.included ? 'Yes' : 'No' }));
  const disputeRows = audit.disputes.map((row) => ({
    ...row,
    raised_in_range: row.raised_in_range ? 'Yes' : 'No',
    resolved_in_range: row.resolved_in_range ? 'Yes' : 'No'
  }));

  const includedRevenue = audit.revenue.filter((row) => row.in_range);
  const includedCp = audit.cp.filter((row) => row.in_range);
  const paidCp = includedCp.filter((row) => row.paid_amount > 0);
  const gross = sum(includedRevenue.filter((row) => ['paid', 'partially_paid'].includes(String(row.payment_status).toLowerCase())), 'total_amount');
  const pending = round(includedRevenue.reduce((total, row) =>
    total + (String(row.payment_status).toLowerCase() === 'refunded' ? 0 : Math.max(Number(row.total_amount || 0) - Number(row.collected_amount || 0), 0)), 0));
  const successfulPaymentStatuses = new Set(['paid', 'completed', 'success', 'succeeded']);
  const successfulRefundStatuses = new Set([...successfulPaymentStatuses, 'refunded']);
  const refunds = round(audit.transactions.reduce((total, row) =>
    total + (row.in_range && row.transaction_type === 'refund' && successfulRefundStatuses.has(String(row.status).toLowerCase())
      ? Math.abs(Number(row.gross_amount || row.net_amount || 0)) : 0), 0));
  const recovered = round(audit.transactions.reduce((total, row) =>
    total + (row.in_range && row.transaction_type === 'client_payment' && successfulPaymentStatuses.has(String(row.status).toLowerCase())
      ? Number(row.gross_amount || 0) : 0), 0));
  const cpPaid = sum(includedCp, 'paid_amount');
  const cpPayable = sum(includedCp, 'payable_amount');
  const distinctCpShoots = new Set(paidCp.map((row) => Number(row.booking_id))).size;
  const clientBalances = new Map();
  includedRevenue.forEach((row) => {
    const id = row.client_id ? `user:${row.client_id}` : `guest:${String(row.guest_email || row.booking_id).toLowerCase()}`;
    const current = clientBalances.get(id) || { collected: 0, outstanding: 0 };
    current.collected += Number(row.collected_amount || 0);
    current.outstanding += String(row.payment_status).toLowerCase() === 'refunded'
      ? 0
      : Math.max(Number(row.total_amount || 0) - Number(row.collected_amount || 0), 0);
    clientBalances.set(id, current);
  });
  const clientStatusCount = (status) => count([...clientBalances.values()], (row) => {
    const actual = row.outstanding <= 0 ? 'fully_paid' : row.collected > 0 ? 'partially_paid' : 'pending';
    return actual === status;
  });
  const raisedDisputes = audit.disputes.filter((row) => row.raised_in_range);
  const resolvedDisputes = audit.disputes.filter((row) => row.resolved_in_range);
  const checkRows = [];
  const check = (metric, dashboard, source, sourceSheet, rule) => checkRows.push({
    metric, dashboard: Number(dashboard || 0), source: Number(source || 0),
    difference: round(Number(dashboard || 0) - Number(source || 0)), source_sheet: sourceSheet, rule
  });

  check('Gross Revenue', revenue.gross_revenue.amount, gross, 'Revenue', 'Sum Full Total for Paid/Partially Paid rows in range');
  check('Refunds', revenue.refund_amount, refunds, 'Transactions Source', 'Successful refund transactions in range');
  check('Net Revenue', revenue.net_revenue.amount, round(gross - refunds), 'Revenue + Refunds', 'Gross minus refunds');
  check('Pending Revenue', revenue.pending_revenue.amount, pending, 'Revenue', 'Sum max(Full Total - Collected, 0) for non-refunded rows in range');
  check('CP Payout - Paid', revenue.cp_payout.paid_amount, cpPaid, 'CP Compensation', 'Sum Paid Amount where In Range = Yes');
  check('CP Payout - Payable', revenue.cp_payout.payable_amount, cpPayable, 'CP Compensation', 'Sum Payable Amount where In Range = Yes');
  check('CP Payout - Total', revenue.cp_payout.total_amount, round(cpPaid + cpPayable), 'CP Compensation', 'Paid plus payable');
  check('Average CP Payout', cps.averages.payout_per_assignment, paidCp.length ? round(cpPaid / paidCp.length) : 0, 'CP Compensation', 'Paid total / paid assignments');
  check('Average CP Margin %', cps.averages.cp_payout_percent_of_revenue, gross > 0 ? round(cpPaid / gross * 100) : 0, 'CP Compensation + Revenue', 'Paid CP payout / gross revenue × 100');
  check('Average CPs per Shoot', cps.averages.cps_per_shoot, distinctCpShoots ? round(paidCp.length / distinctCpShoots) : 0, 'CP Compensation', 'Paid assignments / distinct shoot IDs');
  const eligibleRevenueCount = count(includedRevenue, (row) => ['paid', 'partially_paid'].includes(String(row.payment_status).toLowerCase()));
  check('Average Client Spend per Shoot', clients.average_spend_per_shoot.amount, eligibleRevenueCount ? round(gross / eligibleRevenueCount) : 0, 'Revenue', 'Gross / paid or partially-paid finance rows');
  check('Collected Amount', clients.outstanding.collected_amount, sum(includedRevenue, 'collected_amount'), 'Revenue', 'Sum Collected Amount where In Range = Yes');
  check('Outstanding Amount', clients.outstanding.outstanding_amount, pending, 'Revenue', 'Sum remaining non-refunded balances');
  check('Recovered Payments', clients.outstanding.recovered_amount, recovered, 'Transactions Source', 'Successful client-payment transactions in range');
  check('Fully Paid Clients', clients.payment_overview.find((row) => row.id === 'fully_paid')?.clients, clientStatusCount('fully_paid'), 'Client Status', 'Count clients with Fully Paid status');
  check('Partially Paid Clients', clients.payment_overview.find((row) => row.id === 'partially_paid')?.clients, clientStatusCount('partially_paid'), 'Client Status', 'Count clients with Partially Paid status');
  check('Pending Clients', clients.payment_overview.find((row) => row.id === 'pending')?.clients, clientStatusCount('pending'), 'Client Status', 'Count clients with Pending status');
  check('Disputes Raised', disputes.raised, raisedDisputes.length, 'Disputes', 'Count Raised In Range = Yes');
  check('Disputes Resolved', disputes.resolved, resolvedDisputes.length, 'Disputes', 'Count Resolved In Range = Yes');
  check('Disputes Pending', disputes.pending, count(raisedDisputes, (row) => String(row.status).toLowerCase() === 'open'), 'Disputes', 'Raised in range and Open');
  check('Disputes Active', disputes.active, count(raisedDisputes, (row) => ['in_review', 'escalated'].includes(String(row.status).toLowerCase())), 'Disputes', 'Raised in range and In Review/Escalated');

  const today = audit.as_of_date;
  const overdueCp = includedCp.filter((row) => row.payable_amount > 0 && row.due_date && row.due_date < today);
  const timelineRules = [
    ['this_week', (row) => row.days_until_scheduled >= 0 && row.days_until_scheduled <= 6, 'This Week'],
    ['next_week', (row) => row.days_until_scheduled >= 7 && row.days_until_scheduled <= 13, 'Next Week'],
    ['2_4_weeks', (row) => row.days_until_scheduled >= 14 && row.days_until_scheduled <= 27, '2-4 Weeks'],
    ['overdue', (row) => row.days_until_scheduled < 0, 'Overdue']
  ];
  timelineRules.forEach(([id, predicate, label]) => {
    const bucket = cps.payout_timeline.find((row) => row.id === id);
    const dashboard = Object.values(bucket?.segments || {}).reduce((total, value) => total + Number(value || 0), 0);
    const sourceRows = audit.cp.filter((row) => row.timeline_in_range && row.payable_amount > 0 && row.scheduled_payout_date && row.timeline_segment && predicate(row));
    check(`CP Timeline - ${label}`, dashboard, sum(sourceRows, 'payable_amount'), 'CP Compensation', 'Remaining payable by scheduled date; colors by original deadline');
    for (const segment of ['upcoming', 'dueSoon', 'later', 'overdue']) {
      check(`CP Timeline - ${label} - ${segment}`, bucket?.segments[segment], sum(sourceRows.filter((row) => row.timeline_segment === segment), 'payable_amount'), 'CP Compensation', 'Remaining payable for schedule window and original due-date category');
    }
  });
  check('CP Unplotted Payouts', cps.payout_timeline_unshown_amount,
    sum(audit.cp.filter((row) => row.timeline_in_range && row.payable_amount > 0 && (!row.timeline_bucket || !row.timeline_segment)), 'payable_amount'),
    'CP Compensation', 'Remaining payable missing dates or outside the four-week windows');
  const overdueByCreator = new Map();
  overdueCp.forEach((row) => overdueByCreator.set(String(row.creator_id), round((overdueByCreator.get(String(row.creator_id)) || 0) + row.payable_amount)));
  const largestOverdue = [...overdueByCreator.values()].sort((a, b) => b - a).slice(0, 100).reduce((total, amount) => total + amount, 0);
  check('Top Overdue CPs - total listed', sum(cps.top_overdue, 'amount'), round(largestOverdue), 'CP Compensation', 'Top 100 overdue remaining balances');

  const payoutByCp = new Map();
  paidCp.forEach((row) => {
    const id = String(row.creator_id);
    const current = payoutByCp.get(id) || { id, payout: 0, shoots: new Set() };
    current.payout += row.paid_amount;
    current.shoots.add(Number(row.booking_id));
    payoutByCp.set(id, current);
  });
  const cpRankRows = [...payoutByCp.values()].map((row) => ({
    id: row.id, payout: round(row.payout), shoots: row.shoots.size
  }));
  const sameRank = (dashboard, expected, fields) => Number(dashboard.length === expected.length && dashboard.every((row, index) =>
    String(row.id) === String(expected[index].id) && fields.every((field) => round(row[field]) === round(expected[index][field]))));
  check('Top CPs By Payout ranking', sameRank(cps.top_by_payout, [...cpRankRows].sort((a, b) => b.payout - a.payout).slice(0, 5), ['payout', 'shoots']), 1, 'CP Compensation', '1 means all ranked IDs, paid amounts and shoot counts match');
  check('Top CPs By Shoots ranking', sameRank(cps.top_by_shoots, [...cpRankRows].sort((a, b) => b.shoots - a.shoots).slice(0, 10), ['shoots']), 1, 'CP Compensation', '1 means all ranked IDs and distinct shoot counts match');

  const clientById = new Map();
  audit.client_bookings.filter((row) => row.included).forEach((row) => {
    const id = row.client_id ? `user:${row.client_id}` : `guest:${String(row.guest_email || row.booking_id).toLowerCase()}`;
    const current = clientById.get(id) || { id, spend: 0, shoots: new Set() };
    current.spend += Number(row.total_amount || 0);
    current.shoots.add(Number(row.booking_id));
    clientById.set(id, current);
  });
  const clientRankRows = [...clientById.values()].map((row) => ({ id: row.id, spend: round(row.spend), shoots: row.shoots.size }));
  check('Top Clients By Shoots ranking', sameRank(clients.top_by_shoots, [...clientRankRows].sort((a, b) => b.shoots - a.shoots || b.spend - a.spend).slice(0, 100), ['shoots', 'spend']), 1, 'Client Bookings', '1 means all ranked IDs, shoots and spend match');
  check('Top Clients By Spend ranking', sameRank(clients.top_by_spend, [...clientRankRows].sort((a, b) => b.spend - a.spend).slice(0, 100), ['shoots', 'spend']), 1, 'Client Bookings', '1 means all ranked IDs, shoots and spend match');
  const reasonCounts = new Map();
  raisedDisputes.forEach((row) => reasonCounts.set(row.category || 'other', (reasonCounts.get(row.category || 'other') || 0) + 1));
  const expectedReasons = [...reasonCounts.entries()].map(([id, cases]) => ({ id, cases })).sort((a, b) => b.cases - a.cases).slice(0, 5);
  check('Top Dispute Reasons ranking', sameRank(disputes.top_reasons, expectedReasons, ['cases']), 1, 'Disputes', '1 means all ranked reasons and counts match');

  const summary = addSheet(workbook, 'Summary', [
    ['Metric', 'metric', 34], ['Dashboard', 'dashboard', 20], ['Source Total', 'source', 20],
    ['Difference', 'difference', 18], ['Source Sheet', 'source_sheet', 25], ['Calculation', 'rule', 58]
  ], checkRows);
  summary.getColumn('B').numFmt = '#,##0.00;[Red](#,##0.00)';
  summary.getColumn('C').numFmt = '#,##0.00;[Red](#,##0.00)';
  summary.getColumn('D').numFmt = '#,##0.00;[Red](#,##0.00)';
  summary.addRow({ metric: 'Date range', dashboard: filters.start_date || 'All time', source: filters.end_date || 'All time', source_sheet: filters.timezone });
  summary.addRow({ metric: 'Overdue as of', dashboard: audit.as_of_date, source_sheet: filters.timezone });
  summary.addRow({ metric: 'Note', rule: 'Zero difference checks arithmetic against exported rows. Review inclusion and source records for business-data accuracy.' });

  addSheet(workbook, 'Revenue', [
    ['Shoot ID', 'booking_id', 15], ['Project', 'project_name', 30], ['Client ID', 'client_id', 15], ['Guest Email', 'guest_email', 28],
    ['Activity Date', 'activity_date', 18], ['Payment Status', 'payment_status', 20],
    ['Full Total', 'total_amount', 18], ['Collected', 'collected_amount', 18],
    ['In Range', 'in_range', 12], ['Gross Contribution', 'gross_contribution', 22],
    ['Pending Contribution', 'pending_contribution', 24]
  ], revenueRows);
  addSheet(workbook, 'Refunds', [
    ['Transaction ID', 'id', 18], ['Shoot ID', 'booking_id', 15], ['Transaction Date', 'date', 20],
    ['Status', 'status', 18], ['Amount', 'amount', 18]
  ], audit.refunds);
  addSheet(workbook, 'Recovered Payments', [
    ['Transaction ID', 'id', 18], ['Shoot ID', 'booking_id', 15], ['Transaction Date', 'date', 20],
    ['Status', 'status', 18], ['Amount', 'value', 18]
  ], audit.recovered);
  addSheet(workbook, 'Transactions Source', [
    ['Transaction ID', 'id', 18], ['Shoot ID', 'booking_id', 15], ['Type', 'transaction_type', 20],
    ['Status', 'status', 18], ['Transaction Date', 'transaction_date', 20], ['Gross Amount', 'gross_amount', 18],
    ['Net Amount', 'net_amount', 18], ['In Range', 'in_range', 12]
  ], audit.transactions.map((row) => ({ ...row, in_range: row.in_range ? 'Yes' : 'No' })));
  addSheet(workbook, 'CP Compensation', [
    ['Earning ID', 'earning_id', 16], ['Shoot ID', 'booking_id', 15], ['CP ID', 'creator_id', 14],
    ['CP Name', 'creator_name', 26], ['Status', 'status', 18], ['Approval', 'approval_status', 18],
    ['Activity Date', 'activity_date', 18], ['Due Date', 'due_date', 18], ['Full Amount', 'amount', 18],
    ['Paid Amount', 'paid_amount', 18], ['Payable Amount', 'payable_amount', 20],
    ['In Range', 'in_range', 12], ['Days Until Due', 'days_until_due', 18],
    ['Original Due Date', 'original_due_date', 20], ['Scheduled Payout Date', 'scheduled_payout_date', 24],
    ['Timeline In Range', 'timeline_in_range', 20], ['Timeline Bucket', 'timeline_bucket', 20],
    ['Timeline Segment', 'timeline_segment', 20], ['Days Until Scheduled', 'days_until_scheduled', 24]
  ], cpRows);
  addSheet(workbook, 'Client Bookings', [
    ['Shoot ID', 'booking_id', 15], ['Client ID', 'client_id', 16], ['Guest Email', 'guest_email', 30],
    ['Activity Date', 'activity_date', 18], ['Payment Status', 'payment_status', 20],
    ['Full Total', 'total_amount', 18], ['Collected', 'collected_amount', 18], ['Included In Ranking', 'included', 22]
  ], clientBookingRows);
  addSheet(workbook, 'Client Status', [
    ['Client ID', 'id', 22], ['Name', 'name', 28], ['Shoots', 'shoots', 12],
    ['Spend', 'spend', 18], ['Collected', 'collected', 18], ['Outstanding', 'outstanding', 18], ['Status', 'status', 20]
  ], audit.clients);
  addSheet(workbook, 'Top CP Payout', [
    ['Rank', 'rank', 10], ['CP ID', 'id', 15], ['Name', 'name', 28], ['Paid Payout', 'payout', 18],
    ['Distinct Shoots', 'shoots', 18], ['Shoot Revenue', 'shoot_revenue', 20], ['Payout Ratio %', 'margin', 20]
  ], cps.top_by_payout.map((row, index) => ({ ...row, rank: index + 1 })));
  addSheet(workbook, 'Top CP Shoots', [
    ['Rank', 'rank', 10], ['CP ID', 'id', 15], ['Name', 'name', 28], ['Distinct Paid Shoots', 'shoots', 24]
  ], cps.top_by_shoots.map((row, index) => ({ ...row, rank: index + 1 })));
  addSheet(workbook, 'Top Clients Shoots', [
    ['Rank', 'rank', 10], ['Client ID', 'id', 22], ['Name', 'name', 28], ['Shoots', 'shoots', 14], ['Spend', 'spend', 18]
  ], clients.top_by_shoots.map((row, index) => ({ ...row, rank: index + 1 })));
  addSheet(workbook, 'Top Clients Spend', [
    ['Rank', 'rank', 10], ['Client ID', 'id', 22], ['Name', 'name', 28], ['Shoots', 'shoots', 14], ['Spend', 'spend', 18]
  ], clients.top_by_spend.map((row, index) => ({ ...row, rank: index + 1 })));
  addSheet(workbook, 'Disputes', [
    ['Dispute ID', 'id', 16], ['Shoot ID', 'booking_id', 15], ['Created Date', 'created_date', 18],
    ['Resolved Date', 'resolved_date', 18], ['Status', 'status', 18], ['Reason', 'category', 25],
    ['Raised In Range', 'raised_in_range', 20], ['Resolved In Range', 'resolved_in_range', 22]
  ], disputeRows);
  addSheet(workbook, 'Top Reasons', [
    ['Rank', 'rank', 10], ['Reason', 'name', 30], ['Cases', 'cases', 15]
  ], disputes.top_reasons.map((row, index) => ({ ...row, rank: index + 1 })));

  return workbook.xlsx.writeBuffer();
}

async function exportAnalyticsAudit(query = {}) {
  const data = await financeAnalyticsService.getAnalyticsAudit(query);
  return { buffer: await buildWorkbook(data), filters: data.filters };
}

module.exports = { exportAnalyticsAudit, _private: { buildWorkbook } };
