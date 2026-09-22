const pricingService = require('./pricing.service');
const { getStudioPricingSnapshot } = require('../utils/studio-pricing');

const ROLE_TO_ITEM_MAP = {
  videographer: 11,
  photographer: 10,
  cinematographer: 12,
};

const parseArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parsePricingSnapshot = (description) => {
  if (!description) return null;

  const text = String(description);
  const marker = '[BEIGE_PRICING_META]';
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return null;

  const afterMarker = text.slice(markerIndex + marker.length);
  const nextMetaIndex = afterMarker.search(/\n\n\[BEIGE_[A-Z_]+META\]/);
  const jsonText = (nextMetaIndex >= 0 ? afterMarker.slice(0, nextMetaIndex) : afterMarker).trim();

  try {
    const parsed = JSON.parse(jsonText);
    const total = Number(parsed?.total || 0);
    const subtotal = Number(parsed?.subtotal || total || 0);
    const lineItems = Array.isArray(parsed?.line_items)
      ? parsed.line_items
          .map((item) => {
            const itemName = String(item?.item_name || item?.name || '').trim();
            const lineTotal = Number(item?.line_total ?? item?.total ?? 0);
            if (!itemName || !Number.isFinite(lineTotal) || lineTotal <= 0) return null;
            return {
              item_id: item?.item_id ?? null,
              item_name: itemName,
              name: itemName,
              category_name: item?.category_name || null,
              category_slug: item?.category_slug || null,
              quantity: Number(item?.quantity || 1),
              unit_price: Number(item?.unit_price || 0),
              line_total: lineTotal,
              total: lineTotal,
              rate_type: item?.rate_type || null,
              rate_unit: item?.rate_unit || null,
            };
          })
          .filter(Boolean)
      : [];

    if (!Number.isFinite(total) || total <= 0) return null;

    return {
      source: 'book_a_shoot_v4_snapshot',
      total,
      subtotal: Number.isFinite(subtotal) && subtotal > 0 ? subtotal : total,
      discount_amount: Number(parsed?.discount_amount || 0),
      shoot_hours: Number(parsed?.shoot_hours || 0),
      line_items: lineItems,
    };
  } catch {
    return null;
  }
};

const parseRoles = (booking) => {
  let roles = {};
  try {
    roles = typeof booking?.crew_roles === 'string'
      ? JSON.parse(booking.crew_roles || '{}')
      : (booking?.crew_roles || {});
  } catch {
    roles = {};
  }

  if (!roles || Array.isArray(roles) || Object.keys(roles).length === 0) {
    const content = String(booking?.content_type || booking?.event_type || '').toLowerCase();
    roles = {};
    if (content.includes('videographer')) roles.videographer = 1;
    if (content.includes('photographer')) roles.photographer = 1;
    if (content.includes('cinematographer')) roles.cinematographer = 1;
  }

  return roles;
};

const resolveHours = (booking) => {
  const persisted = Number(booking?.duration_hours);
  if (persisted > 0) return persisted;

  if (booking?.start_time && booking?.end_time) {
    const [startHour, startMinute] = String(booking.start_time).split(':').map(Number);
    const [endHour, endMinute] = String(booking.end_time).split(':').map(Number);
    if ([startHour, startMinute, endHour, endMinute].every(Number.isFinite)) {
      let minutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
      if (minutes < 0) minutes += 24 * 60;
      if (minutes > 0) return Math.round((minutes / 60) * 100) / 100;
    }
  }

  // An early lead with no schedule should not invent an eight-hour charge.
  return 0;
};

async function calculateBookingPricing(booking) {
  if (!booking) return null;

  const quote = booking.primary_quote;
  if (quote) {
    return {
      source: 'database',
      quote_id: quote.quote_id,
      total: Number(quote.total ?? quote.price_after_discount ?? quote.subtotal ?? 0),
      subtotal: Number(quote.subtotal || 0),
      discount_amount: Number(quote.discount_amount || 0),
      shoot_hours: Number(quote.shoot_hours || 0),
      line_items: (quote.line_items || []).map((item) => ({
        item_id: item.item_id,
        item_name: item.item_name,
        name: item.item_name,
        quantity: Number(item.quantity || 1),
        unit_price: Number(item.unit_price || 0),
        line_total: Number(item.line_total || 0),
        total: Number(item.line_total || 0),
        notes: item.notes || null,
      })),
    };
  }

  const pricingSnapshot = parsePricingSnapshot(booking.description);
  if (pricingSnapshot) {
    return pricingSnapshot;
  }

  const roles = parseRoles(booking);
  const items = Object.entries(roles)
    .map(([role, quantity]) => ({
      item_id: ROLE_TO_ITEM_MAP[String(role).toLowerCase()],
      quantity: Number(quantity) || 0,
    }))
    .filter((item) => item.item_id && item.quantity > 0);
  const studioSnapshot = getStudioPricingSnapshot(booking.description);
  const hours = resolveHours(booking);
  const hasEdits = parseArray(booking.video_edit_types).length > 0 ||
    parseArray(booking.photo_edit_types).length > 0;

  if (items.length === 0 && studioSnapshot.items.length === 0 && !hasEdits) {
    return {
      source: 'incomplete_booking',
      total: 0,
      subtotal: 0,
      shoot_hours: hours,
      line_items: [],
    };
  }

  const calculated = await pricingService.calculateQuote({
    items,
    shootHours: hours,
    eventType: booking.shoot_type || booking.event_type || 'general',
    shootStartDate: booking.event_date,
    studioTotal: studioSnapshot.total,
    studioItems: studioSnapshot.items,
    videoEditTypes: parseArray(booking.video_edit_types),
    photoEditTypes: parseArray(booking.photo_edit_types),
    skipDiscount: true,
    skipMargin: true,
  });

  const persistedBudget = Number(booking?.budget || 0);
  const calculatedTotal = Number(calculated.total || 0);
  const effectiveTotal =
    Number.isFinite(persistedBudget) && persistedBudget > calculatedTotal
      ? persistedBudget
      : calculatedTotal;

  return {
    source: 'current_booking_state',
    total: effectiveTotal,
    subtotal: effectiveTotal,
    discount_amount: Number(calculated.discountAmount || 0),
    shoot_hours: hours,
    line_items: calculated.lineItems || [],
  };
}

module.exports = { calculateBookingPricing };
