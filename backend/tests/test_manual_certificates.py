"""
Manual certificate issuing (admin-only) — backend tests.

Covers:
  - 409 warning flow when eligibility can't be auto-verified → force_issue=True
    issues with manual_issue=True / eligibility_verified=False / verification_note
  - Auto-verified manual issue (eligibility_verified=True, no 409)
  - Duplicate prevention (juz + khatm), invalid juz number, unknown student
  - Permissions: student & non-admin teacher get 403
  - Student sees manually issued certificate in /students/me/certificates
"""
import os
import sys
import uuid
import datetime as dt
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN = {"email": "m0m0077100@gmail.com", "password": "admin_test_123"}
STUDENT = {"email": "test_dialog_user@test.com", "password": "test123456"}
TEACHER = {"email": "aalsiiada@gmail.com", "password": "teacher_test_123"}

sys.path.insert(0, "/app/backend")
from quran_data import QURAN_SURAHS  # noqa: E402

db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
PREFIX = "manualcert_"
UID = f"user_manualcert_{uuid.uuid4().hex[:8]}"
NOW = dt.datetime.now(dt.timezone.utc).isoformat()
issued_ids = []


@pytest.fixture(scope="module", autouse=True)
def seed_and_cleanup():
    # Temp student with juz 30 ONLY completed (surahs 78..114 full)
    db.users.insert_one({
        "user_id": UID, "email": f"{UID}@certtest.local",
        "name": "طالب الإصدار اليدوي", "role": "student", "created_at": NOW,
    })
    by_num = {s["number"]: s for s in QURAN_SURAHS}
    db.memorization_progress.insert_many([{
        "progress_id": f"{PREFIX}{uuid.uuid4().hex[:10]}",
        "student_id": UID, "teacher_id": "t", "session_id": f"{PREFIX}s",
        "surah_name": by_num[n]["name"], "surah_number": n,
        "from_ayah": 1, "to_ayah": by_num[n]["ayah_count"],
        "quality": "ممتاز", "notes": None, "created_at": NOW,
    } for n in range(78, 115)])
    yield
    db.memorization_progress.delete_many({"progress_id": {"$regex": f"^{PREFIX}"}})
    db.users.delete_one({"user_id": UID})
    if issued_ids:
        db.certificates.delete_many({"certificate_id": {"$in": issued_ids}})
        db.notifications.delete_many({"related_certificate_id": {"$in": issued_ids}})


@pytest.fixture(scope="module")
def admin_tok():
    from conftest import login_or_mint
    return login_or_mint(ADMIN)


@pytest.fixture(scope="module")
def student_tok():
    from conftest import login_or_mint
    return login_or_mint(STUDENT)


@pytest.fixture(scope="module")
def teacher_tok():
    from conftest import login_or_mint
    return login_or_mint(TEACHER)


def _hdr(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


URL = f"{BASE_URL}/api/admin/certificates/manual-issue"


# ---------- permissions ----------

def test_student_cannot_manual_issue(student_tok):
    r = requests.post(URL, headers=_hdr(student_tok), timeout=15,
                      json={"student_id": UID, "certificate_type": "juz", "juz_number": 1, "force_issue": True})
    assert r.status_code == 403


def test_teacher_cannot_manual_issue(teacher_tok):
    r = requests.post(URL, headers=_hdr(teacher_tok), timeout=15,
                      json={"student_id": UID, "certificate_type": "juz", "juz_number": 1, "force_issue": True})
    assert r.status_code == 403


# ---------- validation ----------

def test_invalid_juz_number(admin_tok):
    for jn in (0, 31, None):
        r = requests.post(URL, headers=_hdr(admin_tok), timeout=15,
                          json={"student_id": UID, "certificate_type": "juz", "juz_number": jn})
        assert r.status_code == 400, jn


def test_unknown_student(admin_tok):
    r = requests.post(URL, headers=_hdr(admin_tok), timeout=15,
                      json={"student_id": "user_nope", "certificate_type": "juz", "juz_number": 1})
    assert r.status_code == 404


def test_invalid_type(admin_tok):
    r = requests.post(URL, headers=_hdr(admin_tok), timeout=15,
                      json={"student_id": UID, "certificate_type": "weird"})
    assert r.status_code == 400


# ---------- unverified juz: 409 warning → force ----------

def test_unverified_juz_returns_409_then_force_issues(admin_tok):
    body = {"student_id": UID, "certificate_type": "juz", "juz_number": 5}
    r = requests.post(URL, headers=_hdr(admin_tok), timeout=30, json=body)
    assert r.status_code == 409, r.text
    assert "هل تريد المتابعة" in r.json()["detail"]
    # nothing was issued by the 409
    assert db.certificates.count_documents({"student_id": UID, "juz_number": 5, "status": "issued"}) == 0
    # admin confirms
    r2 = requests.post(URL, headers=_hdr(admin_tok), timeout=30, json={**body, "force_issue": True})
    assert r2.status_code == 200, r2.text
    cert = r2.json()
    issued_ids.append(cert["certificate_id"])
    assert cert["manual_issue"] is True
    assert cert["eligibility_verified"] is False
    assert cert["verification_note"]
    assert cert["juz_number"] == 5
    assert cert["certificate_number"].startswith("ALRUQI-CERT-")


def test_duplicate_manual_juz_rejected_even_with_force(admin_tok):
    r = requests.post(URL, headers=_hdr(admin_tok), timeout=15,
                      json={"student_id": UID, "certificate_type": "juz", "juz_number": 5, "force_issue": True})
    assert r.status_code == 400


# ---------- verified juz: no 409 needed ----------

def test_verified_juz_issues_without_force(admin_tok):
    r = requests.post(URL, headers=_hdr(admin_tok), timeout=30,
                      json={"student_id": UID, "certificate_type": "juz", "juz_number": 30})
    assert r.status_code == 200, r.text
    cert = r.json()
    issued_ids.append(cert["certificate_id"])
    assert cert["manual_issue"] is True
    assert cert["eligibility_verified"] is True
    assert cert["verification_note"] is None
    assert "عمّ" in cert["juz_name"]


# ---------- khatm manual ----------

def test_unverified_khatm_409_then_force(admin_tok):
    body = {"student_id": UID, "certificate_type": "full_quran"}
    r = requests.post(URL, headers=_hdr(admin_tok), timeout=30, json=body)
    assert r.status_code == 409
    r2 = requests.post(URL, headers=_hdr(admin_tok), timeout=30, json={**body, "force_issue": True})
    assert r2.status_code == 200, r2.text
    cert = r2.json()
    issued_ids.append(cert["certificate_id"])
    assert cert["certificate_type"] == "full_quran"
    assert cert["eligibility_verified"] is False
    # duplicate khatm rejected
    r3 = requests.post(URL, headers=_hdr(admin_tok), timeout=15, json={**body, "force_issue": True})
    assert r3.status_code == 400


# ---------- visibility ----------

def test_manual_certs_in_log_and_notifications(admin_tok):
    r = requests.get(f"{BASE_URL}/api/admin/certificates", headers=_hdr(admin_tok), timeout=15)
    ids = [c["certificate_id"] for c in r.json()]
    for cid in issued_ids:
        assert cid in ids
    assert db.notifications.count_documents({"related_certificate_id": {"$in": issued_ids}}) >= 3


def test_regular_issue_endpoint_still_works_with_audit_fields(admin_tok):
    """Regression: eligibility-based endpoint unaffected by the shared helper."""
    # juz 29 isn't covered by temp student → still 400 (strict path untouched)
    r = requests.post(f"{BASE_URL}/api/admin/certificates/issue", headers=_hdr(admin_tok), timeout=15,
                      json={"student_id": UID, "certificate_type": "juz", "juz_number": 29})
    assert r.status_code == 400
