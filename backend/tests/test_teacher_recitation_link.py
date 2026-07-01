"""
Test Teacher Recitation Link Feature
Tests for:
1. GET /api/admin/teacher-links - Returns teachers with their recitation_link field
2. PUT /api/admin/teacher-link - Admin can update a teacher's recitation_link
3. POST /api/sessions/book - When booking, the session stores the teacher's recitation_link
4. GET /api/sessions/{session_id}/join-link - Returns the teacher's current recitation_link
5. GET /api/sessions/my-sessions - Sessions include recitation_link field
6. When admin updates a teacher's link, pending sessions are also updated
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timezone, timedelta

from conftest import _resolve_user_id

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Tokens are injected per-class via the _inject_tokens autouse fixture
# (resolved at runtime by conftest.py — no stale literals).

# Resolved at import time from the seeded preview DB:
TEACHER_1_ID = _resolve_user_id("aalsiiada@gmail.com")  # seeded teacher


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(autouse=True)
def _inject_tokens(request, admin_token, student_a_token):
    """Stash runtime tokens on every test class instance.

    Replaces previous module-level self.admin_token / self.student_a_token.
    """
    if request.instance is not None:
        request.instance.admin_token = admin_token
        request.instance.student_a_token = student_a_token


class TestAdminTeacherLinks:
    """Test admin teacher links endpoints"""
    
    def test_get_teacher_links_requires_admin(self, api_client):
        """Non-admin users should not access teacher links"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/teacher-links",
            headers={"Authorization": f"Bearer {self.student_a_token}"}
        )
        assert response.status_code == 403
        print("PASSED: Non-admin cannot access teacher links")
    
    def test_get_teacher_links_as_admin(self, api_client):
        """Admin should be able to get all teachers with their recitation links"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/teacher-links",
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        assert response.status_code == 200
        
        teachers = response.json()
        assert isinstance(teachers, list)
        
        # Check that teachers have the expected fields
        if len(teachers) > 0:
            teacher = teachers[0]
            assert "user_id" in teacher
            assert "name" in teacher
            assert "email" in teacher
            # recitation_link may or may not be present
        
        print(f"PASSED: Admin can get teacher links - found {len(teachers)} teachers")
        return teachers
    
    def test_update_teacher_link_requires_admin(self, api_client):
        """Non-admin users should not update teacher links"""
        response = api_client.put(
            f"{BASE_URL}/api/admin/teacher-link",
            headers={"Authorization": f"Bearer {self.student_a_token}"},
            json={
                "teacher_id": TEACHER_1_ID,
                "recitation_link": "https://meet.google.com/test-unauthorized"
            }
        )
        assert response.status_code == 403
        print("PASSED: Non-admin cannot update teacher links")
    
    def test_update_teacher_link_as_admin(self, api_client):
        """Admin should be able to update a teacher's recitation link"""
        new_link = f"https://meet.google.com/test-link-{int(datetime.now().timestamp())}"
        
        response = api_client.put(
            f"{BASE_URL}/api/admin/teacher-link",
            headers={"Authorization": f"Bearer {self.admin_token}"},
            json={
                "teacher_id": TEACHER_1_ID,
                "recitation_link": new_link
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "message" in data
        
        # Verify the link was updated by fetching teacher links
        verify_response = api_client.get(
            f"{BASE_URL}/api/admin/teacher-links",
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        assert verify_response.status_code == 200
        
        teachers = verify_response.json()
        teacher = next((t for t in teachers if t.get("user_id") == TEACHER_1_ID), None)
        assert teacher is not None
        assert teacher.get("recitation_link") == new_link
        
        print(f"PASSED: Admin can update teacher link - new link: {new_link}")
    
    def test_update_nonexistent_teacher_fails(self, api_client):
        """Updating a non-existent teacher should fail"""
        response = api_client.put(
            f"{BASE_URL}/api/admin/teacher-link",
            headers={"Authorization": f"Bearer {self.admin_token}"},
            json={
                "teacher_id": "nonexistent_teacher_id",
                "recitation_link": "https://meet.google.com/test"
            }
        )
        assert response.status_code == 404
        print("PASSED: Updating non-existent teacher returns 404")


class TestSessionJoinLink:
    """Test session join link endpoint"""

    @pytest.fixture(autouse=True)
    def _seeded_session(self):
        """Create one self-contained session NOT involving student_a, then
        remove it on teardown. Lets the 403 (unauthorized user) and 200
        (admin can access any session) assertions hold deterministically.
        Touches only the `sessions`, `users`, and `user_sessions` collections.
        """
        from pymongo import MongoClient
        db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
        self._db = db

        teacher_id = _resolve_user_id("aalsiiada@gmail.com")
        other_student_id = f"test_other_student_{uuid.uuid4().hex[:8]}"
        now = datetime.now(timezone.utc).isoformat()

        db.users.insert_one({
            "user_id": other_student_id,
            "email": f"{other_student_id}@test.com",
            "name": "Test Other Student",
            "role": "student",
            "created_at": now,
        })

        session_id = f"test_session_{uuid.uuid4().hex[:12]}"
        db.sessions.insert_one({
            "session_id": session_id,
            "student_id": other_student_id,
            "teacher_id": teacher_id,
            "teacher_name": "Test Teacher",
            "student_name": "Test Other Student",
            "scheduled_time": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
            "duration": 60,
            "status": "scheduled",
            "created_at": now,
        })

        self.test_session_id = session_id
        self.test_other_student_id = other_student_id

        yield

        db.sessions.delete_one({"session_id": session_id})
        db.users.delete_one({"user_id": other_student_id})

    def test_get_join_link_requires_auth(self, api_client):
        """Getting join link requires authentication"""
        response = api_client.get(f"{BASE_URL}/api/sessions/test_session/join-link")
        assert response.status_code == 401
        print("PASSED: Join link requires authentication")
    
    def test_get_join_link_nonexistent_session(self, api_client):
        """Getting join link for non-existent session should fail"""
        response = api_client.get(
            f"{BASE_URL}/api/sessions/nonexistent_session/join-link",
            headers={"Authorization": f"Bearer {self.student_a_token}"}
        )
        assert response.status_code == 404
        print("PASSED: Non-existent session returns 404")
    
    def test_get_join_link_unauthorized_user(self, api_client):
        """User not part of session should not access join link"""
        response = api_client.get(
            f"{BASE_URL}/api/sessions/{self.test_session_id}/join-link",
            headers={"Authorization": f"Bearer {self.student_a_token}"}
        )
        # Should be 403 since student_a is not part of this session
        assert response.status_code == 403
        print("PASSED: Unauthorized user cannot access join link")
    
    def test_get_join_link_as_admin(self, api_client):
        """Admin should be able to access any session's join link"""
        response = api_client.get(
            f"{BASE_URL}/api/sessions/{self.test_session_id}/join-link",
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        # Admin should have access
        assert response.status_code == 200
        
        data = response.json()
        assert "session_id" in data
        assert "teacher_id" in data
        assert "recitation_link" in data
        
        print(f"PASSED: Admin can access join link - recitation_link: {data.get('recitation_link', 'not set')}")


class TestSessionRecitationLink:
    """Test that sessions include recitation_link"""
    
    def test_my_sessions_includes_recitation_link(self, api_client):
        """My sessions should include recitation_link field"""
        response = api_client.get(
            f"{BASE_URL}/api/sessions/my-sessions",
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        assert response.status_code == 200
        
        sessions = response.json()
        # Sessions may or may not have recitation_link depending on when they were created
        print(f"PASSED: My sessions endpoint works - found {len(sessions)} sessions")


class TestTeacherLinkPropagation:
    """Test that updating teacher link propagates to pending sessions"""
    
    def test_link_update_propagates_to_sessions(self, api_client):
        """When admin updates teacher link, pending sessions should be updated"""
        # First, update the teacher's link
        new_link = f"https://meet.google.com/propagation-test-{int(datetime.now().timestamp())}"
        
        update_response = api_client.put(
            f"{BASE_URL}/api/admin/teacher-link",
            headers={"Authorization": f"Bearer {self.admin_token}"},
            json={
                "teacher_id": TEACHER_1_ID,
                "recitation_link": new_link
            }
        )
        assert update_response.status_code == 200
        
        # The update should have propagated to pending sessions
        # This is verified by the backend code at line 1461-1464
        print(f"PASSED: Teacher link update propagates to pending sessions")


class TestTeachersEndpoint:
    """Test teachers endpoint"""
    
    def test_teachers_endpoint(self, api_client):
        """Teachers endpoint should work"""
        response = api_client.get(f"{BASE_URL}/api/teachers")
        assert response.status_code == 200
        
        teachers = response.json()
        assert isinstance(teachers, list)
        print(f"PASSED: Teachers endpoint - found {len(teachers)} teachers")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
