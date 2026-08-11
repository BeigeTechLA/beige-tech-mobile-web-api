const assert = require('node:assert/strict');
const test = require('node:test');
const ExcelJS = require('exceljs');

const modelsPath = require.resolve('../src/models');
const servicePath = require.resolve('../src/services/user-export.service');

function loadServiceWithMockDb(overrides = {}) {
  const calls = [];
  const mockDb = {
    Sequelize: {
      Op: {
        or: Symbol.for('or'),
        like: Symbol.for('like'),
        gte: Symbol.for('gte'),
        lt: Symbol.for('lt'),
        notIn: Symbol.for('notIn')
      }
    },
    users: {
      scope(scopeName) {
        calls.push({ method: 'scope', scopeName });
        return {
          async findAll(options) {
            calls.push({ method: 'users.findAll', options });
            return overrides.users || [];
          }
        };
      }
    },
    user_type: {
      async findAll(options) {
        calls.push({ method: 'user_type.findAll', options });
        return overrides.roles || [];
      },
      async findOne(options) {
        calls.push({ method: 'user_type.findOne', options });
        return overrides.role || null;
      }
    }
  };

  require.cache[modelsPath] = {
    id: modelsPath,
    filename: modelsPath,
    loaded: true,
    exports: mockDb
  };
  delete require.cache[servicePath];

  return {
    service: require(servicePath),
    calls
  };
}

test.afterEach(() => {
  delete require.cache[servicePath];
  delete require.cache[modelsPath];
});

test('generateUserExcel writes all-users columns and all rows', async () => {
  const { service } = loadServiceWithMockDb();
  const buffer = await service.generateUserExcel(
    [
      {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        userType: { user_role: 'Admin' },
        created_at: new Date('2026-01-15T00:00:00Z'),
        updated_at: new Date('2026-02-20T00:00:00Z'),
        is_active: 1
      },
      {
        name: 'Grace Hopper',
        email: 'grace@example.com',
        userType: { user_role: 'sales_rep' },
        created_at: new Date('2026-03-10T00:00:00Z'),
        updated_at: new Date('2026-04-11T00:00:00Z'),
        is_active: 0
      }
    ],
    service.ALL_USERS_COLUMNS
  );

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.getWorksheet('Users');

  assert.deepEqual(worksheet.getRow(1).values.slice(1), [
    'Name',
    'Email',
    'Role',
    'Created Date',
    'Updated Date',
    'Status'
  ]);
  assert.equal(worksheet.rowCount, 3);
  assert.deepEqual(worksheet.getRow(2).values.slice(1), [
    'Ada Lovelace',
    'ada@example.com',
    'Admin',
    '15, January 2026',
    '20, February 2026',
    'Active'
  ]);
  assert.equal(worksheet.getRow(3).getCell(6).value, 'Inactive');
});

test('generateUserExcel returns a valid headers-only workbook for empty role users', async () => {
  const { service } = loadServiceWithMockDb();
  const buffer = await service.generateUserExcel([], service.ROLE_USERS_COLUMNS);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.getWorksheet('Users');

  assert.equal(worksheet.rowCount, 1);
  assert.deepEqual(worksheet.getRow(1).values.slice(1), [
    'Name',
    'Email',
    'Status',
    'Created Date'
  ]);
});

test('fetchRoleUsersForExport filters by role and preserves total DB row count', async () => {
  const role = { user_type_id: 7, user_role: 'sales_rep' };
  const users = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const { service, calls } = loadServiceWithMockDb({ role, users });

  const result = await service.fetchRoleUsersForExport('7', { status: 'active' });
  const userFindCall = calls.find((call) => call.method === 'users.findAll');

  assert.equal(result.role, role);
  assert.equal(result.users.length, 3);
  assert.equal(userFindCall.options.where.user_type, 7);
  assert.equal(userFindCall.options.where.is_active, 1);
  assert.equal(userFindCall.options.limit, undefined);
  assert.equal(userFindCall.options.offset, undefined);
});

test('sanitizeFilenamePart creates the expected export filename stem', () => {
  const { service } = loadServiceWithMockDb();

  assert.equal(service.sanitizeFilenamePart('sales rep'), 'sales_rep');
  assert.equal(`${service.sanitizeFilenamePart('super_admin')}-users-export.xlsx`, 'super_admin-users-export.xlsx');
});
