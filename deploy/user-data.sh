#!/bin/bash

# EC2 User Data Script for Revure V2 Backend
# This runs automatically when the instance starts

# Update system
yum update -y

# Install Node.js 20.x (LTS)
curl -sL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs

# Install Git
yum install -y git

# Install PM2 globally (process manager for Node.js)
npm install -g pm2

# Install Nginx (for reverse proxy)
amazon-linux-extras install -y nginx1

# Create application directory
mkdir -p /var/www/revure-backend
chown -R ec2-user:ec2-user /var/www/revure-backend

# Configure Nginx as reverse proxy
cat > /etc/nginx/conf.d/revure-backend.conf << 'EOF'
server {
    listen 80;
    server_name _;

    # Health check endpoint
    location /health {
        return 200 "OK\n";
        add_header Content-Type text/plain;
    }

    # API proxy
    location / {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Start and enable Nginx
systemctl start nginx
systemctl enable nginx

# Create log directory for application
mkdir -p /var/log/revure-backend
chown -R ec2-user:ec2-user /var/log/revure-backend

echo "✅ Server initialization complete!" > /var/log/user-data-complete.log
