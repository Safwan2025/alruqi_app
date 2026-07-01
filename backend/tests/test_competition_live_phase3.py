"""
Backend tests for Competition Live Session - Phase 3 (question answering):
- /begin now loads Q1 (current_question_index=0, current_question_id, question_started_at, total_questions)
- GET /competitions/live/{lid} embeds current_question (sanitized for student) + my_answer
- /next advances; returns 400 at last question; host/admin only
- /answer: student-only, in-participants, question_id match, selected_index range,
  time window + 2s grace, idempotent
- /complete blocks further answers/joins
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
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


def _create_published_comp_with_questions(s, n_questions=2, time_limit=30):
    payload = {
        "title": f"TEST_Phase3_{int(time.time()*1000)}",
        "description": "phase3-auto",
        "category": "tajweed",
        "level": "beginner",
        "status": "draft",
    }
    r = s.post(f"{API}/competitions", json=payload)
    assert r.status_code == 200, r.text
    comp = r.json()
    cid = comp["competition_id"]

    for i in range(n_questions):
        qpayload = {
            "question_text": f"سؤال رقم {i+1}؟",
            "options": ["خيار1", "خيار2", "خيار3", "خيار4"],
            "correct_index": (i % 4),
            "time_limit": time_limit,
            "points": 100,
        }
        rq = s.post(f"{API}/competitions/{cid}/questions", json=qpayload)
        assert rq.status_code == 200, rq.text

    # publish
    rp = s.put(
        f"{API}/competitions/{cid}",
        json={"title": payload["title"], "description": payload["description"],
              "category": "tajweed", "level": "beginner", "status": "published"},
    )
    assert rp.status_code == 200, rp.text
    return cid, payload["title"]


def _start_and_join(ts, ss, cid):
    rs = ts.post(f"{API}/competitions/{cid}/live/start")
    assert rs.status_code == 200, rs.text
    live = rs.json()
    lid = live["live_id"]
    code = live["join_code"]
    rj = ss.post(f"{API}/competitions/live/join", json={"join_code": code})
    assert rj.status_code == 200, rj.text
    return lid


class TestPhase3LiveQuestionAnswering:

    def test_begin_loads_q1_and_total_questions(self, teacher_session, student_session):
        ts, _ = teacher_session
        ss, _ = student_session
        cid, _ = _create_published_comp_with_questions(ts, n_questions=2)
        try:
            lid = _start_and_join(ts, ss, cid)

            # Before begin: total_questions should already be set on start
            sess_before = ts.get(f"{API}/competitions/live/{lid}").json()
            assert sess_before.get("total_questions") == 2
            assert sess_before.get("current_question_index", -1) == -1

            rb = ts.post(f"{API}/competitions/live/{lid}/begin")
            assert rb.status_code == 200, rb.text
            assert "تم بدء المسابقة" in rb.json().get("message", "")

            sess = ts.get(f"{API}/competitions/live/{lid}").json()
            assert sess["status"] == "in_progress"
            assert sess.get("current_question_index") == 0
            assert sess.get("current_question_id")
            assert sess.get("question_started_at")
            # host sees full current_question (with correct_index)
            cq = sess.get("current_question")
            assert cq is not None
            assert "correct_index" in cq
            assert isinstance(cq["correct_index"], int)
        finally:
            ts.post(f"{API}/competitions/live/{lid}/end")
            ts.delete(f"{API}/competitions/{cid}")

    def test_get_sanitizes_question_for_student_and_returns_my_answer(self, teacher_session, student_session):
        ts, _ = teacher_session
        ss, s_user = student_session
        cid, _ = _create_published_comp_with_questions(ts, n_questions=1)
        try:
            lid = _start_and_join(ts, ss, cid)
            ts.post(f"{API}/competitions/live/{lid}/begin")

            sess_student = ss.get(f"{API}/competitions/live/{lid}").json()
            cq = sess_student.get("current_question")
            assert cq is not None
            # correct_index MUST be stripped for student
            assert "correct_index" not in cq
            # my_answer should be None before answering
            assert sess_student.get("my_answer") is None

            qid = cq["question_id"]
            ra = ss.post(
                f"{API}/competitions/live/{lid}/answer",
                json={"question_id": qid, "selected_index": 2},
            )
            assert ra.status_code == 200, ra.text
            assert "تم تسجيل" in ra.json().get("message", "")

            sess_after = ss.get(f"{API}/competitions/live/{lid}").json()
            my = sess_after.get("my_answer")
            assert my is not None
            assert my.get("selected_index") == 2
            assert my.get("submitted_at")
        finally:
            ts.post(f"{API}/competitions/live/{lid}/end")
            ts.delete(f"{API}/competitions/{cid}")

    def test_answer_idempotent(self, teacher_session, student_session):
        ts, _ = teacher_session
        ss, _ = student_session
        cid, _ = _create_published_comp_with_questions(ts, n_questions=1)
        try:
            lid = _start_and_join(ts, ss, cid)
            ts.post(f"{API}/competitions/live/{lid}/begin")
            sess = ss.get(f"{API}/competitions/live/{lid}").json()
            qid = sess["current_question"]["question_id"]

            r1 = ss.post(f"{API}/competitions/live/{lid}/answer",
                         json={"question_id": qid, "selected_index": 1})
            assert r1.status_code == 200
            assert r1.json().get("selected_index") == 1

            # second attempt with different index -> returns first
            r2 = ss.post(f"{API}/competitions/live/{lid}/answer",
                         json={"question_id": qid, "selected_index": 3})
            assert r2.status_code == 200
            assert "مسبقاً" in r2.json().get("message", "")
            assert r2.json().get("selected_index") == 1
        finally:
            ts.post(f"{API}/competitions/live/{lid}/end")
            ts.delete(f"{API}/competitions/{cid}")

    def test_answer_validation_wrong_qid_and_out_of_range(self, teacher_session, student_session):
        ts, _ = teacher_session
        ss, _ = student_session
        cid, _ = _create_published_comp_with_questions(ts, n_questions=1)
        try:
            lid = _start_and_join(ts, ss, cid)
            ts.post(f"{API}/competitions/live/{lid}/begin")
            sess = ss.get(f"{API}/competitions/live/{lid}").json()
            qid = sess["current_question"]["question_id"]

            # wrong question_id
            r_wrong = ss.post(f"{API}/competitions/live/{lid}/answer",
                              json={"question_id": "qid_fake_xyz", "selected_index": 0})
            assert r_wrong.status_code == 400

            # selected_index out of range
            r_oor = ss.post(f"{API}/competitions/live/{lid}/answer",
                            json={"question_id": qid, "selected_index": 9})
            assert r_oor.status_code == 400
        finally:
            ts.post(f"{API}/competitions/live/{lid}/end")
            ts.delete(f"{API}/competitions/{cid}")

    def test_teacher_cannot_answer(self, teacher_session, student_session):
        ts, _ = teacher_session
        ss, _ = student_session
        cid, _ = _create_published_comp_with_questions(ts, n_questions=1)
        try:
            lid = _start_and_join(ts, ss, cid)
            ts.post(f"{API}/competitions/live/{lid}/begin")
            sess = ts.get(f"{API}/competitions/live/{lid}").json()
            qid = sess["current_question"]["question_id"]
            r = ts.post(f"{API}/competitions/live/{lid}/answer",
                        json={"question_id": qid, "selected_index": 0})
            # student-only -> 403
            assert r.status_code == 403
        finally:
            ts.post(f"{API}/competitions/live/{lid}/end")
            ts.delete(f"{API}/competitions/{cid}")

    def test_next_requires_host_and_advances(self, teacher_session, student_session):
        ts, _ = teacher_session
        ss, _ = student_session
        cid, _ = _create_published_comp_with_questions(ts, n_questions=2)
        try:
            lid = _start_and_join(ts, ss, cid)
            ts.post(f"{API}/competitions/live/{lid}/begin")

            # student cannot advance
            r_sn = ss.post(f"{API}/competitions/live/{lid}/next")
            assert r_sn.status_code == 403

            # host advances to Q2
            r_n = ts.post(f"{API}/competitions/live/{lid}/next")
            assert r_n.status_code == 200
            sess = ts.get(f"{API}/competitions/live/{lid}").json()
            assert sess.get("current_question_index") == 1

            # at last question -> next returns 400 with 'انتهت الأسئلة'
            r_end = ts.post(f"{API}/competitions/live/{lid}/next")
            assert r_end.status_code == 400
            assert "انتهت الأسئلة" in r_end.json().get("detail", "")
        finally:
            ts.post(f"{API}/competitions/live/{lid}/end")
            ts.delete(f"{API}/competitions/{cid}")

    def test_complete_blocks_further_actions(self, teacher_session, student_session):
        ts, _ = teacher_session
        ss, _ = student_session
        cid, _ = _create_published_comp_with_questions(ts, n_questions=1)
        try:
            lid = _start_and_join(ts, ss, cid)
            ts.post(f"{API}/competitions/live/{lid}/begin")
            sess = ss.get(f"{API}/competitions/live/{lid}").json()
            qid = sess["current_question"]["question_id"]
            join_code = None
            # fetch host view to get code
            host_view = ts.get(f"{API}/competitions/live/{lid}").json()
            join_code = host_view.get("join_code")

            # complete
            rc = ts.post(f"{API}/competitions/live/{lid}/complete")
            assert rc.status_code == 200
            sess_c = ts.get(f"{API}/competitions/live/{lid}").json()
            assert sess_c["status"] == "completed"

            # subsequent answer -> 400 'الجلسة ليست قيد التقدّم'
            ra = ss.post(f"{API}/competitions/live/{lid}/answer",
                         json={"question_id": qid, "selected_index": 0})
            assert ra.status_code == 400
            assert "قيد" in ra.json().get("detail", "")

            # subsequent join with same code -> 400 'منتهية بالفعل'
            if join_code:
                rj = ss.post(f"{API}/competitions/live/join", json={"join_code": join_code})
                assert rj.status_code == 400
                assert "منتهية" in rj.json().get("detail", "")
        finally:
            ts.delete(f"{API}/competitions/{cid}")

    def test_answer_time_window_grace(self, teacher_session, student_session):
        """time_limit=5s (min); with 2s grace, submitting after ~8s must fail."""
        ts, _ = teacher_session
        ss, _ = student_session
        cid, _ = _create_published_comp_with_questions(ts, n_questions=1, time_limit=5)
        try:
            lid = _start_and_join(ts, ss, cid)
            ts.post(f"{API}/competitions/live/{lid}/begin")
            sess = ss.get(f"{API}/competitions/live/{lid}").json()
            qid = sess["current_question"]["question_id"]

            # wait beyond grace window (5 + 2 = 7s)
            time.sleep(8)
            r = ss.post(f"{API}/competitions/live/{lid}/answer",
                        json={"question_id": qid, "selected_index": 0})
            assert r.status_code == 400, f"expected 400 after grace, got {r.status_code} {r.text}"
        finally:
            ts.post(f"{API}/competitions/live/{lid}/end")
            ts.delete(f"{API}/competitions/{cid}")
