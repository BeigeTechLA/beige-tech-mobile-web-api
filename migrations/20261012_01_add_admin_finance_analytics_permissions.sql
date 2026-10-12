-- Finance Analytics is a read-only child module of Admin Finances.
START TRANSACTION;

INSERT INTO permissions
  (role_key, module_key, action_key, permission_key, is_active)
VALUES
  ('admin', 'admin_finances_analytics', 'view', 'admin_finances_analytics.view', 1)
ON DUPLICATE KEY UPDATE
  role_key = VALUES(role_key),
  module_key = VALUES(module_key),
  action_key = VALUES(action_key),
  is_active = 1;

INSERT INTO role_permissions (role_id, permission_id, is_active)
SELECT DISTINCT parent_role.role_id, analytics_permission.permission_id, 1
FROM role_permissions parent_role
JOIN permissions parent_permission
  ON parent_permission.permission_id = parent_role.permission_id
  AND parent_permission.module_key = 'admin_finances'
  AND parent_permission.action_key = 'view'
  AND parent_permission.is_active = 1
JOIN permissions analytics_permission
  ON analytics_permission.permission_key = 'admin_finances_analytics.view'
  AND analytics_permission.is_active = 1
WHERE parent_role.is_active = 1
ON DUPLICATE KEY UPDATE is_active = 1;

UPDATE users user
JOIN (
  SELECT DISTINCT role_permission.role_id
  FROM role_permissions role_permission
  JOIN permissions permission ON permission.permission_id = role_permission.permission_id
  WHERE permission.permission_key = 'admin_finances_analytics.view'
    AND role_permission.is_active = 1
) permitted_role ON permitted_role.role_id = user.user_type
SET user.permissions_version = user.permissions_version + 1;

COMMIT;
