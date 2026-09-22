UPDATE pricing_items
SET
  rate = CASE slug
    WHEN 'photo-video-creator' THEN 350.00
    ELSE 250.00
  END,
  rate_type = 'per_hour',
  rate_unit = 'per hour',
  updated_at = NOW()
WHERE pricing_mode = 'both'
  AND is_active = 1
  AND slug IN ('photographer', 'videographer', 'photo-video-creator')
LIMIT 1000;