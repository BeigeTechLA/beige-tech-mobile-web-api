INSERT INTO `permissions` (`role_key`, `module_key`, `action_key`, `permission_key`, `is_active`)
SELECT 'admin', modules.module_key, actions.action_key, CONCAT(modules.module_key, '.', actions.action_key), 1
FROM (
  SELECT 'admin_finances_transactions' AS module_key UNION ALL
  SELECT 'admin_finances_disputes' UNION ALL
  SELECT 'admin_finances_beige_credit_points' UNION ALL
  SELECT 'admin_finances_cp_compensation'
) AS modules
CROSS JOIN (
  SELECT 'view' AS action_key UNION ALL
  SELECT 'create' UNION ALL
  SELECT 'edit' UNION ALL
  SELECT 'delete'
) AS actions
WHERE NOT EXISTS (
  SELECT 1
  FROM `permissions` existing
  WHERE existing.permission_key = CONCAT(modules.module_key, '.', actions.action_key)
);

UPDATE `permissions`
SET `role_key` = 'admin'
WHERE `module_key` IN (
  'admin_finances_transactions',
  'admin_finances_disputes',
  'admin_finances_beige_credit_points',
  'admin_finances_cp_compensation'
);

INSERT INTO `role_permissions` (`role_id`, `permission_id`, `is_active`)
SELECT DISTINCT source_roles.role_id, child_permissions.permission_id, 1
FROM `role_permissions` source_roles
JOIN `permissions` child_permissions
  ON child_permissions.module_key IN (
    'admin_finances_transactions',
    'admin_finances_disputes',
    'admin_finances_beige_credit_points',
    'admin_finances_cp_compensation'
  )
  AND child_permissions.is_active = 1
JOIN `permissions` parent_permissions
  ON parent_permissions.permission_id = source_roles.permission_id
  AND parent_permissions.module_key = 'admin_finances'
  AND parent_permissions.action_key = child_permissions.action_key
WHERE source_roles.is_active = 1
  AND NOT EXISTS (
    SELECT 1
    FROM `role_permissions` existing
    WHERE existing.role_id = source_roles.role_id
      AND existing.permission_id = child_permissions.permission_id
  );

UPDATE `role_permissions` existing
JOIN `permissions` child_permissions
  ON child_permissions.permission_id = existing.permission_id
  AND child_permissions.module_key IN (
    'admin_finances_transactions',
    'admin_finances_disputes',
    'admin_finances_beige_credit_points',
    'admin_finances_cp_compensation'
  )
JOIN `role_permissions` source_roles
  ON source_roles.role_id = existing.role_id
  AND source_roles.is_active = 1
JOIN `permissions` parent_permissions
  ON parent_permissions.permission_id = source_roles.permission_id
  AND parent_permissions.module_key = 'admin_finances'
  AND parent_permissions.action_key = child_permissions.action_key
SET existing.is_active = 1
WHERE existing.is_active = 0;
