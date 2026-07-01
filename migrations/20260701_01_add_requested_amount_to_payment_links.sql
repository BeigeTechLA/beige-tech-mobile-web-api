ALTER TABLE payment_links
  ADD COLUMN IF NOT EXISTS requested_amount DECIMAL(10, 2) NULL AFTER discount_code_id;
