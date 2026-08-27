const express = require('express');
const router = express.Router();
const controller = require('../controllers/shift-management.controller');
const { authenticate, requireSalesRepOrAdmin } = require('../middleware/auth.middleware');

router.get('/:id/leads', authenticate, requireSalesRepOrAdmin, controller.salesRepLeads);
router.get('/:id/quotes', authenticate, requireSalesRepOrAdmin, controller.salesRepQuotes);

module.exports = router;
