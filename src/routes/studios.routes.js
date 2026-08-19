const express = require('express');
const router = express.Router();
const studioCatalogController = require('../controllers/studio-catalog.controller');

router.get('/catalog', studioCatalogController.getPublicStudioCatalog);
router.get('/catalog/:slugOrId', studioCatalogController.getPublicStudioBySlugOrId);
router.get('/:slugOrId/booked-slots', studioCatalogController.getPublicStudioBookedSlots);

module.exports = router;
