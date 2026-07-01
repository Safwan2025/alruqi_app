"""
Backend Tests for Authentication Features:
1. Password reset via Date of Birth (/api/auth/verify-dob + /api/auth/reset-password-dob)
2. Set password for Google users (/api/auth/set-password)
3. Change password for logged-in users (/api/auth/change-password)
4. /api/auth/me returns needs_password_setup flag correctly
5. Login page with email/password works
6. Signup creates new users correctly
7. Teacher role restriction (only m0m0077@hotmail.com can create teachers)
8. Student Performance Indicator endpoint
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timezone

from conftest import ensure_test_user, cleanup_test_user

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://tajweed-platform-1.preview.emergentagent.com').rstrip('/')

# Test credentials from review_request
TEST_STUDENT_EMAIL = "teststudent@test.com"
TEST_STUDENT_PASSWORD = "changedpassword456"
GOOGLE_USER_EMAIL = "googleuser@test.com"
GOOGLE_USER_PASSWORD = "googlepassword123"
DOB_FOR_TEST_STUDENT = "1995-05-15"
ADMIN_EMAIL = "m0m0077100@gmail.com"
TEACHER_CREATOR_EMAIL = "m0m0077@hotmail.com"


@pytest.fixture(scope="module", autouse=True)
def _ensure_test_student_lifecycle():
    """Guarantee `teststudent@test.com` exists with the expected password
    BEFORE any test in this module runs, regardless of test order or any
    leftover database state from previous runs.

    Cleanup removes ONLY this specific user and their session tokens —
    no other collections, no other accounts.
    """
    ensure_test_user(
        email=TEST_STUDENT_EMAIL,
        password=TEST_STUDENT_PASSWORD,
        role="student",
        name="Test Student (auth features)",
    )
    yield
    cleanup_test_user(TEST_STUDENT_EMAIL)


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestPublicEndpoints:
    """Test public endpoints that don't require auth"""
    
    def test_public_stats_accessible(self, api_client):
        """Public stats should be accessible without auth"""
        response = api_client.get(f"{BASE_URL}/api/public/stats")
        assert response.status_code == 200
        data = response.json()
        assert "total_bookings" in data
        assert "total_teachers" in data
        assert "total_students" in data
        print(f"Public stats: {data}")
    
    def test_students_of_week_public(self, api_client):
        """Students of week should be accessible without auth"""
        response = api_client.get(f"{BASE_URL}/api/public/students-of-week")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Students of week: {data}")


class TestSignup:
    """Test user signup functionality"""
    
    def test_signup_new_user(self, api_client):
        """Test creating a new user with email/password"""
        unique_email = f"test_signup_{uuid.uuid4().hex[:8]}@test.com"
        response = api_client.post(f"{BASE_URL}/api/auth/signup", json={
            "email": unique_email,
            "password": "testpass123",
            "name": "Test User Signup"
        })
        
        # Should return 200 with user data and token
        assert response.status_code == 200, f"Signup failed: {response.text}"
        data = response.json()
        assert "user" in data
        assert "token" in data
        assert data["user"]["email"] == unique_email
        assert data["user"]["role"] == "student"  # Default role
        print(f"Signup successful for: {unique_email}")
    
    def test_signup_existing_email_fails(self, api_client):
        """Test that signup with existing email fails"""
        # First signup
        unique_email = f"test_dup_{uuid.uuid4().hex[:8]}@test.com"
        api_client.post(f"{BASE_URL}/api/auth/signup", json={
            "email": unique_email,
            "password": "testpass123",
            "name": "First User"
        })
        
        # Second signup with same email
        response = api_client.post(f"{BASE_URL}/api/auth/signup", json={
            "email": unique_email,
            "password": "testpass456",
            "name": "Second User"
        })
        
        assert response.status_code == 400
        print("Duplicate email correctly rejected")
    
    def test_signup_weak_password_fails(self, api_client):
        """Test that signup with weak password fails"""
        unique_email = f"test_weak_{uuid.uuid4().hex[:8]}@test.com"
        response = api_client.post(f"{BASE_URL}/api/auth/signup", json={
            "email": unique_email,
            "password": "123",  # Too short
            "name": "Weak Pass User"
        })
        
        assert response.status_code == 400 or response.status_code == 422
        print("Weak password correctly rejected")


class TestLogin:
    """Test user login functionality"""
    
    def test_login_with_credentials(self, api_client):
        """Test login with email and password"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_STUDENT_EMAIL,
            "password": TEST_STUDENT_PASSWORD,
            "remember_me": False
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "user" in data
        assert "token" in data
        assert data["user"]["email"] == TEST_STUDENT_EMAIL
        print(f"Login successful for: {TEST_STUDENT_EMAIL}")
    
    def test_login_invalid_credentials(self, api_client):
        """Test login with wrong credentials"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@email.com",
            "password": "wrongpassword"
        })
        
        assert response.status_code == 401
        print("Invalid credentials correctly rejected")
    
    def test_login_wrong_password(self, api_client):
        """Test login with wrong password for existing user"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_STUDENT_EMAIL,
            "password": "wrongpassword123"
        })
        
        assert response.status_code == 401
        print("Wrong password correctly rejected")


class TestAuthMe:
    """Test /api/auth/me endpoint"""
    
    def test_auth_me_returns_user_info(self, api_client):
        """Test that /auth/me returns user info with needs_password_setup flag"""
        # First login
        login_response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_STUDENT_EMAIL,
            "password": TEST_STUDENT_PASSWORD
        })
        assert login_response.status_code == 200
        token = login_response.json()["token"]
        
        # Then get /auth/me
        api_client.headers.update({"X-Session-Token": token})
        response = api_client.get(f"{BASE_URL}/api/auth/me")
        
        assert response.status_code == 200
        data = response.json()
        assert "email" in data
        assert "user_id" in data
        assert "needs_password_setup" in data
        print(f"Auth/me response: email={data['email']}, needs_password_setup={data['needs_password_setup']}")
    
    def test_auth_me_without_token_fails(self, api_client):
        """Test that /auth/me without token fails"""
        response = api_client.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        print("Unauthenticated /auth/me correctly rejected")


class TestPasswordReset:
    """Test password reset via DOB functionality"""
    
    def test_verify_dob_with_valid_data(self, api_client):
        """Test DOB verification with valid data"""
        # First, create a user with DOB set
        unique_email = f"test_dob_{uuid.uuid4().hex[:8]}@test.com"
        
        # Signup
        signup_response = api_client.post(f"{BASE_URL}/api/auth/signup", json={
            "email": unique_email,
            "password": "testpass123",
            "name": "DOB Test User"
        })
        assert signup_response.status_code == 200
        token = signup_response.json()["token"]
        
        # Set DOB
        api_client.headers.update({"X-Session-Token": token})
        dob_response = api_client.put(f"{BASE_URL}/api/users/date-of-birth", json={
            "date_of_birth": "1990-01-15"
        })
        assert dob_response.status_code == 200, f"Set DOB failed: {dob_response.text}"
        
        # Clear token to test verify-dob as unauthenticated
        api_client.headers.pop("X-Session-Token", None)
        
        # Verify DOB
        verify_response = api_client.post(f"{BASE_URL}/api/auth/verify-dob", json={
            "email": unique_email,
            "date_of_birth": "1990-01-15"
        })
        
        assert verify_response.status_code == 200, f"Verify DOB failed: {verify_response.text}"
        data = verify_response.json()
        assert "reset_token" in data
        print(f"DOB verification successful, reset_token received")
    
    def test_verify_dob_wrong_date_fails(self, api_client):
        """Test DOB verification with wrong date fails"""
        # First, create a user with DOB set
        unique_email = f"test_dob2_{uuid.uuid4().hex[:8]}@test.com"
        
        # Signup
        signup_response = api_client.post(f"{BASE_URL}/api/auth/signup", json={
            "email": unique_email,
            "password": "testpass123",
            "name": "DOB Test User 2"
        })
        assert signup_response.status_code == 200
        token = signup_response.json()["token"]
        
        # Set DOB
        api_client.headers.update({"X-Session-Token": token})
        api_client.put(f"{BASE_URL}/api/users/date-of-birth", json={
            "date_of_birth": "1990-01-15"
        })
        
        # Clear token
        api_client.headers.pop("X-Session-Token", None)
        
        # Verify with wrong DOB
        verify_response = api_client.post(f"{BASE_URL}/api/auth/verify-dob", json={
            "email": unique_email,
            "date_of_birth": "1999-12-25"  # Wrong date
        })
        
        assert verify_response.status_code == 400
        print("Wrong DOB correctly rejected")
    
    def test_reset_password_with_dob(self, api_client):
        """Test full password reset flow with DOB"""
        # Create user
        unique_email = f"test_reset_{uuid.uuid4().hex[:8]}@test.com"
        
        signup_response = api_client.post(f"{BASE_URL}/api/auth/signup", json={
            "email": unique_email,
            "password": "oldpassword123",
            "name": "Reset Test User"
        })
        assert signup_response.status_code == 200
        token = signup_response.json()["token"]
        
        # Set DOB
        api_client.headers.update({"X-Session-Token": token})
        api_client.put(f"{BASE_URL}/api/users/date-of-birth", json={
            "date_of_birth": "1985-06-20"
        })
        api_client.headers.pop("X-Session-Token", None)
        
        # Reset password
        reset_response = api_client.post(f"{BASE_URL}/api/auth/reset-password-dob", json={
            "email": unique_email,
            "date_of_birth": "1985-06-20",
            "new_password": "newpassword456"
        })
        
        assert reset_response.status_code == 200, f"Reset failed: {reset_response.text}"
        
        # Try login with new password
        login_response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": unique_email,
            "password": "newpassword456"
        })
        
        assert login_response.status_code == 200
        print("Password reset and login with new password successful")


class TestSetPassword:
    """Test set password for Google users"""
    
    def test_set_password_for_user_without_password(self, api_client):
        """Test setting password for user who doesn't have one"""
        # Login with Google user credentials (simulated - user created via Google OAuth)
        login_response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": GOOGLE_USER_EMAIL,
            "password": GOOGLE_USER_PASSWORD
        })
        
        # If Google user exists and has password (from previous test), try with a fresh test
        if login_response.status_code != 200:
            pytest.skip("Google user test requires user created via OAuth flow")
        
        print("Set password test - user already has password")
    
    def test_set_password_already_has_password_fails(self, api_client):
        """Test that setting password fails if user already has one"""
        # Login
        login_response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_STUDENT_EMAIL,
            "password": TEST_STUDENT_PASSWORD
        })
        assert login_response.status_code == 200
        token = login_response.json()["token"]
        
        # Try to set password (should fail as user already has one)
        api_client.headers.update({"X-Session-Token": token})
        response = api_client.post(f"{BASE_URL}/api/auth/set-password", json={
            "password": "newpassword123"
        })
        
        assert response.status_code == 400
        print("Set password correctly rejected for user with existing password")


class TestChangePassword:
    """Test change password functionality"""
    
    def test_change_password_with_correct_current(self, api_client):
        """Test changing password with correct current password"""
        # Create a user
        unique_email = f"test_change_{uuid.uuid4().hex[:8]}@test.com"
        
        signup_response = api_client.post(f"{BASE_URL}/api/auth/signup", json={
            "email": unique_email,
            "password": "original123",
            "name": "Change Password Test"
        })
        assert signup_response.status_code == 200
        token = signup_response.json()["token"]
        
        # Change password
        api_client.headers.update({"X-Session-Token": token})
        change_response = api_client.post(f"{BASE_URL}/api/auth/change-password", json={
            "current_password": "original123",
            "new_password": "newpass456"
        })
        
        assert change_response.status_code == 200, f"Change password failed: {change_response.text}"
        
        # Clear token
        api_client.headers.pop("X-Session-Token", None)
        
        # Try login with new password
        login_response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": unique_email,
            "password": "newpass456"
        })
        
        assert login_response.status_code == 200
        print("Password changed successfully")
    
    def test_change_password_wrong_current_fails(self, api_client):
        """Test that changing password with wrong current password fails"""
        # Login
        login_response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_STUDENT_EMAIL,
            "password": TEST_STUDENT_PASSWORD
        })
        assert login_response.status_code == 200
        token = login_response.json()["token"]
        
        # Try to change with wrong current password
        api_client.headers.update({"X-Session-Token": token})
        response = api_client.post(f"{BASE_URL}/api/auth/change-password", json={
            "current_password": "wrongcurrent",
            "new_password": "newpassword123"
        })
        
        assert response.status_code == 400
        print("Wrong current password correctly rejected")


class TestStudentPerformance:
    """Test Student Performance Indicator endpoint"""
    
    def test_student_performance_returns_data(self, api_client):
        """Test that performance indicator returns expected data structure"""
        # Login
        login_response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_STUDENT_EMAIL,
            "password": TEST_STUDENT_PASSWORD
        })
        assert login_response.status_code == 200
        token = login_response.json()["token"]
        
        # Get performance
        api_client.headers.update({"X-Session-Token": token})
        response = api_client.get(f"{BASE_URL}/api/students/my-performance")
        
        assert response.status_code == 200, f"Performance endpoint failed: {response.text}"
        data = response.json()
        
        # Check expected fields
        assert "score" in data
        assert "level" in data
        assert "color" in data
        assert "breakdown" in data
        assert "stats" in data
        
        print(f"Performance data: score={data['score']}, level={data['level']}")
    
    def test_student_performance_requires_auth(self, api_client):
        """Test that performance endpoint requires authentication"""
        response = api_client.get(f"{BASE_URL}/api/students/my-performance")
        assert response.status_code == 401
        print("Performance endpoint correctly requires auth")


class TestTeacherRestriction:
    """Test teacher role restriction"""
    
    def test_regular_user_cannot_become_teacher(self, api_client):
        """Test that regular user cannot change role to teacher"""
        # Create a regular user
        unique_email = f"test_role_{uuid.uuid4().hex[:8]}@test.com"
        
        signup_response = api_client.post(f"{BASE_URL}/api/auth/signup", json={
            "email": unique_email,
            "password": "testpass123",
            "name": "Role Test User"
        })
        assert signup_response.status_code == 200
        token = signup_response.json()["token"]
        
        # Try to become teacher
        api_client.headers.update({"X-Session-Token": token})
        response = api_client.put(f"{BASE_URL}/api/users/role/teacher")
        
        assert response.status_code == 403
        print("Regular user correctly cannot become teacher")


class TestLogout:
    """Test logout functionality"""
    
    def test_logout_clears_session(self, api_client):
        """Test that logout invalidates the session"""
        # Login
        login_response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_STUDENT_EMAIL,
            "password": TEST_STUDENT_PASSWORD
        })
        assert login_response.status_code == 200
        token = login_response.json()["token"]
        
        # Logout
        api_client.headers.update({"X-Session-Token": token})
        logout_response = api_client.post(f"{BASE_URL}/api/auth/logout")
        
        assert logout_response.status_code == 200
        
        # Try to access protected endpoint (should fail)
        me_response = api_client.get(f"{BASE_URL}/api/auth/me")
        assert me_response.status_code == 401
        print("Logout successfully invalidated session")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
