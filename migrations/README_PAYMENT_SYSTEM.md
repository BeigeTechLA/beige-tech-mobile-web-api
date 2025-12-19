# Payment Transactions System - CP + Equipment Bookings

## Overview
This migration creates a new payment system specifically for CP (Content Producer) and equipment bookings, replacing the old payment system that was tied to `stream_project_booking`.

## Database Schema

### payment_transactions
Primary table for tracking all CP + equipment booking payments.

**Key Fields:**
- `payment_id` - Auto-increment primary key
- `stripe_payment_intent_id` - Unique Stripe PaymentIntent ID
- `stripe_charge_id` - Stripe Charge ID from successful payment
- `creator_id` - FK to crew_members (the CP being booked)
- `user_id` - FK to users (null for guest checkouts)
- `guest_email` - Email for guest bookings
- `hours` - Number of hours booked
- `hourly_rate` - CP hourly rate at time of booking
- `cp_cost` - Total CP cost (hours × hourly_rate)
- `equipment_cost` - Total equipment rental cost
- `subtotal` - cp_cost + equipment_cost
- `beige_margin_percent` - Platform margin percentage (default 25%)
- `beige_margin_amount` - Platform margin in dollars
- `total_amount` - Final amount charged to customer
- `shoot_date` - Date of the shoot
- `location` - Shoot location
- `shoot_type` - Type of shoot (optional)
- `notes` - Additional booking notes
- `status` - Payment status (pending, succeeded, failed, refunded)

### payment_equipment
Junction table linking payments to equipment items.

**Key Fields:**
- `id` - Auto-increment primary key
- `payment_id` - FK to payment_transactions
- `equipment_id` - FK to equipment
- `equipment_price` - Equipment price at time of booking

## Migration Steps

1. **Run the migration:**
   ```bash
   mysql -h <host> -u <user> -p <database> < create_payment_transactions_system.sql
   ```

2. **Add environment variable:**
   Add to `.env` file:
   ```
   BEIGE_MARGIN_PERCENT=25.00
   ```
   This controls the platform margin percentage. Default is 25%.

3. **Verify tables created:**
   ```sql
   SHOW TABLES LIKE 'payment_%';
   DESCRIBE payment_transactions;
   DESCRIBE payment_equipment;
   ```

## API Endpoints

### POST /api/payments/create-intent
Create a Stripe PaymentIntent for CP + equipment booking.

**Request Body:**
```json
{
  "creator_id": 1,
  "hours": 4.5,
  "hourly_rate": 100.00,
  "equipment": [
    {
      "equipment_id": 5,
      "price": 50.00
    },
    {
      "equipment_id": 8,
      "price": 75.00
    }
  ],
  "shoot_date": "2024-01-15",
  "location": "Los Angeles, CA",
  "shoot_type": "Corporate Event",
  "notes": "Need setup by 9am",
  "user_id": 123,
  "guest_email": null
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "clientSecret": "pi_xxx_secret_xxx",
    "paymentIntentId": "pi_xxx",
    "pricing": {
      "hours": 4.5,
      "hourly_rate": 100.00,
      "cp_cost": 450.00,
      "equipment_cost": 125.00,
      "subtotal": 575.00,
      "beige_margin_percent": 25.00,
      "beige_margin_amount": 143.75,
      "total_amount": 718.75
    }
  }
}
```

### POST /api/payments/confirm
Confirm payment after Stripe payment succeeds.

**Request Body:**
```json
{
  "paymentIntentId": "pi_xxx",
  "creator_id": 1,
  "user_id": 123,
  "guest_email": null,
  "hours": 4.5,
  "hourly_rate": 100.00,
  "equipment": [
    {
      "equipment_id": 5,
      "price": 50.00
    }
  ],
  "shoot_date": "2024-01-15",
  "location": "Los Angeles, CA",
  "shoot_type": "Corporate Event",
  "notes": "Need setup by 9am"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment confirmed and booking created",
  "data": {
    "payment_id": 42,
    "stripe_payment_intent_id": "pi_xxx",
    "stripe_charge_id": "ch_xxx",
    "creator_id": 1,
    "shoot_date": "2024-01-15",
    "location": "Los Angeles, CA",
    "pricing": {
      "cp_cost": 450.00,
      "equipment_cost": 50.00,
      "subtotal": 500.00,
      "beige_margin_amount": 125.00,
      "total_amount": 625.00
    },
    "status": "succeeded"
  }
}
```

### GET /api/payments/:id/status
Get payment status by payment_id or stripe_payment_intent_id.

**Response:**
```json
{
  "success": true,
  "data": {
    "payment_id": 42,
    "stripe_payment_intent_id": "pi_xxx",
    "stripe_charge_id": "ch_xxx",
    "creator": {
      "crew_member_id": 1,
      "first_name": "John",
      "last_name": "Doe",
      "email": "john@example.com"
    },
    "user": {
      "id": 123,
      "name": "Jane Smith",
      "email": "jane@example.com"
    },
    "guest_email": null,
    "hours": 4.5,
    "hourly_rate": 100.00,
    "pricing": {
      "cp_cost": 450.00,
      "equipment_cost": 50.00,
      "subtotal": 500.00,
      "beige_margin_percent": 25.00,
      "beige_margin_amount": 125.00,
      "total_amount": 625.00
    },
    "shoot_date": "2024-01-15",
    "location": "Los Angeles, CA",
    "shoot_type": "Corporate Event",
    "notes": "Need setup by 9am",
    "equipment": [
      {
        "id": 1,
        "payment_id": 42,
        "equipment_id": 5,
        "equipment_price": 50.00,
        "equipment": {
          "equipment_id": 5,
          "equipment_name": "Sony A7S III",
          "manufacturer": "Sony",
          "model_number": "A7S3"
        }
      }
    ],
    "status": "succeeded",
    "created_at": "2024-01-10T10:00:00.000Z",
    "updated_at": "2024-01-10T10:00:00.000Z"
  }
}
```

## Pricing Calculation

The system calculates pricing as follows:

```javascript
cp_cost = hours × hourly_rate
equipment_cost = sum(equipment prices)
subtotal = cp_cost + equipment_cost
beige_margin_amount = subtotal × (beige_margin_percent / 100)
total_amount = subtotal + beige_margin_amount
```

**Example:**
- Hours: 4.5
- Hourly Rate: $100
- Equipment: [$50, $75]
- Margin: 25%

Calculation:
- cp_cost = 4.5 × 100 = $450.00
- equipment_cost = 50 + 75 = $125.00
- subtotal = 450 + 125 = $575.00
- beige_margin_amount = 575 × 0.25 = $143.75
- total_amount = 575 + 143.75 = $718.75

## Guest vs User Bookings

The system supports both authenticated users and guest checkouts:

**Authenticated User:**
```json
{
  "user_id": 123,
  "guest_email": null
}
```

**Guest Checkout:**
```json
{
  "user_id": null,
  "guest_email": "guest@example.com"
}
```

Database constraint ensures at least one of `user_id` or `guest_email` is provided.

## Error Handling

The system includes comprehensive validation:
- Creator (CP) existence verification
- Equipment existence verification
- Payment intent status validation
- Duplicate payment prevention
- Transaction rollback on errors

## Migration from Old System

This new system does NOT replace the old `payments` table, which remains for backward compatibility with `stream_project_booking`. The new `payment_transactions` system is specifically for CP + equipment bookings.

**Old System (still active):**
- Table: `payments`
- Related to: `stream_project_booking`
- Use case: Stream project bookings

**New System:**
- Tables: `payment_transactions`, `payment_equipment`
- Related to: `crew_members`, `equipment`, `users`
- Use case: CP + equipment bookings

## Security Considerations

1. All payment operations verify Stripe payment status
2. Transaction safety with database rollbacks
3. Duplicate payment prevention via unique constraint on `stripe_payment_intent_id`
4. Price validation at booking time (stored prices prevent manipulation)
5. Foreign key constraints ensure data integrity

## Monitoring & Analytics

Key metrics to track:
- Average booking value by CP
- Equipment utilization rates
- Platform margin revenue
- Guest vs authenticated user conversion
- Payment success/failure rates
- Refund rates by reason

## Support & Troubleshooting

**Common Issues:**

1. **Payment already processed (409 error)**
   - Check if payment_intent was already confirmed
   - Frontend should handle idempotency

2. **Equipment not found (404 error)**
   - Verify equipment_id exists and is active
   - Check equipment availability status

3. **Creator not found (404 error)**
   - Verify crew_member_id is valid
   - Check if creator is active

4. **Margin calculation mismatch**
   - Verify BEIGE_MARGIN_PERCENT in .env
   - Check for floating point rounding issues
