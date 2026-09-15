"""
Test suite for the Secure File Sharing Platform.
Runs against a LIVE server (http://localhost:8000) with a real PostgreSQL database.

Covers:
  1. Functional flow  - login as admin, create user, upload, encrypt, share, download
  2. RBAC enforcement  - viewer blocked from admin-only endpoints
  3. Brute-force test  - repeated failed logins -> expect HTTP 429 rate limit
  4. Race condition    - concurrent hits on a one-time download link

หมายเหตุ: เดิมสคริปต์นี้เรียก /auth/register ตรงๆ แบบไม่ล็อกอิน (self-register) แต่ตอนนี้
ระบบล็อกไว้ว่าต้องเป็นแอดมินเท่านั้นถึงจะสร้างบัญชีได้ (ดู routers/auth.py) เลยแก้ให้
ล็อกอินด้วยบัญชีแอดมินที่สร้างจาก scripts/seed_admin.py ก่อน แล้วค่อยใช้ token นั้นสร้าง
บัญชีทดสอบแทน ต้องรัน `python -m scripts.seed_admin` ไว้ก่อนแล้วถึงจะรันไฟล์นี้ได้
"""
import asyncio
import time

import httpx

BASE = "http://localhost:8000/api/v1"
ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "ChangeMe123!"


async def login(client, email, password):
    return await client.post(f"{BASE}/auth/login", json={"email": email, "password": password})


async def admin_headers(client):
    r = await login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    if r.status_code != 200:
        raise RuntimeError(
            "เข้าสู่ระบบด้วยบัญชีแอดมินไม่สำเร็จ — รัน `python -m scripts.seed_admin` ก่อนหรือยัง?"
        )
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def register(client, admin_hdrs, email, password, role="user"):
    return await client.post(
        f"{BASE}/auth/register",
        headers=admin_hdrs,
        json={"email": email, "password": password, "full_name": "Test User", "role": role},
    )


async def test_functional_flow():
    print("\n=== 1. FUNCTIONAL FLOW TEST ===")
    async with httpx.AsyncClient(timeout=10) as client:
        admin_hdrs = await admin_headers(client)
        email = f"user{int(time.time())}@test.com"
        r = await register(client, admin_hdrs, email, "SecurePass123!")
        print(f"  Admin creates user: {r.status_code} (expect 201)")
        assert r.status_code == 201

        r = await login(client, email, "SecurePass123!")
        print(f"  Login:           {r.status_code} (expect 200)")
        assert r.status_code == 200
        token = r.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        r = await client.get(f"{BASE}/auth/me", headers=headers)
        print(f"  Get profile:     {r.status_code} (expect 200)")

        files = {"file": ("test.txt", b"Hello secure world! This is confidential.", "text/plain")}
        r = await client.post(f"{BASE}/files/upload", headers=headers, files=files)
        print(f"  Upload file:     {r.status_code} (expect 201)")
        assert r.status_code == 201
        file_obj = r.json()["file"]
        file_id = file_obj["id"]
        print(f"    -> file encrypted server-side, sha256={file_obj.get('sha256_hash', '')[:16]}...")

        r = await client.post(
            f"{BASE}/share/{file_id}/links", headers=headers,
            json={"is_one_time": True, "expires_at": None},
        )
        print(f"  Create share link:{r.status_code} (expect 201)")
        assert r.status_code == 201
        share_data = r.json()
        token_str = share_data["token"]
        print(f"    -> one-time token issued, QR code present: {'qr_code_base64' in share_data}")

        r = await client.get(f"{BASE}/share/public/{token_str}/download")
        print(f"  First download:  {r.status_code} (expect 200)")
        assert r.status_code == 200
        assert r.content == b"Hello secure world! This is confidential."
        print("    -> decrypted content matches original")

        r = await client.get(f"{BASE}/share/public/{token_str}/download")
        print(f"  Second download: {r.status_code} (expect 404 or 410 - link no longer usable)")
        assert r.status_code in (404, 410)
        print("  PASS: functional flow + one-time enforcement OK")
        return email


async def test_rbac():
    print("\n=== 2. RBAC TEST (viewer tries to access admin dashboard) ===")
    async with httpx.AsyncClient(timeout=10) as client:
        admin_hdrs = await admin_headers(client)
        email = f"viewer{int(time.time())}@test.com"
        await register(client, admin_hdrs, email, "SecurePass123!", role="viewer")
        r = await login(client, email, "SecurePass123!")
        token = r.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        r = await client.get(f"{BASE}/security/dashboard", headers=headers)
        print(f"  Viewer -> /security/dashboard: {r.status_code} (expect 403 Forbidden)")
        assert r.status_code == 403
        print("  PASS: RBAC blocks viewer from admin-only endpoint")


async def test_brute_force():
    print("\n=== 3. BRUTE-FORCE TEST (repeated failed logins) ===")
    async with httpx.AsyncClient(timeout=10) as client:
        admin_hdrs = await admin_headers(client)
        email = f"victim{int(time.time())}@test.com"
        await register(client, admin_hdrs, email, "TheRealPassword1!")

        codes = []
        for i in range(15):
            r = await login(client, email, f"wrong-guess-{i}")
            codes.append(r.status_code)
        print(f"  15 failed login attempts -> status codes: {codes}")
        blocked = codes.count(429)
        print(f"  Attempts allowed before block: {codes.index(429) if 429 in codes else 'NEVER BLOCKED'}")
        print(f"  Attempts rejected with 429:    {blocked}")
        if 429 in codes:
            print("  PASS: rate limiting stops brute-force after threshold")
        else:
            print("  FAIL: no rate limiting detected - vulnerable to brute-force")


async def test_race_condition():
    print("\n=== 4. RACE CONDITION TEST (simultaneous one-time downloads) ===")
    async with httpx.AsyncClient(timeout=10) as client:
        admin_hdrs = await admin_headers(client)
        email = f"racer{int(time.time())}@test.com"
        await register(client, admin_hdrs, email, "SecurePass123!")
        r = await login(client, email, "SecurePass123!")
        token = r.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        files = {"file": ("secret.txt", b"race condition test payload", "text/plain")}
        r = await client.post(f"{BASE}/files/upload", headers=headers, files=files)
        file_id = r.json()["file"]["id"]

        r = await client.post(
            f"{BASE}/share/{file_id}/links", headers=headers,
            json={"is_one_time": True, "expires_at": None},
        )
        share_token = r.json()["token"]

        # Fire 10 concurrent download requests at the same one-time link
        async def hit():
            async with httpx.AsyncClient(timeout=10) as c:
                resp = await c.get(f"{BASE}/share/public/{share_token}/download")
                return resp.status_code

        results = await asyncio.gather(*[hit() for _ in range(10)])
        successes = results.count(200)
        print(f"  10 concurrent requests -> results: {results}")
        print(f"  Successful downloads: {successes} (must be exactly 1 for a one-time link)")
        if successes == 1:
            print("  PASS: atomic claim prevents double-download under concurrency")
        else:
            print(f"  FAIL: {successes} requests succeeded - one-time link was not atomic")


async def main():
    await test_functional_flow()
    await test_rbac()
    await test_race_condition()
    await test_brute_force()
    print("\n=== ALL TESTS COMPLETE ===")


if __name__ == "__main__":
    asyncio.run(main())
