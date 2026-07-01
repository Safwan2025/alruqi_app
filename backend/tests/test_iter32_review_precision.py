"""
Iteration 32 — POST /api/teacher/weekly-plans/suggest review-day precision.

Spec (user correction):
  Review days must (a) ONLY pull from the student's actual memorized surahs
  (never الفاتحة/الناس by default, never random), and (b) include exact
  from_ayah / to_ayah / from_page / to_page based on the student's REAL
  memorization_progress records + the Madinah Mushaf 604-page mapping.
  The frontier surah (currently being memorized) is excluded from review.

Cases:
 1. صفوان (user_ccd8568d42ba) + from_start → review days target النساء
    (1..23) with pages 77..81 — NOT الأنعام (frontier), NOT الفاتحة.
 2. Seeded 1..25-complete student + from_start → reviews rotate النور
    (1..64, ص 350..359) then المؤمنون (1..118, ص 342..349) — full
    memorized ranges, exact pages, never empty ayahs.
 3. Fresh student (zero records) → review day text =
    'لا يوجد محفوظ سابق للمراجعة بعد' with empty surah / from_ayah / to_ayah.
 4. Student who only started the frontier surah → review falls back to
    that same surah with 1 → highest_to_recorded, NOT الفاتحة.
 5. General invariant: for any student with memorization records, NO
    review day in the response has empty from_ayah / to_ayah.
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
from conftest import _resolve_user_id as _rid  # noqa: E402
SAFWAN_ID = _rid("test_dialog_user@test.com")
TEACHER_ID = _rid("aalsiiada@gmail.com")

# Phase B.3 Step 3B — Safwan persona memorization records (النساء 1..23,
# الأنعام 1..94). Session-scoped fixture in conftest.py; tagged for safe
# cleanup. Required for TestSafwanReviewPrecision.
pytestmark = pytest.mark.usefixtures("safwan_memorization")

sys.path.insert(0, "/app/backend")
from quran_data import QURAN_SURAHS as SURAHS, get_ayah_page  # noqa: E402

SURAH_BY_NUM = {s["number"]: s for s in SURAHS}


# ---------- helpers ----------
def _login(creds):
    from conftest import login_or_mint
    return login_or_mint(creds)


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _next_sunday_iso():
    today = dt.date.today()
    return (today + dt.timedelta(days=((6 - today.weekday()) % 7))).isoformat()


def _suggest(tok, payload):
    return requests.post(
        f"{BASE_URL}/api/teacher/weekly-plans/suggest",
        json=payload, headers=_hdr(tok), timeout=30,
    )


def _review_days(days):
    return [d for d in days if d.get("kind") == "review"]


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin_tok():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def db():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    cli.close()


@pytest.fixture(scope="module")
def seeded_full_25(db):
    """Seed temp student with surahs 1..25 fully memorized."""
    uid = f"user_TEST_{uuid.uuid4().hex[:10]}"
    db.users.insert_one({
        "user_id": uid,
        "email": f"TEST_{uid}@test.com",
        "name": "TEST طالب مكتمل 1-25",
        "role": "student",
        "weekly_meeting_day": "Saturday",
        "created_at": dt.datetime.utcnow().isoformat(),
    })
    records = []
    for s in SURAHS:
        if s["number"] > 25:
            break
        records.append({
            "progress_id": f"prog_TEST_{uuid.uuid4().hex[:8]}",
            "student_id": uid,
            "teacher_id": TEACHER_ID,
            "session_id": "session_TEST_seed",
            "surah_name": s["name"],
            "surah_number": s["number"],
            "from_ayah": 1,
            "to_ayah": s["ayah_count"],
            "quality": "ممتاز",
            "notes": "TEST seed",
            "created_at": dt.datetime.utcnow().isoformat(),
        })
    db.memorization_progress.insert_many(records)
    yield uid
    db.memorization_progress.delete_many({"student_id": uid})
    db.users.delete_one({"user_id": uid})


@pytest.fixture(scope="module")
def seeded_fresh(db):
    """Fresh student — zero records."""
    uid = f"user_TEST_{uuid.uuid4().hex[:10]}"
    db.users.insert_one({
        "user_id": uid,
        "email": f"TEST_{uid}@test.com",
        "name": "TEST طالب جديد",
        "role": "student",
        "weekly_meeting_day": "Saturday",
        "created_at": dt.datetime.utcnow().isoformat(),
    })
    yield uid
    db.users.delete_one({"user_id": uid})


@pytest.fixture(scope="module")
def seeded_only_frontier(db):
    """Student with ONLY one partial record on the frontier surah (no others)."""
    uid = f"user_TEST_{uuid.uuid4().hex[:10]}"
    db.users.insert_one({
        "user_id": uid,
        "email": f"TEST_{uid}@test.com",
        "name": "TEST بداية حفظ بسورة واحدة",
        "role": "student",
        "weekly_meeting_day": "Saturday",
        "created_at": dt.datetime.utcnow().isoformat(),
    })
    db.memorization_progress.insert_one({
        "progress_id": f"prog_TEST_{uuid.uuid4().hex[:8]}",
        "student_id": uid,
        "teacher_id": TEACHER_ID,
        "session_id": "session_TEST_seed",
        "surah_name": "البقرة",
        "surah_number": 2,
        "from_ayah": 1,
        "to_ayah": 20,
        "quality": "ممتاز",
        "notes": "TEST seed only-frontier",
        "created_at": dt.datetime.utcnow().isoformat(),
    })
    yield uid
    db.memorization_progress.delete_many({"student_id": uid})
    db.users.delete_one({"user_id": uid})


# ==================================================================
# Case 1 — صفوان + from_start → reviews use النساء 1..23 (real range)
# ==================================================================
class TestSafwanReviewPrecision:
    def test_safwan_review_uses_real_nisaa_range(self, admin_tok):
        r = _suggest(admin_tok, {
            "student_id": SAFWAN_ID,
            "week_start": _next_sunday_iso(),
            "direction": "from_start",
        })
        assert r.status_code == 200, r.text
        payload = r.json()
        revs = _review_days(payload.get("days") or [])
        assert revs, f"No review days produced: {payload.get('days')}"

        # Every review day must be populated (Spec invariant)
        for d in revs:
            assert d["surah"], f"Empty surah in review day: {d}"
            assert d["from_ayah"] not in ("", None), f"Empty from_ayah: {d}"
            assert d["to_ayah"] not in ("", None), f"Empty to_ayah: {d}"
            assert d["from_page"] not in ("", None), f"Empty from_page: {d}"
            assert d["to_page"] not in ("", None), f"Empty to_page: {d}"

        # No review day should default to الفاتحة/الناس/الأنعام (frontier)
        for d in revs:
            assert d["surah"] != "الفاتحة", f"BUG: review defaulted to الفاتحة: {d}"
            assert d["surah"] != "الناس", f"BUG: review defaulted to الناس: {d}"
            # الأنعام is the frontier; reviews MUST exclude it
            assert "الأنعام" not in (d["surah"] or ""), (
                f"BUG: review included frontier الأنعام: {d}"
            )

        # First review must be النساء 1..23 (his real range, normalized)
        first = revs[0]
        assert "النساء" in first["surah"], f"Expected النساء first, got {first}"
        assert int(first["from_ayah"]) == 1, f"Expected from_ayah=1, got {first}"
        assert int(first["to_ayah"]) == 23, f"Expected to_ayah=23, got {first}"
        assert int(first["from_page"]) == 77, f"Expected from_page=77, got {first}"
        assert int(first["to_page"]) == 81, f"Expected to_page=81, got {first}"

    def test_safwan_review_pool_summary_excludes_frontier(self, admin_tok):
        r = _suggest(admin_tok, {
            "student_id": SAFWAN_ID,
            "week_start": _next_sunday_iso(),
            "direction": "from_start",
        })
        assert r.status_code == 200
        pool = (r.json().get("summary") or {}).get("review_pool") or []
        assert pool, f"Empty review_pool: {r.json().get('summary')}"
        assert all("الأنعام" not in p for p in pool), (
            f"review_pool leaked frontier الأنعام: {pool}"
        )
        # Should include النساء (his other memorized surah)
        assert any("النساء" in p for p in pool), f"Missing النساء in pool: {pool}"


# ==================================================================
# Case 2 — Seeded 1..25 + from_start → reviews rotate النور, المؤمنون...
# ==================================================================
class TestSeededReviewRotation:
    def test_reviews_rotate_by_recency(self, admin_tok, seeded_full_25):
        r = _suggest(admin_tok, {
            "student_id": seeded_full_25,
            "week_start": _next_sunday_iso(),
            "direction": "from_start",
        })
        assert r.status_code == 200, r.text
        revs = _review_days(r.json().get("days") or [])
        assert len(revs) >= 2, f"Expected >=2 review days, got {revs}"

        # Frontier = الفرقان (#25) → excluded. Most recent finished = النور (#24).
        r1 = revs[0]
        r2 = revs[1]
        assert r1["surah"] == "النور", f"Expected النور first, got {r1}"
        assert int(r1["from_ayah"]) == 1
        assert int(r1["to_ayah"]) == 64
        assert int(r1["from_page"]) == 350
        assert int(r1["to_page"]) == 359

        assert r2["surah"] == "المؤمنون", f"Expected المؤمنون second, got {r2}"
        assert int(r2["from_ayah"]) == 1
        assert int(r2["to_ayah"]) == 118
        assert int(r2["from_page"]) == 342
        assert int(r2["to_page"]) == 349

    def test_no_review_day_is_empty_when_records_exist(
        self, admin_tok, seeded_full_25
    ):
        r = _suggest(admin_tok, {
            "student_id": seeded_full_25,
            "week_start": _next_sunday_iso(),
            "direction": "from_start",
        })
        assert r.status_code == 200
        for d in _review_days(r.json().get("days") or []):
            # 'review_target' may carry a sentence; the ayah/page fields must
            # be populated for students with memorization records.
            assert d["surah"], f"Empty surah: {d}"
            assert d["from_ayah"] not in ("", None), f"Empty from_ayah: {d}"
            assert d["to_ayah"] not in ("", None), f"Empty to_ayah: {d}"


# ==================================================================
# Case 3 — Fresh student → no default الفاتحة/الناس in review
# ==================================================================
class TestFreshStudentReviewIsEmpty:
    def test_fresh_review_has_no_default_surah(self, admin_tok, seeded_fresh):
        r = _suggest(admin_tok, {
            "student_id": seeded_fresh,
            "week_start": _next_sunday_iso(),
            "direction": "from_start",
        })
        assert r.status_code == 200, r.text
        revs = _review_days(r.json().get("days") or [])
        assert revs, "Should still have review-day slots even if empty"
        for d in revs:
            # Empty surah/ayahs, and the expected message
            assert d["surah"] in ("", None), f"Fresh student review must have empty surah, got {d}"
            assert d["from_ayah"] in ("", None), f"Got from_ayah for fresh: {d}"
            assert d["to_ayah"] in ("", None), f"Got to_ayah for fresh: {d}"
            assert "لا يوجد محفوظ سابق" in (d.get("review_target") or ""), (
                f"Missing expected message for fresh student: {d}"
            )


# ==================================================================
# Case 4 — Only-frontier student → review falls back to frontier
# ==================================================================
class TestOnlyFrontierFallback:
    def test_review_falls_back_to_frontier_range(
        self, admin_tok, seeded_only_frontier
    ):
        r = _suggest(admin_tok, {
            "student_id": seeded_only_frontier,
            "week_start": _next_sunday_iso(),
            "direction": "from_start",
        })
        assert r.status_code == 200, r.text
        revs = _review_days(r.json().get("days") or [])
        assert revs, "Expected review-day slots"
        first = revs[0]
        # Must NOT be الفاتحة default
        assert first["surah"] != "الفاتحة", f"BUG: defaulted to الفاتحة: {first}"
        # Should be البقرة (the only memorized surah == frontier)
        assert first["surah"] == "البقرة", f"Expected البقرة fallback, got {first}"
        assert int(first["from_ayah"]) == 1
        # to_ayah must be the highest recorded (20)
        assert int(first["to_ayah"]) == 20, f"Expected to_ayah=20, got {first}"
        # Page mapping populated
        assert first["from_page"] not in ("", None)
        assert first["to_page"] not in ("", None)


# ==================================================================
# Case 5 — Regression: memorize-day logic from iter31 still works
# ==================================================================
class TestMemorizeDayRegression:
    def test_seeded_memorize_day_advances_to_shuara(
        self, admin_tok, seeded_full_25
    ):
        r = _suggest(admin_tok, {
            "student_id": seeded_full_25,
            "week_start": _next_sunday_iso(),
            "direction": "from_start",
        })
        assert r.status_code == 200
        days = r.json().get("days") or []
        first_mem = next(
            (d for d in days if d.get("kind") == "memorize" and d.get("from_ayah")),
            None,
        )
        assert first_mem is not None
        assert first_mem["surah"] == "الشعراء", first_mem
        assert int(first_mem["from_ayah"]) == 1
        assert int(first_mem["from_page"]) == 367

    def test_test_day_populated(self, admin_tok, seeded_full_25):
        r = _suggest(admin_tok, {
            "student_id": seeded_full_25,
            "week_start": _next_sunday_iso(),
            "direction": "from_start",
        })
        assert r.status_code == 200
        days = r.json().get("days") or []
        test_days = [d for d in days if d.get("kind") == "test"]
        assert test_days, f"Missing test day: {days}"
        td = test_days[0]
        assert td.get("review_target"), f"Empty test review_target: {td}"
        assert td.get("surah"), f"Empty test surah: {td}"


# ==================================================================
# Case 6 — Page mapping anchors (regression from iter31)
# ==================================================================
class TestPageMappingRegression:
    def test_anchor_pages(self):
        cases = [
            ((1, 1), 1),
            ((4, 1), 77),
            ((4, 23), 81),
            ((6, 95), 140),
            ((23, 1), 342),
            ((23, 118), 349),
            ((24, 1), 350),
            ((24, 64), 359),
            ((26, 1), 367),
            ((114, 1), 604),
        ]
        bad = []
        for (s, a), expected in cases:
            got = get_ayah_page(s, a)
            if got != expected:
                bad.append(f"({s}:{a}) expected {expected} got {got}")
        assert not bad, "Page anchor failures:\n" + "\n".join(bad)
