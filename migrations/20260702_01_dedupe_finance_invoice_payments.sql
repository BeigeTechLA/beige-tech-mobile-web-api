DELETE duplicate_rows
FROM finance_invoice_payments duplicate_rows
INNER JOIN finance_invoice_payments keeper_rows
  ON keeper_rows.booking_id = duplicate_rows.booking_id
  AND keeper_rows.payment_id = duplicate_rows.payment_id
  AND keeper_rows.payment_id IS NOT NULL
  AND keeper_rows.finance_invoice_payment_id < duplicate_rows.finance_invoice_payment_id;

ALTER TABLE finance_invoice_payments
  ADD UNIQUE KEY uq_finance_invoice_payments_booking_payment (booking_id, payment_id);
