from fastapi import Request


# ดึง IP ของคนที่เรียก request มา
# เขียนแบบ if/else ธรรมดาแทนการใช้ ternary (x if y else z) เพื่อให้อ่านง่าย
# บางครั้ง request.client อาจเป็น None ได้ (เช่นตอนเทส) เลยต้องเช็คก่อน
def get_client_ip(request: Request) -> str | None:
    if request.client:
        return request.client.host
    else:
        return None
