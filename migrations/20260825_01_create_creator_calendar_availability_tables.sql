CREATE TABLE IF NOT EXISTS `creator_availability_rules` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `crew_member_id` INT NOT NULL,
  `day_of_week` TINYINT NOT NULL COMMENT '0=Sunday, 1=Monday, ... 6=Saturday',
  `start_time` TIME NOT NULL,
  `end_time` TIME NOT NULL,
  `timezone` VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  `minimum_notice_minutes` INT NOT NULL DEFAULT 1440,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_creator_availability_rules_crew_day` (`crew_member_id`, `day_of_week`),
  CONSTRAINT `fk_creator_availability_rules_crew`
    FOREIGN KEY (`crew_member_id`) REFERENCES `crew_members` (`crew_member_id`)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `creator_availability_blocks` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `crew_member_id` INT NOT NULL,
  `source` ENUM('manual', 'beige_booking', 'google_calendar', 'apple_calendar') NOT NULL,
  `source_external_id` VARCHAR(255) NULL,
  `start_at` DATETIME NOT NULL,
  `end_at` DATETIME NOT NULL,
  `timezone` VARCHAR(64) NULL,
  `status` ENUM('unavailable', 'tentative', 'cancelled') NOT NULL DEFAULT 'unavailable',
  `metadata_json` JSON NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_creator_availability_blocks_crew_range` (`crew_member_id`, `start_at`, `end_at`),
  KEY `idx_creator_availability_blocks_source` (`source`, `source_external_id`),
  CONSTRAINT `fk_creator_availability_blocks_crew`
    FOREIGN KEY (`crew_member_id`) REFERENCES `crew_members` (`crew_member_id`)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `creator_calendar_connections` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `crew_member_id` INT NOT NULL,
  `provider` ENUM('google', 'apple') NOT NULL,
  `provider_account_email` VARCHAR(255) NULL,
  `access_token_encrypted` TEXT NULL,
  `refresh_token_encrypted` TEXT NULL,
  `token_expiry` DATETIME NULL,
  `selected_calendar_ids_json` JSON NULL,
  `sync_status` ENUM('not_connected', 'connected', 'syncing', 'failed', 'revoked') NOT NULL DEFAULT 'connected',
  `last_synced_at` DATETIME NULL,
  `last_sync_error` TEXT NULL,
  `disconnected_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_creator_calendar_connection` (`crew_member_id`, `provider`),
  CONSTRAINT `fk_creator_calendar_connections_crew`
    FOREIGN KEY (`crew_member_id`) REFERENCES `crew_members` (`crew_member_id`)
    ON DELETE CASCADE
);
