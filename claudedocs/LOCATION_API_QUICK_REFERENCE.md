# Location API Quick Reference

## Location Data Format

### Input (Any of these formats accepted):

```javascript
// 1. Mapbox JSON String (Recommended)
location: '{"lat":34.0522,"lng":-118.2437,"address":"Los Angeles, CA"}'

// 2. Mapbox Object
location: { lat: 34.0522, lng: -118.2437, address: "Los Angeles, CA" }

// 3. Plain String (Backward Compatible)
location: "Los Angeles, CA"
```

### Output (Standardized):

```javascript
{
  "address": "Los Angeles, CA",
  "coordinates": { "lat": 34.0522, "lng": -118.2437 },
  "hasCoordinates": true
}

// Or for plain strings:
{
  "address": "Los Angeles, CA",
  "coordinates": null,
  "hasCoordinates": false
}
```

---

## Bookings API

### Create Booking
```
POST /api/bookings/create
```

**Request Body:**
```json
{
  "order_name": "Corporate Event",
  "location": "{\"lat\":34.0522,\"lng\":-118.2437,\"address\":\"Los Angeles, CA\"}",
  "event_type": "conference",
  "start_date_time": "2025-12-25T10:00:00",
  "budget_max": 5000
}
```

**Response:**
```json
{
  "success": true,
  "message": "Booking created successfully",
  "data": {
    "booking_id": 123,
    "project_name": "Corporate Event",
    "event_date": "2025-12-25",
    "event_location": {
      "address": "Los Angeles, CA",
      "coordinates": { "lat": 34.0522, "lng": -118.2437 },
      "hasCoordinates": true
    },
    "budget": 5000.00
  }
}
```

### Get Booking
```
GET /api/bookings/:id
```

**Response includes formatted location in same structure.**

### Update Booking
```
PUT /api/bookings/:id
```

**Request Body (partial update):**
```json
{
  "location": "{\"lat\":34.0407,\"lng\":-118.2468,\"address\":\"Hollywood, CA\"}"
}
```

### List Bookings
```
GET /api/bookings?page=1&limit=10&status=active
```

**All bookings include formatted location.**

---

## Creators API

### Search Creators (Text-based)
```
GET /api/creators/search?location=Los Angeles&budget=100&page=1&limit=20
```

**Response:**
```json
{
  "success": true,
  "data": {
    "creators": [
      {
        "id": 1,
        "name": "John Doe",
        "role": 2,
        "price": 75.00,
        "rating": 4.8,
        "location": "Los Angeles, CA",
        "experience": 5
      }
    ],
    "pagination": { "total": 50, "page": 1, "limit": 20 },
    "searchParams": {
      "useProximitySearch": false,
      "maxDistance": null,
      "searchLocation": null
    }
  }
}
```

### Search Creators (Proximity-based)
```
GET /api/creators/search?location={"lat":34.0522,"lng":-118.2437,"address":"Los Angeles"}&maxDistance=25&page=1&limit=20
```

**Key Query Parameters:**
- `location` - Mapbox JSON string with coordinates
- `maxDistance` - Distance in miles (e.g., 25)
- `budget` - Maximum hourly rate
- `skills` - Skills filter
- `content_type` - Role/content type filter
- `page` - Page number
- `limit` - Results per page

**Response:**
```json
{
  "success": true,
  "data": {
    "creators": [
      {
        "id": 1,
        "name": "John Doe",
        "role": 2,
        "price": 75.00,
        "rating": 4.8,
        "location": "Los Angeles, CA",
        "distance": 0,
        "distanceText": "0 mi",
        "experience": 5
      },
      {
        "id": 2,
        "name": "Jane Smith",
        "role": 1,
        "price": 85.00,
        "rating": 4.9,
        "location": "Santa Monica, CA",
        "distance": 8.5,
        "distanceText": "8.5 mi",
        "experience": 7
      }
    ],
    "pagination": { "total": 15, "page": 1, "limit": 20 },
    "searchParams": {
      "useProximitySearch": true,
      "maxDistance": 25,
      "searchLocation": {
        "address": "Los Angeles",
        "coordinates": { "lat": 34.0522, "lng": -118.2437 }
      }
    }
  }
}
```

**When proximity search is active:**
- Results include `distance` (in miles)
- Results include `distanceText` (formatted string)
- Sorted by distance (closest first)
- Filtered to only include items within `maxDistance`

### Get Creator Profile
```
GET /api/creators/:id
```

**Response includes formatted location.**

---

## Equipment API

### Search Equipment (Text-based)
```
GET /api/equipment/search?location=Los Angeles&category=1&minPrice=50&maxPrice=200
```

**Response:**
```json
{
  "success": true,
  "data": {
    "equipment": [
      {
        "id": 1,
        "name": "Professional Camera",
        "category": "Cameras",
        "brand": "Canon",
        "pricing": { "perDay": 150.00, "perHour": 25.00 },
        "location": "Los Angeles, CA",
        "availability": "available"
      }
    ],
    "pagination": { "total": 30, "page": 1, "limit": 20 }
  }
}
```

### Search Equipment (Proximity-based)
```
GET /api/equipment/search?location={"lat":34.0522,"lng":-118.2437,"address":"LA"}&maxDistance=50&category=1
```

**Key Query Parameters:**
- `location` - Mapbox JSON string with coordinates
- `maxDistance` - Distance in miles (e.g., 50)
- `category` - Equipment category ID
- `minPrice` - Minimum daily rental price
- `maxPrice` - Maximum daily rental price
- `available` - Filter by availability (default: true)
- `page` - Page number
- `limit` - Results per page

**Response:**
```json
{
  "success": true,
  "data": {
    "equipment": [
      {
        "id": 1,
        "name": "Professional Camera",
        "category": "Cameras",
        "brand": "Canon",
        "pricing": { "perDay": 150.00, "perHour": 25.00 },
        "location": "Los Angeles, CA",
        "distance": 5.2,
        "distanceText": "5.2 mi",
        "availability": "available"
      }
    ],
    "pagination": { "total": 12, "page": 1, "limit": 20 },
    "searchParams": {
      "useProximitySearch": true,
      "maxDistance": 50,
      "searchLocation": {
        "address": "LA",
        "coordinates": { "lat": 34.0522, "lng": -118.2437 }
      }
    }
  }
}
```

### Get Equipment Details
```
GET /api/equipment/:id
```

**Response includes formatted location.**

---

## Frontend Integration Examples

### React/JavaScript - Send Mapbox Location

```javascript
// From Mapbox geocoder result
const selectedPlace = mapboxResult;

// Format for API
const location = JSON.stringify({
  lat: selectedPlace.center[1],  // Mapbox: [lng, lat]
  lng: selectedPlace.center[0],
  address: selectedPlace.place_name
});

// Send to API
const response = await fetch('/api/bookings/create', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    order_name: "My Event",
    location: location,
    // ... other fields
  })
});
```

### React/JavaScript - Search with Proximity

```javascript
// User's current location or selected location
const userLocation = {
  lat: 34.0522,
  lng: -118.2437,
  address: "Los Angeles, CA"
};

// Search creators within 25 miles
const searchParams = new URLSearchParams({
  location: JSON.stringify(userLocation),
  maxDistance: '25',
  budget: '100',
  page: '1',
  limit: '20'
});

const response = await fetch(`/api/creators/search?${searchParams}`, {
  headers: { 'Authorization': `Bearer ${token}` }
});

const data = await response.json();

// Display results with distance
data.data.creators.forEach(creator => {
  console.log(`${creator.name} - ${creator.distanceText} away`);
});
```

### React/JavaScript - Display Location

```javascript
// Handle both old and new location format
function displayLocation(location) {
  if (typeof location === 'string') {
    // Old format - plain string
    return location;
  }

  if (location && location.address) {
    // New format - structured object
    const parts = [location.address];

    if (location.hasCoordinates && location.coordinates) {
      parts.push(`(${location.coordinates.lat}, ${location.coordinates.lng})`);
    }

    return parts.join(' ');
  }

  return 'Location not specified';
}

// Usage in component
<div>
  <h3>Event Location</h3>
  <p>{displayLocation(booking.event_location)}</p>
  {booking.event_location.hasCoordinates && (
    <button onClick={() => showOnMap(booking.event_location.coordinates)}>
      View on Map
    </button>
  )}
</div>
```

---

## Common Use Cases

### 1. Find Creators Near Event Location

```javascript
// User creates booking with location
const booking = {
  location: '{"lat":34.0522,"lng":-118.2437,"address":"Los Angeles, CA"}',
  // ... other booking details
};

// Then search for creators near that location
const searchLocation = JSON.parse(booking.location);
const creatorsNearby = await searchCreators({
  location: JSON.stringify(searchLocation),
  maxDistance: 50  // 50 miles radius
});
```

### 2. Find Equipment Near Creator

```javascript
// Creator has location in profile
const creator = {
  location: {
    address: "Santa Monica, CA",
    coordinates: { lat: 34.0195, lng: -118.4912 }
  }
};

// Find equipment near creator
const equipmentNearby = await searchEquipment({
  location: JSON.stringify(creator.location),
  maxDistance: 25
});
```

### 3. Distance-based Sorting

```javascript
// Results are automatically sorted by distance when using proximity search
const results = await searchCreators({
  location: '{"lat":34.0522,"lng":-118.2437}',
  maxDistance: 100
});

// First result is closest
console.log(`Closest: ${results.data.creators[0].name} - ${results.data.creators[0].distanceText}`);
```

---

## Migration from Plain Strings

### Before (Old Code)
```javascript
// Creating booking
const booking = {
  location: "Los Angeles, CA"
};

// Displaying location
<div>{booking.event_location}</div>
```

### After (New Code)
```javascript
// Creating booking - both work!
const booking = {
  location: "Los Angeles, CA"  // Still works
  // OR
  location: '{"lat":34.05,"lng":-118.24,"address":"Los Angeles, CA"}'  // Better
};

// Displaying location - handle both formats
<div>
  {typeof booking.event_location === 'string'
    ? booking.event_location
    : booking.event_location.address}
</div>

// Or use helper function
<div>{displayLocation(booking.event_location)}</div>
```

---

## Distance Units

Currently all distances are in **miles**.

To convert to kilometers:
```javascript
const distanceKm = distanceMiles * 1.60934;
```

---

## Error Handling

### Invalid Coordinates
```javascript
// Invalid coordinates are treated as null
location: '{"lat":999,"lng":-200,"address":"Invalid"}'

// Results in:
{
  "address": "Invalid",
  "coordinates": null,
  "hasCoordinates": false
}
```

### Malformed JSON
```javascript
// Malformed JSON is treated as plain string
location: '{"broken json}'

// Results in:
{
  "address": '{"broken json}',
  "coordinates": null,
  "hasCoordinates": false
}
```

### Missing maxDistance
```javascript
// Proximity search requires both coordinates AND maxDistance
// Without maxDistance, falls back to text search
GET /api/creators/search?location={"lat":34.05,"lng":-118.24}
// Uses text search, not proximity search
```

---

## Performance Tips

1. **Use Text Search for City-level Queries**
   ```
   ?location=Los Angeles  // Fast, uses database index
   ```

2. **Use Proximity Search for Specific Locations**
   ```
   ?location={"lat":34.05,"lng":-118.24}&maxDistance=25  // More precise
   ```

3. **Limit Distance Radius**
   ```
   ?maxDistance=50  // Better performance than maxDistance=500
   ```

4. **Cache Geocoded Locations**
   ```javascript
   // Cache Mapbox geocoding results to avoid repeated API calls
   const locationCache = new Map();
   ```

---

## Support

For issues or questions:
- Backend: Check `/claudedocs/MAPBOX_LOCATION_INTEGRATION.md`
- API Reference: This document
- Test Suite: `/tests/locationHelpers.test.js`
