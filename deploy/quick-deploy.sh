#!/bin/bash

# Quick deployment script for code updates (no server setup)

if [ -z "$1" ]; then
    echo "❌ Error: Please provide the EC2 public IP address"
    echo "Usage: ./deploy/quick-deploy.sh <PUBLIC_IP>"
    exit 1
fi

PUBLIC_IP=$1
KEY_NAME="revure-backend-key"
KEY_PATH="$HOME/.ssh/$KEY_NAME.pem"
REMOTE_USER="ec2-user"
REMOTE_DIR="/var/www/revure-backend"

echo "🚀 Quick deploying code updates to $PUBLIC_IP..."

# Test SSH connection
if ! ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "$REMOTE_USER@$PUBLIC_IP" "echo 'Connected'"; then
    echo "❌ Error: Cannot connect to EC2 instance"
    exit 1
fi

# Transfer updated files
echo "📤 Transferring updated files..."
rsync -avz -e "ssh -i $KEY_PATH" \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='deploy' \
    --exclude='.env' \
    --exclude='*.log' \
    --exclude='logs/' \
    "$(dirname $(dirname $0))/" "$REMOTE_USER@$PUBLIC_IP:$REMOTE_DIR/"

# Restart application
echo "🔄 Restarting application..."
ssh -i "$KEY_PATH" "$REMOTE_USER@$PUBLIC_IP" << 'ENDSSH'
cd /var/www/revure-backend

# Install any new dependencies
npm install --production

# Restart PM2 process
pm2 restart revure-backend

# Show status
pm2 status

echo ""
echo "✅ Application restarted successfully!"
ENDSSH

echo ""
echo "🎉 Quick Deploy Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔗 API Base URL: http://$PUBLIC_IP/v1/"
echo "📊 Check logs: ssh -i $KEY_PATH $REMOTE_USER@$PUBLIC_IP 'pm2 logs revure-backend'"
echo ""
