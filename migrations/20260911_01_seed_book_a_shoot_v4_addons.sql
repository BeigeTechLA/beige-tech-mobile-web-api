-- Book-a-shoot v4 optional add-ons.
-- These rows back the final add-on step before payment so quote preview and
-- saved quote totals come from backend pricing instead of frontend constants.

CREATE TEMPORARY TABLE IF NOT EXISTS tmp_v4_addons (
  item_name VARCHAR(255) NOT NULL,
  item_slug VARCHAR(255) NOT NULL,
  item_rate DECIMAL(10, 2) NOT NULL,
  item_unit VARCHAR(50) NULL,
  item_description TEXT NULL,
  item_order INT NOT NULL,
  PRIMARY KEY (item_slug)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

TRUNCATE TABLE tmp_v4_addons;

INSERT INTO tmp_v4_addons (
  item_name,
  item_slug,
  item_rate,
  item_unit,
  item_description,
  item_order
)
VALUES
  ('Additional Camera', 'v4-additional-camera', 350.00, NULL, 'A second angle for coverage.', 101),
  ('Teleprompter', 'v4-teleprompter', 250.00, NULL, 'On-camera script delivery.', 102),
  ('Drone', 'v4-drone', 500.00, NULL, 'Licensed aerial cinematography.', 103),
  ('Additional Lavalier Microphones', 'v4-lavalier-mics', 250.00, NULL, 'Capture every voice clearly with additional professional lavalier microphones.', 104),
  ('Green Screen', 'v4-green-screen', 500.00, NULL, 'Chroma set for compositing.', 105),
  ('Backdrop', 'v4-backdrop', 500.00, NULL, 'Set the scene with a professionally styled backdrop for your shoot.', 106),
  ('Additional Lights', 'v4-additional-lights', 350.00, NULL, 'Expanded lighting package.', 107),
  ('Next-Day Editing (Per Video)', 'v4-next-day-editing', 750.00, 'per video', 'First cut within 24 hours.', 108),
  ('Expedited Editing (1 Week)', 'v4-expedited-editing', 500.00, NULL, 'Prioritized one-week turnaround.', 109);

CREATE TEMPORARY TABLE IF NOT EXISTS tmp_v4_addon_keep_rows (
  item_slug VARCHAR(255) NOT NULL,
  keep_item_id INT NOT NULL,
  PRIMARY KEY (item_slug)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

TRUNCATE TABLE tmp_v4_addon_keep_rows;

INSERT INTO tmp_v4_addon_keep_rows (item_slug, keep_item_id)
SELECT pi.slug, MIN(pi.item_id) AS keep_item_id
FROM pricing_items pi
JOIN tmp_v4_addons source ON source.item_slug = pi.slug
WHERE pi.pricing_mode = 'both'
GROUP BY pi.slug;

UPDATE pricing_items pi
JOIN tmp_v4_addons source ON source.item_slug = pi.slug
JOIN pricing_categories category ON category.slug = 'equipment-addons'
JOIN tmp_v4_addon_keep_rows keep_rows ON keep_rows.item_slug = pi.slug
SET
  pi.category_id = category.category_id,
  pi.pricing_mode = 'both',
  pi.name = source.item_name,
  pi.rate = source.item_rate,
  pi.rate_type = 'flat',
  pi.rate_unit = source.item_unit,
  pi.description = source.item_description,
  pi.display_order = source.item_order,
  pi.is_active = CASE WHEN pi.item_id = keep_rows.keep_item_id THEN 1 ELSE 0 END,
  pi.updated_at = NOW()
WHERE pi.pricing_mode = 'both';

INSERT INTO pricing_items (
  category_id,
  pricing_mode,
  name,
  slug,
  rate,
  rate_type,
  rate_unit,
  description,
  display_order,
  is_active,
  created_at,
  updated_at
)
SELECT
  category.category_id,
  'both',
  source.item_name,
  source.item_slug,
  source.item_rate,
  'flat',
  source.item_unit,
  source.item_description,
  source.item_order,
  1,
  NOW(),
  NOW()
FROM tmp_v4_addons source
JOIN pricing_categories category ON category.slug = 'equipment-addons'
LEFT JOIN pricing_items existing
  ON existing.slug = source.item_slug
  AND existing.pricing_mode = 'both'
WHERE existing.item_id IS NULL;

DROP TEMPORARY TABLE IF EXISTS tmp_v4_addon_keep_rows;
DROP TEMPORARY TABLE IF EXISTS tmp_v4_addons;
