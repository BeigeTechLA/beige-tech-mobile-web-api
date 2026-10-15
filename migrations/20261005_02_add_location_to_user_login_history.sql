ALTER TABLE `user_login_history`
  ADD COLUMN `city` VARCHAR(120) NULL AFTER `ip_address`,
  ADD COLUMN `country` VARCHAR(120) NULL AFTER `city`;
