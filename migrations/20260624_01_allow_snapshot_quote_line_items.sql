-- Dynamic selections (studios, rush fees and other calculated charges) are
-- immutable quote snapshots and do not always have a pricing_items catalog row.
ALTER TABLE quote_line_items
  MODIFY COLUMN item_id INT NULL;

