import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models import SecurityEventType, SecuritySeverity, ShareMode, SharePermission, UserRole


# ── Auth ──────────────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=1, max_length=255)
    role: UserRole = UserRole.USER
    department_id: uuid.UUID | None = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    department_id: uuid.UUID | None = None
    department_name: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None
    department_id: uuid.UUID | None = None
    clear_department: bool = False


# ── Files ─────────────────────────────────────────────────────────────────

class FileResponse(BaseModel):
    id: uuid.UUID
    original_filename: str
    mime_type: str
    file_size: int
    sha256_hash: str
    has_signature: bool
    folder_id: uuid.UUID | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class FileDetailResponse(FileResponse):
    digital_signature: str | None = None


class FileUploadResponse(BaseModel):
    file: FileResponse
    message: str = "File uploaded and encrypted successfully"


# ── Folders ───────────────────────────────────────────────────────────────

class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    parent_id: uuid.UUID | None = None


class FolderResponse(BaseModel):
    id: uuid.UUID
    name: str
    parent_id: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ย้ายไฟล์ไปโฟลเดอร์อื่น (ลากวางในหน้า "ไฟล์ของฉัน") — folder_id เป็น None แปลว่าย้ายออกมาไว้ที่ root
class FileMove(BaseModel):
    folder_id: uuid.UUID | None = None


# ── Departments ───────────────────────────────────────────────────────────

class DepartmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None


class DepartmentResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    member_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Department Shares ────────────────────────────────────────────────────

class DepartmentShareCreate(BaseModel):
    department_id: uuid.UUID
    mode: ShareMode = ShareMode.OPEN
    permission: SharePermission = SharePermission.DOWNLOAD
    expires_at: datetime | None = None


class DepartmentShareResponse(BaseModel):
    id: uuid.UUID
    file_id: uuid.UUID
    filename: str
    department_id: uuid.UUID
    department_name: str
    created_by_name: str
    mode: ShareMode
    permission: SharePermission
    expires_at: datetime | None
    is_active: bool
    claim_count: int = 0  # จำนวนคำขอทั้งหมด (ทุกสถานะ)
    pending_count: int = 0  # จำนวนที่ยังรอเจ้าของไฟล์ตัดสินใจ — เจ้าของไฟล์ใช้ตัวนี้เช็คว่ามีคนรออนุมัติไหม
    my_claim_status: str | None = None  # pending/approved/rejected/None(ยังไม่เคยขอ) — ฝั่งผู้รับใช้ตัวนี้
    created_at: datetime

    model_config = {"from_attributes": True}


class ClaimResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str
    user_email: str
    status: str
    claimed_at: datetime
    decided_at: datetime | None

    model_config = {"from_attributes": True}


# ── Share Links ───────────────────────────────────────────────────────────

class ShareLinkCreate(BaseModel):
    expires_at: datetime | None = None
    is_one_time: bool = False


class ShareLinkResponse(BaseModel):
    id: uuid.UUID
    token: str
    share_url: str
    qr_code_base64: str
    expires_at: datetime | None
    is_one_time: bool
    is_active: bool
    download_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Audit Logs ────────────────────────────────────────────────────────────

class AuditLogResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID | None
    user_email: str | None = None
    user_full_name: str | None = None
    action: str
    resource_type: str
    resource_id: str | None
    ip_address: str | None
    metadata: dict | None = Field(alias="metadata_", default=None)
    created_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


# ── Security Events ───────────────────────────────────────────────────────

class SecurityEventResponse(BaseModel):
    id: uuid.UUID
    event_type: SecurityEventType
    severity: SecuritySeverity
    user_id: uuid.UUID | None
    description: str
    metadata: dict | None = Field(alias="metadata_", default=None)
    ip_address: str | None
    is_resolved: bool
    created_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


class SecurityEventResolve(BaseModel):
    is_resolved: bool = True


class SecurityDashboardStats(BaseModel):
    total_events: int
    unresolved_events: int
    events_by_severity: dict[str, int]
    events_by_type: dict[str, int]
    recent_events: list[SecurityEventResponse]


# ── Notifications ─────────────────────────────────────────────────────────

class NotificationResponse(BaseModel):
    id: uuid.UUID
    title: str
    message: str
    is_read: bool
    metadata: dict | None = Field(alias="metadata_", default=None)
    created_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


# ── Generic ───────────────────────────────────────────────────────────────

class MessageResponse(BaseModel):
    message: str


class ErrorResponse(BaseModel):
    detail: str
