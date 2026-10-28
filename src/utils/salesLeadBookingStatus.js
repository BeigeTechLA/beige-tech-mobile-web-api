const normalizeStatus = (value) => String(value || '')
  .replace(/â€“|Ã¢â‚¬â€œ|â€”|â€“|[–—]/g, '-')
  .trim()
  .toLowerCase();

function resolveSalesLeadBookingStatus({
  baseStatus,
  leadStatus,
  bookingCancelled,
  manualProgress,
  paymentSummary,
  outstandingAdditionalPayment
}) {
  if (
    leadStatus === 'abandoned' ||
    Number(bookingCancelled || 0) === 1 ||
    normalizeStatus(baseStatus).includes('closed - lost')
  ) return 'Closed - Lost';

  if (paymentSummary) {
    const paid = Number(paymentSummary.paid_amount || 0) + Number(paymentSummary.credit_used_amount || 0);
    const due = Number(paymentSummary.due_amount || 0);
    const status = normalizeStatus(paymentSummary.payment_status);

    if (due > 0.009) {
      if (paid > 0 || ['partially_paid', 'partial_paid', 'approval_pending'].includes(status)) {
        return 'Partially Paid';
      }
      return baseStatus === 'Paid' ? 'Ready for Payment' : baseStatus;
    }
    if (paid > 0 || ['paid', 'no_payment_due', 'completed', 'success'].includes(status)) return 'Paid';
    return baseStatus;
  }

  if (manualProgress?.hasFullPayment) return 'Paid';
  if (manualProgress?.isPartiallyPaid || outstandingAdditionalPayment) return 'Partially Paid';
  return baseStatus;
}

module.exports = { resolveSalesLeadBookingStatus };
