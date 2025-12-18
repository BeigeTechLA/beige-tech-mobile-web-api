# Payment System Quick Start Guide

## Installation Complete

The payment processing system has been successfully installed and integrated into the revure-v2-backend.

## Quick Setup (3 Steps)

### 1. Create Database Tables

```bash
mysql -u root -p revurge < migrations/create_payments_and_waitlist_tables.sql
```

### 2. Configure Stripe Keys

Edit `.env` file and add your Stripe test keys:

```env
STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE
STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE
```

Get test keys from: https://dashboard.stripe.com/test/apikeys

### 3. Start the Server

```bash
npm run dev
```

Server will start at: http://localhost:3000

## Quick Test

```bash
# Test health check
curl http://localhost:3000/health

# Test waitlist
curl -X POST http://localhost:3000/v1/waitlist/join \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com"}'

# Test payment intent creation
curl -X POST http://localhost:3000/v1/payments/create-intent \
  -H "Content-Type: application/json" \
  -d '{"amount":500,"currency":"USD"}'
```

## API Endpoints

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /v1/payments/create-intent | Create Stripe payment intent |
| POST | /v1/payments/confirm | Confirm payment and create booking |
| GET | /v1/payments/:id/status | Get payment status |
| POST | /v1/waitlist/join | Join waitlist |

### Admin Endpoints (Require Auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /v1/waitlist | Get all waitlist entries |
| PATCH | /v1/waitlist/:id/status | Update waitlist status |

## Payment Flow

```
Frontend                    Backend                     Stripe
   |                           |                           |
   |--POST /create-intent----->|                           |
   |                           |--Create Payment Intent--->|
   |<-----clientSecret---------|<--Payment Intent ID-------|
   |                           |                           |
   |--Stripe.js payment------->|                           |
   |                           |<--Payment Confirmed-------|
   |                           |                           |
   |--POST /confirm----------->|                           |
   |  (paymentIntentId +       |--Verify Payment---------->|
   |   bookingData)            |<--Status: succeeded-------|
   |                           |                           |
   |                           |--Create Booking---------->DB
   |                           |--Create Payment---------->DB
   |                           |--Generate Confirmation--->|
   |<--Confirmation Number-----|                           |
   |   (#BG-YYYYMMDD-NNN)      |                           |
```

## Confirmation Number Format

`#BG-YYYYMMDD-NNN`

Example: `#BG-20251216-345`

- BG: Booking prefix
- YYYYMMDD: Date
- NNN: Random 3-digit number

## Database Tables

### payments
- Stores all payment transactions
- Links to stream_project_booking via booking_id
- Links to users via user_id (nullable for guest bookings)
- Contains Stripe transaction ID and confirmation number

### waitlist
- Stores waitlist registrations
- Tracks status: pending, contacted, converted, inactive
- Simple table with contact information

## Stripe Test Cards

| Card Number | Result |
|-------------|--------|
| 4242 4242 4242 4242 | Success |
| 4000 0000 0000 0002 | Decline |
| 4000 0025 0000 3155 | 3D Secure |

Use any future expiry, any CVC, any postal code.

## Files Created

```
src/
├── models/
│   ├── payments.js              # Payment model
│   └── waitlist.js              # Waitlist model
├── controllers/
│   ├── payments.controller.js   # Payment business logic
│   └── waitlist.controller.js   # Waitlist business logic
├── routes/
│   ├── payments.routes.js       # Payment API routes
│   └── waitlist.routes.js       # Waitlist API routes
└── utils/
    └── confirmationNumber.js    # Confirmation number generator

migrations/
└── create_payments_and_waitlist_tables.sql

Documentation:
├── README_PAYMENTS.md           # Full API documentation
├── SETUP_INSTRUCTIONS.md        # Detailed setup guide
└── PAYMENT_SYSTEM_QUICKSTART.md # This file
```

## Common Commands

```bash
# Start development server
npm run dev

# Run test script
bash test_payment_api.sh

# Check database tables
mysql -u root -p revurge -e "DESCRIBE payments;"
mysql -u root -p revurge -e "DESCRIBE waitlist;"

# View recent payments
mysql -u root -p revurge -e "SELECT * FROM payments ORDER BY created_at DESC LIMIT 5;"

# View recent waitlist entries
mysql -u root -p revurge -e "SELECT * FROM waitlist ORDER BY created_at DESC LIMIT 5;"
```

## Troubleshooting

### "Table doesn't exist"
Run the migration: `mysql -u root -p revurge < migrations/create_payments_and_waitlist_tables.sql`

### "Invalid Stripe key"
Check .env file and ensure keys start with `sk_test_` for test mode

### "Cannot connect to database"
Verify MySQL is running and credentials in .env are correct

### "Port already in use"
Change PORT in .env or kill process: `lsof -ti:3000 | xargs kill -9`

## Next Steps

1. Read full documentation: `README_PAYMENTS.md`
2. Review setup instructions: `SETUP_INSTRUCTIONS.md`
3. Test with Stripe test mode
4. Integrate with frontend
5. Set up webhooks for production
6. Configure monitoring and alerts

## Support

- Full API docs: README_PAYMENTS.md
- Setup guide: SETUP_INSTRUCTIONS.md
- Stripe docs: https://stripe.com/docs
- Test API keys: https://dashboard.stripe.com/test/apikeys

## Production Checklist

Before going live:
- [ ] Replace test Stripe keys with live keys
- [ ] Set up Stripe webhooks
- [ ] Configure production database
- [ ] Set NODE_ENV=production
- [ ] Enable SSL/TLS
- [ ] Add rate limiting
- [ ] Set up monitoring
- [ ] Configure backups
- [ ] Review security settings
- [ ] Test all payment flows
