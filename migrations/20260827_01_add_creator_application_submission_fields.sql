ALTER TABLE crew_members
ADD COLUMN application_submitted_at DATETIME NULL AFTER is_registration_complete,
ADD COLUMN application_submission_email_sent_at DATETIME NULL AFTER application_submitted_at;

UPDATE crew_members
SET application_submitted_at = COALESCE(updated_at, created_at, NOW()),
    application_submission_email_sent_at = COALESCE(updated_at, created_at, NOW())
WHERE is_active = 1
  AND crew_member_id > 0
  AND application_submitted_at IS NULL
  AND (
    is_registration_complete = 1
    OR is_crew_verified IN (1, 2)
  );

CREATE INDEX idx_crew_members_application_submitted
ON crew_members (is_active, application_submitted_at, is_crew_verified);
