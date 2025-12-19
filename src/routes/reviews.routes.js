const express = require('express');
const router = express.Router();
const reviewsController = require('../controllers/reviews.controller');
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
 * @body    { user_id?, rating, review_text?, shoot_date? }
 * @access  Public (consider adding auth in future)
 */
router.post('/by-creator/:creatorId', reviewsController.createReview);

module.exports = router;
