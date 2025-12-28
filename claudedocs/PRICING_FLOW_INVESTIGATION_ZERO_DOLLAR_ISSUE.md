# Pricing Flow Investigation - Zero Dollar Issue

**Date**: 2025-12-28
**Issue**: Review & Match page shows $0.00 instead of calculated pricing
**User Selection**: 7 creators (3 videographers, 2 photographers, 2 cinematographers), 19.25 hours, wedding event
**Expected Total**: $36,972.02
**Displayed Total**: $0.00

---

## Problem Analysis

### Issue Summary
The frontend "Review & Match" page (localhost:3000/book-a-shoot) displays "Total $0.00" even when the user has selected 7 content producers for a 19-hour wedding shoot. The pricing calculation system exists and works correctly on the backend, but there is **NO INTEGRATION** between creator selection and pricing calculation.

### Root Cause
**MISSING FRONTEND-BACKEND INTEGRATION**: The frontend does not call the pricing calculation API when creators are selected.

The system has two parallel concepts that are not connected:
1. **Creator Selection** - Users select real crew members (crew_members table)
2. **Pricing Calculation** - Backend calculates pricing from catalog items (pricing_items table)

The frontend selects creators but never maps them to pricing items or calls the pricing API.

---

## Architecture Understanding

### Pricing System Design

The backend uses a **CATALOG-BASED PRICING MODEL**:

**Pricing Tables**:
- `pricing_categories` - Service categories (Pre-Production, Services, Editing, etc.)
- `pricing_items` - Catalog items with rates (Photographer $275/hr, Videographer $275/hr, etc.)
- `pricing_discount_tiers` - Discount percentages based on shoot hours
- `quotes` - Saved price quotes
- `quote_line_items` - Individual items in each quote

**Pricing Flow**:
```
1. Select pricing items from catalog
2. Specify quantities and shoot hours
3. POST /v1/pricing/calculate
   {
     items: [{item_id: 11, quantity: 3}],  // 3 videographers
     shootHours: 19.25,
     eventType: "wedding"
   }
4. Backend calculates:
   - Subtotal (items × rates × hours)
   - Discount based on hours (wedding >3.5hrs = 30%)
   - Margin (default 25%)
   - Total
5. Return quote to frontend
```

### Service Pricing Items (Production Database)

```
item_id: 10 | Photographer    | $275/hour | per_hour
item_id: 11 | Videographer    | $275/hour | per_hour
item_id: 12 | Cinematographer | $410/hour | per_hour
```

---

## Expected vs Actual Calculation

### User Selection (From Screenshot)
- **Event**: "tyty (wedding)"
- **Creators**: 7 total
  - 3 × Videographers
  - 2 × Photographers
  - 2 × Cinematographers
- **Duration**: 19 hours 15 mins (19.25 hours)
- **Location**: Los Angeles, California
- **Date**: Dec 28, 2025, 4:00 AM - 11:15 PM

### Expected Pricing Calculation

**API Call** (should be made by frontend):
```javascript
POST /v1/pricing/calculate
{
  "items": [
    { "item_id": 11, "quantity": 3 },  // 3 Videographers @ $275/hr
    { "item_id": 10, "quantity": 2 },  // 2 Photographers @ $275/hr
    { "item_id": 12, "quantity": 2 }   // 2 Cinematographers @ $410/hr
  ],
  "shootHours": 19.25,
  "eventType": "wedding"
}
```

**Backend Calculation** (verified on production):
```json
{
  "pricingMode": "wedding",
  "shootHours": 19.25,
  "lineItems": [
    {
      "item_name": "Videographer",
      "quantity": 3,
      "unit_price": 275,
      "line_total": 15881.25
    },
    {
      "item_name": "Photographer",
      "quantity": 2,
      "unit_price": 275,
      "line_total": 10587.50
    },
    {
      "item_name": "Cinematographer",
      "quantity": 2,
      "unit_price": 410,
      "line_total": 15785.00
    }
  ],
  "subtotal": 42253.75,
  "discountPercent": 30,
  "discountAmount": 12676.13,
  "priceAfterDiscount": 29577.62,
  "marginPercent": 25,
  "marginAmount": 7394.40,
  "total": 36972.02
}
```

**Pricing Breakdown**:
- 3 Videographers × $275/hr × 19.25hrs = $15,881.25
- 2 Photographers × $275/hr × 19.25hrs = $10,587.50
- 2 Cinematographers × $410/hr × 19.25hrs = $15,785.00
- **Subtotal**: $42,253.75
- **Wedding Discount** (30% for >3.5 hours): -$12,676.13
- **After Discount**: $29,577.62
- **Beige Margin** (25%): +$7,394.40
- **Total**: **$36,972.02**

### Actual Displayed Total
```
$0.00
```

**Missing**: $36,972.02 (100% of expected pricing)

---

## Why Pricing Shows $0.00

### Missing Integration Points

1. **No Creator-to-Item Mapping**: Frontend selects creators but doesn't map them to pricing items
2. **No API Call**: Frontend never calls POST /v1/pricing/calculate
3. **No Quote Display**: Frontend doesn't receive or display the calculated quote
4. **No Storage**: The calculated quote is not saved to the database with the booking

### Current Frontend Behavior
```javascript
// What the frontend SHOULD be doing but ISN'T:

// When user selects creators:
const selectedCreators = [/* 7 creators */];

// 1. Map creators to pricing items
const videographers = selectedCreators.filter(c => c.role === 'videographer').length;
const photographers = selectedCreators.filter(c => c.role === 'photographer').length;
const cinematographers = selectedCreators.filter(c => c.role === 'cinematographer').length;

const items = [
  { item_id: 11, quantity: videographers },
  { item_id: 10, quantity: photographers },
  { item_id: 12, quantity: cinematographers }
];

// 2. Calculate pricing
const response = await fetch('/v1/pricing/calculate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    items,
    shootHours: 19.25,
    eventType: 'wedding'
  })
});

const quote = await response.json();

// 3. Display total
setTotal(quote.data.total); // Should be $36,972.02
```

**Current behavior**: None of the above code exists! Frontend just shows $0.00 as a static value.

---

## Solution Options

### Option 1: New Backend Endpoint (RECOMMENDED)

Create a dedicated endpoint that accepts creator IDs and automatically handles the mapping.

**New Endpoint**: `POST /v1/pricing/calculate-from-creators`

**Request**:
```javascript
{
  "creator_ids": [1, 2, 3, 4, 5, 6, 7],  // Selected creator IDs
  "shoot_hours": 19.25,
  "event_type": "wedding",
  "add_on_items": []  // Optional additional catalog items
}
```

**Response**:
```javascript
{
  "success": true,
  "data": {
    "quote": {
      "pricingMode": "wedding",
      "shootHours": 19.25,
      "creators": [
        { "crew_member_id": 1, "name": "Alex Rivera", "role": "Videographer" },
        // ... other creators
      ],
      "lineItems": [
        { "item_name": "Videographer", "quantity": 3, "line_total": 15881.25 },
        { "item_name": "Photographer", "quantity": 2, "line_total": 10587.50 },
        { "item_name": "Cinematographer", "quantity": 2, "line_total": 15785.00 }
      ],
      "subtotal": 42253.75,
      "discountPercent": 30,
      "discountAmount": 12676.13,
      "priceAfterDiscount": 29577.62,
      "marginPercent": 25,
      "marginAmount": 7394.40,
      "total": 36972.02
    }
  }
}
```

**Benefits**:
- ✅ Simple frontend integration (just pass creator IDs)
- ✅ Backend handles all complexity of role mapping
- ✅ Reuses existing pricing calculation logic
- ✅ Clean separation of concerns
- ✅ Easy to add add-on items later

**Implementation**: See code below

---

### Option 2: Frontend Manual Mapping

Frontend fetches pricing catalog, maps creators to items, and calls existing endpoint.

**Frontend Code**:
```javascript
// 1. Fetch pricing catalog to get item IDs
const catalogResponse = await fetch('/v1/pricing/catalog?event_type=wedding');
const catalog = await catalogResponse.json();

// Find service item IDs
const photographerItem = catalog.data.categories
  .find(cat => cat.slug === 'services')
  .items.find(item => item.slug === 'photographer');

// 2. Count selected creators by role
const creatorsByRole = selectedCreators.reduce((acc, creator) => {
  const roleName = getRoleName(creator.primary_role);
  acc[roleName] = (acc[roleName] || 0) + 1;
  return acc;
}, {});

// 3. Map to pricing items
const items = [];
if (creatorsByRole['Videographer']) {
  items.push({ item_id: 11, quantity: creatorsByRole['Videographer'] });
}
if (creatorsByRole['Photographer']) {
  items.push({ item_id: 10, quantity: creatorsByRole['Photographer'] });
}
if (creatorsByRole['Cinematographer']) {
  items.push({ item_id: 12, quantity: creatorsByRole['Cinematographer'] });
}

// 4. Calculate quote
const quote = await fetch('/v1/pricing/calculate', {
  method: 'POST',
  body: JSON.stringify({ items, shootHours: 19.25, eventType: 'wedding' })
});
```

**Challenges**:
- ❌ Frontend needs to know pricing item IDs
- ❌ More complex mapping logic on frontend
- ❌ Role name mismatches (primary_role = ID, not name)
- ❌ Harder to maintain if pricing structure changes

---

## Implementation: New Endpoint (Option 1)

### 1. Add Controller Method

**File**: `src/controllers/pricing.controller.js`

```javascript
/**
 * Calculate pricing from selected creators
 * POST /api/pricing/calculate-from-creators
 * Body: {
 *   creator_ids: [1, 2, 3],
 *   shoot_hours: number,
 *   event_type: string,
 *   add_on_items: [{item_id, quantity}] (optional)
 * }
 */
exports.calculateFromCreators = async (req, res) => {
  try {
    const { creator_ids, shoot_hours, event_type, add_on_items = [] } = req.body;

    // Validate inputs
    if (!creator_ids || !Array.isArray(creator_ids) || creator_ids.length === 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'creator_ids must be a non-empty array'
      });
    }

    if (shoot_hours === undefined || shoot_hours < 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'shoot_hours is required and must be non-negative'
      });
    }

    // Fetch creators with their roles
    const creators = await db.crew_members.findAll({
      where: {
        crew_member_id: creator_ids,
        is_active: 1
      },
      attributes: ['crew_member_id', 'first_name', 'last_name', 'primary_role', 'hourly_rate']
    });

    if (creators.length !== creator_ids.length) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'One or more creator IDs are invalid'
      });
    }

    // Define role-to-pricing-item mapping
    // Note: primary_role is the role_id foreign key
    const ROLE_TO_ITEM_MAP = {
      1: 11,  // Videographer → item_id 11
      2: 10,  // Photographer → item_id 10
      3: 11,  // Videographer (duplicate role) → item_id 11
      4: 10,  // Photographer (duplicate role) → item_id 10
      // Add cinematographer mapping when role_id is identified
    };

    // Count creators by role and map to pricing items
    const roleCounts = {};
    creators.forEach(creator => {
      const roleId = creator.primary_role;
      roleCounts[roleId] = (roleCounts[roleId] || 0) + 1;
    });

    // Create pricing items array
    const pricingItems = [];
    Object.entries(roleCounts).forEach(([roleId, count]) => {
      const itemId = ROLE_TO_ITEM_MAP[roleId];
      if (itemId) {
        pricingItems.push({
          item_id: itemId,
          quantity: count
        });
      }
    });

    // Merge with add-on items
    const allItems = [...pricingItems, ...add_on_items];

    // Calculate quote using existing service
    const quote = await pricingService.calculateQuote({
      items: allItems,
      shootHours: parseFloat(shoot_hours),
      eventType: event_type
    });

    // Add creator details to response
    const creatorDetails = creators.map(c => ({
      crew_member_id: c.crew_member_id,
      name: `${c.first_name} ${c.last_name}`,
      role_id: c.primary_role,
      hourly_rate: parseFloat(c.hourly_rate || 0)
    }));

    res.json({
      success: true,
      data: {
        quote: {
          ...quote,
          creators: creatorDetails
        }
      }
    });

  } catch (error) {
    console.error('Error calculating pricing from creators:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to calculate pricing',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
```

### 2. Add Route

**File**: `src/routes/pricing.routes.js`

```javascript
router.post('/calculate-from-creators', pricingController.calculateFromCreators);
```

### 3. Test Endpoint

```bash
curl -X POST http://98.81.117.41:5001/v1/pricing/calculate-from-creators \
  -H "Content-Type: application/json" \
  -d '{
    "creator_ids": [1, 2, 3, 4, 5, 6, 7],
    "shoot_hours": 19.25,
    "event_type": "wedding"
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "quote": {
      "pricingMode": "wedding",
      "shootHours": 19.25,
      "creators": [
        { "crew_member_id": 1, "name": "Alex Rivera", "role_id": 1 },
        ...
      ],
      "lineItems": [...],
      "subtotal": 42253.75,
      "total": 36972.02
    }
  }
}
```

---

## Frontend Integration Guide

### 1. Update Review & Match Page

**When creators are selected or shoot hours change:**

```javascript
async function updatePricing() {
  // Get selected creator IDs
  const creatorIds = selectedCreators.map(c => c.crew_member_id);

  // Get shoot duration in hours
  const shootHours = calculateShootHours(startTime, endTime);

  // Get event type
  const eventType = bookingData.event_type; // e.g., "wedding"

  try {
    const response = await fetch('/v1/pricing/calculate-from-creators', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creator_ids: creatorIds,
        shoot_hours: shootHours,
        event_type: eventType
      })
    });

    const result = await response.json();

    if (result.success) {
      // Update total display
      setTotalAmount(result.data.quote.total);

      // Optionally show pricing breakdown
      setPricingBreakdown({
        subtotal: result.data.quote.subtotal,
        discount: result.data.quote.discountAmount,
        margin: result.data.quote.marginAmount,
        total: result.data.quote.total
      });
    }
  } catch (error) {
    console.error('Failed to calculate pricing:', error);
    setTotalAmount(0);
  }
}

// Call when creators change
useEffect(() => {
  if (selectedCreators.length > 0 && shootHours > 0) {
    updatePricing();
  }
}, [selectedCreators, shootHours]);
```

### 2. Save Quote with Booking

**When creating booking:**

```javascript
// 1. Create booking first
const bookingResponse = await fetch('/v1/guest-bookings/create', {
  method: 'POST',
  body: JSON.stringify(bookingData)
});

const booking = await bookingResponse.json();
const bookingId = booking.data.booking_id;

// 2. Calculate and save quote
const quoteResponse = await fetch('/v1/pricing/calculate-from-creators', {
  method: 'POST',
  body: JSON.stringify({
    creator_ids: selectedCreatorIds,
    shoot_hours: shootHours,
    event_type: eventType
  })
});

const quote = await quoteResponse.json();

// 3. Save quote to database
await fetch('/v1/pricing/quotes', {
  method: 'POST',
  body: JSON.stringify({
    items: quote.data.quote.lineItems.map(item => ({
      item_id: item.item_id,
      quantity: item.quantity
    })),
    shootHours: shootHours,
    eventType: eventType,
    guestEmail: bookingData.guest_email,
    bookingId: bookingId
  })
});

// 4. Navigate to next page
router.push(`/payment?bookingId=${bookingId}`);
```

---

## Pricing Logic Details

### Discount Tiers (Wedding Mode)

| Shoot Hours | Discount |
|-------------|----------|
| 0 - 0.5     | 0%       |
| 0.5 - 1     | 0%       |
| 1 - 1.5     | 5%       |
| 1.5 - 2     | 10%      |
| 2 - 2.5     | 15%      |
| 2.5 - 3     | 20%      |
| 3 - 3.5     | 25%      |
| 3.5+        | 30%      | ← **Applied to 19.25 hours**

### Margin Calculation

Default margin: **25%** (configurable via `BEIGE_MARGIN_PERCENT` env variable)

Applied to price after discount:
```
Margin Amount = Price After Discount × 0.25
Final Total = Price After Discount + Margin Amount
```

### Rate Types

- `per_hour`: Rate × Hours × Quantity (people)
- `flat`: Rate × Quantity
- `per_day`: Rate × Quantity (days)
- `per_unit`: Rate × Quantity (units)

For services (Photographer, Videographer, Cinematographer):
- **Type**: `per_hour`
- **Calculation**: $275 × 19.25 hours × 3 videographers = $15,881.25

---

## Testing Checklist

- [ ] Backend endpoint `/v1/pricing/calculate-from-creators` implemented
- [ ] Route added to pricing.routes.js
- [ ] Role-to-item mapping verified for all crew roles
- [ ] Test with 7 creators returns $36,972.02
- [ ] Frontend calls endpoint when creators selected
- [ ] Total updates in real-time when creators added/removed
- [ ] Shoot hours changes recalculate pricing
- [ ] Quote saved to database with booking
- [ ] Payment page shows correct total
- [ ] Pricing breakdown displayed to user

---

## Next Steps

### Immediate
1. ✅ Identify all crew role IDs and complete ROLE_TO_ITEM_MAP
2. ⏳ Implement new endpoint /v1/pricing/calculate-from-creators
3. ⏳ Test endpoint with various creator combinations
4. ⏳ Integrate frontend to call endpoint
5. ⏳ Verify pricing displays correctly

### Short-term
- [ ] Add pricing breakdown component (subtotal, discount, margin)
- [ ] Show per-creator cost breakdown
- [ ] Add ability to include add-on items from catalog
- [ ] Save quote when booking is created
- [ ] Link quote_id to booking

### Long-term
- [ ] Consider hybrid pricing (use creator actual rates vs catalog rates)
- [ ] Add custom discount overrides for specific bookings
- [ ] Implement quote approval workflow
- [ ] Add quote versioning (if pricing changes after quote created)

---

## Summary

**Problem**: $0.00 displayed instead of $36,972.02
**Root Cause**: No integration between creator selection and pricing calculation
**Solution**: New endpoint `/v1/pricing/calculate-from-creators` + frontend integration
**Impact**: Critical - customers cannot see pricing before booking
**Priority**: HIGH - Required for booking flow to work correctly

The pricing calculation system works perfectly - it just needs to be connected to the creator selection UI.
