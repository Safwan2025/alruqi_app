"""
Backend tests for Competition Live Session (Phase 2):
- POST /competitions/{cid}/live/start
- GET  /competitions/live/{lid}
- POST /competitions/live/join
- POST /competitions/live/{lid}/leave
- POST /competitions/live/{lid}/begin
- POST /competitions/live/{lid}/end
Covers full happy path + error cases per review_request.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://tajweed-platform-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

TEACHER = {"email": "aalsiiada@gmail.com", "password": "teacher_test_123"}
STUDENT = {"email": "test_dialog_user@test.com", "password": "test123456"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json={**creds, "remember_me": False}, timeout=20)
    assert r.status_code == 200, f"Login failed for {creds['email']}: {r.status_code} {r.text}"
    data = r.json()
    return data["token"], data["user"]


@pytest.fixture(scope="module")
def teacher_session():
    token, user = _login(TEACHER)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s, user


@pytest.fixture(scope="module")
def student_session():
    token, user = _login(STUDENT)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s, user


# ----- helpers -----
def _create_competition(s, status="draft", title=None):
    payload = {
        "title": title or f"TEST_LiveComp_{int(time.time()*1000)}",
        "description": "auto-test",
        "category": "tajweed",
        "level": "beginner",
        "status": status,
    }
    r = s.post(f"{API}/competitions", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


def _add_question(s, cid):
    payload = {
        "question_text": "ما حكم النون الساكنة قبل الباء؟",
        "options": ["إظهار", "إقلاب", "إدغام", "إخفاء"],
        "correct_index": 1,
        "time_limit": 30,
        "points": 100,
    }
    r = s.post(f"{API}/competitions/{cid}/questions", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


def _publish(s, cid, title):
    r = s.put(
        f"{API}/competitions/{cid}",
        json={"title": title, "description": "auto-test", "category": "tajweed", "level": "beginner", "status": "published"},
    )
    assert r.status_code == 200, r.text


# ===== Tests =====

class TestLiveCompetitionFlow:

    def test_start_fails_when_not_published(self, teacher_session):
        s, _ = teacher_session
        comp = _create_competition(s, status="draft")
        cid = comp["competition_id"]
        _add_question(s, cid)
        r = s.post(f"{API}/competitions/{cid}/live/start")
        assert r.status_code == 400
        assert "نشر المسابقة" in r.json().get("detail", "")
        # cleanup
        s.delete(f"{API}/competitions/{cid}")

    def test_start_fails_when_no_questions(self, teacher_session):
        s, _ = teacher_session
        # create as draft (no questions), then publish manually via PUT
        comp = _create_competition(s, status="draft")
        cid = comp["competition_id"]
        _publish(s, cid, comp["title"])
        r = s.post(f"{API}/competitions/{cid}/live/start")
        assert r.status_code == 400
        assert "لا توجد أسئلة" in r.json().get("detail", "")
        s.delete(f"{API}/competitions/{cid}")

    def test_student_cannot_start_live(self, teacher_session, student_session):
        ts, _ = teacher_session
        ss, _ = student_session
        comp = _create_competition(ts, status="draft")
        cid = comp["competition_id"]
        _add_question(ts, cid)
        _publish(ts, cid, comp["title"])
        r = ss.post(f"{API}/competitions/{cid}/live/start")
        assert r.status_code == 403
        assert "للمعلمين والمشرفين" in r.json().get("detail", "")
        ts.delete(f"{API}/competitions/{cid}")

    def test_full_happy_flow(self, teacher_session, student_session):
        ts, t_user = teacher_session
        ss, s_user = student_session

        # 1. Prepare published comp with question
        comp = _create_competition(ts, status="draft")
        cid = comp["competition_id"]
        _add_question(ts, cid)
        _publish(ts, cid, comp["title"])

        # 2. Teacher starts live
        r = ts.post(f"{API}/competitions/{cid}/live/start")
        assert r.status_code == 200, r.text
        live = r.json()
        assert "live_id" in live and live["live_id"].startswith("live_")
        assert "join_code" in live
        code = live["join_code"]
        assert isinstance(code, str) and len(code) == 6 and code.isdigit(), f"bad code: {code}"
        assert live["status"] == "waiting"
        assert live["participants"] == []
        assert live["competition_title"] == comp["title"]
        assert live["host_name"] == t_user["name"]
        live_id = live["live_id"]

        # 3. Bad code formats
        r_bad = ss.post(f"{API}/competitions/live/join", json={"join_code": "abc"})
        assert r_bad.status_code == 400
        assert "6 أرقام" in r_bad.json().get("detail", "")

        # 4. Wrong (random) 6-digit code -> 404 'الكود غير صحيح'
        # Pick a numeric code that doesn't equal our real one
        wrong = "999999" if code != "999999" else "111111"
        r_w = ss.post(f"{API}/competitions/live/join", json={"join_code": wrong})
        assert r_w.status_code == 404
        assert "الكود غير صحيح" in r_w.json().get("detail", "")

        # 5. Begin with zero participants -> 400
        r_zero = ts.post(f"{API}/competitions/live/{live_id}/begin")
        assert r_zero.status_code == 400
        assert "لا يوجد طلاب" in r_zero.json().get("detail", "")

        # 6. Student joins (valid)
        r_j = ss.post(f"{API}/competitions/live/join", json={"join_code": code})
        assert r_j.status_code == 200, r_j.text
        joined = r_j.json()
        assert joined["live_id"] == live_id
        assert len(joined["participants"]) == 1
        assert joined["participants"][0]["user_id"] == s_user["user_id"]

        # 7. Idempotent re-join (no duplicate)
        r_j2 = ss.post(f"{API}/competitions/live/join", json={"join_code": code})
        assert r_j2.status_code == 200
        assert len(r_j2.json()["participants"]) == 1

        # 8. Teacher polls GET
        r_g = ts.get(f"{API}/competitions/live/{live_id}")
        assert r_g.status_code == 200
        assert len(r_g.json()["participants"]) == 1

        # 9. Teacher begins
        r_b = ts.post(f"{API}/competitions/live/{live_id}/begin")
        assert r_b.status_code == 200, r_b.text
        # GET again -> in_progress
        sess_now = ts.get(f"{API}/competitions/live/{live_id}").json()
        assert sess_now["status"] == "in_progress"
        assert sess_now.get("started_at")

        # 10. Join while in_progress -> 400
        r_late = ss.post(f"{API}/competitions/live/join", json={"join_code": code})
        assert r_late.status_code == 400
        assert "بدأت بالفعل" in r_late.json().get("detail", "")

        # 11. Teacher ends
        r_e = ts.post(f"{API}/competitions/live/{live_id}/end")
        assert r_e.status_code == 200
        sess_end = ts.get(f"{API}/competitions/live/{live_id}").json()
        assert sess_end["status"] == "ended"

        # 12. Join ended -> 400 'منتهية'
        r_after = ss.post(f"{API}/competitions/live/join", json={"join_code": code})
        assert r_after.status_code == 400
        assert "منتهية" in r_after.json().get("detail", "")

        # cleanup
        ts.delete(f"{API}/competitions/{cid}")

    def test_student_leave_waiting_room(self, teacher_session, student_session):
        ts, _ = teacher_session
        ss, s_user = student_session
        comp = _create_competition(ts, status="draft")
        cid = comp["competition_id"]
        _add_question(ts, cid)
        _publish(ts, cid, comp["title"])
        live = ts.post(f"{API}/competitions/{cid}/live/start").json()
        code = live["join_code"]
        live_id = live["live_id"]

        ss.post(f"{API}/competitions/live/join", json={"join_code": code})
        # leave
        r = ss.post(f"{API}/competitions/live/{live_id}/leave")
        assert r.status_code == 200

        # confirm removed from participants (from teacher view)
        sess = ts.get(f"{API}/competitions/live/{live_id}").json()
        assert all(p["user_id"] != s_user["user_id"] for p in sess["participants"])

        # cleanup
        ts.post(f"{API}/competitions/live/{live_id}/end")
        ts.delete(f"{API}/competitions/{cid}")
