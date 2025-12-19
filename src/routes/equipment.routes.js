const express = require('express');
const router = express.Router();
const equipmentController = require('../controllers/equipment.controller');
console.log('✅ equipment.routes.js loaded');

/**
 * Equipment Routes
 * Base path: /api/equipment
 * All routes are public (browse equipment without auth)
 */

/**
 * @route   GET /api/equipment/search
 * @desc    Search equipment with pricing and location
 * @query   category - category_id filter
 * @query   minPrice - minimum rental price per day
 * @query   maxPrice - maximum rental price per day
 * @query   location - location search term
 * @query   available - filter by availability (default: true)
 * @query   page - page number (default: 1)
 * @query   limit - results per page (default: 20)
 * @access  Public
 */
router.get('/search', equipmentController.searchEquipment);

/**
 * @route   GET /api/equipment/categories
 * @desc    Get all equipment categories
 * @access  Public
 */
router.get('/categories', equipmentController.getCategories);

/**
 * @route   GET /api/equipment/by-creator/:creatorId
 * @desc    Get all equipment owned by a creator
 * @param   creatorId - crew_member_id of the creator/owner
 * @access  Public
 */
router.get('/by-creator/:creatorId', equipmentController.getByCreator);

/**
 * @route   GET /api/equipment/:id
 * @desc    Get equipment by ID with full details
 * @param   id - equipment_id
 * @access  Public
 */
router.get('/:id', equipmentController.getEquipmentById);

module.exports = router;
