ALTER TABLE `stream_project_booking`
  ADD COLUMN `start_date_time_utc` VARCHAR(50) NULL AFTER `time_zone`,
  ADD COLUMN `end_date_time_utc` VARCHAR(50) NULL AFTER `start_date_time_utc`;
