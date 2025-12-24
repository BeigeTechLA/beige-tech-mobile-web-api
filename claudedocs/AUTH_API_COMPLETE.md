# Authentication API - Complete Documentation

**Last Updated:** 2025-12-24
**Status:** ✅ PRODUCTION READY
**Base URL:** `https://98.81.117.41:5001/api/v1/auth` or `/api/v1/auth`

---

## Table of Contents
1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Authentication Flows](#authentication-flows)
4. [API Endpoints](#api-endpoints)
5. [Error Handling](#error-handling)
6. [Testing Guide](#testing-guide)

---

## Overview

The authentication system now supports:
- ✅ Email/password registration with OTP verification
- ✅ Real OTP generation and email sending
- ✅ Email verification with expiry (10 minutes)
- ✅ OTP resend with rate limiting (60 seconds)
- ✅ Login via email/password or phone/OTP
- ✅ Password reset flow with email tokens
- ✅ JWT authentication with refresh tokens
- ✅ Role-based permissions (client, creator, sales_rep, admin)
- ✅ Affiliate account auto-creation

---

## Quick Start

### 1. Register a New User

```bash
POST /api/v1/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePass123!",
  "phone_number": "+1234567890",
  "userType": 1
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully. Please check your email for verification code.",
  "userId": 123,
  "email": "john@example.com",
  "affiliate": {
    "affiliate_id": "AFF123",
    "referral_code": "JOHN123"
  }
}
```

**What Happens:**
- User account created with hashed password
- Random 6-digit OTP generated and saved (expires in 10 minutes)
- Professional verification email sent to user
- Affiliate account automatically created

---

### 2. Verify Email with OTP

```bash
POST /api/v1/auth/verify-email
Content-Type: application/json

{
  "email": "john@example.com",
  "verificationCode": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email verified successfully",
  "user": {
    "id": 123,
    "name": "John Doe",
    "email": "john@example.com",
    "role": "client"
  },
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "permissions": ["view_creators", "create_booking", "view_bookings", ...]
}
```

**What Happens:**
- OTP validated (checks code + expiry)
- Email marked as verified in database
- Welcome email sent to user
- User automatically logged in with JWT tokens

---

### 3. Login

```bash
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "SecurePass123!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "id": 123,
    "name": "John Doe",
    "email": "john@example.com",
    "phone_number": "+1234567890",
    "role": "client",
    "email_verified": 1,
    "crew_member_id": null
  },
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "permissions": ["view_creators", "create_booking", ...]
}
```

---

## Authentication Flows

### Complete Sign-Up Flow

```
1. User Registration
   ↓
   POST /auth/register
   ↓
2. OTP Email Sent (expires in 10 min)
   ↓
3. User Receives Email
   ↓
4. User Enters OTP
   ↓
   POST /auth/verify-email
   ↓
5. Email Verified ✅
   ↓
6. Welcome Email Sent
   ↓
7. Auto-Login with JWT
```

**OTP Resend Flow:**
```
Email not received?
   ↓
   POST /auth/resend-otp
   ↓
Rate limit check (60 seconds)
   ↓
New OTP generated & sent
```

### Login Flow Options

**Option 1: Email/Password**
```
POST /auth/login
{
  "email": "user@example.com",
  "password": "password123"
}
↓
Returns: JWT + User Data
```

**Option 2: Phone/OTP**
```
Step 1: Request OTP
POST /auth/login
{
  "mobile": "+1234567890"
}
↓
Returns: { message: "OTP sent" }

Step 2: Verify OTP & Login
POST /auth/login
{
  "mobile": "+1234567890",
  "otp": "123456"
}
↓
Returns: JWT + User Data
```

### Password Reset Flow

```
1. User Forgot Password
   ↓
   POST /auth/forgot-password
   { "email": "user@example.com" }
   ↓
2. Reset token generated (expires in 1 hour)
   ↓
3. Email sent with reset link
   ↓
4. User clicks link with token
   ↓
5. User enters new password
   ↓
   POST /auth/reset-password
   {
     "resetToken": "abc123...",
     "newPassword": "NewPass123!",
     "confirmPassword": "NewPass123!"
   }
   ↓
6. Password updated ✅
```

---

## API Endpoints

### Registration Endpoints

#### POST `/auth/register`
Register a new user (client or creator)

**Request Body:**
```json
{
  "name": "string (required)",
  "email": "string (optional if phone/instagram provided)",
  "phone_number": "string (optional)",
  "instagram_handle": "string (optional)",
  "password": "string (required)",
  "userType": 1 or 2 (optional, default: 1)
}
```

**User Types:**
- `1` = Client
- `2` = Creator

**Success Response:** `201 Created`
```json
{
  "success": true,
  "message": "User registered successfully. Please check your email for verification code.",
  "userId": 123,
  "email": "user@example.com",
  "affiliate": {
    "affiliate_id": "AFF123",
    "referral_code": "CODE123"
  }
}
```

**Error Responses:**
- `400 Bad Request` - Missing required fields or invalid userType
- `409 Conflict` - User already exists
- `500 Server Error` - Database or server error

---

#### POST `/auth/quick-register`
Quick signup during booking (no password required initially)

**Request Body:**
```json
{
  "name": "string (required)",
  "email": "string (required or phone_number)",
  "phone_number": "string (optional)"
}
```

**Success Response:** `201 Created`
```json
{
  "success": true,
  "message": "Quick registration successful",
  "user": { "id": 123, "name": "John Doe", "email": "john@example.com", "role": "client" },
  "affiliate": {...},
  "token": "eyJ...",
  "refreshToken": "eyJ...",
  "permissions": [...],
  "tempPassword": "abc12345"
}
```

**Note:** User can change temp password later via `/auth/change-password`

---

### Email Verification Endpoints

#### POST `/auth/send-otp`
Send verification OTP to email (can be used after registration or anytime)

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Success Response:** `200 OK`
```json
{
  "success": true,
  "message": "Verification code sent to your email"
}
```

**Error Responses:**
- `400 Bad Request` - Email already verified
- `404 Not Found` - User not found
- `429 Too Many Requests` - Rate limit exceeded (must wait 60 seconds)
- `500 Server Error` - Email sending failed

---

#### POST `/auth/resend-otp`
Resend verification OTP (with rate limiting)

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Success Response:** `200 OK`
```json
{
  "success": true,
  "message": "New verification code sent to your email"
}
```

**Rate Limiting:**
- Maximum 1 request per 60 seconds per email
- Returns `429` with `remainingTime` if too soon

**Error Response (Rate Limited):**
```json
{
  "success": false,
  "message": "Please wait 45 seconds before requesting another OTP",
  "remainingTime": 45
}
```

---

#### POST `/auth/verify-email`
Verify email with OTP code

**Request Body:**
```json
{
  "email": "user@example.com",
  "verificationCode": "123456"
}
```

**Success Response:** `200 OK`
```json
{
  "success": true,
  "message": "Email verified successfully",
  "user": {
    "id": 123,
    "name": "John Doe",
    "email": "user@example.com",
    "role": "client"
  },
  "token": "eyJ...",
  "refreshToken": "eyJ...",
  "permissions": [...]
}
```

**Error Responses:**
- `400 Bad Request` - Invalid, expired, or missing OTP
- `404 Not Found` - User not found

**OTP Errors:**
```json
// Invalid OTP
{
  "success": false,
  "message": "Invalid OTP. Please try again.",
  "error": "INVALID"
}

// Expired OTP
{
  "success": false,
  "message": "OTP has expired. Please request a new one.",
  "error": "EXPIRED"
}

// No OTP found
{
  "success": false,
  "message": "No OTP found. Please request a new one.",
  "error": "NO_OTP"
}
```

---

### Login Endpoints

#### POST `/auth/login`
Login with email/password OR phone/OTP

**Email/Password Login:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Phone OTP Login (Step 1 - Request OTP):**
```json
{
  "mobile": "+1234567890"
}
```

**Phone OTP Login (Step 2 - Verify & Login):**
```json
{
  "mobile": "+1234567890",
  "otp": "123456"
}
```

**Success Response:** `200 OK`
```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "id": 123,
    "name": "John Doe",
    "email": "user@example.com",
    "phone_number": "+1234567890",
    "instagram_handle": "@johndoe",
    "role": "client",
    "email_verified": 1,
    "crew_member_id": null
  },
  "token": "eyJ...",
  "refreshToken": "eyJ...",
  "permissions": ["view_creators", "create_booking", ...]
}
```

**Error Responses:**
- `400 Bad Request` - Missing email/password or mobile
- `401 Unauthorized` - Invalid password or OTP
- `403 Forbidden` - Account inactive
- `404 Not Found` - User not found

---

### Password Management Endpoints

#### POST `/auth/change-password`
Change password for authenticated user

**Request Body:**
```json
{
  "userId": 123,
  "oldPassword": "OldPass123!",
  "newPassword": "NewPass123!",
  "confirmPassword": "NewPass123!"
}
```

**Success Response:** `200 OK`
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

**Error Responses:**
- `400 Bad Request` - Passwords don't match or old password incorrect
- `404 Not Found` - User not found

---

#### POST `/auth/forgot-password`
Request password reset token

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Success Response:** `200 OK`
```json
{
  "success": true,
  "message": "If an account with that email exists, a password reset link has been sent."
}
```

**Note:** Always returns success (security best practice - don't reveal if user exists)

---

#### POST `/auth/reset-password`
Reset password with token

**Request Body:**
```json
{
  "resetToken": "abc123def456...",
  "newPassword": "NewPass123!",
  "confirmPassword": "NewPass123!"
}
```

**Success Response:** `200 OK`
```json
{
  "success": true,
  "message": "Password has been reset successfully"
}
```

**Error Responses:**
- `400 Bad Request` - Passwords don't match or token expired
- `404 Not Found` - Invalid reset token

---

### User Info Endpoints

#### GET `/auth/me`
Get current user information (requires authentication)

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Success Response:** `200 OK`
```json
{
  "success": true,
  "user": {
    "id": 123,
    "name": "John Doe",
    "email": "user@example.com",
    "phone_number": "+1234567890",
    "instagram_handle": "@johndoe",
    "role": "client",
    "email_verified": 1,
    "created_at": "2025-12-24T10:30:00.000Z"
  },
  "permissions": ["view_creators", "create_booking", ...]
}
```

**Error Responses:**
- `401 Unauthorized` - Missing or invalid token
- `403 Forbidden` - Account inactive
- `404 Not Found` - User not found

---

#### GET `/auth/permissions/:role`
Get permissions for a specific role

**Parameters:**
- `role`: `client`, `sales_rep`, `creator`, or `admin`

**Example:** `GET /auth/permissions/client`

**Success Response:** `200 OK`
```json
{
  "success": true,
  "role": "client",
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

---

### Crew Member Registration (3 Steps)

For creators, registration is a 3-step process with file uploads.

#### POST `/auth/register-crew-step1`
Step 1: Basic Information + Profile Photo

**Content-Type:** `multipart/form-data`

**Form Fields:**
```
first_name: string (required)
last_name: string (required)
email: string (required)
phone_number: string (optional)
location: string (optional)
password: string (required)
working_distance: string (optional)
profile_photo: file (optional)
```

**Success Response:** `201 Created`
```json
{
  "success": true,
  "message": "Crew member registered successfully (Step 1). Please check your email for verification code.",
  "crew_member_id": 456,
  "user_id": 123
}
```

---

#### POST `/auth/register-crew-step2`
Step 2: Professional Details

**Request Body:**
```json
{
  "crew_member_id": 456,
  "primary_role": "Videographer",
  "years_of_experience": 5,
  "hourly_rate": 150,
  "bio": "Professional videographer with 5 years experience...",
  "skills": ["Videography", "Editing", "Color Grading"],
  "equipment_ownership": ["Canon R5", "DJI Ronin", "Lighting Kit"]
}
```

**Success Response:** `200 OK`
```json
{
  "success": true,
  "message": "Professional details updated successfully (Step 2)",
  "crew_member": {...}
}
```

---

#### POST `/auth/register-crew-step3`
Step 3: Portfolio & Additional Files

**Content-Type:** `multipart/form-data`

**Form Fields:**
```
crew_member_id: number (required)
availability: JSON array
certifications: JSON array
social_media_links: JSON object
resume: file (optional)
portfolio: file (optional)
certifications: files[] (optional, max 10)
recent_work: files[] (optional, unlimited)
```

**Success Response:** `200 OK`
```json
{
  "success": true,
  "message": "Project details updated successfully (Step 3)",
  "crew_member": {...}
}
```

---

#### GET `/auth/crew-member/:crew_member_id`
Get crew member details (all 3 steps data)

**Example:** `GET /auth/crew-member/456`

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "step1": {
      "first_name": "John",
      "last_name": "Doe",
      "email": "john@example.com",
      "phone_number": "+1234567890",
      "location": "Los Angeles, CA",
      "working_distance": "50 miles",
      "profile_photo": {...}
    },
    "step2": {
      "primary_role": "Videographer",
      "years_of_experience": 5,
      "hourly_rate": 150,
      "bio": "...",
      "skills": [...],
      "equipment_ownership": [...]
    },
    "step3": {
      "availability": [...],
      "certifications": [...],
      "social_media_links": {...},
      "files": {
        "resume": {...},
        "portfolio": {...},
        "certifications": [...],
        "recent_work": [...]
      }
    }
  }
}
```

---

## Error Handling

### Standard Error Format

All errors follow this format:

```json
{
  "success": false,
  "message": "Human-readable error message",
  "error": "ERROR_CODE" // Optional
}
```

### HTTP Status Codes

| Code | Meaning | When Used |
|------|---------|-----------|
| 200 | OK | Successful GET, PUT, DELETE |
| 201 | Created | Successful POST (registration) |
| 400 | Bad Request | Invalid input, validation errors |
| 401 | Unauthorized | Missing/invalid auth token |
| 403 | Forbidden | Valid token but insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Resource already exists (duplicate email) |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Database or server errors |

### Common Error Scenarios

**Invalid Credentials:**
```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

**Rate Limit Exceeded:**
```json
{
  "success": false,
  "message": "Please wait 45 seconds before requesting another OTP",
  "remainingTime": 45
}
```

**Token Expired:**
```json
{
  "success": false,
  "message": "Token has expired"
}
```

---

## Testing Guide

### Test Endpoints Locally

```bash
# Base URL for local testing
BASE_URL="http://localhost:5001/api/v1/auth"

# 1. Register
curl -X POST $BASE_URL/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "Test123!",
    "userType": 1
  }'

# 2. Check email for OTP, then verify
curl -X POST $BASE_URL/verify-email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "verificationCode": "123456"
  }'

# 3. Login
curl -X POST $BASE_URL/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!"
  }'

# 4. Test protected endpoint
curl -X GET $BASE_URL/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"

# 5. Resend OTP
curl -X POST $BASE_URL/resend-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'

# 6. Forgot password
curl -X POST $BASE_URL/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

### Test on Production (AWS)

```bash
# Production URL
PROD_URL="http://98.81.117.41:5001/api/v1/auth"

# Same commands as above, just replace BASE_URL with PROD_URL
curl -X POST $PROD_URL/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "YourPassword123!"
  }'
```

### Test Email Delivery

1. Register with a real email address
2. Check inbox for verification email
3. Verify email contains:
   - 6-digit OTP code
   - Professional HTML design
   - Expiry time (10 minutes)
   - Security notice

---

## What Was Fixed

### Critical Bugs Resolved:

✅ **Login 500 Error**
- Removed duplicate function definitions
- Fixed null reference checks for userType

✅ **Hardcoded OTP "123456"**
- Now generates random 6-digit codes
- Each user gets unique OTP

✅ **No Email Sending**
- Integrated nodemailer with professional templates
- Sends verification, welcome, and password reset emails

✅ **Email Verification Button Non-Functional**
- Implemented proper OTP validation
- Added expiry checks
- Added resend functionality with rate limiting

✅ **Middleware Import Mismatch**
- Fixed auth middleware exports
- Added `authenticate` alias for compatibility

✅ **No Rate Limiting**
- Added 60-second cooldown for OTP resends
- Prevents email/SMS bombing

---

## Security Features

✅ **Password Security**
- Bcrypt hashing with salt rounds: 10
- Never store plain text passwords

✅ **JWT Tokens**
- Access token expires in 7 days (configurable)
- Refresh token expires in 30 days
- Signed with secret key

✅ **OTP Security**
- Random 6-digit generation
- 10-minute expiry
- One-time use (cleared after verification)

✅ **Rate Limiting**
- 60-second cooldown between OTP requests
- Prevents brute force attacks

✅ **Security Best Practices**
- Generic error messages (don't reveal user existence)
- Email/password validation
- Account status checks (is_active)

---

## Next Steps & Future Enhancements

### Short Term:
- [ ] Add SMS OTP via Twilio/AWS SNS for phone login
- [ ] Implement token blacklisting for logout
- [ ] Add refresh token rotation
- [ ] Implement account lockout after failed attempts

### Medium Term:
- [ ] Two-factor authentication (2FA)
- [ ] OAuth integration (Google, Facebook)
- [ ] Password strength requirements
- [ ] Email change verification

### Long Term:
- [ ] Biometric authentication
- [ ] Device fingerprinting
- [ ] Session management dashboard
- [ ] Security audit logging

---

## Support & Contact

For issues or questions:
1. Check this documentation first
2. Review `claudedocs/AUTH_ISSUES_AND_FIXES.md` for detailed technical info
3. Test endpoints using the examples above
4. Check server logs: `pm2 logs revure-backend`

**Server Details:**
- Production: `98.81.117.41:5001`
- Database: AWS RDS (beige-common-db)
- PM2 Status: `ssh ec2-user@98.81.117.41 "pm2 status"`

---

**Documentation Version:** 1.0
**Last Verified:** 2025-12-24
**System Status:** ✅ PRODUCTION READY
