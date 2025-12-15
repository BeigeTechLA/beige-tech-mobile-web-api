# Authentication Middleware Usage Guide

## Available Middleware

### 1. authenticate
Requires valid JWT token. Rejects requests without valid authentication.

**Use for:** Protected endpoints that require user to be logged in

**Adds to request:**
- `req.userId` - User's database ID
- `req.userRole` - User's role (client, sales_rep, creator, admin)

### 2. authorize(...roles)
Restricts access to specific user roles. Must be used with `authenticate`.

**Use for:** Role-based access control

**Parameters:** Variable list of allowed roles

### 3. optionalAuth
Attaches user info if token exists but doesn't require it.

**Use for:** Endpoints that personalize based on user but also work anonymously

## Basic Usage Examples

### Protected Route (Login Required)
```javascript
const { authenticate } = require('../middleware/auth.middleware');

// Only authenticated users can access
router.get('/bookings', authenticate, (req, res) => {
  const userId = req.userId;
  const userRole = req.userRole;

  // Fetch user's bookings
  res.json({ userId, userRole });
});
```

### Role-Based Access
```javascript
const { authenticate, authorize } = require('../middleware/auth.middleware');

// Only admins can access
router.delete('/users/:id',
  authenticate,
  authorize('admin'),
  (req, res) => {
    // Delete user logic
    res.json({ message: 'User deleted' });
  }
);

// Creators and admins can access
router.get('/equipment',
  authenticate,
  authorize('creator', 'admin'),
  (req, res) => {
    // Get equipment list
    res.json({ equipment: [] });
  }
);
```

### Optional Authentication
```javascript
const { optionalAuth } = require('../middleware/auth.middleware');

// Works both authenticated and anonymous
router.get('/creators', optionalAuth, (req, res) => {
  // If authenticated, can show personalized data
  if (req.userId) {
    // Return personalized creator list
    return res.json({ personalized: true, userId: req.userId });
  }

  // Return public creator list
  res.json({ personalized: false });
});
```

## Complete Route Examples

### User Routes
```javascript
// src/routes/user.routes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// Get current user profile (any authenticated user)
router.get('/profile', authenticate, userController.getProfile);

// Update current user profile (any authenticated user)
router.put('/profile', authenticate, userController.updateProfile);

// List all users (admin only)
router.get('/',
  authenticate,
  authorize('admin'),
  userController.listUsers
);

// Update any user (admin only)
router.put('/:id',
  authenticate,
  authorize('admin'),
  userController.updateUser
);

// Delete user (admin only)
router.delete('/:id',
  authenticate,
  authorize('admin'),
  userController.deleteUser
);

module.exports = router;
```

### Booking Routes
```javascript
// src/routes/booking.routes.js
const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/booking.controller');
const { authenticate, authorize, optionalAuth } = require('../middleware/auth.middleware');

// Create booking (clients and sales_reps)
router.post('/',
  authenticate,
  authorize('client', 'sales_rep'),
  bookingController.createBooking
);

// View own bookings (all authenticated users)
router.get('/my-bookings',
  authenticate,
  bookingController.getMyBookings
);

// Accept/reject booking (creators only)
router.patch('/:id/accept',
  authenticate,
  authorize('creator'),
  bookingController.acceptBooking
);

router.patch('/:id/reject',
  authenticate,
  authorize('creator'),
  bookingController.rejectBooking
);

// View all bookings (admins and sales_reps)
router.get('/',
  authenticate,
  authorize('admin', 'sales_rep'),
  bookingController.getAllBookings
);

// Cancel booking (clients, sales_reps, admins)
router.delete('/:id',
  authenticate,
  authorize('client', 'sales_rep', 'admin'),
  bookingController.cancelBooking
);

module.exports = router;
```

### Creator Routes
```javascript
// src/routes/creator.routes.js
const express = require('express');
const router = express.Router();
const creatorController = require('../controllers/creator.controller');
const { authenticate, authorize, optionalAuth } = require('../middleware/auth.middleware');

// Public: Browse creators (personalized if logged in)
router.get('/', optionalAuth, creatorController.listCreators);

// Public: View creator profile
router.get('/:id', optionalAuth, creatorController.getCreatorProfile);

// Protected: Update own creator profile (creators only)
router.put('/profile',
  authenticate,
  authorize('creator'),
  creatorController.updateProfile
);

// Protected: Manage portfolio (creators only)
router.post('/portfolio',
  authenticate,
  authorize('creator'),
  creatorController.addPortfolioItem
);

router.delete('/portfolio/:id',
  authenticate,
  authorize('creator'),
  creatorController.deletePortfolioItem
);

// Admin: Approve creator accounts
router.patch('/:id/approve',
  authenticate,
  authorize('admin'),
  creatorController.approveCreator
);

module.exports = router;
```

### Equipment Routes
```javascript
// src/routes/equipment.routes.js
const express = require('express');
const router = express.Router();
const equipmentController = require('../controllers/equipment.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// View equipment (creators and admins)
router.get('/',
  authenticate,
  authorize('creator', 'admin'),
  equipmentController.listEquipment
);

// Add equipment (creators for own, admins for all)
router.post('/',
  authenticate,
  authorize('creator', 'admin'),
  equipmentController.addEquipment
);

// Update equipment
router.put('/:id',
  authenticate,
  authorize('creator', 'admin'),
  equipmentController.updateEquipment
);

// Delete equipment (admin only)
router.delete('/:id',
  authenticate,
  authorize('admin'),
  equipmentController.deleteEquipment
);

module.exports = router;
```

## Controller Access Patterns

### Using User ID in Controllers
```javascript
// controllers/booking.controller.js
exports.createBooking = async (req, res) => {
  try {
    // Access authenticated user's ID
    const userId = req.userId;
    const userRole = req.userRole;

    const bookingData = {
      ...req.body,
      client_id: userId,
      created_by_role: userRole
    };

    const booking = await Booking.create(bookingData);

    res.status(201).json({
      success: true,
      booking
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
```

### Role-Based Logic in Controllers
```javascript
// controllers/booking.controller.js
exports.getAllBookings = async (req, res) => {
  try {
    const { userId, userRole } = req;

    let whereClause = {};

    // Sales reps see all bookings
    if (userRole === 'sales_rep') {
      // No restriction
    }
    // Admins see everything (no restriction)
    else if (userRole === 'admin') {
      // No restriction
    }

    const bookings = await Booking.findAll({ where: whereClause });

    res.json({
      success: true,
      bookings,
      viewedBy: userRole
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
```

### Optional Auth in Controllers
```javascript
// controllers/creator.controller.js
exports.listCreators = async (req, res) => {
  try {
    const userId = req.userId; // May be undefined

    let options = {
      where: { is_active: 1 }
    };

    // If user is logged in, show personalized results
    if (userId) {
      // Include favorites, recommendations, etc.
      options.include = [{
        model: Favorite,
        where: { user_id: userId },
        required: false
      }];
    }

    const creators = await Creator.findAll(options);

    res.json({
      success: true,
      creators,
      personalized: !!userId
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
```

## Permission Checking Utility

### Create Permission Helper
```javascript
// utils/permissions.js
const PERMISSIONS_MAP = {
  client: [
    'view_creators',
    'create_booking',
    'view_bookings',
    'update_booking',
    'cancel_booking',
    'view_profile',
    'update_profile'
  ],
  sales_rep: [
    'view_creators',
    'create_booking',
    'view_bookings',
    'update_booking',
    'view_clients',
    'manage_bookings',
    'view_reports',
    'view_profile',
    'update_profile'
  ],
  creator: [
    'view_bookings',
    'accept_booking',
    'reject_booking',
    'view_profile',
    'update_profile',
    'view_equipment',
    'manage_portfolio'
  ],
  admin: [
    'view_all',
    'create_all',
    'update_all',
    'delete_all',
    'manage_users',
    'manage_bookings',
    'manage_creators',
    'manage_equipment',
    'view_reports',
    'manage_permissions'
  ]
};

const hasPermission = (userRole, permission) => {
  const permissions = PERMISSIONS_MAP[userRole] || [];
  return permissions.includes(permission);
};

module.exports = { hasPermission, PERMISSIONS_MAP };
```

### Use in Controllers
```javascript
const { hasPermission } = require('../utils/permissions');

exports.updateBooking = async (req, res) => {
  try {
    const { userId, userRole } = req;
    const { id } = req.params;

    // Check specific permission
    if (!hasPermission(userRole, 'update_booking')) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    // Update booking logic
    const booking = await Booking.findByPk(id);

    // Check ownership (unless admin)
    if (userRole !== 'admin' && booking.client_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Cannot update another user\'s booking'
      });
    }

    await booking.update(req.body);

    res.json({ success: true, booking });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
```

## Error Handling

### Authentication Errors
```javascript
// 401 Unauthorized - No token or invalid token
{
  "success": false,
  "message": "No authentication token provided"
}

{
  "success": false,
  "message": "Invalid token"
}

{
  "success": false,
  "message": "Token expired"
}
```

### Authorization Errors
```javascript
// 403 Forbidden - Valid token but insufficient permissions
{
  "success": false,
  "message": "Insufficient permissions"
}
```

## Testing Middleware

### Test with cURL
```bash
# Without authentication (should fail)
curl http://localhost:5001/v1/bookings

# With authentication
TOKEN="your_jwt_token"
curl http://localhost:5001/v1/bookings \
  -H "Authorization: Bearer $TOKEN"

# With insufficient permissions (should fail)
curl -X DELETE http://localhost:5001/v1/users/123 \
  -H "Authorization: Bearer $CLIENT_TOKEN"
```

### Test with Postman
1. Set Authorization Type: "Bearer Token"
2. Use `{{token}}` variable
3. Update token after login in Tests tab:
```javascript
pm.environment.set("token", pm.response.json().token);
```

## Best Practices

### 1. Always Use authenticate Before authorize
```javascript
// ✅ Correct
router.delete('/resource/:id',
  authenticate,
  authorize('admin'),
  controller.delete
);

// ❌ Wrong - authorize won't have user info
router.delete('/resource/:id',
  authorize('admin'),
  controller.delete
);
```

### 2. Check Ownership in Controllers
```javascript
// Middleware ensures authentication
// Controller ensures authorization logic
exports.updateResource = async (req, res) => {
  const resource = await Resource.findByPk(req.params.id);

  // Check ownership unless admin
  if (req.userRole !== 'admin' && resource.user_id !== req.userId) {
    return res.status(403).json({ message: 'Not authorized' });
  }

  // Update logic
};
```

### 3. Use optionalAuth for Public + Personalized
```javascript
// Public endpoint that benefits from user context
router.get('/creators', optionalAuth, (req, res) => {
  if (req.userId) {
    // Personalized view
  } else {
    // Public view
  }
});
```

### 4. Document Required Roles
```javascript
/**
 * Create booking
 * @route POST /v1/bookings
 * @access Private - client, sales_rep
 */
router.post('/',
  authenticate,
  authorize('client', 'sales_rep'),
  bookingController.create
);
```

## Common Patterns

### Pattern: Resource Ownership Check
```javascript
const checkOwnership = async (req, res, next) => {
  try {
    const resource = await Resource.findByPk(req.params.id);

    if (!resource) {
      return res.status(404).json({ message: 'Not found' });
    }

    // Admin can access any resource
    if (req.userRole === 'admin') {
      req.resource = resource;
      return next();
    }

    // Check ownership
    if (resource.user_id !== req.userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    req.resource = resource;
    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Usage
router.put('/bookings/:id',
  authenticate,
  checkOwnership,
  bookingController.update
);
```

### Pattern: Multi-Role Access with Different Logic
```javascript
router.get('/dashboard',
  authenticate,
  async (req, res) => {
    const { userId, userRole } = req;

    switch (userRole) {
      case 'client':
        // Client dashboard
        return res.json({ bookings: await getClientBookings(userId) });

      case 'creator':
        // Creator dashboard
        return res.json({ requests: await getCreatorRequests(userId) });

      case 'admin':
        // Admin dashboard
        return res.json({ stats: await getAdminStats() });

      default:
        return res.status(403).json({ message: 'Invalid role' });
    }
  }
);
```

## Debugging Tips

### 1. Log User Context
```javascript
router.use((req, res, next) => {
  if (req.userId) {
    console.log(`User ${req.userId} (${req.userRole}) accessing ${req.path}`);
  }
  next();
});
```

### 2. Verify Token
```javascript
const jwt = require('jsonwebtoken');

// Decode without verifying (for debugging only)
const decoded = jwt.decode(token);
console.log('Token payload:', decoded);
```

### 3. Test Permission Matrix
```javascript
const testPermissions = () => {
  const roles = ['client', 'sales_rep', 'creator', 'admin'];
  const permission = 'update_booking';

  roles.forEach(role => {
    console.log(`${role}: ${hasPermission(role, permission)}`);
  });
};
```
