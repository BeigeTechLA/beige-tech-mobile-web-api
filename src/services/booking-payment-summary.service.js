const db = require('../models');

function roundAmount(value) {
  return Number(Number(value || 0).toFixed(2));
}

const PAID_STATUSES = new Set(['paid', 'no_payment_due', 'completed', 'success']);

function normalizePaymentSummaryState(paymentSummary, fallback = {}) {
  const hasSummary = Boolean(paymentSummary);
  const quoteTotal = roundAmount(
    hasSummary
      ? paymentSummary.quote_total
      : fallback.quoteTotal
  );
  const paidAmount = roundAmount(
    hasSummary
      ? paymentSummary.paid_amount
      : fallback.paidAmount
  );
  const creditUsedAmount = roundAmount(
    hasSummary
      ? paymentSummary.credit_used_amount
      : fallback.creditUsedAmount
  );
  const creditCreatedAmount = roundAmount(
    hasSummary
      ? paymentSummary.credit_created_amount
      : fallback.creditCreatedAmount
  );
  const dueAmount = hasSummary
    ? roundAmount(Math.max(Number(paymentSummary.due_amount || 0), 0))
    : calculateDueAmount({ quoteTotal, paidAmount, creditUsedAmount });
  const rawStatus = String(
    hasSummary
      ? paymentSummary.payment_status
      : fallback.paymentStatus
  || '').toLowerCase();
  const paymentStatus = rawStatus || resolvePaymentStatus({
    dueAmount,
    paidAmount,
    quoteTotal,
    lastQuoteChangeStatus: hasSummary ? paymentSummary.last_quote_change_status : fallback.lastQuoteChangeStatus
  });
  const isPaid =
    dueAmount <= 0 &&
    (paidAmount > 0 || creditUsedAmount > 0 || PAID_STATUSES.has(paymentStatus));
  const isPartiallyPaid = !isPaid && paidAmount > 0 && dueAmount > 0;
  const payableAmount = isPaid ? 0 : dueAmount;

  return {
    source: hasSummary ? 'booking_payment_summary' : 'fallback',
    hasSummary,
    paymentSummary: paymentSummary || null,
    quoteTotal,
    paidAmount,
    paid_amount: paidAmount,
    paidAmountTotal: paidAmount,
    paid_amount_total: paidAmount,
    creditUsedAmount,
    credit_used_amount: creditUsedAmount,
    creditCreatedAmount,
    credit_created_amount: creditCreatedAmount,
    dueAmount,
    due_amount: dueAmount,
    pendingAmount: dueAmount,
    pending_amount: dueAmount,
    outstandingAmount: dueAmount,
    outstanding_amount: dueAmount,
    payableAmount,
    payable_amount: payableAmount,
    paymentStatus,
    payment_status: paymentStatus,
    isPaid,
    is_paid: isPaid,
    isPartiallyPaid,
    is_partially_paid: isPartiallyPaid,
    requiresPayment: payableAmount > 0,
    requires_payment: payableAmount > 0,
    isCollected: isPaid,
    is_collected: isPaid,
    lastQuoteChangeType: hasSummary ? paymentSummary.last_quote_change_type : fallback.lastQuoteChangeType,
    last_quote_change_type: hasSummary ? paymentSummary.last_quote_change_type : fallback.lastQuoteChangeType,
    lastQuoteChangeAmount: roundAmount(hasSummary ? paymentSummary.last_quote_change_amount : fallback.lastQuoteChangeAmount),
    last_quote_change_amount: roundAmount(hasSummary ? paymentSummary.last_quote_change_amount : fallback.lastQuoteChangeAmount),
    lastQuoteChangeStatus: hasSummary ? paymentSummary.last_quote_change_status : fallback.lastQuoteChangeStatus,
    last_quote_change_status: hasSummary ? paymentSummary.last_quote_change_status : fallback.lastQuoteChangeStatus
  };
}

function calculateDueAmount({ quoteTotal, paidAmount, creditUsedAmount }) {
  return roundAmount(
    Math.max(
      roundAmount(quoteTotal) - roundAmount(paidAmount) - roundAmount(creditUsedAmount),
      0
    )
  );
}

function resolvePaymentStatus({
  dueAmount,
  paidAmount,
  quoteTotal,
  lastQuoteChangeStatus
}) {
  if (lastQuoteChangeStatus === 'pending') return 'approval_pending';
  if (dueAmount <= 0 && paidAmount > quoteTotal) return 'no_payment_due';
  if (dueAmount <= 0 && paidAmount > 0) return 'paid';
  if (dueAmount <= 0) return 'no_payment_due';
  if (paidAmount > 0) return 'partially_paid';
  return 'pending';
}

async function resolveLeadIdForBooking(bookingId, transaction = null) {
  const lead = await db.sales_leads.findOne({
    where: { booking_id: bookingId },
    attributes: ['lead_id'],
    order: [['lead_id', 'DESC']],
    transaction
  });

  return lead?.lead_id || null;
}

async function upsertBookingPaymentSummary({
  bookingId,
  leadId = null,
  salesQuoteId = null,
  quoteTotal = 0,
  paidAmount = 0,
  creditUsedAmount = 0,
  creditCreatedAmount = 0,
  lastQuoteChangeType = 'none',
  lastQuoteChangeAmount = 0,
  lastQuoteChangeStatus = 'none',
  manualPaymentMode = null,
  manualPaymentOtherMode = null,
  manualPaymentProofUrl = null,
  manualPaymentProofFilePath = null,
  manualPaymentProofFileName = null,
  manualPaymentNotes = null,
  manualPaymentUpdatedByUserId = null,
  manualPaymentUpdatedAt = null,
  transaction = null
}) {
  if (!bookingId) {
    throw new Error('bookingId is required');
  }

  const finalQuoteTotal = roundAmount(quoteTotal);
  const finalPaidAmount = roundAmount(paidAmount);
  const finalCreditUsedAmount = roundAmount(creditUsedAmount);
  const finalCreditCreatedAmount = roundAmount(creditCreatedAmount);
  const finalLeadId = leadId || await resolveLeadIdForBooking(bookingId, transaction);

  const dueAmount = calculateDueAmount({
    quoteTotal: finalQuoteTotal,
    paidAmount: finalPaidAmount,
    creditUsedAmount: finalCreditUsedAmount
  });

  const paymentStatus = resolvePaymentStatus({
    dueAmount,
    paidAmount: finalPaidAmount,
    quoteTotal: finalQuoteTotal,
    lastQuoteChangeStatus
  });

  await db.sequelize.query(
    `
    INSERT INTO booking_payment_summary (
      booking_id,
      lead_id,
      sales_quote_id,
      quote_total,
      paid_amount,
      credit_used_amount,
      credit_created_amount,
      due_amount,
      payment_status,
      manual_payment_mode,
      manual_payment_other_mode,
      manual_payment_proof_url,
      manual_payment_proof_file_path,
      manual_payment_proof_file_name,
      manual_payment_notes,
      manual_payment_updated_by_user_id,
      manual_payment_updated_at,
      last_quote_change_type,
      last_quote_change_amount,
      last_quote_change_status
    )
    VALUES (
      :bookingId,
      :leadId,
      :salesQuoteId,
      :quoteTotal,
      :paidAmount,
      :creditUsedAmount,
      :creditCreatedAmount,
      :dueAmount,
      :paymentStatus,
      :manualPaymentMode,
      :manualPaymentOtherMode,
      :manualPaymentProofUrl,
      :manualPaymentProofFilePath,
      :manualPaymentProofFileName,
      :manualPaymentNotes,
      :manualPaymentUpdatedByUserId,
      :manualPaymentUpdatedAt,
      :lastQuoteChangeType,
      :lastQuoteChangeAmount,
      :lastQuoteChangeStatus
    )
    ON DUPLICATE KEY UPDATE
      lead_id = VALUES(lead_id),
      sales_quote_id = VALUES(sales_quote_id),
      quote_total = VALUES(quote_total),
      paid_amount = VALUES(paid_amount),
      credit_used_amount = VALUES(credit_used_amount),
      credit_created_amount = VALUES(credit_created_amount),
      due_amount = VALUES(due_amount),
      payment_status = VALUES(payment_status),
      manual_payment_mode = COALESCE(VALUES(manual_payment_mode), manual_payment_mode),
      manual_payment_other_mode = COALESCE(VALUES(manual_payment_other_mode), manual_payment_other_mode),
      manual_payment_proof_url = COALESCE(VALUES(manual_payment_proof_url), manual_payment_proof_url),
      manual_payment_proof_file_path = COALESCE(VALUES(manual_payment_proof_file_path), manual_payment_proof_file_path),
      manual_payment_proof_file_name = COALESCE(VALUES(manual_payment_proof_file_name), manual_payment_proof_file_name),
      manual_payment_notes = COALESCE(VALUES(manual_payment_notes), manual_payment_notes),
      manual_payment_updated_by_user_id = COALESCE(VALUES(manual_payment_updated_by_user_id), manual_payment_updated_by_user_id),
      manual_payment_updated_at = COALESCE(VALUES(manual_payment_updated_at), manual_payment_updated_at),
      last_quote_change_type = VALUES(last_quote_change_type),
      last_quote_change_amount = VALUES(last_quote_change_amount),
      last_quote_change_status = VALUES(last_quote_change_status),
      updated_at = CURRENT_TIMESTAMP
    `,
    {
      replacements: {
        bookingId,
        leadId: finalLeadId,
        salesQuoteId,
        quoteTotal: finalQuoteTotal,
        paidAmount: finalPaidAmount,
        creditUsedAmount: finalCreditUsedAmount,
        creditCreatedAmount: finalCreditCreatedAmount,
        dueAmount,
        paymentStatus,
        manualPaymentMode,
        manualPaymentOtherMode,
        manualPaymentProofUrl,
        manualPaymentProofFilePath,
        manualPaymentProofFileName,
        manualPaymentNotes,
        manualPaymentUpdatedByUserId,
        manualPaymentUpdatedAt,
        lastQuoteChangeType,
        lastQuoteChangeAmount: roundAmount(lastQuoteChangeAmount),
        lastQuoteChangeStatus
      },
      transaction
    }
  );

  return getBookingPaymentSummary(bookingId, transaction);
}

async function getBookingPaymentSummary(bookingId, transaction = null) {
  const rows = await db.sequelize.query(
    `
    SELECT *
    FROM booking_payment_summary
    WHERE booking_id = :bookingId
    LIMIT 1
    `,
    {
      replacements: { bookingId },
      type: db.Sequelize.QueryTypes.SELECT,
      transaction
    }
  );

  return rows[0] || null;
}

async function getBookingPaymentSummaryBySalesQuoteId(salesQuoteId, transaction = null) {
  const rows = await db.sequelize.query(
    `
    SELECT *
    FROM booking_payment_summary
    WHERE sales_quote_id = :salesQuoteId
    ORDER BY updated_at DESC, booking_payment_summary_id DESC
    LIMIT 1
    `,
    {
      replacements: { salesQuoteId },
      type: db.Sequelize.QueryTypes.SELECT,
      transaction
    }
  );

  return rows[0] || null;
}

async function resolveBookingPaymentState({
  bookingId = null,
  salesQuoteId = null,
  quoteTotal = 0,
  paidAmount = 0,
  creditUsedAmount = 0,
  creditCreatedAmount = 0,
  paymentStatus = null,
  lastQuoteChangeType = null,
  lastQuoteChangeAmount = 0,
  lastQuoteChangeStatus = null,
  transaction = null
} = {}) {
  let paymentSummary = null;

  if (bookingId) {
    paymentSummary = await getBookingPaymentSummary(bookingId, transaction);
  } else if (salesQuoteId) {
    // A booking summary belongs to exactly one booking (booking_id is unique).
    // Never fall back from a missing booking summary to a quote-only lookup:
    // quotes.quote_id and sales_quotes.sales_quote_id are separate ID domains,
    // and even a genuine sales quote may be associated with another booking.
    paymentSummary = await getBookingPaymentSummaryBySalesQuoteId(salesQuoteId, transaction);
  }

  return normalizePaymentSummaryState(paymentSummary, {
    quoteTotal,
    paidAmount,
    creditUsedAmount,
    creditCreatedAmount,
    paymentStatus,
    lastQuoteChangeType,
    lastQuoteChangeAmount,
    lastQuoteChangeStatus
  });
}

module.exports = {
  upsertBookingPaymentSummary,
  getBookingPaymentSummary,
  getBookingPaymentSummaryBySalesQuoteId,
  normalizePaymentSummaryState,
  resolveBookingPaymentState
};
