import os
import uuid

import aiofiles
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.auth import get_current_user
from app.models import File as FileModel
from app.models import Folder, User, UserRole
from app.schemas import FileDetailResponse, FileMove, FileResponse, FileUploadResponse, MessageResponse
from app.services.audit import log_action
from app.utils import get_client_ip
from app.services.crypto.encryption import decrypt_file, encrypt_file, verify_signature
from app.services.security.event_engine import check_bulk_download, record_signature_failure

router = APIRouter(prefix="/files", tags=["Files"])

# route ทั้งหมดในไฟล์นี้เกี่ยวกับไฟล์ของผู้ใช้เอง (อัปโหลด/ดู/โหลด/ลบ)
# ไม่รวม route ของ share link หรือ department share (แยกไปคนละไฟล์)


# แปลง FileModel (จาก DB) ให้เป็น response ที่ส่งกลับให้ frontend
# ไม่ส่ง encrypted_path หรือ digital_signature กลับไปตรงนี้ เพราะไม่จำเป็นต้องให้ frontend รู้
def _file_response(f: FileModel) -> FileResponse:
    return FileResponse(
        id=f.id,
        original_filename=f.original_filename,
        mime_type=f.mime_type,
        file_size=f.file_size,
        sha256_hash=f.sha256_hash,
        has_signature=f.digital_signature is not None,
        folder_id=f.folder_id,
        created_at=f.created_at,
    )


@router.post("/upload", response_model=FileUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    folder_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # viewer มีสิทธิ์ดูอย่างเดียว ห้ามอัปโหลด
    if current_user.role == UserRole.VIEWER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Viewers cannot upload files")

    # อ่านไฟล์เข้ามาแล้วเข้ารหัสก่อนเซฟ (AES) พร้อมคำนวณ SHA-256 hash ไว้เช็คทีหลังว่าไฟล์โดนแก้ไขไหม
    content = await file.read()
    ciphertext, iv_hex, file_hash = encrypt_file(content)

    file_id = uuid.uuid4()
    os.makedirs(settings.storage_path, exist_ok=True)
    encrypted_path = os.path.join(settings.storage_path, f"{file_id}.enc")

    # เซฟเฉพาะไฟล์ที่เข้ารหัสแล้วลงดิสก์ ไม่มีการเก็บไฟล์ plaintext ไว้เลย
    async with aiofiles.open(encrypted_path, "wb") as f:
        await f.write(ciphertext)

    signature = None
    # หมายเหตุ: ยังไม่ได้ทำ digital signature ตอนอัปโหลด เพราะต้องมี private key ของเจ้าของไฟล์ก่อน
    # (ตอนนี้ทำแค่ verify ตอนโหลดไฟล์ ถ้า user ตั้ง public key ไว้แล้ว)

    db_file = FileModel(
        id=file_id,
        owner_id=current_user.id,
        folder_id=folder_id,
        original_filename=file.filename or "unnamed",
        encrypted_path=encrypted_path,
        mime_type=file.content_type or "application/octet-stream",
        file_size=len(content),
        sha256_hash=file_hash,
        digital_signature=signature,
        encryption_iv=iv_hex,
    )
    db.add(db_file)
    await db.flush()

    await log_action(
        db,
        action="FILE_UPLOAD",
        resource_type="file",
        resource_id=str(file_id),
        user_id=current_user.id,
        ip_address=get_client_ip(request),
        metadata={"filename": file.filename, "size": len(content), "sha256": file_hash},
    )

    return FileUploadResponse(file=_file_response(db_file))


@router.get("/", response_model=list[FileResponse])
async def list_files(
    folder_id: uuid.UUID | None = None,
    all_folders: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # แอดมินเห็นไฟล์ทุกคน ส่วน role อื่นเห็นแค่ไฟล์ตัวเอง
    query = select(FileModel).where(FileModel.is_deleted == False)  # noqa: E712
    if current_user.role != UserRole.ADMIN:
        query = query.where(FileModel.owner_id == current_user.id)
    # ปกติจะกรองตามโฟลเดอร์ปัจจุบัน (folder_id=None คือ root) — ถ้าอยากได้ไฟล์ทั้งหมดไม่สนโฟลเดอร์
    # (เช่น ใช้ค้นหาข้ามโฟลเดอร์) ให้ส่ง all_folders=true มาแทน
    if not all_folders:
        query = query.where(FileModel.folder_id == folder_id)
    query = query.order_by(FileModel.created_at.desc())
    result = await db.execute(query)
    return [_file_response(f) for f in result.scalars().all()]


@router.get("/{file_id}", response_model=FileDetailResponse)
async def get_file(
    file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FileModel).where(FileModel.id == file_id, FileModel.is_deleted == False)  # noqa: E712
    )
    db_file = result.scalar_one_or_none()
    if not db_file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    # เช็คสิทธิ์: ต้องเป็นเจ้าของไฟล์ หรือเป็นแอดมินเท่านั้นถึงจะดูรายละเอียดได้
    if current_user.role != UserRole.ADMIN and db_file.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return FileDetailResponse(
        **_file_response(db_file).model_dump(),
        digital_signature=db_file.digital_signature,
    )


@router.get("/{file_id}/download")
async def download_file(
    file_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FileModel).where(FileModel.id == file_id, FileModel.is_deleted == False)  # noqa: E712
    )
    db_file = result.scalar_one_or_none()
    if not db_file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    if current_user.role != UserRole.ADMIN and db_file.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # ถ้าไฟล์มีลายเซ็นดิจิทัลอยู่ ให้เช็คก่อนว่ายังถูกต้องอยู่ไหม (กันไฟล์โดนแก้ไข/สลับ)
    # ถ้าไม่ผ่าน ให้บันทึกเป็น security event ไว้ด้วย แล้วไม่ปล่อยให้โหลด
    if db_file.digital_signature and current_user.public_key_pem:
        valid = verify_signature(db_file.sha256_hash, db_file.digital_signature, current_user.public_key_pem)
        if not valid:
            await record_signature_failure(
                db, db_file.id, current_user.id, get_client_ip(request)
            )
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Signature verification failed")

    # ถอดรหัสไฟล์เฉพาะตอนจะส่งกลับให้ user เท่านั้น ไม่มีการเก็บไฟล์ที่ถอดรหัสแล้วไว้ที่ไหน
    async with aiofiles.open(db_file.encrypted_path, "rb") as f:
        ciphertext = await f.read()
    plaintext = decrypt_file(ciphertext, db_file.encryption_iv)

    ip = get_client_ip(request)
    await log_action(
        db,
        action="FILE_DOWNLOAD",
        resource_type="file",
        resource_id=str(file_id),
        user_id=current_user.id,
        ip_address=ip,
        metadata={"filename": db_file.original_filename},
    )
    # เช็คด้วยว่า user คนนี้โหลดไฟล์ถี่ผิดปกติในช่วงเวลาสั้นๆ หรือเปล่า ถ้าใช่จะขึ้น security event
    await check_bulk_download(db, current_user.id, ip)

    return StreamingResponse(
        iter([plaintext]),
        media_type=db_file.mime_type,
        headers={"Content-Disposition": f'attachment; filename="{db_file.original_filename}"'},
    )


# ย้ายไฟล์ไปโฟลเดอร์อื่น — ใช้ตอนลากไฟล์ไปวางบนการ์ดโฟลเดอร์ในหน้า "ไฟล์ของฉัน"
@router.patch("/{file_id}/move", response_model=FileResponse)
async def move_file(
    file_id: uuid.UUID,
    body: FileMove,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FileModel).where(FileModel.id == file_id, FileModel.is_deleted == False)  # noqa: E712
    )
    db_file = result.scalar_one_or_none()
    if not db_file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    # ย้ายไฟล์ได้เฉพาะเจ้าของไฟล์เท่านั้น (แอดมินก็ไม่ได้สิทธิ์พิเศษตรงนี้ เพราะเป็นแค่การจัดระเบียบส่วนตัว)
    if db_file.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # ถ้าระบุโฟลเดอร์ปลายทางมา ต้องเช็คว่าเป็นโฟลเดอร์ของตัวเองจริงๆ กันย้ายเข้าโฟลเดอร์คนอื่น
    if body.folder_id is not None:
        folder = await db.get(Folder, body.folder_id)
        if not folder or folder.owner_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")

    db_file.folder_id = body.folder_id
    await db.flush()

    await log_action(
        db,
        action="FILE_MOVE",
        resource_type="file",
        resource_id=str(file_id),
        user_id=current_user.id,
        ip_address=get_client_ip(request),
        metadata={"folder_id": str(body.folder_id) if body.folder_id else None},
    )
    return _file_response(db_file)


@router.delete("/{file_id}", response_model=MessageResponse)
async def delete_file(
    file_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(FileModel).where(FileModel.id == file_id))
    db_file = result.scalar_one_or_none()
    if not db_file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    if current_user.role != UserRole.ADMIN and db_file.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    # ลบแบบ soft delete แค่ตั้ง flag ไว้ ไม่ได้ลบไฟล์จริงบนดิสก์ทันที (กันลบพลาด/เผื่อกู้คืน)
    db_file.is_deleted = True
    await log_action(
        db,
        action="FILE_DELETE",
        resource_type="file",
        resource_id=str(file_id),
        user_id=current_user.id,
        ip_address=get_client_ip(request),
    )
    return MessageResponse(message="File deleted successfully")
