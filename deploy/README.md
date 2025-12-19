# Revure V2 Backend - AWS EC2 Deployment Guide

This guide explains how to deploy the Revure V2 Backend API to AWS EC2 using the automated deployment scripts.

## Prerequisites

- AWS CLI installed and configured with `profile1`
- SSH access (scripts will create the key pair automatically)
- AWS account with permissions to create EC2 instances

## Deployment Scripts

### 1. `create-ec2.sh` - Create New EC2 Instance

Creates a new EC2 instance with all necessary configuration:
- t2.micro instance (free tier eligible)
- Amazon Linux 2023 AMI
- Security groups for SSH, HTTP, HTTPS, and API port
- Node.js 20.x, PM2, and Nginx pre-installed

```bash
cd /Users/amrik/Documents/revure/revure-v2-backend
./deploy/create-ec2.sh
```

This will:
- Create SSH key pair (saved to `~/.ssh/revure-backend-key.pem`)
- Create security group with required ports open
- Launch EC2 instance
- Output instance details (IP address, instance ID)

### 2. `setup-server.sh` - Initial Deployment

Deploys the backend code to the EC2 instance:

```bash
./deploy/setup-server.sh <PUBLIC_IP>
```

This will:
- Transfer all backend files to the server
- Install Node.js dependencies
- Configure production environment
- Start the application with PM2
- Set up PM2 to auto-start on reboot

### 3. `quick-deploy.sh` - Quick Updates

For deploying code changes without full server setup:

```bash
./deploy/quick-deploy.sh <PUBLIC_IP>
```

This will:
- Sync updated code files
- Install any new dependencies
- Restart the application

## Full Deployment Process

### Step 1: Create EC2 Instance

```bash
cd /Users/amrik/Documents/revure/revure-v2-backend
./deploy/create-ec2.sh
```

**Save the output:**
```bash
export BACKEND_INSTANCE_ID=i-xxxxxxxxxxxxx
export BACKEND_PUBLIC_IP=x.x.x.x
```

### Step 2: Wait for Initialization

Wait 2-3 minutes for the instance to fully initialize (Node.js, PM2, Nginx installation)

### Step 3: Deploy Application

```bash
./deploy/setup-server.sh $BACKEND_PUBLIC_IP
```

### Step 4: Test API

```bash
# Health check
curl http://$BACKEND_PUBLIC_IP/health

# Test API endpoint
curl http://$BACKEND_PUBLIC_IP/v1/creators/search
```

## Server Management

### SSH into Server

```bash
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@<PUBLIC_IP>
```

### View Application Logs

```bash
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@<PUBLIC_IP> 'pm2 logs revure-backend'

# Or on the server:
pm2 logs revure-backend
```

### Check Application Status

```bash
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@<PUBLIC_IP> 'pm2 status'
```

### Restart Application

```bash
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@<PUBLIC_IP> 'pm2 restart revure-backend'
```

### Stop Application

```bash
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@<PUBLIC_IP> 'pm2 stop revure-backend'
```

## Configuration

### Environment Variables

Production environment variables are configured in `setup-server.sh`. Update these values before deployment:

- `FRONTEND_URL` - Your production frontend URL
- `CORS_ORIGINS` - Allowed CORS origins
- `STRIPE_SECRET_KEY` - Production Stripe key
- Other API keys and secrets

### Database

The backend is configured to use AWS RDS:
- Host: `beige-common-db.cw9m48mwcxj2.us-east-1.rds.amazonaws.com`
- Database: `revurge`
- Connection configured in `.env`

### Nginx Reverse Proxy

Nginx is configured as a reverse proxy:
- Port 80 (HTTP) → Port 5001 (Node.js app)
- Configuration: `/etc/nginx/conf.d/revure-backend.conf`

## API Endpoints

Once deployed, the API is available at:

```
http://<PUBLIC_IP>/v1/
```

### Available Endpoints:

- `GET /health` - Health check
- `GET /v1/creators/search` - Search creators
- `GET /v1/creators/:id` - Get creator profile
- `POST /v1/guest-bookings/create` - Create guest booking
- And more...

## Security

### Firewall Rules (Security Group)

- Port 22 (SSH) - Open to all (0.0.0.0/0)
- Port 80 (HTTP) - Open to all (0.0.0.0/0)
- Port 443 (HTTPS) - Open to all (0.0.0.0/0)
- Port 5001 (API) - Open to all (0.0.0.0/0)

### Recommendations:

1. **Restrict SSH access**: Update security group to allow SSH only from your IP
2. **Use HTTPS**: Set up SSL certificate using Let's Encrypt
3. **Use IAM roles**: Instead of hardcoded AWS credentials
4. **Enable CloudWatch**: For monitoring and logging
5. **Set up backups**: For the database

## Troubleshooting

### Cannot connect to EC2

```bash
# Check instance status
aws ec2 describe-instances --profile profile1 --region us-east-1 --instance-ids $BACKEND_INSTANCE_ID

# Check security group rules
aws ec2 describe-security-groups --profile profile1 --region us-east-1 --group-names revure-backend-sg
```

### Application not starting

```bash
# SSH into server
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@<PUBLIC_IP>

# Check PM2 logs
pm2 logs revure-backend

# Check Node.js version
node --version  # Should be v20.x

# Check if port 5001 is listening
netstat -tlnp | grep 5001
```

### Database connection issues

```bash
# Test database connection from EC2
ssh -i ~/.ssh/revure-backend-key.pem ec2-user@<PUBLIC_IP>
mysql -h beige-common-db.cw9m48mwcxj2.us-east-1.rds.amazonaws.com -u admin -p revurge
```

## Costs

Estimated monthly costs (us-east-1):
- **t2.micro instance**: ~$8-10/month (free tier: 750 hours/month for first 12 months)
- **Data transfer**: Varies based on usage
- **RDS database**: Existing (already provisioned)

## Cleanup

To delete all resources:

```bash
# Terminate EC2 instance
aws ec2 terminate-instances --profile profile1 --region us-east-1 --instance-ids $BACKEND_INSTANCE_ID

# Delete security group (after instance is terminated)
aws ec2 delete-security-group --profile profile1 --region us-east-1 --group-name revure-backend-sg

# Delete key pair
aws ec2 delete-key-pair --profile profile1 --region us-east-1 --key-name revure-backend-key
rm ~/.ssh/revure-backend-key.pem
```

## Support

For issues or questions:
1. Check CloudWatch logs
2. Check PM2 logs: `pm2 logs revure-backend`
3. Check Nginx logs: `/var/log/nginx/error.log`
4. Check application logs: `/var/www/revure-backend/logs/`
