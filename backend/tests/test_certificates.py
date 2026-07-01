"""
Certificates system — end-to-end backend tests.

Covers the user's required scenarios:
 1. Student completes a juz (per real memorization_progress + 604-page
    Madinah Mushaf mapping) → appears as PENDING in admin eligibility.
 2. Admin issues a juz certificate (unique ALRUQI-CERT-YYYY-NNNN number).
 3. Certificate appears in the admin log + detail endpoint.
 4. Student sees the certificate in /students/me/certificates + gets an
    in-app notification.
 5. Student CANNOT issue / list / view admin certificate endpoints (403).
 6. Regular teacher (non-admin) CANNOT issue (403).
 7. Duplicate issue for the same juz is rejected (400).
 8. Issuing for a NOT-completed juz is rejected (400).
 9. Full-Quran student → full_quran_pending=True → khatm certificate issues
    with type 'full_quran'; duplicate khatm rejected.
10. /send re-notification endpoint works.

All seeded data is cleaned up afterwards.
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
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

ADMIN = {"email": "m0m0077100@gmail.com", "password": "admin_test_123"}
TEACHER = {"email": "aalsiiada@gmail.com", "password": "teacher_test_123"}
STUDENT = {"email": "test_dialog_user@test.com", "password": "test123456"}
from conftest import _resolve_user_id as _rid  # noqa: E402
STUDENT_ID = _rid(STUDENT["email"])

sys.path.insert(0, "/app/backend")
from quran_data import QURAN_SURAHS, get_juz_page_range  # noqa: E402

SEED_PREFIX = "certtest_"
FULLQ_USER_ID = f"user_certtest_{uuid.uuid4().hex[:8]}"

db = MongoClient(MONGO_URL)[DB_NAME]
issued_cert_ids = []


def _login(creds):
    from conftest import login_or_mint
    return login_or_mint(creds)


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _seed_records(student_id, surah_numbers):
    """Insert full-surah memorization records for the given surahs."""
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    by_num = {s["number"]: s for s in QURAN_SURAHS}
    docs = []
    for n in surah_numbers:
        meta = by_num[n]
        docs.append({
            "progress_id": f"{SEED_PREFIX}{uuid.uuid4().hex[:10]}",
            "student_id": student_id,
            "teacher_id": "user_be94ca2d4ab5",
            "teacher_name": "عمر النجار",
            "session_id": f"{SEED_PREFIX}session",
            "surah_name": meta["name"],
            "surah_number": n,
            "from_ayah": 1,
            "to_ayah": meta["ayah_count"],
            "quality": "ممتاز",
            "notes": "seed for certificate tests",
            "created_at": now,
        })
    db.memorization_progress.insert_many(docs)


@pytest.fixture(scope="module", autouse=True)
def seed_and_cleanup():
    # Juz 30 (pages 582-604) = surahs النبأ(78) .. الناس(114) complete
    _seed_records(STUDENT_ID, list(range(78, 115)))
    # Temp full-Quran student: every surah complete → all 604 pages covered
    db.users.insert_one({
        "user_id": FULLQ_USER_ID,
        "email": f"{FULLQ_USER_ID}@certtest.local",
        "name": "طالب الختم التجريبي",
        "role": "student",
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    })
    _seed_records(FULLQ_USER_ID, [s["number"] for s in QURAN_SURAHS])
    yield
    db.memorization_progress.delete_many({"progress_id": {"$regex": f"^{SEED_PREFIX}"}})
    db.users.delete_one({"user_id": FULLQ_USER_ID})
    if issued_cert_ids:
        db.certificates.delete_many({"certificate_id": {"$in": issued_cert_ids}})
        db.notifications.delete_many({"related_certificate_id": {"$in": issued_cert_ids}})


@pytest.fixture(scope="module")
def admin_tok():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def student_tok():
    return _login(STUDENT)


@pytest.fixture(scope="module")
def teacher_tok():
    return _login(TEACHER)


# ---------- eligibility detection ----------

def test_juz30_completion_detected_as_pending(admin_tok):
    r = requests.get(f"{BASE_URL}/api/admin/certificates/eligibility", headers=_hdr(admin_tok), timeout=30)
    assert r.status_code == 200, r.text
    rows = {s["student_id"]: s for s in r.json()["students"]}
    assert STUDENT_ID in rows
    row = rows[STUDENT_ID]
    assert 30 in [j["juz_number"] for j in row["completed_juz"]], "juz 30 must be detected complete"
    assert 30 in [j["juz_number"] for j in row["pending_juz"]], "juz 30 must be pending (no cert yet)"


def test_full_quran_student_detected(admin_tok):
    r = requests.get(f"{BASE_URL}/api/admin/certificates/eligibility", headers=_hdr(admin_tok), timeout=30)
    rows = {s["student_id"]: s for s in r.json()["students"]}
    row = rows[FULLQ_USER_ID]
    assert row["completed_count"] == 30
    assert row["full_quran_completed"] is True
    assert row["full_quran_pending"] is True


def test_juz_page_ranges_sane():
    assert get_juz_page_range(1) == (1, 21)
    assert get_juz_page_range(2) == (22, 41)
    assert get_juz_page_range(29) == (562, 581)
    assert get_juz_page_range(30) == (582, 604)


# ---------- permissions ----------

def test_student_cannot_use_admin_endpoints(student_tok):
    h = _hdr(student_tok)
    assert requests.get(f"{BASE_URL}/api/admin/certificates/eligibility", headers=h, timeout=15).status_code == 403
    assert requests.get(f"{BASE_URL}/api/admin/certificates", headers=h, timeout=15).status_code == 403
    r = requests.post(f"{BASE_URL}/api/admin/certificates/issue", headers=h, timeout=15,
                      json={"student_id": STUDENT_ID, "certificate_type": "juz", "juz_number": 30})
    assert r.status_code == 403, "student must NOT be able to issue a certificate for himself"


def test_regular_teacher_cannot_issue(teacher_tok):
    r = requests.post(f"{BASE_URL}/api/admin/certificates/issue", headers=_hdr(teacher_tok), timeout=15,
                      json={"student_id": STUDENT_ID, "certificate_type": "juz", "juz_number": 30})
    assert r.status_code == 403, "non-admin teacher must NOT be able to issue certificates"


# ---------- issuing juz certificate ----------

def test_admin_issues_juz30_certificate(admin_tok):
    r = requests.post(f"{BASE_URL}/api/admin/certificates/issue", headers=_hdr(admin_tok), timeout=30,
                      json={"student_id": STUDENT_ID, "certificate_type": "juz", "juz_number": 30})
    assert r.status_code == 200, r.text
    cert = r.json()
    issued_cert_ids.append(cert["certificate_id"])
    import re
    assert re.fullmatch(r"ALRUQI-CERT-\d{4}-\d{4}", cert["certificate_number"]), cert["certificate_number"]
    assert cert["certificate_type"] == "juz"
    assert cert["juz_number"] == 30
    assert "عمّ" in cert["juz_name"]
    assert cert["student_name"]
    assert cert["issued_by_name"]
    assert cert["supervisor_signature"]["type"] == "text"
    assert cert["status"] == "issued"
    assert cert["completion_date"]


def test_duplicate_juz_certificate_rejected(admin_tok):
    r = requests.post(f"{BASE_URL}/api/admin/certificates/issue", headers=_hdr(admin_tok), timeout=15,
                      json={"student_id": STUDENT_ID, "certificate_type": "juz", "juz_number": 30})
    assert r.status_code == 400


def test_not_completed_juz_rejected(admin_tok):
    # Juz 5 (pages 82-101, mid-النساء) — seeded student has only juz 30 area
    r = requests.post(f"{BASE_URL}/api/admin/certificates/issue", headers=_hdr(admin_tok), timeout=15,
                      json={"student_id": FULLQ_USER_ID + "_nope", "certificate_type": "juz", "juz_number": 5})
    assert r.status_code == 404  # unknown student
    elig = requests.get(f"{BASE_URL}/api/admin/certificates/eligibility", headers=_hdr(admin_tok), timeout=30).json()
    row = next(s for s in elig["students"] if s["student_id"] == STUDENT_ID)
    if 5 not in [j["juz_number"] for j in row["completed_juz"]]:
        r2 = requests.post(f"{BASE_URL}/api/admin/certificates/issue", headers=_hdr(admin_tok), timeout=15,
                           json={"student_id": STUDENT_ID, "certificate_type": "juz", "juz_number": 5})
        assert r2.status_code == 400, "issuing a not-completed juz must be rejected"


# ---------- log + student visibility ----------

def test_certificate_in_admin_log_and_detail(admin_tok):
    r = requests.get(f"{BASE_URL}/api/admin/certificates", headers=_hdr(admin_tok), timeout=15)
    assert r.status_code == 200
    ids = [c["certificate_id"] for c in r.json()]
    assert issued_cert_ids[0] in ids
    r2 = requests.get(f"{BASE_URL}/api/admin/certificates/{issued_cert_ids[0]}", headers=_hdr(admin_tok), timeout=15)
    assert r2.status_code == 200
    assert r2.json()["certificate_id"] == issued_cert_ids[0]


def test_student_sees_own_certificate(student_tok):
    r = requests.get(f"{BASE_URL}/api/students/me/certificates", headers=_hdr(student_tok), timeout=15)
    assert r.status_code == 200, r.text
    ids = [c["certificate_id"] for c in r.json()]
    assert issued_cert_ids[0] in ids


def test_notification_created_for_student():
    n = db.notifications.find_one({"related_certificate_id": issued_cert_ids[0], "user_id": STUDENT_ID})
    assert n is not None
    assert n["type"] == "certificate_issued"


def test_send_certificate_to_student(admin_tok):
    r = requests.post(f"{BASE_URL}/api/admin/certificates/{issued_cert_ids[0]}/send",
                      headers=_hdr(admin_tok), timeout=15)
    assert r.status_code == 200
    count = db.notifications.count_documents({"related_certificate_id": issued_cert_ids[0], "user_id": STUDENT_ID})
    assert count >= 2  # issue notification + send notification


# ---------- full-Quran (khatm) certificate ----------

def test_admin_issues_khatm_certificate(admin_tok):
    r = requests.post(f"{BASE_URL}/api/admin/certificates/issue", headers=_hdr(admin_tok), timeout=30,
                      json={"student_id": FULLQ_USER_ID, "certificate_type": "full_quran"})
    assert r.status_code == 200, r.text
    cert = r.json()
    issued_cert_ids.append(cert["certificate_id"])
    assert cert["certificate_type"] == "full_quran"
    assert cert["juz_number"] is None
    assert cert["completion_date"]
    # eligibility flips: pending → issued
    elig = requests.get(f"{BASE_URL}/api/admin/certificates/eligibility", headers=_hdr(admin_tok), timeout=30).json()
    row = next(s for s in elig["students"] if s["student_id"] == FULLQ_USER_ID)
    assert row["full_quran_issued"] is True
    assert row["full_quran_pending"] is False


def test_duplicate_khatm_rejected(admin_tok):
    r = requests.post(f"{BASE_URL}/api/admin/certificates/issue", headers=_hdr(admin_tok), timeout=15,
                      json={"student_id": FULLQ_USER_ID, "certificate_type": "full_quran"})
    assert r.status_code == 400


def test_khatm_not_eligible_rejected(admin_tok):
    # STUDENT_ID only has juz 30 → khatm must be rejected
    r = requests.post(f"{BASE_URL}/api/admin/certificates/issue", headers=_hdr(admin_tok), timeout=15,
                      json={"student_id": STUDENT_ID, "certificate_type": "full_quran"})
    assert r.status_code == 400
