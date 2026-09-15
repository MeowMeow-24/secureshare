from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.limiter import limiter
from app.middleware.auth import get_current_user, require_roles
from app.models import Department, User, UserRole
from app.schemas import MessageResponse, TokenResponse, UserLogin, UserRegister, UserResponse, UserUpdate
from app.services.audit import log_action
from app.utils import get_client_ip
from app.services.auth import (
    create_access_token,
    get_user_by_email as fetch_user_by_email,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

# route เกี่ยวกับ login / สมัครผู้ใช้ / จัดการผู้ใช้ (เฉพาะแอดมิน)


def _user_response(user: User) -> UserResponse:
    # user บางคนอาจจะยังไม่มีแผนก (department_id เป็น None) เลยต้องเช็คก่อนดึงชื่อแผนก
    if user.department:
        department_name = user.department.name
    else:
        department_name = None

    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
        department_id=user.department_id,
        department_name=department_name,
        created_at=user.created_at,
    )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    request: Request,
    body: UserRegister,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.ADMIN)),
):
    # ระบบนี้เป็นแพลตฟอร์มแชร์ไฟล์ภายในองค์กร ไม่ใช่บริการสาธารณะ
    # เลยให้เฉพาะแอดมินเป็นคนสร้างบัญชีให้ ไม่มีหน้าสมัครสมาชิกเอง
    if await fetch_user_by_email(db, body.email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    if body.department_id is not None:
        dept = await db.get(Department, body.department_id)
        if not dept:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        role=body.role,
        department_id=body.department_id,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user, attribute_names=["department"])

    await log_action(
        db,
        action="USER_CREATE",
        resource_type="user",
        resource_id=str(user.id),
        user_id=admin.id,
        ip_address=get_client_ip(request),
        metadata={"created_email": body.email, "role": body.role.value},
    )
    return _user_response(user)


# จำกัดไว้ 10 ครั้ง/นาที ต่อ IP กันคนลองรหัสผ่านมั่วๆ (brute-force)
# ใช้ rate limiting แทนการทำระบบป้องกัน DDoS เต็มรูปแบบ เพราะ scope โปรเจกต์นี้พอแค่นี้
@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, body: UserLogin, db: AsyncSession = Depends(get_db)):
    user = await fetch_user_by_email(db, body.email)
    # ตั้งใจไม่บอกว่า "email ไม่มีในระบบ" หรือ "รหัสผ่านผิด" แยกกัน เพื่อไม่ให้คนร้ายเดารายชื่อ email ในระบบได้
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")
    token, expires_in = create_access_token(str(user.id), user.role.value)
    return TokenResponse(access_token=token, expires_in=expires_in)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.refresh(current_user, attribute_names=["department"])
    return _user_response(current_user)


@router.get("/users", response_model=list[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    result = await db.execute(
        select(User).options(selectinload(User.department)).order_by(User.created_at.desc())
    )
    return [_user_response(u) for u in result.scalars().all()]


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    result = await db.execute(
        select(User).options(selectinload(User.department)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if body.full_name is not None:
        user.full_name = body.full_name
    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active
    # เคลียร์แผนกไว้ก่อน ถ้าไม่ได้สั่งเคลียร์ค่อยเช็คว่าจะย้ายไปแผนกไหน
    if body.clear_department:
        user.department_id = None
    elif body.department_id is not None:
        dept = await db.get(Department, body.department_id)
        if not dept:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
        user.department_id = body.department_id
    await db.flush()
    await db.refresh(user, attribute_names=["department"])
    return _user_response(user)
