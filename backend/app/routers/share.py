import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

import aiofiles

from app.database import get_db
from app.limiter import limiter
from app.middleware.auth import get_current_user
from app.models import File as FileModel
from app.models import ShareLink, User
from app.schemas import MessageResponse, ShareLinkCreate, ShareLinkResponse
from app.services.audit import log_action
from app.utils import get_client_ip
from app.services.crypto.encryption import decrypt_file, generate_share_token, verify_signature
from app.services.crypto.qr import generate_qr_base64
from app.services.notification import notify_download
from app.services.security.event_engine import record_expired_link_access, record_signature_failure

router = APIRouter(prefix="/share", tags=["Share Links"])

# ลิงก์แชร์แบบสาธารณะ ใครมีลิงก์ก็โหลดได้เลยไม่ต้องล็อกอิน (ต่างจาก department_share.py ที่ต้องล็อกอิน)


# สร้าง URL แบบเต็มจาก token ไว้ส่งกลับให้ frontend เอาไปสร้าง QR code ต่อ
def _share_url(token: str) -> str:
    return f"http://localhost:5173/share/{token}"


@router.post("/{file_id}/links", response_model=ShareLinkResponse, status_code=status.HTTP_201_CREATED)
async def create_share_link(
    file_id: uuid.UUID,
    body: ShareLinkCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(FileModel).where(FileModel.id == file_id, FileModel.is_deleted == False))  # noqa: E712
    db_file = result.scalar_one_or_none()
    if not db_file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    if db_file.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    token = generate_share_token()
    link = ShareLink(
        file_id=file_id,
        created_by=current_user.id,
        token=token,
        expires_at=body.expires_at,
        is_one_time=body.is_one_time,
    )
    db.add(link)
    await db.flush()

    share_url = _share_url(token)
    await log_action(
        db,
        action="SHARE_LINK_CREATE",
        resource_type="share_link",
        resource_id=str(link.id),
        user_id=current_user.id,
        ip_address=get_client_ip(request),
        metadata={"file_id": str(file_id), "is_one_time": body.is_one_time},
    )

    return ShareLinkResponse(
        id=link.id,
        token=token,
        share_url=share_url,
        qr_code_base64=generate_qr_base64(share_url),
        expires_at=link.expires_at,
        is_one_time=link.is_one_time,
        is_active=link.is_active,
        download_count=link.download_count,
        created_at=link.created_at,
    )


@router.get("/links", response_model=list[ShareLinkResponse])
async def list_share_links(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ShareLink).where(ShareLink.created_by == current_user.id).order_by(ShareLink.created_at.desc())
    )
    links = result.scalars().all()
    return [
        ShareLinkResponse(
            id=l.id,
            token=l.token,
            share_url=_share_url(l.token),
            qr_code_base64=generate_qr_base64(_share_url(l.token)),
            expires_at=l.expires_at,
            is_one_time=l.is_one_time,
            is_active=l.is_active,
            download_count=l.download_count,
            created_at=l.created_at,
        )
        for l in links
    ]


# หน้า info ไม่ต้องล็อกอิน จำกัดไว้ 30 ครั้ง/นาที กันคนยิง request รัวๆ เดา token
@router.get("/public/{token}/info")
@limiter.limit("30/minute")
async def get_share_info(request: Request, token: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ShareLink).where(ShareLink.token == token))
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share link not found")
    file_result = await db.execute(select(FileModel).where(FileModel.id == link.file_id))
    db_file = file_result.scalar_one_or_none()

    # ถ้าหาไฟล์ไม่เจอ (เช่นถูกลบไปแล้ว) ก็ยังให้ข้อมูลลิงก์กลับไปได้ แค่ใส่ชื่อไฟล์เป็น unknown แทน
    if db_file:
        filename = db_file.original_filename
    else:
        filename = "unknown"

    return {
        "filename": filename,
        "expires_at": link.expires_at,
        "is_one_time": link.is_one_time,
        "is_expired": link.expires_at is not None and link.expires_at < datetime.now(timezone.utc),
        "is_available": link.is_active and (link.downloaded_at is None or not link.is_one_time),
    }


# หน้าดาวน์โหลดจริง จำกัดไว้ 20 ครั้ง/นาที (เข้มกว่า info เพราะเปลืองทรัพยากรกว่า)
@router.get("/public/{token}/download")
@limiter.limit("20/minute")
async def download_via_share_link(
    request: Request,
    token: str,
    db: AsyncSession = Depends(get_db),
):
    ip = get_client_ip(request)
    result = await db.execute(select(ShareLink).where(ShareLink.token == token))
    link = result.scalar_one_or_none()
    if not link or not link.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share link not found")

    if link.expires_at and link.expires_at < datetime.now(timezone.utc):
        await record_expired_link_access(db, token, ip)
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Share link has expired")

    if link.is_one_time:
        # ลิงก์แบบใช้ครั้งเดียว ต้องกันเคสที่มี 2 request ยิงเข้ามาพร้อมกันแล้วโหลดผ่านทั้งคู่
        # (ถ้าเช็คแบบ read แล้วค่อย update จะมีช่องโหว่ตรงนี้ได้)
        # เลยใช้ UPDATE ที่มีเงื่อนไข downloaded_at IS NULL เป็นตัวล็อกแทน ใครมาถึงก่อนได้ไปคนเดียว
        claim = await db.execute(
            update(ShareLink)
            .where(ShareLink.id == link.id, ShareLink.downloaded_at.is_(None))
            .values(downloaded_at=datetime.now(timezone.utc), is_active=False)
        )
        if claim.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_410_GONE, detail="One-time link already used")

    file_result = await db.execute(select(FileModel).where(FileModel.id == link.file_id))
    db_file = file_result.scalar_one_or_none()
    if not db_file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    owner_result = await db.execute(select(User).where(User.id == db_file.owner_id))
    owner = owner_result.scalar_one_or_none()
    if db_file.digital_signature and owner and owner.public_key_pem:
        if not verify_signature(db_file.sha256_hash, db_file.digital_signature, owner.public_key_pem):
            await record_signature_failure(db, db_file.id, ip_address=ip)
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Signature verification failed")

    async with aiofiles.open(db_file.encrypted_path, "rb") as f:
        ciphertext = await f.read()
    plaintext = decrypt_file(ciphertext, db_file.encryption_iv)

    link.download_count += 1  # นับสถิติไว้เฉยๆ ไม่ได้ใช้จำกัดสิทธิ์อะไร

    await log_action(
        db,
        action="SHARE_LINK_DOWNLOAD",
        resource_type="share_link",
        resource_id=str(link.id),
        ip_address=ip,
        metadata={"filename": db_file.original_filename, "token_prefix": token[:8]},
    )
    await notify_download(db, db_file.owner_id, db_file.original_filename, ip or "anonymous")

    return StreamingResponse(
        iter([plaintext]),
        media_type=db_file.mime_type,
        headers={"Content-Disposition": f'attachment; filename="{db_file.original_filename}"'},
    )


@router.delete("/links/{link_id}", response_model=MessageResponse)
async def revoke_share_link(
    link_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(ShareLink).where(ShareLink.id == link_id))
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share link not found")
    # ต้องเป็นคนสร้างลิงก์นี้เองเท่านั้นถึงจะเพิกถอนได้
    if link.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    link.is_active = False
    return MessageResponse(message="Share link revoked")
