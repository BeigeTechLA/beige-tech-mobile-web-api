DELETE duplicate_rows
FROM finance_invoice_payments duplicate_rows
INNER JOIN finance_invoice_payments keeper_rows
  ON keeper_rows.booking_id = duplicate_rows.booking_id
  AND keeper_rows.payment_id = duplicate_rows.payment_id
  AND keeper_rows.payment_id IS NOT NULL
  AND keeper_rows.finance_invoice_payment_id < duplicate_rows.finance_invoice_payment_id;

SET @finance_invoice_payment_index_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'finance_invoice_payments'
    AND index_name = 'uq_finance_invoice_payments_booking_payment'
);

SET @finance_invoice_payment_index_sql := IF(
  @finance_invoice_payment_index_exists = 0,
  'ALTER TABLE finance_invoice_payments ADD UNIQUE KEY uq_finance_invoice_payments_booking_payment (booking_id, payment_id)',
  'SELECT ''uq_finance_invoice_payments_booking_payment already exists'' AS message'
);

PREPARE finance_invoice_payment_index_stmt FROM @finance_invoice_payment_index_sql;
EXECUTE finance_invoice_payment_index_stmt;
DEALLOCATE PREPARE finance_invoice_payment_index_stmt;
