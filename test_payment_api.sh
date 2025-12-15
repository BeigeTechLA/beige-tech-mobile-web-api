#!/bin/bash

# Test Payment Processing API
# Make sure the server is running: npm run dev

BASE_URL="http://localhost:3000/v1"

echo "=========================================="
echo "Testing Revure V2 Payment Processing API"
echo "=========================================="
echo ""

# Test 1: Create Payment Intent
echo "1. Creating payment intent..."
INTENT_RESPONSE=$(curl -s -X POST "$BASE_URL/payments/create-intent" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 500.00,
    "currency": "USD",
    "metadata": {
      "projectName": "Test Live Stream"
    }
  }')

echo "Response: $INTENT_RESPONSE"
echo ""

# Extract paymentIntentId (requires jq for parsing - install with: brew install jq)
if command -v jq &> /dev/null; then
  PAYMENT_INTENT_ID=$(echo "$INTENT_RESPONSE" | jq -r '.data.paymentIntentId')
  echo "Payment Intent ID: $PAYMENT_INTENT_ID"
  echo ""
else
  echo "Note: Install 'jq' to automatically extract payment intent ID"
  echo "For testing, you'll need to manually copy the paymentIntentId from Stripe"
  echo ""
fi

# Test 2: Confirm Payment (you'll need a valid Stripe paymentIntentId that has succeeded)
echo "2. Confirming payment and creating booking..."
echo "NOTE: This requires a real Stripe payment intent that has succeeded."
echo "Replace 'pi_test_xxx' with actual payment intent ID from Stripe test mode."
echo ""
echo "Sample request:"
cat << 'EOF'
curl -X POST http://localhost:3000/v1/payments/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "paymentIntentId": "pi_test_xxx",
    "amount": 500.00,
    "currency": "USD",
    "bookingData": {
      "project_name": "Corporate Live Stream",
      "description": "Annual conference streaming",
      "event_type": "Conference",
      "event_date": "2025-03-15",
      "duration_hours": 8,
      "start_time": "09:00:00",
      "end_time": "17:00:00",
      "expected_viewers": 1000,
      "stream_quality": "HD",
      "crew_size_needed": 5,
      "event_location": "San Francisco, CA",
      "streaming_platforms": ["YouTube", "Twitch"],
      "crew_roles": ["Camera Operator", "Audio Engineer"],
      "skills_needed": ["Live Streaming", "Video Production"],
      "equipments_needed": ["Cameras", "Audio Equipment"]
    }
  }'
EOF
echo ""
echo ""

# Test 3: Join Waitlist
echo "3. Testing waitlist join..."
WAITLIST_RESPONSE=$(curl -s -X POST "$BASE_URL/waitlist/join" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test'$(date +%s)'@example.com",
    "phone": "+1234567890",
    "company": "Test Company",
    "city": "San Francisco"
  }')

echo "Response: $WAITLIST_RESPONSE"
echo ""

# Test 4: Get Payment Status (example)
echo "4. Get payment status by confirmation number..."
echo "Sample request:"
echo "curl http://localhost:3000/v1/payments/#BG-20251216-345/status"
echo ""

# Test 5: Health Check
echo "5. Testing health check..."
HEALTH_RESPONSE=$(curl -s "$BASE_URL/../health")
echo "Response: $HEALTH_RESPONSE"
echo ""

echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "1. Payment Intent: Check response above"
echo "2. Payment Confirm: Requires real Stripe payment"
echo "3. Waitlist: Check response above"
echo "4. Payment Status: Use confirmation number from payment"
echo "5. Health Check: Check response above"
echo ""
echo "For full testing:"
echo "1. Set up Stripe test keys in .env"
echo "2. Run: npm run dev"
echo "3. Use Stripe test cards (4242 4242 4242 4242)"
echo "4. Execute this script: bash test_payment_api.sh"
echo ""
