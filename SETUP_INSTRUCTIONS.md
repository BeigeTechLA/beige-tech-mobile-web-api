# Payment System Setup Instructions

## Quick Start

### 1. Database Setup

Run the migration to create the required tables:

```bash
# Connect to MySQL
mysql -u root -p

# Select database
USE revurge;

# Run migration
SOURCE /Users/amrik/Documents/revure/revure-v2-backend/migrations/create_payments_and_waitlist_tables.sql;

# Verify tables created
SHOW TABLES LIKE 'payments';
SHOW TABLES LIKE 'waitlist';
```

### 2. Environment Configuration

The `.env` file already contains Stripe configuration. Verify these values:

```env
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

For testing, you can use Stripe test mode keys from your Stripe Dashboard.

### 3. Install Dependencies

Dependencies are already installed, but if needed:

```bash
npm install
```

### 4. Start the Server

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

The server will start on port 3000 (or PORT from .env).

### 5. Test the Endpoints

Run the test script:

```bash
bash test_payment_api.sh
```

Or manually test using curl:

```bash
# Health check
curl http://localhost:3000/health

# API info
curl http://localhost:3000/v1/

# Join waitlist
curl -X POST http://localhost:3000/v1/waitlist/join \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1234567890",
    "company": "Tech Corp",
    "city": "San Francisco"
  }'

# Create payment intent
curl -X POST http://localhost:3000/v1/payments/create-intent \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 500.00,
    "currency": "USD"
  }'
```

## Complete Payment Flow Test

### Step 1: Get Stripe Test Keys

1. Go to https://dashboard.stripe.com/test/apikeys
2. Copy your test Secret key (sk_test_...)
3. Copy your test Publishable key (pk_test_...)
4. Update `.env` file with these keys

### Step 2: Test Payment Intent Creation

```bash
curl -X POST http://localhost:3000/v1/payments/create-intent \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 500.00,
    "currency": "USD",
    "metadata": {
      "projectName": "Test Live Stream"
    }
  }'
```

You'll receive a response with `clientSecret` and `paymentIntentId`.

### Step 3: Complete Payment with Stripe

In a real frontend, you would use Stripe.js to complete the payment. For testing:

1. Go to Stripe Dashboard > Developers > Events
2. Use the Stripe CLI or manually confirm the payment intent
3. Copy the payment intent ID (pi_xxx)

### Step 4: Confirm Payment and Create Booking

```bash
curl -X POST http://localhost:3000/v1/payments/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "paymentIntentId": "pi_xxx_your_payment_intent_id",
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
  }'
```

You'll receive a confirmation with:
- `confirmation_number`: Format #BG-YYYYMMDD-NNN
- `booking_id`: The created booking ID
- `payment_id`: The payment record ID
- `transaction_id`: Stripe payment intent ID

### Step 5: Check Payment Status

```bash
# Using confirmation number
curl http://localhost:3000/v1/payments/#BG-20251216-345/status

# Or using payment_id
curl http://localhost:3000/v1/payments/123/status
```

## Testing with Stripe Test Cards

Use these test card numbers in Stripe test mode:

- **Success:** 4242 4242 4242 4242
- **Decline:** 4000 0000 0000 0002
- **3D Secure Required:** 4000 0025 0000 3155
- **Insufficient Funds:** 4000 0000 0000 9995

All test cards:
- Use any future expiry date
- Use any 3-digit CVC
- Use any postal code

## Admin Endpoints (Requires Authentication)

### Get Waitlist Entries

```bash
# First, you need to authenticate and get a JWT token
# Then use it in the Authorization header

curl http://localhost:3000/v1/waitlist?page=1&limit=50 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Update Waitlist Status

```bash
curl -X PATCH http://localhost:3000/v1/waitlist/123/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "contacted"
  }'
```

## Database Verification

After creating a payment and booking, verify in MySQL:

```sql
-- Check payments table
SELECT * FROM payments ORDER BY created_at DESC LIMIT 5;

-- Check bookings table
SELECT * FROM stream_project_booking ORDER BY created_at DESC LIMIT 5;

-- Check waitlist entries
SELECT * FROM waitlist ORDER BY created_at DESC LIMIT 5;

-- Join payments with bookings
SELECT
  p.payment_id,
  p.confirmation_number,
  p.amount,
  p.status,
  b.project_name,
  b.event_date
FROM payments p
JOIN stream_project_booking b ON p.booking_id = b.stream_project_booking_id
ORDER BY p.created_at DESC
LIMIT 5;
```

## Troubleshooting

### Server won't start

1. Check if port 3000 is available:
   ```bash
   lsof -i :3000
   ```

2. Verify database connection:
   ```bash
   mysql -u root -p -e "USE revurge; SELECT 1;"
   ```

3. Check environment variables:
   ```bash
   cat .env | grep -E "DATABASE|STRIPE|JWT"
   ```

### Payments fail

1. Verify Stripe keys are correct (test mode vs live mode)
2. Check server logs for error messages
3. Verify payment intent status in Stripe Dashboard
4. Ensure database tables exist and have correct schema

### Waitlist entries not saving

1. Verify waitlist table exists:
   ```sql
   DESCRIBE waitlist;
   ```

2. Check for unique email constraint violations
3. Verify email format is valid

## Production Deployment Checklist

- [ ] Replace Stripe test keys with live keys
- [ ] Set up Stripe webhooks for payment events
- [ ] Add rate limiting to public endpoints
- [ ] Set up monitoring and alerting
- [ ] Configure CORS_ORIGINS for production domains
- [ ] Enable database backups
- [ ] Set NODE_ENV=production
- [ ] Review and update JWT_SECRET
- [ ] Add logging service integration
- [ ] Set up SSL/TLS certificates
- [ ] Configure firewall rules
- [ ] Add database connection pooling
- [ ] Set up error tracking (Sentry, etc.)

## API Documentation

Full API documentation is available in `README_PAYMENTS.md`.

## Support

For questions or issues:
1. Check server logs: `npm run dev` shows detailed logs
2. Review MySQL error logs
3. Check Stripe Dashboard for payment events
4. Verify environment variables are set correctly
