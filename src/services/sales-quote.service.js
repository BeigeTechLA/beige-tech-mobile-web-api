const { Op } = require('sequelize');
const db = require('../models');
const { sendCustomQuoteProposalEmail } = require('../utils/emailService');
const { generateQuotePdfBuffer } = require('../utils/quotePdf');

const SECTION_TYPES = ['service', 'addon', 'logistics', 'custom'];
const QUOTE_STATUSES = ['draft', 'pending', 'sent', 'viewed', 'accepted', 'rejected', 'expired'];
const DISCOUNT_TYPES = ['none', 'percentage', 'fixed_amount'];
const AI_EDITING_SERVICE_NAME = 'ai editing';
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

function getDateRange(range = 'all') {
  const now = new Date();

  if (range === '7days' || range === '30days' || range === '90days') {
    const days = Number(range.replace('days', ''));
    const currentStart = new Date(now);
    currentStart.setDate(currentStart.getDate() - days);

    const previousStart = new Date(currentStart);
    previousStart.setDate(previousStart.getDate() - days);

    return {
      currentStart,
      currentEnd: now,
      previousStart,
      previousEnd: currentStart,
      compareLabel: `vs previous ${days} days`
    };
  }

  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  return {
    currentStart: currentMonthStart,
    currentEnd: now,
    previousStart: previousMonthStart,
    previousEnd: currentMonthStart,
    compareLabel: 'vs last month'
  };
}

function isWithinRange(dateValue, start, end) {
  const date = new Date(dateValue);
  return date >= start && date < end;
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

function buildAiEditingTypesResponse() {
  return {
    video_edit_types: getUniqueEditingTypes(AI_EDITING_VIDEO_TYPE_MAP),
    photo_edit_types: getUniqueEditingTypes(AI_EDITING_PHOTO_TYPE_MAP)
  };
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

function extractAiEditingConfig(rawItem) {
  const baseConfig = parseConfig(rawItem.configuration || rawItem.configuration_json) || {};
  const configuration = {};

  const directKey = rawItem.editing_type_key ?? baseConfig.editing_type_key ?? null;
  const directLabel = rawItem.editing_type_label
    ?? rawItem.editing_type
    ?? baseConfig.editing_type_label
    ?? baseConfig.editing_type
    ?? null;
  const directCustom = rawItem.is_custom_editing_type ?? baseConfig.is_custom_editing_type;

  if (directLabel) {
    configuration.editing_type_key = String(directKey || normalizeLookupKey(directLabel));
    configuration.editing_type_label = String(directLabel);
    configuration.is_custom_editing_type = Boolean(directCustom);
    return configuration;
  }

  const firstVideoType = Array.isArray(rawItem.video_edit_types) ? rawItem.video_edit_types[0] : null;
  if (firstVideoType) {
    configuration.editing_type_key = normalizeLookupKey(firstVideoType);
    configuration.editing_type_label = String(firstVideoType);
    configuration.is_custom_editing_type = false;
    return configuration;
  }

  const firstPhotoType = Array.isArray(rawItem.photo_edit_types) ? rawItem.photo_edit_types[0] : null;
  if (firstPhotoType) {
    configuration.editing_type_key = normalizeLookupKey(firstPhotoType);
    configuration.editing_type_label = String(firstPhotoType);
    configuration.is_custom_editing_type = false;
    return configuration;
  }

  const firstCustomType = normalizeCustomEditingTypes(rawItem.custom_ai_editing_types)[0];
  if (firstCustomType) {
    configuration.editing_type_key = firstCustomType.key;
    configuration.editing_type_label = firstCustomType.value;
    configuration.is_custom_editing_type = true;
    return configuration;
  }

  return Object.keys(baseConfig).length ? baseConfig : null;
}

function deriveAiEditingItemName(rawItem, catalogItem, config) {
  if (rawItem.item_name || rawItem.name) {
    return rawItem.item_name || rawItem.name;
  }

  if (config?.editing_type_label) {
    return `AI Editing Type - ${config.editing_type_label}`;
  }

  return catalogItem?.name || 'AI Editing';
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

function generateQuoteNumber() {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
    String(now.getMilliseconds()).padStart(3, '0')
  ].join('');
  return `SQ-${stamp}`;
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
  return role === 'admin' || role === 'Admin';
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

function buildQuoteAccessWhere(user) {
  if (isAdminRole(user?.role)) return {};
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
    logistics: []
  };

  items.forEach((entry) => {
    const item = entry.toJSON();
    grouped[item.section_type].push({
      ...item,
      effective_rate: roundCurrency(item.default_rate ?? 0),
      effective_rate_type: item.rate_type,
      effective_rate_unit: item.rate_unit
    });
  });

  if (!grouped.service.length && !grouped.addon.length && !grouped.logistics.length) {
    return DEFAULT_FIGMA_CATALOG;
  }

  return grouped;
}

async function getAiEditingTypes() {
  return buildAiEditingTypesResponse();
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
    client_user_id: payload.client_user_id !== undefined ? payload.client_user_id : fallback.client_user_id || null,
    client_name: payload.client_name !== undefined ? payload.client_name : fallback.client_name || null,
    client_email: payload.client_email !== undefined ? payload.client_email : fallback.client_email || null,
    client_phone: payload.client_phone !== undefined ? payload.client_phone : fallback.client_phone || null,
    client_address: payload.client_address !== undefined ? payload.client_address : fallback.client_address || null
  };

  if (snapshot.client_user_id) {
    const [clientRecord, userRecord] = await Promise.all([
      db.clients.findOne({ where: { user_id: snapshot.client_user_id, is_active: 1 } }),
      db.users.findByPk(snapshot.client_user_id)
    ]);

    if (!snapshot.client_name) snapshot.client_name = clientRecord?.name || userRecord?.name || null;
    if (!snapshot.client_email) snapshot.client_email = clientRecord?.email || userRecord?.email || null;
    if (!snapshot.client_phone) snapshot.client_phone = clientRecord?.phone_number || userRecord?.phone_number || null;
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

  return rawItems.map((rawItem, index) => {
    const catalogItem = rawItem.catalog_item_id ? catalogMap.get(rawItem.catalog_item_id) : null;

    const sourceType = rawItem.source_type || (catalogItem ? 'catalog' : 'custom');
    const sectionType = rawItem.section_type || catalogItem?.section_type || 'custom';
    const rateType = resolveRateTypeValue(rawItem.rate_type, null, catalogItem);
    const rateUnit = resolveRateUnitValue(rawItem.rate_unit, null, catalogItem);
    const unitRate = resolveUnitRateValue(rawItem.unit_rate, null, catalogItem);
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
    const normalizedItemName = normalizeLookupKey(rawItem.item_name || rawItem.name || catalogItem?.name || '');
    const aiEditingConfig = normalizedItemName === normalizeLookupKey(AI_EDITING_SERVICE_NAME)
      ? extractAiEditingConfig(rawItem)
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

    const lineTotal = roundCurrency(unitRate * multiplier);

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
      unit_rate: unitRate,
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
    const assignedSalesRepId = isAdminRole(user.role)
      ? (payload.assigned_sales_rep_id || user.userId)
      : user.userId;

    const quote = await db.sales_quotes.create({
      quote_number: generateQuoteNumber(),
      lead_id: payload.lead_id || null,
      client_user_id: clientSnapshot.client_user_id,
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

    await quote.update({
      lead_id: payload.lead_id !== undefined ? payload.lead_id : quote.lead_id,
      client_user_id: clientSnapshot.client_user_id,
      assigned_sales_rep_id: assignedSalesRepId,
      pricing_mode: payload.pricing_mode || quote.pricing_mode,
      status: nextStatus,
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
      total: totals.total,
      notes: payload.notes !== undefined ? payload.notes : quote.notes,
      terms_conditions: payload.terms_conditions !== undefined ? payload.terms_conditions : quote.terms_conditions,
      updated_at: new Date()
    }, { transaction });

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

    await recordActivity(transaction, salesQuoteId, 'updated', user.userId, 'Quote updated');
    await transaction.commit();
    return getQuoteById(salesQuoteId, user);
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
  const where = {
    ...buildQuoteAccessWhere(user)
  };

  if (query.status && QUOTE_STATUSES.includes(query.status)) {
    where.status = query.status;
  }

  if (query.assigned_sales_rep_id && isAdminRole(user.role)) {
    where.assigned_sales_rep_id = Number(query.assigned_sales_rep_id);
  }

  if (query.search) {
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push({
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
  const where = {
    ...buildQuoteAccessWhere(user)
  };

  if (query.assigned_sales_rep_id && isAdminRole(user.role)) {
    where.assigned_sales_rep_id = Number(query.assigned_sales_rep_id);
  }

  const quotes = await db.sales_quotes.findAll({
    where,
    attributes: ['sales_quote_id', 'status', 'total', 'created_at'],
    raw: true
  });

  const { currentStart, currentEnd, previousStart, previousEnd, compareLabel } = getDateRange(query.range || 'all');

  const currentPeriodQuotes = quotes.filter((item) => isWithinRange(item.created_at, currentStart, currentEnd));
  const previousPeriodQuotes = quotes.filter((item) => isWithinRange(item.created_at, previousStart, previousEnd));

  const countByStatus = (items, statuses) => items.filter((item) => statuses.includes(item.status)).length;
  const sumTotals = (items) => roundCurrency(items.reduce((sum, item) => sum + Number(item.total || 0), 0));

  const currentMetrics = {
    total_quotes: currentPeriodQuotes.length,
    accepted_quotes: countByStatus(currentPeriodQuotes, ['accepted']),
    pending_quotes: countByStatus(currentPeriodQuotes, ['pending', 'sent', 'viewed']),
    draft_quotes: countByStatus(currentPeriodQuotes, ['draft']),
    rejected_quotes: countByStatus(currentPeriodQuotes, ['rejected']),
    expired_quotes: countByStatus(currentPeriodQuotes, ['expired']),
    total_amount: sumTotals(currentPeriodQuotes)
  };

  const previousMetrics = {
    total_quotes: previousPeriodQuotes.length,
    accepted_quotes: countByStatus(previousPeriodQuotes, ['accepted']),
    pending_quotes: countByStatus(previousPeriodQuotes, ['pending', 'sent', 'viewed']),
    draft_quotes: countByStatus(previousPeriodQuotes, ['draft']),
    rejected_quotes: countByStatus(previousPeriodQuotes, ['rejected']),
    expired_quotes: countByStatus(previousPeriodQuotes, ['expired']),
    total_amount: sumTotals(previousPeriodQuotes)
  };

  const overview = {
    total_quotes: quotes.length,
    accepted_quotes: quotes.filter((item) => item.status === 'accepted').length,
    pending_quotes: quotes.filter((item) => ['pending', 'sent', 'viewed'].includes(item.status)).length,
    draft_quotes: quotes.filter((item) => item.status === 'draft').length,
    rejected_quotes: quotes.filter((item) => item.status === 'rejected').length,
    expired_quotes: quotes.filter((item) => item.status === 'expired').length,
    total_amount: roundCurrency(quotes.reduce((sum, item) => sum + Number(item.total || 0), 0))
  };

  const chartMap = new Map();
  quotes.forEach((item) => {
    const date = new Date(item.created_at);
    const label = date.toLocaleString('en-US', { month: 'short' });
    const current = chartMap.get(label) || { label, quote_count: 0, total_amount: 0 };
    current.quote_count += 1;
    current.total_amount = roundCurrency(current.total_amount + Number(item.total || 0));
    chartMap.set(label, current);
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
    chart: Array.from(chartMap.values())
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
    if (status === 'accepted') patch.accepted_at = new Date();
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
  createCatalogItem,
  updateCatalogItem,
  deleteCatalogItem,
  createQuote,
  updateQuote,
  getQuoteById,
  getPublicQuoteById,
  listQuotes,
  getQuoteDashboard,
  updateQuoteStatus,
  sendQuoteProposal,
  downloadQuotePdf
};
