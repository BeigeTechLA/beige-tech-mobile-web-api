-- Add submenu-level permissions for Client, Creative Partner, Sales Rep, and Sales Admin sidebars.
-- Run this after 20260827_01_add_admin_sidebar_submenu_permissions.sql if the admin submenu query
-- was already applied.

INSERT INTO permissions (role_key, module_key, action_key, permission_key, is_active)
SELECT scoped_modules.role_key, scoped_modules.module_key, actions.action_key, CONCAT(scoped_modules.module_key, '.', actions.action_key), 1
FROM (
  SELECT 'client' AS role_key, 'client_finances_beige_credit_points' AS module_key UNION ALL
  SELECT 'client', 'client_finances_transactions' UNION ALL
  SELECT 'creative_partner', 'creative_partner_finances_my_earnings' UNION ALL
  SELECT 'creative_partner', 'creative_partner_finances_disputes' UNION ALL
  SELECT 'sales_rep', 'sales_rep_quotes_all_quotes' UNION ALL
  SELECT 'sales_rep', 'sales_rep_quotes_change_requests' UNION ALL
  SELECT 'sales_rep', 'sales_rep_quotes_master_pricing' UNION ALL
  SELECT 'sales_admin', 'sales_admin_quotes_all_quotes' UNION ALL
  SELECT 'sales_admin', 'sales_admin_quotes_change_requests' UNION ALL
  SELECT 'sales_admin', 'sales_admin_quotes_master_pricing'
) AS scoped_modules
CROSS JOIN (
  SELECT 'view' AS action_key UNION ALL
  SELECT 'create' UNION ALL
  SELECT 'edit' UNION ALL
  SELECT 'delete'
) AS actions
WHERE NOT EXISTS (
  SELECT 1
  FROM permissions existing
  WHERE existing.permission_key = CONCAT(scoped_modules.module_key, '.', actions.action_key)
);

SET @client_role_id = (
  SELECT user_type_id
  FROM user_type
  WHERE LOWER(REPLACE(user_role, ' ', '_')) = 'client'
  LIMIT 1
);

SET @creative_partner_role_id = (
  SELECT user_type_id
  FROM user_type
  WHERE LOWER(REPLACE(user_role, ' ', '_')) IN ('creative', 'creative_partner')
  LIMIT 1
);

SET @sales_rep_role_id = (
  SELECT user_type_id
  FROM user_type
  WHERE LOWER(REPLACE(user_role, ' ', '_')) = 'sales_rep'
  LIMIT 1
);

SET @sales_admin_role_id = (
  SELECT user_type_id
  FROM user_type
  WHERE LOWER(REPLACE(user_role, ' ', '_')) = 'sales_admin'
  LIMIT 1
);

INSERT INTO role_permissions (role_id, permission_id, is_active)
SELECT role_module_defaults.role_id, p.permission_id, 1
FROM permissions p
JOIN (
  SELECT @client_role_id AS role_id, 'client_finances_beige_credit_points' AS module_key UNION ALL
  SELECT @client_role_id, 'client_finances_transactions' UNION ALL
  SELECT @creative_partner_role_id, 'creative_partner_finances_my_earnings' UNION ALL
  SELECT @creative_partner_role_id, 'creative_partner_finances_disputes' UNION ALL
  SELECT @sales_rep_role_id, 'sales_rep_quotes_all_quotes' UNION ALL
  SELECT @sales_rep_role_id, 'sales_rep_quotes_change_requests' UNION ALL
  SELECT @sales_rep_role_id, 'sales_rep_quotes_master_pricing' UNION ALL
  SELECT @sales_admin_role_id, 'sales_admin_quotes_all_quotes' UNION ALL
  SELECT @sales_admin_role_id, 'sales_admin_quotes_change_requests' UNION ALL
  SELECT @sales_admin_role_id, 'sales_admin_quotes_master_pricing'
) AS role_module_defaults
  ON role_module_defaults.role_id IS NOT NULL
  AND role_module_defaults.module_key = p.module_key
WHERE p.is_active = 1
  AND NOT EXISTS (
    SELECT 1
    FROM role_permissions existing
    WHERE existing.role_id = role_module_defaults.role_id
      AND existing.permission_id = p.permission_id
  );

-- Backfill child role permissions from existing parent permissions so current
-- role access keeps working after frontend starts using submenu keys.
INSERT INTO role_permissions (role_id, permission_id, is_active)
SELECT parent_rp.role_id, child.permission_id, 1
FROM role_permissions parent_rp
JOIN permissions parent
  ON parent.permission_id = parent_rp.permission_id
JOIN (
  SELECT 'client_finances' AS parent_module, 'client_finances_beige_credit_points' AS child_module UNION ALL
  SELECT 'client_finances', 'client_finances_transactions' UNION ALL
  SELECT 'creative_partner_payouts', 'creative_partner_finances_my_earnings' UNION ALL
  SELECT 'creative_partner_payouts', 'creative_partner_finances_disputes' UNION ALL
  SELECT 'sales_rep_quotes', 'sales_rep_quotes_all_quotes' UNION ALL
  SELECT 'sales_rep_quotes', 'sales_rep_quotes_change_requests' UNION ALL
  SELECT 'sales_rep_quotes', 'sales_rep_quotes_master_pricing' UNION ALL
  SELECT 'sales_admin_quotes', 'sales_admin_quotes_all_quotes' UNION ALL
  SELECT 'sales_admin_quotes', 'sales_admin_quotes_change_requests' UNION ALL
  SELECT 'sales_admin_quotes', 'sales_admin_quotes_master_pricing'
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
  SELECT 'client_finances' AS parent_module, 'client_finances_beige_credit_points' AS child_module UNION ALL
  SELECT 'client_finances', 'client_finances_transactions' UNION ALL
  SELECT 'creative_partner_payouts', 'creative_partner_finances_my_earnings' UNION ALL
  SELECT 'creative_partner_payouts', 'creative_partner_finances_disputes' UNION ALL
  SELECT 'sales_rep_quotes', 'sales_rep_quotes_all_quotes' UNION ALL
  SELECT 'sales_rep_quotes', 'sales_rep_quotes_change_requests' UNION ALL
  SELECT 'sales_rep_quotes', 'sales_rep_quotes_master_pricing' UNION ALL
  SELECT 'sales_admin_quotes', 'sales_admin_quotes_all_quotes' UNION ALL
  SELECT 'sales_admin_quotes', 'sales_admin_quotes_change_requests' UNION ALL
  SELECT 'sales_admin_quotes', 'sales_admin_quotes_master_pricing'
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
