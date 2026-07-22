const db = require('../models');
const pricingService = require('./pricing.service');

const DEFAULT_PLATFORM_FEE_PERCENT = Number(process.env.BEIGE_MARGIN_PERCENT || 25);
const AUTO_CREATE_CREATOR_EARNINGS_ON_BOOK_A_SHOOT = false;
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

function buildInternalInvoicePdfUrl(bookingId) {
  const baseUrl = String(
    process.env.API_BASE_URL ||
    ''
  ).trim().replace(/\/+$/, '');
  const invoicePath = `/sales/invoice-pdf/${bookingId}?manual=1`;
  return baseUrl ? `${baseUrl}${invoicePath}` : `/v1${invoicePath}`;
}

function buildInternalInvoiceNumber(bookingId) {
  return `INVBEIGE-M-${String(bookingId).padStart(4, '0')}`;
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
    attributes: [
      'stream_project_booking_id',
      'user_id',
      'quote_id',
      'guest_email',
      'project_name',
      'description',
      'event_type',
      'shoot_type',
      'content_type',
      'event_date',
      'duration_hours',
      'start_time',
      'end_time',
      'budget',
      'crew_size_needed',
      'event_location',
      'streaming_platforms',
      'crew_roles',
      'skills_needed',
      'equipments_needed',
      'reference_links',
      'edits_needed',
      'video_edit_types',
      'photo_edit_types',
      'special_instructions',
      'is_draft',
      'is_completed',
      'is_cancelled',
      'is_active',
      'payment_id',
      'payment_completed_at',
      'status'
    ],
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

async function ensurePaidBookingInvoiceHistory(booking, payment, transaction = null) {
  if (!db.invoice_send_history || !booking || !payment) return null;

  const bookingId = Number(booking.stream_project_booking_id);
  if (!bookingId) return null;

  const existingPaidInvoice = await db.invoice_send_history.findOne({
    where: { booking_id: bookingId, payment_status: 'paid' },
    order: [['sent_at', 'DESC'], ['invoice_send_history_id', 'DESC']],
    transaction
  });
  if (existingPaidInvoice) return existingPaidInvoice;

  const existingInvoice = await db.invoice_send_history.findOne({
    where: { booking_id: bookingId },
    order: [['sent_at', 'DESC'], ['invoice_send_history_id', 'DESC']],
    transaction
  });

  if (existingInvoice) {
    await existingInvoice.update({
      payment_status: 'paid',
      invoice_number: existingInvoice.invoice_number || buildInternalInvoiceNumber(bookingId),
      invoice_pdf: existingInvoice.invoice_pdf || buildInternalInvoicePdfUrl(bookingId),
      sent_at: existingInvoice.sent_at || new Date()
    }, { transaction });
    return existingInvoice;
  }

  const [salesLead, clientLead] = await Promise.all([
    db.sales_leads.findOne({ where: { booking_id: bookingId }, transaction }),
    db.client_leads.findOne({ where: { booking_id: bookingId }, transaction })
  ]);

  const clientName =
    salesLead?.client_name ||
    clientLead?.client_name ||
    deriveNameFromEmail(booking.guest_email || payment.guest_email) ||
    null;
  const clientEmail =
    booking.guest_email ||
    payment.guest_email ||
    salesLead?.guest_email ||
    clientLead?.guest_email ||
    null;

  return db.invoice_send_history.create({
    booking_id: bookingId,
    quote_id: null,
    lead_id: salesLead?.lead_id || null,
    client_lead_id: clientLead?.lead_id || null,
    assigned_sales_rep_id: salesLead?.assigned_sales_rep_id || clientLead?.assigned_sales_rep_id || null,
    client_name: clientName,
    client_email: clientEmail,
    invoice_number: buildInternalInvoiceNumber(bookingId),
    invoice_url: null,
    invoice_pdf: buildInternalInvoicePdfUrl(bookingId),
    payment_status: 'paid',
    sent_by_user_id: null,
    sent_at: booking.payment_completed_at || payment.created_at || new Date()
  }, { transaction });
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
    const ensuredInvoice = await ensurePaidBookingInvoiceHistory(booking, payment, transaction);
    if (ensuredInvoice) {
      const invoiceRows = Array.isArray(booking.invoice_send_history) ? booking.invoice_send_history : [];
      const ensuredInvoiceId = Number(ensuredInvoice.invoice_send_history_id);
      booking.invoice_send_history = [
        ensuredInvoice,
        ...invoiceRows.filter((invoice) => Number(invoice.invoice_send_history_id) !== ensuredInvoiceId)
      ];
    }
    const pricingSnapshot = await buildPricingSnapshotFromBooking(booking);
    const creatorRowsPreview = calculateCreatorRows({ booking, payment, pricingSnapshot });
    const breakdownPayload = calculateBreakdown({ booking, payment, pricingSnapshot, creatorRows: creatorRowsPreview });
    const latestInvoice = Array.isArray(booking.invoice_send_history) && booking.invoice_send_history.length
      ? booking.invoice_send_history[0]
      : null;

    const transactionPayload = {
      transaction_code: buildTransactionCode(payment?.payment_id, booking.stream_project_booking_id),
      booking_id: booking.stream_project_booking_id,
      payment_id: payment?.payment_id || null,
      invoice_send_history_id: latestInvoice?.invoice_send_history_id || null,
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

    if (AUTO_CREATE_CREATOR_EARNINGS_ON_BOOK_A_SHOOT) {
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
      creator_earnings_count: AUTO_CREATE_CREATOR_EARNINGS_ON_BOOK_A_SHOOT ? creatorRows.length : 0,
      invoice_payments_count: invoiceRows.length
    };
  } catch (error) {
    if (!externalTransaction && transaction && !transaction.finished) {
      await transaction.rollback();
    }
    throw error;
  }
}

function formatDateOnly(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
}

function normalizeDisplayStatus(status, hasPayment = false) {
  if (status === 'failed') return 'failed';
  if (status === 'refunded') return 'refunded';
  if (status === 'cancelled' || status === 'void') return status;
  if (status === 'succeeded' || status === 'paid' || hasPayment) return 'paid';
  return 'pending';
}

function formatPaymentMethod(method, source, externalReference) {
  const raw = String(method || source || '').trim().toLowerCase();
  if (raw === 'stripe' || String(externalReference || '').startsWith('pi_')) return 'Stripe';
  if (raw === 'card') return 'Credit Card';
  if (raw === 'bank_transfer') return 'Bank Transfer';
  if (raw === 'account_credit') return 'Account Credit';
  if (raw === 'manual') return 'Manual';
  if (!raw) return null;
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatShootType(booking = {}, metadata = {}) {
  const contentType = String(booking.content_type || booking.event_type || '').trim();
  const shootType = String(booking.shoot_type || metadata.shoot_type || '').trim();
  const normalizedContent = contentType
    ? contentType.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
    : '';
  const normalizedShoot = shootType
    ? shootType.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
    : '';

  if (normalizedShoot && normalizedContent && normalizedShoot.toLowerCase() !== normalizedContent.toLowerCase()) {
    return `${normalizedShoot} ${normalizedContent}`;
  }
  return normalizedShoot || normalizedContent || booking.project_name || null;
}

function deriveNameFromEmail(email) {
  const localPart = String(email || '').includes('@') ? String(email).split('@')[0] : '';
  return localPart
    .replace(/[._-]+/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || null;
}

async function getLeadInfoByBookingIds(bookingIds = []) {
  const ids = [...new Set(bookingIds.map(Number).filter(Boolean))];
  if (ids.length === 0) return new Map();

  const where = { booking_id: { [db.Sequelize.Op.in]: ids } };
  const [salesLeads, clientLeads] = await Promise.all([
    db.sales_leads.findAll({
      where,
      attributes: ['booking_id', 'client_name', 'guest_email', 'phone'],
      raw: true
    }),
    db.client_leads.findAll({
      where,
      attributes: ['booking_id', 'client_name', 'guest_email', 'phone'],
      raw: true
    })
  ]);

  const map = new Map();
  [...clientLeads, ...salesLeads].forEach((lead) => {
    if (!lead?.booking_id) return;
    const existing = map.get(Number(lead.booking_id)) || {};
    map.set(Number(lead.booking_id), {
      ...existing,
      client_name: lead.client_name || existing.client_name || null,
      guest_email: lead.guest_email || existing.guest_email || null,
      phone: lead.phone || existing.phone || null
    });
  });

  return map;
}

async function getInvoiceCountsByBookingIds(bookingIds = []) {
  const ids = [...new Set(bookingIds.map(Number).filter(Boolean))];
  if (ids.length === 0 || !db.invoice_send_history) return new Map();

  const rows = await db.invoice_send_history.findAll({
    where: { booking_id: { [db.Sequelize.Op.in]: ids } },
    attributes: [
      'booking_id',
      [db.sequelize.fn('COUNT', db.sequelize.col('invoice_send_history_id')), 'invoice_count']
    ],
    group: ['booking_id'],
    raw: true
  });

  return new Map(rows.map((row) => [Number(row.booking_id), Number(row.invoice_count || 0)]));
}

async function getLatestInvoicesByBookingIds(bookingIds = []) {
  const ids = [...new Set(bookingIds.map(Number).filter(Boolean))];
  if (ids.length === 0 || !db.invoice_send_history) return new Map();

  const rows = await db.invoice_send_history.findAll({
    where: { booking_id: { [db.Sequelize.Op.in]: ids } },
    order: [['booking_id', 'ASC'], ['sent_at', 'DESC'], ['invoice_send_history_id', 'DESC']],
    raw: true
  });

  const map = new Map();
  rows.forEach((invoice) => {
    const bookingId = Number(invoice.booking_id);
    if (!map.has(bookingId)) map.set(bookingId, invoice);
  });
  return map;
}

async function getSearchMatchedBookingIds(search) {
  const term = String(search || '').trim();
  if (!term) return [];

  const Op = db.Sequelize.Op;
  const like = `%${term}%`;
  const directId = Number(term.replace(/^#/, ''));
  const ids = new Set(Number.isFinite(directId) && directId > 0 ? [directId] : []);

  const [salesMatches, clientMatches, userMatches] = await Promise.all([
    db.sales_leads.findAll({
      where: {
        [Op.or]: [
          { client_name: { [Op.like]: like } },
          { guest_email: { [Op.like]: like } },
          { phone: { [Op.like]: like } }
        ]
      },
      attributes: ['booking_id'],
      raw: true
    }),
    db.client_leads.findAll({
      where: {
        [Op.or]: [
          { client_name: { [Op.like]: like } },
          { guest_email: { [Op.like]: like } },
          { phone: { [Op.like]: like } }
        ]
      },
      attributes: ['booking_id'],
      raw: true
    }),
    db.stream_project_booking.findAll({
      where: {
        [Op.or]: [
          { project_name: { [Op.like]: like } },
          { shoot_type: { [Op.like]: like } },
          { event_type: { [Op.like]: like } },
          { content_type: { [Op.like]: like } },
          { guest_email: { [Op.like]: like } }
        ]
      },
      attributes: ['stream_project_booking_id'],
      raw: true
    })
  ]);

  salesMatches.forEach((row) => row.booking_id && ids.add(Number(row.booking_id)));
  clientMatches.forEach((row) => row.booking_id && ids.add(Number(row.booking_id)));
  userMatches.forEach((row) => row.stream_project_booking_id && ids.add(Number(row.stream_project_booking_id)));

  return [...ids];
}

async function syncRecentPaidBookingsMissingFinance(limit = 50) {
  const Op = db.Sequelize.Op;
  const paidBookings = await db.stream_project_booking.findAll({
    where: {
      payment_id: { [Op.ne]: null },
      is_draft: 0
    },
    attributes: ['stream_project_booking_id'],
    include: [{
      model: db.finance_transactions,
      as: 'finance_transactions',
      required: false,
      attributes: ['finance_transaction_id']
    }],
    order: [['stream_project_booking_id', 'DESC']],
    limit
  });

  const missingBookingIds = paidBookings
    .filter((booking) => !Array.isArray(booking.finance_transactions) || booking.finance_transactions.length === 0)
    .map((booking) => Number(booking.stream_project_booking_id))
    .filter(Boolean);

  for (const bookingId of missingBookingIds) {
    try {
      await syncBookingFinance(bookingId);
    } catch (error) {
      console.error(`Finance backfill skipped for booking ${bookingId}:`, error.message);
    }
  }
}

function buildFinanceTransactionListRow(plain, leadInfo = {}, invoiceCount = 0, latestInvoice = null) {
  const metadata = parseJson(plain.metadata_json, null) || {};
  const booking = plain.booking || {};
  const payment = plain.payment || {};
  const client = plain.client || {};
  const bookingId = plain.booking_id || booking.stream_project_booking_id || null;
  const clientName =
    client.name ||
    leadInfo.client_name ||
    metadata.client_name ||
    deriveNameFromEmail(plain.guest_email || leadInfo.guest_email || client.email) ||
    'Guest Client';
  const clientEmail = client.email || plain.guest_email || leadInfo.guest_email || payment.guest_email || null;
  const status = normalizeDisplayStatus(plain.status, Boolean(plain.payment_id || payment.payment_id));

  return {
    finance_transaction_id: plain.finance_transaction_id,
    transaction_id: plain.transaction_code,
    transaction_code: plain.transaction_code,
    booking_id: bookingId,
    shoot_id: bookingId,
    payment_id: plain.payment_id || payment.payment_id || null,
    quote_id: booking.quote_id || metadata.quote_id || null,
    client_name: clientName,
    client_email: clientEmail,
    client_phone: leadInfo.phone || metadata.phone || null,
    shoot_type: formatShootType(booking, metadata),
    project_name: booking.project_name || metadata.project_name || null,
    event_date: formatDateOnly(booking.event_date || payment.shoot_date || null),
    transaction_date: plain.transaction_date,
    total_amount: toMoney(plain.gross_amount || payment.total_amount || 0),
    currency: plain.currency || 'USD',
    payment_method: formatPaymentMethod(plain.payment_method, plain.source, plain.external_reference),
    status,
    transaction_type: plain.transaction_type,
    source: plain.source,
    external_reference: plain.external_reference || payment.stripe_payment_intent_id || null,
    invoices_count: invoiceCount,
    latest_invoice: latestInvoice ? formatClientInvoice(latestInvoice) : null,
    metadata
  };
}

function getFinanceFrontendBaseUrl() {
  return String(process.env.FRONTEND_URL || 'http://localhost:3000').trim().replace(/\/+$/, '');
}

function buildFinanceReceiptUrl({ bookingId, manualPaymentId = null, paymentId = null, download = false }) {
  const url = new URL(`${getFinanceFrontendBaseUrl()}/beige_invoice/${encodeURIComponent(String(bookingId))}`);
  url.searchParams.set('receipt', '1');
  if (manualPaymentId) url.searchParams.set('manual_payment_id', String(manualPaymentId));
  if (paymentId) url.searchParams.set('payment_id', String(paymentId));
  if (download) url.searchParams.set('download', '1');
  return url.toString();
}

function formatManualPaymentMethod(payment = {}) {
  const normalizedMode = String(payment.payment_mode || '').trim().toLowerCase();
  if (normalizedMode === 'other' && String(payment.other_payment_mode || '').trim()) {
    return String(payment.other_payment_mode).trim();
  }
  if (normalizedMode === 'net30') return 'Net 30';
  return String(payment.payment_mode || 'manual').replace(/_/g, ' ');
}

function normalizePaymentHistoryStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (['succeeded', 'success', 'completed', 'complete', 'paid'].includes(normalized)) return 'paid';
  if (normalized === 'failed') return 'failed';
  if (normalized === 'refunded') return 'refunded';
  return normalized || 'paid';
}

function buildPaymentHistoryListRow(payment = {}, booking = {}, leadInfo = {}) {
  const bookingId = Number(payment.booking_id || booking.stream_project_booking_id || 0) || null;
  const clientName =
    booking.client?.name ||
    leadInfo.client_name ||
    payment.client_name ||
    deriveNameFromEmail(payment.guest_email || leadInfo.guest_email || booking.guest_email) ||
    'Guest Client';
  const clientEmail = booking.client?.email || payment.guest_email || leadInfo.guest_email || booking.guest_email || null;
  const transactionDate = payment.paid_at || payment.created_at || booking.payment_completed_at || booking.event_date || null;
  const method = payment.method || (payment.type === 'stripe' ? 'Online Payment' : 'manual');
  const paymentRecordId = payment.manual_payment_id || payment.payment_id || payment.payment_history_id;
  const receiptNumber = payment.receipt_number || (
    payment.type === 'stripe'
      ? `RCPT-${String(bookingId).padStart(6, '0')}-S${String(paymentRecordId).padStart(3, '0')}`
      : `RCPT-${String(bookingId).padStart(6, '0')}-${String(paymentRecordId).padStart(3, '0')}`
  );

  return {
    finance_transaction_id: payment.payment_history_id,
    transaction_id: receiptNumber,
    transaction_code: receiptNumber,
    booking_id: bookingId,
    shoot_id: bookingId,
    payment_id: payment.payment_id || null,
    manual_payment_id: payment.manual_payment_id || null,
    quote_id: booking.quote_id || payment.quote_id || null,
    client_name: clientName,
    client_email: clientEmail,
    client_phone: leadInfo.phone || null,
    shoot_type: formatShootType(booking, payment.metadata || {}),
    project_name: booking.project_name || null,
    event_date: formatDateOnly(booking.event_date || null),
    transaction_date: transactionDate,
    total_amount: toMoney(payment.amount || 0),
    currency: payment.currency || 'USD',
    payment_method: method,
    status: normalizePaymentHistoryStatus(payment.status),
    transaction_type: payment.type === 'stripe' ? 'client_payment' : 'manual_payment',
    source: payment.type === 'stripe' ? 'stripe' : 'manual',
    external_reference: payment.external_reference || null,
    receipt_number: receiptNumber,
    invoice_number: payment.invoice_number || null,
    receipt_url: payment.receipt_url || null,
    receipt_download_url: payment.receipt_download_url || null,
    invoices_count: payment.invoice_count || 0,
    latest_invoice: payment.latest_invoice || null,
    metadata: payment.metadata || {}
  };
}

async function fetchPaymentHistoryEntriesForBookings(bookingIds = []) {
  const ids = [...new Set((bookingIds || []).map(Number).filter(Boolean))];
  const hasBookingFilter = ids.length > 0;
  const queryTypes = db.Sequelize.QueryTypes;
  const bookingFilterSql = hasBookingFilter ? 'AND booking_id IN (:bookingIds)' : '';
  const fipBookingFilterSql = hasBookingFilter ? 'AND fip.booking_id IN (:bookingIds)' : '';
  const bookingPaymentFilterSql = hasBookingFilter ? 'AND b.stream_project_booking_id IN (:bookingIds)' : '';
  const replacements = hasBookingFilter ? { bookingIds: ids } : {};

  const manualRows = await db.sequelize.query(
    `
      SELECT
        booking_manual_payment_id,
        booking_id,
        payment_type,
        amount,
        payment_mode,
        other_payment_mode,
        created_at
      FROM booking_manual_payments
      WHERE 1 = 1
        ${bookingFilterSql}
      ORDER BY created_at ASC, booking_manual_payment_id ASC
    `,
    { replacements, type: queryTypes.SELECT }
  ).catch((error) => {
    const code = error?.original?.code || error?.parent?.code || error?.code;
    if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_TABLE_ERROR') return [];
    throw error;
  });

  const stripeReceiptRows = await db.sequelize.query(
    `
      SELECT
        fip.booking_id,
        fip.payment_id,
        MIN(fip.finance_invoice_payment_id) AS finance_invoice_payment_id,
        MAX(fip.amount) AS amount,
        'paid' AS status,
        MIN(fip.paid_at) AS paid_at,
        MIN(fip.created_at) AS created_at,
        p.total_amount,
        p.status AS payment_status,
        p.created_at AS payment_created_at,
        p.stripe_payment_intent_id,
        p.stripe_charge_id
      FROM finance_invoice_payments fip
      LEFT JOIN payment_transactions p
        ON p.payment_id = fip.payment_id
      WHERE fip.payment_id IS NOT NULL
        AND fip.status = 'paid'
        ${fipBookingFilterSql}
      GROUP BY
        fip.booking_id,
        fip.payment_id,
        p.total_amount,
        p.status,
        p.created_at,
        p.stripe_payment_intent_id,
        p.stripe_charge_id
      ORDER BY COALESCE(MIN(fip.paid_at), p.created_at, MIN(fip.created_at)) ASC, MIN(fip.finance_invoice_payment_id) ASC
    `,
    { replacements, type: queryTypes.SELECT }
  ).catch((error) => {
    const code = error?.original?.code || error?.parent?.code || error?.code;
    if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_TABLE_ERROR') return [];
    throw error;
  });

  const directStripeRows = await db.sequelize.query(
    `
      SELECT
        b.stream_project_booking_id AS booking_id,
        p.payment_id,
        p.total_amount AS amount,
        p.status AS payment_status,
        p.created_at AS payment_created_at,
        p.stripe_payment_intent_id,
        p.stripe_charge_id
      FROM stream_project_booking b
      INNER JOIN payment_transactions p
        ON p.payment_id = b.payment_id
      WHERE b.payment_id IS NOT NULL
        AND COALESCE(p.total_amount, 0) > 0
        ${bookingPaymentFilterSql}
      ORDER BY COALESCE(b.payment_completed_at, p.created_at) ASC, p.payment_id ASC
    `,
    { replacements, type: queryTypes.SELECT }
  ).catch((error) => {
    const code = error?.original?.code || error?.parent?.code || error?.code;
    if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_TABLE_ERROR') return [];
    throw error;
  });

  const entries = [];
  manualRows.forEach((manualPayment) => {
    const bookingId = Number(manualPayment.booking_id);
    const manualPaymentId = Number(manualPayment.booking_manual_payment_id);
    if (!Number.isFinite(bookingId) || !Number.isFinite(manualPaymentId)) return;
    const method = formatManualPaymentMethod(manualPayment);
    entries.push({
      payment_history_id: `manual-${manualPaymentId}`,
      type: 'manual',
      booking_id: bookingId,
      manual_payment_id: manualPaymentId,
      method,
      amount: Number(manualPayment.amount || 0),
      status: 'paid',
      paid_at: manualPayment.created_at || null,
      created_at: manualPayment.created_at || null,
      receipt_number: `RCPT-${String(bookingId).padStart(6, '0')}-${String(manualPaymentId).padStart(3, '0')}`,
      invoice_number: `INVBEIGE-M-${String(bookingId).padStart(4, '0')}-${String(manualPaymentId).padStart(3, '0')}`,
      receipt_url: buildFinanceReceiptUrl({ bookingId, manualPaymentId }),
      receipt_download_url: buildFinanceReceiptUrl({ bookingId, manualPaymentId, download: true })
    });
  });

  const stripePaymentKeys = new Set();
  stripeReceiptRows.forEach((stripeReceipt) => {
    const bookingId = Number(stripeReceipt.booking_id);
    const paymentId = Number(stripeReceipt.payment_id);
    if (!Number.isFinite(bookingId) || !Number.isFinite(paymentId)) return;
    stripePaymentKeys.add(`${bookingId}:${paymentId}`);
    const status = normalizePaymentHistoryStatus(stripeReceipt.payment_status || stripeReceipt.status);
    entries.push({
      payment_history_id: `stripe-${paymentId}`,
      type: 'stripe',
      booking_id: bookingId,
      payment_id: paymentId,
      method: 'Online Payment',
      amount: Number(stripeReceipt.amount || stripeReceipt.total_amount || 0),
      status,
      paid_at: stripeReceipt.paid_at || stripeReceipt.payment_created_at || stripeReceipt.created_at || null,
      created_at: stripeReceipt.created_at || stripeReceipt.payment_created_at || null,
      external_reference: stripeReceipt.stripe_payment_intent_id || stripeReceipt.stripe_charge_id || null,
      receipt_number: `RCPT-${String(bookingId).padStart(6, '0')}-S${String(paymentId).padStart(3, '0')}`,
      invoice_number: `INVBEIGE-S-${String(bookingId).padStart(4, '0')}-${String(paymentId).padStart(3, '0')}`,
      receipt_url: buildFinanceReceiptUrl({ bookingId, paymentId }),
      receipt_download_url: buildFinanceReceiptUrl({ bookingId, paymentId, download: true })
    });
  });

  directStripeRows.forEach((payment) => {
    const bookingId = Number(payment.booking_id);
    const paymentId = Number(payment.payment_id);
    if (!Number.isFinite(bookingId) || !Number.isFinite(paymentId)) return;
    const key = `${bookingId}:${paymentId}`;
    if (stripePaymentKeys.has(key)) return;
    const status = normalizePaymentHistoryStatus(payment.payment_status);
    entries.push({
      payment_history_id: `stripe-${paymentId}`,
      type: 'stripe',
      booking_id: bookingId,
      payment_id: paymentId,
      method: 'Online Payment',
      amount: Number(payment.amount || 0),
      status,
      paid_at: payment.payment_created_at || null,
      created_at: payment.payment_created_at || null,
      external_reference: payment.stripe_payment_intent_id || payment.stripe_charge_id || null,
      receipt_number: `RCPT-${String(bookingId).padStart(6, '0')}-S${String(paymentId).padStart(3, '0')}`,
      invoice_number: `INVBEIGE-S-${String(bookingId).padStart(4, '0')}-${String(paymentId).padStart(3, '0')}`,
      receipt_url: buildFinanceReceiptUrl({ bookingId, paymentId }),
      receipt_download_url: buildFinanceReceiptUrl({ bookingId, paymentId, download: true })
    });
  });

  return entries.sort((left, right) => {
    const leftTime = new Date(left.paid_at || left.created_at || 0).getTime();
    const rightTime = new Date(right.paid_at || right.created_at || 0).getTime();
    if (leftTime !== rightTime) return rightTime - leftTime;
    return String(right.payment_history_id).localeCompare(String(left.payment_history_id));
  });
}

function paymentHistoryMatchesMethod(entry, paymentMethod) {
  const normalizedMethod = String(paymentMethod || '').trim().toLowerCase();
  if (!normalizedMethod) return true;
  const source = String(entry.type || entry.source || '').trim().toLowerCase();
  const method = String(entry.method || entry.payment_method || '').trim().toLowerCase();
  if (normalizedMethod === 'stripe') return source === 'stripe' || method === 'online payment' || method === 'stripe';
  if (normalizedMethod === 'bank transfer') return method === 'bank transfer';
  if (normalizedMethod === 'manual') return source === 'manual';
  return method === normalizedMethod;
}

function paymentHistoryMatchesSearch(row, search) {
  const normalizedSearch = String(search || '').trim().toLowerCase();
  if (!normalizedSearch) return true;
  return [
    row.transaction_id,
    row.transaction_code,
    row.receipt_number,
    row.invoice_number,
    row.booking_id ? `#${row.booking_id}` : null,
    row.booking_id,
    row.client_name,
    row.client_email,
    row.payment_method,
    row.shoot_type,
    row.project_name,
    row.external_reference
  ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
}

function buildClientWhere(userContext = {}, filters = {}) {
  const Op = db.Sequelize.Op;
  const userId = Number(userContext.userId || filters.client_user_id || 0) || null;
  const email = String(userContext.email || filters.guest_email || '').trim();
  const where = {};
  const clientOr = [];

  if (userId) clientOr.push({ client_user_id: userId });
  if (email) clientOr.push({ guest_email: email });
  if (clientOr.length === 1) Object.assign(where, clientOr[0]);
  if (clientOr.length > 1) where[Op.or] = clientOr;

  return where;
}

function buildCostBreakdownRow(breakdown = {}) {
  const subtotal = toMoney(breakdown.subtotal_amount);
  const discount = toMoney(breakdown.discount_amount);
  const tax = toMoney(breakdown.tax_amount);
  const equipment = toMoney(breakdown.equipment_amount);
  const total = toMoney(breakdown.total_amount);
  const baseCost = toMoney(Math.max(subtotal - equipment, 0));

  return {
    base_cost: baseCost,
    add_ons: equipment,
    taxes: tax,
    discounts: discount,
    total_amount: total,
    collected_amount: toMoney(breakdown.collected_amount),
    outstanding_amount: toMoney(breakdown.outstanding_amount),
    currency: breakdown.currency || 'USD'
  };
}

function formatClientInvoice(invoice = {}) {
  return {
    invoice_send_history_id: invoice.invoice_send_history_id,
    invoice_id: invoice.invoice_number || (invoice.invoice_send_history_id ? `INV-${invoice.invoice_send_history_id}` : null),
    invoice_number: invoice.invoice_number || null,
    invoice_url: invoice.invoice_url || null,
    invoice_pdf: invoice.invoice_pdf || null,
    payment_status: invoice.payment_status || 'pending',
    sent_at: invoice.sent_at || invoice.created_at || null
  };
}

function normalizeClientDisputeStatus(status) {
  if (status === 'open') return 'dispute_open';
  if (status === 'in_review' || status === 'escalated') return 'in_progress';
  if (status === 'resolved') return 'resolved';
  if (status === 'rejected') return 'rejected';
  return null;
}

function buildClientPaymentRow(plain, invoices = [], disputes = []) {
  const metadata = parseJson(plain.metadata_json, {}) || {};
  const booking = plain.booking || {};
  const latestInvoice = invoices[0] || null;
  const openDispute = disputes.find((dispute) => !['resolved', 'rejected'].includes(dispute.status));
  const disputeStatus = openDispute ? normalizeClientDisputeStatus(openDispute.status) : null;

  return {
    booking_id: plain.booking_id,
    shoot_id: plain.booking_id ? `BK-${String(plain.booking_id).padStart(3, '0')}` : null,
    shoot_type: formatShootType(booking, metadata),
    project_name: booking.project_name || null,
    total_amount: toMoney(plain.total_amount),
    currency: plain.currency || 'USD',
    invoices_count: invoices.length,
    invoices: invoices.map(formatClientInvoice),
    latest_invoice: latestInvoice ? formatClientInvoice(latestInvoice) : null,
    date_time: booking.payment_completed_at || booking.event_date || plain.calculated_at || plain.created_at,
    event_date: formatDateOnly(booking.event_date),
    payment_method: formatPaymentMethod(
      plain.finance_transaction?.payment_method,
      plain.finance_transaction?.source,
      plain.finance_transaction?.external_reference
    ),
    status: disputeStatus || normalizeDisplayStatus(plain.payment_status, Number(plain.collected_amount || 0) > 0),
    payment_status: plain.payment_status,
    cost_breakdown: buildCostBreakdownRow(plain),
    dispute: openDispute ? {
      dispute_id: openDispute.finance_dispute_id,
      dispute_code: openDispute.dispute_code,
      status: openDispute.status,
      category: openDispute.category,
      subject: openDispute.subject,
      created_at: openDispute.created_at
    } : null,
    actions: {
      can_view_details: true,
      can_view_invoice: Boolean(latestInvoice?.invoice_url || latestInvoice?.invoice_pdf),
      can_download_invoice: Boolean(latestInvoice?.invoice_pdf || latestInvoice?.invoice_url),
      can_raise_dispute: !openDispute && normalizeDisplayStatus(plain.payment_status, Number(plain.collected_amount || 0) > 0) === 'paid'
    }
  };
}

async function getClientUserContext(userContext = {}) {
  const userId = Number(userContext.userId || 0) || null;
  if (!userId) return { userId: null, email: userContext.email || null };

  const user = await db.users.findByPk(userId, { attributes: ['id', 'email', 'name'] });
  return {
    userId,
    email: userContext.email || user?.email || null,
    name: user?.name || null
  };
}

async function getClientPaymentManagement(filters = {}, userContext = {}) {
  const Op = db.Sequelize.Op;
  const clientContext = await getClientUserContext(userContext);
  const page = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 10, 1), 100);
  const offset = (page - 1) * limit;
  const where = buildClientWhere(clientContext, filters);
  const bookingWhere = {};
  const search = String(filters.search || filters.q || '').trim();

  await syncRecentPaidBookingsMissingFinance(Math.max(limit * 2, 50));

  if (!where[Op.or] && !where.client_user_id && !where.guest_email) {
    const error = new Error('Client identity is required');
    error.statusCode = 401;
    throw error;
  }

  if (filters.status) {
    const status = String(filters.status).trim();
    if (status === 'paid') where.payment_status = 'paid';
    if (status === 'pending') where.payment_status = { [Op.in]: ['unpaid', 'pending', 'partially_paid'] };
    if (status === 'refunded') where.payment_status = 'refunded';
    if (status === 'failed') where.payment_status = 'failed';
  }

  if (filters.month) {
    const month = String(filters.month).trim();
    const start = new Date(`${month}-01T00:00:00.000Z`);
    if (!Number.isNaN(start.getTime())) {
      const end = new Date(start);
      end.setUTCMonth(end.getUTCMonth() + 1);
      where.calculated_at = { [Op.gte]: start, [Op.lt]: end };
    }
  }

  if (search) {
    const term = `%${search}%`;
    bookingWhere[Op.or] = [
      { project_name: { [Op.like]: term } },
      { shoot_type: { [Op.like]: term } },
      { event_type: { [Op.like]: term } },
      { content_type: { [Op.like]: term } },
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
        attributes: ['stream_project_booking_id', 'project_name', 'shoot_type', 'event_type', 'content_type', 'event_date', 'guest_email', 'payment_completed_at']
      }
    ]
  });

  const rows = result.rows.map((row) => row.get({ plain: true }));
  const bookingIds = rows.map((row) => Number(row.booking_id)).filter(Boolean);
  const [invoices, disputes, transactions] = await Promise.all([
    db.invoice_send_history.findAll({
      where: { booking_id: { [Op.in]: bookingIds.length ? bookingIds : [0] } },
      order: [['sent_at', 'DESC'], ['invoice_send_history_id', 'DESC']],
      raw: true
    }),
    db.finance_disputes.findAll({
      where: { booking_id: { [Op.in]: bookingIds.length ? bookingIds : [0] } },
      order: [['created_at', 'DESC'], ['finance_dispute_id', 'DESC']],
      raw: true
    }),
    db.finance_transactions.findAll({
      where: { booking_id: { [Op.in]: bookingIds.length ? bookingIds : [0] }, transaction_type: 'client_payment' },
      order: [['transaction_date', 'DESC'], ['finance_transaction_id', 'DESC']],
      raw: true
    })
  ]);

  const invoiceMap = new Map();
  invoices.forEach((invoice) => {
    const bookingId = Number(invoice.booking_id);
    invoiceMap.set(bookingId, [...(invoiceMap.get(bookingId) || []), invoice]);
  });

  const disputeMap = new Map();
  disputes.forEach((dispute) => {
    const bookingId = Number(dispute.booking_id);
    disputeMap.set(bookingId, [...(disputeMap.get(bookingId) || []), dispute]);
  });

  const transactionMap = new Map();
  transactions.forEach((transaction) => {
    const bookingId = Number(transaction.booking_id);
    if (!transactionMap.has(bookingId)) transactionMap.set(bookingId, transaction);
  });

  const paymentRows = rows.map((row) => buildClientPaymentRow(
    { ...row, finance_transaction: transactionMap.get(Number(row.booking_id)) || null },
    invoiceMap.get(Number(row.booking_id)) || [],
    disputeMap.get(Number(row.booking_id)) || []
  ));

  return {
    rows: paymentRows,
    pagination: {
      page,
      limit,
      total: result.count,
      total_pages: Math.ceil(result.count / limit)
    },
    filters: {
      statuses: ['paid', 'pending', 'dispute_open', 'in_progress', 'resolved', 'refunded'],
      dispute_types: ['quality', 'payment_delay', 'wrong_deliverables', 'refund', 'payout_issues', 'other']
    }
  };
}

async function getClientPaymentDetails(bookingId, userContext = {}) {
  const clientContext = await getClientUserContext(userContext);
  const where = {
    booking_id: bookingId,
    ...buildClientWhere(clientContext, {})
  };

  const breakdown = await db.finance_project_breakdowns.findOne({
    where,
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

  if (!breakdown) {
    const error = new Error('Payment record not found');
    error.statusCode = 404;
    throw error;
  }

  const plain = breakdown.get({ plain: true });
  const [invoices, disputes, transaction] = await Promise.all([
    db.invoice_send_history.findAll({
      where: { booking_id: bookingId },
      order: [['sent_at', 'DESC'], ['invoice_send_history_id', 'DESC']],
      raw: true
    }),
    db.finance_disputes.findAll({
      where: { booking_id: bookingId },
      order: [['created_at', 'DESC'], ['finance_dispute_id', 'DESC']],
      raw: true
    }),
    db.finance_transactions.findOne({
      where: { booking_id: bookingId, transaction_type: 'client_payment' },
      order: [['transaction_date', 'DESC'], ['finance_transaction_id', 'DESC']],
      raw: true
    })
  ]);

  return {
    ...buildClientPaymentRow({ ...plain, finance_transaction: transaction }, invoices, disputes),
    creators: (plain.creator_earnings || []).map((earning) => ({
      creator_earning_id: earning.creator_earning_id,
      creator_id: earning.creator_id,
      name: [earning.creator?.first_name, earning.creator?.last_name].filter(Boolean).join(' ').trim() || earning.creator?.email || null,
      gross_amount: toMoney(earning.gross_amount),
      net_earning_amount: toMoney(earning.net_earning_amount),
      status: earning.status
    })),
    metadata: parseJson(plain.metadata_json, {})
  };
}

async function listTransactions(filters = {}) {
  const Op = db.Sequelize.Op;
  const page = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;
  const search = String(filters.search || filters.q || '').trim();
  const explicitBookingId = Number(filters.booking_id || 0) || null;
  const entries = await fetchPaymentHistoryEntriesForBookings(explicitBookingId ? [explicitBookingId] : []);
  const bookingIds = [...new Set(entries.map((entry) => Number(entry.booking_id)).filter(Boolean))];
  const [leadInfoByBookingId, invoiceCountsByBookingId, latestInvoicesByBookingId] = await Promise.all([
    getLeadInfoByBookingIds(bookingIds),
    getInvoiceCountsByBookingIds(bookingIds),
    getLatestInvoicesByBookingIds(bookingIds)
  ]);
  const bookingRows = bookingIds.length
    ? await db.stream_project_booking.findAll({
        where: { stream_project_booking_id: { [Op.in]: bookingIds } },
        attributes: ['stream_project_booking_id', 'quote_id', 'project_name', 'shoot_type', 'event_type', 'content_type', 'event_date', 'guest_email', 'payment_completed_at'],
        raw: true
      })
    : [];
  const bookingById = new Map(bookingRows.map((booking) => [Number(booking.stream_project_booking_id), booking]));

  const mappedRows = entries
    .map((entry) => {
      const bookingId = Number(entry.booking_id);
      return buildPaymentHistoryListRow(
        {
          ...entry,
          invoice_count: invoiceCountsByBookingId.get(bookingId) || 0,
          latest_invoice: latestInvoicesByBookingId.get(bookingId) || null
        },
        bookingById.get(bookingId) || {},
        leadInfoByBookingId.get(bookingId) || {}
      );
    })
    .filter((row) => {
      const status = String(filters.status || '').trim().toLowerCase();
      if (status && String(row.status || '').trim().toLowerCase() !== status) return false;
      if (filters.payment_id && Number(row.payment_id) !== Number(filters.payment_id)) return false;
      if (filters.transaction_type && row.transaction_type !== filters.transaction_type) return false;
      if (!paymentHistoryMatchesMethod(row, filters.payment_method)) return false;
      if (!paymentHistoryMatchesSearch(row, search)) return false;

      const transactionTime = row.transaction_date ? new Date(row.transaction_date).getTime() : 0;
      if (filters.date_from) {
        const fromTime = new Date(filters.date_from).getTime();
        if (Number.isFinite(fromTime) && transactionTime < fromTime) return false;
      }
      if (filters.date_to) {
        const toDate = new Date(filters.date_to);
        if (Number.isFinite(toDate.getTime())) {
          toDate.setHours(23, 59, 59, 999);
          if (transactionTime > toDate.getTime()) return false;
        }
      }

      return true;
    });

  const pagedRows = mappedRows.slice(offset, offset + limit);

  return {
    rows: pagedRows,
    pagination: {
      page,
      limit,
      total: mappedRows.length,
      total_pages: Math.ceil(mappedRows.length / limit)
    }
  };
}

async function listClientTransactions(filters = {}, userContext = {}) {
  const Op = db.Sequelize.Op;
  const page = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;
  const search = String(filters.search || filters.q || '').trim();
  const explicitBookingId = Number(filters.booking_id || 0) || null;
  const clientContext = await getClientUserContext(userContext);

  const clientWhere = [];
  if (clientContext.userId) clientWhere.push({ user_id: clientContext.userId });
  if (clientContext.email) clientWhere.push({ guest_email: clientContext.email });

  if (!clientWhere.length) {
    const error = new Error('Client identity is required');
    error.statusCode = 401;
    throw error;
  }

  const bookingRows = await db.stream_project_booking.findAll({
    where: clientWhere.length === 1 ? clientWhere[0] : { [Op.or]: clientWhere },
    attributes: ['stream_project_booking_id', 'quote_id', 'project_name', 'shoot_type', 'event_type', 'content_type', 'event_date', 'guest_email', 'payment_completed_at'],
    raw: true
  });

  let bookingIds = [...new Set(bookingRows.map((booking) => Number(booking.stream_project_booking_id)).filter(Boolean))];
  if (explicitBookingId) {
    bookingIds = bookingIds.filter((bookingId) => bookingId === explicitBookingId);
  }

  const [leadInfoByBookingId, paymentHistoryEntries] = await Promise.all([
    getLeadInfoByBookingIds(bookingIds),
    fetchPaymentHistoryEntriesForBookings(bookingIds)
  ]);

  const bookingById = new Map(bookingRows.map((booking) => [Number(booking.stream_project_booking_id), booking]));
  const mappedRows = paymentHistoryEntries
    .map((entry) => {
      const bookingId = Number(entry.booking_id);
      return buildPaymentHistoryListRow(
        entry,
        bookingById.get(bookingId) || {},
        leadInfoByBookingId.get(bookingId) || {}
      );
    })
    .filter((row) => {
      const status = String(filters.status || '').trim().toLowerCase();
      if (status && String(row.status || '').trim().toLowerCase() !== status) return false;
      if (filters.payment_id && Number(row.payment_id) !== Number(filters.payment_id)) return false;
      if (filters.transaction_type && row.transaction_type !== filters.transaction_type) return false;
      if (!paymentHistoryMatchesMethod(row, filters.payment_method)) return false;
      if (!paymentHistoryMatchesSearch(row, search)) return false;

      const transactionTime = row.transaction_date ? new Date(row.transaction_date).getTime() : 0;
      if (filters.date_from) {
        const fromTime = new Date(filters.date_from).getTime();
        if (Number.isFinite(fromTime) && transactionTime < fromTime) return false;
      }
      if (filters.date_to) {
        const toDate = new Date(filters.date_to);
        if (Number.isFinite(toDate.getTime())) {
          toDate.setHours(23, 59, 59, 999);
          if (transactionTime > toDate.getTime()) return false;
        }
      }

      return true;
    });

  const pagedRows = mappedRows.slice(offset, offset + limit);

  return {
    rows: pagedRows,
    pagination: {
      page,
      limit,
      total: mappedRows.length,
      total_pages: Math.ceil(mappedRows.length / limit)
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
  if (filters.payment_method) {
    const matchingEntries = await fetchPaymentHistoryEntriesForBookings([]);
    const matchingBookingIds = [
      ...new Set(
        matchingEntries
          .filter((entry) => paymentHistoryMatchesMethod(entry, filters.payment_method))
          .map((entry) => Number(entry.booking_id))
          .filter(Boolean)
      )
    ];
    where.booking_id = { [Op.in]: matchingBookingIds.length ? matchingBookingIds : [0] };
  }
  if (filters.search) {
    const rawSearch = String(filters.search).trim();
    const term = `%${rawSearch}%`;
    const directBookingId = Number(rawSearch.replace(/^#/, ''));
    if (Number.isFinite(directBookingId) && directBookingId > 0) {
      if (where.booking_id?.[Op.in]) {
        where.booking_id = {
          [Op.in]: where.booking_id[Op.in].filter((bookingId) => Number(bookingId) === directBookingId)
        };
      } else {
        where.booking_id = directBookingId;
      }
    }
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
        attributes: ['stream_project_booking_id', 'quote_id', 'project_name', 'shoot_type', 'event_type', 'content_type', 'event_date', 'guest_email']
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

  const plainRows = result.rows.map((row) => row.get({ plain: true }));
  const bookingIds = plainRows.map((row) => Number(row.booking_id)).filter(Boolean);
  const [leadInfoByBookingId, invoiceCountsByBookingId, latestInvoicesByBookingId, paymentHistoryEntries] = await Promise.all([
    getLeadInfoByBookingIds(bookingIds),
    getInvoiceCountsByBookingIds(bookingIds),
    getLatestInvoicesByBookingIds(bookingIds),
    fetchPaymentHistoryEntriesForBookings(bookingIds)
  ]);

  const transactionsByBookingId = new Map();
  const bookingById = new Map(plainRows.map((plain) => [Number(plain.booking_id), plain.booking || {}]));
  paymentHistoryEntries.forEach((paymentEntry) => {
    const bookingId = Number(paymentEntry.booking_id);
    if (!bookingId) return;

    const leadInfo = leadInfoByBookingId.get(bookingId) || {};
    const invoiceCount = invoiceCountsByBookingId.get(bookingId) || 0;
    const latestInvoice = latestInvoicesByBookingId.get(bookingId) || null;
    transactionsByBookingId.set(bookingId, [
      ...(transactionsByBookingId.get(bookingId) || []),
      buildPaymentHistoryListRow(
        {
          ...paymentEntry,
          invoice_count: invoiceCount,
          latest_invoice: latestInvoice
        },
        bookingById.get(bookingId) || {},
        leadInfo
      )
    ]);
  });
  transactionsByBookingId.forEach((transactions, bookingId) => {
    transactionsByBookingId.set(
      bookingId,
      [...transactions].sort((left, right) => {
        const leftTime = new Date(left.transaction_date || 0).getTime();
        const rightTime = new Date(right.transaction_date || 0).getTime();
        return leftTime - rightTime;
      })
    );
  });

  return {
    rows: plainRows.map((plain) => {
      const bookingId = Number(plain.booking_id);
      return {
        ...plain,
        metadata: parseJson(plain.metadata_json, null),
        transactions: transactionsByBookingId.get(bookingId) || []
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

async function getAdminCreatorWalletOverview(filters = {}) {
  const Op = db.Sequelize.Op;
  const payoutWhere = {};

  if (filters.date_from || filters.date_to) {
    payoutWhere.requested_at = {};
    if (filters.date_from) payoutWhere.requested_at[Op.gte] = new Date(filters.date_from);
    if (filters.date_to) payoutWhere.requested_at[Op.lte] = new Date(filters.date_to);
  }

  const [
    availableBalance,
    pendingBalance,
    reservedBalance,
    totalPaidOut,
    requestedPayouts,
    approvedPayouts,
    processingPayouts,
    paidPayouts,
    rejectedPayouts
  ] = await Promise.all([
    db.creator_wallets.sum('available_balance'),
    db.creator_wallets.sum('pending_balance'),
    db.creator_wallets.sum('reserved_balance'),
    db.creator_wallets.sum('lifetime_payouts'),
    db.creator_payout_requests.count({ where: { ...payoutWhere, status: 'requested' } }),
    db.creator_payout_requests.count({ where: { ...payoutWhere, status: 'approved' } }),
    db.creator_payout_requests.count({ where: { ...payoutWhere, status: 'processing' } }),
    db.creator_payout_requests.count({ where: { ...payoutWhere, status: 'paid' } }),
    db.creator_payout_requests.count({ where: { ...payoutWhere, status: 'rejected' } })
  ]);

  return {
    available_balance: toMoney(availableBalance || 0),
    pending_balance: toMoney(pendingBalance || 0),
    reserved_balance: toMoney(reservedBalance || 0),
    total_paid_out: toMoney(totalPaidOut || 0),
    payout_counts: {
      requested: requestedPayouts,
      approved: approvedPayouts,
      processing: processingPayouts,
      paid: paidPayouts,
      rejected: rejectedPayouts
    }
  };
}

function normalizeSortOrder(value) {
  return String(value || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
}

function buildCreatorName(creator = null) {
  if (!creator) return null;
  return [creator.first_name, creator.last_name].filter(Boolean).join(' ').trim() || creator.email || null;
}

function buildCreatorInitials(creator = null) {
  if (!creator) return null;
  const first = String(creator.first_name || '').trim().charAt(0);
  const last = String(creator.last_name || '').trim().charAt(0);
  return `${first}${last}`.toUpperCase() || null;
}

function formatPayoutMethod(method = null) {
  const value = String(method || '').replace(/_/g, ' ').trim();
  return value ? value.replace(/\b\w/g, (char) => char.toUpperCase()) : null;
}

function getPayoutSort(filters = {}) {
  const direction = normalizeSortOrder(filters.sort_order || filters.order);
  const sortBy = String(filters.sort_by || 'requested_at').toLowerCase();
  const allowed = {
    requested_at: 'requested_at',
    date: 'requested_at',
    amount: 'amount',
    status: 'status',
    payout_method: 'payout_method',
    paid_at: 'paid_at',
    processed_at: 'processed_at',
    creator_payout_request_id: 'creator_payout_request_id'
  };

  return [[allowed[sortBy] || 'requested_at', direction], ['creator_payout_request_id', direction]];
}

function getMetadataArray(metadata, keys = []) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (Array.isArray(value)) return value.map(Number).filter(Boolean);
    if (value) return [Number(value)].filter(Boolean);
  }
  return [];
}

async function findPayoutIdsForShootSearch(search) {
  const shootId = Number(String(search || '').replace(/^#/, '').trim());
  if (!shootId) return [];

  const earnings = await db.creator_earnings.findAll({
    where: {
      booking_id: shootId,
      payout_id: { [db.Sequelize.Op.ne]: null }
    },
    attributes: ['payout_id'],
    raw: true
  });

  return [...new Set(earnings.map((row) => Number(row.payout_id)).filter(Boolean))];
}

async function getLinkedPayoutEarnings(payoutRows = []) {
  const Op = db.Sequelize.Op;
  const payoutIds = payoutRows.map((row) => Number(row.creator_payout_request_id)).filter(Boolean);
  const metadataEarningIds = [];
  const metadataBookingPairs = [];

  payoutRows.forEach((row) => {
    const metadata = parseJson(row.metadata_json, {});
    metadataEarningIds.push(...getMetadataArray(metadata, ['creator_earning_ids', 'earning_ids', 'creator_earning_id']));
    getMetadataArray(metadata, ['booking_ids', 'booking_id', 'shoot_ids', 'shoot_id']).forEach((bookingId) => {
      metadataBookingPairs.push({ payoutId: Number(row.creator_payout_request_id), bookingId, creatorId: Number(row.creator_id) });
    });
  });

  const or = [];
  if (payoutIds.length) or.push({ payout_id: { [Op.in]: payoutIds } });
  if (metadataEarningIds.length) or.push({ creator_earning_id: { [Op.in]: [...new Set(metadataEarningIds)] } });
  metadataBookingPairs.forEach((pair) => {
    or.push({ booking_id: pair.bookingId, creator_id: pair.creatorId });
  });

  if (!or.length) return new Map();

  const earnings = await db.creator_earnings.findAll({
    where: { [Op.or]: or },
    include: [
      {
        model: db.stream_project_booking,
        as: 'booking',
        required: false,
        attributes: ['stream_project_booking_id', 'project_name', 'shoot_type', 'event_type', 'event_date']
      }
    ]
  });

  const map = new Map();
  earnings.forEach((earning) => {
    const plain = earning.get({ plain: true });
    let payoutId = Number(plain.payout_id);
    if (!payoutId) {
      const linkedRow = payoutRows.find((row) => {
        const metadata = parseJson(row.metadata_json, {});
        const earningIds = getMetadataArray(metadata, ['creator_earning_ids', 'earning_ids', 'creator_earning_id']);
        const bookingIds = getMetadataArray(metadata, ['booking_ids', 'booking_id', 'shoot_ids', 'shoot_id']);
        return earningIds.includes(Number(plain.creator_earning_id)) ||
          (bookingIds.includes(Number(plain.booking_id)) && Number(row.creator_id) === Number(plain.creator_id));
      });
      payoutId = Number(linkedRow?.creator_payout_request_id);
    }

    if (!payoutId) return;
    if (!map.has(payoutId)) map.set(payoutId, []);
    map.get(payoutId).push({ ...plain, metadata: parseJson(plain.metadata_json, null) });
  });

  return map;
}

async function getLinkedInvoicesByBookingIds(bookingIds = []) {
  const uniqueBookingIds = [...new Set(bookingIds.map(Number).filter(Boolean))];
  if (!uniqueBookingIds.length) return new Map();

  const invoicePayments = await db.finance_invoice_payments.findAll({
    where: { booking_id: { [db.Sequelize.Op.in]: uniqueBookingIds } },
    include: [
      {
        model: db.invoice_send_history,
        as: 'invoice',
        required: false,
        attributes: ['invoice_send_history_id', 'invoice_number', 'invoice_url', 'invoice_pdf', 'payment_status', 'sent_at']
      }
    ],
    order: [['created_at', 'DESC']]
  });

  const map = new Map();
  invoicePayments.forEach((row) => {
    const plain = row.get({ plain: true });
    if (!map.has(Number(plain.booking_id))) map.set(Number(plain.booking_id), []);
    map.get(Number(plain.booking_id)).push({
      finance_invoice_payment_id: plain.finance_invoice_payment_id,
      invoice_send_history_id: plain.invoice_send_history_id,
      invoice_number: plain.invoice?.invoice_number || `INV-${plain.invoice_send_history_id}`,
      invoice_url: plain.invoice?.invoice_url || null,
      invoice_pdf: plain.invoice?.invoice_pdf || null,
      payment_status: plain.invoice?.payment_status || plain.status,
      amount: toMoney(plain.amount),
      paid_at: plain.paid_at,
      sent_at: plain.invoice?.sent_at || null
    });
  });

  return map;
}

function buildPayoutScreenRow(row, linkedEarnings = [], invoiceMap = new Map()) {
  const plain = row.get ? row.get({ plain: true }) : row;
  const creatorName = buildCreatorName(plain.creator);
  const bookingIds = [...new Set(linkedEarnings.map((earning) => Number(earning.booking_id)).filter(Boolean))];
  const serviceTypes = [...new Set(linkedEarnings.map((earning) => (
    earning.booking?.shoot_type || earning.booking?.event_type || null
  )).filter(Boolean))];
  const linkedInvoices = bookingIds.flatMap((bookingId) => invoiceMap.get(bookingId) || []).map((invoice) => ({
    id: invoice.invoice_send_history_id,
    invoice_number: invoice.invoice_number,
    invoice_url: invoice.invoice_url,
    invoice_pdf: invoice.invoice_pdf,
    payment_status: invoice.payment_status,
    amount: invoice.amount
  }));
  const serviceEarnings = toMoney(linkedEarnings.reduce((sum, earning) => sum + Number(earning.gross_amount || 0), 0));
  const platformFee = toMoney(linkedEarnings.reduce((sum, earning) => sum + Number(earning.platform_fee_amount || 0), 0));
  const netPayout = toMoney(linkedEarnings.reduce((sum, earning) => sum + Number(earning.net_earning_amount || 0), 0));
  const fallbackAmount = toMoney(plain.amount);
  const serviceType = serviceTypes.length > 1 ? serviceTypes.join(' + ') : (serviceTypes[0] || plain.creator?.primary_role || null);
  const canApprove = plain.status === 'requested';
  const canReject = ['requested', 'approved', 'processing'].includes(plain.status);
  const canMarkPaid = ['approved', 'processing'].includes(plain.status);

  return {
    payout_request_id: plain.creator_payout_request_id,
    request_code: plain.request_code,
    shoot_id: bookingIds[0] || null,
    shoot_ids: bookingIds,
    creator: {
      id: plain.creator_id,
      name: creatorName,
      email: plain.creator?.email || null,
      initials: buildCreatorInitials(plain.creator)
    },
    service_type: serviceType,
    net_payout: netPayout || fallbackAmount,
    payment_method: plain.payout_method,
    payment_method_label: formatPayoutMethod(plain.payout_method),
    status: plain.status,
    requested_at: plain.requested_at,
    approved_at: plain.approved_at,
    paid_at: plain.paid_at,
    payout_breakdown: {
      service_earnings: serviceEarnings || fallbackAmount,
      platform_fee: platformFee,
      net_payout: netPayout || fallbackAmount
    },
    linked_invoices: linkedInvoices,
    actions: {
      can_approve: canApprove,
      can_reject: canReject,
      can_mark_paid: canMarkPaid
    }
  };
}

async function listCreatorPayouts(filters = {}) {
  const Op = db.Sequelize.Op;
  const page = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;
  const where = {};
  const creatorWhere = {};
  const search = String(filters.search || filters.q || '').trim();

  if (filters.creator_id) where.creator_id = filters.creator_id;
  if (filters.status) where.status = filters.status;
  if (filters.payout_method) where.payout_method = filters.payout_method;
  if (filters.date_from || filters.date_to) {
    where.requested_at = {};
    if (filters.date_from) where.requested_at[Op.gte] = new Date(filters.date_from);
    if (filters.date_to) where.requested_at[Op.lte] = new Date(filters.date_to);
  }
  if (search) {
    const term = `%${search}%`;
    const shootMatchedPayoutIds = await findPayoutIdsForShootSearch(search);
    const searchOr = [
      { request_code: { [Op.like]: term } },
      { external_reference: { [Op.like]: term } },
      { '$creator.first_name$': { [Op.like]: term } },
      { '$creator.last_name$': { [Op.like]: term } },
      { '$creator.email$': { [Op.like]: term } }
    ];
    if (shootMatchedPayoutIds.length) searchOr.push({ creator_payout_request_id: { [Op.in]: shootMatchedPayoutIds } });
    where[Op.or] = searchOr;
  }

  const result = await db.creator_payout_requests.findAndCountAll({
    where,
    distinct: true,
    limit,
    offset,
    order: getPayoutSort(filters),
    subQuery: false,
    include: [
      {
        model: db.crew_members,
        as: 'creator',
        required: false,
        where: creatorWhere,
        attributes: ['crew_member_id', 'first_name', 'last_name', 'email', 'primary_role']
      },
      {
        model: db.creator_payout_accounts,
        as: 'payout_account',
        required: false
      }
    ]
  });
  const plainRows = result.rows.map((row) => row.get({ plain: true }));
  const earningsMap = await getLinkedPayoutEarnings(plainRows);
  const bookingIds = [...earningsMap.values()].flat().map((earning) => earning.booking_id);
  const invoiceMap = await getLinkedInvoicesByBookingIds(bookingIds);

  return {
    rows: plainRows.map((row) => buildPayoutScreenRow(row, earningsMap.get(Number(row.creator_payout_request_id)) || [], invoiceMap)),
    pagination: {
      page,
      limit,
      total: result.count,
      total_pages: Math.ceil(result.count / limit)
    }
  };
}

async function getAdminPayoutsScreen(filters = {}) {
  const [walletOverview, payout_history] = await Promise.all([
    getAdminCreatorWalletOverview(filters),
    listCreatorPayouts(filters)
  ]);
  const overview = {
    available_balance: walletOverview.available_balance,
    pending_balance: walletOverview.pending_balance,
    reserved_balance: walletOverview.reserved_balance,
    total_paid_out: walletOverview.total_paid_out
  };

  return { overview, payout_history };
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
  const Op = db.Sequelize.Op;
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
    const creatorEarningIds = Array.isArray(payload.creator_earning_ids)
      ? payload.creator_earning_ids.map(Number).filter(Boolean)
      : [];
    const payoutRequest = await db.creator_payout_requests.create({
      request_code: buildPayoutRequestCode(creatorId),
      creator_id: creatorId,
      creator_payout_account_id: payoutAccount?.creator_payout_account_id || null,
      currency: payload.currency || wallet.currency || 'USD',
      amount,
      payout_method: payoutMethod,
      status: 'requested',
      requested_at: new Date(),
      metadata_json: stringifyMetadata({
        ...(payload.metadata || {}),
        ...(creatorEarningIds.length ? { creator_earning_ids: creatorEarningIds } : {})
      }),
      updated_at: new Date()
    }, { transaction });

    if (creatorEarningIds.length) {
      await db.creator_earnings.update(
        {
          payout_id: payoutRequest.creator_payout_request_id,
          status: 'payout_pending',
          updated_at: new Date()
        },
        {
          where: {
            creator_earning_id: { [Op.in]: creatorEarningIds },
            creator_id: creatorId,
            status: { [Op.in]: ['earned', 'payout_pending'] }
          },
          transaction
        }
      );
    }

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

    await db.creator_earnings.update(
      { status: 'earned', payout_id: null, updated_at: new Date() },
      { where: { payout_id: payoutRequest.creator_payout_request_id, status: 'payout_pending' }, transaction }
    );

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

    await db.creator_earnings.update(
      { status: 'paid', updated_at: new Date() },
      { where: { payout_id: payoutRequest.creator_payout_request_id }, transaction }
    );

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
  listClientTransactions,
  listShootBreakdowns,
  getShootFinance,
  getClientPaymentManagement,
  getClientPaymentDetails,
  getCreatorWallet,
  getAdminCreatorWalletOverview,
  getAdminPayoutsScreen,
  listCreatorPayouts,
  upsertCreatorPayoutAccount,
  releaseCreatorEarnings,
  requestCreatorPayout,
  approveCreatorPayout,
  rejectCreatorPayout,
  markCreatorPayoutPaid
};
