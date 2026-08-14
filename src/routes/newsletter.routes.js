const express = require('express');
const router = express.Router();
const newsletterController = require('../controllers/newsletter.controller');

/**
 * @route   POST /v1/newsletter/subscribe
 * @desc    Send newsletter subscription notification email
 * @access  Public
 */
router.post('/subscribe', newsletterController.subscribeToNewsletter);

module.exports = router;
