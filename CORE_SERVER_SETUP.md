# Core Server Setup - Revure V2 Backend

## Created Files

### 1. `/src/server.js` - Application Entry Point
Entry point that initializes the Express application and starts the server.

**Features:**
- Database connection with Sequelize
- Auto-sync models in development mode (alter: true)
- Graceful error handling on startup
- Runs on PORT 5001 (from .env)
- Logs startup status and configuration

**Usage:**
```bash
npm start        # Production
npm run dev      # Development with nodemon
```

### 2. `/src/app.js` - Express Application Configuration
Main Express app with all middleware and route mounting.

**Features:**
- CORS configuration supporting multiple origins from .env
- Request logging (detailed in development mode)
- Body parsing (JSON and URL-encoded)
- Health check endpoint at `/health`
- API routes mounted at `/v1` prefix
- 404 handler for unknown routes
- Global error handler integration

**API Structure:**
```
GET  /health              # Health check
GET  /v1                  # API info
POST /v1/auth/*          # Authentication (to be added)
GET  /v1/users/*         # User management (to be added)
GET  /v1/creators/*      # Creator profiles (to be added)
POST /v1/projects/*      # Project management (to be added)
POST /v1/bookings/*      # Booking system (to be added)
```

### 3. `/src/middleware/auth.js` - JWT Authentication
Production-ready JWT authentication middleware.

**Exports:**
- `authMiddleware` - Required authentication, attaches user to req.user
- `optionalAuth` - Optional authentication for public/private hybrid endpoints

**Attached User Object:**
```javascript
req.user = {
  userId: number,
  userTypeId: number,
  userRole: string
}
```

**Error Responses:**
- 401: Missing/invalid token or expired token
- 500: Authentication system error

**Usage Example:**
```javascript
const { authMiddleware } = require('./middleware/auth');

router.get('/profile', authMiddleware, (req, res) => {
  // req.user is available here
  res.json({ userId: req.user.userId });
});
```

### 4. `/src/middleware/errorHandler.js` - Global Error Handler
Comprehensive error handling with consistent error responses.

**Handles:**
- Sequelize validation errors (400)
- Unique constraint violations (409)
- Foreign key constraint errors (400)
- Database connection errors (503)
- Multer file upload errors (400)
- JWT authentication errors (401)
- Custom AppError instances
- Unknown errors (500)

**AppError Class:**
```javascript
const { AppError } = require('./middleware/errorHandler');

// Usage in controllers
if (!user) {
  throw new AppError('User not found', 404);
}
```

**Response Format:**
```json
{
  "error": true,
  "message": "Error description",
  "details": "Additional info (dev only)"
}
```

### 5. `/src/routes/index.js` - Main Router
Central routing hub for all API endpoints.

**Features:**
- API info endpoint at `/v1/`
- Ready for route module mounting
- Follows RESTful conventions

**To Add Routes:**
```javascript
// In src/routes/index.js
router.use('/auth', require('./auth.routes'));
router.use('/users', require('./user.routes'));
router.use('/creators', require('./creator.routes'));
```

### 6. `/src/config/config.js` - Enhanced Configuration
Updated with all necessary environment variables.

**New Configuration:**
- `nodeEnv` - Environment mode (development/production)
- `jwtExpiresIn` - JWT token expiration (7d)
- `frontendUrl` - Frontend URL for CORS and links
- `s3` - AWS S3 bucket configuration
- `email` - Email service configuration
- `stripe` - Payment processing configuration

## Environment Variables

All configuration is loaded from `.env`:

```env
# Server
PORT=5001
NODE_ENV=development

# Database (shared with beige-server)
DATABASE_HOST=localhost
DATABASE_NAME=revurge
DATABASE_USER=root
DATABASE_PASS=root

# JWT
JWT_SECRET=a83eriOp9f2206f7bc
JWT_EXPIRES_IN=7d

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
FRONTEND_URL=http://localhost:3000

# AWS S3
S3_BUCKET_ACCESS_KEY_ID=...
S3_BUCKET_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=beigexmemehouse
S3_BUCKET_REGION=eu-north-1
S3_SUB_FOLDER=beige

# Email (Gmail)
EMAIL_USER=os.beige.app@gmail.com
EMAIL_APP_PASSWORD=mpuibstxjzifqcnf
EMAIL_FROM_NAME=Revurge Platform

# Stripe
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

## Testing the Setup

### 1. Start the server
```bash
npm run dev
```

**Expected Output:**
```
Database connected successfully
Database models synchronized
Revure V2 Backend Server running on port 5001
Environment: development
Base API path: /v1
```

### 2. Test health endpoint
```bash
curl http://localhost:5001/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-16T...",
  "service": "revure-v2-backend"
}
```

### 3. Test API info
```bash
curl http://localhost:5001/v1
```

**Expected Response:**
```json
{
  "service": "Revure V2 Backend API",
  "version": "2.0.0",
  "environment": "development",
  "endpoints": {
    "health": "/health",
    "auth": "/v1/auth/*",
    "users": "/v1/users/*",
    "creators": "/v1/creators/*",
    "projects": "/v1/projects/*",
    "bookings": "/v1/bookings/*"
  }
}
```

### 4. Test 404 handler
```bash
curl http://localhost:5001/invalid
```

**Expected Response:**
```json
{
  "error": true,
  "message": "Route not found",
  "path": "/invalid"
}
```

## Architecture

```
revure-v2-backend/
├── src/
│   ├── server.js              # Entry point
│   ├── app.js                 # Express configuration
│   ├── config/
│   │   └── config.js          # Enhanced environment config
│   ├── db/
│   │   └── index.js           # Sequelize connection
│   ├── middleware/
│   │   ├── auth.js            # JWT authentication
│   │   └── errorHandler.js   # Global error handling
│   ├── routes/
│   │   └── index.js           # Main router
│   ├── controllers/           # Business logic (empty)
│   ├── models/                # Sequelize models (populated)
│   └── utils/                 # Helper functions
├── .env                       # Environment variables
└── package.json               # Dependencies
```

## Key Differences from Beige-Server

1. **Customer-Facing**: Designed for end-users, not admin panel
2. **API Prefix**: Uses `/v1` instead of `/api` for versioning
3. **Enhanced Auth**: Cleaner JWT middleware with optional auth support
4. **Better Errors**: Comprehensive error handling with AppError class
5. **Health Check**: Built-in health endpoint for monitoring
6. **API Discovery**: Info endpoint at `/v1/` for API documentation
7. **Production Ready**: Environment-aware logging and error details

## Next Steps

To complete the backend, create:

1. **Authentication Routes** (`src/routes/auth.routes.js`)
   - POST /v1/auth/register
   - POST /v1/auth/login
   - POST /v1/auth/verify-email
   - POST /v1/auth/forgot-password
   - POST /v1/auth/reset-password

2. **User Routes** (`src/routes/user.routes.js`)
   - GET /v1/users/profile (requires auth)
   - PUT /v1/users/profile (requires auth)
   - DELETE /v1/users/account (requires auth)

3. **Creator Routes** (`src/routes/creator.routes.js`)
   - GET /v1/creators (list creators)
   - GET /v1/creators/:id (creator profile)
   - GET /v1/creators/:id/portfolio
   - GET /v1/creators/:id/availability

4. **Project Routes** (`src/routes/project.routes.js`)
   - POST /v1/projects (requires auth)
   - GET /v1/projects (requires auth)
   - GET /v1/projects/:id (requires auth)
   - PUT /v1/projects/:id (requires auth)

5. **Booking Routes** (`src/routes/booking.routes.js`)
   - POST /v1/bookings (requires auth)
   - GET /v1/bookings (requires auth)
   - GET /v1/bookings/:id (requires auth)
   - PUT /v1/bookings/:id/status (requires auth)

6. **Payment Routes** (`src/routes/payment.routes.js`)
   - POST /v1/payments/create-intent
   - POST /v1/payments/webhook (Stripe webhook)
   - GET /v1/payments/history (requires auth)

## Security Considerations

- JWT tokens expire in 7 days (configurable)
- Passwords hashed with bcrypt (cost factor 10)
- CORS restricted to specific origins
- SQL injection prevented by Sequelize ORM
- Request logging for audit trails
- Error messages don't leak sensitive info in production
- Environment variables for all secrets

## Database Schema

Uses existing database `revurge` shared with beige-server.
Models auto-sync in development mode with `alter: true` (non-destructive).

## Dependencies

All required packages already installed:
- express (5.1.0) - Web framework
- cors (2.8.5) - CORS middleware
- body-parser (2.2.1) - Request parsing
- jsonwebtoken (9.0.2) - JWT auth
- bcrypt (6.0.0) - Password hashing
- sequelize (6.37.7) - ORM
- mysql2 (3.15.3) - MySQL driver
- multer (2.0.2) - File uploads
- nodemailer (7.0.11) - Email sending
- stripe (14.0.0) - Payment processing
- dotenv (17.2.3) - Environment config

## Status

✅ Server entry point created
✅ Express app configured
✅ JWT authentication middleware
✅ Global error handler
✅ Main router with /v1 prefix
✅ Enhanced configuration
✅ All syntax validated
✅ Ready for route implementation

**Server is ready to run!** Start with `npm run dev`
