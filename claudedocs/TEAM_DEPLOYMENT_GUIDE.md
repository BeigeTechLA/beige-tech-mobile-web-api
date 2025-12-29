# Revure V2 - Complete Deployment Guide

**Last Updated**: December 29, 2025
**Target Audience**: Development Team, DevOps, Deployment Engineers

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Server Access & SSH Keys](#server-access--ssh-keys)
4. [Backend Deployment (AWS EC2)](#backend-deployment-aws-ec2)
5. [Frontend Deployment](#frontend-deployment)
6. [Environment Variables](#environment-variables)
7. [Database Management](#database-management)
8. [Testing Deployment](#testing-deployment)
9. [Monitoring & Logs](#monitoring--logs)
10. [Rollback Procedures](#rollback-procedures)
11. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         PRODUCTION                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │    Frontend      │         │    Backend API   │         │
│  │  Next.js 15.5.9  │────────▶│   Node.js 20.x   │         │
│  │  (Vercel/AWS)    │  HTTP   │   Express 5.1.0  │         │
│  │                  │         │   PM2 Process    │         │
│  └──────────────────┘         └──────────────────┘         │
│                                        │                    │
│                                        ▼                    │
│                               ┌──────────────────┐          │
│                               │  AWS RDS MySQL   │          │
│                               │  Database: revurge│         │
│                               └──────────────────┘          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Component Details

- **Frontend**: Next.js application with TypeScript, Redux Toolkit
- **Backend**: Express.js REST API with Sequelize ORM
- **Database**: AWS RDS MySQL (shared instance)
- **File Storage**: AWS S3 (for media uploads)
- **Payment**: Stripe integration
- **Email**: Nodemailer with Gmail

### Current Production URLs

- **Backend API**: `http://98.81.117.41:5001/v1/`
- **Frontend**: TBD (Vercel deployment pending)
- **Database**: `beige-common-db.cw9m48mwcxj2.us-east-1.rds.amazonaws.com`

---

## Prerequisites

### Required Tools

1. **Git**: Version control
   ```bash
   git --version  # Should be 2.x or higher
   ```

2. **Node.js**: v20.x or higher
   ```bash
   node --version  # v20.x.x
   npm --version   # 10.x.x
   ```

3. **AWS CLI**: For backend deployment
   ```bash
   aws --version  # aws-cli/2.x or higher
   ```

4. **SSH Client**: For server access
   ```bash
   ssh -V  # OpenSSH_8.x or higher
   ```

5. **Yarn**: Package manager (both projects use Yarn)
   ```bash
   yarn --version  # 1.22.22
   ```

### Required Accounts & Access

1. **GitHub Access**:
   - Organization: BeigeTechLA
   - Repository access to:
     - `beige-tech-mobile-web-api` (Backend)
     - `beige-web-mobile-front` (Frontend)

2. **AWS Account**:
   - AWS CLI configured with `profile1`
   - Permissions to create/manage EC2 instances
   - Access to RDS database

3. **Vercel Account** (Frontend):
   - Team access to Revure project
   - Deployment permissions

4. **Third-Party Services**:
   - Stripe account (API keys)
   - Gmail account (for email sending)
   - Google APIs access (for Google Sheets, Places API)
   - AWS S3 bucket access

---

## Server Access & SSH Keys

### Backend Server Access

**Production Server**: `98.81.117.41` (AWS EC2 - us-east-1)

### SSH Key Setup

#### Option 1: Using Existing Key

If the deployment was done using the automated scripts, the SSH key is located at:

```bash
~/.ssh/revure-backend-key.pem
```

**Set correct permissions**:
```bash
chmod 400 ~/.ssh/revure-backend-key.pem
```

**Connect to server**:
```bash
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41
```

#### Option 2: Create New SSH Key for Team Member

If you need to add a new team member's SSH key:

**On team member's machine:**
```bash
# Generate new SSH key
ssh-keygen -t rsa -b 4096 -C "your_email@example.com" -f ~/.ssh/revure-personal-key

# Copy public key
cat ~/.ssh/revure-personal-key.pub
```

**On production server (as existing admin):**
```bash
# SSH into server
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41

# Add new public key
echo "ssh-rsa AAAAB3Nza... your_email@example.com" >> ~/.ssh/authorized_keys

# Set permissions
chmod 600 ~/.ssh/authorized_keys
```

**Team member can now connect:**
```bash
ssh -i ~/.ssh/revure-personal-key ec2-user@98.81.117.41
```

### SSH Key Distribution for Team

**IMPORTANT SECURITY NOTE**:
- Never share private keys via email or Slack
- Use secure password managers (1Password, LastPass) for key sharing
- Each team member should ideally have their own SSH key
- Revoke keys when team members leave

**Recommended: Add team keys to AWS EC2 Key Pair**:
```bash
# Create key pair in AWS Console
# Download .pem file
# Distribute securely to team members
```

---

## Backend Deployment (AWS EC2)

### Repository Setup

```bash
# Clone backend repository
git clone https://github.com/BeigeTechLA/beige-tech-mobile-web-api.git
cd beige-tech-mobile-web-api

# Checkout correct branch
git checkout main  # or feat/costing for latest features
```

### Deployment Options

#### Option A: Full Deployment (New Server)

Use this for creating a new server from scratch.

**Step 1: Create EC2 Instance**

```bash
cd /path/to/beige-tech-mobile-web-api
./deploy/create-ec2.sh
```

**Output will include:**
```
✅ EC2 Instance Created Successfully!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Instance Details:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Instance ID: i-0123456789abcdef0
Public IP: 98.81.117.41
Key Pair: revure-backend-key
Security Group: revure-backend-sg
```

**Save these values:**
```bash
export BACKEND_INSTANCE_ID=i-0123456789abcdef0
export BACKEND_PUBLIC_IP=98.81.117.41
```

**Step 2: Wait for Initialization**

Wait 2-3 minutes for the instance to fully initialize. The user-data script installs:
- Node.js 20.x
- PM2 (process manager)
- Nginx (reverse proxy)
- MySQL client

**Check initialization status:**
```bash
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@$BACKEND_PUBLIC_IP 'which node && which pm2 && which nginx'
```

**Step 3: Deploy Application**

```bash
./deploy/setup-server.sh $BACKEND_PUBLIC_IP
```

This script will:
1. Transfer all backend code to `/var/www/revure-backend`
2. Install Node.js dependencies
3. Create production `.env` file
4. Start application with PM2
5. Configure PM2 to auto-start on reboot

**Step 4: Verify Deployment**

```bash
# Check PM2 status
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@$BACKEND_PUBLIC_IP 'pm2 status'

# Test health endpoint
curl http://$BACKEND_PUBLIC_IP:5001/health

# Test API endpoint
curl http://$BACKEND_PUBLIC_IP:5001/v1/creators/search
```

#### Option B: Quick Deploy (Code Updates Only)

Use this for deploying code changes to an existing server.

```bash
# Make code changes
git pull origin main

# Deploy updates
./deploy/quick-deploy.sh 98.81.117.41
```

This will:
1. Sync only changed files to server
2. Install any new dependencies
3. Restart PM2 process
4. Show updated status

### Manual Deployment Steps

If deployment scripts don't work, here's the manual process:

**Step 1: Prepare Server**

```bash
# SSH into server
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41

# Create application directory
sudo mkdir -p /var/www/revure-backend
sudo chown ec2-user:ec2-user /var/www/revure-backend
```

**Step 2: Transfer Code**

```bash
# From local machine
cd /path/to/beige-tech-mobile-web-api

rsync -avz \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='deploy' \
  --exclude='.env' \
  -e "ssh -i ~/.ssh/revure-backend-key.pem" \
  ./ ec2-user@98.81.117.41:/var/www/revure-backend/
```

**Step 3: Install Dependencies**

```bash
# On server
cd /var/www/revure-backend
npm install --production
```

**Step 4: Configure Environment**

```bash
# Create .env file on server
cat > /var/www/revure-backend/.env << 'EOF'
# Server Configuration
PORT=5001
NODE_ENV=production

# Database Configuration
DATABASE_HOST=beige-common-db.cw9m48mwcxj2.us-east-1.rds.amazonaws.com
DATABASE_PORT=3306
DATABASE_NAME=revurge
DATABASE_USER=admin
DATABASE_PASS=your_actual_password_here

# JWT Configuration
JWT_SECRET=your_production_jwt_secret_minimum_32_characters_long
JWT_EXPIRES_IN=7d

# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_your_actual_stripe_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_actual_stripe_key
STRIPE_WEBHOOK_SECRET=whsec_your_actual_webhook_secret

# CORS Configuration
CORS_ORIGINS=https://yourfrontend.com,https://www.yourfrontend.com

# Google APIs
GOOGLE_SHEETS_API_KEY=your_google_api_key
GOOGLE_PLACES_API_KEY=your_google_places_key
EOF
```

**Step 5: Start with PM2**

```bash
# Start application
pm2 start src/server.js --name revure-backend

# Save PM2 process list
pm2 save

# Setup PM2 startup script
pm2 startup
# Run the command it outputs (will have sudo)

# Verify
pm2 status
pm2 logs revure-backend
```

### Backend Server Management

**View Logs:**
```bash
# Real-time logs
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41 'pm2 logs revure-backend'

# Last 100 lines
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41 'pm2 logs revure-backend --lines 100'
```

**Restart Application:**
```bash
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41 'pm2 restart revure-backend'
```

**Stop Application:**
```bash
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41 'pm2 stop revure-backend'
```

**Check Status:**
```bash
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41 'pm2 status'
```

**Monitor Resources:**
```bash
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41 'pm2 monit'
```

---

## Frontend Deployment

### Repository Setup

```bash
# Clone frontend repository
git clone https://github.com/BeigeTechLA/beige-web-mobile-front.git
cd beige-web-mobile-front

# Install dependencies
yarn install
```

### Option A: Vercel Deployment (Recommended)

Vercel is optimized for Next.js applications and provides:
- Automatic builds on git push
- Preview deployments for PRs
- Edge CDN for global performance
- Zero-config SSL/HTTPS
- Easy rollback

**Step 1: Install Vercel CLI**

```bash
npm install -g vercel
```

**Step 2: Login to Vercel**

```bash
vercel login
```

**Step 3: Link Project**

```bash
# From frontend repository
cd /path/to/beige-web-mobile-front

# Link to Vercel project
vercel link
```

**Step 4: Configure Environment Variables**

In Vercel Dashboard (https://vercel.com):
1. Go to Project Settings → Environment Variables
2. Add production environment variables (see Environment Variables section below)
3. Add for all environments: Production, Preview, Development

**Or via CLI:**
```bash
# Add environment variables
vercel env add NEXT_PUBLIC_API_ENDPOINT production
# Enter value: https://api.revure.com/v1

vercel env add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY production
# Enter your Stripe publishable key

# Add all other variables...
```

**Step 5: Deploy to Production**

```bash
# Deploy to production
vercel --prod
```

**Output:**
```
Vercel CLI 33.0.1
🔍  Inspect: https://vercel.com/...
✅  Production: https://revure-v2.vercel.app [1s]
```

**Step 6: Configure Custom Domain (Optional)**

In Vercel Dashboard:
1. Go to Project Settings → Domains
2. Add your custom domain (e.g., `app.revure.com`)
3. Configure DNS records as instructed
4. SSL will be automatically configured

### Option B: AWS Amplify Deployment

**Step 1: Connect Repository**

1. Login to AWS Console → AWS Amplify
2. Click "New App" → "Host web app"
3. Connect GitHub repository: `beige-web-mobile-front`
4. Select branch: `main`

**Step 2: Build Settings**

Amplify will auto-detect Next.js. Verify build settings:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - yarn install
    build:
      commands:
        - yarn build
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
      - .next/cache/**/*
```

**Step 3: Environment Variables**

Add environment variables in Amplify Console:
- Click "Environment variables"
- Add all required variables (see Environment Variables section)

**Step 4: Deploy**

Click "Save and deploy". Amplify will:
1. Clone repository
2. Install dependencies
3. Build application
4. Deploy to CDN

### Option C: Manual AWS EC2 Deployment

For self-hosted deployment on AWS EC2:

**Step 1: Build Application Locally**

```bash
cd /path/to/beige-web-mobile-front

# Install dependencies
yarn install

# Build for production
yarn build
```

**Step 2: Create EC2 Instance**

Similar to backend, create a new EC2 instance:
- Instance type: t2.small or larger (Next.js requires more memory)
- OS: Amazon Linux 2023 or Ubuntu 22.04
- Security groups: Allow ports 22 (SSH), 80 (HTTP), 443 (HTTPS)

**Step 3: Install Node.js and PM2**

```bash
# SSH into server
ssh -i ~/.ssh/your-frontend-key.pem ec2-user@<FRONTEND_IP>

# Install Node.js 20.x
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# Install PM2
sudo npm install -g pm2 yarn

# Install Nginx
sudo yum install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

**Step 4: Transfer Build Files**

```bash
# From local machine
rsync -avz \
  -e "ssh -i ~/.ssh/your-frontend-key.pem" \
  ./ ec2-user@<FRONTEND_IP>:/var/www/frontend/
```

**Step 5: Configure Environment**

```bash
# On server
cd /var/www/frontend

# Create .env.production.local
cat > .env.production.local << 'EOF'
NEXT_PUBLIC_API_ENDPOINT=http://98.81.117.41:5001/v1
# ... other environment variables
EOF
```

**Step 6: Start Application**

```bash
# Start with PM2
pm2 start yarn --name "frontend" -- start

# Save PM2 configuration
pm2 save
pm2 startup
```

**Step 7: Configure Nginx**

```bash
sudo nano /etc/nginx/conf.d/frontend.conf
```

Add:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### Continuous Deployment Setup

For automatic deployments on git push:

**Vercel (Recommended):**
- Automatically deploys on push to `main` branch
- Creates preview deployments for PRs
- No additional setup needed

**GitHub Actions (For AWS Deployments):**

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy Frontend

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: yarn install

      - name: Build
        run: yarn build
        env:
          NEXT_PUBLIC_API_ENDPOINT: ${{ secrets.NEXT_PUBLIC_API_ENDPOINT }}
          # Add other environment variables

      - name: Deploy to Server
        uses: easingthemes/ssh-deploy@v2.1.5
        env:
          SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}
          ARGS: "-rltgoDzvO --delete"
          SOURCE: "./"
          REMOTE_HOST: ${{ secrets.REMOTE_HOST }}
          REMOTE_USER: ${{ secrets.REMOTE_USER }}
          TARGET: "/var/www/frontend"

      - name: Restart Application
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.REMOTE_HOST }}
          username: ${{ secrets.REMOTE_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /var/www/frontend
            pm2 restart frontend
```

---

## Environment Variables

### Backend Environment Variables

**File**: `/var/www/revure-backend/.env` (on production server)

```bash
# Server Configuration
PORT=5001
NODE_ENV=production

# Database Configuration
DATABASE_HOST=beige-common-db.cw9m48mwcxj2.us-east-1.rds.amazonaws.com
DATABASE_PORT=3306
DATABASE_NAME=revurge
DATABASE_USER=admin
DATABASE_PASS=<ASK_TEAM_LEAD>

# JWT Configuration
JWT_SECRET=<GENERATE_STRONG_SECRET>
JWT_EXPIRES_IN=7d

# Stripe Configuration
STRIPE_SECRET_KEY=<ASK_TEAM_LEAD>
STRIPE_PUBLISHABLE_KEY=<ASK_TEAM_LEAD>
STRIPE_WEBHOOK_SECRET=<ASK_TEAM_LEAD>

# CORS Configuration
CORS_ORIGINS=https://revure-v2.vercel.app,https://app.revure.com

# Google APIs
GOOGLE_SHEETS_API_KEY=<ASK_TEAM_LEAD>
GOOGLE_PLACES_API_KEY=<ASK_TEAM_LEAD>

# AWS Configuration (for S3 uploads)
AWS_ACCESS_KEY_ID=<ASK_TEAM_LEAD>
AWS_SECRET_ACCESS_KEY=<ASK_TEAM_LEAD>
AWS_S3_BUCKET=revure-uploads
AWS_REGION=us-east-1

# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=<ASK_TEAM_LEAD>
EMAIL_PASS=<ASK_TEAM_LEAD>
EMAIL_FROM=noreply@revure.com
```

**How to generate JWT_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Frontend Environment Variables

**Vercel Dashboard** or **File**: `.env.production.local`

```bash
# API Configuration
NEXT_PUBLIC_API_ENDPOINT=http://98.81.117.41:5001/v1

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<ASK_TEAM_LEAD>

# Google Maps
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=<ASK_TEAM_LEAD>

# Mapbox
NEXT_PUBLIC_MAPBOX_TOKEN=<ASK_TEAM_LEAD>

# Analytics (if applicable)
NEXT_PUBLIC_GA_TRACKING_ID=<ASK_TEAM_LEAD>

# Feature Flags (optional)
NEXT_PUBLIC_ENABLE_CREATOR_SEARCH=true
NEXT_PUBLIC_ENABLE_PAYMENTS=true
```

### Where to Get Secret Values

**IMPORTANT**: Never commit `.env` files to git!

**Secret Management Options:**

1. **AWS Secrets Manager** (Recommended for production):
```bash
# Store secret
aws secretsmanager create-secret \
    --name revure/production/stripe-key \
    --secret-string "sk_live_..."

# Retrieve secret
aws secretsmanager get-secret-value \
    --secret-id revure/production/stripe-key
```

2. **1Password / LastPass** (Team password manager):
   - Create shared vault: "Revure Production Secrets"
   - Store all credentials securely
   - Share with team members who need access

3. **Contact Team Lead**:
   - Slack: @amrik
   - Email: singhamrikkhalsa@gmail.com

---

## Database Management

### Database Details

- **Host**: `beige-common-db.cw9m48mwcxj2.us-east-1.rds.amazonaws.com`
- **Port**: `3306`
- **Database**: `revurge`
- **Engine**: MySQL 8.0

### Accessing Database

**From Backend Server:**
```bash
# SSH into backend server
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41

# Connect to database
mysql -h beige-common-db.cw9m48mwcxj2.us-east-1.rds.amazonaws.com \
      -u admin \
      -p \
      revurge
```

**From Local Machine (via SSH Tunnel):**
```bash
# Create SSH tunnel
ssh -i ~/.ssh/revure-backend-key.pem \
    -L 3307:beige-common-db.cw9m48mwcxj2.us-east-1.rds.amazonaws.com:3306 \
    ec2-user@98.81.117.41

# In another terminal, connect via tunnel
mysql -h 127.0.0.1 -P 3307 -u admin -p revurge
```

**Using MySQL Workbench:**
1. Create new connection
2. Connection Method: "Standard TCP/IP over SSH"
3. SSH Hostname: `98.81.117.41`
4. SSH Username: `ec2-user`
5. SSH Key File: `~/.ssh/revure-backend-key.pem`
6. MySQL Hostname: `beige-common-db.cw9m48mwcxj2.us-east-1.rds.amazonaws.com`
7. MySQL Server Port: `3306`
8. Username: `admin`

### Running Migrations

**On Backend Server:**
```bash
cd /var/www/revure-backend

# Run migration script
mysql -h beige-common-db.cw9m48mwcxj2.us-east-1.rds.amazonaws.com \
      -u admin \
      -p \
      revurge < migrations/012_your_migration.sql
```

**Migration Files Location:**
- `/var/www/revure-backend/migrations/`
- Naming convention: `###_description.sql`

### Database Backups

**Automated Backups** (AWS RDS):
- Daily automated snapshots enabled
- 7-day retention period
- Located in RDS Console → Snapshots

**Manual Backup:**
```bash
# Create backup
mysqldump -h beige-common-db.cw9m48mwcxj2.us-east-1.rds.amazonaws.com \
          -u admin \
          -p \
          revurge > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore backup
mysql -h beige-common-db.cw9m48mwcxj2.us-east-1.rds.amazonaws.com \
      -u admin \
      -p \
      revurge < backup_20251229_120000.sql
```

---

## Testing Deployment

### Backend API Testing

**1. Health Check:**
```bash
curl http://98.81.117.41:5001/health

# Expected response:
# {"status":"ok","timestamp":"2025-12-29T..."}
```

**2. Creator Search:**
```bash
curl "http://98.81.117.41:5001/v1/creators/search?keyword=photographer"

# Should return array of creators
```

**3. Pricing Catalog:**
```bash
curl "http://98.81.117.41:5001/v1/pricing/catalog?mode=general"

# Should return pricing categories
```

**4. Database Connection Test:**
```bash
curl http://98.81.117.41:5001/v1/creators/1

# Should return creator profile or 404
```

### Frontend Testing

**1. Homepage Load:**
```bash
curl -I https://your-frontend-url.com

# Should return 200 OK
```

**2. API Integration Test:**
- Open browser
- Navigate to booking flow
- Complete form and verify API calls in Network tab

**3. Stripe Integration:**
- Go to payment page
- Verify Stripe elements load
- Test card processing (use test card: 4242 4242 4242 4242)

### End-to-End Testing

**Complete User Flow:**
1. Visit frontend homepage
2. Click "Book a Shoot"
3. Complete booking form:
   - Select service type
   - Choose content types
   - Set crew breakdown
   - Select dates
   - Review pricing (should show correct total)
4. Submit booking
5. Navigate to creator search
6. Select creators
7. View payment details
8. Process payment

**Verify in Backend:**
```bash
# Check booking was created
mysql -h beige-common-db.cw9m48mwcxj2.us-east-1.rds.amazonaws.com \
      -u admin \
      -p \
      -e "SELECT * FROM revurge.stream_project_booking ORDER BY created_at DESC LIMIT 5;"
```

---

## Monitoring & Logs

### Backend Monitoring

**PM2 Status:**
```bash
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41 'pm2 status'
```

**Real-time Logs:**
```bash
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41 'pm2 logs revure-backend'
```

**Error Logs Only:**
```bash
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41 'pm2 logs revure-backend --err'
```

**Log Files:**
```bash
# Application logs
tail -f /var/www/revure-backend/logs/app.log

# Nginx access logs
tail -f /var/log/nginx/access.log

# Nginx error logs
tail -f /var/log/nginx/error.log
```

**System Resources:**
```bash
# CPU and memory usage
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41 'top -b -n 1 | head -20'

# Disk usage
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41 'df -h'

# PM2 monitoring
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41 'pm2 monit'
```

### Frontend Monitoring

**Vercel Deployment:**
- Dashboard: https://vercel.com/[your-project]
- Real-time logs available in Vercel UI
- Automatic error tracking

**Manual Deployment:**
```bash
# PM2 logs
ssh -i ~/.ssh/your-frontend-key.pem ec2-user@<FRONTEND_IP> 'pm2 logs frontend'

# Next.js logs
tail -f /var/www/frontend/.next/trace
```

### Setting Up Alerts

**AWS CloudWatch (Backend):**
```bash
# Create CPU alarm
aws cloudwatch put-metric-alarm \
    --alarm-name revure-backend-high-cpu \
    --alarm-description "Alert when CPU exceeds 80%" \
    --metric-name CPUUtilization \
    --namespace AWS/EC2 \
    --statistic Average \
    --period 300 \
    --threshold 80 \
    --comparison-operator GreaterThanThreshold \
    --dimensions Name=InstanceId,Value=$BACKEND_INSTANCE_ID \
    --evaluation-periods 2
```

**PM2 Plus (Optional):**
- Sign up at https://pm2.io
- Link PM2 instance for advanced monitoring
- Get real-time alerts and dashboards

---

## Rollback Procedures

### Backend Rollback

**Option 1: Git Rollback**

```bash
# On server
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41

cd /var/www/revure-backend

# View recent commits
git log --oneline -10

# Rollback to previous commit
git reset --hard <commit-hash>

# Reinstall dependencies
npm install --production

# Restart application
pm2 restart revure-backend
```

**Option 2: Quick Deploy Previous Version**

```bash
# On local machine
cd /path/to/beige-tech-mobile-web-api

# Checkout previous version
git checkout <previous-commit-hash>

# Deploy
./deploy/quick-deploy.sh 98.81.117.41

# Return to latest
git checkout main
```

**Option 3: Database Rollback**

If migration caused issues:

```bash
# Restore from RDS snapshot
aws rds restore-db-instance-from-db-snapshot \
    --db-instance-identifier revurge-rollback \
    --db-snapshot-identifier <snapshot-id>

# Or manually run reverse migration
mysql -h beige-common-db.cw9m48mwcxj2.us-east-1.rds.amazonaws.com \
      -u admin \
      -p \
      revurge < migrations/rollback_012.sql
```

### Frontend Rollback

**Vercel:**
```bash
# Via Dashboard:
# 1. Go to Deployments
# 2. Find previous working deployment
# 3. Click "..." → "Promote to Production"

# Via CLI:
vercel rollback
```

**Manual Deployment:**
```bash
# SSH into server
ssh -i ~/.ssh/your-frontend-key.pem ec2-user@<FRONTEND_IP>

cd /var/www/frontend

# Rollback git
git reset --hard <previous-commit>

# Rebuild
yarn build

# Restart
pm2 restart frontend
```

---

## Troubleshooting

### Common Backend Issues

**Issue 1: Application Won't Start**

```bash
# Check PM2 status
pm2 status

# Check logs for errors
pm2 logs revure-backend --lines 100

# Common causes:
# - Port 5001 already in use
# - Database connection failed
# - Missing environment variables

# Solutions:
# Kill process on port 5001
sudo lsof -ti:5001 | sudo xargs kill -9

# Test database connection
mysql -h beige-common-db.cw9m48mwcxj2.us-east-1.rds.amazonaws.com -u admin -p

# Check .env file exists and has correct values
cat /var/www/revure-backend/.env
```

**Issue 2: Database Connection Timeout**

```bash
# Check RDS security group allows EC2 instance
aws rds describe-db-instances \
    --db-instance-identifier beige-common-db

# Verify EC2 can reach RDS
telnet beige-common-db.cw9m48mwcxj2.us-east-1.rds.amazonaws.com 3306
```

**Issue 3: CORS Errors**

```bash
# Update CORS_ORIGINS in .env
nano /var/www/revure-backend/.env

# Add frontend URL
CORS_ORIGINS=https://yourfrontend.vercel.app,https://app.revure.com

# Restart application
pm2 restart revure-backend
```

**Issue 4: High Memory Usage**

```bash
# Check memory
free -h

# Restart PM2 with memory limit
pm2 delete revure-backend
pm2 start src/server.js --name revure-backend --max-memory-restart 500M
pm2 save
```

### Common Frontend Issues

**Issue 1: Build Fails**

```bash
# Check Node version
node --version  # Should be 20.x

# Clear cache and rebuild
rm -rf .next node_modules
yarn install
yarn build
```

**Issue 2: API Calls Failing**

```bash
# Check NEXT_PUBLIC_API_ENDPOINT is correct
echo $NEXT_PUBLIC_API_ENDPOINT

# Should point to backend
# http://98.81.117.41:5001/v1

# Test backend is accessible
curl http://98.81.117.41:5001/health
```

**Issue 3: Environment Variables Not Loading**

```bash
# For Vercel - check dashboard
vercel env ls

# For manual deployment
cat .env.production.local

# Rebuild after changing env vars
yarn build
pm2 restart frontend
```

### Emergency Contacts

**Primary Contact:**
- Name: Amrik Singh
- Email: singhamrikkhalsa@gmail.com
- Slack: @amrik

**AWS Support:**
- AWS Console: https://console.aws.amazon.com
- Support Cases: https://console.aws.amazon.com/support

**Service Status Pages:**
- AWS: https://status.aws.amazon.com/
- Vercel: https://vercel.com/status
- Stripe: https://status.stripe.com/

---

## Security Best Practices

### 1. SSH Key Management
- ✅ Use individual SSH keys per team member
- ✅ Rotate keys every 6 months
- ✅ Never share private keys
- ❌ Don't commit keys to git

### 2. Environment Variables
- ✅ Use AWS Secrets Manager for production secrets
- ✅ Rotate API keys quarterly
- ✅ Use different keys for production/staging
- ❌ Never commit .env files

### 3. Database Security
- ✅ Use strong passwords (16+ characters)
- ✅ Enable SSL for database connections
- ✅ Restrict access to application servers only
- ✅ Regular backups (daily)
- ❌ Don't use default passwords

### 4. Server Security
- ✅ Keep OS and packages updated
- ✅ Use security groups to restrict access
- ✅ Enable CloudWatch logging
- ✅ Regular security audits
- ❌ Don't disable firewalls

### 5. Application Security
- ✅ Keep dependencies updated (`npm audit`)
- ✅ Use HTTPS everywhere
- ✅ Validate all user input
- ✅ Implement rate limiting
- ❌ Don't expose internal errors to users

---

## Additional Resources

### Documentation
- Backend API: `/claudedocs/` directory
- Pricing Flow: `PRICING_FLOW_INVESTIGATION_ZERO_DOLLAR_ISSUE.md`
- Frontend Integration: `FRONTEND_PRICING_INTEGRATION.md`
- Previous Deployment: `PRODUCTION_DEPLOYMENT_SUMMARY.md`

### Tools
- PM2 Docs: https://pm2.keymetrics.io/docs/
- Next.js Deployment: https://nextjs.org/docs/deployment
- AWS EC2: https://docs.aws.amazon.com/ec2/
- Vercel: https://vercel.com/docs

### Support Channels
- Team Slack: #revure-deployments
- GitHub Issues: Respective repositories
- Email: singhamrikkhalsa@gmail.com

---

**Last Updated**: December 29, 2025
**Document Version**: 1.0
**Maintained By**: Development Team
