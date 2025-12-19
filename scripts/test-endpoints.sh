#!/bin/bash

# Test script for equipment-by-creator and reviews endpoints
# Usage: ./scripts/test-endpoints.sh

BASE_URL="http://localhost:5001/v1"

echo "========================================"
echo "Testing Equipment and Reviews Endpoints"
echo "========================================"
echo ""

# Test 1: Get equipment by creator
echo "1. GET /equipment/by-creator/:creatorId"
echo "   Getting equipment owned by creator 1..."
curl -s "${BASE_URL}/equipment/by-creator/1" | jq '.'
echo ""

# Test 2: Get reviews by creator
echo "2. GET /reviews/by-creator/:creatorId"
echo "   Getting latest 5 reviews for creator 1..."
curl -s "${BASE_URL}/reviews/by-creator/1?limit=5" | jq '.'
echo ""

# Test 3: Create a review
echo "3. POST /reviews/by-creator/:creatorId"
echo "   Creating a new review for creator 1..."
curl -s -X POST "${BASE_URL}/reviews/by-creator/1" \
  -H "Content-Type: application/json" \
  -d "{\"rating\":5,\"review_text\":\"Test review from script\",\"shoot_date\":\"2024-12-19\"}" | jq '.'
echo ""

# Test 4: Verify review was created
echo "4. Verify new review appears in list..."
curl -s "${BASE_URL}/reviews/by-creator/1?limit=1" | jq '.data[0]'
echo ""

# Test 5: Test with different creator
echo "5. GET /reviews/by-creator/:creatorId for creator 3"
curl -s "${BASE_URL}/reviews/by-creator/3?limit=3" | jq '.'
echo ""

echo "========================================"
echo "All tests completed!"
echo "========================================"
