import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import AuditLog, SecurityEvent, SecurityEventType, SecuritySeverity

# ไฟล์นี้คือส่วนตรวจจับความผิดปกติแบบง่ายๆ (ไม่ได้ใช้ ML อะไร แค่นับจำนวน/เงื่อนไขตรงๆ)
# ตรวจแล้วถ้าเข้าเงื่อนไขก็สร้าง SecurityEvent ไว้ให้แอดมินไปดูต่อในหน้า Security Center


# ฟังก์ชันกลางไว้สร้าง security event บันทึกลง DB
async def create_security_event(
    db: AsyncSession,
    event_type: SecurityEventType,
    severity: SecuritySeverity,
    description: str,
    user_id: uuid.UUID | None = None,
    ip_address: str | None = None,
    metadata: dict | None = None,
) -> SecurityEvent:
    event = SecurityEvent(
        event_type=event_type,
        severity=severity,
        user_id=user_id,
        description=description,
        ip_address=ip_address,
        metadata_=metadata,
    )
    db.add(event)
    await db.flush()
    return event


# เช็คว่า user คนนี้โหลดไฟล์ถี่ผิดปกติในช่วงเวลาสั้นๆ ไหม (ตั้งค่า threshold/window ได้ใน config)
# เรียกใช้ทุกครั้งหลังโหลดไฟล์เสร็จ ใน files.py
async def check_bulk_download(
    db: AsyncSession,
    user_id: uuid.UUID,
    ip_address: str | None = None,
) -> SecurityEvent | None:
    window_start = datetime.now(timezone.utc) - timedelta(seconds=settings.bulk_download_window_seconds)
    result = await db.execute(
        select(func.count(AuditLog.id)).where(
            AuditLog.user_id == user_id,
            AuditLog.action == "FILE_DOWNLOAD",
            AuditLog.created_at >= window_start,
        )
    )
    count = result.scalar() or 0
    if count >= settings.bulk_download_threshold:
        return await create_security_event(
            db,
            event_type=SecurityEventType.BULK_DOWNLOAD,
            severity=SecuritySeverity.HIGH,
            description=f"ผู้ใช้ดาวน์โหลดไฟล์ {count} ไฟล์ ภายใน {settings.bulk_download_window_seconds // 60} นาที",
            user_id=user_id,
            ip_address=ip_address,
            metadata={
                "download_count": count,
                "window_seconds": settings.bulk_download_window_seconds,
                "threshold": settings.bulk_download_threshold,
            },
        )
    return None


# มีคนพยายามเข้าลิงก์แชร์ที่หมดอายุไปแล้ว
async def record_expired_link_access(
    db: AsyncSession,
    token: str,
    ip_address: str | None = None,
) -> SecurityEvent:
    return await create_security_event(
        db,
        event_type=SecurityEventType.EXPIRED_LINK_ACCESS,
        severity=SecuritySeverity.MEDIUM,
        description=f"พยายามเข้าลิงก์แชร์ที่หมดอายุแล้ว: {token[:8]}...",
        ip_address=ip_address,
        metadata={"token_prefix": token[:8]},
    )


# ตรวจลายเซ็นดิจิทัลแล้วไม่ผ่าน แปลว่าไฟล์อาจโดนแก้ไข/สลับระหว่างทาง
async def record_signature_failure(
    db: AsyncSession,
    file_id: uuid.UUID,
    user_id: uuid.UUID | None = None,
    ip_address: str | None = None,
) -> SecurityEvent:
    return await create_security_event(
        db,
        event_type=SecurityEventType.SIGNATURE_VERIFICATION_FAILED,
        severity=SecuritySeverity.HIGH,
        description=f"ตรวจสอบลายเซ็นดิจิทัลของไฟล์ {file_id} ไม่ผ่าน",
        user_id=user_id,
        ip_address=ip_address,
        metadata={"file_id": str(file_id)},
    )
