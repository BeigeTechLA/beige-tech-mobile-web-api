const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const projectRoot = path.resolve(__dirname, '..');
const envPath = path.join(projectRoot, '.env');
const outputPath = path.join(
  projectRoot,
  'migrations',
  'generated',
  'sync_roles_permissions_from_development.sql'
);
const localSuperAdmin = {
  name: 'Local Super Admin',
  email: 'superadmin@gmail.com',
  password_hash: '$2b$10$HcMJLhIi3poeUJ4iP6A5geu.D/z6lUdKP5jNEhmjQp9vYLhP4AnhC',
  auth_provider: null,
  email_verified: 1,
  is_active: 1,
  user_type: 8,
  role: 'super_admin'
};

const databaseKeys = new Set([
  'DATABASE_HOST',
  'DATABASE_PORT',
  'DATABASE_NAME',
  'DATABASE_USER',
  'DATABASE_PASS'
]);

const parseDevelopmentDatabase = (contents) => {
  const config = {};
  let inDevelopmentBlock = false;

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*#\s?/, '');

    if (/^DATABASE_HOST=.*development/i.test(line)) {
      inDevelopmentBlock = true;
    }

    if (!inDevelopmentBlock) continue;

    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match && databaseKeys.has(match[1])) {
      config[match[1]] = match[2];
    }

    if (Object.keys(config).length === databaseKeys.size) break;
  }

  const missing = [...databaseKeys].filter((key) => config[key] === undefined);
  if (missing.length) {
    throw new Error(`Missing development database settings: ${missing.join(', ')}`);
  }

  return config;
};

const sqlValue = (value) => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return mysql.escape(String(value));
};

const rowsToValues = (rows, columns) => rows
  .map((row) => `  (${columns.map((column) => sqlValue(row[column])).join(', ')})`)
  .join(',\n');

const idList = (rows, key) => rows.map((row) => Number(row[key])).join(', ');

const addRequiredPermissionExtensions = (permissions, rolePermissions) => {
  const analyticsModule = 'admin_quotes_quote_analytics';
  const actions = ['view', 'create', 'edit', 'delete'];
  const permissionKeys = new Set(permissions.map((permission) => permission.permission_key));
  const rolePermissionKeys = new Set(
    rolePermissions.map((permission) => `${permission.role_id}:${permission.permission_key}`)
  );

  actions.forEach((action) => {
    const permissionKey = `${analyticsModule}.${action}`;

    if (!permissionKeys.has(permissionKey)) {
      permissions.push({
        permission_id: null,
        role_key: 'admin',
        module_key: analyticsModule,
        action_key: action,
        permission_key: permissionKey,
        is_active: 1
      });
      permissionKeys.add(permissionKey);
    }

    rolePermissions
      .filter((permission) => permission.permission_key === `admin_quotes.${action}`)
      .forEach((parentPermission) => {
        const pairKey = `${parentPermission.role_id}:${permissionKey}`;
        if (rolePermissionKeys.has(pairKey)) return;

        rolePermissions.push({
          role_id: parentPermission.role_id,
          permission_key: permissionKey,
          is_active: parentPermission.is_active
        });
        rolePermissionKeys.add(pairKey);
      });
  });
};

const buildSql = ({ roles, permissions, rolePermissions, superAdmin }) => `-- Generated from the development database.
-- Scope: role definitions, permission definitions, and effective role-permission mappings.
-- Per-user assignments (user_roles and user_permissions) are intentionally excluded.
-- Permission definitions are matched by permission_key, not development IDs.
-- One local-only super-admin login is upserted by email without copying any user ID.
-- Development contained duplicate role_permissions history; this export keeps one
-- effective row per role/permission-key pair using MAX(is_active).

SET NAMES utf8mb4;
SET @previous_sql_safe_updates = @@SQL_SAFE_UPDATES;
SET SQL_SAFE_UPDATES = 0;
START TRANSACTION;

INSERT INTO user_type
  (user_type_id, user_role, description, is_internal_member, is_active, created_at, updated_at)
VALUES
${rowsToValues(roles, [
  'user_type_id',
  'user_role',
  'description',
  'is_internal_member',
  'is_active',
  'created_at',
  'updated_at'
])}
ON DUPLICATE KEY UPDATE
  user_role = VALUES(user_role),
  description = VALUES(description),
  is_internal_member = VALUES(is_internal_member),
  is_active = VALUES(is_active),
  created_at = VALUES(created_at),
  updated_at = VALUES(updated_at);

INSERT INTO permissions
  (role_key, module_key, action_key, permission_key, is_active)
VALUES
${rowsToValues(permissions, [
  'role_key',
  'module_key',
  'action_key',
  'permission_key',
  'is_active'
])}
ON DUPLICATE KEY UPDATE
  role_key = VALUES(role_key),
  module_key = VALUES(module_key),
  action_key = VALUES(action_key),
  permission_key = VALUES(permission_key),
  is_active = VALUES(is_active);

-- Rebuild mappings to remove local drift and avoid importing development duplicates.
DELETE FROM role_permissions;

DROP TEMPORARY TABLE IF EXISTS sync_role_permission_keys;
CREATE TEMPORARY TABLE sync_role_permission_keys (
  role_id INT NOT NULL,
  permission_key VARCHAR(150) NOT NULL,
  is_active TINYINT(1) NOT NULL,
  PRIMARY KEY (role_id, permission_key)
);

INSERT INTO sync_role_permission_keys (role_id, permission_key, is_active)
VALUES
${rowsToValues(rolePermissions, ['role_id', 'permission_key', 'is_active'])};

INSERT INTO role_permissions (role_id, permission_id, is_active)
SELECT source.role_id, permission.permission_id, source.is_active
FROM sync_role_permission_keys source
JOIN permissions permission
  ON permission.permission_key = source.permission_key;

DROP TEMPORARY TABLE sync_role_permission_keys;

-- This account receives a new local auto-increment ID if it does not already exist.
-- It uses a known local-only password and never copies a development user ID.
INSERT INTO users
  (name, email, password_hash, auth_provider, email_verified, is_active, user_type, role)
VALUES
${rowsToValues([superAdmin], [
  'name',
  'email',
  'password_hash',
  'auth_provider',
  'email_verified',
  'is_active',
  'user_type',
  'role'
])}
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  password_hash = VALUES(password_hash),
  auth_provider = VALUES(auth_provider),
  email_verified = VALUES(email_verified),
  is_active = VALUES(is_active),
  user_type = VALUES(user_type),
  role = VALUES(role),
  permissions_version = permissions_version + 1;

-- Remove definitions that do not exist in development. These deletes intentionally
-- fail and roll back if a stale definition is still referenced by a local FK row.
DELETE FROM permissions
WHERE permission_key NOT IN (${permissions.map((row) => sqlValue(row.permission_key)).join(', ')});

DELETE FROM user_type
WHERE user_type_id NOT IN (${idList(roles, 'user_type_id')});

COMMIT;
SET SQL_SAFE_UPDATES = @previous_sql_safe_updates;

-- Expected results: ${roles.length} roles, ${permissions.length} permissions,
-- ${rolePermissions.length} effective mappings.
SELECT 'user_type' AS table_name, COUNT(*) AS row_count FROM user_type
UNION ALL
SELECT 'permissions', COUNT(*) FROM permissions
UNION ALL
SELECT 'role_permissions', COUNT(*) FROM role_permissions;
`;

const run = async () => {
  const config = parseDevelopmentDatabase(fs.readFileSync(envPath, 'utf8'));
  const connection = await mysql.createConnection({
    host: config.DATABASE_HOST,
    port: Number(config.DATABASE_PORT),
    database: config.DATABASE_NAME,
    user: config.DATABASE_USER,
    password: config.DATABASE_PASS,
    connectTimeout: 15000
  });

  try {
    await connection.query('SET SESSION TRANSACTION READ ONLY');
    await connection.query('START TRANSACTION READ ONLY');

    const [roles] = await connection.query(`
      SELECT
        user_type_id,
        user_role,
        description,
        is_internal_member,
        is_active,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
        DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
      FROM user_type
      ORDER BY user_type_id
    `);
    const [permissions] = await connection.query(`
      SELECT permission_id, role_key, module_key, action_key, permission_key, is_active
      FROM permissions
      ORDER BY permission_id
    `);
    const [rolePermissions] = await connection.query(`
      SELECT
        role_permission.role_id,
        permission.permission_key,
        MAX(role_permission.is_active) AS is_active
      FROM role_permissions role_permission
      JOIN permissions permission
        ON permission.permission_id = role_permission.permission_id
      GROUP BY role_permission.role_id, permission.permission_key
      ORDER BY role_permission.role_id, permission.permission_key
    `);

    addRequiredPermissionExtensions(permissions, rolePermissions);

    await connection.rollback();

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, buildSql({
      roles,
      permissions,
      rolePermissions,
      superAdmin: localSuperAdmin
    }), 'utf8');

    console.log(`Created ${path.relative(projectRoot, outputPath)}`);
    console.log(`Roles: ${roles.length}`);
    console.log(`Permissions: ${permissions.length}`);
    console.log(`Effective role-permission mappings: ${rolePermissions.length}`);
    console.log(`Local super-admin login: ${localSuperAdmin.email}`);
  } finally {
    await connection.end();
  }
};

run().catch((error) => {
  console.error(`Export failed: ${error.code || error.message}`);
  process.exitCode = 1;
});
