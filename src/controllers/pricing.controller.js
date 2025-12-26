/**
 * Pricing Controller
 * 
 * Handles API endpoints for the pricing catalog and quote calculation.
 */

const pricingService = require('../services/pricing.service');
const constants = require('../utils/constants');

/**
 * Get pricing catalog
 * GET /api/pricing/catalog
 * Query params: mode (optional) - 'general' or 'wedding'
 */
exports.getCatalog = async (req, res) => {
  try {
    const { mode, event_type } = req.query;
    
    // Determine mode from event_type if not explicitly provided
    let pricingMode = mode;
    if (!pricingMode && event_type) {
      pricingMode = pricingService.determinePricingMode(event_type);
    }
    
    const catalog = await pricingService.getCatalog(pricingMode);
    
    res.json({
      success: true,
      data: {
        pricingMode: pricingMode || 'all',
        categories: catalog,
      },
    });
  } catch (error) {
    console.error('Error fetching pricing catalog:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch pricing catalog',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get discount tiers
 * GET /api/pricing/discounts
 * Query params: mode (optional) - 'general' or 'wedding'
 */
exports.getDiscountTiers = async (req, res) => {
  try {
    const { mode = 'general' } = req.query;
    
    const tiers = await pricingService.getDiscountTiers(mode);
    
    res.json({
      success: true,
      data: {
        pricingMode: mode,
        tiers,
      },
    });
  } catch (error) {
    console.error('Error fetching discount tiers:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch discount tiers',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Calculate pricing quote
 * POST /api/pricing/calculate
 * Body: {
 *   items: [{item_id, quantity}],
 *   shootHours: number,
 *   eventType: string (optional),
 *   marginPercent: number (optional, override)
 * }
 */
exports.calculateQuote = async (req, res) => {
  try {
    const { items, shootHours, eventType, marginPercent } = req.body;
    
    // Validate items
    if (!items || !Array.isArray(items)) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Items array is required',
      });
    }
    
    // Validate each item
    for (const item of items) {
      if (!item.item_id) {
        return res.status(constants.BAD_REQUEST.code).json({
          success: false,
          message: 'Each item must have an item_id',
        });
      }
      if (item.quantity !== undefined && (item.quantity < 0 || !Number.isFinite(item.quantity))) {
        return res.status(constants.BAD_REQUEST.code).json({
          success: false,
          message: 'Invalid quantity for item ' + item.item_id,
        });
      }
    }
    
    // Validate shoot hours
    const hours = parseFloat(shootHours) || 0;
    if (hours < 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Shoot hours must be non-negative',
      });
    }
    
    const quote = await pricingService.calculateQuote({
      items,
      shootHours: hours,
      eventType,
      marginPercent: marginPercent !== undefined ? parseFloat(marginPercent) : null,
    });
    
    res.json({
      success: true,
      data: quote,
    });
  } catch (error) {
    console.error('Error calculating quote:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to calculate quote',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Save a quote
 * POST /api/pricing/quotes
 * Body: {
 *   items: [{item_id, quantity}],
 *   shootHours: number,
 *   eventType: string,
 *   guestEmail: string (optional),
 *   bookingId: number (optional),
 *   notes: string (optional)
 * }
 */
exports.saveQuote = async (req, res) => {
  try {
    const { items, shootHours, eventType, guestEmail, bookingId, notes } = req.body;
    
    // Calculate the quote first
    const quoteData = await pricingService.calculateQuote({
      items,
      shootHours: parseFloat(shootHours) || 0,
      eventType,
    });
    
    // Get user ID from auth if available
    const userId = req.userId || null;
    
    // Save the quote
    const savedQuote = await pricingService.saveQuote(quoteData, {
      user_id: userId,
      guest_email: guestEmail,
      booking_id: bookingId,
      notes,
      status: 'pending',
      // Quote expires in 7 days
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    
    res.status(201).json({
      success: true,
      data: savedQuote,
    });
  } catch (error) {
    console.error('Error saving quote:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to save quote',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get a quote by ID
 * GET /api/pricing/quotes/:quoteId
 */
exports.getQuote = async (req, res) => {
  try {
    const { quoteId } = req.params;
    
    if (!quoteId || isNaN(parseInt(quoteId))) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Valid quote ID is required',
      });
    }
    
    const quote = await pricingService.getQuoteById(parseInt(quoteId));
    
    if (!quote) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Quote not found',
      });
    }
    
    res.json({
      success: true,
      data: quote,
    });
  } catch (error) {
    console.error('Error fetching quote:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch quote',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get pricing item details
 * GET /api/pricing/items/:itemId
 */
exports.getPricingItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    
    if (!itemId || isNaN(parseInt(itemId))) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Valid item ID is required',
      });
    }
    
    const item = await pricingService.getPricingItem(parseInt(itemId));
    
    if (!item) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Pricing item not found',
      });
    }
    
    res.json({
      success: true,
      data: item,
    });
  } catch (error) {
    console.error('Error fetching pricing item:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch pricing item',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get all pricing items (admin)
 * GET /api/pricing/items
 * Query params: category_id, pricing_mode, is_active
 */
exports.getAllPricingItems = async (req, res) => {
  try {
    const { category_id, pricing_mode, is_active } = req.query;
    
    const filters = {};
    if (category_id) filters.category_id = parseInt(category_id);
    if (pricing_mode) filters.pricing_mode = pricing_mode;
    if (is_active !== undefined) filters.is_active = is_active === 'true' ? 1 : 0;
    
    const items = await pricingService.getAllPricingItems(filters);
    
    res.json({
      success: true,
      data: items,
      count: items.length,
    });
  } catch (error) {
    console.error('Error fetching all pricing items:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch pricing items',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get example pricing breakdown (for testing/documentation)
 * GET /api/pricing/example
 */
exports.getPricingExample = async (req, res) => {
  try {
    // Get catalog to find some sample items
    const catalog = await pricingService.getCatalog('general');
    
    // Find a few sample items
    const sampleItems = [];
    for (const category of catalog) {
      if (category.items && category.items.length > 0) {
        sampleItems.push({
          item_id: category.items[0].item_id,
          quantity: 1,
        });
        if (sampleItems.length >= 3) break;
      }
    }
    
    // Calculate example quote
    const quote = await pricingService.calculateQuote({
      items: sampleItems,
      shootHours: 3,
      eventType: 'corporate',
    });
    
    res.json({
      success: true,
      data: {
        description: 'Example pricing calculation with 3 sample items for a 3-hour corporate shoot',
        quote,
      },
    });
  } catch (error) {
    console.error('Error generating pricing example:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to generate pricing example',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
