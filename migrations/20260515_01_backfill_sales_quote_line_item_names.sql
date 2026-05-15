-- Backfill generic/empty sales quote line item names with durable historical names.
-- MariaDB-safe version (no JSON_TABLE).
-- Priority:
-- 1) Existing catalog name (when catalog item still exists)
-- 2) Latest non-generic name from other rows of same quote+catalog+section

START TRANSACTION;

DROP TEMPORARY TABLE IF EXISTS tmp_line_item_name_candidates;
CREATE TEMPORARY TABLE tmp_line_item_name_candidates (
  line_item_id INT PRIMARY KEY,
  replacement_name VARCHAR(255) NOT NULL
);

-- Candidate source #1: current catalog item name
INSERT INTO tmp_line_item_name_candidates (line_item_id, replacement_name)
SELECT
  li.line_item_id,
  TRIM(ci.name) AS replacement_name
FROM sales_quote_line_items li
INNER JOIN quote_catalog_items ci
  ON ci.catalog_item_id = li.catalog_item_id
WHERE
  (li.item_name IS NULL OR TRIM(li.item_name) = '' OR LOWER(TRIM(li.item_name)) = 'line item')
  AND ci.name IS NOT NULL
  AND TRIM(ci.name) <> '';

-- Candidate source #2: copy from another good row in same quote/catalog/section.
INSERT INTO tmp_line_item_name_candidates (line_item_id, replacement_name)
SELECT
  targets.line_item_id,
  targets.peer_item_name
FROM (
  SELECT
    li.line_item_id,
    TRIM(peer.item_name) AS peer_item_name,
    ROW_NUMBER() OVER (
      PARTITION BY li.line_item_id
      ORDER BY peer.updated_at DESC, peer.line_item_id DESC
    ) AS rn
  FROM sales_quote_line_items li
  INNER JOIN sales_quote_line_items peer
    ON peer.sales_quote_id = li.sales_quote_id
    AND COALESCE(peer.catalog_item_id, -1) = COALESCE(li.catalog_item_id, -1)
    AND COALESCE(peer.section_type, '') = COALESCE(li.section_type, '')
    AND peer.line_item_id <> li.line_item_id
  WHERE
    (li.item_name IS NULL OR TRIM(li.item_name) = '' OR LOWER(TRIM(li.item_name)) = 'line item')
    AND peer.item_name IS NOT NULL
    AND TRIM(peer.item_name) <> ''
    AND LOWER(TRIM(peer.item_name)) <> 'line item'
) AS targets
LEFT JOIN tmp_line_item_name_candidates existing
  ON existing.line_item_id = targets.line_item_id
WHERE targets.rn = 1
  AND existing.line_item_id IS NULL;

-- Apply backfill.
UPDATE sales_quote_line_items li
INNER JOIN tmp_line_item_name_candidates c
  ON c.line_item_id = li.line_item_id
SET
  li.item_name = c.replacement_name,
  li.updated_at = CURRENT_TIMESTAMP;

-- Final global fallback for unrecoverable rows (no catalog + no peer name).
-- This guarantees no quote line item stays blank/"Line Item" after migration.
UPDATE sales_quote_line_items
SET
  item_name = CASE
    WHEN section_type = 'service' THEN 'Custom Service'
    WHEN section_type = 'addon' THEN 'Custom Add-on'
    WHEN section_type = 'logistics' THEN 'Custom Logistics'
    ELSE 'Custom Item'
  END,
  updated_at = CURRENT_TIMESTAMP
WHERE
  item_name IS NULL
  OR TRIM(item_name) = ''
  OR LOWER(TRIM(item_name)) = 'line item';

-- Optional visibility check after run:
-- SELECT ROW_COUNT() AS updated_rows;

DROP TEMPORARY TABLE IF EXISTS tmp_line_item_name_candidates;

COMMIT;
