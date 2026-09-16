-- Quote analytics follow-up tracking and query indexes.

ALTER TABLE sales_quotes
  ADD COLUMN last_follow_up_at DATETIME NULL AFTER valid_until,
  ADD INDEX idx_sales_quotes_status (status),
  ADD INDEX idx_sales_quotes_created_at (created_at),
  ADD INDEX idx_sales_quotes_valid_until (valid_until),
  ADD INDEX idx_sales_quotes_last_follow_up_at (last_follow_up_at);
