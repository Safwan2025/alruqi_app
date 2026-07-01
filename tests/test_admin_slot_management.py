"""
Admin Slot Management Tests - Iteration 4
Tests for: Admin (محمد الأنصاري) can add/delete slots for all teachers
Feature: Admin permissions for slot management
"""

import pytest
import requests
import os
from datetime import datetime, timedelta
import subprocess
import re

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://tajweed-platform-1.preview.emergentagent.com').rstrip('/')

# Admin email constant
ADMIN_EMAIL = "m0m0077100@gmail.com"


@pytest.fixture(scope="module")
def setup_test_users():
    """Create test users: admin, teacher1 (البراء), teacher2 (عمر), and student"""
    result = subprocess.run([
        'mongosh', '--quiet', '--eval', '''
use('test_database');

// Clean up old test data
db.users.deleteMany({email: /test\\.admin\\.|test\\.teacher1\\.|test\\.teacher2\\.|test\\.student_iter4\\./});
db.user_sessions.deleteMany({session_token: /test_admin_iter4|test_teacher1_iter4|test_teacher2_iter4|test_student_iter4/});
db.available_slots.deleteMany({slot_id: /test_slot_iter4/});

// Create admin user (محمد الأنصاري) with the special admin email
var adminId = 'test_admin_iter4_' + Date.now();
var adminSessionToken = 'test_admin_iter4_session_' + Date.now();
db.users.updateOne(
  {email: 'm0m0077100@gmail.com'},
  {$set: {
    user_id: adminId,
    name: 'محمد الأنصاري',
    role: 'teacher',
    picture: 'https://via.placeholder.com/150',
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

// Create teacher1 (البراء السيدا) - non-admin teacher
var teacher1Id = 'test_teacher1_iter4_' + Date.now();
var teacher1SessionToken = 'test_teacher1_iter4_session_' + Date.now();
db.users.insertOne({
  user_id: teacher1Id,
  email: 'test.teacher1.iter4.' + Date.now() + '@example.com',
  name: 'البراء السيدا',
  picture: 'https://via.placeholder.com/150',
  role: 'teacher',
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: teacher1Id,
  session_token: teacher1SessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});

// Create teacher2 (عمر النجار) - non-admin teacher
var teacher2Id = 'test_teacher2_iter4_' + Date.now();
var teacher2SessionToken = 'test_teacher2_iter4_session_' + Date.now();
db.users.insertOne({
  user_id: teacher2Id,
  email: 'test.teacher2.iter4.' + Date.now() + '@example.com',
  name: 'عمر النجار',
  picture: 'https://via.placeholder.com/150',
  role: 'teacher',
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: teacher2Id,
  session_token: teacher2SessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});

// Create student for testing
var studentId = 'test_student_iter4_' + Date.now();
var studentSessionToken = 'test_student_iter4_session_' + Date.now();
db.users.insertOne({
  user_id: studentId,
  email: 'test.student_iter4.' + Date.now() + '@example.com',
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

print('ADMIN_ID=' + adminId);
print('ADMIN_SESSION=' + adminSessionToken);
print('TEACHER1_ID=' + teacher1Id);
print('TEACHER1_SESSION=' + teacher1SessionToken);
print('TEACHER2_ID=' + teacher2Id);
print('TEACHER2_SESSION=' + teacher2SessionToken);
print('STUDENT_ID=' + studentId);
print('STUDENT_SESSION=' + studentSessionToken);
'''
    ], capture_output=True, text=True)
    
    output = result.stdout
    print(f"MongoDB setup output: {output}")
    
    # Parse output
    admin_id = re.search(r'ADMIN_ID=(\S+)', output).group(1)
    admin_session = re.search(r'ADMIN_SESSION=(\S+)', output).group(1)
    teacher1_id = re.search(r'TEACHER1_ID=(\S+)', output).group(1)
    teacher1_session = re.search(r'TEACHER1_SESSION=(\S+)', output).group(1)
    teacher2_id = re.search(r'TEACHER2_ID=(\S+)', output).group(1)
    teacher2_session = re.search(r'TEACHER2_SESSION=(\S+)', output).group(1)
    student_id = re.search(r'STUDENT_ID=(\S+)', output).group(1)
    student_session = re.search(r'STUDENT_SESSION=(\S+)', output).group(1)
    
    return {
        'admin_id': admin_id,
        'admin_session': admin_session,
        'teacher1_id': teacher1_id,
        'teacher1_session': teacher1_session,
        'teacher2_id': teacher2_id,
        'teacher2_session': teacher2_session,
        'student_id': student_id,
        'student_session': student_session
    }


@pytest.fixture
def admin_client(setup_test_users):
    """Session with admin auth (محمد الأنصاري)"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {setup_test_users['admin_session']}"
    })
    session.admin_id = setup_test_users['admin_id']
    return session


@pytest.fixture
def teacher1_client(setup_test_users):
    """Session with teacher1 auth (البراء السيدا) - non-admin"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {setup_test_users['teacher1_session']}"
    })
    session.teacher_id = setup_test_users['teacher1_id']
    return session


@pytest.fixture
def teacher2_client(setup_test_users):
    """Session with teacher2 auth (عمر النجار) - non-admin"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {setup_test_users['teacher2_session']}"
    })
    session.teacher_id = setup_test_users['teacher2_id']
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


# ===== VERIFY ADMIN SETUP =====
class TestAdminSetup:
    """Verify admin user is correctly set up"""
    
    def test_admin_user_has_correct_email(self, admin_client):
        """Verify admin user has the correct admin email"""
        response = admin_client.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data['email'] == ADMIN_EMAIL, f"Expected admin email {ADMIN_EMAIL}, got {data['email']}"
        assert data['role'] == 'teacher', f"Expected role 'teacher', got {data['role']}"
        print(f"✓ Admin user verified: {data['name']} ({data['email']})")
    
    def test_teacher1_is_not_admin(self, teacher1_client):
        """Verify teacher1 (البراء) is not admin"""
        response = teacher1_client.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data['email'] != ADMIN_EMAIL, "Teacher1 should not have admin email"
        print(f"✓ Teacher1 verified: {data['name']} (non-admin)")
    
    def test_teacher2_is_not_admin(self, teacher2_client):
        """Verify teacher2 (عمر) is not admin"""
        response = teacher2_client.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data['email'] != ADMIN_EMAIL, "Teacher2 should not have admin email"
        print(f"✓ Teacher2 verified: {data['name']} (non-admin)")


# ===== ADMIN CAN ADD SLOTS FOR OTHER TEACHERS =====
class TestAdminAddSlotsForOthers:
    """Test admin can add slots for other teachers"""
    
    def test_admin_add_slot_for_teacher1(self, admin_client, setup_test_users):
        """Test POST /api/teacher/slots with teacher_id - admin adds slot for البراء"""
        future_time = (datetime.now() + timedelta(days=7)).replace(hour=10, minute=0, second=0, microsecond=0)
        payload = {
            "scheduled_time": future_time.isoformat() + "Z",
            "duration": 60,
            "teacher_id": setup_test_users['teacher1_id']  # Admin specifies teacher1
        }
        response = admin_client.post(f"{BASE_URL}/api/teacher/slots", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "slot_id" in data
        assert data["message"] == "Slot added"
        
        # Verify slot data
        slot = data.get("slot", {})
        assert slot.get("teacher_id") == setup_test_users['teacher1_id'], "Slot should be for teacher1"
        assert slot.get("teacher_name") == "البراء السيدا", f"Expected teacher name 'البراء السيدا', got {slot.get('teacher_name')}"
        assert slot.get("created_by") == setup_test_users['admin_id'], "Slot should be created by admin"
        
        print(f"✓ Admin added slot for البراء: {data['slot_id']}")
        return data["slot_id"]
    
    def test_admin_add_slot_for_teacher2(self, admin_client, setup_test_users):
        """Test POST /api/teacher/slots with teacher_id - admin adds slot for عمر"""
        future_time = (datetime.now() + timedelta(days=8)).replace(hour=14, minute=0, second=0, microsecond=0)
        payload = {
            "scheduled_time": future_time.isoformat() + "Z",
            "duration": 60,
            "teacher_id": setup_test_users['teacher2_id']  # Admin specifies teacher2
        }
        response = admin_client.post(f"{BASE_URL}/api/teacher/slots", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "slot_id" in data
        
        # Verify slot data
        slot = data.get("slot", {})
        assert slot.get("teacher_id") == setup_test_users['teacher2_id'], "Slot should be for teacher2"
        assert slot.get("teacher_name") == "عمر النجار", f"Expected teacher name 'عمر النجار', got {slot.get('teacher_name')}"
        
        print(f"✓ Admin added slot for عمر: {data['slot_id']}")
        return data["slot_id"]
    
    def test_admin_add_slot_for_self(self, admin_client, setup_test_users):
        """Test admin can still add slots for themselves"""
        future_time = (datetime.now() + timedelta(days=9)).replace(hour=16, minute=0, second=0, microsecond=0)
        payload = {
            "scheduled_time": future_time.isoformat() + "Z",
            "duration": 60
            # No teacher_id - should default to admin's own ID
        }
        response = admin_client.post(f"{BASE_URL}/api/teacher/slots", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify slot is for admin
        slot = data.get("slot", {})
        assert slot.get("teacher_id") == setup_test_users['admin_id'], "Slot should be for admin"
        
        print(f"✓ Admin added slot for self: {data['slot_id']}")
    
    def test_verify_slot_appears_in_teacher1_slots(self, admin_client, setup_test_users):
        """Verify slot added by admin appears in teacher1's available slots"""
        # First add a slot for teacher1
        future_time = (datetime.now() + timedelta(days=10)).replace(hour=11, minute=0, second=0, microsecond=0)
        payload = {
            "scheduled_time": future_time.isoformat() + "Z",
            "duration": 60,
            "teacher_id": setup_test_users['teacher1_id']
        }
        add_response = admin_client.post(f"{BASE_URL}/api/teacher/slots", json=payload)
        assert add_response.status_code == 200
        slot_id = add_response.json()["slot_id"]
        
        # Now get teacher1's available slots
        get_response = admin_client.get(f"{BASE_URL}/api/teachers/{setup_test_users['teacher1_id']}/available-slots")
        assert get_response.status_code == 200
        slots = get_response.json()
        
        # Find the slot we just added
        found_slot = next((s for s in slots if s.get("slot_id") == slot_id), None)
        assert found_slot is not None, f"Slot {slot_id} should appear in teacher1's available slots"
        
        print(f"✓ Slot {slot_id} correctly appears in teacher1's available slots")


# ===== NON-ADMIN TEACHER CANNOT ADD SLOTS FOR OTHERS =====
class TestNonAdminCannotAddSlotsForOthers:
    """Test non-admin teachers cannot add slots for other teachers"""
    
    def test_teacher1_cannot_add_slot_for_teacher2(self, teacher1_client, setup_test_users):
        """Test non-admin teacher1 (البراء) cannot add slot for teacher2 (عمر)"""
        future_time = (datetime.now() + timedelta(days=11)).replace(hour=10, minute=0, second=0, microsecond=0)
        payload = {
            "scheduled_time": future_time.isoformat() + "Z",
            "duration": 60,
            "teacher_id": setup_test_users['teacher2_id']  # Trying to add for another teacher
        }
        response = teacher1_client.post(f"{BASE_URL}/api/teacher/slots", json=payload)
        
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        data = response.json()
        assert "المشرف" in data.get("detail", ""), "Error should mention admin permission"
        
        print("✓ Non-admin teacher correctly blocked from adding slots for others (403)")
    
    def test_teacher2_cannot_add_slot_for_teacher1(self, teacher2_client, setup_test_users):
        """Test non-admin teacher2 (عمر) cannot add slot for teacher1 (البراء)"""
        future_time = (datetime.now() + timedelta(days=12)).replace(hour=14, minute=0, second=0, microsecond=0)
        payload = {
            "scheduled_time": future_time.isoformat() + "Z",
            "duration": 60,
            "teacher_id": setup_test_users['teacher1_id']  # Trying to add for another teacher
        }
        response = teacher2_client.post(f"{BASE_URL}/api/teacher/slots", json=payload)
        
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        
        print("✓ Non-admin teacher2 correctly blocked from adding slots for others (403)")
    
    def test_teacher1_can_add_slot_for_self(self, teacher1_client, setup_test_users):
        """Test non-admin teacher can still add slots for themselves"""
        future_time = (datetime.now() + timedelta(days=13)).replace(hour=9, minute=0, second=0, microsecond=0)
        payload = {
            "scheduled_time": future_time.isoformat() + "Z",
            "duration": 60
            # No teacher_id - should default to own ID
        }
        response = teacher1_client.post(f"{BASE_URL}/api/teacher/slots", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify slot is for teacher1
        slot = data.get("slot", {})
        assert slot.get("teacher_id") == setup_test_users['teacher1_id'], "Slot should be for teacher1"
        
        print(f"✓ Non-admin teacher can add slot for self: {data['slot_id']}")


# ===== ADMIN CAN DELETE ANY TEACHER'S SLOTS =====
class TestAdminDeleteAnySlot:
    """Test admin can delete any teacher's slots"""
    
    def test_admin_delete_teacher1_slot(self, admin_client, teacher1_client, setup_test_users):
        """Test admin can delete teacher1's slot"""
        # First, teacher1 adds a slot for themselves
        future_time = (datetime.now() + timedelta(days=14)).replace(hour=10, minute=0, second=0, microsecond=0)
        payload = {
            "scheduled_time": future_time.isoformat() + "Z",
            "duration": 60
        }
        add_response = teacher1_client.post(f"{BASE_URL}/api/teacher/slots", json=payload)
        assert add_response.status_code == 200
        slot_id = add_response.json()["slot_id"]
        
        # Admin deletes teacher1's slot
        delete_response = admin_client.delete(f"{BASE_URL}/api/teacher/slots/{slot_id}")
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}: {delete_response.text}"
        assert delete_response.json()["message"] == "Slot deleted"
        
        print(f"✓ Admin deleted teacher1's slot: {slot_id}")
    
    def test_admin_delete_teacher2_slot(self, admin_client, teacher2_client, setup_test_users):
        """Test admin can delete teacher2's slot"""
        # First, teacher2 adds a slot for themselves
        future_time = (datetime.now() + timedelta(days=15)).replace(hour=14, minute=0, second=0, microsecond=0)
        payload = {
            "scheduled_time": future_time.isoformat() + "Z",
            "duration": 60
        }
        add_response = teacher2_client.post(f"{BASE_URL}/api/teacher/slots", json=payload)
        assert add_response.status_code == 200
        slot_id = add_response.json()["slot_id"]
        
        # Admin deletes teacher2's slot
        delete_response = admin_client.delete(f"{BASE_URL}/api/teacher/slots/{slot_id}")
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}: {delete_response.text}"
        
        print(f"✓ Admin deleted teacher2's slot: {slot_id}")


# ===== NON-ADMIN TEACHER CANNOT DELETE OTHER'S SLOTS =====
class TestNonAdminCannotDeleteOthersSlots:
    """Test non-admin teachers cannot delete other teachers' slots"""
    
    def test_teacher1_cannot_delete_teacher2_slot(self, teacher1_client, teacher2_client, setup_test_users):
        """Test teacher1 cannot delete teacher2's slot"""
        # Teacher2 adds a slot
        future_time = (datetime.now() + timedelta(days=16)).replace(hour=10, minute=0, second=0, microsecond=0)
        payload = {
            "scheduled_time": future_time.isoformat() + "Z",
            "duration": 60
        }
        add_response = teacher2_client.post(f"{BASE_URL}/api/teacher/slots", json=payload)
        assert add_response.status_code == 200
        slot_id = add_response.json()["slot_id"]
        
        # Teacher1 tries to delete teacher2's slot
        delete_response = teacher1_client.delete(f"{BASE_URL}/api/teacher/slots/{slot_id}")
        assert delete_response.status_code == 403, f"Expected 403, got {delete_response.status_code}: {delete_response.text}"
        
        print("✓ Non-admin teacher correctly blocked from deleting other's slot (403)")
    
    def test_teacher_can_delete_own_slot(self, teacher1_client, setup_test_users):
        """Test teacher can delete their own slot"""
        # Teacher1 adds a slot
        future_time = (datetime.now() + timedelta(days=17)).replace(hour=11, minute=0, second=0, microsecond=0)
        payload = {
            "scheduled_time": future_time.isoformat() + "Z",
            "duration": 60
        }
        add_response = teacher1_client.post(f"{BASE_URL}/api/teacher/slots", json=payload)
        assert add_response.status_code == 200
        slot_id = add_response.json()["slot_id"]
        
        # Teacher1 deletes their own slot
        delete_response = teacher1_client.delete(f"{BASE_URL}/api/teacher/slots/{slot_id}")
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}: {delete_response.text}"
        
        print(f"✓ Teacher can delete own slot: {slot_id}")


# ===== STUDENT CANNOT ADD/DELETE SLOTS =====
class TestStudentCannotManageSlots:
    """Test students cannot manage slots"""
    
    def test_student_cannot_add_slot(self, student_client, setup_test_users):
        """Test student cannot add slots"""
        future_time = (datetime.now() + timedelta(days=18)).replace(hour=10, minute=0, second=0, microsecond=0)
        payload = {
            "scheduled_time": future_time.isoformat() + "Z",
            "duration": 60
        }
        response = student_client.post(f"{BASE_URL}/api/teacher/slots", json=payload)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        
        print("✓ Student correctly blocked from adding slots (403)")
    
    def test_student_cannot_delete_slot(self, student_client, teacher1_client, setup_test_users):
        """Test student cannot delete slots"""
        # Teacher1 adds a slot
        future_time = (datetime.now() + timedelta(days=19)).replace(hour=14, minute=0, second=0, microsecond=0)
        payload = {
            "scheduled_time": future_time.isoformat() + "Z",
            "duration": 60
        }
        add_response = teacher1_client.post(f"{BASE_URL}/api/teacher/slots", json=payload)
        assert add_response.status_code == 200
        slot_id = add_response.json()["slot_id"]
        
        # Student tries to delete
        delete_response = student_client.delete(f"{BASE_URL}/api/teacher/slots/{slot_id}")
        assert delete_response.status_code == 403, f"Expected 403, got {delete_response.status_code}"
        
        print("✓ Student correctly blocked from deleting slots (403)")


# ===== EDGE CASES =====
class TestEdgeCases:
    """Test edge cases for admin slot management"""
    
    def test_admin_add_slot_for_nonexistent_teacher(self, admin_client):
        """Test admin cannot add slot for non-existent teacher"""
        future_time = (datetime.now() + timedelta(days=20)).replace(hour=10, minute=0, second=0, microsecond=0)
        payload = {
            "scheduled_time": future_time.isoformat() + "Z",
            "duration": 60,
            "teacher_id": "nonexistent_teacher_id_12345"
        }
        response = admin_client.post(f"{BASE_URL}/api/teacher/slots", json=payload)
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        
        print("✓ Admin correctly gets 404 for non-existent teacher")
    
    def test_slot_response_excludes_mongodb_id(self, admin_client, setup_test_users):
        """Test that slot response does not include MongoDB _id"""
        future_time = (datetime.now() + timedelta(days=21)).replace(hour=15, minute=0, second=0, microsecond=0)
        payload = {
            "scheduled_time": future_time.isoformat() + "Z",
            "duration": 60,
            "teacher_id": setup_test_users['teacher1_id']
        }
        response = admin_client.post(f"{BASE_URL}/api/teacher/slots", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        slot = data.get("slot", {})
        
        assert "_id" not in slot, "Response should not contain MongoDB _id"
        
        print("✓ Slot response correctly excludes MongoDB _id")


# ===== CLEANUP =====
@pytest.fixture(scope="module", autouse=True)
def cleanup(request):
    """Cleanup test data after all tests"""
    def cleanup_data():
        subprocess.run([
            'mongosh', '--quiet', '--eval', '''
use('test_database');
db.users.deleteMany({email: /test\\.admin\\.|test\\.teacher1\\.|test\\.teacher2\\.|test\\.student_iter4\\./});
db.user_sessions.deleteMany({session_token: /test_admin_iter4|test_teacher1_iter4|test_teacher2_iter4|test_student_iter4/});
db.available_slots.deleteMany({slot_id: /test_slot_iter4/});
// Also clean up slots created during tests (by created_by field)
db.available_slots.deleteMany({created_by: /test_admin_iter4|test_teacher1_iter4|test_teacher2_iter4/});
print('Test data cleaned up for iteration 4');
'''
        ], capture_output=True, text=True)
    
    request.addfinalizer(cleanup_data)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
