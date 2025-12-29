# Revure V2 Documentation

This directory contains comprehensive documentation for the Revure V2 project.

---

## 📚 Documentation Index

### Deployment Guides

1. **[TEAM_DEPLOYMENT_GUIDE.md](./TEAM_DEPLOYMENT_GUIDE.md)** ⭐️
   - **Start Here**: Complete deployment guide for new team members
   - Backend & Frontend deployment processes
   - Server access, SSH keys, environment variables
   - Monitoring, troubleshooting, rollback procedures
   - ~250 pages of comprehensive documentation

2. **[QUICK_DEPLOYMENT_REFERENCE.md](./QUICK_DEPLOYMENT_REFERENCE.md)** 🚀
   - One-page quick reference for daily deployments
   - Essential commands for common tasks
   - Quick troubleshooting tips
   - Perfect for experienced team members

3. **[CREDENTIALS_SHARING_GUIDE.md](./CREDENTIALS_SHARING_GUIDE.md)** 🔐
   - How to securely share SSH keys and credentials
   - Password manager setup (1Password recommended)
   - Credential rotation schedule
   - Security best practices

4. **[PRODUCTION_DEPLOYMENT_SUMMARY.md](./PRODUCTION_DEPLOYMENT_SUMMARY.md)**
   - Summary of December 28, 2024 deployment
   - Changes deployed to production
   - Issues encountered and fixed
   - Endpoint testing results

### Technical Documentation

5. **[PRICING_FLOW_INVESTIGATION_ZERO_DOLLAR_ISSUE.md](./PRICING_FLOW_INVESTIGATION_ZERO_DOLLAR_ISSUE.md)** 🔍
   - Deep analysis of $0.00 pricing display issue
   - Root cause analysis with detailed investigation
   - Solution implementation (backend endpoint)
   - Expected vs actual calculations
   - 500+ lines of comprehensive analysis

6. **[FRONTEND_PRICING_INTEGRATION.md](./FRONTEND_PRICING_INTEGRATION.md)** 💻
   - Frontend integration for pricing calculation
   - Step-by-step implementation guide
   - Testing checklist
   - API integration details

7. **[FRONTEND_LOCATION_INTEGRATION.md](./FRONTEND_LOCATION_INTEGRATION.md)** 🗺️
   - Google Places API integration
   - Location search and autocomplete
   - Map display with Mapbox

---

## 🎯 Quick Start for New Team Members

### Day 1: Get Access
1. Read: [CREDENTIALS_SHARING_GUIDE.md](./CREDENTIALS_SHARING_GUIDE.md)
2. Request credentials from team lead
3. Set up SSH key and test server access
4. Clone repositories

### Day 2: Understand the System
1. Read: [TEAM_DEPLOYMENT_GUIDE.md](./TEAM_DEPLOYMENT_GUIDE.md) - Architecture Overview section
2. Review: [PRICING_FLOW_INVESTIGATION_ZERO_DOLLAR_ISSUE.md](./PRICING_FLOW_INVESTIGATION_ZERO_DOLLAR_ISSUE.md) - Understand the pricing system
3. Read: [FRONTEND_PRICING_INTEGRATION.md](./FRONTEND_PRICING_INTEGRATION.md) - Frontend integration

### Day 3: Deploy Something
1. Follow: [TEAM_DEPLOYMENT_GUIDE.md](./TEAM_DEPLOYMENT_GUIDE.md) - Backend Deployment section
2. Use: [QUICK_DEPLOYMENT_REFERENCE.md](./QUICK_DEPLOYMENT_REFERENCE.md) for commands
3. Test deployment following guide

### Ongoing
- Keep [QUICK_DEPLOYMENT_REFERENCE.md](./QUICK_DEPLOYMENT_REFERENCE.md) open for daily tasks
- Refer to [TEAM_DEPLOYMENT_GUIDE.md](./TEAM_DEPLOYMENT_GUIDE.md) for troubleshooting

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    REVURE V2 SYSTEM                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │    Frontend      │         │    Backend API   │         │
│  │  Next.js 15.5.9  │────────▶│   Node.js 20.x   │         │
│  │  TypeScript      │  HTTP   │   Express 5.1.0  │         │
│  │  Redux Toolkit   │         │   Sequelize ORM  │         │
│  │  (Vercel)        │         │   PM2 on EC2     │         │
│  └──────────────────┘         └──────────────────┘         │
│                                        │                    │
│                                        ▼                    │
│                               ┌──────────────────┐          │
│                               │  AWS RDS MySQL   │          │
│                               │  Database        │          │
│                               └──────────────────┘          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📂 Repository Structure

### Backend (beige-tech-mobile-web-api)
```
revure-v2-backend/
├── src/
│   ├── controllers/      # API endpoint handlers
│   ├── routes/          # Express routes
│   ├── services/        # Business logic
│   ├── models/          # Sequelize models
│   ├── middleware/      # Auth, validation
│   └── server.js        # Main entry point
├── migrations/          # Database migrations
├── deploy/             # Deployment scripts
├── claudedocs/         # 📍 You are here
└── package.json
```

### Frontend (beige-web-mobile-front)
```
revure-v2-landing/
├── app/                # Next.js app router pages
├── components/         # React components
├── lib/
│   ├── redux/         # Redux store & slices
│   └── api/           # API client functions
├── public/            # Static assets
└── package.json
```

---

## 🔗 Key URLs

### Production
- **Backend API**: `http://98.81.117.41:5001/v1/`
- **Frontend**: TBD (Vercel deployment pending)
- **Database**: `beige-common-db.cw9m48mwcxj2.us-east-1.rds.amazonaws.com`

### GitHub Repositories
- **Backend**: https://github.com/BeigeTechLA/beige-tech-mobile-web-api
- **Frontend**: https://github.com/BeigeTechLA/beige-web-mobile-front

### Services
- **AWS Console**: https://console.aws.amazon.com
- **Vercel Dashboard**: https://vercel.com
- **Stripe Dashboard**: https://dashboard.stripe.com

---

## 📊 Key Features Documented

1. **Booking Flow**
   - Guest booking creation
   - Creator search and filtering
   - Payment processing with Stripe
   - Quote generation

2. **Pricing System**
   - Catalog-based pricing
   - Discount tiers (wedding mode)
   - Platform margin calculation
   - Creator-based quote calculation

3. **Creator Management**
   - Profile search with geolocation
   - Role filtering (videographer, photographer, cinematographer)
   - Auto-radius expansion for better matches
   - Google Sheets integration for creator data

---

## 🛠️ Common Tasks

| Task | Documentation |
|------|--------------|
| Deploy backend changes | [QUICK_DEPLOYMENT_REFERENCE.md](./QUICK_DEPLOYMENT_REFERENCE.md) |
| Deploy frontend | [TEAM_DEPLOYMENT_GUIDE.md](./TEAM_DEPLOYMENT_GUIDE.md) → Frontend Deployment |
| Access production server | [QUICK_DEPLOYMENT_REFERENCE.md](./QUICK_DEPLOYMENT_REFERENCE.md) → Server Access |
| View application logs | [QUICK_DEPLOYMENT_REFERENCE.md](./QUICK_DEPLOYMENT_REFERENCE.md) → Check Status |
| Run database migration | [TEAM_DEPLOYMENT_GUIDE.md](./TEAM_DEPLOYMENT_GUIDE.md) → Database Management |
| Rollback deployment | [QUICK_DEPLOYMENT_REFERENCE.md](./QUICK_DEPLOYMENT_REFERENCE.md) → Rollback |
| Get credentials | [CREDENTIALS_SHARING_GUIDE.md](./CREDENTIALS_SHARING_GUIDE.md) |
| Troubleshoot issues | [TEAM_DEPLOYMENT_GUIDE.md](./TEAM_DEPLOYMENT_GUIDE.md) → Troubleshooting |

---

## 📞 Support & Contacts

### Primary Contact
- **Name**: Amrik Singh
- **Email**: singhamrikkhalsa@gmail.com
- **Slack**: @amrik

### Channels
- **Slack**: #revure-deployments
- **GitHub Issues**: Use respective repository issue trackers
- **Emergency**: Call/text Amrik directly

---

## 🔄 Documentation Updates

This documentation is maintained by the development team.

**How to contribute:**
1. Make changes to documentation files
2. Commit with clear message: `docs: update deployment guide with XYZ`
3. Create PR for review
4. After merge, notify team in #revure-deployments

**Last Major Update**: December 29, 2025

---

## ⚠️ Important Notes

1. **Never commit credentials to git**
   - Use `.gitignore` for `.env` files
   - Store secrets in 1Password or AWS Secrets Manager

2. **Always test before deploying to production**
   - Test locally first
   - Use staging environment if available
   - Verify changes don't break existing functionality

3. **Follow the deployment process**
   - Don't skip steps in deployment guides
   - Always check logs after deployment
   - Test endpoints after deploying

4. **Keep documentation updated**
   - Update guides when processes change
   - Document new features and endpoints
   - Fix errors or outdated information immediately

---

## 📖 Additional Resources

### External Documentation
- [Next.js Docs](https://nextjs.org/docs)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [Sequelize ORM](https://sequelize.org/docs/v6/)
- [PM2 Process Manager](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [AWS EC2 Documentation](https://docs.aws.amazon.com/ec2/)
- [Vercel Documentation](https://vercel.com/docs)

### Internal Wiki (if exists)
- Team processes
- Code review guidelines
- Testing procedures
- Release schedule

---

**Welcome to the team! 🎉**

If you have any questions, don't hesitate to reach out to Amrik or ask in #revure-deployments.
