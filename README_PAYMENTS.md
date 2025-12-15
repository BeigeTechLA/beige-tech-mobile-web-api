# Payment Processing System

This document describes the payment processing system implementation for Revure V2 Backend.

## Overview

The payment system integrates Stripe for payment processing and creates bookings upon successful payment confirmation. It includes waitlist functionality for users who want early access.

## Database Tables

### payments
Stores payment transactions and links them to bookings.

**Fields:**
- `payment_id` (INT, PK, Auto-increment) - Unique payment identifier
- `booking_id` (INT, FK) - References stream_project_booking
- `user_id` (INT, FK, Nullable) - References users table (null for guest bookings)
- `amount` (DECIMAL(10,2)) - Payment amount
- `currency` (VARCHAR(3)) - Currency code (default: USD)
- `stripe_transaction_id` (VARCHAR(255)) - Stripe payment intent ID
- `status` (ENUM) - Payment status: pending, processing, succeeded, failed, refunded
- `confirmation_number` (VARCHAR(50), Unique) - Format: #BG-YYYYMMDD-NNN
- `created_at` (TIMESTAMP) - Payment creation timestamp
- `updated_at` (TIMESTAMP) - Last update timestamp

### waitlist
Stores waitlist entries for early access requests.

**Fields:**
- `id` (INT, PK, Auto-increment) - Unique entry identifier
- `name` (VARCHAR(255)) - User's full name
- `email` (VARCHAR(255)) - User's email address
- `phone` (VARCHAR(50), Nullable) - User's phone number
- `company` (VARCHAR(255), Nullable) - Company name
- `city` (VARCHAR(100), Nullable) - City location
- `status` (ENUM) - Status: pending, contacted, converted, inactive
- `created_at` (TIMESTAMP) - Entry creation timestamp

## API Endpoints

### Payment Endpoints

#### POST /v1/payments/create-intent
Create a Stripe payment intent for frontend to process payment.

**Auth:** Public (optional auth for user tracking)

**Request Body:**
```json
{
  "amount": 500.00,
  "currency": "USD",
  "metadata": {
    "projectName": "Live Event Stream"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "clientSecret": "pi_xxx_secret_xxx",
    "paymentIntentId": "pi_xxx"
  }
}
```

#### POST /v1/payments/confirm
Confirm payment and create booking after Stripe payment succeeds.

**Auth:** Public (optional auth for user tracking)

**Request Body:**
```json
{
  "paymentIntentId": "pi_xxx",
  "amount": 500.00,
  "currency": "USD",
  "bookingData": {
    "project_name": "Corporate Live Stream",
    "description": "Annual conference streaming",
    "event_type": "Conference",
    "event_date": "2025-03-15",
    "duration_hours": 8,
    "start_time": "09:00:00",
    "end_time": "17:00:00",
    "expected_viewers": 1000,
    "stream_quality": "HD",
    "crew_size_needed": 5,
    "event_location": "San Francisco, CA",
    "streaming_platforms": ["YouTube", "Twitch"],
    "crew_roles": ["Camera Operator", "Audio Engineer"],
    "skills_needed": ["Live Streaming", "Video Production"],
    "equipments_needed": ["Cameras", "Audio Equipment"]
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment confirmed and booking created",
  "data": {
    "payment_id": 123,
    "booking_id": 456,
    "confirmation_number": "#BG-20251216-345",
    "transaction_id": "pi_xxx",
    "amount": 500.00,
    "currency": "USD",
    "status": "succeeded"
  }
}
```

#### GET /v1/payments/:id/status
Get payment status by payment_id or confirmation_number.

**Auth:** Public

**Response:**
```json
{
  "success": true,
  "data": {
    "payment_id": 123,
    "booking_id": 456,
    "amount": 500.00,
    "currency": "USD",
    "status": "succeeded",
    "confirmation_number": "#BG-20251216-345",
    "transaction_id": "pi_xxx",
    "created_at": "2025-12-16T10:30:00.000Z",
    "booking": {
      "stream_project_booking_id": 456,
      "project_name": "Corporate Live Stream",
      "event_date": "2025-03-15",
      "event_location": "San Francisco, CA",
      "is_completed": false,
      "is_cancelled": false
    }
  }
}
```

### Waitlist Endpoints

#### POST /v1/waitlist/join
Join the waitlist for early access.

**Auth:** Public

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "company": "Tech Corp",
  "city": "San Francisco"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully joined waitlist",
  "data": {
    "id": 123,
    "name": "John Doe",
    "email": "john@example.com",
    "status": "pending"
  }
}
```

#### GET /v1/waitlist
Get all waitlist entries (admin only).

**Auth:** Required (Admin role)

**Query Parameters:**
- `status` (optional) - Filter by status: pending, contacted, converted, inactive
- `page` (optional, default: 1) - Page number
- `limit` (optional, default: 50) - Items per page

**Response:**
```json
{
  "success": true,
  "data": {
    "entries": [
      {
        "id": 123,
        "name": "John Doe",
        "email": "john@example.com",
        "phone": "+1234567890",
        "company": "Tech Corp",
        "city": "San Francisco",
        "status": "pending",
        "created_at": "2025-12-16T10:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 100,
      "page": 1,
      "limit": 50,
      "totalPages": 2
    }
  }
}
```

#### PATCH /v1/waitlist/:id/status
Update waitlist entry status (admin only).

**Auth:** Required (Admin role)

**Request Body:**
```json
{
  "status": "contacted"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Status updated successfully",
  "data": {
    "id": 123,
    "email": "john@example.com",
    "status": "contacted"
  }
}
```

## Payment Flow

1. **Frontend initiates payment:**
   - Calls POST /v1/payments/create-intent
   - Receives clientSecret and paymentIntentId

2. **User completes payment with Stripe:**
   - Frontend uses Stripe.js to process payment
   - Stripe confirms payment on their end

3. **Frontend confirms booking:**
   - Calls POST /v1/payments/confirm with paymentIntentId and booking data
   - Backend verifies payment with Stripe
   - Creates booking in stream_project_booking table
   - Creates payment record with confirmation number
   - Returns confirmation details

4. **User receives confirmation:**
   - Confirmation number in format #BG-YYYYMMDD-NNN
   - Can check status using GET /v1/payments/:id/status

## Environment Variables

Add these to your `.env` file:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# JWT Configuration (existing)
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
```

## Database Migration

Run the migration SQL to create the tables:

```bash
mysql -u root -p revurge < migrations/create_payments_and_waitlist_tables.sql
```

Or connect to your database and execute the SQL file manually.

## Testing

### Test Payment Flow

1. Use Stripe test mode with test keys
2. Test card numbers:
   - Success: 4242 4242 4242 4242
   - Decline: 4000 0000 0000 0002
   - Authentication required: 4000 0025 0000 3155

### Test Waitlist

```bash
# Join waitlist
curl -X POST http://localhost:3000/v1/waitlist/join \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "phone": "+1234567890",
    "company": "Test Co",
    "city": "Test City"
  }'
```

## Security Considerations

- Payment confirmation endpoints use optional auth (req.userId available if authenticated)
- Stripe webhook verification recommended for production
- Admin endpoints require authentication and authorization
- SQL injection protection via Sequelize parameterized queries
- Unique confirmation numbers prevent duplicates
- Transaction rollback on payment/booking creation failures

## Error Handling

All endpoints return standardized error responses:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error (development only)"
}
```

## Files Created

- `/src/models/payments.js` - Payment model
- `/src/models/waitlist.js` - Waitlist model
- `/src/controllers/payments.controller.js` - Payment controller
- `/src/controllers/waitlist.controller.js` - Waitlist controller
- `/src/routes/payments.routes.js` - Payment routes
- `/src/routes/waitlist.routes.js` - Waitlist routes
- `/src/utils/confirmationNumber.js` - Confirmation number generator
- `/src/middleware/auth.middleware.js` - Authentication middleware (already existed)
- `/migrations/create_payments_and_waitlist_tables.sql` - Database migration
