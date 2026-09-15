import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user, require_roles
from app.models import Department, User, UserRole
from app.schemas import DepartmentCreate, DepartmentResponse, MessageResponse
from app.services.audit import log_action
from app.utils import get_client_ip

router = APIRouter(prefix="/departments", tags=["Departments"])

# route จัดการแผนก - สร้าง/ลบ/ดูรายชื่อ (เฉพาะแอดมินสร้าง/ลบได้ ดูได้ทุกคน)


async def _with_member_count(db: AsyncSession, dept: Department) -> DepartmentResponse:
    count_result = await db.execute(select(func.count(User.id)).where(User.department_id == dept.id))
    return DepartmentResponse(
        id=dept.id,
        name=dept.name,
        description=dept.description,
        member_count=count_result.scalar_one(),
        created_at=dept.created_at,
    )


@router.get("/", response_model=list[DepartmentResponse])
async def list_departments(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    # ให้ user ที่ล็อกอินแล้วทุกคนเห็นรายชื่อแผนกได้หมด เพราะต้องใช้ตอนเลือกแผนกจะแชร์ไฟล์
    # แต่จะสร้าง/แก้ไข/ลบแผนกได้ต้องเป็นแอดมินเท่านั้น
    result = await db.execute(select(Department).order_by(Department.name))
    departments = result.scalars().all()
    return [await _with_member_count(db, d) for d in departments]


@router.post("/", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
async def create_department(
    body: DepartmentCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.ADMIN)),
):
    existing = await db.execute(select(Department).where(Department.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Department name already exists")
    dept = Department(name=body.name, description=body.description)
    db.add(dept)
    await db.flush()
    await db.refresh(dept)
    await log_action(
        db,
        action="DEPARTMENT_CREATE",
        resource_type="department",
        resource_id=str(dept.id),
        user_id=admin.id,
        ip_address=get_client_ip(request),
        metadata={"name": body.name},
    )
    return await _with_member_count(db, dept)


@router.delete("/{department_id}", response_model=MessageResponse)
async def delete_department(
    department_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.ADMIN)),
):
    dept = await db.get(Department, department_id)
    if not dept:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
    # ห้ามลบแผนกที่ยังมีคนอยู่ ต้องย้ายคนออกให้หมดก่อน กันข้อมูล user ลอยไม่มีแผนก
    member_count = await db.execute(select(func.count(User.id)).where(User.department_id == department_id))
    if member_count.scalar_one() > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete a department that still has members. Move them out first.",
        )
    await db.delete(dept)
    await log_action(
        db,
        action="DEPARTMENT_DELETE",
        resource_type="department",
        resource_id=str(department_id),
        user_id=admin.id,
        ip_address=get_client_ip(request),
    )
    return MessageResponse(message="Department deleted")
