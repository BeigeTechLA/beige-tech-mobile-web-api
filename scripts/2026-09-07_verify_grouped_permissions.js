require('dotenv').config();

const mysql = require('mysql2/promise');

const REQUIRED_MODULES = [
  'admin_finances_transactions',
  'admin_finances_disputes',
  'admin_finances_beige_credit_points',
  'admin_finances_cp_compensation',
  'admin_sales_representative_dashboard',
  'admin_sales_representative_shift_management',
  'admin_users_all_users',
  'admin_users_clients',
  'admin_users_creative_partners',
  'admin_quotes_all_quotes',
  'admin_quotes_quote_approvals',
  'admin_quotes_master_pricing',
];

(async () => {
  const connection = await mysql.createConnection({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT || 3306),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASS,
    database: process.env.DATABASE_NAME,
  });

  const [rows] = await connection.query(
    `SELECT module_key, action_key, permission_key, is_active
       FROM permissions
      WHERE module_key IN (?)
      ORDER BY module_key, action_key`,
    [REQUIRED_MODULES],
  );

  const activeKeys = new Set(
    rows
      .filter((row) => Number(row.is_active) === 1)
      .map((row) => `${row.module_key}.${row.action_key}`),
  );
  const missing = REQUIRED_MODULES.flatMap((moduleKey) =>
    ['view', 'create', 'edit', 'delete']
      .map((action) => `${moduleKey}.${action}`)
      .filter((key) => !activeKeys.has(key)),
  );

  console.log(JSON.stringify({ requiredModules: REQUIRED_MODULES, rows, missing }, null, 2));
  await connection.end();

  if (missing.length) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
