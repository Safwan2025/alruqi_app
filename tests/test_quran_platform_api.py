"""
Quran Teaching Platform API Tests
Tests for: Messages, Profile Picture Upload, Session Cancellation, Vacation Days, 
Student Restrictions, Notifications, Admin Features, Student Progress, Session Notes
"""

import pytest
import requests
import os
from datetime import datetime, timedelta
import base64

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://tajweed-platform-1.preview.emergentagent.com').rstrip('/')

# Test credentials - will be set up in fixtures
TEACHER_SESSION = None
STUDENT_SESSION = None
ADMIN_SESSION = None
TEACHER_ID = None
STUDENT_ID = None
ADMIN_ID = None


@pytest.fixture(scope="module")
def setup_test_users():
    """Create test users and sessions in MongoDB"""
    import subprocess
    import re
    
    result = subprocess.run([
        'mongosh', '--quiet', '--eval', '''
use('test_database');

// Clean up old test data
db.users.deleteMany({email: /test\\.teacher\\.|test\\.student\\./});
db.user_sessions.deleteMany({session_token: /test_teacher_session|test_student_session|test_admin_session/});

// Create test teacher
var teacherId = 'test_teacher_' + Date.now();
var teacherSessionToken = 'test_teacher_session_' + Date.now();
db.users.insertOne({
  user_id: teacherId,
  email: 'test.teacher.' + Date.now() + '@example.com',
  name: 'محمد الانصاري',
  picture: 'https://via.placeholder.com/150',
  role: 'teacher',
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: teacherId,
  session_token: teacherSessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});

// Create test student
var studentId = 'test_student_' + Date.now();
var studentSessionToken = 'test_student_session_' + Date.now();
db.users.insertOne({
  user_id: studentId,
  email: 'test.student.' + Date.now() + '@example.com',
  name: 'طالب اختبار',
  picture: 'https://via.placeholder.com/150',
  role: 'student',
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: studentId,
  session_token: studentSessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});

// Create admin user (or update existing)
var adminId = 'test_admin_' + Date.now();
var adminSessionToken = 'test_admin_session_' + Date.now();
db.users.updateOne(
  {email: 'm0m0077100@gmail.com'},
  {$set: {
    user_id: adminId,
    name: 'محمد الأنصاري (Admin)',
    role: 'teacher',
    created_at: new Date()
  }},
  {upsert: true}
);
db.user_sessions.insertOne({
  user_id: adminId,
  session_token: adminSessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});

print('TEACHER_ID=' + teacherId);
print('TEACHER_SESSION=' + teacherSessionToken);
print('STUDENT_ID=' + studentId);
print('STUDENT_SESSION=' + studentSessionToken);
print('ADMIN_ID=' + adminId);
print('ADMIN_SESSION=' + adminSessionToken);
'''
    ], capture_output=True, text=True)
    
    output = result.stdout
    
    # Parse output
    teacher_id = re.search(r'TEACHER_ID=(\S+)', output).group(1)
    teacher_session = re.search(r'TEACHER_SESSION=(\S+)', output).group(1)
    student_id = re.search(r'STUDENT_ID=(\S+)', output).group(1)
    student_session = re.search(r'STUDENT_SESSION=(\S+)', output).group(1)
    admin_id = re.search(r'ADMIN_ID=(\S+)', output).group(1)
    admin_session = re.search(r'ADMIN_SESSION=(\S+)', output).group(1)
    
    return {
        'teacher_id': teacher_id,
        'teacher_session': teacher_session,
        'student_id': student_id,
        'student_session': student_session,
        'admin_id': admin_id,
        'admin_session': admin_session
    }


@pytest.fixture
def teacher_client(setup_test_users):
    """Session with teacher auth"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {setup_test_users['teacher_session']}"
    })
    session.teacher_id = setup_test_users['teacher_id']
    return session


@pytest.fixture
def student_client(setup_test_users):
    """Session with student auth"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {setup_test_users['student_session']}"
    })
    session.student_id = setup_test_users['student_id']
    return session


@pytest.fixture
def admin_client(setup_test_users):
    """Session with admin auth"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {setup_test_users['admin_session']}"
    })
    session.admin_id = setup_test_users['admin_id']
    return session


@pytest.fixture
def api_client():
    """Unauthenticated session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


# ===== HEALTH CHECK =====
class TestHealthCheck:
    """Basic API health checks"""
    
    def test_teachers_endpoint_accessible(self, api_client):
        """Test that teachers endpoint is accessible without auth"""
        response = api_client.get(f"{BASE_URL}/api/teachers")
        assert response.status_code == 200
        print(f"✓ Teachers endpoint accessible, returned {len(response.json())} teachers")


# ===== AUTH TESTS =====
class TestAuth:
    """Authentication endpoint tests"""
    
    def test_auth_me_with_valid_token(self, teacher_client):
        """Test /api/auth/me returns user data with valid token"""
        response = teacher_client.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert "user_id" in data
        assert "email" in data
        assert "role" in data
        print(f"✓ Auth/me works - User: {data['name']}, Role: {data['role']}")
    
    def test_auth_me_without_token(self, api_client):
        """Test /api/auth/me returns 401 without token"""
        response = api_client.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        print("✓ Auth/me correctly returns 401 without token")


# ===== MESSAGE TESTS (Bug #1) =====
class TestMessages:
    """Message send functionality tests - Bug #1"""
    
    def test_teacher_send_message_to_student(self, teacher_client, setup_test_users):
        """Test POST /api/messages/send (teacher to student)"""
        payload = {
            "student_id": setup_test_users['student_id'],
            "message": "مرحباً، هذه رسالة اختبار من المعلم"
        }
        response = teacher_client.post(f"{BASE_URL}/api/messages/send", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "message_id" in data
        assert data["message"] == "Message sent successfully"
        print(f"✓ Teacher message sent successfully, message_id: {data['message_id']}")
        return data["message_id"]
    
    def test_student_send_message_to_teacher(self, student_client, setup_test_users):
        """Test POST /api/messages/send-to-teacher (student to teacher)"""
        payload = {
            "teacher_id": setup_test_users['teacher_id'],
            "message": "مرحباً شيخنا، هذه رسالة اختبار من الطالب"
        }
        response = student_client.post(f"{BASE_URL}/api/messages/send-to-teacher", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "message_id" in data
        assert data["message"] == "Message sent successfully"
        print(f"✓ Student message sent successfully, message_id: {data['message_id']}")
        return data["message_id"]
    
    def test_student_cannot_use_teacher_endpoint(self, student_client, setup_test_users):
        """Test that students cannot use /api/messages/send"""
        payload = {
            "student_id": setup_test_users['student_id'],
            "message": "This should fail"
        }
        response = student_client.post(f"{BASE_URL}/api/messages/send", json=payload)
        assert response.status_code == 403
        print("✓ Student correctly blocked from teacher message endpoint")
    
    def test_teacher_cannot_use_student_endpoint(self, teacher_client, setup_test_users):
        """Test that teachers cannot use /api/messages/send-to-teacher"""
        payload = {
            "teacher_id": setup_test_users['teacher_id'],
            "message": "This should fail"
        }
        response = teacher_client.post(f"{BASE_URL}/api/messages/send-to-teacher", json=payload)
        assert response.status_code == 403
        print("✓ Teacher correctly blocked from student message endpoint")
    
    def test_get_my_messages(self, teacher_client):
        """Test GET /api/messages/my-messages"""
        response = teacher_client.get(f"{BASE_URL}/api/messages/my-messages")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Get messages works, returned {len(data)} messages")


# ===== MESSAGE DELETE TESTS =====
class TestMessageDelete:
    """Message deletion tests"""
    
    def test_delete_own_message(self, teacher_client, setup_test_users):
        """Test DELETE /api/messages/{message_id} - sender can delete"""
        # First send a message
        payload = {
            "student_id": setup_test_users['student_id'],
            "message": "رسالة للحذف"
        }
        send_response = teacher_client.post(f"{BASE_URL}/api/messages/send", json=payload)
        assert send_response.status_code == 200
        message_id = send_response.json()["message_id"]
        
        # Now delete it
        delete_response = teacher_client.delete(f"{BASE_URL}/api/messages/{message_id}")
        assert delete_response.status_code == 200
        assert delete_response.json()["message"] == "Message deleted successfully"
        print(f"✓ Message {message_id} deleted successfully")
    
    def test_cannot_delete_others_message(self, student_client, teacher_client, setup_test_users):
        """Test that users cannot delete others' messages"""
        # Teacher sends a message
        payload = {
            "student_id": setup_test_users['student_id'],
            "message": "رسالة لا يمكن حذفها من الطالب"
        }
        send_response = teacher_client.post(f"{BASE_URL}/api/messages/send", json=payload)
        message_id = send_response.json()["message_id"]
        
        # Student tries to delete it
        delete_response = student_client.delete(f"{BASE_URL}/api/messages/{message_id}")
        assert delete_response.status_code == 403
        print("✓ Student correctly blocked from deleting teacher's message")


# ===== PROFILE PICTURE UPLOAD TESTS (Bug #2) =====
class TestProfilePictureUpload:
    """Profile picture upload tests - Bug #2"""
    
    def test_upload_valid_picture(self, teacher_client):
        """Test POST /api/users/upload-picture with valid base64 image"""
        # Create a small valid base64 image (1x1 red pixel PNG)
        small_png_base64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        
        payload = {"picture_url": small_png_base64}
        response = teacher_client.post(f"{BASE_URL}/api/users/upload-picture", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "picture" in data
        assert data["picture"].startswith("data:image/")
        print("✓ Profile picture uploaded successfully")
    
    def test_upload_invalid_format(self, teacher_client):
        """Test upload with invalid format"""
        payload = {"picture_url": "not-a-valid-image"}
        response = teacher_client.post(f"{BASE_URL}/api/users/upload-picture", json=payload)
        
        assert response.status_code == 400
        print("✓ Invalid image format correctly rejected")
    
    def test_upload_without_auth(self, api_client):
        """Test upload without authentication"""
        payload = {"picture_url": "data:image/png;base64,test"}
        response = api_client.post(f"{BASE_URL}/api/users/upload-picture", json=payload)
        
        assert response.status_code == 401
        print("✓ Unauthenticated upload correctly rejected")


# ===== SESSION CANCELLATION TESTS =====
class TestSessionCancellation:
    """Session cancellation with mandatory reason tests"""
    
    def test_cancel_session_with_reason(self, student_client, setup_test_users):
        """Test PUT /api/sessions/{session_id}/cancel with reason"""
        # First create a session
        import subprocess
        result = subprocess.run([
            'mongosh', '--quiet', '--eval', f'''
use('test_database');
var sessionId = 'test_session_' + Date.now();
db.sessions.insertOne({{
  session_id: sessionId,
  student_id: '{setup_test_users["student_id"]}',
  teacher_id: '{setup_test_users["teacher_id"]}',
  teacher_name: 'محمد الانصاري',
  student_name: 'طالب اختبار',
  scheduled_time: new Date(Date.now() + 24*60*60*1000).toISOString(),
  duration: 60,
  status: 'scheduled',
  meeting_room_id: 'room_test',
  created_at: new Date().toISOString()
}});
print('SESSION_ID=' + sessionId);
'''
        ], capture_output=True, text=True)
        
        import re
        session_id = re.search(r'SESSION_ID=(\S+)', result.stdout).group(1)
        
        # Cancel with reason
        payload = {"reason": "ظروف طارئة - اختبار"}
        response = student_client.put(f"{BASE_URL}/api/sessions/{session_id}/cancel", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["message"] == "Session cancelled successfully"
        assert data["cancelled_by"] == "student"
        print(f"✓ Session {session_id} cancelled successfully with reason")
    
    def test_cancel_session_without_reason(self, student_client, setup_test_users):
        """Test cancellation fails without reason"""
        # Create another session
        import subprocess
        result = subprocess.run([
            'mongosh', '--quiet', '--eval', f'''
use('test_database');
var sessionId = 'test_session_noreason_' + Date.now();
db.sessions.insertOne({{
  session_id: sessionId,
  student_id: '{setup_test_users["student_id"]}',
  teacher_id: '{setup_test_users["teacher_id"]}',
  teacher_name: 'محمد الانصاري',
  student_name: 'طالب اختبار',
  scheduled_time: new Date(Date.now() + 24*60*60*1000).toISOString(),
  duration: 60,
  status: 'scheduled',
  meeting_room_id: 'room_test2',
  created_at: new Date().toISOString()
}});
print('SESSION_ID=' + sessionId);
'''
        ], capture_output=True, text=True)
        
        import re
        session_id = re.search(r'SESSION_ID=(\S+)', result.stdout).group(1)
        
        # Try to cancel without reason
        payload = {"reason": ""}
        response = student_client.put(f"{BASE_URL}/api/sessions/{session_id}/cancel", json=payload)
        
        assert response.status_code == 400
        print("✓ Cancellation without reason correctly rejected")


# ===== VACATION DAYS TESTS =====
class TestVacationDays:
    """Teacher vacation days management tests"""
    
    def test_add_vacation_day(self, teacher_client):
        """Test POST /api/teacher/vacation-days"""
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        payload = {
            "date": tomorrow,
            "reason": "إجازة اختبار"
        }
        response = teacher_client.post(f"{BASE_URL}/api/teacher/vacation-days", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "vacation_id" in data
        print(f"✓ Vacation day added: {data['vacation_id']}")
        return data["vacation_id"]
    
    def test_get_vacation_days(self, teacher_client):
        """Test GET /api/teacher/vacation-days"""
        response = teacher_client.get(f"{BASE_URL}/api/teacher/vacation-days")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Get vacation days works, returned {len(data)} days")
    
    def test_delete_vacation_day(self, teacher_client):
        """Test DELETE /api/teacher/vacation-days/{vacation_id}"""
        # First add a vacation day
        day_after = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")
        add_response = teacher_client.post(f"{BASE_URL}/api/teacher/vacation-days", json={
            "date": day_after,
            "reason": "للحذف"
        })
        vacation_id = add_response.json()["vacation_id"]
        
        # Delete it
        delete_response = teacher_client.delete(f"{BASE_URL}/api/teacher/vacation-days/{vacation_id}")
        assert delete_response.status_code == 200
        print(f"✓ Vacation day {vacation_id} deleted successfully")
    
    def test_student_cannot_add_vacation(self, student_client):
        """Test that students cannot add vacation days"""
        payload = {"date": "2025-12-25", "reason": "test"}
        response = student_client.post(f"{BASE_URL}/api/teacher/vacation-days", json=payload)
        assert response.status_code == 403
        print("✓ Student correctly blocked from adding vacation days")


# ===== STUDENT RESTRICTIONS TESTS =====
class TestStudentRestrictions:
    """Teacher student restriction tests"""
    
    def test_restrict_student(self, teacher_client, setup_test_users):
        """Test POST /api/teacher/restrict-student"""
        payload = {
            "student_id": setup_test_users['student_id'],
            "reason": "سبب اختبار للتقييد"
        }
        response = teacher_client.post(f"{BASE_URL}/api/teacher/restrict-student", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "restriction_id" in data
        print(f"✓ Student restricted: {data['restriction_id']}")
    
    def test_get_restricted_students(self, teacher_client):
        """Test GET /api/teacher/restricted-students"""
        response = teacher_client.get(f"{BASE_URL}/api/teacher/restricted-students")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Get restricted students works, returned {len(data)} restrictions")
    
    def test_remove_restriction(self, teacher_client, setup_test_users):
        """Test DELETE /api/teacher/restrict-student/{student_id}"""
        response = teacher_client.delete(f"{BASE_URL}/api/teacher/restrict-student/{setup_test_users['student_id']}")
        
        assert response.status_code == 200
        print("✓ Student restriction removed successfully")
    
    def test_student_cannot_restrict(self, student_client, setup_test_users):
        """Test that students cannot restrict others"""
        payload = {
            "student_id": setup_test_users['teacher_id'],
            "reason": "test"
        }
        response = student_client.post(f"{BASE_URL}/api/teacher/restrict-student", json=payload)
        assert response.status_code == 403
        print("✓ Student correctly blocked from restricting others")


# ===== NOTIFICATIONS TESTS =====
class TestNotifications:
    """Notifications system tests"""
    
    def test_get_notifications(self, student_client):
        """Test GET /api/notifications"""
        response = student_client.get(f"{BASE_URL}/api/notifications")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Get notifications works, returned {len(data)} notifications")
    
    def test_mark_notification_read(self, student_client):
        """Test PUT /api/notifications/{notification_id}/read"""
        # First get notifications
        get_response = student_client.get(f"{BASE_URL}/api/notifications")
        notifications = get_response.json()
        
        if notifications:
            notif_id = notifications[0].get("notification_id")
            if notif_id:
                response = student_client.put(f"{BASE_URL}/api/notifications/{notif_id}/read")
                assert response.status_code == 200
                print(f"✓ Notification {notif_id} marked as read")
            else:
                print("⚠ No notification_id found in notifications")
        else:
            print("⚠ No notifications to mark as read (expected if no prior activity)")
    
    def test_mark_all_notifications_read(self, student_client):
        """Test PUT /api/notifications/read-all"""
        response = student_client.put(f"{BASE_URL}/api/notifications/read-all")
        
        assert response.status_code == 200
        print("✓ All notifications marked as read")


# ===== ADMIN FEATURES TESTS =====
class TestAdminFeatures:
    """Admin-only features tests"""
    
    def test_admin_get_all_bookings(self, admin_client):
        """Test GET /api/admin/all-bookings (admin only)"""
        response = admin_client.get(f"{BASE_URL}/api/admin/all-bookings")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "total_sessions" in data
        assert "total_students" in data
        assert "total_teachers" in data
        assert "bookings_by_teacher" in data
        print(f"✓ Admin all-bookings works: {data['total_sessions']} sessions, {data['total_students']} students")
    
    def test_non_admin_cannot_get_all_bookings(self, teacher_client):
        """Test that non-admin cannot access all-bookings"""
        response = teacher_client.get(f"{BASE_URL}/api/admin/all-bookings")
        assert response.status_code == 403
        print("✓ Non-admin correctly blocked from all-bookings")
    
    def test_admin_post_announcement(self, admin_client):
        """Test POST /api/admin/announcements (admin only)"""
        payload = {
            "title": "إعلان اختبار",
            "content": "هذا إعلان اختبار من النظام",
            "priority": "normal"
        }
        response = admin_client.post(f"{BASE_URL}/api/admin/announcements", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "announcement_id" in data
        print(f"✓ Admin announcement created: {data['announcement_id']}")
    
    def test_non_admin_cannot_post_announcement(self, teacher_client):
        """Test that non-admin cannot post announcements"""
        payload = {
            "title": "test",
            "content": "test",
            "priority": "normal"
        }
        response = teacher_client.post(f"{BASE_URL}/api/admin/announcements", json=payload)
        assert response.status_code == 403
        print("✓ Non-admin correctly blocked from posting announcements")


# ===== SESSION NOTES TESTS =====
class TestSessionNotes:
    """Session notes tests"""
    
    def test_add_session_notes(self, teacher_client, setup_test_users):
        """Test POST /api/sessions/{session_id}/notes"""
        # Create a session first
        import subprocess
        result = subprocess.run([
            'mongosh', '--quiet', '--eval', f'''
use('test_database');
var sessionId = 'test_session_notes_' + Date.now();
db.sessions.insertOne({{
  session_id: sessionId,
  student_id: '{setup_test_users["student_id"]}',
  teacher_id: '{setup_test_users["teacher_id"]}',
  teacher_name: 'محمد الانصاري',
  student_name: 'طالب اختبار',
  scheduled_time: new Date(Date.now() - 24*60*60*1000).toISOString(),
  duration: 60,
  status: 'completed',
  meeting_room_id: 'room_notes',
  created_at: new Date().toISOString()
}});
print('SESSION_ID=' + sessionId);
'''
        ], capture_output=True, text=True)
        
        import re
        session_id = re.search(r'SESSION_ID=(\S+)', result.stdout).group(1)
        
        payload = {
            "mistakes": "بعض الأخطاء في التجويد",
            "corrections": "تم تصحيح مخارج الحروف",
            "recommendations": "مراجعة سورة البقرة",
            "memorization_progress": {
                "surah_name": "البقرة",
                "from_ayah": 1,
                "to_ayah": 10,
                "quality": "ممتاز",
                "notes": "حفظ ممتاز"
            }
        }
        response = teacher_client.post(f"{BASE_URL}/api/sessions/{session_id}/notes", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ Session notes added for session {session_id}")
    
    def test_student_cannot_add_notes(self, student_client, setup_test_users):
        """Test that students cannot add session notes"""
        payload = {
            "mistakes": "test",
            "corrections": "test"
        }
        response = student_client.post(f"{BASE_URL}/api/sessions/fake_session/notes", json=payload)
        assert response.status_code == 403
        print("✓ Student correctly blocked from adding session notes")


# ===== STUDENT PROGRESS TESTS =====
class TestStudentProgress:
    """Student progress tracking tests"""
    
    def test_get_own_progress(self, student_client, setup_test_users):
        """Test GET /api/students/{student_id}/progress - own progress"""
        response = student_client.get(f"{BASE_URL}/api/students/{setup_test_users['student_id']}/progress")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "total_entries" in data
        assert "progress_log" in data
        print(f"✓ Student progress retrieved: {data['total_entries']} entries")
    
    def test_teacher_can_view_student_progress(self, teacher_client, setup_test_users):
        """Test that teacher can view student progress"""
        response = teacher_client.get(f"{BASE_URL}/api/students/{setup_test_users['student_id']}/progress")
        
        assert response.status_code == 200
        print("✓ Teacher can view student progress")
    
    def test_student_cannot_view_others_progress(self, student_client, setup_test_users):
        """Test that student cannot view other students' progress"""
        response = student_client.get(f"{BASE_URL}/api/students/{setup_test_users['teacher_id']}/progress")
        
        assert response.status_code == 403
        print("✓ Student correctly blocked from viewing others' progress")


# ===== TEACHER SLOTS MANAGEMENT TESTS (New Feature) =====
class TestTeacherSlotsManagement:
    """Teacher slots management tests - New Feature for محمد الأنصاري"""
    
    def test_add_teacher_slot(self, teacher_client):
        """Test POST /api/teacher/slots - teacher adds available slot"""
        # Schedule a slot for tomorrow
        tomorrow = (datetime.now() + timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)
        payload = {
            "scheduled_time": tomorrow.isoformat() + "Z",
            "duration": 60
        }
        response = teacher_client.post(f"{BASE_URL}/api/teacher/slots", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "slot_id" in data
        assert data["message"] == "Slot added"
        print(f"✓ Teacher slot added: {data['slot_id']}")
        return data["slot_id"]
    
    def test_add_slot_in_past_fails(self, teacher_client):
        """Test that adding slot in the past fails"""
        yesterday = (datetime.now() - timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)
        payload = {
            "scheduled_time": yesterday.isoformat() + "Z",
            "duration": 60
        }
        response = teacher_client.post(f"{BASE_URL}/api/teacher/slots", json=payload)
        
        assert response.status_code == 400
        print("✓ Adding slot in past correctly rejected")
    
    def test_add_duplicate_slot_fails(self, teacher_client):
        """Test that adding duplicate slot fails"""
        # Add a slot
        future_time = (datetime.now() + timedelta(days=3)).replace(hour=14, minute=0, second=0, microsecond=0)
        payload = {
            "scheduled_time": future_time.isoformat() + "Z",
            "duration": 60
        }
        response1 = teacher_client.post(f"{BASE_URL}/api/teacher/slots", json=payload)
        assert response1.status_code == 200
        
        # Try to add same slot again
        response2 = teacher_client.post(f"{BASE_URL}/api/teacher/slots", json=payload)
        assert response2.status_code == 400
        assert "موجود بالفعل" in response2.json().get("detail", "")
        print("✓ Duplicate slot correctly rejected")
    
    def test_delete_teacher_slot(self, teacher_client):
        """Test DELETE /api/teacher/slots/{slot_id} - teacher deletes slot"""
        # First add a slot
        future_time = (datetime.now() + timedelta(days=4)).replace(hour=16, minute=0, second=0, microsecond=0)
        payload = {
            "scheduled_time": future_time.isoformat() + "Z",
            "duration": 60
        }
        add_response = teacher_client.post(f"{BASE_URL}/api/teacher/slots", json=payload)
        assert add_response.status_code == 200
        slot_id = add_response.json()["slot_id"]
        
        # Delete the slot
        delete_response = teacher_client.delete(f"{BASE_URL}/api/teacher/slots/{slot_id}")
        assert delete_response.status_code == 200
        assert delete_response.json()["message"] == "Slot deleted"
        print(f"✓ Teacher slot {slot_id} deleted successfully")
    
    def test_delete_nonexistent_slot_fails(self, teacher_client):
        """Test that deleting non-existent slot fails"""
        response = teacher_client.delete(f"{BASE_URL}/api/teacher/slots/nonexistent_slot_123")
        assert response.status_code == 404
        print("✓ Deleting non-existent slot correctly returns 404")
    
    def test_student_cannot_add_slot(self, student_client):
        """Test that students cannot add slots"""
        future_time = (datetime.now() + timedelta(days=5)).replace(hour=10, minute=0, second=0, microsecond=0)
        payload = {
            "scheduled_time": future_time.isoformat() + "Z",
            "duration": 60
        }
        response = student_client.post(f"{BASE_URL}/api/teacher/slots", json=payload)
        assert response.status_code == 403
        print("✓ Student correctly blocked from adding slots")
    
    def test_student_cannot_delete_slot(self, student_client, teacher_client):
        """Test that students cannot delete slots"""
        # First add a slot as teacher
        future_time = (datetime.now() + timedelta(days=6)).replace(hour=11, minute=0, second=0, microsecond=0)
        payload = {
            "scheduled_time": future_time.isoformat() + "Z",
            "duration": 60
        }
        add_response = teacher_client.post(f"{BASE_URL}/api/teacher/slots", json=payload)
        slot_id = add_response.json()["slot_id"]
        
        # Try to delete as student
        response = student_client.delete(f"{BASE_URL}/api/teacher/slots/{slot_id}")
        assert response.status_code == 403
        print("✓ Student correctly blocked from deleting slots")
    
    def test_get_teacher_available_slots(self, teacher_client, setup_test_users):
        """Test GET /api/teachers/{teacher_id}/available-slots"""
        response = teacher_client.get(f"{BASE_URL}/api/teachers/{setup_test_users['teacher_id']}/available-slots")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Get available slots works, returned {len(data)} slots")


# ===== CLEANUP =====
@pytest.fixture(scope="module", autouse=True)
def cleanup(request):
    """Cleanup test data after all tests"""
    def cleanup_data():
        import subprocess
        subprocess.run([
            'mongosh', '--quiet', '--eval', '''
use('test_database');
db.users.deleteMany({email: /test\\.teacher\\.|test\\.student\\./});
db.user_sessions.deleteMany({session_token: /test_teacher_session|test_student_session|test_admin_session/});
db.sessions.deleteMany({session_id: /test_session/});
db.messages.deleteMany({message_id: /msg_/});
db.vacation_days.deleteMany({vacation_id: /vac_/});
db.booking_restrictions.deleteMany({restriction_id: /restr_/});
db.notifications.deleteMany({notification_id: /notif_/});
db.memorization_progress.deleteMany({progress_id: /prog_/});
print('Test data cleaned up');
'''
        ], capture_output=True, text=True)
    
    request.addfinalizer(cleanup_data)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
