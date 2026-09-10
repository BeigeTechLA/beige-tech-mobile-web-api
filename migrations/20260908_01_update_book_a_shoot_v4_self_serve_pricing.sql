-- Book-a-shoot v4 self-serve pricing refresh.
-- Source: client pricing doc supplied 2026-09-08.

SET @OLD_SQL_SAFE_UPDATES = @@SQL_SAFE_UPDATES;
SET SQL_SAFE_UPDATES = 0;

UPDATE pricing_items
SET
  rate = 250.00,
  rate_type = 'per_hour',
  rate_unit = 'per hour',
  updated_at = NOW()
WHERE slug IN ('photographer', 'videographer')
  AND pricing_mode = 'both';

INSERT INTO pricing_items (
  item_id,
  category_id,
  pricing_mode,
  name,
  slug,
  rate,
  rate_type,
  rate_unit,
  display_order,
  is_active,
  created_at,
  updated_at
)
SELECT
  @next_item_id := @next_item_id + 1,
  category_id,
  'both',
  'Videography + Photography (1 person)',
  'photo-video-creator',
  375.00,
  'per_hour',
  'per hour',
  3,
  1,
  NOW(),
  NOW()
FROM pricing_categories
JOIN (SELECT @next_item_id := COALESCE(MAX(item_id), 0) FROM pricing_items) next_id
WHERE pricing_categories.slug = 'services'
  AND NOT EXISTS (
    SELECT 1
    FROM pricing_items existing
    WHERE existing.slug = 'photo-video-creator'
      AND existing.pricing_mode = 'both'
      AND existing.item_id <> 0
  )
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  rate = VALUES(rate),
  rate_type = VALUES(rate_type),
  rate_unit = VALUES(rate_unit),
  display_order = VALUES(display_order),
  is_active = VALUES(is_active),
  updated_at = NOW();

INSERT INTO pricing_items (
  item_id,
  category_id,
  pricing_mode,
  name,
  slug,
  rate,
  rate_type,
  rate_unit,
  display_order,
  is_active,
  created_at,
  updated_at
)
SELECT @next_item_id := @next_item_id + 1, category_id, 'both', item_name, item_slug, item_rate, 'flat', item_unit, item_order, 1, NOW(), NOW()
FROM pricing_categories
JOIN (
  SELECT 'Highlight Video (4-7 min)' AS item_name, 'highlight_video_4_7' AS item_slug, 350.00 AS item_rate, 'per video' AS item_unit, 1 AS item_order
  UNION ALL SELECT 'Feature Video (10-20 min)', 'feature_video_10_20', 500.00, 'per video', 2
  UNION ALL SELECT 'Full Feature Video (30-40 min)', 'full_feature_video_30_40', 500.00, 'per video', 3
  UNION ALL SELECT 'Reel (10-60 sec)', 'reel_10_60', 250.00, 'per video', 4
  UNION ALL SELECT 'Interview Video (1-5 min)', 'interview_video_1_5', 350.00, 'per video', 5
  UNION ALL SELECT 'Extra Edited Photos (25 Photos)', 'edited_photos', 250.00, '25 photos', 6
  UNION ALL SELECT 'Music Video Edit', 'music_video_edit', 500.00, 'per video', 7
) AS self_serve_items
JOIN (SELECT @next_item_id := COALESCE(MAX(item_id), 0) FROM pricing_items) next_id
WHERE pricing_categories.slug = 'editing'
  AND NOT EXISTS (
    SELECT 1
    FROM pricing_items existing
    WHERE existing.slug = self_serve_items.item_slug
      AND existing.pricing_mode = 'both'
      AND existing.item_id <> 0
  )
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  rate = VALUES(rate),
  rate_type = VALUES(rate_type),
  rate_unit = VALUES(rate_unit),
  display_order = VALUES(display_order),
  is_active = VALUES(is_active),
  updated_at = NOW();

UPDATE pricing_items
SET
  name = 'Extra Edited Photos (25 Photos)',
  rate = 250.00,
  rate_type = 'flat',
  rate_unit = '25 photos',
  is_active = 1,
  updated_at = NOW()
WHERE slug = 'edited_photos';

UPDATE pricing_items
SET is_active = 0, updated_at = NOW()
WHERE pricing_mode IN ('general', 'wedding', 'both')
  AND slug IN (
    'edit-music-video-basic',
    'edit-music-video-complex',
    'edit-highlight-video',
    'edit-feature-video',
    'edit-full-feature-video',
    'edit-reel',
    'edit-commercial-basic',
    'edit-commercial-complex',
    'edit-podcast-full',
    'edit-podcast-reel',
    'edit-2d-animation-basic',
    'edit-2d-animation-complex',
    'edit-sfx-basic',
    'edit-sfx-complex',
    'edit-voiceover-short',
    'edit-voiceover-long',
    'edit-short-film-small',
    'edit-short-film-large',
    'edit-movie-base',
    'edit-movie-additional',
    'edit-tv-episode-base',
    'edit-tv-episode-additional',
    'edit-extra-photos',
    'edit-subtitles',
    'edit-translation',
    'wedding-edit-highlight',
    'wedding-edit-feature',
    'wedding-edit-full-feature',
    'wedding-edit-reel',
    'wedding-edit-extra-photos',
    'wedding-edit-subtitles',
    'wedding-edit-translation'
  );

UPDATE pricing_items
SET is_active = 0, updated_at = NOW()
WHERE item_id = 0
  AND slug IN (
    'photo-video-creator',
    'highlight_video_4_7',
    'feature_video_10_20',
    'full_feature_video_30_40',
    'reel_10_60',
    'interview_video_1_5',
    'edited_photos',
    'music_video_edit'
  );

UPDATE pricing_items pi
JOIN (
  SELECT slug, pricing_mode, MIN(item_id) AS keep_item_id
  FROM pricing_items
  WHERE slug IN (
    'photo-video-creator',
    'highlight_video_4_7',
    'feature_video_10_20',
    'full_feature_video_30_40',
    'reel_10_60',
    'interview_video_1_5',
    'edited_photos',
    'music_video_edit'
  )
    AND item_id <> 0
  GROUP BY slug, pricing_mode
) keepers
  ON keepers.slug = pi.slug
  AND keepers.pricing_mode = pi.pricing_mode
SET pi.is_active = CASE WHEN pi.item_id = keepers.keep_item_id THEN 1 ELSE 0 END,
    pi.updated_at = NOW()
WHERE pi.slug = keepers.slug;

SET SQL_SAFE_UPDATES = @OLD_SQL_SAFE_UPDATES;
