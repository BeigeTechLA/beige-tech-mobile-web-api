# API Documentation - Revure V2 Backend

Complete API reference for customer-facing endpoints.

---

## Base URL

```
Development: http://localhost:5001/v1
Production: https://api.revure.com/v1
```

---

## Authentication

All authenticated endpoints require a Bearer token:

```
Authorization: Bearer <jwt_token>
```

Tokens are returned from login/register endpoints and expire in 7 days.

---

## Response Format

### Success Response
```json
{
  "success": true,
  "data": { /* response data */ },
  "message": "Operation successful"
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message"
  }
}
```

---

## Endpoints

## Authentication Endpoints

### Register User
Create a new user account.

**Endpoint:** `POST /v1/auth/register`

**Authentication:** Not required

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securePassword123",
  "phone": "+1234567890",
  "role": "client"
}
```

**Response:** `201 Created`
```json
{
  "user": {
    "userId": "123",
    "id": "123",
    "_id": "123",
    "email": "john@example.com",
    "name": "John Doe",
    "phone": "+1234567890",
    "role": "client"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "permissions": ["create_booking", "view_creators", "manage_profile"]
}
```

**Errors:**
- `400` - Invalid input (missing fields, invalid email format)
- `409` - Email already registered
- `422` - Validation error

---

### Login
Authenticate user with email and password.

**Endpoint:** `POST /v1/auth/login`

**Authentication:** Not required

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "securePassword123"
}
```

**Response:** `200 OK`
```json
{
  "user": {
    "userId": "123",
    "id": "123",
    "_id": "123",
    "email": "john@example.com",
    "name": "John Doe",
    "phone": "+1234567890",
    "role": "client"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "authPermissions": ["create_booking", "view_creators"],
  "permissions": ["create_booking", "view_creators", "manage_profile"]
}
```

**Errors:**
- `401` - Invalid email or password
- `422` - Validation error

---

### Quick Register
Fast registration during booking flow.

**Endpoint:** `POST /v1/auth/quick-register`

**Authentication:** Not required

**Request Body:**
```json
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "password": "securePass456",
  "phone": "+1987654321",
  "bookingContext": {
    "order_name": "Wedding Video",
    "project_type": "shoot_edit"
  }
}
```

**Response:** `201 Created`
```json
{
  "user": {
    "userId": "124",
    "email": "jane@example.com",
    "name": "Jane Smith",
    "phone": "+1987654321",
    "role": "client"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "permissions": ["create_booking", "view_creators"]
}
```

---

### Get Permissions by Role
Retrieve permissions for a specific user role.

**Endpoint:** `GET /v1/auth/permissions/:role`

**Authentication:** Not required

**URL Parameters:**
- `role` - User role (client, creator, sales_rep, admin)

**Response:** `200 OK`
```json
[
  {
    "role": "client",
    "permissions": [
      "create_booking",
      "view_creators",
      "manage_profile",
      "view_bookings",
      "make_payment"
    ]
  }
]
```

---

### Get Current User
Get authenticated user information.

**Endpoint:** `GET /v1/auth/me`

**Authentication:** Required

**Response:** `200 OK`
```json
{
  "user": {
    "userId": "123",
    "email": "john@example.com",
    "name": "John Doe",
    "phone": "+1234567890",
    "role": "client"
  }
}
```

---

## Booking Endpoints

### Create Booking
Create a new booking from the booking modal.

**Endpoint:** `POST /v1/bookings/create`

**Authentication:** Required

**Request Body:**
```json
{
  "order_name": "Product Launch Video",
  "project_type": "shoot_edit",
  "content_type": "videography",
  "shoot_type": "Brand Campaign",
  "edit_type": "Standard Edit",
  "start_date_time": "2025-02-15T09:00:00Z",
  "end_date": "2025-02-15T18:00:00Z",
  "location": "San Francisco, CA",
  "need_studio": true,
  "studio": "Studio A",
  "studio_time_duration": 4,
  "budget_min": 2000,
  "budget_max": 3000,
  "crew_size": "3-5 people",
  "reference_link": "https://example.com/reference",
  "special_note": "Need drone shots"
}
```

**Response:** `201 Created`
```json
{
  "bookingId": "456",
  "order_name": "Product Launch Video",
  "project_type": "shoot_edit",
  "status": "pending",
  "createdAt": "2025-01-15T10:00:00Z"
}
```

**Errors:**
- `400` - Invalid input
- `401` - Not authenticated
- `422` - Validation error

---

### Get Booking by ID
Retrieve booking details.

**Endpoint:** `GET /v1/bookings/:id`

**Authentication:** Required

**URL Parameters:**
- `id` - Booking ID

**Response:** `200 OK`
```json
{
  "booking": {
    "bookingId": "456",
    "order_name": "Product Launch Video",
    "project_type": "shoot_edit",
    "content_type": "videography",
    "start_date_time": "2025-02-15T09:00:00Z",
    "end_date": "2025-02-15T18:00:00Z",
    "location": "San Francisco, CA",
    "budget_min": 2000,
    "budget_max": 3000,
    "status": "pending",
    "assigned_creators": [
      {
        "creatorId": "789",
        "name": "Alex Rivera",
        "role": "Videographer"
      }
    ]
  }
}
```

**Errors:**
- `401` - Not authenticated
- `404` - Booking not found

---

### Get User Bookings
List all bookings for the authenticated user.

**Endpoint:** `GET /v1/bookings`

**Authentication:** Required

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20, max: 100)
- `status` - Filter by status (pending, confirmed, completed)

**Response:** `200 OK`
```json
{
  "bookings": [
    {
      "bookingId": "456",
      "order_name": "Product Launch Video",
      "status": "pending",
      "createdAt": "2025-01-15T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "hasMore": false
  }
}
```

---

## Creator Endpoints

### Search Creators
Search for creators with filters.

**Endpoint:** `GET /v1/creators/search`

**Authentication:** Not required (public)

**Query Parameters:**
- `contentType` - Filter by content type (videography, photography, both)
- `budget_min` - Minimum hourly rate
- `budget_max` - Maximum hourly rate
- `location` - Location filter
- `skills` - Comma-separated skill IDs
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)

**Response:** `200 OK`
```json
{
  "creators": [
    {
      "id": "789",
      "name": "Alex Rivera",
      "role": "Videographer Specialist",
      "price": 250,
      "rating": 4.8,
      "reviews": 120,
      "image": "https://storage.com/profile/789.jpg",
      "isTopMatch": true,
      "skills": ["Videography", "Drone Piloting", "Video Editing"]
    }
  ],
  "total": 45,
  "page": 1,
  "limit": 20,
  "hasMore": true
}
```

---

### Get Creator Profile
Get detailed creator profile.

**Endpoint:** `GET /v1/creators/:id`

**Authentication:** Not required (public)

**Response:** `200 OK`
```json
{
  "creator": {
    "id": "789",
    "name": "Alex Rivera",
    "role": "Videographer Specialist",
    "about": "Professional videographer with 8 years experience...",
    "price": 250,
    "rating": 4.8,
    "reviews": 120,
    "image": "https://storage.com/profile/789.jpg",
    "skills": ["Videography", "Drone Piloting", "Video Editing"],
    "equipment": ["Sony FX6", "DJI Mavic 3 Pro", "Lighting Kit"],
    "portfolio": [
      {
        "id": "101",
        "title": "Tech Conference 2024",
        "imageUrl": "https://storage.com/portfolio/101.jpg",
        "videoUrl": "https://storage.com/portfolio/101.mp4"
      }
    ],
    "available": true
  }
}
```

---

## Payment Endpoints

### Confirm Payment
Process payment and create booking.

**Endpoint:** `POST /v1/payments/confirm`

**Authentication:** Required

**Request Body:**
```json
{
  "shootId": "shoot_123",
  "creatorId": "789",
  "amount": 2500,
  "stripePaymentMethodId": "pm_1234567890"
}
```

**Response:** `200 OK`
```json
{
  "confirmationNumber": "#BG-20250115-001",
  "transactionId": "ch_1234567890",
  "status": "completed",
  "amountPaid": 2500,
  "paymentDate": "2025-01-15T10:30:00Z",
  "bookingId": "456"
}
```

**Errors:**
- `400` - Invalid payment data
- `401` - Not authenticated
- `402` - Payment failed
- `422` - Validation error

---

## Waitlist Endpoints

### Join Waitlist
Add user to waitlist.

**Endpoint:** `POST /v1/waitlist/join`

**Authentication:** Not required (public)

**Request Body:**
```json
{
  "name": "Sarah Johnson",
  "email": "sarah@example.com",
  "phone": "+1555666777",
  "company": "TechCorp Inc",
  "city": "New York"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "message": "Successfully joined the waitlist!",
  "waitlistId": "901"
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Request validation failed |
| `UNAUTHORIZED` | Authentication required |
| `FORBIDDEN` | Insufficient permissions |
| `NOT_FOUND` | Resource not found |
| `CONFLICT` | Resource already exists |
| `PAYMENT_FAILED` | Payment processing failed |
| `SERVER_ERROR` | Internal server error |

---

## Rate Limiting

- 100 requests per minute per IP for public endpoints
- 500 requests per minute per user for authenticated endpoints

---

## Pagination

List endpoints support pagination via query parameters:
- `page` - Page number (1-indexed)
- `limit` - Items per page (default: 20, max: 100)

Response includes pagination metadata:
```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "hasMore": true
  }
}
```

---

**Last Updated:** December 2025
