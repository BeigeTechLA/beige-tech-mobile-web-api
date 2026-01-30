# Sales System - Login Credentials

## 🔐 Test Accounts for Development

### Admin Accounts (Full Access)

**Account 1 - Amrik**
- **Email:** `singhamrikhalsa@gmail.com`
- **Password:** (Use your existing password)
- **Role:** `admin`
- **ID:** 15
- **Access:** Full system + Sales Dashboard

**Account 2 - Vinav**
- **Email:** `vinav@revurge.com`
- **Password:** (Use your existing password)
- **Role:** `admin`
- **ID:** 7
- **Access:** Full system + Sales Dashboard

---

### Sales Rep Account

**Sales Representative**
- **Email:** `sales@revurge.com`
- **Password:** `Sales2024!`
- **Role:** `sales_rep`
- **ID:** 180
- **Access:** Sales Dashboard only

---

## 🚀 Quick Start

1. **Start Backend Server:**
   ```bash
   cd /Users/amrik/Documents/revure/revure-v2-backend
   npm run dev
   ```

2. **Start Frontend Server:**
   ```bash
   cd /Users/amrik/Documents/revure/revure-v2-landing
   npm run dev
   ```

3. **Login:**
   - Navigate to: http://localhost:3000/login
   - Use one of the accounts above

4. **Access Sales Dashboard:**
   - After login: http://localhost:3000/sales/dashboard

---

## 🎯 What Each Role Can Do

### Admin Role
- ✅ Full system access
- ✅ Sales dashboard
- ✅ Generate discount codes
- ✅ Create payment links
- ✅ View all leads
- ✅ Assign leads to sales reps
- ✅ View analytics and reports
- ✅ Manage all bookings

### Sales Rep Role
- ✅ Sales dashboard
- ✅ View assigned leads
- ✅ Generate discount codes
- ✅ Create payment links
- ✅ Update lead status
- ✅ View activities
- ✅ Sales analytics (own performance)
- ❌ Cannot access admin features

---

## 🔄 Password Reset (if needed)

To reset the sales rep password:

```bash
cd /Users/amrik/Documents/revure/revure-v2-backend

# Generate new hash
node -e "
const bcrypt = require('bcrypt');
bcrypt.hash('YourNewPassword', 10, (err, hash) => {
  console.log('New hash:', hash);
});
"

# Then update in database
mysql -h beige-common-db.cw9m48mwcxj2.us-east-1.rds.amazonaws.com \
  -u admin -p'BeigetICyGMplktKM2024!' revurge \
  -e "UPDATE users SET password_hash = 'NEW_HASH_HERE' WHERE email = 'sales@revurge.com';"
```

---

## 📝 Notes

- All accounts have `email_verified = 1`
- All accounts have `is_active = 1`
- Sales rep password was set on: January 21, 2026
- Database: AWS RDS (beige-common-db)

---

## ⚠️ Security Reminder

These are test credentials for development. Before going to production:

1. Change all default passwords
2. Use strong, unique passwords
3. Enable 2FA if available
4. Review user access levels
5. Remove or disable test accounts

---

## 📞 Support

If you can't log in:

1. Check that both servers are running
2. Verify email address (case-sensitive)
3. Try password reset flow
4. Check browser console for errors
5. Verify database connection in backend logs
