"""
สคริปต์สร้างบัญชีผู้ใช้งานเริ่มต้นสำหรับทดสอบระบบ SecureShare
รองรับทั้ง Admin, User (พนักงาน) และ Viewer (ผู้ดูไฟล์)
"""

import asyncio
import os

from app.database import async_session
from app.models import User, UserRole
from app.services.auth import get_user_by_email, hash_password

# กำหนดรายชื่อบัญชีเริ่มต้นที่ต้องการสร้าง
# กำหนดรายชื่อบัญชีเริ่มต้นที่ต้องการสร้าง
USERS_TO_SEED = [
    {
        "email": os.environ.get("SEED_ADMIN_EMAIL", "admin@test.com"),
        "password": os.environ.get("SEED_ADMIN_PASSWORD", "Admin1234"),
        "full_name": "System Admin",
        "role": UserRole.ADMIN,
    },
    {
        "email": "admin2@test.com",  # <-- แอดมินคนที่สอง
        "password": "Admin1234",
        "full_name": "Second Admin",
        "role": UserRole.ADMIN,
    },
    {
        "email": "user@test.com",
        "password": "User1234!",
        "full_name": "Staff User",
        "role": UserRole.USER,
    },
    {
        "email": "viewer@test.com",
        "password": "Viewer1234!",
        "full_name": "File Viewer",
        "role": UserRole.VIEWER,
    },
]


async def main():
    async with async_session() as db:
        print("--- เริ่มต้นการสร้างบัญชีผู้ใช้ ---")
        for u in USERS_TO_SEED:
            # ตรวจสอบอีเมลซ้ำก่อนเพิ่มข้อมูล
            existing = await get_user_by_email(db, u["email"])
            if existing:
                print(f"[-] ข้าม: บัญชี {u['email']} มีอยู่ในระบบแล้ว")
                continue

            new_user = User(
                email=u["email"],
                password_hash=hash_password(u["password"]),
                full_name=u["full_name"],
                role=u["role"],
            )
            db.add(new_user)
            await db.commit()

            print(f"[+] สำเร็จ: สร้าง {u['email']} ({u['role'].value}) เรียบร้อย")
            print(f"    Password: {u['password']}")

        print("--------------------------------")
        print("สร้างบัญชีเริ่มต้นทั้งหมดเสร็จสิ้น สามารถใช้ล็อกอินได้ทันที")


if __name__ == "__main__":
    asyncio.run(main())