"""
Test Student Profile Modal Attendance Features
- GET /api/teacher/student-profile/{student_id} returns join_clicked_at, attendance_confirmed, attendance_confirmed_at, teacher_id
- PUT /api/sessions/{session_id}/attendance - Teacher confirms attendance
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Tokens come from conftest.py fixtures (admin_token, student_a_token) —
# no stale literals.


@pytest.fixture
def api_client(admin_token):
    """Shared requests session pre-authenticated as admin."""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "X-Session-Token": admin_token,
    })
    return session


class TestStudentProfileEndpoint:
    """Tests for GET /api/teacher/student-profile/{student_id}"""
    
    def test_student_profile_returns_new_fields(self, api_client):
        """Test that student profile returns join_clicked_at, attendance_confirmed, attendance_confirmed_at, teacher_id"""
        # First get a student ID from bookings
        bookings_response = api_client.get(f"{BASE_URL}/api/admin/all-bookings")
        assert bookings_response.status_code == 200
        
        bookings = bookings_response.json()
        student_id = None
        for teacher in bookings.get('bookings_by_teacher', []):
            for s in teacher.get('students', []):
                if s.get('student_id'):
                    student_id = s.get('student_id')
                    break
            if student_id:
                break
        
        if not student_id:
            pytest.skip("No students found for test")
        
        # Get student profile
        response = api_client.get(f"{BASE_URL}/api/teacher/student-profile/{student_id}")
        assert response.status_code == 200
        
        data = response.json()
        
        # Verify student info
        assert 'student' in data
        assert 'user_id' in data['student']
        assert 'name' in data['student']
        
        # Verify statistics
        assert 'statistics' in data
        assert 'total_sessions' in data['statistics']
        assert 'completed_sessions' in data['statistics']
        assert 'attendance_rate' in data['statistics']
        
        # Verify recent_sessions has new fields
        assert 'recent_sessions' in data
        if len(data['recent_sessions']) > 0:
            session = data['recent_sessions'][0]
            assert 'session_id' in session
            assert 'teacher_id' in session, "teacher_id field missing in recent_sessions"
            assert 'join_clicked_at' in session, "join_clicked_at field missing in recent_sessions"
            assert 'attendance_confirmed' in session, "attendance_confirmed field missing in recent_sessions"
            assert 'attendance_confirmed_at' in session, "attendance_confirmed_at field missing in recent_sessions"
            print(f"PASS: Student profile returns all new fields for session {session['session_id']}")
            print(f"  - teacher_id: {session.get('teacher_id')}")
            print(f"  - join_clicked_at: {session.get('join_clicked_at')}")
            print(f"  - attendance_confirmed: {session.get('attendance_confirmed')}")
            print(f"  - attendance_confirmed_at: {session.get('attendance_confirmed_at')}")
        else:
            print("INFO: No recent sessions to verify fields")
        
        print(f"PASS: Student profile endpoint returns expected structure")
    
    def test_student_profile_nonexistent_student(self, api_client):
        """Test getting profile for nonexistent student"""
        response = api_client.get(f"{BASE_URL}/api/teacher/student-profile/nonexistent_user_123")
        assert response.status_code == 404
        print("PASS: Nonexistent student returns 404")


class TestAttendanceConfirmation:
    """Tests for PUT /api/sessions/{session_id}/attendance"""
    
    def test_attendance_endpoint_exists(self, api_client):
        """Test that attendance endpoint exists and requires valid session"""
        response = api_client.put(
            f"{BASE_URL}/api/sessions/nonexistent_session/attendance",
            json={"attended": True}
        )
        # Should return 404 (not found) not 405 (method not allowed)
        assert response.status_code == 404
        print("PASS: Attendance endpoint exists and returns 404 for nonexistent session")
    
    def test_attendance_requires_teacher(self, api_client):
        """Test that only teachers can confirm attendance"""
        # Create a test student
        signup_response = api_client.post(
            f"{BASE_URL}/api/auth/signup",
            json={
                "email": "test_attendance_student@test.com",
                "password": "testpass123",
                "name": "TEST_Attendance_Student"
            }
        )
        
        if signup_response.status_code == 200:
            student_token = signup_response.json().get('token')
            
            # Try to confirm attendance as student
            student_client = requests.Session()
            student_client.headers.update({
                "Content-Type": "application/json",
                "X-Session-Token": student_token
            })
            
            response = student_client.put(
                f"{BASE_URL}/api/sessions/any_session/attendance",
                json={"attended": True}
            )
            
            # Should be 403 (forbidden) - students can't confirm attendance
            assert response.status_code == 403
            print("PASS: Students cannot confirm attendance (403)")
        else:
            print("INFO: Could not create test student, skipping authorization test")


class TestJoinSessionBehavior:
    """Tests for session join behavior"""
    
    def test_join_endpoint_returns_link(self, api_client):
        """Test that join endpoint returns recitation_link"""
        # Get a session
        bookings_response = api_client.get(f"{BASE_URL}/api/admin/all-bookings")
        assert bookings_response.status_code == 200
        
        bookings = bookings_response.json()
        session_id = None
        for teacher in bookings.get('bookings_by_teacher', []):
            for s in teacher.get('students', []):
                if s.get('session_id'):
                    session_id = s.get('session_id')
                    break
            if session_id:
                break
        
        if session_id:
            # Test teacher join-link endpoint
            response = api_client.get(f"{BASE_URL}/api/sessions/{session_id}/join-link")
            assert response.status_code == 200
            
            data = response.json()
            assert 'session_id' in data
            assert 'recitation_link' in data
            print(f"PASS: Join-link endpoint returns session_id and recitation_link")
            print(f"  - recitation_link: {data.get('recitation_link', 'Not set')}")
        else:
            pytest.skip("No sessions found for test")


class TestFrontendCodeReview:
    """Code review tests - verify frontend implementation patterns.

    NOTE: The previous `test_student_dashboard_join_pattern` and
    `test_teacher_dashboard_join_pattern` tests were removed in Phase B.3
    Step 3G. They asserted on an obsolete implementation detail
    (`document.createElement('a')`), but the current frontend uses
    `window.open(link, '_blank', 'noopener,noreferrer')` for popup-blocker-safe
    link opening. The actual user-facing behavior (the API delivering the link
    to the frontend) is still covered end-to-end by
    `test_teacher_recitation_link.py::TestSessionJoinLink::*`.
    """

    def test_student_profile_modal_attendance_buttons(self):
        """Verify StudentProfileModal has attendance confirmation buttons"""
        import os
        
        modal_path = "/app/frontend/src/components/StudentProfileModal.jsx"
        if os.path.exists(modal_path):
            with open(modal_path, 'r') as f:
                content = f.read()
            
            # Check for handleConfirmAttendance function
            assert "handleConfirmAttendance" in content, \
                "StudentProfileModal should have handleConfirmAttendance function"
            
            # Check for attendance buttons with data-testid
            assert 'data-testid={`profile-attend-' in content or "data-testid={`profile-attend-" in content, \
                "StudentProfileModal should have attend button with data-testid"
            
            assert 'data-testid={`profile-absent-' in content or "data-testid={`profile-absent-" in content, \
                "StudentProfileModal should have absent button with data-testid"
            
            # Check for attendance badges
            assert "حاضر" in content, "StudentProfileModal should show 'حاضر' badge"
            assert "غائب" in content, "StudentProfileModal should show 'غائب' badge"
            
            # Check for join_clicked_at display
            assert "join_clicked_at" in content, \
                "StudentProfileModal should display join_clicked_at status"
            
            print("PASS: StudentProfileModal has attendance confirmation buttons and badges")
        else:
            pytest.skip("StudentProfileModal.jsx not found")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
