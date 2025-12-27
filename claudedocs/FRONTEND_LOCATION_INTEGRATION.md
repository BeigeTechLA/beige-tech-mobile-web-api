# Frontend Location Integration Guide

## Issue Summary

The creator search API was returning 0 results when the frontend sent plain address strings without geographic coordinates. The backend has been improved with a fallback for state-level matching, but **the proper solution is for the frontend to geocode addresses and send coordinates**.

## Current Behavior (After Backend Fix)

**Status:** ✅ Working with fallback
**Results:** Returns creators in the same state (e.g., all California creators for a Calabasas address)
**Limitation:** Cannot do accurate proximity-based distance filtering

### Example Working Request
```
GET /v1/creators/search?location=25095+Thousand+Peaks+Road,+Calabasas,+California+91302,+United+States
```

**Backend Processing:**
1. Extracts state "California" → converts to "CA"
2. Searches for `location LIKE '%CA%'`
3. Returns all creators in California (55 results)
4. **Cannot** filter by distance from Calabasas

## Proper Solution: Send Geocoded Coordinates

### Required Format

The frontend should geocode addresses and send location as JSON:

```javascript
// CORRECT: JSON with coordinates
location: {
  "lat": 34.1184,
  "lng": -118.6414,
  "address": "Calabasas, CA"
}
// Or as URL-encoded JSON string
location: "%7B%22lat%22%3A34.1184%2C%22lng%22%3A-118.6414%2C%22address%22%3A%22Calabasas%2C%20CA%22%7D"
```

### Implementation Steps

#### 1. Use Mapbox Geocoding API

You likely already have Mapbox integrated for the location picker. Use it to geocode addresses:

```javascript
// Example: Geocode address before search
async function searchCreators(address, filters) {
  // Geocode the address
  const geocoded = await geocodeAddress(address);

  // Send location with coordinates
  const params = {
    location: JSON.stringify({
      lat: geocoded.center[1],  // Mapbox returns [lng, lat]
      lng: geocoded.center[0],
      address: geocoded.place_name
    }),
    maxDistance: filters.maxDistance || 50,
    min_budget: filters.minBudget,
    max_budget: filters.maxBudget,
    content_types: filters.contentTypes.join(','),
    required_count: filters.requiredCount || 10,
    page: filters.page || 1,
    limit: filters.limit || 20
  };

  return await fetch(`/v1/creators/search?${new URLSearchParams(params)}`);
}

async function geocodeAddress(address) {
  const response = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}`
  );
  const data = await response.json();
  return data.features[0]; // First/best match
}
```

#### 2. Handle Location Picker Input

If using a location autocomplete/picker component:

```javascript
// When user selects a location from the picker
function handleLocationSelect(place) {
  setSelectedLocation({
    lat: place.center[1],      // Latitude
    lng: place.center[0],      // Longitude
    address: place.place_name  // Formatted address
  });
}

// When performing search
function performSearch() {
  const params = {
    location: JSON.stringify(selectedLocation),  // Send as JSON
    // ... other filters
  };
  // Make API request
}
```

#### 3. Cache Geocoding Results

To avoid repeated API calls:

```javascript
const geocodeCache = new Map();

async function geocodeWithCache(address) {
  if (geocodeCache.has(address)) {
    return geocodeCache.get(address);
  }

  const result = await geocodeAddress(address);
  geocodeCache.set(address, result);
  return result;
}
```

## Backend API Details

### Location Parameter Handling

The backend `parseLocation()` function accepts:

1. **JSON string with coordinates** (preferred):
   ```json
   {"lat": 34.1184, "lng": -118.6414, "address": "Calabasas, CA"}
   ```

2. **Plain address string** (fallback):
   ```
   "25095 Thousand Peaks Road, Calabasas, California 91302, United States"
   ```
   - Backend extracts state and matches on state abbreviation
   - Returns broad results (all creators in that state)
   - Cannot calculate distances accurately

### Proximity Search Features

When **coordinates are provided**, the backend enables:

✅ **Accurate Distance Calculation** - Haversine formula for precise distance
✅ **Radius Filtering** - Filter creators within `maxDistance` miles
✅ **Auto Radius Expansion** - Expands search radius until `required_count` found
✅ **Distance Sorting** - Results sorted by proximity
✅ **Distance Display** - Each result includes `distance` and `distanceText`

### Example Response with Coordinates

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "crew_member_id": 3,
        "name": "Marcus Thompson",
        "location": "Los Angeles, CA",
        "distance": 25.3,
        "distanceText": "25.3 mi",
        "hourly_rate": 200,
        "role_name": "Videographer"
      }
    ],
    "searchMeta": {
      "requestedCount": 10,
      "foundCount": 15,
      "initialRadius": 50,
      "actualRadius": 50,
      "radiusExpanded": false
    }
  }
}
```

## Testing

### Test Cases

1. **With coordinates** (optimal):
   ```bash
   curl 'http://revure-api.beige.app/v1/creators/search?location=%7B%22lat%22%3A34.1184%2C%22lng%22%3A-118.6414%2C%22address%22%3A%22Calabasas%2C%20CA%22%7D&maxDistance=50&required_count=10'
   ```
   **Expected:** 10+ creators within 50 miles, sorted by distance

2. **Without coordinates** (fallback):
   ```bash
   curl 'http://revure-api.beige.app/v1/creators/search?location=Calabasas%2C%20California&max_budget=500'
   ```
   **Expected:** All creators in California matching budget

### Validation

After implementing geocoding:

1. ✅ Verify search returns distance values for each creator
2. ✅ Verify results are sorted by proximity
3. ✅ Verify `searchMeta.actualRadius` is populated
4. ✅ Test radius expansion by setting high `required_count`
5. ✅ Compare results with/without coordinates to see accuracy improvement

## Performance Considerations

### Geocoding API Costs

- **Mapbox:** Free tier includes 100,000 requests/month
- **Google Maps:** $5 per 1,000 requests (first $200/month free)

### Optimization Strategies

1. **Debounce geocoding** - Only geocode after user stops typing
2. **Cache results** - Store geocoded locations in memory/localStorage
3. **Use session storage** - Remember recent searches
4. **Geocode on select** - Only geocode when user selects from autocomplete

## Migration Path

### Phase 1: Quick Win (Current State)
- ✅ Backend fallback to state-level matching
- ✅ Basic functionality working
- ❌ No accurate proximity search

### Phase 2: Proper Implementation (Recommended)
1. Update frontend to geocode addresses before search API calls
2. Send location as JSON with coordinates
3. Test proximity search functionality
4. Monitor geocoding API usage and costs

### Phase 3: Enhancements (Future)
- Save user's preferred locations with coordinates
- Implement "Search near me" using browser geolocation
- Add map view showing creator locations with distance circles

## Support

### Backend API Endpoint
- **URL:** `https://revure-api.beige.app/v1/creators/search`
- **Method:** GET
- **Port:** 5001 (direct) or 443 (HTTPS via revure-api.beige.app)

### Code References
- Backend location parsing: `src/utils/locationHelpers.js:parseLocation()`
- Creator search controller: `src/controllers/creators.controller.js:searchCreators()`
- Proximity filtering: `src/utils/locationHelpers.js:filterByProximity()`

### Questions?
Contact the backend team or check the API documentation for more details.
