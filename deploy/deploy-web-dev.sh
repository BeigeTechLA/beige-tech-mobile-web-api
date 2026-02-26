#!/bin/bash

# =========================================
# Production Backend Deployment Script
# Ubuntu EC2 + PM2
# =========================================

set -e

if [ -z "$1" ]; then
    echo "❌ Error: Please provide the EC2 public IP address"
    echo "Usage: ./deploy/quick-deploy.sh <PUBLIC_IP>"
    exit 1
fi

PUBLIC_IP=$1
REMOTE_USER="ubuntu"
REMOTE_DIR="/var/www/beige-web-dev"
KEY_PATH="/d/Revurge/Beige-web/beige-web-dev.pem"

SSH_CMD="ssh -i $KEY_PATH -o StrictHostKeyChecking=no $REMOTE_USER@$PUBLIC_IP"

echo "🚀 Deploying Backend to $PUBLIC_IP"
echo "=================================="
echo ""

# ----------------------------
# Test SSH
# ----------------------------
echo "🔌 Testing SSH..."
$SSH_CMD "echo Connected" >/dev/null
echo "✓ SSH connection OK"

# ----------------------------
# Prepare directory
# ----------------------------
echo "📁 Preparing directory..."
$SSH_CMD "sudo mkdir -p $REMOTE_DIR && sudo chown -R $REMOTE_USER:$REMOTE_USER $REMOTE_DIR"
echo "✓ Directory ready"

# ----------------------------
# Upload code
# ----------------------------
echo "📦 Uploading backend code..."

tar czf - \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=deploy \
  --exclude=.env \
  --exclude=*.log \
  --exclude=logs \
  . | $SSH_CMD "cd $REMOTE_DIR && tar xzf -"

echo "✓ Code uploaded"

# ----------------------------
# Install & Start App
# ----------------------------
echo "⚙ Installing dependencies & starting backend..."

$SSH_CMD "
  cd $REMOTE_DIR &&
  npm install --production &&
  pm2 delete beige-web-dev || true &&
  pm2 start npm --name beige-web-dev -- start &&
  pm2 save
"

echo "✓ Backend running with PM2"

echo ""
echo "🎉 Deployment Complete"
echo "━━━━━━━━━━━━━━━━━━━━━━"
echo "🔗 Test locally:"
echo "   http://$PUBLIC_IP:5001"
echo ""
echo "📊 View logs:"
echo "   ssh -i $KEY_PATH $REMOTE_USER@$PUBLIC_IP 'pm2 logs beige-web-dev'"
echo ""
