const ExcelJS = require('exceljs');
const { Op } = require('sequelize');
const db = require('../models');
const salesLeadsController = require('../controllers/sales-leads.controller');

const HEADER_ROW_NUMBER = 3;
const HEADER_FILL = 'FF2F5496';
const HEADER_FONT = 'FFFFFFFF';
const DATE_PRESETS = new Set(['last_7_days', 'last_15_days', 'last_1_month', 'last_2_months', 'custom']);

function normalizeCellValue(value) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return value;
}

function flattenObject(value, prefix = '', output = {}) {
  if (value === null || value === undefined || value instanceof Date || typeof value !== 'object') {
    output[prefix] = value;
    return output;
  }

  if (Array.isArray(value)) {
    output[prefix] = value;
    return output;
  }

  Object.keys(value).forEach((key) => {
    const path = prefix ? `${prefix}.${key}` : key;
    flattenObject(value[key], path, output);
  });

  if (prefix && Object.keys(value).length === 0) {
    output[prefix] = value;
  }

  return output;
}

function styleWorksheet(worksheet) {
  worksheet.views = [{ state: 'frozen', ySplit: HEADER_ROW_NUMBER }];

  const titleRow = worksheet.getRow(1);
  titleRow.font = { bold: true, size: 14, color: { argb: 'FF000000' } };
  titleRow.eachCell((cell) => {
    cell.font = { bold: true, size: 14, color: { argb: 'FF000000' } };
  });

  const subtitleRow = worksheet.getRow(2);
  subtitleRow.font = { italic: true, color: { argb: 'FF666666' } };

  const headerRow = worksheet.getRow(HEADER_ROW_NUMBER);
  headerRow.font = { bold: true, color: { argb: HEADER_FONT } };
  headerRow.height = undefined;
  headerRow.alignment = { horizontal: 'left', vertical: 'middle', wrapText: false };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: HEADER_FILL }
    };
    cell.font = { bold: true, color: { argb: HEADER_FONT } };
    cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: false };
  });
  headerRow.border = {
    top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } }
  };

  worksheet.columns.forEach((column) => {
    let maxLength = 12;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const value = cell.value instanceof Date ? cell.value.toISOString() : cell.value;
      maxLength = Math.max(maxLength, String(value || '').length);
    });
    column.width = Math.min(Math.max(maxLength + 2, 14), 48);
  });
}

function parseDateOnly(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
    throw new Error(`${label} must be in YYYY-MM-DD format`);
  }

  const [year, month, day] = String(value).split('-').map(Number);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error(`${label} must be a valid date`);
  }

  return date;
}

function formatDateOnly(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function atStartOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function atEndOfDay(date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function resolveDateRange(filters = {}) {
  const hasBody = filters && Object.keys(filters).length > 0;
  const preset = filters?.preset ?? null;

  if (!hasBody || (preset === null && !filters.start_date && !filters.end_date)) {
    return {
      where: {},
      label: 'All time',
      startDate: null,
      endDate: null
    };
  }

  if (preset && !DATE_PRESETS.has(preset)) {
    throw new Error('preset must be one of last_7_days, last_15_days, last_1_month, last_2_months, custom, or null');
  }

  const today = atStartOfDay(new Date());
  let startDate;
  let endDate;

  if (preset === 'last_7_days') {
    startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 7);
    endDate = today;
  } else if (preset === 'last_15_days') {
    startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 15);
    endDate = today;
  } else if (preset === 'last_1_month') {
    startDate = new Date(today);
    startDate.setMonth(startDate.getMonth() - 1);
    endDate = today;
  } else if (preset === 'last_2_months') {
    startDate = new Date(today);
    startDate.setMonth(startDate.getMonth() - 2);
    endDate = today;
  } else {
    startDate = parseDateOnly(filters.start_date, 'start_date');
    endDate = parseDateOnly(filters.end_date, 'end_date');
  }

  const rangeStart = atStartOfDay(startDate);
  const rangeEnd = atEndOfDay(endDate);

  if (rangeStart > rangeEnd) {
    throw new Error('start_date must be before or equal to end_date');
  }

  return {
    where: {
      created_at: {
        [Op.between]: [rangeStart, rangeEnd]
      }
    },
    label: `${formatDateOnly(rangeStart)} to ${formatDateOnly(rangeEnd)}`,
    startDate: rangeStart,
    endDate: rangeEnd
  };
}

async function fetchActiveSalesLeadIds(dateRange = null) {
  const leads = await db.sales_leads.findAll({
    attributes: ['lead_id'],
    where: {
      is_active: 1,
      ...(dateRange?.where || {})
    },
    order: [['lead_id', 'ASC']]
  });

  return leads.map((lead) => lead.lead_id);
}

async function fetchLeadByIdPayload(leadId) {
  return new Promise((resolve, reject) => {
    const req = { params: { id: leadId } };
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        if (this.statusCode >= 400 || payload?.success === false) {
          reject(new Error(payload?.message || `getLeadById failed for lead ${leadId}`));
          return;
        }

        resolve(payload?.data || {});
      }
    };

    Promise.resolve(salesLeadsController.getLeadById(req, res)).catch(reject);
  });
}

async function fetchLeadsForReport(dateRange = null) {
  const leadIds = await fetchActiveSalesLeadIds(dateRange);
  const leads = [];

  for (const leadId of leadIds) {
    leads.push(await fetchLeadByIdPayload(leadId));
  }

  return leads;
}

async function fetchColumnsForReport() {
  const leads = await fetchLeadsForReport();
  return getColumnsFromLeads(leads);
}

function getColumnsFromLeads(leads) {
  const columns = [];
  const seen = new Set();

  leads.forEach((lead) => {
    Object.keys(flattenObject(lead)).forEach((key) => {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    });
  });

  return columns.filter((column) => {
    return !columns.some((otherColumn) => otherColumn !== column && otherColumn.startsWith(`${column}.`));
  });
}

async function buildLeadsReportWorkbook(filters = {}) {
  const dateRange = resolveDateRange(filters);
  const leads = await fetchLeadsForReport(dateRange);
  const flattenedLeads = leads.map((lead) => flattenObject(lead));
  const columns = dateRange.startDate ? await fetchColumnsForReport() : getColumnsFromLeads(leads);
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Leads Data');

  workbook.creator = 'Revure V2 Backend API';
  workbook.created = new Date();

  worksheet.addRow(['Sales Representative Leads Report']);
  worksheet.addRow([`Total leads analyzed: ${leads.length} | Date range: ${dateRange.label}`]);
  worksheet.addRow(columns);

  flattenedLeads.forEach((lead) => {
    worksheet.addRow(columns.map((column) => normalizeCellValue(lead[column])));
  });

  styleWorksheet(worksheet);

  return {
    workbook,
    columns,
    totalLeads: leads.length,
    dateRange
  };
}

module.exports = {
  buildLeadsReportWorkbook,
  fetchActiveSalesLeadIds,
  fetchLeadsForReport,
  fetchLeadByIdPayload,
  fetchColumnsForReport,
  flattenObject,
  getColumnsFromLeads,
  resolveDateRange
};
