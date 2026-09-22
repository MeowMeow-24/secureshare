from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.limiter import limiter
from app.routers import auth, department_share, departments, files, folders, security, share


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="Secure File Sharing Platform",
    description="End-to-end encrypted file sharing with security monitoring",
    version="1.0.0",
    lifespan=lifespan,
)

# ผูก rate limiter เข้ากับ app — นับจาก IP ของคนที่เรียก
# ใช้กันพวก brute-force เดารหัสผ่านตอน login และกันยิง request สแปมถี่ๆ
# (เดิมตั้งใจจะทำระบบป้องกัน DDoS เต็มรูปแบบ แต่ปรับ scope ลงมาเป็น rate limiting ธรรมดาแทน)
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


# ถ้ามีคนยิง request เกิน limit ที่ตั้งไว้ (ดูที่ @limiter.limit(...) ในแต่ละ route)
# จะโดน error 429 กลับไปแบบนี้แทน
@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Please try again later."},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://accomplished-mindfulness-production-85f3.up.railway.app",
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# รวม router ทั้งหมดเข้า app โดยขึ้นต้นด้วย /api/v1
app.include_router(auth.router, prefix="/api/v1")
app.include_router(files.router, prefix="/api/v1")
app.include_router(folders.router, prefix="/api/v1")
app.include_router(share.router, prefix="/api/v1")
app.include_router(department_share.router, prefix="/api/v1")
app.include_router(departments.router, prefix="/api/v1")
app.include_router(security.router, prefix="/api/v1")


# endpoint ไว้เช็คว่า server ยังทำงานอยู่ไหม (เช่นเรียกจาก docker healthcheck)
@app.get("/health")
async def health():
    return {"status": "ok", "service": "secure-file-sharing-platform"}
