# Discount Code Validation Testing Guide

## Overview

This document outlines the testing scenarios for the discount code booking_id validation feature.

## Backend Testing

### Test Scenario 1: General Discount Code (booking_id = NULL)

**Purpose:** Verify that discount codes without a specific booking_id work for any booking.

**Steps:**

1. Create a discount code without specifying a booking_id:

```bash
POST /api/sales/discount-codes
{
  "discount_type": "percentage",
  "discount_value": 10,
  "usage_type": "one_time"
}
```

2. Try applying it to booking 123:

```bash
POST /api/sales/discount-codes/[CODE]/apply
{
  "quote_id": [QUOTE_ID],
  "booking_id": 123,
  "guest_email": "test@example.com"
}
```

**Expected Result:** ✅ Discount should be applied successfully.

3. Try applying the same code to booking 456:

```bash
POST /api/sales/discount-codes/[CODE]/apply
{
  "quote_id": [QUOTE_ID_2],
  "booking_id": 456,
  "guest_email": "test@example.com"
}
```

**Expected Result:** ✅ Should work for any booking (respecting usage limits).

---

### Test Scenario 2: Booking-Specific Discount (booking_id = 123)

**Purpose:** Verify that discount codes tied to a specific booking only work for that booking.

**Steps:**

1. Create a discount code for booking 123:

```bash
POST /api/sales/discount-codes
{
  "booking_id": 123,
  "discount_type": "percentage",
  "discount_value": 15,
  "usage_type": "one_time"
}
```

2. Try applying it to the correct booking (123):

```bash
POST /api/sales/discount-codes/[CODE]/apply
{
  "quote_id": [QUOTE_ID],
  "booking_id": 123,
  "guest_email": "test@example.com"
}
```

**Expected Result:** ✅ Discount should be applied successfully.

3. Try applying it to a different booking (456):

```bash
POST /api/sales/discount-codes/[CODE]/apply
{
  "quote_id": [QUOTE_ID_2],
  "booking_id": 456,
  "guest_email": "test@example.com"
}
```

**Expected Result:** ❌ Should fail with error: "This discount code is not valid for this booking"

---

### Test Scenario 3: Validation Endpoint with booking_id

**Purpose:** Verify that the validation endpoint correctly checks booking_id.

**Steps:**

1. Create a discount code for booking 123.

2. Validate without booking_id:

```bash
GET /api/sales/discount-codes/[CODE]/validate
```

**Expected Result:** ✅ Should return valid (no booking restriction check).

3. Validate with correct booking_id:

```bash
GET /api/sales/discount-codes/[CODE]/validate?booking_id=123
```

**Expected Result:** ✅ Should return valid.

4. Validate with incorrect booking_id:

```bash
GET /api/sales/discount-codes/[CODE]/validate?booking_id=456
```

**Expected Result:** ❌ Should return invalid with message "This discount code is not valid for this booking".

---

### Test Scenario 4: Payment Link Flow

**Purpose:** Verify that discount codes created via payment links are protected.

**Steps:**

1. Create a payment link with a discount for booking 123:

```bash
POST /api/sales/payment-links
{
  "booking_id": 123,
  "discount_code_id": [DISCOUNT_CODE_ID]
}
```

2. Try to apply that discount code to a different booking (456):

```bash
POST /api/sales/discount-codes/[CODE]/apply
{
  "quote_id": [QUOTE_ID_2],
  "booking_id": 456,
  "guest_email": "test@example.com"
}
```

**Expected Result:** ❌ Should fail with validation error.

---

## Frontend Testing

### Test Scenario 5: Discount Code Input UI

**Purpose:** Verify the discount code input works on the payment page.

**Steps:**

1. Navigate to payment page: `/search-results/payment?shootId=[BOOKING_ID]`
2. Locate the "Discount Code (Optional)" input field below the referral code
3. Enter a valid discount code that matches the booking
4. Observe real-time validation (green border, checkmark, discount preview)
5. Click "Apply" button
6. Verify success toast message appears
7. Check that discount is shown in the price breakdown
8. Verify the total is updated with the discount applied

**Expected Results:**

- ✅ Input field is visible and styled correctly
- ✅ Real-time validation shows loading spinner while validating
- ✅ Valid codes show green border with checkmark and preview text
- ✅ Apply button appears for valid codes
- ✅ Success message on application
- ✅ Price breakdown shows "Discount Applied: -$X.XX" in green
- ✅ Total is reduced by discount amount

---

### Test Scenario 6: Invalid Discount Code

**Purpose:** Verify error handling for invalid codes.

**Steps:**

1. Navigate to payment page
2. Enter an invalid or expired discount code
3. Observe the error state

**Expected Results:**

- ❌ Red border around input
- ❌ Red X icon displayed
- ❌ Error message: "Invalid or expired discount code"

---

### Test Scenario 7: Wrong Booking Discount Code

**Purpose:** Verify that codes for other bookings are rejected.

**Steps:**

1. Get a discount code created for booking A
2. Navigate to payment page for booking B
3. Enter the discount code from booking A
4. Observe the error

**Expected Results:**

- ❌ Validation fails
- ❌ Error message: "This discount code is not valid for this booking"

---

## Manual Testing Checklist

Backend:

- [ ] Test general discount on multiple bookings
- [ ] Test booking-specific discount on correct booking
- [ ] Test booking-specific discount on wrong booking
- [ ] Test validation endpoint without booking_id
- [ ] Test validation endpoint with booking_id
- [ ] Test expired codes
- [ ] Test usage limits (one_time, multi_use)
- [ ] Test inactive codes

Frontend:

- [ ] Discount input field renders correctly
- [ ] Real-time validation works
- [ ] Apply button functions
- [ ] Success toast appears
- [ ] Price breakdown updates
- [ ] Total amount updates
- [ ] Error messages display correctly
- [ ] Invalid code handling
- [ ] Wrong booking code handling
- [ ] Page refresh after apply works correctly

## Test Environment Setup

### Prerequisites

1. Backend server running: `npm run dev` (port 5001)
2. Frontend server running: `npm run dev` (port 3000)
3. Database with test bookings and quotes
4. Sales rep account with permissions to create discount codes

### Sample Test Data

```javascript
// Test Booking 1
booking_id: 123;
quote_id: 456;

// Test Booking 2
booking_id: 789;
quote_id: 101;

// General Discount Code
code: "REV10OFF";
booking_id: null;
discount_type: "percentage";
discount_value: 10;

// Specific Discount Code
code: "REV15BOOKING123";
booking_id: 123;
discount_type: "percentage";
discount_value: 15;
```

## Success Criteria

All tests pass if:

1. ✅ General discount codes work for any booking
2. ✅ Booking-specific codes ONLY work for their designated booking
3. ✅ Validation endpoint correctly checks booking_id
4. ✅ Frontend UI displays and functions correctly
5. ✅ Error messages are clear and user-friendly
6. ✅ No console errors or warnings
7. ✅ Price calculations are accurate
8. ✅ All edge cases are handled gracefully
