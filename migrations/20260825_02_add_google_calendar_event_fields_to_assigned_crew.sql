ALTER TABLE `assigned_crew`
  ADD COLUMN `google_calendar_event_id` VARCHAR(255) NULL AFTER `responded_at`,
  ADD COLUMN `google_calendar_id` VARCHAR(255) NULL DEFAULT 'primary' AFTER `google_calendar_event_id`,
  ADD COLUMN `google_calendar_synced_at` DATETIME NULL AFTER `google_calendar_id`,
  ADD COLUMN `google_calendar_sync_error` TEXT NULL AFTER `google_calendar_synced_at`;
