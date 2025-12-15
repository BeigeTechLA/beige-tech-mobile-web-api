# Authentication System Documentation

## Overview
The Revure V2 authentication system provides JWT-based authentication with role-based access control (RBAC). It supports four user roles: client, sales_rep, creator, and admin.

## Architecture

### Components
1. **auth.controller.js** - Authentication business logic
2. **auth.routes.js** - Route definitions
3. **auth.middleware.js** - JWT verification and authorization
4. **seedUserTypes.js** - Database seeding for user roles

### Database Models
- **users** - User account information
- **user_type** - Role definitions (client, sales_rep, creator, admin)

## API Endpoints

### Public Endpoints (No Authentication Required)

#### 1. Register User
```
POST /v1/auth/register
```
Creates a new user account with specified role.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone_number": "+1234567890",
  "instagram_handle": "@johndoe",
  "password": "SecurePass123!",
  "role": "client"
}
```

**Response:**
```json
{
  "success": true,
  "user": { ... },
  "token": "jwt_token",
  "refreshToken": "refresh_token",
  "permissions": ["array", "of", "permissions"]
}
```

#### 2. Login
```
POST /v1/auth/login
```
Authenticates user with email and password.

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "SecurePass123!"
}
```

#### 3. Quick Register
```
POST /v1/auth/quick-register
```
Fast registration during booking flow. Creates client account with temporary password.

**Request Body:**
```json
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "phone_number": "+1987654321"
}
```

#### 4. Get Role Permissions
```
GET /v1/auth/permissions/:role
```
Returns permission array for specified role.

**Example:** `GET /v1/auth/permissions/creator`

### Protected Endpoints (Authentication Required)

#### 5. Get Current User
```
GET /v1/auth/me
```
Returns current user information based on JWT token.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

## User Roles & Permissions

### Client
Standard customer role for booking creators.

**Permissions:**
- view_creators
- create_booking
- view_bookings
- update_booking
- cancel_booking
- view_profile
- update_profile

### Sales Rep
Internal sales team member with extended booking management.

**Permissions:**
- view_creators
- create_booking
- view_bookings
- update_booking
- view_clients
- manage_bookings
- view_reports
- view_profile
- update_profile

### Creator
Content creator who accepts bookings and manages portfolio.

**Permissions:**
- view_bookings
- accept_booking
- reject_booking
- view_profile
- update_profile
- view_equipment
- manage_portfolio

### Admin
Full system access for platform administration.

**Permissions:**
- view_all
- create_all
- update_all
- delete_all
- manage_users
- manage_bookings
- manage_creators
- manage_equipment
- view_reports
- manage_permissions

## Authentication Flow

### Registration Flow
1. Client submits registration form
2. System validates input data
3. Check for existing user (email, phone, Instagram)
4. Hash password with bcrypt
5. Create user record with role
6. Generate JWT and refresh tokens
7. Return user info, tokens, and permissions

### Login Flow
1. Client submits email and password
2. Find user by email with user_type association
3. Verify account is active
4. Compare password with bcrypt
5. Generate JWT and refresh tokens
6. Return user info, tokens, and permissions

### Quick Register Flow
1. Client provides name and contact info during booking
2. Check if user already exists
3. If exists: return existing user with tokens
4. If new: create client account with temp password
5. Generate tokens and return with temp password

## Middleware Usage

### authenticate
Verifies JWT token and attaches user info to request.

```javascript
const { authenticate } = require('../middleware/auth.middleware');

router.get('/protected-route', authenticate, controller.handler);
```

**Adds to req object:**
- req.userId
- req.userRole

### authorize
Restricts access to specific roles.

```javascript
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.post('/admin-only',
  authenticate,
  authorize('admin'),
  controller.handler
);

router.get('/creator-or-admin',
  authenticate,
  authorize('creator', 'admin'),
  controller.handler
);
```

### optionalAuth
Attaches user info if token exists but doesn't require it.

```javascript
const { optionalAuth } = require('../middleware/auth.middleware');

router.get('/public-with-personalization',
  optionalAuth,
  controller.handler
);
```

## JWT Token Structure

### Access Token
**Payload:**
```json
{
  "userId": 1,
  "userRole": "client",
  "iat": 1702684800,
  "exp": 1703289600
}
```

**Expiration:** 7 days (configurable via JWT_EXPIRES_IN)

### Refresh Token
**Payload:**
```json
{
  "userId": 1,
  "userRole": "client",
  "type": "refresh",
  "iat": 1702684800,
  "exp": 1705363200
}
```

**Expiration:** 30 days

## Security Features

### Password Security
- Bcrypt hashing with salt rounds (default: 10)
- Minimum password requirements enforced at application level
- Passwords never returned in API responses

### Token Security
- JWT_SECRET from environment variables
- Token expiration enforcement
- Refresh token for extended sessions

### Account Security
- Email uniqueness validation
- Phone number uniqueness validation
- Instagram handle uniqueness validation
- Active account check on login
- Failed login attempt tracking (future enhancement)

## Database Setup

### 1. Seed User Types
```bash
npm run seed:user-types
```

This creates the required role records in user_type table:
- client
- sales_rep
- creator
- admin

### 2. Verify Seeding
```sql
SELECT * FROM user_type;
```

Expected output:
```
user_type_id | user_role  | is_active
-------------|------------|----------
1            | client     | 1
2            | sales_rep  | 1
3            | creator    | 1
4            | admin      | 1
```

## Environment Variables

Required in `.env` file:

```env
JWT_SECRET=your_secret_key_here
JWT_EXPIRES_IN=7d
NODE_ENV=development
```

## Error Handling

### Standard Error Response
```json
{
  "success": false,
  "message": "Error description"
}
```

### Development Mode
In development, error responses include stack traces:
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

## Testing

See `/tests/auth.test.md` for comprehensive testing examples including:
- cURL commands
- Postman collection setup
- Expected responses
- Error scenarios

## Integration with Frontend

### Login Example
```javascript
const response = await fetch('http://localhost:5001/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123'
  })
});

const data = await response.json();
if (data.success) {
  localStorage.setItem('token', data.token);
  localStorage.setItem('refreshToken', data.refreshToken);
  localStorage.setItem('user', JSON.stringify(data.user));
  localStorage.setItem('permissions', JSON.stringify(data.permissions));
}
```

### Authenticated Request
```javascript
const token = localStorage.getItem('token');

const response = await fetch('http://localhost:5001/v1/auth/me', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
```

## Future Enhancements

### Planned Features
1. Email verification flow
2. Password reset functionality
3. Two-factor authentication (2FA)
4. OAuth integration (Google, Facebook)
5. Session management and revocation
6. Rate limiting on auth endpoints
7. Failed login attempt tracking
8. Account lockout after failed attempts
9. Password strength validation
10. Refresh token rotation

### Security Improvements
1. IP-based access control
2. Device fingerprinting
3. Suspicious activity detection
4. Security audit logging
5. CAPTCHA for registration/login

## Maintenance

### Adding New Roles
1. Add role to user_type table
2. Update PERMISSIONS_MAP in auth.controller.js
3. Add role to validation arrays
4. Update documentation

### Modifying Permissions
1. Update PERMISSIONS_MAP in auth.controller.js
2. Test affected endpoints
3. Update frontend permission checks
4. Update documentation

## Support

For questions or issues:
- Check `/tests/auth.test.md` for usage examples
- Review error messages in development mode
- Verify environment variables are set
- Check database connection and seeding
