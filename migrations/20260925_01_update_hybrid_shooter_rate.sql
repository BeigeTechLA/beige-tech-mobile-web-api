-- Hybrid Shooter is a single, combined photo + video creator billed at $375/hour.
UPDATE pricing_items
SET rate = 375.00,
    rate_type = 'per_hour',
    rate_unit = 'per hour',
    updated_at = NOW()
WHERE slug = 'photo-video-creator'
  AND item_id > 0
  AND pricing_mode = 'both'
  AND is_active = 1
LIMIT 1000;
