# Quick Test Guide - Booking Creator Assignment

**Date**: 2025-12-28
**Purpose**: Rapid testing of new API endpoints

---

## Prerequisites

1. Server running: `npm run dev` (port 5001)
2. Database accessible (MySQL/MariaDB with `revurge` database)
3. At least one booking exists (e.g., booking ID 140)
4. At least one creator exists (e.g., creator ID 1)

---

## Quick Tests (Copy & Paste)

### 1. Assign Creator to Booking

```bash
# Replace 140 with your booking ID and 1 with your creator ID
curl -X POST http://localhost:5001/api/guest-bookings/140/assign-creators \
  -H "Content-Type: application/json" \
  -d '{"creator_ids": [1]}'
```

**Expected Response**:
```json
{
  "success": true,
  "message": "Creators assigned successfully",
  "data": {
    "booking_id": 140,
    "assigned_creators": [
      {
        "assignment_id": 1,
        "creator_id": 1,
        "status": "selected"
      }
    ]
  }
}
```

---

### 2. Get Payment Details

```bash
# Get booking with assigned creators
curl http://localhost:5001/api/guest-bookings/140/payment-details
```

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "booking": {
      "booking_id": 140,
      "project_name": "...",
      "guest_email": "...",
      "event_date": "...",
      "duration_hours": 4,
      "budget": 2000
    },
    "creators": [
      {
        "assignment_id": 1,
        "creator_id": 1,
        "status": "selected",
        "details": {
          "crew_member_id": 1,
          "name": "...",
          "hourly_rate": 150,
          "rating": 4.5
        }
      }
    ],
    "quote": null,
    "payment_status": "pending"
  }
}
```

---

### 3. Auto-Assign Creator via Query Param

```bash
# Automatically assign creator 2 while fetching details
curl http://localhost:5001/api/guest-bookings/140/payment-details?creator_id=2
```

**Expected**: Same as above, but with creator ID 2 added to assignments

---

### 4. Use Utility Script

```bash
# Assign creator to booking via script
node scripts/assign-creators-to-booking.js 140 1
```

**Expected Output**:
```
🔍 Assigning creators to booking ID 140...
Creator IDs: 1
✅ Found booking: Corporate Video Shoot
   Guest Email: client@example.com
✅ All creators found:
   - John Doe (ID: 1)
     Email: john@example.com
     Rate: $150/hr
➕ Creating new assignments...
✅ Created 1 new assignments
✅ Verification - Booking 140 now has 1 assigned creators:
   - John Doe
     Assignment ID: 1
     Status: selected
🎉 Successfully assigned creators to booking 140
```

---

## Verify in Database

```sql
-- Check booking exists
SELECT stream_project_booking_id, project_name, guest_email, event_date
FROM stream_project_booking
WHERE stream_project_booking_id = 140;

-- Check assigned creators
SELECT ac.id, ac.project_id, ac.crew_member_id, ac.status,
       cm.first_name, cm.last_name, cm.hourly_rate
FROM assigned_crew ac
JOIN crew_members cm ON ac.crew_member_id = cm.crew_member_id
WHERE ac.project_id = 140
  AND ac.is_active = 1;

-- Check if quote exists
SELECT quote_id, total, status
FROM quotes
WHERE booking_id = 140;
```

---

## Common Test Scenarios

### Test 1: Assign Multiple Creators

```bash
curl -X POST http://localhost:5001/api/guest-bookings/140/assign-creators \
  -H "Content-Type: application/json" \
  -d '{"creator_ids": [1, 2, 3]}'
```

**Expected**: 3 assignments created

---

### Test 2: Replace Existing Assignment

```bash
# First assignment
curl -X POST http://localhost:5001/api/guest-bookings/140/assign-creators \
  -H "Content-Type: application/json" \
  -d '{"creator_ids": [1]}'

# Second assignment (replaces first)
curl -X POST http://localhost:5001/api/guest-bookings/140/assign-creators \
  -H "Content-Type: application/json" \
  -d '{"creator_ids": [2]}'

# Verify only creator 2 is assigned
curl http://localhost:5001/api/guest-bookings/140/payment-details
```

**Expected**: Only creator 2 in response (creator 1 removed)

---

### Test 3: Invalid Booking ID

```bash
curl -X POST http://localhost:5001/api/guest-bookings/99999/assign-creators \
  -H "Content-Type: application/json" \
  -d '{"creator_ids": [1]}'
```

**Expected**: 404 Not Found
```json
{
  "success": false,
  "message": "Booking not found"
}
```

---

### Test 4: Invalid Creator ID

```bash
curl -X POST http://localhost:5001/api/guest-bookings/140/assign-creators \
  -H "Content-Type: application/json" \
  -d '{"creator_ids": [99999]}'
```

**Expected**: 400 Bad Request
```json
{
  "success": false,
  "message": "One or more creator IDs are invalid"
}
```

---

### Test 5: Empty Creator Array

```bash
curl -X POST http://localhost:5001/api/guest-bookings/140/assign-creators \
  -H "Content-Type: application/json" \
  -d '{"creator_ids": []}'
```

**Expected**: 400 Bad Request
```json
{
  "success": false,
  "message": "creator_ids must be a non-empty array"
}
```

---

## Frontend Testing Flow

1. **Create Booking** (existing endpoint)
   ```javascript
   const booking = await fetch('/api/guest-bookings/create', {
     method: 'POST',
     body: JSON.stringify({ order_name: 'Test', guest_email: 'test@example.com' })
   });
   const { booking_id } = booking.data; // e.g., 140
   ```

2. **Search Creators** (existing endpoint)
   ```javascript
   const creators = await fetch('/api/creators/search?location=LA');
   ```

3. **Assign Creator** (NEW endpoint)
   ```javascript
   await fetch(`/api/guest-bookings/${booking_id}/assign-creators`, {
     method: 'POST',
     body: JSON.stringify({ creator_ids: [selectedCreatorId] })
   });
   ```

4. **Navigate to Payment**
   ```javascript
   router.push(`/search-results/${selectedCreatorId}/payment?shootId=${booking_id}`);
   ```

5. **Load Payment Page** (NEW endpoint)
   ```javascript
   const paymentData = await fetch(
     `/api/guest-bookings/${shootId}/payment-details?creator_id=${creatorId}`
   );
   // paymentData includes: booking, creators, quote, payment_status
   ```

---

## Checklist

- [ ] Server starts without errors (`npm run dev`)
- [ ] `POST /assign-creators` returns success with valid IDs
- [ ] `POST /assign-creators` returns 404 for invalid booking
- [ ] `POST /assign-creators` returns 400 for invalid creator
- [ ] `GET /payment-details` returns booking and creators
- [ ] `GET /payment-details?creator_id=X` auto-assigns creator
- [ ] Script `assign-creators-to-booking.js` runs successfully
- [ ] Database shows correct assignments in `assigned_crew` table
- [ ] Multiple creators can be assigned to one booking
- [ ] Existing assignments are replaced when new ones created
- [ ] Frontend can integrate endpoints successfully

---

## Next Steps After Testing

1. ✅ Verify all endpoints work
2. ✅ Update booking 140 with creator using script
3. ✅ Integrate with frontend payment page
4. ✅ Test complete user flow: booking → search → select → payment
5. Deploy to staging environment

