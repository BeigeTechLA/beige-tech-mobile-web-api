CREATE TABLE IF NOT EXISTS `finance_calendar_connections` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `provider` ENUM('google') NOT NULL DEFAULT 'google',
  `provider_account_email` VARCHAR(255) NULL,
  `access_token_encrypted` TEXT NULL,
  `refresh_token_encrypted` TEXT NULL,
  `token_expiry` DATETIME NULL,
  `selected_calendar_id` VARCHAR(255) NULL,
  `selected_calendar_name` VARCHAR(255) NULL,
  `sync_status` ENUM('not_connected', 'connected', 'syncing', 'failed', 'revoked') NOT NULL DEFAULT 'not_connected',
  `last_synced_at` DATETIME NULL,
  `last_sync_error` TEXT NULL,
  `disconnected_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_finance_calendar_connection_provider` (`provider`)
);

ALTER TABLE `creator_earnings`
  ADD COLUMN `finance_google_calendar_event_id` VARCHAR(255) NULL AFTER `updated_at`,
  ADD COLUMN `finance_google_calendar_id` VARCHAR(255) NULL AFTER `finance_google_calendar_event_id`,
  ADD COLUMN `finance_google_calendar_synced_at` DATETIME NULL AFTER `finance_google_calendar_id`,
  ADD COLUMN `finance_google_calendar_sync_error` TEXT NULL AFTER `finance_google_calendar_synced_at`;
