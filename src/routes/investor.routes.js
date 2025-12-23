const express = require('express');
const router = express.Router();
const investorController = require('../controllers/investor.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

/**
 * @route   POST /api/investors
 * @desc    Submit investor interest form
 * @access  Public
 */
router.post('/', investorController.submitInvestorInterest);

/**
 * @route   GET /api/investors
 * @desc    Get all investor submissions (admin only)
 * @access  Private (Admin)
 */
router.get('/', authenticate, authorize('admin'), investorController.getInvestors);

/**
 * @route   GET /api/investors/:id
 * @desc    Get single investor by ID (admin only)
 * @access  Private (Admin)
 */
router.get('/:id', authenticate, authorize('admin'), investorController.getInvestorById);

/**
 * @route   PATCH /api/investors/:id/status
 * @desc    Update investor status (admin only)
 * @access  Private (Admin)
 */
router.patch('/:id/status', authenticate, authorize('admin'), investorController.updateInvestorStatus);

module.exports = router;


