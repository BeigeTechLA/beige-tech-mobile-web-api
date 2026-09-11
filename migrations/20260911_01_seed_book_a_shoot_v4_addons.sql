-- Book-a-shoot v4 optional add-ons.
-- These rows back the final add-on step before payment so quote preview and
-- saved quote totals come from backend pricing instead of frontend constants.

SET @OLD_SQL_SAFE_UPDATES = @@SQL_SAFE_UPDATES;
SET SQL_SAFE_UPDATES = 0;

INSERT INTO pricing_items (
  item_id,
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
  @next_item_id := @next_item_id + 1,
  category_id,
  'both',
  item_name,
  item_slug,
  item_rate,
  'flat',
  item_unit,
  item_description,
  item_order,
  1,
  NOW(),
  NOW()
FROM pricing_categories
JOIN (
  SELECT 'Additional Camera' AS item_name, 'v4-additional-camera' AS item_slug, 350.00 AS item_rate, NULL AS item_unit, 'A second angle for coverage.' AS item_description, 101 AS item_order
  UNION ALL SELECT 'Teleprompter', 'v4-teleprompter', 250.00, NULL, 'On-camera script delivery.', 102
  UNION ALL SELECT 'Drone', 'v4-drone', 500.00, NULL, 'Licensed aerial cinematography.', 103
  UNION ALL SELECT 'Additional Lavalier Microphones', 'v4-lavalier-mics', 250.00, NULL, 'Capture every voice clearly with additional professional lavalier microphones.', 104
  UNION ALL SELECT 'Green Screen', 'v4-green-screen', 500.00, NULL, 'Chroma set for compositing.', 105
  UNION ALL SELECT 'Backdrop', 'v4-backdrop', 500.00, NULL, 'Set the scene with a professionally styled backdrop for your shoot.', 106
  UNION ALL SELECT 'Additional Lights', 'v4-additional-lights', 350.00, NULL, 'Expanded lighting package.', 107
  UNION ALL SELECT 'Next-Day Editing (Per Video)', 'v4-next-day-editing', 750.00, 'per video', 'First cut within 24 hours.', 108
  UNION ALL SELECT 'Expedited Editing (1 Week)', 'v4-expedited-editing', 500.00, NULL, 'Prioritized one-week turnaround.', 109
) AS v4_addons
JOIN (SELECT @next_item_id := COALESCE(MAX(item_id), 0) FROM pricing_items) next_id
WHERE pricing_categories.slug = 'equipment-addons'
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  category_id = VALUES(category_id),
  rate = VALUES(rate),
  rate_type = VALUES(rate_type),
  rate_unit = VALUES(rate_unit),
  description = VALUES(description),
  display_order = VALUES(display_order),
  is_active = VALUES(is_active),
  updated_at = NOW();

SET SQL_SAFE_UPDATES = @OLD_SQL_SAFE_UPDATES;