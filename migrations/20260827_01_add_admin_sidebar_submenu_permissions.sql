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

-- Backfill child role permissions from existing parent permissions so existing
-- custom roles with admin_users/admin_finances/admin_quotes/admin_sales_representative
-- access keep working after route checks move to submenu keys.
INSERT INTO role_permissions (role_id, permission_id, is_active)
SELECT parent_rp.role_id, child.permission_id, 1
FROM role_permissions parent_rp
JOIN permissions parent
  ON parent.permission_id = parent_rp.permission_id
JOIN (
  SELECT 'admin_sales_representative' AS parent_module, 'admin_sales_representative_dashboard' AS child_module UNION ALL
  SELECT 'admin_sales_representative', 'admin_sales_representative_shift_management' UNION ALL
  SELECT 'admin_finances', 'admin_finances_transactions' UNION ALL
  SELECT 'admin_finances', 'admin_finances_disputes' UNION ALL
  SELECT 'admin_finances', 'admin_finances_beige_credit_points' UNION ALL
  SELECT 'admin_finances', 'admin_finances_cp_compensation' UNION ALL
  SELECT 'admin_users', 'admin_users_all_users' UNION ALL
  SELECT 'admin_users', 'admin_users_clients' UNION ALL
  SELECT 'admin_users', 'admin_users_creative_partners' UNION ALL
  SELECT 'admin_quotes', 'admin_quotes_all_quotes' UNION ALL
  SELECT 'admin_quotes', 'admin_quotes_quote_approvals' UNION ALL
  SELECT 'admin_quotes', 'admin_quotes_master_pricing'
) AS permission_map
  ON permission_map.parent_module = parent.module_key
JOIN permissions child
  ON child.module_key = permission_map.child_module
  AND child.action_key = parent.action_key
  AND child.is_active = 1
WHERE parent_rp.is_active = 1
  AND parent.is_active = 1
  AND NOT EXISTS (
    SELECT 1
    FROM role_permissions existing
    WHERE existing.role_id = parent_rp.role_id
      AND existing.permission_id = child.permission_id
  );

-- Backfill user-level overrides too. If an existing user was explicitly allowed
-- or denied on a parent module, carry the same override to each new child module.
INSERT INTO user_permissions (user_id, permission_id, is_allowed, is_active)
SELECT parent_up.user_id, child.permission_id, parent_up.is_allowed, 1
FROM user_permissions parent_up
JOIN permissions parent
  ON parent.permission_id = parent_up.permission_id
JOIN (
  SELECT 'admin_sales_representative' AS parent_module, 'admin_sales_representative_dashboard' AS child_module UNION ALL
  SELECT 'admin_sales_representative', 'admin_sales_representative_shift_management' UNION ALL
  SELECT 'admin_finances', 'admin_finances_transactions' UNION ALL
  SELECT 'admin_finances', 'admin_finances_disputes' UNION ALL
  SELECT 'admin_finances', 'admin_finances_beige_credit_points' UNION ALL
  SELECT 'admin_finances', 'admin_finances_cp_compensation' UNION ALL
  SELECT 'admin_users', 'admin_users_all_users' UNION ALL
  SELECT 'admin_users', 'admin_users_clients' UNION ALL
  SELECT 'admin_users', 'admin_users_creative_partners' UNION ALL
  SELECT 'admin_quotes', 'admin_quotes_all_quotes' UNION ALL
  SELECT 'admin_quotes', 'admin_quotes_quote_approvals' UNION ALL
  SELECT 'admin_quotes', 'admin_quotes_master_pricing'
) AS permission_map
  ON permission_map.parent_module = parent.module_key
JOIN permissions child
  ON child.module_key = permission_map.child_module
  AND child.action_key = parent.action_key
  AND child.is_active = 1
WHERE parent_up.is_active = 1
  AND parent.is_active = 1
  AND NOT EXISTS (
    SELECT 1
    FROM user_permissions existing
    WHERE existing.user_id = parent_up.user_id
      AND existing.permission_id = child.permission_id
  );
