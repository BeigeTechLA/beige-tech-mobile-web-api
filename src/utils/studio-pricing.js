const STUDIO_META_MARKER = '[BEIGE_STUDIO_META]';

function getStudioPricingSnapshot(description) {
  const match = getStudioMetaMatch(description);
  if (!match) return { items: [], total: 0 };

  try {
    const parsed = JSON.parse(match.jsonText);
    const items = normalizeStudioItems(parsed)
      .map((studio) => ({
        studio_id: studio.studioId,
        name: studio.name,
        pricing_mode: studio.pricingMode,
        quantity: studio.quantity,
        unit_price: studio.unitPrice,
        total: studio.totalPrice,
        location: studio.location,
        image: studio.image,
        pricing_category: studio.pricingCategory,
        pricing_label: studio.pricingLabel,
        cleaning_fee: studio.cleaningFee,
        minimum_hours: studio.minimumHours,
        price_label: studio.priceLabel,
        selected_date: studio.selectedDate,
        start_time: studio.startTime,
        end_time: studio.endTime,
        time_zone: studio.timeZone,
        studio_booking_type: studio.studioBookingType,
        studio_booking_for: studio.studioBookingFor,
        booking_days: studio.bookingDays,
        cast_and_crew_count: studio.castAndCrewCount,
        update_studio_datetime: studio.updateStudioDatetime,
        lat: studio.lat,
        lng: studio.lng,
      }));

    return {
      items,
      total: parseFloat(items.reduce((sum, studio) => sum + studio.total, 0).toFixed(2)),
    };
  } catch {
    return { items: [], total: 0 };
  }
}

function isStudioLineItem(item = {}) {
  const name = String(item.item_name || item.name || '').toLowerCase();
  const notes = String(item.notes || '').toLowerCase();
  return notes.startsWith('[studio:') || name.includes('studio') ||
    name.includes('resort') || name.includes('location platform');
}

function buildStudioMetaString(studioItems = []) {
  const items = normalizeStudioItems(studioItems);
  return items.length > 0 ? `${STUDIO_META_MARKER}${JSON.stringify(items)}` : '';
}

function stripStudioMeta(description) {
  const text = String(description || '');
  const match = getStudioMetaMatch(text);
  if (!match) return text.trim();

  return text
    .replace(match.rawText, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeStudioItem(studio = {}) {
  const studioId = String(studio?.studio_id || studio?.studioId || '').trim();
  const quantity = toNumber(studio?.quantity, 1) || 1;
  const unitPrice = toNumber(studio?.unit_price ?? studio?.unitPrice, 0);
  const total = toNumber(studio?.total ?? studio?.totalPrice, 0);
  const rawBookingDays = studio?.booking_days || studio?.bookingDays || [];

  return {
    studioId,
    name: String(studio?.name || 'BEIGE Studio'),
    location: studio?.location || studio?.address || null,
    image: studio?.image || studio?.image_url || studio?.imageUrl || null,
    pricingMode: normalizeStudioPricingMode(studio?.pricing_mode ?? studio?.pricingMode),
    pricingCategory: studio?.pricing_category || studio?.pricingCategory || null,
    pricingLabel: studio?.pricing_label || studio?.pricingLabel || null,
    quantity,
    unitPrice,
    cleaningFee: toNumber(studio?.cleaning_fee ?? studio?.cleaningFee, 0),
    minimumHours: toNumber(studio?.minimum_hours ?? studio?.minimumHours, 0),
    totalPrice: total,
    priceLabel: studio?.price_label || studio?.priceLabel || null,
    selectedDate: studio?.selected_date || studio?.selectedDate || null,
    startTime: studio?.start_time || studio?.startTime || null,
    endTime: studio?.end_time || studio?.endTime || null,
    timeZone: studio?.time_zone || studio?.timeZone || null,
    studioBookingType: normalizeStudioBookingType(studio?.studio_booking_type || studio?.studioBookingType, rawBookingDays),
    studioBookingFor: studio?.studio_booking_for || studio?.studioBookingFor || studio?.booking_for || studio?.bookingFor || null,
    bookingDays: normalizeStudioBookingDays(rawBookingDays),
    castAndCrewCount: toNullableNumber(studio?.cast_and_crew_count ?? studio?.castAndCrewCount),
    updateStudioDatetime: toNullableBoolean(studio?.update_studio_datetime ?? studio?.updateStudioDatetime),
    lat: studio?.lat ?? studio?.latitude ?? null,
    lng: studio?.lng ?? studio?.longitude ?? null,
  };
}

function normalizeStudioItems(studioItems = []) {
  return (Array.isArray(studioItems) ? studioItems : [])
    .map(normalizeStudioItem)
    .filter((studio) => studio.studioId && studio.totalPrice > 0);
}

function getStudioMetaMatch(description) {
  const text = String(description || '');
  const markerIndex = text.indexOf(STUDIO_META_MARKER);
  if (markerIndex < 0) return null;

  const markerText = text.slice(markerIndex);
  const escapedMarker = STUDIO_META_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markerText.match(new RegExp(`^${escapedMarker}\\s*(\\[[\\s\\S]*?\\])(?:\\s|$)`));
  if (!match) return null;

  return {
    markerIndex,
    jsonText: match[1],
    rawText: match[0],
  };
}

function normalizeStudioPricingMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'weekend' ? 'weekend' : 'hourly';
}

function normalizeStudioBookingType(value, bookingDays = []) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'multi_day' || normalized === 'single_day') return normalized;
  return Array.isArray(bookingDays) && bookingDays.length > 0 ? 'multi_day' : 'single_day';
}

function normalizeStudioBookingDays(bookingDays = []) {
  return (Array.isArray(bookingDays) ? bookingDays : [])
    .filter((day) => day && (day.date || day.event_date))
    .map((day) => ({
      date: day.date || day.event_date,
      startTime: day.start_time || day.startTime || null,
      endTime: day.end_time || day.endTime || null,
      durationHours: toNullableNumber(day.duration_hours ?? day.durationHours),
      timeZone: day.time_zone || day.timeZone || null,
    }));
}

function toNullableBoolean(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  return null;
}

function toNullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

module.exports = {
  STUDIO_META_MARKER,
  buildStudioMetaString,
  getStudioPricingSnapshot,
  isStudioLineItem,
  normalizeStudioItem,
  normalizeStudioItems,
  stripStudioMeta,
};
