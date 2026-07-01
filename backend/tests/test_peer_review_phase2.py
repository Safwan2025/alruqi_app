"""
Phase 2 Peer Review + Weekly Plans regression tests.
Covers:
- Peer slot create / list
- Slot booking -> peer_session
- Attendance confirmation
- Evaluation (incl. idempotency)
- Teacher weekly plans CRUD
- Student weekly plans view
- Teacher peer overview
"""
import os
import time
import datetime as dt
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://tajweed-platform-1.preview.emergentagent.com").rstrip("/")

STUDENT_A = {"email": "test_dialog_user@test.com", "password": "test123456"}  # creator
STUDENT_B = {"email": "osama38os8@gmail.com", "password": "test123456"}       # booker
TEACHER   = {"email": "aalsiiada@gmail.com", "password": "teacher_test_123"}

from conftest import _resolve_user_id as _rid, PYTEST_PARTNERSHIP_ID as PARTNERSHIP_ID  # noqa: E402
STUDENT_A_ID = _rid(STUDENT_A["email"])

# Phase B.3 Step 3C — depend on the approved-partnership fixture so every
# /peers/* endpoint in this module finds an active partnership for A↔B.
# Session-scoped fixture in conftest.py; cleanup is precise.
pytestmark = pytest.mark.usefixtures("peer_partnership")


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
    return {
        "A": _login(STUDENT_A),
        "B": _login(STUDENT_B),
        "T": _login(TEACHER),
    }


# ---------------- Peer Review Phase 2 ----------------

class TestPeerPartnership:
    def test_partnership_me(self, tokens):
        r = requests.get(f"{BASE_URL}/api/peers/me/partnership", headers=_hdr(tokens["A"]))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("status") == "approved"
        assert data.get("partnership_id") == PARTNERSHIP_ID


class TestPeerSlotsAndSessions:
    slot_id = None
    psid = None

    def test_create_slot(self, tokens):
        sched = (dt.datetime.utcnow() + dt.timedelta(days=1, hours=20)).replace(microsecond=0).isoformat() + "Z"
        payload = {
            "scheduled_time": sched,
            "duration": 30,
            "meet_link": "https://meet.google.com/test-phase2",
            "notes": "TEST_Phase2_slot",
        }
        r = requests.post(f"{BASE_URL}/api/peers/slots", json=payload, headers=_hdr(tokens["A"]))
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert "slot_id" in data
        assert data.get("partnership_id") == PARTNERSHIP_ID
        TestPeerSlotsAndSessions.slot_id = data["slot_id"]

    def test_list_slots(self, tokens):
        r = requests.get(f"{BASE_URL}/api/peers/slots", headers=_hdr(tokens["A"]))
        assert r.status_code == 200, r.text
        slots = r.json()
        assert isinstance(slots, list)
        ids = [s.get("slot_id") for s in slots]
        assert TestPeerSlotsAndSessions.slot_id in ids

    def test_book_slot_by_b(self, tokens):
        sid = TestPeerSlotsAndSessions.slot_id
        assert sid, "slot_id missing"
        r = requests.post(f"{BASE_URL}/api/peers/slots/{sid}/book", headers=_hdr(tokens["B"]))
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert "peer_session_id" in data
        TestPeerSlotsAndSessions.psid = data["peer_session_id"]

    def test_session_listed(self, tokens):
        r = requests.get(f"{BASE_URL}/api/peers/sessions", headers=_hdr(tokens["B"]))
        assert r.status_code == 200, r.text
        sessions = r.json()
        ids = [s.get("peer_session_id") for s in sessions]
        assert TestPeerSlotsAndSessions.psid in ids


class TestAttendanceAndEvaluation:
    """Uses pre-existing seed session psess_bdcf92a63f7a which already has evaluations done.
       We create a fresh past-session via Mongo for evaluation idempotency check."""

    fresh_psid = None

    def test_create_past_session_via_api_then_backdate(self, tokens):
        past = (dt.datetime.utcnow() - dt.timedelta(hours=2)).replace(microsecond=0)
        slot_resp = requests.post(
            f"{BASE_URL}/api/peers/slots",
            json={"scheduled_time": past.isoformat() + "Z", "duration": 30,
                  "meet_link": "https://meet.google.com/test-eval", "notes": "TEST_eval_slot"},
            headers=_hdr(tokens["A"]),
        )
        assert slot_resp.status_code in (200, 201), slot_resp.text
        sid = slot_resp.json()["slot_id"]

        book_resp = requests.post(f"{BASE_URL}/api/peers/slots/{sid}/book", headers=_hdr(tokens["B"]))
        assert book_resp.status_code in (200, 201), book_resp.text
        TestAttendanceAndEvaluation.fresh_psid = book_resp.json()["peer_session_id"]

    def test_attendance_confirm_a(self, tokens):
        psid = TestAttendanceAndEvaluation.fresh_psid
        r = requests.post(f"{BASE_URL}/api/peers/sessions/{psid}/attendance",
                          json={"attended": True}, headers=_hdr(tokens["A"]))
        assert r.status_code == 200, r.text

    def test_attendance_confirm_b(self, tokens):
        psid = TestAttendanceAndEvaluation.fresh_psid
        r = requests.post(f"{BASE_URL}/api/peers/sessions/{psid}/attendance",
                          json={"attended": True}, headers=_hdr(tokens["B"]))
        assert r.status_code == 200, r.text

    def test_evaluate_a_to_b(self, tokens):
        psid = TestAttendanceAndEvaluation.fresh_psid
        payload = {
            "quality": "ممتاز",
            "surah_name": "البقرة",
            "from_ayah": 1,
            "to_ayah": 5,
            "mistakes_count": 0,
            "notes": "TEST eval from A",
        }
        r = requests.post(f"{BASE_URL}/api/peers/sessions/{psid}/evaluate", json=payload, headers=_hdr(tokens["A"]))
        assert r.status_code in (200, 201), r.text
        assert "evaluation_id" in r.json()

    def test_evaluate_a_idempotent(self, tokens):
        psid = TestAttendanceAndEvaluation.fresh_psid
        r = requests.post(f"{BASE_URL}/api/peers/sessions/{psid}/evaluate",
                          json={"quality": "ممتاز"}, headers=_hdr(tokens["A"]))
        assert r.status_code == 400, r.text
        msg = (r.json().get("detail") or r.json().get("message") or "")
        assert "مسبقاً" in msg, msg

    def test_evaluate_b_to_a(self, tokens):
        psid = TestAttendanceAndEvaluation.fresh_psid
        r = requests.post(f"{BASE_URL}/api/peers/sessions/{psid}/evaluate",
                          json={"quality": "جيد جداً", "notes": "TEST eval from B"},
                          headers=_hdr(tokens["B"]))
        assert r.status_code in (200, 201), r.text

    def test_list_evaluations(self, tokens):
        r = requests.get(f"{BASE_URL}/api/peers/evaluations", headers=_hdr(tokens["A"]))
        assert r.status_code == 200, r.text
        evals = r.json()
        assert isinstance(evals, list)
        assert len(evals) >= 2


# ---------------- Weekly Plans ----------------

class TestWeeklyPlans:
    plan_id = None

    def test_create_plan_as_teacher(self, tokens):
        # Find the next Sunday
        today = dt.date.today()
        offset = (6 - today.weekday()) % 7  # Sunday=6 in Python's weekday()? Actually Monday=0..Sunday=6
        week_start = (today + dt.timedelta(days=offset)).isoformat()
        payload = {
            "student_id": STUDENT_A_ID,
            "week_start": week_start,
            "days": [
                {"day": 1, "surah": "البقرة", "from_ayah": 1, "to_ayah": 5, "type": "حفظ"},
                {"day": 2, "surah": "البقرة", "from_ayah": 6, "to_ayah": 10, "type": "مراجعة"},
            ],
            "teacher_notes": "TEST_phase2 plan",
            "parent_notes": "ملاحظة لولي الأمر",
        }
        r = requests.post(f"{BASE_URL}/api/teacher/weekly-plans", json=payload, headers=_hdr(tokens["T"]))
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert "plan_id" in data
        TestWeeklyPlans.plan_id = data["plan_id"]

    def test_teacher_list_plans_for_student(self, tokens):
        r = requests.get(f"{BASE_URL}/api/teacher/students/{STUDENT_A_ID}/weekly-plans", headers=_hdr(tokens["T"]))
        assert r.status_code == 200, r.text
        plans = r.json()
        ids = [p.get("plan_id") for p in plans]
        assert TestWeeklyPlans.plan_id in ids

    def test_student_list_own_plans(self, tokens):
        r = requests.get(f"{BASE_URL}/api/student/weekly-plans", headers=_hdr(tokens["A"]))
        assert r.status_code == 200, r.text
        plans = r.json()
        ids = [p.get("plan_id") for p in plans]
        assert TestWeeklyPlans.plan_id in ids

    def test_teacher_peer_overview(self, tokens):
        r = requests.get(f"{BASE_URL}/api/teacher/students/{STUDENT_A_ID}/peer-overview", headers=_hdr(tokens["T"]))
        assert r.status_code == 200, r.text
        data = r.json()
        # Should expose partnership/sessions/evaluations objects
        assert any(k in data for k in ("partnership", "sessions", "evaluations"))

    def test_delete_plan(self, tokens):
        pid = TestWeeklyPlans.plan_id
        r = requests.delete(f"{BASE_URL}/api/teacher/weekly-plans/{pid}", headers=_hdr(tokens["T"]))
        assert r.status_code in (200, 204), r.text

        # Verify gone
        r2 = requests.get(f"{BASE_URL}/api/teacher/students/{STUDENT_A_ID}/weekly-plans", headers=_hdr(tokens["T"]))
        assert r2.status_code == 200
        ids = [p.get("plan_id") for p in r2.json()]
        assert pid not in ids
