-- Add rental configuration to each model and keep each rental's lifecycle on
-- the existing inventory_request_items history row.
ALTER TABLE `inventory_models`
  ADD COLUMN `description` TEXT NULL AFTER `name`,
  ADD COLUMN `hourly_rental_rate` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `price`,
  ADD COLUMN `daily_rental_rate` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `hourly_rental_rate`;

ALTER TABLE `inventory_request_items`
  ADD COLUMN `expected_pickup_at` DATETIME NULL AFTER `unit_price`,
  ADD COLUMN `expected_return_at` DATETIME NULL AFTER `expected_pickup_at`,
  ADD COLUMN `billing_unit` ENUM('hour','day') NULL AFTER `expected_return_at`,
  ADD COLUMN `hourly_rate_snapshot` DECIMAL(10,2) NULL AFTER `billing_unit`,
  ADD COLUMN `daily_rate_snapshot` DECIMAL(10,2) NULL AFTER `hourly_rate_snapshot`,
  ADD COLUMN `base_rent` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `daily_rate_snapshot`,
  ADD COLUMN `issued_at` DATETIME NULL AFTER `base_rent`,
  ADD COLUMN `handover_images` JSON NULL AFTER `issued_at`,
  ADD COLUMN `return_images` JSON NULL AFTER `returned_at`,
  ADD COLUMN `late_charge` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `return_images`,
  ADD COLUMN `total_rent` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `late_charge`;
