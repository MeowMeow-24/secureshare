import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.middleware.auth import get_current_user, require_roles
from app.models import AuditLog, SecurityEvent, User, UserRole
from app.schemas import (
    AuditLogResponse,
    MessageResponse,
    NotificationResponse,
    SecurityDashboardStats,
    SecurityEventResolve,
    SecurityEventResponse,
)

router = APIRouter(tags=["Security & Audit"])

# route หน้า audit log / security dashboard / notification
# หน้า security dashboard, security events, และ audit log ทั้งหมดดูได้เฉพาะแอดมินเท่านั้น


@router.get("/audit/logs", response_model=list[AuditLogResponse])
async def list_audit_logs(
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
):
    query = (
        select(AuditLog)
        .options(selectinload(AuditLog.user))
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    # แก้ไขตามที่ตกลงกันใหม่: บันทึกการใช้งานดูได้เฉพาะแอดมินเท่านั้น (เดิมเคยให้ user ทั่วไปดู log ของตัวเองได้ด้วย)
    result = await db.execute(query)
    logs = result.scalars().all()

    responses = []
    for log in logs:
        item = AuditLogResponse.model_validate(log)
        if log.user is not None:
            item.user_email = log.user.email
            item.user_full_name = log.user.full_name
        responses.append(item)
    return responses


@router.get("/security/events", response_model=list[SecurityEventResponse])
async def list_security_events(
    limit: int = 50,
    offset: int = 0,
    unresolved_only: bool = False,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    query = select(SecurityEvent).order_by(SecurityEvent.created_at.desc()).limit(limit).offset(offset)
    if unresolved_only:
        query = query.where(SecurityEvent.is_resolved == False)  # noqa: E712
    result = await db.execute(query)
    return result.scalars().all()


@router.patch("/security/events/{event_id}", response_model=SecurityEventResponse)
async def resolve_security_event(
    event_id: uuid.UUID,
    body: SecurityEventResolve,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    result = await db.execute(select(SecurityEvent).where(SecurityEvent.id == event_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    event.is_resolved = body.is_resolved
    # ถ้ากดว่ายังไม่ resolve ก็เคลียร์เวลาทิ้ง ไม่งั้นจะมี resolved_at ค้างอยู่ทั้งที่ is_resolved = false
    if body.is_resolved:
        event.resolved_at = datetime.now(timezone.utc)
    else:
        event.resolved_at = None
    await db.flush()
    await db.refresh(event)
    return event


@router.get("/security/dashboard", response_model=SecurityDashboardStats)
async def security_dashboard(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    total = await db.execute(select(func.count(SecurityEvent.id)))
    unresolved = await db.execute(
        select(func.count(SecurityEvent.id)).where(SecurityEvent.is_resolved == False)  # noqa: E712
    )

    severity_result = await db.execute(
        select(SecurityEvent.severity, func.count(SecurityEvent.id)).group_by(SecurityEvent.severity)
    )
    type_result = await db.execute(
        select(SecurityEvent.event_type, func.count(SecurityEvent.id)).group_by(SecurityEvent.event_type)
    )
    recent_result = await db.execute(
        select(SecurityEvent).order_by(SecurityEvent.created_at.desc()).limit(10)
    )

    return SecurityDashboardStats(
        total_events=total.scalar() or 0,
        unresolved_events=unresolved.scalar() or 0,
        events_by_severity={str(s.value): c for s, c in severity_result.all()},
        events_by_type={str(t.value): c for t, c in type_result.all()},
        recent_events=recent_result.scalars().all(),
    )


@router.get("/notifications", response_model=list[NotificationResponse])
async def list_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models import Notification

    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
    )
    return result.scalars().all()


@router.patch("/notifications/{notification_id}/read", response_model=MessageResponse)
async def mark_notification_read(
    notification_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models import Notification

    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
    )
    notification = result.scalar_one_or_none()
    if not notification:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    notification.is_read = True
    return MessageResponse(message="Notification marked as read")
