# Mapbox Location Integration - Testing Checklist

## Pre-Deployment Testing Checklist

### Environment Setup
- [ ] Backend server running on correct port
- [ ] Database connection verified
- [ ] Test data exists in database
- [ ] API authentication tokens available

---

## Unit Tests

### Location Helpers (`/src/utils/locationHelpers.js`)

#### parseLocation()
- [ ] Parse Mapbox JSON string format
- [ ] Parse Mapbox object format
- [ ] Parse plain string address
- [ ] Handle null/undefined/empty string
- [ ] Handle malformed JSON
- [ ] Handle latitude/longitude variants (lat vs latitude)

#### isValidCoordinate()
- [ ] Accept valid coordinates (0,0), (90,180), (-90,-180)
- [ ] Reject out-of-range latitude (>90, <-90)
- [ ] Reject out-of-range longitude (>180, <-180)
- [ ] Reject NaN values
- [ ] Reject non-numeric values

#### calculateDistance()
- [ ] Calculate distance between LA and SF (~347 miles)
- [ ] Calculate distance between nearby points (<5 miles)
- [ ] Return 0 for same location
- [ ] Return null for invalid coordinates
- [ ] Round to 1 decimal place

#### filterByProximity()
- [ ] Filter items by maxDistance
- [ ] Add distance property to results
- [ ] Sort results by distance (ascending)
- [ ] Handle items without coordinates
- [ ] Return all items when maxDistance is null
- [ ] Return all items when targetLocation is null

#### formatLocationResponse()
- [ ] Format Mapbox location with coordinates
- [ ] Format plain string address
- [ ] Handle null/undefined
- [ ] Set hasCoordinates flag correctly

**Run Unit Tests:**
```bash
# Install Jest if needed
npm install --save-dev jest

# Run tests
npm test tests/locationHelpers.test.js
```

---

## API Endpoint Tests

### Bookings API

#### POST /api/bookings/create

**Test 1: Create with Mapbox JSON String**
```bash
curl -X POST http://localhost:3000/api/bookings/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "order_name": "Test Event",
    "location": "{\"lat\":34.0522,\"lng\":-118.2437,\"address\":\"Los Angeles, CA\"}",
    "event_type": "conference",
    "start_date_time": "2025-12-25T10:00:00",
    "budget_max": 5000
  }'
```
- [ ] Returns 201 Created
- [ ] Response includes formatted event_location
- [ ] event_location has address property
- [ ] event_location has coordinates object
- [ ] hasCoordinates is true

**Test 2: Create with Plain String**
```bash
curl -X POST http://localhost:3000/api/bookings/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "order_name": "Test Event 2",
    "location": "New York, NY",
    "event_type": "conference",
    "start_date_time": "2025-12-26T10:00:00",
    "budget_max": 3000
  }'
```
- [ ] Returns 201 Created
- [ ] Response includes formatted event_location
- [ ] event_location.address is "New York, NY"
- [ ] event_location.coordinates is null
- [ ] hasCoordinates is false

**Test 3: Create with Object (not stringified)**
```bash
curl -X POST http://localhost:3000/api/bookings/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "order_name": "Test Event 3",
    "location": {"lat":34.0522,"lng":-118.2437,"address":"Los Angeles, CA"},
    "event_type": "conference",
    "start_date_time": "2025-12-27T10:00:00",
    "budget_max": 4000
  }'
```
- [ ] Returns 201 Created
- [ ] Location is properly stringified before storage
- [ ] Response includes formatted event_location

#### GET /api/bookings/:id

**Test 4: Get Booking with Location**
```bash
curl http://localhost:3000/api/bookings/123 \
  -H "Authorization: Bearer YOUR_TOKEN"
```
- [ ] Returns 200 OK
- [ ] event_location is formatted object
- [ ] Has address, coordinates, hasCoordinates fields

#### PUT /api/bookings/:id

**Test 5: Update Booking Location**
```bash
curl -X PUT http://localhost:3000/api/bookings/123 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "location": "{\"lat\":34.0407,\"lng\":-118.2468,\"address\":\"Hollywood, CA\"}"
  }'
```
- [ ] Returns 200 OK
- [ ] Location is updated
- [ ] Response includes formatted event_location

#### GET /api/bookings

**Test 6: List Bookings**
```bash
curl "http://localhost:3000/api/bookings?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```
- [ ] Returns 200 OK
- [ ] All bookings have formatted event_location
- [ ] Pagination works correctly

---

### Creators API

#### GET /api/creators/search (Text-based)

**Test 7: Search by Text Location**
```bash
curl "http://localhost:3000/api/creators/search?location=Los%20Angeles&budget=100&page=1&limit=20" \
  -H "Authorization: Bearer YOUR_TOKEN"
```
- [ ] Returns 200 OK
- [ ] Finds creators with "Los Angeles" in location field
- [ ] searchParams.useProximitySearch is false
- [ ] No distance field in results

#### GET /api/creators/search (Proximity-based)

**Test 8: Search with Proximity**
```bash
curl "http://localhost:3000/api/creators/search?location=%7B%22lat%22%3A34.0522%2C%22lng%22%3A-118.2437%2C%22address%22%3A%22Los%20Angeles%22%7D&maxDistance=25&page=1&limit=20" \
  -H "Authorization: Bearer YOUR_TOKEN"
```
Note: URL encoded `{"lat":34.0522,"lng":-118.2437,"address":"Los Angeles"}`

- [ ] Returns 200 OK
- [ ] searchParams.useProximitySearch is true
- [ ] searchParams.maxDistance is 25
- [ ] Results include distance field
- [ ] Results include distanceText field
- [ ] Results sorted by distance (ascending)
- [ ] No results beyond 25 miles

**Test 9: Proximity with No Results**
```bash
curl "http://localhost:3000/api/creators/search?location=%7B%22lat%22%3A0%2C%22lng%22%3A0%7D&maxDistance=1" \
  -H "Authorization: Bearer YOUR_TOKEN"
```
- [ ] Returns 200 OK
- [ ] Empty creators array
- [ ] Total count is 0

**Test 10: Missing maxDistance (Fallback to Text)**
```bash
curl "http://localhost:3000/api/creators/search?location=%7B%22lat%22%3A34.0522%2C%22lng%22%3A-118.2437%7D" \
  -H "Authorization: Bearer YOUR_TOKEN"
```
- [ ] Returns 200 OK
- [ ] Falls back to text search
- [ ] searchParams.useProximitySearch is false
- [ ] No distance field in results

#### GET /api/creators/:id

**Test 11: Get Creator Profile**
```bash
curl http://localhost:3000/api/creators/1 \
  -H "Authorization: Bearer YOUR_TOKEN"
```
- [ ] Returns 200 OK
- [ ] location is formatted object
- [ ] Has address, coordinates, hasCoordinates fields

---

### Equipment API

#### GET /api/equipment/search (Text-based)

**Test 12: Search by Text Location**
```bash
curl "http://localhost:3000/api/equipment/search?location=Los%20Angeles&category=1&minPrice=50&maxPrice=200" \
  -H "Authorization: Bearer YOUR_TOKEN"
```
- [ ] Returns 200 OK
- [ ] Finds equipment with "Los Angeles" in storage_location
- [ ] searchParams.useProximitySearch is false

#### GET /api/equipment/search (Proximity-based)

**Test 13: Search with Proximity**
```bash
curl "http://localhost:3000/api/equipment/search?location=%7B%22lat%22%3A34.0522%2C%22lng%22%3A-118.2437%7D&maxDistance=50&category=1" \
  -H "Authorization: Bearer YOUR_TOKEN"
```
- [ ] Returns 200 OK
- [ ] searchParams.useProximitySearch is true
- [ ] Results include distance field
- [ ] Results sorted by distance
- [ ] No results beyond 50 miles

#### GET /api/equipment/:id

**Test 14: Get Equipment Details**
```bash
curl http://localhost:3000/api/equipment/1 \
  -H "Authorization: Bearer YOUR_TOKEN"
```
- [ ] Returns 200 OK
- [ ] location is formatted object

---

## Integration Tests

### Workflow 1: Create Booking and Find Creators

1. **Create Booking with Location**
   ```bash
   curl -X POST /api/bookings/create \
     -d '{"location": "{\"lat\":34.05,\"lng\":-118.24,\"address\":\"LA\"}", ...}'
   ```
   - [ ] Booking created with ID

2. **Search Creators Near Booking**
   ```bash
   curl "/api/creators/search?location={\"lat\":34.05,\"lng\":-118.24}&maxDistance=25"
   ```
   - [ ] Returns creators within 25 miles
   - [ ] Includes distance information

3. **Get Creator Profile**
   ```bash
   curl /api/creators/1
   ```
   - [ ] Profile includes formatted location
   - [ ] Can calculate distance to booking

### Workflow 2: Find Equipment Near Creator

1. **Get Creator Location**
   ```bash
   curl /api/creators/1
   ```
   - [ ] Extract location coordinates

2. **Search Equipment Near Creator**
   ```bash
   curl "/api/equipment/search?location={\"lat\":...,\"lng\":...}&maxDistance=50"
   ```
   - [ ] Returns equipment within 50 miles
   - [ ] Sorted by distance

### Workflow 3: Backward Compatibility

1. **Create Booking with Plain String (Old Format)**
   ```bash
   curl -X POST /api/bookings/create \
     -d '{"location": "Los Angeles, CA", ...}'
   ```
   - [ ] Works exactly as before

2. **Get Booking**
   ```bash
   curl /api/bookings/:id
   ```
   - [ ] Returns enhanced location format
   - [ ] hasCoordinates is false

3. **Search with Plain String**
   ```bash
   curl "/api/creators/search?location=Los Angeles"
   ```
   - [ ] Works exactly as before
   - [ ] No proximity features (expected)

---

## Edge Cases

### Invalid Data

**Test 15: Invalid Coordinates**
```bash
curl -X POST /api/bookings/create \
  -d '{"location": "{\"lat\":999,\"lng\":-500,\"address\":\"Invalid\"}", ...}'
```
- [ ] Accepts request (doesn't crash)
- [ ] Stores location
- [ ] Coordinates treated as null in responses

**Test 16: Malformed JSON**
```bash
curl -X POST /api/bookings/create \
  -d '{"location": "{broken json}", ...}'
```
- [ ] Accepts request
- [ ] Treats as plain string

**Test 17: Empty Location**
```bash
curl -X POST /api/bookings/create \
  -d '{"location": "", ...}'
```
- [ ] Accepts request
- [ ] location is null or empty

**Test 18: Very Large Distance**
```bash
curl "/api/creators/search?location={\"lat\":34.05,\"lng\":-118.24}&maxDistance=10000"
```
- [ ] Works (returns many results)
- [ ] Consider adding max limit

### Performance

**Test 19: Large Result Set with Proximity**
```bash
curl "/api/creators/search?maxDistance=1000"
```
- [ ] Returns results (may be slow)
- [ ] Pagination works correctly
- [ ] Response time acceptable (<5 seconds)

**Test 20: Concurrent Requests**
```bash
# Send 10 concurrent proximity searches
for i in {1..10}; do
  curl "/api/creators/search?location={\"lat\":34.05,\"lng\":-118.24}&maxDistance=25" &
done
wait
```
- [ ] All requests succeed
- [ ] No race conditions
- [ ] Reasonable response times

---

## Database Verification

### Data Storage

**Test 21: Verify Location Storage**
```sql
-- Check how locations are stored
SELECT event_location FROM stream_project_booking WHERE stream_project_booking_id = 123;
```
- [ ] Mapbox format stored as JSON string
- [ ] Plain strings stored as-is

**Test 22: Verify Location Retrieval**
```sql
-- Verify data can be parsed
SELECT
  event_location,
  CASE
    WHEN event_location LIKE '{%' THEN 'JSON'
    ELSE 'String'
  END as format
FROM stream_project_booking
LIMIT 10;
```
- [ ] Both formats present in database
- [ ] Both formats returned correctly by API

---

## Frontend Integration Tests

### React Component Tests

**Test 23: Display Location**
```javascript
// Component that displays location
<LocationDisplay location={booking.event_location} />

// Should handle:
// - Plain string: "Los Angeles, CA"
// - Object: { address: "Los Angeles, CA", coordinates: {...} }
```
- [ ] Displays address correctly
- [ ] Shows map button when coordinates available
- [ ] Handles null/undefined gracefully

**Test 24: Search with Mapbox Picker**
```javascript
// User selects location from Mapbox
const selectedPlace = mapboxGeocoder.result;

// Format for API
const location = JSON.stringify({
  lat: selectedPlace.center[1],
  lng: selectedPlace.center[0],
  address: selectedPlace.place_name
});

// Submit to API
createBooking({ location });
```
- [ ] Location formatted correctly
- [ ] API accepts formatted location
- [ ] Booking created successfully

**Test 25: Show Distance in Results**
```javascript
// Search results with distance
creators.map(creator => (
  <div>
    {creator.name} - {creator.distanceText}
  </div>
))
```
- [ ] Distance displayed when available
- [ ] Graceful handling when distance is null

---

## Cross-Browser Testing

### Desktop Browsers
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

### Mobile Browsers
- [ ] iOS Safari
- [ ] Chrome Mobile
- [ ] Samsung Internet

---

## Deployment Checklist

### Pre-Deployment
- [ ] All unit tests pass
- [ ] All API endpoint tests pass
- [ ] Integration tests pass
- [ ] Edge case handling verified
- [ ] Database queries optimized
- [ ] No console errors in code
- [ ] Documentation complete

### Deployment
- [ ] Deploy to staging environment
- [ ] Run smoke tests on staging
- [ ] Verify database compatibility
- [ ] Check API response times
- [ ] Verify frontend integration
- [ ] Test with real Mapbox API keys

### Post-Deployment
- [ ] Monitor error logs
- [ ] Check API response times
- [ ] Verify proximity search accuracy
- [ ] Monitor database performance
- [ ] Collect user feedback

---

## Rollback Plan

If issues arise:

1. **Backend Issues**
   - [ ] Revert controller changes
   - [ ] Keep utility files (no harm)
   - [ ] API returns to plain strings

2. **Frontend Issues**
   - [ ] Frontend can still send plain strings
   - [ ] Backend handles both formats
   - [ ] No data loss

3. **Database Issues**
   - [ ] No migration needed
   - [ ] Data is compatible with old code
   - [ ] Can rollback safely

---

## Performance Benchmarks

### Baseline Targets

**Text-based Search:**
- Response time: <500ms
- Database queries: 1-2
- Memory usage: Normal

**Proximity-based Search:**
- Response time: <2000ms (acceptable)
- Response time: <1000ms (good)
- Response time: <500ms (excellent)
- Database queries: 1-2
- Memory usage: Moderate

**Distance Calculation:**
- Per item: <1ms
- 100 items: <100ms
- 1000 items: <1000ms

### Load Testing
```bash
# Use Apache Bench or similar
ab -n 1000 -c 10 "http://localhost:3000/api/creators/search?location=Los%20Angeles"
```
- [ ] 99% of requests <2s
- [ ] No 500 errors
- [ ] Server remains stable

---

## Success Criteria

### Must Have (P0)
- [ ] All location formats accepted by API
- [ ] All responses include formatted location
- [ ] Proximity search works with coordinates
- [ ] Text search works without coordinates
- [ ] Backward compatibility maintained
- [ ] No data loss or corruption

### Should Have (P1)
- [ ] Distance calculations accurate (±10%)
- [ ] Results sorted by distance correctly
- [ ] Response times under 2 seconds
- [ ] Unit tests pass
- [ ] Documentation complete

### Nice to Have (P2)
- [ ] Performance optimizations
- [ ] Caching for common searches
- [ ] Frontend helper functions
- [ ] Admin tools for debugging

---

## Sign-off

**Testing Completed By:** _______________
**Date:** _______________
**Environment:** [ ] Local [ ] Staging [ ] Production
**All Critical Tests Pass:** [ ] Yes [ ] No
**Ready for Deployment:** [ ] Yes [ ] No

**Notes:**
_____________________________________________
_____________________________________________
_____________________________________________
