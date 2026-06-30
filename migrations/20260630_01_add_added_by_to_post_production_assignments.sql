ALTER TABLE `assigned_post_production_member`
  ADD COLUMN `added_by_user_id` INT NULL AFTER `post_production_member_id`,
  ADD INDEX `idx_assigned_post_production_added_by` (`added_by_user_id`),
  ADD CONSTRAINT `fk_assigned_post_production_added_by`
    FOREIGN KEY (`added_by_user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
