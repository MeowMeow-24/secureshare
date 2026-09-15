import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog


# ฟังก์ชันกลางไว้บันทึก audit log — router ไหนอยากบันทึกว่า user ทำอะไร ก็เรียกอันนี้
# ไม่ต้องเขียน insert เองทุกที่ ลดโอกาสลืมบันทึก log
async def log_action(
    db: AsyncSession,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    user_id: uuid.UUID | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    metadata: dict | None = None,
) -> AuditLog:
    entry = AuditLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        ip_address=ip_address,
        user_agent=user_agent,
        metadata_=metadata,
    )
    db.add(entry)
    await db.flush()
    return entry
