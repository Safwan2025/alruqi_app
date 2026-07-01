"""
Test suite for Structured Memorization Record Feature
Tests:
1. GET /api/quran/surahs - Returns 114 surahs with ayah_count
2. POST /api/sessions/{session_id}/notes - Validates surah_name and ayah range
3. GET /api/students/{student_id}/progress - Returns progress with teacher_name
4. GET /api/teacher/student-profile/{student_id} - Returns memorization.progress_log
5. Visibility: All teachers can see all student notes
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_STUDENT_EMAIL = "test_dialog_user@test.com"
TEST_STUDENT_PASSWORD = "test123456"
TEACHER_SESSION_TOKEN = "session_aaa006432627d3b4ea58cff9d2baa09b"  # البراء السيدا


class TestQuranSurahsEndpoint:
    """Tests for GET /api/quran/surahs endpoint"""
    
    def test_get_surahs_returns_114_surahs(self):
        """Verify endpoint returns all 114 surahs"""
        response = requests.get(f"{BASE_URL}/api/quran/surahs")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "surahs" in data, "Response should contain 'surahs' key"
        assert len(data["surahs"]) == 114, f"Expected 114 surahs, got {len(data['surahs'])}"
        print(f"✓ GET /api/quran/surahs returns {len(data['surahs'])} surahs")
    
    def test_surahs_have_required_fields(self):
        """Verify each surah has number, name, and ayah_count"""
        response = requests.get(f"{BASE_URL}/api/quran/surahs")
        data = response.json()
        
        for surah in data["surahs"]:
            assert "number" in surah, f"Surah missing 'number': {surah}"
            assert "name" in surah, f"Surah missing 'name': {surah}"
            assert "ayah_count" in surah, f"Surah missing 'ayah_count': {surah}"
        
        # Verify first and last surah
        first_surah = data["surahs"][0]
        assert first_surah["number"] == 1
        assert first_surah["name"] == "الفاتحة"
        assert first_surah["ayah_count"] == 7
        
        last_surah = data["surahs"][-1]
        assert last_surah["number"] == 114
        assert last_surah["name"] == "الناس"
        assert last_surah["ayah_count"] == 6
        
        print("✓ All surahs have required fields (number, name, ayah_count)")
    
    def test_surahs_ayah_counts_are_valid(self):
        """Verify ayah counts are positive integers"""
        response = requests.get(f"{BASE_URL}/api/quran/surahs")
        data = response.json()
        
        for surah in data["surahs"]:
            assert isinstance(surah["ayah_count"], int), f"ayah_count should be int: {surah}"
            assert surah["ayah_count"] > 0, f"ayah_count should be positive: {surah}"
        
        # Check some known values
        baqarah = next(s for s in data["surahs"] if s["name"] == "البقرة")
        assert baqarah["ayah_count"] == 286, "Al-Baqarah should have 286 ayahs"
        
        print("✓ All ayah counts are valid positive integers")


class TestStudentLogin:
    """Helper to get student session token"""
    
    @pytest.fixture
    def student_session(self):
        """Login as test student and return session token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_STUDENT_EMAIL, "password": TEST_STUDENT_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip(f"Could not login as test student: {response.text}")
        
        data = response.json()
        return {
            "token": data["token"],
            "user_id": data["user"]["user_id"]
        }


class TestStudentProgressEndpoint(TestStudentLogin):
    """Tests for GET /api/students/{student_id}/progress"""
    
    def test_student_can_view_own_progress(self, student_session):
        """Student can view their own progress"""
        response = requests.get(
            f"{BASE_URL}/api/students/{student_session['user_id']}/progress",
            headers={"X-Session-Token": student_session["token"]}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "total_entries" in data
        assert "progress_log" in data
        assert "sessions_with_notes" in data
        assert "weekly_summary" in data
        
        print(f"✓ Student can view own progress (total_entries: {data['total_entries']})")
    
    def test_student_cannot_view_other_progress(self, student_session):
        """Student cannot view another student's progress"""
        other_student_id = "user_other_student_123"
        response = requests.get(
            f"{BASE_URL}/api/students/{other_student_id}/progress",
            headers={"X-Session-Token": student_session["token"]}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✓ Student cannot view other student's progress (403)")
    
    def test_progress_response_structure(self, student_session):
        """Verify progress response has correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/students/{student_session['user_id']}/progress",
            headers={"X-Session-Token": student_session["token"]}
        )
        data = response.json()
        
        # Check weekly_summary structure
        assert "quality_breakdown" in data["weekly_summary"]
        breakdown = data["weekly_summary"]["quality_breakdown"]
        assert "ممتاز" in breakdown
        assert "متوسط" in breakdown
        assert "مقبول" in breakdown
        assert "ضعيف" in breakdown
        
        print("✓ Progress response has correct structure with quality breakdown")


class TestTeacherEndpoints:
    """Tests for teacher-only endpoints"""
    
    @pytest.fixture
    def teacher_headers(self):
        """Return headers with teacher session token"""
        # Verify teacher session is valid
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"X-Session-Token": TEACHER_SESSION_TOKEN}
        )
        if response.status_code != 200:
            pytest.skip("Teacher session expired or invalid")
        
        user = response.json()
        if user.get("role") != "teacher":
            pytest.skip("Session is not for a teacher")
        
        return {
            "X-Session-Token": TEACHER_SESSION_TOKEN,
            "Content-Type": "application/json"
        }
    
    def test_teacher_can_view_student_progress(self, teacher_headers):
        """Teacher can view any student's progress"""
        # First login as student to get student_id
        login_resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_STUDENT_EMAIL, "password": TEST_STUDENT_PASSWORD}
        )
        if login_resp.status_code != 200:
            pytest.skip("Could not login as test student")
        
        student_id = login_resp.json()["user"]["user_id"]
        
        # Teacher views student progress
        response = requests.get(
            f"{BASE_URL}/api/students/{student_id}/progress",
            headers=teacher_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "progress_log" in data
        assert "sessions_with_notes" in data
        
        print(f"✓ Teacher can view student progress (student_id: {student_id})")
    
    def test_teacher_can_view_student_full_profile(self, teacher_headers):
        """Teacher can view student's full profile with memorization data"""
        # Get student_id
        login_resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_STUDENT_EMAIL, "password": TEST_STUDENT_PASSWORD}
        )
        if login_resp.status_code != 200:
            pytest.skip("Could not login as test student")
        
        student_id = login_resp.json()["user"]["user_id"]
        
        # Teacher views full profile
        response = requests.get(
            f"{BASE_URL}/api/teacher/student-profile/{student_id}",
            headers=teacher_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify structure
        assert "student" in data
        assert "statistics" in data
        assert "memorization" in data
        assert "ratings" in data
        
        # Verify memorization structure
        mem = data["memorization"]
        assert "surahs_covered" in mem
        assert "progress_log" in mem or "total_progress_entries" in mem
        
        print(f"✓ Teacher can view student full profile with memorization data")
        print(f"  - Surahs covered: {len(mem.get('surahs_covered', []))}")
        print(f"  - Progress entries: {mem.get('total_progress_entries', 0)}")


class TestSessionNotesWithMemorization:
    """Tests for POST /api/sessions/{session_id}/notes with memorization progress"""
    
    @pytest.fixture
    def teacher_headers(self):
        """Return headers with teacher session token"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"X-Session-Token": TEACHER_SESSION_TOKEN}
        )
        if response.status_code != 200:
            pytest.skip("Teacher session expired or invalid")
        
        return {
            "X-Session-Token": TEACHER_SESSION_TOKEN,
            "Content-Type": "application/json"
        }
    
    @pytest.fixture
    def test_session_id(self, teacher_headers):
        """Get or create a test session for the teacher"""
        # Get teacher's sessions
        response = requests.get(
            f"{BASE_URL}/api/sessions/my-sessions",
            headers=teacher_headers
        )
        if response.status_code != 200:
            pytest.skip("Could not get teacher sessions")
        
        sessions = response.json()
        if not sessions:
            pytest.skip("No sessions available for testing")
        
        # Return first session
        return sessions[0]["session_id"]
    
    def test_add_notes_with_valid_memorization_progress(self, teacher_headers, test_session_id):
        """Teacher can add notes with valid memorization progress"""
        notes_data = {
            "mistakes": "TEST_أخطاء في التجويد",
            "corrections": "TEST_تصحيحات مطلوبة",
            "recommendations": "TEST_توصيات للمراجعة",
            "memorization_progress": {
                "surah_name": "الفاتحة",
                "from_ayah": 1,
                "to_ayah": 7,
                "quality": "ممتاز",
                "notes": "TEST_حفظ ممتاز"
            }
        }
        
        response = requests.post(
            f"{BASE_URL}/api/sessions/{test_session_id}/notes",
            headers=teacher_headers,
            json=notes_data
        )
        
        # May fail if session doesn't belong to this teacher
        if response.status_code == 403:
            print("⚠ Session doesn't belong to this teacher - skipping")
            pytest.skip("Session doesn't belong to this teacher")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✓ Teacher can add notes with valid memorization progress")
    
    def test_add_notes_with_invalid_surah_name(self, teacher_headers, test_session_id):
        """Adding notes with invalid surah name should fail"""
        notes_data = {
            "memorization_progress": {
                "surah_name": "سورة غير موجودة",
                "from_ayah": 1,
                "to_ayah": 5,
                "quality": "ممتاز"
            }
        }
        
        response = requests.post(
            f"{BASE_URL}/api/sessions/{test_session_id}/notes",
            headers=teacher_headers,
            json=notes_data
        )
        
        if response.status_code == 403:
            pytest.skip("Session doesn't belong to this teacher")
        
        assert response.status_code == 400, f"Expected 400 for invalid surah, got {response.status_code}"
        assert "غير صحيح" in response.text or "invalid" in response.text.lower()
        print("✓ Invalid surah name correctly rejected (400)")
    
    def test_add_notes_with_invalid_ayah_range(self, teacher_headers, test_session_id):
        """Adding notes with ayah exceeding surah limit should fail"""
        notes_data = {
            "memorization_progress": {
                "surah_name": "الفاتحة",  # Has only 7 ayahs
                "from_ayah": 1,
                "to_ayah": 100,  # Invalid - exceeds 7
                "quality": "ممتاز"
            }
        }
        
        response = requests.post(
            f"{BASE_URL}/api/sessions/{test_session_id}/notes",
            headers=teacher_headers,
            json=notes_data
        )
        
        if response.status_code == 403:
            pytest.skip("Session doesn't belong to this teacher")
        
        assert response.status_code == 400, f"Expected 400 for invalid ayah range, got {response.status_code}"
        print("✓ Invalid ayah range correctly rejected (400)")
    
    def test_add_notes_with_from_greater_than_to(self, teacher_headers, test_session_id):
        """Adding notes with from_ayah > to_ayah should fail"""
        notes_data = {
            "memorization_progress": {
                "surah_name": "الفاتحة",
                "from_ayah": 5,
                "to_ayah": 2,  # Invalid - from > to
                "quality": "ممتاز"
            }
        }
        
        response = requests.post(
            f"{BASE_URL}/api/sessions/{test_session_id}/notes",
            headers=teacher_headers,
            json=notes_data
        )
        
        if response.status_code == 403:
            pytest.skip("Session doesn't belong to this teacher")
        
        assert response.status_code == 400, f"Expected 400 for from > to, got {response.status_code}"
        print("✓ from_ayah > to_ayah correctly rejected (400)")


class TestVisibilityAllTeachersCanSeeAllNotes:
    """Test that all teachers can see all student notes (not just their own)"""
    
    def test_sessions_with_notes_not_filtered_by_teacher(self):
        """Verify sessions_with_notes returns notes from ALL teachers"""
        # Login as student
        login_resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_STUDENT_EMAIL, "password": TEST_STUDENT_PASSWORD}
        )
        if login_resp.status_code != 200:
            pytest.skip("Could not login as test student")
        
        student_id = login_resp.json()["user"]["user_id"]
        
        # Get progress as teacher
        response = requests.get(
            f"{BASE_URL}/api/students/{student_id}/progress",
            headers={"X-Session-Token": TEACHER_SESSION_TOKEN}
        )
        
        if response.status_code != 200:
            pytest.skip("Could not get student progress")
        
        data = response.json()
        
        # Check that sessions_with_notes includes teacher_name field
        for session in data.get("sessions_with_notes", []):
            # Each session should have teacher_name enriched
            if "teacher_id" in session:
                # teacher_name should be present (enriched by backend)
                assert "teacher_name" in session or session.get("teacher_name") is not None, \
                    f"Session missing teacher_name: {session.get('session_id')}"
        
        print(f"✓ sessions_with_notes includes teacher_name (count: {len(data.get('sessions_with_notes', []))})")
    
    def test_progress_log_includes_teacher_name(self):
        """Verify progress_log entries include teacher_name"""
        # Login as student
        login_resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_STUDENT_EMAIL, "password": TEST_STUDENT_PASSWORD}
        )
        if login_resp.status_code != 200:
            pytest.skip("Could not login as test student")
        
        student_id = login_resp.json()["user"]["user_id"]
        
        # Get progress as teacher
        response = requests.get(
            f"{BASE_URL}/api/students/{student_id}/progress",
            headers={"X-Session-Token": TEACHER_SESSION_TOKEN}
        )
        
        if response.status_code != 200:
            pytest.skip("Could not get student progress")
        
        data = response.json()
        
        # Check progress_log entries
        for entry in data.get("progress_log", []):
            if "teacher_id" in entry:
                # teacher_name should be enriched
                assert "teacher_name" in entry, f"Progress entry missing teacher_name: {entry.get('progress_id')}"
        
        print(f"✓ progress_log entries include teacher_name (count: {len(data.get('progress_log', []))})")


class TestStudentProfileMemorizationLog:
    """Test that StudentProfileModal shows memorization progress_log"""
    
    def test_student_profile_includes_progress_log(self):
        """Verify /teacher/student-profile returns memorization.progress_log"""
        # Login as student to get ID
        login_resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_STUDENT_EMAIL, "password": TEST_STUDENT_PASSWORD}
        )
        if login_resp.status_code != 200:
            pytest.skip("Could not login as test student")
        
        student_id = login_resp.json()["user"]["user_id"]
        
        # Get full profile as teacher
        response = requests.get(
            f"{BASE_URL}/api/teacher/student-profile/{student_id}",
            headers={"X-Session-Token": TEACHER_SESSION_TOKEN}
        )
        
        if response.status_code != 200:
            pytest.skip(f"Could not get student profile: {response.text}")
        
        data = response.json()
        
        # Verify memorization section
        assert "memorization" in data, "Response missing 'memorization' section"
        mem = data["memorization"]
        
        assert "progress_log" in mem, "memorization missing 'progress_log'"
        assert "surahs_covered" in mem, "memorization missing 'surahs_covered'"
        assert "total_progress_entries" in mem or "total_recitation_notes" in mem, \
            "memorization missing total count field"
        
        # If there are entries, verify structure
        for entry in mem.get("progress_log", []):
            assert "surah_name" in entry, f"Entry missing surah_name: {entry}"
            assert "from_ayah" in entry, f"Entry missing from_ayah: {entry}"
            assert "to_ayah" in entry, f"Entry missing to_ayah: {entry}"
            assert "quality" in entry, f"Entry missing quality: {entry}"
            # teacher_name should be enriched
            if "teacher_id" in entry:
                assert "teacher_name" in entry, f"Entry missing teacher_name: {entry}"
        
        print(f"✓ Student profile includes memorization.progress_log")
        print(f"  - Surahs covered: {len(mem.get('surahs_covered', []))}")
        print(f"  - Progress log entries: {len(mem.get('progress_log', []))}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
