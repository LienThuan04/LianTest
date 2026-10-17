# API Documentation — BaseAuth

A reusable NestJS authentication starter. Every endpoint, model, request body, and response is documented here.

---

## Table of Contents

| # | Section |
|---|---|
| [1](#1-overview) | Overview |
| [2](#2-base-url--versioning) | Base URL & Versioning |
| [3](#3-authentication) | Authentication |
| [4](#4-standard-response-format) | Standard Response Format |
| [5](#5-error-handling) | Error Handling |
| [6](#6-data-models) | Data Models |
| [7](#7-auth-endpoints) | Auth Endpoints |
| [8](#8-users-endpoints) | Users Endpoints |
| [9](#9-role-endpoints) | Role Endpoints |
| [10](#10-email-endpoints) | Email Endpoints |
| [11](#11-complete-env-reference) | Complete Env Reference |
| [12](#12-rate-limiting) | Rate Limiting |
| [13](#13-code-documentation-compodoc) | Code Documentation (Compodoc) |

---

## 1 Overview

**Stack:** NestJS · Prisma (PostgreSQL) · Passport JWT · Nodemailer · Supabase Storage

**What this project provides:**

| Feature | Details |
|---|---|
| Registration | Two-step flow: submit form → verify OTP via email |
| Login | Local (email/password) and Google OAuth2 |
| Token system | Short-lived access token (header) + long-lived refresh token (httpOnly cookie for web / response body for mobile) |
| Session management | One session per device; configurable device limit per user |
| Password reset | Three-step flow: request OTP → verify OTP → reset (token via httpOnly cookie for web / response body for mobile) |
| Profile update | OTP-protected update of email/username; description updates instantly |
| Role-based access | `@AdminOnly()` guard; `@SkipAdminOnly()` for per-method override |
| File storage | Supabase Storage for avatar and background images |
| Rate limiting | `@nestjs/throttler` v6 — 4 named throttlers, per-route override via `@Throttle()` |
| Multi-client support | Same server serves web browsers, mobile apps (React Native, Flutter), and desktop apps — client declares type via `X-Client-Type` header |

---

## 2 Base URL & Versioning

```
http://localhost:{PORT}/api/v{VERSION}
```

Default values from `.env`:

```
PORT=8080
GLOBAL_PREFIX=api
VERSION=1
```

All examples in this document use:

```
http://localhost:8080/api/v1
```

Swagger UI is available at:

```
http://localhost:8080/swagger
```

---

## 3 Authentication

### Access Token

- Signed JWT, expires after `JWT_ACCESS_EXPIRE` (default `10m`)
- Include in every protected request:

```http
Authorization: Bearer <accessToken>
```

### Multi-Client Support (Web & Mobile)

The server serves both web browsers and native mobile/desktop apps from the same endpoints. The client declares its type once via a request header:

```http
X-Client-Type: mobile
```

If the header is absent, the server defaults to `web` behavior (no breaking change for existing web clients).

**Token transport by client type:**

| Token | Web | Mobile |
|---|---|---|
| **Device ID** | Cookie (`NAME_DEVICEID_CLIENT`) | `X-Device-ID` header |
| **Refresh token — receive** | `Set-Cookie` (httpOnly, auto-sent by browser) | Response body field `refreshToken` |
| **Refresh token — send** | Cookie (auto-sent by browser) | `X-Refresh-Token` header |
| **Reset token — receive** | `Set-Cookie` (httpOnly, auto-sent by browser) | Response body field `resetToken` |
| **Reset token — send** | Cookie (auto-sent by browser) | `X-Reset-Token` header |

**Client setup — Web (run once before login):**

```javascript
let deviceId = localStorage.getItem('deviceId');
if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem('deviceId', deviceId);
}
document.cookie = `deviceId=${deviceId}; path=/; max-age=31536000`;
// No X-Client-Type header needed — web is the default
```

**Client setup — Mobile (set once in HTTP client config):**

```typescript
// React Native — Axios example (configure once at app init)
import axios from 'axios';

const deviceId = await SecureStore.getItemAsync('deviceId') ?? crypto.randomUUID();
await SecureStore.setItemAsync('deviceId', deviceId);

axios.defaults.headers.common['X-Client-Type'] = 'mobile';
axios.defaults.headers.common['X-Device-ID'] = deviceId;
// Store returned refreshToken in SecureStorage and attach as X-Refresh-Token on each request
```

**Which clients use which behavior:**

| Client type | Uses |
|---|---|
| Web browser | Web (default) |
| Electron app | Web (has Chromium cookie support) |
| React Native / Flutter | Mobile (`X-Client-Type: mobile`) |
| Native desktop (C#, Java, Python) | Mobile (`X-Client-Type: mobile`) |
| Tauri + WebView | Web |
| Tauri + Rust HTTP client | Mobile |

### Refresh Token

- **Web:** Stored in `httpOnly` cookie `NAME_COOKIE_REFRESH_TOKEN_BROWSER` (default `refreshToken`). Sent automatically by the browser. Expires after `JWT_REFRESH_EXPIRE` (default `1d`).
- **Mobile:** Returned in response body as `refreshToken` field. Store in `SecureStorage`. Send back via `X-Refresh-Token` header.

### Device ID

- A UUID identifying the current device/session.
- **Web:** Frontend generates once, stores in `localStorage` + plain cookie (`NAME_DEVICEID_CLIENT`, default `deviceId`).
- **Mobile:** App generates once, stores in `SecureStorage`, sends via `X-Device-ID` header on every request.

### Route Access Levels

| Decorator | Meaning |
|---|---|
| `@Public()` | No JWT required |
| *(no decorator)* | JWT required |
| `@AdminOnly()` | JWT required + `roleName` must equal `NAME_ROLE_ADMIN` |
| `@SkipAdminOnly()` | Overrides `@AdminOnly()` on the class — any authenticated user |

---

## 4 Standard Response Format

Every successful response is wrapped by `TransformInterceptor`:

```json
{
  "statusCode": 200,
  "message": "Human-readable result message",
  "code": "SUCCESS",
  "data": { ... },
  "timestamp": "2024-06-04T10:00:00.000Z",
  "path": "/api/v1/auth/login"
}
```

Some endpoints include extra top-level fields (e.g. `skipOtp` on the profile update request). These are passed through as-is alongside the standard fields.

---

## 5 Error Handling

All errors use a consistent structure produced by `AllExceptionsFilter`:

```json
{
  "statusCode": 409,
  "message": "Email already in use",
  "code": "CONFLICT",
  "timestamp": "2024-06-04T10:00:00.000Z",
  "path": "/api/v1/auth/register"
}
```

### Error Codes

| `code` | HTTP Status | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | DTO field validation failed |
| `HTTP_EXCEPTION` | 400 | Generic NestJS HttpException |
| `UNAUTHORIZED` | 401 | Missing or invalid JWT / token |
| `FORBIDDEN` | 403 | Authenticated but insufficient role |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Business rule violation (duplicate, OTP error, etc.) |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error |
| `HTTP_EXCEPTION` | 429 | Rate limit exceeded (`ThrottlerGuard`) |

### Validation Error Detail

When the code is `HTTP_EXCEPTION` and validation fails, a `details` array is included:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "code": "HTTP_EXCEPTION",
  "details": [
    { "field": "email", "messages": ["Email must be a valid email address"] },
    { "field": "password", "messages": ["Password must be at least 6 characters long"] }
  ]
}
```

---

## 6 Data Models

### User

| Field | Type | Notes |
|---|---|---|
| `id` | String | UUID, primary key |
| `email` | String | unique |
| `userName` | String | unique |
| `googleId` | String? | unique, null for local accounts |
| `accountType` | String | `"local"` or `"google"` |
| `avatarUrl` | String? | Supabase Storage URL |
| `backgroundUrl` | String? | Supabase Storage URL |
| `description` | String? | bio / about |
| `password` | String? | bcrypt hash; null for Google accounts |
| `roleId` | String | foreign key → Role |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

### Role

| Field | Type | Notes |
|---|---|---|
| `id` | String | UUID, primary key |
| `roleName` | String | unique (e.g. `"ADMIN"`, `"USER"`) |
| `description` | String? | |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

### Session

| Field | Type | Notes |
|---|---|---|
| `id` | String | UUID, primary key |
| `userId` | String | foreign key → User (cascade delete) |
| `deviceId` | String | client-generated UUID |
| `refreshToken` | String | unique JWT |
| `expiresAt` | DateTime | |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

Unique constraint: `(userId, deviceId)` — each user/device pair has exactly one session.

### File

| Field | Type | Notes |
|---|---|---|
| `id` | String | UUID, primary key |
| `fileName` | String | stored name (UUID-based) |
| `originalName` | String | original upload filename |
| `path` | String | unique, Supabase storage path |
| `mimeType` | String | |
| `size` | Int? | bytes |
| `bucket` | String | Supabase bucket name |
| `userId` | String? | foreign key → User (cascade delete) |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

### PendingRegistration *(temporary — auto-cleaned)*

| Field | Type | Notes |
|---|---|---|
| `id` | String | UUID, primary key |
| `email` | String | unique |
| `userName` | String | unique |
| `passwordHash` | String | bcrypt hash |
| `otpHash` | String | bcrypt hash of the OTP |
| `otpExpiresAt` | DateTime | |
| `attemptCount` | Int | default 0; locked when ≥ `OTP_MAX_ATTEMPTS` |
| `resendAfter` | DateTime? | cooldown deadline |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

### PendingUserUpdate *(temporary — auto-cleaned)*

| Field | Type | Notes |
|---|---|---|
| `id` | String | UUID, primary key |
| `userId` | String | unique |
| `newEmail` | String? | |
| `newUserName` | String? | |
| `newDescription` | String? | |
| `otpHash` | String | bcrypt hash of the OTP |
| `otpExpiresAt` | DateTime | |
| `attemptCount` | Int | default 0 |
| `resendAfter` | DateTime? | |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

---

## 7 Auth Endpoints

Base path: `/auth`

---

### POST `/auth/register`

Start account registration. Saves to `PendingRegistration` and sends a 6-digit OTP to the email. The actual `User` row is **not created** until the OTP is verified.

**Access:** Public

**Request Body:**

```json
{
  "userName": "johndoe",
  "email": "john@example.com",
  "password": "secret123"
}
```

| Field | Type | Rules |
|---|---|---|
| `userName` | string | 3–100 chars, letters / numbers / underscore only |
| `email` | string | valid email, 5–100 chars |
| `password` | string | 6–50 chars |

**Success `201`:**

```json
{
  "statusCode": 201,
  "message": "Registration initiated successfully. Please verify the OTP sent to your email to complete registration.",
  "data": {
    "otpExpire": "5m"
  }
}
```

**Errors:**

| Status | Code | Reason |
|---|---|---|
| 400 | `HTTP_EXCEPTION` | Validation failed |
| 409 | `CONFLICT` | Email or username already registered |
| 409 | `CONFLICT` | OTP resend cooldown not expired |

---

### POST `/auth/verify-register-otp`

Verify the OTP sent during registration. Creates the `User` record and removes the `PendingRegistration` entry.

**Access:** Public

**Request Body:**

```json
{
  "email": "john@example.com",
  "otp": "123456"
}
```

| Field | Type | Rules |
|---|---|---|
| `email` | string | valid email |
| `otp` | string | digits only |

**Success `200`:**

```json
{
  "statusCode": 200,
  "message": "Account verified and created successfully",
  "data": {
    "id": "uuid",
    "email": "john@example.com",
    "userName": "johndoe",
    "accountType": "local",
    "roleName": "USER",
    "avatarUrl": null,
    "backgroundUrl": null,
    "description": null,
    "googleId": null,
    "roleId": "uuid"
  }
}
```

**Errors:**

| Status | Code | Reason |
|---|---|---|
| 409 | `CONFLICT` | No pending registration for this email |
| 409 | `CONFLICT` | OTP expired |
| 409 | `CONFLICT` | OTP locked — too many wrong attempts |
| 409 | `CONFLICT` | Invalid OTP — N attempt(s) remaining |

---

### POST `/auth/resend-register-otp`

Resend a new OTP for an in-progress registration. Subject to `OTP_RESEND_COOLDOWN`.

**Access:** Public

**Request Body:**

```json
{
  "email": "john@example.com"
}
```

**Success `200`:**

```json
{
  "statusCode": 200,
  "message": "OTP has been resent successfully to your email",
  "data": {
    "otpExpire": "5m"
  }
}
```

**Errors:**

| Status | Code | Reason |
|---|---|---|
| 409 | `CONFLICT` | No pending registration found |
| 409 | `CONFLICT` | Resend cooldown not expired (wait N seconds) |

---

### POST `/auth/login`

Authenticate with email or username + password.

**Access:** Public (runs `LocalAuthGuard` to validate credentials before the handler)

**Device ID — required, client-type dependent:**

| Client | How to send |
|---|---|
| Web | Cookie `deviceId=<uuid>` (set before calling) |
| Mobile | Header `X-Device-ID: <uuid>` |

**Request Body:**

```json
{
  "userNameOrEmail": "johndoe",
  "password": "secret123"
}
```

| Field | Type | Rules |
|---|---|---|
| `userNameOrEmail` | string | 3–100 chars |
| `password` | string | 6–50 chars |

**Success `200` — Web:**

Sets cookie: `refreshToken=<jwt>; HttpOnly; Secure; SameSite=Lax`

```json
{
  "statusCode": 200,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJhbGci...",
    "user": { "id": "uuid", "email": "john@example.com", ... }
  }
}
```

**Success `200` — Mobile (`X-Client-Type: mobile`):**

No cookie is set. `refreshToken` is returned in the body — store it in `SecureStorage`.

```json
{
  "statusCode": 200,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci...",
    "user": { "id": "uuid", "email": "john@example.com", ... }
  }
}
```

**Errors:**

| Status | Code | Reason |
|---|---|---|
| 400 | `HTTP_EXCEPTION` | Missing device ID (cookie or header) |
| 401 | `UNAUTHORIZED` | Wrong credentials |

---

### POST `/auth/refresh`

Exchange the refresh token for a new access token. Rotates the refresh token (old token is replaced with a new one).

**Access:** Public

**Required — client-type dependent:**

| Client | How to send refresh token |
|---|---|
| Web | Cookie `refreshToken=<jwt>` (auto-sent by browser) |
| Mobile | Header `X-Refresh-Token: <jwt>` |

**Success `200` — Web:**

Sets new cookie: `refreshToken=<new_jwt>; HttpOnly; Secure; SameSite=Lax`

```json
{
  "statusCode": 200,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "eyJhbGci...",
    "user": { ... }
  }
}
```

**Success `200` — Mobile (`X-Client-Type: mobile`):**

No cookie is set. New `refreshToken` is returned in body — update the stored value in `SecureStorage`.

```json
{
  "statusCode": 200,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci...",
    "user": { ... }
  }
}
```

**Errors:**

| Status | Code | Reason |
|---|---|---|
| 401 | `UNAUTHORIZED` | Refresh token missing (cookie or header) |
| 401 | `UNAUTHORIZED` | Refresh token invalid or expired |
| 401 | `UNAUTHORIZED` | Session not found (logged out on another device) |

---

### GET `/auth/profile`

Return the profile of the currently authenticated user (decoded from the access token — no DB call).

**Access:** JWT required

**Success `200`:**

```json
{
  "statusCode": 200,
  "message": "Profile retrieved successfully",
  "data": {
    "user": {
      "id": "uuid",
      "email": "john@example.com",
      "userName": "johndoe",
      "accountType": "local",
      "roleName": "USER",
      "avatarUrl": null,
      "backgroundUrl": null,
      "description": null,
      "googleId": null,
      "roleId": "uuid"
    }
  }
}
```

**Errors:**

| Status | Code | Reason |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing or expired access token |

---

### POST `/auth/change-password/send-otp`

**Step 1 of password reset.** Sends a 6-digit OTP to the given email. Intentionally returns success even when the email does not exist (prevents email enumeration).

Only local accounts (`accountType = "local"`) can reset passwords — Google accounts must sign in via Google.

**Access:** Public

**Request Body:**

```json
{
  "email": "john@example.com"
}
```

**Success `200`:**

```json
{
  "statusCode": 200,
  "message": "If your email exists in our system, you will receive an OTP to reset your password. Please check your email.",
  "data": {
    "otpExpire": "5m"
  }
}
```

**Errors:**

| Status | Code | Reason |
|---|---|---|
| 409 | `CONFLICT` | Account uses Google login — password reset not available |
| 409 | `CONFLICT` | OTP resend cooldown not expired |

---

### POST `/auth/change-password/verify-otp`

**Step 2 of password reset.** Verify the OTP. On success, a short-lived JWT reset token is issued.

**Access:** Public

**Request Body:**

```json
{
  "email": "john@example.com",
  "otp": "123456"
}
```

**Success `200` — Web:**

Sets cookie: `resetPassToken=<jwt>; HttpOnly; Secure; SameSite=Lax`

```json
{
  "statusCode": 200,
  "message": "OTP verified. Use the reset token to set your new password within 10m.",
  "data": {
    "expiresIn": "10m"
  }
}
```

**Success `200` — Mobile (`X-Client-Type: mobile`):**

No cookie is set. `resetToken` is returned in body — store it temporarily and send back via `X-Reset-Token` header on the next step.

```json
{
  "statusCode": 200,
  "message": "OTP verified. Use the reset token to set your new password within 10m.",
  "data": {
    "expiresIn": "10m",
    "resetToken": "eyJhbGci..."
  }
}
```

**Errors:**

| Status | Code | Reason |
|---|---|---|
| 409 | `CONFLICT` | No OTP request found for this email |
| 409 | `CONFLICT` | OTP expired |
| 409 | `CONFLICT` | Too many wrong attempts — OTP locked |
| 409 | `CONFLICT` | Invalid OTP — N attempt(s) remaining |

---

### POST `/auth/change-password/reset`

**Step 3 of password reset.** Verifies the reset token, sets the new password, deletes **all active sessions** (force-logout from every device), and clears the reset token.

**Access:** Public

**Required reset token — client-type dependent:**

| Client | How to send |
|---|---|
| Web | Cookie `resetPassToken=<jwt>` (auto-sent by browser) |
| Mobile | Header `X-Reset-Token: <jwt>` (from step 2 response body) |

**Request Body:**

```json
{
  "newPassword": "newSecret123"
}
```

| Field | Type | Rules |
|---|---|---|
| `newPassword` | string | 6–50 chars |

**Success `200`:**

Web: clears the `resetPassToken` cookie. Mobile: no cookie operation.

```json
{
  "statusCode": 200,
  "message": "Password changed successfully.",
  "data": {
    "id": "uuid",
    "email": "john@example.com",
    "userName": "johndoe",
    "accountType": "local",
    "roleName": "USER",
    "avatarUrl": null,
    "backgroundUrl": null,
    "description": null,
    "googleId": null,
    "roleId": "uuid"
  }
}
```

**Errors:**

| Status | Code | Reason |
|---|---|---|
| 401 | `UNAUTHORIZED` | Reset token missing (cookie or header) |
| 409 | `CONFLICT` | Reset token invalid or expired |
| 404 | `NOT_FOUND` | User not found |

---

### POST `/auth/logout`

Logout from the current device. Deletes the session from the DB and clears the refresh token.

**Access:** JWT required

**Required refresh token — client-type dependent:**

| Client | How to send |
|---|---|
| Web | Cookie `refreshToken=<jwt>` (auto-sent by browser) |
| Mobile | Header `X-Refresh-Token: <jwt>` |

**Success `200`:**

Web: clears the `refreshToken` cookie. Mobile: no cookie operation.

```json
{
  "statusCode": 200,
  "message": "Logout successful",
  "data": { "result": true }
}
```

**Errors:**

| Status | Code | Reason |
|---|---|---|
| 401 | `UNAUTHORIZED` | Refresh token missing (cookie or header) |

---

### POST `/auth/logout-all`

Logout from all devices. Deletes every session for this user and clears the refresh token cookie.

**Access:** JWT required

**Success `200`:**

```json
{
  "statusCode": 200,
  "message": "All sessions logged out successfully",
  "data": { "result": true }
}
```

---

### GET `/auth/google`

Initiate Google OAuth2 login. Redirects the browser to Google's consent screen.

**Access:** Public

**Required Cookie (must be set by frontend before calling):**

```
deviceId=<uuid>
```

**Behavior:** Browser redirect — no JSON response is returned from this endpoint.

---

### GET `/auth/google/callback`

OAuth2 callback invoked by Google after the user approves the consent screen. Sets the refresh token cookie and redirects to the frontend with base64-encoded login data.

**Access:** Public (handled by `GoogleAuthGuard`)

**Redirect target:**

```
{URL_CLIENT}/google/callback?data=<base64>
```

Decoded `data` payload:

```json
{
  "accessToken": "eyJhbGci...",
  "user": {
    "id": "uuid",
    "email": "john@gmail.com",
    "userName": "johndoe",
    "accountType": "google",
    "roleName": "USER",
    ...
  }
}
```

**Errors:** If the `deviceId` cookie is missing when this callback fires, the request fails with `400 Bad Request`.

---

## 8 Users Endpoints

Base path: `/users`

**Default access:** `@AdminOnly()` — requires JWT + admin role for every endpoint, unless noted below.

---

### POST `/users`

Create a new user directly. Bypasses the OTP registration flow — intended for admin user management.

**Access:** Admin only

**Request Body:**

```json
{
  "email": "user@example.com",
  "userName": "johndoe",
  "password": "secret123",
  "roleName": "USER"
}
```

| Field | Type | Rules |
|---|---|---|
| `email` | string | valid email |
| `userName` | string | 6–50 chars |
| `password` | string | 6–100 chars |
| `roleName` | string? | optional; defaults to `USER` role if omitted |

**Success `200`:**

```json
{
  "statusCode": 200,
  "message": "User created successfully",
  "data": { ... }
}
```

---

### GET `/users`

Get a paginated, filterable list of users.

**Access:** Admin only

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | integer ≥ 1 | `1` | Page number |
| `limit` | integer 1–100 | `10` | Items per page |
| `sortBy` | string | `createdAt` | `id` · `email` · `userName` · `roleName` · `description` · `createdAt` · `updatedAt` |
| `order` | string | `desc` | `asc` or `desc` |
| `search` | string | — | Partial match on email or username |
| `roleName` | string | — | Exact match on role name |

**Success `200`:**

```json
{
  "statusCode": 200,
  "message": "Users retrieved successfully",
  "data": {
    "items": [
      {
        "id": "uuid",
        "email": "john@example.com",
        "userName": "johndoe",
        "accountType": "local",
        "roleName": "USER",
        "avatarUrl": null,
        "backgroundUrl": null,
        "description": null
      }
    ],
    "total": 42,
    "page": 1,
    "limit": 10,
    "totalPages": 5
  }
}
```

---

### GET `/users/:id`

Get a single user by UUID.

**Access:** Admin only

**Path Param:** `id` — user UUID

**Success `200`:**

```json
{
  "statusCode": 200,
  "message": "User retrieved successfully",
  "data": {
    "id": "uuid",
    "email": "john@example.com",
    "userName": "johndoe",
    "accountType": "local",
    "roleName": "USER",
    "avatarUrl": null,
    "backgroundUrl": null,
    "description": null,
    "googleId": null,
    "roleId": "uuid"
  }
}
```

**Errors:**

| Status | Code | Reason |
|---|---|---|
| 404 | `NOT_FOUND` | User not found |

---

### PATCH `/users/:id`

Admin-only direct profile update. Does **not** require OTP — for admin user management only.

**Access:** Admin only

**Path Param:** `id` — user UUID

**Request Body:** All fields optional.

```json
{
  "email": "newemail@example.com",
  "userName": "newname",
  "description": "Updated bio"
}
```

**Success `200`:**

```json
{
  "statusCode": 200,
  "message": "User updated successfully",
  "data": { ... }
}
```

---

### POST `/users/update-profile/request-otp`

**Step 1 of OTP-protected profile update.** Any authenticated user can update their own profile. Admins can update any user's profile.

**Access:** Any authenticated user (`@SkipAdminOnly()`)

**Behavior by change type:**

| What changed | OTP sent to | Immediate? |
|---|---|---|
| Only `description` | — | Yes — no OTP needed |
| `email` (with or without others) | The **new** email | No |
| Only `userName` | Current email | No |

> Google accounts (`accountType = "google"`) cannot change `email` or `userName`.

**Request Body:** All fields optional; at least one must be present.

```json
{
  "email": "newemail@example.com",
  "userName": "newusername",
  "description": "My new bio"
}
```

| Field | Type | Rules |
|---|---|---|
| `email` | string? | valid email |
| `userName` | string? | 6–50 chars |
| `description` | string? | max 500 chars |

**Success `200` — description-only (immediate update):**

```json
{
  "statusCode": 200,
  "message": "Description updated successfully",
  "skipOtp": true,
  "data": { ... }
}
```

**Success `200` — email or username change (OTP required):**

```json
{
  "statusCode": 200,
  "message": "OTP sent to your email. Please verify to complete the update.",
  "skipOtp": false,
  "data": {
    "targetEmail": "ne***@example.com",
    "changes": ["email", "userName"]
  }
}
```

> `targetEmail` is masked (e.g. `ne***@example.com`) to avoid exposing the new address before verification.

**Errors:**

| Status | Code | Reason |
|---|---|---|
| 403 | `FORBIDDEN` | Non-admin updating another user's profile |
| 409 | `CONFLICT` | Email or username already in use |
| 409 | `CONFLICT` | Google account cannot change email/username |
| 409 | `CONFLICT` | OTP cooldown not expired |

---

### POST `/users/update-profile/verify-otp`

**Step 2 of OTP-protected profile update.** Verifies the OTP and applies the pending changes atomically.

**Access:** Any authenticated user (`@SkipAdminOnly()`)

**Request Body:**

```json
{
  "otp": "123456"
}
```

**Success `200`:**

```json
{
  "statusCode": 200,
  "message": "Profile updated successfully",
  "data": {
    "id": "uuid",
    "email": "newemail@example.com",
    "userName": "newusername",
    "accountType": "local",
    "roleName": "USER",
    "avatarUrl": null,
    "backgroundUrl": null,
    "description": "My new bio",
    "googleId": null,
    "roleId": "uuid"
  }
}
```

**Errors:**

| Status | Code | Reason |
|---|---|---|
| 409 | `CONFLICT` | No pending update found |
| 409 | `CONFLICT` | OTP expired |
| 409 | `CONFLICT` | Too many wrong attempts — OTP locked |
| 409 | `CONFLICT` | Invalid OTP — N attempt(s) remaining |

---

### PATCH `/users/role/:id`

Change a user's role.

**Access:** Admin only

**Path Param:** `id` — user UUID

**Request Body:**

```json
{
  "roleNameOrId": "ADMIN"
}
```

Accepts either the role's `roleName` (e.g. `"ADMIN"`) or its UUID.

**Success `200`:**

```json
{
  "statusCode": 200,
  "message": "User role updated successfully",
  "data": { ... }
}
```

---

### PATCH `/users/avatarorbg/:id`

Upload and set a user's avatar or background image. File is stored in Supabase Storage.

**Access:** Self or Admin (`@SkipAdminOnly()`)

**Path Param:** `id` — user UUID

**Content-Type:** `multipart/form-data`

**Form Fields:**

| Field | Type | Rules |
|---|---|---|
| `imgProfile` | file | JPEG · JPG · PNG · WEBP · GIF, max **10 MB** |
| `typeImgProfile` | string | `"avatar"` or `"background"` |

**Success `200`:**

```json
{
  "statusCode": 200,
  "message": "User avatar updated successfully",
  "data": { ... }
}
```

**Errors:**

| Status | Code | Reason |
|---|---|---|
| 400 | `VALIDATION_ERROR` | No file uploaded |
| 400 | `VALIDATION_ERROR` | Unsupported file type |
| 400 | `VALIDATION_ERROR` | File exceeds 10 MB |
| 403 | `FORBIDDEN` | Non-admin updating another user's image |

---

### DELETE `/users/:id`

Delete a user and all associated data (sessions, files — cascade delete).

**Access:** Admin only

**Path Param:** `id` — user UUID

**Success `200`:**

```json
{
  "statusCode": 200,
  "message": "User deleted successfully",
  "data": { ... }
}
```

---

## 9 Role Endpoints

Base path: `/role`

**Default access:** `@AdminOnly()` — all endpoints require JWT + admin role.

---

### POST `/role`

Create a new role.

**Access:** Admin only

**Request Body:**

```json
{
  "roleName": "MODERATOR",
  "description": "Can moderate content"
}
```

| Field | Type | Rules |
|---|---|---|
| `roleName` | string | 2–50 chars, required |
| `description` | string? | optional |

**Success `201`:**

```json
{
  "statusCode": 201,
  "message": "Role created successfully",
  "data": {
    "id": "uuid",
    "roleName": "MODERATOR",
    "description": "Can moderate content",
    "createdAt": "2024-06-04T10:00:00.000Z",
    "updatedAt": "2024-06-04T10:00:00.000Z"
  }
}
```

---

### GET `/role`

Get a paginated list of roles.

**Access:** Admin only

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | integer ≥ 1 | `1` | Page number |
| `limit` | integer 1–100 | `10` | Items per page |
| `sortBy` | string | `createdAt` | `id` · `createdAt` · `updatedAt` · etc. |
| `order` | string | `desc` | `asc` or `desc` |
| `search` | string | — | Partial match on role name |

**Success `200`:**

```json
{
  "statusCode": 200,
  "message": "Roles retrieved successfully",
  "data": {
    "items": [
      { "id": "uuid", "roleName": "ADMIN", "description": null, "createdAt": "...", "updatedAt": "..." },
      { "id": "uuid", "roleName": "USER",  "description": null, "createdAt": "...", "updatedAt": "..." }
    ],
    "total": 2,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

---

### GET `/role/:id`

Get a single role by UUID.

**Access:** Admin only

**Path Param:** `id` — role UUID

**Success `200`:**

```json
{
  "statusCode": 200,
  "message": "Role retrieved successfully",
  "data": {
    "id": "uuid",
    "roleName": "USER",
    "description": null,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

**Errors:**

| Status | Code | Reason |
|---|---|---|
| 404 | `NOT_FOUND` | Role not found |

---

### PATCH `/role/:id`

Update a role's name or description.

**Access:** Admin only

**Path Param:** `id` — role UUID

**Request Body:** All fields optional.

```json
{
  "roleName": "SUPER_ADMIN",
  "description": "Full system access"
}
```

**Success `200`:**

```json
{
  "statusCode": 200,
  "message": "Role updated successfully",
  "data": { ... }
}
```

---

### DELETE `/role/:id`

Delete a role. Fails if any users are still assigned to it.

**Access:** Admin only

**Path Param:** `id` — role UUID

**Success `200`:**

```json
{
  "statusCode": 200,
  "message": "Role deleted successfully",
  "data": { ... }
}
```

---

## 10 Email Endpoints

Base path: `/email`

> These endpoints exist for **development and SMTP testing only**. Remove or secure them before going to production.

---

### POST `/email/test-email`

Send a plain test email to verify SMTP configuration.

**Access:** Public

**Request Body:**

```json
{
  "toEmail": "test@example.com"
}
```

**Success `200`:**

```json
{
  "message": "Test email sent successfully"
}
```

---

### POST `/email/send-register-otp`

Manually trigger a registration OTP email without going through the full registration flow.

**Access:** Public

**Request Body:**

```json
{
  "email": "test@example.com",
  "userName": "johndoe",
  "otp": "123456",
  "expireText": "5 minutes"
}
```

**Success `200`:**

```json
{
  "message": "Registration OTP email sent successfully"
}
```

---

## 11 Complete Env Reference

```env
# ── App ─────────────────────────────────────────────────────────────────────
APP_NAME="BaseAuth"
HOST="localhost"
PORT=8080
MODE="development"
GLOBAL_PREFIX="api"
VERSION="1"
URL_CLIENT="http://localhost:3000"
EXPORT_SWAGGER_API_JSON=true

# ── Database ─────────────────────────────────────────────────────────────────
DATABASE_URL="prisma+postgres://accelerate.prisma-data.net/?api_key="

# ── CORS ─────────────────────────────────────────────────────────────────────
LIST_ORIGIN_CORS="http://localhost:3000,http://localhost:5173"

# ── Seeding ───────────────────────────────────────────────────────────────────
SEED_DB=true
CLEAR_DB=false
NAME_ROLE_ADMIN="ADMIN"
NAME_ROLE_USER="USER"
DEFAULT_PASSWORD="123456"

# ── Security ──────────────────────────────────────────────────────────────────
BCRYPT_SALT_ROUNDS=10

# ── JWT ───────────────────────────────────────────────────────────────────────
JWT_ACCESS_TOKEN_SECRET=""
JWT_ACCESS_EXPIRE="10m"
JWT_REFRESH_TOKEN_SECRET=""
JWT_REFRESH_EXPIRE="1d"
NAME_COOKIE_REFRESH_TOKEN_BROWSER="refreshToken"
NUMBER_OF_DEVICES=2

# ── Password Reset ────────────────────────────────────────────────────────────
JWT_PASSWORD_RESET_SECRET=""
NAME_COOKIE_RESET_PASS_TOKEN="resetPassToken"
PASSWORD_RESET_EXPIRE="10m"

# ── OTP ───────────────────────────────────────────────────────────────────────
OTP_EXPIRE=5m
OTP_LENGTH=6
OTP_MAX_ATTEMPTS=5
OTP_RESEND_COOLDOWN=60s

# ── Device ID ─────────────────────────────────────────────────────────────────
NAME_DEVICEID_CLIENT="deviceId"

# ── Google OAuth2 ─────────────────────────────────────────────────────────────
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_CALLBACK_URL="http://localhost:8080/api/v1/auth/google/callback"

# ── Email (SMTP) ──────────────────────────────────────────────────────────────
EMAIL_HOST="smtp.gmail.com"
EMAIL_PORT=587
EMAIL_AUTH_USER=""
EMAIL_AUTH_PASS=""
EMAIL_FROM=""
SUPPORT_EMAIL=""

# ── Supabase Storage ──────────────────────────────────────────────────────────
SUPABASE_URL="https://xxxxx.supabase.co"
SUPABASE_KEY=""
SUPABASE_NAME_BUCKET=""

# ── Redis (Upstash) ───────────────────────────────────────────────────────────
UPSTASH_REDIS_REST_URL="https://your-url.upstash.io"
UPSTASH_REDIS_REST_TOKEN=""
```

---

## 12 Rate Limiting

This API uses [`@nestjs/throttler`](https://docs.nestjs.com/security/rate-limiting) v6 to protect endpoints from brute-force attacks and email spam.

### Global defaults

`ThrottlerGuard` is registered globally — every route is throttled by the `default` throttler unless explicitly overridden.

| Throttler name | Window (TTL) | Max requests |
|---|---|---|
| `default` | 60 s | 100 |
| `short-term` | 10 s | 20 |
| `medium-term` | 300 s | 500 |
| `long-term` | 3600 s | 1000 |

### Auth endpoint overrides

Sensitive auth endpoints override the `default` with the stricter `short-term` throttler:

| Endpoint | Limit |
|---|---|
| `POST /auth/register` | 5 / 10s |
| `POST /auth/verify-register-otp` | 5 / 10s |
| `POST /auth/resend-register-otp` | 3 / 10s |
| `POST /auth/login` | 5 / 10s |
| `POST /auth/change-password/send-otp` | 3 / 10s |
| `POST /auth/change-password/verify-otp` | 5 / 10s |
| `POST /auth/change-password/reset` | 5 / 10s |

### Rate limit exceeded — `429 Too Many Requests`

```json
{
  "statusCode": 429,
  "message": "You have made 6 requests. Rate limit exceeded, Try again in 10 seconds.",
  "code": "HTTP_EXCEPTION",
  "timestamp": "2026-06-05T10:00:00.000Z",
  "path": "/api/v1/auth/login"
}
```

Tracking is **per client IP**. Behind a reverse proxy, configure `trust proxy` in `main.ts` so the real client IP is used instead of the proxy's IP.

---

## Quick Reference

### Auth Flow Summary

```
Registration
  POST /auth/register                        → sends OTP to email
  POST /auth/verify-register-otp             → creates account

Login
  POST /auth/login                           → accessToken (body) + refreshToken (cookie)

Token refresh
  POST /auth/refresh                         → new accessToken + rotated refreshToken cookie

Password reset
  POST /auth/change-password/send-otp        → sends OTP
  POST /auth/change-password/verify-otp      → sets resetPassToken cookie
  POST /auth/change-password/reset           → updates password, clears cookie, kills all sessions

Logout
  POST /auth/logout                          → clears current device session
  POST /auth/logout-all                      → clears all sessions

Google OAuth
  GET  /auth/google                          → redirect to Google consent screen
  GET  /auth/google/callback                 → redirect to frontend with token
```

### Cookie Summary (Web only)

| Cookie | Set by | Cleared by | httpOnly |
|---|---|---|---|
| `refreshToken` | `POST /auth/login`, `POST /auth/refresh` | `POST /auth/logout`, `POST /auth/logout-all` | Yes |
| `resetPassToken` | `POST /auth/change-password/verify-otp` | `POST /auth/change-password/reset` | Yes |
| `deviceId` | Frontend (before login) | Frontend manages it | No |

### Multi-Client Header Summary

| Header | Direction | Used by | Purpose |
|---|---|---|---|
| `X-Client-Type: mobile` | Request | Mobile/native apps | Declare client type; omit for web (default) |
| `X-Device-ID: <uuid>` | Request | Mobile | Device identifier (replaces `deviceId` cookie) |
| `X-Refresh-Token: <jwt>` | Request | Mobile | Send refresh token (replaces cookie on refresh/logout) |
| `X-Reset-Token: <jwt>` | Request | Mobile | Send reset token (replaces cookie on password reset step 3) |

### Endpoint Access Summary

| Endpoint | Method | Access | Rate Limit |
|---|---|---|---|
| `/auth/register` | POST | Public | 5 / 10s |
| `/auth/verify-register-otp` | POST | Public | 5 / 10s |
| `/auth/resend-register-otp` | POST | Public | 3 / 10s |
| `/auth/login` | POST | Public | 5 / 10s |
| `/auth/refresh` | POST | Public | 100 / 60s |
| `/auth/profile` | GET | JWT | 100 / 60s |
| `/auth/change-password/send-otp` | POST | Public | 3 / 10s |
| `/auth/change-password/verify-otp` | POST | Public | 5 / 10s |
| `/auth/change-password/reset` | POST | Public | 5 / 10s |
| `/auth/logout` | POST | JWT | 100 / 60s |
| `/auth/logout-all` | POST | JWT | 100 / 60s |
| `/auth/google` | GET | Public | 100 / 60s |
| `/auth/google/callback` | GET | Public | 100 / 60s |
| `/users` | POST | Admin |
| `/users` | GET | Admin |
| `/users/:id` | GET | Admin |
| `/users/:id` | PATCH | Admin |
| `/users/update-profile/request-otp` | POST | JWT (any) |
| `/users/update-profile/verify-otp` | POST | JWT (any) |
| `/users/role/:id` | PATCH | Admin |
| `/users/avatarorbg/:id` | PATCH | JWT (self or admin) |
| `/users/:id` | DELETE | Admin |
| `/role` | POST | Admin |
| `/role` | GET | Admin |
| `/role/:id` | GET | Admin |
| `/role/:id` | PATCH | Admin |
| `/role/:id` | DELETE | Admin |
| `/email/test-email` | POST | Public |
| `/email/send-register-otp` | POST | Public |

---

## 13 Code Documentation (Compodoc)

This project uses [`@compodoc/compodoc`](https://compodoc.app/) to generate static HTML documentation from TypeScript source code (modules, controllers, services, DTOs, guards, decorators, etc.).

### Installation

Already included as a dev dependency:

```bash
pnpm install
```

### Generate documentation

```bash
npx @compodoc/compodoc -p tsconfig.json -s
```

| Flag | Meaning |
|---|---|
| `-p tsconfig.json` | Point to the TypeScript config |
| `-s` | Serve the docs locally after generating (default port `8080`) |
| `--port 8888` | Change the serve port (optional) |
| `--output documentation` | Output folder (default `documentation/`) |

Or add a script to `package.json` for convenience:

```json
"scripts": {
  "doc": "compodoc -p tsconfig.json",
  "doc:serve": "compodoc -p tsconfig.json -s --port 8888"
}
```

Then run:

```bash
pnpm doc:serve
```

### Output

Generated files go to the `/documentation` folder at project root. This folder is listed in `.gitignore` and is **not committed to the repository**.

Open `documentation/index.html` in a browser, or use the `-s` flag to serve it automatically.

### What is documented

| Source | Documented as |
|---|---|
| `*.module.ts` | Modules |
| `*.controller.ts` | Controllers & routes |
| `*.service.ts` | Services & methods |
| `*.dto.ts` | DTOs & validation rules |
| `*.guard.ts` | Guards |
| `*.decorator.ts` | Custom decorators |
| `*.interceptor.ts` | Interceptors |
| `*.filter.ts` | Exception filters |

JSDoc comments (`/** ... */`) on classes and methods are rendered as descriptions in the generated docs.
