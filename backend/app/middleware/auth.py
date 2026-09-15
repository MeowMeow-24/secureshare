from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User, UserRole
from app.services.auth import decode_access_token, get_user_by_id

security = HTTPBearer()


# ดึง user จาก JWT token ที่ส่งมาใน header Authorization: Bearer <token>
# ใช้เป็น dependency แปะไว้ทุก route ที่ต้องล็อกอินก่อนถึงจะใช้ได้
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_access_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    user = await get_user_by_id(db, payload["sub"])
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user


# ใช้เช็คว่า user ที่ล็อกอินอยู่มี role ตรงตามที่กำหนดไหม เช่น require_roles(UserRole.ADMIN)
# เอาไปแปะแทน get_current_user ใน route ที่อยากจำกัดสิทธิ์เฉพาะบาง role
def require_roles(*roles: UserRole):
    async def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return current_user

    return checker
