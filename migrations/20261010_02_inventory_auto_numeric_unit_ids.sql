-- Keep inventory_model_units.id as the numeric auto-generated unit identifier.
-- This replaces manually entered serials and request serial snapshots with unit IDs.
-- Run after 20261010_01_upgrade_inventory_to_models.sql and after clearing inventory request/item data.
ALTER TABLE `inventory_model_units`
  DROP INDEX `uq_inventory_unit_serial`,
  DROP COLUMN `serial_number`;

ALTER TABLE `inventory_request_items`
  DROP COLUMN `assigned_serial_numbers`,
  ADD COLUMN `assigned_unit_ids` JSON NULL AFTER `unit_price`;
