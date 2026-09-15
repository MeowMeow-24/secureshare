# Secure File Sharing Platform

End-to-end encrypted file sharing with RBAC, security monitoring, and anomaly detection.

## Features

- Login & JWT authentication
- Role-Based Access Control (admin, user, viewer)
- AES-256-GCM file encryption
- SHA-256 integrity hashing
- RSA digital signatures
- One-time download links
- Expiring share links
- QR code sharing
- Audit logging
- Download notifications
- Security Dashboard & Event Center

## Tech Stack

| Layer    | Technology                          |
| -------- | ----------------------------------- |
| Backend  | FastAPI, SQLAlchemy, Alembic        |
| Frontend | React, TypeScript, Vite, Tailwind   |
| Database | PostgreSQL 16                       |
| Crypto   | Python `cryptography` library       |

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local frontend dev)
- Python 3.11+ (for local backend dev)

### With Docker

```bash
docker compose up --build
```

The database container starts empty — you need to create the tables, then seed the first admin account (there's no public sign-up, accounts are always created by an admin, so the very first one has to be seeded directly):

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend python -m scripts.seed_admin
```

This prints a default login (`admin@example.com` / `ChangeMe123!`). Log in with it, then create real accounts from the "จัดการผู้ใช้งาน" (User Management) page and change the seed password.

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- Swagger UI: http://localhost:8000/docs
- API Spec: [docs/API_SPEC.md](docs/API_SPEC.md)

### Local Development

**Backend:**

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
python -m scripts.seed_admin   # creates the first admin account (needed once)
uvicorn app.main:app --reload
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

**Database only:**

```bash
docker compose up db -d
```

## Default Roles

| Role   | Permissions                                      |
| ------ | ------------------------------------------------ |
| admin  | Full access, security dashboard, user management |
| user   | Upload, share, download own files                |
| viewer | Download shared files only                       |

## Project Structure

```
secure-file-sharing-platform/
├── backend/
│   ├── app/
│   │   ├── models/          # SQLAlchemy models
│   │   ├── schemas/         # Pydantic schemas
│   │   ├── routers/         # API route handlers
│   │   ├── services/        # Business logic
│   │   └── middleware/      # Auth & audit middleware
│   └── alembic/             # DB migrations
├── frontend/
│   └── src/
│       ├── pages/           # Route pages
│       ├── components/      # UI components
│       └── services/        # API client
└── docs/
    └── API_SPEC.md          # Full API documentation
```

## Security Event Rules

| Event                          | Trigger                              | Severity |
| ------------------------------ | ------------------------------------ | -------- |
| BULK_DOWNLOAD                  | >100 downloads in 2 minutes          | HIGH     |
| EXPIRED_LINK_ACCESS            | Access after link expiration         | MEDIUM   |
| SIGNATURE_VERIFICATION_FAILED  | Digital signature mismatch           | HIGH     |
