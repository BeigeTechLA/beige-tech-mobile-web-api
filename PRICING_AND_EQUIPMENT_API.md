# Pricing & Equipment API Documentation

## Overview
Complete pricing calculation and equipment management endpoints for Revure V2 Backend.

**Features:**
1. Equipment search with pricing and location
2. Budget calculation (creators + equipment + Beige margin)
3. Pricing breakdown examples
4. Booking budget estimates

---

## Equipment Endpoints

### 1. Search Equipment

**GET** `/v1/equipment/search`

Search equipment with pricing and location filters.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| category | Number | No | Equipment category ID |
| minPrice | Number | No | Minimum rental price per day |
| maxPrice | Number | No | Maximum rental price per day |
| location | String | No | Location search term |
| available | Boolean | No | Filter by availability (default: true) |
| page | Number | No | Page number (default: 1) |
| limit | Number | No | Results per page (default: 20) |

**Example Request:**
```bash
curl "http://localhost:5001/v1/equipment/search?maxPrice=100&location=New%20York&available=true"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "equipment": [
      {
        "id": 1,
        "name": "Sony A7SIII Camera",
        "category": "Camera",
        "categoryId": 1,
        "brand": "Sony",
        "model": "A7SIII",
        "pricing": {
          "perDay": 150.00,
          "perHour": 25.00,
          "purchasePrice": 3500.00
        },
        "location": "New York, NY",
        "availability": "available",
        "condition": "excellent",
        "description": "Professional mirrorless camera with 4K recording"
      }
    ],
    "pagination": {
      "total": 15,
      "page": 1,
      "limit": 20,
      "totalPages": 1
    }
  }
}
```

---

### 2. Get Equipment Categories

**GET** `/v1/equipment/categories`

Get all equipment categories.

**Example Request:**
```bash
curl http://localhost:5001/v1/equipment/categories
```

**Response:**
```json
{
  "success": true,
  "data": {
    "categories": [
      {
        "id": 1,
        "name": "Camera",
        "description": "Professional cameras and DSLRs"
      },
      {
        "id": 2,
        "name": "Lighting",
        "description": "Studio lights and LED panels"
      },
      {
        "id": 3,
        "name": "Audio",
        "description": "Microphones and audio equipment"
      }
    ]
  }
}
```

---

### 3. Get Equipment by ID

**GET** `/v1/equipment/:id`

Get full equipment details including pricing and location.

**Example Request:**
```bash
curl http://localhost:5001/v1/equipment/1
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Sony A7SIII Camera",
    "category": "Camera",
    "categoryId": 1,
    "brand": "Sony",
    "model": "A7SIII",
    "serialNumber": "SN123456789",
    "pricing": {
      "perDay": 150.00,
      "perHour": 25.00,
      "purchasePrice": 3500.00,
      "replacementCost": 3800.00
    },
    "location": "New York, NY - Studio A",
    "availability": "available",
    "condition": "excellent",
    "description": "Professional mirrorless camera with 4K recording capabilities",
    "specifications": "12MP, 4K 120fps, S-Log3",
    "purchaseDate": "2023-06-15",
    "warrantyExpiration": "2025-06-15",
    "lastMaintenanceDate": "2024-11-01",
    "nextMaintenanceDate": "2025-02-01"
  }
}
```

---

## Pricing Endpoints

### 1. Calculate Pricing

**POST** `/v1/pricing/calculate`

Calculate total pricing breakdown for creators + equipment + Beige margin.

**Request Body:**
```json
{
  "creatorIds": [1, 2],
  "equipmentIds": [1, 3, 5],
  "hours": 3,
  "days": 0,
  "beigeMarginPercent": 15
}
```

**Example Request:**
```bash
curl -X POST http://localhost:5001/v1/pricing/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "creatorIds": [1, 2],
    "equipmentIds": [1, 3],
    "hours": 3,
    "beigeMarginPercent": 15
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "creators": {
      "items": [
        {
          "id": 1,
          "name": "John Doe",
          "hourlyRate": 125.00,
          "hours": 3,
          "subtotal": 375.00
        },
        {
          "id": 2,
          "name": "Jane Smith",
          "hourlyRate": 100.00,
          "hours": 3,
          "subtotal": 300.00
        }
      ],
      "subtotal": 675.00
    },
    "equipment": {
      "items": [
        {
          "id": 1,
          "name": "Sony A7SIII Camera",
          "ratePerHour": 25.00,
          "ratePerDay": 150.00,
          "rateType": "hourly",
          "quantity": 3,
          "subtotal": 75.00
        },
        {
          "id": 3,
          "name": "LED Light Kit",
          "ratePerHour": 15.00,
          "ratePerDay": 90.00,
          "rateType": "hourly",
          "quantity": 3,
          "subtotal": 45.00
        }
      ],
      "subtotal": 120.00
    },
    "summary": {
      "subtotal": 795.00,
      "beigeMargin": 119.25,
      "beigeMarginPercent": 15,
      "total": 914.25
    },
    "params": {
      "hours": 3,
      "days": 0,
      "creatorCount": 2,
      "equipmentCount": 2
    }
  }
}
```

**Breakdown Explanation:**
```
Creators (3 hours):
  - John Doe: $125/hr × 3 hrs = $375
  - Jane Smith: $100/hr × 3 hrs = $300
  Subtotal: $675

Equipment (3 hours):
  - Sony A7SIII: $25/hr × 3 hrs = $75
  - LED Light Kit: $15/hr × 3 hrs = $45
  Subtotal: $120

Beige Margin (15%):
  ($675 + $120) × 0.15 = $119.25

TOTAL: $914.25
```

---

### 2. Get Booking Estimate

**GET** `/v1/pricing/estimate/:bookingId`

Get pricing estimate for an existing booking.

**Authentication:** Required

**Example Request:**
```bash
curl http://localhost:5001/v1/pricing/estimate/123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "bookingId": 123,
    "projectName": "Product Launch Video",
    "totalBudget": 3000.00,
    "duration": {
      "hours": 8,
      "days": 1
    },
    "suggestedBreakdown": {
      "creators": 2100.00,
      "equipment": 900.00,
      "beigeMargin": 450.00
    },
    "crewSizeNeeded": 3,
    "location": "San Francisco, CA"
  }
}
```

---

### 3. Get Pricing Example

**GET** `/v1/pricing/example`

Get example pricing calculation (for display purposes).

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| creatorHourlyRate | Number | 100 | Example creator hourly rate |
| equipmentDailyRate | Number | 50 | Example equipment daily rate |
| hours | Number | 3 | Number of hours |
| beigeMarginPercent | Number | 15 | Beige margin percentage |

**Example Request:**
```bash
curl "http://localhost:5001/v1/pricing/example?creatorHourlyRate=125&equipmentDailyRate=75&hours=3&beigeMarginPercent=15"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "example": {
      "description": "3 hours of crew + equipment cost + 15% Beige margin",
      "breakdown": {
        "creator": {
          "hourlyRate": 125.00,
          "hours": 3,
          "subtotal": 375.00
        },
        "equipment": {
          "dailyRate": 75.00,
          "days": 1,
          "subtotal": 75.00
        },
        "beigeMargin": {
          "percent": 15,
          "amount": 67.50
        }
      },
      "summary": {
        "subtotal": 450.00,
        "margin": 67.50,
        "total": 517.50
      }
    }
  }
}
```

**Use Case:** Display this on the frontend to show users how pricing works before they create a booking.

---

## Form Inputs Handling

All booking form inputs are captured in the booking creation endpoint:

**POST** `/v1/bookings/create`

**Captured Fields:**
- `order_name` - Project name
- `project_type` - Type of project
- `content_type` - Content category
- `start_date_time` - Start date and time
- `duration_hours` - Duration in hours
- `budget_min` / `budget_max` - Budget range
- `crew_size` - Number of crew needed
- `location` - Event location
- `streaming_platforms` - Array of platforms
- `crew_roles` - Array of required roles
- `skills_needed` - Array of required skills
- `equipments_needed` - Array of required equipment
- `special_note` - Additional notes

All fields are automatically mapped to the database schema and stored in `stream_project_booking` table.

---

## Integration Examples

### Frontend: Calculate Pricing on Selection

```javascript
// Calculate pricing as user selects creators and equipment
async function calculatePricing(selectedCreators, selectedEquipment, hours) {
  const response = await fetch('http://localhost:5001/v1/pricing/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creatorIds: selectedCreators.map(c => c.id),
      equipmentIds: selectedEquipment.map(e => e.id),
      hours: hours,
      beigeMarginPercent: 15
    })
  });

  const data = await response.json();

  if (data.success) {
    return {
      creatorCost: data.data.creators.subtotal,
      equipmentCost: data.data.equipment.subtotal,
      beigeMargin: data.data.summary.beigeMargin,
      total: data.data.summary.total,
      breakdown: data.data
    };
  }
}
```

### Frontend: Search Equipment by Location and Price

```javascript
// Search for equipment in user's location within budget
async function searchEquipment(location, maxBudget) {
  const params = new URLSearchParams({
    location: location,
    maxPrice: maxBudget,
    available: true,
    page: 1,
    limit: 20
  });

  const response = await fetch(`http://localhost:5001/v1/equipment/search?${params}`);
  const data = await response.json();

  if (data.success) {
    return data.data.equipment.map(eq => ({
      id: eq.id,
      name: eq.name,
      price: eq.pricing.perDay,
      location: eq.location,
      available: eq.availability === 'available'
    }));
  }
}
```

### Frontend: Display Pricing Example

```javascript
// Show pricing example before user creates booking
async function showPricingExample() {
  const response = await fetch('http://localhost:5001/v1/pricing/example?hours=3');
  const data = await response.json();

  if (data.success) {
    const example = data.data.example;
    console.log(`Example: ${example.description}`);
    console.log(`Creator: $${example.breakdown.creator.subtotal}`);
    console.log(`Equipment: $${example.breakdown.equipment.subtotal}`);
    console.log(`Beige Margin: $${example.breakdown.beigeMargin.amount}`);
    console.log(`Total: $${example.summary.total}`);
  }
}
```

---

## Use Cases

### 1. Budget Calculation for Every CP and Equipment

**Endpoint:** `POST /v1/pricing/calculate`

Calculates total cost including:
- Each creator's hourly rate × hours
- Each equipment's rental rate × duration
- Beige margin percentage
- Final total

### 2. Location of CP and Equipment

**Creators Location:** `GET /v1/creators/:id` → returns `location` field
**Equipment Location:** `GET /v1/equipment/:id` → returns `location` field
**Search by Location:** Both endpoints support location filtering

### 3. Equipment Pricing

**Endpoint:** `GET /v1/equipment/search` or `GET /v1/equipment/:id`

Returns pricing structure:
```json
{
  "pricing": {
    "perDay": 150.00,
    "perHour": 25.00,
    "purchasePrice": 3500.00
  }
}
```

### 4. Last Reviews

**Endpoint:** `GET /v1/creators/:id/reviews`

Currently returns placeholder data. When reviews table is implemented, will return:
- Most recent reviews (sorted by date DESC)
- Average rating
- Review count
- Rating distribution

### 5. Form Inputs from User

**Endpoint:** `POST /v1/bookings/create`

All booking form inputs are captured and stored. Supports:
- Text fields (order_name, location, description)
- Dates/times (start_date_time, end_date)
- Numbers (budget_min, budget_max, crew_size, duration_hours)
- JSON arrays (streaming_platforms, crew_roles, skills_needed, equipments_needed)

### 6. Pricing Example Display

**Endpoint:** `GET /v1/pricing/example`

Example: "3 hours of CP + equipment cost + Beige margin"

Returns:
```
Creator: $125/hr × 3 hrs = $375
Equipment: $75/day = $75
Subtotal: $450
Beige Margin (15%): $67.50
Total: $517.50
```

---

## Testing Commands

### Test Equipment Search
```bash
# Search all equipment
curl http://localhost:5001/v1/equipment/search

# Search by price range and location
curl "http://localhost:5001/v1/equipment/search?maxPrice=200&location=New%20York"

# Search by category
curl "http://localhost:5001/v1/equipment/search?category=1"
```

### Test Pricing Calculation
```bash
# Calculate pricing for 2 creators and 1 equipment for 3 hours
curl -X POST http://localhost:5001/v1/pricing/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "creatorIds": [1, 2],
    "equipmentIds": [1],
    "hours": 3,
    "beigeMarginPercent": 15
  }'
```

### Test Pricing Example
```bash
# Get example pricing
curl "http://localhost:5001/v1/pricing/example?hours=3&creatorHourlyRate=125&equipmentDailyRate=75"
```

### Test Equipment Categories
```bash
curl http://localhost:5001/v1/equipment/categories
```

---

## Database Requirements

### Equipment Table
Required fields:
- `equipment_id` - Primary key
- `equipment_name` - Name
- `category_id` - Foreign key to equipment_category
- `rental_price_per_day` - Daily rate
- `rental_price_per_hour` - Hourly rate
- `current_location` - Location string
- `availability_status` - 'available', 'rented', 'maintenance'
- `is_active` - Active flag

### Crew Members Table
Required fields:
- `crew_member_id` - Primary key
- `hourly_rate` - Hourly rate
- `location` - Location string

---

## Next Steps

1. ✅ Equipment search with pricing and location
2. ✅ Budget calculation endpoint
3. ✅ Pricing breakdown examples
4. 📋 Implement actual reviews (requires reviews table)
5. 📋 Add equipment availability calendar
6. 📋 Add real-time pricing updates
7. 📋 Add discount/promo code support
8. 📋 Add tax calculation

---

**Status**: ✅ Complete - Ready for Testing
