-- Add submenu-level permissions for Admin/Super Admin sidebar access.
-- These rows let the UI and route middleware grant or deny one submenu without
-- granting the whole parent sidebar module.

INSERT INTO permissions (role_key, module_key, action_key, permission_key, is_active)
SELECT 'admin', modules.module_key, actions.action_key, CONCAT(modules.module_key, '.', actions.action_key), 1
FROM (
  SELECT 'admin_sales_representative_dashboard' AS module_key UNION ALL
  SELECT 'admin_sales_representative_shift_management' UNION ALL
  SELECT 'admin_finances_transactions' UNION ALL
  SELECT 'admin_finances_disputes' UNION ALL
  SELECT 'admin_finances_beige_credit_points' UNION ALL
  SELECT 'admin_finances_cp_compensation' UNION ALL
  SELECT 'admin_users_all_users' UNION ALL
  SELECT 'admin_users_clients' UNION ALL
  SELECT 'admin_users_creative_partners' UNION ALL
  SELECT 'admin_quotes_all_quotes' UNION ALL
  SELECT 'admin_quotes_quote_approvals' UNION ALL
  SELECT 'admin_quotes_master_pricing'
) AS modules
CROSS JOIN (
  SELECT 'view' AS action_key UNION ALL
  SELECT 'create' UNION ALL
  SELECT 'edit' UNION ALL
  SELECT 'delete'
) AS actions
WHERE NOT EXISTS (
  SELECT 1
  FROM permissions existing
  WHERE existing.permission_key = CONCAT(modules.module_key, '.', actions.action_key)
);

SET @admin_role_id = (
  SELECT user_type_id
  FROM user_type
  WHERE LOWER(REPLACE(user_role, ' ', '_')) = 'admin'
  LIMIT 1
);

SET @super_admin_role_id = (
  SELECT user_type_id
  FROM user_type
  WHERE LOWER(REPLACE(user_role, ' ', '_')) IN ('super_admin', 'superadmin')
  LIMIT 1
);

INSERT INTO role_permissions (role_id, permission_id, is_active)
SELECT role_ids.role_id, p.permission_id, 1
FROM permissions p
JOIN (
  SELECT @admin_role_id AS role_id UNION ALL
  SELECT @super_admin_role_id
) AS role_ids ON role_ids.role_id IS NOT NULL
WHERE p.module_key IN (
  'admin_sales_representative_dashboard',
  'admin_sales_representative_shift_management',
  'admin_finances_transactions',
  'admin_finances_disputes',
  'admin_finances_beige_credit_points',
  'admin_finances_cp_compensation',
  'admin_users_all_users',
  'admin_users_clients',
  'admin_users_creative_partners',
  'admin_quotes_all_quotes',
  'admin_quotes_quote_approvals',
  'admin_quotes_master_pricing'
)
  AND p.is_active = 1
  AND NOT EXISTS (
    SELECT 1
    FROM role_permissions existing
    WHERE existing.role_id = role_ids.role_id
      AND existing.permission_id = p.permission_id
  );
