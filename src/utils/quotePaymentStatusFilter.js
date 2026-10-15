const summaryForQuote = `
  FROM sales_leads quote_lead
  JOIN booking_payment_summary quote_payment
    ON quote_payment.booking_id = quote_lead.booking_id
  WHERE quote_lead.lead_id = sales_quotes.lead_id
`;

const hasSummary = `EXISTS (SELECT 1 ${summaryForQuote})`;
const settledSummary = `EXISTS (
  SELECT 1 ${summaryForQuote}
    AND quote_payment.due_amount <= 0.009
    AND (
      COALESCE(quote_payment.paid_amount, 0) + COALESCE(quote_payment.credit_used_amount, 0) > 0
      OR quote_payment.payment_status IN ('paid', 'no_payment_due', 'completed', 'success')
    )
)`;
const partialSummary = `EXISTS (
  SELECT 1 ${summaryForQuote}
    AND quote_payment.due_amount > 0.009
    AND COALESCE(quote_payment.paid_amount, 0) + COALESCE(quote_payment.credit_used_amount, 0) > 0
)`;

const latestInvoiceStatus = `(
  SELECT invoice.payment_status FROM invoice_send_history invoice
  WHERE invoice.quote_id = sales_quotes.sales_quote_id
  ORDER BY invoice.sent_at DESC, invoice.invoice_send_history_id DESC
  LIMIT 1
)`;
const fullManualPayment = `EXISTS (
  SELECT 1 FROM sales_lead_activities manual_payment
  WHERE manual_payment.lead_id = sales_quotes.lead_id
    AND manual_payment.activity_type = 'payment_completed'
    AND JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(manual_payment.activity_data), manual_payment.activity_data, '{}'), '$.payment_method')) = 'manual'
    AND JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(manual_payment.activity_data), manual_payment.activity_data, '{}'), '$.payment_type')) = 'full'
)`;
const basePaymentCondition = (comparison) => `EXISTS (
  SELECT 1 FROM sales_leads payment_lead
  JOIN stream_project_booking payment_booking
    ON payment_booking.stream_project_booking_id = payment_lead.booking_id
  JOIN payment_transactions base_payment
    ON base_payment.payment_id = payment_booking.payment_id
  WHERE payment_lead.lead_id = sales_quotes.lead_id
    AND base_payment.total_amount ${comparison} sales_quotes.total
    ${comparison === '<' ? 'AND base_payment.total_amount > 0' : ''}
)`;
const legacySettled = `(${fullManualPayment} OR COALESCE(${latestInvoiceStatus}, '') = 'paid' OR ${basePaymentCondition('>=')})`;
const legacyPartial = `(
  NOT ${legacySettled}
  AND ${basePaymentCondition('<')}
  AND sales_quotes.total > 0
)`;

const paidQuoteSql = `
  sales_quotes.status <> 'rejected'
  AND (${settledSummary} OR (NOT ${hasSummary} AND (
    ${legacySettled} OR (sales_quotes.status = 'paid' AND NOT ${legacyPartial})
  )))
`;
const partiallyPaidQuoteSql = `
  sales_quotes.status <> 'rejected'
  AND (${partialSummary} OR (NOT ${hasSummary} AND (
    ${legacyPartial} OR (sales_quotes.status = 'partially_paid' AND NOT ${legacySettled})
  )))
`;

function resolveCurrentQuotePaymentStatus(paymentSummary, fallbackStatus) {
  if (!paymentSummary) return fallbackStatus;

  const due = Number(paymentSummary.due_amount || 0);
  const applied = Number(paymentSummary.paid_amount || 0) +
    Number(paymentSummary.credit_used_amount || 0);
  const status = String(paymentSummary.payment_status || '').toLowerCase();

  if (due > 0.009) return applied > 0 ? 'partially_paid' : 'pending';
  if (applied > 0 || ['paid', 'no_payment_due', 'completed', 'success'].includes(status)) return 'paid';
  return status || fallbackStatus;
}

module.exports = { paidQuoteSql, partiallyPaidQuoteSql, resolveCurrentQuotePaymentStatus };
