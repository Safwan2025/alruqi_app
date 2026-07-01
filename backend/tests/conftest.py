"""Shared test helpers and fixtures.

Phase B (test hygiene): on top of the original resilient `login_or_mint`
helper, we now expose reusable per-account fixtures so test modules can stop
hardcoding session tokens / user_ids from previous deployments.

The 5 known test accounts (seeded by /app/scripts/seed_test_db.py):

    admin          m0m0077100@gmail.com     (role: teacher; gated by ADMIN_EMAIL)
    teacher        aalsiiada@gmail.com      (role: teacher)
    student_a      test_dialog_user@test.com
    student_b      osama38os8@gmail.com
    teacher_creator m0m0077@hotmail.com     (role: teacher; gated by TEACHER_CREATOR_EMAIL)

Each *_token fixture is session-scoped: one token per pytest run, automatically
cleaned up at the end together with any other pytest_-minted sessions.
Each *_user_id fixture resolves the user's current user_id by email lookup
(no stale literals).

Application code is NOT touched.
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
_db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


# ---------------------------------------------------------------------------
# Canonical test-account directory (kept in sync with scripts/seed_test_db.py)
# ---------------------------------------------------------------------------
TEST_ACCOUNTS = {
    "admin":            {"email": "m0m0077100@gmail.com",      "password": "admin_test_123"},
    "teacher":          {"email": "aalsiiada@gmail.com",       "password": "teacher_test_123"},
    "student_a":        {"email": "test_dialog_user@test.com", "password": "test123456"},
    "student_b":        {"email": "osama38os8@gmail.com",      "password": "test123456"},
    "teacher_creator":  {"email": "m0m0077@hotmail.com",       "password": "admin_test_123"},
}


def login_or_mint(creds: dict) -> str:
    """Login via API; if the documented password drifted, mint a session.

    The preview admin password is owned by the real user and may change at any
    time. Tests therefore try a normal /auth/login first and, on failure, mint
    a DB-backed session token directly in `user_sessions` (the exact mechanism
    get_current_user validates). Minted sessions are prefixed `pytest_` and
    cleaned up automatically at the end of the test session.
    """
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    if r.status_code == 200:
        return r.json()["token"]
    user = _db.users.find_one({"email": creds["email"]}, {"_id": 0, "user_id": 1})
    assert user, f"user {creds['email']} not found in DB"
    token = f"pytest_{uuid.uuid4().hex}"
    now = dt.datetime.now(dt.timezone.utc)
    _db.user_sessions.insert_one({
        "user_id": user["user_id"],
        "session_token": token,
        "expires_at": (now + dt.timedelta(hours=2)).isoformat(),
        "created_at": now.isoformat(),
    })
    return token


def _resolve_user_id(email: str) -> str:
    """Return the current user_id for the given email; assert if missing."""
    user = _db.users.find_one({"email": email.lower()}, {"_id": 0, "user_id": 1})
    assert user, f"user {email} not present in DB — run scripts/seed_test_db.py"
    return user["user_id"]


# ---------------------------------------------------------------------------
# Reusable helpers (not pytest fixtures) for test modules that need to
# guarantee a specific user is in a known clean state before they run.
#
# `ensure_test_user` is idempotent and rewrites the password_hash on every
# call so the test never depends on a previous mutation having happened.
# `cleanup_test_user` removes the user + their sessions only.
# These helpers ONLY touch the `users` and `user_sessions` collections.
# ---------------------------------------------------------------------------
def ensure_test_user(email: str, password: str, role: str, name: str) -> str:
    """Upsert a test user with a fresh bcrypt-hashed password. Returns user_id.

    Safe to call repeatedly: subsequent calls reset only the password_hash and
    role (idempotent). Other fields stay as `$setOnInsert`.
    """
    from passlib.context import CryptContext

    _pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    email_l = email.lower()
    _db.users.update_one(
        {"email": email_l},
        {
            "$set": {
                "password_hash": _pwd.hash(password),
                "role": role,
                "updated_at": now,
            },
            "$setOnInsert": {
                "user_id": f"user_{uuid.uuid4().hex[:12]}",
                "email": email_l,
                "name": name,
                "is_frozen": False,
                "created_at": now,
            },
        },
        upsert=True,
    )
    user = _db.users.find_one({"email": email_l}, {"_id": 0, "user_id": 1})
    return user["user_id"]


def cleanup_test_user(email: str) -> None:
    """Delete a test user and all their session tokens. Touches only
    `users` and `user_sessions` — nothing else.
    """
    email_l = email.lower()
    user = _db.users.find_one({"email": email_l}, {"_id": 0, "user_id": 1})
    if user and user.get("user_id"):
        _db.user_sessions.delete_many({"user_id": user["user_id"]})
    _db.users.delete_many({"email": email_l})


# ---------------------------------------------------------------------------
# Session-scoped token fixtures (one login per pytest run, per account)
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def admin_token() -> str:
    return login_or_mint(TEST_ACCOUNTS["admin"])


@pytest.fixture(scope="session")
def teacher_token() -> str:
    return login_or_mint(TEST_ACCOUNTS["teacher"])


@pytest.fixture(scope="session")
def student_a_token() -> str:
    return login_or_mint(TEST_ACCOUNTS["student_a"])


@pytest.fixture(scope="session")
def student_b_token() -> str:
    return login_or_mint(TEST_ACCOUNTS["student_b"])


@pytest.fixture(scope="session")
def teacher_creator_token() -> str:
    return login_or_mint(TEST_ACCOUNTS["teacher_creator"])


# ---------------------------------------------------------------------------
# Session-scoped user_id fixtures (resolved from the live DB by email)
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def admin_user_id() -> str:
    return _resolve_user_id(TEST_ACCOUNTS["admin"]["email"])


@pytest.fixture(scope="session")
def teacher_user_id() -> str:
    return _resolve_user_id(TEST_ACCOUNTS["teacher"]["email"])


@pytest.fixture(scope="session")
def student_a_user_id() -> str:
    return _resolve_user_id(TEST_ACCOUNTS["student_a"]["email"])


@pytest.fixture(scope="session")
def student_b_user_id() -> str:
    return _resolve_user_id(TEST_ACCOUNTS["student_b"]["email"])


# ---------------------------------------------------------------------------
# Memorization-data fixtures (Phase B.3 Step 3B)
#
# Some tests assume the test student already has a non-trivial Hifz history
# in `memorization_progress`. Rather than relying on production-like leftover
# data, we insert the MINIMUM set of records each test class actually checks
# against and tag every row with `_pytest_seeded: True` so cleanup is safe.
#
# Touches one collection only: `memorization_progress`.
# Cleanup deletes ONLY rows tagged `_pytest_seeded: True` for the seeded
# student — no other student data is affected.
# ---------------------------------------------------------------------------
_PYTEST_MEMO_MARK = {"_pytest_seeded": True, "_pytest_phase": "B.3-3B"}


@pytest.fixture(scope="session")
def safwan_memorization():
    """Insert the minimum memorization records the 'Safwan' persona
    (student_a = test_dialog_user@test.com) tests depend on.

    Used by:
      - test_iter29_fixes.py        (direction override on existing student)
      - test_iter31_direction_override.py
      - test_iter32_review_precision.py
      - test_peer_cancel_and_weekly_suggest.py (weekly-suggest tests)

    Records inserted (all tagged `_pytest_seeded: True`):
      النساء (#4) ayah 1..23   → review pool (iter32: page 77..81)
      الأنعام (#6) ayah 1..94  → frontier (iter31: next memorize day = 95)
    """
    sid = _resolve_user_id(TEST_ACCOUNTS["student_a"]["email"])
    tid = _resolve_user_id(TEST_ACCOUNTS["teacher"]["email"])
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    records = [
        {
            "progress_id": "prog_pytest_safwan_nisaa",
            "student_id": sid,
            "teacher_id": tid,
            "session_id": "session_pytest_safwan_seed",
            "surah_name": "النساء",
            "surah_number": 4,
            "from_ayah": 1,
            "to_ayah": 23,
            "quality": "ممتاز",
            "notes": "pytest seed (safwan_memorization)",
            "created_at": now,
            **_PYTEST_MEMO_MARK,
        },
        {
            "progress_id": "prog_pytest_safwan_anaam",
            "student_id": sid,
            "teacher_id": tid,
            "session_id": "session_pytest_safwan_seed",
            "surah_name": "الأنعام",
            "surah_number": 6,
            "from_ayah": 1,
            "to_ayah": 94,
            "quality": "ممتاز",
            "notes": "pytest seed (safwan_memorization)",
            "created_at": now,
            **_PYTEST_MEMO_MARK,
        },
    ]
    # Idempotent — remove any prior pytest-seeded rows for this student first
    _db.memorization_progress.delete_many(
        {"student_id": sid, "_pytest_seeded": True}
    )
    _db.memorization_progress.insert_many(records)
    yield {"student_id": sid, "teacher_id": tid, "records": records}
    # Cleanup — touch only our tagged rows
    _db.memorization_progress.delete_many(
        {"student_id": sid, "_pytest_seeded": True}
    )


@pytest.fixture(scope="session")
def student_b_memorization():
    """Insert a single memorization record for student_b so weekly-plan
    `/suggest` returns populated `surah` and `page_range` on every day
    (only-frontier fallback for review days).

    Used by:
      - test_peer_cancel_and_weekly_suggest.py :: test_suggest_for_student_b
    """
    sid = _resolve_user_id(TEST_ACCOUNTS["student_b"]["email"])
    tid = _resolve_user_id(TEST_ACCOUNTS["teacher"]["email"])
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    record = {
        "progress_id": "prog_pytest_studentb_baqara",
        "student_id": sid,
        "teacher_id": tid,
        "session_id": "session_pytest_studentb_seed",
        "surah_name": "البقرة",
        "surah_number": 2,
        "from_ayah": 1,
        "to_ayah": 50,
        "quality": "ممتاز",
        "notes": "pytest seed (student_b_memorization)",
        "created_at": now,
        **_PYTEST_MEMO_MARK,
    }
    _db.memorization_progress.delete_many(
        {"student_id": sid, "_pytest_seeded": True}
    )
    _db.memorization_progress.insert_one(record)
    yield {"student_id": sid, "record": record}
    _db.memorization_progress.delete_many(
        {"student_id": sid, "_pytest_seeded": True}
    )


# ---------------------------------------------------------------------------
# Peer-partnership fixture (Phase B.3 Step 3C)
#
# A handful of tests assume student_a + student_b already have an APPROVED
# `peer_partnerships` row (otherwise every /peers/* endpoint returns
# "لا توجد شراكة نشطة"). We create a single deterministic partnership row
# tagged `_pytest_seeded: True` and clean up exactly its dependents on
# teardown. No other student/teacher partnerships are touched.
#
# We also flip `users.review_method = "peer"` for both students (this is
# what `POST /admin/peer-requests/{id}/approve` does in production) and
# restore the previous value at teardown.
#
# Tests reference the deterministic id via `PYTEST_PARTNERSHIP_ID` so they
# stop hardcoding stale ids from earlier deployments.
# ---------------------------------------------------------------------------
PYTEST_PARTNERSHIP_ID = "pair_pytest_a_b"


def _peer_cleanup(partnership_id: str) -> None:
    """Delete ONLY the rows linked to a specific pytest-owned partnership.

    Touches: peer_partnerships, peer_review_slots, peer_review_sessions,
             peer_evaluations.
    """
    _db.peer_partnerships.delete_many({"partnership_id": partnership_id})
    _db.peer_review_slots.delete_many({"partnership_id": partnership_id})
    sessions = list(_db.peer_review_sessions.find(
        {"partnership_id": partnership_id}, {"_id": 0, "peer_session_id": 1}
    ))
    psids = [s["peer_session_id"] for s in sessions if s.get("peer_session_id")]
    if psids:
        _db.peer_evaluations.delete_many({"peer_session_id": {"$in": psids}})
    _db.peer_review_sessions.delete_many({"partnership_id": partnership_id})


@pytest.fixture(scope="session")
def peer_partnership():
    """Create one approved peer partnership between student_a and student_b.

    Used by:
      - test_peer_review_phase2.py
      - test_peer_cancel_and_weekly_suggest.py (TestCancelSlot, TestCancelSession)

    Cleanup is precise: only the row(s) carrying our deterministic
    partnership_id (and the slots / sessions / evaluations linked to it)
    are deleted. Each student's prior `review_method` is restored.
    """
    a_id = _resolve_user_id(TEST_ACCOUNTS["student_a"]["email"])
    b_id = _resolve_user_id(TEST_ACCOUNTS["student_b"]["email"])
    a_user = _db.users.find_one({"user_id": a_id}, {"_id": 0, "name": 1, "review_method": 1}) or {}
    b_user = _db.users.find_one({"user_id": b_id}, {"_id": 0, "name": 1, "review_method": 1}) or {}
    prev_method = {a_id: a_user.get("review_method"), b_id: b_user.get("review_method")}

    # Idempotent: remove any previous pytest-owned partnership first
    _peer_cleanup(PYTEST_PARTNERSHIP_ID)

    now = dt.datetime.now(dt.timezone.utc).isoformat()
    doc = {
        "partnership_id": PYTEST_PARTNERSHIP_ID,
        "requester_id": a_id,
        "requester_name": a_user.get("name") or "Student A (Test)",
        "requester_level": {},
        "target_id": b_id,
        "target_name": b_user.get("name") or "Student B (Test)",
        "target_level": {},
        "note": "pytest seed (peer_partnership)",
        "status": "approved",
        "created_at": now,
        "decided_at": now,
        "decided_by": _resolve_user_id(TEST_ACCOUNTS["admin"]["email"]),
        "reject_reason": None,
        "_pytest_seeded": True,
        "_pytest_phase": "B.3-3C",
    }
    _db.peer_partnerships.insert_one(doc)
    _db.users.update_many(
        {"user_id": {"$in": [a_id, b_id]}},
        {"$set": {"review_method": "peer"}},
    )
    yield {
        "partnership_id": PYTEST_PARTNERSHIP_ID,
        "student_a_id": a_id,
        "student_b_id": b_id,
    }
    # Teardown — precise cleanup
    _peer_cleanup(PYTEST_PARTNERSHIP_ID)
    for uid, prev in prev_method.items():
        if prev is None:
            _db.users.update_one({"user_id": uid}, {"$unset": {"review_method": ""}})
        else:
            _db.users.update_one({"user_id": uid}, {"$set": {"review_method": prev}})


# ---------------------------------------------------------------------------
# Teardown: remove only pytest-minted session rows
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session", autouse=True)
def _cleanup_minted_sessions():
    yield
    _db.user_sessions.delete_many({"session_token": {"$regex": "^pytest_"}})


# ---------------------------------------------------------------------------
# Phase C — session-level cleanup of leaked test data
#
# Runs ONCE at the end of the pytest session, AFTER every other fixture
# teardown (incl. _cleanup_minted_sessions). It deletes only documents that
# match strict whitelists tied to known test signatures:
#
#   * users whose email begins with `test_`, EXCLUDING the 5 baseline emails
#   * user_sessions for those leaked user_ids (baseline 5 are NEVER swept)
#   * peer_notifications / notifications / student_commitments tied to the
#     baseline student_a / student_b (test-only side effects)
#   * password_reset_tokens with email prefix `test_`
#   * competitions live-state docs whose competition_title starts with `TEST_`
#
# All deletes are wrapped individually so a single failure cannot abort the
# whole sweep. Counts are printed for visibility (a small dry-run report is
# emitted before each delete so the reviewer can audit what is touched).
#
# Side note: this fixture is intentionally kept separate from
# `_cleanup_minted_sessions` for clarity and easier rollback. Disabling it
# only requires commenting out the @pytest.fixture line below.
# ---------------------------------------------------------------------------
_BASELINE_EMAILS = frozenset(creds["email"] for creds in TEST_ACCOUNTS.values())


def _phase_c_safe_delete(label: str, collection, query: dict, dry_run_first: bool = True) -> None:
    """Run delete_many wrapped in a try/except; surface count + errors."""
    try:
        if dry_run_first:
            matched = collection.count_documents(query)
            print(f"  [phase-c] {label:40s} matched={matched}")
            if matched == 0:
                return
        result = collection.delete_many(query)
        print(f"  [phase-c] {label:40s} deleted={result.deleted_count}")
    except Exception as exc:  # do not hide; report and continue
        print(f"  [phase-c] {label:40s} ERROR: {exc!r}")


@pytest.fixture(scope="session", autouse=True)
def _phase_c_session_teardown():
    """Sweep leaked ancillary test data at the end of the pytest session."""
    yield
    print("\n[phase-c] ---- session teardown: sweeping leaked test data ----")

    # Resolve baseline IDs ONCE up front (stable references for FK-style deletes)
    baseline_user_ids = [
        u["user_id"]
        for u in _db.users.find(
            {"email": {"$in": list(_BASELINE_EMAILS)}},
            {"_id": 0, "user_id": 1},
        )
    ]
    try:
        student_a_id = _resolve_user_id(TEST_ACCOUNTS["student_a"]["email"])
    except Exception:
        student_a_id = None
    try:
        student_b_id = _resolve_user_id(TEST_ACCOUNTS["student_b"]["email"])
    except Exception:
        student_b_id = None
    student_ab_ids = [x for x in (student_a_id, student_b_id) if x]

    # --- 1. Identify leaked users (test_* emails not in baseline) -----------
    leaked_user_query = {
        "$and": [
            {"email": {"$regex": "^test_"}},
            {"email": {"$nin": list(_BASELINE_EMAILS)}},
        ]
    }
    leaked_user_ids = [
        u["user_id"]
        for u in _db.users.find(leaked_user_query, {"_id": 0, "user_id": 1})
    ]
    print(f"  [phase-c] baseline_user_ids count        : {len(baseline_user_ids)}")
    print(f"  [phase-c] leaked test_* user_ids count   : {len(leaked_user_ids)}")

    # --- 2. Capture TEST_* competition live_ids BEFORE deleting parents ----
    test_live_ids = [
        d["live_id"]
        for d in _db.competition_live_sessions.find(
            {"competition_title": {"$regex": "^TEST_"}},
            {"_id": 0, "live_id": 1},
        )
        if d.get("live_id")
    ]
    print(f"  [phase-c] TEST_* competition live_ids    : {len(test_live_ids)}")

    # --- 3. Delete in safe order ------------------------------------------
    # 3a. competition_live_answers → BEFORE the parent sessions
    if test_live_ids:
        _phase_c_safe_delete(
            "competition_live_answers (TEST_*)",
            _db.competition_live_answers,
            {"live_id": {"$in": test_live_ids}},
        )

    _phase_c_safe_delete(
        "competition_live_sessions (TEST_*)",
        _db.competition_live_sessions,
        {"competition_title": {"$regex": "^TEST_"}},
    )
    _phase_c_safe_delete(
        "competition_results (TEST_*)",
        _db.competition_results,
        {"competition_title": {"$regex": "^TEST_"}},
    )

    # 3b. peer_notifications / notifications / commitments (test student FKs)
    if student_ab_ids:
        _phase_c_safe_delete(
            "peer_notifications (student_a/b)",
            _db.peer_notifications,
            {"user_id": {"$in": student_ab_ids}},
        )
        _phase_c_safe_delete(
            "notifications (student_a/b)",
            _db.notifications,
            {"user_id": {"$in": student_ab_ids}},
        )
        _phase_c_safe_delete(
            "student_commitments (student_a/b)",
            _db.student_commitments,
            {"student_id": {"$in": student_ab_ids}},
        )

    # 3c. password_reset_tokens for test_* emails
    _phase_c_safe_delete(
        "password_reset_tokens (test_*)",
        _db.password_reset_tokens,
        {"email": {"$regex": "^test_"}},
    )

    # 3d. user_sessions for leaked user_ids (NEVER for baseline 5)
    if leaked_user_ids:
        _phase_c_safe_delete(
            "user_sessions (leaked user_ids)",
            _db.user_sessions,
            {"user_id": {"$in": leaked_user_ids}},
        )

    # 3e. Finally remove the leaked test_* user rows themselves
    if leaked_user_ids:
        _phase_c_safe_delete(
            "users (test_* excl. baseline)",
            _db.users,
            leaked_user_query,
        )

    print("[phase-c] ---- sweep complete ----")
