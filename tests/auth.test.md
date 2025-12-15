# Authentication API Tests

This document provides examples for testing all authentication endpoints.

## Base URL
```
http://localhost:5001/v1/auth
```

## Setup

1. First, seed the user_type table:
```bash
node src/db/seedUserTypes.js
```

---

## 1. Register New User

**Endpoint:** `POST /v1/auth/register`

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone_number": "+1234567890",
  "password": "SecurePass123!",
  "role": "client"
}
```

**Valid Roles:** `client`, `sales_rep`, `creator`, `admin`

**Response (201):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "phone_number": "+1234567890",
    "instagram_handle": null,
    "role": "client"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "permissions": [
    "view_creators",
    "create_booking",
    "view_bookings",
    "update_booking",
    "cancel_booking",
    "view_profile",
    "update_profile"
  ]
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:5001/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "SecurePass123!",
    "role": "client"
  }'
```

---

## 2. Login

**Endpoint:** `POST /v1/auth/login`

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "SecurePass123!"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "phone_number": "+1234567890",
    "instagram_handle": null,
    "role": "client",
    "email_verified": 0
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "permissions": [
    "view_creators",
    "create_booking",
    "view_bookings",
    "update_booking",
    "cancel_booking",
    "view_profile",
    "update_profile"
  ]
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:5001/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePass123!"
  }'
```

---

## 3. Quick Register (During Booking)

**Endpoint:** `POST /v1/auth/quick-register`

**Request Body:**
```json
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "phone_number": "+1987654321"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Quick registration successful",
  "user": {
    "id": 2,
    "name": "Jane Smith",
    "email": "jane@example.com",
    "phone_number": "+1987654321",
    "role": "client"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "permissions": [
    "view_creators",
    "create_booking",
    "view_bookings",
    "update_booking",
    "cancel_booking",
    "view_profile",
    "update_profile"
  ],
  "tempPassword": "abc12345"
}
```

**Note:** If user already exists, returns existing user info with tokens.

**cURL Example:**
```bash
curl -X POST http://localhost:5001/v1/auth/quick-register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Smith",
    "email": "jane@example.com",
    "phone_number": "+1987654321"
  }'
```

---

## 4. Get Current User

**Endpoint:** `GET /v1/auth/me`

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response (200):**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "phone_number": "+1234567890",
    "instagram_handle": null,
    "role": "client",
    "email_verified": 0,
    "created_at": "2025-12-16T02:15:00.000Z"
  },
  "permissions": [
    "view_creators",
    "create_booking",
    "view_bookings",
    "update_booking",
    "cancel_booking",
    "view_profile",
    "update_profile"
  ]
}
```

**cURL Example:**
```bash
curl -X GET http://localhost:5001/v1/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## 5. Get Permissions for Role

**Endpoint:** `GET /v1/auth/permissions/:role`

**Example:** `GET /v1/auth/permissions/creator`

**Response (200):**
```json
{
  "success": true,
  "role": "creator",
  "permissions": [
    "view_bookings",
    "accept_booking",
    "reject_booking",
    "view_profile",
    "update_profile",
    "view_equipment",
    "manage_portfolio"
  ]
}
```

**cURL Example:**
```bash
curl -X GET http://localhost:5001/v1/auth/permissions/creator
```

---

## Role Permissions Reference

### Client
- view_creators
- create_booking
- view_bookings
- update_booking
- cancel_booking
- view_profile
- update_profile

### Sales Rep
- view_creators
- create_booking
- view_bookings
- update_booking
- view_clients
- manage_bookings
- view_reports
- view_profile
- update_profile

### Creator
- view_bookings
- accept_booking
- reject_booking
- view_profile
- update_profile
- view_equipment
- manage_portfolio

### Admin
- view_all
- create_all
- update_all
- delete_all
- manage_users
- manage_bookings
- manage_creators
- manage_equipment
- view_reports
- manage_permissions

---

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "message": "Email and password are required"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Invalid password"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "Account is inactive. Please contact support"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "User not found"
}
```

### 409 Conflict
```json
{
  "success": false,
  "message": "User already exists with provided credentials"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Server error during registration"
}
```

---

## Testing with Postman

1. **Import Collection:** Create a new collection named "Revure V2 Auth"
2. **Set Base URL:** Use variable `{{baseUrl}}` = `http://localhost:5001/v1`
3. **Store Token:** After login/register, save token to environment variable
4. **Protected Requests:** Add `Authorization: Bearer {{token}}` header

### Environment Variables
```json
{
  "baseUrl": "http://localhost:5001/v1",
  "token": "",
  "refreshToken": ""
}
```

---

## Running Tests

1. Start the server:
```bash
npm run dev
```

2. Seed user types:
```bash
node src/db/seedUserTypes.js
```

3. Test endpoints using cURL or Postman

4. Verify database entries:
```sql
SELECT * FROM user_type;
SELECT * FROM users;
```
