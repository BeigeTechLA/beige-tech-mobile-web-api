const ExcelJS = require('exceljs');
const quoteService = require('./sales-quote.service');

const CURRENCY_FORMAT = '$#,##0.00';

const CATEGORY_ORDER = [
  { key: 'service', label: 'Services' },
  { key: 'addon', label: 'Add-ons' },
  { key: 'logistics', label: 'Logistics' }
];

const COLUMNS = [
  { header: 'Category', key: 'category', width: 18 },
  { header: 'Item Name', key: 'itemName', width: 32 },
  { header: 'Tag', key: 'tag', width: 14 },
  { header: 'Unit', key: 'unit', width: 18 },
  { header: 'Price', key: 'price', width: 14 }
];

function toNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function getTag(item = {}) {
  if (item.tag) return item.tag;
  if (item.source === 'figma_default') return 'Default';
  return Number(item.is_system_default) === 1 || item.is_system_default === true ? 'Default' : 'Custom';
}

function getUnit(item = {}) {
  return item.effective_rate_unit || item.rate_unit || item.effective_rate_type || item.rate_type || '';
}

function normalizeCatalogItems(catalog = {}) {
  return CATEGORY_ORDER.flatMap((category) => {
    const items = Array.isArray(catalog[category.key]) ? catalog[category.key] : [];

    return items.map((item) => ({
      category: category.label,
      sectionType: category.key,
      itemName: item.name || '',
      tag: getTag(item),
      unit: getUnit(item),
      price: toNumber(item.effective_rate ?? item.default_rate ?? 0)
    }));
  });
}

function calculateAverage(rows, sectionType) {
  const categoryRows = rows.filter((row) => row.sectionType === sectionType);
  if (!categoryRows.length) return 0;

  const total = categoryRows.reduce((sum, row) => sum + row.price, 0);
  return Number((total / categoryRows.length).toFixed(2));
}

async function fetchMasterPricingForExport() {
  const catalog = await quoteService.getCatalog();
  return normalizeCatalogItems(catalog);
}

async function generateMasterPricingExcel(rows) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Master Pricing');

  worksheet.columns = COLUMNS;
  worksheet.getRow(1).font = { bold: true };

  CATEGORY_ORDER.forEach((category) => {
    rows
      .filter((row) => row.sectionType === category.key)
      .forEach((row) => {
        worksheet.addRow({
          category: row.category,
          itemName: row.itemName,
          tag: row.tag,
          unit: row.unit,
          price: row.price
        });
      });
  });

  worksheet.getColumn('price').numFmt = CURRENCY_FORMAT;

  const summaryStartRow = worksheet.rowCount + 2;
  worksheet.getCell(summaryStartRow, 1).value = 'Summary';
  worksheet.getCell(summaryStartRow, 1).font = { bold: true };

  worksheet.getCell(summaryStartRow + 1, 1).value = 'Total Items';
  worksheet.getCell(summaryStartRow + 1, 2).value = rows.length;

  CATEGORY_ORDER.forEach((category, index) => {
    const rowNumber = summaryStartRow + 2 + index;
    worksheet.getCell(rowNumber, 1).value = `Average ${category.label} Price`;
    worksheet.getCell(rowNumber, 2).value = calculateAverage(rows, category.key);
    worksheet.getCell(rowNumber, 2).numFmt = CURRENCY_FORMAT;
  });

  return workbook.xlsx.writeBuffer();
}

function getMasterPricingExportFilename(date = new Date()) {
  const datePart = date.toISOString().slice(0, 10);
  return `master-pricing-${datePart}.xlsx`;
}

module.exports = {
  fetchMasterPricingForExport,
  generateMasterPricingExcel,
  getMasterPricingExportFilename
};
