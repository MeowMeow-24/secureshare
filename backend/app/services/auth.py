from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# hash รหัสผ่านด้วย bcrypt ก่อนเก็บลง DB ห้ามเก็บ plain text เด็ดขาด
def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# สร้าง JWT token ตอน login สำเร็จ ใน token จะมี user_id, role และเวลาหมดอายุฝังอยู่
def create_access_token(user_id: str, role: str) -> tuple[str, int]:
    expires_in = settings.access_token_expire_minutes * 60
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": user_id, "role": role, "exp": expire}
    token = jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)
    return token, expires_in


# ถอด token กลับมาเป็น payload ถ้า token ปลอม/หมดอายุ/แก้ไข จะ decode ไม่ผ่านแล้ว return None
def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        return None


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: str) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()
