# API Specification — Secure File Sharing Platform

**Base URL:** `http://localhost:8000`  
**API Prefix:** `/api/v1`  
**Version:** 1.0.0  
**Auth:** Bearer JWT (`Authorization: Bearer <token>`)

Interactive docs: [Swagger UI](http://localhost:8000/docs) · [ReDoc](http://localhost:8000/redoc)

---

## Table of Contents

1. [Authentication & RBAC](#1-authentication--rbac)
2. [Files](#2-files)
3. [Share Links & QR](#3-share-links--qr)
4. [Audit Log](#4-audit-log)
5. [Security Event Center](#5-security-event-center)
6. [Notifications](#6-notifications)
7. [Health Check](#7-health-check)
8. [Error Codes](#8-error-codes)
9. [Security Event Rules](#9-security-event-rules)
10. [RBAC Matrix](#10-rbac-matrix)

---

## 1. Authentication & RBAC

### POST `/api/v1/auth/register`

Register a new user account.

| | |
|---|---|
| **Auth** | None |
| **Roles** | Public |

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "securepass123",
  "full_name": "John Doe",
  "role": "user"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| email | string | ✓ | Valid email, unique |
| password | string | ✓ | Min 8 characters |
| full_name | string | ✓ | Display name |
| role | enum | ✗ | `user` (default) or `viewer`. Cannot self-register as `admin` |

**Response `201`:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "full_name": "John Doe",
  "role": "user",
  "is_active": true,
  "created_at": "2026-07-01T10:00:00Z"
}
```

**Errors:** `409` email exists · `403` admin self-registration

---

### POST `/api/v1/auth/login`

Authenticate and receive JWT access token.

| | |
|---|---|
| **Auth** | None |

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "securepass123"
}
```

**Response `200`:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

**Errors:** `401` invalid credentials · `403` account disabled

---

### GET `/api/v1/auth/me`

Get current authenticated user profile.

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Roles** | All authenticated |

**Response `200`:** Same shape as register response.

---

### GET `/api/v1/auth/users`

List all users (admin only).

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Roles** | `admin` |

**Query Params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| limit | int | 50 | Max results |
| offset | int | 0 | Pagination offset |

**Response `200`:**

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "admin@example.com",
    "full_name": "Admin User",
    "role": "admin",
    "is_active": true,
    "created_at": "2026-07-01T10:00:00Z"
  }
]
```

---

### PATCH `/api/v1/auth/users/{user_id}`

Update user role, name, or active status.

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Roles** | `admin` |

**Request Body:**

```json
{
  "full_name": "Updated Name",
  "role": "viewer",
  "is_active": false
}
```

All fields optional.

**Response `200`:** Updated user object.

**Errors:** `404` user not found · `403` insufficient permissions

---

## 2. Files

All file endpoints use **AES-256-GCM** encryption at rest and **SHA-256** integrity hashing.

### POST `/api/v1/files/upload`

Upload and encrypt a file.

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Roles** | `admin`, `user` (not `viewer`) |
| **Content-Type** | `multipart/form-data` |

**Form Fields:**

| Field | Type | Required |
|-------|------|----------|
| file | binary | ✓ |

**Processing Pipeline:**

```
Upload → SHA-256 hash → AES-256-GCM encrypt → Store encrypted blob → Audit log
```

**Response `201`:**

```json
{
  "file": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "original_filename": "report.pdf",
    "mime_type": "application/pdf",
    "file_size": 204800,
    "sha256_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "has_signature": false,
    "created_at": "2026-07-01T10:05:00Z"
  },
  "message": "File uploaded and encrypted successfully"
}
```

**Errors:** `403` viewer role · `413` file too large

---

### GET `/api/v1/files/`

List files owned by current user. Admins see all files.

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Roles** | `admin`, `user` |

**Response `200`:** Array of file objects (without signature).

---

### GET `/api/v1/files/{file_id}`

Get file metadata including digital signature.

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Roles** | Owner or `admin` |

**Response `200`:**

```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "original_filename": "report.pdf",
  "mime_type": "application/pdf",
  "file_size": 204800,
  "sha256_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "has_signature": true,
  "digital_signature": "base64-encoded-rsa-pss-signature",
  "created_at": "2026-07-01T10:05:00Z"
}
```

---

### GET `/api/v1/files/{file_id}/download`

Download and decrypt a file.

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Roles** | Owner or `admin` |

**Processing Pipeline:**

```
Fetch encrypted blob → Verify digital signature → AES decrypt → Audit log → Bulk download check
```

**Response `200`:** Binary file stream with `Content-Disposition: attachment`.

**Side Effects:**
- Creates `FILE_DOWNLOAD` audit log entry
- Triggers `BULK_DOWNLOAD` security event if threshold exceeded (>100 downloads in 2 min)
- Triggers `SIGNATURE_VERIFICATION_FAILED` if signature invalid

**Errors:** `404` not found · `403` access denied · `422` signature verification failed

---

### DELETE `/api/v1/files/{file_id}`

Soft-delete a file.

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Roles** | Owner or `admin` |

**Response `200`:**

```json
{ "message": "File deleted successfully" }
```

---

## 3. Share Links & QR

### POST `/api/v1/share/{file_id}/links`

Create a share link with optional expiration and one-time download.

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Roles** | File owner |

**Request Body:**

```json
{
  "expires_at": "2026-07-02T10:00:00Z",
  "is_one_time": true
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| expires_at | datetime (ISO 8601) | ✗ | Null = never expires |
| is_one_time | boolean | ✗ | Default `false` |

**Response `201`:**

```json
{
  "id": "770e8400-e29b-41d4-a716-446655440002",
  "token": "xK9mP2nQ7rS4tU6vW8yZ1aB3cD5eF7gH",
  "share_url": "http://localhost:5173/share/xK9mP2nQ7rS4tU6vW8yZ1aB3cD5eF7gH",
  "qr_code_base64": "iVBORw0KGgoAAAANSUhEUgAA...",
  "expires_at": "2026-07-02T10:00:00Z",
  "is_one_time": true,
  "is_active": true,
  "download_count": 0,
  "created_at": "2026-07-01T10:10:00Z"
}
```

---

### GET `/api/v1/share/links`

List share links created by current user.

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Roles** | `admin`, `user` |

**Response `200`:** Array of share link objects (includes QR base64).

---

### GET `/api/v1/share/public/{token}/info`

Get share link metadata (no auth required).

| | |
|---|---|
| **Auth** | None |
| **Roles** | Public |

**Response `200`:**

```json
{
  "filename": "report.pdf",
  "expires_at": "2026-07-02T10:00:00Z",
  "is_one_time": true,
  "is_expired": false,
  "is_available": true
}
```

---

### GET `/api/v1/share/public/{token}/download`

Download file via share link (no auth required).

| | |
|---|---|
| **Auth** | None |
| **Roles** | Public (valid token) |

**Validation Checks (in order):**

1. Token exists and link is active
2. Link not expired → else `410` + `EXPIRED_LINK_ACCESS` event
3. One-time link not already used → else `410`
4. Digital signature valid → else `422` + `SIGNATURE_VERIFICATION_FAILED` event

**Response `200`:** Binary file stream.

**Side Effects:**
- Increments `download_count`
- Deactivates link if one-time
- Creates `SHARE_LINK_DOWNLOAD` audit log
- Sends download notification to file owner

**Errors:** `404` not found · `410` expired/used · `422` signature failed

---

### DELETE `/api/v1/share/links/{link_id}`

Revoke a share link.

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Roles** | Link creator |

**Response `200`:**

```json
{ "message": "Share link revoked" }
```

---

## 4. Audit Log

### GET `/api/v1/audit/logs`

Retrieve audit log entries.

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Roles** | `admin` (all logs) · `user` (own logs only) |

**Query Params:**

| Param | Type | Default |
|-------|------|---------|
| limit | int | 50 |
| offset | int | 0 |

**Response `200`:**

```json
[
  {
    "id": "880e8400-e29b-41d4-a716-446655440003",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "action": "FILE_UPLOAD",
    "resource_type": "file",
    "resource_id": "660e8400-e29b-41d4-a716-446655440001",
    "ip_address": "192.168.1.100",
    "metadata": {
      "filename": "report.pdf",
      "size": 204800,
      "sha256": "e3b0c442..."
    },
    "created_at": "2026-07-01T10:05:00Z"
  }
]
```

**Known Actions:**

| Action | Trigger |
|--------|---------|
| `FILE_UPLOAD` | File uploaded |
| `FILE_DOWNLOAD` | Authenticated download |
| `FILE_DELETE` | File soft-deleted |
| `SHARE_LINK_CREATE` | Share link created |
| `SHARE_LINK_DOWNLOAD` | Public link download |

---

## 5. Security Event Center

### GET `/api/v1/security/dashboard`

Aggregated security statistics for admin dashboard.

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Roles** | `admin` |

**Response `200`:**

```json
{
  "total_events": 42,
  "unresolved_events": 5,
  "events_by_severity": {
    "HIGH": 12,
    "MEDIUM": 20,
    "LOW": 10
  },
  "events_by_type": {
    "BULK_DOWNLOAD": 3,
    "EXPIRED_LINK_ACCESS": 15,
    "SIGNATURE_VERIFICATION_FAILED": 2
  },
  "recent_events": [ /* last 10 SecurityEvent objects */ ]
}
```

---

### GET `/api/v1/security/events`

List security events.

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Roles** | `admin` |

**Query Params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| limit | int | 50 | Max results |
| offset | int | 0 | Pagination |
| unresolved_only | bool | false | Filter unresolved |

**Response `200`:**

```json
[
  {
    "id": "990e8400-e29b-41d4-a716-446655440004",
    "event_type": "BULK_DOWNLOAD",
    "severity": "HIGH",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "description": "User downloaded 105 files within 2 minutes",
    "metadata": {
      "download_count": 105,
      "window_seconds": 120,
      "threshold": 100
    },
    "ip_address": "192.168.1.100",
    "is_resolved": false,
    "created_at": "2026-07-01T11:00:00Z"
  }
]
```

---

### PATCH `/api/v1/security/events/{event_id}`

Mark a security event as resolved.

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Roles** | `admin` |

**Request Body:**

```json
{ "is_resolved": true }
```

**Response `200`:** Updated security event object.

---

## 6. Notifications

### GET `/api/v1/notifications`

List notifications for current user.

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Roles** | All authenticated |

**Response `200`:**

```json
[
  {
    "id": "aa0e8400-e29b-41d4-a716-446655440005",
    "title": "File Downloaded",
    "message": "Your file \"report.pdf\" was downloaded by 203.0.113.50",
    "is_read": false,
    "metadata": {
      "filename": "report.pdf",
      "downloader": "203.0.113.50"
    },
    "created_at": "2026-07-01T10:30:00Z"
  }
]
```

---

### PATCH `/api/v1/notifications/{notification_id}/read`

Mark notification as read.

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Roles** | Owner |

**Response `200`:**

```json
{ "message": "Notification marked as read" }
```

---

## 7. Health Check

### GET `/health`

| | |
|---|---|
| **Auth** | None |

**Response `200`:**

```json
{
  "status": "ok",
  "service": "secure-file-sharing-platform"
}
```

---

## 8. Error Codes

| HTTP Code | Meaning | Example |
|-----------|---------|---------|
| 400 | Bad request | Invalid input |
| 401 | Unauthorized | Missing/invalid JWT |
| 403 | Forbidden | RBAC violation |
| 404 | Not found | File/link/user not found |
| 409 | Conflict | Email already registered |
| 410 | Gone | Expired or used share link |
| 422 | Unprocessable | Signature verification failed |
| 500 | Server error | Internal failure |

**Error Response Format:**

```json
{ "detail": "Human-readable error message" }
```

---

## 9. Security Event Rules

| Event Type | Trigger Condition | Severity | Auto-Action |
|------------|-------------------|----------|-------------|
| `BULK_DOWNLOAD` | User downloads ≥100 files within 120 seconds | HIGH | Log + Dashboard alert |
| `EXPIRED_LINK_ACCESS` | GET download on expired share link | MEDIUM | Log + Dashboard alert |
| `SIGNATURE_VERIFICATION_FAILED` | RSA-PSS signature mismatch on download | HIGH | Block download + Dashboard alert |
| `UNAUTHORIZED_ACCESS` | Invalid JWT or inactive account | MEDIUM | Reject request |
| `RBAC_VIOLATION` | Role lacks required permission | MEDIUM | Reject request |

**Configurable via environment:**

```env
BULK_DOWNLOAD_THRESHOLD=100
BULK_DOWNLOAD_WINDOW_SECONDS=120
```

---

## 10. RBAC Matrix

| Endpoint | admin | user | viewer | public |
|----------|:-----:|:----:|:------:|:------:|
| POST /auth/register | — | — | — | ✓ |
| POST /auth/login | — | — | — | ✓ |
| GET /auth/me | ✓ | ✓ | ✓ | — |
| GET /auth/users | ✓ | — | — | — |
| PATCH /auth/users/{id} | ✓ | — | — | — |
| POST /files/upload | ✓ | ✓ | — | — |
| GET /files/ | ✓ (all) | ✓ (own) | — | — |
| GET /files/{id} | ✓ | ✓ (own) | — | — |
| GET /files/{id}/download | ✓ | ✓ (own) | — | — |
| DELETE /files/{id} | ✓ | ✓ (own) | — | — |
| POST /share/{id}/links | ✓ | ✓ (own) | — | — |
| GET /share/links | ✓ | ✓ | — | — |
| GET /share/public/{token}/info | — | — | — | ✓ |
| GET /share/public/{token}/download | — | — | — | ✓ |
| DELETE /share/links/{id} | ✓ | ✓ (own) | — | — |
| GET /audit/logs | ✓ (all) | ✓ (own) | — | — |
| GET /security/dashboard | ✓ | — | — | — |
| GET /security/events | ✓ | — | — | — |
| PATCH /security/events/{id} | ✓ | — | — | — |
| GET /notifications | ✓ | ✓ | ✓ | — |
| PATCH /notifications/{id}/read | ✓ | ✓ | ✓ | — |

---

## Crypto Reference

| Operation | Algorithm | Details |
|-----------|-----------|---------|
| File encryption | AES-256-GCM | 12-byte random IV per file |
| Integrity hash | SHA-256 | Computed on plaintext before encryption |
| Digital signature | RSA-2048 + PSS + SHA-256 | Signs the SHA-256 hash |
| Password hashing | bcrypt | Via passlib |
| JWT | HS256 | Configurable expiry (default 60 min) |
| Share token | `secrets.token_urlsafe(32)` | 256-bit entropy |
