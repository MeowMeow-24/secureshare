import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


# ระดับสิทธิ์ของผู้ใช้ในระบบ
# admin = ผู้ดูแลระบบ เห็น/จัดการได้ทุกอย่าง
# user = พนักงานทั่วไป อัปโหลด/แชร์ไฟล์ของตัวเองได้
# viewer = ดูได้อย่างเดียว ไม่มีสิทธิ์อัปโหลด (เช่น รับลิงก์แชร์มาดู)
class UserRole(str, enum.Enum):
    ADMIN = "admin"
    USER = "user"
    VIEWER = "viewer"


# ประเภทเหตุการณ์ที่ระบบความปลอดภัยจะคอยจับตาดู (ใช้ในหน้า Security Center)
class SecurityEventType(str, enum.Enum):
    BULK_DOWNLOAD = "BULK_DOWNLOAD"  # โหลดไฟล์รัวๆ ในเวลาสั้นๆ น่าสงสัย
    EXPIRED_LINK_ACCESS = "EXPIRED_LINK_ACCESS"  # มีคนพยายามเข้าลิงก์ที่หมดอายุแล้ว
    SIGNATURE_VERIFICATION_FAILED = "SIGNATURE_VERIFICATION_FAILED"  # เช็คลายเซ็นไฟล์แล้วไม่ผ่าน
    UNAUTHORIZED_ACCESS = "UNAUTHORIZED_ACCESS"  # พยายามเข้าถึงของที่ไม่มีสิทธิ์
    RBAC_VIOLATION = "RBAC_VIOLATION"  # ทำอะไรที่ role ตัวเองไม่ได้รับอนุญาต


class SecuritySeverity(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class ShareMode(str, enum.Enum):
    OPEN = "open"  # แชร์เข้าแผนกแล้วเห็น/โหลดได้เลยทันที
    CLAIM_REQUIRED = "claim_required"  # ต้องขอสิทธิ์ก่อน แล้วรอเจ้าของไฟล์อนุมัติถึงจะโหลดได้


# ระดับสิทธิ์ที่ให้กับคนในแผนกที่ถูกแชร์ไฟล์ให้
# ตอนนี้มีแค่ "ดูได้" กับ "โหลดได้" — ยังไม่มี "แก้ไข" เพราะการแก้ไขไฟล์ที่เข้ารหัสไว้พร้อมกันหลายคน
# เป็นฟีเจอร์ใหญ่ (ต้องมี document server แยกต่างหาก) เกินสโคปตอนนี้ ถ้าจะเพิ่มทีหลังค่อยว่ากัน
class SharePermission(str, enum.Enum):
    VIEW_ONLY = "view_only"  # เห็นแค่ว่ามีไฟล์นี้ถูกแชร์มา (ชื่อไฟล์/ผู้ส่ง) แต่โหลดตัวไฟล์จริงไม่ได้
    DOWNLOAD = "download"    # โหลดไฟล์จริงได้ (พฤติกรรมเดิมก่อนมีฟีเจอร์นี้)


# สถานะคำขอเข้าถึงไฟล์ (ใช้กับโหมด CLAIM_REQUIRED เท่านั้น)
class ClaimStatus(str, enum.Enum):
    PENDING = "pending"    # ขอไปแล้ว รอเจ้าของไฟล์อนุมัติ
    APPROVED = "approved"  # เจ้าของไฟล์อนุมัติแล้ว โหลดได้
    REJECTED = "rejected"  # เจ้าของไฟล์ปฏิเสธ


# ตารางแผนก - ใช้คู่กับ department_id ใน User เพื่อจัดกลุ่มว่าใครอยู่แผนกไหน
class Department(Base):
    __tablename__ = "departments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    members: Mapped[list["User"]] = relationship(back_populates="department")
    shares: Mapped[list["DepartmentShare"]] = relationship(back_populates="department")


# บันทึกว่าไฟล์ไหนถูกแชร์เข้าแผนกไหน โดยใคร และแชร์แบบไหน (open / ต้องกดรับ)
class DepartmentShare(Base):
    __tablename__ = "department_shares"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    file_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("files.id"), nullable=False)
    department_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("departments.id"), nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    mode: Mapped[ShareMode] = mapped_column(
        Enum(ShareMode, values_callable=lambda x: [e.value for e in x]),
        default=ShareMode.OPEN,
        nullable=False,
    )
    permission: Mapped[SharePermission] = mapped_column(
        Enum(SharePermission, values_callable=lambda x: [e.value for e in x]),
        default=SharePermission.DOWNLOAD,
        nullable=False,
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)  # false = ถูกเพิกถอนแล้ว (revoke)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    file: Mapped["File"] = relationship()
    department: Mapped["Department"] = relationship(back_populates="shares")
    creator: Mapped["User"] = relationship()
    claims: Mapped[list["DepartmentShareClaim"]] = relationship(back_populates="share")


# ใครกด "รับไฟล์" ในโหมด claim_required แล้วบ้าง กันไม่ให้คนแผนกอื่นแอบโหลด
# และกันคนคนเดียวกดรับซ้ำ (unique constraint ด้านล่าง)
# คำขอเข้าถึงไฟล์ของแต่ละคนในแผนก (โหมด CLAIM_REQUIRED) — ต้องรอเจ้าของไฟล์อนุมัติก่อนถึงจะโหลดได้
# ใช้ตาราง unique constraint กันคนเดียวขอซ้ำหลายรอบ (ขอครั้งแรกแล้วรอผลอย่างเดียว)
class DepartmentShareClaim(Base):
    __tablename__ = "department_share_claims"
    __table_args__ = (UniqueConstraint("department_share_id", "user_id", name="uq_claim_share_user"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    department_share_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("department_shares.id"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    status: Mapped[ClaimStatus] = mapped_column(
        Enum(ClaimStatus, values_callable=lambda x: [e.value for e in x]),
        default=ClaimStatus.PENDING,
        nullable=False,
    )
    claimed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)  # ตอนอนุมัติ/ปฏิเสธ

    share: Mapped["DepartmentShare"] = relationship(back_populates="claims")
    user: Mapped["User"] = relationship()


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)  # เก็บ hash เท่านั้น ห้ามเก็บ plain text
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, values_callable=lambda x: [e.value for e in x]),
        default=UserRole.USER,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)  # false = แอดมินระงับบัญชีนี้ไว้ ล็อกอินไม่ได้
    public_key_pem: Mapped[str | None] = mapped_column(Text, nullable=True)  # กุญแจสาธารณะ ใช้ตรวจลายเซ็นไฟล์
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    department: Mapped["Department | None"] = relationship(back_populates="members")
    files: Mapped[list["File"]] = relationship(back_populates="owner")
    audit_logs: Mapped[list["AuditLog"]] = relationship(back_populates="user")
    security_events: Mapped[list["SecurityEvent"]] = relationship(back_populates="user")


# ไฟล์ที่ผู้ใช้อัปโหลด — เก็บเฉพาะ path ของไฟล์ที่เข้ารหัสแล้วบนดิสก์ ไม่เก็บไฟล์จริงในนี้
# โฟลเดอร์ไว้จัดกลุ่มไฟล์ของตัวเอง (เหมือนโฟลเดอร์ใน Windows Explorer / Google Drive)
# ทำเป็น self-referential tree ผ่าน parent_id — parent_id เป็น None แปลว่าอยู่ที่ระดับบนสุด (root)
# ตอนนี้ทำแค่ฝั่ง "ไฟล์ของฉัน" เท่านั้น ไม่รวมไฟล์ที่แชร์เข้าแผนก เพราะ department share
# เป็นความสัมพันธ์แบบแชร์ไฟล์ทีละไฟล์ ไม่ใช่พื้นที่เก็บไฟล์จริงที่จะมีโฟลเดอร์ซ้อนได้
class Folder(Base):
    __tablename__ = "folders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("folders.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner: Mapped["User"] = relationship()
    parent: Mapped["Folder | None"] = relationship(remote_side=[id])


class File(Base):
    __tablename__ = "files"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    folder_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("folders.id"), nullable=True)
    original_filename: Mapped[str] = mapped_column(String(512), nullable=False)
    encrypted_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(128), default="application/octet-stream")
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256_hash: Mapped[str] = mapped_column(String(64), nullable=False)  # ใช้เช็คว่าไฟล์โดนแก้ไขระหว่างทางไหม
    digital_signature: Mapped[str | None] = mapped_column(Text, nullable=True)
    encryption_iv: Mapped[str] = mapped_column(String(32), nullable=False)  # ค่าที่ใช้ตอนเข้ารหัส AES
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)  # ลบแบบ soft delete ไม่ลบแถวจริง
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner: Mapped["User"] = relationship(back_populates="files")
    folder: Mapped["Folder | None"] = relationship()
    share_links: Mapped[list["ShareLink"]] = relationship(back_populates="file")


# ลิงก์แชร์แบบสาธารณะ (ไม่ต้องล็อกอินก็เข้าได้ ถ้ามี token ถูก)
class ShareLink(Base):
    __tablename__ = "share_links"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    file_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("files.id"), nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_one_time: Mapped[bool] = mapped_column(Boolean, default=False)  # true = โหลดได้แค่ครั้งเดียวแล้วลิงก์ตาย
    downloaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    download_count: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    file: Mapped["File"] = relationship(back_populates="share_links")


# log การกระทำทุกอย่างในระบบ (ใครทำอะไร เมื่อไหร่ จาก IP ไหน) แก้ไขไม่ได้ ดูย้อนหลังได้อย่างเดียว
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    resource_type: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    user: Mapped["User | None"] = relationship(back_populates="audit_logs")


# เหตุการณ์ผิดปกติที่ระบบตรวจจับได้เอง เช่น โหลดไฟล์ถี่ผิดปกติ, ลายเซ็นไฟล์ไม่ตรง
class SecurityEvent(Base):
    __tablename__ = "security_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_type: Mapped[SecurityEventType] = mapped_column(
        Enum(SecurityEventType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        index=True,
    )
    severity: Mapped[SecuritySeverity] = mapped_column(
        Enum(SecuritySeverity, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    is_resolved: Mapped[bool] = mapped_column(Boolean, default=False)  # แอดมินกดว่า "จัดการแล้ว" หรือยัง
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    user: Mapped["User | None"] = relationship(back_populates="security_events")


# แจ้งเตือนในระบบ เช่น "มีไฟล์แชร์มาที่แผนกคุณ"
class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
