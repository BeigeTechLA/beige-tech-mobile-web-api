const ExcelJS = require('exceljs');
const db = require('../models');

const CURRENCY_FORMAT = '"₹"#,##0.00';
const PERCENT_FORMAT = '0.00%';

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getQuoteId(quote) {
  return quote.sales_quote_id;
}

function getLineItems(quote) {
  return Array.isArray(quote.line_items) ? quote.line_items : [];
}

function normalizeText(value, fallback = '-') {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  return String(value);
}

function itemTypeLabel(sectionType) {
  const labels = {
    service: 'Main',
    addon: 'Add-on',
    logistics: 'Logistics',
    custom: 'Custom'
  };
  return labels[sectionType] || 'Custom';
}

function isCustomLineItem(item) {
  return item.source_type === 'custom' || item.section_type === 'custom' || !item.catalog_item_id;
}

function isDiscountApplied(quote) {
  return quote.discount_type && quote.discount_type !== 'none' && toNumber(quote.discount_amount) > 0;
}

function discountDescription(quote) {
  if (!isDiscountApplied(quote)) {
    return 'None';
  }

  const amount = toNumber(quote.discount_amount);
  if (quote.discount_type === 'percentage') {
    return `${toNumber(quote.discount_value)}% discount (₹${amount.toFixed(2)})`;
  }
  if (quote.discount_type === 'fixed_amount') {
    return `Fixed amount discount (₹${amount.toFixed(2)})`;
  }
  return `${quote.discount_type} discount (₹${amount.toFixed(2)})`;
}

function getLineItemDedupeKey(item) {
  return [
    item.item_name,
    item.line_total,
    item.quantity
  ].join('|');
}

function dedupeLineItemsForMaster(items) {
  const seen = new Set();

  return items.filter((item) => {
    const key = getLineItemDedupeKey(item);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function sumLineItemsForMaster(items) {
  return dedupeLineItemsForMaster(items).reduce((sum, item) => {
    return sum + toNumber(item.line_total);
  }, 0);
}

function getCatalogPrice(item) {
  if (!hasActiveCatalogItem(item)) {
    return null;
  }

  if (item.catalog_item.default_rate === null || item.catalog_item.default_rate === undefined) {
    return null;
  }

  return toNumber(item.catalog_item.default_rate);
}

function hasActiveCatalogItem(item) {
  return Boolean(item.catalog_item) && Number(item.catalog_item.is_active) === 1;
}

function formatItemsForMaster(items) {
  const uniqueItems = dedupeLineItemsForMaster(items);

  if (!uniqueItems.length) {
    return '-';
  }

  return uniqueItems
    .map((item) => `${normalizeText(item.item_name)} (₹${toNumber(item.line_total).toFixed(2)})`)
    .join(', ');
}

function dedupeLineItemsByRecord(items) {
  const seen = new Set();

  return items.filter((item) => {
    const key = item.line_item_id
      ? `id:${item.line_item_id}`
      : [
          item.section_type,
          item.item_name,
          item.line_total,
          item.quantity,
          item.catalog_item_id,
          item.source_type,
          item.sort_order
        ].join('|');

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function formatSingleLineItemName(item) {
  return normalizeText(item.item_name);
}

function buildMasterBaseRow(quote) {
  return [
    getQuoteId(quote),
    quote.quote_number,
    quote.status,
    formatDateTimeForMaster(quote.created_at),
    locationText(quote),
    quote.valid_until || null
  ];
}

function buildMasterLineItemRow(quote, item, category) {
  const baseRow = buildMasterBaseRow(quote);
  const itemName = formatSingleLineItemName(item);
  const itemPrice = toNumber(item.line_total);
  const categoryColumns = {
    service: [itemName, itemPrice, '-', '-', '-', '-', '-', '-'],
    addon: ['-', '-', itemName, itemPrice, '-', '-', '-', '-'],
    logistics: ['-', '-', '-', '-', itemName, itemPrice, '-', '-'],
    custom: ['-', '-', '-', '-', '-', '-', itemName, itemPrice]
  };

  return [
    ...baseRow,
    ...categoryColumns[category],
    discountDescription(quote),
    toNumber(quote.subtotal),
    toNumber(quote.total)
  ];
}

function buildMasterEmptyQuoteRow(quote) {
  return [
    ...buildMasterBaseRow(quote),
    '-',
    '-',
    '-',
    '-',
    '-',
    '-',
    '-',
    '-',
    discountDescription(quote),
    toNumber(quote.subtotal),
    toNumber(quote.total)
  ];
}

function formatDateTimeForMaster(value) {
  if (!value) {
    return '-';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);
  const lookup = parts.reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  return `${lookup.year}-${lookup.month}-${lookup.day} ${lookup.hour}:${lookup.minute}:${lookup.second}`;
}

function styleMasterQuotesHeader(worksheet) {
  const headerRow = worksheet.getRow(3);
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
}

function locationText(quote) {
  if (quote.client_address) {
    return quote.client_address;
  }

  if (quote.location_latitude && quote.location_longitude) {
    return `${quote.location_latitude}, ${quote.location_longitude}`;
  }

  return '-';
}

function styleWorksheet(worksheet, headerRowNumber, currencyColumns = [], percentColumns = []) {
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
  percentColumns.forEach((columnNumber) => {
    worksheet.getColumn(columnNumber).numFmt = PERCENT_FORMAT;
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

function addReadMeSheet(workbook) {
  const worksheet = workbook.addWorksheet('Read Me First');
  worksheet.addRow(['Quotes Self-Serve Analysis']);
  worksheet.addRow([]);
  worksheet.addRow(['This workbook summarizes quote usage, add-ons, custom line items, discounts, and quote composition.']);
  worksheet.addRow(['Prepared from sales_quotes, sales_quotes_line_items, and sales_quotes_activity export']);
  worksheet.getCell('A1').font = { bold: true, size: 16 };
  worksheet.getColumn(1).width = 110;
}

function addServicesSheet(workbook, quotes) {
  const worksheet = workbook.addWorksheet('1. Services');
  const totalQuotes = quotes.length;
  const usage = new Map();

  quotes.forEach((quote) => {
    const seenInQuote = new Set();
    getLineItems(quote).forEach((item) => {
      if (!hasActiveCatalogItem(item)) {
        return;
      }

      const itemName = normalizeText(item.catalog_item.name);
      const key = `catalog:${item.catalog_item.catalog_item_id}`;
      if (!usage.has(key)) {
        usage.set(key, {
          itemName,
          itemType: itemTypeLabel(item.catalog_item.section_type),
          quoteIds: new Set(),
          totalTimesUsed: 0,
          catalogPrice: getCatalogPrice(item)
        });
      }
      const record = usage.get(key);
      record.totalTimesUsed += 1;
      if (record.catalogPrice === null) {
        record.catalogPrice = getCatalogPrice(item);
      }
      seenInQuote.add(key);
    });

    seenInQuote.forEach((key) => {
      usage.get(key).quoteIds.add(getQuoteId(quote));
    });
  });

  worksheet.addRow(['Services Created — Usage Across Quotes']);
  worksheet.addRow([`Total quotes analyzed: ${totalQuotes}`]);
  worksheet.addRow(['Item Name', 'Item Type (Main/Add-on/Logistics/Custom)', '# Quotes Using It', '% of Total Quotes', 'Total Times Used (incl. repeats)', 'Price']);

  Array.from(usage.values())
    .sort((a, b) => b.quoteIds.size - a.quoteIds.size || a.itemName.localeCompare(b.itemName))
    .forEach((record) => {
      worksheet.addRow([
        record.itemName,
        record.itemType,
        record.quoteIds.size,
        totalQuotes ? record.quoteIds.size / totalQuotes : 0,
        record.totalTimesUsed,
        record.catalogPrice === null ? '-' : record.catalogPrice
      ]);
    });

  styleWorksheet(worksheet, 3, [6], [4]);
}

function addAddOnsSheet(workbook, quotes) {
  const worksheet = workbook.addWorksheet('2. Add-ons');
  const quotesWithAddOns = quotes.filter((quote) => getLineItems(quote).some((item) => item.section_type === 'addon')).length;

  worksheet.addRow(['Add-on Usage — Per Quote']);
  worksheet.addRow([`Total quotes analyzed: ${quotes.length} | Quotes with at least one add-on: ${quotesWithAddOns}`]);
  worksheet.addRow(['Quote ID', 'Quote Number', 'Add-on Present (Yes/No)', 'Add-on Name', 'Add-on Price']);

  quotes.forEach((quote) => {
    const addOns = getLineItems(quote).filter((item) => item.section_type === 'addon');
    if (!addOns.length) {
      worksheet.addRow([getQuoteId(quote), quote.quote_number, 'No', '-', 0]);
      return;
    }

    addOns.forEach((item) => {
      worksheet.addRow([getQuoteId(quote), quote.quote_number, 'Yes', normalizeText(item.item_name), toNumber(item.line_total)]);
    });
  });

  styleWorksheet(worksheet, 3, [5]);
}

function addCustomLineItemsSheet(workbook, quotes) {
  const worksheet = workbook.addWorksheet('3. Custom Line Items');
  const quotesWithCustom = quotes.filter((quote) => getLineItems(quote).some(isCustomLineItem)).length;
  const percent = quotes.length ? (quotesWithCustom / quotes.length) * 100 : 0;

  worksheet.addRow(['Custom Line Items — True Sales-Rep-Typed Items (not from catalog)']);
  worksheet.addRow([`Quotes with custom line items: ${quotesWithCustom} out of ${quotes.length} total quotes (${percent.toFixed(2)}%)`]);
  worksheet.addRow(['Quote ID', 'Quote Number', 'Custom Item Present (Yes/No)', 'Custom Item Name', 'Custom Item Section', 'Price']);

  quotes.forEach((quote) => {
    const customItems = getLineItems(quote).filter(isCustomLineItem);
    if (!customItems.length) {
      worksheet.addRow([getQuoteId(quote), quote.quote_number, 'No', '-', '-', 0]);
      return;
    }

    customItems.forEach((item) => {
      worksheet.addRow([
        getQuoteId(quote),
        quote.quote_number,
        'Yes',
        normalizeText(item.item_name),
        normalizeText(item.section_type),
        toNumber(item.line_total)
      ]);
    });
  });

  styleWorksheet(worksheet, 3, [6]);
}

function addDiscountsSheet(workbook, quotes) {
  const worksheet = workbook.addWorksheet('4. Discounts');
  const quotesWithDiscount = quotes.filter(isDiscountApplied).length;
  const quotesWithoutDiscount = quotes.length - quotesWithDiscount;

  worksheet.addRow(['Discount Usage Across Quotes']);
  worksheet.addRow([`Quotes with discount: ${quotesWithDiscount} | Quotes without discount: ${quotesWithoutDiscount} | Total quotes: ${quotes.length}`]);
  worksheet.addRow([
    'Quote ID',
    'Quote Number',
    'Discount Applied (Yes/No)',
    'Discount Type',
    'Discount Amount',
    'Total Before Discount (Subtotal)',
    'Total After Discount'
  ]);

  quotes.forEach((quote) => {
    const hasDiscount = isDiscountApplied(quote);
    worksheet.addRow([
      getQuoteId(quote),
      quote.quote_number,
      hasDiscount ? 'Yes' : 'No',
      hasDiscount ? quote.discount_type : '-',
      hasDiscount ? toNumber(quote.discount_amount) : 0,
      toNumber(quote.subtotal, toNumber(quote.total)),
      toNumber(quote.total)
    ]);
  });

  styleWorksheet(worksheet, 3, [5, 6, 7]);
}

function addMasterQuotesSheet(workbook, quotes) {
  const worksheet = workbook.addWorksheet('5. Quotes Data');

  worksheet.addRow(['Master Quotes Data']);
  worksheet.addRow([`All ${quotes.length} quotes with full composition summary`]);
  worksheet.addRow([
    'Quote ID',
    'Quote Number',
    'Status',
    'Quote Date/Time (Created)',
    'Location',
    'Validity (Valid Until)',
    'Services',
    'Services Price',
    'Add-ons',
    'Add-ons Price',
    'Logistics',
    'Logistics Price',
    'Custom Items',
    'Custom Items Price',
    'Discount',
    'Subtotal',
    'Total'
  ]);

  quotes.forEach((quote) => {
    const lineItems = dedupeLineItemsByRecord(getLineItems(quote));
    const services = lineItems.filter((item) => item.section_type === 'service' && !isCustomLineItem(item));
    const addOns = lineItems.filter((item) => item.section_type === 'addon' && !isCustomLineItem(item));
    const logistics = lineItems.filter((item) => item.section_type === 'logistics' && !isCustomLineItem(item));
    const customItems = lineItems.filter(isCustomLineItem);
    const orderedItems = [
      ...services.map((item) => ({ item, category: 'service' })),
      ...addOns.map((item) => ({ item, category: 'addon' })),
      ...logistics.map((item) => ({ item, category: 'logistics' })),
      ...customItems.map((item) => ({ item, category: 'custom' }))
    ];

    if (!orderedItems.length) {
      worksheet.addRow(buildMasterEmptyQuoteRow(quote));
      return;
    }

    orderedItems.forEach(({ item, category }) => {
      worksheet.addRow(buildMasterLineItemRow(quote, item, category));
    });
  });

  worksheet.getColumn(4).numFmt = '@';
  worksheet.getColumn(6).numFmt = 'yyyy-mm-dd';
  styleWorksheet(worksheet, 3, [8, 10, 12, 14, 16, 17]);
  styleMasterQuotesHeader(worksheet);
}

async function fetchQuotesForReport() {
  return db.sales_quotes.findAll({
    include: [
      {
        model: db.sales_quote_line_items,
        as: 'line_items',
        required: false,
        where: { is_active: 1 },
        include: [
          {
            model: db.quote_catalog_items,
            as: 'catalog_item',
            required: false
          }
        ]
      },
      {
        model: db.sales_quote_activities,
        as: 'activities',
        required: false
      }
    ],
    order: [
      ['sales_quote_id', 'ASC'],
      [{ model: db.sales_quote_line_items, as: 'line_items' }, 'sort_order', 'ASC'],
      [{ model: db.sales_quote_line_items, as: 'line_items' }, 'line_item_id', 'ASC']
    ]
  });
}

async function buildQuotesReportWorkbook() {
  const quotes = await fetchQuotesForReport();
  const workbook = new ExcelJS.Workbook();

  workbook.creator = 'Revure V2 Backend API';
  workbook.created = new Date();

  addReadMeSheet(workbook);
  addServicesSheet(workbook, quotes);
  addAddOnsSheet(workbook, quotes);
  addCustomLineItemsSheet(workbook, quotes);
  addDiscountsSheet(workbook, quotes);
  addMasterQuotesSheet(workbook, quotes);

  return workbook;
}

module.exports = {
  buildQuotesReportWorkbook,
  addReadMeSheet,
  addServicesSheet,
  addAddOnsSheet,
  addCustomLineItemsSheet,
  addDiscountsSheet,
  addMasterQuotesSheet
};
