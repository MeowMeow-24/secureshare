import base64
import io

import qrcode


# สร้าง QR code จาก URL แล้วแปลงเป็น base64 ส่งกลับไปให้ frontend แสดงเป็น <img> ได้เลย
def generate_qr_base64(url: str) -> str:
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode()
