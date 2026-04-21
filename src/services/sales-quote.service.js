const { Op } = require('sequelize');
const db = require('../models');
const { sendCustomQuoteProposalEmail } = require('../utils/emailService');
const { generateQuotePdfBuffer } = require('../utils/quotePdf');
const { normalizeTime, resolveEventDateAndStartTime } = require('../utils/timezone');

const SECTION_TYPES = ['service', 'addon', 'logistics', 'custom'];
const QUOTE_STATUSES = ['draft', 'pending', 'partially_paid', 'sent', 'viewed', 'accepted', 'paid', 'rejected', 'expired'];
const DISCOUNT_TYPES = ['none', 'percentage', 'fixed_amount'];
const AI_EDITING_SERVICE_NAME = 'ai editing';
const CONVERTED_BOOKINGS_LEAD_SOURCE = 'converted bookings';
const BOOKING_SHOOT_TYPE_MAP = {
  corporateevent: 'corporate',
  wedding: 'wedding',
  privateevent: 'private',
  commercialadvertising: 'commercial',
  socialcontent: 'social_content',
  podcastshows: 'podcast',
  musicvideos: 'music',
  shortfilmsnarrative: 'short_film',
  peopleteams: 'people_teams',
  brandproduct: 'brand_product',
  behindthescenes: 'behind_scenes'
};
const BOOKING_ROLE_SERVICE_MAP = {
  videography: 'videographer',
  photography: 'photographer'
};
const DEFAULT_FIGMA_CATALOG = {
  service: [
    { catalog_item_id: null, section_type: 'service', pricing_mode: 'both', name: 'Videography', description: null, default_rate: 250, rate_type: 'per_hour', rate_unit: 'per hour', is_active: 1, display_order: 1, source: 'figma_default' },
    { catalog_item_id: null, section_type: 'service', pricing_mode: 'both', name: 'Photography', description: null, default_rate: 250, rate_type: 'per_hour', rate_unit: 'per hour', is_active: 1, display_order: 2, source: 'figma_default' },
    { catalog_item_id: null, section_type: 'service', pricing_mode: 'both', name: 'AI Editing', description: null, default_rate: 500, rate_type: 'per_hour', rate_unit: 'per hour', is_active: 1, display_order: 3, source: 'figma_default' },
    { catalog_item_id: null, section_type: 'service', pricing_mode: 'both', name: 'Livestream Production', description: null, default_rate: 250, rate_type: 'per_hour', rate_unit: 'per hour', is_active: 1, display_order: 4, source: 'figma_default' },
    { catalog_item_id: null, section_type: 'service', pricing_mode: 'both', name: 'Location', description: null, default_rate: 250, rate_type: 'per_hour', rate_unit: 'per hour', is_active: 1, display_order: 5, source: 'figma_default' }
  ],
  addon: [
    { catalog_item_id: null, section_type: 'addon', pricing_mode: 'both', name: '4K Camera Upgrade', description: null, default_rate: 500, rate_type: 'flat', rate_unit: null, is_active: 1, display_order: 1, source: 'figma_default' },
    { catalog_item_id: null, section_type: 'addon', pricing_mode: 'both', name: 'Drone Footage', description: null, default_rate: 800, rate_type: 'flat', rate_unit: null, is_active: 1, display_order: 2, source: 'figma_default' },
    { catalog_item_id: null, section_type: 'addon', pricing_mode: 'both', name: 'Additional Crew Member', description: null, default_rate: 300, rate_type: 'flat', rate_unit: null, is_active: 1, display_order: 3, source: 'figma_default' },
    { catalog_item_id: null, section_type: 'addon', pricing_mode: 'both', name: 'Lighting Package', description: null, default_rate: 600, rate_type: 'flat', rate_unit: null, is_active: 1, display_order: 4, source: 'figma_default' },
    { catalog_item_id: null, section_type: 'addon', pricing_mode: 'both', name: 'Audio Recording Kit', description: null, default_rate: 400, rate_type: 'flat', rate_unit: null, is_active: 1, display_order: 5, source: 'figma_default' },
    { catalog_item_id: null, section_type: 'addon', pricing_mode: 'both', name: 'Green Screen Setup', description: null, default_rate: 600, rate_type: 'flat', rate_unit: null, is_active: 1, display_order: 6, source: 'figma_default' },
    { catalog_item_id: null, section_type: 'addon', pricing_mode: 'both', name: 'Teleprompter', description: null, default_rate: 200, rate_type: 'flat', rate_unit: null, is_active: 1, display_order: 7, source: 'figma_default' },
    { catalog_item_id: null, section_type: 'addon', pricing_mode: 'both', name: 'Hair and Makeup Artist', description: null, default_rate: 450, rate_type: 'flat', rate_unit: null, is_active: 1, display_order: 8, source: 'figma_default' }
  ],
  logistics: [
    { catalog_item_id: null, section_type: 'logistics', pricing_mode: 'both', name: 'Travel and Transportation', description: null, default_rate: 500, rate_type: 'flat', rate_unit: null, is_active: 1, display_order: 1, source: 'figma_default' },
    { catalog_item_id: null, section_type: 'logistics', pricing_mode: 'both', name: 'Equipment Rental', description: null, default_rate: 800, rate_type: 'flat', rate_unit: null, is_active: 1, display_order: 2, source: 'figma_default' },
    { catalog_item_id: null, section_type: 'logistics', pricing_mode: 'both', name: 'Studio Rental', description: null, default_rate: 1200, rate_type: 'flat', rate_unit: null, is_active: 1, display_order: 3, source: 'figma_default' },
    { catalog_item_id: null, section_type: 'logistics', pricing_mode: 'both', name: 'Permits and Licenses', description: null, default_rate: 300, rate_type: 'flat', rate_unit: null, is_active: 1, display_order: 4, source: 'figma_default' }
  ]
};

const AI_EDITING_VIDEO_TYPE_MAP = {
  corporateevent: [
    { key: 'social_reel_15_30', value: 'Social Media Reel (15 sec-30 sec)' },
    { key: 'social_reel_30_90', value: 'Social Media Reel (30 sec-90 sec)' },
    { key: 'mini_highlight_1_2', value: 'Mini Highlight Video (1-2 mins)' },
    { key: 'highlight_4_7', value: 'Highlight Video (4-7 min)' },
    { key: 'feature_30_40', value: 'Feature Video (30-40 min)' }
  ],
  wedding: [
    { key: 'social_reel_15_30', value: 'Social Media Reel (15 sec-30 sec)' },
    { key: 'social_reel_30_90', value: 'Social Media Reel (30 sec-90 sec)' },
    { key: 'mini_highlight_1_2', value: 'Mini Highlight Video (1-2 mins)' },
    { key: 'highlight_4_7', value: 'Highlight Video (4-7 min)' },
    { key: 'feature_30_40', value: 'Feature Video (30-40 min)' }
  ],
  privateevent: [
    { key: 'social_reel_15_30', value: 'Social Media Reel (15 sec-30 sec)' },
    { key: 'social_reel_30_90', value: 'Social Media Reel (30 sec-90 sec)' },
    { key: 'mini_highlight_1_2', value: 'Mini Highlight Video (1-2 mins)' },
    { key: 'highlight_4_7', value: 'Highlight Video (4-7 min)' },
    { key: 'feature_30_40', value: 'Feature Video (30-40 min)' }
  ],
  commercialadvertising: [
    { key: 'social_reel_15_30', value: 'Social Media Reel (15 sec-30 sec)' },
    { key: 'social_reel_30_90', value: 'Social Media Reel (30 sec-90 sec)' },
    { key: 'commercial_2_4', value: 'Commercial (2 min-4 min)' },
    { key: 'commercial_4_10', value: 'Commercial (4 min-10 min)' }
  ],
  socialcontent: [
    { key: 'social_reel_15_30', value: 'Social Media Reel (15 sec-30 sec)' },
    { key: 'social_reel_30_90', value: 'Social Media Reel (30 sec-90 sec)' },
    { key: 'social_reel_2_4', value: 'Social Media Reel (2 min-4 min)' }
  ],
  podcastshows: [
    { key: 'social_reel_15_30', value: 'Social Media Reel (15 sec-30 sec)' },
    { key: 'social_reel_30_90', value: 'Social Media Reel (30 sec-90 sec)' },
    { key: 'full_podcast_15_30', value: 'Full Length Podcast (15 min-30 min)' },
    { key: 'full_podcast_30_60', value: 'Longer Full Length Podcast (30 min-60 min)' }
  ],
  musicvideos: [
    { key: 'social_reel_15_30', value: 'Social Media Reel (15 sec-30 sec)' },
    { key: 'social_reel_30_90', value: 'Social Media Reel (30 sec-90 sec)' },
    { key: 'music_video_2_3', value: 'Edited Music Video (2-3 min)' },
    { key: 'music_video_vfx_2_3', value: 'Edited Music Video with VFX (2-3 min)' }
  ],
  shortfilmsnarrative: [
    { key: 'social_reel_15_30', value: 'Social Media Reel (15 sec-30 sec)' },
    { key: 'social_reel_30_90', value: 'Social Media Reel (30 sec-90 sec)' },
    { key: 'short_film_2_5', value: 'Edited Short Film (2 Min-5 Min)' },
    { key: 'short_film_5_10', value: 'Edited Short Film (5 Min-10 Min)' }
  ]
};

const AI_EDITING_PHOTO_TYPE_MAP = {
  corporateevent: [
    { key: 'edited_photos', value: 'Edited Photos', note: '25 edited photos per hour' }
  ],
  wedding: [
    { key: 'edited_photos', value: 'Edited Photos', note: '50 edited photos per hour for weddings' }
  ],
  privateevent: [
    { key: 'edited_photos', value: 'Edited Photos', note: '25 edited photos per hour' }
  ],
  brandproduct: [
    { key: 'edited_photos', value: 'Edited Photos', note: '25 edited photos per hour' }
  ],
  socialcontent: [
    { key: 'edited_photos', value: 'Edited Photos', note: '25 edited photos per hour' }
  ],
  peopleteams: [
    { key: 'edited_photos', value: 'Edited Photos', note: '25 edited photos per hour' }
  ],
  behindthescenes: [
    { key: 'edited_photos', value: 'Edited Photos', note: '25 edited photos per hour' }
  ],
  musicvideos: [
    { key: 'edited_photos', value: 'Edited Photos', note: '25 edited photos per hour' }
  ],
  commercialadvertising: [
    { key: 'edited_photos', value: 'Edited Photos', note: '25 edited photos per hour' }
  ]
};

function roundCurrency(value) {
  const numeric = Number(value || 0);
  return Number(numeric.toFixed(2));
}

function startOfDay(date) {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function addMonths(date, months) {
  const nextDate = new Date(date);
  nextDate.setMonth(nextDate.getMonth() + months);
  return nextDate;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function parseDateInput(dateInput) {
  if (!dateInput) return null;

  const parsedDate = new Date(`${String(dateInput).trim()}T00:00:00`);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function normalizeQuoteFilterStatus(status) {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  if (!normalizedStatus || normalizedStatus === 'all') {
    return null;
  }

  const statusGroups = {
    accepted: ['accepted', 'paid'],
    draft: ['draft'],
    pending: ['pending', 'partially_paid'],
    partially_paid: ['partially_paid'],
    rejected: ['rejected'],
    sent: ['sent', 'viewed'],
    viewed: ['viewed'],
    paid: ['paid'],
    expired: ['expired']
  };

  if (statusGroups[normalizedStatus]) {
    return statusGroups[normalizedStatus];
  }

  return QUOTE_STATUSES.includes(normalizedStatus) ? [normalizedStatus] : null;
}

function appendAndCondition(where, condition) {
  if (!condition) {
    return where;
  }

  if (!where[Op.and]) {
    where[Op.and] = [];
  }

  where[Op.and].push(condition);
  return where;
}

function applyQuoteSalesRepFilter(where, assignedSalesRepId, user) {
  if (!assignedSalesRepId) {
    return where;
  }

  const salesRepId = Number(assignedSalesRepId);
  if (!Number.isInteger(salesRepId) || salesRepId <= 0) {
    return where;
  }

  return appendAndCondition(where, {
    [Op.or]: [
      { assigned_sales_rep_id: salesRepId },
      { created_by_user_id: salesRepId }
    ]
  });
}

function buildQuoteCreatedAtCondition(range = 'all', dateOn = null) {
  const normalizedRange = String(range || 'all').trim().toLowerCase();
  const now = new Date();
  const todayStart = startOfDay(now);

  if (normalizedRange === 'custom') {
    const selectedDate = parseDateInput(dateOn) || now;
    const selectedStart = startOfDay(selectedDate);

    return {
      [Op.gte]: selectedStart,
      [Op.lt]: addDays(selectedStart, 1)
    };
  }

  if (normalizedRange === 'week' || normalizedRange === '7days') {
    return {
      [Op.gte]: addDays(todayStart, -6),
      [Op.lt]: addDays(todayStart, 1)
    };
  }

  if (normalizedRange === 'month' || normalizedRange === '30days') {
    return {
      [Op.gte]: addDays(todayStart, -29),
      [Op.lt]: addDays(todayStart, 1)
    };
  }

  if (normalizedRange === '90days') {
    return {
      [Op.gte]: addDays(todayStart, -89),
      [Op.lt]: addDays(todayStart, 1)
    };
  }

  if (normalizedRange === 'all') {
    return {
      [Op.gte]: startOfMonth(addMonths(now, -5)),
      [Op.lt]: addDays(todayStart, 1)
    };
  }

  return null;
}

function getDateRange(range = 'all', dateOn = null) {
  const normalizedRange = String(range || 'all').trim().toLowerCase();
  const now = new Date();
  const todayStart = startOfDay(now);

  if (normalizedRange === 'custom') {
    const selectedDate = parseDateInput(dateOn) || now;
    const currentStart = startOfDay(selectedDate);

    return {
      normalizedRange,
      currentStart,
      currentEnd: addDays(currentStart, 1),
      previousStart: addDays(currentStart, -1),
      previousEnd: currentStart,
      compareLabel: 'vs previous day'
    };
  }

  if (normalizedRange === 'week' || normalizedRange === '7days') {
    const currentStart = addDays(todayStart, -6);
    return {
      normalizedRange: 'week',
      currentStart,
      currentEnd: addDays(todayStart, 1),
      previousStart: addDays(currentStart, -7),
      previousEnd: currentStart,
      compareLabel: 'vs previous 7 days'
    };
  }

  if (normalizedRange === 'month' || normalizedRange === '30days') {
    const currentStart = addDays(todayStart, -29);
    return {
      normalizedRange: 'month',
      currentStart,
      currentEnd: addDays(todayStart, 1),
      previousStart: addDays(currentStart, -30),
      previousEnd: currentStart,
      compareLabel: 'vs previous 30 days'
    };
  }

  if (normalizedRange === '90days') {
    const currentStart = addDays(todayStart, -89);
    return {
      normalizedRange,
      currentStart,
      currentEnd: addDays(todayStart, 1),
      previousStart: addDays(currentStart, -90),
      previousEnd: currentStart,
      compareLabel: 'vs previous 90 days'
    };
  }

  const currentStart = startOfMonth(addMonths(now, -5));
  const previousEnd = currentStart;
  const previousStart = startOfMonth(addMonths(currentStart, -6));

  return {
    normalizedRange: 'all',
    currentStart,
    currentEnd: addDays(todayStart, 1),
    previousStart,
    previousEnd,
    compareLabel: 'vs previous 6 months'
  };
}

function isWithinRange(dateValue, start, end) {
  const date = new Date(dateValue);
  return date >= start && date < end;
}

function buildDashboardChartBuckets(range = 'all', dateOn = null) {
  const { normalizedRange, currentStart } = getDateRange(range, dateOn);
  const buckets = [];
  const now = new Date();

  if (normalizedRange === 'custom') {
    for (let hour = 0; hour < 24; hour += 1) {
      const date = new Date(currentStart);
      date.setHours(hour, 0, 0, 0);
      buckets.push({
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(hour).padStart(2, '0')}`,
        label: date.toLocaleString('en-US', { hour: 'numeric', hour12: true })
      });
    }
    return buckets;
  }

  if (normalizedRange === 'week' || normalizedRange === 'month' || normalizedRange === '90days') {
    const dayCount = normalizedRange === 'week' ? 7 : normalizedRange === 'month' ? 30 : 90;
    for (let index = 0; index < dayCount; index += 1) {
      const date = addDays(currentStart, index);
      buckets.push({
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
        label: normalizedRange === 'week'
          ? date.toLocaleDateString('en-US', { weekday: 'short' })
          : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      });
    }
    return buckets;
  }

  for (let index = 0; index < 6; index += 1) {
    const date = startOfMonth(addMonths(currentStart, index));
    buckets.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    });
  }

  return buckets;
}

function getDashboardChartBucketKey(dateValue, range = 'all', dateOn = null) {
  const { normalizedRange, currentStart, currentEnd } = getDateRange(range, dateOn);
  const date = new Date(dateValue);

  if (!isWithinRange(date, currentStart, currentEnd)) {
    return null;
  }

  if (normalizedRange === 'custom') {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}`;
  }

  if (normalizedRange === 'week' || normalizedRange === 'month' || normalizedRange === '90days') {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeStatusForDashboardMetrics(status) {
  const normalizedStatus = String(status || '').toLowerCase();

  if (normalizedStatus === 'paid') return 'accepted';
  if (normalizedStatus === 'partially_paid') return 'pending';
  if (normalizedStatus === 'viewed' || normalizedStatus === 'sent') return 'sent';
  return normalizedStatus;
}

function calculateGrowth(currentValue, previousValue) {
  const current = Number(currentValue || 0);
  const previous = Number(previousValue || 0);

  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }

  return roundCurrency(((current - previous) / previous) * 100);
}

function parseConfig(config) {
  if (!config) return null;
  if (typeof config === 'string') {
    try {
      return JSON.parse(config);
    } catch (error) {
      return null;
    }
  }
  return config;
}

function stringifyConfig(config) {
  if (!config) return null;
  return JSON.stringify(config);
}

function normalizeMode(pricingMode) {
  if (!pricingMode || pricingMode === 'all') return null;
  return pricingMode;
}

function normalizeLookupKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getUniqueEditingTypes(map) {
  const seen = new Set();
  const result = [];

  Object.values(map).forEach((items) => {
    (items || []).forEach((item) => {
      if (!item?.key || seen.has(item.key)) return;
      seen.add(item.key);
      result.push(item);
    });
  });

  return result;
}

function buildFallbackAiEditingTypesResponse() {
  const withSystemDefault = (items = []) => items.map((item) => ({
    ...item,
    is_system_default: true
  }));

  return {
    video_edit_types: withSystemDefault(getUniqueEditingTypes(AI_EDITING_VIDEO_TYPE_MAP)),
    photo_edit_types: withSystemDefault(getUniqueEditingTypes(AI_EDITING_PHOTO_TYPE_MAP))
  };
}

function toAiEditingTypeResponseItem(item) {
  return {
    ai_editing_type_id: item.sales_ai_editing_type_id,
    key: item.type_key,
    value: item.label,
    note: item.note || null,
    is_system_default: Boolean(Number(item.is_system_default))
  };
}

function buildAiEditingTypesResponseFromRows(rows = []) {
  return rows.reduce((acc, item) => {
    const key = item.category === 'photo' ? 'photo_edit_types' : 'video_edit_types';
    acc[key].push(toAiEditingTypeResponseItem(item));
    return acc;
  }, {
    video_edit_types: [],
    photo_edit_types: []
  });
}

async function loadAiEditingTypesResponse() {
  try {
    if (!db.sales_ai_editing_types) {
      return buildFallbackAiEditingTypesResponse();
    }

    const records = await db.sales_ai_editing_types.findAll({
      where: { is_active: 1 },
      order: [
        ['category', 'ASC'],
        ['display_order', 'ASC'],
        ['sales_ai_editing_type_id', 'ASC']
      ]
    });

    if (!records.length) {
      return buildFallbackAiEditingTypesResponse();
    }

    return buildAiEditingTypesResponseFromRows(records.map((record) => record.toJSON()));
  } catch (error) {
    return buildFallbackAiEditingTypesResponse();
  }
}

function buildAiEditingTypesLookup(response) {
  const byKey = new Map();
  const byLabel = new Map();

  ['video_edit_types', 'photo_edit_types'].forEach((groupKey) => {
    (response[groupKey] || []).forEach((item) => {
      const normalizedKey = normalizeLookupKey(item.key);
      const normalizedLabel = normalizeLookupKey(item.value);

      if (normalizedKey && !byKey.has(normalizedKey)) {
        byKey.set(normalizedKey, item);
      }

      if (normalizedLabel && !byLabel.has(normalizedLabel)) {
        byLabel.set(normalizedLabel, item);
      }
    });
  });

  return { byKey, byLabel };
}

function normalizeCustomEditingTypes(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      if (!item) return null;

      if (typeof item === 'string') {
        const value = item.trim();
        return value ? { key: normalizeLookupKey(value), value, is_custom: true } : null;
      }

      const value = String(item.value || item.label || item.name || '').trim();
      if (!value) return null;

      return {
        key: String(item.key || normalizeLookupKey(value)),
        value,
        is_custom: true
      };
    })
    .filter(Boolean);
}

function extractAiEditingConfig(rawItem, aiEditingTypesLookup = null) {
  const baseConfig = parseConfig(rawItem.configuration || rawItem.configuration_json) || {};
  const directKey = rawItem.editing_type_key ?? baseConfig.editing_type_key ?? null;
  const directLabel = rawItem.editing_type_label
    ?? rawItem.editing_type
    ?? baseConfig.editing_type_label
    ?? baseConfig.editing_type
    ?? null;
  const directCustom = Boolean(rawItem.is_custom_editing_type ?? baseConfig.is_custom_editing_type);

  if (!directCustom && directKey && aiEditingTypesLookup?.byKey?.has(normalizeLookupKey(directKey))) {
    const matched = aiEditingTypesLookup.byKey.get(normalizeLookupKey(directKey));
    return {
      editing_type_key: matched.key,
      editing_type_label: matched.value,
      is_custom_editing_type: Boolean(!matched.is_system_default)
    };
  }

  if (!directCustom && directLabel && aiEditingTypesLookup?.byLabel?.has(normalizeLookupKey(directLabel))) {
    const matched = aiEditingTypesLookup.byLabel.get(normalizeLookupKey(directLabel));
    return {
      editing_type_key: matched.key,
      editing_type_label: matched.value,
      is_custom_editing_type: Boolean(!matched.is_system_default)
    };
  }

  if (directLabel) {
    const normalizedLabel = String(directLabel).trim();
    return {
      editing_type_key: String(directKey || normalizeLookupKey(normalizedLabel)),
      editing_type_label: normalizedLabel,
      is_custom_editing_type: directCustom
    };
  }

  const firstVideoType = Array.isArray(rawItem.video_edit_types) ? rawItem.video_edit_types[0] : null;
  if (firstVideoType) {
    const normalizedType = normalizeLookupKey(firstVideoType);
    const matched = aiEditingTypesLookup?.byLabel?.get(normalizedType) || aiEditingTypesLookup?.byKey?.get(normalizedType);
    return {
      editing_type_key: matched?.key || normalizeLookupKey(firstVideoType),
      editing_type_label: matched?.value || String(firstVideoType),
      is_custom_editing_type: matched ? Boolean(!matched.is_system_default) : false
    };
  }

  const firstPhotoType = Array.isArray(rawItem.photo_edit_types) ? rawItem.photo_edit_types[0] : null;
  if (firstPhotoType) {
    const normalizedType = normalizeLookupKey(firstPhotoType);
    const matched = aiEditingTypesLookup?.byLabel?.get(normalizedType) || aiEditingTypesLookup?.byKey?.get(normalizedType);
    return {
      editing_type_key: matched?.key || normalizeLookupKey(firstPhotoType),
      editing_type_label: matched?.value || String(firstPhotoType),
      is_custom_editing_type: matched ? Boolean(!matched.is_system_default) : false
    };
  }

  const firstCustomType = normalizeCustomEditingTypes(rawItem.custom_ai_editing_types)[0];
  if (firstCustomType) {
    return {
      editing_type_key: firstCustomType.key,
      editing_type_label: firstCustomType.value,
      is_custom_editing_type: true
    };
  }

  return Object.keys(baseConfig).length ? baseConfig : null;
}

function deriveAiEditingItemName(rawItem, catalogItem, config) {
  if (config?.editing_type_label) {
    return `AI Editing Type - ${config.editing_type_label}`;
  }

  return rawItem.item_name || rawItem.name || catalogItem?.name || 'AI Editing';
}

function resolveRateTypeValue(preferred, pricingItem, catalogItem) {
  return preferred || catalogItem?.rate_type || 'flat';
}

function resolveRateUnitValue(preferred, pricingItem, catalogItem) {
  return preferred || catalogItem?.rate_unit || null;
}

function resolveUnitRateValue(preferred, pricingItem, catalogItem) {
  const candidate = preferred ?? catalogItem?.default_rate ?? 0;
  return roundCurrency(candidate);
}

function generateQuoteNumber(salesQuoteId = null) {
  const normalizedId = Number(salesQuoteId);
  if (Number.isInteger(normalizedId) && normalizedId > 0) {
    return `BEIGE-${normalizedId}`;
  }

  return `BEIGE-${Date.now()}`;
}

function formatDateOnly(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resolveValidity({ validUntil, quoteValidityDays, validUntilProvided = false, quoteValidityDaysProvided = false }) {
  const parsedDays = quoteValidityDays !== undefined && quoteValidityDays !== null && quoteValidityDays !== ''
    ? Number(quoteValidityDays)
    : null;

  if (quoteValidityDaysProvided && Number.isFinite(parsedDays) && parsedDays > 0 && !validUntilProvided) {
    const date = new Date();
    date.setDate(date.getDate() + parsedDays);
    return {
      quote_validity_days: parsedDays,
      valid_until: formatDateOnly(date)
    };
  }

  if (validUntil) {
    return {
      quote_validity_days: Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : null,
      valid_until: validUntil
    };
  }

  return {
    quote_validity_days: null,
    valid_until: null
  };
}

function isAdminRole(role) {
  return role === 'admin' || role === 'Admin' || role === 'sales_admin' || role === 'Sales_Admin' || role === 'sales_rep' || role === 'Sales_Rep';
}

async function getRandomActiveSalesRepId(transaction) {
  const salesRepType = await db.user_type.findOne({
    where: { user_role: 'sales_rep' },
    transaction
  });

  if (!salesRepType?.user_type_id) {
    return null;
  }

  const salesReps = await db.users.findAll({
    where: {
      user_type: salesRepType.user_type_id,
      is_active: 1
    },
    attributes: ['id'],
    transaction
  });

  if (!salesReps.length) {
    return null;
  }

  const randomIndex = Math.floor(Math.random() * salesReps.length);
  return salesReps[randomIndex].id;
}

function resolveQuoteStatus(payload = {}, currentStatus = 'draft') {
  if (payload.is_draft === true) {
    return 'draft';
  }

  if (payload.is_draft === false) {
    return 'pending';
  }

  if (payload.status && QUOTE_STATUSES.includes(payload.status)) {
    return payload.status;
  }

  return currentStatus;
}

function buildQuoteAccessWhere(user, options = {}) {
  const { restrictToLoggedInRep = true } = options;

  if (isAdminRole(user?.role) || !restrictToLoggedInRep) return {};
  return {
    [Op.or]: [
      { created_by_user_id: user.userId },
      { assigned_sales_rep_id: user.userId }
    ]
  };
}

async function getCatalog(pricingMode = null) {
  const normalizedMode = normalizeMode(pricingMode);
  const where = { is_active: 1 };
  if (normalizedMode) {
    where.pricing_mode = { [Op.in]: [normalizedMode, 'both'] };
  }

  const items = await db.quote_catalog_items.findAll({
    where,
    order: [['section_type', 'ASC'], ['display_order', 'ASC'], ['catalog_item_id', 'ASC']]
  });

  const grouped = {
    service: [],
    addon: [],
    logistics: [],
    custom: []
  };

  items.forEach((entry) => {
    const item = entry.toJSON();
    if (!grouped[item.section_type]) {
      grouped[item.section_type] = [];
    }
    grouped[item.section_type].push({
      ...item,
      effective_rate: roundCurrency(item.default_rate ?? 0),
      effective_rate_type: item.rate_type,
      effective_rate_unit: item.rate_unit
    });
  });

  if (!grouped.service.length && !grouped.addon.length && !grouped.logistics.length && !grouped.custom.length) {
    return DEFAULT_FIGMA_CATALOG;
  }

  return grouped;
}

async function getAiEditingTypes() {
  return loadAiEditingTypesResponse();
}

async function createAiEditingType(payload, userId) {
  const label = String(payload.label).trim();
  const typeKey = String(payload.type_key || normalizeLookupKey(label));

  const created = await db.sales_ai_editing_types.create({
    category: payload.category,
    type_key: typeKey,
    label,
    note: payload.note ?? null,
    display_order: payload.display_order ?? 0,
    is_active: payload.is_active !== undefined ? (payload.is_active ? 1 : 0) : 1,
    is_system_default: 0,
    created_by_user_id: userId,
    updated_by_user_id: userId
  });

  return db.sales_ai_editing_types.findByPk(created.sales_ai_editing_type_id);
}

async function updateAiEditingType(aiEditingTypeId, payload, userId) {
  const item = await db.sales_ai_editing_types.findByPk(aiEditingTypeId);
  if (!item) {
    throw new Error('AI editing type not found');
  }

  const label = payload.label !== undefined ? String(payload.label).trim() : item.label;
  const typeKey = payload.type_key !== undefined
    ? String(payload.type_key).trim()
    : (payload.label !== undefined ? normalizeLookupKey(label) : item.type_key);

  await item.update({
    category: payload.category ?? item.category,
    type_key: typeKey || item.type_key,
    label: label || item.label,
    note: payload.note !== undefined ? payload.note : item.note,
    display_order: payload.display_order !== undefined ? payload.display_order : item.display_order,
    is_active: payload.is_active !== undefined ? (payload.is_active ? 1 : 0) : item.is_active,
    updated_by_user_id: userId,
    updated_at: new Date()
  });

  return db.sales_ai_editing_types.findByPk(aiEditingTypeId);
}

async function deleteAiEditingType(aiEditingTypeId) {
  const item = await db.sales_ai_editing_types.findByPk(aiEditingTypeId);
  if (!item) {
    throw new Error('AI editing type not found');
  }

  if (Number(item.is_system_default) === 1) {
    throw new Error('Default AI editing types cannot be deleted');
  }

  await item.update({
    is_active: 0,
    updated_at: new Date()
  });

  return {
    ai_editing_type_id: item.sales_ai_editing_type_id,
    deleted: true
  };
}

async function createCatalogItem(payload, userId) {
  const {
    section_type,
    pricing_mode = 'both',
    name,
    description = null,
    default_rate = null,
    rate_type,
    rate_unit = null,
    display_order = 0,
    is_active = 1
  } = payload;

  if (!SECTION_TYPES.includes(section_type)) {
    throw new Error('Invalid section_type');
  }

  if (!name) {
    throw new Error('name is required');
  }

  const created = await db.quote_catalog_items.create({
    section_type,
    pricing_mode,
    name,
    description,
    default_rate,
    rate_type: rate_type || 'flat',
    rate_unit,
    display_order,
    is_active: is_active ? 1 : 0,
    is_system_default: 0,
    created_by_user_id: userId,
    updated_by_user_id: userId
  });

  return db.quote_catalog_items.findByPk(created.catalog_item_id);
}

async function updateCatalogItem(catalogItemId, payload, userId) {
  const item = await db.quote_catalog_items.findByPk(catalogItemId);
  if (!item) {
    throw new Error('Catalog item not found');
  }

  if (payload.section_type && !SECTION_TYPES.includes(payload.section_type)) {
    throw new Error('Invalid section_type');
  }

  await item.update({
    section_type: payload.section_type ?? item.section_type,
    pricing_mode: payload.pricing_mode ?? item.pricing_mode,
    name: payload.name ?? item.name,
    description: payload.description !== undefined ? payload.description : item.description,
    default_rate: payload.default_rate !== undefined ? payload.default_rate : item.default_rate,
    rate_type: payload.rate_type ?? item.rate_type,
    rate_unit: payload.rate_unit !== undefined ? payload.rate_unit : item.rate_unit,
    display_order: payload.display_order !== undefined ? payload.display_order : item.display_order,
    is_active: payload.is_active !== undefined ? (payload.is_active ? 1 : 0) : item.is_active,
    updated_by_user_id: userId,
    updated_at: new Date()
  });

  return db.quote_catalog_items.findByPk(catalogItemId);
}

async function deleteCatalogItem(catalogItemId) {
  const item = await db.quote_catalog_items.findByPk(catalogItemId);
  if (!item) {
    throw new Error('Catalog item not found');
  }

  if (Number(item.is_system_default) === 1 && item.section_type === 'service') {
    throw new Error('Default service catalog items cannot be deleted');
  }

  await item.update({
    is_active: 0,
    updated_at: new Date()
  });

  return {
    catalog_item_id: item.catalog_item_id,
    deleted: true
  };
}

async function resolveClientSnapshot(payload = {}, fallback = {}) {
  const snapshot = {
    client_id: payload.client_id !== undefined ? payload.client_id : fallback.client_id || null,
    client_user_id: payload.client_user_id !== undefined ? payload.client_user_id : fallback.client_user_id || null,
    client_name: payload.client_name !== undefined ? payload.client_name : fallback.client_name || null,
    client_email: payload.client_email !== undefined ? payload.client_email : fallback.client_email || null,
    client_phone: payload.client_phone !== undefined ? payload.client_phone : fallback.client_phone || null,
    client_address: payload.client_address !== undefined ? payload.client_address : fallback.client_address || null
  };

  let clientRecordById = null;
  if (snapshot.client_id) {
    clientRecordById = await db.clients.findOne({
      where: { client_id: snapshot.client_id, is_active: 1 }
    });

    if (clientRecordById) {
      if (!snapshot.client_user_id && clientRecordById.user_id) {
        snapshot.client_user_id = clientRecordById.user_id;
      }
      if (!snapshot.client_name) snapshot.client_name = clientRecordById.name || null;
      if (!snapshot.client_email) snapshot.client_email = clientRecordById.email || null;
      if (!snapshot.client_phone) snapshot.client_phone = clientRecordById.phone_number || null;
    }
  }

  if (snapshot.client_user_id) {
    let [clientRecordByUser, userRecord] = await Promise.all([
      db.clients.findOne({ where: { user_id: snapshot.client_user_id, is_active: 1 } }),
      db.users.findByPk(snapshot.client_user_id)
    ]);

    // Backward compatibility: old clients dropdown could send guest client_id in client_user_id.
    if (!clientRecordByUser && !userRecord) {
      const guestClientRecord = await db.clients.findOne({
        where: { client_id: snapshot.client_user_id, is_active: 1 }
      });

      if (guestClientRecord) {
        snapshot.client_id = guestClientRecord.client_id;
        snapshot.client_user_id = guestClientRecord.user_id || null;
        clientRecordById = guestClientRecord;
        clientRecordByUser = guestClientRecord.user_id
          ? await db.clients.findOne({ where: { user_id: guestClientRecord.user_id, is_active: 1 } })
          : null;
        userRecord = guestClientRecord.user_id ? await db.users.findByPk(guestClientRecord.user_id) : null;
      }
    }

    if (!snapshot.client_id) {
      snapshot.client_id = clientRecordByUser?.client_id || clientRecordById?.client_id || null;
    }
    if (!snapshot.client_name) snapshot.client_name = clientRecordByUser?.name || clientRecordById?.name || userRecord?.name || null;
    if (!snapshot.client_email) snapshot.client_email = clientRecordByUser?.email || clientRecordById?.email || userRecord?.email || null;
    if (!snapshot.client_phone) snapshot.client_phone = clientRecordByUser?.phone_number || clientRecordById?.phone_number || userRecord?.phone_number || null;
  }

  if (!snapshot.client_name) {
    snapshot.client_name = fallback.client_name || 'Untitled Draft';
  }

  return snapshot;
}

async function buildLineItemsPayload(rawItems = []) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return [];
  }

  const catalogItemIds = rawItems.map((item) => item.catalog_item_id).filter(Boolean);
  const catalogItems = catalogItemIds.length
      ? await db.quote_catalog_items.findAll({
          where: { catalog_item_id: { [Op.in]: catalogItemIds } }
        })
      : [];

  const catalogMap = new Map(catalogItems.map((item) => [item.catalog_item_id, item.toJSON()]));
  const aiEditingTypesResponse = await loadAiEditingTypesResponse();
  const aiEditingTypesLookup = buildAiEditingTypesLookup(aiEditingTypesResponse);

  return rawItems.map((rawItem, index) => {
    const catalogItem = rawItem.catalog_item_id ? catalogMap.get(rawItem.catalog_item_id) : null;

    const sourceType = rawItem.source_type || (catalogItem ? 'catalog' : 'custom');
    const sectionType = rawItem.section_type || catalogItem?.section_type || 'custom';
    const rateType = resolveRateTypeValue(rawItem.rate_type, null, catalogItem);
    const rateUnit = resolveRateUnitValue(rawItem.rate_unit, null, catalogItem);
    const baseUnitRate = resolveUnitRateValue(rawItem.unit_rate, null, catalogItem);
    const quantity = Math.max(1, Number(rawItem.quantity || 1));
    const durationHours = rawItem.duration_hours !== undefined && rawItem.duration_hours !== null
      ? Math.max(0, Number(rawItem.duration_hours))
      : null;
    const crewSize = rawItem.crew_size !== undefined && rawItem.crew_size !== null
      ? Math.max(0, Number(rawItem.crew_size))
      : null;
      const estimatedPricing = rawItem.estimated_pricing !== undefined && rawItem.estimated_pricing !== null
        ? roundCurrency(rawItem.estimated_pricing)
        : null;
      const effectiveUnitRate = estimatedPricing !== null ? estimatedPricing : baseUnitRate;
      const normalizedItemName = normalizeLookupKey(rawItem.item_name || rawItem.name || catalogItem?.name || '');
      const aiEditingConfig = normalizedItemName === normalizeLookupKey(AI_EDITING_SERVICE_NAME)
        ? extractAiEditingConfig(rawItem, aiEditingTypesLookup)
        : null;
    const configuration = normalizedItemName === normalizeLookupKey(AI_EDITING_SERVICE_NAME)
      ? aiEditingConfig
      : (rawItem.configuration || rawItem.configuration_json || null);

    let multiplier = quantity;
    if (rateType === 'per_hour') {
      multiplier *= durationHours || 1;
      multiplier *= crewSize || 1;
    } else if (rateType === 'per_day') {
      multiplier *= crewSize || 1;
    }

    const lineTotal = roundCurrency(effectiveUnitRate * multiplier);

    return {
      catalog_item_id: catalogItem?.catalog_item_id || null,
      source_type: sourceType,
      section_type: sectionType,
      item_name: normalizedItemName === normalizeLookupKey(AI_EDITING_SERVICE_NAME)
        ? deriveAiEditingItemName(rawItem, catalogItem, aiEditingConfig)
        : (rawItem.item_name || rawItem.name || catalogItem?.name),
      description: rawItem.description ?? catalogItem?.description ?? null,
      rate_type: rateType,
      rate_unit: rateUnit,
      quantity,
      duration_hours: durationHours,
      crew_size: crewSize,
      estimated_pricing: estimatedPricing,
      unit_rate: effectiveUnitRate,
      line_total: lineTotal,
      configuration_json: stringifyConfig(configuration),
      sort_order: rawItem.sort_order !== undefined ? Number(rawItem.sort_order) : index
    };
  });
}

function toPersistableLineItemPayload(item) {
  const plain = typeof item.toJSON === 'function' ? item.toJSON() : { ...item };
  delete plain.line_item_id;
  delete plain.sales_quote_id;
  delete plain.is_active;
  delete plain.created_at;
  delete plain.updated_at;
  return plain;
}

function normalizeSectionTypes(sectionTypes = []) {
  const validSections = new Set(SECTION_TYPES);
  return [...new Set(
    sectionTypes
      .map((section) => (section == null ? null : String(section).trim()))
      .filter((section) => section && validSections.has(section))
  )];
}

function mergeLineItemsBySection(existingItems, incomingItems, sectionTypesToReplace) {
  if (!sectionTypesToReplace.length) {
    return existingItems;
  }

  const replaceSet = new Set(sectionTypesToReplace);
  return [
    ...existingItems.filter((item) => !replaceSet.has(item.section_type)),
    ...incomingItems
  ];
}

function calculateTotals(lineItems, quoteData) {
  const subtotal = roundCurrency(lineItems.reduce((sum, item) => sum + Number(item.line_total || 0), 0));
  const discountType = DISCOUNT_TYPES.includes(quoteData.discount_type) ? quoteData.discount_type : 'none';
  const discountValue = roundCurrency(quoteData.discount_value || 0);

  let discountAmount = 0;
  if (discountType === 'percentage') {
    discountAmount = roundCurrency((subtotal * discountValue) / 100);
  } else if (discountType === 'fixed_amount') {
    discountAmount = Math.min(subtotal, discountValue);
  }

  const amountAfterDiscount = roundCurrency(subtotal - discountAmount);
  const taxRate = roundCurrency(quoteData.tax_rate || 0);
  const taxAmount = roundCurrency((amountAfterDiscount * taxRate) / 100);
  const total = roundCurrency(amountAfterDiscount + taxAmount);

  return {
    subtotal,
    discount_type: discountType,
    discount_value: discountValue,
    discount_amount: discountAmount,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    total
  };
}

function mapQuoteShootTypeToBookingShootType(shootType) {
  const normalized = normalizeLookupKey(shootType);
  return BOOKING_SHOOT_TYPE_MAP[normalized] || null;
}

function getLineItemCatalogName(item) {
  return item?.catalog_item?.name || item?.item_name || '';
}

function deriveBookingRoleDataFromQuote(lineItems = []) {
  const crew_roles = {};
  let duration_hours = null;

  (lineItems || []).forEach((item) => {
    if (item.section_type !== 'service') return;

    const normalizedName = normalizeLookupKey(getLineItemCatalogName(item));
    const roleKey = BOOKING_ROLE_SERVICE_MAP[normalizedName];
    if (!roleKey) return;

    const roleCount = Math.max(1, Number(item.crew_size || item.quantity || 1));
    crew_roles[roleKey] = (crew_roles[roleKey] || 0) + roleCount;

    const itemDuration = item.duration_hours !== null && item.duration_hours !== undefined
      ? Number(item.duration_hours)
      : null;
    if (Number.isFinite(itemDuration) && itemDuration > 0) {
      duration_hours = duration_hours == null ? itemDuration : Math.max(duration_hours, itemDuration);
    }
  });

  const crew_size = Object.values(crew_roles).reduce((sum, value) => sum + Number(value || 0), 0) || null;
  const contentTypes = Object.keys(crew_roles)
    .filter((key) => Number(crew_roles[key]) > 0)
    .join(',');

  return {
    crew_roles,
    crew_size,
    content_type: contentTypes || null,
    duration_hours
  };
}

function hasConvertibleServiceInQuote(lineItems = []) {
  return (lineItems || []).some((item) => {
    if (item.section_type !== 'service') return false;
    const normalizedName = normalizeLookupKey(getLineItemCatalogName(item));
    return Boolean(normalizedName);
  });
}

async function deriveBookingEditSelectionsFromQuote(lineItems = []) {
  const aiEditingTypesResponse = await loadAiEditingTypesResponse();
  const aiEditingTypesLookup = buildAiEditingTypesLookup(aiEditingTypesResponse);
  const video_edit_types = [];
  const photo_edit_types = [];
  const unmatched_edit_types = [];

  (lineItems || []).forEach((item) => {
    if (item.section_type !== 'service') return;

    const normalizedCatalogName = normalizeLookupKey(getLineItemCatalogName(item));
    if (normalizedCatalogName !== normalizeLookupKey(AI_EDITING_SERVICE_NAME)) return;

    const config = extractAiEditingConfig(item, aiEditingTypesLookup);
    if (!config?.editing_type_key && !config?.editing_type_label) return;

    const keyLookup = config.editing_type_key
      ? aiEditingTypesLookup.byKey.get(normalizeLookupKey(config.editing_type_key))
      : null;
    const labelLookup = config.editing_type_label
      ? aiEditingTypesLookup.byLabel.get(normalizeLookupKey(config.editing_type_label))
      : null;
    const matched = keyLookup || labelLookup;

    if (!matched) {
      unmatched_edit_types.push(config.editing_type_label || config.editing_type_key);
      return;
    }

    if (matched.note) {
      if (!photo_edit_types.includes(matched.key)) photo_edit_types.push(matched.key);
      return;
    }

    if (!video_edit_types.includes(matched.key)) video_edit_types.push(matched.key);
  });

  return {
    video_edit_types,
    photo_edit_types,
    unmatched_edit_types,
    edits_needed: video_edit_types.length > 0 || photo_edit_types.length > 0 || unmatched_edit_types.length > 0
  };
}

function deriveConvertedProjectName(quote, prefillData = {}) {
  const shootType = quote.video_shoot_type || 'Custom';
  const clientName = prefillData.full_name || quote.client_name || quote.client_email || 'Client';
  return `${shootType.toUpperCase()} Shoot - ${clientName}`;
}

function buildConvertedBookingDescription(quoteDetails, prefillData) {
  const lines = [];
  const contactName = prefillData.full_name || quoteDetails.client_name;
  const contactPhone = prefillData.phone || quoteDetails.client_phone;

  if (quoteDetails.project_description) {
    lines.push(quoteDetails.project_description);
  }

  if (contactName) {
    lines.push(`Contact Name: ${contactName}`);
  }

  if (contactPhone) {
    lines.push(`Phone: ${contactPhone}`);
  }

  if (prefillData.quote_shoot_type_label) {
    lines.push(`Shoot Type: ${prefillData.quote_shoot_type_label}`);
  }

  if (prefillData.video_edit_types?.length) {
    lines.push(`Video Edit Types: ${prefillData.video_edit_types.join(', ')}`);
  }

  if (prefillData.photo_edit_types?.length) {
    lines.push(`Photo Edit Types: ${prefillData.photo_edit_types.join(', ')}`);
  }

  if (prefillData.unmatched_edit_types?.length) {
    lines.push(`Custom Edit Types: ${prefillData.unmatched_edit_types.join(', ')}`);
  }

  return lines.filter(Boolean).join('\n');
}

function buildQuoteConversionMissingFields(prefillData) {
  const otherFields = [];

  if (!prefillData.content_type) otherFields.push('content_type');
  if (!prefillData.shoot_type) otherFields.push('shoot_type');
  if (!prefillData.crew_roles || !Object.keys(prefillData.crew_roles).length) otherFields.push('crew_roles');
  if (!prefillData.crew_size) otherFields.push('crew_size');
  if (!prefillData.location) otherFields.push('location');

  return {
    missing_required_fields: {
      time_fields: {
        always: [
          ...(!prefillData.booking_type ? ['booking_type'] : []),
          ...(!prefillData.time_zone ? ['time_zone'] : [])
        ],
        single_day: prefillData.booking_type === 'single_day'
          ? [
              ...(!prefillData.start_date ? ['start_date'] : []),
              ...(!prefillData.start_time ? ['start_time'] : []),
              ...(!prefillData.end_time ? ['end_time'] : [])
            ]
          : ['start_date', 'start_time', 'end_time'],
        multi_day: prefillData.booking_type === 'multi_day'
          ? [!(Array.isArray(prefillData.booking_days) && prefillData.booking_days.length) ? 'booking_days' : null].filter(Boolean)
          : ['booking_days']
      },
      other_fields: [...new Set([...(prefillData.selected_crew_ids?.length ? [] : ['selected_crew_ids']), ...otherFields])]
    }
  };
}

function deriveQuoteConversionModeHint(prefillData) {
  if (!prefillData.content_type && prefillData.edits_needed) {
    return 'editing_only';
  }

  if (prefillData.content_type && prefillData.edits_needed) {
    return 'shoot_and_editing';
  }

  if (prefillData.content_type) {
    return 'shoot_only';
  }

  return 'incomplete';
}

function canGeneratePaymentLinkFromConvertedBooking(quoteDetails, prefillData) {
  return Boolean(
    quoteDetails?.total &&
    Number(quoteDetails.total) > 0 &&
    (prefillData?.guest_email || quoteDetails?.client_email)
  );
}

function calculateDurationFromTimes(startTime, endTime) {
  const normalizedStart = normalizeTime(startTime);
  const normalizedEnd = normalizeTime(endTime);
  if (!normalizedStart || !normalizedEnd) return null;

  const [sh, sm, ss = '00'] = normalizedStart.split(':').map(Number);
  const [eh, em, es = '00'] = normalizedEnd.split(':').map(Number);
  if ([sh, sm, ss, eh, em, es].some((part) => Number.isNaN(part))) return null;

  const startMinutes = (sh * 60) + sm + (ss / 60);
  const endMinutes = (eh * 60) + em + (es / 60);
  const diffMinutes = endMinutes - startMinutes;
  if (diffMinutes <= 0) return null;
  return roundCurrency(diffMinutes / 60);
}

function normalizeBookingDaysPayload(bookingDays = [], defaultTimeZone = null) {
  return (Array.isArray(bookingDays) ? bookingDays : [])
    .filter((day) => day && day.date)
    .map((day) => {
      const start = normalizeTime(day.start_time || day.startTime || null);
      const end = normalizeTime(day.end_time || day.endTime || null);
      const explicitDuration = day.duration_hours !== undefined && day.duration_hours !== null
        ? Number(day.duration_hours)
        : null;

      return {
        date: day.date,
        start_time: start,
        end_time: end,
        duration_hours: Number.isFinite(explicitDuration) && explicitDuration > 0
          ? explicitDuration
          : calculateDurationFromTimes(start, end),
        time_zone: day.time_zone || day.timeZone || defaultTimeZone || null
      };
    });
}

function applyConvertBookingOverrides(prefillData, payload = {}) {
  const next = { ...prefillData };
  const timeZone = payload.time_zone || payload.timeZone || null;
  const location = payload.location !== undefined ? payload.location : payload.event_location;
  const referenceLinks = payload.reference_links !== undefined ? payload.reference_links : payload.referenceLinks;
  const specialInstructions = payload.special_instructions !== undefined ? payload.special_instructions : payload.specialInstructions;
  const selectedCrewIds = Array.isArray(payload.selected_crew_ids) ? payload.selected_crew_ids.filter(Boolean).map(Number) : [];
  const normalizedBookingDays = normalizeBookingDaysPayload(payload.booking_days, timeZone);
  const inferredBookingType = payload.booking_type
    || (normalizedBookingDays.length ? 'multi_day' : null)
    || ((payload.start_date || payload.start_time || payload.start_date_time || payload.end_time) ? 'single_day' : null);
  const bookingType = inferredBookingType;
  const singleDaySchedule = resolveEventDateAndStartTime({
    start_date: payload.start_date,
    start_time: payload.start_time,
    start_date_time: payload.start_date_time
  });
  const singleDayEndTime = normalizeTime(payload.end_time || null);
  next.has_schedule_override = Boolean(
    bookingType ||
    timeZone ||
    normalizedBookingDays.length ||
    payload.start_date ||
    payload.start_time ||
    payload.start_date_time ||
    payload.end_time
  );

  if (location !== undefined) next.location = location || null;
  if (referenceLinks !== undefined) next.reference_links = referenceLinks || null;
  if (specialInstructions !== undefined) next.special_instructions = specialInstructions || null;
  if (bookingType) next.booking_type = bookingType;
  if (timeZone) next.time_zone = timeZone;
  if (selectedCrewIds.length) next.selected_crew_ids = selectedCrewIds;

  if (bookingType === 'multi_day') {
    next.booking_days = normalizedBookingDays;
    if (normalizedBookingDays.length) {
      const firstDay = [...normalizedBookingDays].sort((a, b) => new Date(a.date) - new Date(b.date))[0];
      next.start_date = firstDay.date;
      next.start_time = firstDay.start_time || null;
      next.end_time = firstDay.end_time || null;
      const totalDuration = normalizedBookingDays.reduce((sum, day) => sum + Number(day.duration_hours || 0), 0);
      if (totalDuration > 0) next.duration_hours = totalDuration;
    }
  } else if (bookingType === 'single_day') {
    next.booking_days = [];
    if (singleDaySchedule.event_date) next.start_date = singleDaySchedule.event_date;
    if (singleDaySchedule.start_time) next.start_time = singleDaySchedule.start_time;
    if (singleDayEndTime) next.end_time = singleDayEndTime;

    const explicitDuration = payload.duration_hours !== undefined && payload.duration_hours !== null
      ? Number(payload.duration_hours)
      : null;
    const computedDuration = Number.isFinite(explicitDuration) && explicitDuration > 0
      ? explicitDuration
      : calculateDurationFromTimes(next.start_time, next.end_time);
    if (computedDuration) next.duration_hours = computedDuration;
  }

  return next;
}

async function syncConvertedQuoteArtifacts({
  quote,
  quoteDetails,
  prefillData,
  user,
  transaction,
  markQuoteAccepted = false,
  recordConversionActivity = false
}) {
  let lead = quote.lead_id
    ? await db.sales_leads.findOne({
        where: { lead_id: quote.lead_id, is_active: 1 },
        transaction
      })
    : null;

  let booking = lead?.booking_id
    ? await db.stream_project_booking.findOne({
        where: { stream_project_booking_id: lead.booking_id, is_active: 1 },
        transaction
      })
    : null;

  const wasAlreadyConverted = Boolean(lead && booking);
  const bookingDescription = buildConvertedBookingDescription(quoteDetails, prefillData);

  if (!booking) {
    booking = await db.stream_project_booking.create({
      user_id: quote.client_user_id || null,
      guest_email: quote.client_email || null,
      project_name: deriveConvertedProjectName(quoteDetails, prefillData),
      description: bookingDescription || null,
      event_type: prefillData.shoot_type || prefillData.content_type,
      shoot_type: prefillData.shoot_type || null,
      content_type: prefillData.content_type,
      event_date: prefillData.start_date || null,
      duration_hours: prefillData.duration_hours,
      start_time: prefillData.start_time || null,
      end_time: prefillData.end_time || null,
      budget: Number(quoteDetails.total || 0) || null,
      crew_size_needed: prefillData.crew_size,
      event_location: prefillData.location,
      crew_roles: JSON.stringify(prefillData.crew_roles || {}),
      streaming_platforms: JSON.stringify([]),
      reference_links: prefillData.reference_links,
      edits_needed: prefillData.edits_needed ? 1 : 0,
      video_edit_types: prefillData.video_edit_types,
      photo_edit_types: prefillData.photo_edit_types,
      special_instructions: prefillData.special_instructions,
      is_draft: 1,
      is_completed: 0,
      is_cancelled: 0,
      is_active: 1
    }, { transaction });
  } else {
    await booking.update({
      user_id: quote.client_user_id || booking.user_id || null,
      guest_email: quote.client_email || booking.guest_email || null,
      project_name: deriveConvertedProjectName(quoteDetails, prefillData),
      description: bookingDescription || booking.description || null,
      event_type: prefillData.shoot_type || prefillData.content_type || booking.event_type,
      shoot_type: prefillData.shoot_type || booking.shoot_type || null,
      content_type: prefillData.content_type || booking.content_type || null,
      event_date: prefillData.start_date || booking.event_date || null,
      duration_hours: prefillData.duration_hours ?? booking.duration_hours,
      start_time: prefillData.start_time || booking.start_time || null,
      end_time: prefillData.end_time || booking.end_time || null,
      budget: Number(quoteDetails.total || 0) || booking.budget || null,
      crew_size_needed: prefillData.crew_size ?? booking.crew_size_needed,
      event_location: prefillData.location || booking.event_location || null,
      crew_roles: JSON.stringify(
        Object.keys(prefillData.crew_roles || {}).length
          ? prefillData.crew_roles
          : (parseConfig(booking.crew_roles) || {})
      ),
      reference_links: prefillData.reference_links ?? booking.reference_links ?? null,
      edits_needed: prefillData.edits_needed ? 1 : booking.edits_needed,
      video_edit_types: prefillData.video_edit_types?.length ? prefillData.video_edit_types : booking.video_edit_types,
      photo_edit_types: prefillData.photo_edit_types?.length ? prefillData.photo_edit_types : booking.photo_edit_types,
      special_instructions: prefillData.special_instructions || booking.special_instructions || null,
      is_active: 1
    }, { transaction });
  }

  if (prefillData.has_schedule_override) {
    await db.stream_project_booking_days.destroy({
      where: { stream_project_booking_id: booking.stream_project_booking_id },
      transaction
    });

    if (prefillData.booking_type === 'multi_day' && Array.isArray(prefillData.booking_days) && prefillData.booking_days.length) {
      await db.stream_project_booking_days.bulkCreate(
        prefillData.booking_days.map((day) => ({
          stream_project_booking_id: booking.stream_project_booking_id,
          event_date: day.date,
          start_time: day.start_time || null,
          end_time: day.end_time || null,
          duration_hours: day.duration_hours || null,
          time_zone: day.time_zone || prefillData.time_zone || null
        })),
        { transaction }
      );
    }
  }

  const nextLeadStatus = booking.payment_id || booking.is_completed === 1
    ? (lead?.lead_status || 'booked')
    : 'booking_in_progress';

  if (!lead) {
    lead = await db.sales_leads.create({
      booking_id: booking.stream_project_booking_id,
      user_id: quote.client_user_id || null,
      guest_email: quote.client_email || null,
      client_name: quote.client_name,
      phone: quote.client_phone || null,
      lead_type: 'sales_assisted',
      lead_status: nextLeadStatus,
      intent: null,
      lead_source: CONVERTED_BOOKINGS_LEAD_SOURCE,
      assigned_sales_rep_id: quote.assigned_sales_rep_id || user.userId,
      last_activity_at: new Date(),
      created_from: 1
    }, { transaction });
  } else {
    await lead.update({
      booking_id: booking.stream_project_booking_id,
      user_id: quote.client_user_id || lead.user_id || null,
      guest_email: quote.client_email || lead.guest_email || null,
      client_name: quote.client_name || lead.client_name || null,
      phone: quote.client_phone || lead.phone || null,
      lead_type: lead.lead_type || 'sales_assisted',
      lead_status: nextLeadStatus,
      lead_source: CONVERTED_BOOKINGS_LEAD_SOURCE,
      assigned_sales_rep_id: quote.assigned_sales_rep_id || lead.assigned_sales_rep_id || user.userId,
      last_activity_at: new Date()
    }, { transaction });
  }

  const legacyQuote = await persistLegacyBookingQuoteFromSalesQuote({
    booking,
    quoteDetails,
    transaction
  });

  if (booking.quote_id !== legacyQuote.quote_id) {
    await booking.update({ quote_id: legacyQuote.quote_id }, { transaction });
  }

  await quote.update({
    lead_id: lead.lead_id,
    ...(markQuoteAccepted ? {
      status: 'accepted',
      accepted_at: quote.accepted_at || new Date()
    } : {}),
    updated_at: new Date()
  }, { transaction });

  if (recordConversionActivity) {
    await db.sales_lead_activities.create({
      lead_id: lead.lead_id,
      activity_type: wasAlreadyConverted ? 'booking_updated' : 'created',
      activity_data: {
        source: 'sales_quote_conversion',
        sales_quote_id: quote.sales_quote_id,
        booking_id: booking.stream_project_booking_id,
        lead_source: CONVERTED_BOOKINGS_LEAD_SOURCE
      },
      performed_by_user_id: user.userId || null
    }, { transaction });

    await recordActivity(
      transaction,
      quote.sales_quote_id,
      'accepted',
      user.userId,
      wasAlreadyConverted ? 'Quote conversion reopened and marked as accepted' : 'Quote converted to booking and marked as accepted',
      {
        lead_id: lead.lead_id,
        booking_id: booking.stream_project_booking_id
      }
    );
  }

  return { lead, booking, legacyQuote, wasAlreadyConverted };
}

async function persistLegacyBookingQuoteFromSalesQuote({ booking, quoteDetails, transaction }) {
  const legacyPricingMode = quoteDetails.pricing_mode === 'wedding' ? 'wedding' : 'general';
  const legacyStatus = quoteDetails.status === 'draft' ? 'draft' : 'pending';
  const priceAfterDiscount = roundCurrency(
    Number(quoteDetails.subtotal || 0) - Number(quoteDetails.discount_amount || 0)
  );
  const expiresAt = quoteDetails.valid_until
    ? new Date(`${quoteDetails.valid_until}T23:59:59.000Z`)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  let legacyQuote = null;
  if (booking.quote_id) {
    legacyQuote = await db.quotes.findByPk(booking.quote_id, { transaction });
  }

  if (!legacyQuote) {
    legacyQuote = await db.quotes.findOne({
      where: { booking_id: booking.stream_project_booking_id },
      order: [['quote_id', 'DESC']],
      transaction
    });
  }

  const legacyPayload = {
    booking_id: booking.stream_project_booking_id,
    user_id: quoteDetails.client_user_id || null,
    guest_email: quoteDetails.client_email || null,
    pricing_mode: legacyPricingMode,
    shoot_hours: Number(quoteDetails.line_items?.find((item) => item.section_type === 'service' && item.duration_hours)?.duration_hours || quoteDetails.line_items?.[0]?.duration_hours || 0),
    subtotal: Number(quoteDetails.subtotal || 0),
    discount_percent: quoteDetails.discount_type === 'percentage' ? Number(quoteDetails.discount_value || 0) : 0,
    discount_amount: Number(quoteDetails.discount_amount || 0),
    tax_type: quoteDetails.tax_type || null,
    tax_rate: Number(quoteDetails.tax_rate || 0),
    tax_amount: Number(quoteDetails.tax_amount || 0),
    applied_discount_type: ['percentage', 'fixed_amount'].includes(quoteDetails.discount_type) ? quoteDetails.discount_type : null,
    applied_discount_value: ['percentage', 'fixed_amount'].includes(quoteDetails.discount_type) ? Number(quoteDetails.discount_value || 0) : null,
    price_after_discount: priceAfterDiscount,
    margin_percent: 0,
    margin_amount: 0,
    total: Number(quoteDetails.total || 0),
    status: legacyStatus,
    expires_at: expiresAt,
    notes: quoteDetails.notes || null,
    updated_at: new Date()
  };

  if (legacyQuote) {
    await legacyQuote.update(legacyPayload, { transaction });
  } else {
    legacyQuote = await db.quotes.create(legacyPayload, { transaction });
  }

  await db.quote_line_items.destroy({
    where: { quote_id: legacyQuote.quote_id },
    transaction
  });

  const lineItems = Array.isArray(quoteDetails.line_items) ? quoteDetails.line_items : [];
  if (lineItems.length) {
    await db.quote_line_items.bulkCreate(
      lineItems.map((item) => ({
        quote_id: legacyQuote.quote_id,
        item_id: null,
        item_name: item.item_name,
        quantity: Number(item.quantity || 1),
        unit_price: Number(item.unit_rate || item.estimated_pricing || 0),
        line_total: Number(item.line_total || 0),
        notes: item.section_type || null
      })),
      { transaction }
    );
  }

  return legacyQuote;
}

function deriveQuoteAddOns(lineItems = [], explicitAddOns = null) {
  if (explicitAddOns) {
    if (Array.isArray(explicitAddOns)) {
      const values = explicitAddOns.filter(Boolean);
      return values.length ? values.join(', ') : 'TBD';
    }

    return String(explicitAddOns);
  }

  const addOnNames = (lineItems || [])
    .filter((item) => item && item.section_type === 'addon' && item.item_name)
    .map((item) => item.item_name.trim())
    .filter(Boolean);

  return addOnNames.length ? addOnNames.join(', ') : 'TBD';
}

function deriveQuoteIncludes(lineItems = [], explicitIncludes = null) {
  if (explicitIncludes) {
    if (Array.isArray(explicitIncludes)) {
      const values = explicitIncludes.filter(Boolean);
      return values.length ? values.join(', ') : 'TBD';
    }

    return String(explicitIncludes);
  }

  const includeNames = (lineItems || [])
    .filter((item) => item && item.item_name)
    .map((item) => item.item_name.trim())
    .filter(Boolean);

  if (!includeNames.length) return 'TBD';

  const maxItems = 2;
  const visible = includeNames.slice(0, maxItems);
  const remaining = includeNames.length - visible.length;
  if (remaining <= 0) return visible.join(', ');

  return `${visible.join(', ')} + ${remaining} more`;
}

function deriveQuoteValidityText(quoteDetails = {}) {
  if (quoteDetails.valid_until) {
    return `Valid until ${quoteDetails.valid_until}`;
  }

  if (quoteDetails.quote_validity_days) {
    const days = Number(quoteDetails.quote_validity_days);
    if (days) {
      return `${days} day${days === 1 ? '' : 's'}`;
    }
  }

  return 'TBD';
}

async function recordActivity(transaction, salesQuoteId, activityType, userId, message, metadata = null) {
  return db.sales_quote_activities.create({
    sales_quote_id: salesQuoteId,
    activity_type: activityType,
    performed_by_user_id: userId || null,
    message: message || null,
    metadata_json: stringifyConfig(metadata)
  }, { transaction });
}

async function resolveQuoteBillingState(quote, transaction) {
  const defaultState = {
    booking: null,
    latest_invoice_history: null,
    collected_amount: 0,
    outstanding_amount: 0,
    payment_status: 'pending',
    is_collected: false
  };

  const latestInvoiceHistory = db.invoice_send_history
    ? await db.invoice_send_history.findOne({
        where: { quote_id: quote.sales_quote_id },
        order: [['sent_at', 'DESC'], ['invoice_send_history_id', 'DESC']],
        transaction
      })
    : null;

  if (!quote?.lead_id) {
    if (latestInvoiceHistory?.payment_status) {
      defaultState.payment_status = latestInvoiceHistory.payment_status;
      defaultState.is_collected = latestInvoiceHistory.payment_status === 'paid';
      defaultState.collected_amount = defaultState.is_collected ? roundCurrency(quote.total) : 0;
      defaultState.latest_invoice_history = latestInvoiceHistory;
    }
    return defaultState;
  }

  const linkedLead = await db.sales_leads.findOne({
    where: { lead_id: quote.lead_id },
    attributes: ['booking_id'],
    transaction
  });

  const booking = linkedLead?.booking_id
    ? await db.stream_project_booking.findByPk(linkedLead.booking_id, {
        attributes: ['stream_project_booking_id', 'payment_id', 'is_completed', 'stripe_invoice_id'],
        transaction
      })
    : null;

  const bookingMarkedCollected = Boolean(
    booking && (booking.payment_id || Number(booking.is_completed) === 1)
  );
  const historyMarkedCollected = latestInvoiceHistory?.payment_status === 'paid';
  const refreshActivity = db.sales_quote_activities
    ? await db.sales_quote_activities.findOne({
        where: {
          sales_quote_id: quote.sales_quote_id,
          activity_type: 'updated'
        },
        order: [['created_at', 'DESC'], ['activity_id', 'DESC']],
        transaction
      })
    : null;
  const refreshMetadata = parseConfig(refreshActivity?.metadata_json);
  const refreshExtraAmount = roundCurrency(refreshMetadata?.extra_amount || 0);
  const refreshPreviousTotal = roundCurrency(refreshMetadata?.previous_total || 0);
  const refreshInvoiceHistory = refreshActivity && db.invoice_send_history
    ? await db.invoice_send_history.findOne({
        where: {
          quote_id: quote.sales_quote_id,
          ...(booking?.stream_project_booking_id ? { booking_id: booking.stream_project_booking_id } : {}),
          sent_at: { [Op.gte]: refreshActivity.created_at }
        },
        order: [['sent_at', 'DESC'], ['invoice_send_history_id', 'DESC']],
        transaction
      })
    : null;
  const refreshOutstanding = Boolean(
    refreshMetadata?.invoice_refresh_required &&
    booking?.stream_project_booking_id &&
    Number(refreshMetadata?.booking_id || 0) === Number(booking.stream_project_booking_id) &&
    refreshExtraAmount > 0 &&
    refreshInvoiceHistory?.payment_status !== 'paid'
  );

  const isCollected = !refreshOutstanding && (bookingMarkedCollected || historyMarkedCollected);
  const paymentStatus = refreshOutstanding
    ? 'partially_paid'
    : (refreshInvoiceHistory?.payment_status || latestInvoiceHistory?.payment_status || (isCollected ? 'paid' : 'pending'));
  const collectedAmount = refreshOutstanding
    ? refreshPreviousTotal
    : (isCollected ? roundCurrency(quote.total) : 0);
  const outstandingAmount = roundCurrency(Math.max(roundCurrency(quote.total) - collectedAmount, 0));

  return {
    booking,
    latest_invoice_history: latestInvoiceHistory,
    collected_amount: collectedAmount,
    outstanding_amount: outstandingAmount,
    payment_status: paymentStatus,
    is_collected: isCollected
  };
}

async function markQuoteInvoiceRefreshRequired({
  transaction,
  salesQuoteId,
  bookingId = null,
  userId = null,
  previousTotal = 0,
  newTotal = 0,
  extraAmount = 0,
  paymentStatus = 'pending'
}) {
  await recordActivity(
    transaction,
    salesQuoteId,
    'updated',
    userId,
    'Quote total increased after invoice/payment state; send updated invoice',
    {
      booking_id: bookingId,
      previous_total: roundCurrency(previousTotal),
      new_total: roundCurrency(newTotal),
      extra_amount: roundCurrency(extraAmount),
      payment_status: paymentStatus,
      invoice_refresh_required: true
    }
  );
}

async function createQuote(payload, user) {
  const transaction = await db.sequelize.transaction();
  try {
    const clientSnapshot = await resolveClientSnapshot(payload);
    const lineItemsPayload = await buildLineItemsPayload(payload.line_items || []);
    const totals = calculateTotals(lineItemsPayload, payload);
    const validity = resolveValidity({
      validUntil: payload.valid_until,
      quoteValidityDays: payload.quote_validity_days,
      validUntilProvided: payload.valid_until !== undefined,
      quoteValidityDaysProvided: payload.quote_validity_days !== undefined
    });
    let assignedSalesRepId = user.userId;

    if (isAdminRole(user.role)) {
      const requestedSalesRepId = payload.assigned_sales_rep_id !== undefined && payload.assigned_sales_rep_id !== null && payload.assigned_sales_rep_id !== ''
        ? Number(payload.assigned_sales_rep_id)
        : null;

      if (Number.isInteger(requestedSalesRepId) && requestedSalesRepId > 0) {
        const requestedUser = await db.users.findByPk(requestedSalesRepId, {
          include: [
            {
              model: db.user_type,
              as: 'userType',
              attributes: ['user_role']
            }
          ],
          transaction
        });

        const requestedUserRole = String(requestedUser?.userType?.user_role || '').toLowerCase();
        assignedSalesRepId = requestedUser && requestedUserRole === 'sales_rep'
          ? requestedSalesRepId
          : await getRandomActiveSalesRepId(transaction);
      } else {
        assignedSalesRepId = await getRandomActiveSalesRepId(transaction);
      }
    }

    const quote = await db.sales_quotes.create({
      quote_number: generateQuoteNumber(),
      lead_id: payload.lead_id || null,
      client_user_id: clientSnapshot.client_user_id,
      client_id: clientSnapshot.client_id,
      created_by_user_id: user.userId,
      assigned_sales_rep_id: assignedSalesRepId,
      pricing_mode: payload.pricing_mode || 'general',
      status: resolveQuoteStatus(payload, 'draft'),
      client_name: clientSnapshot.client_name,
      client_email: clientSnapshot.client_email,
      client_phone: clientSnapshot.client_phone,
      client_address: clientSnapshot.client_address,
      project_description: payload.project_description || null,
      video_shoot_type: payload.video_shoot_type || null,
      quote_validity_days: validity.quote_validity_days,
      valid_until: validity.valid_until,
      discount_type: totals.discount_type,
      discount_value: totals.discount_value,
      discount_amount: totals.discount_amount,
      tax_type: payload.tax_type || null,
      tax_rate: totals.tax_rate,
      tax_amount: totals.tax_amount,
      subtotal: totals.subtotal,
      total: totals.total,
      notes: payload.notes || null,
      terms_conditions: payload.terms_conditions || null
    }, { transaction });

    const stableQuoteNumber = generateQuoteNumber(quote.sales_quote_id);
    if (quote.quote_number !== stableQuoteNumber) {
      await quote.update({ quote_number: stableQuoteNumber }, { transaction });
    }

    if (lineItemsPayload.length) {
      await db.sales_quote_line_items.bulkCreate(
        lineItemsPayload.map((item) => ({
          ...item,
          is_active: 1,
          sales_quote_id: quote.sales_quote_id
        })),
        { transaction }
      );
    }

    await recordActivity(transaction, quote.sales_quote_id, 'created', user.userId, 'Quote created');
    await transaction.commit();
    return getQuoteById(quote.sales_quote_id, user);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function duplicateQuote(salesQuoteId, user) {
  const transaction = await db.sequelize.transaction();

  try {
    const quote = await db.sales_quotes.findOne({
      where: { sales_quote_id: salesQuoteId, ...buildQuoteAccessWhere(user) },
      include: [
        {
          model: db.sales_quote_line_items,
          as: 'line_items',
          where: { is_active: 1 },
          required: false
        }
      ],
      order: [[{ model: db.sales_quote_line_items, as: 'line_items' }, 'sort_order', 'ASC']],
      transaction
    });

    if (!quote) {
      throw new Error('Quote not found');
    }

    const sourceQuote = quote.toJSON();
    const duplicatedQuote = await db.sales_quotes.create({
      quote_number: generateQuoteNumber(),
      lead_id: null,
      client_user_id: null,
      client_id: null,
      created_by_user_id: user.userId,
      assigned_sales_rep_id: sourceQuote.assigned_sales_rep_id || null,
      pricing_mode: sourceQuote.pricing_mode || 'general',
      status: 'pending',
      client_name: sourceQuote.client_name,
      client_email: sourceQuote.client_email || null,
      client_phone: sourceQuote.client_phone || null,
      client_address: sourceQuote.client_address || null,
      project_description: sourceQuote.project_description || null,
      video_shoot_type: sourceQuote.video_shoot_type || null,
      quote_validity_days: sourceQuote.quote_validity_days || null,
      valid_until: sourceQuote.valid_until || null,
      discount_type: sourceQuote.discount_type || 'none',
      discount_value: sourceQuote.discount_value || 0,
      discount_amount: sourceQuote.discount_amount || 0,
      tax_type: sourceQuote.tax_type || null,
      tax_rate: sourceQuote.tax_rate || 0,
      tax_amount: sourceQuote.tax_amount || 0,
      subtotal: sourceQuote.subtotal || 0,
      total: sourceQuote.total || 0,
      notes: sourceQuote.notes || null,
      terms_conditions: sourceQuote.terms_conditions || null
    }, { transaction });

    const stableQuoteNumber = generateQuoteNumber(duplicatedQuote.sales_quote_id);
    if (duplicatedQuote.quote_number !== stableQuoteNumber) {
      await duplicatedQuote.update({ quote_number: stableQuoteNumber }, { transaction });
    }

    const duplicatedLineItems = (sourceQuote.line_items || []).map((item) => ({
      ...toPersistableLineItemPayload(item),
      sales_quote_id: duplicatedQuote.sales_quote_id,
      is_active: 1
    }));

    if (duplicatedLineItems.length) {
      await db.sales_quote_line_items.bulkCreate(duplicatedLineItems, { transaction });
    }

    await recordActivity(
      transaction,
      duplicatedQuote.sales_quote_id,
      'created',
      user.userId,
      'Quote duplicated',
      {
        source_quote_id: salesQuoteId,
        reset_lead_linkage: true,
        reset_client_user_linkage: true
      }
    );

    await transaction.commit();
    return getQuoteById(duplicatedQuote.sales_quote_id, user);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function updateQuote(salesQuoteId, payload, user) {
  const transaction = await db.sequelize.transaction();
  try {
    const quote = await db.sales_quotes.findOne({
      where: { sales_quote_id: salesQuoteId, ...buildQuoteAccessWhere(user) },
      transaction
    });

    if (!quote) {
      throw new Error('Quote not found');
    }

    const billingState = await resolveQuoteBillingState(quote, transaction);
    const clientSnapshot = await resolveClientSnapshot(payload, quote);
    const existingLineItems = await db.sales_quote_line_items.findAll({
      where: { sales_quote_id: salesQuoteId, is_active: 1 },
      order: [['sort_order', 'ASC']],
      transaction
    });
    const existingLineItemsPayload = existingLineItems.map(toPersistableLineItemPayload);

    let incomingLineItemsPayload = [];
    let sectionTypesToReplace = [];
    if (Array.isArray(payload.line_items)) {
      incomingLineItemsPayload = await buildLineItemsPayload(payload.line_items);
      sectionTypesToReplace = normalizeSectionTypes([
        ...(Array.isArray(payload.line_item_sections) ? payload.line_item_sections : []),
        ...incomingLineItemsPayload.map((item) => item.section_type)
      ]);
    }

    const mergedLineItemsPayload = Array.isArray(payload.line_items)
      ? mergeLineItemsBySection(existingLineItemsPayload, incomingLineItemsPayload, sectionTypesToReplace)
      : existingLineItemsPayload;

    const totals = calculateTotals(mergedLineItemsPayload, {
      discount_type: payload.discount_type !== undefined ? payload.discount_type : quote.discount_type,
      discount_value: payload.discount_value !== undefined ? payload.discount_value : quote.discount_value,
      tax_rate: payload.tax_rate !== undefined ? payload.tax_rate : quote.tax_rate
    });
    const validity = resolveValidity({
      validUntil: payload.valid_until !== undefined ? payload.valid_until : quote.valid_until,
      quoteValidityDays: payload.quote_validity_days !== undefined ? payload.quote_validity_days : quote.quote_validity_days,
      validUntilProvided: payload.valid_until !== undefined,
      quoteValidityDaysProvided: payload.quote_validity_days !== undefined
    });

    const nextStatus = resolveQuoteStatus(payload, quote.status);
    const assignedSalesRepId = isAdminRole(user.role)
      ? (payload.assigned_sales_rep_id !== undefined ? payload.assigned_sales_rep_id : quote.assigned_sales_rep_id)
      : quote.assigned_sales_rep_id;
    const previousTotal = roundCurrency(quote.total);
    const newTotal = roundCurrency(totals.total);
    const collectedAmount = roundCurrency(billingState.collected_amount);
    const extraAmount = roundCurrency(Math.max(newTotal - collectedAmount, 0));
    const paymentStatus = extraAmount > 0
      ? (billingState.is_collected ? 'partially_paid' : billingState.payment_status)
      : (billingState.is_collected ? 'paid' : billingState.payment_status);
    const resolvedStatus = extraAmount > 0 && billingState.is_collected
      ? 'partially_paid'
      : nextStatus;

    const quoteUpdatePayload = {
      lead_id: payload.lead_id !== undefined ? payload.lead_id : quote.lead_id,
      client_user_id: clientSnapshot.client_user_id,
      client_id: clientSnapshot.client_id,
      assigned_sales_rep_id: assignedSalesRepId,
      pricing_mode: payload.pricing_mode || quote.pricing_mode,
      status: resolvedStatus,
      client_name: clientSnapshot.client_name,
      client_email: clientSnapshot.client_email,
      client_phone: clientSnapshot.client_phone,
      client_address: clientSnapshot.client_address,
      project_description: payload.project_description !== undefined ? payload.project_description : quote.project_description,
      video_shoot_type: payload.video_shoot_type !== undefined ? payload.video_shoot_type : quote.video_shoot_type,
      quote_validity_days: validity.quote_validity_days,
      valid_until: validity.valid_until,
      discount_type: totals.discount_type,
      discount_value: totals.discount_value,
      discount_amount: totals.discount_amount,
      tax_type: payload.tax_type !== undefined ? payload.tax_type : quote.tax_type,
      tax_rate: totals.tax_rate,
      tax_amount: totals.tax_amount,
      subtotal: totals.subtotal,
      total: newTotal,
      notes: payload.notes !== undefined ? payload.notes : quote.notes,
      terms_conditions: payload.terms_conditions !== undefined ? payload.terms_conditions : quote.terms_conditions,
      updated_at: new Date()
    };

    await quote.update(quoteUpdatePayload, { transaction });

    if (Array.isArray(payload.line_items)) {
      if (sectionTypesToReplace.length) {
        await db.sales_quote_line_items.update({
          is_active: 0,
          updated_at: new Date()
        }, {
          where: {
            sales_quote_id: salesQuoteId,
            is_active: 1,
            section_type: { [Op.in]: sectionTypesToReplace }
          },
          transaction
        });
      }

      if (incomingLineItemsPayload.length) {
        await db.sales_quote_line_items.bulkCreate(
          incomingLineItemsPayload.map((item) => ({
            ...item,
            is_active: 1,
            sales_quote_id: salesQuoteId
          })),
          { transaction }
        );
      }
    }

    if (quote.lead_id) {
      const updatedQuoteDetails = {
        sales_quote_id: quote.sales_quote_id,
        quote_number: quote.quote_number,
        lead_id: quote.lead_id,
        client_user_id: quote.client_user_id,
        created_by_user_id: quote.created_by_user_id,
        assigned_sales_rep_id: quote.assigned_sales_rep_id,
        pricing_mode: quote.pricing_mode,
        status: quote.status,
        client_name: quote.client_name,
        client_email: quote.client_email,
        client_phone: quote.client_phone,
        client_address: quote.client_address,
        project_description: quote.project_description,
        video_shoot_type: quote.video_shoot_type,
        quote_validity_days: quote.quote_validity_days,
        valid_until: quote.valid_until,
        discount_type: quote.discount_type,
        discount_value: quote.discount_value,
        discount_amount: quote.discount_amount,
        tax_type: quote.tax_type,
        tax_rate: quote.tax_rate,
        tax_amount: quote.tax_amount,
        subtotal: quote.subtotal,
        total: quote.total,
        notes: quote.notes,
        terms_conditions: quote.terms_conditions,
        line_items: mergedLineItemsPayload.map((item) => ({
          ...item,
          configuration: parseConfig(item.configuration_json)
        }))
      };

      const roleData = deriveBookingRoleDataFromQuote(updatedQuoteDetails.line_items || []);
      const editSelections = await deriveBookingEditSelectionsFromQuote(updatedQuoteDetails.line_items || []);
      let prefillData = {
        guest_email: updatedQuoteDetails.client_email || null,
        user_id: updatedQuoteDetails.client_user_id || null,
        full_name: updatedQuoteDetails.client_name || null,
        phone: updatedQuoteDetails.client_phone || null,
        location: updatedQuoteDetails.client_address || null,
        content_type: roleData.content_type,
        shoot_type: mapQuoteShootTypeToBookingShootType(updatedQuoteDetails.video_shoot_type),
        quote_shoot_type_label: updatedQuoteDetails.video_shoot_type || null,
        duration_hours: roleData.duration_hours,
        crew_roles: roleData.crew_roles,
        crew_size: roleData.crew_size,
        video_edit_types: editSelections.video_edit_types,
        photo_edit_types: editSelections.photo_edit_types,
        edits_needed: editSelections.edits_needed,
        unmatched_edit_types: editSelections.unmatched_edit_types,
        project_description: updatedQuoteDetails.project_description || null,
        reference_links: null,
        special_instructions: updatedQuoteDetails.notes || null
      };
      prefillData = applyConvertBookingOverrides(prefillData, payload);

      await syncConvertedQuoteArtifacts({
        quote,
        quoteDetails: updatedQuoteDetails,
        prefillData,
        user,
        transaction,
        markQuoteAccepted: false,
        recordConversionActivity: false
      });
    }

    await recordActivity(transaction, salesQuoteId, 'updated', user.userId, 'Quote updated', {
      previous_total: previousTotal,
      new_total: newTotal,
      collected_amount: collectedAmount,
      extra_amount: extraAmount,
      payment_status: paymentStatus,
      booking_id: billingState.booking?.stream_project_booking_id || null,
      invoice_refresh_required: Boolean(
        billingState.booking?.stream_project_booking_id &&
        extraAmount > 0 &&
        billingState.is_collected
      )
    });

    if (billingState.booking?.stream_project_booking_id && extraAmount > 0 && billingState.is_collected) {
      await markQuoteInvoiceRefreshRequired({
        transaction,
        salesQuoteId,
        bookingId: billingState.booking.stream_project_booking_id,
        userId: user.userId,
        previousTotal,
        newTotal,
        extraAmount,
        paymentStatus
      });
    }

    await transaction.commit();
    return getQuoteById(salesQuoteId, user);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function convertQuoteToBooking(salesQuoteId, payload = {}, user) {
  const quoteDetails = await getQuoteById(salesQuoteId, user);
  if (!quoteDetails) {
    throw new Error('Quote not found');
  }

  if (!hasConvertibleServiceInQuote(quoteDetails.line_items || [])) {
    throw new Error('Quote must include at least one service to convert into a booking');
  }

  const roleData = deriveBookingRoleDataFromQuote(quoteDetails.line_items || []);
  const editSelections = await deriveBookingEditSelectionsFromQuote(quoteDetails.line_items || []);
  let prefillData = {
    guest_email: quoteDetails.client_email || null,
    user_id: quoteDetails.client_user_id || null,
    full_name: quoteDetails.client_name || null,
    phone: quoteDetails.client_phone || null,
    location: quoteDetails.client_address || null,
    content_type: roleData.content_type,
    shoot_type: mapQuoteShootTypeToBookingShootType(quoteDetails.video_shoot_type),
    quote_shoot_type_label: quoteDetails.video_shoot_type || null,
    duration_hours: roleData.duration_hours,
    crew_roles: roleData.crew_roles,
    crew_size: roleData.crew_size,
    video_edit_types: editSelections.video_edit_types,
    photo_edit_types: editSelections.photo_edit_types,
    edits_needed: editSelections.edits_needed,
    unmatched_edit_types: editSelections.unmatched_edit_types,
    project_description: quoteDetails.project_description || null,
    reference_links: null,
    special_instructions: quoteDetails.notes || null
  };
  prefillData = applyConvertBookingOverrides(prefillData, payload);
  const bookingDescription = buildConvertedBookingDescription(quoteDetails, prefillData);

  const requirementData = buildQuoteConversionMissingFields(prefillData);
  const transaction = await db.sequelize.transaction();

  try {
    const quote = await db.sales_quotes.findOne({
      where: { sales_quote_id: salesQuoteId, ...buildQuoteAccessWhere(user) },
      transaction
    });

    if (!quote) {
      throw new Error('Quote not found');
    }

    const { lead, booking, legacyQuote, wasAlreadyConverted } = await syncConvertedQuoteArtifacts({
      quote,
      quoteDetails,
      prefillData,
      user,
      transaction,
      markQuoteAccepted: true,
      recordConversionActivity: true
    });

    await transaction.commit();

    return {
      quote_id: quote.sales_quote_id,
      lead_id: lead.lead_id,
      booking_id: booking.stream_project_booking_id,
      already_converted: wasAlreadyConverted,
      lead_source: CONVERTED_BOOKINGS_LEAD_SOURCE,
      booking_mode_hint: deriveQuoteConversionModeHint(prefillData),
      payment_link_ready_hint: canGeneratePaymentLinkFromConvertedBooking(quoteDetails, prefillData),
      legacy_quote_id: legacyQuote.quote_id,
      prefill_data: prefillData,
      booking_summary: {
        project_name: deriveConvertedProjectName(quoteDetails),
        budget: Number(quoteDetails.total || 0) || null,
        description: bookingDescription || null
      },
      missing_required_fields: requirementData.missing_required_fields
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function fetchQuoteById(salesQuoteId, user = null) {
  const accessWhere = user ? buildQuoteAccessWhere(user) : {};
  const quote = await db.sales_quotes.findOne({
    where: { sales_quote_id: salesQuoteId, ...accessWhere },
    include: [
      {
        model: db.sales_quote_line_items,
        as: 'line_items',
        where: { is_active: 1 },
        required: false,
        include: [
          { model: db.quote_catalog_items, as: 'catalog_item', required: false }
        ]
      },
      {
        model: db.sales_quote_activities,
        as: 'activities',
        required: false,
        include: [{ model: db.users, as: 'performed_by', attributes: ['id', 'name', 'email'], required: false }]
      },
      { model: db.users, as: 'created_by', attributes: ['id', 'name', 'email'] },
      { model: db.users, as: 'assigned_sales_rep', attributes: ['id', 'name', 'email'], required: false },
      { model: db.users, as: 'client_user', attributes: ['id', 'name', 'email'], required: false }
    ],
    order: [
      [{ model: db.sales_quote_line_items, as: 'line_items' }, 'sort_order', 'ASC'],
      [{ model: db.sales_quote_activities, as: 'activities' }, 'created_at', 'DESC']
    ]
  });

  if (!quote) return null;

  const plain = quote.toJSON();
  if (plain.lead_id) {
    const linkedLead = await db.sales_leads.findOne({
      where: { lead_id: plain.lead_id },
      attributes: ['booking_id', 'lead_source'],
      raw: true
    });

    if (linkedLead?.booking_id) {
      plain.booking_id = linkedLead.booking_id;
    }

    if (linkedLead?.lead_source) {
      plain.lead_source = linkedLead.lead_source;
    }
  }

  plain.line_items = (plain.line_items || []).map((item) => ({
    ...item,
    quantity: Number(item.quantity || 0),
    duration_hours: item.duration_hours !== null ? Number(item.duration_hours) : null,
    crew_size: item.crew_size !== null ? Number(item.crew_size) : null,
    estimated_pricing: item.estimated_pricing !== null ? Number(item.estimated_pricing) : null,
    unit_rate: Number(item.unit_rate || 0),
    line_total: Number(item.line_total || 0),
    configuration: parseConfig(item.configuration_json)
  }));
  plain.activities = (plain.activities || []).map((item) => ({
    ...item,
    metadata: parseConfig(item.metadata_json)
  }));

  return plain;
}

async function getQuoteById(salesQuoteId, user) {
  return fetchQuoteById(salesQuoteId, user);
}

async function getPublicQuoteById(salesQuoteId) {
  return fetchQuoteById(salesQuoteId);
}

async function listQuotes(query, user) {
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
  const offset = (page - 1) * limit;
  const where = { ...buildQuoteAccessWhere(user) };

  const statusFilter = normalizeQuoteFilterStatus(query.status);
  if (statusFilter?.length) {
    appendAndCondition(where, {
      status: statusFilter.length === 1 ? statusFilter[0] : { [Op.in]: statusFilter }
    });
  }

  applyQuoteSalesRepFilter(where, query.assigned_sales_rep_id, user);

  const createdAtCondition = buildQuoteCreatedAtCondition(query.range, query.date_on);
  if (createdAtCondition) {
    appendAndCondition(where, { created_at: createdAtCondition });
  }

  if (query.search) {
    appendAndCondition(where, {
      [Op.or]: [
        { quote_number: { [Op.like]: `%${query.search}%` } },
        { client_name: { [Op.like]: `%${query.search}%` } },
        { project_description: { [Op.like]: `%${query.search}%` } }
      ]
    });
  }

  const sortBy = query.sort_by === 'valid_until' ? 'valid_until' : 'created_at';
  const sortOrder = String(query.sort_order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const { count, rows } = await db.sales_quotes.findAndCountAll({
    where,
    include: [
      { model: db.users, as: 'assigned_sales_rep', attributes: ['id', 'name', 'email'], required: false },
      { model: db.users, as: 'created_by', attributes: ['id', 'name', 'email'] }
    ],
    order: [[sortBy, sortOrder]],
    offset,
    limit
  });

  const statusRows = await db.sales_quotes.findAll({
    attributes: [
      'status',
      [db.sequelize.fn('COUNT', db.sequelize.col('sales_quote_id')), 'count']
    ],
    where,
    group: ['status'],
    raw: true
  });

  const summary = statusRows.reduce((acc, row) => {
    acc[row.status] = Number(row.count);
    return acc;
  }, {});

  return {
    pagination: {
      page,
      limit,
      total: count,
      total_pages: Math.ceil(count / limit)
    },
    summary,
    rows: rows.map((item) => item.toJSON())
  };
}

async function getQuoteDashboard(query, user) {
  const where = { ...buildQuoteAccessWhere(user) };

  const statusFilter = normalizeQuoteFilterStatus(query.status);
  if (statusFilter?.length) {
    appendAndCondition(where, {
      status: statusFilter.length === 1 ? statusFilter[0] : { [Op.in]: statusFilter }
    });
  }

  applyQuoteSalesRepFilter(where, query.assigned_sales_rep_id, user);

  const quotes = await db.sales_quotes.findAll({
    where,
    attributes: ['sales_quote_id', 'status', 'total', 'created_at'],
    raw: true
  });

  const {
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
    compareLabel,
    normalizedRange
  } = getDateRange(query.range || 'all', query.date_on || null);

  const currentPeriodQuotes = quotes.filter((item) => isWithinRange(item.created_at, currentStart, currentEnd));
  const previousPeriodQuotes = quotes.filter((item) => isWithinRange(item.created_at, previousStart, previousEnd));

  const countByStatus = (items, statuses) => items.filter((item) => statuses.includes(item.status)).length;
  const sumTotals = (items) => roundCurrency(items.reduce((sum, item) => sum + Number(item.total || 0), 0));

  const currentMetrics = {
    total_quotes: currentPeriodQuotes.length,
    accepted_quotes: countByStatus(currentPeriodQuotes, ['accepted', 'paid']),
    pending_quotes: countByStatus(currentPeriodQuotes, ['pending']),
    draft_quotes: countByStatus(currentPeriodQuotes, ['draft']),
    rejected_quotes: countByStatus(currentPeriodQuotes, ['rejected']),
    expired_quotes: countByStatus(currentPeriodQuotes, ['expired']),
    total_amount: sumTotals(currentPeriodQuotes)
  };

  const previousMetrics = {
    total_quotes: previousPeriodQuotes.length,
    accepted_quotes: countByStatus(previousPeriodQuotes, ['accepted', 'paid']),
    pending_quotes: countByStatus(previousPeriodQuotes, ['pending']),
    draft_quotes: countByStatus(previousPeriodQuotes, ['draft']),
    rejected_quotes: countByStatus(previousPeriodQuotes, ['rejected']),
    expired_quotes: countByStatus(previousPeriodQuotes, ['expired']),
    total_amount: sumTotals(previousPeriodQuotes)
  };

  const overview = currentMetrics;

  const chartBuckets = buildDashboardChartBuckets(normalizedRange, query.date_on || null);
  const chartMap = new Map(
    chartBuckets.map((bucket) => [
      bucket.key,
      {
        label: bucket.label,
        quote_count: 0,
        total_amount: 0,
        accepted_count: 0,
        pending_count: 0,
        draft_count: 0,
        rejected_count: 0,
        expired_count: 0,
        sent_count: 0
      }
    ])
  );

  currentPeriodQuotes.forEach((item) => {
    const bucketKey = getDashboardChartBucketKey(item.created_at, normalizedRange, query.date_on || null);
    if (!bucketKey || !chartMap.has(bucketKey)) {
      return;
    }

    const bucket = chartMap.get(bucketKey);
    const normalizedStatus = normalizeStatusForDashboardMetrics(item.status);

    bucket.quote_count += 1;
    bucket.total_amount = roundCurrency(bucket.total_amount + Number(item.total || 0));

    if (normalizedStatus === 'accepted') bucket.accepted_count += 1;
    if (normalizedStatus === 'pending') bucket.pending_count += 1;
    if (normalizedStatus === 'draft') bucket.draft_count += 1;
    if (normalizedStatus === 'rejected') bucket.rejected_count += 1;
    if (normalizedStatus === 'expired') bucket.expired_count += 1;
    if (normalizedStatus === 'sent') bucket.sent_count += 1;
  });

  return {
    overview,
    growth: {
      compare_label: compareLabel,
      total_quotes: calculateGrowth(currentMetrics.total_quotes, previousMetrics.total_quotes),
      accepted_quotes: calculateGrowth(currentMetrics.accepted_quotes, previousMetrics.accepted_quotes),
      pending_quotes: calculateGrowth(currentMetrics.pending_quotes, previousMetrics.pending_quotes),
      draft_quotes: calculateGrowth(currentMetrics.draft_quotes, previousMetrics.draft_quotes),
      rejected_quotes: calculateGrowth(currentMetrics.rejected_quotes, previousMetrics.rejected_quotes),
      expired_quotes: calculateGrowth(currentMetrics.expired_quotes, previousMetrics.expired_quotes),
      total_amount: calculateGrowth(currentMetrics.total_amount, previousMetrics.total_amount),
      current_period: currentMetrics,
      previous_period: previousMetrics
    },
    chart: chartBuckets.map((bucket) => chartMap.get(bucket.key))
  };
}

async function updateQuoteStatus(salesQuoteId, status, user) {
  if (!QUOTE_STATUSES.includes(status)) {
    throw new Error('Invalid quote status');
  }

  const transaction = await db.sequelize.transaction();
  try {
    const quote = await db.sales_quotes.findOne({
      where: { sales_quote_id: salesQuoteId, ...buildQuoteAccessWhere(user) },
      transaction
    });

    if (!quote) {
      throw new Error('Quote not found');
    }

    const patch = {
      status,
      updated_at: new Date()
    };
    if (status === 'sent') patch.sent_at = new Date();
    if (status === 'viewed') patch.viewed_at = new Date();
    if (status === 'accepted' || status === 'paid') patch.accepted_at = new Date();
    if (status === 'rejected') patch.rejected_at = new Date();

    await quote.update(patch, { transaction });
    await recordActivity(transaction, salesQuoteId, status === 'sent' ? 'sent' : status === 'viewed' ? 'viewed' : status === 'accepted' ? 'accepted' : status === 'rejected' ? 'rejected' : 'status_changed', user.userId, `Quote marked as ${status}`, { status });
    await transaction.commit();
    return getQuoteById(salesQuoteId, user);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function sendQuoteProposal(salesQuoteId, payload, user) {
  const transaction = await db.sequelize.transaction();
  try {
    const quote = await db.sales_quotes.findOne({
      where: { sales_quote_id: salesQuoteId, ...buildQuoteAccessWhere(user) },
      transaction
    });

    if (!quote) {
      throw new Error('Quote not found');
    }

    const quoteDetails = await getQuoteById(salesQuoteId, user);
    if (!quoteDetails) {
      throw new Error('Quote not found');
    }

    const toEmail = payload?.to_email || quoteDetails.client_email;
    if (!toEmail) {
      throw new Error('Client email is required to send quote proposal');
    }

    const generatedPdfBuffer = payload?.attachment_content || payload?.pdf_base64
      ? null
      : await generateQuotePdfBuffer(quoteDetails);

    const emailResult = await sendCustomQuoteProposalEmail({
      to_email: toEmail,
      first_name: quoteDetails.client_name || '',
      shoot_type: quoteDetails.video_shoot_type || 'TBD',
      project_description: quoteDetails.project_description || 'TBD',
      location: quoteDetails.client_address || 'TBD',
      quote_validity: deriveQuoteValidityText(quoteDetails),
      add_ons: deriveQuoteAddOns(quoteDetails.line_items || []),
      includes: deriveQuoteIncludes(quoteDetails.line_items || []),
      proposal_amount: quoteDetails.total,
      attachment_content: payload?.attachment_content || payload?.pdf_base64 || (generatedPdfBuffer ? Buffer.from(generatedPdfBuffer).toString('base64') : null),
      attachment_filename: payload?.attachment_filename || `${quoteDetails.quote_number || 'custom-quote'}.pdf`,
      attachment_type: payload?.attachment_type || 'application/pdf'
    });

    if (!emailResult?.success) {
      throw new Error(
        typeof emailResult?.error === 'string'
          ? emailResult.error
          : 'Failed to send quote proposal email'
      );
    }

    await quote.update({
      status: 'sent',
      sent_at: new Date(),
      updated_at: new Date()
    }, { transaction });

    await recordActivity(
      transaction,
      salesQuoteId,
      'sent',
      user.userId,
      'Quote proposal email sent',
      { to_email: toEmail }
    );

    await transaction.commit();
    return getQuoteById(salesQuoteId, user);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function downloadQuotePdf(salesQuoteId, user) {
  const quoteDetails = await getQuoteById(salesQuoteId, user);
  if (!quoteDetails) {
    throw new Error('Quote not found');
  }

  const buffer = await generateQuotePdfBuffer(quoteDetails);

  return {
    buffer,
    filename: `${quoteDetails.quote_number || 'custom-quote'}.pdf`
  };
}

module.exports = {
  SECTION_TYPES,
  QUOTE_STATUSES,
  getCatalog,
  getAiEditingTypes,
  createAiEditingType,
  updateAiEditingType,
  deleteAiEditingType,
  createCatalogItem,
  updateCatalogItem,
  deleteCatalogItem,
  createQuote,
  duplicateQuote,
  updateQuote,
  convertQuoteToBooking,
  getQuoteById,
  getPublicQuoteById,
  listQuotes,
  getQuoteDashboard,
  updateQuoteStatus,
  sendQuoteProposal,
  downloadQuotePdf
};
