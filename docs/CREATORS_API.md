# Creator Search & Discovery API Documentation

## Overview
The Creator Search & Discovery system provides public endpoints for browsing and discovering content creators (crew members) on the Revure platform. All routes are accessible without authentication.

## Base URL
```
http://localhost:5000/v1/creators
```

---

## Endpoints

### 1. Search Creators
Search and filter creators based on multiple criteria.

**Endpoint:** `GET /v1/creators/search`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `budget` | Number | No | Maximum hourly rate (filters by `hourly_rate <= budget`) |
| `location` | String | No | Location search term (partial match) |
| `skills` | String | No | Skills search term (partial match) |
| `content_type` | Number | No | Role ID for filtering by primary role |
| `page` | Number | No | Page number (default: 1) |
| `limit` | Number | No | Results per page (default: 20, max: 100) |

**Example Request:**
```bash
GET /v1/creators/search?budget=150&location=New%20York&page=1&limit=20
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "creators": [
      {
        "id": 1,
        "name": "John Doe",
        "role": 5,
        "price": 125.00,
        "rating": 4.8,
        "image": "/uploads/profile/john_doe.jpg",
        "location": "New York, NY",
        "experience": 8,
        "bio": "Professional videographer specializing in...",
        "skills": "video production, cinematography, editing",
        "is_available": true
      }
    ],
    "pagination": {
      "total": 45,
      "page": 1,
      "limit": 20,
      "totalPages": 3
    }
  }
}
```

**Notes:**
- Results are ordered by rating (DESC) and creation date (DESC)
- Only active, non-draft creators are returned
- Profile image is selected from `crew_member_files` (priority: profile_image type)

---

### 2. Get Creator Profile
Retrieve full profile details for a specific creator.

**Endpoint:** `GET /v1/creators/:id`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | Number | Yes | Creator ID (crew_member_id) |

**Example Request:**
```bash
GET /v1/creators/42
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": 42,
    "name": "John Doe",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "phone": "+1-555-0123",
    "role": 5,
    "price": 125.00,
    "rating": 4.8,
    "image": "/uploads/profile/john_doe.jpg",
    "location": "New York, NY",
    "workingDistance": "50 miles",
    "experience": 8,
    "bio": "Professional videographer with 8 years of experience...",
    "availability": "Mon-Fri: 9am-6pm, Weekend bookings available",
    "skills": ["video production", "cinematography", "editing", "color grading"],
    "certifications": ["FAA Part 107 Drone License", "Adobe Certified Professional"],
    "equipment": ["Sony A7SIII", "DJI Ronin RS3", "DJI Mavic 3"],
    "socialMedia": {
      "instagram": "@johndoe",
      "twitter": "@johndoe",
      "website": "https://johndoe.com"
    },
    "isBeigeMember": true,
    "isAvailable": true
  }
}
```

**Error Response (404):**
```json
{
  "success": false,
  "message": "Creator not found"
}
```

**Notes:**
- JSON fields (skills, certifications, equipment, socialMedia) are automatically parsed
- Only active creators can be viewed

---

### 3. Get Creator Portfolio
Retrieve portfolio items for a specific creator.

**Endpoint:** `GET /v1/creators/:id/portfolio`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | Number | Yes | Creator ID (crew_member_id) |

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page` | Number | No | Page number (default: 1) |
| `limit` | Number | No | Results per page (default: 12) |

**Example Request:**
```bash
GET /v1/creators/42/portfolio?page=1&limit=12
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "creatorId": "42",
    "creatorName": "John Doe",
    "portfolio": [
      {
        "id": 101,
        "type": "portfolio",
        "url": "/uploads/portfolio/video1.mp4",
        "createdAt": "2024-12-01T10:30:00.000Z"
      },
      {
        "id": 102,
        "type": "recent_work",
        "url": "/uploads/portfolio/project_highlight.jpg",
        "createdAt": "2024-11-28T14:20:00.000Z"
      }
    ],
    "pagination": {
      "total": 24,
      "page": 1,
      "limit": 12,
      "totalPages": 2
    }
  }
}
```

**Error Response (404):**
```json
{
  "success": false,
  "message": "Creator not found"
}
```

**Notes:**
- Portfolio includes files with `file_type` in: 'portfolio', 'recent_work', 'work_sample'
- Results are ordered by creation date (DESC) - newest first
- Supports various media types (images, videos, documents)

---

### 4. Get Creator Reviews
Retrieve reviews and ratings for a specific creator.

**Endpoint:** `GET /v1/creators/:id/reviews`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | Number | Yes | Creator ID (crew_member_id) |

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page` | Number | No | Page number (default: 1) |
| `limit` | Number | No | Results per page (default: 10) |

**Example Request:**
```bash
GET /v1/creators/42/reviews?page=1&limit=10
```

**Current Response (200):**
```json
{
  "success": true,
  "data": {
    "creatorId": "42",
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

**Future Response Structure (when reviews table is implemented):**
```json
{
  "success": true,
  "data": {
    "creatorId": "42",
    "creatorName": "John Doe",
    "averageRating": 4.8,
    "totalReviews": 127,
    "reviews": [
      {
        "id": 1,
        "rating": 5,
        "comment": "Excellent work, highly professional!",
        "projectId": 89,
        "projectName": "Corporate Video Shoot",
        "reviewerName": "Jane Smith",
        "createdAt": "2024-11-15T10:30:00.000Z"
      }
    ],
    "ratingDistribution": {
      "5": 89,
      "4": 28,
      "3": 7,
      "2": 2,
      "1": 1
    },
    "pagination": {
      "total": 127,
      "page": 1,
      "limit": 10,
      "totalPages": 13
    }
  }
}
```

**Notes:**
- Currently returns rating from `crew_members.rating` field
- Reviews system requires separate `reviews` table (to be implemented)
- Rating distribution will be calculated from actual reviews when implemented

---

## Data Models

### Creator (crew_members table)
```sql
- crew_member_id: INTEGER (Primary Key)
- first_name: VARCHAR(255)
- last_name: VARCHAR(255)
- email: VARCHAR(255) UNIQUE
- phone_number: VARCHAR(50)
- location: TEXT
- working_distance: VARCHAR(50)
- primary_role: INTEGER (foreign key to crew_roles)
- years_of_experience: INTEGER
- hourly_rate: DECIMAL(10,2)
- bio: TEXT
- availability: TEXT
- skills: TEXT (JSON string or comma-separated)
- certifications: TEXT (JSON string)
- equipment_ownership: TEXT (JSON string)
- social_media_links: TEXT (JSON string)
- is_beige_member: INTEGER (0/1)
- is_available: INTEGER (0/1)
- rating: DECIMAL(2,1)
- is_draft: BOOLEAN (default: 0)
- is_active: BOOLEAN (default: 1)
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

### Creator Files (crew_member_files table)
```sql
- crew_files_id: INTEGER (Primary Key)
- crew_member_id: INTEGER (Foreign Key)
- file_type: VARCHAR(255) - values: 'profile_image', 'portfolio', 'recent_work', 'work_sample', etc.
- file_path: VARCHAR(255)
- created_at: TIMESTAMP
```

---

## Error Handling

### Standard Error Response Format
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

### Common HTTP Status Codes
- `200` - Success
- `404` - Resource not found (creator doesn't exist or inactive)
- `500` - Internal server error

---

## Implementation Notes

### Current Limitations
1. **Reviews System**: Not yet implemented - requires separate reviews table
2. **Role Names**: Returns `primary_role` as ID - frontend should map to role names using `crew_roles` table
3. **JSON Fields**: Some TEXT fields (skills, certifications, equipment) may store data as JSON strings or comma-separated values

### Recommended Enhancements
1. Create `reviews` table with fields:
   - review_id (PK)
   - crew_member_id (FK)
   - project_id (FK)
   - reviewer_id (FK to users)
   - rating (1-5)
   - comment
   - created_at

2. Add full-text search indexes on:
   - crew_members.skills
   - crew_members.bio
   - crew_members.location

3. Add computed rating field that auto-updates from reviews

4. Consider adding:
   - Favoriting/bookmarking creators
   - Creator availability calendar
   - Real-time availability status
   - Response time metrics

---

## Usage Examples

### Frontend Integration Example (React)
```javascript
// Search creators by budget and location
const searchCreators = async (filters) => {
  const params = new URLSearchParams({
    budget: filters.maxBudget || '',
    location: filters.location || '',
    page: filters.page || 1,
    limit: 20
  });

  const response = await fetch(`/v1/creators/search?${params}`);
  const data = await response.json();

  if (data.success) {
    return data.data.creators;
  }
  throw new Error(data.message);
};

// Get creator full profile
const getCreatorProfile = async (creatorId) => {
  const response = await fetch(`/v1/creators/${creatorId}`);
  const data = await response.json();

  if (data.success) {
    return data.data;
  }
  throw new Error(data.message);
};

// Load creator portfolio
const getCreatorPortfolio = async (creatorId, page = 1) => {
  const response = await fetch(`/v1/creators/${creatorId}/portfolio?page=${page}`);
  const data = await response.json();

  if (data.success) {
    return data.data.portfolio;
  }
  throw new Error(data.message);
};
```

---

## Testing Endpoints

### Using cURL

**Search creators:**
```bash
curl -X GET "http://localhost:5000/v1/creators/search?budget=150&location=New%20York"
```

**Get creator profile:**
```bash
curl -X GET "http://localhost:5000/v1/creators/42"
```

**Get creator portfolio:**
```bash
curl -X GET "http://localhost:5000/v1/creators/42/portfolio?page=1&limit=12"
```

**Get creator reviews:**
```bash
curl -X GET "http://localhost:5000/v1/creators/42/reviews"
```

---

## Security Considerations

1. **Public Access**: All endpoints are public - no sensitive data exposed
2. **Rate Limiting**: Consider implementing rate limiting to prevent abuse
3. **Input Validation**: All query parameters are sanitized by Sequelize
4. **SQL Injection**: Protected by Sequelize ORM parameterized queries
5. **XSS Protection**: JSON responses are automatically escaped

### Recommended Security Additions
```javascript
// Add rate limiting
const rateLimit = require('express-rate-limit');

const creatorSearchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

router.get('/search', creatorSearchLimiter, creatorsController.searchCreators);
```

---

## Performance Optimization

### Database Indexes (Recommended)
```sql
-- Improve search performance
CREATE INDEX idx_crew_members_hourly_rate ON crew_members(hourly_rate);
CREATE INDEX idx_crew_members_location ON crew_members(location);
CREATE INDEX idx_crew_members_rating ON crew_members(rating DESC);
CREATE INDEX idx_crew_members_active_draft ON crew_members(is_active, is_draft);

-- Improve portfolio queries
CREATE INDEX idx_crew_member_files_type ON crew_member_files(crew_member_id, file_type);
```

### Caching Strategy
Consider implementing Redis caching for:
- Popular creator profiles
- Search results for common filters
- Portfolio items (static content)

Cache TTL recommendations:
- Creator profiles: 5-10 minutes
- Search results: 2-5 minutes
- Portfolio: 30 minutes (updates infrequently)
