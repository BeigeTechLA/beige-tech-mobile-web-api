const express = require('express');
const router = express.Router();

const studio = require('../controllers/studio.controller');
const { optionalAuth } = require('../middleware/auth');

const multer = require('multer');
const path = require('path');

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, path.join(__dirname, '../public/uploads/media')),
        filename: (req, file, cb) => cb(null, Date.now() + Math.round(Math.random() * 1e9) + path.extname(file.originalname))
    })
});

// ── Create ────────────────────────────────────────────────────────────────────
router.post('/create', optionalAuth, studio.createStudio);
router.post('/upload', studio.uploadMedia);

router.post('/requests', optionalAuth, studio.createStudioRequest);
router.get('/requests', optionalAuth, studio.getStudioRequests);
router.put('/requests/:request_id', optionalAuth, studio.updateStudioRequestStatus);
router.delete('/requests/:request_id', optionalAuth, studio.deleteStudioRequest);

router.post('/:studio_id/address', optionalAuth, studio.saveAddress);
router.post('/:studio_id/info', optionalAuth, studio.saveInfo);
router.post('/:studio_id/facilities', optionalAuth, studio.saveFacilities);
router.post('/:studio_id/media', optionalAuth, studio.saveMedia);
router.post('/:studio_id/details', optionalAuth, studio.saveDetails);
router.post('/:studio_id/hours', optionalAuth, studio.saveHoursAndRules);
router.post('/:studio_id/budget', optionalAuth, studio.saveBudget);
router.post('/:studio_id/policies', optionalAuth, studio.savePolicies); 
router.get('/user/:user_id', optionalAuth, studio.getStudiosByUser);
router.get('/:studio_id', optionalAuth, studio.getStudioById);
router.put('/:studio_id', optionalAuth, studio.updateStudio);
router.delete('/:studio_id', optionalAuth, studio.deleteStudio);
//operations
router.get('/:studio_id/operations/overview', optionalAuth, studio.getOverview);
router.get('/:studio_id/operations/bookings', optionalAuth, studio.getBookings);
router.get('/:studio_id/operations/ledger', optionalAuth, studio.getLedger);
router.post('/:studio_id/operations/bookings', optionalAuth, studio.createBooking);
router.put('/:studio_id/operations/bookings/:booking_id', optionalAuth, studio.updateBookingStatus);


module.exports = router;