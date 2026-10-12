function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function payoutAmountsByEarningId(payoutRequests = []) {
  const amounts = new Map();
  payoutRequests
    .filter((request) => String(request.status || '').toLowerCase() === 'paid')
    .forEach((request) => {
      let metadata = request.metadata_json;
      if (typeof metadata === 'string') {
        try {
          metadata = JSON.parse(metadata);
        } catch (_) {
          metadata = null;
        }
      }
      const earningId = Number(metadata?.creator_earning_id);
      if (!earningId) return;
      amounts.set(earningId, toMoney((amounts.get(earningId) || 0) + Number(request.amount || 0)));
    });
  return amounts;
}

function attemptTime(earning = {}) {
  const value = earning.submitted_at || earning.approved_at || earning.rejected_at || earning.created_at || earning.updated_at;
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

// A creator can have historical drafts, rejected edits, and revisions for the
// same shoot. Reporting only considers compensation that was actually added
// to the compensation workflow (pending approval or approved), then keeps one
// current record for that CP and shoot.
function getCanonicalCpEarningRows(earnings = []) {
  const latestByAssignment = new Map();

  earnings
    .filter((earning) => (
      ['pending_approval', 'approved'].includes(String(earning.approval_status || '').toLowerCase())
      && String(earning.status || '').toLowerCase() !== 'cancelled'
    ))
    .forEach((earning) => {
      const bookingId = Number(earning.booking_id);
      const creatorId = Number(earning.creator_id);
      if (!bookingId || !creatorId) return;

      const key = `${bookingId}:${creatorId}`;
      const current = latestByAssignment.get(key);
      if (!current) {
        latestByAssignment.set(key, earning);
        return;
      }

      const currentTime = attemptTime(current);
      const nextTime = attemptTime(earning);
      if (
        nextTime > currentTime ||
        (nextTime === currentTime && Number(earning.creator_earning_id || 0) > Number(current.creator_earning_id || 0))
      ) {
        latestByAssignment.set(key, earning);
      }
    });

  return Array.from(latestByAssignment.values());
}

function isInOverviewPeriod(earning, period = 'all_time', now = new Date()) {
  if (period === 'all_time') return true;

  // A completed payment updates the earning at payment time. For unpaid
  // compensation, this is the date the current approved record was updated.
  const activityDate = new Date(earning.updated_at || earning.approved_at || earning.submitted_at || earning.created_at);
  if (Number.isNaN(activityDate.getTime())) return false;

  const current = new Date(now);
  if (period === 'this_month') {
    return activityDate.getUTCFullYear() === current.getUTCFullYear()
      && activityDate.getUTCMonth() === current.getUTCMonth();
  }
  if (period === 'last_3_months') {
    const start = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 2, 1));
    return activityDate >= start && activityDate <= current;
  }
  if (period === 'this_year') {
    return activityDate.getUTCFullYear() === current.getUTCFullYear();
  }
  return true;
}

function buildCpCompensationOverview(earnings = [], { period = 'all_time', paidAmountsByEarningId = new Map() } = {}) {
  const rows = getCanonicalCpEarningRows(earnings)
    .filter((earning) => isInOverviewPeriod(earning, period));
  const amounts = rows.map((earning) => {
    const total = toMoney(earning.net_earning_amount || 0);
    const recordedPaid = toMoney(paidAmountsByEarningId.get(Number(earning.creator_earning_id)) || 0);
    // Older, fully-paid records may predate payout-request records. Their
    // status remains a safe fallback; partial payments always use the record.
    const paid = String(earning.status || '').toLowerCase() === 'paid'
      ? (recordedPaid > 0 ? Math.min(recordedPaid, total) : total)
      : Math.min(recordedPaid, total);
    return { total, paid, payable: toMoney(Math.max(total - paid, 0)) };
  });
  const sum = (field) => toMoney(amounts.reduce((total, amount) => total + amount[field], 0));

  return {
    total_amount: sum('total'),
    paid_amount: sum('paid'),
    payable_amount: sum('payable'),
    paid_assignments: amounts.filter((amount) => amount.paid > 0).length,
    payable_assignments: amounts.filter((amount) => amount.payable > 0).length,
    total_assignments: rows.length
  };
}

module.exports = { getCanonicalCpEarningRows, payoutAmountsByEarningId, buildCpCompensationOverview };
