-- Make Shift Management default to Super Admin only.
-- Other users/roles can still access it when explicitly granted
-- admin_sales_representative_shift_management.* permissions later.

SET @super_admin_role_id = (
  SELECT user_type_id
  FROM user_type
  WHERE LOWER(REPLACE(user_role, ' ', '_')) IN ('super_admin', 'superadmin')
  LIMIT 1
);

INSERT INTO role_permissions (role_id, permission_id, is_active)
SELECT @super_admin_role_id, p.permission_id, 1
FROM permissions p
WHERE @super_admin_role_id IS NOT NULL
  AND p.module_key = 'admin_sales_representative_shift_management'
  AND p.is_active = 1
  AND NOT EXISTS (
    SELECT 1
    FROM role_permissions existing
    WHERE existing.role_id = @super_admin_role_id
      AND existing.permission_id = p.permission_id
  );

UPDATE role_permissions rp
JOIN permissions p
  ON p.permission_id = rp.permission_id
SET rp.is_active = 0
WHERE p.module_key = 'admin_sales_representative_shift_management'
  AND rp.role_id <> @super_admin_role_id;

UPDATE user_permissions up
JOIN permissions p
  ON p.permission_id = up.permission_id
JOIN users u
  ON u.id = up.user_id
LEFT JOIN user_type ut
  ON ut.user_type_id = u.user_type
SET up.is_active = 0
WHERE p.module_key = 'admin_sales_representative_shift_management'
  AND LOWER(REPLACE(COALESCE(ut.user_role, ''), ' ', '_')) NOT IN ('super_admin', 'superadmin');
