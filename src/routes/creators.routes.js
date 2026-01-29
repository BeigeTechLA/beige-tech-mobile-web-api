const express = require('express');
const router = express.Router();
const creatorsController = require('../controllers/creators.controller');

/**
 * Creator Search & Discovery Routes
 * Base path: /api/creators
 * All routes are public (no authentication required for browsing)
 */

/**
 * @route   GET /api/creators/search
 * @desc    Search creators with filters
 * @query   budget - max hourly rate
 * @query   location - location search term
 * @query   skills - skills search term
 * @query   content_type - role_id for filtering by role
 * @query   page - page number (default: 1)
 * @query   limit - results per page (default: 20)
 * @access  Public
 */
router.get('/search', creatorsController.searchCreators);

/**
 * @route   GET /api/creators/random
 * @desc    Get random creators (fallback for no search results)
 * @query   limit - number of creators to return (default: 10, max: 20)
 * @access  Public
 */
router.get('/random', creatorsController.getRandomCreators);

/**
 * @route   GET /api/creators/:id
 * @desc    Get full creator profile
 * @param   id - crew_member_id
 * @access  Public
 */
router.get('/:id', creatorsController.getCreatorProfile);

/**
 * @route   GET /api/creators/:id/portfolio
 * @desc    Get creator portfolio items
 * @param   id - crew_member_id
 * @query   page - page number (default: 1)
 * @query   limit - results per page (default: 12)
 * @access  Public
 */
router.get('/:id/portfolio', creatorsController.getCreatorPortfolio);

/**
 * @route   GET /api/creators/:id/reviews
 * @desc    Get creator reviews and ratings
 * @param   id - crew_member_id
 * @query   page - page number (default: 1)
 * @query   limit - results per page (default: 10)
 * @access  Public
 */
router.get('/:id/reviews', creatorsController.getCreatorReviews);

module.exports = router;
