CREATE TABLE IF NOT EXISTS `internal_password_expiry_settings` (
  `internal_password_expiry_setting_id` INT NOT NULL,
  `is_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `expiry_days` INT NOT NULL DEFAULT 7,
  `enabled_at` DATETIME NULL,
  `updated_by_user_id` INT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`internal_password_expiry_setting_id`),
  CONSTRAINT `fk_internal_password_expiry_updated_by`
    FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
);

INSERT INTO `internal_password_expiry_settings`
  (`internal_password_expiry_setting_id`, `is_enabled`, `expiry_days`)
VALUES (1, 0, 7)
ON DUPLICATE KEY UPDATE `internal_password_expiry_setting_id` = `internal_password_expiry_setting_id`;

ALTER TABLE `users`
  ADD COLUMN `password_changed_at` DATETIME NULL AFTER `password_hash`,
  ADD COLUMN `password_expiry_otp_hash` VARCHAR(255) NULL AFTER `password_changed_at`,
  ADD COLUMN `password_expiry_otp_expires_at` DATETIME NULL AFTER `password_expiry_otp_hash`,
  ADD COLUMN `password_expiry_otp_verified_at` DATETIME NULL AFTER `password_expiry_otp_expires_at`,
  ADD COLUMN `password_expiry_otp_attempts` INT NOT NULL DEFAULT 0 AFTER `password_expiry_otp_verified_at`;

UPDATE `users`
SET `password_changed_at` = COALESCE(`updated_at`, `created_at`, NOW())
WHERE `id` > 0
  AND `password_changed_at` IS NULL
  AND `password_hash` IS NOT NULL;