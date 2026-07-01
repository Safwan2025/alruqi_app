"""
Public certificate verification endpoint — backend tests.

GET /api/public/certificates/verify/{certificate_number}
  - public (no token required)
  - returns valid:true + safe public fields for an existing issued certificate
  - never leaks sensitive fields (email/phone/_id/student_id/issued_by/notes/...)
  - returns 404 + valid:false for an unknown number (no crash)
  - does NOT break admin certificate endpoints
"""
import os
import uuid
import datetime as dt
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

CERT_NO = f"ALRUQI-CERT-2099-{uuid.uuid4().hex[:6].upper()}"
CERT_ID = f"verifytest_{uuid.uuid4().hex[:10]}"
NOW = dt.datetime.now(dt.timezone.utc).isoformat()
VERIFY = f"{BASE_URL}/api/public/certificates/verify"

SENSITIVE_KEYS = {
    "email", "phone", "_id", "student_id", "issued_by", "user_id",
    "notes", "mistakes", "corrections",
}


@pytest.fixture(scope="module", autouse=True)
def seed_and_cleanup():
    db.certificates.insert_one({
        "certificate_id": CERT_ID,
        "certificate_number": CERT_NO,
        "student_id": "user_secret_internal_id",
        "student_name": "عمر النجار",
        "certificate_type": "full_quran",
        "juz_number": None,
        "juz_name": None,
        "completion_date": "2026-07-25",
        "issued_at": NOW,
        "issued_by": "user_admin_secret_id",
        "issued_by_name": "الشيخ محمد حامد الأنصاري",
        "status": "issued",
        "platform": "مقرأة الرقي",
    })
    yield
    db.certificates.delete_one({"certificate_id": CERT_ID})


def test_verify_existing_certificate_is_public_and_valid():
    # no Authorization header -> must work (public)
    r = requests.get(f"{VERIFY}/{CERT_NO}", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["valid"] is True
    assert data["certificate_number"] == CERT_NO
    assert data["student_name"] == "عمر النجار"
    assert data["certificate_type"] == "full_quran"
    assert data["issuer_name"] == "الشيخ محمد حامد الأنصاري"
    assert data["institution_name"] == "مقرأة الرقي"
    assert data["status"] == "valid"


def test_verify_does_not_leak_sensitive_fields():
    r = requests.get(f"{VERIFY}/{CERT_NO}", timeout=15)
    assert r.status_code == 200
    data = r.json()
    leaked = SENSITIVE_KEYS.intersection(data.keys())
    assert not leaked, f"sensitive fields leaked: {leaked}"
    # specifically the internal ids we seeded must not appear anywhere
    blob = r.text
    assert "user_secret_internal_id" not in blob
    assert "user_admin_secret_id" not in blob


def test_verify_unknown_certificate_returns_404_no_crash():
    r = requests.get(f"{VERIFY}/ALRUQI-CERT-0000-NOPE99", timeout=15)
    assert r.status_code == 404
    data = r.json()
    assert data["valid"] is False
    assert "لم يتم العثور" in data["message"]


def test_verify_works_without_token_header():
    # explicit: even with an empty/garbage auth header it stays public
    r = requests.get(f"{VERIFY}/{CERT_NO}", headers={"Authorization": "Bearer not_a_real_token"}, timeout=15)
    assert r.status_code == 200
    assert r.json()["valid"] is True


def test_admin_certificate_endpoints_still_require_auth():
    # regression: admin listing must still be protected (401/403 without token)
    r = requests.get(f"{BASE_URL}/api/admin/certificates", timeout=15)
    assert r.status_code in (401, 403), r.text
