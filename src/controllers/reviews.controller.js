const { crew_member_reviews, crew_members, users } = require('../models');
const { Op } = require('sequelize');
const constants = require('../utils/constants');

/**
 * Get reviews by creator
 * GET /api/reviews/by-creator/:creatorId
 * Query params: limit (default: 5)
 */
exports.getByCreator = async (req, res) => {
  try {
    const { creatorId } = req.params;
    const { limit = 5 } = req.query;

    const reviews = await crew_member_reviews.findAll({
      where: {
        crew_member_id: parseInt(creatorId)
      },
      include: [
        {
          model: users,
          as: 'user',
          attributes: ['name'],
          required: false
        }
      ],
      attributes: [
        'review_id',
        'rating',
        'review_text',
        'shoot_date',
        'created_at',
        'user_id'
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit)
    });

    const transformedReviews = reviews.map(review => {
      const reviewData = review.toJSON();
      return {
        review_id: reviewData.review_id,
        user_name: reviewData.user ? reviewData.user.name : 'Anonymous',
        rating: reviewData.rating,
        review_text: reviewData.review_text,
        shoot_date: reviewData.shoot_date,
        created_at: reviewData.created_at
      };
    });

    res.json({
      success: true,
      data: transformedReviews
    });

  } catch (error) {
    console.error('Error fetching reviews by creator:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch reviews',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Create a review for a creator
 * POST /api/reviews/by-creator/:creatorId
 * Body: { user_id?, rating, review_text?, shoot_date? }
 */
exports.createReview = async (req, res) => {
  try {
    const { creatorId } = req.params;
    const { user_id, rating, review_text, shoot_date } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    const creator = await crew_members.findOne({
      where: { crew_member_id: parseInt(creatorId), is_active: 1 }
    });

    if (!creator) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Creator not found'
      });
    }

    const newReview = await crew_member_reviews.create({
      crew_member_id: parseInt(creatorId),
      user_id: user_id || null,
      rating: parseInt(rating),
      review_text: review_text || null,
      shoot_date: shoot_date || null
    });

    res.status(201).json({
      success: true,
      data: {
        review_id: newReview.review_id,
        crew_member_id: newReview.crew_member_id,
        rating: newReview.rating,
        review_text: newReview.review_text,
        shoot_date: newReview.shoot_date,
        created_at: newReview.created_at
      },
      message: 'Review created successfully'
    });

  } catch (error) {
    console.error('Error creating review:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to create review',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = exports;
