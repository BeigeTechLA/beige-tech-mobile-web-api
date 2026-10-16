-- Link legacy CP profiles to their login accounts only when the normalized
-- email has exactly one active creative-partner user and no competing crew link.
-- Existing non-NULL user_id values are deliberately left untouched for review.
UPDATE crew_members AS cm
JOIN (
  SELECT
    LOWER(TRIM(email)) AS normalized_email,
    MIN(id) AS user_id
  FROM users
  WHERE user_type = 2
    AND is_active = 1
    AND email IS NOT NULL
    AND TRIM(email) <> ''
  GROUP BY LOWER(TRIM(email))
  HAVING COUNT(*) = 1
) AS matching_user
  ON matching_user.normalized_email = LOWER(TRIM(cm.email))
LEFT JOIN crew_members AS other_crew
  ON other_crew.user_id = matching_user.user_id
  AND other_crew.crew_member_id <> cm.crew_member_id
SET cm.user_id = matching_user.user_id
WHERE cm.user_id IS NULL
  AND cm.is_active = 1
  AND cm.email IS NOT NULL
  AND TRIM(cm.email) <> ''
  AND other_crew.crew_member_id IS NULL;
