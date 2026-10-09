CREATE TABLE IF NOT EXISTS `inventory_requests` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `cp_id` INT NOT NULL,
  `purpose` ENUM('personal','shoot') NOT NULL,
  `shoot_id` INT NULL,
  `status` ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  `admin_id` INT NULL,
  `admin_note` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_inventory_requests_cp` (`cp_id`),
  KEY `idx_inventory_requests_shoot` (`shoot_id`),
  KEY `idx_inventory_requests_status` (`status`)
);

CREATE TABLE IF NOT EXISTS `inventory_request_items` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `request_id` INT NOT NULL,
  `inventory_item_id` INT NOT NULL,
  `quantity` INT NOT NULL,
  `unit_price` DECIMAL(10,2) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inventory_request_item` (`request_id`, `inventory_item_id`),
  KEY `idx_inventory_request_items_item` (`inventory_item_id`),
  CONSTRAINT `fk_inventory_request_items_request` FOREIGN KEY (`request_id`) REFERENCES `inventory_requests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_inventory_request_items_item` FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items` (`id`) ON DELETE RESTRICT
);
