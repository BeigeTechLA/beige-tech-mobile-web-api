ALTER TABLE `sales_quotes`
  ADD COLUMN IF NOT EXISTS `location_latitude` DECIMAL(10,7) NULL AFTER `client_address`,
  ADD COLUMN IF NOT EXISTS `location_longitude` DECIMAL(10,7) NULL AFTER `location_latitude`;
