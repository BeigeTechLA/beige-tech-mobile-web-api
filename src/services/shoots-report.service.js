const ExcelJS = require('exceljs');
const db = require('../models');

const CURRENCY_FORMAT = '"$"#,##0.00';
const LEGACY_ROLE_CATEGORY_BY_ID = new Map([
  [12, 'Audio Engineer'],
  [13, 'Lighting Technician']
]);

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value, fallback = '-') {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  return String(value);
}

function humanizeToken(value) {
  return normalizeText(value, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseJson(value, fallback = null) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function splitList(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function contentTypeLabel(value) {
  const labels = {
    videographer: 'Videography',
    videography: 'Videography',
    video: 'Videography',
    photographer: 'Photography',
    photographers: 'Photography',
    photography: 'Photography',
    photo: 'Photography',
    editor: 'Editing',
    editing: 'Editing',
    edit: 'Editing'
  };

  return labels[String(value || '').trim().toLowerCase()] || humanizeToken(value);
}

function roleNameToCategory(roleName) {
  const normalized = String(roleName || '').toLowerCase();
  if (normalized.includes('video')) {
    return normalized.includes('edit') ? 'Editing' : 'Videography';
  }
  if (normalized.includes('photo')) {
    return 'Photography';
  }
  if (normalized.includes('edit')) {
    return 'Editing';
  }
  return humanizeToken(roleName);
}

function addCategory(categories, value) {
  const normalized = normalizeText(value, '').trim();
  if (normalized) {
    categories.add(normalized);
  }
}

function categoriesFromCrewRoles(crewRoles, roleCategoryById) {
  const parsed = parseJson(crewRoles, null);
  const categories = new Set();

  if (Array.isArray(parsed)) {
    parsed.forEach((roleId) => {
      const normalizedRoleId = Number(roleId);
      addCategory(
        categories,
        roleCategoryById.get(normalizedRoleId)
          || LEGACY_ROLE_CATEGORY_BY_ID.get(normalizedRoleId)
          || (Number.isFinite(normalizedRoleId) ? `Role ${normalizedRoleId}` : null)
      );
    });
    return categories;
  }

  if (parsed && typeof parsed === 'object') {
    Object.keys(parsed).forEach((roleKey) => {
      addCategory(categories, contentTypeLabel(roleKey));
    });
    return categories;
  }

  splitList(crewRoles).forEach((role) => {
    addCategory(categories, roleCategoryById.get(Number(role)) || roleNameToCategory(role));
  });

  return categories;
}

function hasEditingSelected(booking) {
  const videoEditTypes = parseJson(booking.video_edit_types, []);
  const photoEditTypes = parseJson(booking.photo_edit_types, []);

  return Boolean(booking.edits_needed)
    || (Array.isArray(videoEditTypes) && videoEditTypes.length > 0)
    || (Array.isArray(photoEditTypes) && photoEditTypes.length > 0);
}

function formatShootCategories(booking, roleCategoryById) {
  const categories = new Set();

  splitList(booking.content_type).forEach((item) => {
    addCategory(categories, contentTypeLabel(item));
  });

  categoriesFromCrewRoles(booking.crew_roles, roleCategoryById).forEach((category) => {
    addCategory(categories, category);
  });

  if (hasEditingSelected(booking)) {
    addCategory(categories, 'Editing');
  }

  return Array.from(categories).join(', ') || '-';
}

function getShootAmount(booking) {
  return toNumber(
    booking.finance_breakdown?.total_amount,
    toNumber(booking.primary_quote?.total, toNumber(booking.budget))
  );
}

function styleWorksheet(worksheet, headerRowNumber, currencyColumns = []) {
  worksheet.views = [{ state: 'frozen', ySplit: headerRowNumber }];

  const titleRow = worksheet.getRow(1);
  titleRow.font = { bold: true, size: 14, color: { argb: 'FF000000' } };
  titleRow.eachCell((cell) => {
    cell.font = { bold: true, size: 14, color: { argb: 'FF000000' } };
  });

  const subtitleRow = worksheet.getRow(2);
  subtitleRow.font = { italic: true, color: { argb: 'FF666666' } };

  const headerRow = worksheet.getRow(headerRowNumber);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.height = undefined;
  headerRow.alignment = { horizontal: 'left', vertical: 'middle', wrapText: false };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2F5496' }
    };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: false };
  });
  headerRow.border = {
    top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } }
  };

  currencyColumns.forEach((columnNumber) => {
    worksheet.getColumn(columnNumber).numFmt = CURRENCY_FORMAT;
  });

  worksheet.columns.forEach((column) => {
    let maxLength = 12;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const value = cell.value instanceof Date ? cell.value.toISOString() : cell.value;
      maxLength = Math.max(maxLength, String(value || '').length);
    });
    column.width = Math.min(Math.max(maxLength + 2, 14), 48);
  });
}

async function fetchRoleCategoryById() {
  const roles = await db.crew_roles.findAll({
    attributes: ['role_id', 'role_name'],
    order: [['role_id', 'ASC']]
  });

  return new Map(
    roles.map((role) => [
      Number(role.role_id),
      roleNameToCategory(role.role_name)
    ])
  );
}

async function fetchShootsForReport() {
  return db.stream_project_booking.findAll({
    attributes: [
      'stream_project_booking_id',
      'project_name',
      'budget',
      'content_type',
      'shoot_type',
      'crew_roles',
      'edits_needed',
      'video_edit_types',
      'photo_edit_types'
    ],
    include: [
      {
        model: db.finance_project_breakdowns,
        as: 'finance_breakdown',
        required: false,
        attributes: ['total_amount', 'currency']
      },
      {
        model: db.quotes,
        as: 'primary_quote',
        required: false,
        attributes: ['quote_id', 'total']
      }
    ],
    where: {
      is_draft: 0
    },
    order: [['stream_project_booking_id', 'ASC']]
  });
}

async function buildShootsReportWorkbook() {
  const [shoots, roleCategoryById] = await Promise.all([
    fetchShootsForReport(),
    fetchRoleCategoryById()
  ]);
  const shootsWithAmount = shoots.filter((booking) => getShootAmount(booking) > 0);
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Shoots Data');

  workbook.creator = 'Revure V2 Backend API';
  workbook.created = new Date();

  worksheet.addRow(['Shoots Report']);
  worksheet.addRow([`Total shoots analyzed: ${shootsWithAmount.length}`]);
  worksheet.addRow(['Shoot ID', 'Project Name', 'Category', 'Amount']);

  shootsWithAmount.forEach((booking) => {
    worksheet.addRow([
      booking.stream_project_booking_id,
      normalizeText(booking.project_name),
      formatShootCategories(booking, roleCategoryById),
      getShootAmount(booking)
    ]);
  });

  styleWorksheet(worksheet, 3, [4]);

  return workbook;
}

module.exports = {
  buildShootsReportWorkbook,
  fetchShootsForReport,
  formatShootCategories,
  getShootAmount
};
