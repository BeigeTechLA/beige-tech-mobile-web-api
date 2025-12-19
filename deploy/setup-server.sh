#!/bin/bash

# Setup and deploy script for Revure V2 Backend on EC2

if [ -z "$1" ]; then
    echo "❌ Error: Please provide the EC2 public IP address"
    echo "Usage: ./deploy/setup-server.sh <PUBLIC_IP>"
    exit 1
fi

PUBLIC_IP=$1
KEY_NAME="revure-backend-key"
KEY_PATH="$HOME/.ssh/$KEY_NAME.pem"
REMOTE_USER="ec2-user"
REMOTE_DIR="/var/www/revure-backend"

echo "🚀 Deploying Revure V2 Backend to $PUBLIC_IP..."

# Check if SSH key exists
if [ ! -f "$KEY_PATH" ]; then
    echo "❌ Error: SSH key not found at $KEY_PATH"
    echo "Please run ./deploy/create-ec2.sh first"
    exit 1
fi

# Test SSH connection
echo "🔍 Testing SSH connection..."
if ! ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "$REMOTE_USER@$PUBLIC_IP" "echo 'SSH connection successful'"; then
    echo "❌ Error: Cannot connect to EC2 instance"
    echo "Please wait a few minutes for the instance to fully initialize and try again"
    exit 1
fi

echo "✅ SSH connection established"

# Create deployment package (exclude node_modules and .git)
echo "📦 Creating deployment package..."
DEPLOY_DIR=$(mktemp -d)
rsync -av --exclude='node_modules' --exclude='.git' --exclude='deploy' --exclude='*.log' \
    "$(dirname $(dirname $0))/" "$DEPLOY_DIR/"

# Create production .env file
echo "🔧 Creating production environment configuration..."
cat > "$DEPLOY_DIR/.env" << 'EOF'
# Database Configuration - AWS RDS Production
DATABASE_HOST=beige-common-db.cw9m48mwcxj2.us-east-1.rds.amazonaws.com
DATABASE_PORT=3306
DATABASE_NAME=revurge
DATABASE_USER=admin
DATABASE_PASS=YOUR_DB_PASSWORD

# Server Configuration
PORT=5001
NODE_ENV=production

# JWT Configuration
JWT_SECRET=YOUR_JWT_SECRET
JWT_EXPIRES_IN=7d

# AWS S3 Configuration
S3_BUCKET_ACCESS_KEY_ID=YOUR_AWS_ACCESS_KEY_ID
S3_BUCKET_SECRET_ACCESS_KEY=YOUR_AWS_SECRET_ACCESS_KEY
S3_BUCKET_NAME=beigexmemehouse
S3_BUCKET_REGION=eu-north-1
S3_SUB_FOLDER=beige

# File Upload Configuration
FILEPATH_MEDIA=public/uploads/media/

# Email Configuration (Gmail SMTP)
EMAIL_USER=os.beige.app@gmail.com
EMAIL_APP_PASSWORD=YOUR_EMAIL_APP_PASSWORD
EMAIL_FROM_NAME=Revurge Platform

# Frontend URL (Update with your production frontend URL)
FRONTEND_URL=http://localhost:3000

# Stripe Configuration (Update with your production keys)
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# CORS Origins (Update with your production frontend URLs)
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
EOF

# Transfer files to EC2
echo "📤 Transferring files to EC2 instance..."
ssh -i "$KEY_PATH" "$REMOTE_USER@$PUBLIC_IP" "mkdir -p $REMOTE_DIR"
rsync -avz -e "ssh -i $KEY_PATH" \
    --exclude='node_modules' \
    --exclude='.git' \
    "$DEPLOY_DIR/" "$REMOTE_USER@$PUBLIC_IP:$REMOTE_DIR/"

# Clean up temp directory
rm -rf "$DEPLOY_DIR"

# Install dependencies and start application
echo "📦 Installing dependencies on server..."
ssh -i "$KEY_PATH" "$REMOTE_USER@$PUBLIC_IP" << 'ENDSSH'
cd /var/www/revure-backend

# Install dependencies
npm install --production

# Create logs directory
mkdir -p logs

# Stop any existing PM2 processes
pm2 delete revure-backend 2>/dev/null || true

# Start application with PM2
pm2 start src/server.js \
    --name revure-backend \
    --instances 1 \
    --max-memory-restart 500M \
    --log ./logs/app.log \
    --error ./logs/error.log \
    --merge-logs

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system boot
pm2 startup | tail -1 | sudo bash

# Show PM2 status
pm2 status

echo ""
echo "✅ Application deployed successfully!"
ENDSSH

echo ""
echo "🎉 Deployment Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔗 API URLs:"
echo "   Health Check: http://$PUBLIC_IP/health"
echo "   API Base URL: http://$PUBLIC_IP/v1/"
echo ""
echo "📊 Useful Commands:"
echo "   SSH into server: ssh -i $KEY_PATH $REMOTE_USER@$PUBLIC_IP"
echo "   View logs: ssh -i $KEY_PATH $REMOTE_USER@$PUBLIC_IP 'pm2 logs revure-backend'"
echo "   Check status: ssh -i $KEY_PATH $REMOTE_USER@$PUBLIC_IP 'pm2 status'"
echo "   Restart app: ssh -i $KEY_PATH $REMOTE_USER@$PUBLIC_IP 'pm2 restart revure-backend'"
echo ""
echo "🧪 Test API:"
echo "   curl http://$PUBLIC_IP/health"
echo "   curl http://$PUBLIC_IP/v1/creators/search"
echo ""
