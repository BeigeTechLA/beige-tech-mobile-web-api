#!/bin/bash

# EC2 User Data Script for Revure V2 Backend (Amazon Linux 2023)
# This runs automatically when the instance starts

# Update system
dnf update -y

# Install Node.js 20.x (LTS)
dnf install -y nodejs20

# Install Git
dnf install -y git

# Install PM2 globally (process manager for Node.js)
npm install -g pm2

# Install Nginx (for reverse proxy)
dnf install -y nginx

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

# Configure PM2 to start on boot
pm2 startup systemd -u ec2-user --hp /home/ec2-user
env PATH=$PATH:/usr/bin pm2 startup systemd -u ec2-user --hp /home/ec2-user

echo "Server initialization complete!" > /var/log/user-data-complete.log
