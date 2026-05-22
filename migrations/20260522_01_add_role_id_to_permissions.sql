ALTER TABLE `permissions`
  ADD COLUMN `role_id` INT NULL AFTER `permission_key`;

ALTER TABLE `permissions`
  DROP INDEX `unique_permission_key`;

ALTER TABLE `permissions`
  ADD UNIQUE KEY `unique_role_permission_key` (`role_id`, `permission_key`),
  ADD KEY `idx_permissions_role_id` (`role_id`);

ALTER TABLE `permissions`
  ADD CONSTRAINT `fk_permissions_role_id`
  FOREIGN KEY (`role_id`) REFERENCES `user_type` (`user_type_id`) ON DELETE CASCADE;
