# Sales System Migration - COMPLETE ✅

## Migration Date: January 21, 2026

### Status: Successfully Applied

---

## What Was Created

### 1. Database Tables (5 New Tables)

✅ **sales_leads** - Track all sales leads
- Primary key: `lead_id`
- Tracks lead type (self_serve, sales_assisted)
- Lead status tracking
- Assignment to sales reps
- Activity timestamps

✅ **discount_codes** - Manage discount codes
- Primary key: `discount_code_id`
- Unique code generation
- Percentage or fixed amount discounts
- One-time or multi-use support
- Expiration handling
- Usage tracking

✅ **discount_code_usage** - Audit log for discount usage
- Primary key: `usage_id`
- Tracks who used codes and when
- Records discount amounts
- Links to bookings

✅ **payment_links** - Secure payment links
- Primary key: `payment_link_id`
- Unique secure tokens
- Expiration handling
- Usage tracking
- Optional discount code linking

✅ **sales_lead_activities** - Activity log for leads
- Primary key: `activity_id`
- Tracks all lead actions
- JSON metadata storage
- Complete audit trail

### 2. Table Updates

✅ **stream_project_booking** - Added sales tracking columns
- `lead_status` - Track booking status in sales funnel
- `sales_assisted` - Flag for sales-assisted bookings
- `tracking_started_at` - When lead tracking began
- `payment_page_reached_at` - Payment page timestamp

✅ **users** - Added role column
- `role` - User role (user, creator, admin, sales_rep)
- Index on role for performance

---

## Test Accounts Created

### Admin Account
- **Email:** harsh.panchal@gmail.com
- **Role:** admin
- **ID:** 1
- **Access:** Full system access including sales dashboard

### Sales Rep Account
- **Email:** salesrep@test.com
- **Password:** (Same as existing account - check with your team)
- **Role:** sales_rep
- **ID:** 8
- **Access:** Sales dashboard, lead management, discount/payment link generation

---

## Migration Files

1. `20260121_01_create_sales_system_tables.sql` - Original (had syntax issues)
2. `20260121_01_create_sales_system_tables_fixed.sql` - Fixed version (quotes table issue)
3. `20260121_02_complete_sales_system.sql` - ✅ **Successfully Applied**

---

## Verification

Run these queries to verify the migration:

```sql
-- Check all sales tables exist
SHOW TABLES LIKE 'sales%';
SHOW TABLES LIKE 'discount%';
SHOW TABLES LIKE 'payment%';

-- Check sales_leads table
SELECT COUNT(*) as total_leads FROM sales_leads;

-- Check discount_codes table
SELECT COUNT(*) as total_codes FROM discount_codes;

-- Check payment_links table
SELECT COUNT(*) as total_links FROM payment_links;

-- Check sales_lead_activities table
SELECT COUNT(*) as total_activities FROM sales_lead_activities;

-- Check stream_project_booking columns
DESCRIBE stream_project_booking;

-- Check users with roles
SELECT id, name, email, role FROM users WHERE role IN ('admin', 'sales_rep');
```

---

## Next Steps

### 1. Start Backend Server
```bash
cd /Users/amrik/Documents/revure/revure-v2-backend
npm run dev
```

### 2. Start Frontend Server
```bash
cd /Users/amrik/Documents/revure/revure-v2-landing
npm run dev
```

### 3. Test the System

Follow the testing guide at:
`/Users/amrik/Documents/revure/revure-v2-landing/SALES_SYSTEM_TESTING.md`

### 4. Login as Sales Rep

- Navigate to: `http://localhost:3000/login`
- Use the sales rep account created above
- Access sales dashboard: `http://localhost:3000/sales/dashboard`

---

## Database Connection Info

- **Database:** revurge
- **Host:** localhost
- **Port:** 3306
- **User:** root

---

## Rollback (If Needed)

If you need to rollback this migration:

```sql
-- Drop new tables
DROP TABLE IF EXISTS sales_lead_activities;
DROP TABLE IF EXISTS payment_links;
DROP TABLE IF EXISTS discount_code_usage;
DROP TABLE IF EXISTS discount_codes;
DROP TABLE IF EXISTS sales_leads;

-- Remove columns from stream_project_booking
ALTER TABLE stream_project_booking 
DROP COLUMN lead_status,
DROP COLUMN sales_assisted,
DROP COLUMN tracking_started_at,
DROP COLUMN payment_page_reached_at;

-- Remove role column from users (optional)
ALTER TABLE users DROP COLUMN role;
```

---

## Support

If you encounter any issues:

1. Check backend logs: `npm run dev` output
2. Check frontend console: Browser DevTools
3. Verify database connection in `.env` file
4. Review the testing guide for common issues

---

## Migration Complete! 🎉

Your sales discount system is now ready for testing!
