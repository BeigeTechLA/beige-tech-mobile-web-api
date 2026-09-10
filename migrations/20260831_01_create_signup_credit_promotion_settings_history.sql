CREATE TABLE IF NOT EXISTS `signup_credit_promo_history` (
  `signup_credit_promo_history_id` INT NOT NULL AUTO_INCREMENT,
  `signup_credit_promotion_setting_id` INT NOT NULL,
  `is_enabled` BOOLEAN NOT NULL DEFAULT FALSE,
  `amount` DECIMAL(10, 2) NOT NULL DEFAULT 250.00,
  `start_date` DATE NULL,
  `end_date` DATE NULL,
  `changed_by_user_id` INT NULL,
  `changed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `change_reason` VARCHAR(255) NULL,
  `change_details_json` JSON NULL,
  PRIMARY KEY (`signup_credit_promo_history_id`),
  KEY `idx_signup_credit_promo_history_setting` (`signup_credit_promotion_setting_id`),
  KEY `idx_signup_credit_promo_history_changed_at` (`changed_at`),
  KEY `idx_signup_credit_promo_history_changed_by` (`changed_by_user_id`),
  CONSTRAINT `fk_signup_credit_promotion_history_setting`
    FOREIGN KEY (`signup_credit_promotion_setting_id`) REFERENCES `signup_credit_promotion_settings` (`signup_credit_promotion_setting_id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_signup_credit_promo_history_changed_by`
    FOREIGN KEY (`changed_by_user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL
);