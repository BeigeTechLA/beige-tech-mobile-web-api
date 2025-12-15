# Creator Search & Discovery - Quick Start Guide

## Setup & Testing

### 1. Start the Server
```bash
cd /Users/amrik/Documents/revure/revure-v2-backend
npm run dev
```

Expected output:
```
Database connected successfully
Database models synchronized
Revure V2 Backend Server running on port 5000
Environment: development
Base API path: /v1
```

### 2. Test Health Check
```bash
curl http://localhost:5000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-12-16T...",
  "service": "revure-v2-backend"
}
```

### 3. Test Creator Search

#### Basic Search
```bash
curl http://localhost:5000/v1/creators/search
```

#### Search with Budget Filter
```bash
curl "http://localhost:5000/v1/creators/search?budget=150"
```

#### Search with Location
```bash
curl "http://localhost:5000/v1/creators/search?location=New%20York"
```

#### Search with Multiple Filters
```bash
curl "http://localhost:5000/v1/creators/search?budget=150&location=Los%20Angeles&page=1&limit=10"
```

#### Search with Skills Filter
```bash
curl "http://localhost:5000/v1/creators/search?skills=video%20production"
```

### 4. Test Creator Profile

Replace `1` with an actual crew_member_id from your database:
```bash
curl http://localhost:5000/v1/creators/1
```

### 5. Test Creator Portfolio

```bash
curl "http://localhost:5000/v1/creators/1/portfolio?page=1&limit=12"
```

### 6. Test Creator Reviews

```bash
curl http://localhost:5000/v1/creators/1/reviews
```

## Sample Test Data

### Insert Test Creator (SQL)
```sql
INSERT INTO crew_members (
  first_name,
  last_name,
  email,
  location,
  primary_role,
  hourly_rate,
  rating,
  years_of_experience,
  bio,
  skills,
  is_active,
  is_draft,
  is_available
) VALUES (
  'John',
  'Doe',
  'john.doe@example.com',
  'New York, NY',
  1,
  125.00,
  4.8,
  8,
  'Professional videographer with 8 years of experience in corporate and commercial video production.',
  '["video production", "cinematography", "editing", "color grading"]',
  1,
  0,
  1
);
```

### Insert Profile Image (SQL)
```sql
INSERT INTO crew_member_files (
  crew_member_id,
  file_type,
  file_path
) VALUES (
  1, -- Replace with actual crew_member_id
  'profile_image',
  '/uploads/profile/john_doe.jpg'
);
```

### Insert Portfolio Items (SQL)
```sql
INSERT INTO crew_member_files (crew_member_id, file_type, file_path) VALUES
(1, 'portfolio', '/uploads/portfolio/video1.mp4'),
(1, 'recent_work', '/uploads/portfolio/project1.jpg'),
(1, 'work_sample', '/uploads/portfolio/highlight.mp4');
```

## Expected Responses

### Search Response
```json
{
  "success": true,
  "data": {
    "creators": [
      {
        "id": 1,
        "name": "John Doe",
        "role": 1,
        "price": 125.00,
        "rating": 4.8,
        "image": "/uploads/profile/john_doe.jpg",
        "location": "New York, NY",
        "experience": 8,
        "bio": "Professional videographer...",
        "skills": "[\"video production\", ...]",
        "is_available": true
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 20,
      "totalPages": 1
    }
  }
}
```

### Profile Response
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "John Doe",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "role": 1,
    "price": 125.00,
    "rating": 4.8,
    "image": "/uploads/profile/john_doe.jpg",
    "location": "New York, NY",
    "experience": 8,
    "bio": "Professional videographer...",
    "skills": ["video production", "cinematography", "editing", "color grading"],
    "isAvailable": true
  }
}
```

### Portfolio Response
```json
{
  "success": true,
  "data": {
    "creatorId": "1",
    "creatorName": "John Doe",
    "portfolio": [
      {
        "id": 1,
        "type": "portfolio",
        "url": "/uploads/portfolio/video1.mp4",
        "createdAt": "2024-12-16T..."
      }
    ],
    "pagination": {
      "total": 3,
      "page": 1,
      "limit": 12,
      "totalPages": 1
    }
  }
}
```

### Reviews Response
```json
{
  "success": true,
  "data": {
    "creatorId": "1",
    "creatorName": "John Doe",
    "averageRating": 4.8,
    "totalReviews": 0,
    "reviews": [],
    "ratingDistribution": {
      "5": 0,
      "4": 0,
      "3": 0,
      "2": 0,
      "1": 0
    },
    "pagination": {
      "total": 0,
      "page": 1,
      "limit": 10,
      "totalPages": 0
    },
    "message": "Reviews system pending implementation - showing rating from profile"
  }
}
```

## Common Issues & Solutions

### Issue: "Creator not found" (404)
**Cause**: No active creator with that ID exists
**Solution**:
- Check crew_member_id exists in database
- Verify is_active = 1 and is_draft = 0
- Use correct ID in URL

### Issue: Empty search results
**Cause**: No creators match the filters
**Solution**:
- Check if creators exist in database
- Verify is_active = 1 and is_draft = 0
- Relax search filters (remove budget/location)
- Check data types (budget as number, not string)

### Issue: "Route not found" error
**Cause**: Routes not properly mounted
**Solution**:
- Verify `/src/routes/index.js` includes: `router.use('/creators', require('./creators.routes'));`
- Restart the server
- Check URL path includes `/v1` prefix

### Issue: Empty portfolio
**Cause**: No portfolio files for creator
**Solution**:
- Add entries to crew_member_files table
- Use file_type: 'portfolio', 'recent_work', or 'work_sample'
- Verify crew_member_id matches

### Issue: Database connection error
**Cause**: MySQL not running or config incorrect
**Solution**:
- Check MySQL is running: `mysql -u root -p`
- Verify `/src/config/config.js` settings
- Check `.env` file for database credentials

## Frontend Integration Example

### React Component
```javascript
import { useState, useEffect } from 'react';

function CreatorSearch() {
  const [creators, setCreators] = useState([]);
  const [filters, setFilters] = useState({
    budget: '',
    location: '',
    page: 1
  });

  useEffect(() => {
    const fetchCreators = async () => {
      const params = new URLSearchParams({
        ...(filters.budget && { budget: filters.budget }),
        ...(filters.location && { location: filters.location }),
        page: filters.page,
        limit: 20
      });

      const response = await fetch(`/v1/creators/search?${params}`);
      const data = await response.json();

      if (data.success) {
        setCreators(data.data.creators);
      }
    };

    fetchCreators();
  }, [filters]);

  return (
    <div>
      <input
        placeholder="Max Budget"
        value={filters.budget}
        onChange={(e) => setFilters({ ...filters, budget: e.target.value })}
      />
      <input
        placeholder="Location"
        value={filters.location}
        onChange={(e) => setFilters({ ...filters, location: e.target.value })}
      />

      <div>
        {creators.map(creator => (
          <div key={creator.id}>
            <img src={creator.image} alt={creator.name} />
            <h3>{creator.name}</h3>
            <p>{creator.location}</p>
            <p>${creator.price}/hr - Rating: {creator.rating}⭐</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## API Endpoints Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/v1/creators/search` | Search creators with filters |
| GET | `/v1/creators/:id` | Get creator profile |
| GET | `/v1/creators/:id/portfolio` | Get creator portfolio |
| GET | `/v1/creators/:id/reviews` | Get creator reviews |

## Next Steps

1. ✅ Verify server starts without errors
2. ✅ Test all 4 endpoints with cURL
3. ✅ Add test data to database
4. ✅ Test search filters work correctly
5. ✅ Verify pagination works
6. 📋 Integrate with frontend
7. 📋 Add rate limiting
8. 📋 Implement reviews system
9. 📋 Add database indexes
10. 📋 Configure production environment

## Additional Resources

- Full API Documentation: `/docs/CREATORS_API.md`
- Implementation Details: `/docs/CREATORS_IMPLEMENTATION_SUMMARY.md`
- Controller Source: `/src/controllers/creators.controller.js`
- Routes Source: `/src/routes/creators.routes.js`

---

**Quick Test Command:**
```bash
# Test all endpoints at once
curl http://localhost:5000/v1/creators/search && \
curl http://localhost:5000/v1/creators/1 && \
curl http://localhost:5000/v1/creators/1/portfolio && \
curl http://localhost:5000/v1/creators/1/reviews
```
