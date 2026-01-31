/**
 * Pricing Service
 * 
 * Core pricing calculation engine for the Revure booking system.
 * Handles catalog retrieval, quote calculation, and discount application.
 */

const db = require('../models');
const { Op } = require('sequelize');

// Default margin percentage (can be overridden from environment)
const DEFAULT_MARGIN_PERCENT = parseFloat(process.env.BEIGE_MARGIN_PERCENT || '25.00');

/**
 * Determine pricing mode based on event type
 * @param {string} eventType - The event type (e.g., 'wedding', 'corporate')
 * @returns {string} 'wedding' or 'general'
 */
function determinePricingMode(eventType) {
  if (!eventType) return 'general';
  const normalizedType = eventType.toLowerCase().trim();
  
  // Wedding-related keywords
  const weddingKeywords = ['wedding', 'bridal', 'engagement', 'ceremony', 'reception'];
  
  for (const keyword of weddingKeywords) {
    if (normalizedType.includes(keyword)) {
      return 'wedding';
    }
  }
  
  return 'general';
}

/**
 * Get the full pricing catalog with categories and items
 * @param {string} mode - 'general', 'wedding', or null for all
 * @returns {Promise<Array>} Categories with nested items
 */
async function getCatalog(mode = null) {
  try {
    // Build where clause for items based on mode
    const itemWhere = { is_active: 1 };
    if (mode) {
      // Include items that match the mode OR are available for 'both'
      itemWhere.pricing_mode = { [Op.in]: [mode, 'both'] };
    }

    const categories = await db.pricing_categories.findAll({
      where: { is_active: 1 },
      order: [['display_order', 'ASC']],
      include: [{
        model: db.pricing_items,
        as: 'items',
        where: itemWhere,
        required: false,
        order: [['display_order', 'ASC']],
      }],
    });

    // Transform to plain objects and filter empty categories
    return categories
      .map(cat => {
        const plainCat = cat.toJSON();
        // Sort items by display_order
        if (plainCat.items) {
          plainCat.items.sort((a, b) => a.display_order - b.display_order);
        }
        return plainCat;
      })
      .filter(cat => cat.items && cat.items.length > 0);
  } catch (error) {
    console.error('Error fetching pricing catalog:', error);
    throw error;
  }
}

/**
 * Get discount tiers for a pricing mode
 * @param {string} mode - 'general' or 'wedding'
 * @returns {Promise<Array>} Discount tier records
 */
async function getDiscountTiers(mode = 'general') {
  try {
    const tiers = await db.pricing_discount_tiers.findAll({
      where: { pricing_mode: mode },
      order: [['min_hours', 'ASC']],
    });
    return tiers.map(t => t.toJSON());
  } catch (error) {
    console.error('Error fetching discount tiers:', error);
    throw error;
  }
}

/**
 * Get discount percentage for given hours
 * @param {number} hours - Shoot hours
 * @param {string} mode - 'general' or 'wedding'
 * @returns {Promise<number>} Discount percentage
 */
async function getDiscountPercent(hours, mode = 'general') {
  try {
    // Find the tier where hours fall between min and max
    const tier = await db.pricing_discount_tiers.findOne({
      where: {
        pricing_mode: mode,
        min_hours: { [Op.lte]: hours },
        [Op.or]: [
          { max_hours: { [Op.gt]: hours } },
          { max_hours: null }, // Unlimited (highest tier)
        ],
      },
      order: [['min_hours', 'DESC']], // Get the highest matching tier
    });

    if (!tier) {
      // Fallback: if no tier found, check for the highest tier (no max)
      const highestTier = await db.pricing_discount_tiers.findOne({
        where: {
          pricing_mode: mode,
          max_hours: null,
        },
      });
      return highestTier ? parseFloat(highestTier.discount_percent) : 0;
    }

    return parseFloat(tier.discount_percent);
  } catch (error) {
    console.error('Error getting discount percent:', error);
    return 0;
  }
}

/**
 * Calculate quote from selected items
 * @param {Object} params - Calculation parameters
 * @param {Array<{item_id: number, quantity: number}>} params.items - Selected items with quantities
 * @param {number} params.shootHours - Total shoot hours (for services and discounts)
 * @param {string} params.eventType - Event type (determines pricing mode)
 * @param {number} [params.marginPercent] - Override margin percentage
 * @param {boolean} [params.skipDiscount] - Skip hour-based discount calculation
 * @param {boolean} [params.skipMargin] - Skip beige margin calculation
 * @returns {Promise<Object>} Calculated quote breakdown
 */
async function calculateQuote({ items, shootHours = 0, eventType = null, marginPercent = null, skipDiscount = false, skipMargin = false }) {
  try {
    const pricingMode = determinePricingMode(eventType);
    const effectiveMargin = marginPercent !== null ? marginPercent : DEFAULT_MARGIN_PERCENT;
    
    // Validate and fetch item details
    if (!items || items.length === 0) {
      return {
        pricingMode,
        shootHours,
        lineItems: [],
        subtotal: 0,
        discountPercent: 0,
        discountAmount: 0,
        priceAfterDiscount: 0,
        marginPercent: skipMargin ? 0 : effectiveMargin,
        marginAmount: 0,
        total: 0,
        discountSkipped: skipDiscount,
        marginSkipped: skipMargin,
      };
    }

    // Get item IDs
    const itemIds = items.map(i => i.item_id);
    
    // Fetch pricing items from database
    const pricingItems = await db.pricing_items.findAll({
      where: {
        item_id: { [Op.in]: itemIds },
        is_active: 1,
      },
      include: [{
        model: db.pricing_categories,
        as: 'category',
        attributes: ['category_id', 'name', 'slug'],
      }],
    });

    // Create a map for quick lookup
    const itemMap = new Map();
    pricingItems.forEach(item => {
      itemMap.set(item.item_id, item.toJSON());
    });

    // Calculate line items
    const lineItems = [];
    let subtotal = 0;

    for (const selectedItem of items) {
      const pricingItem = itemMap.get(selectedItem.item_id);
      if (!pricingItem) {
        console.warn(`Pricing item not found: ${selectedItem.item_id}`);
        continue;
      }

      const quantity = selectedItem.quantity || 1;
      let unitPrice = parseFloat(pricingItem.rate);
      let lineTotal;

      // Calculate based on rate type
      switch (pricingItem.rate_type) {
        case 'per_hour':
          // For hourly items, multiply by shoot hours and quantity (number of people)
          lineTotal = unitPrice * shootHours * quantity;
          break;
        case 'per_day':
          // For daily items, quantity is number of days
          lineTotal = unitPrice * quantity;
          break;
        case 'per_unit':
          // For per-unit items (e.g., per mic, per language)
          lineTotal = unitPrice * quantity;
          break;
        case 'flat':
        default:
          // Flat rate items - quantity multiplies the flat rate
          lineTotal = unitPrice * quantity;
          break;
      }

      lineTotal = parseFloat(lineTotal.toFixed(2));
      subtotal += lineTotal;

      lineItems.push({
        item_id: pricingItem.item_id,
        item_name: pricingItem.name,
        category_name: pricingItem.category?.name || 'Uncategorized',
        category_slug: pricingItem.category?.slug || 'uncategorized',
        quantity,
        unit_price: unitPrice,
        rate_type: pricingItem.rate_type,
        rate_unit: pricingItem.rate_unit,
        line_total: lineTotal,
      });
    }

    subtotal = parseFloat(subtotal.toFixed(2));

    // Get discount based on shoot hours (skip if requested)
    const discountPercent = skipDiscount ? 0 : await getDiscountPercent(shootHours, pricingMode);
    const discountAmount = parseFloat((subtotal * discountPercent / 100).toFixed(2));
    const priceAfterDiscount = parseFloat((subtotal - discountAmount).toFixed(2));

    // Calculate margin (skip if requested)
    const effectiveMarginToApply = skipMargin ? 0 : effectiveMargin;
    const marginAmount = parseFloat((priceAfterDiscount * effectiveMarginToApply / 100).toFixed(2));
    const total = parseFloat((priceAfterDiscount + marginAmount).toFixed(2));

    return {
      pricingMode,
      shootHours,
      lineItems,
      subtotal,
      discountPercent,
      discountAmount,
      priceAfterDiscount,
      marginPercent: effectiveMarginToApply,
      marginAmount,
      total,
      // Add flags for transparency
      discountSkipped: skipDiscount,
      marginSkipped: skipMargin,
    };
  } catch (error) {
    console.error('Error calculating quote:', error);
    throw error;
  }
}

/**
 * Save a quote to the database
 * @param {Object} quoteData - Quote data from calculateQuote
 * @param {Object} metadata - Additional metadata (user_id, guest_email, booking_id, notes)
 * @returns {Promise<Object>} Saved quote with ID
 */
async function saveQuote(quoteData, metadata = {}) {
  const transaction = await db.sequelize.transaction();
  
  try {
    // Create quote record
    const quote = await db.quotes.create({
      booking_id: metadata.booking_id || null,
      user_id: metadata.user_id || null,
      guest_email: metadata.guest_email || null,
      pricing_mode: quoteData.pricingMode,
      shoot_hours: quoteData.shootHours,
      subtotal: quoteData.subtotal,
      discount_percent: quoteData.discountPercent,
      discount_amount: quoteData.discountAmount,
      price_after_discount: quoteData.priceAfterDiscount,
      margin_percent: quoteData.marginPercent,
      margin_amount: quoteData.marginAmount,
      total: quoteData.total,
      status: metadata.status || 'draft',
      expires_at: metadata.expires_at || null,
      notes: metadata.notes || null,
    }, { transaction });

    // Create line items
    if (quoteData.lineItems && quoteData.lineItems.length > 0) {
      const lineItemsData = quoteData.lineItems.map(item => ({
        quote_id: quote.quote_id,
        item_id: item.item_id,
        item_name: item.item_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.line_total,
        notes: item.notes || null,
      }));

      await db.quote_line_items.bulkCreate(lineItemsData, { transaction });
    }

    await transaction.commit();

    // Fetch and return the complete quote
    return getQuoteById(quote.quote_id);
  } catch (error) {
    await transaction.rollback();
    console.error('Error saving quote:', error);
    throw error;
  }
}

/**
 * Get a quote by ID with line items
 * @param {number} quoteId - Quote ID
 * @returns {Promise<Object|null>} Quote with line items or null
 */
async function getQuoteById(quoteId) {
  try {
    const quote = await db.quotes.findOne({
      where: { quote_id: quoteId },
      include: [{
        model: db.quote_line_items,
        as: 'line_items',
        include: [{
          model: db.pricing_items,
          as: 'pricing_item',
          attributes: ['item_id', 'name', 'slug', 'rate_type', 'rate_unit'],
          include: [{
            model: db.pricing_categories,
            as: 'category',
            attributes: ['category_id', 'name', 'slug'],
          }],
        }],
      }],
    });

    if (!quote) return null;

    return quote.toJSON();
  } catch (error) {
    console.error('Error fetching quote:', error);
    throw error;
  }
}

/**
 * Get pricing item by ID
 * @param {number} itemId - Item ID
 * @returns {Promise<Object|null>} Pricing item or null
 */
async function getPricingItem(itemId) {
  try {
    const item = await db.pricing_items.findOne({
      where: { item_id: itemId, is_active: 1 },
      include: [{
        model: db.pricing_categories,
        as: 'category',
        attributes: ['category_id', 'name', 'slug'],
      }],
    });
    return item ? item.toJSON() : null;
  } catch (error) {
    console.error('Error fetching pricing item:', error);
    throw error;
  }
}

/**
 * Get all pricing items (for admin)
 * @param {Object} filters - Optional filters
 * @returns {Promise<Array>} All pricing items
 */
async function getAllPricingItems(filters = {}) {
  try {
    const where = {};
    if (filters.category_id) where.category_id = filters.category_id;
    if (filters.pricing_mode) where.pricing_mode = { [Op.in]: [filters.pricing_mode, 'both'] };
    if (filters.is_active !== undefined) where.is_active = filters.is_active;

    const items = await db.pricing_items.findAll({
      where,
      include: [{
        model: db.pricing_categories,
        as: 'category',
        attributes: ['category_id', 'name', 'slug'],
      }],
      order: [
        ['category_id', 'ASC'],
        ['display_order', 'ASC'],
      ],
    });

    return items.map(i => i.toJSON());
  } catch (error) {
    console.error('Error fetching all pricing items:', error);
    throw error;
  }
}

module.exports = {
  determinePricingMode,
  getCatalog,
  getDiscountTiers,
  getDiscountPercent,
  calculateQuote,
  saveQuote,
  getQuoteById,
  getPricingItem,
  getAllPricingItems,
  DEFAULT_MARGIN_PERCENT,
};

