CREATE TABLE IF NOT EXISTS `user_login_history` (
  `login_history_id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `ip_address` VARCHAR(45) NULL,
  `login_method` VARCHAR(30) NOT NULL,
  `user_agent` VARCHAR(512) NULL,
  `logged_in_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`login_history_id`),
  KEY `idx_user_login_history_user_time` (`user_id`, `logged_in_at`),
  KEY `idx_user_login_history_ip_time` (`ip_address`, `logged_in_at`),
  KEY `idx_user_login_history_logged_in_at` (`logged_in_at`),
  CONSTRAINT `fk_user_login_history_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
);
