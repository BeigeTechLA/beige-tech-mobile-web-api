-- 26-10-26

ALTER TABLE `users`
  ADD COLUMN `created_by_user_id` INT(11) NULL DEFAULT NULL AFTER `created_from`,
  ADD INDEX `idx_users_created_by_user_id` (`created_by_user_id`),
  ADD CONSTRAINT `fk_users_created_by_user`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
