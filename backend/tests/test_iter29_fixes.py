"""Iteration 29 — Backend tests for 6 user-requested fixes.

Covers:
  Task 1: PUT /api/student/commitment accepts values > 1
  Task 4: POST /api/teacher/weekly-plans/suggest direction override
  Task 5: /api/admin/commitment-holidays CRUD + 403 for non-admin
  Task 6: DELETE /api/admin/student-warnings/{id} + 403 / 404
"""

import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

ADMIN_EMAIL = "m0m0077100@gmail.com"
ADMIN_PASS = "admin_test_123"
STUDENT_A_EMAIL = "test_dialog_user@test.com"
STUDENT_A_PASS = "test123456"
from conftest import _resolve_user_id as _rid  # noqa: E402
STUDENT_A_ID = _rid(STUDENT_A_EMAIL)

# Phase B.3 Step 3B — ensure the student has the memorization records the
# direction-override tests assume (frontier=الأنعام). Session-scoped fixture
# defined in conftest.py; cleanup is automatic and only removes pytest-tagged
# rows for this student.
pytestmark = pytest.mark.usefixtures("safwan_memorization")


# ---- shared fixtures ----
def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    j = r.json()
    return j.get("token") or j.get("access_token")


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def student_token():
    return _login(STUDENT_A_EMAIL, STUDENT_A_PASS)


@pytest.fixture(scope="module")
def mongo():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    cli.close()


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ==============================================================
# Task 1 — commitment input accepts values > 1
# ==============================================================
class TestCommitmentInputs:
    def test_set_commitment_3_and_5(self, student_token):
        payload = {"min_sessions_per_week": 3, "min_pages_per_week": 5}
        r = requests.put(f"{API}/student/commitment", headers=_h(student_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        # GET back via student-self endpoint
        r2 = requests.get(f"{API}/student/commitment", headers=_h(student_token), timeout=15)
        assert r2.status_code == 200, r2.text
        data = r2.json()
        c = data.get("commitment") or data
        assert c.get("min_sessions_per_week") == 3
        assert c.get("min_pages_per_week") == 5

    def test_set_commitment_large_values(self, student_token):
        payload = {"min_sessions_per_week": 25, "min_pages_per_week": 50}
        r = requests.put(f"{API}/student/commitment", headers=_h(student_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        r2 = requests.get(f"{API}/student/commitment", headers=_h(student_token), timeout=15)
        c = r2.json().get("commitment") or r2.json()
        assert c.get("min_sessions_per_week") == 25
        assert c.get("min_pages_per_week") == 50

    def test_zero_rejected(self, student_token):
        r = requests.put(f"{API}/student/commitment", headers=_h(student_token),
                         json={"min_sessions_per_week": 0, "min_pages_per_week": 1}, timeout=15)
        assert r.status_code == 400

    def test_restore_baseline(self, student_token):
        # restore to 1/1 so other tests/UI default stays clean
        r = requests.put(f"{API}/student/commitment", headers=_h(student_token),
                         json={"min_sessions_per_week": 1, "min_pages_per_week": 1}, timeout=15)
        assert r.status_code == 200


# ==============================================================
# Task 4 — direction override in suggest_weekly_plan
# ==============================================================
class TestDirectionOverride:
    def _post(self, admin_token, body):
        return requests.post(
            f"{API}/teacher/weekly-plans/suggest", headers=_h(admin_token), json=body, timeout=30
        )

    def test_from_end_continues_from_lowest_frontier(self, admin_token):
        """direction='from_end' must continue from the student's LOWEST
        memorized surah (next ayah after their last recorded position),
        NOT reset to الناس. This was corrected in iter31."""
        body = {
            "student_id": STUDENT_A_ID,
            "start_date": datetime.now(timezone.utc).date().isoformat(),
            "ayahs_per_day": 5,
            "direction": "from_end",
        }
        r = self._post(admin_token, body)
        assert r.status_code == 200, r.text
        data = r.json()
        days = data.get("days") or data.get("plan") or []
        assert len(days) >= 1, data
        first = next((d for d in days if d.get("kind") == "memorize"), days[0])
        surah_name = first.get("surah", "")
        # MUST NOT reset to الناس for an existing student with records
        assert "الناس" not in surah_name or first.get("from_ayah") != 1, \
            f"from_end must continue from frontier, not reset to الناس آية 1: {first}"
        # Direction in summary must be set correctly
        assert data.get("summary", {}).get("direction") == "from_end"

    def test_from_start_continues_from_highest_frontier(self, admin_token):
        """direction='from_start' must continue from the student's HIGHEST
        memorized surah's next position, NOT reset to الفاتحة."""
        body = {
            "student_id": STUDENT_A_ID,
            "start_date": datetime.now(timezone.utc).date().isoformat(),
            "ayahs_per_day": 5,
            "direction": "from_start",
        }
        r = self._post(admin_token, body)
        assert r.status_code == 200, r.text
        data = r.json()
        days = data.get("days") or []
        assert len(days) >= 1
        first = next((d for d in days if d.get("kind") == "memorize"), days[0])
        surah_name = first.get("surah", "")
        # MUST NOT reset to الفاتحة آية 1 for an existing student
        assert not (surah_name == "الفاتحة" and first.get("from_ayah") == 1), \
            f"from_start must continue from frontier, not reset to الفاتحة آية 1: {first}"
        assert data.get("summary", {}).get("direction") == "from_start"

    def test_no_direction_falls_back_to_auto(self, admin_token):
        body = {
            "student_id": STUDENT_A_ID,
            "start_date": datetime.now(timezone.utc).date().isoformat(),
            "ayahs_per_day": 5,
        }
        r = self._post(admin_token, body)
        assert r.status_code == 200, r.text
        days = r.json().get("days") or []
        assert len(days) >= 1


# ==============================================================
# Task 5 — commitment holidays
# ==============================================================
class TestCommitmentHolidays:
    def test_non_admin_forbidden_list(self, student_token):
        r = requests.get(f"{API}/admin/commitment-holidays", headers=_h(student_token), timeout=15)
        assert r.status_code == 403

    def test_non_admin_forbidden_post(self, student_token):
        r = requests.post(
            f"{API}/admin/commitment-holidays",
            headers=_h(student_token),
            json={"week_start": "2026-01-12", "reason": "test"},
            timeout=15,
        )
        assert r.status_code == 403

    def test_admin_crud_flow(self, admin_token, mongo):
        # Use a Monday well in the past to avoid colliding with real weeks
        monday_iso = "2025-09-01"  # Monday
        # cleanup any pre-existing
        mongo.commitment_holidays.delete_many({"week_start": {"$regex": "^2025-09-01"}})

        # CREATE
        r = requests.post(
            f"{API}/admin/commitment-holidays",
            headers=_h(admin_token),
            json={"week_start": monday_iso, "reason": "اختبار"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        hid = r.json().get("holiday_id")
        assert hid

        # LIST contains it
        r2 = requests.get(f"{API}/admin/commitment-holidays", headers=_h(admin_token), timeout=15)
        assert r2.status_code == 200
        items = r2.json()
        assert any(it.get("holiday_id") == hid for it in items)

        # Idempotent re-add
        r3 = requests.post(
            f"{API}/admin/commitment-holidays",
            headers=_h(admin_token),
            json={"week_start": monday_iso, "reason": "اختبار"},
            timeout=15,
        )
        assert r3.status_code == 200, r3.text

        # DELETE
        r4 = requests.delete(
            f"{API}/admin/commitment-holidays/{hid}", headers=_h(admin_token), timeout=15
        )
        assert r4.status_code == 200, r4.text

        # DELETE again → 404
        r5 = requests.delete(
            f"{API}/admin/commitment-holidays/{hid}", headers=_h(admin_token), timeout=15
        )
        assert r5.status_code == 404


# ==============================================================
# Task 6 — DELETE /admin/student-warnings/{id}
# ==============================================================
class TestDeleteWarning:
    def test_non_admin_forbidden(self, student_token):
        r = requests.delete(
            f"{API}/admin/student-warnings/nonexistent", headers=_h(student_token), timeout=15
        )
        assert r.status_code == 403

    def test_not_found(self, admin_token):
        r = requests.delete(
            f"{API}/admin/student-warnings/does_not_exist_xyz",
            headers=_h(admin_token),
            timeout=15,
        )
        assert r.status_code == 404

    def test_delete_warning_and_auto_unfreeze(self, admin_token, mongo):
        """Seed 1 warning, freeze user, delete → warning removed; since warn_count<3
        and is_frozen=True, user is auto-unfrozen."""
        sid = STUDENT_A_ID
        # cleanup
        mongo.student_warnings.delete_many({"student_id": sid, "warning_id": {"$regex": "^TEST_"}})
        wid = f"TEST_w_{uuid.uuid4().hex[:8]}"
        mongo.student_warnings.insert_one({
            "warning_id": wid,
            "student_id": sid,
            "reason": "TEST seeded",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        # Save original frozen state
        u = mongo.users.find_one({"user_id": sid}, {"_id": 0, "is_frozen": 1})
        orig_frozen = bool((u or {}).get("is_frozen"))
        mongo.users.update_one(
            {"user_id": sid},
            {"$set": {"is_frozen": True, "frozen_reason": "TEST", "frozen_at": datetime.now(timezone.utc).isoformat()}}
        )

        try:
            r = requests.delete(f"{API}/admin/student-warnings/{wid}", headers=_h(admin_token), timeout=15)
            assert r.status_code == 200, r.text
            body = r.json()
            assert "تم حذف الإنذار" in body.get("message", "")

            # Confirm gone
            doc = mongo.student_warnings.find_one({"warning_id": wid})
            assert doc is None

            # Confirm auto-unfrozen (since warn_count < 3 in last 90 days for TEST_ data)
            u2 = mongo.users.find_one({"user_id": sid}, {"_id": 0, "is_frozen": 1})
            assert bool((u2 or {}).get("is_frozen")) is False, "student should be auto-unfrozen"
        finally:
            # Restore original frozen state
            mongo.users.update_one(
                {"user_id": sid},
                {"$set": {"is_frozen": orig_frozen}}
            )
            mongo.student_warnings.delete_many({"student_id": sid, "warning_id": {"$regex": "^TEST_"}})


# ==============================================================
# Regression — peer cancel + suggest still 604-page mushaf (iter 28)
# ==============================================================
class TestRegressionIter28:
    def test_suggest_page_range_present(self, admin_token):
        body = {
            "student_id": STUDENT_A_ID,
            "start_date": datetime.now(timezone.utc).date().isoformat(),
            "ayahs_per_day": 5,
        }
        r = requests.post(f"{API}/teacher/weekly-plans/suggest", headers=_h(admin_token), json=body, timeout=30)
        assert r.status_code == 200
        days = r.json().get("days") or []
        assert len(days) == 7, f"expected 7 days, got {len(days)}"
        # at least one day has a page_range string
        assert any(d.get("page_range") for d in days), "no day has page_range"
