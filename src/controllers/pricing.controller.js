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

/**
 * Calculate pricing from selected creators
 * POST /api/pricing/calculate-from-creators
 * Body: {
 *   creator_ids: [1, 2, 3],
 *   shoot_hours: number,
 *   event_type: string,
 *   add_on_items: [{item_id, quantity}] (optional)
 * }
 */
exports.calculateFromCreators = async (req, res) => {
  try {
    const { creator_ids, shoot_hours, event_type, add_on_items = [] } = req.body;

    if (!creator_ids || !Array.isArray(creator_ids) || creator_ids.length === 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'creator_ids must be a non-empty array'
      });
    }

    if (shoot_hours === undefined || shoot_hours < 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'shoot_hours is required and must be non-negative'
      });
    }

    const db = require('../models');
    const creators = await db.crew_members.findAll({
      where: {
        crew_member_id: creator_ids,
        is_active: 1
      },
      attributes: ['crew_member_id', 'first_name', 'last_name', 'primary_role', 'hourly_rate']
    });

    if (creators.length !== creator_ids.length) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'One or more creator IDs are invalid'
      });
    }

    const ROLE_TO_ITEM_MAP = {
      1: 11,  // Videographer
      2: 10,  // Photographer
      3: 11,  // Videographer (alternate)
      4: 10,  // Photographer (alternate)
      9: 11,  // e.g., Lead Videographer -> Item 11
      10: 10, // e.g., Lead Photographer -> Item 10
      11: 11  // e.g., Cinematographer -> Item 11
    };

    const roleCounts = {};
    creators.forEach(creator => {
      let roles = creator.primary_role;

      if (typeof roles === 'string' && (roles.startsWith('[') || roles.startsWith('{'))) {
        try {
          roles = JSON.parse(roles);
        } catch (e) {
          console.error("Failed to parse role JSON string:", roles);
        }
      }

      const rolesArray = Array.isArray(roles) ? roles : [roles];

      rolesArray.forEach(roleId => {
        const parsedId = parseInt(roleId);
        if (!isNaN(parsedId)) {
          roleCounts[parsedId] = (roleCounts[parsedId] || 0) + 1;
        }
      });
    });

    const pricingItems = [];
    Object.entries(roleCounts).forEach(([roleId, count]) => {
      const itemId = ROLE_TO_ITEM_MAP[parseInt(roleId)];
      if (itemId) {
        pricingItems.push({
          item_id: itemId,
          quantity: count
        });
      } else {
        console.warn(`Warning: role_id ${roleId} has no mapping in ROLE_TO_ITEM_MAP`);
      }
    });

    if (pricingItems.length === 0 && add_on_items.length === 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'No valid pricing items could be generated from selected creators'
      });
    }

    const allItems = [...pricingItems, ...add_on_items];

    // Calculate quote using existing service
    // Extract skip flags from request body
    const { skip_discount = false, skip_margin = false } = req.body;
    
    const quote = await pricingService.calculateQuote({
      items: allItems,
      shootHours: parseFloat(shoot_hours),
      eventType: event_type,
      skipDiscount: skip_discount,
      skipMargin: skip_margin,
    });

    const creatorDetails = creators.map(c => ({
      crew_member_id: c.crew_member_id,
      name: `${c.first_name} ${c.last_name}`,
      role_id: c.primary_role, 
      hourly_rate: parseFloat(c.hourly_rate || 0)
    }));

    res.json({
      success: true,
      data: {
        quote: {
          ...quote,
          creators: creatorDetails
        }
      }
    });

  } catch (error) {
    console.error('Error calculating pricing from creators:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to calculate pricing from creators',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};