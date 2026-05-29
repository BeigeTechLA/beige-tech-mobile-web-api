ALTER TABLE `stream_project_booking`
  ADD COLUMN IF NOT EXISTS `event_latitude` DECIMAL(10,8) NULL AFTER `event_location`,
  ADD COLUMN IF NOT EXISTS `event_longitude` DECIMAL(11,8) NULL AFTER `event_latitude`;
