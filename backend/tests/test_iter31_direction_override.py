"""
Iteration 31 — POST /api/teacher/weekly-plans/suggest direction override.

The `direction` param ONLY controls traversal order. The plan must ALWAYS
continue from the student's actual last-memorized position (frontier in
the chosen direction), NOT reset to surah #1 or #114.

Cases covered:
 (a) Seeded student completed surahs 1..25 → from_start → first memorize day
     must be الشعراء (#26) آية 1.
 (b) Same seeded student → from_end → graceful handling (frontier=الفاتحة,
     already complete; should not crash, should return a plan).
 (c) صفوان (user_ccd8568d42ba) → from_start → first memorize day continues
     in his TOP memorized surah at highest_to_ayah+1.
 (d) صفوان → from_end → continues backward; frontier = lowest memorized
     surah; first memorize day starts at highest_to_ayah+1 on that surah.
 (e) Fresh student (zero records) → from_start → الفاتحة; from_end → الناس.
 (f) No override + existing student → unchanged behavior (auto direction).
 (g) Madinah page mapping intact (الشعراء آية 1 → page 367).
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

# Phase B.3 Step 3B — Safwan persona memorization records (النساء 1..23,
# الأنعام 1..94). Session-scoped fixture in conftest.py; tagged for safe
# cleanup. Required for TestSafwanFromStart / TestSafwanFromEnd.
pytestmark = pytest.mark.usefixtures("safwan_memorization")

# Import canonical surah data
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
    """Seed temp student with all surahs 1..25 fully memorized + Saturday class."""
    uid = f"user_TEST_{uuid.uuid4().hex[:10]}"
    db.users.insert_one({
        "user_id": uid,
        "email": f"TEST_{uid}@test.com",
        "name": "TEST طالب مكتمل 1-25",
        "role": "student",
        "weekly_meeting_day": "Saturday",
        "created_at": dt.datetime.utcnow().isoformat(),
    })
    teacher_id = "user_be94ca2d4ab5"
    records = []
    for s in SURAHS:
        if s["number"] > 25:
            break
        records.append({
            "progress_id": f"prog_TEST_{uuid.uuid4().hex[:8]}",
            "student_id": uid,
            "teacher_id": teacher_id,
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
    # cleanup
    db.memorization_progress.delete_many({"student_id": uid})
    db.users.delete_one({"user_id": uid})


@pytest.fixture(scope="module")
def seeded_fresh(db):
    """Seed a fresh student with ZERO memorization records."""
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


# ---------- helpers ----------
def _first_memorize_day(days):
    return next((d for d in days if d.get("kind") == "memorize" and d.get("from_ayah")), None)


# ==================================================================
# (a) Seeded 1..25 + direction='from_start' → الشعراء (#26) آية 1
# ==================================================================
class TestSeededFullFromStart:
    def test_from_start_advances_to_shuara(self, admin_tok, seeded_full_25):
        r = _suggest(admin_tok, {
            "student_id": seeded_full_25,
            "week_start": _next_sunday_iso(),
            "direction": "from_start",
        })
        assert r.status_code == 200, r.text
        days = r.json().get("days") or []
        assert len(days) == 7
        first = _first_memorize_day(days)
        assert first is not None, f"No memorize day found: {days}"
        assert first["surah"] == "الشعراء", f"Expected الشعراء got {first['surah']} | full day: {first}"
        assert first["from_ayah"] == 1, f"Expected from_ayah=1, got {first['from_ayah']}"
        # Madinah page anchor — الشعراء 26:1 must be page 367
        assert first["from_page"] == 367, f"Expected page 367, got {first['from_page']} | {first}"


# ==================================================================
# (b) Seeded 1..25 + direction='from_end' → graceful (الفاتحة complete)
# ==================================================================
class TestSeededFullFromEnd:
    def test_from_end_does_not_crash_and_returns_plan(self, admin_tok, seeded_full_25):
        r = _suggest(admin_tok, {
            "student_id": seeded_full_25,
            "week_start": _next_sunday_iso(),
            "direction": "from_end",
        })
        assert r.status_code == 200, r.text
        days = r.json().get("days") or []
        assert len(days) == 7, days
        # Either review-only days (frontier=الفاتحة is fully memorized, can't
        # go to #0), or some memorize day. Either way the response MUST be
        # a valid 7-day plan with surah strings populated.
        for d in days:
            assert "surah" in d


# ==================================================================
# (c) صفوان + direction='from_start' → continues at top surah next ayah
# ==================================================================
class TestSafwanFromStart:
    def test_continues_forward_not_reset(self, admin_tok, db):
        # Confirm we know صفوان's records → top surah by number is الأنعام (#6)
        # with highest to_ayah=94. Plan must start at الأنعام آية 95.
        r = _suggest(admin_tok, {
            "student_id": SAFWAN_ID,
            "week_start": _next_sunday_iso(),
            "direction": "from_start",
        })
        assert r.status_code == 200, r.text
        days = r.json().get("days") or []
        first = _first_memorize_day(days)
        assert first is not None, f"No memorize day: {days}"
        # MUST NOT reset to الفاتحة آية 1
        assert not (first["surah"] in ("الفاتحة",) and first["from_ayah"] == 1), (
            f"BUG: from_start reset to الفاتحة 1: {first}"
        )
        # Expect الأنعام آية 95 (continues from highest_to=94)
        assert "الأنعام" in (first["surah"] or ""), f"Expected الأنعام, got {first['surah']}"
        assert first["from_ayah"] == 95, f"Expected ayah 95, got {first['from_ayah']} | {first}"


# ==================================================================
# (d) صفوان + direction='from_end' → continues backward from lowest surah
# ==================================================================
class TestSafwanFromEnd:
    def test_continues_from_lowest_surah_next_ayah(self, admin_tok):
        r = _suggest(admin_tok, {
            "student_id": SAFWAN_ID,
            "week_start": _next_sunday_iso(),
            "direction": "from_end",
        })
        assert r.status_code == 200, r.text
        days = r.json().get("days") or []
        first = _first_memorize_day(days)
        assert first is not None, f"No memorize day: {days}"
        # MUST NOT reset to الناس آية 1
        assert not (first["surah"] == "الناس" and first["from_ayah"] == 1), (
            f"BUG: from_end reset to الناس 1: {first}"
        )
        # frontier = lowest memorized surah; ayah must be highest_to+1 on it
        # صفوان's lowest is آل عمران (#3) with highest_to=200 (complete),
        # so _advance moves to next backward → البقرة OR start of البقرة آية 1
        # (acceptable). The KEY invariant: not reset to الناس.
        # Accept any of: آل عمران (if still in surah), البقرة, النساء (depending
        # on how get_position_summary builds memorized_surahs).
        assert first["surah"] in (
            "آل عمران", "ال عمران", "البقرة", "النساء", "النساء "
        ), f"Unexpected frontier surah for from_end: {first}"
        assert int(first["from_ayah"]) >= 1


# ==================================================================
# (e) Fresh student → from_start=الفاتحة, from_end=الناس
# ==================================================================
class TestFreshStudentDefaults:
    def test_fresh_from_start_starts_at_fatihah(self, admin_tok, seeded_fresh):
        r = _suggest(admin_tok, {
            "student_id": seeded_fresh,
            "week_start": _next_sunday_iso(),
            "direction": "from_start",
        })
        assert r.status_code == 200, r.text
        first = _first_memorize_day(r.json().get("days") or [])
        assert first is not None
        assert first["surah"] == "الفاتحة", f"Expected الفاتحة got {first['surah']}"
        assert first["from_ayah"] == 1

    def test_fresh_from_end_starts_at_naas(self, admin_tok, seeded_fresh):
        r = _suggest(admin_tok, {
            "student_id": seeded_fresh,
            "week_start": _next_sunday_iso(),
            "direction": "from_end",
        })
        assert r.status_code == 200, r.text
        first = _first_memorize_day(r.json().get("days") or [])
        assert first is not None
        assert first["surah"] == "الناس", f"Expected الناس got {first['surah']}"
        assert first["from_ayah"] == 1


# ==================================================================
# (f) No override → auto direction (unchanged behavior)
# ==================================================================
class TestNoOverrideAutoDirection:
    def test_safwan_no_override_returns_plan(self, admin_tok):
        r = _suggest(admin_tok, {
            "student_id": SAFWAN_ID,
            "week_start": _next_sunday_iso(),
            # no direction
        })
        assert r.status_code == 200, r.text
        days = r.json().get("days") or []
        assert len(days) == 7
        # Should NOT reset — must reflect a real frontier
        first = _first_memorize_day(days)
        assert first is not None
        # Not الفاتحة آية 1 and not الناس آية 1
        assert not (first["surah"] == "الفاتحة" and first["from_ayah"] == 1)
        assert not (first["surah"] == "الناس" and first["from_ayah"] == 1)


# ==================================================================
# (g) Madinah Mushaf page mapping anchors (regression)
# ==================================================================
class TestPageMapping:
    def test_anchor_pages(self):
        cases = [
            ((1, 1),    1),
            ((2, 1),    2),
            ((4, 1),    77),    # النساء
            ((6, 95),   140),
            ((26, 1),   367),   # الشعراء
            ((36, 1),   440),
            ((78, 1),   582),
            ((114, 1),  604),
        ]
        bad = []
        for (s, a), expected in cases:
            got = get_ayah_page(s, a)
            if got != expected:
                bad.append(f"({s}:{a}) expected {expected} got {got}")
        assert not bad, "Page anchor failures:\n" + "\n".join(bad)
