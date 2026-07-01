"""
Tests for new functionality (iteration 28):
1) DELETE /api/peers/slots/{slot_id}  (cancel an unbooked slot)
2) DELETE /api/peers/sessions/{peer_session_id}  (cancel a booked, future session)
3) POST /api/teacher/weekly-plans/suggest  (Madinah Mushaf page accuracy)
"""
import os
import datetime as dt
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://tajweed-platform-1.preview.emergentagent.com").rstrip("/")

STUDENT_A = {"email": "test_dialog_user@test.com", "password": "test123456"}   # creator
STUDENT_B = {"email": "osama38os8@gmail.com",      "password": "test123456"}   # booker
ADMIN     = {"email": "m0m0077100@gmail.com",      "password": "admin_test_123"}

from conftest import _resolve_user_id as _rid  # noqa: E402
STUDENT_A_ID = _rid(STUDENT_A["email"])
STUDENT_B_ID = _rid(STUDENT_B["email"])

# Phase B.3 Step 3B — memorization fixtures for the weekly-suggest tests
# below (TestSuggestWeeklyPlan).
# Phase B.3 Step 3C — peer-partnership fixture for TestCancelSlot /
# TestCancelSession (every /peers/slots and /peers/sessions endpoint
# requires an approved partnership between student_a and student_b).
pytestmark = pytest.mark.usefixtures(
    "safwan_memorization", "student_b_memorization", "peer_partnership"
)


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"Login failed for {creds['email']}: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok
    return tok


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def tokens():
    return {"A": _login(STUDENT_A), "B": _login(STUDENT_B), "AD": _login(ADMIN)}


# ============================================================
# 1) DELETE /api/peers/slots/{slot_id}
# ============================================================

class TestCancelSlot:
    def _create_slot(self, tok, note="TEST_cancel_slot"):
        sched = (dt.datetime.utcnow() + dt.timedelta(days=2, hours=2)).replace(microsecond=0).isoformat() + "Z"
        r = requests.post(
            f"{BASE_URL}/api/peers/slots",
            json={"scheduled_time": sched, "duration": 30,
                  "meet_link": "https://meet.google.com/cancel-test", "notes": note},
            headers=_hdr(tok),
        )
        assert r.status_code in (200, 201), r.text
        return r.json()["slot_id"]

    def test_creator_can_cancel_unbooked_slot(self, tokens):
        sid = self._create_slot(tokens["A"])
        r = requests.delete(f"{BASE_URL}/api/peers/slots/{sid}", headers=_hdr(tokens["A"]))
        assert r.status_code == 200, r.text
        # Verify it's gone
        r2 = requests.get(f"{BASE_URL}/api/peers/slots", headers=_hdr(tokens["A"]))
        assert r2.status_code == 200
        ids = [s["slot_id"] for s in r2.json()]
        assert sid not in ids

    def test_non_creator_cannot_cancel(self, tokens):
        sid = self._create_slot(tokens["A"], note="TEST_cancel_403")
        r = requests.delete(f"{BASE_URL}/api/peers/slots/{sid}", headers=_hdr(tokens["B"]))
        assert r.status_code == 403, r.text
        # Cleanup
        requests.delete(f"{BASE_URL}/api/peers/slots/{sid}", headers=_hdr(tokens["A"]))

    def test_nonexistent_slot_returns_404(self, tokens):
        r = requests.delete(f"{BASE_URL}/api/peers/slots/slot_does_not_exist_x", headers=_hdr(tokens["A"]))
        assert r.status_code == 404, r.text

    def test_booked_slot_returns_400(self, tokens):
        sid = self._create_slot(tokens["A"], note="TEST_cancel_400")
        # B books it
        b = requests.post(f"{BASE_URL}/api/peers/slots/{sid}/book", headers=_hdr(tokens["B"]))
        assert b.status_code in (200, 201), b.text
        psid = b.json()["peer_session_id"]
        # Now A tries to cancel slot -> 400
        r = requests.delete(f"{BASE_URL}/api/peers/slots/{sid}", headers=_hdr(tokens["A"]))
        assert r.status_code == 400, r.text
        # Cleanup via session-cancel (future session, A is creator)
        requests.delete(f"{BASE_URL}/api/peers/sessions/{psid}", headers=_hdr(tokens["A"]))


# ============================================================
# 2) DELETE /api/peers/sessions/{peer_session_id}
# ============================================================

class TestCancelSession:
    def _create_booked_session(self, tokens, hours_offset=2):
        sched = (dt.datetime.utcnow() + dt.timedelta(hours=hours_offset)).replace(microsecond=0).isoformat() + "Z"
        s = requests.post(
            f"{BASE_URL}/api/peers/slots",
            json={"scheduled_time": sched, "duration": 30,
                  "meet_link": "https://meet.google.com/session-cancel",
                  "notes": "TEST_cancel_session"},
            headers=_hdr(tokens["A"]),
        )
        assert s.status_code in (200, 201), s.text
        sid = s.json()["slot_id"]
        b = requests.post(f"{BASE_URL}/api/peers/slots/{sid}/book", headers=_hdr(tokens["B"]))
        assert b.status_code in (200, 201), b.text
        return sid, b.json()["peer_session_id"]

    def test_creator_can_cancel_future_session(self, tokens):
        sid, psid = self._create_booked_session(tokens)
        r = requests.delete(f"{BASE_URL}/api/peers/sessions/{psid}", headers=_hdr(tokens["A"]))
        assert r.status_code == 200, r.text
        # Both slot and session should be gone
        slots = requests.get(f"{BASE_URL}/api/peers/slots", headers=_hdr(tokens["A"])).json()
        assert sid not in [s["slot_id"] for s in slots]
        sessions = requests.get(f"{BASE_URL}/api/peers/sessions", headers=_hdr(tokens["A"])).json()
        assert psid not in [s["peer_session_id"] for s in sessions]

    def test_booker_can_cancel_future_session(self, tokens):
        sid, psid = self._create_booked_session(tokens)
        r = requests.delete(f"{BASE_URL}/api/peers/sessions/{psid}", headers=_hdr(tokens["B"]))
        assert r.status_code == 200, r.text

    def test_nonexistent_session_returns_404(self, tokens):
        r = requests.delete(f"{BASE_URL}/api/peers/sessions/psess_does_not_exist", headers=_hdr(tokens["A"]))
        assert r.status_code == 404, r.text

    def test_third_party_returns_403(self, tokens):
        # Admin is neither creator nor booker; should be 403
        sid, psid = self._create_booked_session(tokens)
        r = requests.delete(f"{BASE_URL}/api/peers/sessions/{psid}", headers=_hdr(tokens["AD"]))
        assert r.status_code == 403, r.text
        # Cleanup
        requests.delete(f"{BASE_URL}/api/peers/sessions/{psid}", headers=_hdr(tokens["A"]))

    def test_past_session_returns_400(self, tokens):
        """Create a slot+session in the past via Mongo to test the 400 'started' guard."""
        # Need direct Mongo to backdate. Use motor connection.
        from pymongo import MongoClient
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "test_database")
        cli = MongoClient(mongo_url)
        db = cli[db_name]

        sid, psid = self._create_booked_session(tokens, hours_offset=2)
        past_iso = (dt.datetime.utcnow() - dt.timedelta(hours=3)).replace(microsecond=0).isoformat() + "Z"
        db.peer_review_sessions.update_one({"peer_session_id": psid}, {"$set": {"scheduled_time": past_iso}})
        db.peer_review_slots.update_one({"slot_id": sid}, {"$set": {"scheduled_time": past_iso}})

        r = requests.delete(f"{BASE_URL}/api/peers/sessions/{psid}", headers=_hdr(tokens["A"]))
        assert r.status_code == 400, r.text
        detail = (r.json().get("detail") or "")
        assert "بدأت بالفعل" in detail or "لا يمكن إلغاؤها" in detail, detail
        # Cleanup manually
        db.peer_review_sessions.delete_one({"peer_session_id": psid})
        db.peer_review_slots.delete_one({"slot_id": sid})
        cli.close()


# ============================================================
# 3) POST /api/teacher/weekly-plans/suggest
# ============================================================

class TestSuggestWeeklyPlan:
    def test_suggest_for_student_a_full_shape(self, tokens):
        today = dt.date.today()
        # Sunday this week (Python weekday Mon=0..Sun=6 -> shift to Sunday=0 model)
        # Backend accepts any ISO date; just send next Sunday
        days_until_sun = (6 - today.weekday()) % 7
        week_start = (today + dt.timedelta(days=days_until_sun)).isoformat()

        r = requests.post(
            f"{BASE_URL}/api/teacher/weekly-plans/suggest",
            json={"student_id": STUDENT_A_ID, "week_start": week_start},
            headers=_hdr(tokens["AD"]),
        )
        assert r.status_code == 200, r.text
        data = r.json()
        days = data.get("days") or []
        assert len(days) == 7, f"Expected 7 days, got {len(days)}: {days}"

        for i, d in enumerate(days):
            assert d.get("surah"),           f"Day {i} missing surah: {d}"
            assert d.get("from_ayah") is not None, f"Day {i} missing from_ayah: {d}"
            assert d.get("to_ayah")   is not None, f"Day {i} missing to_ayah: {d}"
            assert d.get("page_range"),      f"Day {i} missing page_range: {d}"

        # Last (test/Saturday) day - must have all fields populated as well
        test_day = days[-1]
        for field in ("surah", "from_ayah", "to_ayah", "page_range"):
            assert test_day.get(field), f"Test day missing {field}: {test_day}"

    def test_suggest_for_student_b(self, tokens):
        today = dt.date.today()
        week_start = (today + dt.timedelta(days=((6 - today.weekday()) % 7))).isoformat()
        r = requests.post(
            f"{BASE_URL}/api/teacher/weekly-plans/suggest",
            json={"student_id": STUDENT_B_ID, "week_start": week_start},
            headers=_hdr(tokens["AD"]),
        )
        assert r.status_code == 200, r.text
        days = r.json().get("days") or []
        assert len(days) == 7
        for d in days:
            assert d.get("surah") and d.get("page_range")

    def test_suggest_missing_student_400(self, tokens):
        r = requests.post(
            f"{BASE_URL}/api/teacher/weekly-plans/suggest",
            json={"week_start": dt.date.today().isoformat()},
            headers=_hdr(tokens["AD"]),
        )
        assert r.status_code == 400, r.text

    def test_suggest_unknown_student_404(self, tokens):
        r = requests.post(
            f"{BASE_URL}/api/teacher/weekly-plans/suggest",
            json={"student_id": "user_does_not_exist_xyz",
                  "week_start": dt.date.today().isoformat()},
            headers=_hdr(tokens["AD"]),
        )
        assert r.status_code == 404, r.text

    def test_suggest_requires_teacher(self, tokens):
        r = requests.post(
            f"{BASE_URL}/api/teacher/weekly-plans/suggest",
            json={"student_id": STUDENT_A_ID,
                  "week_start": dt.date.today().isoformat()},
            headers=_hdr(tokens["A"]),  # student token
        )
        assert r.status_code in (401, 403), r.text


# ============================================================
# 4) Madinah Mushaf page-mapping anchors
# ============================================================

class TestPageAnchors:
    """Calls the helper indirectly through the suggest endpoint is heavy.
       Import the get_ayah_page function directly for exact-anchor checks.
    """

    def test_anchors_exact(self):
        import sys
        sys.path.insert(0, "/app/backend")
        from quran_data import get_ayah_page

        anchors = [
            ((1, 1),    1,   "Fatihah 1:1"),
            ((2, 1),    2,   "Baqarah 2:1"),
            ((6, 95),   140, "An'am 6:95"),
            ((36, 1),   440, "Yaseen 36:1"),
            ((78, 1),   582, "Naba 78:1"),
            ((114, 1),  604, "An-Naas 114:1"),
        ]
        failures = []
        for (s, a), expected, label in anchors:
            got = get_ayah_page(s, a)
            if got != expected:
                failures.append(f"{label}: expected page {expected}, got {got}")
        assert not failures, "Page anchor failures:\n" + "\n".join(failures)
