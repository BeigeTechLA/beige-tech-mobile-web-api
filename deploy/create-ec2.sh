#!/bin/bash

# Configuration
PROFILE="profile1"
REGION="us-east-1"
INSTANCE_TYPE="t3.micro"  # Small instance for production
AMI_ID="ami-0453ec754f44f9a4a"  # Amazon Linux 2023 in us-east-1
KEY_NAME="revure-backend-key"
SECURITY_GROUP_NAME="revure-backend-sg"
INSTANCE_NAME="revure-v2-backend"

echo "🚀 Creating EC2 instance for Revure V2 Backend..."

# Check if key pair exists, if not create it
echo "📝 Checking SSH key pair..."
if ! aws ec2 describe-key-pairs --profile $PROFILE --region $REGION --key-names $KEY_NAME &>/dev/null; then
    echo "Creating new key pair: $KEY_NAME"
    aws ec2 create-key-pair \
        --profile $PROFILE \
        --region $REGION \
        --key-name $KEY_NAME \
        --query 'KeyMaterial' \
        --output text > ~/.ssh/$KEY_NAME.pem
    chmod 400 ~/.ssh/$KEY_NAME.pem
    echo "✅ Key pair created and saved to ~/.ssh/$KEY_NAME.pem"
else
    echo "✅ Key pair $KEY_NAME already exists"
fi

# Check if security group exists, if not create it
echo "🔒 Checking security group..."
SG_ID=$(aws ec2 describe-security-groups \
    --profile $PROFILE \
    --region $REGION \
    --filters "Name=group-name,Values=$SECURITY_GROUP_NAME" \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null)

if [ "$SG_ID" == "None" ] || [ -z "$SG_ID" ]; then
    echo "Creating security group: $SECURITY_GROUP_NAME"
    SG_ID=$(aws ec2 create-security-group \
        --profile $PROFILE \
        --region $REGION \
        --group-name $SECURITY_GROUP_NAME \
        --description "Security group for Revure V2 Backend API" \
        --query 'GroupId' \
        --output text)

    # Allow SSH (port 22)
    aws ec2 authorize-security-group-ingress \
        --profile $PROFILE \
        --region $REGION \
        --group-id $SG_ID \
        --protocol tcp \
        --port 22 \
        --cidr 0.0.0.0/0 2>/dev/null || echo "  Port 22 already open"

    # Allow API port (5001)
    aws ec2 authorize-security-group-ingress \
        --profile $PROFILE \
        --region $REGION \
        --group-id $SG_ID \
        --protocol tcp \
        --port 5001 \
        --cidr 0.0.0.0/0 2>/dev/null || echo "  Port 5001 already open"

    # Allow HTTP (port 80)
    aws ec2 authorize-security-group-ingress \
        --profile $PROFILE \
        --region $REGION \
        --group-id $SG_ID \
        --protocol tcp \
        --port 80 \
        --cidr 0.0.0.0/0 2>/dev/null || echo "  Port 80 already open"

    # Allow HTTPS (port 443)
    aws ec2 authorize-security-group-ingress \
        --profile $PROFILE \
        --region $REGION \
        --group-id $SG_ID \
        --protocol tcp \
        --port 443 \
        --cidr 0.0.0.0/0 2>/dev/null || echo "  Port 443 already open"

    echo "✅ Security group created: $SG_ID"
else
    echo "✅ Security group already exists: $SG_ID"
fi

# Create EC2 instance
echo "🖥️  Creating EC2 instance..."
INSTANCE_ID=$(aws ec2 run-instances \
    --profile $PROFILE \
    --region $REGION \
    --image-id $AMI_ID \
    --instance-type $INSTANCE_TYPE \
    --key-name $KEY_NAME \
    --security-group-ids $SG_ID \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$INSTANCE_NAME}]" \
    --user-data file://$(dirname $0)/user-data.sh \
    --query 'Instances[0].InstanceId' \
    --output text)

echo "✅ Instance created: $INSTANCE_ID"
echo "⏳ Waiting for instance to be running..."

# Wait for instance to be running
aws ec2 wait instance-running \
    --profile $PROFILE \
    --region $REGION \
    --instance-ids $INSTANCE_ID

# Get public IP
PUBLIC_IP=$(aws ec2 describe-instances \
    --profile $PROFILE \
    --region $REGION \
    --instance-ids $INSTANCE_ID \
    --query 'Reservations[0].Instances[0].PublicIpAddress' \
    --output text)

echo ""
echo "🎉 EC2 Instance Created Successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Instance ID: $INSTANCE_ID"
echo "Public IP: $PUBLIC_IP"
echo "SSH Key: ~/.ssh/$KEY_NAME.pem"
echo "Security Group: $SG_ID"
echo ""
echo "📝 Save this information:"
echo "export BACKEND_INSTANCE_ID=$INSTANCE_ID"
echo "export BACKEND_PUBLIC_IP=$PUBLIC_IP"
echo ""
echo "🔗 SSH Command:"
echo "ssh -i ~/.ssh/$KEY_NAME.pem ec2-user@$PUBLIC_IP"
echo ""
echo "⏳ Please wait 2-3 minutes for the instance to fully initialize..."
echo "Then run: ./deploy/setup-server.sh $PUBLIC_IP"
