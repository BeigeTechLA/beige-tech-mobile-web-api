const ExcelJS = require('exceljs');
const moment = require('moment');
const { Op, Sequelize } = require('sequelize');
const { crew_members, crew_member_files, crew_roles } = require('../models');
const onboardingCtrl = require('../utils/creatorOnboarding');
const { parseLocation } = require('../utils/locationHelpers');

const CURRENCY_PERCENT_FORMAT = '0%';

const EXPORT_COLUMNS = [
  { header: 'User ID', key: 'userId', width: 14 },
  { header: 'Name', key: 'name', width: 28 },
  { header: 'Email', key: 'email', width: 32 },
  { header: 'Location', key: 'location', width: 36 },
  { header: 'Completion %', key: 'completionPercent', width: 16 },
  { header: 'Pending Fields', key: 'pendingFields', width: 48 },
  { header: 'Date Joined', key: 'dateJoined', width: 18 }
];

function buildBaseConditions(query = {}) {
  const {
    onboarding_status,
    search = '',
    location = '',
    range = '',
    start_date,
    end_date
  } = query;
  const isIncompleteOnboarding = onboarding_status === 'incomplete';

  const conditions = {
    is_active: 1,
    is_crew_verified: 0,
    is_registration_complete: isIncompleteOnboarding ? 0 : 1
  };

  if (search) {
    conditions[Op.or] = [
      { first_name: { [Op.like]: `%${search}%` } },
      { last_name: { [Op.like]: `%${search}%` } },
      { email: { [Op.like]: `%${search}%` } },
      { phone_number: { [Op.like]: `%${search}%` } },
      { crew_member_id: { [Op.like]: `%${search}%` } },
      Sequelize.where(
        Sequelize.fn('concat', Sequelize.col('first_name'), ' ', Sequelize.col('last_name')),
        { [Op.like]: `%${search}%` }
      )
    ];
  }

  if (location) {
    conditions.location = { [Op.like]: `%${location}%` };
  }

  if (start_date && end_date) {
    conditions.created_at = {
      [Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`]
    };
  } else if (range === 'month') {
    conditions[Op.and] = [
      Sequelize.where(
        Sequelize.fn('MONTH', Sequelize.col('crew_members.created_at')),
        Sequelize.fn('MONTH', Sequelize.fn('CURDATE'))
      ),
      Sequelize.where(
        Sequelize.fn('YEAR', Sequelize.col('crew_members.created_at')),
        Sequelize.fn('YEAR', Sequelize.fn('CURDATE'))
      )
    ];
  }

  return conditions;
}

function normalizeLocation(location) {
  const parsed = parseLocation(location);
  return parsed?.address || (typeof location === 'string' ? location : '');
}

function normalizeMember(memberRecord) {
  return normalizeMemberWithRoles(memberRecord, []);
}

function normalizeMemberWithRoles(memberRecord, allRoles = []) {
  const member = typeof memberRecord.toJSON === 'function'
    ? memberRecord.toJSON()
    : memberRecord;
  const onboardingSummary = onboardingCtrl.buildCreatorOnboardingSummary(member);
  const name = [member.first_name, member.last_name].filter(Boolean).join(' ').trim();
  let roleNames = [];

  try {
    const roleIds = JSON.parse(member.primary_role || '[]');
    roleNames = allRoles
      .filter((role) => roleIds.includes(String(role.role_id)) || roleIds.includes(Number(role.role_id)))
      .map((role) => role.role_name);
  } catch (error) {
    roleNames = [];
  }

  return {
    ...member,
    name,
    location: normalizeLocation(member.location),
    status: 'pending',
    onboarding_status: onboardingSummary,
    onboarding_progress_percent: onboardingSummary.progress_percent,
    onboarding_completed_count: onboardingSummary.completed_count,
    onboarding_total_required: onboardingSummary.total_required,
    onboarding_missing_count: onboardingSummary.missing_count,
    onboarding_missing_fields: onboardingSummary.missing_fields,
    role: roleNames.length > 0 ? { role_name: roleNames.join(', ') } : null
  };
}

async function getDetailsPendingCreativePartners(query = {}, options = {}) {
  const { paginate = true } = options;
  const currentPage = Math.max(parseInt(query.page, 10) || 1, 1);
  const pageSize = Math.max(parseInt(query.limit, 10) || 20, 1);
  const offset = (currentPage - 1) * pageSize;

  const [members, allRoles] = await Promise.all([
    crew_members.findAll({
      where: buildBaseConditions(query),
      attributes: [
        'crew_member_id',
        'user_id',
        'first_name',
        'last_name',
        'email',
        'phone_number',
        'location',
        'working_distance',
        'primary_role',
        'years_of_experience',
        'hourly_rate',
        'skills',
        'equipment_ownership',
        'social_media_links',
        'is_beige_member',
        'is_available',
        'rating',
        'is_draft',
        'is_active',
        'created_at',
        'updated_at',
        'is_crew_verified',
        'is_registration_complete',
        'created_from'
      ],
      include: [
        {
          model: crew_member_files,
          as: 'crew_member_files',
          attributes: ['crew_files_id', 'file_type', 'file_path', 'title', 'tag', 'is_active'],
          where: { is_active: 1 },
          required: false
        }
      ],
      order: [['created_at', 'DESC']]
    }),
    crew_roles.findAll({ attributes: ['role_id', 'role_name'], raw: true })
  ]);

  const processedMembers = members
    .map((member) => normalizeMemberWithRoles(member, allRoles))
    .filter((member) => (
      query.onboarding_status === 'incomplete'
        ? Number(member.onboarding_missing_count || 0) > 0 && Number(member.is_registration_complete || 0) !== 1
        : true
    ));

  return {
    total: processedMembers.length,
    page: currentPage,
    limit: pageSize,
    rows: paginate ? processedMembers.slice(offset, offset + pageSize) : processedMembers
  };
}

function formatExportDate(value) {
  if (!value) return '';

  const parsed = moment(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : '';
}

function toExportRows(members = []) {
  return members.map((member) => ({
    userId: member.user_id || member.crew_member_id || '',
    name: member.name || [member.first_name, member.last_name].filter(Boolean).join(' ').trim(),
    email: member.email || '',
    location: member.location || '',
    completionPercent: Number(member.onboarding_progress_percent || 0) / 100,
    pendingFields: Array.isArray(member.onboarding_missing_fields)
      ? member.onboarding_missing_fields.join(', ')
      : '',
    dateJoined: formatExportDate(member.created_at)
  }));
}

function calculateAverageCompletion(rows = []) {
  if (!rows.length) return 0;

  const total = rows.reduce((sum, row) => sum + Number(row.completionPercent || 0), 0);
  return Number((total / rows.length).toFixed(4));
}

async function generateDetailsPendingCreativePartnersExcel(members = []) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Details Pending CPs');
  const rows = toExportRows(members);

  worksheet.columns = EXPORT_COLUMNS;
  worksheet.getRow(1).font = { bold: true };

  rows.forEach((row) => worksheet.addRow(row));
  worksheet.getColumn('completionPercent').numFmt = CURRENCY_PERCENT_FORMAT;

  const summaryStartRow = worksheet.rowCount + 2;
  worksheet.getCell(summaryStartRow, 1).value = 'Summary';
  worksheet.getCell(summaryStartRow, 1).font = { bold: true };

  worksheet.getCell(summaryStartRow + 1, 1).value = 'Total pending CPs';
  worksheet.getCell(summaryStartRow + 1, 2).value = rows.length;
  worksheet.getCell(summaryStartRow + 2, 1).value = 'Average completion %';
  worksheet.getCell(summaryStartRow + 2, 2).value = calculateAverageCompletion(rows);
  worksheet.getCell(summaryStartRow + 2, 2).numFmt = CURRENCY_PERCENT_FORMAT;

  return workbook.xlsx.writeBuffer();
}

function getDetailsPendingCreativePartnersExportFilename(date = new Date()) {
  return `details-pending-cps-${date.toISOString().slice(0, 10)}.xlsx`;
}

module.exports = {
  getDetailsPendingCreativePartners,
  generateDetailsPendingCreativePartnersExcel,
  getDetailsPendingCreativePartnersExportFilename
};
