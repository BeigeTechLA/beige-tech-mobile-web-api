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

function buildPayoutRequestCode(creatorId) {
  const date = new Date();
  const yyyy = date.getFullYear();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PO-${yyyy}-${String(creatorId).padStart(5, '0')}-${random}`;
}

function toMoney(value) {
  return roundCurrency(value);
}

function assertPositiveAmount(amount, message = 'Amount must be greater than zero') {
  const parsed = toMoney(amount);
  if (!(parsed > 0)) {
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  }
  return parsed;
}

async function ensureCreatorWallet(creatorId, options = {}) {
  const creator = await db.crew_members.findByPk(creatorId, { transaction: options.transaction || null });
  if (!creator) {
    const error = new Error('Creator not found');
    error.statusCode = 404;
    throw error;
  }

  const [wallet] = await db.creator_wallets.findOrCreate({
    where: { creator_id: creatorId },
    defaults: {
      creator_id: creatorId,
      currency: options.currency || 'USD',
      pending_balance: 0,
      available_balance: 0,
      reserved_balance: 0,
      lifetime_earnings: 0,
      lifetime_payouts: 0,
      last_reconciled_at: new Date()
    },
    transaction: options.transaction || null
  });

  return wallet;
}

async function postWalletTransaction({
  creatorId,
  transactionType,
  direction,
  amount,
  sourceType = null,
  sourceId = null,
  sourceReference = null,
  payoutRequestId = null,
  payoutAccountId = null,
  metadata = null,
  balanceChanges = {}
}, transaction = null) {
  const wallet = await ensureCreatorWallet(creatorId, { transaction });
  const pendingBefore = toMoney(wallet.pending_balance);
  const availableBefore = toMoney(wallet.available_balance);
  const reservedBefore = toMoney(wallet.reserved_balance);
  const lifetimeEarningsBefore = toMoney(wallet.lifetime_earnings);
  const lifetimePayoutsBefore = toMoney(wallet.lifetime_payouts);

  wallet.pending_balance = toMoney(pendingBefore + Number(balanceChanges.pending || 0));
  wallet.available_balance = toMoney(availableBefore + Number(balanceChanges.available || 0));
  wallet.reserved_balance = toMoney(reservedBefore + Number(balanceChanges.reserved || 0));
  wallet.lifetime_earnings = toMoney(lifetimeEarningsBefore + Number(balanceChanges.lifetimeEarnings || 0));
  wallet.lifetime_payouts = toMoney(lifetimePayoutsBefore + Number(balanceChanges.lifetimePayouts || 0));
  wallet.last_reconciled_at = new Date();
  wallet.updated_at = new Date();

  if (wallet.pending_balance < 0 || wallet.available_balance < 0 || wallet.reserved_balance < 0) {
    const error = new Error('Wallet balance cannot go negative');
    error.statusCode = 409;
    throw error;
  }

  await wallet.save({ transaction });

  const walletTransaction = await db.creator_payout_transactions.create({
    creator_id: creatorId,
    creator_payout_request_id: payoutRequestId,
    creator_payout_account_id: payoutAccountId,
    transaction_type: transactionType,
    direction,
    currency: wallet.currency || 'USD',
    amount,
    source_type: sourceType,
    source_id: sourceId,
    source_reference: sourceReference,
    balance_pending_after: wallet.pending_balance,
    balance_available_after: wallet.available_balance,
    balance_reserved_after: wallet.reserved_balance,
    status: 'posted',
    metadata_json: stringifyMetadata(metadata),
    updated_at: new Date()
  }, { transaction });

  return { wallet, walletTransaction };
}

async function syncCreatorEarningToWallet(earning, transaction = null) {
  const plain = toPlainRecord(earning);
  if (!plain || !plain.creator_id || plain.status === 'cancelled') return null;

  const amount = toMoney(plain.net_earning_amount);
  if (!(amount > 0)) return null;

  const sourceReference = `${plain.booking_id}:${plain.creator_id}`;
  const existing = await db.creator_payout_transactions.findOne({
    where: {
      source_type: 'creator_earning',
      source_reference: sourceReference,
      transaction_type: 'earning_pending',
      status: 'posted'
    },
    transaction
  });

  if (existing) {
    const released = await db.creator_payout_transactions.findOne({
      where: {
        source_type: 'creator_earning',
        source_reference: sourceReference,
        transaction_type: 'earning_released',
        status: 'posted'
      },
      transaction
    });

    if (released && plain.status === 'pending' && earning.update) {
      await earning.update({
        status: 'earned',
        earned_at: released.created_at || new Date(),
        updated_at: new Date()
      }, { transaction });
    }

    return null;
  }

  await postWalletTransaction({
    creatorId: plain.creator_id,
    transactionType: 'earning_pending',
    direction: 'credit',
    amount,
    sourceType: 'creator_earning',
    sourceId: plain.creator_earning_id,
    sourceReference,
    metadata: {
      booking_id: plain.booking_id,
      payment_id: plain.payment_id || null,
      finance_transaction_id: plain.finance_transaction_id || null
    },
    balanceChanges: {
      pending: amount,
      lifetimeEarnings: amount
    }
  }, transaction);

  return true;
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
      status: 'pending',
      earned_at: null,
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
      const storedCreatorRows = await db.creator_earnings.findAll({
        where: { booking_id: booking.stream_project_booking_id },
        transaction
      });
      for (const earning of storedCreatorRows) {
        await syncCreatorEarningToWallet(earning, transaction);
      }
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

async function getCreatorWallet(creatorId) {
  const wallet = await ensureCreatorWallet(creatorId);
  const pendingPayoutTotal = await db.creator_payout_requests.sum('amount', {
    where: {
      creator_id: creatorId,
      status: { [db.Sequelize.Op.in]: ['requested', 'approved', 'processing'] }
    }
  });

  const recentPayouts = await db.creator_payout_requests.findAll({
    where: { creator_id: creatorId },
    limit: 10,
    order: [['requested_at', 'DESC'], ['creator_payout_request_id', 'DESC']],
    include: [{ model: db.creator_payout_accounts, as: 'payout_account', required: false }]
  });

  const pendingEarnings = await db.creator_earnings.findAll({
    where: { creator_id: creatorId, status: { [db.Sequelize.Op.in]: ['pending', 'earned', 'held'] } },
    limit: 20,
    order: [['created_at', 'DESC'], ['creator_earning_id', 'DESC']],
    include: [{ model: db.stream_project_booking, as: 'booking', required: false }]
  });

  const plainWallet = wallet.get({ plain: true });
  return {
    ...plainWallet,
    pending_payout_balance: toMoney(pendingPayoutTotal || 0),
    metadata: parseJson(plainWallet.metadata_json, null),
    recent_payouts: recentPayouts.map((row) => {
      const plain = row.get({ plain: true });
      return { ...plain, metadata: parseJson(plain.metadata_json, null) };
    }),
    earnings: pendingEarnings.map((row) => {
      const plain = row.get({ plain: true });
      return { ...plain, metadata: parseJson(plain.metadata_json, null) };
    })
  };
}

async function listCreatorPayouts(filters = {}) {
  const Op = db.Sequelize.Op;
  const page = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;
  const where = {};

  if (filters.creator_id) where.creator_id = filters.creator_id;
  if (filters.status) where.status = filters.status;
  if (filters.payout_method) where.payout_method = filters.payout_method;
  if (filters.date_from || filters.date_to) {
    where.requested_at = {};
    if (filters.date_from) where.requested_at[Op.gte] = new Date(filters.date_from);
    if (filters.date_to) where.requested_at[Op.lte] = new Date(filters.date_to);
  }

  const result = await db.creator_payout_requests.findAndCountAll({
    where,
    distinct: true,
    limit,
    offset,
    order: [['requested_at', 'DESC'], ['creator_payout_request_id', 'DESC']],
    include: [
      {
        model: db.crew_members,
        as: 'creator',
        required: false,
        attributes: ['crew_member_id', 'first_name', 'last_name', 'email']
      },
      {
        model: db.creator_payout_accounts,
        as: 'payout_account',
        required: false
      }
    ]
  });

  return {
    rows: result.rows.map((row) => {
      const plain = row.get({ plain: true });
      return { ...plain, metadata: parseJson(plain.metadata_json, null) };
    }),
    pagination: {
      page,
      limit,
      total: result.count,
      total_pages: Math.ceil(result.count / limit)
    }
  };
}

async function upsertCreatorPayoutAccount(payload = {}, options = {}) {
  const creatorId = Number(payload.creator_id);
  if (!creatorId) {
    const error = new Error('creator_id is required');
    error.statusCode = 400;
    throw error;
  }

  const transaction = options.transaction || await db.sequelize.transaction();
  const externalTransaction = Boolean(options.transaction);

  try {
    await ensureCreatorWallet(creatorId, { transaction });

    if (payload.is_default) {
      await db.creator_payout_accounts.update(
        { is_default: 0, updated_at: new Date() },
        { where: { creator_id: creatorId }, transaction }
      );
    }

    const accountPayload = {
      creator_id: creatorId,
      payout_method: payload.payout_method || 'manual',
      account_label: payload.account_label || null,
      stripe_account_id: payload.stripe_account_id || null,
      account_holder_name: payload.account_holder_name || null,
      bank_name: payload.bank_name || null,
      account_last4: payload.account_last4 || null,
      currency: payload.currency || 'USD',
      is_default: payload.is_default === undefined ? 1 : Boolean(payload.is_default),
      status: payload.status || 'pending',
      metadata_json: stringifyMetadata(payload.metadata || null),
      updated_at: new Date()
    };

    const account = payload.creator_payout_account_id
      ? await db.creator_payout_accounts.findOne({
          where: {
            creator_payout_account_id: payload.creator_payout_account_id,
            creator_id: creatorId
          },
          transaction
        })
      : null;

    let savedAccount;
    if (account) {
      savedAccount = await account.update(accountPayload, { transaction });
    } else {
      savedAccount = await db.creator_payout_accounts.create(accountPayload, { transaction });
    }

    if (!externalTransaction) await transaction.commit();
    return savedAccount;
  } catch (error) {
    if (!externalTransaction && transaction && !transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function releaseCreatorEarnings(payload = {}, options = {}) {
  const Op = db.Sequelize.Op;
  const transaction = options.transaction || await db.sequelize.transaction();
  const externalTransaction = Boolean(options.transaction);

  try {
    if (!payload.creator_earning_ids && !payload.creator_id && !payload.booking_id) {
      const error = new Error('creator_earning_ids, creator_id, or booking_id is required');
      error.statusCode = 400;
      throw error;
    }

    const where = { status: 'pending' };
    if (payload.creator_earning_ids) where.creator_earning_id = { [Op.in]: payload.creator_earning_ids };
    if (payload.creator_id) where.creator_id = payload.creator_id;
    if (payload.booking_id) where.booking_id = payload.booking_id;

    const earnings = await db.creator_earnings.findAll({ where, transaction });
    if (earnings.length === 0) {
      const error = new Error('No pending creator earnings found for release');
      error.statusCode = 404;
      throw error;
    }

    let releasedAmount = 0;
    for (const earning of earnings) {
      const amount = toMoney(earning.net_earning_amount);
      await earning.update({
        status: 'earned',
        earned_at: new Date(),
        updated_at: new Date()
      }, { transaction });

      await postWalletTransaction({
        creatorId: earning.creator_id,
        transactionType: 'earning_released',
        direction: 'internal',
        amount,
        sourceType: 'creator_earning',
        sourceId: earning.creator_earning_id,
        sourceReference: `${earning.booking_id}:${earning.creator_id}`,
        metadata: {
          booking_id: earning.booking_id,
          released_by_user_id: options.userId || null
        },
        balanceChanges: {
          pending: -amount,
          available: amount
        }
      }, transaction);
      releasedAmount = toMoney(releasedAmount + amount);
    }

    if (!externalTransaction) await transaction.commit();
    return { released_count: earnings.length, released_amount: releasedAmount };
  } catch (error) {
    if (!externalTransaction && transaction && !transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function requestCreatorPayout(payload = {}, options = {}) {
  const creatorId = Number(payload.creator_id);
  const amount = assertPositiveAmount(payload.amount);
  if (!creatorId) {
    const error = new Error('creator_id is required');
    error.statusCode = 400;
    throw error;
  }

  const transaction = options.transaction || await db.sequelize.transaction();
  const externalTransaction = Boolean(options.transaction);

  try {
    const wallet = await ensureCreatorWallet(creatorId, { transaction });
    if (toMoney(wallet.available_balance) < amount) {
      const error = new Error('Insufficient available balance for payout request');
      error.statusCode = 409;
      throw error;
    }

    let payoutAccount = null;
    if (payload.creator_payout_account_id) {
      payoutAccount = await db.creator_payout_accounts.findOne({
        where: {
          creator_payout_account_id: payload.creator_payout_account_id,
          creator_id: creatorId
        },
        transaction
      });
    } else {
      payoutAccount = await db.creator_payout_accounts.findOne({
        where: { creator_id: creatorId, is_default: 1 },
        transaction
      });
    }

    const payoutMethod = payload.payout_method || payoutAccount?.payout_method || 'manual';
    const payoutRequest = await db.creator_payout_requests.create({
      request_code: buildPayoutRequestCode(creatorId),
      creator_id: creatorId,
      creator_payout_account_id: payoutAccount?.creator_payout_account_id || null,
      currency: payload.currency || wallet.currency || 'USD',
      amount,
      payout_method: payoutMethod,
      status: 'requested',
      requested_at: new Date(),
      metadata_json: stringifyMetadata(payload.metadata || null),
      updated_at: new Date()
    }, { transaction });

    await postWalletTransaction({
      creatorId,
      transactionType: 'payout_requested',
      direction: 'debit',
      amount,
      payoutRequestId: payoutRequest.creator_payout_request_id,
      payoutAccountId: payoutAccount?.creator_payout_account_id || null,
      sourceType: 'creator_payout_request',
      sourceId: payoutRequest.creator_payout_request_id,
      sourceReference: payoutRequest.request_code,
      metadata: { payout_method: payoutMethod },
      balanceChanges: { available: -amount }
    }, transaction);

    if (!externalTransaction) await transaction.commit();
    return payoutRequest;
  } catch (error) {
    if (!externalTransaction && transaction && !transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function approveCreatorPayout(payoutRequestId, payload = {}, options = {}) {
  const payoutRequest = await db.creator_payout_requests.findByPk(payoutRequestId);
  if (!payoutRequest) {
    const error = new Error('Payout request not found');
    error.statusCode = 404;
    throw error;
  }
  if (payoutRequest.status !== 'requested') {
    const error = new Error('Only requested payouts can be approved');
    error.statusCode = 409;
    throw error;
  }

  await payoutRequest.update({
    status: payload.status === 'processing' ? 'processing' : 'approved',
    approved_by_user_id: options.userId || null,
    approved_at: new Date(),
    metadata_json: stringifyMetadata({
      ...parseJson(payoutRequest.metadata_json, {}),
      approval_note: payload.note || null
    }),
    updated_at: new Date()
  });

  return payoutRequest;
}

async function returnPayoutBalance(payoutRequest, transaction, metadata = {}) {
  await postWalletTransaction({
    creatorId: payoutRequest.creator_id,
    transactionType: 'payout_returned',
    direction: 'credit',
    amount: toMoney(payoutRequest.amount),
    payoutRequestId: payoutRequest.creator_payout_request_id,
    payoutAccountId: payoutRequest.creator_payout_account_id,
    sourceType: 'creator_payout_request',
    sourceId: payoutRequest.creator_payout_request_id,
    sourceReference: payoutRequest.request_code,
    metadata,
    balanceChanges: { available: toMoney(payoutRequest.amount) }
  }, transaction);
}

async function rejectCreatorPayout(payoutRequestId, payload = {}, options = {}) {
  const transaction = options.transaction || await db.sequelize.transaction();
  const externalTransaction = Boolean(options.transaction);

  try {
    const payoutRequest = await db.creator_payout_requests.findByPk(payoutRequestId, { transaction });
    if (!payoutRequest) {
      const error = new Error('Payout request not found');
      error.statusCode = 404;
      throw error;
    }
    if (!['requested', 'approved', 'processing'].includes(payoutRequest.status)) {
      const error = new Error('Payout request cannot be rejected from its current status');
      error.statusCode = 409;
      throw error;
    }

    await returnPayoutBalance(payoutRequest, transaction, {
      reason: payload.rejection_reason || null,
      rejected_by_user_id: options.userId || null
    });

    await payoutRequest.update({
      status: 'rejected',
      rejection_reason: payload.rejection_reason || null,
      processed_by_user_id: options.userId || null,
      processed_at: new Date(),
      updated_at: new Date()
    }, { transaction });

    if (!externalTransaction) await transaction.commit();
    return payoutRequest;
  } catch (error) {
    if (!externalTransaction && transaction && !transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function markCreatorPayoutPaid(payoutRequestId, payload = {}, options = {}) {
  const transaction = options.transaction || await db.sequelize.transaction();
  const externalTransaction = Boolean(options.transaction);

  try {
    const payoutRequest = await db.creator_payout_requests.findByPk(payoutRequestId, { transaction });
    if (!payoutRequest) {
      const error = new Error('Payout request not found');
      error.statusCode = 404;
      throw error;
    }
    if (!['approved', 'processing'].includes(payoutRequest.status)) {
      const error = new Error('Only approved or processing payouts can be marked paid');
      error.statusCode = 409;
      throw error;
    }

    const amount = toMoney(payoutRequest.amount);
    await postWalletTransaction({
      creatorId: payoutRequest.creator_id,
      transactionType: 'payout_paid',
      direction: 'debit',
      amount,
      payoutRequestId: payoutRequest.creator_payout_request_id,
      payoutAccountId: payoutRequest.creator_payout_account_id,
      sourceType: 'creator_payout_request',
      sourceId: payoutRequest.creator_payout_request_id,
      sourceReference: payoutRequest.request_code,
      metadata: {
        external_reference: payload.external_reference || null,
        payout_method: payoutRequest.payout_method
      },
      balanceChanges: { lifetimePayouts: amount }
    }, transaction);

    const financeTransaction = await db.finance_transactions.create({
      transaction_code: `CPO-${payoutRequest.request_code}`,
      transaction_type: 'creator_earning',
      direction: 'outflow',
      source: payoutRequest.payout_method === 'stripe' ? 'stripe' : 'manual',
      payment_method: payoutRequest.payout_method,
      status: 'paid',
      currency: payoutRequest.currency || 'USD',
      gross_amount: amount,
      platform_fee_amount: 0,
      creator_earnings_amount: amount,
      gateway_fee_amount: 0,
      net_amount: amount,
      external_reference: payload.external_reference || payoutRequest.external_reference || null,
      transaction_date: payload.paid_at ? new Date(payload.paid_at) : new Date(),
      metadata_json: stringifyMetadata({
        creator_id: payoutRequest.creator_id,
        payout_request_id: payoutRequest.creator_payout_request_id,
        request_code: payoutRequest.request_code
      }),
      created_by_user_id: options.userId || null,
      updated_at: new Date()
    }, { transaction });

    await payoutRequest.update({
      status: 'paid',
      external_reference: payload.external_reference || payoutRequest.external_reference || null,
      processed_by_user_id: options.userId || null,
      processed_at: new Date(),
      paid_at: payload.paid_at ? new Date(payload.paid_at) : new Date(),
      metadata_json: stringifyMetadata({
        ...parseJson(payoutRequest.metadata_json, {}),
        finance_transaction_id: financeTransaction.finance_transaction_id
      }),
      updated_at: new Date()
    }, { transaction });

    if (!externalTransaction) await transaction.commit();
    return payoutRequest;
  } catch (error) {
    if (!externalTransaction && transaction && !transaction.finished) await transaction.rollback();
    throw error;
  }
}

module.exports = {
  syncBookingFinance,
  listTransactions,
  listShootBreakdowns,
  getShootFinance,
  getCreatorWallet,
  listCreatorPayouts,
  upsertCreatorPayoutAccount,
  releaseCreatorEarnings,
  requestCreatorPayout,
  approveCreatorPayout,
  rejectCreatorPayout,
  markCreatorPayoutPaid
};
