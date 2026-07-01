"""
Test Student of the Week Feature
- GET /api/public/students-of-week - Returns current students (public, no auth)
- GET /api/admin/students-of-week - Returns students (admin only)
- POST /api/admin/students-of-week - Add student of week (admin only, requires name, picture, order 1 or 2)
- DELETE /api/admin/students-of-week/{id} - Remove student (admin only)
- Non-admin cannot access admin endpoints (should return 403)
- Max 2 students can be active at a time
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
ADMIN_EMAIL = "m0m0077100@gmail.com"

# Sample base64 image (small placeholder)
SAMPLE_BASE64_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def admin_session_token(api_client):
    """Create admin user and session for testing"""
    import subprocess
    
    # Create admin user and session in MongoDB
    timestamp = int(datetime.now().timestamp())
    admin_user_id = f"admin_test_{timestamp}"
    admin_session_token = f"admin_session_{timestamp}"
    
    mongo_script = f'''
    use('test_database');
    
    // Remove existing admin test user if exists
    db.users.deleteMany({{email: "{ADMIN_EMAIL}"}});
    db.user_sessions.deleteMany({{session_token: /admin_session_/}});
    
    // Create admin user
    db.users.insertOne({{
        user_id: "{admin_user_id}",
        email: "{ADMIN_EMAIL}",
        name: "Admin Test User",
        picture: null,
        role: "teacher",
        created_at: new Date().toISOString()
    }});
    
    // Create admin session
    db.user_sessions.insertOne({{
        user_id: "{admin_user_id}",
        session_token: "{admin_session_token}",
        expires_at: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
        created_at: new Date().toISOString()
    }});
    
    print("Admin session created: {admin_session_token}");
    '''
    
    result = subprocess.run(
        ['mongosh', '--quiet', '--eval', mongo_script],
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"MongoDB error: {result.stderr}")
        pytest.skip("Failed to create admin session")
    
    return admin_session_token


@pytest.fixture(scope="module")
def non_admin_session_token(api_client):
    """Create non-admin user and session for testing"""
    import subprocess
    
    timestamp = int(datetime.now().timestamp())
    user_id = f"student_test_{timestamp}"
    session_token = f"student_session_{timestamp}"
    
    mongo_script = f'''
    use('test_database');
    
    // Create non-admin user
    db.users.insertOne({{
        user_id: "{user_id}",
        email: "student_test_{timestamp}@example.com",
        name: "Student Test User",
        picture: null,
        role: "student",
        created_at: new Date().toISOString()
    }});
    
    // Create session
    db.user_sessions.insertOne({{
        user_id: "{user_id}",
        session_token: "{session_token}",
        expires_at: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
        created_at: new Date().toISOString()
    }});
    
    print("Student session created: {session_token}");
    '''
    
    result = subprocess.run(
        ['mongosh', '--quiet', '--eval', mongo_script],
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"MongoDB error: {result.stderr}")
        pytest.skip("Failed to create student session")
    
    return session_token


@pytest.fixture(scope="module", autouse=True)
def cleanup_test_data():
    """Cleanup test data before and after tests"""
    import subprocess
    
    # Cleanup before tests
    cleanup_script = '''
    use('test_database');
    db.students_of_week.deleteMany({student_name: /TEST_/});
    '''
    subprocess.run(['mongosh', '--quiet', '--eval', cleanup_script], capture_output=True)
    
    yield
    
    # Cleanup after tests
    cleanup_script = '''
    use('test_database');
    db.students_of_week.deleteMany({student_name: /TEST_/});
    db.users.deleteMany({email: /student_test_/});
    db.user_sessions.deleteMany({session_token: /student_session_/});
    '''
    subprocess.run(['mongosh', '--quiet', '--eval', cleanup_script], capture_output=True)


class TestPublicStudentsOfWeek:
    """Test public endpoint - no auth required"""
    
    def test_public_endpoint_returns_200(self, api_client):
        """GET /api/public/students-of-week should return 200 without auth"""
        response = api_client.get(f"{BASE_URL}/api/public/students-of-week")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Should return a list
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
    
    def test_public_endpoint_returns_list_structure(self, api_client):
        """Public endpoint should return proper data structure"""
        response = api_client.get(f"{BASE_URL}/api/public/students-of-week")
        assert response.status_code == 200
        
        data = response.json()
        # If there are students, verify structure
        if len(data) > 0:
            student = data[0]
            assert "student_id" in student, "Student should have student_id"
            assert "student_name" in student, "Student should have student_name"
            assert "student_picture" in student, "Student should have student_picture"
            assert "order" in student, "Student should have order"
            assert "active" in student, "Student should have active field"


class TestAdminStudentsOfWeekAuth:
    """Test admin endpoint authentication"""
    
    def test_admin_get_requires_auth(self, api_client):
        """GET /api/admin/students-of-week should require authentication"""
        response = api_client.get(f"{BASE_URL}/api/admin/students-of-week")
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
    
    def test_admin_post_requires_auth(self, api_client):
        """POST /api/admin/students-of-week should require authentication"""
        payload = {
            "student_name": "TEST_Unauthorized",
            "student_picture": SAMPLE_BASE64_IMAGE,
            "order": 1
        }
        response = api_client.post(f"{BASE_URL}/api/admin/students-of-week", json=payload)
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
    
    def test_admin_delete_requires_auth(self, api_client):
        """DELETE /api/admin/students-of-week/{id} should require authentication"""
        response = api_client.delete(f"{BASE_URL}/api/admin/students-of-week/fake_id")
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
    
    def test_non_admin_cannot_access_admin_get(self, api_client, non_admin_session_token):
        """Non-admin user should get 403 on admin GET endpoint"""
        headers = {"X-Session-Token": non_admin_session_token}
        response = api_client.get(f"{BASE_URL}/api/admin/students-of-week", headers=headers)
        assert response.status_code == 403, f"Expected 403 for non-admin, got {response.status_code}: {response.text}"
    
    def test_non_admin_cannot_access_admin_post(self, api_client, non_admin_session_token):
        """Non-admin user should get 403 on admin POST endpoint"""
        headers = {"X-Session-Token": non_admin_session_token}
        payload = {
            "student_name": "TEST_NonAdmin",
            "student_picture": SAMPLE_BASE64_IMAGE,
            "order": 1
        }
        response = api_client.post(f"{BASE_URL}/api/admin/students-of-week", json=payload, headers=headers)
        assert response.status_code == 403, f"Expected 403 for non-admin, got {response.status_code}: {response.text}"
    
    def test_non_admin_cannot_access_admin_delete(self, api_client, non_admin_session_token):
        """Non-admin user should get 403 on admin DELETE endpoint"""
        headers = {"X-Session-Token": non_admin_session_token}
        response = api_client.delete(f"{BASE_URL}/api/admin/students-of-week/fake_id", headers=headers)
        assert response.status_code == 403, f"Expected 403 for non-admin, got {response.status_code}: {response.text}"


class TestAdminStudentsOfWeekCRUD:
    """Test admin CRUD operations"""
    
    def test_admin_can_get_students(self, api_client, admin_session_token):
        """Admin can GET students of week"""
        headers = {"X-Session-Token": admin_session_token}
        response = api_client.get(f"{BASE_URL}/api/admin/students-of-week", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
    
    def test_admin_can_add_student_order_1(self, api_client, admin_session_token):
        """Admin can add student of week with order 1"""
        headers = {"X-Session-Token": admin_session_token}
        payload = {
            "student_name": "TEST_Student_Order1",
            "student_picture": SAMPLE_BASE64_IMAGE,
            "order": 1
        }
        response = api_client.post(f"{BASE_URL}/api/admin/students-of-week", json=payload, headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should have message"
        assert "student" in data, "Response should have student data"
        
        student = data["student"]
        assert student["student_name"] == "TEST_Student_Order1"
        assert student["order"] == 1
        assert student["active"] == True
        assert "student_id" in student
    
    def test_admin_can_add_student_order_2(self, api_client, admin_session_token):
        """Admin can add student of week with order 2"""
        headers = {"X-Session-Token": admin_session_token}
        payload = {
            "student_name": "TEST_Student_Order2",
            "student_picture": SAMPLE_BASE64_IMAGE,
            "order": 2
        }
        response = api_client.post(f"{BASE_URL}/api/admin/students-of-week", json=payload, headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        student = data["student"]
        assert student["student_name"] == "TEST_Student_Order2"
        assert student["order"] == 2
    
    def test_max_2_students_active(self, api_client, admin_session_token):
        """Verify max 2 students can be active at a time"""
        headers = {"X-Session-Token": admin_session_token}
        
        # Get current students
        response = api_client.get(f"{BASE_URL}/api/admin/students-of-week", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert len(data) <= 2, f"Should have max 2 active students, got {len(data)}"
    
    def test_public_endpoint_shows_added_students(self, api_client):
        """Public endpoint should show the students added by admin"""
        response = api_client.get(f"{BASE_URL}/api/public/students-of-week")
        assert response.status_code == 200
        
        data = response.json()
        # Should have at least the students we added
        test_students = [s for s in data if s["student_name"].startswith("TEST_")]
        assert len(test_students) >= 1, "Should show test students on public endpoint"
    
    def test_invalid_order_rejected(self, api_client, admin_session_token):
        """Order must be 1 or 2"""
        headers = {"X-Session-Token": admin_session_token}
        payload = {
            "student_name": "TEST_InvalidOrder",
            "student_picture": SAMPLE_BASE64_IMAGE,
            "order": 3  # Invalid order
        }
        response = api_client.post(f"{BASE_URL}/api/admin/students-of-week", json=payload, headers=headers)
        assert response.status_code == 400, f"Expected 400 for invalid order, got {response.status_code}"
    
    def test_admin_can_remove_student(self, api_client, admin_session_token):
        """Admin can remove a student of week"""
        headers = {"X-Session-Token": admin_session_token}
        
        # First, get current students to find one to delete
        response = api_client.get(f"{BASE_URL}/api/admin/students-of-week", headers=headers)
        assert response.status_code == 200
        
        students = response.json()
        test_students = [s for s in students if s["student_name"].startswith("TEST_")]
        
        if len(test_students) > 0:
            student_to_delete = test_students[0]
            student_id = student_to_delete["student_id"]
            
            # Delete the student
            response = api_client.delete(f"{BASE_URL}/api/admin/students-of-week/{student_id}", headers=headers)
            assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
            
            data = response.json()
            assert "message" in data
            
            # Verify student is no longer active
            response = api_client.get(f"{BASE_URL}/api/admin/students-of-week", headers=headers)
            students_after = response.json()
            active_ids = [s["student_id"] for s in students_after]
            assert student_id not in active_ids, "Deleted student should not be in active list"
    
    def test_delete_nonexistent_student_returns_404(self, api_client, admin_session_token):
        """Deleting non-existent student should return 404"""
        headers = {"X-Session-Token": admin_session_token}
        response = api_client.delete(f"{BASE_URL}/api/admin/students-of-week/nonexistent_id_12345", headers=headers)
        assert response.status_code == 404, f"Expected 404 for non-existent student, got {response.status_code}"


class TestStudentOfWeekReplacement:
    """Test that adding a new student with same order deactivates the previous one"""
    
    def test_adding_same_order_deactivates_previous(self, api_client, admin_session_token):
        """Adding student with same order should deactivate previous student with that order"""
        headers = {"X-Session-Token": admin_session_token}
        
        # Add first student with order 1
        payload1 = {
            "student_name": "TEST_First_Order1",
            "student_picture": SAMPLE_BASE64_IMAGE,
            "order": 1
        }
        response1 = api_client.post(f"{BASE_URL}/api/admin/students-of-week", json=payload1, headers=headers)
        assert response1.status_code == 200
        first_student_id = response1.json()["student"]["student_id"]
        
        # Add second student with same order 1
        payload2 = {
            "student_name": "TEST_Second_Order1",
            "student_picture": SAMPLE_BASE64_IMAGE,
            "order": 1
        }
        response2 = api_client.post(f"{BASE_URL}/api/admin/students-of-week", json=payload2, headers=headers)
        assert response2.status_code == 200
        second_student_id = response2.json()["student"]["student_id"]
        
        # Get current active students
        response = api_client.get(f"{BASE_URL}/api/admin/students-of-week", headers=headers)
        assert response.status_code == 200
        
        students = response.json()
        active_ids = [s["student_id"] for s in students]
        
        # First student should be deactivated, second should be active
        assert first_student_id not in active_ids, "First student should be deactivated"
        assert second_student_id in active_ids, "Second student should be active"


class TestStudentOfWeekDataValidation:
    """Test data validation for student of week"""
    
    def test_student_name_required(self, api_client, admin_session_token):
        """Student name is required"""
        headers = {"X-Session-Token": admin_session_token}
        payload = {
            "student_picture": SAMPLE_BASE64_IMAGE,
            "order": 1
        }
        response = api_client.post(f"{BASE_URL}/api/admin/students-of-week", json=payload, headers=headers)
        assert response.status_code == 422, f"Expected 422 for missing name, got {response.status_code}"
    
    def test_student_picture_required(self, api_client, admin_session_token):
        """Student picture is required"""
        headers = {"X-Session-Token": admin_session_token}
        payload = {
            "student_name": "TEST_NoPicture",
            "order": 1
        }
        response = api_client.post(f"{BASE_URL}/api/admin/students-of-week", json=payload, headers=headers)
        assert response.status_code == 422, f"Expected 422 for missing picture, got {response.status_code}"
    
    def test_order_required(self, api_client, admin_session_token):
        """Order defaults to 1 if not provided"""
        headers = {"X-Session-Token": admin_session_token}
        payload = {
            "student_name": "TEST_NoOrder",
            "student_picture": SAMPLE_BASE64_IMAGE
        }
        response = api_client.post(f"{BASE_URL}/api/admin/students-of-week", json=payload, headers=headers)
        # Should succeed with default order 1
        assert response.status_code == 200, f"Expected 200 with default order, got {response.status_code}"
        
        data = response.json()
        assert data["student"]["order"] == 1, "Default order should be 1"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
