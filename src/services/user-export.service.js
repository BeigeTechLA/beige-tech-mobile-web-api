const ExcelJS = require('exceljs');
const db = require('../models');

const { Op } = db.Sequelize;

const ALL_USERS_COLUMNS = [
  { header: 'Name', key: 'name', value: (user) => user.name || '' },
  { header: 'Email', key: 'email', value: (user) => user.email || '' },
  { header: 'Role', key: 'role', value: (user) => user.userType?.user_role || user.role || '' },
  { header: 'Created Date', key: 'createdDate', value: (user) => formatExportDate(user.created_at || user.createdAt) },
  { header: 'Updated Date', key: 'updatedDate', value: (user) => formatExportDate(user.updated_at || user.updatedAt) },
  { header: 'Status', key: 'status', value: (user) => formatUserStatus(user.is_active ?? user.status) }
];

const ROLE_USERS_COLUMNS = [
  { header: 'Name', key: 'name', value: (user) => user.name || '' },
  { header: 'Email', key: 'email', value: (user) => user.email || '' },
  { header: 'Status', key: 'status', value: (user) => formatUserStatus(user.is_active ?? user.status) },
  { header: 'Created Date', key: 'createdDate', value: (user) => formatExportDate(user.created_at || user.createdAt) }
];

const formatExportDate = (value) => {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(date).replace(' ', ', ');
};

const formatUserStatus = (value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'active' || normalized === '1' || normalized === 'true') return 'Active';
    if (normalized === 'inactive' || normalized === 'in-active' || normalized === '0' || normalized === 'false') return 'Inactive';
  }

  return Number(value) === 1 || value === true ? 'Active' : 'Inactive';
};

const normalizeRoleName = (value) => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

const sanitizeFilenamePart = (value) => (
  String(value || 'role')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    || 'role'
);

const buildUserExportWhere = (query = {}) => {
  const {
    search = '',
    status = '',
    role_id = '',
    role = '',
    month = '',
    year = ''
  } = query;

  const where = {};

  if (status !== '') {
    const normalizedStatus = String(status).trim().toLowerCase();
    if (['active', '1', 'true'].includes(normalizedStatus)) {
      where.is_active = 1;
    } else if (['inactive', 'in-active', '0', 'false'].includes(normalizedStatus)) {
      where.is_active = 0;
    }
  }

  if (search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { email: { [Op.like]: `%${search}%` } }
    ];
  }

  if (month) {
    const selectedYear = Number(year) || new Date().getFullYear();
    const selectedMonth = Number(month);

    if (Number.isInteger(selectedMonth) && selectedMonth >= 1 && selectedMonth <= 12) {
      where.created_at = {
        [Op.gte]: new Date(selectedYear, selectedMonth - 1, 1),
        [Op.lt]: new Date(selectedYear, selectedMonth, 1)
      };
    }
  }

  if (role_id) {
    where.user_type = role_id;
  } else if (!role) {
    where.user_type = {
      [Op.notIn]: [2, 3]
    };
  }

  return where;
};

const getSortOptions = (query = {}) => {
  const validSortFields = ['id', 'name', 'created_at', 'updated_at'];
  const sortField = validSortFields.includes(query.sort_by) ? query.sort_by : 'id';
  const sortOrder = String(query.order || '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  return [[sortField, sortOrder]];
};

const findRoleByIdentifier = async (roleIdentifier) => {
  const roleId = Number(roleIdentifier);

  if (Number.isInteger(roleId) && roleId > 0) {
    return db.user_type.findOne({
      where: {
        user_type_id: roleId,
        is_active: 1
      }
    });
  }

  const roles = await db.user_type.findAll({
    where: { is_active: 1 }
  });

  return roles.find((role) => normalizeRoleName(role.user_role) === normalizeRoleName(roleIdentifier)) || null;
};

const fetchUsersForExport = async (query = {}) => {
  const where = buildUserExportWhere(query);

  if (query.role && !query.role_id) {
    const role = await findRoleByIdentifier(query.role);
    if (!role) return [];
    where.user_type = role.user_type_id;
  }

  return db.users.scope('all').findAll({
    where,
    attributes: ['id', 'name', 'email', 'user_type', 'role', 'created_at', 'updated_at', 'is_active'],
    include: [
      {
        model: db.user_type,
        as: 'userType',
        attributes: ['user_type_id', 'user_role'],
        required: false
      }
    ],
    order: getSortOptions(query)
  });
};

const fetchRoleUsersForExport = async (roleIdentifier, query = {}) => {
  const role = await findRoleByIdentifier(roleIdentifier);

  if (!role) {
    return { role: null, users: [] };
  }

  const where = buildUserExportWhere({
    ...query,
    role_id: role.user_type_id,
    role: ''
  });

  const users = await db.users.scope('all').findAll({
    where,
    attributes: ['id', 'name', 'email', 'user_type', 'role', 'created_at', 'updated_at', 'is_active'],
    include: [
      {
        model: db.user_type,
        as: 'userType',
        attributes: ['user_type_id', 'user_role'],
        required: false
      }
    ],
    order: getSortOptions(query)
  });

  return { role, users };
};

const generateUserExcel = async (users, columns) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Users');

  worksheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width || Math.max(column.header.length + 4, 16)
  }));

  worksheet.getRow(1).font = { bold: true };

  users.forEach((user) => {
    worksheet.addRow(
      columns.reduce((row, column) => {
        row[column.key] = column.value(user);
        return row;
      }, {})
    );
  });

  return workbook.xlsx.writeBuffer();
};

module.exports = {
  ALL_USERS_COLUMNS,
  ROLE_USERS_COLUMNS,
  buildUserExportWhere,
  fetchRoleUsersForExport,
  fetchUsersForExport,
  formatExportDate,
  formatUserStatus,
  generateUserExcel,
  sanitizeFilenamePart
};
