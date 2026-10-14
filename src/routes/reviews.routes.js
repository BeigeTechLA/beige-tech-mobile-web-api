const express = require('express');
const router = express.Router();
const reviewsController = require('../controllers/reviews.controller');
const { authenticate } = require('../middleware/auth.middleware');
console.log('✅ reviews.routes.js loaded');

/**
 * Reviews Routes
 * Base path: /api/reviews
 */

/**
 * @route   GET /api/reviews/by-creator/:creatorId
 * @desc    Get reviews for a specific creator
 * @param   creatorId - crew_member_id of the creator
 * @query   limit - number of reviews to return (default: 5)
 * @access  Public
 */
router.get('/by-creator/:creatorId', reviewsController.getByCreator);

/**
 * @route   POST /api/reviews/by-creator/:creatorId
 * @desc    Create a review for a creator
 * @param   creatorId - crew_member_id of the creator
 * @body    { rating, review_text?, shoot_date? }
 * @access  Authenticated client
 */
router.post('/by-creator/:creatorId', authenticate, reviewsController.createReview);

module.exports = router;
