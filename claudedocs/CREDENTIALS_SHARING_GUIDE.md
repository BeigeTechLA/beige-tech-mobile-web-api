# Credentials & SSH Keys - Secure Sharing Guide

⚠️ **SECURITY WARNING**: This document explains how to securely share credentials with team members. Never commit actual credentials to git!

---

## 🔐 What Needs to be Shared

### 1. SSH Private Key
- **File**: `revure-backend-key.pem`
- **Location**: `~/.ssh/revure-backend-key.pem`
- **Used for**: Accessing production backend server (98.81.117.41)

### 2. Environment Variables
- Backend `.env` file contents
- Database password
- Stripe API keys
- Google API keys
- AWS credentials
- JWT secret

### 3. Service Accounts
- AWS Console access
- Vercel account access
- Database admin credentials
- Stripe dashboard access

---

## ✅ Secure Sharing Methods

### Option 1: 1Password (Recommended)

**Setup:**
1. Create team vault: "Revure Production Credentials"
2. Add items:
   - SSH Key (Secure Note with file attachment)
   - .env file (Secure Note)
   - Database credentials (Login item)
   - API keys (Password items)

**Sharing with new team member:**
1. Invite them to 1Password team
2. Grant access to "Revure Production Credentials" vault
3. They can download SSH key and credentials directly

### Option 2: AWS Secrets Manager

**Store secrets in AWS:**
```bash
# Store SSH key
aws secretsmanager create-secret \
    --name revure/production/ssh-key \
    --secret-binary fileb://~/.ssh/revure-backend-key.pem \
    --region us-east-1

# Store database password
aws secretsmanager create-secret \
    --name revure/production/db-password \
    --secret-string "actual_password_here" \
    --region us-east-1

# Store entire .env file
aws secretsmanager create-secret \
    --name revure/production/env-file \
    --secret-string "$(cat /var/www/revure-backend/.env)" \
    --region us-east-1
```

**Retrieve secrets:**
```bash
# Get SSH key
aws secretsmanager get-secret-value \
    --secret-id revure/production/ssh-key \
    --query SecretBinary \
    --output text | base64 -d > ~/.ssh/revure-backend-key.pem

chmod 400 ~/.ssh/revure-backend-key.pem

# Get database password
aws secretsmanager get-secret-value \
    --secret-id revure/production/db-password \
    --query SecretString \
    --output text

# Get entire .env file
aws secretsmanager get-secret-value \
    --secret-id revure/production/env-file \
    --query SecretString \
    --output text > .env
```

### Option 3: Encrypted Email (Less Secure)

**Encrypt file with GPG:**
```bash
# Encrypt SSH key
gpg --symmetric --cipher-algo AES256 ~/.ssh/revure-backend-key.pem

# This creates: revure-backend-key.pem.gpg
# Share password via separate channel (phone call, Signal, etc.)
# Email the .gpg file
```

**Decrypt:**
```bash
gpg --decrypt revure-backend-key.pem.gpg > ~/.ssh/revure-backend-key.pem
chmod 400 ~/.ssh/revure-backend-key.pem
```

---

## 📋 Credentials Checklist for New Team Members

Share this checklist with new team members:

### Backend Access
- [ ] SSH private key saved to `~/.ssh/revure-backend-key.pem`
- [ ] SSH key permissions set: `chmod 400 ~/.ssh/revure-backend-key.pem`
- [ ] Can SSH into server: `ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41`
- [ ] .env file contents (for local development)

### AWS Access
- [ ] AWS Console login credentials
- [ ] AWS CLI configured with `profile1`
- [ ] Can list EC2 instances
- [ ] Can access RDS database

### Database Access
- [ ] Database hostname: `beige-common-db.cw9m48mwcxj2.us-east-1.rds.amazonaws.com`
- [ ] Database username: `admin`
- [ ] Database password
- [ ] Can connect via MySQL client

### Service Accounts
- [ ] Vercel account invited to team
- [ ] GitHub access to BeigeTechLA organization
- [ ] Stripe dashboard access (if needed)
- [ ] Google Cloud Console access (for APIs)

### Local Development Setup
- [ ] Backend repository cloned
- [ ] Frontend repository cloned
- [ ] Node.js 20.x installed
- [ ] Yarn installed
- [ ] Can run `yarn dev` for both projects

---

## 🚨 Security Best Practices

### DO:
✅ Use password manager (1Password, LastPass, Bitwarden)
✅ Enable 2FA on all accounts
✅ Rotate credentials every 6 months
✅ Use different passwords for each service
✅ Encrypt sensitive files before sharing
✅ Share passwords via separate channel from files
✅ Revoke access when team members leave

### DON'T:
❌ Commit credentials to git
❌ Share credentials in Slack/Discord
❌ Email unencrypted credentials
❌ Store credentials in plain text files
❌ Share SSH keys with multiple people
❌ Use the same password for multiple services
❌ Leave credentials in browser history

---

## 📄 Credential Template Files

### Backend .env Template

Location: `/var/www/revure-backend/.env`

```bash
# Server Configuration
PORT=5001
NODE_ENV=production

# Database Configuration
DATABASE_HOST=beige-common-db.cw9m48mwcxj2.us-east-1.rds.amazonaws.com
DATABASE_PORT=3306
DATABASE_NAME=revurge
DATABASE_USER=admin
DATABASE_PASS=<GET_FROM_1PASSWORD_OR_SECRETS_MANAGER>

# JWT Configuration
JWT_SECRET=<GET_FROM_1PASSWORD_OR_SECRETS_MANAGER>
JWT_EXPIRES_IN=7d

# Stripe Configuration
STRIPE_SECRET_KEY=<GET_FROM_1PASSWORD_OR_SECRETS_MANAGER>
STRIPE_PUBLISHABLE_KEY=<GET_FROM_1PASSWORD_OR_SECRETS_MANAGER>
STRIPE_WEBHOOK_SECRET=<GET_FROM_1PASSWORD_OR_SECRETS_MANAGER>

# CORS Configuration
CORS_ORIGINS=https://revure-v2.vercel.app,https://app.revure.com

# Google APIs
GOOGLE_SHEETS_API_KEY=<GET_FROM_1PASSWORD_OR_SECRETS_MANAGER>
GOOGLE_PLACES_API_KEY=<GET_FROM_1PASSWORD_OR_SECRETS_MANAGER>

# AWS Configuration
AWS_ACCESS_KEY_ID=<GET_FROM_1PASSWORD_OR_SECRETS_MANAGER>
AWS_SECRET_ACCESS_KEY=<GET_FROM_1PASSWORD_OR_SECRETS_MANAGER>
AWS_S3_BUCKET=revure-uploads
AWS_REGION=us-east-1

# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=<GET_FROM_1PASSWORD_OR_SECRETS_MANAGER>
EMAIL_PASS=<GET_FROM_1PASSWORD_OR_SECRETS_MANAGER>
EMAIL_FROM=noreply@revure.com
```

### Frontend .env Template

For Vercel or local development:

```bash
# API Configuration
NEXT_PUBLIC_API_ENDPOINT=http://98.81.117.41:5001/v1

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<GET_FROM_1PASSWORD_OR_SECRETS_MANAGER>

# Google Maps
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=<GET_FROM_1PASSWORD_OR_SECRETS_MANAGER>

# Mapbox
NEXT_PUBLIC_MAPBOX_TOKEN=<GET_FROM_1PASSWORD_OR_SECRETS_MANAGER>
```

---

## 🔄 Credential Rotation Schedule

| Credential Type | Rotation Frequency | Last Rotated | Next Rotation |
|----------------|-------------------|--------------|---------------|
| SSH Keys | Every 6 months | Dec 19, 2024 | Jun 19, 2025 |
| Database Password | Every 3 months | - | - |
| JWT Secret | Every 6 months | - | - |
| API Keys (Stripe) | Annually | - | - |
| API Keys (Google) | Annually | - | - |
| AWS Access Keys | Every 90 days | - | - |

### How to Rotate Credentials

**SSH Key:**
```bash
# Generate new key
ssh-keygen -t rsa -b 4096 -f ~/.ssh/revure-backend-key-new.pem

# Add to server
ssh-copy-id -i ~/.ssh/revure-backend-key-new.pem ec2-user@98.81.117.41

# Test new key
ssh -i ~/.ssh/revure-backend-key-new.pem ec2-user@98.81.117.41

# Replace old key
mv ~/.ssh/revure-backend-key-new.pem ~/.ssh/revure-backend-key.pem

# Update 1Password/Secrets Manager
```

**Database Password:**
```bash
# Connect to RDS
# Use AWS Console → RDS → Modify → Master password
# Update .env file on all servers
# Restart applications
```

---

## 📞 Request Access

If you're a new team member and need credentials:

1. **Send request to**: singhamrikkhalsa@gmail.com
2. **Include**:
   - Your name
   - Your role
   - Which credentials you need
   - Your 1Password email (if using 1Password)
   - Your AWS IAM username (if needed)

3. **You'll receive**:
   - 1Password invite (or AWS Secrets Manager access)
   - Instructions to set up credentials
   - This documentation

---

## 🔒 SSH Key Location

**After receiving the SSH key, save it to:**

```bash
# macOS/Linux
~/.ssh/revure-backend-key.pem

# Windows
C:\Users\YourUsername\.ssh\revure-backend-key.pem

# Set permissions (macOS/Linux only)
chmod 400 ~/.ssh/revure-backend-key.pem
```

**Test access:**
```bash
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@98.81.117.41
```

---

## ⚠️ Important Notes

1. **Never commit this file if it contains actual credentials**
2. This file is in `.gitignore` to prevent accidental commits
3. Actual credentials should only be stored in:
   - 1Password/password manager
   - AWS Secrets Manager
   - Encrypted files (with password shared separately)
4. Report any credential leaks immediately to: singhamrikkhalsa@gmail.com

---

**Last Updated**: December 29, 2025
**Maintained By**: Amrik Singh (singhamrikkhalsa@gmail.com)
