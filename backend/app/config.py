from pydantic_settings import BaseSettings


# ค่า config ทั้งหมดของระบบ อ่านจากไฟล์ .env ได้ (ถ้าไม่มีไฟล์ .env จะใช้ค่า default ด้านล่างนี้แทน)
# หมายเหตุ: secret_key กับ encryption_master_key ตอน deploy จริงต้องเปลี่ยนเป็นค่าของตัวเอง ห้ามใช้ค่า default
class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://sfs_user:sfs_password@localhost:5432/secure_file_sharing"
    secret_key: str = "change-me-in-production"  # ใช้เซ็น JWT token
    encryption_master_key: str = "change-me-32-byte-key-for-aes!!"  # กุญแจเข้ารหัสไฟล์ (AES-256 ต้องการ 32 byte)
    cors_origins: str = "http://localhost:5173"  # โดเมนที่อนุญาตให้เรียก API ได้ (คั่นด้วย , ถ้ามีหลายโดเมน)
    storage_path: str = "./storage/encrypted"  # ที่เก็บไฟล์ที่เข้ารหัสแล้วบนดิสก์
    bulk_download_threshold: int = 100  # โหลดกี่ไฟล์ถึงจะถือว่าผิดปกติ
    bulk_download_window_seconds: int = 120  # นับภายในกี่วินาที (คู่กับ threshold ด้านบน)
    access_token_expire_minutes: int = 60  # token หมดอายุใน 1 ชม. ต้อง login ใหม่
    algorithm: str = "HS256"

    class Config:
        env_file = ".env"


settings = Settings()
