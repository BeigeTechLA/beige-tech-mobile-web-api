const express = require('express');
const router = express.Router();
const controller = require('../controllers/shift-management.controller');
const { authenticate, requireSalesRepOrAdmin } = require('../middleware/auth.middleware');

// Read-only immutable audit log. No create/update/delete routes.
router.get('/', authenticate, requireSalesRepOrAdmin, controller.assignmentHistory);

module.exports = router;
