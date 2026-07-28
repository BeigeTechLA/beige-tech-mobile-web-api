ALTER TABLE `project_meetings`
  ADD COLUMN `google_calendar_event_id` VARCHAR(255) NULL AFTER `meet_link`,
  ADD COLUMN `google_calendar_id` VARCHAR(255) NULL DEFAULT 'primary' AFTER `google_calendar_event_id`;
