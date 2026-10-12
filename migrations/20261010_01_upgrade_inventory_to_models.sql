-- Extend the existing inventory and request relationships with model variants.
-- A model is a catalog variant; units are the individually serialized stock.
CREATE TABLE IF NOT EXISTS `inventory_models` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `inventory_item_id` INT NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `total_quantity` INT NOT NULL DEFAULT 0,
  `image_urls` JSON NULL,
  `is_active` TINYINT NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inventory_model_name` (`inventory_item_id`,`name`),
  UNIQUE KEY `uq_inventory_model_item_pair` (`id`,`inventory_item_id`),
  KEY `idx_inventory_models_item` (`inventory_item_id`),
  CONSTRAINT `fk_inventory_models_item` FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items` (`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `inventory_model_units` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `inventory_model_id` INT NOT NULL,
  `serial_number` VARCHAR(100) NOT NULL,
  `status` ENUM('available','assigned','retired') NOT NULL DEFAULT 'available',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inventory_unit_serial` (`serial_number`),
  KEY `idx_inventory_units_stock` (`inventory_model_id`,`status`),
  CONSTRAINT `fk_inventory_units_model` FOREIGN KEY (`inventory_model_id`) REFERENCES `inventory_models` (`id`) ON DELETE CASCADE
);

ALTER TABLE `inventory_request_items`
  ADD COLUMN `inventory_model_id` INT NULL AFTER `inventory_item_id`,
  ADD COLUMN `assigned_serial_numbers` JSON NULL AFTER `unit_price`,
  ADD COLUMN `returned_at` DATETIME NULL AFTER `assigned_serial_numbers`;

-- Preserve existing catalog entries and stock by making each legacy item one model.
INSERT INTO `inventory_models` (`inventory_item_id`,`name`,`price`,`total_quantity`,`image_urls`,`is_active`)
SELECT i.id, 'Default model', i.price, i.total_quantity,
  CASE WHEN i.image_url IS NULL OR i.image_url='' THEN JSON_ARRAY() ELSE JSON_ARRAY(i.image_url) END,
  i.is_active
FROM `inventory_items` i
WHERE NOT EXISTS (SELECT 1 FROM `inventory_models` m WHERE m.inventory_item_id=i.id);

-- Backfill one placeholder serial per old stock unit; admins can replace these labels.
INSERT INTO `inventory_model_units` (`inventory_model_id`,`serial_number`,`status`)
SELECT m.id, CONCAT('LEGACY-', i.id, '-', seq.n), 'available'
FROM `inventory_items` i JOIN `inventory_models` m ON m.inventory_item_id=i.id AND m.name='Default model'
JOIN (
  SELECT ones.n + tens.n * 10 + hundreds.n * 100 + 1 AS n
  FROM (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) ones
  CROSS JOIN (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) tens
  CROSS JOIN (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) hundreds
) seq ON seq.n <= i.total_quantity
WHERE NOT EXISTS (SELECT 1 FROM `inventory_model_units` u WHERE u.inventory_model_id=m.id);

UPDATE `inventory_request_items` ri
JOIN `inventory_models` m ON m.inventory_item_id=ri.inventory_item_id AND m.name='Default model'
SET ri.inventory_model_id=m.id
WHERE ri.inventory_model_id IS NULL;

-- Keep the line's item and model relationship consistent and require every line to resolve to a model.
ALTER TABLE `inventory_request_items`
  MODIFY COLUMN `inventory_model_id` INT NOT NULL,
  DROP INDEX `uq_inventory_request_item`,
  ADD KEY `idx_inventory_request_items_model` (`inventory_model_id`),
  ADD UNIQUE KEY `uq_inventory_request_model` (`request_id`,`inventory_model_id`),
  ADD CONSTRAINT `fk_inventory_request_items_model_item` FOREIGN KEY (`inventory_model_id`,`inventory_item_id`) REFERENCES `inventory_models` (`id`,`inventory_item_id`) ON DELETE RESTRICT;
