from slowapi import Limiter
from slowapi.util import get_remote_address

# ตัว rate limiter กลางของทั้งระบบ ใช้ IP ของ client เป็นตัวนับ
# ใช้แทนการทำระบบป้องกัน DDoS เต็มรูปแบบ เพราะขอบเขตโปรเจกต์นี้แค่จำกัดจำนวน request
# ต่อนาทีในแต่ละ endpoint ก็เพียงพอแล้ว
# แยกไว้ไฟล์นี้เพื่อให้ main.py (เอาไปติดกับ app) และ router ต่างๆ (เอาไปกำหนด limit
# เฉพาะ endpoint เช่น login) import ไปใช้ร่วมกันได้โดยไม่ import วนกันเอง (circular import)
limiter = Limiter(key_func=get_remote_address)
