import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Notification


# สร้างแจ้งเตือนให้เจ้าของไฟล์ ตอนที่มีคนโหลดไฟล์ของเขาไป
async def notify_download(
    db: AsyncSession,
    owner_id: uuid.UUID,
    filename: str,
    downloader_info: str,
) -> Notification:
    notification = Notification(
        user_id=owner_id,
        title="มีคนดาวน์โหลดไฟล์ของคุณ",
        message=f'ไฟล์ "{filename}" ของคุณถูกดาวน์โหลดโดย {downloader_info}',
        metadata_={"filename": filename, "downloader": downloader_info},
    )
    db.add(notification)
    await db.flush()
    return notification
