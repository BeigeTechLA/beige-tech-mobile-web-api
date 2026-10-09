-- Add Quote Analytics as a first-class child of the admin Quotes permission.
-- Existing roles inherit each action from their matching admin_quotes action.

START TRANSACTION;

INSERT INTO permissions
  (role_key, module_key, action_key, permission_key, is_active)
SELECT
  'admin',
  'admin_quotes_quote_analytics',
  action.action_key,
  CONCAT('admin_quotes_quote_analytics.', action.action_key),
  1
FROM (
  SELECT 'view' AS action_key
  UNION ALL SELECT 'create'
  UNION ALL SELECT 'edit'
  UNION ALL SELECT 'delete'
) action
WHERE NOT EXISTS (
  SELECT 1
  FROM permissions existing
  WHERE existing.permission_key = CONCAT(
    'admin_quotes_quote_analytics.',
    action.action_key
  )
);

UPDATE permissions
SET
  role_key = 'admin',
  module_key = 'admin_quotes_quote_analytics',
  is_active = 1
WHERE permission_key IN (
  'admin_quotes_quote_analytics.view',
  'admin_quotes_quote_analytics.create',
  'admin_quotes_quote_analytics.edit',
  'admin_quotes_quote_analytics.delete'
);

INSERT INTO role_permissions (role_id, permission_id, is_active)
SELECT DISTINCT
  parent_role.role_id,
  analytics_permission.permission_id,
  1
FROM role_permissions parent_role
JOIN permissions parent_permission
  ON parent_permission.permission_id = parent_role.permission_id
  AND parent_permission.module_key = 'admin_quotes'
  AND parent_permission.is_active = 1
JOIN permissions analytics_permission
  ON analytics_permission.module_key = 'admin_quotes_quote_analytics'
  AND analytics_permission.action_key = parent_permission.action_key
  AND analytics_permission.is_active = 1
WHERE parent_role.is_active = 1
  AND NOT EXISTS (
    SELECT 1
    FROM role_permissions existing
    WHERE existing.role_id = parent_role.role_id
      AND existing.permission_id = analytics_permission.permission_id
  );

UPDATE role_permissions role_permission
JOIN permissions permission
  ON permission.permission_id = role_permission.permission_id
SET role_permission.is_active = 1
WHERE permission.module_key = 'admin_quotes_quote_analytics';

UPDATE users user
JOIN (
  SELECT DISTINCT role_permission.role_id
  FROM role_permissions role_permission
  JOIN permissions permission
    ON permission.permission_id = role_permission.permission_id
  WHERE permission.module_key = 'admin_quotes_quote_analytics'
    AND permission.action_key = 'view'
    AND role_permission.is_active = 1
) permitted_role
  ON permitted_role.role_id = user.user_type
SET user.permissions_version = user.permissions_version + 1;

COMMIT;
