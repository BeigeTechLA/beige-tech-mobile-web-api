const express = require('express');
const router = express.Router();
const pricingController = require('../controllers/pricing.controller');
const { authenticate, optionalAuth } = require('../middleware/auth.middleware');

/**
 * Pricing Routes
 * Base path: /api/pricing
 */

/**
 * @route   GET /api/pricing/catalog
 * @desc    Get the full pricing catalog with categories and items
 * @query   mode - 'general', 'wedding', or omit for all items
 * @query   event_type - Event type to auto-determine mode
 * @access  Public
 */
router.get('/catalog', pricingController.getCatalog);

/**
 * @route   GET /api/pricing/discounts
 * @desc    Get discount tiers for a pricing mode
 * @query   mode - 'general' or 'wedding' (default: 'general')
 * @access  Public
 */
router.get('/discounts', pricingController.getDiscountTiers);

/**
 * @route   POST /api/pricing/calculate
 * @desc    Calculate a quote from selected items
 * @body    items - Array of {item_id, quantity}
 * @body    shootHours - Number of shoot hours
 * @body    eventType - Event type (for auto pricing mode)
 * @body    marginPercent - Optional margin override
 * @access  Public
 */
router.post('/calculate', pricingController.calculateQuote);

/**
 * @route   POST /api/pricing/quotes
 * @desc    Save a quote to the database
 * @body    items - Array of {item_id, quantity}
 * @body    shootHours - Number of shoot hours
 * @body    eventType - Event type
 * @body    guestEmail - Guest email (optional)
 * @body    bookingId - Linked booking ID (optional)
 * @body    notes - Additional notes (optional)
 * @access  Public (user ID captured if authenticated)
 */
router.post('/quotes', optionalAuth, pricingController.saveQuote);

/**
 * @route   GET /api/pricing/quotes/:quoteId
 * @desc    Get a saved quote by ID
 * @param   quoteId - Quote ID
 * @access  Public
 */
router.get('/quotes/:quoteId', pricingController.getQuote);

/**
 * @route   GET /api/pricing/items
 * @desc    Get all pricing items (for admin)
 * @query   category_id - Filter by category
 * @query   pricing_mode - Filter by mode ('general', 'wedding')
 * @query   is_active - Filter by active status
 * @access  Public (can add auth for admin-only later)
 */
router.get('/items', pricingController.getAllPricingItems);

/**
 * @route   GET /api/pricing/items/:itemId
 * @desc    Get a single pricing item by ID
 * @param   itemId - Pricing item ID
 * @access  Public
 */
router.get('/items/:itemId', pricingController.getPricingItem);

/**
 * @route   GET /api/pricing/example
 * @desc    Get an example pricing calculation
 * @access  Public
 */
router.get('/example', pricingController.getPricingExample);

/**
 * @route   POST /api/pricing/calculate-from-creators
 * @desc    Calculate pricing based on selected creators
 * @body    creator_ids - Array of creator/crew member IDs
 * @body    shoot_hours - Number of shoot hours
 * @body    event_type - Event type (for auto pricing mode)
 * @body    add_on_items - Optional array of additional pricing items {item_id, quantity}
 * @access  Public
 */
router.post('/calculate-from-creators', pricingController.calculateFromCreators);

module.exports = router;
