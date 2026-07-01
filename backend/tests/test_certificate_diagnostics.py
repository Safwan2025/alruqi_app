"""
Certificate eligibility — DEEP detection + diagnostics tests (bug-fix iter).

User-reported bug: eligibility showed 'no pending certificates' even though
real DB records exist. Root causes fixed & covered here:
  1. Dirty Arabic surah names ('ال عمران', 'الملك ', 'الاسراء') now normalized.
  2. Multi-surah records ('المزمل والمدثر' 1-56, 'من قريش -الناس') parsed as spans.
  3. student_notes_archive recitation notes counted as a memorization source.
  4. New admin diagnostics endpoint explains WHY a student is(n't) eligible.
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

sys.path.insert(0, "/app/backend")
from quran_data import get_juz_page_range  # noqa: E402

db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
PREFIX = "certdiag_"
UID = f"user_certdiag_{uuid.uuid4().hex[:8]}"
NOW = dt.datetime.now(dt.timezone.utc).isoformat()


@pytest.fixture(scope="module", autouse=True)
def seed_and_cleanup():
    db.users.insert_one({
        "user_id": UID, "email": f"{UID}@certtest.local",
        "name": "طالب تشخيص الشهادات", "role": "student", "created_at": NOW,
    })
    # Juz 29 (الملك→المرسلات, pages 562-581) seeded with DIRTY real-world data:
    docs = [
        # trailing space + whole surah  → الملك pages 562-564
        {"surah_name": "الملك ", "from_ayah": 1, "to_ayah": 30},
        # normal                         → القلم 564-566
        {"surah_name": "القلم", "from_ayah": 1, "to_ayah": 52},
        # missing hamza                  → الحاقه/الحاقة 566-568
        {"surah_name": "الحاقه", "from_ayah": 1, "to_ayah": 52},
        # multi-surah with و             → المعارج+نوح 568-571
        {"surah_name": "المعارج ونوح", "from_ayah": 1, "to_ayah": 28},
        # comma multi + typo (المعرج)    → الجن 572-573
        {"surah_name": "الجن", "from_ayah": 1, "to_ayah": 28},
        # multi-surah المزمل والمدثر     → 574-577
        {"surah_name": "المزمل والمدثر", "from_ayah": 1, "to_ayah": 56},
        # range with dash                → القيامة-المرسلات 577-581
        {"surah_name": "القيامة - المرسلات", "from_ayah": 1, "to_ayah": 50},
        # garbage record (must be reported as unparsed, not crash)
        {"surah_name": "تلل", "from_ayah": 1, "to_ayah": 5},
    ]
    db.memorization_progress.insert_many([{
        "progress_id": f"{PREFIX}{uuid.uuid4().hex[:10]}",
        "student_id": UID, "teacher_id": "t", "session_id": f"{PREFIX}s",
        "quality": "ممتاز", "notes": None, "created_at": NOW, **d,
    } for d in docs])
    # One record arrives via student_notes_archive (session-linked recitation note)
    db.student_notes_archive.insert_one({
        "note_id": f"{PREFIX}{uuid.uuid4().hex[:10]}",
        "student_id": UID, "student_name": "طالب تشخيص الشهادات",
        "teacher_id": "t", "teacher_name": "م", "session_id": None,
        "note_type": "recitation", "title": "تسميع", "content": "ممتاز",
        "surah_name": "تبارك", "ayah_from": 1, "ayah_to": 30,
        "rating": "ممتاز", "created_at": NOW, "is_permanent": True,
    })
    yield
    db.memorization_progress.delete_many({"progress_id": {"$regex": f"^{PREFIX}"}})
    db.student_notes_archive.delete_many({"note_id": {"$regex": f"^{PREFIX}"}})
    db.users.delete_one({"user_id": UID})
    certs = [c["certificate_id"] for c in db.certificates.find({"student_id": UID})]
    if certs:
        db.certificates.delete_many({"certificate_id": {"$in": certs}})
        db.notifications.delete_many({"related_certificate_id": {"$in": certs}})


@pytest.fixture(scope="module")
def admin_tok():
    from conftest import login_or_mint
    return login_or_mint(ADMIN)


@pytest.fixture(scope="module")
def student_tok():
    from conftest import login_or_mint
    return login_or_mint(STUDENT)


def _hdr(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


def test_dirty_names_multi_surah_complete_juz29(admin_tok):
    """Dirty + multi-surah records must fully cover juz 29 (pages 562-581)."""
    r = requests.get(f"{BASE_URL}/api/admin/certificates/eligibility", headers=_hdr(admin_tok), timeout=60)
    assert r.status_code == 200, r.text
    row = next(s for s in r.json()["students"] if s["student_id"] == UID)
    assert 29 in [j["juz_number"] for j in row["completed_juz"]], \
        f"juz 29 must be complete; got {row['completed_juz']} covered={row['covered_pages_count']}"
    assert 29 in [j["juz_number"] for j in row["pending_juz"]]
    assert row["records_found"] == 9  # 8 progress + 1 notes-archive
    assert row["covered_pages_count"] >= 20


def test_diagnostics_endpoint_explains_everything(admin_tok):
    r = requests.get(f"{BASE_URL}/api/admin/certificates/diagnostics/{UID}", headers=_hdr(admin_tok), timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["records_found"] == 9
    assert d["covered_pages_count"] >= 20
    assert d["reason"]
    # juz breakdown covers all 30 with missing pages listed
    assert len(d["juz_breakdown"]) == 30
    j29 = next(j for j in d["juz_breakdown"] if j["juz_number"] == 29)
    assert j29["is_complete"] is True and j29["missing_pages"] == []
    # garbage record reported, not silently dropped
    assert any("تلل" in (u.get("surah_name") or "") for u in d["unparsed_records"])
    # notes-archive source visible in parsed records
    assert any(p["source"] == "student_notes_archive" for p in d["parsed_records"])
    # multi-surah span parsed (المزمل والمدثر → pages within 574-577)
    mm = next(p for p in d["parsed_records"] if "المزمل" in p["surah_name"])
    a, b = get_juz_page_range(29)
    assert a <= mm["from_page"] <= mm["to_page"] <= b


def test_diagnostics_admin_only(student_tok):
    r = requests.get(f"{BASE_URL}/api/admin/certificates/diagnostics/{UID}", headers=_hdr(student_tok), timeout=15)
    assert r.status_code == 403


def test_issue_uses_new_logic(admin_tok):
    """Issue juz-29 certificate built from the dirty records — must succeed."""
    r = requests.post(f"{BASE_URL}/api/admin/certificates/issue", headers=_hdr(admin_tok), timeout=30,
                      json={"student_id": UID, "certificate_type": "juz", "juz_number": 29})
    assert r.status_code == 200, r.text
    assert "تبارك" in r.json()["juz_name"]
    # after issue → no longer pending, diagnostics says all issued
    elig = requests.get(f"{BASE_URL}/api/admin/certificates/eligibility", headers=_hdr(admin_tok), timeout=60).json()
    row = next(s for s in elig["students"] if s["student_id"] == UID)
    assert 29 not in [j["juz_number"] for j in row["pending_juz"]]
    assert 29 in row["issued_juz_numbers"]


def test_not_complete_juz_still_rejected(admin_tok):
    r = requests.post(f"{BASE_URL}/api/admin/certificates/issue", headers=_hdr(admin_tok), timeout=15,
                      json={"student_id": UID, "certificate_type": "juz", "juz_number": 1})
    assert r.status_code == 400
