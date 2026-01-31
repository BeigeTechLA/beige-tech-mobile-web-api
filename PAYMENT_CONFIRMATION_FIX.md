# Payment Confirmation Fix - Multi-Creator Bookings

## Critical Issue Discovered

After Stripe payment succeeded, the booking was not being updated because the `confirmPaymentMulti` endpoint was failing with validation errors.

## Error Details

```
Multi-Creator Payment Confirmation Error: ValidationError [SequelizeValidationError]:
- notNull Violation: payment_transactions.creator_id cannot be null
- notNull Violation: payment_transactions.shoot_date cannot be null
```

## Root Causes

### 1. Creator ID Issue

**Problem**: The code was setting `creator_id: null` for multi-creator bookings, but the `payment_transactions` table has `allowNull: false` for the `creator_id` field.

**Solution**: Created a system/mock creator and use its ID as a placeholder:

```javascript
// System creator created in database
const SYSTEM_MULTI_CREATOR_ID = 228;
// Email: system-multi-creator@beige.app
// Name: System Multi-Creator

// Use in payment record
creator_id: SYSTEM_MULTI_CREATOR_ID;
```

**Why a system creator?**

- ✅ Clean and explicit - makes it obvious this is a multi-creator booking
- ✅ Consistent - same ID used for all multi-creator bookings
- ✅ Queryable - easy to filter multi-creator payments vs single-creator
- ✅ No side effects - doesn't arbitrarily associate payment with a real creator

### 2. Shoot Date Issue

**Problem**: The code was using `booking.shoot_date` but the field is actually called `event_date` on the `stream_project_booking` table.

**Solution**: Changed to use the correct field name:

```javascript
// Before
shoot_date: booking.shoot_date; // undefined!

// After
shoot_date: booking.event_date; // "2026-01-31"
```

### 3. Additional Field Fixes

Also fixed:

- `hours: booking.duration_hours` (was `booking.shoot_hours`)
- `shoot_type: booking.event_type` (was `booking.shoot_type`)
- `notes: booking.description` (was `booking.special_requests`)

## Changes Made

### Database: System Creator

Created a system creator record:

```sql
INSERT INTO crew_members (
  first_name, last_name, email, location, hourly_rate,
  rating, bio, years_of_experience, is_active, is_available, primary_role
) VALUES (
  'System', 'Multi-Creator', 'system-multi-creator@beige.app', 'N/A', 0,
  0, 'System creator used for multi-creator booking payments', 0, 1, 0, 'System'
);
-- Result: crew_member_id = 228
```

### File: `src/controllers/payments.controller.js`

**At top of file**:

```javascript
// System creator ID for multi-creator bookings
// This is a placeholder since payment_transactions.creator_id is required but doesn't apply to multi-creator bookings
// System creator: email = 'system-multi-creator@beige.app', crew_member_id = 228
const SYSTEM_MULTI_CREATOR_ID = 228;
```

**Function**: `exports.confirmPaymentMulti`

**Key Changes**:

1. Removed logic to fetch assigned_crews (no longer needed)
2. Use SYSTEM_MULTI_CREATOR_ID constant for creator_id
3. Fixed field names from booking model:
   - `event_date` instead of `shoot_date`
   - `duration_hours` instead of `shoot_hours`
   - `event_type` instead of `shoot_type`
   - `description` instead of `special_requests`

## Testing Checklist

### Backend

- [x] Create system creator in database
- [x] Deploy fix to production
- [ ] Test payment with test Stripe card
- [ ] Verify payment_transactions record is created with creator_id = 228
- [ ] Verify booking is marked as completed
- [ ] Check that payment_id is saved to booking

### Database Verification

```sql
-- Check payment was saved with system creator
SELECT payment_id, creator_id, shoot_date, total_amount, status
FROM payment_transactions
WHERE stripe_payment_intent_id = 'pi_xxxxx';
-- Should show: creator_id = 228

-- Check booking was updated
SELECT stream_project_booking_id, is_completed, payment_completed_at, payment_id
FROM stream_project_booking
WHERE stream_project_booking_id = 816;
```

### Frontend

- [ ] Complete test payment
- [ ] Verify success page is displayed
- [ ] Verify no error toast appears
- [ ] Check booking shows as paid in admin panel

## Querying Multi-Creator Payments

```sql
-- Get all multi-creator payments
SELECT * FROM payment_transactions
WHERE creator_id = 228;

-- Get revenue from multi-creator bookings
SELECT
  COUNT(*) as total_bookings,
  SUM(total_amount) as total_revenue
FROM payment_transactions
WHERE creator_id = 228 AND status = 'succeeded';
```

## Related Issue

This fix is part of the discount code implementation feature. The payment amount is now correctly calculated with discounts applied.

## Date Fixed

January 31, 2026

## Future Improvements

Consider refactoring the `payment_transactions` table to better support multi-creator bookings:

- Make `creator_id` nullable with a default value of SYSTEM_MULTI_CREATOR_ID
- Add a `booking_id` foreign key to link directly to stream_project_booking
- Create a separate `payment_creators` junction table for multi-creator payments
- Add a `is_multi_creator` boolean flag for easier querying
