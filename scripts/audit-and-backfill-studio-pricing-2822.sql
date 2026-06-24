-- Audit the records reported as lead 411 / project 2822 before changing them.
SELECT
  b.stream_project_booking_id AS booking_id,
  sl.lead_id,
  b.quote_id,
  q.subtotal,
  q.price_after_discount,
  q.margin_amount,
  q.total,
  COALESCE(SUM(qli.line_total), 0) AS persisted_line_total
FROM stream_project_booking b
LEFT JOIN sales_leads sl ON sl.booking_id = b.stream_project_booking_id AND sl.is_active = 1
LEFT JOIN quotes q ON q.quote_id = b.quote_id
LEFT JOIN quote_line_items qli ON qli.quote_id = q.quote_id
WHERE b.stream_project_booking_id = 2822 OR sl.lead_id = 411
GROUP BY b.stream_project_booking_id, sl.lead_id, b.quote_id,
  q.subtotal, q.price_after_discount, q.margin_amount, q.total;

SELECT
  qli.line_item_id,
  qli.item_id,
  qli.item_name,
  qli.quantity,
  qli.unit_price,
  qli.line_total,
  qli.notes
FROM stream_project_booking b
JOIN quote_line_items qli ON qli.quote_id = b.quote_id
WHERE b.stream_project_booking_id = 2822
ORDER BY qli.line_item_id;

-- This booking's selected studio was already included in quotes.total but was
-- missing from quote_line_items. Add the immutable studio snapshot only once.
INSERT INTO quote_line_items
  (quote_id, item_id, item_name, quantity, unit_price, line_total, notes)
SELECT
  b.quote_id,
  NULL,
  'Beige Studios West Hollywood Content Studio',
  7,
  375.00,
  2625.00,
  '[STUDIO:west-hollywood-content-studio:hourly]'
FROM stream_project_booking b
WHERE b.stream_project_booking_id = 2822
  AND b.quote_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM quote_line_items existing
    WHERE existing.quote_id = b.quote_id
      AND existing.notes LIKE '[STUDIO:%'
  );

-- Re-run the audit. persisted_line_total should now equal q.subtotal. If it
-- does not, stop: another historical line is wrong and must be reviewed rather
-- than silently forcing the quote total.
SELECT
  q.quote_id,
  q.subtotal,
  q.total,
  COALESCE(SUM(qli.line_total), 0) AS persisted_line_total,
  q.subtotal - COALESCE(SUM(qli.line_total), 0) AS remaining_difference
FROM stream_project_booking b
JOIN quotes q ON q.quote_id = b.quote_id
LEFT JOIN quote_line_items qli ON qli.quote_id = q.quote_id
WHERE b.stream_project_booking_id = 2822
GROUP BY q.quote_id, q.subtotal, q.total;
