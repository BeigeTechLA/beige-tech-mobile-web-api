ALTER TABLE sales_quotes
  ADD COLUMN sales_tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN card_payment_charge_enabled TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN card_payment_method VARCHAR(32) NULL;


SET SQL_SAFE_UPDATES = 0;

UPDATE sales_quotes
SET
  card_payment_charge_enabled = CASE
    WHEN tax_type LIKE '%Card Payment Charges%'
      OR tax_type LIKE 'Tax (4%)%'
    THEN 1
    ELSE 0
  END,

  sales_tax_rate = GREATEST(
    0,
    tax_rate - CASE
      WHEN tax_type LIKE '%Card Payment Charges%'
        OR tax_type LIKE 'Tax (4%)%'
      THEN 4
      ELSE 0
    END
  );

SET SQL_SAFE_UPDATES = 1;
