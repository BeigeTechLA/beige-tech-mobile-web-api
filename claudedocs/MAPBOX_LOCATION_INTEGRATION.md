# Mapbox Location Integration - Backend Implementation

## Overview

The Revure V2 Backend has been enhanced to fully support Mapbox location data from the frontend. This integration maintains backward compatibility with plain string addresses while adding support for coordinate-based location data with proximity search capabilities.

## Location Data Format

### Mapbox Format (from Frontend)
The frontend sends location data as JSON stringified objects:
```json
"{\"lat\":34.0522,\"lng\":-118.2437,\"address\":\"Los Angeles, CA\"}"
```

### Supported Formats
The backend now supports three location input formats:

1. **Mapbox JSON String** (recommended):
   ```json
   "{\"lat\":34.0522,\"lng\":-118.2437,\"address\":\"Los Angeles, CA\"}"
   ```

2. **Mapbox JSON Object**:
   ```json
   {
     "lat": 34.0522,
     "lng": -118.2437,
     "address": "Los Angeles, CA"
   }
   ```

3. **Plain String Address** (backward compatible):
   ```
   "Los Angeles, CA"
   ```

### Response Format
All location fields in API responses are now formatted consistently:
```json
{
  "address": "Los Angeles, CA",
  "coordinates": {
    "lat": 34.0522,
    "lng": -118.2437
  },
  "hasCoordinates": true
}
```

For plain string addresses without coordinates:
```json
{
  "address": "Los Angeles, CA",
  "coordinates": null,
  "hasCoordinates": false
}
```

## Database Fields

### Location Storage
All location fields store data as TEXT/VARCHAR to support both formats:

- **Bookings**: `event_location` (VARCHAR 255)
- **Crew Members**: `location` (TEXT)
- **Equipment**: `storage_location` (TEXT)

The backend automatically normalizes location data:
- Objects are stringified before storage
- Strings (both JSON and plain) are stored as-is
- Parsing is handled on retrieval

## API Endpoints

### 1. Bookings

#### Create Booking
**POST** `/api/bookings/create`

Request body:
```json
{
  "order_name": "Event Production",
  "location": "{\"lat\":34.0522,\"lng\":-118.2437,\"address\":\"Los Angeles, CA\"}",
  ...
}
```

Response includes formatted location:
```json
{
  "success": true,
  "data": {
    "booking_id": 123,
    "event_location": {
      "address": "Los Angeles, CA",
      "coordinates": {"lat": 34.0522, "lng": -118.2437},
      "hasCoordinates": true
    }
  }
}
```

#### Get Booking
**GET** `/api/bookings/:id`

Returns formatted location in response.

#### Update Booking
**PUT** `/api/bookings/:id`

Accepts location in any supported format, normalizes for storage.

#### List Bookings
**GET** `/api/bookings`

All bookings include formatted location data.

### 2. Creators (Crew Members)

#### Search Creators with Proximity
**GET** `/api/creators/search`

Query parameters:
- `location` - Location in any supported format
- `maxDistance` - Optional, distance in miles for proximity search
- `budget` - Maximum hourly rate
- `skills` - Skills filter
- `content_type` - Role/content type filter
- `page` - Page number
- `limit` - Results per page

**Example 1: Text-based location search**
```
GET /api/creators/search?location=Los Angeles
```

**Example 2: Proximity search with coordinates**
```
GET /api/creators/search?location={"lat":34.0522,"lng":-118.2437,"address":"Los Angeles"}&maxDistance=25
```

Response with proximity search:
```json
{
  "success": true,
  "data": {
    "creators": [
      {
        "id": 1,
        "name": "John Doe",
        "distance": 5.2,
        "distanceText": "5.2 mi",
        ...
      }
    ],
    "pagination": {...},
    "searchParams": {
      "useProximitySearch": true,
      "maxDistance": 25,
      "searchLocation": {
        "address": "Los Angeles",
        "coordinates": {"lat": 34.0522, "lng": -118.2437}
      }
    }
  }
}
```

#### Get Creator Profile
**GET** `/api/creators/:id`

Returns formatted location in profile data.

### 3. Equipment

#### Search Equipment with Proximity
**GET** `/api/equipment/search`

Query parameters:
- `location` - Location in any supported format
- `maxDistance` - Optional, distance in miles for proximity search
- `category` - Equipment category filter
- `minPrice` - Minimum daily rental price
- `maxPrice` - Maximum daily rental price
- `available` - Filter by availability (default: true)
- `page` - Page number
- `limit` - Results per page

**Example 1: Text-based location search**
```
GET /api/equipment/search?location=Los Angeles&category=1
```

**Example 2: Proximity search with coordinates**
```
GET /api/equipment/search?location={"lat":34.0522,"lng":-118.2437,"address":"Los Angeles"}&maxDistance=50
```

Response with proximity search:
```json
{
  "success": true,
  "data": {
    "equipment": [
      {
        "id": 1,
        "name": "Professional Camera",
        "location": "Los Angeles, CA",
        "distance": 12.5,
        "distanceText": "12.5 mi",
        ...
      }
    ],
    "pagination": {...},
    "searchParams": {
      "useProximitySearch": true,
      "maxDistance": 50,
      "searchLocation": {
        "address": "Los Angeles",
        "coordinates": {"lat": 34.0522, "lng": -118.2437}
      }
    }
  }
}
```

## Utility Functions

### Location Helpers (`/src/utils/locationHelpers.js`)

#### `parseLocation(location)`
Parses location from any supported format into a normalized object.

```javascript
const { parseLocation } = require('../utils/locationHelpers');

// Parse Mapbox JSON string
const loc1 = parseLocation('{"lat":34.0522,"lng":-118.2437,"address":"Los Angeles"}');
// Returns: { lat: 34.0522, lng: -118.2437, address: "Los Angeles" }

// Parse plain string
const loc2 = parseLocation('Los Angeles, CA');
// Returns: { lat: null, lng: null, address: "Los Angeles, CA" }
```

#### `calculateDistance(lat1, lng1, lat2, lng2)`
Calculates distance between two coordinates using Haversine formula.

```javascript
const { calculateDistance } = require('../utils/locationHelpers');

const distance = calculateDistance(34.0522, -118.2437, 34.0407, -118.2468);
// Returns: 0.9 (miles)
```

#### `filterByProximity(items, targetLocation, maxDistance, locationField)`
Filters array of items by distance from target location.

```javascript
const { filterByProximity } = require('../utils/locationHelpers');

const filtered = filterByProximity(
  creators,
  { lat: 34.0522, lng: -118.2437 },
  25, // maxDistance in miles
  'location' // field name containing location data
);
// Returns: Filtered and sorted array with distance added to each item
```

#### `formatLocationResponse(location)`
Formats location data for consistent API responses.

```javascript
const { formatLocationResponse } = require('../utils/locationHelpers');

const formatted = formatLocationResponse('{"lat":34.0522,"lng":-118.2437,"address":"LA"}');
// Returns: { address: "LA", coordinates: { lat: 34.0522, lng: -118.2437 }, hasCoordinates: true }
```

#### `isValidCoordinate(lat, lng)`
Validates latitude and longitude values.

#### `createLocationWhereClause(location, Op)`
Creates Sequelize where clause for location-based queries.

## Proximity Search Implementation

### How It Works

1. **Coordinate Detection**: When a location search includes coordinates and `maxDistance` parameter, proximity search is enabled.

2. **Database Query**: All matching records are fetched (without location filtering in SQL).

3. **Distance Calculation**: For each result, calculate distance using Haversine formula.

4. **Filtering**: Remove items beyond `maxDistance`.

5. **Sorting**: Sort by distance (closest first).

6. **Pagination**: Apply pagination after filtering.

### Performance Considerations

- **Text Search**: Uses database LIKE queries - fast and efficient
- **Proximity Search**: Application-layer filtering - may fetch more records initially
- **Optimization**: Consider adding spatial indexes if dataset grows large (requires PostGIS or similar)

## Backward Compatibility

All endpoints maintain full backward compatibility:

1. **Plain String Addresses**: Still work exactly as before
2. **Existing Data**: Legacy location strings continue to function
3. **Optional Coordinates**: Coordinates are optional - text search works without them
4. **Response Format**: Enhanced but non-breaking (adds structured location object)

## Migration Path

### For Existing Data

No migration required. The system handles:
- Old plain string locations: Displayed as `{ address: "string", coordinates: null }`
- New Mapbox locations: Fully parsed with coordinates
- Mixed data: Both formats coexist seamlessly

### Frontend Integration

Ensure frontend sends location in Mapbox format:
```javascript
const location = JSON.stringify({
  lat: selectedPlace.center[1],
  lng: selectedPlace.center[0],
  address: selectedPlace.place_name
});

// Send in API request
fetch('/api/bookings/create', {
  body: JSON.stringify({
    location: location,
    ...otherData
  })
});
```

## Testing

### Test Cases

1. **Create booking with Mapbox location**
   ```bash
   curl -X POST /api/bookings/create \
     -H "Content-Type: application/json" \
     -d '{"location": "{\"lat\":34.0522,\"lng\":-118.2437,\"address\":\"Los Angeles\"}"}'
   ```

2. **Search creators within 25 miles**
   ```bash
   curl "/api/creators/search?location={\"lat\":34.0522,\"lng\":-118.2437}&maxDistance=25"
   ```

3. **Search equipment with text location**
   ```bash
   curl "/api/equipment/search?location=Los Angeles"
   ```

4. **Backward compatibility with plain string**
   ```bash
   curl -X POST /api/bookings/create \
     -H "Content-Type: application/json" \
     -d '{"location": "Los Angeles, CA"}'
   ```

## Future Enhancements

### Potential Improvements

1. **Spatial Database Indexes**: Add PostGIS extension for optimized proximity queries
2. **Geocoding Service**: Automatic coordinate lookup for plain string addresses
3. **Location Validation**: Verify coordinates are within service area
4. **Caching**: Cache geocoded results for common addresses
5. **Map Visualization**: Add endpoints for map-based data aggregation

## Error Handling

### Invalid Coordinates
```javascript
// Invalid latitude/longitude are treated as null
parseLocation('{"lat":999,"lng":-200,"address":"Invalid"}')
// Returns: { lat: null, lng: null, address: "Invalid" }
```

### Malformed JSON
```javascript
// Falls back to plain string address
parseLocation('{"broken json}')
// Returns: { lat: null, lng: null, address: '{"broken json}' }
```

### Missing Distance
```javascript
// Proximity search requires both coordinates AND maxDistance
// Without maxDistance, falls back to text search
```

## Security Considerations

1. **Input Validation**: All location inputs are sanitized before database storage
2. **SQL Injection**: Using Sequelize parameterized queries prevents injection
3. **Distance Limits**: Consider adding maximum `maxDistance` limit (e.g., 500 miles)
4. **Rate Limiting**: Proximity searches are more expensive - consider rate limits

## Summary

The Mapbox integration provides:
- Full support for coordinate-based location data
- Proximity search with configurable distance
- Backward compatibility with existing string addresses
- Consistent location formatting across all endpoints
- Production-ready utilities for distance calculation and filtering

All changes are non-breaking and enhance the existing functionality without requiring data migration.
