# Quick Deployment Reference

**One-page reference for common deployment tasks**

---

## 🔑 Server Access

```bash
# Backend Server
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41

# View SSH key
cat ~/.ssh/revure-backend-key.pem
```

**Production Server**: `98.81.117.41`
**Database**: `beige-common-db.cw9m48mwcxj2.us-east-1.rds.amazonaws.com`

---

## 🚀 Quick Backend Deploy

```bash
# Clone repository (first time only)
git clone https://github.com/BeigeTechLA/beige-tech-mobile-web-api.git
cd beige-tech-mobile-web-api

# Pull latest changes
git pull origin main

# Deploy to production
./deploy/quick-deploy.sh 98.81.117.41
```

**What it does:**
- Syncs code changes to server
- Installs new dependencies
- Restarts PM2 process

---

## 🌐 Frontend Deploy (Vercel)

```bash
# Clone repository (first time only)
git clone https://github.com/BeigeTechLA/beige-web-mobile-front.git
cd beige-web-mobile-front

# Pull latest changes
git pull origin main

# Install dependencies
yarn install

# Deploy to production
vercel --prod
```

**Or just push to GitHub** (auto-deploys on push to `main`)

---

## 📊 Check Backend Status

```bash
# PM2 status
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41 'pm2 status'

# View logs (last 50 lines)
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41 'pm2 logs revure-backend --lines 50'

# Real-time logs
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41 'pm2 logs revure-backend'
```

---

## 🔄 Restart Backend

```bash
# Restart application
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41 'pm2 restart revure-backend'

# Full restart with cache clear
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41 'pm2 delete revure-backend && cd /var/www/revure-backend && pm2 start src/server.js --name revure-backend && pm2 save'
```

---

## 🗄️ Database Access

```bash
# Connect from backend server
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41
mysql -h beige-common-db.cw9m48mwcxj2.us-east-1.rds.amazonaws.com -u admin -p revurge

# Run migration
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41
cd /var/www/revure-backend
mysql -h beige-common-db.cw9m48mwcxj2.us-east-1.rds.amazonaws.com -u admin -p revurge < migrations/xxx.sql
```

---

## ✅ Test Deployment

```bash
# Health check
curl http://98.81.117.41:5001/health

# Test API
curl http://98.81.117.41:5001/v1/creators/search

# Test pricing
curl http://98.81.117.41:5001/v1/pricing/catalog?mode=general
```

---

## ⏪ Rollback

```bash
# Backend rollback
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41
cd /var/www/revure-backend
git log --oneline -5
git reset --hard <previous-commit-hash>
npm install --production
pm2 restart revure-backend
exit

# Frontend rollback (Vercel)
vercel rollback
```

---

## 📝 Environment Variables

**Update backend .env:**
```bash
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41
nano /var/www/revure-backend/.env
# Make changes
pm2 restart revure-backend
exit
```

**Update frontend (Vercel):**
1. Go to https://vercel.com/[project]/settings/environment-variables
2. Add/edit variable
3. Redeploy: `vercel --prod`

---

## 🔍 Common Issues

**Backend not responding:**
```bash
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41 'pm2 logs revure-backend --err --lines 20'
```

**Database connection failed:**
```bash
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41
telnet beige-common-db.cw9m48mwcxj2.us-east-1.rds.amazonaws.com 3306
```

**CORS errors:**
```bash
# Update CORS_ORIGINS in .env
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41 'grep CORS /var/www/revure-backend/.env'
```

---

## 📞 Emergency Contacts

- **Amrik Singh**: singhamrikkhalsa@gmail.com
- **Slack**: @amrik in #revure-deployments

---

## 🔗 Quick Links

- Backend Repo: https://github.com/BeigeTechLA/beige-tech-mobile-web-api
- Frontend Repo: https://github.com/BeigeTechLA/beige-web-mobile-front
- Backend API: http://98.81.117.41:5001/v1/
- Full Documentation: [TEAM_DEPLOYMENT_GUIDE.md](./TEAM_DEPLOYMENT_GUIDE.md)
