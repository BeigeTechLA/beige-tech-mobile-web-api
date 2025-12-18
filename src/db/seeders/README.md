# Database Seeding System

Comprehensive database seeding system for Revure V2 backend with realistic test data.

## Overview

This seeding system populates the `revurge` MySQL database with test data across all 27 Sequelize models. It includes:

- **Reference Data**: User types, equipment categories, skills, crew roles
- **Core Entities**: Users (45), crew members (25-30), equipment (50-70)
- **Transactional Data**: Bookings (10-15), waitlist entries (20-30)

## Quick Start

```bash
# Initialize database and seed all data
npm run db:setup

# Or run steps individually:
npm run db:init              # Initialize database
npm run db:seed:full         # Seed all data
npm run db:seed:reference    # Seed only reference tables
npm run db:seed:reset        # Reset and seed everything
```

## File Structure

```
src/db/seeders/
├── utils/
│   └── faker.js                    # Data generation utilities
├── 01-seedUserTypes.js             # User roles (admin, client, creator, sales_rep)
├── 02-seedEquipmentCategories.js   # 12 equipment categories
├── 03-seedSkills.js                # 30 skills
├── 04-seedCrewRoles.js             # 10 crew roles
├── 10-seedUsers.js                 # 45 users
├── 11-seedCrewMembers.js           # 25-30 crew members
├── 12-seedEquipment.js             # 50-70 equipment items
├── 20-seedBookings.js              # 10-15 bookings
├── 25-seedWaitlist.js              # 20-30 waitlist entries
└── index.js                        # Master orchestrator
```

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run db:init` | Create database and sync models |
| `npm run db:seed:reference` | Seed reference/lookup tables only |
| `npm run db:seed:full` | Seed all data (reference + core + transactional) |
| `npm run db:seed:reset` | DROP all tables and reseed everything |
| `npm run db:setup` | Initialize database + seed all data |

## Data Specifications

### Geographic Distribution
- **NYC Area** (25%): New York, Brooklyn, Queens, Manhattan, Bronx
- **LA Area** (20%): Los Angeles, Santa Monica, Pasadena, Burbank
- **Chicago Area** (15%): Chicago, Evanston, Oak Park
- **Austin Area** (10%): Austin, Round Rock
- **Others** (30%): Miami, Atlanta, Seattle, Portland, Denver, Nashville, etc.

### Users (45 total)
- **1 Admin**: admin@revure.com (password: password123)
- **3 Sales Reps**: Revure.com emails
- **15 Clients**: Various email providers
- **25 Creators**: Linked to crew member profiles

All users use password: `password123` (bcrypt hashed)

### Crew Members (25-30)
- **Skills**: 3-7 random skills per member (JSON array of skill IDs)
- **Hourly Rates**: $50-$200/hr
- **Ratings**: 3.5-5.0 stars
- **Location**: Mapbox format JSON: `{lat, lng, address}`
- **Working Distance**: 25/50/100 miles or Nationwide
- **Portfolio Links**: Vimeo, YouTube, Instagram, personal websites
- **Equipment Ownership**: JSON array of owned equipment

### Equipment (50-70 items)
- **Realistic Brands**: Sony, Canon, Blackmagic, RED, Panasonic, DJI, etc.
- **Pricing**: $200-$25,000 purchase price, 5-15% daily rental rate
- **Categories**: Cameras, Lenses, Audio, Lighting, Stabilization, Streaming, etc.
- **Maintenance Tracking**: Purchase date, last maintenance, next due date
- **Location**: Mapbox format JSON storage locations

### Bookings (10-15)
- **Status Mix**:
  - 50% Active (upcoming)
  - 30% Completed (past)
  - 10% Cancelled
  - 10% Draft
- **Event Types**: Corporate, Conference, Concert, Sports, Wedding, etc.
- **Platforms**: YouTube, Facebook, Twitch, LinkedIn, Vimeo, Custom RTMP
- **Crew Requirements**: JSON arrays of roles and skills needed
- **Equipment Needed**: JSON array of category requirements
- **Budget**: $2,000-$15,000

### Waitlist (20-30 entries)
- **Status Distribution**:
  - 50% Pending
  - 20% Contacted
  - 15% Converted
  - 15% Inactive
- **Geographic Coverage**: All major US cities

## Features

### Idempotent Operations
All seeders use `findOrCreate` to prevent duplicates. Safe to run multiple times.

### Foreign Key Integrity
Seeders run in dependency order:
1. Reference data (no dependencies)
2. Core entities (depend on reference data)
3. Transactional data (depend on core entities)

### Transaction Support
Master seeder coordinates all operations with proper error handling and rollback capability.

### Progress Logging
Clear visual feedback with Unicode symbols:
- ✓ Success
- - Already exists
- ✗ Error
- ⚠ Warning

### Validation
- Email format validation
- Phone number format validation
- Geographic coordinate validation
- JSON structure validation for TEXT fields

## Data Format Examples

### Location (Mapbox format)
```json
{
  "lat": 40.7128,
  "lng": -74.0060,
  "address": "123 Main St, New York, NY"
}
```

### Skills Array
```json
[1, 5, 12, 18, 23]
```

### Social Media Links
```json
{
  "vimeo": "https://vimeo.com/username",
  "youtube": "https://youtube.com/@username",
  "instagram": "https://instagram.com/username",
  "website": "https://username.com"
}
```

### Availability (Crew Members)
```json
{
  "monday": true,
  "tuesday": true,
  "wednesday": false,
  "thursday": true,
  "friday": true,
  "saturday": false,
  "sunday": false
}
```

## Running Individual Seeders

Each seeder can be run independently:

```bash
node src/db/seeders/01-seedUserTypes.js
node src/db/seeders/02-seedEquipmentCategories.js
node src/db/seeders/03-seedSkills.js
node src/db/seeders/10-seedUsers.js
# etc.
```

## Troubleshooting

### Unique Constraint Violations
If you encounter unique constraint errors, the seeder will skip duplicates and continue. This is expected behavior when re-running seeders.

### Foreign Key Errors
Ensure seeders run in order:
1. Reference data first (01-04)
2. Core entities second (10-12)
3. Transactional data last (20-25)

### Connection Errors
Check your `.env` file has correct database credentials:
```env
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_NAME=revurge
DATABASE_USER=root
DATABASE_PASS=your_password
```

## Extending the System

### Adding New Seeders

1. Create new file: `src/db/seeders/XX-seedYourModel.js`
2. Follow existing seeder pattern:
   - Import sequelize and models
   - Use `findOrCreate` for idempotency
   - Export function for orchestrator
   - Support direct execution
3. Add to `index.js` orchestrator
4. Update this README

### Adding New Faker Utilities

Edit `src/db/seeders/utils/faker.js` to add new data generation functions.

## License

Part of Revure V2 Backend project.
