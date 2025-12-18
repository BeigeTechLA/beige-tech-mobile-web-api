# Authentication System Setup Guide

## Quick Start

### 1. Install Dependencies
Dependencies are already in package.json. If needed:
```bash
npm install
```

### 2. Configure Environment
Verify `.env` file contains:
```env
JWT_SECRET=your_jwt_secret_here_min_32_chars
JWT_EXPIRES_IN=7d
NODE_ENV=development
DATABASE_HOST=localhost
DATABASE_NAME=revurge
DATABASE_USER=root
DATABASE_PASS=root
```

### 3. Seed User Roles
```bash
npm run seed:user-types
```

Expected output:
```
Database connected successfully
Created user type: client (ID: 1)
Created user type: sales_rep (ID: 2)
Created user type: creator (ID: 3)
Created user type: admin (ID: 4)

User types seeded successfully!
```

### 4. Start Server
```bash
npm run dev
```

Server will start on: `http://localhost:5001`

## Verify Installation

### Test Health Endpoint
```bash
curl http://localhost:5001/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-12-16T02:15:00.000Z",
  "service": "revure-v2-backend"
}
```

### Test API Info
```bash
curl http://localhost:5001/v1
```

### Test Registration
```bash
curl -X POST http://localhost:5001/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "TestPass123!",
    "role": "client"
  }'
```

Expected response:
```json
{
  "success": true,
  "message": "User registered successfully",
  "user": {
    "id": 1,
    "name": "Test User",
    "email": "test@example.com",
    "phone_number": null,
    "instagram_handle": null,
    "role": "client"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "permissions": [
    "view_creators",
    "create_booking",
    "view_bookings",
    "update_booking",
    "cancel_booking",
    "view_profile",
    "update_profile"
  ]
}
```

## File Structure

```
revure-v2-backend/
├── src/
│   ├── controllers/
│   │   ├── auth.controller.js      # Auth business logic
│   │   └── README_AUTH.md          # Detailed documentation
│   ├── middleware/
│   │   ├── auth.middleware.js      # JWT verification
│   │   └── auth.js                 # Alternative auth middleware
│   ├── routes/
│   │   ├── auth.routes.js          # Auth endpoints
│   │   └── index.js                # Route aggregator
│   ├── db/
│   │   └── seedUserTypes.js        # Role seeding script
│   └── models/
│       ├── users.js                # User model
│       └── user_type.js            # Role model
├── tests/
│   └── auth.test.md                # API test examples
├── package.json                     # Updated with seed script
└── AUTH_SETUP.md                   # This file
```

## API Endpoints Summary

### Public Endpoints
- `POST /v1/auth/register` - Create new user account
- `POST /v1/auth/login` - Authenticate user
- `POST /v1/auth/quick-register` - Fast signup during booking
- `GET /v1/auth/permissions/:role` - Get role permissions

### Protected Endpoints
- `GET /v1/auth/me` - Get current user (requires JWT)

## Frontend Integration

### Response Format
All auth endpoints return:
```json
{
  "success": true|false,
  "message": "...",
  "user": { ... },
  "token": "...",
  "refreshToken": "...",
  "permissions": [...]
}
```

### Expected Frontend Storage
```javascript
{
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "role": "client"
  },
  "token": "jwt_access_token",
  "refreshToken": "jwt_refresh_token",
  "permissions": ["view_creators", "create_booking", ...]
}
```

### Using Tokens in Requests
```javascript
fetch('http://localhost:5001/v1/auth/me', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
```

## User Roles

| Role      | Description                          | Use Case                      |
|-----------|--------------------------------------|-------------------------------|
| client    | Standard customer                    | Book creators                 |
| sales_rep | Internal sales team                  | Manage client bookings        |
| creator   | Content creator                      | Accept bookings, manage work  |
| admin     | Platform administrator               | Full system access            |

## Common Issues

### Issue: "User role configuration error"
**Cause:** user_type table not seeded

**Solution:**
```bash
npm run seed:user-types
```

### Issue: "Invalid token"
**Cause:** JWT_SECRET mismatch or malformed token

**Solution:**
- Verify JWT_SECRET in .env
- Ensure token format: `Bearer <token>`
- Check token hasn't expired

### Issue: "User already exists"
**Cause:** Duplicate email/phone/instagram

**Solution:**
- Use unique credentials
- Or login instead of register

### Issue: Database connection error
**Cause:** MySQL not running or wrong credentials

**Solution:**
- Start MySQL: `mysql.server start`
- Verify DATABASE_* env variables
- Check database exists: `CREATE DATABASE revurge;`

## Development Workflow

### 1. Clean Start
```bash
# Reset database (optional)
mysql -u root -p revurge < schema.sql

# Seed roles
npm run seed:user-types

# Start server
npm run dev
```

### 2. Create Test Users
```bash
# Client
curl -X POST http://localhost:5001/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Client User","email":"client@test.com","password":"Pass123!","role":"client"}'

# Creator
curl -X POST http://localhost:5001/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Creator User","email":"creator@test.com","password":"Pass123!","role":"creator"}'

# Admin
curl -X POST http://localhost:5001/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin User","email":"admin@test.com","password":"Pass123!","role":"admin"}'
```

### 3. Test Login
```bash
curl -X POST http://localhost:5001/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"client@test.com","password":"Pass123!"}'
```

### 4. Test Protected Endpoint
```bash
# Save token from login response
TOKEN="your_jwt_token_here"

curl -X GET http://localhost:5001/v1/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

## Testing with Postman

### 1. Import Environment
Create environment with variables:
```json
{
  "baseUrl": "http://localhost:5001/v1",
  "token": "",
  "refreshToken": "",
  "userId": ""
}
```

### 2. Create Collection
- Name: "Revure V2 Auth"
- Base URL: `{{baseUrl}}/auth`

### 3. Add Requests

#### Register
- Method: POST
- URL: `{{baseUrl}}/auth/register`
- Body: Raw JSON
- Tests:
```javascript
if (pm.response.code === 201) {
  pm.environment.set("token", pm.response.json().token);
  pm.environment.set("refreshToken", pm.response.json().refreshToken);
  pm.environment.set("userId", pm.response.json().user.id);
}
```

#### Login
- Method: POST
- URL: `{{baseUrl}}/auth/login`
- Body: Raw JSON
- Tests: (same as register)

#### Get Current User
- Method: GET
- URL: `{{baseUrl}}/auth/me`
- Headers: `Authorization: Bearer {{token}}`

## Database Schema Reference

### users table
```sql
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(200),
  email VARCHAR(255) UNIQUE,
  phone_number VARCHAR(20) UNIQUE,
  instagram_handle VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  user_type INT,
  is_active BOOLEAN DEFAULT 1,
  email_verified TINYINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_type) REFERENCES user_type(user_type_id)
);
```

### user_type table
```sql
CREATE TABLE user_type (
  user_type_id INT PRIMARY KEY AUTO_INCREMENT,
  user_role VARCHAR(255),
  is_active INT DEFAULT 1
);
```

## Security Notes

- Passwords are hashed with bcrypt (10 rounds)
- JWT tokens expire after 7 days (configurable)
- Refresh tokens expire after 30 days
- All auth endpoints use HTTPS in production
- CORS restricted to configured origins
- SQL injection protected by Sequelize parameterization

## Next Steps

After authentication is working:

1. **Email Verification**: Implement email verification flow
2. **Password Reset**: Add forgot password functionality
3. **Profile Management**: Create user profile endpoints
4. **Role Management**: Add admin endpoints for role assignment
5. **Session Management**: Implement token refresh flow
6. **Audit Logging**: Track authentication events

## Support Resources

- **API Documentation**: `/src/controllers/README_AUTH.md`
- **Test Examples**: `/tests/auth.test.md`
- **Route Definitions**: `/src/routes/auth.routes.js`
- **Controller Logic**: `/src/controllers/auth.controller.js`
- **Middleware**: `/src/middleware/auth.middleware.js`

## Success Checklist

- [ ] Environment variables configured
- [ ] Database connected successfully
- [ ] User types seeded
- [ ] Server starts without errors
- [ ] Health endpoint responds
- [ ] Can register new user
- [ ] Can login with credentials
- [ ] Receive JWT token
- [ ] Can access protected endpoint with token
- [ ] Permissions returned correctly
