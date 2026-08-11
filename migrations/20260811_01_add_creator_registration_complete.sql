ALTER TABLE crew_members
ADD COLUMN is_registration_complete TINYINT(1) NOT NULL DEFAULT 0 AFTER is_crew_verified;

UPDATE crew_members cm
SET is_registration_complete = 1
WHERE cm.crew_member_id > 0
  AND cm.is_active = 1
  AND (
    cm.is_crew_verified IN (1, 2)
    OR (
      cm.phone_number IS NOT NULL AND TRIM(cm.phone_number) <> ''
      AND cm.location IS NOT NULL AND TRIM(cm.location) <> ''
      AND cm.working_distance IS NOT NULL AND TRIM(cm.working_distance) <> ''
      AND cm.primary_role IS NOT NULL AND TRIM(cm.primary_role) NOT IN ('', '[]', 'null')
      AND cm.years_of_experience IS NOT NULL AND cm.years_of_experience > 0
      AND cm.hourly_rate IS NOT NULL AND cm.hourly_rate > 0
      AND cm.skills IS NOT NULL AND TRIM(cm.skills) NOT IN ('', '[]', 'null')
      AND cm.equipment_ownership IS NOT NULL AND TRIM(cm.equipment_ownership) NOT IN ('', '[]', 'null')
      AND cm.social_media_links IS NOT NULL AND TRIM(cm.social_media_links) NOT IN ('', '[]', '{}', 'null')
      AND EXISTS (
        SELECT 1
        FROM crew_member_files cpf
        WHERE cpf.crew_member_id = cm.crew_member_id
          AND cpf.file_type = 'profile_photo'
          AND cpf.is_active = 1
          AND cpf.file_path IS NOT NULL
          AND TRIM(cpf.file_path) <> ''
      )
      AND EXISTS (
        SELECT 1
        FROM crew_member_files cfw
        WHERE cfw.crew_member_id = cm.crew_member_id
          AND cfw.file_type IN ('recent_work', 'work_sample')
          AND cfw.is_active = 1
          AND cfw.file_path IS NOT NULL
          AND TRIM(cfw.file_path) <> ''
          AND cfw.title IS NOT NULL
          AND TRIM(cfw.title) <> ''
        GROUP BY LOWER(TRIM(cfw.title)), LOWER(TRIM(COALESCE(cfw.tag, 'untagged')))
        HAVING COUNT(*) >= 5
      )
    )
  );