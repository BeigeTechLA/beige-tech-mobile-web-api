# Authentication System Flow Diagrams

## Registration Flow

```
┌─────────────┐
│   Client    │
│  (Frontend) │
└──────┬──────┘
       │
       │ POST /v1/auth/register
       │ { name, email, password, role }
       │
       ▼
┌─────────────────────────────────┐
│  auth.routes.js                 │
│  router.post('/register', ...)  │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  auth.controller.js - register()        │
│  1. Validate input                      │
│  2. Check if user exists                │
│  3. Find user_type by role              │
│  4. Hash password (bcrypt)              │
│  5. Create user record                  │
│  6. Generate JWT tokens                 │
│  7. Get permissions for role            │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Response                       │
│  {                              │
│    user: { id, name, role },    │
│    token: "jwt...",             │
│    refreshToken: "jwt...",      │
│    permissions: [...]           │
│  }                              │
└─────────────────────────────────┘
```

## Login Flow

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ POST /v1/auth/login
       │ { email, password }
       │
       ▼
┌─────────────────────────────────┐
│  auth.routes.js                 │
│  router.post('/login', ...)     │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  auth.controller.js - login()           │
│  1. Find user by email                  │
│  2. Include user_type association       │
│  3. Check if user is active             │
│  4. Verify password (bcrypt.compare)    │
│  5. Generate JWT tokens                 │
│  6. Get permissions for role            │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Response                       │
│  {                              │
│    user: { id, name, role },    │
│    token: "jwt...",             │
│    refreshToken: "jwt...",      │
│    permissions: [...]           │
│  }                              │
└─────────────────────────────────┘
```

## Quick Register Flow (During Booking)

```
┌─────────────┐
│   Client    │
│  (Booking)  │
└──────┬──────┘
       │
       │ POST /v1/auth/quick-register
       │ { name, email, phone_number }
       │
       ▼
┌─────────────────────────────────┐
│  auth.routes.js                 │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  auth.controller.js                     │
│  - quickRegister()                      │
└────────────┬────────────────────────────┘
             │
        ┌────▼────┐
        │ User    │
        │ Exists? │
        └────┬────┘
             │
    ┌────────┴────────┐
    │                 │
   YES               NO
    │                 │
    ▼                 ▼
┌────────┐      ┌──────────────┐
│ Return │      │ Create User  │
│ Existing│     │ - Role: client│
│ User + │      │ - Temp Pass  │
│ Tokens │      │ Generate     │
└────────┘      │ Tokens       │
                └──────────────┘
                      │
                      ▼
                ┌──────────────┐
                │ Response     │
                │ + tempPassword│
                └──────────────┘
```

## Protected Route Access Flow

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ GET /v1/auth/me
       │ Header: Authorization: Bearer <token>
       │
       ▼
┌─────────────────────────────────┐
│  auth.middleware.js             │
│  - authenticate()               │
└────────────┬────────────────────┘
             │
        ┌────▼────┐
        │ Token   │
        │ Valid?  │
        └────┬────┘
             │
    ┌────────┴────────┐
    │                 │
   NO                YES
    │                 │
    ▼                 ▼
┌────────┐      ┌──────────────┐
│ 401    │      │ Attach to    │
│ Error  │      │ req.userId   │
└────────┘      │ req.userRole │
                └──────┬───────┘
                       │
                       ▼
                ┌──────────────┐
                │ Continue to  │
                │ Controller   │
                └──────┬───────┘
                       │
                       ▼
                ┌──────────────┐
                │ auth.controller│
                │ getCurrentUser()│
                └──────┬───────┘
                       │
                       ▼
                ┌──────────────┐
                │ Find user by │
                │ req.userId   │
                │ Return user  │
                │ + permissions│
                └──────────────┘
```

## Role-Based Authorization Flow

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ DELETE /v1/users/:id
       │ Header: Authorization: Bearer <token>
       │
       ▼
┌─────────────────────────────────┐
│  auth.middleware.js             │
│  - authenticate()               │
└────────────┬────────────────────┘
             │
        ┌────▼────┐
        │ Token   │
        │ Valid?  │
        └────┬────┘
             │
            YES
             │
             ▼
┌─────────────────────────────────┐
│  auth.middleware.js             │
│  - authorize('admin')           │
└────────────┬────────────────────┘
             │
        ┌────▼────┐
        │ User    │
        │ Role =  │
        │ admin?  │
        └────┬────┘
             │
    ┌────────┴────────┐
    │                 │
   NO                YES
    │                 │
    ▼                 ▼
┌────────┐      ┌──────────────┐
│ 403    │      │ Continue to  │
│ Forbidden│    │ Controller   │
└────────┘      └──────────────┘
```

## Permission System Architecture

```
┌─────────────────────────────────────────────┐
│  User Role                                  │
└───────────────┬─────────────────────────────┘
                │
    ┌───────────┼───────────┬─────────────┐
    │           │           │             │
    ▼           ▼           ▼             ▼
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│ client  │ │sales_rep│ │ creator │ │  admin  │
└────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘
     │           │           │           │
     ▼           ▼           ▼           ▼
┌────────────────────────────────────────────┐
│  PERMISSIONS_MAP                           │
│                                            │
│  client: [                                 │
│    'view_creators',                        │
│    'create_booking',                       │
│    'view_bookings',                        │
│    'update_booking',                       │
│    'cancel_booking',                       │
│    'view_profile',                         │
│    'update_profile'                        │
│  ]                                         │
│                                            │
│  sales_rep: [                              │
│    ...client permissions,                  │
│    'view_clients',                         │
│    'manage_bookings',                      │
│    'view_reports'                          │
│  ]                                         │
│                                            │
│  creator: [                                │
│    'view_bookings',                        │
│    'accept_booking',                       │
│    'reject_booking',                       │
│    'view_profile',                         │
│    'update_profile',                       │
│    'view_equipment',                       │
│    'manage_portfolio'                      │
│  ]                                         │
│                                            │
│  admin: [                                  │
│    'view_all',                             │
│    'create_all',                           │
│    'update_all',                           │
│    'delete_all',                           │
│    ...                                     │
│  ]                                         │
└────────────────────────────────────────────┘
```

## Database Relationships

```
┌─────────────────────────┐
│  user_type              │
├─────────────────────────┤
│  user_type_id (PK)      │
│  user_role              │────┐
│  is_active              │    │
└─────────────────────────┘    │
                               │
                               │ Foreign Key
                               │
┌──────────────────────────────┼─────┐
│  users                       ▼     │
├────────────────────────────────────┤
│  id (PK)                           │
│  name                              │
│  email (unique)                    │
│  phone_number (unique)             │
│  instagram_handle (unique)         │
│  password_hash                     │
│  user_type (FK) ───────────────────┘
│  is_active                         │
│  email_verified                    │
│  created_at                        │
└────────────────────────────────────┘
```

## JWT Token Structure

```
┌─────────────────────────────────────────┐
│  Access Token (expires: 7 days)         │
├─────────────────────────────────────────┤
│  Header:                                │
│  {                                      │
│    "alg": "HS256",                      │
│    "typ": "JWT"                         │
│  }                                      │
├─────────────────────────────────────────┤
│  Payload:                               │
│  {                                      │
│    "userId": 1,                         │
│    "userRole": "client",                │
│    "iat": 1702684800,                   │
│    "exp": 1703289600                    │
│  }                                      │
├─────────────────────────────────────────┤
│  Signature:                             │
│  HMACSHA256(                            │
│    base64UrlEncode(header) + "." +      │
│    base64UrlEncode(payload),            │
│    JWT_SECRET                           │
│  )                                      │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  Refresh Token (expires: 30 days)       │
├─────────────────────────────────────────┤
│  Payload:                               │
│  {                                      │
│    "userId": 1,                         │
│    "userRole": "client",                │
│    "type": "refresh",                   │
│    "iat": 1702684800,                   │
│    "exp": 1705363200                    │
│  }                                      │
└─────────────────────────────────────────┘
```

## Request/Response Flow

```
┌──────────────────────────────────────────────────────┐
│                    REQUEST                           │
└────────────────┬─────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────┐
│  HTTP Headers                                      │
│  Content-Type: application/json                    │
│  Authorization: Bearer eyJhbGciOiJIUzI1NiIs...     │
└────────────────┬───────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────┐
│  Request Body (for POST/PUT)                       │
│  {                                                 │
│    "email": "user@example.com",                    │
│    "password": "SecurePass123!"                    │
│  }                                                 │
└────────────────┬───────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────┐
│  Express Router                                    │
│  /v1/auth/login                                    │
└────────────────┬───────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────┐
│  Middleware Chain (if protected)                   │
│  1. authenticate()                                 │
│  2. authorize('role1', 'role2')                    │
└────────────────┬───────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────┐
│  Controller Function                               │
│  auth.controller.login()                           │
└────────────────┬───────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────┐
│  Database Query (via Sequelize)                    │
│  users.findOne({ where: { email } })               │
└────────────────┬───────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────┐
│  Business Logic                                    │
│  - Validate password                               │
│  - Generate tokens                                 │
│  - Get permissions                                 │
└────────────────┬───────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────┐
│                    RESPONSE                        │
│  {                                                 │
│    "success": true,                                │
│    "user": { ... },                                │
│    "token": "jwt...",                              │
│    "refreshToken": "jwt...",                       │
│    "permissions": [...]                            │
│  }                                                 │
└────────────────────────────────────────────────────┘
```

## Error Handling Flow

```
┌────────────────────────────────────────────────────┐
│  Error Occurs                                      │
│  - Validation error                                │
│  - Database error                                  │
│  - Authentication error                            │
│  - Authorization error                             │
└────────────────┬───────────────────────────────────┘
                 │
            ┌────▼────┐
            │ Error   │
            │ Type?   │
            └────┬────┘
                 │
    ┌────────────┼────────────┬──────────┐
    │            │            │          │
    ▼            ▼            ▼          ▼
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│  400    │ │  401    │ │  403    │ │  500    │
│  Bad    │ │ Unauth  │ │Forbidden│ │ Server  │
│ Request │ │         │ │         │ │ Error   │
└────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘
     │           │           │           │
     └───────────┴───────────┴───────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────┐
│  Error Response                                    │
│  {                                                 │
│    "success": false,                               │
│    "message": "Error description",                 │
│    "error": "Details (dev only)"                   │
│  }                                                 │
└────────────────────────────────────────────────────┘
```

## Complete System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│  - React/Vue/Angular                                        │
│  - Stores: token, refreshToken, user, permissions           │
│  - Sends: Authorization: Bearer <token>                     │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ HTTP/HTTPS
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                    EXPRESS SERVER                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  CORS Middleware                                    │   │
│  │  - Validates origin                                 │   │
│  └──────────────────┬──────────────────────────────────┘   │
│                     │                                       │
│  ┌──────────────────▼──────────────────────────────────┐   │
│  │  Body Parser                                        │   │
│  │  - Parses JSON                                      │   │
│  └──────────────────┬──────────────────────────────────┘   │
│                     │                                       │
│  ┌──────────────────▼──────────────────────────────────┐   │
│  │  Routes (/v1/auth/*)                                │   │
│  │  - /register                                        │   │
│  │  - /login                                           │   │
│  │  - /quick-register                                  │   │
│  │  - /me                                              │   │
│  │  - /permissions/:role                               │   │
│  └──────────────────┬──────────────────────────────────┘   │
│                     │                                       │
│  ┌──────────────────▼──────────────────────────────────┐   │
│  │  Middleware (conditional)                           │   │
│  │  - authenticate()                                   │   │
│  │  - authorize('role1', 'role2')                      │   │
│  │  - optionalAuth()                                   │   │
│  └──────────────────┬──────────────────────────────────┘   │
│                     │                                       │
│  ┌──────────────────▼──────────────────────────────────┐   │
│  │  Controllers                                        │   │
│  │  - auth.controller.js                               │   │
│  │    • register()                                     │   │
│  │    • login()                                        │   │
│  │    • quickRegister()                                │   │
│  │    • getCurrentUser()                               │   │
│  │    • getPermissions()                               │   │
│  └──────────────────┬──────────────────────────────────┘   │
│                     │                                       │
└─────────────────────┼───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                    DATABASE (MySQL)                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  users table                                        │   │
│  │  - id, name, email, password_hash                   │   │
│  │  - phone_number, instagram_handle                   │   │
│  │  - user_type (FK), is_active, email_verified        │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  user_type table                                    │   │
│  │  - user_type_id (PK)                                │   │
│  │  - user_role (client, sales_rep, creator, admin)    │   │
│  │  - is_active                                        │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```
