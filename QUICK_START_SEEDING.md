# Quick Start: Database Seeding

## Prerequisites

1. MySQL server running on localhost:3306
2. Database credentials in `.env` file:
   ```env
   DATABASE_HOST=localhost
   DATABASE_PORT=3306
   DATABASE_NAME=revurge
   DATABASE_USER=root
   DATABASE_PASS=your_password
   ```

## One-Command Setup

```bash
npm run db:setup
```

This will:
1. Create the `revurge` database (if not exists)
2. Sync all Sequelize models (create tables)
3. Seed all reference data
4. Seed all core entities
5. Seed all transactional data

## Expected Result

After running `npm run db:setup`, your database will contain:

- **4 User Types**: admin, client, sales_rep, creator
- **12 Equipment Categories**: Cameras, Lenses, Audio, Lighting, etc.
- **30 Skills**: Camera Operation, Live Streaming, Audio Engineering, etc.
- **10 Crew Roles**: Camera Operator, Director, Technical Director, etc.
- **45 Users**: 1 admin, 3 sales reps, 15 clients, 25 creators
- **25-30 Crew Members**: With skills, rates, locations, portfolios
- **50-70 Equipment Items**: Realistic brands, pricing, maintenance tracking
- **10-15 Bookings**: Various statuses (active, completed, cancelled, draft)
- **20-30 Waitlist Entries**: Various statuses (pending, contacted, converted)

## Test Login Credentials

**Admin User:**
- Email: `admin@revure.com`
- Password: `password123`

**All Other Users:**
- Password: `password123` (bcrypt hashed)
- Emails vary (check users table after seeding)

## Common Commands

```bash
# Initialize database only (no data)
npm run db:init

# Seed only reference/lookup tables
npm run db:seed:reference

# Seed all data (reference + core + transactional)
npm run db:seed:full

# Reset database and seed everything (WARNING: Deletes all data)
npm run db:seed:reset

# Complete setup (init + seed)
npm run db:setup
```

## Verify Seeding Success

### Check Database Contents

```sql
-- Connect to MySQL
mysql -u root -p revurge

-- Check table counts
SELECT COUNT(*) FROM user_type;           -- Should be 4
SELECT COUNT(*) FROM equipment_category;  -- Should be 12
SELECT COUNT(*) FROM skills_master;       -- Should be 30
SELECT COUNT(*) FROM crew_roles;          -- Should be 10
SELECT COUNT(*) FROM users;               -- Should be 45
SELECT COUNT(*) FROM crew_members;        -- Should be 25-30
SELECT COUNT(*) FROM equipment;           -- Should be 50-70
SELECT COUNT(*) FROM stream_project_booking; -- Should be 10-15
SELECT COUNT(*) FROM waitlist;            -- Should be 20-30

-- Check sample data
SELECT * FROM users WHERE user_type = 4;  -- Admin user
SELECT * FROM crew_members LIMIT 5;       -- Sample crew members
SELECT * FROM equipment LIMIT 5;          -- Sample equipment
```

### Test API Integration

```bash
# Start the server
npm start

# Test authentication with seeded admin user
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@revure.com","password":"password123"}'
```

## Troubleshooting

### "Database does not exist"
Run `npm run db:init` first to create the database.

### "Connection refused"
Ensure MySQL is running:
```bash
# macOS
brew services start mysql

# Linux
sudo systemctl start mysql

# Windows
net start MySQL
```

### "Access denied"
Check your `.env` file has correct credentials.

### "Unique constraint violation"
The seeders are idempotent - they skip duplicates. This is expected behavior when re-running seeders.

### "Foreign key constraint fails"
Run the full seeder (`npm run db:seed:full`) which executes in correct dependency order.

## Re-seeding

### To refresh all data:
```bash
npm run db:seed:reset
```
**WARNING**: This will DROP all tables and data!

### To add more data without removing existing:
```bash
npm run db:seed:full
```
Duplicate entries will be skipped.

## Sample Data Highlights

### Geographic Distribution
- NYC (25%): New York, Brooklyn, Queens, Manhattan, Bronx
- LA (20%): Los Angeles, Santa Monica, Pasadena, Burbank
- Chicago (15%): Chicago, Evanston, Oak Park
- Austin (10%): Austin, Round Rock
- Others (30%): Miami, Atlanta, Seattle, Portland, Denver, etc.

### Equipment Brands
- **Cameras**: Sony A7S III, Canon R5, Blackmagic 6K, RED Komodo
- **Audio**: Sennheiser MKH 416, Rode NTG5, Shure SM7B
- **Lighting**: Aputure 600d Pro, Godox VL300
- **Drones**: DJI Mavic 3 Cine, DJI Inspire 3

### Crew Member Rates
- Hourly rates: $50 - $200/hr
- Ratings: 3.5 - 5.0 stars
- Skills: 3-7 skills per member

### Booking Details
- Budgets: $2,000 - $15,000
- Duration: 2-8 hours
- Platforms: YouTube, Facebook, Twitch, LinkedIn, Vimeo, Custom RTMP
- Event types: Corporate, Conference, Concert, Sports, Wedding, etc.

## Next Steps

1. Run `npm run db:setup`
2. Verify data in MySQL
3. Test API endpoints with seeded data
4. Start development with realistic test data

## Documentation

For detailed documentation, see:
- `/src/db/seeders/README.md` - Complete seeding system documentation
- `/src/db/SEEDING_IMPLEMENTATION.md` - Implementation details and specifications

## Support

If you encounter issues:
1. Check the error message carefully
2. Verify database connection in `.env`
3. Check MySQL service is running
4. Review logs for specific error details
5. Try `npm run db:seed:reset` for clean slate

---

**Ready to seed?** Run `npm run db:setup` and you'll have a fully populated database in seconds!
