const express = require('express');
const router = express.Router();

// API Info endpoint
router.get('/', (req, res) => {
  res.json({
    service: 'Revure V2 Backend API',
    version: '2.0.0',
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      health: '/health',
      auth: '/v1/auth/*',
      users: '/v1/users/*',
      creators: '/v1/creators/*',
      equipment: '/v1/equipment/*',
      pricing: '/v1/pricing/*',
      projects: '/v1/projects/*',
      bookings: '/v1/bookings/*',
      payments: '/v1/payments/*',
      waitlist: '/v1/waitlist/*'
    }
  });
});

// Mount route modules
router.use('/auth', require('./auth.routes'));
// router.use('/users', require('./user.routes'));
router.use('/creators', require('./creators.routes'));
router.use('/equipment', require('./equipment.routes'));
router.use('/pricing', require('./pricing.routes'));
// router.use('/projects', require('./project.routes'));
router.use('/bookings', require('./bookings.routes'));
router.use('/payments', require('./payments.routes'));
router.use('/waitlist', require('./waitlist.routes'));

module.exports = router;
