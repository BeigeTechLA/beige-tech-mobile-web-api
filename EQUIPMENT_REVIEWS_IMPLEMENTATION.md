# Equipment by Creator and Reviews System Implementation

## Overview
This implementation adds:
1. Equipment ownership tracking (linking equipment to creators)
2. Reviews system for crew members/creators
3. New API endpoints for equipment by creator and reviews

## Database Changes

### Migration File
Location: `/Users/amrik/Documents/revure/revure-v2-backend/migrations/add_equipment_owner_and_reviews_system.sql`

### Changes Made

#### 1. Equipment Table - Add Owner
```sql
ALTER TABLE equipment
ADD COLUMN owner_id INT NULL AFTER category_id,
ADD CONSTRAINT fk_equipment_owner
  FOREIGN KEY (owner_id) REFERENCES crew_members(crew_member_id)
  ON DELETE SET NULL;

CREATE INDEX idx_equipment_owner_id ON equipment(owner_id);
```

#### 2. New Reviews Table
```sql
CREATE TABLE crew_member_reviews (
  review_id INT AUTO_INCREMENT PRIMARY KEY,
  crew_member_id INT NOT NULL,
  user_id INT NULL,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  shoot_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (crew_member_id) REFERENCES crew_members(crew_member_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## Code Changes

### 1. New Model: crew_member_reviews.js
- Location: `/Users/amrik/Documents/revure/revure-v2-backend/src/models/crew_member_reviews.js`
- Defines the reviews table structure with Sequelize
- Includes relationships to crew_members and users

### 2. Updated Model: equipment.js
- Added `owner_id` field linking to crew_members
- Added index for owner_id for faster queries

### 3. Updated: init-models.js
- Added crew_member_reviews to model initialization
- Added relationships:
  - `crew_members.hasMany(crew_member_reviews)`
  - `crew_member_reviews.belongsTo(crew_members)`
  - `crew_member_reviews.belongsTo(users)`
  - `equipment.belongsTo(crew_members, { as: "owner" })`
  - `crew_members.hasMany(equipment, { as: "owned_equipment" })`

### 4. New Controller: reviews.controller.js
- Location: `/Users/amrik/Documents/revure/revure-v2-backend/src/controllers/reviews.controller.js`
- **getByCreator**: Fetch reviews for a creator
- **createReview**: Create a new review for a creator

### 5. Updated Controller: equipment.controller.js
- **getByCreator**: New endpoint to fetch all equipment owned by a creator
- Returns: equipment_id, name, description, rental_price_per_day, location, category

### 6. New Routes: reviews.routes.js
- Location: `/Users/amrik/Documents/revure/revure-v2-backend/src/routes/reviews.routes.js`
- `GET /api/reviews/by-creator/:creatorId` - Get reviews
- `POST /api/reviews/by-creator/:creatorId` - Create review

### 7. Updated Routes: equipment.routes.js
- Added: `GET /api/equipment/by-creator/:creatorId`
- Route positioned before `/:id` to avoid parameter conflicts

### 8. Updated: routes/index.js
- Registered reviews routes: `router.use('/reviews', require('./reviews.routes'))`

## API Endpoints

### Equipment by Creator
**Endpoint**: `GET /api/equipment/by-creator/:creatorId`

**Description**: Get all equipment owned by a specific creator

**Parameters**:
- `creatorId` (path): crew_member_id of the creator

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "equipment_id": 1,
      "name": "Sony A7III Camera",
      "description": "Full frame mirrorless camera",
      "rental_price_per_day": 150.00,
      "location": "Los Angeles, CA",
      "category": "Cameras",
      "category_id": 2
    }
  ]
}
```

### Get Reviews by Creator
**Endpoint**: `GET /api/reviews/by-creator/:creatorId`

**Description**: Get latest reviews for a creator

**Parameters**:
- `creatorId` (path): crew_member_id of the creator
- `limit` (query, optional): Number of reviews to return (default: 5)

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "review_id": 1,
      "user_name": "John Doe",
      "rating": 5,
      "review_text": "Excellent work, very professional",
      "shoot_date": "2024-12-15",
      "created_at": "2024-12-16T10:30:00.000Z"
    }
  ]
}
```

### Create Review
**Endpoint**: `POST /api/reviews/by-creator/:creatorId`

**Description**: Create a new review for a creator

**Parameters**:
- `creatorId` (path): crew_member_id of the creator

**Request Body**:
```json
{
  "user_id": 123,
  "rating": 5,
  "review_text": "Great experience working with this creator",
  "shoot_date": "2024-12-15"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "review_id": 1,
    "crew_member_id": 5,
    "rating": 5,
    "review_text": "Great experience working with this creator",
    "shoot_date": "2024-12-15",
    "created_at": "2024-12-16T10:30:00.000Z"
  },
  "message": "Review created successfully"
}
```

## Running the Migration

Since the database is AWS RDS and may have IP restrictions, you'll need to run the migration manually:

### Option 1: Using MySQL Workbench or DBeaver
1. Connect to: `beige-common-db.cw9m48mwcxj2.us-east-1.rds.amazonaws.com`
2. Database: `revurge`
3. User: `admin`
4. Run the SQL from: `migrations/add_equipment_owner_and_reviews_system.sql`

### Option 2: From Allowed IP
If you have an EC2 instance or allowed IP:
```bash
mysql -h beige-common-db.cw9m48mwcxj2.us-east-1.rds.amazonaws.com \
  -u admin -p \
  -D revurge < migrations/add_equipment_owner_and_reviews_system.sql
```

### Option 3: Node.js Migration Script
Create a script to run the migration using the existing database connection:
```javascript
const sequelize = require('./src/db');
const fs = require('fs');

const sql = fs.readFileSync('./migrations/add_equipment_owner_and_reviews_system.sql', 'utf8');
sequelize.query(sql)
  .then(() => console.log('Migration completed'))
  .catch(err => console.error('Migration failed:', err));
```

## Testing the Endpoints

### 1. Test Equipment by Creator
```bash
# Replace :creatorId with actual crew_member_id
curl http://localhost:5001/api/equipment/by-creator/1
```

### 2. Test Get Reviews
```bash
# Get latest 5 reviews
curl http://localhost:5001/api/reviews/by-creator/1

# Get latest 10 reviews
curl "http://localhost:5001/api/reviews/by-creator/1?limit=10"
```

### 3. Test Create Review
```bash
curl -X POST http://localhost:5001/api/reviews/by-creator/1 \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 123,
    "rating": 5,
    "review_text": "Excellent photographer, very professional",
    "shoot_date": "2024-12-15"
  }'
```

## Data Population (Optional)

To test the endpoints, you may want to add sample data:

### Link Equipment to Creators
```sql
-- Update existing equipment to have owners
UPDATE equipment SET owner_id = 1 WHERE equipment_id IN (1, 2, 3);
UPDATE equipment SET owner_id = 2 WHERE equipment_id IN (4, 5);
```

### Add Sample Reviews
```sql
INSERT INTO crew_member_reviews (crew_member_id, user_id, rating, review_text, shoot_date)
VALUES
  (1, NULL, 5, 'Outstanding work on our corporate video shoot', '2024-12-01'),
  (1, NULL, 4, 'Very professional and creative', '2024-11-15'),
  (2, NULL, 5, 'Exceeded expectations, highly recommend', '2024-12-10');
```

## File Structure

```
revure-v2-backend/
├── migrations/
│   └── add_equipment_owner_and_reviews_system.sql
├── src/
│   ├── controllers/
│   │   ├── equipment.controller.js (updated)
│   │   └── reviews.controller.js (new)
│   ├── models/
│   │   ├── crew_member_reviews.js (new)
│   │   ├── equipment.js (updated)
│   │   └── init-models.js (updated)
│   └── routes/
│       ├── equipment.routes.js (updated)
│       ├── reviews.routes.js (new)
│       └── index.js (updated)
└── EQUIPMENT_REVIEWS_IMPLEMENTATION.md
```

## Files Created and Modified

### Files Created (3)
1. `/Users/amrik/Documents/revure/revure-v2-backend/migrations/add_equipment_owner_and_reviews_system.sql`
2. `/Users/amrik/Documents/revure/revure-v2-backend/src/models/crew_member_reviews.js`
3. `/Users/amrik/Documents/revure/revure-v2-backend/src/controllers/reviews.controller.js`
4. `/Users/amrik/Documents/revure/revure-v2-backend/src/routes/reviews.routes.js`

### Files Modified (4)
1. `/Users/amrik/Documents/revure/revure-v2-backend/src/models/equipment.js`
2. `/Users/amrik/Documents/revure/revure-v2-backend/src/models/init-models.js`
3. `/Users/amrik/Documents/revure/revure-v2-backend/src/controllers/equipment.controller.js`
4. `/Users/amrik/Documents/revure/revure-v2-backend/src/routes/equipment.routes.js`
5. `/Users/amrik/Documents/revure/revure-v2-backend/src/routes/index.js`

## Implementation Status

### Completed

- Database migration successfully executed
- All models and relationships configured
- All endpoints tested and working
- Sample data created for testing

### Test Results

All endpoints are working correctly:

Equipment by Creator (GET /v1/equipment/by-creator/1):
```json
{
  "success": true,
  "data": [
    {
      "equipment_id": 2,
      "name": "Sony A7III Camera",
      "rental_price_per_day": 150,
      "location": "Los Angeles, CA"
    }
  ]
}
```

Reviews by Creator (GET /v1/reviews/by-creator/1?limit=5):
```json
{
  "success": true,
  "data": [
    {
      "review_id": 1,
      "user_name": "Anonymous",
      "rating": 5,
      "review_text": "Outstanding work...",
      "created_at": "2025-12-19T18:55:34.000Z"
    }
  ]
}
```

Create Review (POST /v1/reviews/by-creator/1):
```json
{
  "success": true,
  "data": {
    "review_id": 8,
    "crew_member_id": 1,
    "rating": 5
  },
  "message": "Review created successfully"
}
```

## Next Steps

1. Update frontend to consume these endpoints
2. Add authentication middleware for creating reviews
3. Add review moderation features
4. Implement average rating calculation
5. Add equipment categories seeding

## Security Considerations

- The POST review endpoint is currently public
- Consider adding authentication middleware for creating reviews
- Add rate limiting to prevent review spam
- Consider adding review moderation workflow
- Validate user_id exists before allowing review creation

## Future Enhancements

- Add review replies/responses from creators
- Add helpful/unhelpful voting on reviews
- Add review reporting for moderation
- Add average rating calculation trigger
- Add review verification (only allow reviews from actual bookings)
- Add pagination for equipment by creator endpoint
- Add filtering options for equipment (by category, price range, etc.)
