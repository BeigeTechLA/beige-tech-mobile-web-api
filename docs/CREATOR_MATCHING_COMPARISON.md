# Creator Profile Matching Algorithm Comparison

**Date:** December 19, 2025
**Comparing:** beige-server vs revure-v2-backend
**Purpose:** Document differences in creator/crew matching algorithms

---

## Executive Summary

Both systems implement creator/crew profile searching and matching, but with different approaches:

- **beige-server**: Uses a **matching algorithm** with scoring based on skill overlap
- **revure-v2-backend**: Uses **filtered search** with proximity-based location filtering

---

## Algorithm Overview

### beige-server: `matchCrew` Algorithm

**Endpoint:** `/api/admin/matchCrew`
**Method:** POST
**Location:** `beige-server/src/controllers/admin.controller.js:378`

#### Input Parameters
```javascript
{
  crew_roles: string | string[],        // Required - role IDs (e.g., "1", "2")
  required_skills: string | string[],   // Required - skills to match
  crew_size_needed: number,             // Optional - limit results
  location: string,                     // Optional - location filter
  hourly_rate: number                   // Optional - desired rate with ±20% range
}
```

#### Algorithm Steps

1. **Input Validation**
   - Validates required fields (crew_roles, required_skills)
   - Converts inputs to arrays if necessary
   - Parses hourly_rate with 20% tolerance range

2. **Rate Range Calculation**
   ```javascript
   const rateRange = 0.20;  // ±20% tolerance
   const lowerLimit = hourlyRate - (hourlyRate * 0.20);
   const upperLimit = hourlyRate + (hourlyRate * 0.20);
   ```

3. **Data Fetching**
   - Fetches ALL active crew members
   - No database-level filtering (except is_active=1)

4. **Filtering Logic**
   - **Role Match**: `primary_role` must be in `crew_roles` array
   - **Skill Match**: At least 1 skill must overlap with required_skills
   - **Location Match**: Exact case-insensitive string match (if provided)
   - **Rate Match**: hourly_rate within ±20% range (if provided)
   - ALL conditions must be TRUE

5. **Scoring Mechanism**
   ```javascript
   matchCount = matchingSkills.length  // Number of overlapping skills
   ```

6. **Sorting**
   - Sorts by `matchCount` (descending)
   - Higher skill overlap = better match

7. **Result Limiting**
   - Does NOT limit by crew_size_needed (commented out in code)
   - Returns all matching results

#### Key Characteristics

✅ **Strengths:**
- Skill-based scoring provides ranked results
- Flexible hourly rate matching (±20% range)
- Simple to understand matching logic

❌ **Weaknesses:**
- Loads ALL crew members into memory
- No pagination support
- Location is exact string match only (no proximity search)
- No geographic distance calculations
- crew_size_needed parameter ignored

---

### revure-v2-backend: `searchCreators` Function

**Endpoint:** `/v1/creators/search`
**Method:** GET
**Location:** `revure-v2-backend/src/controllers/creators.controller.js:14`

#### Input Parameters
```javascript
{
  budget: number,              // Optional - max hourly_rate
  location: string | object,   // Optional - supports plain text or Mapbox JSON
  skills: string,              // Optional - skill keyword search
  content_type: number,        // Optional - role_id filter
  maxDistance: number,         // Optional - proximity radius in miles
  page: number,                // Default: 1
  limit: number                // Default: 20
}
```

#### Algorithm Steps

1. **Location Parsing**
   - Supports two formats:
     - Plain string: `"Los Angeles, CA"`
     - Mapbox JSON: `{"lat":34.0522,"lng":-118.2437,"address":"Los Angeles, CA"}`
   - Determines if proximity search is possible

2. **Database Query Building**
   ```javascript
   whereClause = {
     is_active: 1,
     is_draft: 0,
     hourly_rate: { [Op.lte]: budget },         // If budget provided
     location: { [Op.like]: `%${location}%` },  // If no coordinates
     skills: { [Op.like]: `%${skills}%` },      // If skills provided
     primary_role: content_type                 // If content_type provided
   }
   ```

3. **Database-Level Filtering**
   - Uses Sequelize ORM with SQL WHERE clauses
   - Filters at database level (more efficient)
   - Includes crew_member_files for profile images

4. **Proximity Search** (if coordinates + maxDistance provided)
   - Fetches all matching creators first
   - Applies haversine distance calculation
   - Filters by maxDistance radius
   - Paginates AFTER proximity filtering

5. **Sorting**
   - Primary: Rating (DESC)
   - Secondary: Created date (DESC)
   - No skill-based scoring

6. **Result Transformation**
   - Maps database fields to frontend structure
   - Converts role_id to role_name
   - Includes pagination metadata

7. **Pagination**
   - Standard page/limit pagination
   - Returns hasMore flag
   - Total count included

#### Key Characteristics

✅ **Strengths:**
- Database-level filtering (efficient)
- Supports geographic proximity search
- Pagination for large result sets
- Flexible location input (plain text or coordinates)
- Returns structured pagination metadata

❌ **Weaknesses:**
- No skill-based scoring/ranking
- Budget is max limit only (no range)
- Skills filter is simple LIKE search (no overlap scoring)
- Results not ranked by match quality

---

## Feature Comparison Matrix

| Feature | beige-server | revure-v2-backend |
|---------|-------------|------------------|
| **Filtering Approach** | In-memory | Database-level |
| **Role Filtering** | ✅ Array-based | ✅ Single role |
| **Skill Matching** | ✅ Overlap scoring | ⚠️ LIKE search |
| **Location Filtering** | ⚠️ Exact string | ✅ Text + Proximity |
| **Proximity Search** | ❌ No | ✅ Haversine distance |
| **Budget/Rate Filter** | ✅ Range (±20%) | ⚠️ Max limit only |
| **Pagination** | ❌ No | ✅ Yes |
| **Result Scoring** | ✅ Skill overlap count | ❌ No |
| **Sorting** | Match score (DESC) | Rating (DESC) |
| **Memory Usage** | ⚠️ Loads all records | ✅ Database limits |
| **Performance** | ⚠️ O(n) in-memory | ✅ Indexed queries |
| **Profile Images** | ❌ Not included | ✅ Included |
| **Multiple Roles** | ✅ Supported | ❌ Single role only |

---

## Detailed Algorithm Comparison

### 1. Skill Matching

#### beige-server (Better)
```javascript
// Finds overlapping skills and counts them
const matchingSkills = crewSkills.filter(s => skillsArr.includes(s));
const skillMatch = matchingSkills.length > 0;
matchCount = matchingSkills.length;  // Used for sorting
```
**Result:** Ranked by number of matching skills

#### revure-v2-backend (Basic)
```javascript
// Simple substring search
whereClause.skills = { [Op.like]: `%${skills}%` };
```
**Result:** Binary match (has skill or doesn't)

---

### 2. Location Filtering

#### beige-server (Basic)
```javascript
// Exact case-insensitive string match
const locationMatch = !location ||
  crewLocation === location.trim().toLowerCase();
```
**Limitation:** No proximity search, must match exactly

#### revure-v2-backend (Advanced)
```javascript
// Parse location to get coordinates
parsedLocation = parseLocation(location);

// Option 1: Text-based (no coordinates)
whereClause.location = { [Op.like]: `%${location}%` };

// Option 2: Proximity search (with coordinates)
if (useProximitySearch) {
  transformedCreators = filterByProximity(
    transformedCreators,
    parsedLocation,
    parseFloat(maxDistance),
    'location'
  );
}
```
**Advantage:** Supports "within X miles" searches

---

### 3. Budget/Rate Matching

#### beige-server (Flexible Range)
```javascript
// ±20% tolerance around desired rate
const rateRange = 0.20;
const lowerLimit = desiredHourlyRate * 0.80;
const upperLimit = desiredHourlyRate * 1.20;

// Matches if within range
const hourlyRateMatch = crewHourlyRate >= lowerLimit &&
                        crewHourlyRate <= upperLimit;
```
**Use Case:** "Find creators around $100/hr" → matches $80-$120

#### revure-v2-backend (Max Budget)
```javascript
// Only filters by maximum budget
whereClause.hourly_rate = { [Op.lte]: budget };
```
**Use Case:** "Budget is $100" → matches anyone ≤$100

---

### 4. Performance & Scalability

#### beige-server
```javascript
// Loads ALL crew members
let crewList = await crew_members.findAll({
  where: { is_active: 1 }
});

// Filters in JavaScript
for (const crew of crewList) {
  // Check conditions...
  if (roleMatch && skillMatch && locationMatch && hourlyRateMatch) {
    filtered.push(crew);
  }
}
```
**Performance:**
- ❌ O(n) complexity
- ❌ All data loaded into memory
- ❌ Scales poorly with large datasets

#### revure-v2-backend
```javascript
// Database-level WHERE clause
const queryOptions = {
  where: whereClause,  // Indexed database filtering
  limit: parseInt(limit),
  offset: offset
};

const { count, rows } = await crew_members.findAndCountAll(queryOptions);
```
**Performance:**
- ✅ Uses database indexes
- ✅ Only loads needed records
- ✅ Scales well with pagination

---

## Use Case Recommendations

### Use beige-server Algorithm When:
1. ✅ Need **skill-based ranking** (best match first)
2. ✅ Want **flexible rate matching** (±20% range)
3. ✅ Need to match **multiple roles** simultaneously
4. ✅ Small dataset (<1000 creators)
5. ✅ Match quality scoring is priority

### Use revure-v2-backend Algorithm When:
1. ✅ Need **geographic proximity** search
2. ✅ Working with **large datasets** (>1000 creators)
3. ✅ Need **pagination** for results
4. ✅ Want **database-level filtering** (performance)
5. ✅ Location-based search is priority

---

## Recommendations for Improvement

### For beige-server (matchCrew):

1. **Add Pagination**
   ```javascript
   const page = req.body.page || 1;
   const limit = req.body.limit || 20;
   const offset = (page - 1) * limit;

   filtered = filtered.slice(offset, offset + limit);
   ```

2. **Use Database Filtering First**
   ```javascript
   // Filter at database level, then score in memory
   const crewList = await crew_members.findAll({
     where: {
       is_active: 1,
       primary_role: { [Op.in]: rolesArr }
     }
   });
   ```

3. **Add Proximity Search**
   - Integrate haversine distance calculations
   - Support maxDistance parameter

4. **Respect crew_size_needed Parameter**
   ```javascript
   if (sizeNeeded && filtered.length > sizeNeeded) {
     filtered = filtered.slice(0, sizeNeeded);
   }
   ```

### For revure-v2-backend (searchCreators):

1. **Add Skill Overlap Scoring**
   ```javascript
   // After fetching creators, score by skill matches
   const scoredCreators = transformedCreators.map(creator => {
     const creatorSkills = parseSkills(creator.skills);
     const matchCount = creatorSkills.filter(s =>
       requestedSkills.includes(s)
     ).length;

     return { ...creator, matchScore: matchCount };
   });

   // Sort by score, then rating
   scoredCreators.sort((a, b) =>
     b.matchScore - a.matchScore || b.rating - a.rating
   );
   ```

2. **Add Budget Range Support**
   ```javascript
   // Accept min_budget and max_budget
   if (min_budget || max_budget) {
     whereClause.hourly_rate = {
       [Op.gte]: min_budget || 0,
       [Op.lte]: max_budget || 999999
     };
   }
   ```

3. **Support Multiple Roles**
   ```javascript
   if (content_types) {  // Array of role IDs
     whereClause.primary_role = {
       [Op.in]: content_types
     };
   }
   ```

---

## Migration Path

If migrating from beige-server to revure-v2-backend:

### Phase 1: Feature Parity
1. Add skill overlap scoring to v2-backend
2. Add budget range filtering
3. Add multiple role filtering

### Phase 2: Hybrid Approach
```javascript
// Combine best of both:
// 1. Database filtering (v2-backend approach)
// 2. In-memory scoring (beige-server approach)
// 3. Proximity search (v2-backend feature)

const creators = await databaseFilter(params);  // v2-backend
const scored = scoreBySkills(creators, skills);  // beige-server
const sorted = sortByScore(scored);             // beige-server
const paginated = paginate(sorted, page, limit); // v2-backend
```

### Phase 3: Full Optimization
1. Move skill scoring to database (PostgreSQL arrays or JSON functions)
2. Use spatial database features for location (PostGIS)
3. Implement full-text search for skills
4. Add caching layer for common searches

---

## Conclusion

Both algorithms serve different purposes:

- **beige-server** excels at **match quality** through skill-based scoring
- **revure-v2-backend** excels at **scalability** and **geographic search**

The ideal solution would combine:
- Database-level filtering (v2-backend)
- Skill overlap scoring (beige-server)
- Proximity search (v2-backend)
- Flexible rate ranges (beige-server)
- Pagination (v2-backend)

---

## Code References

### beige-server
- **File:** `beige-server/src/controllers/admin.controller.js`
- **Function:** `matchCrew` (line 378)
- **Endpoint:** `POST /api/admin/matchCrew`

### revure-v2-backend
- **File:** `revure-v2-backend/src/controllers/creators.controller.js`
- **Function:** `searchCreators` (line 14)
- **Endpoint:** `GET /v1/creators/search`
- **Helpers:** `revure-v2-backend/src/utils/locationHelpers.js`

---

*Document generated: December 19, 2025*
