"""
Test: Cross-Teacher Attendance Confirmation
Tests that ANY teacher can confirm attendance for ANY session (not just their own)
Also tests that attendance_confirmed_by field is saved correctly

Phase B.3 Step 4 cleanup:
* Uses the active preview DB from MONGO_URL/DB_NAME (no more hardcoded `test_database`).
* Uses ISO string timestamps (compatible with get_current_user) instead of BSON Date.
* Drops the mongosh subprocess shell-out in favor of direct pymongo writes.
* Application code is NOT touched.
"""
import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
_db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _iso_in(**kwargs) -> str:
    return (datetime.now(timezone.utc) + timedelta(**kwargs)).isoformat()


def _create_user(user_id: str, role: str, name: str) -> None:
    _db.users.insert_one({
        "user_id": user_id,
        "email": f"{user_id}@test.com",
        "name": name,
        "role": role,
        "created_at": _iso_now(),
    })


def _create_session_token(user_id: str, token: str) -> None:
    _db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": token,
        "expires_at": _iso_in(days=7),
        "created_at": _iso_now(),
    })


def _create_lesson(session_id: str, student_id: str, teacher_id: str,
                   teacher_name: str = "Teacher A Test",
                   student_name: str = "Test Student",
                   scheduled_time: str = None) -> None:
    _db.sessions.insert_one({
        "session_id": session_id,
        "student_id": student_id,
        "teacher_id": teacher_id,
        "teacher_name": teacher_name,
        "student_name": student_name,
        "scheduled_time": scheduled_time or _iso_in(hours=-1),
        "duration": 60,
        "status": "scheduled",
        "created_at": _iso_now(),
    })


class TestCrossTeacherAttendance:
    """Test that any teacher can confirm attendance on any session"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data - create two teachers and a student"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

        self.teacher_a_id = f"test_teacher_a_{uuid.uuid4().hex[:8]}"
        self.teacher_a_token = f"test_session_{uuid.uuid4().hex}"
        self.teacher_b_id = f"test_teacher_b_{uuid.uuid4().hex[:8]}"
        self.teacher_b_token = f"test_session_{uuid.uuid4().hex}"
        self.student_id = f"test_student_{uuid.uuid4().hex[:8]}"

        _create_user(self.teacher_a_id, "teacher", "Teacher A Test")
        _create_session_token(self.teacher_a_id, self.teacher_a_token)

        _create_user(self.teacher_b_id, "teacher", "Teacher B Test")
        _create_session_token(self.teacher_b_id, self.teacher_b_token)

        _create_user(self.student_id, "student", "Test Student")

        yield

        _db.users.delete_many(
            {"user_id": {"$in": [self.teacher_a_id, self.teacher_b_id, self.student_id]}}
        )
        _db.user_sessions.delete_many(
            {"session_token": {"$in": [self.teacher_a_token, self.teacher_b_token]}}
        )
        _db.sessions.delete_many({"student_id": self.student_id})

    def test_teacher_b_can_confirm_attendance_on_teacher_a_session(self):
        """CRITICAL TEST: Teacher B should be able to confirm attendance on Teacher A's session"""
        session_id = f"test_session_{uuid.uuid4().hex[:12]}"
        _create_lesson(session_id, self.student_id, self.teacher_a_id)

        response = self.session.put(
            f"{BASE_URL}/api/sessions/{session_id}/attendance",
            json={"attended": True},
            headers={"Authorization": f"Bearer {self.teacher_b_token}"},
        )

        assert response.status_code == 200, \
            f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        assert "message" in data
        assert "حاضر" in data["message"]

        print("SUCCESS: Teacher B confirmed attendance on Teacher A's session")

    def test_attendance_confirmed_by_field_is_saved(self):
        """Test that attendance_confirmed_by field is saved with the confirming teacher's ID"""
        session_id = f"test_session_{uuid.uuid4().hex[:12]}"
        _create_lesson(session_id, self.student_id, self.teacher_a_id)

        response = self.session.put(
            f"{BASE_URL}/api/sessions/{session_id}/attendance",
            json={"attended": True},
            headers={"Authorization": f"Bearer {self.teacher_b_token}"},
        )

        assert response.status_code == 200

        session_data = _db.sessions.find_one(
            {"session_id": session_id},
            {"_id": 0, "attendance_confirmed": 1,
             "attendance_confirmed_by": 1, "attendance_confirmed_at": 1},
        )

        assert session_data["attendance_confirmed"] is True
        assert session_data["attendance_confirmed_by"] == self.teacher_b_id, \
            f"Expected {self.teacher_b_id}, got {session_data['attendance_confirmed_by']}"
        assert session_data["attendance_confirmed_at"] is not None

        print(f"SUCCESS: attendance_confirmed_by field saved correctly as {self.teacher_b_id}")

    def test_teacher_can_mark_absent(self):
        """Test that teacher can mark student as absent"""
        session_id = f"test_session_{uuid.uuid4().hex[:12]}"
        _create_lesson(session_id, self.student_id, self.teacher_a_id)

        response = self.session.put(
            f"{BASE_URL}/api/sessions/{session_id}/attendance",
            json={"attended": False},
            headers={"Authorization": f"Bearer {self.teacher_b_token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert "غائب" in data["message"]

        print("SUCCESS: Teacher can mark student as absent")

    def test_student_cannot_confirm_attendance(self):
        """Test that students cannot confirm attendance (only teachers)"""
        student_token = f"test_session_{uuid.uuid4().hex}"
        _create_session_token(self.student_id, student_token)

        try:
            session_id = f"test_session_{uuid.uuid4().hex[:12]}"
            _create_lesson(session_id, self.student_id, self.teacher_a_id)

            response = self.session.put(
                f"{BASE_URL}/api/sessions/{session_id}/attendance",
                json={"attended": True},
                headers={"Authorization": f"Bearer {student_token}"},
            )

            assert response.status_code == 403, \
                f"Expected 403, got {response.status_code}"

            print("SUCCESS: Student cannot confirm attendance (403 returned)")
        finally:
            _db.user_sessions.delete_one({"session_token": student_token})


class TestMySessionsRecitationLink:
    """Test that GET /sessions/my-sessions enriches sessions with teacher's current recitation_link"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

        self.student_id = f"test_student_{uuid.uuid4().hex[:8]}"
        self.student_token = f"test_session_{uuid.uuid4().hex}"

        self.teacher_id = f"test_teacher_{uuid.uuid4().hex[:8]}"
        self.teacher_recitation_link = "https://meet.google.com/test-link-123"

        # Teacher with recitation_link
        _db.users.insert_one({
            "user_id": self.teacher_id,
            "email": f"{self.teacher_id}@test.com",
            "name": "Test Teacher",
            "role": "teacher",
            "recitation_link": self.teacher_recitation_link,
            "created_at": _iso_now(),
        })

        # Student + session token
        _create_user(self.student_id, "student", "Test Student")
        _create_session_token(self.student_id, self.student_token)

        yield

        _db.users.delete_many({"user_id": {"$in": [self.teacher_id, self.student_id]}})
        _db.user_sessions.delete_many({"session_token": self.student_token})
        _db.sessions.delete_many({"student_id": self.student_id})

    def test_my_sessions_enriches_with_teacher_recitation_link(self):
        """Test that sessions without recitation_link get enriched with teacher's current link"""
        session_id = f"test_session_{uuid.uuid4().hex[:12]}"
        _create_lesson(
            session_id,
            self.student_id,
            self.teacher_id,
            teacher_name="Test Teacher",
            scheduled_time=_iso_in(hours=1),
        )

        response = self.session.get(
            f"{BASE_URL}/api/sessions/my-sessions",
            headers={"Authorization": f"Bearer {self.student_token}"},
        )

        assert response.status_code == 200
        sessions = response.json()

        test_session = next((s for s in sessions if s["session_id"] == session_id), None)
        assert test_session is not None, "Test session not found in response"

        assert test_session.get("recitation_link") == self.teacher_recitation_link, \
            f"Expected {self.teacher_recitation_link}, got {test_session.get('recitation_link')}"

        print(f"SUCCESS: Session enriched with teacher's recitation_link: "
              f"{test_session.get('recitation_link')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
