# Test Creator Setup

## Overview
Created a test creator account in the database for development and testing purposes with $1/hour rate and availability at all locations nationwide.

---

## Test Creator Details

### Basic Information
- **ID:** 21
- **Name:** Test Creator
- **Email:** `test.creator@beige.test`
- **Phone:** +1-555-TEST-001

### Pricing & Availability
- **Hourly Rate:** $1.00 (lowest possible for testing)
- **Location:** All Locations, USA
- **Working Distance:** Nationwide
- **Availability:** 24/7 - Test Account
- **Is Available:** ✅ Yes
- **Is Active:** ✅ Yes

### Professional Details
- **Primary Role:** 1 (Videographer)
- **Years of Experience:** 1
- **Rating:** 5.0 ⭐
- **Is Beige Member:** ✅ Yes
- **Skills:** Testing, Development, QA, All Services
- **Certifications:** Test Certified
- **Equipment:** Full test equipment suite

### Bio
```
Test creator account for development and testing purposes.
Available at all locations nationwide with $1/hour rate.
```

### Social Media Links
```json
{
  "portfolio": "https://beige.app/test",
  "instagram": "@beige_test",
  "youtube": "BeigeTesting"
}
```

---

## Usage

### For Frontend Testing
Use this creator to test booking flows, search filters, and creator profiles without worrying about high rates or location restrictions.

**Search Filters:**
- ✅ Will appear in ALL location searches
- ✅ Will appear in $1-$500 price range filters
- ✅ Will show as "Available" in availability filters
- ✅ 5-star rating for testing reviews

**Booking Flow:**
- Can test complete booking workflow with $1/hour rate
- Easy to calculate expected costs
- Won't accidentally create expensive test bookings

### For Backend Testing
**API Endpoints:**
```bash
# Get test creator by ID
GET /v1/creators/21

# Search creators (should include test creator)
GET /v1/creators?location=any&maxRate=100

# Book test creator
POST /v1/bookings
{
  "crew_member_id": 21,
  "hours": 5,
  "total_amount": 5.00
}
```

---

## Script Details

### Creation Script
**File:** `/scripts/create-test-creator.js`

**Features:**
- ✅ Checks if test creator already exists (by email)
- ✅ Updates existing record if found
- ✅ Creates new record if not found
- ✅ Sets $1 hourly rate
- ✅ Sets location to "All Locations, USA"
- ✅ Sets nationwide working distance
- ✅ Activates and makes available

**Running the Script:**
```bash
# From backend directory
node scripts/create-test-creator.js
```

**Expected Output:**
```
✅ Database connection established

✅ Test creator created successfully!
═══════════════════════════════════════
🆔 ID: 21
👤 Name: Test Creator
📧 Email: test.creator@beige.test
💰 Hourly Rate: $1
📍 Location: All Locations, USA
🌎 Working Distance: Nationwide
⭐ Rating: 5
✓ Available: Yes
═══════════════════════════════════════

✅ Database connection closed
```

---

## Database Schema

### Table: `crew_members`

```sql
INSERT INTO crew_members (
  first_name,
  last_name,
  email,
  phone_number,
  location,
  working_distance,
  primary_role,
  years_of_experience,
  hourly_rate,
  bio,
  availability,
  skills,
  certifications,
  equipment_ownership,
  is_beige_member,
  is_available,
  rating,
  is_draft,
  is_active,
  social_media_links
) VALUES (
  'Test',
  'Creator',
  'test.creator@beige.test',
  '+1-555-TEST-001',
  'All Locations, USA',
  'Nationwide',
  1,
  1,
  1.00,
  'Test creator account for development and testing purposes...',
  '24/7 - Test Account',
  'Testing, Development, QA, All Services',
  'Test Certified',
  'Full test equipment suite',
  1,
  1,
  5.0,
  0,
  1,
  '{"portfolio":"https://beige.app/test","instagram":"@beige_test","youtube":"BeigeTesting"}'
);
```

---

## Testing Scenarios

### 1. Search by Location
**Test:** Search for creators in any city
**Expected:** Test creator should appear in results

```bash
GET /v1/creators?location=Los Angeles
GET /v1/creators?location=New York
GET /v1/creators?location=Chicago
# Test creator should appear in ALL location searches
```

### 2. Price Range Filtering
**Test:** Filter by hourly rate
**Expected:** Test creator appears in any range >= $1

```bash
GET /v1/creators?minRate=1&maxRate=50
# Should include test creator

GET /v1/creators?minRate=100&maxRate=200
# Should NOT include test creator
```

### 3. Booking Calculation
**Test:** Calculate booking costs
**Expected:** Easy math with $1/hour

```bash
# 1 hour = $1
# 5 hours = $5
# 10 hours = $10
```

### 4. Availability Check
**Test:** Check if creator is available
**Expected:** Always shows as available

```bash
GET /v1/creators/21
# Should show is_available: 1
```

### 5. Profile Display
**Test:** View creator profile page
**Expected:** All fields populated with test data

```bash
GET /v1/creators/21/profile
# Should show:
# - Name: Test Creator
# - Rate: $1/hour
# - Location: All Locations, USA
# - Rating: 5.0 stars
# - Bio, skills, equipment, etc.
```

---

## Maintenance

### Re-run Script
If the test creator gets modified or deleted, simply re-run the script:

```bash
node scripts/create-test-creator.js
```

The script will:
- ✅ Recreate if deleted
- ✅ Update if modified (back to $1 rate and all locations)

### Manual Database Query
```sql
-- Verify test creator exists
SELECT * FROM crew_members WHERE email = 'test.creator@beige.test';

-- Update hourly rate if needed
UPDATE crew_members
SET hourly_rate = 1.00
WHERE email = 'test.creator@beige.test';

-- Delete test creator (if needed)
DELETE FROM crew_members WHERE email = 'test.creator@beige.test';
```

---

## Security Notes

### Email Domain
Uses `.test` TLD which is reserved for testing (RFC 2606)
- ✅ Will never conflict with real email addresses
- ✅ Cannot receive actual emails
- ✅ Clearly marked as test data

### Phone Number
Uses `+1-555-TEST-001` format
- ✅ 555 prefix is reserved for fictional use in North America
- ✅ Cannot be a real phone number
- ✅ Clearly identifiable as test data

### Production Safety
**Before deploying to production:**
- [ ] Consider removing or deactivating test creator
- [ ] Or keep but mark clearly with `is_draft: 1`
- [ ] Add filter to exclude from production searches if needed

---

## Troubleshooting

### Issue: "Email already exists"
**Solution:** The script handles this automatically and updates the existing record.

### Issue: "Cannot connect to database"
**Solution:** Check `.env` file has correct `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`

### Issue: "Test creator not appearing in searches"
**Solution:**
1. Check `is_available = 1` and `is_active = 1`
2. Check search filters aren't excluding $1 rate
3. Verify location filter logic includes "All Locations"

### Issue: "Hourly rate shows as $1.00 instead of $1"
**Solution:** This is expected - database stores as DECIMAL(10,2)

---

## Related Files

- **Script:** `/scripts/create-test-creator.js` - Creation script
- **Model:** `/src/models/crew_members.js` - Database model
- **Controller:** `/src/controllers/creators.controller.js` - API logic
- **Routes:** `/src/routes/creators.routes.js` - API endpoints

---

## Future Enhancements

1. **Multiple Test Creators**
   - Create test creators for different roles (photographer, editor, etc.)
   - Different price points ($1, $5, $10)
   - Different locations (specific cities vs nationwide)

2. **Test Bookings**
   - Create sample bookings for test creator
   - Test payment flows with $1 bookings

3. **Test Reviews**
   - Add sample reviews for test creator
   - Test review display and rating calculations

4. **Automated Cleanup**
   - Script to remove all test data
   - Reset database to clean state

---

**Status:** ✅ Complete and Ready for Testing
**Created:** December 24, 2025
**Database ID:** 21
**Email:** test.creator@beige.test
**Rate:** $1.00/hour
**Location:** All Locations, USA

Perfect for testing booking flows, search filters, and creator profiles! 🧪
