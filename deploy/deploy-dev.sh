#!/bin/bash

# Deploy to DEV Environment
# Usage: ./deploy-dev.sh

set -e

# Configuration
ENV="dev"
SERVER_IP="100.53.10.35"
SERVER_USER="ec2-user"
KEY_FILE="../../revure-dev-key.pem"
REMOTE_DIR="/var/www/revure-backend"
ENV_FILE=".env.dev"

echo "🚀 Deploying to DEV environment..."
echo "   Server: $SERVER_IP"
echo "   Environment: $ENV"

# Check if key file exists
if [ ! -f "$KEY_FILE" ]; then
    echo "❌ SSH key not found: $KEY_FILE"
    exit 1
fi

# Sync files to server (excluding node_modules, .git, etc.)
echo "📦 Syncing files to server..."
rsync -avz --progress \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'deploy' \
    --exclude 'logs' \
    --exclude '.env*' \
    --exclude '*.pem' \
    -e "ssh -i $KEY_FILE -o StrictHostKeyChecking=no" \
    ../ "$SERVER_USER@$SERVER_IP:$REMOTE_DIR/"

# Copy environment file
echo "📄 Copying environment file..."
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no \
    "../$ENV_FILE" "$SERVER_USER@$SERVER_IP:$REMOTE_DIR/.env"

# Install dependencies and restart
echo "🔧 Installing dependencies and restarting..."
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_IP" << 'EOF'
cd /var/www/revure-backend
npm install --production
pm2 restart revure-backend || pm2 start src/server.js --name revure-backend
pm2 save
EOF

# Health check
echo "🏥 Running health check..."
sleep 5
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://$SERVER_IP/health" || echo "000")

if [ "$HTTP_STATUS" = "200" ]; then
    echo "✅ DEV deployment successful!"
    echo "   URL: http://$SERVER_IP"
    echo "   API: http://$SERVER_IP/v1/"
else
    echo "⚠️  Deployment completed but health check returned: $HTTP_STATUS"
    echo "   Check logs: ssh -i $KEY_FILE $SERVER_USER@$SERVER_IP 'pm2 logs revure-backend'"
fi
