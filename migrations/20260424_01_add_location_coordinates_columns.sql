ALTER TABLE `stream_project_booking`
  ADD COLUMN `event_latitude` DECIMAL(10,8) NULL AFTER `event_location`,
  ADD COLUMN `event_longitude` DECIMAL(11,8) NULL AFTER `event_latitude`;

ALTER TABLE `crew_members`
  ADD COLUMN `latitude` DECIMAL(10,8) NULL AFTER `old_location`,
  ADD COLUMN `longitude` DECIMAL(11,8) NULL AFTER `latitude`;
