const db = require('../models');
const pricingService = require('./pricing.service');

const DEFAULT_PLATFORM_FEE_PERCENT = Number(process.env.BEIGE_MARGIN_PERCENT || 25);
const ROLE_TO_ITEM_MAP = {
  videographer: 11,
  photographer: 10,
  cinematographer: 12,
  11: 11,
  10: 10,
  12: 12
};

function roundCurrency(value) {
  return Number(Number(value || 0).toFixed(2));
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function stringifyMetadata(value) {
  if (!value) return null;
  try {
    return JSON.stringify(value);
  } catch (_) {
    return null;
  }
}

function toPlainRecord(record) {
  if (!record) return null;
  if (typeof record.get === 'function') return record.get({ plain: true });
  if (typeof record.toJSON === 'function') return record.toJSON();
  return record;
}

function parseFlexibleJson(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'string' ? parseFlexibleJson(parsed, fallback) : parsed;
  } catch (_) {
    return fallback;
  }
}

function buildTransactionCode(paymentId, bookingId) {
  const date = new Date();
  const yyyy = date.getFullYear();
  return `TXN-${yyyy}-${String(paymentId || bookingId).padStart(6, '0')}`;
}

function normalizeStatus(paymentStatus, hasPayment) {
  if (paymentStatus === 'succeeded' || paymentStatus === 'paid' || hasPayment) return 'paid';
  if (paymentStatus === 'failed') return 'failed';
  if (paymentStatus === 'refunded') return 'refunded';
  return 'pending';
}

function calculateTimeDiffHours(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  const [startHour = 0, startMinute = 0] = String(startTime).split(':').map(Number);
  const [endHour = 0, endMinute = 0] = String(endTime).split(':').map(Number);
  if (![startHour, startMinute, endHour, endMinute].every(Number.isFinite)) return 0;

  const start = startHour + (startMinute / 60);
  let end = endHour + (endMinute / 60);
  if (end < start) end += 24;
  return roundCurrency(end - start);
}

function deriveBookingHours(booking, pricingSnapshot = null) {
  const bookingDays = Array.isArray(booking.booking_days) ? booking.booking_days : [];
  const daysTotal = bookingDays.reduce((sum, day) => {
    const explicitHours = Number(day.duration_hours || 0);
    return sum + (explicitHours > 0 ? explicitHours : calculateTimeDiffHours(day.start_time, day.end_time));
  }, 0);
  if (daysTotal > 0) return roundCurrency(daysTotal);

  const snapshotHours = Number(pricingSnapshot?.shoot_hours || pricingSnapshot?.shootHours || 0);
  if (snapshotHours > 0) return roundCurrency(snapshotHours);

  const bookingHours = Number(booking.duration_hours || 0);
  if (bookingHours > 0) return roundCurrency(bookingHours);

  return calculateTimeDiffHours(booking.start_time, booking.end_time);
}

function normalizeLineItems(lineItems = []) {
  return (Array.isArray(lineItems) ? lineItems : []).map((item) => {
    const plain = toPlainRecord(item) || {};
    const pricingItem = toPlainRecord(plain.pricing_item) || {};
    const category = toPlainRecord(pricingItem.category) || {};

    return {
      ...plain,
      item_name: plain.item_name || plain.name || pricingItem.name || null,
      quantity: Number(plain.quantity || 1),
      unit_price: roundCurrency(plain.unit_price ?? plain.unit_rate ?? pricingItem.rate ?? 0),
      line_total: roundCurrency(plain.line_total ?? plain.total ?? 0),
      rate_type: plain.rate_type || pricingItem.rate_type || null,
      duration_hours: plain.duration_hours !== null && plain.duration_hours !== undefined
        ? Number(plain.duration_hours)
        : null,
      crew_size: plain.crew_size !== null && plain.crew_size !== undefined
        ? Number(plain.crew_size)
        : null,
      section_type: plain.section_type || category.slug || null,
      category_slug: plain.category_slug || category.slug || null,
      pricing_item: pricingItem.item_id ? pricingItem : null
    };
  });
}

function isCreatorServiceLine(item = {}) {
  const name = String(item.item_name || '').toLowerCase();
  const section = String(item.section_type || item.category_slug || '').toLowerCase();

  if (section === 'editing' || name.includes('edit') || name.includes('reel') || name.includes('highlight')) return false;
  if (name.includes('equipment') || name.includes('rush') || name.includes('pre-production') || name.includes('studio')) return false;

  return (
    section === 'service' ||
    section === 'crew' ||
    section === 'photography' ||
    section === 'videography' ||
    name.includes('photographer') ||
    name.includes('videographer') ||
    name.includes('cinematographer')
  );
}

function applyDiscountToLineTotal(lineTotal, snapshot = {}) {
  const subtotal = Number(snapshot.subtotal || 0);
  const discountAmount = Number(snapshot.discount_amount || snapshot.discountAmount || 0);
  if (!(subtotal > 0) || !(discountAmount > 0)) return roundCurrency(lineTotal);
  return roundCurrency(lineTotal * Math.max((subtotal - discountAmount) / subtotal, 0));
}

function calculateCreatorServicePool(pricingSnapshot = {}) {
  const lineItems = normalizeLineItems(pricingSnapshot.line_items || pricingSnapshot.lineItems || []);
  return roundCurrency(lineItems.reduce((sum, item) => (
    isCreatorServiceLine(item) ? sum + applyDiscountToLineTotal(item.line_total, pricingSnapshot) : sum
  ), 0));
}

function findNestedValue(source, keys = []) {
  if (!source || typeof source !== 'object') return undefined;

  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }

  const nestedContainers = [
    source.pricing,
    source.pricing_breakdown,
    source.price_breakdown,
    source.breakdown,
    source.metadata,
    source.metadata_json ? parseFlexibleJson(source.metadata_json, null) : null
  ].filter(Boolean);

  for (const container of nestedContainers) {
    const value = findNestedValue(container, keys);
    if (value !== undefined && value !== null) return value;
  }

  return undefined;
}

function getCreatorRoleKeys(creator = {}) {
  const rawRoles = parseFlexibleJson(creator.primary_role, creator.primary_role || []);
  const roles = Array.isArray(rawRoles) ? rawRoles : [rawRoles];
  const keys = new Set();

  roles.forEach((role) => {
    const normalized = String(role || '').trim().toLowerCase();
    if (!normalized) return;
    keys.add(normalized);

    if (['1', '9', 'videographer', 'video'].includes(normalized)) {
      keys.add('videographer');
      keys.add('video');
    }
    if (['2', '10', 'photographer', 'photo'].includes(normalized)) {
      keys.add('photographer');
      keys.add('photo');
    }
    if (['3', '11', 'cinematographer', 'cinema'].includes(normalized)) {
      keys.add('cinematographer');
      keys.add('cinema');
    }
  });

  return keys;
}

function getLineItemRoleKey(item = {}) {
  const name = String(item.item_name || item.name || '').toLowerCase();
  if (name.includes('videographer') || name.includes('videography') || name.includes('video')) return 'videographer';
  if (name.includes('photographer') || name.includes('photography') || name.includes('photo')) return 'photographer';
  if (name.includes('cinematographer') || name.includes('cinematography')) return 'cinematographer';
  return null;
}

function getBreakdownAmount(entry = {}) {
  return roundCurrency(
    entry.amount ??
    entry.payout_amount ??
    entry.creator_payout_amount ??
    entry.net_earning_amount ??
    entry.net_amount ??
    entry.base_amount ??
    entry.price ??
    entry.total ??
    entry.line_total ??
    0
  );
}

function normalizeCreativeBreakdownEntries(rawBreakdown) {
  const parsed = parseFlexibleJson(rawBreakdown, rawBreakdown);
  if (!parsed) return [];

  if (Array.isArray(parsed)) {
    return parsed.map((entry) => {
      if (typeof entry === 'number') return { amount: entry };
      if (typeof entry === 'string') return { amount: Number(entry) || 0 };
      return entry || {};
    });
  }

  if (typeof parsed === 'object') {
    return Object.entries(parsed).map(([key, value]) => {
      if (typeof value === 'number' || typeof value === 'string') {
        return {
          creator_id: Number(key) || null,
          role: Number(key) ? null : key,
          amount: Number(value) || 0
        };
      }

      return {
        ...(value || {}),
        creator_id: value?.creator_id || value?.crew_member_id || (Number(key) || null),
        role: value?.role || value?.role_key || value?.service || (Number(key) ? null : key)
      };
    });
  }

  return [];
}

function extractCreativePricing(pricingSnapshot = {}) {
  const rawBreakdown = findNestedValue(pricingSnapshot, [
    'creative_price_breakdown',
    'creator_price_breakdown',
    'creative_breakdown',
    'creator_breakdown',
    'assigned_creator_pricing'
  ]);
  const configuredLineBreakdowns = normalizeLineItems(pricingSnapshot.line_items || pricingSnapshot.lineItems || [])
    .flatMap((item) => {
      const config = parseFlexibleJson(item.configuration_json || item.configuration, null);
      return normalizeCreativeBreakdownEntries(
        config?.creative_price_breakdown ||
        config?.creator_price_breakdown ||
        config?.creative_breakdown ||
        null
      );
    });

  const creativePriceBreakdown = [
    ...normalizeCreativeBreakdownEntries(rawBreakdown),
    ...configuredLineBreakdowns
  ].map((entry) => ({
    ...entry,
    creator_id: Number(entry.creator_id || entry.crew_member_id || 0) || null,
    role: entry.role || entry.role_key || entry.service || entry.item_name || null,
    amount: getBreakdownAmount(entry)
  })).filter((entry) => entry.amount > 0);

  const explicitBaseTotal = roundCurrency(findNestedValue(pricingSnapshot, [
    'creative_base_total',
    'creator_base_total',
    'creative_total',
    'creator_total',
    'base_creator_total'
  ]) || 0);
  const breakdownTotal = roundCurrency(creativePriceBreakdown.reduce((sum, entry) => sum + entry.amount, 0));

  return {
    creative_base_total: explicitBaseTotal || breakdownTotal || calculateCreatorServicePool(pricingSnapshot),
    creative_price_breakdown: creativePriceBreakdown,
    source: explicitBaseTotal || breakdownTotal ? 'creative_pricing_snapshot' : 'quote_service_line_items'
  };
}

function allocateCreatorPricingFromQuoteLines(creators, pricingSnapshot = {}) {
  const lineItems = normalizeLineItems(pricingSnapshot.line_items || pricingSnapshot.lineItems || [])
    .filter(isCreatorServiceLine);
  const assigned = new Set();
  const allocations = new Map();

  lineItems.forEach((item) => {
    const roleKey = getLineItemRoleKey(item);
    const lineAmount = applyDiscountToLineTotal(item.line_total, pricingSnapshot);
    if (!(lineAmount > 0)) return;

    const matches = creators.filter((creator) => {
      if (assigned.has(Number(creator.crew_member_id))) return false;
      if (!roleKey) return false;
      return getCreatorRoleKeys(creator).has(roleKey);
    });
    const targetCreators = matches.length > 0
      ? matches.slice(0, Math.max(1, Number(item.quantity || item.crew_size || matches.length || 1)))
      : creators.filter((creator) => !assigned.has(Number(creator.crew_member_id)));

    if (targetCreators.length === 0) return;

    const share = roundCurrency(lineAmount / targetCreators.length);
    targetCreators.forEach((creator) => {
      const creatorId = Number(creator.crew_member_id);
      allocations.set(creatorId, roundCurrency((allocations.get(creatorId) || 0) + share));
      assigned.add(creatorId);
    });
  });

  return allocations;
}

function buildSnapshotFromClassicQuote(quoteRecord) {
  const quote = toPlainRecord(quoteRecord);
  if (!quote) return null;

  return {
    source: 'primary_quote',
    quote_id: quote.quote_id || null,
    pricing_mode: quote.pricing_mode || null,
    shoot_hours: Number(quote.shoot_hours || 0),
    subtotal: roundCurrency(quote.subtotal || 0),
    discount_percent: roundCurrency(quote.discount_percent || 0),
    discount_amount: roundCurrency(quote.discount_amount || 0),
    tax_type: quote.tax_type || null,
    tax_rate: roundCurrency(quote.tax_rate || 0),
    tax_amount: roundCurrency(quote.tax_amount || 0),
    price_after_discount: roundCurrency(quote.price_after_discount || 0),
    margin_percent: roundCurrency(quote.margin_percent ?? DEFAULT_PLATFORM_FEE_PERCENT),
    margin_amount: roundCurrency(quote.margin_amount || 0),
    total: roundCurrency(quote.total || quote.price_after_discount || 0),
    line_items: normalizeLineItems(quote.line_items || [])
  };
}

function buildSnapshotFromSalesQuote(quoteRecord) {
  const quote = toPlainRecord(quoteRecord);
  if (!quote) return null;

  const latestVersion = Array.isArray(quote.versions) && quote.versions.length
    ? [...quote.versions].sort((a, b) => Number(b.version_number || 0) - Number(a.version_number || 0))[0]
    : null;
  const versionSnapshot = parseFlexibleJson(latestVersion?.quote_snapshot_json, null);
  if (versionSnapshot) {
    return {
      ...versionSnapshot,
      source: 'sales_quote_snapshot',
      sales_quote_id: quote.sales_quote_id || versionSnapshot.sales_quote_id || null,
      quote_id: null,
      subtotal: roundCurrency(versionSnapshot.subtotal || 0),
      discount_amount: roundCurrency(versionSnapshot.discount_amount || 0),
      tax_amount: roundCurrency(versionSnapshot.tax_amount || 0),
      total: roundCurrency(versionSnapshot.total || 0),
      line_items: normalizeLineItems(versionSnapshot.line_items || [])
    };
  }

  return {
    source: 'sales_quote',
    sales_quote_id: quote.sales_quote_id || null,
    quote_id: null,
    pricing_mode: quote.pricing_mode || null,
    subtotal: roundCurrency(quote.subtotal || 0),
    discount_amount: roundCurrency(quote.discount_amount || 0),
    tax_type: quote.tax_type || null,
    tax_rate: roundCurrency(quote.tax_rate || 0),
    tax_amount: roundCurrency(quote.tax_amount || 0),
    total: roundCurrency(quote.total || 0),
    line_items: normalizeLineItems(quote.line_items || [])
  };
}

async function buildPricingSnapshotFromBooking(booking) {
  const primaryQuoteSnapshot = buildSnapshotFromClassicQuote(booking.primary_quote);
  if (primaryQuoteSnapshot) return primaryQuoteSnapshot;

  const invoiceRows = Array.isArray(booking.invoice_send_history) ? booking.invoice_send_history : [];
  const salesQuote = invoiceRows.map((invoice) => toPlainRecord(invoice)?.quote).find(Boolean);
  const salesQuoteSnapshot = buildSnapshotFromSalesQuote(salesQuote);
  if (salesQuoteSnapshot) return salesQuoteSnapshot;

  const roleCounts = parseFlexibleJson(booking.crew_roles, {});
  const items = [];
  if (roleCounts && typeof roleCounts === 'object' && !Array.isArray(roleCounts)) {
    Object.entries(roleCounts).forEach(([role, count]) => {
      const itemId = ROLE_TO_ITEM_MAP[String(role).toLowerCase()] || ROLE_TO_ITEM_MAP[role];
      const quantity = Number(count || 0);
      if (itemId && quantity > 0) items.push({ item_id: itemId, quantity });
    });
  }

  if (items.length === 0) return null;

  const hours = deriveBookingHours(booking);
  const calculatedQuote = await pricingService.calculateQuote({
    items,
    shootHours: hours,
    eventType: booking.shoot_type || booking.event_type || null,
    shootStartDate: booking.event_date || null,
    videoEditTypes: parseFlexibleJson(booking.video_edit_types, []),
    photoEditTypes: parseFlexibleJson(booking.photo_edit_types, []),
  });

  return {
    source: 'pricing_service_booking_fallback',
    pricing_mode: calculatedQuote.pricingMode || null,
    shoot_hours: Number(calculatedQuote.shootHours || hours || 0),
    subtotal: roundCurrency(calculatedQuote.subtotal || 0),
    discount_percent: roundCurrency(calculatedQuote.discountPercent || 0),
    discount_amount: roundCurrency(calculatedQuote.discountAmount || 0),
    price_after_discount: roundCurrency(calculatedQuote.priceAfterDiscount || 0),
    margin_percent: roundCurrency(calculatedQuote.marginPercent ?? DEFAULT_PLATFORM_FEE_PERCENT),
    margin_amount: roundCurrency(calculatedQuote.marginAmount || 0),
    total: roundCurrency(calculatedQuote.total || 0),
    line_items: normalizeLineItems(calculatedQuote.lineItems || [])
  };
}

async function loadBookingFinanceContext(bookingId, transaction = null) {
  const booking = await db.stream_project_booking.findByPk(bookingId, {
    include: [
      {
        model: db.quotes,
        as: 'primary_quote',
        required: false,
        include: [{
          model: db.quote_line_items,
          as: 'line_items',
          required: false,
          include: [{
            model: db.pricing_items,
            as: 'pricing_item',
            required: false,
            include: [{ model: db.pricing_categories, as: 'category', required: false }]
          }]
        }]
      },
      {
        model: db.stream_project_booking_days,
        as: 'booking_days',
        required: false
      },
      {
        model: db.assigned_crew,
        as: 'assigned_crews',
        required: false,
        where: { is_active: 1 },
        include: [
          {
            model: db.crew_members,
            as: 'crew_member',
            required: false
          }
        ]
      },
      {
        model: db.invoice_send_history,
        as: 'invoice_send_history',
        required: false,
        include: [{
          model: db.sales_quotes,
          as: 'quote',
          required: false,
          include: [
            { model: db.sales_quote_line_items, as: 'line_items', required: false },
            { model: db.sales_quote_versions, as: 'versions', required: false }
          ]
        }]
      }
    ],
    transaction
  });

  if (!booking) {
    const error = new Error('Booking not found');
    error.statusCode = 404;
    throw error;
  }

  const payment = booking.payment_id
    ? await db.payment_transactions.findByPk(booking.payment_id, {
        include: [{ model: db.crew_members, as: 'creator', required: false }],
        transaction
      })
    : null;

  return { booking, payment };
}

function calculateCreatorRows({ booking, payment, pricingSnapshot = null, financeTransactionId = null }) {
  const assigned = Array.isArray(booking.assigned_crews) ? booking.assigned_crews : [];
  const creatorsById = new Map();

  assigned
    .map((assignment) => assignment.crew_member)
    .filter((creator) => creator && creator.crew_member_id)
    .forEach((creator) => creatorsById.set(Number(creator.crew_member_id), toPlainRecord(creator)));

  const paymentCreator = toPlainRecord(payment?.creator);
  if (creatorsById.size === 0 && paymentCreator?.crew_member_id) {
    creatorsById.set(Number(paymentCreator.crew_member_id), paymentCreator);
  }

  const creators = Array.from(creatorsById.values());
  if (creators.length === 0) return [];

  const creativePricing = extractCreativePricing(pricingSnapshot || {});
  const creatorServicePool = creativePricing.creative_base_total;
  const explicitBreakdown = creativePricing.creative_price_breakdown;
  const lineItemAllocations = explicitBreakdown.length > 0
    ? new Map()
    : allocateCreatorPricingFromQuoteLines(creators, pricingSnapshot || {});
  const equalShare = creators.length > 0 ? roundCurrency(creatorServicePool / creators.length) : 0;
  let remainingPool = creatorServicePool;

  const creatorAmounts = creators.map((creator) => {
    const creatorId = Number(creator.crew_member_id);
    const directBreakdown = explicitBreakdown.find((entry) => Number(entry.creator_id) === creatorId);
    const roleBreakdown = !directBreakdown
      ? explicitBreakdown.find((entry) => entry.role && getCreatorRoleKeys(creator).has(String(entry.role).toLowerCase()))
      : null;
    const allocatedAmount = directBreakdown?.amount || roleBreakdown?.amount || lineItemAllocations.get(creatorId) || 0;
    const amount = roundCurrency(allocatedAmount || equalShare);
    remainingPool = roundCurrency(remainingPool - amount);

    return { creator, amount };
  });

  if (creatorAmounts.length > 0 && Math.abs(remainingPool) >= 0.01) {
    const last = creatorAmounts[creatorAmounts.length - 1];
    last.amount = roundCurrency(last.amount + remainingPool);
  }

  return creatorAmounts.map(({ creator, amount }) => {
    const netEarning = roundCurrency(amount);

    return {
      booking_id: booking.stream_project_booking_id,
      creator_id: creator.crew_member_id,
      payment_id: payment?.payment_id || null,
      finance_transaction_id: financeTransactionId,
      currency: 'USD',
      gross_amount: netEarning,
      platform_fee_amount: 0,
      net_earning_amount: netEarning,
      status: payment ? 'earned' : 'pending',
      earned_at: payment ? (booking.payment_completed_at || new Date()) : null,
      metadata_json: stringifyMetadata({
        source: explicitBreakdown.length > 0 ? 'quote_creative_price_breakdown' : 'quote_service_line_items',
        pricing_source: pricingSnapshot?.source || null,
        creative_base_total: creatorServicePool,
        allocation_source: creativePricing.source
      })
    };
  });
}

function calculateBreakdown({ booking, payment, pricingSnapshot, creatorRows }) {
  const quote = pricingSnapshot || {};
  const totalFromQuote = roundCurrency(quote.total || quote.price_after_discount || 0);
  const totalFromPayment = roundCurrency(payment?.total_amount || 0);
  const totalAmount = totalFromQuote || totalFromPayment || roundCurrency(booking.budget || 0);

  const subtotal = roundCurrency(quote.subtotal || totalAmount);
  const discount = roundCurrency(quote.discount_amount || quote.discountAmount || 0);
  const tax = roundCurrency(quote.tax_amount || quote.taxAmount || 0);
  const equipment = roundCurrency(
    normalizeLineItems(quote.line_items || quote.lineItems || []).reduce((sum, item) => {
      const name = String(item.item_name || '').toLowerCase();
      return name.includes('equipment') ? sum + Number(item.line_total || 0) : sum;
    }, 0)
  );
  const creatorEarnings = roundCurrency(
    creatorRows.reduce((sum, item) => sum + Number(item.net_earning_amount || 0), 0)
  );
  const quoteMarginAmount = roundCurrency(quote.margin_amount || quote.marginAmount || 0);
  const platformFee = quoteMarginAmount > 0
    ? quoteMarginAmount
    : roundCurrency(Math.max((subtotal - discount) - creatorEarnings - equipment, 0));
  const platformFeePercent = quote.margin_percent !== undefined || quote.marginPercent !== undefined
    ? roundCurrency(quote.margin_percent ?? quote.marginPercent)
    : roundCurrency((subtotal - discount) > 0 ? (platformFee / (subtotal - discount)) * 100 : DEFAULT_PLATFORM_FEE_PERCENT);
  const collected = payment ? totalFromPayment : 0;
  const outstanding = roundCurrency(Math.max(totalAmount - collected, 0));

  return {
    booking_id: booking.stream_project_booking_id,
    quote_id: booking.quote_id || quote.quote_id || null,
    client_user_id: booking.user_id || null,
    guest_email: booking.guest_email || null,
    currency: 'USD',
    subtotal_amount: subtotal,
    discount_amount: discount,
    tax_amount: tax,
    equipment_amount: equipment,
    platform_fee_percent: platformFeePercent,
    platform_fee_amount: platformFee,
    creator_earnings_amount: creatorEarnings,
    total_amount: totalAmount,
    collected_amount: collected,
    outstanding_amount: outstanding,
    payment_status: payment ? normalizeStatus(payment.status, true) : (totalAmount > 0 ? 'unpaid' : 'pending'),
    metadata_json: stringifyMetadata({
      source: 'finance_phase_1_sync',
      pricing_source: quote.source || null,
      sales_quote_id: quote.sales_quote_id || null,
      payment_id: payment?.payment_id || null,
      invoice_count: Array.isArray(booking.invoice_send_history) ? booking.invoice_send_history.length : 0
    }),
    calculated_at: new Date(),
    updated_at: new Date()
  };
}

async function syncBookingFinance(bookingId, options = {}) {
  const externalTransaction = options.transaction || null;
  const transaction = externalTransaction || await db.sequelize.transaction();

  try {
    const { booking, payment } = await loadBookingFinanceContext(bookingId, transaction);
    const pricingSnapshot = await buildPricingSnapshotFromBooking(booking);
    const creatorRowsPreview = calculateCreatorRows({ booking, payment, pricingSnapshot });
    const breakdownPayload = calculateBreakdown({ booking, payment, pricingSnapshot, creatorRows: creatorRowsPreview });

    const transactionPayload = {
      transaction_code: buildTransactionCode(payment?.payment_id, booking.stream_project_booking_id),
      booking_id: booking.stream_project_booking_id,
      payment_id: payment?.payment_id || null,
      invoice_send_history_id: null,
      client_user_id: booking.user_id || null,
      guest_email: booking.guest_email || payment?.guest_email || null,
      transaction_type: 'client_payment',
      direction: 'inflow',
      source: payment?.stripe_payment_intent_id ? 'stripe' : 'system',
      payment_method: payment?.stripe_payment_intent_id ? 'stripe' : null,
      status: normalizeStatus(payment?.status, Boolean(payment)),
      currency: 'USD',
      gross_amount: breakdownPayload.collected_amount,
      platform_fee_amount: breakdownPayload.platform_fee_amount,
      creator_earnings_amount: breakdownPayload.creator_earnings_amount,
      gateway_fee_amount: 0,
      net_amount: roundCurrency(
        breakdownPayload.collected_amount - breakdownPayload.platform_fee_amount - breakdownPayload.creator_earnings_amount
      ),
      external_reference: payment?.stripe_payment_intent_id || payment?.stripe_charge_id || null,
      transaction_date: booking.payment_completed_at || payment?.created_at || new Date(),
      metadata_json: stringifyMetadata({
        payment_status: payment?.status || null,
        shoot_type: booking.shoot_type || booking.event_type || null,
        project_name: booking.project_name || null
      }),
      created_by_user_id: options.userId || null,
      updated_at: new Date()
    };

    const [financeTransaction] = await db.finance_transactions.findOrCreate({
      where: { transaction_code: transactionPayload.transaction_code },
      defaults: transactionPayload,
      transaction
    });
    if (!financeTransaction.isNewRecord) {
      await financeTransaction.update(transactionPayload, { transaction });
    }

    const creatorRows = calculateCreatorRows({
      booking,
      payment,
      pricingSnapshot,
      financeTransactionId: financeTransaction.finance_transaction_id
    });

    const recalculatedBreakdown = calculateBreakdown({ booking, payment, pricingSnapshot, creatorRows });
    const [breakdown] = await db.finance_project_breakdowns.findOrCreate({
      where: { booking_id: booking.stream_project_booking_id },
      defaults: recalculatedBreakdown,
      transaction
    });
    if (!breakdown.isNewRecord) {
      await breakdown.update(recalculatedBreakdown, { transaction });
    }

    await db.creator_earnings.destroy({
      where: { booking_id: booking.stream_project_booking_id },
      transaction
    });
    if (creatorRows.length > 0) {
      await db.creator_earnings.bulkCreate(creatorRows, { transaction });
    }

    const invoiceRows = Array.isArray(booking.invoice_send_history) ? booking.invoice_send_history : [];
    for (const invoice of invoiceRows) {
      const status = invoice.payment_status === 'paid' ? 'paid' : 'pending';
      const invoicePayload = {
        invoice_send_history_id: invoice.invoice_send_history_id,
        payment_id: payment?.payment_id || null,
        finance_transaction_id: financeTransaction.finance_transaction_id,
        booking_id: booking.stream_project_booking_id,
        amount: status === 'paid' ? recalculatedBreakdown.collected_amount : recalculatedBreakdown.outstanding_amount,
        status,
        paid_at: status === 'paid' ? (booking.payment_completed_at || new Date()) : null,
        metadata_json: stringifyMetadata({
          invoice_number: invoice.invoice_number || null,
          invoice_url: invoice.invoice_url || null
        }),
        updated_at: new Date()
      };

      const [invoicePayment] = await db.finance_invoice_payments.findOrCreate({
        where: {
          invoice_send_history_id: invoice.invoice_send_history_id,
          booking_id: booking.stream_project_booking_id
        },
        defaults: invoicePayload,
        transaction
      });
      if (!invoicePayment.isNewRecord) {
        await invoicePayment.update(invoicePayload, { transaction });
      }
    }

    if (!externalTransaction) await transaction.commit();

    return {
      finance_transaction: financeTransaction,
      breakdown,
      creator_earnings_count: creatorRows.length,
      invoice_payments_count: invoiceRows.length
    };
  } catch (error) {
    if (!externalTransaction && transaction && !transaction.finished) {
      await transaction.rollback();
    }
    throw error;
  }
}

async function listTransactions(filters = {}) {
  const Op = db.Sequelize.Op;
  const page = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;
  const where = {};

  if (filters.status) where.status = filters.status;
  if (filters.transaction_type) where.transaction_type = filters.transaction_type;
  if (filters.booking_id) where.booking_id = filters.booking_id;
  if (filters.payment_id) where.payment_id = filters.payment_id;
  if (filters.search) {
    const term = `%${String(filters.search).trim()}%`;
    where[Op.or] = [
      { transaction_code: { [Op.like]: term } },
      { guest_email: { [Op.like]: term } },
      { external_reference: { [Op.like]: term } }
    ];
  }
  if (filters.date_from || filters.date_to) {
    where.transaction_date = {};
    if (filters.date_from) where.transaction_date[Op.gte] = new Date(filters.date_from);
    if (filters.date_to) where.transaction_date[Op.lte] = new Date(filters.date_to);
  }

  const result = await db.finance_transactions.findAndCountAll({
    where,
    limit,
    offset,
    order: [['transaction_date', 'DESC'], ['finance_transaction_id', 'DESC']],
    include: [
      {
        model: db.stream_project_booking,
        as: 'booking',
        required: false,
        attributes: ['stream_project_booking_id', 'project_name', 'shoot_type', 'event_type', 'event_date']
      },
      {
        model: db.users,
        as: 'client',
        required: false,
        attributes: ['id', 'name', 'email']
      }
    ]
  });

  return {
    rows: result.rows.map((row) => {
      const plain = row.get({ plain: true });
      return {
        ...plain,
        metadata: parseJson(plain.metadata_json, null)
      };
    }),
    pagination: {
      page,
      limit,
      total: result.count,
      total_pages: Math.ceil(result.count / limit)
    }
  };
}

async function listShootBreakdowns(filters = {}) {
  const Op = db.Sequelize.Op;
  const page = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;
  const where = {};
  const bookingWhere = {};

  if (filters.payment_status) where.payment_status = filters.payment_status;
  if (filters.client_user_id) where.client_user_id = filters.client_user_id;
  if (filters.search) {
    const term = `%${String(filters.search).trim()}%`;
    bookingWhere[Op.or] = [
      { project_name: { [Op.like]: term } },
      { shoot_type: { [Op.like]: term } },
      { event_type: { [Op.like]: term } },
      { guest_email: { [Op.like]: term } }
    ];
  }

  const result = await db.finance_project_breakdowns.findAndCountAll({
    where,
    distinct: true,
    limit,
    offset,
    order: [['calculated_at', 'DESC'], ['finance_project_breakdown_id', 'DESC']],
    include: [
      {
        model: db.stream_project_booking,
        as: 'booking',
        required: Object.keys(bookingWhere).length > 0,
        where: bookingWhere,
        attributes: ['stream_project_booking_id', 'project_name', 'shoot_type', 'event_type', 'event_date', 'guest_email']
      },
      {
        model: db.users,
        as: 'client',
        required: false,
        attributes: ['id', 'name', 'email']
      },
      {
        model: db.creator_earnings,
        as: 'creator_earnings',
        required: false,
        attributes: ['creator_earning_id', 'creator_id', 'net_earning_amount', 'status']
      }
    ]
  });

  return {
    rows: result.rows.map((row) => {
      const plain = row.get({ plain: true });
      return {
        ...plain,
        metadata: parseJson(plain.metadata_json, null)
      };
    }),
    pagination: {
      page,
      limit,
      total: result.count,
      total_pages: Math.ceil(result.count / limit)
    }
  };
}

async function getShootFinance(bookingId) {
  let breakdown = await db.finance_project_breakdowns.findOne({
    where: { booking_id: bookingId },
    include: [
      {
        model: db.stream_project_booking,
        as: 'booking',
        required: false
      },
      {
        model: db.creator_earnings,
        as: 'creator_earnings',
        required: false,
        include: [
          {
            model: db.crew_members,
            as: 'creator',
            required: false
          }
        ]
      }
    ]
  });

  if (!breakdown) {
    await syncBookingFinance(bookingId);
    breakdown = await db.finance_project_breakdowns.findOne({
      where: { booking_id: bookingId },
      include: [
        { model: db.stream_project_booking, as: 'booking', required: false },
        {
          model: db.creator_earnings,
          as: 'creator_earnings',
          required: false,
          include: [{ model: db.crew_members, as: 'creator', required: false }]
        }
      ]
    });
  }

  if (!breakdown) return null;

  const plain = breakdown.get({ plain: true });
  return {
    ...plain,
    metadata: parseJson(plain.metadata_json, null)
  };
}

module.exports = {
  syncBookingFinance,
  listTransactions,
  listShootBreakdowns,
  getShootFinance
};
