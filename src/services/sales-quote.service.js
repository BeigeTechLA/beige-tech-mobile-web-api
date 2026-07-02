const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../models');
const constants = require('../utils/constants');
const {
  sendCustomQuoteProposalEmail,
  sendQuoteAcceptedClientEmail,
  sendQuoteAcceptedSalesNotificationEmail
} = require('../utils/emailService');
const { generateQuotePdfBuffer } = require('../utils/quotePdf');
const { toAbsoluteBeigeAssetUrl } = require('../utils/common');
const { normalizeTime, resolveEventDateAndStartTime } = require('../utils/timezone');
const { extractCoordinatesFromPayload } = require('../utils/locationHelpers');
const accountCreditService = require('./account-credit.service');
const paymentLinksService = require('./payment-links.service');
const bookingPaymentSummaryService = require('./booking-payment-summary.service');
const { expireQuotesPastValidUntil } = require('./sales-quote-expiration.service');

const SECTION_TYPES = ['service', 'addon', 'logistics', 'custom'];
const QUOTE_STATUSES = ['draft', 'pending', 'partially_paid', 'sent', 'viewed', 'accepted', 'paid', 'rejected', 'expired'];
const DISCOUNT_TYPES = ['none', 'percentage', 'fixed_amount'];
const AI_EDITING_SERVICE_NAME = 'ai editing';
const CONVERTED_BOOKINGS_LEAD_SOURCE = 'converted bookings';
const QUOTE_EDIT_RESTRICTION_WINDOW_HOURS = 48;
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

function formatCurrency(value) {
  return `$${roundCurrency(value).toFixed(2)}`;
}

function formatSignedCurrency(value) {
  const amount = roundCurrency(value || 0);
  if (amount === 0) return formatCurrency(0);
  return `${amount > 0 ? '+' : '-'}${formatCurrency(Math.abs(amount))}`;
}

function parseQuoteActivityMetadata(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }

  return JSON.stringify(value);
}

function toPlainRecord(record) {
  if (!record) return null;
  return typeof record.get === 'function' ? record.get({ plain: true }) : record;
}

function normalizeLocationAddress(value) {
  if (value === undefined || value === null) return null;

  if (typeof value === 'object') {
    const candidate =
      value.address ||
      value.full_address ||
      value.formatted_address ||
      value.place_name ||
      value.name ||
      null;
    return normalizeLocationAddress(candidate);
  }

  const trimmed = String(value).trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      const parsedAddress = normalizeLocationAddress(parsed);
      if (parsedAddress) return parsedAddress;
    }
  } catch (_) {
    // Plain address strings are expected.
  }

  return trimmed;
}

function resolveQuoteLocationAddress(payload = {}, fallback = {}) {
  if (payload.client_address !== undefined) {
    return normalizeLocationAddress(payload.client_address);
  }
  if (payload.location !== undefined) {
    return normalizeLocationAddress(payload.location);
  }
  if (payload.event_location !== undefined) {
    return normalizeLocationAddress(payload.event_location);
  }
  return normalizeLocationAddress(
    fallback.client_address !== undefined
      ? fallback.client_address
      : fallback.location !== undefined
        ? fallback.location
        : fallback.event_location
  );
}

function normalizeQuoteVersionLineItems(lineItems = []) {
  return (Array.isArray(lineItems) ? lineItems : []).map((item) => {
    const plain = toPlainRecord(item) || {};
    return {
      line_item_id: plain.line_item_id || null,
      sales_quote_id: plain.sales_quote_id || null,
      catalog_item_id: plain.catalog_item_id || null,
      source_type: plain.source_type || 'catalog',
      section_type: plain.section_type || null,
      item_name: plain.item_name || null,
      description: plain.description || null,
      rate_type: plain.rate_type || 'flat',
      rate_unit: plain.rate_unit || null,
      quantity: Number(plain.quantity || 0),
      duration_hours: plain.duration_hours !== null && plain.duration_hours !== undefined ? Number(plain.duration_hours) : null,
      crew_size: plain.crew_size !== null && plain.crew_size !== undefined ? Number(plain.crew_size) : null,
      estimated_pricing: plain.estimated_pricing !== null && plain.estimated_pricing !== undefined ? Number(plain.estimated_pricing) : null,
      unit_rate: Number(plain.unit_rate || 0),
      line_total: Number(plain.line_total || 0),
      sort_order: Number(plain.sort_order || 0),
      is_active: plain.is_active !== undefined ? Boolean(plain.is_active) : true,
      created_at: plain.created_at || null,
      updated_at: plain.updated_at || null,
      catalog_item: plain.catalog_item ? {
        catalog_item_id: plain.catalog_item.catalog_item_id,
        section_type: plain.catalog_item.section_type,
        pricing_mode: plain.catalog_item.pricing_mode,
        name: plain.catalog_item.name,
        default_rate: plain.catalog_item.default_rate,
        rate_type: plain.catalog_item.rate_type,
        rate_unit: plain.catalog_item.rate_unit,
        is_active: plain.catalog_item.is_active !== undefined ? Boolean(plain.catalog_item.is_active) : null,
        is_system_default: plain.catalog_item.is_system_default !== undefined ? Boolean(plain.catalog_item.is_system_default) : null,
        display_order: plain.catalog_item.display_order,
        created_by_user_id: plain.catalog_item.created_by_user_id || null,
        updated_by_user_id: plain.catalog_item.updated_by_user_id || null,
        created_at: plain.catalog_item.created_at || null,
        updated_at: plain.catalog_item.updated_at || null
      } : null,
      configuration_json: plain.configuration_json || null,
      configuration: parseConfig(plain.configuration_json)
    };
  });
}

function buildQuoteVersionSnapshot(quoteRecord, lineItems = []) {
  const quote = toPlainRecord(quoteRecord) || {};

  return {
    sales_quote_id: quote.sales_quote_id,
    quote_number: quote.quote_number || null,
    lead_id: quote.lead_id || null,
    client_user_id: quote.client_user_id || null,
    client_id: quote.client_id || null,
    created_by_user_id: quote.created_by_user_id || null,
    assigned_sales_rep_id: quote.assigned_sales_rep_id || null,
    pricing_mode: quote.pricing_mode || null,
    status: quote.status || null,
    client_name: quote.client_name || null,
    client_email: quote.client_email || null,
    client_phone: quote.client_phone || null,
    client_address: quote.client_address || null,
    project_description: quote.project_description || null,
    video_shoot_type: quote.video_shoot_type || null,
    booking_type: quote.booking_type || null,
    time_zone: quote.time_zone || null,
    start_date: quote.start_date || null,
    start_time: normalizeTime(quote.start_time) || null,
    end_time: normalizeTime(quote.end_time) || null,
    booking_days: parseBookingDaysValue(quote.booking_days),
    quote_validity_days: quote.quote_validity_days || null,
    valid_until: quote.valid_until || null,
    discount_type: quote.discount_type || 'none',
    discount_value: Number(quote.discount_value || 0),
    discount_amount: Number(quote.discount_amount || 0),
    tax_type: quote.tax_type || null,
    tax_rate: Number(quote.tax_rate || 0),
    tax_amount: Number(quote.tax_amount || 0),
    subtotal: Number(quote.subtotal || 0),
    total: Number(quote.total || 0),
    notes: quote.notes || null,
    terms_conditions: quote.terms_conditions || null,
    sent_at: quote.sent_at || null,
    viewed_at: quote.viewed_at || null,
    accepted_at: quote.accepted_at || null,
    rejected_at: quote.rejected_at || null,
    created_at: quote.created_at || null,
    updated_at: quote.updated_at || null,
    line_items: normalizeQuoteVersionLineItems(lineItems)
  };
}

function getQuoteVersionApprovalMetadata(version) {
  const plain = toPlainRecord(version) || {};
  const sourceActivity = plain.source_activity || null;
  const sourceMetadata = parseConfig(sourceActivity?.metadata_json) || {};
  const snapshot = parseConfig(plain.quote_snapshot_json) || {};

  return {
    approval_status:
      sourceMetadata.approval_status ||
      snapshot.approval_status ||
      null,
    change_request_status:
      sourceMetadata.approval_status ||
      snapshot.change_request_status ||
      null,
    review_status:
      sourceMetadata.approval_status ||
      snapshot.review_status ||
      null,
    requested_at:
      sourceMetadata.approval_requested_at ||
      sourceActivity?.created_at ||
      null,
    reviewed_at:
      sourceMetadata.reviewed_at ||
      sourceMetadata.approved_at ||
      sourceMetadata.rejected_at ||
      null,
    review_notes: sourceMetadata.review_notes || null,
    source_activity_id: plain.source_activity_id || sourceActivity?.activity_id || null
  };
}

function isRejectedQuoteVersion(version) {
  const approvalMetadata = getQuoteVersionApprovalMetadata(version);
  return ['rejected', 'declined', 'denied'].includes(
    String(approvalMetadata.approval_status || '').trim().toLowerCase()
  );
}

function isUsableQuoteVersion(version) {
  const approvalMetadata = getQuoteVersionApprovalMetadata(version);
  const approvalStatus = String(approvalMetadata.approval_status || '').trim().toLowerCase();
  return !approvalStatus || approvalStatus === 'approved';
}

function buildQuoteVersionListItem(version, currentVersionNumber = null) {
  const plain = toPlainRecord(version) || {};
  const approvalMetadata = getQuoteVersionApprovalMetadata(version);
  return {
    sales_quote_version_id: plain.sales_quote_version_id || null,
    version_number: Number(plain.version_number || 0),
    version_label: `Quote Version ${plain.version_number || 0}`,
    change_reason: plain.change_reason || null,
    source_activity_id: approvalMetadata.source_activity_id,
    approval_status: approvalMetadata.approval_status,
    change_request_status: approvalMetadata.change_request_status,
    review_status: approvalMetadata.review_status,
    approval_requested_at: approvalMetadata.requested_at,
    reviewed_at: approvalMetadata.reviewed_at,
    review_notes: approvalMetadata.review_notes,
    created_at: plain.created_at || null,
    created_by_user_id: plain.created_by_user_id || null,
    created_by: plain.created_by
      ? {
          id: plain.created_by.id,
          name: plain.created_by.name,
          email: plain.created_by.email
        }
      : null,
    is_current: currentVersionNumber !== null ? Number(plain.version_number || 0) === Number(currentVersionNumber) : null
  };
}

function normalizePersistedDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value.fn) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

async function normalizeQuoteVersionSnapshotForResponse(snapshot = {}) {
  const normalizedQuote = {
    ...snapshot,
    created_at: normalizePersistedDateValue(snapshot.created_at),
    updated_at: normalizePersistedDateValue(snapshot.updated_at),
    sent_at: normalizePersistedDateValue(snapshot.sent_at),
    viewed_at: normalizePersistedDateValue(snapshot.viewed_at),
    accepted_at: normalizePersistedDateValue(snapshot.accepted_at),
    rejected_at: normalizePersistedDateValue(snapshot.rejected_at)
  };

  const lineItems = Array.isArray(snapshot.line_items) ? snapshot.line_items : [];
  const missingCatalogItemIds = [...new Set(
    lineItems
      .filter((item) => item && item.catalog_item_id && !item.catalog_item)
      .map((item) => Number(item.catalog_item_id))
      .filter((id) => Number.isInteger(id) && id > 0)
  )];

  const catalogItems = missingCatalogItemIds.length
    ? await db.quote_catalog_items.findAll({
        where: { catalog_item_id: { [Op.in]: missingCatalogItemIds } },
        raw: true
      })
    : [];
  const catalogMap = new Map(catalogItems.map((item) => [Number(item.catalog_item_id), item]));

  normalizedQuote.line_items = normalizeQuoteVersionLineItems(
    lineItems.map((item) => ({
      ...item,
      sales_quote_id: item?.sales_quote_id || snapshot.sales_quote_id || null,
      catalog_item: item?.catalog_item || catalogMap.get(Number(item?.catalog_item_id || 0)) || null
    }))
  );

  return normalizedQuote;
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

function buildDateTimeFromDateAndTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) return null;

  const normalizedTime = normalizeTime(timeValue);
  if (!normalizedTime) return null;

  const parsedDateTime = new Date(`${String(dateValue).trim()}T${normalizedTime}`);
  return Number.isNaN(parsedDateTime.getTime()) ? null : parsedDateTime;
}

function buildQuoteEditGuardrailPayload({
  canEvaluateRestriction,
  isRestricted = false,
  shootStartAt = null,
  hoursUntilShootStart = null,
  bookingId = null,
  scheduleStatus,
  message,
  timeZone = null,
  quoteNumber = null,
  clientName = null
}) {
  const normalizedHoursUntilShootStart = hoursUntilShootStart !== null && hoursUntilShootStart !== undefined
    ? roundCurrency(hoursUntilShootStart)
    : null;
  const showRestrictionModal = Boolean(canEvaluateRestriction && isRestricted);
  if (!canEvaluateRestriction) {
    return {
      show_restriction_modal: false
    };
  }

  if (!showRestrictionModal) {
    return {
      show_restriction_modal: false
    };
  }

  return {
    show_restriction_modal: true,
    modal: {
      quote_id: quoteNumber,
      client_name: clientName,
      shoot_start_at: shootStartAt ? shootStartAt.toISOString() : null,
      hours_remaining: normalizedHoursUntilShootStart
    },
    message: message || 'Quote edits are restricted because the shoot starts within 48 hours.',
    context: {
      booking_id: bookingId,
      schedule_status: scheduleStatus,
      time_zone: timeZone || null
    }
  };
}

async function getQuoteEditGuardrails(quote, transaction = null) {
  const quoteNumber = quote?.quote_number || null;
  const clientName = quote?.client_name || null;
  const billingState = await resolveQuoteBillingState(quote, transaction);

  if (!billingState.is_collected) {
    return buildQuoteEditGuardrailPayload({
      canEvaluateRestriction: false,
      quoteNumber,
      clientName
    });
  }

  if (!quote?.lead_id) {
    return buildQuoteEditGuardrailPayload({
      canEvaluateRestriction: false,
      scheduleStatus: 'missing_booking_schedule',
      message: 'Shoot start time is not available yet because this quote is not linked to a scheduled booking.',
      quoteNumber,
      clientName
    });
  }

  const linkedLead = await db.sales_leads.findOne({
    where: { lead_id: quote.lead_id },
    attributes: ['booking_id'],
    transaction,
    raw: true
  });

  if (!linkedLead?.booking_id) {
    return buildQuoteEditGuardrailPayload({
      canEvaluateRestriction: false,
      scheduleStatus: 'missing_booking_schedule',
      message: 'Shoot start time is not available yet because this quote does not have a linked booking schedule.',
      quoteNumber,
      clientName
    });
  }

  const bookingId = linkedLead.booking_id;
  const booking = await db.stream_project_booking.findByPk(bookingId, {
    attributes: ['stream_project_booking_id', 'event_date', 'start_time'],
    transaction
  });

  const bookingDays = db.stream_project_booking_days
    ? await db.stream_project_booking_days.findAll({
        where: { stream_project_booking_id: bookingId },
        attributes: ['event_date', 'start_time', 'time_zone'],
        order: [['event_date', 'ASC'], ['start_time', 'ASC'], ['stream_project_booking_day_id', 'ASC']],
        transaction,
        raw: true
      })
    : [];

  const firstScheduledDay = (bookingDays || []).find((day) => day?.event_date && day?.start_time);
  const fallbackDate = booking?.event_date || null;
  const fallbackTime = booking?.start_time || null;
  const fallbackDateTime = buildDateTimeFromDateAndTime(fallbackDate, fallbackTime);
  const scheduledDateTime = firstScheduledDay
    ? buildDateTimeFromDateAndTime(firstScheduledDay.event_date, firstScheduledDay.start_time)
    : fallbackDateTime;

  if (!scheduledDateTime) {
    return buildQuoteEditGuardrailPayload({
      canEvaluateRestriction: false,
      bookingId,
      scheduleStatus: fallbackDate || fallbackTime ? 'incomplete_schedule' : 'missing_booking_schedule',
      timeZone: firstScheduledDay?.time_zone || null,
      message: 'Shoot start time is not available yet. The 48-hour edit restriction will apply once the booking schedule has both a date and start time.',
      quoteNumber,
      clientName
    });
  }

  const hoursUntilShootStart = roundCurrency((scheduledDateTime.getTime() - Date.now()) / (60 * 60 * 1000));

  return buildQuoteEditGuardrailPayload({
    canEvaluateRestriction: true,
    isRestricted: hoursUntilShootStart <= QUOTE_EDIT_RESTRICTION_WINDOW_HOURS,
    shootStartAt: scheduledDateTime,
    hoursUntilShootStart,
    bookingId,
    scheduleStatus: 'scheduled',
    timeZone: firstScheduledDay?.time_zone || null,
    quoteNumber,
    clientName,
    message: hoursUntilShootStart <= QUOTE_EDIT_RESTRICTION_WINDOW_HOURS
      ? 'Quote edits are restricted because the shoot starts within 48 hours.'
      : 'Quote can be edited without the 48-hour restriction.'
  });
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

function getQuoteAcceptTokenSecret() {
  return process.env.JWT_SECRET || 'quote-accept-secret';
}

function buildQuotePreviewUrl(quoteKey) {
  const frontendBaseUrl = String(process.env.FRONTEND_URL || 'http://localhost:3000').trim().replace(/\/+$/, '');
  return `${frontendBaseUrl}/quotes/preview?quoteKey=${encodeURIComponent(quoteKey)}`;
}

function verifyQuoteAcceptToken(token) {
  if (!token) {
    throw new Error('Accept token is required');
  }

  try {
    const decoded = jwt.verify(token, getQuoteAcceptTokenSecret());
    if (decoded?.action !== 'accept_quote' || !decoded?.sales_quote_id) {
      throw new Error('Invalid accept token');
    }

    return decoded;
  } catch (error) {
    throw new Error('Invalid accept token');
  }
}

async function getQuoteAcceptancePreview(token) {
  const decoded = verifyQuoteAcceptToken(token);
  const salesQuoteId = Number(decoded.sales_quote_id);

  if (!Number.isInteger(salesQuoteId) || salesQuoteId <= 0) {
    throw new Error('Invalid accept token');
  }

  await expireQuotesPastValidUntil();

  const quote = await db.sales_quotes.findOne({
    where: { sales_quote_id: salesQuoteId }
  });

  if (!quote) {
    throw new Error('Quote not found');
  }

  if (decoded.quote_number && quote.quote_number !== decoded.quote_number) {
    throw new Error('Invalid accept token');
  }

  if (
    decoded.client_email &&
    quote.client_email &&
    String(decoded.client_email).toLowerCase() !== String(quote.client_email).toLowerCase()
  ) {
    throw new Error('Invalid accept token');
  }

  const status = String(quote.status || '').toLowerCase();
  const alreadyAccepted = ['accepted', 'paid'].includes(status);
  const blockedReason = ['rejected', 'expired'].includes(status) ? status : null;

  return {
    sales_quote_id: quote.sales_quote_id,
    quote_number: quote.quote_number || decoded.quote_number || `Q-${quote.sales_quote_id}`,
    client_name: quote.client_name || null,
    client_email: quote.client_email || null,
    status,
    alreadyAccepted,
    canAccept: !alreadyAccepted && !blockedReason,
    blockedReason
  };
}

function deriveQuoteAcceptanceEmailPayload(quoteDetails) {
  const paymentSummary = buildQuoteProposalPaymentSummary(quoteDetails);

  return {
    to_email: quoteDetails.client_email || null,
    client_name: quoteDetails.client_name || 'there',
    client_email: quoteDetails.client_email || null,
    client_phone: quoteDetails.client_phone || null,
    quote_number: quoteDetails.quote_number || `Q-${quoteDetails.sales_quote_id}`,
    shoot_type: quoteDetails.video_shoot_type || 'TBD',
    project_description: quoteDetails.project_description || 'TBD',
    location: quoteDetails.client_address || 'TBD',
    proposal_amount: paymentSummary.amount_due,
    accepted_amount_label: paymentSummary.is_additional_payment
      ? 'Additional Amount Accepted'
      : paymentSummary.is_reduced_payment
        ? 'Updated Paid Amount'
        : paymentSummary.is_partial_payment
          ? 'Remaining Amount Accepted'
          : 'Accepted Amount',
    is_additional_payment: paymentSummary.is_additional_payment,
    is_reduced_payment: paymentSummary.is_reduced_payment,
    is_partial_payment: paymentSummary.is_partial_payment,
    previously_paid_amount: paymentSummary.previously_paid_amount,
    revised_total: paymentSummary.revised_total,
    additional_amount: paymentSummary.additional_amount,
    reduced_amount: paymentSummary.reduced_amount,
    payment_note: paymentSummary.payment_note,
    accepted_at: quoteDetails.accepted_at
      ? new Date(quoteDetails.accepted_at).toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
      : new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
  };
}

function buildQuoteInvoicePricingData(quoteDetails = {}) {
  const lineItems = Array.isArray(quoteDetails.line_items) ? quoteDetails.line_items : [];
  const total = Number(quoteDetails.total || 0);
  const subtotal = Number(quoteDetails.subtotal || 0);
  const discountAmount = Number(quoteDetails.discount_amount || 0);
  const priceAfterDiscount = roundCurrency(subtotal - discountAmount);
  const summaryBalance = getBookingPaymentSummaryBalance(quoteDetails);

  if (summaryBalance?.amount_due > 0 && summaryBalance.previously_paid_amount > 0) {
    return {
      source: 'sales_quote_acceptance_remaining_balance',
      is_paid: false,
      total: summaryBalance.amount_due,
      total_before_credit: summaryBalance.amount_due,
      credit_applied: 0,
      subtotal: summaryBalance.amount_due,
      discount_amount: 0,
      price_after_discount: summaryBalance.amount_due,
      tax_type: null,
      tax_rate: 0,
      tax_amount: 0,
      line_items: [
        {
          name: 'Remaining balance',
          quantity: 1,
          unit_price: summaryBalance.amount_due,
          total: summaryBalance.amount_due
        }
      ]
    };
  }

  return {
    source: 'sales_quote_acceptance',
    is_paid: false,
    total,
    total_before_credit: total,
    credit_applied: 0,
    subtotal,
    discount_amount: discountAmount,
    price_after_discount: priceAfterDiscount,
    tax_type: quoteDetails.tax_type || null,
    tax_rate: Number(quoteDetails.tax_rate || 0),
    tax_amount: Number(quoteDetails.tax_amount || 0),
    line_items: lineItems.map((item) => ({
      name: item.item_name || item.name || 'Service',
      quantity: Number(item.quantity || 1),
      unit_price: Number(item.unit_rate || item.estimated_pricing || 0),
      total: Number(item.line_total || 0)
    }))
  };
}

function getBookingPaymentSummaryBalance(quoteDetails = {}) {
  const paymentSummary = quoteDetails.payment_summary || null;
  if (!paymentSummary) return null;

  const revisedTotal = roundCurrency(paymentSummary.quote_total || quoteDetails.total || 0);
  const previouslyPaidAmount = roundCurrency(paymentSummary.paid_amount || 0);
  const amountDue = Math.max(roundCurrency(paymentSummary.due_amount || 0), 0);
  const paymentStatus = String(paymentSummary.payment_status || '').toLowerCase();

  if (!(revisedTotal > 0) || !(previouslyPaidAmount > 0)) return null;

  if (['paid', 'succeeded', 'completed', 'success'].includes(paymentStatus) && amountDue <= 0) {
    return {
      amount_due: 0,
      previously_paid_amount: previouslyPaidAmount,
      revised_total: revisedTotal,
      payment_status: paymentStatus
    };
  }

  if (amountDue >= revisedTotal && previouslyPaidAmount <= 0) return null;

  return {
    amount_due: amountDue,
    previously_paid_amount: previouslyPaidAmount,
    revised_total: revisedTotal,
    payment_status: paymentStatus
  };
}

function getApprovedAdditionalPaymentDue(quoteDetails = {}) {
  const additionalPayment = quoteDetails.additional_payment || quoteDetails.partial_payment || null;
  if (!additionalPayment) return null;

  const outstandingAmount = roundCurrency(additionalPayment.outstanding_amount || additionalPayment.additional_amount || 0);
  const approvalStatus = String(additionalPayment.approval_status || '').toLowerCase();
  const paymentStatus = String(additionalPayment.payment_status || '').toLowerCase();

  if (!(outstandingAmount > 0)) return null;
  if (approvalStatus && approvalStatus !== 'approved') return null;
  if (['paid', 'succeeded', 'completed', 'success'].includes(paymentStatus)) return null;

  return {
    ...additionalPayment,
    outstanding_amount: outstandingAmount,
    additional_amount: roundCurrency(additionalPayment.additional_amount || outstandingAmount),
    previously_paid_amount: roundCurrency(additionalPayment.previously_paid_amount || 0),
    revised_total: roundCurrency(additionalPayment.revised_total || quoteDetails.total || 0)
  };
}

function getApprovedReducedPaymentNotice(quoteDetails = {}) {
  const reducedPayment = quoteDetails.reduced_payment || null;
  if (!reducedPayment) return null;

  const reducedAmount = roundCurrency(reducedPayment.reduced_amount || reducedPayment.refund_pending_amount || 0);
  const approvalStatus = String(reducedPayment.approval_status || '').toLowerCase();

  if (!(reducedAmount > 0)) return null;
  if (approvalStatus && approvalStatus !== 'approved') return null;

  return {
    ...reducedPayment,
    reduced_amount: reducedAmount,
    refund_pending_amount: roundCurrency(reducedPayment.refund_pending_amount || reducedAmount),
    previously_paid_amount: roundCurrency(reducedPayment.previously_paid_amount || 0),
    revised_total: roundCurrency(reducedPayment.revised_total || quoteDetails.total || 0)
  };
}

function getBlockedQuotePaymentChange(quoteDetails = {}) {
  const additionalPayment = quoteDetails.additional_payment || quoteDetails.partial_payment || null;
  const reducedPayment = quoteDetails.reduced_payment || null;
  const change = additionalPayment || reducedPayment;
  if (!change) return null;

  const approvalStatus = String(change.approval_status || '').toLowerCase();
  const additionalAmount = roundCurrency(change.outstanding_amount || change.additional_amount || 0);
  const reducedAmount = roundCurrency(change.reduced_amount || change.refund_pending_amount || 0);
  const hasOpenChange = additionalAmount > 0 || reducedAmount > 0;

  if (!hasOpenChange) return null;
  if (approvalStatus === 'approved') return null;

  return {
    type: additionalAmount > 0 ? 'increase' : 'decrease',
    approval_status: approvalStatus || 'pending',
    amount: additionalAmount > 0 ? additionalAmount : reducedAmount
  };
}

function assertQuotePaymentChangeApproved(quoteDetails = {}) {
  const blockedChange = getBlockedQuotePaymentChange(quoteDetails);
  if (!blockedChange) return;

  const message = blockedChange.approval_status === 'rejected'
    ? `This paid quote ${blockedChange.type} request was rejected, so it cannot be sent to the client.`
    : `This paid quote ${blockedChange.type} request is pending admin approval. Approve it before sending the quote or payment link to the client.`;
  const error = new Error(message);
  error.statusCode = 409;
  throw error;
}

function buildAdditionalQuoteInvoicePricingData(additionalPayment = {}) {
  const additionalAmount = roundCurrency(additionalPayment.outstanding_amount || additionalPayment.additional_amount || 0);

  return {
    source: 'quote_additional_amount',
    is_paid: false,
    total: additionalAmount,
    total_before_credit: additionalAmount,
    credit_applied: 0,
    subtotal: additionalAmount,
    discount_amount: 0,
    price_after_discount: additionalAmount,
    tax_type: null,
    tax_rate: 0,
    tax_amount: 0,
    line_items: [
      {
        name: 'Additional payment for revised quote',
        quantity: 1,
        unit_price: additionalAmount,
        total: additionalAmount
      }
    ]
  };
}

function buildQuoteProposalPaymentSummary(quoteDetails = {}) {
  const additionalPayment = getApprovedAdditionalPaymentDue(quoteDetails);
  if (!additionalPayment) {
    const reducedPayment = getApprovedReducedPaymentNotice(quoteDetails);
    if (reducedPayment) {
      return {
        is_additional_payment: false,
        is_reduced_payment: true,
        is_partial_payment: false,
        proposal_amount_label: 'Updated Paid Quote Total',
        amount_due: roundCurrency(reducedPayment.revised_total || quoteDetails.total || 0),
        previously_paid_amount: roundCurrency(reducedPayment.previously_paid_amount || 0),
        revised_total: roundCurrency(reducedPayment.revised_total || quoteDetails.total || 0),
        reduced_amount: roundCurrency(reducedPayment.reduced_amount || reducedPayment.refund_pending_amount || 0),
        payment_note: `You have already paid ${formatCurrency(reducedPayment.previously_paid_amount || 0)}. Your approved revised quote total is ${formatCurrency(reducedPayment.revised_total || quoteDetails.total || 0)}, so no additional payment is due. The ${formatCurrency(reducedPayment.reduced_amount || reducedPayment.refund_pending_amount || 0)} reduction has been recorded as account credit.`
      };
    }

    const summaryBalance = getBookingPaymentSummaryBalance(quoteDetails);
    if (summaryBalance) {
      const amountDue = roundCurrency(summaryBalance.amount_due || 0);
      return {
        is_additional_payment: false,
        is_reduced_payment: false,
        is_partial_payment: amountDue > 0,
        proposal_amount_label: amountDue > 0 ? 'Remaining Amount Due' : 'Amount Due',
        amount_due: amountDue,
        previously_paid_amount: summaryBalance.previously_paid_amount,
        revised_total: summaryBalance.revised_total,
        remaining_amount: amountDue,
        payment_note: amountDue > 0
          ? `You have already paid ${formatCurrency(summaryBalance.previously_paid_amount)}. Your quote total is ${formatCurrency(summaryBalance.revised_total)}, so only the remaining ${formatCurrency(amountDue)} is due now.`
          : `You have already paid ${formatCurrency(summaryBalance.previously_paid_amount)}. No additional payment is due for this quote.`
      };
    }

    return {
      is_additional_payment: false,
      is_reduced_payment: false,
      is_partial_payment: false,
      amount_due: roundCurrency(quoteDetails.total || 0),
      proposal_amount_label: 'Estimate Proposal Amount'
    };
  }

  return {
    is_additional_payment: true,
    is_reduced_payment: false,
    is_partial_payment: false,
    proposal_amount_label: 'Additional Amount Due',
    amount_due: roundCurrency(additionalPayment.outstanding_amount || additionalPayment.additional_amount || 0),
    previously_paid_amount: roundCurrency(additionalPayment.previously_paid_amount || 0),
    revised_total: roundCurrency(additionalPayment.revised_total || quoteDetails.total || 0),
    additional_amount: roundCurrency(additionalPayment.additional_amount || additionalPayment.outstanding_amount || 0),
    payment_note: `You have already paid ${formatCurrency(additionalPayment.previously_paid_amount || 0)}. Your revised quote total is ${formatCurrency(additionalPayment.revised_total || quoteDetails.total || 0)}, so only the additional ${formatCurrency(additionalPayment.outstanding_amount || additionalPayment.additional_amount || 0)} is due now.`
  };
}

async function buildQuoteAcceptancePaymentDetails({ bookingId, quoteDetails }) {
  const parsedBookingId = Number(bookingId);
  if (!Number.isInteger(parsedBookingId) || parsedBookingId <= 0) {
    return null;
  }

  const booking = await db.stream_project_booking.findOne({
    where: { stream_project_booking_id: parsedBookingId },
    include: [
      { model: db.users, as: 'user', required: false },
      {
        model: db.quotes,
        as: 'primary_quote',
        required: false,
        include: [{ model: db.quote_line_items, as: 'line_items', required: false }]
      }
    ]
  });

  if (!booking) {
    return null;
  }

  assertQuotePaymentChangeApproved(quoteDetails);

  const proposalPaymentSummary = buildQuoteProposalPaymentSummary(quoteDetails);
  const finalPayableAmount = roundCurrency(proposalPaymentSummary?.amount_due || 0);

  if (finalPayableAmount <= 0) {
    return {
      booking_id: parsedBookingId,
      invoice_id: null,
      invoice_number: null,
      payment_url: null,
      invoice_pdf: null,
      requires_payment: false,
      amount_due: 0
    };
  }

  const additionalPayment = getApprovedAdditionalPaymentDue(quoteDetails);
  if (additionalPayment) {
    if (additionalPayment.invoice_url) {
      return {
        booking_id: parsedBookingId,
        invoice_id: null,
        invoice_number: additionalPayment.invoice_number || null,
        payment_url: additionalPayment.invoice_url || null,
        invoice_pdf: additionalPayment.invoice_pdf || null,
        is_additional_payment: true,
        additional_amount: additionalPayment.additional_amount,
        previously_paid_amount: additionalPayment.previously_paid_amount,
        revised_total: additionalPayment.revised_total
      };
    }

    const stripeInvoice = await paymentLinksService.createStripeInvoice(
      booking,
      buildAdditionalQuoteInvoicePricingData(additionalPayment),
      {
        recipientOverride: {
          email: quoteDetails.client_email || null,
          name: quoteDetails.client_name || null
        },
        forceNewInvoice: true,
        descriptionOverride: `Additional payment for revised quote - ${booking.project_name || 'Project'}`,
        metadata: {
          payment_source: 'additional_invoice',
          sales_quote_id: String(quoteDetails.sales_quote_id || '')
        }
      }
    );

    if (db.invoice_send_history) {
      await db.invoice_send_history.create({
        booking_id: parsedBookingId,
        quote_id: quoteDetails.sales_quote_id || null,
        lead_id: quoteDetails.lead_id || null,
        client_name: quoteDetails.client_name || null,
        client_email: quoteDetails.client_email || null,
        invoice_number: stripeInvoice?.number || null,
        invoice_url: stripeInvoice?.hosted_invoice_url || null,
        invoice_pdf: stripeInvoice?.invoice_pdf || null,
        payment_status: 'pending',
        sent_by_user_id: null,
        sent_at: new Date()
      });
    }

    return {
      booking_id: parsedBookingId,
      invoice_id: stripeInvoice?.id || null,
      invoice_number: stripeInvoice?.number || null,
      payment_url: stripeInvoice?.hosted_invoice_url || null,
      invoice_pdf: stripeInvoice?.invoice_pdf || null,
      is_additional_payment: true,
      additional_amount: additionalPayment.additional_amount,
      previously_paid_amount: additionalPayment.previously_paid_amount,
      revised_total: additionalPayment.revised_total
    };
  }

  const reducedPayment = getApprovedReducedPaymentNotice(quoteDetails);
  if (reducedPayment) {
    if (reducedPayment.invoice_url) {
      return {
        booking_id: parsedBookingId,
        invoice_id: null,
        invoice_number: reducedPayment.invoice_number || null,
        payment_url: reducedPayment.invoice_url || null,
        invoice_pdf: reducedPayment.invoice_pdf || null,
        is_reduced_payment: true,
        requires_payment: false,
        reduced_amount: reducedPayment.reduced_amount,
        previously_paid_amount: reducedPayment.previously_paid_amount,
        revised_total: reducedPayment.revised_total
      };
    }

    const paidInvoice = await paymentLinksService.createPaidStripeInvoice(
      booking,
      buildQuoteInvoicePricingData(quoteDetails),
      {
        recipientOverride: {
          email: quoteDetails.client_email || null,
          name: quoteDetails.client_name || null
        }
      }
    );

    if (db.invoice_send_history) {
      await db.invoice_send_history.create({
        booking_id: parsedBookingId,
        quote_id: quoteDetails.sales_quote_id || null,
        lead_id: quoteDetails.lead_id || null,
        client_name: quoteDetails.client_name || null,
        client_email: quoteDetails.client_email || null,
        invoice_number: paidInvoice?.number || null,
        invoice_url: paidInvoice?.hosted_invoice_url || null,
        invoice_pdf: paidInvoice?.invoice_pdf || null,
        payment_status: 'paid',
        sent_by_user_id: null,
        sent_at: new Date()
      });
    }

    return {
      booking_id: parsedBookingId,
      invoice_id: paidInvoice?.id || null,
      invoice_number: paidInvoice?.number || null,
      payment_url: paidInvoice?.hosted_invoice_url || null,
      invoice_pdf: paidInvoice?.invoice_pdf || null,
      is_reduced_payment: true,
      requires_payment: false,
      reduced_amount: reducedPayment.reduced_amount,
      previously_paid_amount: reducedPayment.previously_paid_amount,
      revised_total: reducedPayment.revised_total
    };
  }

  const summaryBalance = getBookingPaymentSummaryBalance(quoteDetails);
  if (summaryBalance && summaryBalance.amount_due <= 0) {
    return {
      booking_id: parsedBookingId,
      invoice_id: null,
      invoice_number: null,
      payment_url: null,
      invoice_pdf: null,
      requires_payment: false,
      is_partial_payment: false,
      previously_paid_amount: summaryBalance.previously_paid_amount,
      revised_total: summaryBalance.revised_total,
      remaining_amount: 0
    };
  }

  const stripeInvoice = await paymentLinksService.createStripeInvoice(
    booking,
    buildQuoteInvoicePricingData(quoteDetails),
    {
      recipientOverride: {
        email: quoteDetails.client_email || null,
        name: quoteDetails.client_name || null
      }
    }
  );

  return {
    booking_id: parsedBookingId,
    invoice_id: stripeInvoice?.id || null,
    invoice_number: stripeInvoice?.number || null,
    payment_url: stripeInvoice?.hosted_invoice_url || null,
    invoice_pdf: stripeInvoice?.invoice_pdf || null,
    ...(summaryBalance?.amount_due > 0 ? {
      is_partial_payment: true,
      previously_paid_amount: summaryBalance.previously_paid_amount,
      revised_total: summaryBalance.revised_total,
      remaining_amount: summaryBalance.amount_due
    } : {})
  };
}

async function markZeroPayableQuoteBookingPaid({
  bookingId,
  salesQuoteId,
  quoteDetails,
  leadId = null,
  transaction
}) {
  const parsedBookingId = Number(bookingId);
  if (!Number.isInteger(parsedBookingId) || parsedBookingId <= 0) {
    return null;
  }

  const proposalPaymentSummary = buildQuoteProposalPaymentSummary(quoteDetails);
  const finalPayableAmount = roundCurrency(proposalPaymentSummary?.amount_due || 0);

  if (finalPayableAmount > 0) {
    return null;
  }

  const now = new Date();
  const existingPaymentSummary = quoteDetails?.payment_summary || null;
  const quoteTotal = roundCurrency(
    existingPaymentSummary?.quote_total ||
    proposalPaymentSummary?.revised_total ||
    quoteDetails?.total ||
    0
  );
  const paidAmount = roundCurrency(
    existingPaymentSummary?.paid_amount ||
    proposalPaymentSummary?.previously_paid_amount ||
    0
  );
  const creditUsedAmount = roundCurrency(existingPaymentSummary?.credit_used_amount || 0);
  const creditCreatedAmount = roundCurrency(existingPaymentSummary?.credit_created_amount || 0);

  await db.stream_project_booking.update(
    {
      is_completed: 1,
      is_draft: 0,
      payment_completed_at: now
    },
    {
      where: { stream_project_booking_id: parsedBookingId },
      transaction
    }
  );

  await db.sales_quotes.update(
    {
      status: 'paid',
      accepted_at: quoteDetails?.accepted_at || now,
      updated_at: now
    },
    {
      where: { sales_quote_id: salesQuoteId },
      transaction
    }
  );

  if (leadId) {
    await db.sales_leads.update(
      { lead_status: 'booked', last_activity_at: now },
      { where: { lead_id: leadId }, transaction }
    );
  } else {
    await db.sales_leads.update(
      { lead_status: 'booked', last_activity_at: now },
      { where: { booking_id: parsedBookingId }, transaction }
    );
  }

  const paymentSummary = await bookingPaymentSummaryService.upsertBookingPaymentSummary({
    bookingId: parsedBookingId,
    leadId,
    salesQuoteId,
    quoteTotal,
    paidAmount,
    creditUsedAmount,
    creditCreatedAmount,
    lastQuoteChangeType: 'none',
    lastQuoteChangeAmount: 0,
    lastQuoteChangeStatus: 'approved',
    transaction
  });

  return {
    booking_id: parsedBookingId,
    final_payable_amount: finalPayableAmount,
    payment_summary: paymentSummary
  };
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

function normalizeRoleName(role) {
  return String(role || '').trim().toLowerCase().replace(/\s+/g, '_');
}

function isAdminRole(role) {
  return ['admin', 'sales_admin', 'super_admin', 'superadmin'].includes(normalizeRoleName(role));
}

function isClientRole(role) {
  return normalizeRoleName(role) === 'client';
}

async function getRandomActiveSalesRepId(transaction) {
  // TEMP FLOW NOTE:
  // Random sales_rep assignment is intentionally preserved for rollback,
  // but current flow assigns to creator admin/sales_admin directly.
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

async function resolveAssignableAdminId(userId, transaction) {
  const candidateUserId = Number(userId);
  if (!Number.isInteger(candidateUserId) || candidateUserId <= 0) {
    return null;
  }

  const candidate = await db.users.findByPk(candidateUserId, {
    include: [
      {
        model: db.user_type,
        as: 'userType',
        attributes: ['user_role']
      }
    ],
    transaction
  });

  const candidateRole = String(candidate?.userType?.user_role || '').toLowerCase();
  if (!candidate || candidateRole !== 'admin' || Number(candidate.assign_lead) !== 1 || Number(candidate.is_active) !== 1) {
    return null;
  }

  return candidateUserId;
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
  if (isClientRole(user?.role)) {
    return {
      client_user_id: user.userId
    };
  }
  return {
    [Op.or]: [
      { created_by_user_id: user.userId },
      { assigned_sales_rep_id: user.userId }
    ]
  };
}

function buildQuoteReadAccessWhere(user) {
  if (isClientRole(user?.role)) {
    return buildQuoteAccessWhere(user);
  }
  return buildQuoteAccessWhere(user, { restrictToLoggedInRep: false });
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
    client_address: resolveQuoteLocationAddress(payload, fallback)
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

function buildLineItemSummaryKey(item = {}) {
  const config = parseConfig(item.configuration_json || item.configuration) || null;
  return [
    item.section_type || '',
    item.catalog_item_id || '',
    String(item.item_name || '').trim().toLowerCase(),
    String(item.description || '').trim().toLowerCase(),
    item.rate_type || '',
    item.rate_unit || '',
    stableStringify(config)
  ].join('::');
}

function buildLineItemSummaryLabel(item = {}) {
  const sectionType = item.section_type ? String(item.section_type).trim() : 'item';
  const itemName = getLineItemCatalogName(item) || 'Custom item';
  return `${itemName} (${sectionType})`;
}

function buildLineItemSummarySnapshot(item = {}) {
  return {
    label: buildLineItemSummaryLabel(item),
    section_type: item.section_type || null,
    item_name: getLineItemCatalogName(item) || null,
    quantity: Number(item.quantity || 0),
    duration_hours: item.duration_hours !== null && item.duration_hours !== undefined ? Number(item.duration_hours) : null,
    crew_size: item.crew_size !== null && item.crew_size !== undefined ? Number(item.crew_size) : null,
    unit_rate: roundCurrency(item.unit_rate || 0),
    line_total: roundCurrency(item.line_total || 0)
  };
}

function summarizeLineItemsForDiff(items = []) {
  const groupedItems = new Map();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const key = buildLineItemSummaryKey(item);
    const current = groupedItems.get(key) || {
      key,
      label: buildLineItemSummaryLabel(item),
      section_type: item.section_type || null,
      item_name: getLineItemCatalogName(item) || null,
      quantity: 0,
      duration_hours: 0,
      crew_size: 0,
      unit_rate_total: 0,
      line_total: 0,
      occurrences: 0
    };

    current.quantity += Number(item.quantity || 0);
    current.duration_hours += Number(item.duration_hours || 0);
    current.crew_size += Number(item.crew_size || 0);
    current.unit_rate_total += Number(item.unit_rate || 0);
    current.line_total += Number(item.line_total || 0);
    current.occurrences += 1;
    groupedItems.set(key, current);
  });

  return groupedItems;
}

function buildFieldChange(label, before, after, type = 'text') {
  const normalizedBefore = before == null ? null : before;
  const normalizedAfter = after == null ? null : after;

  if (type === 'currency') {
    const beforeAmount = roundCurrency(normalizedBefore || 0);
    const afterAmount = roundCurrency(normalizedAfter || 0);
    if (beforeAmount === afterAmount) return null;
    return {
      field: label,
      previous_value: beforeAmount,
      new_value: afterAmount,
      display_previous: formatCurrency(beforeAmount),
      display_new: formatCurrency(afterAmount)
    };
  }

  if (type === 'number') {
    const beforeNumber = normalizedBefore == null || normalizedBefore === '' ? null : Number(normalizedBefore);
    const afterNumber = normalizedAfter == null || normalizedAfter === '' ? null : Number(normalizedAfter);
    if (beforeNumber === afterNumber) return null;
    return {
      field: label,
      previous_value: beforeNumber,
      new_value: afterNumber,
      display_previous: beforeNumber == null ? 'Empty' : String(beforeNumber),
      display_new: afterNumber == null ? 'Empty' : String(afterNumber)
    };
  }

  const beforeText = normalizedBefore == null || normalizedBefore === '' ? '' : String(normalizedBefore).trim();
  const afterText = normalizedAfter == null || normalizedAfter === '' ? '' : String(normalizedAfter).trim();
  if (beforeText === afterText) return null;

  return {
    field: label,
    previous_value: beforeText || null,
    new_value: afterText || null,
    display_previous: beforeText || 'Empty',
    display_new: afterText || 'Empty'
  };
}

const QUOTE_AUDIT_FIELDS = [
  ['lead_id', 'Lead ID', 'number'],
  ['client_user_id', 'Client user ID', 'number'],
  ['client_id', 'Client ID', 'number'],
  ['created_by_user_id', 'Created by user ID', 'number'],
  ['assigned_sales_rep_id', 'Assigned sales rep ID', 'number'],
  ['pricing_mode', 'Pricing mode'],
  ['status', 'Status'],
  ['client_name', 'Client name'],
  ['client_email', 'Client email'],
  ['client_phone', 'Client phone'],
  ['client_address', 'Client address'],
  ['location_latitude', 'Location latitude', 'number'],
  ['location_longitude', 'Location longitude', 'number'],
  ['project_description', 'Project description'],
  ['video_shoot_type', 'Shoot type'],
  ['quote_validity_days', 'Quote validity days', 'number'],
  ['valid_until', 'Valid until'],
  ['discount_type', 'Discount type'],
  ['discount_value', 'Discount value', 'currency'],
  ['discount_amount', 'Discount amount', 'currency'],
  ['tax_type', 'Tax type'],
  ['tax_rate', 'Tax rate', 'number'],
  ['tax_amount', 'Tax amount', 'currency'],
  ['subtotal', 'Subtotal', 'currency'],
  ['total', 'Total', 'currency'],
  ['notes', 'Notes'],
  ['terms_conditions', 'Terms & conditions'],
  ['sent_at', 'Sent at'],
  ['viewed_at', 'Viewed at'],
  ['accepted_at', 'Accepted at'],
  ['rejected_at', 'Rejected at']
];

const LINE_ITEM_AUDIT_FIELDS = [
  ['catalog_item_id', 'Catalog item ID', 'number'],
  ['source_type', 'Source type'],
  ['section_type', 'Section type'],
  ['item_name', 'Item name'],
  ['description', 'Description'],
  ['rate_type', 'Rate type'],
  ['rate_unit', 'Rate unit'],
  ['quantity', 'Quantity', 'number'],
  ['duration_hours', 'Duration hours', 'number'],
  ['crew_size', 'Crew size', 'number'],
  ['estimated_pricing', 'Estimated pricing', 'currency'],
  ['unit_rate', 'Unit rate', 'currency'],
  ['line_total', 'Line total', 'currency'],
  ['configuration', 'Configuration', 'json'],
  ['sort_order', 'Sort order', 'number']
];

function normalizeAuditValue(value, type = 'text') {
  if (value === undefined || value === '') return null;
  if (value === null) return null;

  if (type === 'currency') {
    return roundCurrency(value || 0);
  }

  if (type === 'number') {
    const numeric = Number(value);
    return Number.isNaN(numeric) ? null : numeric;
  }

  if (type === 'json') {
    const parsed = parseConfig(value);
    return parsed === undefined ? null : parsed;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value).trim();
}

function formatAuditDisplayValue(value, type = 'text') {
  if (value === null || value === undefined || value === '') return 'Empty';
  if (type === 'currency') return formatCurrency(value || 0);
  if (type === 'json') return stableStringify(value);
  return String(value);
}

function buildAuditFieldChange(field, label, before, after, type = 'text') {
  const previousValue = normalizeAuditValue(before, type);
  const newValue = normalizeAuditValue(after, type);

  if (stableStringify(previousValue) === stableStringify(newValue)) {
    return null;
  }

  return {
    field,
    label,
    previous_value: previousValue,
    new_value: newValue,
    display_previous: formatAuditDisplayValue(previousValue, type),
    display_new: formatAuditDisplayValue(newValue, type)
  };
}

function pickAuditFields(record = {}, fieldDefinitions = QUOTE_AUDIT_FIELDS) {
  return fieldDefinitions.reduce((snapshot, [field, , type]) => {
    snapshot[field] = normalizeAuditValue(record?.[field], type);
    return snapshot;
  }, {});
}

function normalizeAuditLineItem(item = {}, index = 0) {
  const config = item.configuration !== undefined
    ? item.configuration
    : parseConfig(item.configuration_json);

  return {
    line_item_id: item.line_item_id || null,
    catalog_item_id: normalizeAuditValue(item.catalog_item_id, 'number'),
    source_type: normalizeAuditValue(item.source_type || 'catalog'),
    section_type: normalizeAuditValue(item.section_type),
    item_name: normalizeAuditValue(item.item_name || item.name),
    description: normalizeAuditValue(item.description),
    rate_type: normalizeAuditValue(item.rate_type || 'flat'),
    rate_unit: normalizeAuditValue(item.rate_unit),
    quantity: normalizeAuditValue(item.quantity || 1, 'number'),
    duration_hours: normalizeAuditValue(item.duration_hours, 'number'),
    crew_size: normalizeAuditValue(item.crew_size, 'number'),
    estimated_pricing: normalizeAuditValue(item.estimated_pricing, 'currency'),
    unit_rate: normalizeAuditValue(item.unit_rate || 0, 'currency'),
    line_total: normalizeAuditValue(item.line_total || 0, 'currency'),
    configuration: normalizeAuditValue(config, 'json'),
    sort_order: normalizeAuditValue(item.sort_order !== undefined ? item.sort_order : index, 'number')
  };
}

function buildAuditLineItemMatchKey(item = {}) {
  if (item.catalog_item_id) {
    return [
      item.section_type || '',
      item.catalog_item_id || '',
      String(item.source_type || '').toLowerCase()
    ].join('::');
  }

  return [
    item.section_type || '',
    String(item.source_type || '').toLowerCase(),
    item.sort_order ?? ''
  ].join('::');
}

function bucketAuditLineItems(items = []) {
  const buckets = new Map();
  items.forEach((item, index) => {
    const normalizedItem = normalizeAuditLineItem(item, index);
    const key = buildAuditLineItemMatchKey(normalizedItem);
    const bucket = buckets.get(key) || [];
    bucket.push(normalizedItem);
    buckets.set(key, bucket);
  });
  return buckets;
}

function buildLineItemAuditDiff(previousLineItems = [], nextLineItems = []) {
  const previousBuckets = bucketAuditLineItems(previousLineItems);
  const nextBuckets = bucketAuditLineItems(nextLineItems);
  const allKeys = new Set([...previousBuckets.keys(), ...nextBuckets.keys()]);
  const added = [];
  const removed = [];
  const updated = [];

  allKeys.forEach((key) => {
    const previousBucket = previousBuckets.get(key) || [];
    const nextBucket = nextBuckets.get(key) || [];
    const maxLength = Math.max(previousBucket.length, nextBucket.length);

    for (let index = 0; index < maxLength; index += 1) {
      const previousItem = previousBucket[index] || null;
      const nextItem = nextBucket[index] || null;

      if (!previousItem && nextItem) {
        added.push(nextItem);
        continue;
      }

      if (previousItem && !nextItem) {
        removed.push(previousItem);
        continue;
      }

      const changes = LINE_ITEM_AUDIT_FIELDS
        .map(([field, label, type]) => buildAuditFieldChange(field, label, previousItem[field], nextItem[field], type))
        .filter(Boolean);

      if (changes.length) {
        updated.push({
          identity: {
            line_item_id: nextItem.line_item_id || previousItem.line_item_id || null,
            section_type: nextItem.section_type || previousItem.section_type || null,
            catalog_item_id: nextItem.catalog_item_id || previousItem.catalog_item_id || null,
            item_name: nextItem.item_name || previousItem.item_name || null
          },
          previous: previousItem,
          next: nextItem,
          changes
        });
      }
    }
  });

  return { added, updated, removed };
}

function buildQuoteAuditLog({
  action,
  previousQuote = null,
  nextQuote = {},
  previousLineItems = [],
  nextLineItems = [],
  userId = null
}) {
  const changedFields = action === 'created'
    ? QUOTE_AUDIT_FIELDS
        .map(([field, label, type]) => {
          const value = normalizeAuditValue(nextQuote?.[field], type);
          if (value === null || value === undefined) return null;
          return {
            field,
            label,
            previous_value: null,
            new_value: value,
            display_previous: 'Empty',
            display_new: formatAuditDisplayValue(value, type)
          };
        })
        .filter(Boolean)
    : QUOTE_AUDIT_FIELDS
        .map(([field, label, type]) => buildAuditFieldChange(field, label, previousQuote?.[field], nextQuote?.[field], type))
        .filter(Boolean);

  const lineItems = action === 'created'
    ? {
        added: (nextLineItems || []).map(normalizeAuditLineItem),
        updated: [],
        removed: []
      }
    : buildLineItemAuditDiff(previousLineItems, nextLineItems);

  return {
    action,
    changed_by_user_id: userId || null,
    changed_at: new Date().toISOString(),
    changed_fields: changedFields,
    line_items: lineItems,
    has_changes: action === 'created' || Boolean(
      changedFields.length ||
      lineItems.added.length ||
      lineItems.updated.length ||
      lineItems.removed.length
    ),
    previous_snapshot: previousQuote ? pickAuditFields(previousQuote) : null,
    next_snapshot: pickAuditFields(nextQuote)
  };
}

function buildQuoteChangeSummary({ previousQuote = {}, nextQuote = {}, previousLineItems = [], nextLineItems = [] }) {
  const previousItems = summarizeLineItemsForDiff(previousLineItems);
  const nextItems = summarizeLineItemsForDiff(nextLineItems);

  const added_items = [];
  const removed_items = [];
  const updated_items = [];

  nextItems.forEach((nextItem, key) => {
    const previousItem = previousItems.get(key);
    if (!previousItem) {
      added_items.push({
        ...buildLineItemSummarySnapshot(nextItem),
        line_total_delta: nextItem.line_total
      });
      return;
    }

    const changes = [];
    if (previousItem.quantity !== nextItem.quantity) {
      changes.push({ field: 'quantity', previous_value: previousItem.quantity, new_value: nextItem.quantity });
    }
    if (roundCurrency(previousItem.duration_hours) !== roundCurrency(nextItem.duration_hours)) {
      changes.push({ field: 'duration_hours', previous_value: roundCurrency(previousItem.duration_hours), new_value: roundCurrency(nextItem.duration_hours) });
    }
    if (roundCurrency(previousItem.crew_size) !== roundCurrency(nextItem.crew_size)) {
      changes.push({ field: 'crew_size', previous_value: roundCurrency(previousItem.crew_size), new_value: roundCurrency(nextItem.crew_size) });
    }
    if (roundCurrency(previousItem.unit_rate_total) !== roundCurrency(nextItem.unit_rate_total)) {
      changes.push({
        field: 'unit_rate',
        previous_value: roundCurrency(previousItem.unit_rate_total),
        new_value: roundCurrency(nextItem.unit_rate_total),
        display_previous: formatCurrency(previousItem.unit_rate_total),
        display_new: formatCurrency(nextItem.unit_rate_total)
      });
    }
    if (roundCurrency(previousItem.line_total) !== roundCurrency(nextItem.line_total)) {
      changes.push({
        field: 'line_total',
        previous_value: roundCurrency(previousItem.line_total),
        new_value: roundCurrency(nextItem.line_total),
        display_previous: formatCurrency(previousItem.line_total),
        display_new: formatCurrency(nextItem.line_total)
      });
    }

    if (changes.length) {
      updated_items.push({
        label: nextItem.label,
        section_type: nextItem.section_type,
        item_name: nextItem.item_name,
        previous_line_total: roundCurrency(previousItem.line_total),
        new_line_total: roundCurrency(nextItem.line_total),
        line_total_delta: roundCurrency(nextItem.line_total - previousItem.line_total),
        changes
      });
    }
  });

  previousItems.forEach((previousItem, key) => {
    if (nextItems.has(key)) return;
    removed_items.push({
      ...buildLineItemSummarySnapshot(previousItem),
      line_total_delta: roundCurrency(previousItem.line_total * -1)
    });
  });

  const field_changes = [
    buildFieldChange('Project description', previousQuote.project_description, nextQuote.project_description),
    buildFieldChange('Shoot type', previousQuote.video_shoot_type, nextQuote.video_shoot_type),
    buildFieldChange('Client name', previousQuote.client_name, nextQuote.client_name),
    buildFieldChange('Client email', previousQuote.client_email, nextQuote.client_email),
    buildFieldChange('Client phone', previousQuote.client_phone, nextQuote.client_phone),
    buildFieldChange('Client address', previousQuote.client_address, nextQuote.client_address),
    buildFieldChange('Status', previousQuote.status, nextQuote.status),
    buildFieldChange('Discount type', previousQuote.discount_type, nextQuote.discount_type),
    buildFieldChange('Discount value', previousQuote.discount_value, nextQuote.discount_value, 'currency'),
    buildFieldChange('Discount amount', previousQuote.discount_amount, nextQuote.discount_amount, 'currency'),
    buildFieldChange('Tax type', previousQuote.tax_type, nextQuote.tax_type),
    buildFieldChange('Tax rate', previousQuote.tax_rate, nextQuote.tax_rate, 'number'),
    buildFieldChange('Tax amount', previousQuote.tax_amount, nextQuote.tax_amount, 'currency'),
    buildFieldChange('Subtotal', previousQuote.subtotal, nextQuote.subtotal, 'currency'),
    buildFieldChange('Total', previousQuote.total, nextQuote.total, 'currency'),
    buildFieldChange('Quote validity days', previousQuote.quote_validity_days, nextQuote.quote_validity_days, 'number'),
    buildFieldChange('Valid until', previousQuote.valid_until, nextQuote.valid_until),
    buildFieldChange('Notes', previousQuote.notes, nextQuote.notes),
    buildFieldChange('Terms & conditions', previousQuote.terms_conditions, nextQuote.terms_conditions)
  ].filter(Boolean);

  const amount_summary = {
    previous_subtotal: roundCurrency(previousQuote.subtotal || 0),
    new_subtotal: roundCurrency(nextQuote.subtotal || 0),
    subtotal_delta: roundCurrency((nextQuote.subtotal || 0) - (previousQuote.subtotal || 0)),
    previous_total: roundCurrency(previousQuote.total || 0),
    new_total: roundCurrency(nextQuote.total || 0),
    total_delta: roundCurrency((nextQuote.total || 0) - (previousQuote.total || 0)),
    previous_discount_amount: roundCurrency(previousQuote.discount_amount || 0),
    new_discount_amount: roundCurrency(nextQuote.discount_amount || 0),
    discount_delta: roundCurrency((nextQuote.discount_amount || 0) - (previousQuote.discount_amount || 0)),
    previous_tax_amount: roundCurrency(previousQuote.tax_amount || 0),
    new_tax_amount: roundCurrency(nextQuote.tax_amount || 0),
    tax_delta: roundCurrency((nextQuote.tax_amount || 0) - (previousQuote.tax_amount || 0))
  };

  const summary_lines = [];
  if (amount_summary.total_delta !== 0) {
    summary_lines.push(`Total changed from ${formatCurrency(amount_summary.previous_total)} to ${formatCurrency(amount_summary.new_total)} (${amount_summary.total_delta > 0 ? '+' : ''}${formatCurrency(amount_summary.total_delta)})`);
  }
  if (added_items.length) {
    summary_lines.push(`Added ${added_items.length} item${added_items.length === 1 ? '' : 's'}: ${added_items.map((item) => item.label).join(', ')}`);
  }
  if (updated_items.length) {
    summary_lines.push(`Updated ${updated_items.length} item${updated_items.length === 1 ? '' : 's'}: ${updated_items.map((item) => item.label).join(', ')}`);
  }
  if (removed_items.length) {
    summary_lines.push(`Removed ${removed_items.length} item${removed_items.length === 1 ? '' : 's'}: ${removed_items.map((item) => item.label).join(', ')}`);
  }
  if (field_changes.length) {
    summary_lines.push(`Other changes: ${field_changes.map((item) => item.field).join(', ')}`);
  }
  if (!summary_lines.length) {
    summary_lines.push('Quote updated with no material changes detected.');
  }

  return {
    added_items,
    updated_items,
    removed_items,
    field_changes,
    amount_summary,
    summary_lines,
    has_changes: Boolean(added_items.length || updated_items.length || removed_items.length || field_changes.length || amount_summary.total_delta !== 0)
  };
}

function formatItemChangeDetail(change = {}) {
  if (change.field === 'duration_hours') {
    return `duration changed from ${change.previous_value}h to ${change.new_value}h`;
  }

  if (change.field === 'crew_size') {
    return `crew size changed from ${change.previous_value} to ${change.new_value}`;
  }

  if (change.field === 'quantity') {
    return `quantity changed from ${change.previous_value} to ${change.new_value}`;
  }

  if (change.field === 'unit_rate') {
    const previousValue = change.display_previous !== undefined ? change.display_previous : formatCurrency(change.previous_value || 0);
    const newValue = change.display_new !== undefined ? change.display_new : formatCurrency(change.new_value || 0);
    return `unit rate changed from ${previousValue} to ${newValue}`;
  }

  if (change.field === 'line_total') {
    const previousValue = change.display_previous !== undefined ? change.display_previous : formatCurrency(change.previous_value || 0);
    const newValue = change.display_new !== undefined ? change.display_new : formatCurrency(change.new_value || 0);
    return `line total changed from ${previousValue} to ${newValue}`;
  }

  const previousValue = change.display_previous !== undefined
    ? change.display_previous
    : (change.previous_value == null ? 'empty' : String(change.previous_value));
  const newValue = change.display_new !== undefined
    ? change.display_new
    : (change.new_value == null ? 'empty' : String(change.new_value));

  return `${change.field || 'value'} changed from ${previousValue} to ${newValue}`;
}

function formatOverallFieldChange(change = {}) {
  const field = String(change.field || '').toLowerCase();
  const previousValue = change.display_previous !== undefined
    ? change.display_previous
    : (change.previous_value == null ? 'empty' : String(change.previous_value));
  const newValue = change.display_new !== undefined
    ? change.display_new
    : (change.new_value == null ? 'empty' : String(change.new_value));

  if (field === 'discount type') {
    return `Changed discount type from ${previousValue} to ${newValue}.`;
  }

  if (field === 'discount value') {
    return `Changed discount value from ${previousValue} to ${newValue}.`;
  }

  if (field === 'discount amount') {
    return `Changed discount amount from ${previousValue} to ${newValue}.`;
  }

  if (field === 'tax type') {
    return `Changed tax type from ${previousValue} to ${newValue}.`;
  }

  if (field === 'tax rate') {
    return `Changed tax rate from ${previousValue} to ${newValue}.`;
  }

  if (field === 'project description') {
    return `Updated project description from ${previousValue} to ${newValue}.`;
  }

  if (field === 'shoot type') {
    return `Changed shoot type from ${previousValue} to ${newValue}.`;
  }

  return null;
}

function buildOverallChangeSummary(activities = []) {
  const detailedActivities = (Array.isArray(activities) ? activities : [])
    .filter((activity) => activity.activity_type === 'updated' && activity?.metadata?.change_summary?.has_changes)
    .slice()
    .sort((a, b) => {
      const createdAtDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (createdAtDiff !== 0) return createdAtDiff;
      return Number(a.activity_id || 0) - Number(b.activity_id || 0);
    });

  if (!detailedActivities.length) return null;

  const narrativeEntries = [];
  let addedCount = 0;
  let updatedCount = 0;
  let removedCount = 0;

  detailedActivities.forEach((activity) => {
    const changeSummary = activity.metadata.change_summary;

    (changeSummary.added_items || []).forEach((item) => {
      addedCount += 1;
      const itemName = item.item_name || item.label || 'item';
      narrativeEntries.push({
        type: 'item_added',
        item_name: itemName,
        amount: roundCurrency(item.line_total || 0),
        text: `Added ${itemName} for ${formatCurrency(item.line_total || 0)}.`
      });
    });

    (changeSummary.updated_items || []).forEach((item) => {
      const itemName = item.item_name || item.label || 'item';
      const newLineTotal = roundCurrency(item.new_line_total || 0);
      const details = (item.changes || []).map(formatItemChangeDetail).filter(Boolean);
      const lineTotalDelta = roundCurrency(item.line_total_delta || 0);

      if (newLineTotal === 0 && lineTotalDelta < 0) {
        removedCount += 1;
        narrativeEntries.push({
          type: 'item_removed',
          item_name: itemName,
          amount: Math.abs(lineTotalDelta),
          text: `Removed ${itemName}, which reduced the quote by ${formatCurrency(Math.abs(lineTotalDelta))}.`
        });
        return;
      }

      updatedCount += 1;
      const amountImpact = lineTotalDelta === 0
        ? null
        : `${lineTotalDelta > 0 ? 'This increased' : 'This reduced'} the quote by ${formatCurrency(Math.abs(lineTotalDelta))}.`;
      const detailText = details.length ? `${details.join('; ')}.` : 'Details updated.';
      narrativeEntries.push({
        type: 'item_updated',
        item_name: itemName,
        text: `Updated ${itemName}: ${detailText}${amountImpact ? ` ${amountImpact}` : ''}`
      });
    });

    (changeSummary.removed_items || []).forEach((item) => {
      removedCount += 1;
      const itemName = item.item_name || item.label || 'item';
      narrativeEntries.push({
        type: 'item_removed',
        item_name: itemName,
        amount: Math.abs(item.line_total_delta || item.line_total || 0),
        text: `Removed ${itemName}, which reduced the quote by ${formatCurrency(Math.abs(item.line_total_delta || item.line_total || 0))}.`
      });
    });

    const discountTypeChange = (changeSummary.field_changes || []).find((change) => String(change.field || '').toLowerCase() === 'discount type');
    const discountValueChange = (changeSummary.field_changes || []).find((change) => String(change.field || '').toLowerCase() === 'discount value');
    const discountAmountChange = (changeSummary.field_changes || []).find((change) => String(change.field || '').toLowerCase() === 'discount amount');

    if (discountTypeChange || discountValueChange || discountAmountChange) {
      const parts = [];
      if (discountTypeChange) {
        parts.push(`discount type changed from ${discountTypeChange.display_previous || discountTypeChange.previous_value || 'empty'} to ${discountTypeChange.display_new || discountTypeChange.new_value || 'empty'}`);
      }
      if (discountValueChange) {
        parts.push(`discount value changed from ${discountValueChange.display_previous || discountValueChange.previous_value || 'empty'} to ${discountValueChange.display_new || discountValueChange.new_value || 'empty'}`);
      }
      if (discountAmountChange) {
        const previousAmount = discountAmountChange.display_previous || formatCurrency(discountAmountChange.previous_value || 0);
        const newAmount = discountAmountChange.display_new || formatCurrency(discountAmountChange.new_value || 0);
        parts.push(`discount amount changed from ${previousAmount} to ${newAmount}`);
      }
      narrativeEntries.push({
        type: 'discount_change',
        text: `Updated discount: ${parts.join('; ')}.`
      });
    }

    (changeSummary.field_changes || [])
      .filter((change) => !['discount type', 'discount value', 'discount amount'].includes(String(change.field || '').toLowerCase()))
      .map(formatOverallFieldChange)
      .filter(Boolean)
      .forEach((text) => narrativeEntries.push({ type: 'field_change', text }));
  });

  const lines = [];
  const removedEntryIndexes = new Set();
  const latestRemovalByItem = new Map();

  narrativeEntries.forEach((entry, index) => {
    if (entry.type === 'item_removed') {
      latestRemovalByItem.set(String(entry.item_name || '').toLowerCase(), { entry, index });
    }
  });

  narrativeEntries.forEach((entry, index) => {
    if (removedEntryIndexes.has(index)) return;

    if (entry.type === 'item_added') {
      const removal = latestRemovalByItem.get(String(entry.item_name || '').toLowerCase());
      if (removal && removal.index > index) {
        removedEntryIndexes.add(removal.index);
        lines.push(`Added ${entry.item_name} for ${formatCurrency(entry.amount || 0)}, then later removed it.`);
        return;
      }
    }

    lines.push(entry.text);
  });

  const firstActivity = detailedActivities[0];
  const lastActivity = detailedActivities[detailedActivities.length - 1];
  const startingTotal = roundCurrency(firstActivity?.metadata?.previous_total || 0);
  const endingTotal = roundCurrency(lastActivity?.metadata?.new_total || 0);
  const totalDelta = roundCurrency(endingTotal - startingTotal);
  const summaryLine = `Quote total changed from ${formatCurrency(startingTotal)} to ${formatCurrency(endingTotal)} (${formatSignedCurrency(totalDelta)}) across ${detailedActivities.length} update${detailedActivities.length === 1 ? '' : 's'}.`;

  return {
    summary: summaryLine,
    lines
  };
}

function buildQuoteChangeLogs(activities = []) {
  const logActivityTypes = [
    'created',
    'updated',
    'status_changed',
    'restricted_edit_confirmed',
    'sent',
    'viewed',
    'accepted',
    'rejected'
  ];

  return (Array.isArray(activities) ? activities : [])
    .filter((activity) => logActivityTypes.includes(activity.activity_type))
    .map((activity) => {
      const metadata = activity.metadata || {};
      return {
        activity_id: activity.activity_id || null,
        activity_type: activity.activity_type || null,
        message: activity.message || null,
        changed_at: activity.created_at || null,
        changed_by_user_id: activity.performed_by_user_id || null,
        changed_by: activity.performed_by
          ? {
              id: activity.performed_by.id,
              name: activity.performed_by.name,
              email: activity.performed_by.email
            }
          : null,
        quote_version: metadata.quote_version || null,
        quote_version_id: metadata.quote_version_id || metadata.quote_version?.sales_quote_version_id || null,
        version_number: metadata.version_number || metadata.quote_version?.version_number || null,
        version_label: metadata.version_label || metadata.quote_version?.version_label || null,
        audit: metadata.audit || null,
        change_summary: metadata.change_summary || null,
        metadata
      };
    });
}

async function getQuoteFinancialDetails({ quoteId = null, bookingId = null }) {
  if (!quoteId) return null;

  const [latestInvoiceHistory, recentQuoteUpdates] = await Promise.all([
    db.invoice_send_history?.findOne({
      where: {
        quote_id: quoteId,
        ...(bookingId ? { booking_id: bookingId } : {})
      },
      order: [['sent_at', 'DESC'], ['invoice_send_history_id', 'DESC']]
    }) || null,
    db.sales_quote_activities?.findAll({
      where: {
        sales_quote_id: quoteId,
        activity_type: 'updated'
      },
      order: [['created_at', 'DESC'], ['activity_id', 'DESC']],
      limit: 10
    }) || []
  ]);

  const refreshActivity = (recentQuoteUpdates || [])
    .map((activity) => ({
      activity,
      metadata: parseQuoteActivityMetadata(activity?.metadata_json)
    }))
    .find(({ metadata }) => {
      if (!metadata?.invoice_refresh_required) return false;
      if (bookingId && metadata.booking_id && Number(metadata.booking_id) !== Number(bookingId)) return false;
      return parseFloat(metadata.extra_amount || 0) > 0 || parseFloat(metadata.reduced_amount || 0) > 0;
    });

  const refreshInvoiceHistory = refreshActivity?.activity
    ? await db.invoice_send_history?.findOne({
        where: {
          quote_id: quoteId,
          ...(bookingId ? { booking_id: bookingId } : {}),
          sent_at: { [Op.gte]: refreshActivity.activity.created_at }
        },
        order: [['sent_at', 'DESC'], ['invoice_send_history_id', 'DESC']]
      })
    : null;

  const additionalAmount = parseFloat(refreshActivity?.metadata?.extra_amount || 0);
  const reducedAmount = parseFloat(refreshActivity?.metadata?.reduced_amount || 0);
  const previouslyPaidAmount = parseFloat(refreshActivity?.metadata?.previous_total || 0);
  const revisedTotal = parseFloat(refreshActivity?.metadata?.new_total || 0);
  let settledByFollowupTransaction = false;
  if (bookingId && refreshActivity?.activity && additionalAmount > 0) {
    const bookingRecord = await db.stream_project_booking.findByPk(bookingId, {
      attributes: ['payment_id']
    });
    const basePaymentId = Number(bookingRecord?.payment_id || 0);
    if (basePaymentId > 0) {
      const followupPayment = await db.payment_transactions.findOne({
        where: {
          payment_id: { [Op.gt]: basePaymentId },
          created_at: { [Op.gte]: refreshActivity.activity.created_at },
          status: 'succeeded',
          payment_source: { [Op.in]: ['additional_invoice', 'quote_invoice'] }
        },
        order: [['payment_id', 'DESC']]
      });
      settledByFollowupTransaction = Boolean(followupPayment);
    }
  }
  const normalizedRefreshPaymentStatus = String(refreshInvoiceHistory?.payment_status || '').toLowerCase();
  const isRefreshInvoiceSettled =
    settledByFollowupTransaction ||
    ['paid', 'succeeded', 'completed', 'success'].includes(normalizedRefreshPaymentStatus);
  const additionalPaymentStatus = settledByFollowupTransaction
    ? 'paid'
    : (refreshInvoiceHistory?.payment_status || (additionalAmount > 0 ? 'pending' : null));
  const reducedPaymentStatus = refreshInvoiceHistory?.payment_status || (reducedAmount > 0 ? 'refund_pending' : null);

  const creditSummary = await accountCreditService.getQuoteCreditSummary({
    salesQuoteId: quoteId,
    bookingId
  });

  const paymentState = await bookingPaymentSummaryService.resolveBookingPaymentState({
    bookingId,
    salesQuoteId: quoteId,
    quoteTotal: revisedTotal || 0
  });
  const paymentSummary = paymentState.paymentSummary;
  const summaryDueAmount = paymentState.dueAmount;
  const manualPaymentSummary = computeManualPaymentProgressFromSummary(
    paymentSummary,
    paymentState.quoteTotal || revisedTotal || 0
  );
  const summaryPaidAmount = paymentState.paidAmount;
  const summaryQuoteTotal = paymentState.quoteTotal;
  const summaryPaymentStatus = paymentState.paymentStatus || null;
  const summaryChangeType = String(paymentSummary?.last_quote_change_type || '').toLowerCase();
  const summaryApprovalStatus = String(paymentSummary?.last_quote_change_status || 'none').toLowerCase();
  const summaryAdditionalPayment = paymentSummary &&
    summaryChangeType === 'increase' &&
    summaryDueAmount > 0 &&
    ['pending', 'approved'].includes(summaryApprovalStatus)
      ? {
          sales_quote_activity_id: refreshActivity?.activity?.activity_id || null,
          additional_amount: summaryDueAmount,
          original_increase_amount: roundCurrency(paymentSummary.last_quote_change_amount || summaryDueAmount),
          previously_paid_amount: roundCurrency(paymentSummary.paid_amount || 0),
          revised_total: roundCurrency(paymentSummary.quote_total || 0),
          outstanding_amount: summaryDueAmount,
          payment_status: summaryApprovalStatus === 'approved' ? 'pending' : 'approval_pending',
          approval_status: summaryApprovalStatus,
          last_sent_at: refreshInvoiceHistory?.sent_at || null,
          invoice_number: refreshInvoiceHistory?.invoice_number || null,
          invoice_url: refreshInvoiceHistory?.invoice_url || null,
          invoice_pdf: refreshInvoiceHistory?.invoice_pdf || null
        }
      : null;

  const activityAdditionalPayment = refreshActivity && additionalAmount > 0 ? {
    sales_quote_activity_id: refreshActivity.activity.activity_id,
    additional_amount: additionalAmount,
    previously_paid_amount: previouslyPaidAmount,
    revised_total: revisedTotal,
    outstanding_amount: (additionalPaymentStatus === 'paid' || isRefreshInvoiceSettled) ? 0 : additionalAmount,
    payment_status: additionalPaymentStatus,
    approval_status: refreshActivity.metadata.approval_status || 'pending',
    last_sent_at: refreshInvoiceHistory?.sent_at || null,
    invoice_number: refreshInvoiceHistory?.invoice_number || null,
    invoice_url: refreshInvoiceHistory?.invoice_url || null,
    invoice_pdf: refreshInvoiceHistory?.invoice_pdf || null
  } : null;
  const additionalPayment = paymentSummary
    ? summaryAdditionalPayment
    : activityAdditionalPayment;
  const currentInvoiceHistory = additionalPayment
    ? refreshInvoiceHistory
    : latestInvoiceHistory;

  const reducedPayment = refreshActivity && reducedAmount > 0 ? {
    sales_quote_activity_id: refreshActivity.activity.activity_id,
    reduced_amount: reducedAmount,
    previously_paid_amount: previouslyPaidAmount,
    revised_total: revisedTotal,
    refund_pending_amount: reducedAmount,
    payment_status: reducedPaymentStatus,
    approval_status: refreshActivity.metadata.approval_status || 'pending',
    last_sent_at: refreshInvoiceHistory?.sent_at || null,
    invoice_number: refreshInvoiceHistory?.invoice_number || null,
    invoice_url: refreshInvoiceHistory?.invoice_url || null,
    invoice_pdf: refreshInvoiceHistory?.invoice_pdf || null
  } : null;

  return {
    latest_invoice: currentInvoiceHistory ? {
      invoice_send_history_id: currentInvoiceHistory.invoice_send_history_id,
      invoice_number: currentInvoiceHistory.invoice_number || null,
      invoice_url: currentInvoiceHistory.invoice_url || null,
      invoice_pdf: currentInvoiceHistory.invoice_pdf || null,
      payment_status: currentInvoiceHistory.payment_status || null,
      sent_at: currentInvoiceHistory.sent_at || null
    } : null,
    additional_payment: additionalPayment,
    partial_payment: additionalPayment,
    reduced_payment: reducedPayment,
    account_credit: creditSummary,
    payment_summary: paymentSummary || null,
    manual_payment_summary: manualPaymentSummary,
    ...(paymentSummary ? {
      payment_status: summaryPaymentStatus,
      collected_amount: summaryPaidAmount,
      total_paid_amount: summaryPaidAmount,
      paid_amount: summaryPaidAmount,
      outstanding_amount: summaryDueAmount,
      due_amount: summaryDueAmount,
      quote_total_amount: summaryQuoteTotal,
      is_collected: paymentState.isPaid
    } : {})
  };
}

async function getConvertedBookingDetails(bookingId = null) {
  if (!bookingId) return null;

  const booking = await db.stream_project_booking.findOne({
    where: {
      stream_project_booking_id: bookingId,
      is_active: 1
    },
    attributes: [
      'stream_project_booking_id',
      'event_date',
      'start_time',
      'end_time',
      'duration_hours',
      'event_location',
      'reference_links',
      'special_instructions'
    ]
  });

  if (!booking) return null;

  const bookingDays = await db.stream_project_booking_days.findAll({
    where: { stream_project_booking_id: bookingId },
    order: [['event_date', 'ASC'], ['stream_project_booking_day_id', 'ASC']]
  });

  const normalizedBookingDays = (bookingDays || []).map((day) => ({
    date: day.event_date,
    start_time: normalizeTime(day.start_time),
    end_time: normalizeTime(day.end_time),
    duration_hours: day.duration_hours !== null && day.duration_hours !== undefined ? Number(day.duration_hours) : null,
    time_zone: day.time_zone || null
  }));

  const firstBookingDay = normalizedBookingDays[0] || null;
  const inferredBookingType = normalizedBookingDays.length ? 'multi_day' : 'single_day';

  return {
    booking_id: booking.stream_project_booking_id,
    booking_type: inferredBookingType,
    time_zone: firstBookingDay?.time_zone || null,
    start_date: booking.event_date || firstBookingDay?.date || null,
    start_time: normalizeTime(booking.start_time) || firstBookingDay?.start_time || null,
    end_time: normalizeTime(booking.end_time) || firstBookingDay?.end_time || null,
    duration_hours: booking.duration_hours !== null && booking.duration_hours !== undefined ? Number(booking.duration_hours) : null,
    location: booking.event_location || null,
    reference_links: booking.reference_links || null,
    special_instructions: booking.special_instructions || null,
    booking_days: inferredBookingType === 'multi_day' ? normalizedBookingDays : []
  };
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
  const hasLocationOverride = payload.location !== undefined || payload.event_location !== undefined;
  const location = payload.location !== undefined ? payload.location : payload.event_location;
  const normalizedLocation = hasLocationOverride ? normalizeLocationAddress(location) : null;
  const hasCoordinateOverride =
    payload.location_latitude !== undefined ||
    payload.location_longitude !== undefined ||
    payload.latitude !== undefined ||
    payload.longitude !== undefined ||
    payload.lat !== undefined ||
    payload.lng !== undefined;
  const referenceLinks = payload.reference_links !== undefined ? payload.reference_links : payload.referenceLinks;
  const specialInstructions = payload.special_instructions !== undefined ? payload.special_instructions : payload.specialInstructions;
  const selectedCrewIds = Array.isArray(payload.selected_crew_ids) ? payload.selected_crew_ids.filter(Boolean).map(Number) : [];
  const normalizedBookingDays = normalizeBookingDaysPayload(payload.booking_days, timeZone);
  const inferredBookingType = payload.booking_type
    || (normalizedBookingDays.length ? 'multi_day' : null)
    || ((payload.start_date || payload.start_time || payload.start_date_time || payload.end_time) ? 'single_day' : null);
  const bookingType = inferredBookingType;
  const { latitude, longitude } = extractCoordinatesFromPayload(payload, normalizedLocation || next.location);
  const singleDaySchedule = resolveEventDateAndStartTime({
    start_date: payload.start_date,
    start_time: payload.start_time,
    start_date_time: payload.start_date_time
  });
  const singleDayEndTime = normalizeTime(payload.end_time || null);
  next.has_schedule_override = Boolean(
    next.has_schedule_override ||
    bookingType ||
    timeZone ||
    normalizedBookingDays.length ||
    payload.start_date ||
    payload.start_time ||
    payload.start_date_time ||
    payload.end_time
  );

  if (normalizedLocation) next.location = normalizedLocation;
  if (hasCoordinateOverride || normalizedLocation) {
    next.location_latitude = latitude;
    next.location_longitude = longitude;
  }
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

function parseBookingDaysValue(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseConfig(value);
    return Array.isArray(parsed) ? parsed : [];
  }
  return [];
}

function normalizeQuoteSchedulePayload(payload = {}, fallback = {}) {
  const hasScheduleInput = [
    'booking_type',
    'time_zone',
    'timeZone',
    'start_date',
    'start_time',
    'start_date_time',
    'end_time',
    'booking_days'
  ].some((key) => payload[key] !== undefined);

  const rawBookingType = payload.booking_type !== undefined
    ? payload.booking_type
    : fallback.booking_type;
  let bookingType = rawBookingType ? String(rawBookingType).trim().toLowerCase() : null;
  if (bookingType && !['single_day', 'multi_day'].includes(bookingType)) {
    throw new Error('booking_type must be single_day or multi_day');
  }

  const timeZone = payload.time_zone !== undefined
    ? payload.time_zone
    : payload.timeZone !== undefined
      ? payload.timeZone
      : fallback.time_zone || null;
  const bookingDaysSource = payload.booking_days !== undefined
    ? payload.booking_days
    : parseBookingDaysValue(fallback.booking_days);
  const normalizedBookingDays = normalizeBookingDaysPayload(bookingDaysSource, timeZone);
  const singleDaySchedule = resolveEventDateAndStartTime({
    start_date: payload.start_date !== undefined ? payload.start_date : fallback.start_date,
    start_time: payload.start_time !== undefined ? payload.start_time : fallback.start_time,
    start_date_time: payload.start_date_time
  });
  const endTime = payload.end_time !== undefined
    ? normalizeTime(payload.end_time)
    : normalizeTime(fallback.end_time);

  if (!bookingType && normalizedBookingDays.length) {
    bookingType = 'multi_day';
  } else if (!bookingType && (singleDaySchedule.event_date || singleDaySchedule.start_time || endTime)) {
    bookingType = 'single_day';
  }

  if (!hasScheduleInput && !bookingType) {
    return {
      booking_type: null,
      time_zone: null,
      start_date: null,
      start_time: null,
      end_time: null,
      booking_days: []
    };
  }

  if (bookingType === 'multi_day') {
    const firstDay = normalizedBookingDays.length
      ? [...normalizedBookingDays].sort((a, b) => new Date(a.date) - new Date(b.date))[0]
      : null;
    return {
      booking_type: bookingType,
      time_zone: timeZone || null,
      start_date: firstDay?.date || null,
      start_time: firstDay?.start_time || null,
      end_time: firstDay?.end_time || null,
      booking_days: normalizedBookingDays
    };
  }

  return {
    booking_type: bookingType,
    time_zone: timeZone || null,
    start_date: singleDaySchedule.event_date || null,
    start_time: singleDaySchedule.start_time || null,
    end_time: endTime || null,
    booking_days: []
  };
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
      time_zone: prefillData.time_zone || null,
      budget: Number(quoteDetails.total || 0) || null,
      crew_size_needed: prefillData.crew_size,
      event_location: prefillData.location,
      event_latitude: prefillData.location_latitude ?? null,
      event_longitude: prefillData.location_longitude ?? null,
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
      time_zone: prefillData.time_zone || booking.time_zone || null,
      budget: Number(quoteDetails.total || 0) || booking.budget || null,
      crew_size_needed: prefillData.crew_size ?? booking.crew_size_needed,
      event_location: prefillData.location || booking.event_location || null,
      event_latitude: prefillData.location_latitude ?? booking.event_latitude ?? null,
      event_longitude: prefillData.location_longitude ?? booking.event_longitude ?? null,
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

async function attachQuoteVersionToActivity(transaction, activity, versionRecord) {
  if (!activity || !versionRecord) return activity;

  const versionNumber = Number(versionRecord.version_number || 0) || null;
  const versionId = Number(versionRecord.sales_quote_version_id || 0) || null;
  const metadata = parseConfig(activity.metadata_json) || {};
  const nextMetadata = {
    ...metadata,
    quote_version: {
      sales_quote_version_id: versionId,
      version_number: versionNumber,
      version_label: versionNumber ? `Quote Version ${versionNumber}` : null
    },
    quote_version_id: versionId,
    version_number: versionNumber,
    version_label: versionNumber ? `Quote Version ${versionNumber}` : null
  };

  if (nextMetadata.audit) {
    nextMetadata.audit = {
      ...nextMetadata.audit,
      quote_version: nextMetadata.quote_version,
      version_number: versionNumber,
      version_label: nextMetadata.version_label
    };
  }

  await activity.update({
    metadata_json: stringifyConfig(nextMetadata)
  }, { transaction });

  return activity;
}

async function loadQuoteLineItemsForVersionSnapshot(salesQuoteId, transaction = null) {
  return db.sales_quote_line_items.findAll({
    where: {
      sales_quote_id: salesQuoteId,
      is_active: 1
    },
    include: [
      { model: db.quote_catalog_items, as: 'catalog_item', required: false }
    ],
    order: [['sort_order', 'ASC'], ['line_item_id', 'ASC']],
    transaction
  });
}

async function getLatestQuoteVersionRecord(salesQuoteId, transaction = null) {
  return db.sales_quote_versions.findOne({
    where: { sales_quote_id: salesQuoteId },
    order: [['version_number', 'DESC'], ['sales_quote_version_id', 'DESC']],
    transaction
  });
}

async function createQuoteVersion({
  transaction,
  quoteRecord,
  lineItems = null,
  userId = null,
  sourceActivityId = null,
  changeReason = null
}) {
  const quote = toPlainRecord(quoteRecord) || {};
  const latestVersion = await getLatestQuoteVersionRecord(quote.sales_quote_id, transaction);
  const nextVersionNumber = Number(latestVersion?.version_number || 0) + 1;
  const persistedQuote = await db.sales_quotes.findByPk(quote.sales_quote_id, { transaction });
  const resolvedLineItems = Array.isArray(lineItems)
    ? lineItems
    : await loadQuoteLineItemsForVersionSnapshot(quote.sales_quote_id, transaction);
  const snapshot = buildQuoteVersionSnapshot(persistedQuote || quoteRecord, resolvedLineItems);

  return db.sales_quote_versions.create({
    sales_quote_id: quote.sales_quote_id,
    version_number: nextVersionNumber,
    source_activity_id: sourceActivityId || null,
    created_by_user_id: userId || null,
    change_reason: changeReason || null,
    quote_snapshot_json: stringifyConfig(snapshot)
  }, { transaction });
}

async function invalidateQuoteSignatureForNewVersion({
  transaction,
  quoteRecord,
  salesQuoteId,
  userId = null,
  reason = 'Quote version changed'
}) {
  const quote = quoteRecord || await db.sales_quotes.findByPk(salesQuoteId, { transaction });
  if (!quote) {
    return {
      signatures_deleted: 0,
      acceptance_reset: false
    };
  }

  const resolvedSalesQuoteId = salesQuoteId || quote.sales_quote_id;
  const deletedSignatureCount = await db.signatures.destroy({
    where: { quote_id: resolvedSalesQuoteId },
    transaction
  });

  const quoteStatus = String(quote.status || '').toLowerCase();
  const shouldResetAcceptance = quote.accepted_at || quoteStatus === 'accepted';

  if (shouldResetAcceptance) {
    const resetPatch = {
      accepted_at: null,
      updated_at: new Date()
    };

    if (quoteStatus !== 'paid') {
      resetPatch.status = quote.sent_at ? 'sent' : 'pending';
    }

    await quote.update(resetPatch, { transaction });
  }

  return {
    signatures_deleted: deletedSignatureCount,
    acceptance_reset: Boolean(shouldResetAcceptance),
    reason,
    user_id: userId || null
  };
}

async function ensureInitialQuoteVersion({
  transaction,
  quoteRecord,
  lineItems = null,
  userId = null,
  changeReason = null
}) {
  const quote = toPlainRecord(quoteRecord) || {};
  const latestVersion = await getLatestQuoteVersionRecord(quote.sales_quote_id, transaction);
  if (latestVersion) {
    return latestVersion;
  }

  return createQuoteVersion({
    transaction,
    quoteRecord,
    lineItems,
    userId,
    changeReason
  });
}

async function updateLatestQuoteVersionSnapshot({
  transaction,
  quoteRecord,
  lineItems = null,
  userId = null,
  sourceActivityId = null,
  changeReason = null
}) {
  const quote = toPlainRecord(quoteRecord) || {};
  const latestVersion = await getLatestQuoteVersionRecord(quote.sales_quote_id, transaction);

  if (!latestVersion) {
    return createQuoteVersion({
      transaction,
      quoteRecord,
      lineItems,
      userId,
      sourceActivityId,
      changeReason
    });
  }

  const persistedQuote = await db.sales_quotes.findByPk(quote.sales_quote_id, { transaction });
  const resolvedLineItems = Array.isArray(lineItems)
    ? lineItems
    : await loadQuoteLineItemsForVersionSnapshot(quote.sales_quote_id, transaction);
  const snapshot = buildQuoteVersionSnapshot(persistedQuote || quoteRecord, resolvedLineItems);

  await latestVersion.update({
    source_activity_id: sourceActivityId || latestVersion.source_activity_id || null,
    created_by_user_id: userId || latestVersion.created_by_user_id || null,
    change_reason: changeReason || latestVersion.change_reason || null,
    quote_snapshot_json: stringifyConfig(snapshot)
  }, { transaction });

  return latestVersion;
}

async function listQuoteVersionsById(salesQuoteId, transaction = null) {
  const rows = await db.sales_quote_versions.findAll({
    where: { sales_quote_id: salesQuoteId },
    include: [
      { model: db.users, as: 'created_by', attributes: ['id', 'name', 'email'], required: false },
      { model: db.sales_quote_activities, as: 'source_activity', attributes: ['activity_id', 'metadata_json', 'created_at'], required: false }
    ],
    order: [['version_number', 'DESC'], ['sales_quote_version_id', 'DESC']],
    transaction
  });

  const usableRows = rows.filter((row) => isUsableQuoteVersion(row));
  const currentVersionNumber = usableRows.length
    ? Math.max(...usableRows.map((row) => Number(row.version_number || 0)))
    : null;

  return rows.map((row) => buildQuoteVersionListItem(row, currentVersionNumber));
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

  const bookingPayment = booking?.payment_id && db.payment_transactions
    ? await db.payment_transactions.findByPk(booking.payment_id, {
        attributes: ['payment_id', 'total_amount', 'status'],
        transaction
      })
    : null;
  const bookingPaidAmount = roundCurrency(bookingPayment?.total_amount || 0);
  const quoteTotal = roundCurrency(quote.total || 0);
  const bookingMarkedCollected = quoteTotal > 0
    ? bookingPaidAmount >= quoteTotal
    : Boolean(booking?.payment_id);
  const bookingPaymentStatus = bookingPaidAmount > 0
    ? (bookingMarkedCollected ? 'paid' : 'partially_paid')
    : null;
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
  const refreshApprovalStatus = String(refreshMetadata?.approval_status || 'pending').toLowerCase();
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
  const refreshBelongsToBooking = Boolean(
    booking?.stream_project_booking_id &&
    Number(refreshMetadata?.booking_id || 0) === Number(booking.stream_project_booking_id)
  );
  const paymentState = await bookingPaymentSummaryService.resolveBookingPaymentState({
    bookingId: booking?.stream_project_booking_id || null,
    salesQuoteId: quote.sales_quote_id,
    quoteTotal: quote.total,
    transaction
  });
  const paymentSummary = paymentState.paymentSummary || null;
  const summaryCollectedAmount = roundCurrency(
    Number(paymentState.paidAmount || 0) + Number(paymentState.creditUsedAmount || 0)
  );
  const summaryPaymentStatus = paymentState.hasSummary
    ? String(paymentState.paymentStatus || '').toLowerCase()
    : '';
  const summaryHasManualPaymentEvidence = Boolean(
    paymentSummary?.manual_payment_mode ||
    paymentSummary?.manual_payment_proof_url ||
    paymentSummary?.manual_payment_proof_file_path ||
    paymentSummary?.manual_payment_updated_at
  );
  const summaryMarkedCollected = summaryCollectedAmount > 0 && [
    'paid',
    'no_payment_due',
    'partially_paid',
    'approval_pending'
  ].includes(summaryPaymentStatus) && summaryHasManualPaymentEvidence;
  const refreshOutstanding = Boolean(
    refreshMetadata?.invoice_refresh_required &&
    refreshBelongsToBooking &&
    refreshExtraAmount > 0 &&
    refreshApprovalStatus !== 'rejected' &&
    refreshInvoiceHistory?.payment_status !== 'paid' &&
    (!paymentState.hasSummary || paymentState.requiresPayment)
  );

  const isCollected = !refreshOutstanding && (bookingMarkedCollected || historyMarkedCollected || summaryMarkedCollected);
  const paymentStatus = refreshOutstanding
    ? 'partially_paid'
    : (
        summaryPaymentStatus ||
        bookingPaymentStatus ||
        refreshInvoiceHistory?.payment_status ||
        latestInvoiceHistory?.payment_status ||
        (isCollected ? 'paid' : 'pending')
      );
  const fallbackCollectedAmount = isCollected
    ? quoteTotal
    : bookingPaidAmount;
  const collectedAmount = refreshOutstanding
    ? Math.max(refreshPreviousTotal, summaryCollectedAmount)
    : Math.max(fallbackCollectedAmount, summaryCollectedAmount);
  const outstandingAmount = roundCurrency(Math.max(quoteTotal - collectedAmount, 0));

  return {
    booking,
    latest_invoice_history: latestInvoiceHistory,
    collected_amount: collectedAmount,
    outstanding_amount: outstandingAmount,
    payment_status: paymentStatus,
    is_collected: isCollected
  };
}

function computeManualPaymentProgressFromActivities(activities = [], totalAmount = 0) {
  const manualEntries = (activities || [])
    .map((activity) => parseConfig(activity?.activity_data))
    .filter((entry) => entry && entry.payment_method === 'manual');

  const hasFullPayment = manualEntries.some(
    (entry) => String(entry.payment_type || '').toLowerCase() === 'full'
  );
  const partialPaid = manualEntries.reduce((sum, entry) => {
    if (String(entry.payment_type || '').toLowerCase() !== 'partial') return sum;
    const numeric = Number(entry.amount || 0);
    return sum + (Number.isFinite(numeric) ? numeric : 0);
  }, 0);

  const paidAmount = hasFullPayment ? Number(totalAmount || 0) : partialPaid;
  const pendingAmount = Math.max(Number(totalAmount || 0) - paidAmount, 0);

  return {
    hasFullPayment,
    paidAmount,
    pendingAmount,
    paid_amount: paidAmount,
    paid_amount_total: paidAmount,
    pending_amount: pendingAmount,
    due_amount: pendingAmount,
    total_amount: Number(totalAmount || 0),
    isPartiallyPaid: !hasFullPayment && paidAmount > 0 && pendingAmount > 0
  };
}

function computeManualPaymentProgressFromSummary(paymentSummary = null, totalAmount = 0) {
  if (!paymentSummary) return null;

  const hasManualPayment = Boolean(
    paymentSummary.manual_payment_mode ||
    paymentSummary.manual_payment_proof_url ||
    paymentSummary.manual_payment_updated_at
  );
  if (!hasManualPayment) return null;

  const quoteTotal = Number(paymentSummary.quote_total || totalAmount || 0);
  const paidAmount = Number(paymentSummary.paid_amount || 0);
  const pendingAmount = Math.max(Number(paymentSummary.due_amount || 0), 0);
  const hasFullPayment = paidAmount > 0 && pendingAmount <= 0;

  return {
    hasFullPayment,
    paidAmount,
    pendingAmount,
    paid_amount: paidAmount,
    paid_amount_total: paidAmount,
    pending_amount: pendingAmount,
    due_amount: pendingAmount,
    isPartiallyPaid: !hasFullPayment && paidAmount > 0 && pendingAmount > 0,
    is_partially_paid: !hasFullPayment && paidAmount > 0 && pendingAmount > 0,
    paymentMode: paymentSummary.manual_payment_mode || null,
    payment_mode: paymentSummary.manual_payment_mode || null,
    otherPaymentMode: paymentSummary.manual_payment_other_mode || null,
    other_payment_mode: paymentSummary.manual_payment_other_mode || null,
    proofUrl: paymentSummary.manual_payment_proof_url || null,
    proof_url: paymentSummary.manual_payment_proof_url || null,
    proofFilePath: paymentSummary.manual_payment_proof_file_path || null,
    proof_file_path: paymentSummary.manual_payment_proof_file_path || null,
    proofFileName: paymentSummary.manual_payment_proof_file_name || null,
    proof_file_name: paymentSummary.manual_payment_proof_file_name || null,
    notes: paymentSummary.manual_payment_notes || null,
    updatedByUserId: paymentSummary.manual_payment_updated_by_user_id || null,
    updated_by_user_id: paymentSummary.manual_payment_updated_by_user_id || null,
    updatedAt: paymentSummary.manual_payment_updated_at || null,
    updated_at: paymentSummary.manual_payment_updated_at || null,
    totalAmount: quoteTotal,
    total_amount: quoteTotal,
    payment_status: paymentSummary.payment_status || null
  };
}

async function hasPersistedManualPaymentLeadActivityForQuote(quote = {}) {
  const leadId = Number(quote.lead_id || 0);
  const salesQuoteId = Number(quote.sales_quote_id || 0);
  const bookingId = Number(quote.booking_id || 0);

  if (!leadId && !salesQuoteId && !bookingId) return false;

  const where = {
    activity_type: 'payment_completed'
  };
  if (leadId > 0) where.lead_id = leadId;

  const activityModels = [db.sales_lead_activities, db.client_lead_activities].filter(Boolean);

  for (const activityModel of activityModels) {
    const rows = await activityModel.findAll({
      where,
      attributes: ['activity_data'],
      order: [['created_at', 'DESC']],
      limit: 20,
      raw: true
    });

    const hasMatchingActivity = rows.some((row) => {
      const payload = parseConfig(row.activity_data);
      if (!payload || payload.payment_method !== 'manual') return false;

      const payloadQuoteId = Number(payload.sales_quote_id || payload.quote_id || 0);
      const payloadBookingId = Number(payload.booking_id || 0);

      return (
        (salesQuoteId > 0 && payloadQuoteId === salesQuoteId) ||
        (bookingId > 0 && payloadBookingId === bookingId) ||
        (leadId > 0 && !payloadQuoteId && !payloadBookingId)
      );
    });

    if (hasMatchingActivity) return true;
  }

  return false;
}

function ensureManualPaymentActivityForQuote(quote = {}, options = {}) {
  if (options.includeSynthetic === false) return quote;
  if (!quote?.manual_payment_summary) return quote;

  const activities = Array.isArray(quote.activities) ? quote.activities : [];
  const hasManualPaymentActivity = activities.some((activity) => {
    if (activity?.activity_type !== 'payment_completed') return false;
    const payload = parseConfig(activity?.activity_data);
    return payload?.payment_method === 'manual';
  });

  if (hasManualPaymentActivity) return quote;

  const manualSummary = quote.manual_payment_summary;
  return {
    ...quote,
    activities: [
      {
        activity_id: `manual-payment-summary-${quote.sales_quote_id}`,
        sales_quote_id: quote.sales_quote_id,
        activity_type: 'payment_completed',
        performed_by_user_id: manualSummary.updatedByUserId || manualSummary.updated_by_user_id || null,
        message: 'Manual payment recorded',
        created_at: manualSummary.updatedAt || manualSummary.updated_at || quote.updated_at || new Date(),
        performed_by: null,
        activity_data: {
          source: 'booking_payment_summary',
          payment_method: 'manual',
          payment_type: manualSummary.hasFullPayment ? 'full' : 'partial',
          payment_mode: manualSummary.paymentMode || manualSummary.payment_mode || null,
          other_payment_mode: manualSummary.otherPaymentMode || manualSummary.other_payment_mode || null,
          amount: manualSummary.hasFullPayment
            ? Number(manualSummary.totalAmount || manualSummary.total_amount || quote.total || 0)
            : Number(manualSummary.paidAmount || manualSummary.paid_amount || 0),
          total_amount: Number(manualSummary.totalAmount || manualSummary.total_amount || quote.total || 0),
          paid_amount_after: Number(manualSummary.paidAmount || manualSummary.paid_amount || 0),
          previously_paid_amount: 0,
          remaining_before_payment: Number(manualSummary.totalAmount || manualSummary.total_amount || quote.total || 0),
          remaining_after_payment: Number(manualSummary.pendingAmount || manualSummary.pending_amount || 0),
          proof_url: manualSummary.proofUrl || manualSummary.proof_url || null,
          proof_file_path: manualSummary.proofFilePath || manualSummary.proof_file_path || null,
          proof_file_name: manualSummary.proofFileName || manualSummary.proof_file_name || null,
          notes: manualSummary.notes || null,
          updated_by: manualSummary.updatedByUserId || manualSummary.updated_by_user_id || null,
          booking_id: quote.booking_id || null,
          sales_quote_id: quote.sales_quote_id
        }
      },
      ...activities
    ]
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
  reducedAmount = 0,
  changeType = null,
  paymentStatus = 'pending',
  changeSummary = null
}) {
  const resolvedChangeType = changeType || (extraAmount > 0 ? 'increase' : reducedAmount > 0 ? 'decrease' : 'unchanged');
  const activityMessage = resolvedChangeType === 'decrease'
    ? 'Quote total decreased after invoice/payment state; send updated invoice notice'
    : 'Quote total increased after invoice/payment state; send updated invoice';

  return recordActivity(
    transaction,
    salesQuoteId,
    'updated',
    userId,
    activityMessage,
    {
      booking_id: bookingId,
      previous_total: roundCurrency(previousTotal),
      new_total: roundCurrency(newTotal),
      extra_amount: roundCurrency(extraAmount),
      reduced_amount: roundCurrency(reducedAmount),
      quote_change_type: resolvedChangeType,
      payment_status: paymentStatus,
      change_summary: changeSummary,
      invoice_refresh_required: true,
      approval_status: 'pending',
      approval_requested_at: new Date().toISOString()
    }
  );
}

async function createQuote(payload, user) {
  const transaction = await db.sequelize.transaction();
  try {
    const clientSnapshot = await resolveClientSnapshot(payload);
    const { latitude, longitude } = extractCoordinatesFromPayload(payload, payload.client_address || payload.location);
    const lineItemsPayload = await buildLineItemsPayload(payload.line_items || []);
    const totals = calculateTotals(lineItemsPayload, payload);
    const schedulePayload = normalizeQuoteSchedulePayload(payload);
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
        const requestedAssignableAdminId = await resolveAssignableAdminId(requestedSalesRepId, transaction);
        assignedSalesRepId = requestedAssignableAdminId || user.userId;
        // OLD LOGIC (temporary rollback path):
        // assignedSalesRepId = requestedUser && requestedUserRole === 'sales_rep'
        //   ? requestedSalesRepId
        //   : await getRandomActiveSalesRepId(transaction);
      } else {
        assignedSalesRepId = user.userId;
        // OLD LOGIC (temporary rollback path):
        // assignedSalesRepId = await getRandomActiveSalesRepId(transaction);
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
      location_latitude: latitude,
      location_longitude: longitude,
      project_description: payload.project_description || null,
      video_shoot_type: payload.video_shoot_type || null,
      booking_type: schedulePayload.booking_type,
      time_zone: schedulePayload.time_zone,
      start_date: schedulePayload.start_date,
      start_time: schedulePayload.start_time,
      end_time: schedulePayload.end_time,
      booking_days: schedulePayload.booking_days,
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

    const createdQuoteAuditSnapshot = {
      ...toPlainRecord(quote),
      quote_number: stableQuoteNumber
    };
    const createdActivity = await recordActivity(transaction, quote.sales_quote_id, 'created', user.userId, 'Quote created', {
      audit: buildQuoteAuditLog({
        action: 'created',
        nextQuote: createdQuoteAuditSnapshot,
        nextLineItems: lineItemsPayload,
        userId: user.userId
      })
    });
    const createdVersion = await createQuoteVersion({
      transaction,
      quoteRecord: quote,
      userId: user.userId,
      sourceActivityId: createdActivity.activity_id,
      changeReason: 'Quote created'
    });
    await attachQuoteVersionToActivity(transaction, createdActivity, createdVersion);
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
      location_latitude: sourceQuote.location_latitude ?? null,
      location_longitude: sourceQuote.location_longitude ?? null,
      project_description: sourceQuote.project_description || null,
      video_shoot_type: sourceQuote.video_shoot_type || null,
      booking_type: sourceQuote.booking_type || null,
      time_zone: sourceQuote.time_zone || null,
      start_date: sourceQuote.start_date || null,
      start_time: normalizeTime(sourceQuote.start_time) || null,
      end_time: normalizeTime(sourceQuote.end_time) || null,
      booking_days: parseBookingDaysValue(sourceQuote.booking_days),
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

    const duplicatedActivity = await recordActivity(
      transaction,
      duplicatedQuote.sales_quote_id,
      'created',
      user.userId,
      'Quote duplicated',
      {
        source_quote_id: salesQuoteId,
        reset_lead_linkage: true,
        reset_client_user_linkage: true,
        audit: buildQuoteAuditLog({
          action: 'created',
          nextQuote: {
            ...toPlainRecord(duplicatedQuote),
            quote_number: stableQuoteNumber
          },
          nextLineItems: duplicatedLineItems,
          userId: user.userId
        })
      }
    );

    const duplicatedVersion = await createQuoteVersion({
      transaction,
      quoteRecord: duplicatedQuote,
      userId: user.userId,
      sourceActivityId: duplicatedActivity.activity_id,
      changeReason: `Quote duplicated from ${sourceQuote.quote_number || salesQuoteId}`
    });
    await attachQuoteVersionToActivity(transaction, duplicatedActivity, duplicatedVersion);

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

    const editGuardrails = await getQuoteEditGuardrails(quote, transaction);
    if (editGuardrails.show_restriction_modal) {
      const editReason = String(payload.edit_reason || '').trim();
      const opsReviewConfirmed = payload.ops_review_confirmed === true;

      if (!editReason || !opsReviewConfirmed) {
        const restrictedEditError = new Error('Quote edits within 48 hours of shoot start require edit_reason and ops_review_confirmed');
        restrictedEditError.statusCode = constants.FORBIDDEN.code;
        restrictedEditError.details = {
          show_restriction_modal: true,
          message: editGuardrails.message,
          modal: editGuardrails.modal,
          missing_requirements: [
            ...(!editReason ? ['edit_reason'] : []),
            ...(!opsReviewConfirmed ? ['ops_review_confirmed'] : [])
          ]
        };
        throw restrictedEditError;
      }
    }

    const billingState = await resolveQuoteBillingState(quote, transaction);
    const clientSnapshot = await resolveClientSnapshot(payload, quote);
    const existingLineItems = await db.sales_quote_line_items.findAll({
      where: { sales_quote_id: salesQuoteId, is_active: 1 },
      order: [['sort_order', 'ASC']],
      transaction
    });
    const existingLineItemsPayload = existingLineItems.map(toPersistableLineItemPayload);
    const latestExistingVersion = await getLatestQuoteVersionRecord(salesQuoteId, transaction);
    const previousQuoteAuditSnapshot = toPlainRecord(quote);
    const previousQuoteSnapshot = {
      lead_id: quote.lead_id,
      client_user_id: quote.client_user_id,
      client_id: quote.client_id,
      created_by_user_id: quote.created_by_user_id,
      assigned_sales_rep_id: quote.assigned_sales_rep_id,
      pricing_mode: quote.pricing_mode,
      project_description: quote.project_description,
      video_shoot_type: quote.video_shoot_type,
      booking_type: quote.booking_type,
      time_zone: quote.time_zone,
      start_date: quote.start_date,
      start_time: normalizeTime(quote.start_time),
      end_time: normalizeTime(quote.end_time),
      booking_days: parseBookingDaysValue(quote.booking_days),
      client_name: quote.client_name,
      client_email: quote.client_email,
      client_phone: quote.client_phone,
      client_address: quote.client_address,
      location_latitude: quote.location_latitude,
      location_longitude: quote.location_longitude,
      status: quote.status,
      discount_type: quote.discount_type,
      discount_value: quote.discount_value,
      discount_amount: quote.discount_amount,
      tax_type: quote.tax_type,
      tax_rate: quote.tax_rate,
      tax_amount: quote.tax_amount,
      subtotal: quote.subtotal,
      total: quote.total,
      quote_validity_days: quote.quote_validity_days,
      valid_until: quote.valid_until,
      notes: quote.notes,
      terms_conditions: quote.terms_conditions
    };

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
    const schedulePayload = normalizeQuoteSchedulePayload(payload, quote);

    const nextStatus = resolveQuoteStatus(payload, quote.status);
    const assignedSalesRepId = isAdminRole(user.role)
      ? (payload.assigned_sales_rep_id !== undefined ? payload.assigned_sales_rep_id : quote.assigned_sales_rep_id)
      : quote.assigned_sales_rep_id;
    const previousTotal = roundCurrency(quote.total);
    const newTotal = roundCurrency(totals.total);
    const collectedAmount = roundCurrency(billingState.collected_amount);
    const extraAmount = roundCurrency(Math.max(newTotal - collectedAmount, 0));
    const overpaidAmount = roundCurrency(Math.max(collectedAmount - newTotal, 0));
    const actualReductionAmount = roundCurrency(Math.max(previousTotal - newTotal, 0));
    const reducedAmount = roundCurrency(Math.min(actualReductionAmount, overpaidAmount));
    const quoteChangeType = newTotal > previousTotal
      ? 'increase'
      : newTotal < previousTotal
        ? 'decrease'
        : 'unchanged';
    const paymentStatus = extraAmount > 0
      ? (billingState.is_collected ? 'paid' : billingState.payment_status)
      : (billingState.is_collected ? 'paid' : billingState.payment_status);
    const resolvedStatus = extraAmount > 0 && billingState.is_collected
      ? nextStatus
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
      location_latitude:
        payload.location_latitude !== undefined ||
        payload.location_longitude !== undefined ||
        payload.latitude !== undefined ||
        payload.longitude !== undefined ||
        payload.lat !== undefined ||
        payload.lng !== undefined ||
        payload.client_address !== undefined ||
        payload.location !== undefined
          ? extractCoordinatesFromPayload(
              payload,
              payload.client_address !== undefined ? payload.client_address : clientSnapshot.client_address
            ).latitude
          : quote.location_latitude,
      location_longitude:
        payload.location_latitude !== undefined ||
        payload.location_longitude !== undefined ||
        payload.latitude !== undefined ||
        payload.longitude !== undefined ||
        payload.lat !== undefined ||
        payload.lng !== undefined ||
        payload.client_address !== undefined ||
        payload.location !== undefined
          ? extractCoordinatesFromPayload(
              payload,
              payload.client_address !== undefined ? payload.client_address : clientSnapshot.client_address
            ).longitude
          : quote.location_longitude,
      project_description: payload.project_description !== undefined ? payload.project_description : quote.project_description,
      video_shoot_type: payload.video_shoot_type !== undefined ? payload.video_shoot_type : quote.video_shoot_type,
      booking_type: schedulePayload.booking_type,
      time_zone: schedulePayload.time_zone,
      start_date: schedulePayload.start_date,
      start_time: schedulePayload.start_time,
      end_time: schedulePayload.end_time,
      booking_days: schedulePayload.booking_days,
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
    const nextQuoteSnapshot = {
      ...previousQuoteSnapshot,
      ...quoteUpdatePayload
    };
    const nextQuoteAuditSnapshot = {
      ...previousQuoteAuditSnapshot,
      ...quoteUpdatePayload
    };
    const changeSummary = buildQuoteChangeSummary({
      previousQuote: previousQuoteSnapshot,
      nextQuote: nextQuoteSnapshot,
      previousLineItems: existingLineItemsPayload,
      nextLineItems: mergedLineItemsPayload
    });
    const auditLog = buildQuoteAuditLog({
      action: 'updated',
      previousQuote: previousQuoteAuditSnapshot,
      nextQuote: nextQuoteAuditSnapshot,
      previousLineItems: existingLineItems.map((item, index) => ({
        ...toPlainRecord(item),
        sort_order: item.sort_order !== undefined ? item.sort_order : index
      })),
      nextLineItems: mergedLineItemsPayload,
      userId: user.userId
    });
    const versionChangeReason = payload.edit_reason ? String(payload.edit_reason).trim() : 'Quote updated';

    if (!latestExistingVersion) {
      await ensureInitialQuoteVersion({
        transaction,
        quoteRecord: quote,
        userId: user.userId,
        changeReason: 'Baseline snapshot before first versioned update'
      });
    }

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

    let signatureInvalidation = null;
    if (String(previousQuoteSnapshot.status || '').toLowerCase() !== 'draft') {
      signatureInvalidation = await invalidateQuoteSignatureForNewVersion({
        transaction,
        quoteRecord: quote,
        salesQuoteId,
        userId: user.userId,
        reason: versionChangeReason
      });
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
        location_latitude: quote.location_latitude,
        location_longitude: quote.location_longitude,
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
        location: resolveQuoteLocationAddress(updatedQuoteDetails),
        location_latitude: updatedQuoteDetails.location_latitude ?? null,
        location_longitude: updatedQuoteDetails.location_longitude ?? null,
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

    if (editGuardrails.show_restriction_modal) {
      await recordActivity(
        transaction,
        salesQuoteId,
        'restricted_edit_confirmed',
        user.userId,
        'Restricted quote edit confirmed within 48-hour window',
        {
          edit_reason: String(payload.edit_reason || '').trim(),
          ops_review_confirmed: payload.ops_review_confirmed === true,
          shoot_start_at: editGuardrails.modal?.shoot_start_at || null,
          hours_remaining: editGuardrails.modal?.hours_remaining ?? null,
          booking_id: billingState.booking?.stream_project_booking_id || null
        }
      );
    }

    const updatedActivity = await recordActivity(transaction, salesQuoteId, 'updated', user.userId, 'Quote updated', {
      previous_total: previousTotal,
      new_total: newTotal,
      collected_amount: collectedAmount,
      extra_amount: extraAmount,
      reduced_amount: reducedAmount,
      quote_change_type: quoteChangeType,
      payment_status: paymentStatus,
      booking_id: billingState.booking?.stream_project_booking_id || null,
      change_summary: changeSummary,
      audit: auditLog,
      edit_guardrails: editGuardrails,
      edit_reason: payload.edit_reason ? String(payload.edit_reason).trim() : null,
      ops_review_confirmed: payload.ops_review_confirmed === true,
      signature_invalidation: signatureInvalidation,
      invoice_refresh_required: Boolean(
        billingState.booking?.stream_project_booking_id &&
        (extraAmount > 0 || reducedAmount > 0) &&
        billingState.is_collected
      )
    });

    const currentPaymentSummary = billingState.booking?.stream_project_booking_id
      ? await bookingPaymentSummaryService.getBookingPaymentSummary(
          billingState.booking.stream_project_booking_id,
          transaction
        )
      : null;
    const currentSummaryPaidAmount = roundCurrency(currentPaymentSummary?.paid_amount || collectedAmount);
    const paidAmountForSummary = reducedAmount > 0
      ? Math.min(currentSummaryPaidAmount, newTotal)
      : currentSummaryPaidAmount;
    const summaryPaidAmount = roundCurrency(
      Number(paidAmountForSummary || 0) + Number(currentPaymentSummary?.credit_used_amount || 0)
    );
    const shouldUpdatePaymentSummaryForPaidQuote = Boolean(
      billingState.booking?.stream_project_booking_id &&
      quoteChangeType !== 'unchanged' &&
      billingState.is_collected
    );
    const shouldCreateApprovalRequestVersion = Boolean(
      billingState.booking?.stream_project_booking_id &&
      (extraAmount > 0 || reducedAmount > 0) &&
      billingState.is_collected
    );
    let approvalRequestActivity = null;

    if (shouldCreateApprovalRequestVersion) {
      const refreshActivity = await markQuoteInvoiceRefreshRequired({
        transaction,
        salesQuoteId,
        bookingId: billingState.booking.stream_project_booking_id,
        userId: user.userId,
        previousTotal,
        newTotal,
        extraAmount,
        reducedAmount,
        changeType: quoteChangeType,
        paymentStatus,
        changeSummary
      });
      approvalRequestActivity = refreshActivity;

      await bookingPaymentSummaryService.upsertBookingPaymentSummary({
        bookingId: billingState.booking.stream_project_booking_id,
        salesQuoteId,
        quoteTotal: newTotal,
        paidAmount: paidAmountForSummary,
        creditUsedAmount: currentPaymentSummary?.credit_used_amount || 0,
        creditCreatedAmount: currentPaymentSummary?.credit_created_amount || 0,
        lastQuoteChangeType: extraAmount > 0
          ? 'increase'
          : reducedAmount > 0
            ? 'decrease'
            : (quoteChangeType === 'increase' || quoteChangeType === 'decrease' ? quoteChangeType : 'none'),
        lastQuoteChangeAmount: extraAmount > 0 ? extraAmount : reducedAmount,
        lastQuoteChangeStatus: 'pending',
        transaction
      });

      if (reducedAmount > 0 && refreshActivity?.activity_id) {
        await accountCreditService.createCreditForQuoteReduction({
          salesQuoteId,
          bookingId: billingState.booking.stream_project_booking_id,
          salesQuoteActivityId: refreshActivity.activity_id,
          userId: clientSnapshot.client_user_id || null,
          guestEmail: clientSnapshot.client_email || null,
          amount: reducedAmount,
          createdByUserId: user.userId,
          notes: `Account credit created for quote reduction from $${previousTotal.toFixed(2)} to $${newTotal.toFixed(2)}.`,
          transaction
        });
      }
    } else if (shouldUpdatePaymentSummaryForPaidQuote) {
      const amountDueAfterChange = roundCurrency(Math.max(newTotal - summaryPaidAmount, 0));
      const overpaidAfterChange = roundCurrency(Math.max(summaryPaidAmount - newTotal, 0));
      const summaryChangeType = amountDueAfterChange > 0
        ? 'increase'
        : overpaidAfterChange > 0
          ? 'decrease'
          : (quoteChangeType === 'increase' || quoteChangeType === 'decrease' ? quoteChangeType : 'none');
      const summaryChangeAmount = amountDueAfterChange > 0
        ? amountDueAfterChange
        : overpaidAfterChange > 0
          ? overpaidAfterChange
          : roundCurrency(Math.abs(newTotal - previousTotal));
      const summaryChangeStatus = amountDueAfterChange > 0 || overpaidAfterChange > 0
        ? 'pending'
        : 'approved';

      await bookingPaymentSummaryService.upsertBookingPaymentSummary({
        bookingId: billingState.booking.stream_project_booking_id,
        salesQuoteId,
        quoteTotal: newTotal,
        paidAmount: paidAmountForSummary,
        creditUsedAmount: currentPaymentSummary?.credit_used_amount || 0,
        creditCreatedAmount: currentPaymentSummary?.credit_created_amount || 0,
        lastQuoteChangeType: summaryChangeType,
        lastQuoteChangeAmount: summaryChangeAmount,
        lastQuoteChangeStatus: summaryChangeStatus,
        transaction
      });
    }

    let updatedVersion = null;
    if (previousQuoteSnapshot.status === 'draft') {
      updatedVersion = await updateLatestQuoteVersionSnapshot({
        transaction,
        quoteRecord: quote,
        userId: user.userId,
        sourceActivityId: approvalRequestActivity?.activity_id || updatedActivity.activity_id,
        changeReason: versionChangeReason
      });
    } else {
      updatedVersion = await createQuoteVersion({
        transaction,
        quoteRecord: quote,
        userId: user.userId,
        sourceActivityId: approvalRequestActivity?.activity_id || updatedActivity.activity_id,
        changeReason: versionChangeReason
      });
    }

    await attachQuoteVersionToActivity(transaction, updatedActivity, updatedVersion);
    if (approvalRequestActivity) {
      await attachQuoteVersionToActivity(transaction, approvalRequestActivity, updatedVersion);
    }

    await transaction.commit();
    return getQuoteById(salesQuoteId, user);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function convertQuoteToBooking(salesQuoteId, payload = {}, user) {
  await expireQuotesPastValidUntil();

  const quoteDetails = await getQuoteById(salesQuoteId, user);
  if (!quoteDetails) {
    throw new Error('Quote not found');
  }

  if (String(quoteDetails.status || '').toLowerCase() === 'expired') {
    throw new Error('Quote cannot be converted because it is expired');
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
    location: resolveQuoteLocationAddress(quoteDetails),
    location_latitude: quoteDetails.location_latitude ?? quoteDetails.latitude ?? null,
    location_longitude: quoteDetails.location_longitude ?? quoteDetails.longitude ?? null,
    booking_type: quoteDetails.booking_type || null,
    time_zone: quoteDetails.time_zone || null,
    start_date: quoteDetails.start_date || null,
    start_time: normalizeTime(quoteDetails.start_time) || null,
    end_time: normalizeTime(quoteDetails.end_time) || null,
    booking_days: parseBookingDaysValue(quoteDetails.booking_days),
    has_schedule_override: Boolean(
      quoteDetails.booking_type ||
      quoteDetails.time_zone ||
      quoteDetails.start_date ||
      quoteDetails.start_time ||
      quoteDetails.end_time ||
      parseBookingDaysValue(quoteDetails.booking_days).length
    ),
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

async function buildPaymentBookingPrefillDataFromQuote(quoteDetails, payload = {}) {
  const roleData = deriveBookingRoleDataFromQuote(quoteDetails.line_items || []);
  const editSelections = await deriveBookingEditSelectionsFromQuote(quoteDetails.line_items || []);

  let prefillData = {
    guest_email: quoteDetails.client_email || null,
    user_id: quoteDetails.client_user_id || null,
    full_name: quoteDetails.client_name || null,
    phone: quoteDetails.client_phone || null,
    location: resolveQuoteLocationAddress(quoteDetails),
    location_latitude: quoteDetails.location_latitude ?? quoteDetails.latitude ?? null,
    location_longitude: quoteDetails.location_longitude ?? quoteDetails.longitude ?? null,
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
  return prefillData;
}

async function ensureQuoteBookingForPayment(salesQuoteId, user, payload = {}) {
  await expireQuotesPastValidUntil();

  const quoteDetails = await getQuoteById(salesQuoteId, user);
  if (!quoteDetails) {
    throw new Error('Quote not found');
  }

  if (String(quoteDetails.status || '').toLowerCase() === 'expired') {
    throw new Error('Quote cannot be used for payment because it is expired');
  }

  if (!hasConvertibleServiceInQuote(quoteDetails.line_items || [])) {
    throw new Error('Quote must include at least one service before invoice/payment can be generated');
  }

  if (!(Number(quoteDetails.total || 0) > 0)) {
    throw new Error('Quote total must be greater than zero before invoice/payment can be generated');
  }

  const prefillData = await buildPaymentBookingPrefillDataFromQuote(quoteDetails, payload);
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
      markQuoteAccepted: false,
      recordConversionActivity: false
    });

    if (!wasAlreadyConverted) {
      await recordActivity(
        transaction,
        quote.sales_quote_id,
        'updated',
        user?.userId || null,
        'Draft booking auto-created for invoice/payment flow',
        {
          lead_id: lead.lead_id,
          booking_id: booking.stream_project_booking_id,
          source: 'quote_payment_flow'
        }
      );
    }

    await transaction.commit();

    return {
      quote_id: quote.sales_quote_id,
      lead_id: lead.lead_id,
      booking_id: booking.stream_project_booking_id,
      legacy_quote_id: legacyQuote.quote_id,
      already_converted: wasAlreadyConverted,
      prefill_data: prefillData,
      missing_required_fields: requirementData.missing_required_fields
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function fetchQuoteById(salesQuoteId, user = null) {
  const accessWhere = user ? buildQuoteReadAccessWhere(user) : {};
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
  try {
    const signature = await db.sequelize.query(
      'SELECT signature_base64, signer_name, signer_email, signed_at FROM signatures WHERE quote_id = ? ORDER BY id DESC LIMIT 1',
      {
        replacements: [salesQuoteId],
        type: db.sequelize.QueryTypes.SELECT
      }
    );

    if (signature && signature.length > 0) {
      plain.signature_base64 = toAbsoluteBeigeAssetUrl(signature[0].signature_base64);
      plain.signer_name = signature[0].signer_name;
      plain.signed_at = signature[0].signed_at;
    }
  } catch (err) {
    console.error('Signature fetch error:', err);
  }
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

  plain.edit_guardrails = await getQuoteEditGuardrails({
    sales_quote_id: plain.sales_quote_id,
    lead_id: plain.lead_id,
    quote_number: plain.quote_number,
    client_name: plain.client_name
  });
  const quoteVersions = await listQuoteVersionsById(plain.sales_quote_id);
  plain.quote_versions = quoteVersions.length
    ? quoteVersions
    : [{
        sales_quote_version_id: null,
        version_number: 1,
        version_label: 'Quote Version 1',
        change_reason: 'Current quote snapshot',
        created_at: plain.updated_at || plain.created_at || null,
        created_by_user_id: null,
        created_by: null,
        is_current: true,
        is_fallback_current_version: true
      }];
  const usableQuoteVersions = plain.quote_versions.filter((item) => {
    const approvalStatus = String(item.approval_status || '').trim().toLowerCase();
    return !approvalStatus || approvalStatus === 'approved';
  });
  plain.current_version_number = (usableQuoteVersions.length ? usableQuoteVersions : plain.quote_versions).reduce(
    (maxVersion, item) => Math.max(maxVersion, Number(item.version_number || 0)),
    0
  );

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
  })).map((item) => {
    const nextItem = { ...item };
    delete nextItem.metadata_json;
    return nextItem;
  });
  plain.change_logs = buildQuoteChangeLogs(plain.activities);
  plain.overall_change_summary = buildOverallChangeSummary(plain.activities);
  const quoteFinancialDetails = await getQuoteFinancialDetails({
    quoteId: plain.sales_quote_id,
    bookingId: plain.booking_id || null
  });
  if (quoteFinancialDetails) {
    Object.assign(plain, quoteFinancialDetails);
  }
  const hasPersistedManualPaymentActivity = await hasPersistedManualPaymentLeadActivityForQuote(plain);
  Object.assign(plain, ensureManualPaymentActivityForQuote(plain, {
    includeSynthetic: !hasPersistedManualPaymentActivity
  }));
  plain.converted_booking_details = await getConvertedBookingDetails(plain.booking_id || null);

  return plain;
}

async function getQuoteById(salesQuoteId, user) {
  await expireQuotesPastValidUntil();
  return fetchQuoteById(salesQuoteId, user);
}

async function listQuoteVersions(salesQuoteId, user) {
  const quote = await db.sales_quotes.findOne({
    where: { sales_quote_id: salesQuoteId, ...buildQuoteReadAccessWhere(user) },
    attributes: ['sales_quote_id', 'created_at', 'updated_at'],
    raw: true
  });

  if (!quote) {
    throw new Error('Quote not found');
  }

  const versions = await listQuoteVersionsById(salesQuoteId);
  if (versions.length) {
    return versions;
  }

  return [{
    sales_quote_version_id: null,
    version_number: 1,
    version_label: 'Quote Version 1',
    change_reason: 'Current quote snapshot',
    created_at: quote.updated_at || quote.created_at || null,
    created_by_user_id: null,
    created_by: null,
    is_current: true,
    is_fallback_current_version: true
  }];
}

async function getQuoteVersionByNumber(salesQuoteId, versionNumber, user) {
  const parsedVersionNumber = Number(versionNumber);
  if (!Number.isInteger(parsedVersionNumber) || parsedVersionNumber <= 0) {
    throw new Error('Invalid versionNumber');
  }

  const quote = await db.sales_quotes.findOne({
    where: { sales_quote_id: salesQuoteId, ...buildQuoteReadAccessWhere(user) },
    attributes: ['sales_quote_id', 'created_at', 'updated_at'],
    raw: true
  });

  if (!quote) {
    throw new Error('Quote not found');
  }

  const version = await db.sales_quote_versions.findOne({
    where: {
      sales_quote_id: salesQuoteId,
      version_number: parsedVersionNumber
    },
    include: [
      { model: db.users, as: 'created_by', attributes: ['id', 'name', 'email'], required: false },
      { model: db.sales_quote_activities, as: 'source_activity', attributes: ['activity_id', 'metadata_json', 'created_at'], required: false }
    ]
  });

  if (!version) {
    const existingVersions = await db.sales_quote_versions.count({
      where: { sales_quote_id: salesQuoteId }
    });

    if (existingVersions === 0 && parsedVersionNumber === 1) {
      const currentQuote = await getQuoteById(salesQuoteId, user);
      return {
        version: {
          sales_quote_version_id: null,
          version_number: 1,
          version_label: 'Quote Version 1',
          change_reason: 'Current quote snapshot',
          created_at: quote.updated_at || quote.created_at || null,
          created_by_user_id: null,
          created_by: null,
          is_current: true,
          is_fallback_current_version: true
        },
        quote: currentQuote
      };
    }

    throw new Error('Quote version not found');
  }

  const normalizedVersionQuote = await normalizeQuoteVersionSnapshotForResponse(parseConfig(version.quote_snapshot_json) || {});
  const currentQuote = await fetchQuoteById(salesQuoteId, user);
  const currentVersion = Number(currentQuote?.current_version_number || 0);
  const isCurrentVersion = currentVersion > 0 && Number(version.version_number || 0) === currentVersion;
  const versionQuoteWithPaymentContext = isCurrentVersion && currentQuote
    ? ensureManualPaymentActivityForQuote({
        ...normalizedVersionQuote,
        booking_id: currentQuote.booking_id || normalizedVersionQuote.booking_id || null,
        activities: currentQuote.activities || normalizedVersionQuote.activities || [],
        payment_summary: currentQuote.payment_summary || null,
        manual_payment_summary: currentQuote.manual_payment_summary || null,
        payment_status: currentQuote.payment_status || normalizedVersionQuote.payment_status,
        collected_amount: currentQuote.collected_amount,
        total_paid_amount: currentQuote.total_paid_amount,
        paid_amount: currentQuote.paid_amount,
        outstanding_amount: currentQuote.outstanding_amount,
        due_amount: currentQuote.due_amount
      }, { includeSynthetic: false })
    : normalizedVersionQuote;

  return {
    version: buildQuoteVersionListItem(version, currentVersion || Number(version.version_number || 0)),
    quote: versionQuoteWithPaymentContext
  };
}

async function getCurrentUsableQuoteVersionSnapshot(salesQuoteId, user = null) {
  const normalizedQuoteId = Number(salesQuoteId || 0);
  if (!Number.isInteger(normalizedQuoteId) || normalizedQuoteId <= 0) {
    return null;
  }

  const quote = await db.sales_quotes.findOne({
    where: {
      sales_quote_id: normalizedQuoteId,
      ...(user ? buildQuoteReadAccessWhere(user) : {})
    },
    attributes: ['sales_quote_id', 'created_at', 'updated_at'],
    raw: true
  });

  if (!quote) {
    return null;
  }

  const versions = await db.sales_quote_versions.findAll({
    where: { sales_quote_id: normalizedQuoteId },
    include: [
      { model: db.users, as: 'created_by', attributes: ['id', 'name', 'email'], required: false },
      { model: db.sales_quote_activities, as: 'source_activity', attributes: ['activity_id', 'metadata_json', 'created_at'], required: false }
    ],
    order: [['version_number', 'DESC'], ['sales_quote_version_id', 'DESC']]
  });

  const usableVersion = versions.find((version) => isUsableQuoteVersion(version)) || null;
  if (!usableVersion) {
    return getQuoteById(normalizedQuoteId, user || null);
  }

  const normalizedSnapshot = await normalizeQuoteVersionSnapshotForResponse(
    parseConfig(usableVersion.quote_snapshot_json) || {}
  );
  const versionMeta = buildQuoteVersionListItem(usableVersion, Number(usableVersion.version_number || 0));

  return {
    ...normalizedSnapshot,
    sales_quote_id: normalizedQuoteId,
    quote_id: normalizedQuoteId,
    version_number: versionMeta.version_number,
    version: versionMeta,
    current_version_number: versionMeta.version_number,
    quote_versions: versions.map((version) =>
      buildQuoteVersionListItem(version, versionMeta.version_number)
    )
  };
}

async function getQuoteOverallChangeSummary(salesQuoteId, user = null) {
  const quote = await fetchQuoteById(salesQuoteId, user);
  return quote?.overall_change_summary || null;
}

async function getPublicQuoteById(salesQuoteId) {
  await expireQuotesPastValidUntil();
  return fetchQuoteById(salesQuoteId);
}

function getQuotePreviewExpiryFromValidUntil(validUntil) {
  if (!validUntil) return null;

  const datePart = validUntil instanceof Date
    ? validUntil.toISOString().slice(0, 10)
    : String(validUntil).trim().match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (!datePart) return null;

  const expiry = new Date(`${datePart}T23:59:59.999Z`);
  return Number.isNaN(expiry.getTime()) ? null : expiry;
}

async function createQuotePreviewLink(salesQuoteId, user) {
  const quote = await db.sales_quotes.findOne({
    where: {
      sales_quote_id: salesQuoteId,
      ...(user ? buildQuoteAccessWhere(user) : {})
    },
    attributes: ['sales_quote_id', 'valid_until']
  });

  if (!quote) {
    throw new Error('Quote not found');
  }

  const expiresAt = getQuotePreviewExpiryFromValidUntil(quote.valid_until);
  if (!expiresAt) {
    throw new Error('Set quote valid date before generating preview link');
  }

  await db.sequelize.query(
    `
      UPDATE sales_quote_preview_links
      SET is_active = 0,
          updated_at = NOW()
      WHERE sales_quote_id = :salesQuoteId
        AND is_active = 1
    `,
    {
      replacements: { salesQuoteId },
      type: db.Sequelize.QueryTypes.UPDATE
    }
  );

  const quoteKey = crypto.randomBytes(32).toString('hex');

  await db.sequelize.query(
    `
      INSERT INTO sales_quote_preview_links
        (sales_quote_id, quote_key, expires_at, created_by_user_id, is_active, created_at, updated_at)
      VALUES
        (:salesQuoteId, :quoteKey, :expiresAt, :createdByUserId, 1, NOW(), NOW())
    `,
    {
      replacements: {
        salesQuoteId,
        quoteKey,
        expiresAt,
        createdByUserId: user?.userId || null
      },
      type: db.Sequelize.QueryTypes.INSERT
    }
  );

  return {
    quote_key: quoteKey,
    expires_at: expiresAt.toISOString()
  };
}

async function getActiveQuotePreviewLinkForQuote(salesQuoteId, transaction = null) {
  const activeRows = await db.sequelize.query(
    `
      SELECT quote_key, expires_at
      FROM sales_quote_preview_links
      WHERE sales_quote_id = :salesQuoteId
        AND is_active = 1
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `,
    {
      replacements: { salesQuoteId },
      type: db.Sequelize.QueryTypes.SELECT,
      transaction
    }
  );

  const activeLink = activeRows?.[0];
  if (!activeLink?.quote_key) {
    throw new Error('Create a quote preview link before sending the quote proposal');
  }

  return {
    quote_key: activeLink.quote_key,
    expires_at: activeLink.expires_at instanceof Date
      ? activeLink.expires_at.toISOString()
      : activeLink.expires_at
  };
}

async function getLatestPublicQuotePreviewLink(quoteKey) {
  await expireQuotesPastValidUntil();

  const normalizedKey = String(quoteKey || '').trim();
  if (!normalizedKey) {
    throw new Error('Quote key is required');
  }

  const rows = await db.sequelize.query(
    `
      SELECT
        l.sales_quote_id,
        q.valid_until
      FROM sales_quote_preview_links l
      INNER JOIN sales_quotes q ON q.sales_quote_id = l.sales_quote_id
      WHERE l.quote_key = :quoteKey
      ORDER BY l.is_active DESC, l.created_at DESC
      LIMIT 1
    `,
    {
      replacements: { quoteKey: normalizedKey },
      type: db.Sequelize.QueryTypes.SELECT
    }
  );

  const linkRow = rows?.[0];
  if (!linkRow?.sales_quote_id) {
    throw createQuotePreviewLinkError('QUOTE_PREVIEW_INVALID');
  }

  const latestVersion = await db.sales_quote_versions.findOne({
    where: { sales_quote_id: Number(linkRow.sales_quote_id) },
    include: [
      {
        model: db.sales_quote_activities,
        as: 'source_activity',
        attributes: ['activity_id', 'metadata_json', 'created_at'],
        required: false
      }
    ],
    order: [['version_number', 'DESC'], ['sales_quote_version_id', 'DESC']]
  });

  if (latestVersion && !isUsableQuoteVersion(latestVersion)) {
    const approvalMetadata = getQuoteVersionApprovalMetadata(latestVersion);
    const error = createQuotePreviewLinkError('QUOTE_PREVIEW_APPROVAL_PENDING');
    error.message = 'Admin approval is pending for the latest quote version';
    error.details = {
      ...error.details,
      approval_status: approvalMetadata.approval_status || 'pending',
      version_number: Number(latestVersion.version_number || 0)
    };
    throw error;
  }

  const data = await createQuotePreviewLink(Number(linkRow.sales_quote_id), null);
  return {
    ...data,
    sales_quote_id: Number(linkRow.sales_quote_id),
    version_number: latestVersion ? Number(latestVersion.version_number || 0) : 1
  };
}

function createQuotePreviewLinkError(reasonCode) {
  const error = new Error('Quote preview link is invalid or expired');
  if (reasonCode) {
    error.details = { reason_code: reasonCode };
  }
  return error;
}

async function getPublicQuoteByKey(quoteKey) {
  await expireQuotesPastValidUntil();

  const normalizedKey = String(quoteKey || '').trim();
  if (!normalizedKey) {
    throw new Error('Quote key is required');
  }
  const now = new Date();

  const rows = await db.sequelize.query(
    `
      SELECT
        l.sales_quote_id,
        l.is_active,
        l.expires_at,
        l.created_at,
        q.valid_until
      FROM sales_quote_preview_links l
      INNER JOIN sales_quotes q ON q.sales_quote_id = l.sales_quote_id
      WHERE l.quote_key = :quoteKey
      ORDER BY l.is_active DESC, l.created_at DESC
      LIMIT 1
    `,
    {
      replacements: { quoteKey: normalizedKey },
      type: db.Sequelize.QueryTypes.SELECT
    }
  );

  const linkRow = rows?.[0];
  if (!linkRow?.sales_quote_id) {
    // Backward compatibility for old frontend-generated signed links.
    const legacyQuoteId = resolveLegacyQuotePreviewTokenQuoteId(normalizedKey);
    if (!legacyQuoteId) {
      throw new Error('Quote preview link is invalid or expired');
    }

    const legacyQuote = await fetchQuoteById(Number(legacyQuoteId));
    if (!legacyQuote) {
      throw new Error('Quote preview link is invalid or expired');
    }

    const legacyValidUntilExpiry = getQuotePreviewExpiryFromValidUntil(legacyQuote.valid_until);
    if (legacyValidUntilExpiry && now > legacyValidUntilExpiry) {
      throw new Error('Quote preview link is invalid or expired');
    }

    return (await getCurrentUsableQuoteVersionSnapshot(Number(legacyQuoteId))) || legacyQuote;
  }

  const linkExpiresAt = linkRow.expires_at ? new Date(linkRow.expires_at) : null;
  const quoteValidUntilExpiry = getQuotePreviewExpiryFromValidUntil(linkRow.valid_until);
  const linkCreatedAt = linkRow.created_at ? new Date(linkRow.created_at) : null;
  const latestVersion = await getLatestQuoteVersionRecord(Number(linkRow.sales_quote_id));
  const latestVersionCreatedAt = latestVersion?.created_at ? new Date(latestVersion.created_at) : null;

  const isSupersededLink =
    Number(linkRow.is_active) !== 1 ||
    (linkCreatedAt && latestVersionCreatedAt && linkCreatedAt < latestVersionCreatedAt);

  if (isSupersededLink && latestVersion && !isUsableQuoteVersion(latestVersion)) {
    const approvalMetadata = getQuoteVersionApprovalMetadata(latestVersion);
    const error = createQuotePreviewLinkError('QUOTE_PREVIEW_APPROVAL_PENDING');
    error.message = 'Admin approval is pending for the latest quote version';
    error.details = {
      ...error.details,
      approval_status: approvalMetadata.approval_status || 'pending',
      version_number: Number(latestVersion.version_number || 0)
    };
    throw error;
  }

  if (isSupersededLink) {
    throw createQuotePreviewLinkError('QUOTE_PREVIEW_SUPERSEDED');
  }

  if ((linkExpiresAt && now > linkExpiresAt) || (quoteValidUntilExpiry && now > quoteValidUntilExpiry)) {
    throw createQuotePreviewLinkError('QUOTE_PREVIEW_EXPIRED');
  }

  return getCurrentUsableQuoteVersionSnapshot(Number(linkRow.sales_quote_id));
}

function getLegacyQuotePreviewSecret() {
  return process.env.QUOTE_PREVIEW_SECRET
    || process.env.DO_SECRET
    || 'local-dev-quote-preview-secret-change-me';
}

function resolveLegacyQuotePreviewTokenQuoteId(token) {
  const [encodedPayload, signature] = String(token || '').split('.');
  if (!encodedPayload || !signature) return null;

  const expectedSignature = crypto
    .createHmac('sha256', getLegacyQuotePreviewSecret())
    .update(encodedPayload)
    .digest('base64url');

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    const quoteId = String(payload?.qid || '').trim();
    const exp = Number(payload?.exp || 0);
    if (!quoteId || !/^\d+$/.test(quoteId) || !Number.isFinite(exp)) {
      return null;
    }

    if (exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return Number(quoteId);
  } catch (_) {
    return null;
  }
}

async function listQuotes(query, user) {
  await expireQuotesPastValidUntil();

  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
  const offset = (page - 1) * limit;
  // Quote listing is shared across admin/sales views where reps are expected
  // to browse all quotes. Keep strict restriction only for client role.
  const where = isClientRole(user?.role)
    ? { ...buildQuoteAccessWhere(user) }
    : {};

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

  const leadIds = Array.from(
    new Set(
      rows
        .map((item) => Number(item.lead_id || 0))
        .filter((leadId) => Number.isFinite(leadId) && leadId > 0)
    )
  );
  const quoteIds = rows
    .map((item) => Number(item.sales_quote_id || 0))
    .filter((quoteId) => Number.isFinite(quoteId) && quoteId > 0);

  const quoteActivities = quoteIds.length
    ? await db.sales_quote_activities.findAll({
        where: {
          sales_quote_id: { [Op.in]: quoteIds }
        },
        include: [{ model: db.users, as: 'performed_by', attributes: ['id', 'name', 'email'], required: false }],
        order: [['created_at', 'DESC'], ['activity_id', 'DESC']]
      })
    : [];

  const changeLogsByQuote = quoteActivities.reduce((acc, activity) => {
    const plainActivity = activity.toJSON();
    const quoteId = Number(plainActivity.sales_quote_id || 0);
    if (!quoteId) return acc;
    if (!acc[quoteId]) acc[quoteId] = [];
    acc[quoteId].push({
      ...plainActivity,
      metadata: parseConfig(plainActivity.metadata_json)
    });
    return acc;
  }, {});

  const paymentActivities = leadIds.length
    ? await db.sales_lead_activities.findAll({
        where: {
          lead_id: { [Op.in]: leadIds },
          activity_type: 'payment_completed'
        },
        attributes: ['lead_id', 'activity_data', 'created_at'],
        order: [['created_at', 'DESC']],
        raw: true
      })
    : [];

  const paymentActivitiesByLead = paymentActivities.reduce((acc, activity) => {
    const leadId = Number(activity.lead_id || 0);
    if (!leadId) return acc;
    if (!acc[leadId]) acc[leadId] = [];
    acc[leadId].push(activity);
    return acc;
  }, {});

  const rowsWithFinancialDetails = await Promise.all(rows.map(async (item) => {
    const plain = item.toJSON();
    const billingState = await resolveQuoteBillingState(plain);
    const financialDetails = await getQuoteFinancialDetails({
      quoteId: plain.sales_quote_id,
      bookingId: billingState.booking?.stream_project_booking_id || null
    });
    const manualActivities = paymentActivitiesByLead[Number(plain.lead_id || 0)] || [];
    const manualPaymentSummary = computeManualPaymentProgressFromActivities(
      manualActivities,
      Number(plain.total || 0)
    );
    const hasManualFullPayment = manualPaymentSummary.hasFullPayment;
    const hasManualPartialPayment = manualPaymentSummary.isPartiallyPaid;
    const additionalPayment = financialDetails?.additional_payment || financialDetails?.partial_payment || null;
    const additionalOutstanding = Number(additionalPayment?.outstanding_amount || 0);
    const additionalPaymentStatus = String(additionalPayment?.payment_status || '').toLowerCase();
    const additionalSettled =
      additionalOutstanding <= 0 ||
      ['paid', 'succeeded', 'completed', 'success'].includes(additionalPaymentStatus);
    const hasAdditionalPending = additionalPayment && !additionalSettled && additionalOutstanding > 0;

    const resolvedPaymentStatus = hasAdditionalPending
      ? 'partially_paid'
      : (additionalSettled && additionalPayment)
        ? 'paid'
        : hasManualFullPayment
          ? 'paid'
          : hasManualPartialPayment
            ? 'partially_paid'
            : billingState.payment_status;

    const resolvedCollectedAmount = hasManualFullPayment || hasManualPartialPayment
      ? manualPaymentSummary.paidAmount
      : billingState.collected_amount;
    const resolvedOutstandingAmount = hasManualFullPayment || hasManualPartialPayment
      ? manualPaymentSummary.pendingAmount
      : billingState.outstanding_amount;
    const resolvedManualPaymentSummary = financialDetails?.manual_payment_summary || manualPaymentSummary;
    const hasSummaryManualFullPayment = Boolean(resolvedManualPaymentSummary?.hasFullPayment);
    const hasSummaryManualPartialPayment = Boolean(resolvedManualPaymentSummary?.isPartiallyPaid);

    return {
      ...plain,
      ...(financialDetails || {}),
      latest_change_log: buildQuoteChangeLogs(changeLogsByQuote[Number(plain.sales_quote_id || 0)] || [])[0] || null,
      change_log_count: buildQuoteChangeLogs(changeLogsByQuote[Number(plain.sales_quote_id || 0)] || []).length,
      payment_status: hasSummaryManualFullPayment
        ? 'paid'
        : hasSummaryManualPartialPayment
          ? 'partially_paid'
          : resolvedPaymentStatus,
      is_collected: hasSummaryManualFullPayment ? true : (hasManualFullPayment ? true : billingState.is_collected),
      collected_amount: hasSummaryManualFullPayment || hasSummaryManualPartialPayment
        ? resolvedManualPaymentSummary.paidAmount
        : resolvedCollectedAmount,
      outstanding_amount: hasSummaryManualFullPayment || hasSummaryManualPartialPayment
        ? resolvedManualPaymentSummary.pendingAmount
        : resolvedOutstandingAmount,
      manual_payment_summary: resolvedManualPaymentSummary
    };
  }));

  return {
    pagination: {
      page,
      limit,
      total: count,
      total_pages: Math.ceil(count / limit)
    },
    summary,
    rows: rowsWithFinancialDetails
  };
}

async function getQuoteDashboard(query, user) {
  await expireQuotesPastValidUntil();

  // Match listQuotes access: dashboard is global for sales/admin views,
  // while clients remain restricted to their own records.
  const where = isClientRole(user?.role)
    ? { ...buildQuoteAccessWhere(user) }
    : {};

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

    const previousQuoteAuditSnapshot = toPlainRecord(quote);
    const patch = {
      status,
      updated_at: new Date()
    };
    if (status === 'sent') patch.sent_at = new Date();
    if (status === 'viewed') patch.viewed_at = new Date();
    if (status === 'accepted' || status === 'paid') patch.accepted_at = new Date();
    if (status === 'rejected') patch.rejected_at = new Date();

    await quote.update(patch, { transaction });

    if (status === 'rejected' && quote.lead_id) {
      const linkedLead = await db.sales_leads.findOne({
        where: {
          lead_id: quote.lead_id,
          is_active: 1
        },
        transaction
      });

      if (
        linkedLead &&
        linkedLead.booking_id &&
        linkedLead.lead_source === CONVERTED_BOOKINGS_LEAD_SOURCE &&
        linkedLead.lead_status !== 'abandoned'
      ) {
        const oldLeadStatus = linkedLead.lead_status;

        await linkedLead.update({
          lead_status: 'abandoned',
          last_activity_at: new Date(),
          updated_at: new Date()
        }, { transaction });

        await db.sales_lead_activities.create({
          lead_id: linkedLead.lead_id,
          activity_type: 'status_changed',
          activity_data: {
            old_status: oldLeadStatus,
            new_status: 'abandoned',
            source: 'sales_quote_rejection',
            sales_quote_id: salesQuoteId,
            booking_id: linkedLead.booking_id
          },
          performed_by_user_id: user.userId || null
        }, { transaction });
      }
    }

    const statusActivity = await recordActivity(
      transaction,
      salesQuoteId,
      status === 'sent' ? 'sent' : status === 'viewed' ? 'viewed' : status === 'accepted' ? 'accepted' : status === 'rejected' ? 'rejected' : 'status_changed',
      user.userId,
      `Quote marked as ${status}`,
      {
        status,
        previous_status: previousQuoteAuditSnapshot.status || null,
        audit: buildQuoteAuditLog({
          action: 'updated',
          previousQuote: previousQuoteAuditSnapshot,
          nextQuote: {
            ...previousQuoteAuditSnapshot,
            ...patch
          },
          previousLineItems: [],
          nextLineItems: [],
          userId: user.userId
        })
      }
    );
    const currentVersion = await getLatestQuoteVersionRecord(salesQuoteId, transaction);
    await attachQuoteVersionToActivity(transaction, statusActivity, currentVersion);
    await transaction.commit();
    return getQuoteById(salesQuoteId, user);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function sendQuoteProposal(salesQuoteId, payload, user) {
  await expireQuotesPastValidUntil();

  const transaction = await db.sequelize.transaction();
  try {
    const quote = await db.sales_quotes.findOne({
      where: { sales_quote_id: salesQuoteId, ...buildQuoteAccessWhere(user) },
      transaction
    });

    if (!quote) {
      throw new Error('Quote not found');
    }

    if (String(quote.status || '').toLowerCase() === 'expired') {
      throw new Error('Quote cannot be sent because it is expired');
    }

    const quoteDetails = await getQuoteById(salesQuoteId, user);
    if (!quoteDetails) {
      throw new Error('Quote not found');
    }

    const toEmail = payload?.to_email || quoteDetails.client_email;
    if (!toEmail) {
      throw new Error('Client email is required to send quote proposal');
    }

    assertQuotePaymentChangeApproved(quoteDetails);

    const previewLink = await getActiveQuotePreviewLinkForQuote(salesQuoteId, transaction);

    const paymentSummary = buildQuoteProposalPaymentSummary(quoteDetails);
    const quoteDetailsForPdf = paymentSummary.is_additional_payment || paymentSummary.is_reduced_payment || paymentSummary.is_partial_payment
      ? { ...quoteDetails, payment_summary: paymentSummary }
      : quoteDetails;
    const generatedPdfBuffer = payload?.attachment_content || payload?.pdf_base64
      ? null
      : await generateQuotePdfBuffer(quoteDetailsForPdf);

    const emailResult = await sendCustomQuoteProposalEmail({
      to_email: toEmail,
      first_name: quoteDetails.client_name || '',
      shoot_type: quoteDetails.video_shoot_type || 'TBD',
      project_description: quoteDetails.project_description || 'TBD',
      location: quoteDetails.client_address || 'TBD',
      quote_validity: deriveQuoteValidityText(quoteDetails),
      add_ons: deriveQuoteAddOns(quoteDetails.line_items || []),
      includes: deriveQuoteIncludes(quoteDetails.line_items || []),
      proposal_amount: paymentSummary.amount_due,
      proposal_amount_label: paymentSummary.proposal_amount_label,
      is_additional_payment: paymentSummary.is_additional_payment,
      is_reduced_payment: paymentSummary.is_reduced_payment,
      is_partial_payment: paymentSummary.is_partial_payment,
      previously_paid_amount: paymentSummary.previously_paid_amount,
      revised_total: paymentSummary.revised_total,
      additional_amount: paymentSummary.additional_amount,
      reduced_amount: paymentSummary.reduced_amount,
      payment_note: paymentSummary.payment_note,
      accept_quote_url: buildQuotePreviewUrl(previewLink.quote_key),
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

async function acceptQuoteProposal(token) {
  const decoded = verifyQuoteAcceptToken(token);
  const salesQuoteId = Number(decoded.sales_quote_id);

  if (!Number.isInteger(salesQuoteId) || salesQuoteId <= 0) {
    throw new Error('Invalid accept token');
  }

  return acceptQuoteById(salesQuoteId, {
    expectedQuoteNumber: decoded.quote_number || null,
    expectedClientEmail: decoded.client_email || null,
    activityMessage: 'Quote accepted by client via email',
    activitySource: 'email_accept_link',
    sendClientEmail: true,
    sendSalesEmail: true
  });
}

async function acceptQuoteById(salesQuoteId, options = {}) {
  const {
    expectedQuoteNumber = null,
    expectedClientEmail = null,
    activityMessage = 'Quote accepted',
    activitySource = 'manual_accept',
    sendClientEmail = false,
    sendSalesEmail = true,
    convertToBooking = true
  } = options;

  const transaction = await db.sequelize.transaction();
  let transactionCompleted = false;
  let bookingConversion = null;
  let paymentDetails = null;

  try {
    await expireQuotesPastValidUntil({ transaction });

    const quote = await db.sales_quotes.findOne({
      where: { sales_quote_id: salesQuoteId },
      transaction
    });

    if (!quote) {
      throw new Error('Quote not found');
    }

    if (expectedQuoteNumber && quote.quote_number !== expectedQuoteNumber) {
      throw new Error('Invalid accept token');
    }

    if (expectedClientEmail && quote.client_email && String(expectedClientEmail).toLowerCase() !== String(quote.client_email).toLowerCase()) {
      throw new Error('Invalid accept token');
    }

    if (['rejected', 'expired'].includes(quote.status)) {
      throw new Error(`Quote cannot be accepted because it is ${quote.status}`);
    }

    const alreadyAccepted = ['accepted', 'paid'].includes(quote.status);
    const quoteDetails = await fetchQuoteById(salesQuoteId);
    if (!quoteDetails) {
      throw new Error('Quote not found');
    }

    if (convertToBooking) {
      if (!hasConvertibleServiceInQuote(quoteDetails.line_items || [])) {
        throw new Error('Quote must include at least one service to convert into a booking');
      }

      const prefillData = await buildPaymentBookingPrefillDataFromQuote(quoteDetails);
      const conversionUser = {
        userId: quote.assigned_sales_rep_id || quote.created_by_user_id || null,
        role: 'admin'
      };

      const conversionResult = await syncConvertedQuoteArtifacts({
        quote,
        quoteDetails,
        prefillData,
        user: conversionUser,
        transaction,
        markQuoteAccepted: true,
        recordConversionActivity: !alreadyAccepted
      });

      bookingConversion = {
        lead_id: conversionResult.lead?.lead_id || null,
        booking_id: conversionResult.booking?.stream_project_booking_id || null,
        legacy_quote_id: conversionResult.legacyQuote?.quote_id || null,
        already_converted: conversionResult.wasAlreadyConverted
      };

      const zeroPayablePayment = await markZeroPayableQuoteBookingPaid({
        bookingId: bookingConversion.booking_id,
        salesQuoteId,
        quoteDetails,
        leadId: bookingConversion.lead_id,
        transaction
      });

      if (zeroPayablePayment) {
        bookingConversion.payment_status = zeroPayablePayment.payment_summary?.payment_status || 'no_payment_due';
        bookingConversion.final_payable_amount = zeroPayablePayment.final_payable_amount;
      }
    } else if (!alreadyAccepted) {
      const acceptedAt = new Date();
      await quote.update({
        status: 'accepted',
        accepted_at: acceptedAt,
        updated_at: acceptedAt
      }, { transaction });

      await recordActivity(
        transaction,
        salesQuoteId,
        'accepted',
        null,
        activityMessage,
        { source: activitySource }
      );
    }

    await transaction.commit();
    transactionCompleted = true;

    const acceptedQuoteDetails = await getPublicQuoteById(salesQuoteId);
    if (!acceptedQuoteDetails) {
      throw new Error('Quote not found');
    }

    if (bookingConversion?.booking_id) {
      try {
        paymentDetails = await buildQuoteAcceptancePaymentDetails({
          bookingId: bookingConversion.booking_id,
          quoteDetails: acceptedQuoteDetails
        });
      } catch (paymentError) {
        console.error('Error preparing quote acceptance payment link:', paymentError);
        paymentDetails = {
          booking_id: bookingConversion.booking_id,
          payment_url: null,
          error: paymentError.message || 'Failed to prepare payment link'
        };
      }
    }

    let notificationResults = {
      client_email: { success: false, skipped: true },
      sales_email: { success: false, skipped: true }
    };

    if (!alreadyAccepted) {
      const emailPayload = deriveQuoteAcceptanceEmailPayload(acceptedQuoteDetails);
      notificationResults = {
        client_email: sendClientEmail && acceptedQuoteDetails.client_email
          ? await sendQuoteAcceptedClientEmail(emailPayload)
          : { success: false, skipped: true, error: 'Client email not available' },
        sales_email: sendSalesEmail
          ? await sendQuoteAcceptedSalesNotificationEmail(emailPayload)
          : { success: false, skipped: true }
      };
    }

    return {
      already_accepted: alreadyAccepted,
      quote: acceptedQuoteDetails,
      booking_conversion: bookingConversion,
      payment: paymentDetails,
      notifications: notificationResults
    };
  } catch (error) {
    if (!transactionCompleted) {
      await transaction.rollback();
    }
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      throw new Error('Invalid accept token');
    }
    throw error;
  }
}

async function acceptQuoteOnSignature(salesQuoteId, signatureDetails = {}) {
  const signerName = String(signatureDetails.signer_name || '').trim();

  return acceptQuoteById(Number(salesQuoteId), {
    activityMessage: signerName
      ? `Quote accepted by signature from ${signerName}`
      : 'Quote accepted by signature',
    activitySource: 'signature_sign',
    sendClientEmail: false,
    sendSalesEmail: true
  });
}

async function downloadQuotePdf(salesQuoteId, user) {
  const quoteDetails = await getQuoteById(salesQuoteId, user);
  if (!quoteDetails) {
    throw new Error('Quote not found');
  }

  const paymentSummary = buildQuoteProposalPaymentSummary(quoteDetails);
  const buffer = await generateQuotePdfBuffer(
    paymentSummary.is_additional_payment || paymentSummary.is_reduced_payment || paymentSummary.is_partial_payment
      ? { ...quoteDetails, payment_summary: paymentSummary }
      : quoteDetails
  );

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
  listQuoteVersions,
  getQuoteVersionByNumber,
  getCurrentUsableQuoteVersionSnapshot,
  getQuoteOverallChangeSummary,
  getPublicQuoteById,
  createQuotePreviewLink,
  getLatestPublicQuotePreviewLink,
  getPublicQuoteByKey,
  listQuotes,
  getQuoteDashboard,
  updateQuoteStatus,
  sendQuoteProposal,
  getQuoteAcceptancePreview,
  acceptQuoteProposal,
  acceptQuoteOnSignature,
  ensureQuoteBookingForPayment,
  downloadQuotePdf
};
