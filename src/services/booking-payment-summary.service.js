const db = require('../models');

function roundAmount(value) {
  return Number(Number(value || 0).toFixed(2));
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

async function upsertBookingPaymentSummary({
  bookingId,
  salesQuoteId = null,
  quoteTotal = 0,
  paidAmount = 0,
  creditUsedAmount = 0,
  creditCreatedAmount = 0,
  lastQuoteChangeType = 'none',
  lastQuoteChangeAmount = 0,
  lastQuoteChangeStatus = 'none',
  transaction = null
}) {
  if (!bookingId) {
    throw new Error('bookingId is required');
  }

  const finalQuoteTotal = roundAmount(quoteTotal);
  const finalPaidAmount = roundAmount(paidAmount);
  const finalCreditUsedAmount = roundAmount(creditUsedAmount);
  const finalCreditCreatedAmount = roundAmount(creditCreatedAmount);

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
      sales_quote_id,
      quote_total,
      paid_amount,
      credit_used_amount,
      credit_created_amount,
      due_amount,
      payment_status,
      last_quote_change_type,
      last_quote_change_amount,
      last_quote_change_status
    )
    VALUES (
      :bookingId,
      :salesQuoteId,
      :quoteTotal,
      :paidAmount,
      :creditUsedAmount,
      :creditCreatedAmount,
      :dueAmount,
      :paymentStatus,
      :lastQuoteChangeType,
      :lastQuoteChangeAmount,
      :lastQuoteChangeStatus
    )
    ON DUPLICATE KEY UPDATE
      sales_quote_id = VALUES(sales_quote_id),
      quote_total = VALUES(quote_total),
      paid_amount = VALUES(paid_amount),
      credit_used_amount = VALUES(credit_used_amount),
      credit_created_amount = VALUES(credit_created_amount),
      due_amount = VALUES(due_amount),
      payment_status = VALUES(payment_status),
      last_quote_change_type = VALUES(last_quote_change_type),
      last_quote_change_amount = VALUES(last_quote_change_amount),
      last_quote_change_status = VALUES(last_quote_change_status),
      updated_at = CURRENT_TIMESTAMP
    `,
    {
      replacements: {
        bookingId,
        salesQuoteId,
        quoteTotal: finalQuoteTotal,
        paidAmount: finalPaidAmount,
        creditUsedAmount: finalCreditUsedAmount,
        creditCreatedAmount: finalCreditCreatedAmount,
        dueAmount,
        paymentStatus,
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

module.exports = {
  upsertBookingPaymentSummary,
  getBookingPaymentSummary
};
