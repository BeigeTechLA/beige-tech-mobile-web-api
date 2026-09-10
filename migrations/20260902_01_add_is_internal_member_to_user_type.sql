ALTER TABLE `user_type`
ADD COLUMN `is_internal_member` TINYINT(1) NOT NULL DEFAULT 0 AFTER `description`;

UPDATE `user_type`
SET `is_internal_member` = 1
WHERE `user_type_id` IN (1, 5, 6, 7, 8);

UPDATE `user_type`
SET `is_internal_member` = 0
WHERE `user_type_id` IN (2, 3, 4);

INSERT INTO `permissions` (`role_key`, `module_key`, `action_key`, `permission_key`, `is_active`)
SELECT 'admin', 'roles_permissions', action_key, CONCAT('roles_permissions.', action_key), 1
FROM (
  SELECT 'view' AS action_key UNION ALL
  SELECT 'create' UNION ALL
  SELECT 'edit' UNION ALL
  SELECT 'delete'
) AS actions
WHERE NOT EXISTS (
  SELECT 1
  FROM `permissions` existing
  WHERE existing.permission_key = CONCAT('roles_permissions.', actions.action_key)
);

UPDATE `permissions`
SET `role_key` = 'admin'
WHERE `module_key` = 'roles_permissions';

INSERT INTO `role_permissions` (`role_id`, `permission_id`, `is_active`)
SELECT role_ids.role_id, permissions.permission_id, 1
FROM (
  SELECT 8 AS role_id
) AS role_ids
JOIN `permissions`
  ON permissions.module_key = 'roles_permissions'
  AND permissions.is_active = 1
WHERE NOT EXISTS (
  SELECT 1
  FROM `role_permissions` existing
  WHERE existing.role_id = role_ids.role_id
    AND existing.permission_id = permissions.permission_id
);

UPDATE `role_permissions`
JOIN `permissions`
  ON `permissions`.`permission_id` = `role_permissions`.`permission_id`
SET `role_permissions`.`is_active` = 0
WHERE `permissions`.`module_key` = 'roles_permissions'
  AND `role_permissions`.`role_id` <> 8;
