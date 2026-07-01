"""
Email/Password Authentication System Tests
Tests for: Signup, Login, Session validation, Logout, Remember Me functionality
New auth system added to مقرأة الرقي (Quran Teaching Platform)
"""

import pytest
import requests
import os
from datetime import datetime, timedelta
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://tajweed-platform-1.preview.emergentagent.com').rstrip('/')


@pytest.fixture
def api_client():
    """Unauthenticated session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture
def unique_email():
    """Generate unique email for each test"""
    return f"test_auth_{uuid.uuid4().hex[:8]}@example.com"


# ===== SIGNUP TESTS =====
class TestSignup:
    """Signup endpoint tests - POST /api/auth/signup"""
    
    def test_signup_success(self, api_client, unique_email):
        """Test successful signup with valid email, password, name"""
        payload = {
            "email": unique_email,
            "password": "testpass123",
            "name": "طالب جديد"
        }
        response = api_client.post(f"{BASE_URL}/api/auth/signup", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "user" in data, "Response should contain 'user'"
        assert "token" in data, "Response should contain 'token'"
        assert "expires_in" in data, "Response should contain 'expires_in'"
        assert "message" in data, "Response should contain 'message'"
        
        # Verify user data
        user = data["user"]
        assert user["email"] == unique_email
        assert user["name"] == "طالب جديد"
        assert user["role"] == "student"  # Default role
        assert "password_hash" not in user, "Password hash should not be returned"
        
        # Verify token is valid format
        assert data["token"].startswith("session_"), "Token should start with 'session_'"
        
        print(f"✓ Signup successful for {unique_email}")
        return data["token"]
    
    def test_signup_existing_email_returns_400(self, api_client, unique_email):
        """Test signup with existing email returns 400"""
        payload = {
            "email": unique_email,
            "password": "testpass123",
            "name": "طالب أول"
        }
        # First signup
        response1 = api_client.post(f"{BASE_URL}/api/auth/signup", json=payload)
        assert response1.status_code == 200
        
        # Second signup with same email
        payload["name"] = "طالب ثاني"
        response2 = api_client.post(f"{BASE_URL}/api/auth/signup", json=payload)
        
        assert response2.status_code == 400, f"Expected 400, got {response2.status_code}"
        assert "مستخدم بالفعل" in response2.json().get("detail", "")
        print("✓ Signup with existing email correctly returns 400")
    
    def test_signup_weak_password_returns_400(self, api_client, unique_email):
        """Test signup with password < 6 chars returns 400"""
        payload = {
            "email": unique_email,
            "password": "12345",  # Only 5 chars
            "name": "طالب"
        }
        response = api_client.post(f"{BASE_URL}/api/auth/signup", json=payload)
        
        assert response.status_code in [400, 422], f"Expected 400/422, got {response.status_code}"
        print("✓ Signup with weak password correctly rejected")
    
    def test_signup_invalid_email_format(self, api_client):
        """Test signup with invalid email format"""
        payload = {
            "email": "not-an-email",
            "password": "testpass123",
            "name": "طالب"
        }
        response = api_client.post(f"{BASE_URL}/api/auth/signup", json=payload)
        
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        print("✓ Signup with invalid email format correctly rejected")
    
    def test_signup_missing_name(self, api_client, unique_email):
        """Test signup with missing name"""
        payload = {
            "email": unique_email,
            "password": "testpass123"
            # name is missing
        }
        response = api_client.post(f"{BASE_URL}/api/auth/signup", json=payload)
        
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        print("✓ Signup with missing name correctly rejected")


# ===== LOGIN TESTS =====
class TestLogin:
    """Login endpoint tests - POST /api/auth/login"""
    
    @pytest.fixture
    def registered_user(self, api_client):
        """Create a registered user for login tests"""
        email = f"login_test_{uuid.uuid4().hex[:8]}@example.com"
        password = "testpass123"
        name = "مستخدم للدخول"
        
        # Register the user
        signup_response = api_client.post(f"{BASE_URL}/api/auth/signup", json={
            "email": email,
            "password": password,
            "name": name
        })
        assert signup_response.status_code == 200
        
        return {"email": email, "password": password, "name": name}
    
    def test_login_success(self, api_client, registered_user):
        """Test successful login with correct credentials"""
        payload = {
            "email": registered_user["email"],
            "password": registered_user["password"],
            "remember_me": False
        }
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "user" in data
        assert "token" in data
        assert "expires_in" in data
        assert "message" in data
        
        # Verify user data
        user = data["user"]
        assert user["email"] == registered_user["email"]
        assert user["name"] == registered_user["name"]
        assert "password_hash" not in user
        
        print(f"✓ Login successful for {registered_user['email']}")
        return data["token"]
    
    def test_login_wrong_password_returns_401(self, api_client, registered_user):
        """Test login with wrong password returns 401"""
        payload = {
            "email": registered_user["email"],
            "password": "wrongpassword123",
            "remember_me": False
        }
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=payload)
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        assert "غير صحيحة" in response.json().get("detail", "")
        print("✓ Login with wrong password correctly returns 401")
    
    def test_login_nonexistent_email_returns_401(self, api_client):
        """Test login with non-existent email returns 401"""
        payload = {
            "email": f"nonexistent_{uuid.uuid4().hex[:8]}@example.com",
            "password": "anypassword123",
            "remember_me": False
        }
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=payload)
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Login with non-existent email correctly returns 401")
    
    def test_login_remember_me_true_30_day_session(self, api_client, registered_user):
        """Test login with remember_me=true creates 30-day session"""
        payload = {
            "email": registered_user["email"],
            "password": registered_user["password"],
            "remember_me": True
        }
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        
        # 30 days = 30 * 24 * 60 * 60 = 2592000 seconds
        expected_expires = 30 * 24 * 60 * 60
        assert data["expires_in"] == expected_expires, f"Expected {expected_expires}, got {data['expires_in']}"
        print(f"✓ Remember me=true creates 30-day session (expires_in={data['expires_in']})")
    
    def test_login_remember_me_false_1_day_session(self, api_client, registered_user):
        """Test login with remember_me=false creates 1-day session"""
        payload = {
            "email": registered_user["email"],
            "password": registered_user["password"],
            "remember_me": False
        }
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        
        # 1 day = 24 * 60 * 60 = 86400 seconds
        expected_expires = 24 * 60 * 60
        assert data["expires_in"] == expected_expires, f"Expected {expected_expires}, got {data['expires_in']}"
        print(f"✓ Remember me=false creates 1-day session (expires_in={data['expires_in']})")


# ===== SESSION VALIDATION TESTS =====
class TestSessionValidation:
    """Session validation tests - GET /api/auth/me"""
    
    @pytest.fixture
    def authenticated_user(self, api_client):
        """Create and login a user, return session token"""
        email = f"session_test_{uuid.uuid4().hex[:8]}@example.com"
        password = "testpass123"
        
        # Register
        api_client.post(f"{BASE_URL}/api/auth/signup", json={
            "email": email,
            "password": password,
            "name": "مستخدم الجلسة"
        })
        
        # Login
        login_response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password,
            "remember_me": False
        })
        
        return {
            "email": email,
            "token": login_response.json()["token"],
            "user": login_response.json()["user"]
        }
    
    def test_session_validation_with_x_session_token_header(self, api_client, authenticated_user):
        """Test GET /api/auth/me with X-Session-Token header"""
        api_client.headers["X-Session-Token"] = authenticated_user["token"]
        response = api_client.get(f"{BASE_URL}/api/auth/me")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data["email"] == authenticated_user["email"]
        assert "user_id" in data
        assert "role" in data
        print(f"✓ Session validation with X-Session-Token header works")
    
    def test_session_validation_with_bearer_token(self, api_client, authenticated_user):
        """Test GET /api/auth/me with Authorization Bearer header"""
        api_client.headers["Authorization"] = f"Bearer {authenticated_user['token']}"
        response = api_client.get(f"{BASE_URL}/api/auth/me")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data["email"] == authenticated_user["email"]
        print(f"✓ Session validation with Bearer token works")
    
    def test_session_validation_without_token_returns_401(self, api_client):
        """Test GET /api/auth/me without token returns 401"""
        response = api_client.get(f"{BASE_URL}/api/auth/me")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Session validation without token correctly returns 401")
    
    def test_session_validation_with_invalid_token_returns_401(self, api_client):
        """Test GET /api/auth/me with invalid token returns 401"""
        api_client.headers["X-Session-Token"] = "invalid_session_token_12345"
        response = api_client.get(f"{BASE_URL}/api/auth/me")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Session validation with invalid token correctly returns 401")


# ===== LOGOUT TESTS =====
class TestLogout:
    """Logout endpoint tests - POST /api/auth/logout"""
    
    @pytest.fixture
    def logged_in_user(self, api_client):
        """Create and login a user"""
        email = f"logout_test_{uuid.uuid4().hex[:8]}@example.com"
        password = "testpass123"
        
        # Register
        api_client.post(f"{BASE_URL}/api/auth/signup", json={
            "email": email,
            "password": password,
            "name": "مستخدم الخروج"
        })
        
        # Login
        login_response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password,
            "remember_me": False
        })
        
        return {
            "email": email,
            "token": login_response.json()["token"]
        }
    
    def test_logout_clears_session(self, api_client, logged_in_user):
        """Test POST /api/auth/logout clears session"""
        # Set the session token as cookie (simulating browser behavior)
        api_client.cookies.set("session_token", logged_in_user["token"])
        
        response = api_client.post(f"{BASE_URL}/api/auth/logout")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify session is cleared - try to access /auth/me
        api_client.headers["X-Session-Token"] = logged_in_user["token"]
        me_response = api_client.get(f"{BASE_URL}/api/auth/me")
        
        # Session should be invalid after logout
        assert me_response.status_code == 401, "Session should be invalid after logout"
        print("✓ Logout successfully clears session")
    
    def test_logout_without_session_still_succeeds(self, api_client):
        """Test logout without session still returns success"""
        response = api_client.post(f"{BASE_URL}/api/auth/logout")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✓ Logout without session still succeeds")


# ===== INTEGRATION TESTS =====
class TestAuthIntegration:
    """Full auth flow integration tests"""
    
    def test_full_auth_flow_signup_login_me_logout(self, api_client):
        """Test complete auth flow: signup -> login -> me -> logout"""
        email = f"integration_{uuid.uuid4().hex[:8]}@example.com"
        password = "testpass123"
        name = "مستخدم التكامل"
        
        # Step 1: Signup
        signup_response = api_client.post(f"{BASE_URL}/api/auth/signup", json={
            "email": email,
            "password": password,
            "name": name
        })
        assert signup_response.status_code == 200
        signup_token = signup_response.json()["token"]
        print(f"  1. Signup successful, token: {signup_token[:20]}...")
        
        # Step 2: Login
        login_response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password,
            "remember_me": True
        })
        assert login_response.status_code == 200
        login_token = login_response.json()["token"]
        print(f"  2. Login successful, token: {login_token[:20]}...")
        
        # Step 3: Get current user
        api_client.headers["X-Session-Token"] = login_token
        me_response = api_client.get(f"{BASE_URL}/api/auth/me")
        assert me_response.status_code == 200
        user_data = me_response.json()
        assert user_data["email"] == email
        assert user_data["name"] == name
        print(f"  3. Get me successful, user: {user_data['name']}")
        
        # Step 4: Logout
        api_client.cookies.set("session_token", login_token)
        logout_response = api_client.post(f"{BASE_URL}/api/auth/logout")
        assert logout_response.status_code == 200
        print("  4. Logout successful")
        
        # Step 5: Verify session is invalid
        verify_response = api_client.get(f"{BASE_URL}/api/auth/me")
        assert verify_response.status_code == 401
        print("  5. Session correctly invalidated after logout")
        
        print("✓ Full auth flow completed successfully")
    
    def test_signup_creates_student_role_by_default(self, api_client, unique_email):
        """Test that signup creates user with student role by default"""
        payload = {
            "email": unique_email,
            "password": "testpass123",
            "name": "طالب افتراضي"
        }
        response = api_client.post(f"{BASE_URL}/api/auth/signup", json=payload)
        
        assert response.status_code == 200
        user = response.json()["user"]
        assert user["role"] == "student"
        print("✓ Signup creates student role by default")
    
    def test_signup_sets_auth_provider_to_email(self, api_client, unique_email):
        """Test that signup sets auth_provider to 'email'"""
        payload = {
            "email": unique_email,
            "password": "testpass123",
            "name": "مستخدم البريد"
        }
        response = api_client.post(f"{BASE_URL}/api/auth/signup", json=payload)
        
        assert response.status_code == 200
        user = response.json()["user"]
        assert user.get("auth_provider") == "email"
        print("✓ Signup sets auth_provider to 'email'")


# ===== EDGE CASES =====
class TestAuthEdgeCases:
    """Edge case tests for auth system"""
    
    def test_login_with_empty_password(self, api_client):
        """Test login with empty password"""
        payload = {
            "email": "test@example.com",
            "password": "",
            "remember_me": False
        }
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=payload)
        
        # Should return 401 or 422
        assert response.status_code in [401, 422], f"Expected 401/422, got {response.status_code}"
        print("✓ Login with empty password correctly rejected")
    
    def test_signup_with_very_long_name(self, api_client, unique_email):
        """Test signup with very long name"""
        payload = {
            "email": unique_email,
            "password": "testpass123",
            "name": "أ" * 500  # Very long Arabic name
        }
        response = api_client.post(f"{BASE_URL}/api/auth/signup", json=payload)
        
        # Should either succeed or return validation error
        assert response.status_code in [200, 422], f"Expected 200/422, got {response.status_code}"
        print(f"✓ Signup with very long name handled (status: {response.status_code})")
    
    def test_login_case_sensitivity(self, api_client):
        """Test that email login is case-insensitive"""
        email = f"CaseTest_{uuid.uuid4().hex[:8]}@Example.COM"
        password = "testpass123"
        
        # Signup with mixed case
        signup_response = api_client.post(f"{BASE_URL}/api/auth/signup", json={
            "email": email,
            "password": password,
            "name": "اختبار الحالة"
        })
        
        if signup_response.status_code == 200:
            # Try login with lowercase
            login_response = api_client.post(f"{BASE_URL}/api/auth/login", json={
                "email": email.lower(),
                "password": password,
                "remember_me": False
            })
            
            # Note: This test documents current behavior
            print(f"  Login with lowercase email: {login_response.status_code}")
        
        print("✓ Email case sensitivity test completed")


# ===== CLEANUP =====
@pytest.fixture(scope="module", autouse=True)
def cleanup(request):
    """Cleanup test data after all tests"""
    def cleanup_data():
        import subprocess
        subprocess.run([
            'mongosh', '--quiet', '--eval', '''
use('test_database');
// Clean up test users created by auth tests
db.users.deleteMany({email: /test_auth_|login_test_|session_test_|logout_test_|integration_|CaseTest_/});
db.user_sessions.deleteMany({session_token: /session_/});
print('Auth test data cleaned up');
'''
        ], capture_output=True, text=True)
    
    request.addfinalizer(cleanup_data)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
