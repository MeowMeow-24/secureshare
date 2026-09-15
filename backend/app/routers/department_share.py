import uuid
from datetime import datetime, timezone

import aiofiles
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models import ClaimStatus, Department, DepartmentShare, DepartmentShareClaim
from app.models import File as FileModel
from app.models import ShareMode, SharePermission, User
from app.schemas import ClaimResponse, DepartmentShareCreate, DepartmentShareResponse, MessageResponse
from app.services.audit import log_action
from app.utils import get_client_ip
from app.services.crypto.encryption import decrypt_file
from app.services.notification import notify_download

router = APIRouter(prefix="/department-shares", tags=["Department Shares"])

# แชร์ไฟล์แบบ "เข้าแผนก" ต่างจาก share.py (ลิงก์สาธารณะ) ตรงที่ต้องล็อกอินและอยู่แผนกที่ถูกแชร์ให้เท่านั้น


async def _to_response(db: AsyncSession, share: DepartmentShare, viewer: User) -> DepartmentShareResponse:
    claim_count_result = await db.execute(
        select(func.count(DepartmentShareClaim.id)).where(DepartmentShareClaim.department_share_id == share.id)
    )
    pending_count_result = await db.execute(
        select(func.count(DepartmentShareClaim.id)).where(
            DepartmentShareClaim.department_share_id == share.id,
            DepartmentShareClaim.status == ClaimStatus.PENDING,
        )
    )

    my_claim_status = None
    if share.mode == ShareMode.CLAIM_REQUIRED:
        mine = await db.execute(
            select(DepartmentShareClaim).where(
                DepartmentShareClaim.department_share_id == share.id,
                DepartmentShareClaim.user_id == viewer.id,
            )
        )
        my_claim = mine.scalar_one_or_none()
        if my_claim:
            my_claim_status = my_claim.status.value

    # หาชื่อคนสร้าง share — ปกติต้องมีเสมอ แต่กันไว้เผื่อ creator หาไม่เจอ (เช่น ถูกลบไปแล้ว)
    if share.creator:
        created_by_name = share.creator.full_name
    else:
        created_by_name = "unknown"

    return DepartmentShareResponse(
        id=share.id,
        file_id=share.file_id,
        filename=share.file.original_filename,
        department_id=share.department_id,
        department_name=share.department.name,
        created_by_name=created_by_name,
        mode=share.mode,
        permission=share.permission,
        expires_at=share.expires_at,
        is_active=share.is_active,
        claim_count=claim_count_result.scalar_one(),
        pending_count=pending_count_result.scalar_one(),
        my_claim_status=my_claim_status,
        created_at=share.created_at,
    )


# เช็คว่า share หมดอายุหรือยัง (ถ้าไม่ได้ตั้ง expires_at ไว้ ก็ถือว่าไม่มีวันหมดอายุ)
def _is_expired(share: DepartmentShare) -> bool:
    return share.expires_at is not None and share.expires_at < datetime.now(timezone.utc)


@router.post("/files/{file_id}", response_model=DepartmentShareResponse, status_code=status.HTTP_201_CREATED)
async def create_department_share(
    file_id: uuid.UUID,
    body: DepartmentShareCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    file_result = await db.execute(select(FileModel).where(FileModel.id == file_id, FileModel.is_deleted == False))  # noqa: E712
    db_file = file_result.scalar_one_or_none()
    if not db_file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    # ต้องเป็นเจ้าของไฟล์เท่านั้นถึงจะแชร์ไฟล์นี้ต่อได้
    if db_file.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    dept = await db.get(Department, body.department_id)
    if not dept:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")

    share = DepartmentShare(
        file_id=file_id,
        department_id=body.department_id,
        created_by=current_user.id,
        mode=body.mode,
        permission=body.permission,
        expires_at=body.expires_at,
    )
    db.add(share)
    await db.flush()
    result = await db.execute(
        select(DepartmentShare)
        .options(
            selectinload(DepartmentShare.file),
            selectinload(DepartmentShare.department),
            selectinload(DepartmentShare.creator),
        )
        .where(DepartmentShare.id == share.id)
    )
    share = result.scalar_one()

    await log_action(
        db,
        action="DEPARTMENT_SHARE_CREATE",
        resource_type="department_share",
        resource_id=str(share.id),
        user_id=current_user.id,
        ip_address=get_client_ip(request),
        metadata={
            "file_id": str(file_id),
            "department_id": str(body.department_id),
            "mode": body.mode.value,
            "permission": body.permission.value,
        },
    )
    return await _to_response(db, share, current_user)


@router.get("/inbox", response_model=list[DepartmentShareResponse])
async def list_inbox(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # ไฟล์ที่แชร์มาที่แผนกของ user คนนี้ (รวมทั้งแบบ open และแบบต้องกดรับ)
    if current_user.department_id is None:
        # ยังไม่มีแผนก ก็ไม่มีอะไรให้เห็น
        return []
    result = await db.execute(
        select(DepartmentShare)
        .options(
            selectinload(DepartmentShare.file),
            selectinload(DepartmentShare.department),
            selectinload(DepartmentShare.creator),
        )
        .where(DepartmentShare.department_id == current_user.department_id, DepartmentShare.is_active == True)  # noqa: E712
        .order_by(DepartmentShare.created_at.desc())
    )
    shares = result.scalars().all()
    return [await _to_response(db, s, current_user) for s in shares if not _is_expired(s)]


@router.get("/mine", response_model=list[DepartmentShareResponse])
async def list_my_shares(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # share ที่ user คนนี้เป็นคนสร้างเอง (ไว้ดูสถานะว่าใครรับไปแล้วบ้าง / จะ revoke ก็ทำตรงนี้)
    result = await db.execute(
        select(DepartmentShare)
        .options(
            selectinload(DepartmentShare.file),
            selectinload(DepartmentShare.department),
            selectinload(DepartmentShare.creator),
        )
        .where(DepartmentShare.created_by == current_user.id)
        .order_by(DepartmentShare.created_at.desc())
    )
    shares = result.scalars().all()
    return [await _to_response(db, s, current_user) for s in shares]


async def _get_share_or_404(db: AsyncSession, share_id: uuid.UUID) -> DepartmentShare:
    result = await db.execute(
        select(DepartmentShare)
        .options(
            selectinload(DepartmentShare.file),
            selectinload(DepartmentShare.department),
            selectinload(DepartmentShare.creator),
        )
        .where(DepartmentShare.id == share_id)
    )
    share = result.scalar_one_or_none()
    if not share:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share not found")
    return share


@router.post("/{share_id}/claim", response_model=DepartmentShareResponse)
async def claim_share(
    share_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    share = await _get_share_or_404(db, share_id)
    if not share.is_active or _is_expired(share):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Share is no longer available")
    if share.department_id != current_user.department_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this department")
    if share.mode != ShareMode.CLAIM_REQUIRED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This file doesn't require claiming")

    # กด "รับไฟล์" ตอนนี้แปลว่า "ส่งคำขอเข้าถึง" ไม่ใช่ได้สิทธิ์ทันทีเหมือนเดิม —
    # ต้องรอเจ้าของไฟล์กดอนุมัติก่อน (ดู approve_claim ด้านล่าง) ถึงจะโหลดได้จริง
    claim = DepartmentShareClaim(department_share_id=share.id, user_id=current_user.id)
    db.add(claim)
    try:
        await db.flush()
    except IntegrityError:
        # ชนกับ unique constraint แปลว่า user คนนี้เคยขอไปแล้ว (ไม่ว่าจะ pending/approved/rejected)
        # ไม่ถือว่า error แค่ return สถานะปัจจุบันกลับไปเฉยๆ ไม่ให้ขอซ้ำ
        await db.rollback()
        share = await _get_share_or_404(db, share_id)
        return await _to_response(db, share, current_user)

    await log_action(
        db,
        action="DEPARTMENT_SHARE_REQUEST",
        resource_type="department_share",
        resource_id=str(share.id),
        user_id=current_user.id,
        ip_address=get_client_ip(request),
        metadata={"filename": share.file.original_filename},
    )
    # แจ้งเตือนเจ้าของไฟล์ว่ามีคนขอเข้าถึง จะได้เข้ามาอนุมัติ/ปฏิเสธ
    await notify_download(db, share.created_by, share.file.original_filename, f"{current_user.full_name} (ขอเข้าถึง)")

    return await _to_response(db, share, current_user)


# รายการคำขอเข้าถึงของ share นี้ — ให้เจ้าของไฟล์ (คนสร้าง share) ดูได้เท่านั้น ใช้หน้า "คำขอเข้าถึง" ฝั่งผู้ส่ง
@router.get("/{share_id}/requests", response_model=list[ClaimResponse])
async def list_share_requests(
    share_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    share = await _get_share_or_404(db, share_id)
    if share.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    result = await db.execute(
        select(DepartmentShareClaim)
        .options(selectinload(DepartmentShareClaim.user))
        .where(DepartmentShareClaim.department_share_id == share_id)
        .order_by(DepartmentShareClaim.claimed_at.desc())
    )
    claims = result.scalars().all()
    return [
        ClaimResponse(
            id=c.id, user_id=c.user_id, user_name=c.user.full_name, user_email=c.user.email,
            status=c.status.value, claimed_at=c.claimed_at, decided_at=c.decided_at,
        )
        for c in claims
    ]


async def _decide_claim(db: AsyncSession, claim_id: uuid.UUID, current_user: User, new_status: ClaimStatus) -> DepartmentShareClaim:
    result = await db.execute(
        select(DepartmentShareClaim)
        .options(
            selectinload(DepartmentShareClaim.share).selectinload(DepartmentShare.file),
            selectinload(DepartmentShareClaim.user),
        )
        .where(DepartmentShareClaim.id == claim_id)
    )
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    # เฉพาะเจ้าของไฟล์ (คนสร้าง share) เท่านั้นที่อนุมัติ/ปฏิเสธคำขอได้
    if claim.share.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if claim.status != ClaimStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This request has already been decided")

    claim.status = new_status
    claim.decided_at = datetime.now(timezone.utc)
    await db.flush()
    return claim


@router.post("/claims/{claim_id}/approve", response_model=MessageResponse)
async def approve_claim(
    claim_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    claim = await _decide_claim(db, claim_id, current_user, ClaimStatus.APPROVED)
    await log_action(
        db, action="DEPARTMENT_SHARE_APPROVE", resource_type="department_share_claim",
        resource_id=str(claim_id), user_id=current_user.id, ip_address=get_client_ip(request),
    )
    await notify_download(db, claim.user_id, claim.share.file.original_filename, "เจ้าของไฟล์ (อนุมัติคำขอเข้าถึงแล้ว)")
    return MessageResponse(message="Request approved")


@router.post("/claims/{claim_id}/reject", response_model=MessageResponse)
async def reject_claim(
    claim_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    claim = await _decide_claim(db, claim_id, current_user, ClaimStatus.REJECTED)
    await log_action(
        db, action="DEPARTMENT_SHARE_REJECT", resource_type="department_share_claim",
        resource_id=str(claim_id), user_id=current_user.id, ip_address=get_client_ip(request),
    )
    await notify_download(db, claim.user_id, claim.share.file.original_filename, "เจ้าของไฟล์ (ปฏิเสธคำขอเข้าถึง)")
    return MessageResponse(message="Request rejected")


@router.get("/{share_id}/download")
async def download_department_share(
    share_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    share = await _get_share_or_404(db, share_id)
    if not share.is_active or _is_expired(share):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Share is no longer available")
    # ต้องอยู่แผนกเดียวกับที่ถูกแชร์ให้เท่านั้น แผนกอื่นเข้าไม่ได้แม้จะรู้ share_id ก็ตาม
    if share.department_id != current_user.department_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this department")

    # ระดับสิทธิ์ "ดูอย่างเดียว" ห้ามโหลดตัวไฟล์จริงเด็ดขาด ไม่ว่าจะอยู่แผนกไหนหรือ mode อะไรก็ตาม
    if share.permission == SharePermission.VIEW_ONLY:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This share is view-only — download is not allowed")

    if share.mode == ShareMode.CLAIM_REQUIRED:
        claim_result = await db.execute(
            select(DepartmentShareClaim).where(
                DepartmentShareClaim.department_share_id == share.id,
                DepartmentShareClaim.user_id == current_user.id,
            )
        )
        claim = claim_result.scalar_one_or_none()
        if claim is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Request access to this file before downloading")
        if claim.status == ClaimStatus.PENDING:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your access request is still pending approval")
        if claim.status == ClaimStatus.REJECTED:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your access request was rejected")

    db_file = share.file
    # ถอดรหัสไฟล์เฉพาะตอนจะส่งให้โหลดเท่านั้น เหมือนกับ route โหลดไฟล์ปกติ
    async with aiofiles.open(db_file.encrypted_path, "rb") as f:
        ciphertext = await f.read()
    plaintext = decrypt_file(ciphertext, db_file.encryption_iv)

    ip = get_client_ip(request)
    await log_action(
        db,
        action="DEPARTMENT_SHARE_DOWNLOAD",
        resource_type="department_share",
        resource_id=str(share.id),
        user_id=current_user.id,
        ip_address=ip,
        metadata={"filename": db_file.original_filename},
    )
    # แจ้งเตือนเจ้าของไฟล์ว่ามีคนโหลดไฟล์ของตัวเองไปแล้ว
    await notify_download(db, db_file.owner_id, db_file.original_filename, current_user.full_name)

    return StreamingResponse(
        iter([plaintext]),
        media_type=db_file.mime_type,
        headers={"Content-Disposition": f'attachment; filename="{db_file.original_filename}"'},
    )


@router.delete("/{share_id}", response_model=MessageResponse)
async def revoke_department_share(
    share_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    share = await _get_share_or_404(db, share_id)
    # ต้องเป็นคนที่สร้าง share นี้เท่านั้นถึงจะเพิกถอนได้
    if share.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    share.is_active = False  # ไม่ลบทิ้ง แค่ปิดใช้งาน เก็บประวัติไว้
    await db.flush()
    return MessageResponse(message="Department share revoked")
