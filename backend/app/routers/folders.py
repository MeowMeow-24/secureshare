import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models import File as FileModel
from app.models import Folder, User, UserRole
from app.schemas import FolderCreate, FolderResponse, MessageResponse
from app.services.audit import log_action
from app.utils import get_client_ip

router = APIRouter(prefix="/folders", tags=["Folders"])

# โฟลเดอร์ไว้จัดกลุ่มไฟล์ในหน้า "ไฟล์ของฉัน" เท่านั้น (ไม่เกี่ยวกับไฟล์แผนก เพราะแชร์แผนกเป็นคนละโมเดลกัน)
# owner_id เท่านั้นที่แก้ไข/ลบโฟลเดอร์ตัวเองได้ — แอดมินไม่ได้มีสิทธิ์พิเศษเข้าโฟลเดอร์คนอื่น
# ต่างจากไฟล์ตรงนี้ตั้งใจเพราะโฟลเดอร์เป็นแค่การจัดระเบียบส่วนตัว ไม่ใช่ทรัพยากรที่ต้องมี oversight


async def _get_folder_or_404(db: AsyncSession, folder_id: uuid.UUID, current_user: User) -> Folder:
    folder = await db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    if folder.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return folder


@router.post("/", response_model=FolderResponse, status_code=status.HTTP_201_CREATED)
async def create_folder(
    request: Request,
    body: FolderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == UserRole.VIEWER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Viewers cannot create folders")

    # ถ้าระบุ parent_id มา ต้องเช็คว่าเป็นโฟลเดอร์ของตัวเองจริงๆ กันสร้างซ้อนเข้าไปในโฟลเดอร์คนอื่น
    if body.parent_id is not None:
        await _get_folder_or_404(db, body.parent_id, current_user)

    folder = Folder(owner_id=current_user.id, name=body.name, parent_id=body.parent_id)
    db.add(folder)
    await db.flush()

    await log_action(
        db,
        action="FOLDER_CREATE",
        resource_type="folder",
        resource_id=str(folder.id),
        user_id=current_user.id,
        ip_address=get_client_ip(request),
        metadata={"name": body.name},
    )
    return FolderResponse.model_validate(folder)


# รายชื่อโฟลเดอร์ย่อยของโฟลเดอร์ที่ระบุ (parent_id=None คือโฟลเดอร์ระดับบนสุด/root)
@router.get("/", response_model=list[FolderResponse])
async def list_folders(
    parent_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Folder)
        .where(Folder.owner_id == current_user.id, Folder.parent_id == parent_id)
        .order_by(Folder.name)
    )
    return [FolderResponse.model_validate(f) for f in result.scalars().all()]


@router.delete("/{folder_id}", response_model=MessageResponse)
async def delete_folder(
    folder_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    folder = await _get_folder_or_404(db, folder_id, current_user)

    # ห้ามลบโฟลเดอร์ที่ยังมีไฟล์หรือโฟลเดอร์ย่อยอยู่ข้างใน กันของหายแบบไม่ตั้งใจ
    # (ต้องย้าย/ลบของข้างในให้หมดก่อน เหมือนกับกติกาการลบแผนกที่มีสมาชิกอยู่)
    file_count = await db.execute(
        select(FileModel).where(FileModel.folder_id == folder_id, FileModel.is_deleted == False)  # noqa: E712
    )
    if file_count.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Folder is not empty — move or delete its files first",
        )
    subfolder_count = await db.execute(select(Folder).where(Folder.parent_id == folder_id))
    if subfolder_count.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Folder is not empty — move or delete its subfolders first",
        )

    await db.delete(folder)
    await log_action(
        db,
        action="FOLDER_DELETE",
        resource_type="folder",
        resource_id=str(folder_id),
        user_id=current_user.id,
        ip_address=get_client_ip(request),
    )
    return MessageResponse(message="Folder deleted successfully")
