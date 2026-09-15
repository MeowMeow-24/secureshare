import base64
import hashlib
import os
import secrets

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import settings


# คำนวณ SHA-256 hash ของไฟล์ ใช้เช็คว่าไฟล์ถูกแก้ไข/เสียหายระหว่างทางหรือเปล่า (integrity check)
def sha256_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def encrypt_file(data: bytes, key: bytes | None = None) -> tuple[bytes, str, str]:
    """เข้ารหัสไฟล์ด้วย AES-256-GCM แล้วคืนค่า (ciphertext, iv แบบ hex, sha256 ของไฟล์ต้นฉบับ)

    เลือกใช้ AES-256-GCM เพราะเป็น authenticated encryption อยู่แล้ว
    (นอกจากเข้ารหัสแล้วยังเช็คได้ด้วยว่าข้อมูลโดนแก้ไขหรือไม่ ไม่ต้องทำ MAC แยกเอง)
    """
    # ใช้ master key จาก config ถ้าไม่ได้ส่ง key มาเอง ตัดให้เหลือ 32 byte พอดีสำหรับ AES-256
    key = key or settings.encryption_master_key.encode()[:32].ljust(32, b"\0")
    iv = os.urandom(12)  # GCM มาตรฐานใช้ IV ยาว 12 byte และห้ามใช้ค่าเดิมซ้ำกับ key เดียวกัน
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(iv, data, None)
    file_hash = sha256_hash(data)
    return ciphertext, iv.hex(), file_hash


def decrypt_file(ciphertext: bytes, iv_hex: str, key: bytes | None = None) -> bytes:
    key = key or settings.encryption_master_key.encode()[:32].ljust(32, b"\0")
    iv = bytes.fromhex(iv_hex)
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(iv, ciphertext, None)


# สร้างคู่กุญแจ RSA ไว้ใช้เซ็น/ตรวจลายเซ็นดิจิทัล (private key เก็บไว้ที่ user, public key เก็บใน DB)
def generate_rsa_keypair() -> tuple[str, str]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    return private_pem, public_pem


# เซ็นลายเซ็นดิจิทัลจาก hash ของไฟล์ (เซ็น hash ไม่ใช่เซ็นทั้งไฟล์ เพราะไฟล์อาจใหญ่มาก)
def sign_data(data_hash: str, private_key_pem: str) -> str:
    private_key = serialization.load_pem_private_key(private_key_pem.encode(), password=None)
    signature = private_key.sign(
        data_hash.encode(),
        padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.MAX_LENGTH),
        hashes.SHA256(),
    )
    return base64.b64encode(signature).decode()


# ตรวจลายเซ็นดิจิทัล คืนค่า True/False เฉยๆ ไม่โยน error ออกไป (จับ exception ไว้ในนี้เลย)
def verify_signature(data_hash: str, signature_b64: str, public_key_pem: str) -> bool:
    try:
        public_key = serialization.load_pem_public_key(public_key_pem.encode())
        signature = base64.b64decode(signature_b64)
        public_key.verify(
            signature,
            data_hash.encode(),
            padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.MAX_LENGTH),
            hashes.SHA256(),
        )
        return True
    except Exception:
        return False


# สร้าง token แบบสุ่มไว้ใช้เป็นลิงก์แชร์สาธารณะ (ยาวพอจนเดาไม่ได้)
def generate_share_token() -> str:
    return secrets.token_urlsafe(32)
