require('dotenv').config();

const mysql = require('mysql2/promise');

const ACTIONS = ['view', 'create', 'edit', 'delete'];

const ADMIN_MODULES = [
  'admin_dashboard',
  'admin_shoots',
  'admin_file_manager',
  'admin_meetings',
  'admin_messages',
  'admin_availability',
  'admin_sales_representative',
  'admin_sales_representative_dashboard',
  'admin_sales_representative_shift_management',
  'admin_finances',
  'admin_finances_transactions',
  'admin_finances_disputes',
  'admin_finances_beige_credit_points',
  'admin_finances_cp_compensation',
  'admin_users',
  'admin_users_all_users',
  'admin_users_clients',
  'admin_users_creative_partners',
  'admin_quotes',
  'admin_quotes_all_quotes',
  'admin_quotes_quote_approvals',
  'admin_quotes_master_pricing',
  'admin_invoices',
  'roles_permissions',
];

const LEGACY_TO_ADMIN_MODULES = {
  sales_rep_availability: ['admin_availability'],
  sales_rep_file_manager: ['admin_file_manager'],
  sales_rep_meetings: ['admin_meetings'],
  sales_rep_messages: ['admin_messages'],
  sales_rep_quotes: ['admin_quotes', 'admin_quotes_all_quotes'],
  sales_rep_sales: [
    'admin_sales_representative',
    'admin_sales_representative_dashboard',
    'admin_sales_representative_shift_management',
  ],
  sales_rep_shoots: ['admin_shoots'],

  sales_admin_dashboard: ['admin_dashboard'],
  sales_admin_file_manager: ['admin_file_manager'],
  sales_admin_invoices: ['admin_invoices'],
  sales_admin_meetings: ['admin_meetings'],
  sales_admin_messages: ['admin_messages'],
  sales_admin_quotes: ['admin_quotes', 'admin_quotes_all_quotes'],
  sales_admin_sales_people: [
    'admin_sales_representative',
    'admin_sales_representative_dashboard',
    'admin_sales_representative_shift_management',
  ],
  sales_admin_shoots: ['admin_shoots'],

  production_manager_availability: ['admin_availability'],
  production_manager_creative_partner: ['admin_users', 'admin_users_creative_partners'],
  production_manager_dashboard: ['admin_dashboard'],
  production_manager_file_manager: ['admin_file_manager'],
  production_manager_meetings: ['admin_meetings'],
  production_manager_messages: ['admin_messages'],
  production_manager_shoots: ['admin_shoots'],
};

const LEGACY_MODULES = Object.keys(LEGACY_TO_ADMIN_MODULES);

const connect = () => mysql.createConnection({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT || 3306),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASS,
  database: process.env.DATABASE_NAME,
  multipleStatements: false,
});

const main = async () => {
  const dryRun = process.argv.includes('--dry-run');
  const connection = await connect();

  try {
    await connection.beginTransaction();

    const [internalRoles] = await connection.query(
      `SELECT user_type_id, user_role
       FROM user_type
       WHERE is_active = 1 AND is_internal_member = 1`
    );
    const internalRoleIds = internalRoles.map((role) => role.user_type_id);

    for (const moduleKey of ADMIN_MODULES) {
      for (const actionKey of ACTIONS) {
        await connection.query(
          `INSERT INTO permissions (role_key, module_key, action_key, permission_key, is_active)
           SELECT 'admin', ?, ?, ?, 1
           WHERE NOT EXISTS (
             SELECT 1 FROM permissions WHERE permission_key = ?
           )`,
          [moduleKey, actionKey, `${moduleKey}.${actionKey}`, `${moduleKey}.${actionKey}`]
        );
      }
    }

    const [legacyRolePermissions] = await connection.query(
      `SELECT DISTINCT rp.role_id, p.module_key, p.action_key
       FROM role_permissions rp
       JOIN permissions p ON p.permission_id = rp.permission_id
       WHERE rp.is_active = 1
         AND rp.role_id IN (?)
         AND p.module_key IN (?)`,
      [internalRoleIds, LEGACY_MODULES]
    );

    let copiedRolePermissions = 0;
    for (const row of legacyRolePermissions) {
      const targetModules = LEGACY_TO_ADMIN_MODULES[row.module_key] || [];
      for (const targetModule of targetModules) {
        const [result] = await connection.query(
          `INSERT INTO role_permissions (role_id, permission_id, is_active)
           SELECT ?, p.permission_id, 1
           FROM permissions p
           WHERE p.permission_key = ?
             AND p.is_active = 1
             AND NOT EXISTS (
               SELECT 1
               FROM role_permissions existing
               WHERE existing.role_id = ?
                 AND existing.permission_id = p.permission_id
             )`,
          [row.role_id, `${targetModule}.${row.action_key}`, row.role_id]
        );
        copiedRolePermissions += result.affectedRows || 0;

        await connection.query(
          `UPDATE role_permissions rp
           JOIN permissions p ON p.permission_id = rp.permission_id
           SET rp.is_active = 1
           WHERE rp.role_id = ?
             AND p.permission_key = ?`,
          [row.role_id, `${targetModule}.${row.action_key}`]
        );
      }
    }

    const [disableLegacyResult] = await connection.query(
      `UPDATE role_permissions rp
       JOIN permissions p ON p.permission_id = rp.permission_id
       SET rp.is_active = 0
       WHERE rp.role_id IN (?)
         AND p.module_key IN (?)`,
      [internalRoleIds, LEGACY_MODULES]
    );

    const [legacyUserPermissions] = await connection.query(
      `SELECT DISTINCT up.user_id, p.module_key, p.action_key, up.is_allowed
       FROM user_permissions up
       JOIN users u ON u.id = up.user_id
       JOIN permissions p ON p.permission_id = up.permission_id
       WHERE up.is_active = 1
         AND u.user_type IN (?)
         AND p.module_key IN (?)`,
      [internalRoleIds, LEGACY_MODULES]
    );

    let copiedUserPermissions = 0;
    for (const row of legacyUserPermissions) {
      const targetModules = LEGACY_TO_ADMIN_MODULES[row.module_key] || [];
      for (const targetModule of targetModules) {
        const [insertResult] = await connection.query(
          `INSERT INTO user_permissions (user_id, permission_id, is_allowed, is_active)
           SELECT ?, p.permission_id, ?, 1
           FROM permissions p
           WHERE p.permission_key = ?
             AND p.is_active = 1
             AND NOT EXISTS (
               SELECT 1
               FROM user_permissions existing
               WHERE existing.user_id = ?
                 AND existing.permission_id = p.permission_id
             )`,
          [row.user_id, row.is_allowed, `${targetModule}.${row.action_key}`, row.user_id]
        );
        copiedUserPermissions += insertResult.affectedRows || 0;

        await connection.query(
          `UPDATE user_permissions up
           JOIN permissions p ON p.permission_id = up.permission_id
           SET up.is_active = 1,
               up.is_allowed = ?
           WHERE up.user_id = ?
             AND p.permission_key = ?`,
          [row.is_allowed, row.user_id, `${targetModule}.${row.action_key}`]
        );
      }
    }

    const [disableLegacyUserResult] = await connection.query(
      `UPDATE user_permissions up
       JOIN users u ON u.id = up.user_id
       JOIN permissions p ON p.permission_id = up.permission_id
       SET up.is_active = 0
       WHERE u.user_type IN (?)
         AND p.module_key IN (?)`,
      [internalRoleIds, LEGACY_MODULES]
    );

    const [affectedUsersResult] = await connection.query(
      `UPDATE users
       SET permissions_version = COALESCE(permissions_version, 1) + 1
       WHERE is_active = 1
         AND user_type IN (?)`,
      [internalRoleIds]
    );

    const [postCheck] = await connection.query(
      `SELECT rp.role_id, ut.user_role, p.module_key, COUNT(*) AS active_actions
       FROM role_permissions rp
       JOIN permissions p ON p.permission_id = rp.permission_id
       JOIN user_type ut ON ut.user_type_id = rp.role_id
       WHERE rp.is_active = 1
         AND rp.role_id IN (?)
         AND (
           p.module_key IN (?)
           OR p.module_key IN (?)
         )
       GROUP BY rp.role_id, ut.user_role, p.module_key
       ORDER BY rp.role_id, p.module_key`,
      [internalRoleIds, ADMIN_MODULES, LEGACY_MODULES]
    );

    const [legacyUserPostCheck] = await connection.query(
      `SELECT u.user_type, COUNT(*) AS active_legacy_user_permissions
       FROM user_permissions up
       JOIN users u ON u.id = up.user_id
       JOIN permissions p ON p.permission_id = up.permission_id
       WHERE up.is_active = 1
         AND u.user_type IN (?)
         AND p.module_key IN (?)
       GROUP BY u.user_type
       ORDER BY u.user_type`,
      [internalRoleIds, LEGACY_MODULES]
    );

    if (dryRun) {
      await connection.rollback();
    } else {
      await connection.commit();
    }

    console.log(JSON.stringify({
      mode: dryRun ? 'dry-run' : 'applied',
      internal_roles: internalRoles,
      copied_role_permissions: copiedRolePermissions,
      disabled_legacy_role_permissions: disableLegacyResult.affectedRows || 0,
      copied_user_permissions: copiedUserPermissions,
      disabled_legacy_user_permissions: disableLegacyUserResult.affectedRows || 0,
      bumped_users: affectedUsersResult.affectedRows || 0,
      post_check: postCheck,
      active_legacy_user_permissions_after_repair: legacyUserPostCheck,
    }, null, 2));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
};

main().catch((error) => {
  console.error(error.code || error.name, error.message);
  process.exit(1);
});
