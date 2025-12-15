# Revure V2 Backend

Customer-facing backend API for Revure V2 Landing page.

## 🎯 Overview

This backend service provides APIs for:
- User authentication (clients, creators, sales reps)
- Booking management (create, track bookings)
- Creator search and discovery
- Payment processing (Stripe integration)
- Waitlist management

## 🗄️ Database

**Shared Database:** This backend shares the `revurge` MySQL database with `beige-server`.

**Key Tables:**
- `users` - User accounts (clients, creators, admins)
- `user_type` - User roles and permissions
- `crew_members` - Creator profiles (mapped as "creators" in API)
- `stream_project_booking` - Bookings/orders
- `payments` - Payment transactions
- `equipment`, `skills_master`, `certifications_master` - Supporting data

## 🚀 Quick Start

### Prerequisites
- Node.js v18+
- MySQL database (shared with beige-server)
- Access to `revurge` database

### Installation

```bash
# Install dependencies
npm install
# or
yarn install

# Configure environment variables
cp .env.example .env
# Edit .env with your database credentials

# Start development server
npm run dev

# Start production server
npm start
```

### Environment Variables

See `.env` file for all configuration options. Key variables:

```env
PORT=5001
DATABASE_HOST=localhost
DATABASE_NAME=revurge
DATABASE_USER=root
DATABASE_PASS=root
JWT_SECRET=your_secret_here
STRIPE_SECRET_KEY=sk_test_...
```

## 📡 API Endpoints

**Base URL:** `http://localhost:5001/v1`

### Authentication
```
POST   /v1/auth/register          - Register new user
POST   /v1/auth/login             - Login (email/password)
POST   /v1/auth/quick-register    - Fast registration during booking
GET    /v1/auth/permissions/:role - Get role permissions
GET    /v1/auth/me                - Get current user info (requires auth)
```

### Bookings
```
POST   /v1/bookings/create        - Create new booking (requires auth)
GET    /v1/bookings/:id           - Get booking details (requires auth)
GET    /v1/bookings               - List user's bookings (requires auth)
PUT    /v1/bookings/:id           - Update booking (requires auth)
```

### Creators
```
GET    /v1/creators/search        - Search creators (public)
GET    /v1/creators/:id           - Get creator profile (public)
GET    /v1/creators/:id/portfolio - Get creator portfolio (public)
GET    /v1/creators/:id/reviews   - Get creator reviews (public)
```

### Payments
```
POST   /v1/payments/confirm       - Process payment and create booking (requires auth)
GET    /v1/payments/:id/status    - Get payment status (requires auth)
```

### Waitlist
```
POST   /v1/waitlist/join          - Join waitlist (public)
```

## 🔐 Authentication

All authenticated endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

**User Roles:**
- `client` - Regular users booking creators
- `creator` - Content creators offering services
- `sales_rep` / `sales_representative` - Can book on behalf of clients
- `admin` - Full system access

## 📝 API Request/Response Examples

### Register User
```bash
POST /v1/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepass123",
  "phone": "+1234567890",
  "role": "client"
}
```

**Response:**
```json
{
  "user": {
    "userId": "123",
    "email": "john@example.com",
    "name": "John Doe",
    "role": "client"
  },
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "permissions": ["create_booking", "view_creators"]
}
```

### Create Booking
```bash
POST /v1/bookings/create
Authorization: Bearer <token>
Content-Type: application/json

{
  "order_name": "Product Launch Video",
  "project_type": "shoot_edit",
  "content_type": "videography",
  "shoot_type": "Brand Campaign",
  "start_date_time": "2025-02-15T09:00:00Z",
  "end_date": "2025-02-15T18:00:00Z",
  "location": "San Francisco, CA",
  "budget_min": 2000,
  "budget_max": 3000,
  "crew_size": "3-5 people"
}
```

### Search Creators
```bash
GET /v1/creators/search?contentType=videography&budget_min=0&budget_max=500&page=1&limit=20
```

## 🏗️ Project Structure

```
revure-v2-backend/
├── src/
│   ├── config/
│   │   └── config.js              # Database & app configuration
│   ├── db/
│   │   └── index.js               # Sequelize connection
│   ├── models/                     # Database models (27 tables)
│   │   ├── users.js
│   │   ├── crew_members.js
│   │   ├── stream_project_booking.js
│   │   └── ...
│   ├── controllers/                # Business logic
│   │   ├── auth.controller.js
│   │   ├── bookings.controller.js
│   │   ├── creators.controller.js
│   │   ├── payments.controller.js
│   │   └── waitlist.controller.js
│   ├── routes/                     # API routes
│   │   ├── index.js               # Main router
│   │   ├── auth.routes.js
│   │   ├── bookings.routes.js
│   │   ├── creators.routes.js
│   │   ├── payments.routes.js
│   │   └── waitlist.routes.js
│   ├── middleware/                 # Express middleware
│   │   ├── auth.js                # JWT verification
│   │   └── errorHandler.js        # Global error handling
│   ├── utils/                      # Utility functions
│   │   ├── common.js              # S3 upload utilities
│   │   ├── emailService.js        # Email sending
│   │   └── constants.js           # App constants
│   ├── app.js                      # Express app setup
│   └── server.js                   # Entry point
├── .env                            # Environment variables
├── .gitignore
├── package.json
└── README.md
```

## 🔄 Relationship to beige-server

This backend **shares the database** with `beige-server` but serves different purposes:

| Aspect | beige-server | revure-v2-backend |
|--------|--------------|-------------------|
| **Purpose** | Admin panel | Customer portal |
| **Users** | Internal staff | Clients & creators |
| **Port** | 8081 | 5001 |
| **Routes** | `/api/admin/*` | `/v1/*` |
| **Frontend** | Admin dashboard | Revure V2 Landing |

**Shared Components:**
- ✅ Same database (`revurge`)
- ✅ Same models (users, crew_members, bookings, equipment)
- ✅ Same utilities (email, file upload, JWT)

**Different Components:**
- ❌ Different API endpoints (customer vs admin)
- ❌ Different business logic
- ❌ Different authorization rules

## 🧪 Testing

### Test Database Connection
```bash
node -e "require('./src/db/index').authenticate().then(() => console.log('Connected!')).catch(err => console.error(err))"
```

### Run API Tests
```bash
# Install dependencies first
npm install

# Test authentication endpoint
curl -X POST http://localhost:5001/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Test creator search
curl http://localhost:5001/v1/creators/search?contentType=videography
```

## 📦 Dependencies

**Core:**
- `express` - Web framework
- `sequelize` - ORM for MySQL
- `mysql2` - MySQL driver

**Authentication:**
- `jsonwebtoken` - JWT token generation
- `bcrypt` - Password hashing

**File Upload:**
- `multer` - File upload middleware
- `s3-bucket` - AWS S3 integration

**Payment:**
- `stripe` - Payment processing

**Other:**
- `cors` - CORS middleware
- `dotenv` - Environment configuration
- `nodemailer` - Email sending

## 🚧 Development

### Running in Development Mode
```bash
npm run dev
```

This uses `nodemon` to auto-restart on file changes.

### Code Style
- Use ES6+ features
- Async/await for asynchronous operations
- Consistent error handling
- Follow existing patterns from beige-server

## 🔒 Security

- Passwords hashed with bcrypt
- JWT tokens for authentication
- CORS configured for allowed origins
- SQL injection protection via Sequelize ORM
- Environment variables for sensitive data

## 📄 License

ISC

## 👥 Team

Part of the Revure platform ecosystem.

---

**Created:** December 2025
**Status:** In Development
**Related Repositories:**
- `beige-server` - Admin backend
- `revure-v2-landing` - Customer frontend
