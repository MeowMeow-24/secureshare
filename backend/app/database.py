from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


# dependency ที่ทุก route ใช้ดึง DB session — ใช้เสร็จแล้ว commit อัตโนมัติ
# ถ้ามี error ระหว่างทางก็ rollback ให้เองไม่ต้องเขียน try/except ซ้ำทุก route
async def get_db():
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
