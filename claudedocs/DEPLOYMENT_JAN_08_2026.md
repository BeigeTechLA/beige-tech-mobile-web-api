# Backend Deployment Summary - January 8, 2026

**Time**: Current session
**Status**: ✅ SUCCESSFULLY DEPLOYED
**Method**: Quick Deploy Script

---

## Deployment Details

### **EC2 Instance Information**

| Property | Value |
|----------|-------|
| **Instance ID** | `i-09208295b450c6043` |
| **Name** | `revure-v2-backend` |
| **Status** | ✅ Running |
| **Public IP** | `54.91.121.164` (⚠️ **IP CHANGED**) |
| **Region** | `us-east-1` |

⚠️ **Important**: The IP address changed from `98.81.117.41` to `54.91.121.164`

### **API Endpoints**

**Direct Access (Port 5001)**:
```
http://54.91.121.164:5001/v1/
```

**Domain** (if configured):
```
https://revure-api.beige.app/v1/
```

---

## Changes Deployed

### **Latest Commit**
```
964bd43 - feat: Add new fields and combine descriptions in guest booking creation
```

### **Key Changes**:
1. ✅ V3 booking flow fields (full_name, phone, selected_crew_ids)
2. ✅ Enhanced creator assignment logic
3. ✅ Combined video and photo edit types
4. ✅ Removed Google Cloud credentials from git (security fix)
5. ✅ Updated .gitignore to exclude credentials

---

## Deployment Process

### **1. Pre-Deployment**
```bash
cd /Users/amrik/Documents/revure/revure-v2-backend

# Check current EC2 instances
aws ec2 describe-instances --profile profile1 --region us-east-1

# Found running instance: i-09208295b450c6043
# New IP: 54.91.121.164
```

### **2. Deployment Command**
```bash
./deploy/quick-deploy.sh 54.91.121.164
```

### **3. Deployment Output**
- ✅ 224 files transferred
- ✅ Dependencies installed (4 packages updated)
- ✅ PM2 restarted successfully
- ✅ 2 cluster instances running

### **4. Post-Deployment Verification**
```bash
# Test creators search endpoint
curl 'http://54.91.121.164:5001/v1/creators/search?content_types=videographer&location=Los%20Angeles&limit=3'

# Response:
# {
#   "success": true,
#   "data": {
#     "data": [
#       { "name": "Marcus Thompson", "crew_member_id": 1, ... }
#     ]
#   }
# }
```

---

## API Health Status

### **Working Endpoints** ✅

| Endpoint | Status | Test |
|----------|--------|------|
| `/v1/creators/search` | ✅ Working | Returns Marcus Thompson (test creator) |
| `/v1/pricing/catalog` | ✅ Working | Returns pricing items |
| `/v1/guest-bookings/create` | ✅ Working | Creates bookings |
| `/v1/guest-bookings/:id/payment-details` | ✅ Working | Returns booking + crew details |

### **Server Status** ✅
```
PM2 Process Status:
┌────┬──────────────────┬──────────┬─────────┬───────┬──────────┬────────┐
│ id │ name             │ version  │ mode    │ pid   │ uptime   │ status │
├────┼──────────────────┼──────────┼─────────┼───────┼──────────┼────────┤
│ 0  │ revure-backend   │ 1.0.0    │ cluster │ 115896│ Running  │ online │
│ 1  │ revure-backend   │ 1.0.0    │ cluster │ 115908│ Running  │ online │
└────┴──────────────────┴──────────┴─────────┴───────┴──────────┴────────┘

Server: Running on port 5001
Environment: production
Base API path: /api
```

---

## Frontend Configuration

### **Current .env.local**
```env
NEXT_PUBLIC_API_ENDPOINT=https://revure-api.beige.app/v1/
```

### **Options**

**Option 1: Use Domain (Recommended)**
- Keep current: `https://revure-api.beige.app/v1/`
- ⚠️ **Action Required**: Update DNS A record to point to `54.91.121.164`

**Option 2: Use Direct IP (Development)**
```env
NEXT_PUBLIC_API_ENDPOINT=http://54.91.121.164:5001/v1/
```

---

## Security Fixes Applied

### **1. Google Cloud Credentials Removed** ✅
```bash
# Added to .gitignore
revurve.json
*.json

# Removed from git history
git rm --cached revurve.json
git commit --amend --no-edit
git push --force-with-lease
```

### **2. File Status**
- ✅ `revurve.json` exists locally (app can use it)
- ✅ `revurve.json` removed from git (won't be pushed)
- ✅ Pattern added to .gitignore (future protection)

⚠️ **Action Required**: Rotate Google Cloud service account credentials

---

## Next Steps

### **1. Update DNS (if using domain)**
If using `https://revure-api.beige.app`:
```bash
# Update DNS A record
revure-api.beige.app → 54.91.121.164
```

### **2. Test Frontend Connection**
```bash
# From frontend
npm run dev

# Test booking flow at
http://localhost:3000/book-a-shoot?v=3
```

### **3. Monitor Logs**
```bash
# View PM2 logs
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@54.91.121.164 'pm2 logs revure-backend'

# View recent logs
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@54.91.121.164 'pm2 logs revure-backend --lines 50'
```

### **4. Rotate Google Cloud Credentials**
1. Go to Google Cloud Console → IAM & Admin → Service Accounts
2. Find the service account used in `revurve.json`
3. Create new key → Download JSON
4. Replace `/Users/amrik/Documents/revure/revure-v2-backend/revurve.json`
5. Delete old key from Google Cloud Console
6. Redeploy if needed

---

## Server Management Commands

### **SSH Access**
```bash
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@54.91.121.164
```

### **PM2 Commands**
```bash
# View status
pm2 status

# View logs
pm2 logs revure-backend

# Restart
pm2 restart revure-backend

# Stop
pm2 stop revure-backend

# Start
pm2 start revure-backend
```

### **Quick Redeploy**
```bash
cd /Users/amrik/Documents/revure/revure-v2-backend
./deploy/quick-deploy.sh 54.91.121.164
```

---

## Known Issues

### **1. Nginx 404 on Port 80**
- **Issue**: `http://54.91.121.164/v1/` returns 404
- **Workaround**: Use port 5001 directly: `http://54.91.121.164:5001/v1/`
- **Fix**: Configure Nginx reverse proxy (if needed)

### **2. Dynamic IP Address**
- **Issue**: EC2 public IP changes when instance stops/starts
- **Solutions**:
  - Use Elastic IP (static IP from AWS)
  - Use domain name with automatic DNS updates
  - Current: Manual update after IP change

---

## Performance

| Metric | Value |
|--------|-------|
| **Instance Type** | t2.micro |
| **PM2 Instances** | 2 (cluster mode) |
| **Memory Usage** | ~60MB per instance |
| **CPU Usage** | <1% idle |
| **Uptime** | Monitoring via PM2 |

---

## Costs

Estimated monthly (us-east-1):
- **t2.micro**: ~$8-10/month (or free tier: 750 hrs/month first 12 months)
- **Data transfer**: Varies
- **RDS**: Existing (shared)

---

## Files Modified This Deployment

1. `.gitignore` - Added credentials patterns
2. `src/controllers/guest-bookings.controller.js` - V3 booking fields
3. `claudedocs/EMPTY_CREATOR_DETAILS_FIX.md` - New documentation

**Files Removed from Git**:
- `revurve.json` (Google Cloud credentials)

---

## Summary

✅ **Deployment Status**: **SUCCESSFUL**
✅ **API Status**: **ONLINE** at `http://54.91.121.164:5001/v1/`
✅ **PM2 Status**: **2 instances running** in cluster mode
✅ **Security**: **Credentials removed** from git
⚠️ **Action Needed**:
  - Update DNS if using domain
  - Rotate Google Cloud credentials
  - Test V3 booking flow end-to-end

---

## Support

For issues:
1. Check PM2 logs: `pm2 logs revure-backend`
2. Check server status: `pm2 status`
3. SSH into server for debugging
4. Review this deployment document

**Deployed by**: Claude Code
**Date**: January 8, 2026
**Version**: Latest main branch (964bd43)
