CREATE TABLE IF NOT EXISTS `agreements` (
  `agreement_id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `agreement_type` TINYINT UNSIGNED NOT NULL COMMENT '1 = Shoot Agreement, 2 = General Agreement',
  `agreement_name` VARCHAR(255) NOT NULL,
  `agreement_title` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `effective_date` DATE NOT NULL,
  `sections` JSON NOT NULL,
  `version_no` INT UNSIGNED NOT NULL DEFAULT 1,
  `status` ENUM('pending', 'accepted', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
  `created_by_user_id` INT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`agreement_id`),
  KEY `idx_agreements_type` (`agreement_type`),
  KEY `idx_agreements_status` (`status`),
  KEY `idx_agreements_created_by` (`created_by_user_id`),
  CONSTRAINT `chk_agreements_type` CHECK (`agreement_type` IN (1, 2)),
  CONSTRAINT `fk_agreements_created_by`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
