CREATE TABLE IF NOT EXISTS `signup_credit_promotion_settings` (
  `signup_credit_promotion_setting_id` INT NOT NULL AUTO_INCREMENT,
  `is_enabled` BOOLEAN NOT NULL DEFAULT FALSE,
  `amount` DECIMAL(10, 2) NOT NULL DEFAULT 250.00,
  `start_date` DATE NULL,
  `end_date` DATE NULL,
  `updated_by_user_id` INT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`signup_credit_promotion_setting_id`),
  CONSTRAINT `fk_signup_credit_promotion_updated_by`
    FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL
);

INSERT INTO `signup_credit_promotion_settings`
  (`signup_credit_promotion_setting_id`, `is_enabled`, `amount`, `start_date`, `end_date`)
VALUES
  (1, FALSE, 250.00, NULL, NULL)
ON DUPLICATE KEY UPDATE
  `signup_credit_promotion_setting_id` = `signup_credit_promotion_setting_id`;
