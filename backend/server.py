"""
=========================================================================
 Maqra'at Al-Ruqya · FastAPI Backend
=========================================================================

Single-module FastAPI application for the Maqra'at Al-Ruqya Quran-teaching
platform. Each logical section is preceded by a `# ===== SECTION =====`
banner — search for the banner to jump.

Section index (line numbers drift; search for the banner):

  1.  MODELS .................................. Pydantic schemas (user, session, ...)
  2.  CONTENT MANAGEMENT MODELS ............... News, broadcasts
  3.  NEW MODELS FOR ENHANCED FEATURES ........ Peer review, commitments
  4.  STUDENT NOTES ARCHIVE MODEL
  5.  DATE OF BIRTH & FORGOT PASSWORD MODELS
  6.  STUDENT POINTS MODELS
  7.  AUTH HELPER ............................. get_current_user (cookie / Bearer)
  8.  EMAIL SERVICE (currently inert)
  9.  PUBLIC STATS ENDPOINT
  10. STUDENT OF THE WEEK
  11. AUTH ENDPOINTS .......................... signup / login / set-password / etc.
  12. DATE OF BIRTH & FORGOT PASSWORD
  13. STUDENT POINTS MANAGEMENT
  14. USER/PROFILE ENDPOINTS .................. CRUD profile, role mgmt
  15. ADMIN PERMANENT ACCOUNT DELETION
  16. ADMIN BULK MESSAGING
  17. TEACHER LINK MANAGEMENT
  18. SESSIONS / BOOKINGS
  19. MEMORIZATION PROGRESS
  20. WEEKLY COMMITMENTS ...................... set + evaluate (skips holidays)
  21. WEEKLY PLANS ............................ save / fetch / SUGGEST (smart)
  22. PEER REVIEW (المراجعة الزوجية) .......... partnership, slots, sessions, evals
  23. MESSAGING
  24. COMPETITIONS
  25. CONTENT / NEWS
  26. ADMIN — FREEZE / WARNINGS / HOLIDAYS .... delete-warning, commitment-holidays

For a full architectural reference (workflows, conventions, env vars,
key complex helpers, the 604-page Madinah Mushaf mapping, etc.) see
`/app/ARCHITECTURE.md` and the top-level `/app/README.md`.

Conventions:
  * All routes are prefixed with /api via `api_router`.
  * All MongoDB queries project away `_id` (BSON ObjectId is not
    JSON-serializable; reusing inserted dicts in responses requires care).
  * Always use `datetime.now(timezone.utc)` — never `datetime.utcnow()`.
  * Arabic surah names in DB are normalized via `_normalize` inside
    `_get_memorization_position` (handles trailing spaces, tatweel \u0640,
    multi-surah strings like "الإسراء و الكهف").
  * Madinah Mushaf 604-page mapping lives in `quran_data.py`.

Author: Maqra'at Al-Ruqya team via Emergent platform.
=========================================================================
"""
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import re
import difflib
from pathlib import Path
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import httpx
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
import socketio
import bcrypt
import jwt
from passlib.context import CryptContext
from quran_data import QURAN_SURAHS, SURAH_MAP, SURAH_BY_NUMBER, get_ayah_page, get_juz_page_range, get_juz_display_name

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# JWT Secret Key - must be set in environment
JWT_SECRET = os.environ.get('JWT_SECRET')
if not JWT_SECRET:
    raise ValueError("JWT_SECRET environment variable is required")
JWT_ALGORITHM = "HS256"

# Admin emails with special permissions
ADMIN_EMAIL = "m0m0077100@gmail.com"
TEACHER_CREATOR_EMAIL = "m0m0077100@gmail.com"  # Only this email can create teacher accounts

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Create Socket.IO server
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    logger=True,
    engineio_logger=True
)

# Wrap with ASGI app
socket_app = socketio.ASGIApp(
    sio,
    other_asgi_app=app,
    socketio_path='/socket.io'
)

# ===== MODELS =====
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: str = "student"  # student or teacher
    bio: Optional[str] = None
    specialization: Optional[str] = None
    rating: Optional[float] = None
    created_at: datetime
    password_hash: Optional[str] = None  # For email/password auth
    auth_provider: str = "email"  # email or google

# Auth Models
class SignUpRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    name: str = Field(..., min_length=2)
    remember_me: bool = False

class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    remember_me: bool = False

class AuthResponse(BaseModel):
    user: dict
    token: str
    expires_in: int

class UserSession(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime

class Teacher(BaseModel):
    model_config = ConfigDict(extra="ignore")
    teacher_id: str
    user_id: str
    name: str
    email: str
    picture: Optional[str] = None
    bio: Optional[str] = None
    specialization: Optional[str] = None
    rating: Optional[float] = 4.5
    total_sessions: int = 0
    available: bool = True

class Session(BaseModel):
    model_config = ConfigDict(extra="ignore")
    session_id: str
    student_id: str
    teacher_id: str
    teacher_name: str
    student_name: str
    scheduled_time: datetime
    duration: int = 60  # minutes
    status: str = "scheduled"  # scheduled, completed, cancelled
    meeting_room_id: Optional[str] = None
    recitation_link: Optional[str] = None
    join_clicked_at: Optional[datetime] = None
    attendance_confirmed: Optional[bool] = None
    attendance_confirmed_at: Optional[datetime] = None
    rating: Optional[str] = None  # ضعيف، مقبول، متوسط، ممتاز
    teacher_notes: Optional[str] = None
    # Cancellation metadata — exposed so the UI can display the reason and
    # (for auto-cancelled sessions) render the "تحويل إلى مكتملة" restore button.
    cancellation_reason: Optional[str] = None
    cancelled_by: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    auto_cancelled_at: Optional[datetime] = None
    created_at: datetime

class SessionRating(BaseModel):
    rating: str  # ضعيف، مقبول، متوسط، ممتاز
    notes: Optional[str] = None

class AttendanceConfirmation(BaseModel):
    attended: bool

class TeacherMessage(BaseModel):
    student_id: str
    message: str

class StudentMessage(BaseModel):
    teacher_id: str
    message: str

class AdminBulkMessage(BaseModel):
    """Admin message to multiple students"""
    student_ids: List[str]  # List of student IDs, or empty for all students
    message: str
    send_to_all: bool = False  # If True, send to all students

class TeacherLinkUpdate(BaseModel):
    """Update teacher's recitation/session link"""
    teacher_id: str
    recitation_link: str

class PictureUpload(BaseModel):
    picture_url: str

class MessageDelete(BaseModel):
    message_id: str

# Weekly rotation settings
class WeeklyRotationSettings(BaseModel):
    enabled: bool
    start_date: str  # YYYY-MM-DD
    first_week_teacher: str  # teacher_id

class SessionCreate(BaseModel):
    teacher_id: str
    scheduled_time: datetime
    duration: int = 60

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    specialization: Optional[str] = None

class SlotCreate(BaseModel):
    scheduled_time: datetime
    duration: int = 60
    teacher_id: Optional[str] = None  # Optional: Admin can specify teacher_id

# Student of the Week Model
class StudentOfWeekCreate(BaseModel):
    student_name: str
    student_picture: str  # base64 or URL
    order: int = 1  # 1 or 2 (two students per week)

# ===== CONTENT MANAGEMENT MODELS =====
class ContentCreate(BaseModel):
    title: str
    content: str  # النص
    image_url: Optional[str] = None  # رابط الصورة (base64 أو URL)
    order: int = 0  # ترتيب العرض
    is_featured: bool = False  # محتوى مميز

class ContentUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    image_url: Optional[str] = None
    order: Optional[int] = None
    is_featured: Optional[bool] = None
    active: Optional[bool] = None

# ===== NEW MODELS FOR ENHANCED FEATURES =====

class CancellationRequest(BaseModel):
    reason: str  # سبب الإلغاء (إلزامي)

class VacationDay(BaseModel):
    date: str  # YYYY-MM-DD format
    reason: Optional[str] = None

class StudentRestriction(BaseModel):
    student_id: str
    reason: str

class MemorizationProgress(BaseModel):
    surah_name: str
    from_ayah: int
    to_ayah: int
    quality: str  # ضعيف، مقبول، متوسط، ممتاز
    notes: Optional[str] = None

class SessionNotes(BaseModel):
    mistakes: Optional[str] = None
    corrections: Optional[str] = None
    recommendations: Optional[str] = None
    memorization_progress: Optional[MemorizationProgress] = None
    memorization_entries: Optional[List[MemorizationProgress]] = None

class GlobalAnnouncement(BaseModel):
    title: str
    content: str
    priority: str = "normal"  # normal, important, urgent

# ===== STUDENT NOTES ARCHIVE MODEL =====
class StudentNoteCreate(BaseModel):
    session_id: Optional[str] = None  # رابط الجلسة (اختياري)
    note_type: str = "general"  # general, recitation, behavior, progress, evaluation
    title: str
    content: str
    surah_name: Optional[str] = None
    ayah_from: Optional[int] = None
    ayah_to: Optional[int] = None
    rating: Optional[str] = None  # ضعيف، مقبول، متوسط، ممتاز

# ===== DATE OF BIRTH & FORGOT PASSWORD MODELS =====
class UpdateDOBRequest(BaseModel):
    date_of_birth: str  # Format: YYYY-MM-DD

class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    date_of_birth: str  # Format: YYYY-MM-DD

class ResetPasswordWithDOBRequest(BaseModel):
    email: EmailStr
    date_of_birth: str
    new_password: str = Field(..., min_length=6)

class SetPasswordRequest(BaseModel):
    """For Google users setting their first password"""
    password: str = Field(..., min_length=6)

class ChangePasswordRequest(BaseModel):
    """For logged-in users changing their password"""
    current_password: Optional[str] = None  # Optional for Google users who never had a password
    new_password: str = Field(..., min_length=6)

# ===== STUDENT POINTS MODELS =====
class StudentPointsUpdate(BaseModel):
    student_id: str
    booking_points: Optional[int] = None
    attendance_points: Optional[int] = None
    recitation_points: Optional[int] = None

class PointsAdjustment(BaseModel):
    student_id: str
    point_type: str  # booking, attendance, recitation
    amount: int  # positive to add, negative to remove
    reason: Optional[str] = None

# ===== AUTH HELPER =====
async def get_current_user(request: Request) -> User:
    """Get current user from session token (cookie, header, or X-Session-Token)"""
    session_token = request.cookies.get("session_token")
    
    # Check X-Session-Token header (from frontend)
    if not session_token:
        session_token = request.headers.get("X-Session-Token")
    
    # Check Authorization header
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session_doc = await db.user_sessions.find_one(
        {"session_token": session_token},
        {"_id": 0}
    )
    
    if not session_doc:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    expires_at = session_doc["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if expires_at < datetime.now(timezone.utc):
        await db.user_sessions.delete_one({"session_token": session_token})
        raise HTTPException(status_code=401, detail="Session expired")
    
    user_doc = await db.users.find_one(
        {"user_id": session_doc["user_id"]},
        {"_id": 0}
    )
    
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    if isinstance(user_doc.get("created_at"), str):
        user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])
    
    return User(**user_doc)

# ===== EMAIL SERVICE =====
def send_email(to: str, subject: str, html_content: str):
    """Send email via SendGrid"""
    sender_email = os.getenv('SENDER_EMAIL')
    sendgrid_key = os.getenv('SENDGRID_API_KEY')
    
    if not sender_email or not sendgrid_key:
        logging.warning("SendGrid not configured, skipping email")
        return False
    
    try:
        message = Mail(
            from_email=sender_email,
            to_emails=to,
            subject=subject,
            html_content=html_content
        )
        sg = SendGridAPIClient(sendgrid_key)
        response = sg.send(message)
        return response.status_code == 202
    except Exception as e:
        logging.error(f"Failed to send email: {e}")
        return False

def send_booking_confirmation(student_email: str, teacher_name: str, scheduled_time: datetime):
    """Send booking confirmation email"""
    subject = "تأكيد حجز حصة - مقرأة الرقي"
    html_content = f"""
    <html dir="rtl">
        <body style="font-family: Arial, sans-serif; padding: 20px; text-align: right;">
            <h2 style="color: #0F5132;">تأكيد حجز حصتك</h2>
            <p>السلام عليكم ورحمة الله وبركاته،</p>
            <p>تم تأكيد حجز حصتك بنجاح!</p>
            <div style="background: #F7F4EC; padding: 20px; border-right: 4px solid #D4AF37; margin: 20px 0;">
                <p><strong>المعلم:</strong> {teacher_name}</p>
                <p><strong>الموعد:</strong> {scheduled_time.strftime('%Y-%m-%d %H:%M')}</p>
            </div>
            <p>نتمنى لك تجربة تعليمية مميزة!</p>
            <p style="color: #0F5132; font-weight: bold;">فريق مقرأة الرقي</p>
        </body>
    </html>
    """
    send_email(student_email, subject, html_content)

# ===== PUBLIC STATS ENDPOINT =====
@api_router.get("/public/stats")
async def get_public_stats():
    """Get public statistics for landing page - no auth required"""
    # Count total sessions (including cancelled)
    total_sessions = await db.sessions.count_documents({})
    
    # Count total teachers
    total_teachers = await db.users.count_documents({"role": "teacher"})
    
    # Count total students
    total_students = await db.users.count_documents({"role": "student"})
    
    return {
        "total_bookings": total_sessions,
        "total_teachers": total_teachers,
        "total_students": total_students
    }

# ===== STUDENT OF THE WEEK (PUBLIC) =====
@api_router.get("/public/students-of-week")
async def get_students_of_week():
    """Get current students of the week - no auth required"""
    students = await db.students_of_week.find(
        {"active": True},
        {"_id": 0}
    ).sort("order", 1).to_list(length=2)
    
    return students

# ===== STUDENT OF THE WEEK (ADMIN) =====
@api_router.get("/admin/students-of-week")
async def get_admin_students_of_week(current_user: User = Depends(get_current_user)):
    """Get students of the week - Admin only"""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Admin only")
    
    students = await db.students_of_week.find(
        {"active": True},
        {"_id": 0}
    ).sort("order", 1).to_list(length=2)
    
    return students

@api_router.post("/admin/students-of-week")
async def set_student_of_week(
    student: StudentOfWeekCreate,
    current_user: User = Depends(get_current_user)
):
    """Set a student of the week - Admin only"""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Admin only")
    
    if student.order not in [1, 2]:
        raise HTTPException(status_code=400, detail="Order must be 1 or 2")
    
    # Deactivate previous student with same order
    await db.students_of_week.update_many(
        {"order": student.order, "active": True},
        {"$set": {"active": False}}
    )
    
    # Create new student of week entry
    student_id = f"sotw_{uuid.uuid4().hex[:12]}"
    student_data = {
        "student_id": student_id,
        "student_name": student.student_name,
        "student_picture": student.student_picture,
        "order": student.order,
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.user_id
    }
    
    await db.students_of_week.insert_one(student_data)
    
    # Remove _id before returning
    student_data.pop("_id", None)
    
    return {"message": "تم إضافة طالب الأسبوع بنجاح", "student": student_data}

@api_router.delete("/admin/students-of-week/{student_id}")
async def remove_student_of_week(
    student_id: str,
    current_user: User = Depends(get_current_user)
):
    """Remove a student of the week - Admin only"""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Admin only")
    
    result = await db.students_of_week.update_one(
        {"student_id": student_id},
        {"$set": {"active": False}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Student not found")
    
    return {"message": "تم إزالة طالب الأسبوع"}

# ===== AUTH ENDPOINTS =====

# Helper functions for password hashing
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))

def create_jwt_token(user_id: str, email: str, remember_me: bool = False) -> tuple:
    """Create JWT token with expiration based on remember_me"""
    if remember_me:
        expires_delta = timedelta(days=30)
    else:
        expires_delta = timedelta(days=1)
    
    expires_at = datetime.now(timezone.utc) + expires_delta
    
    payload = {
        "user_id": user_id,
        "email": email,
        "exp": expires_at,
        "iat": datetime.now(timezone.utc)
    }
    
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return token, int(expires_delta.total_seconds())

def decode_jwt_token(token: str) -> dict:
    """Decode and verify JWT token"""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

@api_router.post("/auth/signup")
async def signup(request: SignUpRequest, response: Response):
    """Create a new account with email and password"""
    # Check if email already exists
    existing_user = await db.users.find_one({"email": request.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مستخدم بالفعل")
    
    # Validate password strength
    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="كلمة المرور يجب أن تكون 6 أحرف على الأقل")
    
    # Create new user
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    password_hash = hash_password(request.password)
    
    user_data = {
        "user_id": user_id,
        "email": request.email,
        "name": request.name,
        "picture": None,
        "role": "student",
        "password_hash": password_hash,
        "auth_provider": "email",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(user_data)
    
    # Create JWT token
    token, expires_in = create_jwt_token(user_id, request.email, remember_me=request.remember_me)
    
    # Create session in DB
    session_token = f"session_{uuid.uuid4().hex}"
    expires_days = 30 if request.remember_me else 1
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "jwt_token": token,
        "remember_me": request.remember_me,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=expires_days)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    # Set httpOnly cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        samesite="lax",
        max_age=expires_in
    )
    
    # Remove sensitive data
    user_data.pop("password_hash", None)
    user_data.pop("_id", None)
    
    return {
        "message": "تم إنشاء الحساب بنجاح",
        "user": user_data,
        "token": session_token,
        "expires_in": expires_in
    }

@api_router.post("/auth/login")
async def login(request: LoginRequest, response: Response):
    """Login with email and password"""
    # Find user
    user_doc = await db.users.find_one({"email": request.email}, {"_id": 0})
    
    if not user_doc:
        raise HTTPException(status_code=401, detail="البريد الإلكتروني أو كلمة المرور غير صحيحة")
    
    # Check if user has password (email auth)
    if not user_doc.get("password_hash"):
        raise HTTPException(status_code=401, detail="هذا الحساب مسجل عبر Google، يرجى استخدام تسجيل الدخول عبر Google")
    
    # Verify password
    if not verify_password(request.password, user_doc["password_hash"]):
        raise HTTPException(status_code=401, detail="البريد الإلكتروني أو كلمة المرور غير صحيحة")
    
    # Create JWT token
    token, expires_in = create_jwt_token(user_doc["user_id"], request.email, request.remember_me)
    
    # Create session in DB
    session_token = f"session_{uuid.uuid4().hex}"
    expires_days = 30 if request.remember_me else 1
    
    await db.user_sessions.insert_one({
        "user_id": user_doc["user_id"],
        "session_token": session_token,
        "jwt_token": token,
        "remember_me": request.remember_me,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=expires_days)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    # Set httpOnly cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        samesite="lax",
        max_age=expires_in
    )
    
    # Remove sensitive data
    user_doc.pop("password_hash", None)
    
    return {
        "message": "تم تسجيل الدخول بنجاح",
        "user": user_doc,
        "token": session_token,
        "expires_in": expires_in
    }

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout and clear session"""
    session_token = request.cookies.get("session_token")
    
    if session_token:
        # Delete session from DB
        await db.user_sessions.delete_one({"session_token": session_token})
    
    # Clear cookie
    response.delete_cookie(key="session_token")
    
    return {"message": "تم تسجيل الخروج بنجاح"}

@api_router.post("/auth/session")
async def exchange_session(request: Request, response: Response):
    """Exchange Emergent Auth session_id for session_token - Google OAuth flow"""
    body = await request.json()
    session_id = body.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    
    # Call Emergent Auth API
    async with httpx.AsyncClient() as http_client:
        auth_response = await http_client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
    
    if auth_response.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")
    
    data = auth_response.json()
    google_email = data["email"]
    
    # Check if user exists (account linking: find by email)
    user_doc = await db.users.find_one({"email": google_email}, {"_id": 0})
    
    is_new_user = False
    needs_password_setup = False
    
    if not user_doc:
        # Create new user with Google auth
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_data = {
            "user_id": user_id,
            "email": google_email,
            "name": data["name"],
            "picture": data.get("picture"),
            "role": "student",
            "auth_provider": "google",  # Mark as Google user
            "password_hash": None,  # No password yet
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(user_data)
        user_doc = user_data
        is_new_user = True
        needs_password_setup = True  # New Google user must set password
    else:
        user_id = user_doc["user_id"]
        
        # Update picture if changed and was Google user
        if data.get("picture") and user_doc.get("auth_provider") == "google":
            await db.users.update_one(
                {"user_id": user_id},
                {"$set": {"picture": data.get("picture")}}
            )
            user_doc["picture"] = data.get("picture")
        
        # Check if user needs to set password
        # Users who signed up with email already have a password
        # Google users without password_hash need to set one
        if not user_doc.get("password_hash"):
            needs_password_setup = True
    
    # Create session
    session_token = f"session_{uuid.uuid4().hex}"
    
    # Check if remember_me was sent in the request body
    remember_me = body.get("remember_me", True)  # Default true for Google login
    expires_days = 30 if remember_me else 7
    expires_at = datetime.now(timezone.utc) + timedelta(days=expires_days)
    
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "remember_me": remember_me,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    # Set httpOnly cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=expires_days * 24 * 60 * 60
    )
    
    if isinstance(user_doc.get("created_at"), str):
        user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])
    
    # Remove sensitive data
    user_doc.pop("password_hash", None)
    user_doc.pop("_id", None)
    
    # Return user data with session_token for localStorage storage
    # Include flag to indicate if password setup is required
    return {
        **user_doc,
        "session_token": session_token,
        "is_new_user": is_new_user,
        "needs_password_setup": needs_password_setup
    }

@api_router.get("/auth/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user info"""
    # Fetch full user data from DB to get latest fields
    user_doc = await db.users.find_one(
        {"user_id": current_user.user_id},
        {"_id": 0}
    )
    
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if user needs password setup
    needs_password_setup = not user_doc.get("password_hash")
    
    # Remove sensitive fields
    user_doc.pop("password_hash", None)
    
    # Convert datetime to ISO string for JSON serialization
    if isinstance(user_doc.get("created_at"), datetime):
        user_doc["created_at"] = user_doc["created_at"].isoformat()
    
    return {
        **user_doc,
        "needs_password_setup": needs_password_setup
    }

@api_router.post("/auth/set-password")
async def set_password(
    request: SetPasswordRequest,
    current_user: User = Depends(get_current_user)
):
    """Set password for users who don't have one (e.g., Google OAuth users)"""
    # Check if user already has a password
    user_doc = await db.users.find_one(
        {"user_id": current_user.user_id},
        {"_id": 0, "password_hash": 1}
    )
    
    if user_doc and user_doc.get("password_hash"):
        raise HTTPException(
            status_code=400, 
            detail="لديك كلمة مرور بالفعل. استخدم 'تغيير كلمة المرور' بدلاً من ذلك."
        )
    
    # Hash and save the new password
    password_hash = hash_password(request.password)
    
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"password_hash": password_hash}}
    )
    
    return {"message": "تم تعيين كلمة المرور بنجاح"}

@api_router.post("/auth/change-password")
async def change_password(
    request: ChangePasswordRequest,
    current_user: User = Depends(get_current_user)
):
    """Change password for logged-in users"""
    # Get user with password hash
    user_doc = await db.users.find_one(
        {"user_id": current_user.user_id},
        {"_id": 0, "password_hash": 1}
    )
    
    # If user has an existing password, verify it
    if user_doc and user_doc.get("password_hash"):
        if not request.current_password:
            raise HTTPException(
                status_code=400, 
                detail="يجب إدخال كلمة المرور الحالية"
            )
        
        if not verify_password(request.current_password, user_doc["password_hash"]):
            raise HTTPException(
                status_code=400, 
                detail="كلمة المرور الحالية غير صحيحة"
            )
    
    # Hash and save the new password
    password_hash = hash_password(request.new_password)
    
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"password_hash": password_hash}}
    )
    
    return {"message": "تم تغيير كلمة المرور بنجاح"}

# ===== DATE OF BIRTH & FORGOT PASSWORD =====

@api_router.post("/auth/verify-dob")
async def verify_dob_for_reset(request: ForgotPasswordRequest):
    """Verify date of birth for password reset - Step 1"""
    user = await db.users.find_one({"email": request.email}, {"_id": 0})
    
    if not user:
        raise HTTPException(status_code=404, detail="البريد الإلكتروني غير مسجل")
    
    # Check if DOB is set
    stored_dob = user.get("date_of_birth")
    if not stored_dob:
        raise HTTPException(
            status_code=400, 
            detail="لا يوجد تاريخ ميلاد مسجل لهذا الحساب. يرجى التواصل مع المشرف."
        )
    
    # Compare DOB
    if stored_dob != request.date_of_birth:
        raise HTTPException(status_code=400, detail="تاريخ الميلاد غير صحيح")
    
    # Generate a temporary reset token
    reset_token = f"dob_reset_{uuid.uuid4().hex}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
    
    await db.password_reset_tokens.insert_one({
        "email": request.email,
        "token": reset_token,
        "expires_at": expires_at.isoformat(),
        "used": False
    })
    
    return {
        "message": "تم التحقق من تاريخ الميلاد بنجاح",
        "reset_token": reset_token,
        "expires_in": 900  # 15 minutes
    }

@api_router.post("/auth/reset-password-dob")
async def reset_password_with_dob(request: ResetPasswordWithDOBRequest):
    """Reset password using date of birth verification - Step 2"""
    user = await db.users.find_one({"email": request.email}, {"_id": 0})
    
    if not user:
        raise HTTPException(status_code=404, detail="البريد الإلكتروني غير مسجل")
    
    # Verify DOB again for security
    stored_dob = user.get("date_of_birth")
    if not stored_dob or stored_dob != request.date_of_birth:
        raise HTTPException(status_code=400, detail="تاريخ الميلاد غير صحيح")
    
    # Hash new password
    password_hash = pwd_context.hash(request.new_password)
    
    # Update user with new password
    await db.users.update_one(
        {"email": request.email},
        {
            "$set": {
                "password_hash": password_hash,
                "auth_provider": "email"  # Allow email login now
            }
        }
    )
    
    # Invalidate all existing sessions for this user
    await db.user_sessions.delete_many({"user_id": user["user_id"]})
    
    return {"message": "تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول."}

@api_router.put("/users/date-of-birth")
async def update_date_of_birth(
    request: UpdateDOBRequest,
    current_user: User = Depends(get_current_user)
):
    """Update user's date of birth"""
    # Validate date format
    try:
        datetime.strptime(request.date_of_birth, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="صيغة التاريخ غير صحيحة. استخدم YYYY-MM-DD")
    
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"date_of_birth": request.date_of_birth}}
    )
    
    return {"message": "تم تحديث تاريخ الميلاد بنجاح"}

@api_router.get("/users/date-of-birth")
async def get_date_of_birth(current_user: User = Depends(get_current_user)):
    """Get user's date of birth"""
    user = await db.users.find_one(
        {"user_id": current_user.user_id},
        {"_id": 0, "date_of_birth": 1}
    )
    return {"date_of_birth": user.get("date_of_birth") if user else None}

# ===== STUDENT POINTS MANAGEMENT =====

@api_router.get("/students/{student_id}/points")
async def get_student_points(
    student_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get student's points - accessible by student themselves or teachers"""
    # Check access
    is_own_profile = current_user.user_id == student_id
    is_teacher = current_user.role == "teacher"
    
    if not is_own_profile and not is_teacher:
        raise HTTPException(status_code=403, detail="غير مصرح لك بعرض نقاط هذا الطالب")
    
    # Get points record
    points = await db.student_points.find_one(
        {"student_id": student_id},
        {"_id": 0}
    )
    
    if not points:
        # Initialize points if not exists
        points = {
            "student_id": student_id,
            "booking_points": 0,
            "attendance_points": 0,
            "recitation_points": 0,
            "total_points": 0,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.student_points.insert_one(points)
        points.pop("_id", None)
    
    # Calculate total
    points["total_points"] = (
        points.get("booking_points", 0) + 
        points.get("attendance_points", 0) + 
        points.get("recitation_points", 0)
    )
    
    # Get points history
    history_cursor = db.points_history.find(
        {"student_id": student_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(20)
    history = await history_cursor.to_list(length=20)
    
    return {
        "points": points,
        "history": history
    }

@api_router.post("/teacher/adjust-points")
async def adjust_student_points(
    adjustment: PointsAdjustment,
    current_user: User = Depends(get_current_user)
):
    """Adjust student points - Teacher only"""
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="للمعلمين فقط")
    
    if adjustment.point_type not in ["booking", "attendance", "recitation"]:
        raise HTTPException(status_code=400, detail="نوع النقاط غير صحيح")
    
    # Get or create points record
    points = await db.student_points.find_one({"student_id": adjustment.student_id})
    
    if not points:
        points = {
            "student_id": adjustment.student_id,
            "booking_points": 0,
            "attendance_points": 0,
            "recitation_points": 0
        }
        await db.student_points.insert_one(points)
    
    # Update the specific point type
    field_name = f"{adjustment.point_type}_points"
    current_value = points.get(field_name, 0)
    new_value = max(0, current_value + adjustment.amount)  # Prevent negative points
    
    await db.student_points.update_one(
        {"student_id": adjustment.student_id},
        {
            "$set": {
                field_name: new_value,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Record in history
    history_entry = {
        "history_id": f"ph_{uuid.uuid4().hex[:12]}",
        "student_id": adjustment.student_id,
        "point_type": adjustment.point_type,
        "amount": adjustment.amount,
        "reason": adjustment.reason or ("إضافة" if adjustment.amount > 0 else "خصم"),
        "teacher_id": current_user.user_id,
        "teacher_name": current_user.name,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.points_history.insert_one(history_entry)
    history_entry.pop("_id", None)
    
    # Get updated points
    updated_points = await db.student_points.find_one(
        {"student_id": adjustment.student_id},
        {"_id": 0}
    )
    
    return {
        "message": "تم تحديث النقاط بنجاح",
        "points": updated_points,
        "adjustment": history_entry
    }

@api_router.get("/teacher/students-points")
async def get_all_students_points(current_user: User = Depends(get_current_user)):
    """Get all students with their points - Teacher only"""
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="للمعلمين فقط")
    
    # Get all students
    students_cursor = db.users.find(
        {"role": "student"},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "picture_url": 1}
    )
    students = await students_cursor.to_list(length=500)
    
    # Get all points
    points_cursor = db.student_points.find({}, {"_id": 0})
    all_points = await points_cursor.to_list(length=500)
    points_map = {p["student_id"]: p for p in all_points}
    
    # Combine data
    result = []
    for student in students:
        points = points_map.get(student["user_id"], {
            "booking_points": 0,
            "attendance_points": 0,
            "recitation_points": 0
        })
        result.append({
            **student,
            "points": {
                "booking": points.get("booking_points", 0),
                "attendance": points.get("attendance_points", 0),
                "recitation": points.get("recitation_points", 0),
                "total": (
                    points.get("booking_points", 0) +
                    points.get("attendance_points", 0) +
                    points.get("recitation_points", 0)
                )
            }
        })
    
    # Sort by total points descending
    result.sort(key=lambda x: x["points"]["total"], reverse=True)
    
    return result

# ===== USER/PROFILE ENDPOINTS =====
@api_router.get("/users/profile")
async def get_profile(current_user: User = Depends(get_current_user)):
    """Get user profile"""
    # Convert to dict and remove sensitive fields
    user_dict = current_user.model_dump()
    user_dict.pop("password_hash", None)
    if isinstance(user_dict.get("created_at"), datetime):
        user_dict["created_at"] = user_dict["created_at"].isoformat()
    return user_dict

@api_router.put("/users/profile")
async def update_profile(
    update: ProfileUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update user profile"""
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    
    if update_data:
        await db.users.update_one(
            {"user_id": current_user.user_id},
            {"$set": update_data}
        )
    
    updated_user = await db.users.find_one(
        {"user_id": current_user.user_id},
        {"_id": 0}
    )
    
    if isinstance(updated_user.get("created_at"), str):
        updated_user["created_at"] = datetime.fromisoformat(updated_user["created_at"])
    
    return User(**updated_user)

@api_router.put("/users/role/{role}")
async def update_role(
    role: str,
    current_user: User = Depends(get_current_user)
):
    """Switch user role between student and teacher"""
    if role not in ["student", "teacher"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    # Only TEACHER_CREATOR_EMAIL can create teacher accounts
    if role == "teacher" and current_user.email != TEACHER_CREATOR_EMAIL:
        raise HTTPException(
            status_code=403, 
            detail="فقط المشرف المختص يمكنه إنشاء حسابات المعلمين"
        )
    
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"role": role}}
    )
    
    updated_user = await db.users.find_one(
        {"user_id": current_user.user_id},
        {"_id": 0}
    )
    
    if isinstance(updated_user.get("created_at"), str):
        updated_user["created_at"] = datetime.fromisoformat(updated_user["created_at"])
    
    return User(**updated_user)

@api_router.post("/admin/create-teacher")
async def create_teacher_account(
    email: str,
    current_user: User = Depends(get_current_user)
):
    """Create/upgrade a user to teacher role - Only TEACHER_CREATOR_EMAIL allowed"""
    if current_user.email != TEACHER_CREATOR_EMAIL:
        raise HTTPException(
            status_code=403,
            detail="فقط المشرف المختص يمكنه إنشاء حسابات المعلمين"
        )
    
    # Find user by email
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    
    # Update to teacher role
    await db.users.update_one(
        {"email": email},
        {"$set": {"role": "teacher"}}
    )
    
    return {"message": f"تم ترقية {email} إلى معلم بنجاح"}

@api_router.get("/admin/all-students")
async def get_all_students(current_user: User = Depends(get_current_user)):
    """Get all students - Admin only"""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="فقط المسؤول يمكنه الوصول لهذه البيانات")
    
    students_cursor = db.users.find(
        {"role": "student"},
        {"_id": 0, "password_hash": 0}
    )
    students = await students_cursor.to_list(length=500)
    return students

@api_router.get("/teacher/all-students")
async def get_all_students_for_teacher(current_user: User = Depends(get_current_user)):
    """Get all registered students - For all teachers"""
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="للمعلمين فقط")
    
    students_cursor = db.users.find(
        {"role": "student"},
        {"_id": 0, "password_hash": 0}
    )
    students = await students_cursor.to_list(length=500)
    return students

@api_router.put("/admin/promote-to-teacher/{user_id}")
async def promote_to_teacher(
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    """Promote a student to teacher role - Admin only"""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(
            status_code=403,
            detail="فقط المسؤول يمكنه ترقية المستخدمين"
        )
    
    # Find user
    user = await db.users.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    
    if user.get("role") == "teacher":
        raise HTTPException(status_code=400, detail="هذا المستخدم معلم بالفعل")
    
    # Update to teacher role
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"role": "teacher"}}
    )
    
    return {"message": f"تم ترقية {user.get('name', user.get('email'))} إلى معلم بنجاح"}

@api_router.put("/admin/demote-to-student/{user_id}")
async def demote_to_student(
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    """Demote a teacher to student role - Admin only"""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(
            status_code=403,
            detail="فقط المسؤول يمكنه تغيير أدوار المستخدمين"
        )
    
    # Find user
    user = await db.users.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    
    if user.get("role") == "student":
        raise HTTPException(status_code=400, detail="هذا المستخدم طالب بالفعل")
    
    # Prevent demoting self
    if user.get("email") == ADMIN_EMAIL:
        raise HTTPException(status_code=400, detail="لا يمكنك تغيير دورك الخاص")
    
    # Update to student role
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"role": "student"}}
    )
    
    return {"message": f"تم تحويل {user.get('name', user.get('email'))} إلى طالب"}

# ===== ADMIN PERMANENT ACCOUNT DELETION =====
@api_router.delete("/admin/delete-user/{user_id}")
async def permanently_delete_user(
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    """Permanently delete a user account and all related data - Admin only"""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(
            status_code=403,
            detail="فقط المسؤول يمكنه حذف الحسابات"
        )
    
    # Prevent self-deletion
    if user_id == current_user.user_id:
        raise HTTPException(
            status_code=400,
            detail="لا يمكنك حذف حسابك الخاص"
        )
    
    # Find user to delete
    user = await db.users.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    
    user_name = user.get('name', user.get('email'))
    user_email = user.get('email')
    
    # Delete all related data
    # 1. Delete user sessions
    await db.user_sessions.delete_many({"user_id": user_id})
    
    # 2. Delete user's messages (both sent and received)
    await db.messages.delete_many({
        "$or": [
            {"student_id": user_id},
            {"teacher_id": user_id}
        ]
    })
    
    # 3. Delete user's sessions/bookings
    await db.sessions.delete_many({
        "$or": [
            {"student_id": user_id},
            {"teacher_id": user_id}
        ]
    })
    
    # 4. Delete user's available slots (if teacher)
    await db.available_slots.delete_many({"teacher_id": user_id})
    
    # 5. Delete user's vacation days (if teacher)
    await db.vacation_days.delete_many({"teacher_id": user_id})
    
    # 6. Delete user's booking restrictions
    await db.booking_restrictions.delete_many({
        "$or": [
            {"student_id": user_id},
            {"teacher_id": user_id}
        ]
    })
    
    # 7. Delete user's notifications
    await db.notifications.delete_many({"user_id": user_id})
    
    # 8. Delete user's memorization progress
    await db.memorization_progress.delete_many({
        "$or": [
            {"student_id": user_id},
            {"teacher_id": user_id}
        ]
    })
    
    # 9. Delete user's notes archive
    await db.student_notes_archive.delete_many({
        "$or": [
            {"student_id": user_id},
            {"teacher_id": user_id}
        ]
    })
    
    # 10. Delete user's points
    await db.student_points.delete_many({"student_id": user_id})
    await db.points.delete_many({"user_id": user_id})
    
    # 11. Finally, delete the user account
    result = await db.users.delete_one({"user_id": user_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=500, detail="فشل حذف الحساب")
    
    return {
        "message": f"تم حذف حساب {user_name} ({user_email}) نهائياً",
        "deleted_user": {
            "user_id": user_id,
            "name": user_name,
            "email": user_email
        }
    }

@api_router.get("/admin/all-users")
async def get_all_users(current_user: User = Depends(get_current_user)):
    """Get all users (students and teachers) - Admin only"""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="فقط المسؤول يمكنه الوصول لهذه البيانات")
    
    users_cursor = db.users.find(
        {},
        {"_id": 0, "password_hash": 0}
    )
    users = await users_cursor.to_list(length=1000)
    return users

# ===== ADMIN BULK MESSAGING =====
@api_router.post("/admin/send-bulk-message")
async def send_bulk_message(
    message_data: AdminBulkMessage,
    current_user: User = Depends(get_current_user)
):
    """Send message to multiple students or all students - Admin only"""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="فقط المسؤول يمكنه إرسال رسائل جماعية")
    
    # Get target students
    if message_data.send_to_all:
        students_cursor = db.users.find(
            {"role": "student"},
            {"_id": 0, "user_id": 1, "name": 1}
        )
        students = await students_cursor.to_list(length=1000)
        target_ids = [s["user_id"] for s in students]
    else:
        if not message_data.student_ids:
            raise HTTPException(status_code=400, detail="يجب تحديد الطلاب المستهدفين")
        target_ids = message_data.student_ids
    
    if not target_ids:
        raise HTTPException(status_code=400, detail="لا يوجد طلاب لإرسال الرسالة إليهم")
    
    # Send message to each student
    messages_sent = 0
    for student_id in target_ids:
        # Get student name for display
        student_doc = await db.users.find_one({"user_id": student_id}, {"_id": 0, "name": 1})
        student_name = student_doc["name"] if student_doc else "غير معروف"
        
        message_id = f"msg_{uuid.uuid4().hex[:12]}"
        await db.messages.insert_one({
            "message_id": message_id,
            "teacher_id": current_user.user_id,
            "teacher_name": current_user.name,
            "student_id": student_id,
            "student_name": student_name,
            "message": message_data.message,
            "from_role": "teacher",
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "is_bulk_message": True
        })
        messages_sent += 1
    
    return {
        "message": f"تم إرسال الرسالة إلى {messages_sent} طالب بنجاح",
        "sent_count": messages_sent
    }

# ===== TEACHER LINK MANAGEMENT =====
@api_router.get("/admin/teacher-links")
async def get_teacher_links(current_user: User = Depends(get_current_user)):
    """Get all teachers with their recitation links - Admin only"""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="فقط المسؤول يمكنه الوصول لهذه البيانات")
    
    teachers_cursor = db.users.find(
        {"role": "teacher"},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "picture": 1, "recitation_link": 1}
    )
    teachers = await teachers_cursor.to_list(length=100)
    
    return teachers

@api_router.put("/admin/teacher-link")
async def update_teacher_link(
    link_data: TeacherLinkUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update a teacher's recitation link - Admin only"""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="فقط المسؤول يمكنه تعديل روابط المعلمين")
    
    # Verify teacher exists
    teacher = await db.users.find_one({"user_id": link_data.teacher_id, "role": "teacher"})
    if not teacher:
        raise HTTPException(status_code=404, detail="المعلم غير موجود")
    
    # Update the link in the teacher's user profile
    await db.users.update_one(
        {"user_id": link_data.teacher_id},
        {"$set": {"recitation_link": link_data.recitation_link}}
    )
    
    # Also update the link in all pending (scheduled) sessions for this teacher
    await db.sessions.update_many(
        {"teacher_id": link_data.teacher_id, "status": "scheduled"},
        {"$set": {"recitation_link": link_data.recitation_link}}
    )
    
    return {"message": f"تم تحديث رابط التسميع للمعلم {teacher.get('name')} بنجاح"}

# ===== TEACHER ENDPOINTS =====
@api_router.get("/teachers", response_model=List[Teacher])
async def get_teachers():
    """Get all teachers"""
    teachers_cursor = db.users.find(
        {"role": "teacher"},
        {"_id": 0}
    )
    teachers = await teachers_cursor.to_list(length=100)
    
    result = []
    for t in teachers:
        teacher_data = {
            "teacher_id": t["user_id"],
            "user_id": t["user_id"],
            "name": t["name"],
            "email": t["email"],
            "picture": t.get("picture"),
            "bio": t.get("bio"),
            "specialization": t.get("specialization"),
            "rating": t.get("rating"),
            "total_sessions": 0,
            "available": True
        }
        result.append(Teacher(**teacher_data))
    
    return result

@api_router.get("/teachers/{teacher_id}")
async def get_teacher(teacher_id: str):
    """Get teacher details"""
    teacher = await db.users.find_one(
        {"user_id": teacher_id, "role": "teacher"},
        {"_id": 0}
    )
    
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
    
    sessions_count = await db.sessions.count_documents({"teacher_id": teacher_id})
    
    return Teacher(
        teacher_id=teacher["user_id"],
        user_id=teacher["user_id"],
        name=teacher["name"],
        email=teacher["email"],
        picture=teacher.get("picture"),
        bio=teacher.get("bio"),
        specialization=teacher.get("specialization"),
        rating=teacher.get("rating"),
        total_sessions=sessions_count,
        available=True
    )

# ===== AVAILABLE SLOTS ENDPOINTS =====
@api_router.get("/teachers/{teacher_id}/available-slots")
async def get_teacher_available_slots(teacher_id: str):
    """Get available time slots for a teacher"""
    # Get all available slots for this teacher
    slots_cursor = db.available_slots.find(
        {
            "teacher_id": teacher_id,
            "is_available": True
        },
        {"_id": 0}
    ).sort("scheduled_time", 1)
    
    all_slots = await slots_cursor.to_list(length=200)
    
    # Filter slots that are in the future
    now = datetime.now(timezone.utc)
    future_slots = []
    
    for slot in all_slots:
        scheduled_time = slot.get("scheduled_time")
        if isinstance(scheduled_time, str):
            try:
                slot_dt = datetime.fromisoformat(scheduled_time.replace('+00:00', '+00:00'))
                if slot_dt.tzinfo is None:
                    slot_dt = slot_dt.replace(tzinfo=timezone.utc)
                if slot_dt > now:
                    slot["scheduled_time"] = slot_dt
                    future_slots.append(slot)
            except:
                pass
    
    return future_slots

# ===== SESSION/BOOKING ENDPOINTS =====

# ---------------------------------------------------------------------------
# Auto-cancel helper (lazy cleanup — no scheduler dependency)
# ---------------------------------------------------------------------------
#
# Rule (as agreed with product): any session that is still in status
# "scheduled" more than 90 minutes AFTER its scheduled_time, and never had
# attendance confirmed / never was completed / never was cancelled, is
# considered stale and MUST be auto-cancelled so it stops blocking the
# student's ability to book a new session.
#
# Storage — we intentionally reuse existing fields (no schema migration):
#   status                       -> "cancelled"
#   cancellation_reason          -> "auto_cancelled_no_attendance"
#   cancelled_by                 -> "system"
#   cancelled_at                 -> iso timestamp
#   auto_cancelled_at            -> iso timestamp (marker to detect this case)
#   auto_cancel_notifications_sent -> True (double-safety against re-notify)
#
# The transition is atomic (find_one_and_update with filter status=scheduled)
# so concurrent endpoint calls cannot double-cancel the same session or
# duplicate notifications.
#
# Notifications go to: the student, the teacher, and the admin (single row
# marked with user_id="admin").
# ---------------------------------------------------------------------------

AUTO_CANCEL_REASON = "auto_cancelled_no_attendance"


async def _auto_cancel_expired_sessions(student_id: Optional[str] = None,
                                       teacher_id: Optional[str] = None) -> int:
    """
    Atomically flip every stale scheduled session to cancelled and emit
    one-time notifications. Returns the number of sessions cancelled.

    - If student_id is given, only that student's sessions are considered.
    - If teacher_id is given, only that teacher's sessions are considered.
    - If neither is given, all users are scanned (used by admin dashboards).

    The atomic update guarantees the notifications are emitted exactly once
    per session, no matter how many endpoints call this helper in parallel.
    """
    now = datetime.now(timezone.utc)
    cutoff_iso = (now - timedelta(minutes=90)).isoformat()

    match = {
        "status": "scheduled",
        "scheduled_time": {"$lt": cutoff_iso},
        # attendance_confirmed may be missing OR None -> treat both as "not confirmed"
        "$or": [
            {"attendance_confirmed": None},
            {"attendance_confirmed": {"$exists": False}},
        ],
    }
    if student_id:
        match["student_id"] = student_id
    if teacher_id:
        match["teacher_id"] = teacher_id

    cancelled_count = 0
    now_iso = now.isoformat()

    while True:
        # find_one_and_update is atomic: only the first caller wins for each
        # session document, later callers get no more matches.
        doc = await db.sessions.find_one_and_update(
            match,
            {"$set": {
                "status": "cancelled",
                "cancellation_reason": AUTO_CANCEL_REASON,
                "cancelled_by": "system",
                "cancelled_at": now_iso,
                "auto_cancelled_at": now_iso,
                "auto_cancel_notifications_sent": True,
            }},
            projection={"_id": 0},
            return_document=True,  # return the updated doc so we can notify
        )
        if not doc:
            break
        cancelled_count += 1

        sid = doc.get("session_id")
        s_id = doc.get("student_id")
        t_id = doc.get("teacher_id")
        s_name = doc.get("student_name", "الطالب")
        t_name = doc.get("teacher_name", "المعلم")
        try:
            sched = datetime.fromisoformat(str(doc.get("scheduled_time", "")).replace('Z', '+00:00'))
            sched_str = sched.strftime('%Y-%m-%d %H:%M')
        except Exception:
            sched_str = doc.get("scheduled_time", "")

        message = (
            f"تم إلغاء الحصة تلقائياً للطالب {s_name} مع المعلم {t_name} "
            f"(بتاريخ {sched_str})، لأنها لم تبدأ / لم يتم تأكيد حضورها خلال 90 دقيقة من موعدها."
        )
        title = "إلغاء تلقائي للحصة بسبب عدم الحضور"

        # Fan-out notifications (student, teacher, admin) — each is a
        # single insert with related_session_id, so we can also cross-check
        # if a later code path ever tries to re-notify.
        base_notif = {
            "type": "session_auto_cancelled",
            "title": title,
            "message": message,
            "related_session_id": sid,
            "read": False,
            "created_at": now_iso,
        }
        try:
            if s_id:
                await db.notifications.insert_one(
                    {"notification_id": f"notif_{uuid.uuid4().hex[:12]}",
                     "user_id": s_id, **base_notif}
                )
            if t_id:
                await db.notifications.insert_one(
                    {"notification_id": f"notif_{uuid.uuid4().hex[:12]}",
                     "user_id": t_id, **base_notif}
                )
            # Admin row — user_id="admin" is a bucket already used elsewhere
            # for admin-facing notifications. If the platform ever adds a
            # real admin user, this row is still discoverable via the
            # notification query by type="session_auto_cancelled".
            await db.notifications.insert_one(
                {"notification_id": f"notif_{uuid.uuid4().hex[:12]}",
                 "user_id": "admin", **base_notif}
            )
        except Exception as exc:
            # Notifications must never break the cleanup; log & continue.
            logger.warning(f"[auto_cancel] notif insert failed for {sid}: {exc}")

    return cancelled_count


@api_router.get("/student/active-booking")
async def get_student_active_booking(current_user: User = Depends(get_current_user)):
    """
    P1 helper — return the student's ACTIVE booking (if any), so the frontend
    can pre-emptively block the "احجز حصة" flow instead of waiting for a 409
    from POST /sessions/book.

    UPDATED (Jan 2026): before evaluating "active", we FIRST run the
    lazy auto-cancel cleanup for this student. This guarantees that stale
    scheduled sessions (>90 min past with no attendance) can never
    perpetually block bookings.

    Final definition of "active":
        status == "scheduled"
        AND scheduled_time > now - 90 minutes
        (auto-cancelled sessions have status="cancelled" so they never match).
    """
    if current_user.role != "student":
        return {"has_active_booking": False, "session": None}

    # Lazy cleanup — atomic, safe to call on every request.
    await _auto_cancel_expired_sessions(student_id=current_user.user_id)

    now_utc = datetime.now(timezone.utc)
    cutoff = now_utc - timedelta(minutes=90)
    cursor = db.sessions.find(
        {
            "student_id": current_user.user_id,
            "status": "scheduled",
            "scheduled_time": {"$gt": cutoff.isoformat()},
        },
        {"_id": 0}
    ).sort("scheduled_time", 1)
    docs = await cursor.to_list(length=1)
    if not docs:
        return {"has_active_booking": False, "session": None}
    s = docs[0]
    return {
        "has_active_booking": True,
        "session": {
            "session_id": s.get("session_id"),
            "teacher_id": s.get("teacher_id"),
            "teacher_name": s.get("teacher_name"),
            "scheduled_time": s.get("scheduled_time"),
            "status": s.get("status"),
            "duration": s.get("duration"),
        },
    }


@api_router.get("/public/teachers-slots-counts")
async def get_teachers_available_slots_counts():
    """
    P2 — return a map of {teacher_id: available_future_slot_count} so the
    Teachers list page can render a status badge (available / not available)
    next to each teacher WITHOUT firing N+1 requests.

    A slot is "available" when is_available == True AND scheduled_time is in
    the future. Public endpoint (no auth) so the marketing/teachers page can
    call it before the user logs in.

    NOTE: the path is under /public/ to avoid the /teachers/{teacher_id}
    dynamic route registered earlier (which would otherwise capture this URL
    with teacher_id="available-slots-counts").
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    # Single aggregation → O(1) round-trip
    pipeline = [
        {
            "$match": {
                "is_available": True,
                "scheduled_time": {"$gt": now_iso},
            }
        },
        {
            "$group": {
                "_id": "$teacher_id",
                "count": {"$sum": 1},
            }
        },
    ]
    result_cursor = db.available_slots.aggregate(pipeline)
    counts = {}
    async for row in result_cursor:
        tid = row.get("_id")
        if tid:
            counts[tid] = int(row.get("count", 0))
    return {"counts": counts}


@api_router.post("/sessions/book", response_model=Session)
async def book_session(
    booking: SessionCreate,
    current_user: User = Depends(get_current_user)
):
    """Book a session with a teacher"""
    # Check if student is frozen (3+ warnings in 3 months)
    user_doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0, "is_frozen": 1, "frozen_reason": 1})
    if user_doc and user_doc.get("is_frozen"):
        raise HTTPException(
            status_code=403,
            detail=f"تم تجميد حسابك مؤقتاً. {user_doc.get('frozen_reason', '')}. يرجى التواصل مع إدارة المقرأة."
        )

    # Check if student is restricted from booking with this teacher
    restriction = await db.booking_restrictions.find_one({
        "teacher_id": booking.teacher_id,
        "student_id": current_user.user_id,
        "active": True
    })
    
    if restriction:
        raise HTTPException(
            status_code=403, 
            detail=f"أنت مقيد من الحجز عند هذا الشيخ. السبب: {restriction.get('reason', 'غير محدد')}"
        )
    
    # Get teacher info
    teacher = await db.users.find_one(
        {"user_id": booking.teacher_id, "role": "teacher"},
        {"_id": 0}
    )
    
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    # ===== P1 + Auto-Cancel: Prevent double-booking =====
    # First run lazy cleanup so stale scheduled sessions (>90 min past with
    # no attendance) don't perpetually block the student from booking.
    await _auto_cancel_expired_sessions(student_id=current_user.user_id)

    # A student may not book a new session while they already have an ACTIVE
    # booking. An "active" booking is one with status="scheduled" whose
    # scheduled_time is still within the visible window (session start + 90 min),
    # mirroring the 90-minute visibility rule used in /sessions/my-sessions and
    # StudentDashboard's isSessionVisibleActive. Once the window passes OR the
    # session is cancelled/completed, the student is free to book again.
    now_utc = datetime.now(timezone.utc)
    active_window_cutoff = now_utc - timedelta(minutes=90)
    existing_active_cursor = db.sessions.find(
        {
            "student_id": current_user.user_id,
            "status": "scheduled",
            "scheduled_time": {"$gt": active_window_cutoff.isoformat()},
        },
        {"_id": 0}
    ).sort("scheduled_time", 1)
    existing_active = await existing_active_cursor.to_list(length=5)
    if existing_active:
        # Prefer the earliest still-active session for a clear message.
        active_session = existing_active[0]
        try:
            active_time = datetime.fromisoformat(active_session["scheduled_time"].replace('Z', '+00:00'))
            active_time_str = active_time.strftime('%Y-%m-%d %H:%M')
        except Exception:
            active_time_str = active_session.get("scheduled_time", "")
        active_teacher_name = active_session.get("teacher_name", "معلمك")
        raise HTTPException(
            status_code=409,
            detail={
                "message": (
                    f"لديك حصة محجوزة بالفعل مع {active_teacher_name} بتاريخ {active_time_str}. "
                    f"لا يمكنك حجز حصة جديدة حتى تحضر الحصة الحالية أو يتم إلغاؤها."
                ),
                "reason": "active_booking_exists",
                "active_session": {
                    "session_id": active_session.get("session_id"),
                    "teacher_id": active_session.get("teacher_id"),
                    "teacher_name": active_teacher_name,
                    "scheduled_time": active_session.get("scheduled_time"),
                    "status": active_session.get("status"),
                },
            },
        )

    # Check if slot is on a vacation day
    booking_date = booking.scheduled_time.strftime("%Y-%m-%d")
    vacation = await db.vacation_days.find_one({
        "teacher_id": booking.teacher_id,
        "date": booking_date
    })
    
    if vacation:
        raise HTTPException(status_code=400, detail="هذا اليوم غير متاح للحجز (إجازة)")
    
    # Check weekly rotation - is this teacher allowed this week?
    rotation_settings = await db.system_settings.find_one({"setting_type": "weekly_rotation"}, {"_id": 0})
    
    if rotation_settings and rotation_settings.get("enabled"):
        start_date = datetime.strptime(rotation_settings["start_date"], "%Y-%m-%d")
        today = datetime.now(timezone.utc).replace(tzinfo=None)
        days_diff = (today - start_date).days
        weeks_diff = days_diff // 7
        
        teachers = rotation_settings.get("teachers", [])
        first_teacher_id = rotation_settings.get("first_week_teacher")
        
        if len(teachers) >= 2:
            if weeks_diff % 2 == 0:
                active_teacher_id = first_teacher_id
            else:
                active_teacher_id = next((t["teacher_id"] for t in teachers if t["teacher_id"] != first_teacher_id), None)
            
            # Check if booking teacher is the active one
            if active_teacher_id and booking.teacher_id != active_teacher_id:
                active_teacher = next((t for t in teachers if t["teacher_id"] == active_teacher_id), {})
                raise HTTPException(
                    status_code=403, 
                    detail=f"الحجز متاح هذا الأسبوع فقط مع الشيخ {active_teacher.get('name', '')}"
                )
    
    # Check if slot is available
    slot = await db.available_slots.find_one({
        "teacher_id": booking.teacher_id,
        "scheduled_time": booking.scheduled_time.isoformat(),
        "is_available": True
    })
    
    if slot:
        # Mark slot as unavailable
        await db.available_slots.update_one(
            {"slot_id": slot["slot_id"]},
            {"$set": {"is_available": False}}
        )
    
    # Create session
    session_id = f"session_{uuid.uuid4().hex[:12]}"
    meeting_room_id = f"room_{uuid.uuid4().hex[:8]}"
    
    session_data = {
        "session_id": session_id,
        "student_id": current_user.user_id,
        "teacher_id": booking.teacher_id,
        "teacher_name": teacher["name"],
        "student_name": current_user.name,
        "scheduled_time": booking.scheduled_time.isoformat(),
        "duration": booking.duration,
        "status": "scheduled",
        "meeting_room_id": meeting_room_id,
        "recitation_link": teacher.get("recitation_link", ""),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.sessions.insert_one(session_data)
    
    # ===== AUTO ADD BOOKING POINTS =====
    # Add 2 booking points automatically when student books
    points_record = await db.student_points.find_one({"student_id": current_user.user_id})
    if not points_record:
        await db.student_points.insert_one({
            "student_id": current_user.user_id,
            "booking_points": 2,
            "attendance_points": 0,
            "recitation_points": 0,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    else:
        await db.student_points.update_one(
            {"student_id": current_user.user_id},
            {"$inc": {"booking_points": 2}}
        )
    
    # Record in points history
    await db.points_history.insert_one({
        "history_id": f"ph_{uuid.uuid4().hex[:12]}",
        "student_id": current_user.user_id,
        "point_type": "booking",
        "amount": 2,
        "reason": "حجز موعد جديد (تلقائي)",
        "session_id": session_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    # Send confirmation email
    send_booking_confirmation(
        current_user.email,
        teacher["name"],
        booking.scheduled_time
    )
    
    session_data["scheduled_time"] = datetime.fromisoformat(session_data["scheduled_time"])
    session_data["created_at"] = datetime.fromisoformat(session_data["created_at"])
    
    return Session(**session_data)

@api_router.get("/sessions/my-sessions", response_model=List[Session])
async def get_my_sessions(current_user: User = Depends(get_current_user)):
    """Get user's sessions (student or teacher)"""
    if current_user.role == "student":
        query = {"student_id": current_user.user_id}
    else:
        query = {"teacher_id": current_user.user_id}
    
    sessions_cursor = db.sessions.find(query, {"_id": 0}).sort("scheduled_time", -1)
    sessions = await sessions_cursor.to_list(length=100)
    
    # Sessions are auto-hidden from active UI 90 minutes after their start time.
    # Cancelled sessions remain visible (they have their own hide mechanism).
    now = datetime.now(timezone.utc)
    cutoff_seconds = 90 * 60  # 90 minutes
    filtered_sessions = []
    teacher_attendance_alerts = []  # sessions needing attendance reminder
    
    for s in sessions:
        # Skip sessions hidden by this user
        hidden_by = s.get("hidden_by", [])
        if current_user.user_id in hidden_by:
            continue
            
        if isinstance(s.get("scheduled_time"), str):
            s["scheduled_time"] = datetime.fromisoformat(s["scheduled_time"].replace('Z', '+00:00'))
        if isinstance(s.get("created_at"), str):
            s["created_at"] = datetime.fromisoformat(s["created_at"].replace('Z', '+00:00'))
        
        scheduled_time = s.get("scheduled_time")
        if scheduled_time:
            # Make sure scheduled_time is timezone-aware
            if scheduled_time.tzinfo is None:
                scheduled_time = scheduled_time.replace(tzinfo=timezone.utc)
            
            # Calculate time difference
            time_diff = now - scheduled_time
            past_cutoff = time_diff.total_seconds() >= cutoff_seconds
            
            # Track unconfirmed-attendance sessions past 90 min for teacher alert
            if (
                current_user.role == "teacher"
                and past_cutoff
                and s.get("status") == "scheduled"
                and s.get("attendance_confirmed") is None
            ):
                teacher_attendance_alerts.append(s)
            
            # Include if: cancelled, not yet past cutoff
            if s.get("status") == "cancelled" or not past_cutoff:
                filtered_sessions.append(s)
        else:
            filtered_sessions.append(s)
    
    # Create one-time notification for each teacher session past 90 min with unconfirmed attendance
    if teacher_attendance_alerts:
        for s in teacher_attendance_alerts:
            sid = s.get("session_id")
            existing = await db.notifications.find_one({
                "type": "attendance_pending",
                "related_session_id": sid,
                "user_id": current_user.user_id
            }, {"_id": 0, "notification_id": 1})
            if existing:
                continue
            await db.notifications.insert_one({
                "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
                "user_id": current_user.user_id,
                "type": "attendance_pending",
                "title": "تأكيد الحضور مطلوب",
                "message": f"الحصة مع {s.get('student_name', 'الطالب')} انتهت ولم يتم تأكيد حضور الطالب بعد.",
                "related_session_id": sid,
                "read": False,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
    
    # Enrich sessions with current teacher recitation_link if missing
    teacher_link_cache = {}
    for s in filtered_sessions:
        if not s.get("recitation_link"):
            tid = s.get("teacher_id")
            if tid not in teacher_link_cache:
                t = await db.users.find_one({"user_id": tid}, {"_id": 0, "recitation_link": 1})
                teacher_link_cache[tid] = t.get("recitation_link", "") if t else ""
            s["recitation_link"] = teacher_link_cache[tid]
    
    return [Session(**s) for s in filtered_sessions]

@api_router.post("/sessions/{session_id}/join-click")
async def record_session_join_click_alias(session_id: str, current_user: User = Depends(get_current_user)):
    return await record_session_join(session_id, current_user)

@api_router.get("/sessions/{session_id}/join-link")
async def get_session_join_link(session_id: str, current_user: User = Depends(get_current_user)):
    """Get the recitation link for a session - fetches teacher's current link"""
    session = await db.sessions.find_one({"session_id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="الجلسة غير موجودة")
    
    # Verify user is part of this session or is admin
    if (current_user.user_id != session.get("student_id") and 
        current_user.user_id != session.get("teacher_id") and
        current_user.email != ADMIN_EMAIL):
        raise HTTPException(status_code=403, detail="غير مصرح لك بالوصول لهذه الجلسة")
    
    # Fetch the teacher's CURRENT recitation_link (so admin updates take effect immediately)
    teacher = await db.users.find_one(
        {"user_id": session["teacher_id"]},
        {"_id": 0, "recitation_link": 1}
    )
    
    recitation_link = ""
    if teacher and teacher.get("recitation_link"):
        recitation_link = teacher["recitation_link"]
    elif session.get("recitation_link"):
        # Fallback to the link stored at booking time
        recitation_link = session["recitation_link"]
    
    return {
        "session_id": session_id,
        "teacher_id": session["teacher_id"],
        "recitation_link": recitation_link
    }


@api_router.post("/sessions/{session_id}/join")
async def record_session_join(session_id: str, current_user: User = Depends(get_current_user)):
    """Student records that they clicked join - also returns the meet link"""
    session = await db.sessions.find_one({"session_id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="الجلسة غير موجودة")
    
    if current_user.user_id != session.get("student_id"):
        raise HTTPException(status_code=403, detail="هذه ليست جلستك")
    
    # if session.get("status") != "scheduled":
    #     raise HTTPException(status_code=400, detail="الجلسة غير متاحة للانضمام")

    if session.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="لا يمكن الانضمام إلى حصة ملغاة")
    # Record the join click timestamp
    now = datetime.now(timezone.utc)
    await db.sessions.update_one(
        {"session_id": session_id},
        {"$set": {"join_clicked_at": now.isoformat()}}
    )
    
    # Fetch the teacher's current recitation link
    teacher = await db.users.find_one(
        {"user_id": session["teacher_id"]},
        {"_id": 0, "recitation_link": 1}
    )
    
    recitation_link = ""
    if teacher and teacher.get("recitation_link"):
        recitation_link = teacher["recitation_link"]
    elif session.get("recitation_link"):
        recitation_link = session["recitation_link"]
    
    return {
        "session_id": session_id,
        "join_clicked_at": now.isoformat(),
        "recitation_link": recitation_link
    }

@api_router.put("/sessions/{session_id}/attendance")
async def confirm_session_attendance(
    session_id: str,
    data: AttendanceConfirmation,
    current_user: User = Depends(get_current_user)
):
    """Any teacher can confirm whether the student actually attended"""
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="فقط المعلم يمكنه تأكيد الحضور")
    
    session = await db.sessions.find_one({"session_id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="الجلسة غير موجودة")
    
    now = datetime.now(timezone.utc)
    update_fields = {
        "attendance_confirmed": data.attended,
        "attendance_confirmed_at": now.isoformat(),
        "attendance_confirmed_by": current_user.user_id
    }
    
    # If teacher confirms attendance, also mark session as completed
    if data.attended and session.get("status") == "scheduled":
        update_fields["status"] = "completed"
    
    await db.sessions.update_one(
        {"session_id": session_id},
        {"$set": update_fields}
    )
    
    status_text = "حاضر" if data.attended else "غائب"
    return {"message": f"تم تأكيد حالة الطالب: {status_text}"}

class LegacyAttendanceConfirmation(BaseModel):
    is_present: bool


@api_router.post("/sessions/{session_id}/confirm-attendance")
async def confirm_session_attendance_legacy(
    session_id: str,
    data: LegacyAttendanceConfirmation,
    current_user: User = Depends(get_current_user)
):
    return await confirm_session_attendance(
        session_id,
        AttendanceConfirmation(attended=data.is_present),
        current_user
    )
    
# Admin email for special access
ADMIN_EMAIL = "m0m0077100@gmail.com"

# Users authorized to manage slots (add/delete slots for any teacher)
SLOT_MANAGERS_EMAILS = [
    "m0m0077100@gmail.com",      # محمد الأنصاري (المشرف)
    "aalsiiada@gmail.com",        # البراء السيدا
    "omarnasernajjar09@gmail.com" # عمر النجار
]

@api_router.get("/admin/all-bookings")
async def get_all_bookings(current_user: User = Depends(get_current_user)):
    """Get all bookings - Admin only (محمد الأنصاري)"""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Access denied - Admin only")
    
    # Get all sessions
    sessions_cursor = db.sessions.find({}, {"_id": 0}).sort("created_at", -1)
    all_sessions = await sessions_cursor.to_list(length=500)
    
    # Filter out sessions that started more than 90 minutes ago (except cancelled)
    now = datetime.now(timezone.utc)
    cutoff_seconds = 90 * 60  # 90 minutes
    filtered_sessions = []
    
    for s in all_sessions:
        # Skip sessions hidden by admin
        hidden_by = s.get("hidden_by", [])
        if current_user.user_id in hidden_by:
            continue
            
        scheduled_time = s.get("scheduled_time")
        if isinstance(scheduled_time, str):
            scheduled_time = datetime.fromisoformat(scheduled_time.replace('Z', '+00:00'))
        
        if scheduled_time:
            if scheduled_time.tzinfo is None:
                scheduled_time = scheduled_time.replace(tzinfo=timezone.utc)
            
            time_diff = now - scheduled_time
            
            # Include if: cancelled, not yet started, or started less than 90 minutes ago
            if s.get("status") == "cancelled" or time_diff.total_seconds() < cutoff_seconds:
                filtered_sessions.append(s)
        else:
            filtered_sessions.append(s)
    
    # Get unique students
    student_ids = list(set([s["student_id"] for s in filtered_sessions]))
    students_cursor = db.users.find({"user_id": {"$in": student_ids}}, {"_id": 0})
    students = await students_cursor.to_list(length=500)
    students_map = {s["user_id"]: s for s in students}
    
    # Get all teachers
    teachers_cursor = db.users.find({"role": "teacher"}, {"_id": 0})
    teachers = await teachers_cursor.to_list(length=100)
    teachers_map = {t["user_id"]: t for t in teachers}
    
    # Group sessions by teacher
    bookings_by_teacher = {}
    for session in filtered_sessions:
        teacher_id = session["teacher_id"]
        if teacher_id not in bookings_by_teacher:
            teacher_info = teachers_map.get(teacher_id, {})
            bookings_by_teacher[teacher_id] = {
                "teacher_id": teacher_id,
                "teacher_name": teacher_info.get("name", session.get("teacher_name", "Unknown")),
                "teacher_email": teacher_info.get("email", ""),
                "total_bookings": 0,
                "students": []
            }
        
        student_info = students_map.get(session["student_id"], {})
        bookings_by_teacher[teacher_id]["total_bookings"] += 1
        
        # Add student if not already added
        student_entry = {
            "student_id": session["student_id"],
            "student_name": student_info.get("name", session.get("student_name", "Unknown")),
            "student_email": student_info.get("email", ""),
            "student_picture": student_info.get("picture", ""),
            "session_id": session["session_id"],
            "session_time": session["scheduled_time"],
            "session_status": session["status"],
            "cancellation_reason": session.get("cancellation_reason", ""),
            "booked_at": session.get("created_at", "")
        }
        bookings_by_teacher[teacher_id]["students"].append(student_entry)
    
    return {
        "total_sessions": len(filtered_sessions),
        "total_students": len(student_ids),
        "total_teachers": len(teachers),
        "bookings_by_teacher": list(bookings_by_teacher.values())
    }

@api_router.put("/sessions/{session_id}/cancel")
async def cancel_session(
    session_id: str,
    cancellation: CancellationRequest,
    current_user: User = Depends(get_current_user)
):
    """Cancel a session with mandatory reason"""
    session = await db.sessions.find_one({"session_id": session_id}, {"_id": 0})
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session["student_id"] != current_user.user_id and session["teacher_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if not cancellation.reason or len(cancellation.reason.strip()) < 3:
        raise HTTPException(status_code=400, detail="Cancellation reason is required (min 3 characters)")
    
    # Determine who cancelled
    cancelled_by = "student" if current_user.user_id == session["student_id"] else "teacher"
    
    # Update session status with cancellation metadata
    await db.sessions.update_one(
        {"session_id": session_id},
        {"$set": {
            "status": "cancelled",
            "cancellation_reason": cancellation.reason,
            "cancelled_by": cancelled_by,
            "cancelled_at": datetime.now(timezone.utc).isoformat(),
            "cancelled_by_user_id": current_user.user_id,
            "cancelled_by_name": current_user.name
        }}
    )
    
    # Make the slot available again if it exists
    await db.available_slots.update_one(
        {
            "teacher_id": session["teacher_id"],
            "scheduled_time": session["scheduled_time"]
        },
        {"$set": {"is_available": True}}
    )
    
    # Create notification for the other party
    other_user_id = session["teacher_id"] if cancelled_by == "student" else session["student_id"]
    other_user_name = session["teacher_name"] if cancelled_by == "student" else session["student_name"]
    
    notification_id = f"notif_{uuid.uuid4().hex[:12]}"
    await db.notifications.insert_one({
        "notification_id": notification_id,
        "user_id": other_user_id,
        "type": "session_cancelled",
        "title": "تم إلغاء الحصة",
        "message": f"تم إلغاء الحصة بواسطة {current_user.name}. السبب: {cancellation.reason}",
        "related_session_id": session_id,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    # Notify about new available slot
    await db.notifications.insert_one({
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": "all_students",  # Special marker for all students
        "type": "slot_available",
        "title": "موعد جديد متاح",
        "message": f"أصبح موعد جديد متاحاً عند {session['teacher_name']}",
        "related_teacher_id": session["teacher_id"],
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": "Session cancelled successfully", "cancelled_by": cancelled_by}


@api_router.put("/sessions/{session_id}/restore-completed")
async def restore_auto_cancelled_session(
    session_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Manual override for the teacher OR the admin: if a session was
    auto-cancelled by the 90-minute cleanup but the student actually
    attended (e.g. teacher forgot to confirm attendance in time, technical
    glitch, offline confirmation), restore it to "completed" so the
    evaluation flow becomes available again.

    Rules:
      - Only the teacher who owns the session OR the admin can call this.
      - Only sessions where cancellation_reason == "auto_cancelled_no_attendance"
        can be restored. Manually-cancelled sessions cannot be silently
        re-opened via this endpoint (they must be re-booked instead).
      - The restore sets status="completed" AND attendance_confirmed=true
        so the existing evaluation UI (SessionNotesDialog / student profile)
        works with the session immediately, without any special-casing.
    """
    session = await db.sessions.find_one({"session_id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="الجلسة غير موجودة")

    is_teacher_of_session = current_user.user_id == session.get("teacher_id")
    is_admin = current_user.email == ADMIN_EMAIL
    if not (is_teacher_of_session or is_admin):
        raise HTTPException(status_code=403, detail="غير مصرح لك بتعديل هذه الحصة")

    if session.get("cancellation_reason") != AUTO_CANCEL_REASON:
        raise HTTPException(
            status_code=400,
            detail="لا يمكن استعادة إلا الحصص التي أُلغيت تلقائياً بسبب عدم الحضور."
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.sessions.update_one(
        {"session_id": session_id},
        {"$set": {
            "status": "completed",
            "attendance_confirmed": True,
            "attendance_confirmed_at": now_iso,
            "attendance_confirmed_by": current_user.user_id,
            "restored_from_auto_cancel_at": now_iso,
            "restored_from_auto_cancel_by": current_user.user_id,
        },
         # Clear the auto-cancel markers so the session stops rendering the
         # "auto-cancelled" badge in the UI.
         "$unset": {
             "cancellation_reason": "",
             "cancelled_by": "",
             "cancelled_at": "",
             "auto_cancelled_at": "",
         }}
    )

    # Notify the student that the record was corrected.
    try:
        await db.notifications.insert_one({
            "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
            "user_id": session.get("student_id"),
            "type": "session_restored",
            "title": "تم تعديل حالة الحصة",
            "message": f"تم تحويل حصتك مع {session.get('teacher_name', 'المعلم')} إلى مكتملة بعد تصحيح الحالة يدوياً.",
            "related_session_id": session_id,
            "read": False,
            "created_at": now_iso,
        })
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"[restore] notif failed for {session_id}: {exc}")

    return {"message": "تم تحويل الحصة إلى مكتملة", "session_id": session_id}


@api_router.delete("/sessions/{session_id}/hide")
async def hide_session(
    session_id: str,
    current_user: User = Depends(get_current_user)
):
    """Hide a session from user's active view (does NOT delete the record)."""
    session = await db.sessions.find_one({"session_id": session_id}, {"_id": 0})
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Check if user is authorized (student, teacher, or admin)
    is_student = session["student_id"] == current_user.user_id
    is_teacher = session["teacher_id"] == current_user.user_id
    is_admin = current_user.email == ADMIN_EMAIL
    
    if not (is_student or is_teacher or is_admin):
        raise HTTPException(status_code=403, detail="غير مصرح لك بإخفاء هذا الموعد")
    
    # Add user to hidden_by list (per-user UI hide)
    hidden_by = session.get("hidden_by", [])
    if current_user.user_id not in hidden_by:
        hidden_by.append(current_user.user_id)
    
    await db.sessions.update_one(
        {"session_id": session_id},
        {"$set": {"hidden_by": hidden_by}}
    )
    
    return {"message": "تم إخفاء الموعد بنجاح"}

@api_router.post("/users/upload-picture")
async def upload_picture(
    data: PictureUpload,
    current_user: User = Depends(get_current_user)
):
    """Update user profile picture"""
    # Validate base64 image
    if not data.picture_url.startswith('data:image/'):
        raise HTTPException(status_code=400, detail="Invalid image format")
    
    # Check size (approximate, base64 is ~33% larger)
    if len(data.picture_url) > 7 * 1024 * 1024:  # ~5MB original
        raise HTTPException(status_code=400, detail="Image too large (max 5MB)")
    
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"picture": data.picture_url}}
    )
    
    updated_user = await db.users.find_one(
        {"user_id": current_user.user_id},
        {"_id": 0}
    )
    
    if isinstance(updated_user.get("created_at"), str):
        updated_user["created_at"] = datetime.fromisoformat(updated_user["created_at"])
    
    return User(**updated_user)

@api_router.get("/sessions/{session_id}/room")
async def get_room_info(
    session_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get room info for live session"""
    session = await db.sessions.find_one({"session_id": session_id}, {"_id": 0})
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session["student_id"] != current_user.user_id and session["teacher_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if isinstance(session.get("scheduled_time"), str):
        session["scheduled_time"] = datetime.fromisoformat(session["scheduled_time"])
    if isinstance(session.get("created_at"), str):
        session["created_at"] = datetime.fromisoformat(session["created_at"])
    
    return {
        "session": Session(**session),
        "room_id": session["meeting_room_id"],
        "user_role": current_user.role
    }

# ===== TEACHER FEATURES =====
@api_router.put("/sessions/{session_id}/rate")
async def rate_session(
    session_id: str,
    rating_data: SessionRating,
    current_user: User = Depends(get_current_user)
):
    """Teacher rates a student's session"""
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can rate sessions")
    
    session = await db.sessions.find_one({"session_id": session_id}, {"_id": 0})
    
    if not session:
        raise HTTPException(status_code=404, detail="لم يتم العثور على الحصة")
    
    if session["teacher_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="هذه الحصة لا تخصك")
    
    # Validate rating
    valid_ratings = ["ضعيف", "مقبول", "متوسط", "ممتاز"]
    if rating_data.rating not in valid_ratings:
        raise HTTPException(status_code=400, detail="التقييم غير صحيح")
    
    await db.sessions.update_one(
        {"session_id": session_id},
        {"$set": {
            "rating": rating_data.rating,
            "teacher_notes": rating_data.notes
        }}
    )
    
    return {"message": "Session rated successfully"}

@api_router.post("/messages/send")
async def send_message_to_student(
    message_data: TeacherMessage,
    current_user: User = Depends(get_current_user)
):
    """Teacher sends a message to a student"""
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can send messages")
    
    # Get student info
    student = await db.users.find_one({"user_id": message_data.student_id}, {"_id": 0})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Save message
    message_id = f"msg_{uuid.uuid4().hex[:12]}"
    await db.messages.insert_one({
        "message_id": message_id,
        "from_role": "teacher",
        "teacher_id": current_user.user_id,
        "teacher_name": current_user.name,
        "student_id": message_data.student_id,
        "student_name": student["name"],
        "message": message_data.message,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": "Message sent successfully", "message_id": message_id}

@api_router.post("/messages/send-to-teacher")
async def send_message_to_teacher(
    message_data: StudentMessage,
    current_user: User = Depends(get_current_user)
):
    """Student sends a message to a teacher"""
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Only students can use this endpoint")
    
    # Get teacher info
    teacher = await db.users.find_one({"user_id": message_data.teacher_id, "role": "teacher"}, {"_id": 0})
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
    
    # Save message
    message_id = f"msg_{uuid.uuid4().hex[:12]}"
    await db.messages.insert_one({
        "message_id": message_id,
        "from_role": "student",
        "teacher_id": message_data.teacher_id,
        "teacher_name": teacher["name"],
        "student_id": current_user.user_id,
        "student_name": current_user.name,
        "message": message_data.message,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": "Message sent successfully", "message_id": message_id}

@api_router.get("/messages/my-messages")
async def get_my_messages(current_user: User = Depends(get_current_user)):
    """Get messages for current user"""
    if current_user.role == "student":
        # Student sees messages where they are the student (both sent and received)
        query = {"student_id": current_user.user_id}
    else:
        # Teacher sees messages where they are the teacher (both sent and received)
        query = {"teacher_id": current_user.user_id}
    
    # Filter out messages that the current user has hidden via per-user thread delete
    query["deleted_for_user_ids"] = {"$ne": current_user.user_id}
    
    messages_cursor = db.messages.find(query, {"_id": 0}).sort("created_at", -1)
    messages = await messages_cursor.to_list(length=100)
    
    # Enrich messages missing teacher_name or student_name (backward compat for old bulk messages)
    name_cache = {}
    for msg in messages:
        if not msg.get("teacher_name") and msg.get("teacher_id"):
            tid = msg["teacher_id"]
            if tid not in name_cache:
                u = await db.users.find_one({"user_id": tid}, {"_id": 0, "name": 1})
                name_cache[tid] = u["name"] if u else "غير معروف"
            msg["teacher_name"] = name_cache[tid]
        if not msg.get("student_name") and msg.get("student_id"):
            sid = msg["student_id"]
            if sid not in name_cache:
                u = await db.users.find_one({"user_id": sid}, {"_id": 0, "name": 1})
                name_cache[sid] = u["name"] if u else "غير معروف"
            msg["student_name"] = name_cache[sid]
    
    return messages

@api_router.put("/messages/{message_id}/read")
async def mark_message_as_read(
    message_id: str,
    current_user: User = Depends(get_current_user)
):
    """Mark message as read - works for both students and teachers"""
    # First check if message exists and user has permission
    message = await db.messages.find_one({"message_id": message_id})
    
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Check if user is part of this conversation
    is_student = message.get("student_id") == current_user.user_id
    is_teacher = message.get("teacher_id") == current_user.user_id
    
    if not is_student and not is_teacher:
        raise HTTPException(status_code=403, detail="You are not part of this conversation")
    
    # Only mark as read if the message is TO the current user (not FROM them)
    # Student marks teacher's messages as read
    # Teacher marks student's messages as read
    should_mark_read = False
    if is_student and message.get("from_role") == "teacher":
        should_mark_read = True
    elif is_teacher and message.get("from_role") == "student":
        should_mark_read = True
    
    if should_mark_read:
        await db.messages.update_one(
            {"message_id": message_id},
            {"$set": {
                "read": True,
                "read_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    
    return {"message": "Message marked as read"}

# ===== MESSAGE DELETE (PERMANENT) =====
@api_router.delete("/messages/{message_id}")
async def delete_message(
    message_id: str,
    current_user: User = Depends(get_current_user)
):
    """Permanently delete a message (sender, recipient, or admin)."""
    message = await db.messages.find_one({"message_id": message_id})
    
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Check permission: any participant of the conversation can delete permanently,
    # or admin.
    is_participant = (
        message.get("teacher_id") == current_user.user_id
        or message.get("student_id") == current_user.user_id
    )
    is_admin = current_user.email == ADMIN_EMAIL
    
    if not is_participant and not is_admin:
        raise HTTPException(status_code=403, detail="غير مصرح لك بحذف هذه الرسالة")
    
    # Hard delete — removes for both sender and receiver
    await db.messages.delete_one({"message_id": message_id})
    
    return {"message": "Message permanently deleted"}

# ===== DELETE FULL CONVERSATION (PER-USER) =====
@api_router.delete("/messages/conversation/{partner_id}")
async def delete_conversation(
    partner_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Per-user soft delete an entire conversation thread.
    The other participant still sees the messages.
    """
    # Build filter for messages between current_user and partner
    if current_user.role == "student":
        conv_filter = {"student_id": current_user.user_id, "teacher_id": partner_id}
    else:
        conv_filter = {"teacher_id": current_user.user_id, "student_id": partner_id}

    result = await db.messages.update_many(
        conv_filter,
        {"$addToSet": {"deleted_for_user_ids": current_user.user_id}}
    )

    return {"message": "Conversation deleted", "deleted_count": result.modified_count}

# ===== NOTIFICATIONS SYSTEM =====
@api_router.get("/notifications")
async def get_notifications(current_user: User = Depends(get_current_user)):
    """Get user notifications"""
    # Get personal notifications and broadcast notifications for students
    if current_user.role == "student":
        query = {"$or": [
            {"user_id": current_user.user_id},
            {"user_id": "all_students"},
            {"user_id": "all_users"}
        ]}
    else:
        query = {"$or": [
            {"user_id": current_user.user_id},
            {"user_id": "all_teachers"},
            {"user_id": "all_users"}
        ]}
    
    notifications_cursor = db.notifications.find(query, {"_id": 0}).sort("created_at", -1).limit(50)
    notifications = await notifications_cursor.to_list(length=50)
    
    return notifications

@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_user)
):
    """Mark notification as read"""
    await db.notifications.update_one(
        {"notification_id": notification_id},
        {"$set": {"read": True}}
    )
    return {"message": "Notification marked as read"}

@api_router.put("/notifications/read-all")
async def mark_all_notifications_read(current_user: User = Depends(get_current_user)):
    """Mark all notifications as read"""
    if current_user.role == "student":
        query = {"$or": [
            {"user_id": current_user.user_id},
            {"user_id": "all_students"},
            {"user_id": "all_users"}
        ]}
    else:
        query = {"$or": [
            {"user_id": current_user.user_id},
            {"user_id": "all_teachers"},
            {"user_id": "all_users"}
        ]}
    
    await db.notifications.update_many(query, {"$set": {"read": True}})
    return {"message": "All notifications marked as read"}

# ===== VACATION/UNAVAILABLE DAYS =====
@api_router.post("/teacher/vacation-days")
async def add_vacation_day(
    vacation: VacationDay,
    current_user: User = Depends(get_current_user)
):
    """Teacher adds vacation/unavailable day"""
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can set vacation days")
    
    vacation_id = f"vac_{uuid.uuid4().hex[:12]}"
    await db.vacation_days.insert_one({
        "vacation_id": vacation_id,
        "teacher_id": current_user.user_id,
        "date": vacation.date,
        "reason": vacation.reason,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    # Mark all slots on this day as unavailable
    date_start = f"{vacation.date}T00:00:00"
    date_end = f"{vacation.date}T23:59:59"
    
    await db.available_slots.update_many(
        {
            "teacher_id": current_user.user_id,
            "scheduled_time": {"$gte": date_start, "$lte": date_end}
        },
        {"$set": {"is_available": False, "vacation_blocked": True}}
    )
    
    return {"message": "Vacation day added", "vacation_id": vacation_id}

@api_router.get("/teacher/vacation-days")
async def get_vacation_days(current_user: User = Depends(get_current_user)):
    """Get teacher's vacation days"""
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can view their vacation days")
    
    vacations_cursor = db.vacation_days.find(
        {"teacher_id": current_user.user_id},
        {"_id": 0}
    ).sort("date", 1)
    vacations = await vacations_cursor.to_list(length=100)
    
    return vacations

@api_router.delete("/teacher/vacation-days/{vacation_id}")
async def remove_vacation_day(
    vacation_id: str,
    current_user: User = Depends(get_current_user)
):
    """Remove a vacation day"""
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can remove vacation days")
    
    vacation = await db.vacation_days.find_one({"vacation_id": vacation_id})
    if not vacation:
        raise HTTPException(status_code=404, detail="Vacation day not found")
    
    if vacation["teacher_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Re-enable slots for this day
    date_start = f"{vacation['date']}T00:00:00"
    date_end = f"{vacation['date']}T23:59:59"
    
    await db.available_slots.update_many(
        {
            "teacher_id": current_user.user_id,
            "scheduled_time": {"$gte": date_start, "$lte": date_end},
            "vacation_blocked": True
        },
        {"$set": {"is_available": True}, "$unset": {"vacation_blocked": ""}}
    )
    
    await db.vacation_days.delete_one({"vacation_id": vacation_id})
    
    return {"message": "Vacation day removed"}

# ===== TEACHER SLOTS MANAGEMENT =====
@api_router.post("/teacher/slots")
async def add_teacher_slot(
    slot: SlotCreate,
    current_user: User = Depends(get_current_user)
):
    """Teacher adds a new available slot. Slot managers can add slots for other teachers."""
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can add slots")
    
    # Determine target teacher
    target_teacher_id = slot.teacher_id or current_user.user_id
    target_teacher_name = current_user.name
    
    # If adding for another teacher, check if current user is a slot manager
    if target_teacher_id != current_user.user_id:
        if current_user.email not in SLOT_MANAGERS_EMAILS:
            raise HTTPException(status_code=403, detail="غير مصرح لك بإضافة مواعيد لمعلمين آخرين")
        
        # Get target teacher info
        target_teacher = await db.users.find_one({"user_id": target_teacher_id, "role": "teacher"}, {"_id": 0})
        if not target_teacher:
            raise HTTPException(status_code=404, detail="المعلم غير موجود")
        target_teacher_name = target_teacher["name"]
    
    # Check if slot is in the past
    if slot.scheduled_time < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Cannot add slot in the past")
    
    # Check if slot already exists
    existing = await db.available_slots.find_one({
        "teacher_id": target_teacher_id,
        "scheduled_time": slot.scheduled_time.isoformat()
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="هذا الموعد موجود بالفعل")
    
    slot_id = f"slot_{uuid.uuid4().hex[:12]}"
    slot_data = {
        "slot_id": slot_id,
        "teacher_id": target_teacher_id,
        "teacher_name": target_teacher_name,
        "scheduled_time": slot.scheduled_time.isoformat(),
        "duration": slot.duration,
        "is_available": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.user_id  # Track who created the slot
    }
    
    await db.available_slots.insert_one(slot_data)
    
    # Remove MongoDB _id before returning (not JSON serializable)
    slot_data.pop("_id", None)
    
    return {"message": "Slot added", "slot_id": slot_id, "slot": slot_data}

@api_router.delete("/teacher/slots/{slot_id}")
async def delete_teacher_slot(
    slot_id: str,
    current_user: User = Depends(get_current_user)
):
    """Teacher deletes an available slot. Slot managers can delete any teacher's slots."""
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can delete slots")
    
    slot = await db.available_slots.find_one({"slot_id": slot_id})
    
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    
    # Allow if it's own slot OR if user is a slot manager
    is_own_slot = slot["teacher_id"] == current_user.user_id
    is_slot_manager = current_user.email in SLOT_MANAGERS_EMAILS
    
    if not is_own_slot and not is_slot_manager:
        raise HTTPException(status_code=403, detail="غير مصرح لك بحذف هذا الموعد")
    
    if not slot.get("is_available", True):
        raise HTTPException(status_code=400, detail="لا يمكن حذف موعد محجوز")
    
    await db.available_slots.delete_one({"slot_id": slot_id})
    
    return {"message": "Slot deleted"}

# ===== BOOKING RESTRICTIONS =====
@api_router.post("/teacher/restrict-student")
async def restrict_student(
    restriction: StudentRestriction,
    current_user: User = Depends(get_current_user)
):
    """Teacher restricts a student from booking"""
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can restrict students")
    
    # Check if student exists
    student = await db.users.find_one({"user_id": restriction.student_id})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    restriction_id = f"restr_{uuid.uuid4().hex[:12]}"
    await db.booking_restrictions.insert_one({
        "restriction_id": restriction_id,
        "teacher_id": current_user.user_id,
        "teacher_name": current_user.name,
        "student_id": restriction.student_id,
        "student_name": student["name"],
        "reason": restriction.reason,
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    # Notify the student
    await db.notifications.insert_one({
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": restriction.student_id,
        "type": "booking_restricted",
        "title": "تقييد الحجز",
        "message": f"تم تقييد حجوزاتك عند الشيخ {current_user.name}. السبب: {restriction.reason}",
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": "Student restricted", "restriction_id": restriction_id}

@api_router.delete("/teacher/restrict-student/{student_id}")
async def remove_student_restriction(
    student_id: str,
    current_user: User = Depends(get_current_user)
):
    """Teacher removes restriction from a student"""
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can remove restrictions")
    
    result = await db.booking_restrictions.update_one(
        {
            "teacher_id": current_user.user_id,
            "student_id": student_id,
            "active": True
        },
        {"$set": {"active": False, "removed_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="No active restriction found")
    
    # Notify the student
    await db.notifications.insert_one({
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": student_id,
        "type": "booking_unrestricted",
        "title": "رفع تقييد الحجز",
        "message": f"تم رفع تقييد الحجز عنك عند الشيخ {current_user.name}",
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": "Restriction removed"}

@api_router.get("/teacher/restricted-students")
async def get_restricted_students(current_user: User = Depends(get_current_user)):
    """Get list of restricted students for this teacher"""
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can view restrictions")
    
    restrictions_cursor = db.booking_restrictions.find(
        {"teacher_id": current_user.user_id, "active": True},
        {"_id": 0}
    )
    restrictions = await restrictions_cursor.to_list(length=100)
    
    return restrictions

# ============================================================
# ===== WEEKLY COMMITMENT & WARNINGS SYSTEM =====
# Each student sets a weekly minimum (sessions + memorization entries / "pages").
# Every completed week is evaluated lazily. If student misses both minimums OR
# either minimum (configurable: we require BOTH met), a warning is generated.
# 3 warnings within 3 months → user.is_frozen=True (blocked from booking).
# Only admin can unfreeze.
# ============================================================

class CommitmentSettings(BaseModel):
    min_sessions_per_week: int
    min_pages_per_week: int

def _week_bounds(reference: datetime):
    """Return (monday_start_utc, sunday_end_utc) for the ISO week containing reference (UTC)."""
    ref = reference.astimezone(timezone.utc)
    monday = (ref - timedelta(days=ref.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    sunday_end = monday + timedelta(days=7)
    return monday, sunday_end

async def _evaluate_weekly_commitments(student_id: str):
    """
    Lazily evaluate all complete weeks since the student set their commitment,
    creating warnings as needed and freezing the user if 3+ warnings in last 3 months.
    Idempotent: re-running won't duplicate warnings for the same week.
    """
    commitment = await db.student_commitments.find_one({"student_id": student_id}, {"_id": 0})
    if not commitment:
        return  # No commitment set yet — nothing to evaluate
    min_sessions = max(1, int(commitment.get("min_sessions_per_week", 1)))
    min_pages = max(1, int(commitment.get("min_pages_per_week", 1)))

    # Determine evaluation start: from commitment created_at OR last week_end already evaluated
    created_at_str = commitment.get("created_at")
    try:
        created_at = datetime.fromisoformat(created_at_str.replace('Z', '+00:00')) if created_at_str else datetime.now(timezone.utc)
    except Exception:
        created_at = datetime.now(timezone.utc)
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    # Find latest already-evaluated week_end for this student
    last_eval = await db.student_warnings_eval.find_one({"student_id": student_id}, {"_id": 0})
    cursor_start = created_at
    if last_eval and last_eval.get("last_week_end"):
        try:
            cursor_start = datetime.fromisoformat(last_eval["last_week_end"].replace('Z', '+00:00'))
        except Exception:
            pass
        if cursor_start.tzinfo is None:
            cursor_start = cursor_start.replace(tzinfo=timezone.utc)

    now = datetime.now(timezone.utc)
    monday_start, _ = _week_bounds(cursor_start)
    # We evaluate weeks that have fully ended (week_end <= now)
    current_monday, _ = _week_bounds(now)

    # Load holiday weeks once — these are admin-declared exempt weeks
    holiday_rows = await db.commitment_holidays.find({}, {"_id": 0, "week_start": 1}).to_list(length=500)
    holiday_weeks = {h.get("week_start") for h in holiday_rows if h.get("week_start")}

    week_start = monday_start
    last_evaluated_end = None
    while True:
        week_end = week_start + timedelta(days=7)
        if week_end > current_monday:  # current week not over yet
            break

        # Skip weeks marked as holidays — no warning, no evaluation
        if week_start.isoformat() in holiday_weeks:
            last_evaluated_end = week_end
            week_start = week_end
            continue

        # Count attended sessions in this week
        # Attended = status "scheduled" or "completed" with attendance_confirmed True, scheduled_time within [week_start, week_end)
        sessions_done = await db.sessions.count_documents({
            "student_id": student_id,
            "scheduled_time": {"$gte": week_start.isoformat(), "$lt": week_end.isoformat()},
            "attendance_confirmed": True
        })
        # Count memorization entries (proxy for pages)
        pages_done = await db.memorization_progress.count_documents({
            "student_id": student_id,
            "created_at": {"$gte": week_start.isoformat(), "$lt": week_end.isoformat()}
        })

        # If student fails ANY minimum, create a warning (one per week, idempotent)
        if sessions_done < min_sessions or pages_done < min_pages:
            existing = await db.student_warnings.find_one({
                "student_id": student_id,
                "week_start": week_start.isoformat()
            }, {"_id": 0})
            if not existing:
                reasons = []
                if sessions_done < min_sessions:
                    reasons.append(f"الجلسات: {sessions_done}/{min_sessions}")
                if pages_done < min_pages:
                    reasons.append(f"الصفحات: {pages_done}/{min_pages}")
                await db.student_warnings.insert_one({
                    "warning_id": f"warn_{uuid.uuid4().hex[:12]}",
                    "student_id": student_id,
                    "week_start": week_start.isoformat(),
                    "week_end": week_end.isoformat(),
                    "sessions_done": sessions_done,
                    "pages_done": pages_done,
                    "required_sessions": min_sessions,
                    "required_pages": min_pages,
                    "reason": "لم يحقق الحد الأدنى الأسبوعي - " + " / ".join(reasons),
                    "created_at": datetime.now(timezone.utc).isoformat()
                })

        last_evaluated_end = week_end
        week_start = week_end

    # Update last_eval marker
    if last_evaluated_end:
        await db.student_warnings_eval.update_one(
            {"student_id": student_id},
            {"$set": {"student_id": student_id, "last_week_end": last_evaluated_end.isoformat()}},
            upsert=True
        )

    # Freeze if 3+ warnings in last 3 months, but only count warnings created
    # AFTER the latest admin reset (warning_reset_at). This allows admin to unfreeze
    # without immediately re-freezing on the next evaluation.
    three_months_ago = (now - timedelta(days=90)).isoformat()
    user_doc_for_reset = await db.users.find_one(
        {"user_id": student_id},
        {"_id": 0, "is_frozen": 1, "warning_reset_at": 1}
    )
    reset_at = (user_doc_for_reset or {}).get("warning_reset_at")
    count_filter = {
        "student_id": student_id,
        "created_at": {"$gte": three_months_ago}
    }
    if reset_at:
        count_filter["created_at"]["$gt"] = reset_at
    warn_count = await db.student_warnings.count_documents(count_filter)
    if warn_count >= 3:
        if not user_doc_for_reset or not user_doc_for_reset.get("is_frozen"):
            await db.users.update_one(
                {"user_id": student_id},
                {"$set": {
                    "is_frozen": True,
                    "frozen_at": datetime.now(timezone.utc).isoformat(),
                    "frozen_reason": f"تجاوز {warn_count} إنذارات خلال 3 أشهر"
                }}
            )
            # Notify the student
            await db.notifications.insert_one({
                "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
                "user_id": student_id,
                "type": "account_frozen",
                "title": "تم تقييد حسابك",
                "message": "تم تجميد حسابك مؤقتاً بسبب تجاوز عدد الإنذارات الأسبوعية. لا يمكنك حجز جلسات جديدة. يرجى التواصل مع إدارة المقرأة.",
                "read": False,
                "created_at": datetime.now(timezone.utc).isoformat()
            })


@api_router.get("/student/commitment")
async def get_student_commitment(current_user: User = Depends(get_current_user)):
    """Get the current student's weekly commitment + warnings summary + frozen state."""
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="للطلاب فقط")

    # Lazy evaluation
    await _evaluate_weekly_commitments(current_user.user_id)

    commitment = await db.student_commitments.find_one({"student_id": current_user.user_id}, {"_id": 0})
    three_months_ago = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    warnings_cursor = db.student_warnings.find(
        {"student_id": current_user.user_id, "created_at": {"$gte": three_months_ago}},
        {"_id": 0}
    ).sort("created_at", -1)
    warnings = await warnings_cursor.to_list(length=100)

    user_doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0, "is_frozen": 1, "frozen_reason": 1, "frozen_at": 1})

    return {
        "commitment": commitment or {"min_sessions_per_week": 0, "min_pages_per_week": 0},
        "warnings": warnings,
        "warning_count_3m": len(warnings),
        "is_frozen": bool(user_doc.get("is_frozen")) if user_doc else False,
        "frozen_reason": (user_doc or {}).get("frozen_reason"),
        "frozen_at": (user_doc or {}).get("frozen_at")
    }


@api_router.put("/student/commitment")
async def set_student_commitment(
    data: CommitmentSettings,
    current_user: User = Depends(get_current_user)
):
    """Set or update the current student's weekly commitment. Minimum 1/1."""
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="للطلاب فقط")
    if data.min_sessions_per_week < 1:
        raise HTTPException(status_code=400, detail="الحد الأدنى للجلسات الأسبوعية هو 1")
    if data.min_pages_per_week < 1:
        raise HTTPException(status_code=400, detail="الحد الأدنى للصفحات الأسبوعية هو 1")

    existing = await db.student_commitments.find_one({"student_id": current_user.user_id}, {"_id": 0})
    now_iso = datetime.now(timezone.utc).isoformat()
    if existing:
        await db.student_commitments.update_one(
            {"student_id": current_user.user_id},
            {"$set": {
                "min_sessions_per_week": data.min_sessions_per_week,
                "min_pages_per_week": data.min_pages_per_week,
                "updated_at": now_iso
            }}
        )
    else:
        await db.student_commitments.insert_one({
            "student_id": current_user.user_id,
            "min_sessions_per_week": data.min_sessions_per_week,
            "min_pages_per_week": data.min_pages_per_week,
            "created_at": now_iso,
            "updated_at": now_iso
        })

    return {"message": "تم حفظ الالتزام الأسبوعي بنجاح"}


@api_router.get("/admin/frozen-students")
async def list_frozen_students(current_user: User = Depends(get_current_user)):
    """List all frozen students with their warning history. Admin only."""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Admin only")

    users_cursor = db.users.find(
        {"role": "student", "is_frozen": True},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "picture": 1, "is_frozen": 1, "frozen_reason": 1, "frozen_at": 1}
    )
    frozen = await users_cursor.to_list(length=200)

    three_months_ago = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    for u in frozen:
        u["warning_count_3m"] = await db.student_warnings.count_documents({
            "student_id": u["user_id"],
            "created_at": {"$gte": three_months_ago}
        })
    return frozen


@api_router.get("/teacher/pending-evaluations")
async def get_pending_evaluations(current_user: User = Depends(get_current_user)):
    """
    Return sessions where current teacher attended the student (attendance_confirmed=True)
    but no rating AND no instructor_notes were added yet. Used to force evaluation.
    """
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="للمعلمين فقط")
    
    now = datetime.now(timezone.utc)
    # Look back up to 30 days to keep the popup focused
    lookback = (now - timedelta(days=30)).isoformat()
    
    pending_cursor = db.sessions.find({
        "teacher_id": current_user.user_id,
        "attendance_confirmed": True,
        "scheduled_time": {"$gte": lookback, "$lte": now.isoformat()},
        "rating": {"$in": [None, ""]},
        "instructor_notes": {"$exists": False}
    }, {
        "_id": 0,
        "session_id": 1, "student_id": 1, "student_name": 1,
        "scheduled_time": 1, "duration": 1
    }).sort("scheduled_time", -1)
    
    pending = await pending_cursor.to_list(length=200)
    return pending


@api_router.get("/teacher/all-students-commitments")
async def get_all_students_commitments(current_user: User = Depends(get_current_user)):
    """
    Teacher/Admin: list all students with their commitment, current-week progress,
    warning count and freeze status. Used for the overview screen.
    """
    if current_user.role != "teacher" and current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="غير مصرح")

    students = await db.users.find(
        {"role": "student"},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "picture": 1, "is_frozen": 1, "frozen_reason": 1}
    ).to_list(length=2000)

    now = datetime.now(timezone.utc)
    monday_start, sunday_end = _week_bounds(now)
    three_months_ago = (now - timedelta(days=90)).isoformat()
    result = []
    for s in students:
        sid = s["user_id"]
        # lazy eval
        await _evaluate_weekly_commitments(sid)
        commitment = await db.student_commitments.find_one({"student_id": sid}, {"_id": 0})
        sessions_done = await db.sessions.count_documents({
            "student_id": sid,
            "scheduled_time": {"$gte": monday_start.isoformat(), "$lt": sunday_end.isoformat()},
            "attendance_confirmed": True
        })
        pages_done = await db.memorization_progress.count_documents({
            "student_id": sid,
            "created_at": {"$gte": monday_start.isoformat(), "$lt": sunday_end.isoformat()}
        })
        warning_count = await db.student_warnings.count_documents({
            "student_id": sid,
            "created_at": {"$gte": three_months_ago}
        })
        # refresh frozen state
        user_doc = await db.users.find_one({"user_id": sid}, {"_id": 0, "is_frozen": 1, "frozen_reason": 1})
        result.append({
            "student_id": sid,
            "name": s.get("name"),
            "email": s.get("email"),
            "picture": s.get("picture"),
            "commitment": commitment,
            "current_week": {
                "sessions_done": sessions_done,
                "pages_done": pages_done
            },
            "warning_count_3m": warning_count,
            "is_frozen": bool((user_doc or {}).get("is_frozen")),
            "frozen_reason": (user_doc or {}).get("frozen_reason")
        })
    # Sort: frozen first, then by warning count desc, then by missing commitment
    result.sort(key=lambda x: (
        not x["is_frozen"],
        -x["warning_count_3m"],
        0 if x["commitment"] else 1
    ))
    return result


@api_router.get("/teacher/student-commitment/{student_id}")
async def get_student_commitment_status(
    student_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Teacher/Admin: get a student's weekly commitment + current-week progress + warnings + freeze.
    Visible to any teacher (or admin).
    """
    if current_user.role not in ("teacher",) and current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="غير مصرح")

    # Ensure lazy evaluation
    await _evaluate_weekly_commitments(student_id)

    commitment = await db.student_commitments.find_one({"student_id": student_id}, {"_id": 0})
    three_months_ago = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    warnings_cursor = db.student_warnings.find(
        {"student_id": student_id, "created_at": {"$gte": three_months_ago}},
        {"_id": 0}
    ).sort("created_at", -1)
    warnings = await warnings_cursor.to_list(length=100)

    user_doc = await db.users.find_one(
        {"user_id": student_id},
        {"_id": 0, "name": 1, "is_frozen": 1, "frozen_reason": 1, "frozen_at": 1}
    )

    # Compute current-week progress
    now = datetime.now(timezone.utc)
    monday_start, sunday_end = _week_bounds(now)
    sessions_this_week = await db.sessions.count_documents({
        "student_id": student_id,
        "scheduled_time": {"$gte": monday_start.isoformat(), "$lt": sunday_end.isoformat()},
        "attendance_confirmed": True
    })
    pages_this_week = await db.memorization_progress.count_documents({
        "student_id": student_id,
        "created_at": {"$gte": monday_start.isoformat(), "$lt": sunday_end.isoformat()}
    })

    return {
        "student": user_doc,
        "commitment": commitment,
        "current_week": {
            "week_start": monday_start.isoformat(),
            "week_end": sunday_end.isoformat(),
            "sessions_done": sessions_this_week,
            "pages_done": pages_this_week
        },
        "warnings": warnings,
        "warning_count_3m": len(warnings)
    }


@api_router.get("/admin/student-warnings/{student_id}")
async def get_admin_student_warnings(
    student_id: str,
    current_user: User = Depends(get_current_user)
):
    """Admin: get a single student's commitment & warnings summary."""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Admin only")
    await _evaluate_weekly_commitments(student_id)
    commitment = await db.student_commitments.find_one({"student_id": student_id}, {"_id": 0})
    three_months_ago = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    warnings_cursor = db.student_warnings.find(
        {"student_id": student_id, "created_at": {"$gte": three_months_ago}},
        {"_id": 0}
    ).sort("created_at", -1)
    warnings = await warnings_cursor.to_list(length=100)
    user_doc = await db.users.find_one({"user_id": student_id}, {"_id": 0, "name": 1, "is_frozen": 1, "frozen_reason": 1, "frozen_at": 1})

    return {
        "student": user_doc,
        "commitment": commitment,
        "warnings": warnings,
        "warning_count_3m": len(warnings)
    }


@api_router.delete("/admin/student-freeze/{student_id}")
async def unfreeze_student(
    student_id: str,
    current_user: User = Depends(get_current_user)
):
    """Admin: remove freeze/restriction from a student."""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Admin only")

    user = await db.users.find_one({"user_id": student_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")

    await db.users.update_one(
        {"user_id": student_id},
        {"$set": {
            "is_frozen": False,
            "unfrozen_at": datetime.now(timezone.utc).isoformat(),
            "unfrozen_by": current_user.user_id,
            "warning_reset_at": datetime.now(timezone.utc).isoformat()
         },
         "$unset": {"frozen_at": "", "frozen_reason": ""}}
    )
    # Reset eval cursor so future weeks start fresh
    await db.student_warnings_eval.update_one(
        {"student_id": student_id},
        {"$set": {"last_week_end": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    # Notify
    await db.notifications.insert_one({
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": student_id,
        "type": "account_unfrozen",
        "title": "تم رفع التقييد عن حسابك",
        "message": "قامت إدارة المقرأة برفع التجميد عن حسابك. يمكنك الآن حجز الجلسات.",
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    return {"message": "تم رفع التقييد عن الطالب"}


@api_router.delete("/admin/student-warnings/{warning_id}")
async def delete_student_warning(
    warning_id: str,
    current_user: User = Depends(get_current_user)
):
    """Admin-only: manually delete a student warning that was issued by mistake.
    After deletion, re-counts warnings within last 3 months and unfreezes the
    student automatically if the count drops below 3.
    """
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="حذف الإنذارات للمشرف فقط")

    w = await db.student_warnings.find_one({"warning_id": warning_id}, {"_id": 0})
    if not w:
        raise HTTPException(status_code=404, detail="الإنذار غير موجود")

    sid = w.get("student_id")
    await db.student_warnings.delete_one({"warning_id": warning_id})

    # Re-evaluate freeze state for this student
    now = datetime.now(timezone.utc)
    three_months_ago = (now - timedelta(days=90)).isoformat()
    user_doc = await db.users.find_one(
        {"user_id": sid}, {"_id": 0, "is_frozen": 1, "warning_reset_at": 1}
    )
    reset_at = (user_doc or {}).get("warning_reset_at")
    count_filter = {"student_id": sid, "created_at": {"$gte": three_months_ago}}
    if reset_at:
        count_filter["created_at"]["$gt"] = reset_at
    warn_count = await db.student_warnings.count_documents(count_filter)

    if warn_count < 3 and user_doc and user_doc.get("is_frozen"):
        await db.users.update_one(
            {"user_id": sid},
            {"$set": {
                "is_frozen": False,
                "unfrozen_at": now.isoformat(),
                "unfrozen_by": current_user.user_id,
                "warning_reset_at": now.isoformat(),
            },
             "$unset": {"frozen_at": "", "frozen_reason": ""}}
        )
        # Notify
        await db.notifications.insert_one({
            "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
            "user_id": sid,
            "type": "account_unfrozen",
            "title": "تم رفع التقييد عن حسابك",
            "message": "قامت إدارة المقرأة برفع التجميد عن حسابك بعد حذف إنذار. يمكنك الآن حجز الجلسات.",
            "read": False,
            "created_at": now.isoformat()
        })

    return {"message": "تم حذف الإنذار", "remaining_warnings_3m": warn_count}


# ============================================================
# ===== COMMITMENT HOLIDAY WEEKS (admin can exempt weeks) =====
# When a holiday is declared for a week, the weekly commitment
# evaluation skips that week — no warning issued.
# ============================================================

class CommitmentHolidayPayload(BaseModel):
    week_start: str  # ISO date (Monday) e.g. "2026-02-23"
    reason: Optional[str] = ""


@api_router.get("/admin/commitment-holidays")
async def list_commitment_holidays(current_user: User = Depends(get_current_user)):
    """Admin-only: list weeks marked as holidays (warnings skipped)."""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="للمشرف فقط")
    items = await db.commitment_holidays.find({}, {"_id": 0}).sort("week_start", -1).to_list(length=200)
    return items


@api_router.post("/admin/commitment-holidays")
async def add_commitment_holiday(
    payload: CommitmentHolidayPayload,
    current_user: User = Depends(get_current_user)
):
    """Admin-only: declare a week as a holiday (no warnings)."""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="للمشرف فقط")
    # Normalize to ISO week-start (Monday). Accept the date provided as-is if valid ISO date.
    try:
        d = datetime.fromisoformat(payload.week_start)
    except Exception:
        raise HTTPException(status_code=400, detail="تاريخ غير صالح (yyyy-mm-dd)")
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    monday, _ = _week_bounds(d)
    week_start_iso = monday.isoformat()
    existing = await db.commitment_holidays.find_one({"week_start": week_start_iso}, {"_id": 0})
    if existing:
        return {"message": "هذا الأسبوع معطّل سابقاً", "holiday_id": existing.get("holiday_id")}
    hid = f"hol_{uuid.uuid4().hex[:12]}"
    await db.commitment_holidays.insert_one({
        "holiday_id": hid,
        "week_start": week_start_iso,
        "reason": payload.reason or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.user_id,
    })
    return {"message": "تم تعطيل احتساب الإنذارات لهذا الأسبوع", "holiday_id": hid}


@api_router.delete("/admin/commitment-holidays/{holiday_id}")
async def delete_commitment_holiday(
    holiday_id: str,
    current_user: User = Depends(get_current_user)
):
    """Admin-only: remove a holiday week (warnings will resume for that week)."""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="للمشرف فقط")
    res = await db.commitment_holidays.delete_one({"holiday_id": holiday_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="غير موجود")
    return {"message": "تم حذف العطلة"}



# ============================================================
# ===== COMPETITIONS (QUIZZES) — PHASE 1: MANAGEMENT ONLY =====
# Teachers/admins create competitions and add multiple-choice questions.
# Live game play / scoring is out of scope for Phase 1.
# ============================================================

class CompetitionPayload(BaseModel):
    title: str
    description: Optional[str] = ""
    category: Optional[str] = ""
    level: Optional[str] = ""
    status: Optional[str] = "draft"  # draft | published

class QuestionPayload(BaseModel):
    question_text: str
    options: List[str]
    correct_index: int
    time_limit: int = 30  # seconds
    points: int = 100


def _require_teacher_or_admin(current_user: User):
    if current_user.role != "teacher" and current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="للمعلمين والمشرفين فقط")


@api_router.get("/competitions")
async def list_competitions(current_user: User = Depends(get_current_user)):
    """List all competitions with question counts."""
    _require_teacher_or_admin(current_user)
    items = await db.competitions.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=500)
    for c in items:
        c["question_count"] = await db.competition_questions.count_documents({"competition_id": c["competition_id"]})
    return items


@api_router.post("/competitions")
async def create_competition(payload: CompetitionPayload, current_user: User = Depends(get_current_user)):
    _require_teacher_or_admin(current_user)
    if not payload.title or not payload.title.strip():
        raise HTTPException(status_code=400, detail="العنوان مطلوب")
    if payload.status not in ("draft", "published"):
        raise HTTPException(status_code=400, detail="الحالة غير صحيحة")
    cid = f"comp_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "competition_id": cid,
        "title": payload.title.strip(),
        "description": (payload.description or "").strip(),
        "category": (payload.category or "").strip(),
        "level": (payload.level or "").strip(),
        "status": payload.status,
        "created_by": current_user.user_id,
        "created_by_name": current_user.name,
        "created_at": now,
        "updated_at": now,
    }
    await db.competitions.insert_one(doc)
    doc.pop("_id", None)
    doc["question_count"] = 0
    return doc


@api_router.get("/competitions/{competition_id}")
async def get_competition(competition_id: str, current_user: User = Depends(get_current_user)):
    """Full competition with ordered questions."""
    _require_teacher_or_admin(current_user)
    comp = await db.competitions.find_one({"competition_id": competition_id}, {"_id": 0})
    if not comp:
        raise HTTPException(status_code=404, detail="المسابقة غير موجودة")
    questions = await db.competition_questions.find(
        {"competition_id": competition_id}, {"_id": 0}
    ).sort("order", 1).to_list(length=500)
    comp["questions"] = questions
    return comp


@api_router.put("/competitions/{competition_id}")
async def update_competition(
    competition_id: str,
    payload: CompetitionPayload,
    current_user: User = Depends(get_current_user)
):
    _require_teacher_or_admin(current_user)
    comp = await db.competitions.find_one({"competition_id": competition_id}, {"_id": 0})
    if not comp:
        raise HTTPException(status_code=404, detail="المسابقة غير موجودة")
    if not payload.title or not payload.title.strip():
        raise HTTPException(status_code=400, detail="العنوان مطلوب")
    if payload.status not in ("draft", "published"):
        raise HTTPException(status_code=400, detail="الحالة غير صحيحة")
    await db.competitions.update_one(
        {"competition_id": competition_id},
        {"$set": {
            "title": payload.title.strip(),
            "description": (payload.description or "").strip(),
            "category": (payload.category or "").strip(),
            "level": (payload.level or "").strip(),
            "status": payload.status,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    return {"message": "تم التحديث"}


@api_router.delete("/competitions/{competition_id}")
async def delete_competition(competition_id: str, current_user: User = Depends(get_current_user)):
    _require_teacher_or_admin(current_user)
    await db.competition_questions.delete_many({"competition_id": competition_id})
    res = await db.competitions.delete_one({"competition_id": competition_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="المسابقة غير موجودة")
    return {"message": "تم الحذف"}


def _validate_question(payload: QuestionPayload):
    if not payload.question_text or not payload.question_text.strip():
        raise HTTPException(status_code=400, detail="نص السؤال مطلوب")
    if not payload.options or len(payload.options) < 2:
        raise HTTPException(status_code=400, detail="يجب إضافة خيارين على الأقل")
    if any(not o or not o.strip() for o in payload.options):
        raise HTTPException(status_code=400, detail="جميع الخيارات يجب أن تحتوي على نص")
    if payload.correct_index < 0 or payload.correct_index >= len(payload.options):
        raise HTTPException(status_code=400, detail="يجب اختيار إجابة صحيحة")
    if payload.time_limit < 5 or payload.time_limit > 300:
        raise HTTPException(status_code=400, detail="مدة السؤال بين 5 و 300 ثانية")
    if payload.points < 1 or payload.points > 10000:
        raise HTTPException(status_code=400, detail="النقاط بين 1 و 10000")


@api_router.post("/competitions/{competition_id}/questions")
async def add_question(
    competition_id: str,
    payload: QuestionPayload,
    current_user: User = Depends(get_current_user)
):
    _require_teacher_or_admin(current_user)
    comp = await db.competitions.find_one({"competition_id": competition_id}, {"_id": 0})
    if not comp:
        raise HTTPException(status_code=404, detail="المسابقة غير موجودة")
    if comp.get("status") == "published":
        raise HTTPException(status_code=400, detail="لا يمكن تعديل مسابقة منشورة، أعدها إلى مسودة أولاً")
    _validate_question(payload)

    existing_count = await db.competition_questions.count_documents({"competition_id": competition_id})
    qid = f"q_{uuid.uuid4().hex[:12]}"
    doc = {
        "question_id": qid,
        "competition_id": competition_id,
        "question_text": payload.question_text.strip(),
        "options": [o.strip() for o in payload.options],
        "correct_index": payload.correct_index,
        "time_limit": payload.time_limit,
        "points": payload.points,
        "order": existing_count,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.competition_questions.insert_one(doc)
    await db.competitions.update_one(
        {"competition_id": competition_id},
        {"$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    doc.pop("_id", None)
    return doc


@api_router.put("/competitions/{competition_id}/questions/{question_id}")
async def update_question(
    competition_id: str,
    question_id: str,
    payload: QuestionPayload,
    current_user: User = Depends(get_current_user)
):
    _require_teacher_or_admin(current_user)
    comp = await db.competitions.find_one({"competition_id": competition_id}, {"_id": 0})
    if not comp:
        raise HTTPException(status_code=404, detail="المسابقة غير موجودة")
    if comp.get("status") == "published":
        raise HTTPException(status_code=400, detail="لا يمكن تعديل مسابقة منشورة، أعدها إلى مسودة أولاً")
    _validate_question(payload)
    res = await db.competition_questions.update_one(
        {"competition_id": competition_id, "question_id": question_id},
        {"$set": {
            "question_text": payload.question_text.strip(),
            "options": [o.strip() for o in payload.options],
            "correct_index": payload.correct_index,
            "time_limit": payload.time_limit,
            "points": payload.points,
        }}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="السؤال غير موجود")
    await db.competitions.update_one(
        {"competition_id": competition_id},
        {"$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "تم التحديث"}


@api_router.delete("/competitions/{competition_id}/questions/{question_id}")
async def delete_question(
    competition_id: str,
    question_id: str,
    current_user: User = Depends(get_current_user)
):
    _require_teacher_or_admin(current_user)
    comp = await db.competitions.find_one({"competition_id": competition_id}, {"_id": 0})
    if not comp:
        raise HTTPException(status_code=404, detail="المسابقة غير موجودة")
    if comp.get("status") == "published":
        raise HTTPException(status_code=400, detail="لا يمكن تعديل مسابقة منشورة، أعدها إلى مسودة أولاً")
    res = await db.competition_questions.delete_one({"competition_id": competition_id, "question_id": question_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="السؤال غير موجود")
    # Re-number the order
    remaining = await db.competition_questions.find(
        {"competition_id": competition_id}, {"_id": 0, "question_id": 1, "order": 1}
    ).sort("order", 1).to_list(length=500)
    for idx, q in enumerate(remaining):
        if q["order"] != idx:
            await db.competition_questions.update_one(
                {"question_id": q["question_id"]}, {"$set": {"order": idx}}
            )
    return {"message": "تم الحذف"}


# ============================================================
# ===== COMPETITIONS LIVE SESSIONS — PHASE 2: JOIN FLOW =====
# Teacher/admin starts a live session of a PUBLISHED competition.
# A short 6-digit PIN/join code is generated. Students enter the
# code to join a waiting room. Teacher/admin can then begin the
# competition. Question answering/scoring is NOT in this phase.
# ============================================================

class JoinLivePayload(BaseModel):
    join_code: str


async def _generate_unique_join_code() -> str:
    """Generate a 6-digit numeric code unique among active live sessions."""
    import secrets
    for _ in range(30):
        code = f"{secrets.randbelow(1000000):06d}"
        existing = await db.competition_live_sessions.find_one(
            {"join_code": code, "status": {"$in": ["waiting", "in_progress"]}},
            {"_id": 0, "live_id": 1}
        )
        if not existing:
            return code
    raise HTTPException(status_code=500, detail="تعذّر توليد كود فريد، حاول مرة أخرى")


@api_router.post("/competitions/{competition_id}/live/start")
async def start_live_competition(
    competition_id: str,
    current_user: User = Depends(get_current_user)
):
    """Teacher/admin starts a live session of a published competition."""
    _require_teacher_or_admin(current_user)
    comp = await db.competitions.find_one({"competition_id": competition_id}, {"_id": 0})
    if not comp:
        raise HTTPException(status_code=404, detail="المسابقة غير موجودة")
    if comp.get("status") != "published":
        raise HTTPException(status_code=400, detail="يجب نشر المسابقة أولاً قبل بدء جلسة مباشرة")
    qc = await db.competition_questions.count_documents({"competition_id": competition_id})
    if qc < 1:
        raise HTTPException(status_code=400, detail="لا توجد أسئلة في هذه المسابقة")

    code = await _generate_unique_join_code()
    live_id = f"live_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "live_id": live_id,
        "competition_id": competition_id,
        "competition_title": comp["title"],
        "join_code": code,
        "host_id": current_user.user_id,
        "host_name": current_user.name,
        "status": "waiting",  # waiting | in_progress | completed | ended
        "created_at": now,
        "started_at": None,
        "ended_at": None,
        "participants": [],
        "total_questions": qc,
        "current_question_index": -1,
        "current_question_id": None,
        "question_started_at": None,
    }
    await db.competition_live_sessions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/competitions/live/{live_id}")
async def get_live_session(live_id: str, current_user: User = Depends(get_current_user)):
    """Get live session state. Accessible to host, admin, or joined participants.
    For in_progress sessions, embeds the current question (sanitized for students)."""
    sess = await db.competition_live_sessions.find_one({"live_id": live_id}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="الجلسة غير موجودة")
    is_host = sess["host_id"] == current_user.user_id or current_user.email == ADMIN_EMAIL
    is_participant = any(p.get("user_id") == current_user.user_id for p in sess.get("participants", []))
    if not is_host and not is_participant:
        raise HTTPException(status_code=403, detail="غير مصرح لك بعرض هذه الجلسة")

    # Enrich with current question (Phase 3)
    sess["current_question"] = None
    sess["my_answer"] = None
    if sess.get("status") == "in_progress" and sess.get("current_question_id"):
        q = await db.competition_questions.find_one(
            {"question_id": sess["current_question_id"]}, {"_id": 0}
        )
        if q:
            if not is_host:
                # Strip correct answer for students
                q.pop("correct_index", None)
            sess["current_question"] = q
            # Surface this student's existing answer (if any) so the UI can lock the choice
            if not is_host:
                existing = await db.competition_live_answers.find_one(
                    {"live_id": live_id, "question_id": q["question_id"], "user_id": current_user.user_id},
                    {"_id": 0, "selected_index": 1, "submitted_at": 1, "is_correct": 1, "points_earned": 1}
                )
                sess["my_answer"] = existing
    return sess


@api_router.post("/competitions/live/join")
async def join_live_session(
    payload: JoinLivePayload,
    current_user: User = Depends(get_current_user)
):
    """Student joins a live session using a 6-digit code."""
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="الانضمام للمسابقات متاح للطلاب فقط")
    code = (payload.join_code or "").strip()
    if not code or len(code) != 6 or not code.isdigit():
        raise HTTPException(status_code=400, detail="الكود يجب أن يكون 6 أرقام")

    sess = await db.competition_live_sessions.find_one({"join_code": code}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="الكود غير صحيح")
    status_ = sess.get("status")
    if status_ == "in_progress":
        raise HTTPException(status_code=400, detail="المسابقة بدأت بالفعل، لا يمكن الانضمام الآن")
    if status_ == "completed":
        raise HTTPException(status_code=400, detail="هذه المسابقة منتهية بالفعل")
    if status_ == "ended":
        raise HTTPException(status_code=400, detail="هذه الجلسة منتهية")
    if status_ != "waiting":
        raise HTTPException(status_code=400, detail="حالة الجلسة لا تسمح بالانضمام")

    # Idempotent join
    already = any(p.get("user_id") == current_user.user_id for p in sess.get("participants", []))
    if not already:
        new_participant = {
            "user_id": current_user.user_id,
            "name": current_user.name,
            "joined_at": datetime.now(timezone.utc).isoformat()
        }
        await db.competition_live_sessions.update_one(
            {"live_id": sess["live_id"]},
            {"$push": {"participants": new_participant}}
        )
    updated = await db.competition_live_sessions.find_one({"live_id": sess["live_id"]}, {"_id": 0})
    return updated


@api_router.post("/competitions/live/{live_id}/leave")
async def leave_live_session(live_id: str, current_user: User = Depends(get_current_user)):
    """Student leaves the waiting room."""
    sess = await db.competition_live_sessions.find_one({"live_id": live_id}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="الجلسة غير موجودة")
    if sess.get("status") == "ended":
        return {"message": "الجلسة منتهية"}
    await db.competition_live_sessions.update_one(
        {"live_id": live_id},
        {"$pull": {"participants": {"user_id": current_user.user_id}}}
    )
    return {"message": "تم الخروج من الجلسة"}


@api_router.post("/competitions/live/{live_id}/begin")
async def begin_live_session(live_id: str, current_user: User = Depends(get_current_user)):
    """Host/admin transitions the live session from waiting -> in_progress and loads Q1."""
    sess = await db.competition_live_sessions.find_one({"live_id": live_id}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="الجلسة غير موجودة")
    if sess["host_id"] != current_user.user_id and current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="فقط المنشئ أو الإدارة يمكنه بدء المسابقة")
    if sess.get("status") != "waiting":
        raise HTTPException(status_code=400, detail="لا يمكن بدء الجلسة في حالتها الحالية")
    if not sess.get("participants"):
        raise HTTPException(status_code=400, detail="لا يوجد طلاب منضمون بعد")

    # Load first question
    first_q = await db.competition_questions.find_one(
        {"competition_id": sess["competition_id"], "order": 0}, {"_id": 0}
    )
    if not first_q:
        raise HTTPException(status_code=400, detail="لا توجد أسئلة في هذه المسابقة")

    now = datetime.now(timezone.utc).isoformat()
    await db.competition_live_sessions.update_one(
        {"live_id": live_id},
        {"$set": {
            "status": "in_progress",
            "started_at": now,
            "current_question_index": 0,
            "current_question_id": first_q["question_id"],
            "question_started_at": now,
        }}
    )
    return {"message": "تم بدء المسابقة"}


@api_router.post("/competitions/live/{live_id}/next")
async def next_question(live_id: str, current_user: User = Depends(get_current_user)):
    """Host/admin advances to the next question."""
    sess = await db.competition_live_sessions.find_one({"live_id": live_id}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="الجلسة غير موجودة")
    if sess["host_id"] != current_user.user_id and current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="فقط المنشئ أو الإدارة يمكنه التقدم في الأسئلة")
    if sess.get("status") != "in_progress":
        raise HTTPException(status_code=400, detail="الجلسة ليست قيد التقدّم")

    next_index = int(sess.get("current_question_index", -1)) + 1
    total = int(sess.get("total_questions", 0))
    if next_index >= total:
        raise HTTPException(status_code=400, detail="انتهت الأسئلة، استخدم 'إنهاء المسابقة'")

    next_q = await db.competition_questions.find_one(
        {"competition_id": sess["competition_id"], "order": next_index}, {"_id": 0}
    )
    if not next_q:
        raise HTTPException(status_code=400, detail="السؤال التالي غير موجود")

    now = datetime.now(timezone.utc).isoformat()
    await db.competition_live_sessions.update_one(
        {"live_id": live_id},
        {"$set": {
            "current_question_index": next_index,
            "current_question_id": next_q["question_id"],
            "question_started_at": now,
        }}
    )
    return {"message": "تم الانتقال للسؤال التالي", "current_question_index": next_index}


class LiveAnswerPayload(BaseModel):
    question_id: str
    selected_index: int


@api_router.post("/competitions/live/{live_id}/answer")
async def submit_live_answer(
    live_id: str,
    payload: LiveAnswerPayload,
    current_user: User = Depends(get_current_user)
):
    """Student submits one answer for the current question. Idempotent (first answer wins)."""
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="إرسال الإجابات للطلاب فقط")
    sess = await db.competition_live_sessions.find_one({"live_id": live_id}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="الجلسة غير موجودة")
    if sess.get("status") != "in_progress":
        raise HTTPException(status_code=400, detail="الجلسة ليست قيد التقدّم")
    if not any(p.get("user_id") == current_user.user_id for p in sess.get("participants", [])):
        raise HTTPException(status_code=403, detail="أنت لست منضمّاً لهذه الجلسة")
    if sess.get("current_question_id") != payload.question_id:
        raise HTTPException(status_code=400, detail="هذا السؤال لم يعد نشطاً")

    q = await db.competition_questions.find_one(
        {"question_id": payload.question_id}, {"_id": 0}
    )
    if not q:
        raise HTTPException(status_code=404, detail="السؤال غير موجود")
    if payload.selected_index < 0 or payload.selected_index >= len(q.get("options", [])):
        raise HTTPException(status_code=400, detail="الخيار غير صحيح")

    # Check time window (small grace period to absorb network latency)
    started = sess.get("question_started_at")
    if started:
        try:
            started_dt = datetime.fromisoformat(started)
            elapsed = (datetime.now(timezone.utc) - started_dt).total_seconds()
            if elapsed > q.get("time_limit", 30) + 2:
                raise HTTPException(status_code=400, detail="انتهى وقت السؤال")
        except HTTPException:
            raise
        except Exception:
            pass

    # Idempotent: first answer wins
    existing = await db.competition_live_answers.find_one({
        "live_id": live_id,
        "question_id": payload.question_id,
        "user_id": current_user.user_id,
    }, {"_id": 0})
    if existing:
        return {
            "message": "تم تسجيل إجابتك مسبقاً",
            "selected_index": existing["selected_index"],
            "is_correct": existing.get("is_correct"),
            "points_earned": existing.get("points_earned", 0),
        }

    submitted_at = datetime.now(timezone.utc).isoformat()
    time_taken = None
    if started:
        try:
            time_taken = (datetime.now(timezone.utc) - datetime.fromisoformat(started)).total_seconds()
        except Exception:
            time_taken = None

    # Score the answer (Phase 4): correct + speed bonus
    is_correct = (payload.selected_index == q.get("correct_index"))
    points_earned = 0
    if is_correct:
        base = int(q.get("points", 100))
        tl = max(1, int(q.get("time_limit", 30)))
        if time_taken is not None:
            speed = max(0.0, min(1.0, 1.0 - (float(time_taken) / float(tl))))
            # 50% base for any correct answer + up to 50% speed bonus
            points_earned = int(round(base * (0.5 + 0.5 * speed)))
        else:
            points_earned = base

    await db.competition_live_answers.insert_one({
        "live_id": live_id,
        "competition_id": sess["competition_id"],
        "question_id": payload.question_id,
        "user_id": current_user.user_id,
        "user_name": current_user.name,
        "selected_index": payload.selected_index,
        "is_correct": is_correct,
        "points_earned": points_earned,
        "submitted_at": submitted_at,
        "time_taken_seconds": time_taken,
    })
    return {
        "message": "تم تسجيل إجابتك",
        "selected_index": payload.selected_index,
        "is_correct": is_correct,
        "points_earned": points_earned,
    }


@api_router.post("/competitions/live/{live_id}/complete")
async def complete_live_session(live_id: str, current_user: User = Depends(get_current_user)):
    """Host/admin marks the live session as completed (all questions done).
    Also materializes per-student results in `competition_results` for history/profile views.
    """
    sess = await db.competition_live_sessions.find_one({"live_id": live_id}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="الجلسة غير موجودة")
    if sess["host_id"] != current_user.user_id and current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="فقط المنشئ أو الإدارة يمكنه إنهاء المسابقة")
    if sess.get("status") not in ("in_progress",):
        raise HTTPException(status_code=400, detail="لا يمكن إنهاء الجلسة في حالتها الحالية")

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.competition_live_sessions.update_one(
        {"live_id": live_id},
        {"$set": {"status": "completed", "ended_at": now_iso}}
    )

    # Materialize per-student results (skip if already materialized for this live_id)
    already = await db.competition_results.count_documents({"live_id": live_id})
    if already == 0:
        total_questions = int(sess.get("total_questions") or 0)
        participants = sess.get("participants", [])
        # Compute per-participant aggregates
        rows = []
        for p in participants:
            answers = await db.competition_live_answers.find(
                {"live_id": live_id, "user_id": p["user_id"]}, {"_id": 0}
            ).to_list(length=500)
            total_points = sum(int(a.get("points_earned", 0) or 0) for a in answers)
            correct_count = sum(1 for a in answers if a.get("is_correct"))
            answered_count = len(answers)
            wrong_count = answered_count - correct_count
            unanswered_count = max(0, total_questions - answered_count)
            accuracy_pct = round((correct_count / total_questions * 100.0), 1) if total_questions > 0 else 0.0
            rows.append({
                "user_id": p["user_id"],
                "user_name": p["name"],
                "total_points": total_points,
                "correct_count": correct_count,
                "wrong_count": wrong_count,
                "unanswered_count": unanswered_count,
                "accuracy_pct": accuracy_pct,
            })
        # Rank within this session
        rows.sort(key=lambda r: (-r["total_points"], -r["correct_count"], r["user_name"]))
        host_id = sess.get("host_id")
        host_name = sess.get("host_name")
        comp_id = sess.get("competition_id")
        comp_title = sess.get("competition_title")
        result_docs = []
        for i, r in enumerate(rows):
            result_docs.append({
                "result_id": f"res_{uuid.uuid4().hex[:12]}",
                "live_id": live_id,
                "competition_id": comp_id,
                "competition_title": comp_title,
                "host_id": host_id,
                "host_name": host_name,
                "user_id": r["user_id"],
                "user_name": r["user_name"],
                "total_points": r["total_points"],
                "correct_count": r["correct_count"],
                "wrong_count": r["wrong_count"],
                "unanswered_count": r["unanswered_count"],
                "total_questions": total_questions,
                "accuracy_pct": r["accuracy_pct"],
                "rank": i + 1,
                "participants_count": len(rows),
                "completed_at": now_iso,
            })
        if result_docs:
            await db.competition_results.insert_many(result_docs)

    return {"message": "تمت المسابقة بنجاح"}


@api_router.get("/competitions/live/{live_id}/leaderboard")
async def get_live_leaderboard(live_id: str, current_user: User = Depends(get_current_user)):
    """Return ranked standings for the live session.
    Accessible to host/admin or joined participants. Works mid-competition or after completion.
    """
    sess = await db.competition_live_sessions.find_one({"live_id": live_id}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="الجلسة غير موجودة")
    is_host = sess["host_id"] == current_user.user_id or current_user.email == ADMIN_EMAIL
    is_participant = any(p.get("user_id") == current_user.user_id for p in sess.get("participants", []))
    if not is_host and not is_participant:
        raise HTTPException(status_code=403, detail="غير مصرح لك بعرض هذه الجلسة")

    total_questions = int(sess.get("total_questions") or 0)
    status = sess.get("status")
    # Denominator for accuracy: questions revealed so far if in_progress, else total
    if status == "in_progress":
        questions_seen = int(sess.get("current_question_index", -1)) + 1
    elif status in ("completed", "ended"):
        questions_seen = total_questions
    else:
        questions_seen = 0

    rows = []
    for p in sess.get("participants", []):
        answers = await db.competition_live_answers.find(
            {"live_id": live_id, "user_id": p["user_id"]}, {"_id": 0}
        ).to_list(length=500)
        total_points = sum(int(a.get("points_earned", 0) or 0) for a in answers)
        correct_count = sum(1 for a in answers if a.get("is_correct"))
        answered_count = len(answers)
        denom = max(questions_seen, 1)
        accuracy = (correct_count / denom * 100.0) if questions_seen > 0 else 0.0
        rows.append({
            "user_id": p["user_id"],
            "name": p["name"],
            "total_points": total_points,
            "correct_count": correct_count,
            "answered_count": answered_count,
            "accuracy_pct": round(accuracy, 1),
        })

    # Rank: points desc, then correct desc, then answered desc, then name asc (stable tiebreak)
    rows.sort(key=lambda r: (-r["total_points"], -r["correct_count"], -r["answered_count"], r["name"]))
    for i, r in enumerate(rows):
        r["rank"] = i + 1

    return {
        "live_id": live_id,
        "status": status,
        "questions_seen": questions_seen,
        "total_questions": total_questions,
        "leaderboard": rows,
    }


@api_router.get("/competitions/live/{live_id}/report")
async def get_live_report(live_id: str, current_user: User = Depends(get_current_user)):
    """Detailed post-competition report for host/admin: leaderboard + per-question stats."""
    sess = await db.competition_live_sessions.find_one({"live_id": live_id}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="الجلسة غير موجودة")
    if sess["host_id"] != current_user.user_id and current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="غير مصرح لك بعرض هذا التقرير")

    # Re-use leaderboard logic
    total_questions = int(sess.get("total_questions") or 0)
    leaderboard = []
    for p in sess.get("participants", []):
        answers = await db.competition_live_answers.find(
            {"live_id": live_id, "user_id": p["user_id"]}, {"_id": 0}
        ).to_list(length=500)
        total_points = sum(int(a.get("points_earned", 0) or 0) for a in answers)
        correct_count = sum(1 for a in answers if a.get("is_correct"))
        answered_count = len(answers)
        wrong_count = answered_count - correct_count
        unanswered_count = max(0, total_questions - answered_count)
        accuracy = round((correct_count / total_questions * 100.0), 1) if total_questions > 0 else 0.0
        leaderboard.append({
            "user_id": p["user_id"],
            "name": p["name"],
            "total_points": total_points,
            "correct_count": correct_count,
            "wrong_count": wrong_count,
            "unanswered_count": unanswered_count,
            "accuracy_pct": accuracy,
        })
    leaderboard.sort(key=lambda r: (-r["total_points"], -r["correct_count"], r["name"]))
    for i, r in enumerate(leaderboard):
        r["rank"] = i + 1

    # Per-question stats
    questions = await db.competition_questions.find(
        {"competition_id": sess["competition_id"]}, {"_id": 0}
    ).sort("order", 1).to_list(length=500)
    participants_count = len(sess.get("participants", []))
    question_stats = []
    for q in questions:
        ans = await db.competition_live_answers.find(
            {"live_id": live_id, "question_id": q["question_id"]}, {"_id": 0}
        ).to_list(length=500)
        ans_count = len(ans)
        correct = sum(1 for a in ans if a.get("is_correct"))
        correct_rate = round((correct / participants_count * 100.0), 1) if participants_count > 0 else 0.0
        question_stats.append({
            "question_id": q["question_id"],
            "order": q.get("order"),
            "question_text": q["question_text"],
            "options": q.get("options", []),
            "correct_index": q.get("correct_index"),
            "time_limit": q.get("time_limit"),
            "points": q.get("points"),
            "answered_count": ans_count,
            "correct_count": correct,
            "wrong_count": ans_count - correct,
            "unanswered_count": max(0, participants_count - ans_count),
            "correct_rate_pct": correct_rate,
        })
    # Difficult questions = those with the lowest correct_rate_pct
    sorted_by_diff = sorted(question_stats, key=lambda q: (q["correct_rate_pct"], -(q.get("unanswered_count") or 0)))
    difficult = [q for q in sorted_by_diff if q["correct_rate_pct"] < 50][:3]

    return {
        "live_id": live_id,
        "competition_id": sess["competition_id"],
        "competition_title": sess.get("competition_title"),
        "host_id": sess.get("host_id"),
        "host_name": sess.get("host_name"),
        "status": sess.get("status"),
        "started_at": sess.get("started_at"),
        "ended_at": sess.get("ended_at"),
        "total_questions": total_questions,
        "participants_count": participants_count,
        "leaderboard": leaderboard,
        "question_stats": question_stats,
        "difficult_questions": difficult,
    }


@api_router.get("/student/competition-history")
async def get_my_competition_history(current_user: User = Depends(get_current_user)):
    """Student fetches their own past competition results, sorted by date desc."""
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="هذا المسار للطلاب فقط")
    items = await db.competition_results.find(
        {"user_id": current_user.user_id}, {"_id": 0}
    ).sort("completed_at", -1).to_list(length=500)
    return items


@api_router.get("/teacher/students/{student_id}/competition-history")
async def get_student_competition_history(
    student_id: str,
    current_user: User = Depends(get_current_user)
):
    """Teacher/admin fetches a specific student's past competition results."""
    _require_teacher_or_admin(current_user)
    items = await db.competition_results.find(
        {"user_id": student_id}, {"_id": 0}
    ).sort("completed_at", -1).to_list(length=500)
    return items


@api_router.post("/competitions/live/{live_id}/end")
async def end_live_session(live_id: str, current_user: User = Depends(get_current_user)):
    """Host/admin ends a live session."""
    sess = await db.competition_live_sessions.find_one({"live_id": live_id}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="الجلسة غير موجودة")
    if sess["host_id"] != current_user.user_id and current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="فقط المنشئ أو الإدارة يمكنه إنهاء الجلسة")
    if sess.get("status") == "ended":
        return {"message": "الجلسة منتهية بالفعل"}
    await db.competition_live_sessions.update_one(
        {"live_id": live_id},
        {"$set": {"status": "ended", "ended_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "تم إنهاء الجلسة"}


# ===== QURAN DATA API =====
@api_router.get("/quran/surahs")
async def get_quran_surahs():
    """Returns the list of all Quran surahs with ayah counts for frontend dropdowns"""
    return {"surahs": QURAN_SURAHS}

# ===== STUDENT ACADEMIC TRACKING =====
@api_router.post("/sessions/{session_id}/notes")
async def add_session_notes(
    session_id: str,
    notes: SessionNotes,
    current_user: User = Depends(get_current_user)
):
    """Teacher adds instructional notes after a session"""
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="إضافة الملاحظات للمعلمين فقط")
    
    session = await db.sessions.find_one({"session_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="لم يتم العثور على سجل الحصة")
    
    if session["teacher_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="هذه الحصة لا تخصك")
    
    notes_data = {
        "mistakes": notes.mistakes,
        "corrections": notes.corrections,
        "recommendations": notes.recommendations,
        "added_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Build list of memorization entries (support both old single + new multi)
    all_entries = []
    if notes.memorization_entries:
        all_entries.extend(notes.memorization_entries)
    elif notes.memorization_progress:
        all_entries.append(notes.memorization_progress)

    # Validate and save each memorization entry
    progress_ids = []
    for mp in all_entries:
        surah_info = SURAH_MAP.get(mp.surah_name)
        if not surah_info:
            raise HTTPException(status_code=400, detail=f"اسم السورة غير صحيح: {mp.surah_name}")
        max_ayah = surah_info["ayah_count"]
        if mp.from_ayah < 1 or mp.from_ayah > max_ayah:
            raise HTTPException(status_code=400, detail=f"رقم الآية 'من' يجب أن يكون بين 1 و {max_ayah} (سورة {mp.surah_name})")
        if mp.to_ayah < mp.from_ayah or mp.to_ayah > max_ayah:
            raise HTTPException(status_code=400, detail=f"رقم الآية 'إلى' يجب أن يكون بين {mp.from_ayah} و {max_ayah} (سورة {mp.surah_name})")

        progress_id = f"prog_{uuid.uuid4().hex[:12]}"
        progress_data = {
            "progress_id": progress_id,
            "student_id": session["student_id"],
            "teacher_id": current_user.user_id,
            "teacher_name": current_user.name,
            "session_id": session_id,
            "surah_name": mp.surah_name,
            "surah_number": surah_info["number"],
            "from_ayah": mp.from_ayah,
            "to_ayah": mp.to_ayah,
            "quality": mp.quality,
            "notes": mp.notes,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.memorization_progress.insert_one(progress_data)
        progress_ids.append(progress_id)

    if progress_ids:
        notes_data["memorization_progress_ids"] = progress_ids
        # Keep backward compat field for single entry
        notes_data["memorization_progress_id"] = progress_ids[0]
    
    await db.sessions.update_one(
        {"session_id": session_id},
        {"$set": {"instructor_notes": notes_data}}
    )
    
    return {"message": "Session notes added"}

@api_router.get("/students/{student_id}/progress")
async def get_student_progress(
    student_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get student's memorization progress (visible to student and their teachers)"""
    # Check access
    if current_user.role == "student" and current_user.user_id != student_id:
        raise HTTPException(status_code=403, detail="Can only view your own progress")
    
    # Get memorization progress
    progress_cursor = db.memorization_progress.find(
        {"student_id": student_id},
        {"_id": 0}
    ).sort("created_at", -1)
    progress_list = await progress_cursor.to_list(length=100)
    
    # Enrich progress entries with teacher names (for entries missing teacher_name)
    teacher_cache = {}
    for entry in progress_list:
        tid = entry.get("teacher_id")
        if tid and not entry.get("teacher_name"):
            if tid not in teacher_cache:
                t = await db.users.find_one({"user_id": tid}, {"_id": 0, "name": 1})
                teacher_cache[tid] = t.get("name") if t else "غير معروف"
            entry["teacher_name"] = teacher_cache[tid]
    
    # Get sessions with notes (all teachers can see all notes for any student)
    sessions_query = {"student_id": student_id, "instructor_notes": {"$exists": True}}
    
    sessions_cursor = db.sessions.find(sessions_query, {"_id": 0}).sort("scheduled_time", -1)
    sessions_with_notes = await sessions_cursor.to_list(length=50)
    
    # Enrich sessions with teacher names
    for s in sessions_with_notes:
        tid = s.get("teacher_id")
        if tid:
            if tid not in teacher_cache:
                t = await db.users.find_one({"user_id": tid}, {"_id": 0, "name": 1})
                teacher_cache[tid] = t.get("name") if t else "غير معروف"
            s["teacher_name"] = teacher_cache[tid]
    
    # Weekly overview
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    weekly_progress = [p for p in progress_list if datetime.fromisoformat(p["created_at"].replace("+00:00", "+00:00")) > week_ago]
    
    return {
        "total_entries": len(progress_list),
        "weekly_entries": len(weekly_progress),
        "progress_log": progress_list,
        "sessions_with_notes": sessions_with_notes,
        "weekly_summary": {
            "sessions_count": len(weekly_progress),
            "quality_breakdown": {
                "ممتاز": len([p for p in weekly_progress if p.get("quality") == "ممتاز"]),
                "متوسط": len([p for p in weekly_progress if p.get("quality") == "متوسط"]),
                "مقبول": len([p for p in weekly_progress if p.get("quality") == "مقبول"]),
                "ضعيف": len([p for p in weekly_progress if p.get("quality") == "ضعيف"])
            }
        }
    }

# ===== EDIT MEMORIZATION RECORD =====
@api_router.put("/memorization-progress/{progress_id}")
async def edit_memorization_progress(
    progress_id: str,
    update_data: MemorizationProgress,
    current_user: User = Depends(get_current_user)
):
    """Any teacher can edit an existing memorization record"""
    if current_user.role != "teacher" and current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="للمعلمين والمشرف فقط")
    
    existing = await db.memorization_progress.find_one({"progress_id": progress_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="سجل الحفظ غير موجود")
    
    # Validate surah
    surah_info = SURAH_MAP.get(update_data.surah_name)
    if not surah_info:
        raise HTTPException(status_code=400, detail=f"اسم السورة غير صحيح: {update_data.surah_name}")
    max_ayah = surah_info["ayah_count"]
    if update_data.from_ayah < 1 or update_data.from_ayah > max_ayah:
        raise HTTPException(status_code=400, detail=f"رقم الآية 'من' يجب أن يكون بين 1 و {max_ayah}")
    if update_data.to_ayah < update_data.from_ayah or update_data.to_ayah > max_ayah:
        raise HTTPException(status_code=400, detail=f"رقم الآية 'إلى' يجب أن يكون بين {update_data.from_ayah} و {max_ayah}")
    
    await db.memorization_progress.update_one(
        {"progress_id": progress_id},
        {"$set": {
            "surah_name": update_data.surah_name,
            "surah_number": surah_info["number"],
            "from_ayah": update_data.from_ayah,
            "to_ayah": update_data.to_ayah,
            "quality": update_data.quality,
            "notes": update_data.notes,
            "last_edited_by": current_user.user_id,
            "last_edited_by_name": current_user.name,
            "last_edited_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "تم تحديث سجل الحفظ بنجاح"}




@api_router.delete("/memorization-progress/{progress_id}")
async def delete_memorization_progress(
    progress_id: str,
    current_user: User = Depends(get_current_user)
):
    """Admin deletes a memorization progress entry safely."""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="حذف سجل الحفظ للمشرف فقط")

    existing = await db.memorization_progress.find_one({"progress_id": progress_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="سجل الحفظ غير موجود")

    # Delete the progress record itself
    await db.memorization_progress.delete_one({"progress_id": progress_id})

    # Remove references from any session instructor_notes
    await db.sessions.update_many(
        {"instructor_notes.memorization_progress_ids": progress_id},
        {"$pull": {"instructor_notes.memorization_progress_ids": progress_id}}
    )

    # If old single-reference field points to this progress, unset it
    await db.sessions.update_many(
        {"instructor_notes.memorization_progress_id": progress_id},
        {"$unset": {"instructor_notes.memorization_progress_id": ""}}
    )

    return {"message": "تم حذف سجل الحفظ بنجاح"}

# ===== GLOBAL ANNOUNCEMENTS =====
@api_router.post("/admin/announcements")
async def create_announcement(
    announcement: GlobalAnnouncement,
    current_user: User = Depends(get_current_user)
):
    """Admin creates a global announcement"""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Only admin can create announcements")
    
    announcement_id = f"ann_{uuid.uuid4().hex[:12]}"
    await db.announcements.insert_one({
        "announcement_id": announcement_id,
        "title": announcement.title,
        "content": announcement.content,
        "priority": announcement.priority,
        "created_by": current_user.user_id,
        "created_by_name": current_user.name,
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    # Create notification for all users
    await db.notifications.insert_one({
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": "all_users",
        "type": "announcement",
        "title": announcement.title,
        "message": announcement.content,
        "priority": announcement.priority,
        "related_announcement_id": announcement_id,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": "Announcement created", "announcement_id": announcement_id}

@api_router.get("/announcements")
async def get_announcements(current_user: User = Depends(get_current_user)):
    """Get all active announcements"""
    announcements_cursor = db.announcements.find(
        {"active": True},
        {"_id": 0}
    ).sort("created_at", -1)
    announcements = await announcements_cursor.to_list(length=50)
    
    return announcements

@api_router.delete("/admin/announcements/{announcement_id}")
async def delete_announcement(
    announcement_id: str,
    current_user: User = Depends(get_current_user)
):
    """Admin deactivates an announcement"""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Only admin can delete announcements")
    
    await db.announcements.update_one(
        {"announcement_id": announcement_id},
        {"$set": {"active": False}}
    )
    
    return {"message": "Announcement deactivated"}

# ===== ENHANCED STATISTICS (exclude cancelled) =====
@api_router.get("/stats/sessions")
async def get_session_stats(current_user: User = Depends(get_current_user)):
    """Get session statistics excluding cancelled sessions"""
    if current_user.role == "student":
        base_query = {"student_id": current_user.user_id}
    else:
        base_query = {"teacher_id": current_user.user_id}
    
    # Total excluding cancelled
    total_active = await db.sessions.count_documents({**base_query, "status": {"$ne": "cancelled"}})
    scheduled = await db.sessions.count_documents({**base_query, "status": "scheduled"})
    completed = await db.sessions.count_documents({**base_query, "status": "completed"})
    cancelled = await db.sessions.count_documents({**base_query, "status": "cancelled"})
    
    return {
        "total_active": total_active,
        "scheduled": scheduled,
        "completed": completed,
        "cancelled": cancelled,
        "completion_rate": round((completed / total_active * 100) if total_active > 0 else 0, 1)
    }

# ===== WEEKLY ROTATION SYSTEM (ADMIN ONLY) =====
@api_router.get("/admin/weekly-rotation")
async def get_weekly_rotation(current_user: User = Depends(get_current_user)):
    """Get weekly rotation settings - Admin only"""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Only admin can access rotation settings")
    
    settings = await db.system_settings.find_one({"setting_type": "weekly_rotation"}, {"_id": 0})
    
    if not settings:
        # Default settings
        settings = {
            "setting_type": "weekly_rotation",
            "enabled": False,
            "start_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "first_week_teacher": "",
            "teachers": []
        }
    
    return settings

@api_router.post("/admin/weekly-rotation")
async def update_weekly_rotation(
    settings: WeeklyRotationSettings,
    current_user: User = Depends(get_current_user)
):
    """Update weekly rotation settings - Admin only (محمد الأنصاري)"""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Only admin can modify rotation settings")
    
    # Get teacher names for reference
    teacher1 = await db.users.find_one({"email": "omarnasernajjar09@gmail.com"}, {"_id": 0})
    teacher2 = await db.users.find_one({"email": "aalsiiada@gmail.com"}, {"_id": 0})
    
    teachers = []
    if teacher1:
        teachers.append({"teacher_id": teacher1["user_id"], "name": teacher1["name"], "email": teacher1["email"]})
    if teacher2:
        teachers.append({"teacher_id": teacher2["user_id"], "name": teacher2["name"], "email": teacher2["email"]})
    
    rotation_data = {
        "setting_type": "weekly_rotation",
        "enabled": settings.enabled,
        "start_date": settings.start_date,
        "first_week_teacher": settings.first_week_teacher,
        "teachers": teachers,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current_user.user_id
    }
    
    await db.system_settings.update_one(
        {"setting_type": "weekly_rotation"},
        {"$set": rotation_data},
        upsert=True
    )
    
    return {"message": "Weekly rotation settings updated", "settings": rotation_data}

@api_router.get("/current-week-teacher")
async def get_current_week_teacher():
    """Get which teacher is active this week based on rotation"""
    settings = await db.system_settings.find_one({"setting_type": "weekly_rotation"}, {"_id": 0})
    
    if not settings or not settings.get("enabled"):
        # If rotation not enabled, return all teachers
        return {"rotation_enabled": False, "active_teacher": None}
    
    # Calculate which teacher is active based on weeks since start_date
    start_date = datetime.strptime(settings["start_date"], "%Y-%m-%d")
    today = datetime.now(timezone.utc).replace(tzinfo=None)
    
    days_diff = (today - start_date).days
    weeks_diff = days_diff // 7
    
    # Even weeks = first_week_teacher, Odd weeks = other teacher
    teachers = settings.get("teachers", [])
    if len(teachers) < 2:
        return {"rotation_enabled": False, "active_teacher": None}
    
    first_teacher_id = settings.get("first_week_teacher")
    
    if weeks_diff % 2 == 0:
        # Even week - first teacher
        active_teacher = next((t for t in teachers if t["teacher_id"] == first_teacher_id), teachers[0])
    else:
        # Odd week - second teacher
        active_teacher = next((t for t in teachers if t["teacher_id"] != first_teacher_id), teachers[1])
    
    return {
        "rotation_enabled": True,
        "active_teacher": active_teacher,
        "week_number": weeks_diff + 1,
        "start_date": settings["start_date"]
    }

# ===== MOST ENGAGED STUDENTS REPORT (ADMIN ONLY) =====
@api_router.get("/admin/top-students")
async def get_top_students(current_user: User = Depends(get_current_user)):
    """Get most engaged students report - Admin only"""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Only admin can access this report")
    
    # Aggregate student engagement data
    pipeline = [
        # Only count non-cancelled sessions
        {"$match": {"status": {"$ne": "cancelled"}}},
        # Group by student
        {"$group": {
            "_id": "$student_id",
            "student_name": {"$first": "$student_name"},
            "total_sessions": {"$sum": 1},
            "completed_sessions": {
                "$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}
            },
            "scheduled_sessions": {
                "$sum": {"$cond": [{"$eq": ["$status", "scheduled"]}, 1, 0]}
            },
            "teachers_studied_with": {"$addToSet": "$teacher_id"},
            "last_session": {"$max": "$scheduled_time"}
        }},
        # Calculate attendance rate
        {"$addFields": {
            "attendance_rate": {
                "$cond": [
                    {"$gt": ["$total_sessions", 0]},
                    {"$multiply": [{"$divide": ["$completed_sessions", "$total_sessions"]}, 100]},
                    0
                ]
            },
            "teachers_count": {"$size": "$teachers_studied_with"}
        }},
        # Sort by total sessions (most engaged)
        {"$sort": {"total_sessions": -1}},
        # Limit to top 20
        {"$limit": 20}
    ]
    
    results = await db.sessions.aggregate(pipeline).to_list(length=20)
    
    # Get additional student info
    student_ids = [r["_id"] for r in results]
    students_cursor = db.users.find({"user_id": {"$in": student_ids}}, {"_id": 0})
    students = await students_cursor.to_list(length=100)
    students_map = {s["user_id"]: s for s in students}
    
    # Enrich results with student info
    enriched_results = []
    for r in results:
        student_info = students_map.get(r["_id"], {})
        enriched_results.append({
            "student_id": r["_id"],
            "student_name": r["student_name"],
            "student_email": student_info.get("email", ""),
            "student_picture": student_info.get("picture", ""),
            "total_sessions": r["total_sessions"],
            "completed_sessions": r["completed_sessions"],
            "scheduled_sessions": r["scheduled_sessions"],
            "attendance_rate": round(r["attendance_rate"], 1),
            "teachers_count": r["teachers_count"],
            "last_session": r["last_session"]
        })
    
    return {
        "total_students_analyzed": len(enriched_results),
        "top_students": enriched_results
    }

# ===== CONTENT MANAGEMENT SYSTEM (CMS) =====

@api_router.get("/public/content")
async def get_public_content():
    """Get all active content for public display - no auth required"""
    content_cursor = db.site_content.find(
        {"active": True},
        {"_id": 0}
    ).sort([("is_featured", -1), ("order", 1), ("created_at", -1)])
    
    content_list = await content_cursor.to_list(length=50)
    return content_list

@api_router.get("/admin/content")
async def get_admin_content(current_user: User = Depends(get_current_user)):
    """Get all content for admin management"""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Admin only")
    
    content_cursor = db.site_content.find(
        {},
        {"_id": 0}
    ).sort([("order", 1), ("created_at", -1)])
    
    content_list = await content_cursor.to_list(length=100)
    return content_list

@api_router.post("/admin/content")
async def create_content(
    content: ContentCreate,
    current_user: User = Depends(get_current_user)
):
    """Create new content - Admin only"""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="فقط المشرف يمكنه إضافة محتوى")
    
    content_id = f"content_{uuid.uuid4().hex[:12]}"
    content_data = {
        "content_id": content_id,
        "title": content.title,
        "content": content.content,
        "image_url": content.image_url,
        "order": content.order,
        "is_featured": content.is_featured,
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.user_id,
        "updated_at": None
    }
    
    await db.site_content.insert_one(content_data)
    content_data.pop("_id", None)
    
    return {"message": "تم إضافة المحتوى بنجاح", "content": content_data}

@api_router.put("/admin/content/{content_id}")
async def update_content(
    content_id: str,
    update: ContentUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update content - Admin only"""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="فقط المشرف يمكنه تعديل المحتوى")
    
    # Get existing content
    existing = await db.site_content.find_one({"content_id": content_id})
    if not existing:
        raise HTTPException(status_code=404, detail="المحتوى غير موجود")
    
    # Build update data
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = current_user.user_id
    
    await db.site_content.update_one(
        {"content_id": content_id},
        {"$set": update_data}
    )
    
    # Get updated content
    updated = await db.site_content.find_one({"content_id": content_id}, {"_id": 0})
    
    return {"message": "تم تحديث المحتوى بنجاح", "content": updated}

@api_router.delete("/admin/content/{content_id}")
async def delete_content(
    content_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete content - Admin only"""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="فقط المشرف يمكنه حذف المحتوى")
    
    result = await db.site_content.delete_one({"content_id": content_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="المحتوى غير موجود")
    
    return {"message": "تم حذف المحتوى بنجاح"}

# ===== OFFICIAL LICENSE DOCUMENT MANAGEMENT =====
# Additive feature: a single "current active" license document is stored
# in the `license_documents` collection. The file content itself is held as
# a base64 data URL (same pattern as user pictures / CMS images). Public
# endpoints expose ONLY metadata + a streaming endpoint for the active
# document; admin endpoints are gated by ADMIN_EMAIL.

class LicenseDocumentUpsert(BaseModel):
    license_number: str
    issuer: str
    status_label: str
    issue_date: Optional[str] = None   # YYYY-MM-DD or null
    expiry_date: Optional[str] = None  # YYYY-MM-DD or null
    file_data_url: str                 # data:<mime>;base64,<payload>
    file_name: str

# Allowed MIME types for license documents (server-side whitelist; client
# values are never trusted — MIME is re-extracted from the data URL).
_LICENSE_ALLOWED_MIMES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
}
_LICENSE_MAX_BYTES = 5 * 1024 * 1024  # 5 MB hard cap on decoded payload
_LICENSE_DATA_URL_RE = re.compile(
    r"^data:(?P<mime>[a-zA-Z0-9.+/-]+);base64,(?P<payload>[A-Za-z0-9+/=\s]+)$"
)
_LICENSE_FILENAME_SAFE_RE = re.compile(r"[^A-Za-z0-9._\-]+")


def _sanitize_license_filename(raw: str) -> str:
    """Reduce file_name to a safe ASCII slug for Content-Disposition.

    The original (potentially Arabic) name is never reflected back in HTTP
    headers verbatim; we keep a sanitised version + a generic fallback.
    """
    if not raw:
        return "license"
    base = raw.rsplit("/", 1)[-1].rsplit("\\", 1)[-1].strip()
    safe = _LICENSE_FILENAME_SAFE_RE.sub("_", base)[:80].strip("._-")
    return safe or "license"


def _parse_and_validate_license_data_url(data_url: str) -> tuple[str, bytes]:
    """Return (mime, decoded_bytes); raise HTTPException on any violation."""
    import base64 as _b64
    if not isinstance(data_url, str) or len(data_url) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="حمولة الملف غير صالحة")
    m = _LICENSE_DATA_URL_RE.match(data_url)
    if not m:
        raise HTTPException(status_code=400, detail="صيغة الملف غير صالحة")
    mime = m.group("mime").lower()
    if mime == "image/jpg":
        mime = "image/jpeg"
    if mime not in _LICENSE_ALLOWED_MIMES:
        raise HTTPException(
            status_code=400,
            detail="نوع الملف غير مدعوم. اقبل PDF أو PNG أو JPG فقط",
        )
    payload = "".join(m.group("payload").split())  # drop whitespace/newlines
    try:
        raw_bytes = _b64.b64decode(payload, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="ترميز base64 غير صالح")
    if len(raw_bytes) == 0:
        raise HTTPException(status_code=400, detail="الملف فارغ")
    if len(raw_bytes) > _LICENSE_MAX_BYTES:
        raise HTTPException(
            status_code=400, detail="حجم الملف يتجاوز الحد الأقصى (5MB)"
        )
    return mime, raw_bytes


def _public_license_view(doc: dict) -> dict:
    """Strip the heavy file_data_url + any private fields from public views."""
    return {
        "license_number": doc.get("license_number"),
        "issuer": doc.get("issuer"),
        "status_label": doc.get("status_label"),
        "issue_date": doc.get("issue_date"),
        "expiry_date": doc.get("expiry_date"),
        "file_mime": doc.get("file_mime"),
        "file_name": doc.get("file_name"),
        "updated_at": doc.get("uploaded_at"),
        "has_document": True,
    }


@api_router.get("/public/license")
async def get_public_license():
    """Public metadata for the current active license document.

    Returns `{has_document: false}` (200) when nothing is configured yet,
    so the public UI can render a graceful empty-state without errors.
    Never includes the raw `file_data_url`.
    """
    doc = await db.license_documents.find_one(
        {"active": True}, {"_id": 0, "file_data_url": 0, "uploaded_by": 0}
    )
    if not doc:
        return {"has_document": False}
    return _public_license_view(doc)


@api_router.get("/public/license/document")
async def get_public_license_document():
    """Stream the current active license file (PDF/PNG/JPG).

    404 if no active document exists. Inline disposition with a sanitised
    ASCII filename to avoid header-injection from user-supplied names.
    """
    import base64 as _b64
    doc = await db.license_documents.find_one(
        {"active": True}, {"_id": 0, "file_data_url": 1, "file_mime": 1, "file_name": 1}
    )
    if not doc or not doc.get("file_data_url"):
        raise HTTPException(status_code=404, detail="لا توجد وثيقة ترخيص مفعّلة")
    m = _LICENSE_DATA_URL_RE.match(doc["file_data_url"])
    if not m:
        # Should never happen — written records were validated on upload
        raise HTTPException(status_code=500, detail="ملف الترخيص تالف")
    try:
        raw_bytes = _b64.b64decode("".join(m.group("payload").split()), validate=True)
    except Exception:
        raise HTTPException(status_code=500, detail="ملف الترخيص تالف")
    mime = doc.get("file_mime") or m.group("mime").lower()
    safe_name = _sanitize_license_filename(doc.get("file_name") or "license")
    ext_map = {"application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg"}
    ext = ext_map.get(mime, "bin")
    if not safe_name.lower().endswith("." + ext):
        safe_name = f"{safe_name}.{ext}"
    return Response(
        content=raw_bytes,
        media_type=mime,
        headers={
            "Content-Disposition": f'inline; filename="{safe_name}"',
            "Cache-Control": "public, max-age=300",
        },
    )


@api_router.get("/admin/license")
async def get_admin_license(current_user: User = Depends(get_current_user)):
    """Admin metadata view (no raw file body, but includes uploader info)."""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="فقط المشرف يمكن الوصول")
    doc = await db.license_documents.find_one(
        {"active": True}, {"_id": 0, "file_data_url": 0}
    )
    if not doc:
        return {"has_document": False}
    return {
        **_public_license_view(doc),
        "license_id": doc.get("license_id"),
        "uploaded_by": doc.get("uploaded_by"),
        "file_size_bytes": doc.get("file_size_bytes"),
    }


@api_router.post("/admin/license")
async def upsert_admin_license(
    payload: LicenseDocumentUpsert,
    current_user: User = Depends(get_current_user),
):
    """Upload or replace the current active license document. Admin only.

    Behaviour: any previously-active document is flagged `active=false`
    (soft history retention) and the new document becomes the single
    `active=true` row.
    """
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="فقط المشرف يمكن رفع الترخيص")

    # Required text fields
    for field, value in (
        ("license_number", payload.license_number),
        ("issuer", payload.issuer),
        ("status_label", payload.status_label),
        ("file_name", payload.file_name),
    ):
        if not value or not value.strip():
            raise HTTPException(status_code=400, detail=f"الحقل {field} مطلوب")

    mime, raw_bytes = _parse_and_validate_license_data_url(payload.file_data_url)

    license_id = f"lic_{uuid.uuid4().hex[:12]}"
    doc = {
        "license_id": license_id,
        "license_number": payload.license_number.strip()[:80],
        "issuer": payload.issuer.strip()[:200],
        "status_label": payload.status_label.strip()[:120],
        "issue_date": (payload.issue_date or None),
        "expiry_date": (payload.expiry_date or None),
        "file_data_url": payload.file_data_url,
        "file_name": payload.file_name.strip()[:200],
        "file_mime": mime,
        "file_size_bytes": len(raw_bytes),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "uploaded_by": current_user.user_id,
        "active": True,
    }
    # Soft-deactivate previous active row(s) BEFORE inserting the new one
    await db.license_documents.update_many(
        {"active": True}, {"$set": {"active": False}}
    )
    await db.license_documents.insert_one(doc)
    return {
        "message": "تم حفظ وثيقة الترخيص بنجاح",
        "license": {
            **_public_license_view(doc),
            "license_id": license_id,
            "file_size_bytes": doc["file_size_bytes"],
        },
    }


@api_router.delete("/admin/license")
async def deactivate_admin_license(current_user: User = Depends(get_current_user)):
    """Soft-delete the current active license document (admin only)."""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="فقط المشرف يمكن حذف الترخيص")
    result = await db.license_documents.update_many(
        {"active": True}, {"$set": {"active": False}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="لا توجد وثيقة ترخيص مفعّلة")
    return {"message": "تم إلغاء تفعيل وثيقة الترخيص الحالية"}

# ===== STUDENT PERFORMANCE INDICATOR =====

@api_router.get("/students/my-performance")
async def get_student_performance(current_user: User = Depends(get_current_user)):
    """Get student's performance indicator using stored points from database"""
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="هذه الميزة متاحة للطلاب فقط")
    
    # Get stored points from database
    stored_points = await db.student_points.find_one(
        {"student_id": current_user.user_id},
        {"_id": 0}
    )
    
    if not stored_points:
        stored_points = {
            "booking_points": 0,
            "attendance_points": 0,
            "recitation_points": 0
        }
    
    booking_points = stored_points.get("booking_points", 0)
    attendance_points = stored_points.get("attendance_points", 0)
    recitation_points = stored_points.get("recitation_points", 0)
    
    # Get all sessions for statistics
    sessions_cursor = db.sessions.find(
        {"student_id": current_user.user_id},
        {"_id": 0}
    )
    all_sessions = await sessions_cursor.to_list(length=500)
    
    # Calculate metrics for display
    total_sessions = len(all_sessions)
    completed_sessions = len([s for s in all_sessions if s.get("status") == "completed"])
    cancelled_by_student = len([s for s in all_sessions if s.get("status") == "cancelled" and s.get("cancelled_by") == "student"])
    scheduled_sessions = len([s for s in all_sessions if s.get("status") == "scheduled"])
    active_sessions = completed_sessions + scheduled_sessions
    
    # Get ratings for display
    rated_sessions = [s for s in all_sessions if s.get("rating")]
    ratings_map = {"ضعيف": 1, "مقبول": 2, "متوسط": 3, "ممتاز": 4}
    total_rating_points = sum(ratings_map.get(s.get("rating"), 0) for s in rated_sessions)
    
    # Total score (capped at 100)
    total_score = min(booking_points + attendance_points + recitation_points, 100)
    
    # Calculate points needed for next level
    points_to_next = 0
    if total_score < 40:
        points_to_next = 40 - total_score
    elif total_score < 60:
        points_to_next = 60 - total_score
    elif total_score < 75:
        points_to_next = 75 - total_score
    elif total_score < 90:
        points_to_next = 90 - total_score
    
    # Monthly progress (last 6 months)
    now = datetime.now(timezone.utc)
    monthly_data = []
    
    for i in range(6):
        month_start = (now.replace(day=1) - timedelta(days=30*i)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if i == 0:
            month_end = now
        else:
            month_end = (month_start + timedelta(days=32)).replace(day=1) - timedelta(seconds=1)
        
        month_sessions = []
        for s in all_sessions:
            if s.get("scheduled_time"):
                try:
                    session_time = datetime.fromisoformat(s["scheduled_time"].replace('Z', '+00:00'))
                    if session_time.tzinfo is None:
                        session_time = session_time.replace(tzinfo=timezone.utc)
                    if month_start.replace(tzinfo=timezone.utc) <= session_time <= month_end.replace(tzinfo=timezone.utc):
                        month_sessions.append(s)
                except:
                    pass
        
        month_completed = len([s for s in month_sessions if s.get("status") == "completed"])
        month_scheduled = len([s for s in month_sessions if s.get("status") == "scheduled"])
        month_rated = [s for s in month_sessions if s.get("rating")]
        
        monthly_data.append({
            "month": month_start.strftime("%Y-%m"),
            "month_name": month_start.strftime("%B"),
            "sessions_count": len(month_sessions),
            "completed": month_completed,
            "ratings_count": len(month_rated)
        })
    
    # Reverse to show oldest first
    monthly_data.reverse()
    
    # Determine motivational message and level
    if total_score >= 90:
        level = "ممتاز"
        message = "ما شاء الله! أنت من أفضل الطلاب، استمر على هذا التميز 🌟"
        color = "#22c55e"
    elif total_score >= 75:
        level = "جيد جداً"
        message = "أداء رائع! أنت على الطريق الصحيح، واصل التقدم 💪"
        color = "#3b82f6"
    elif total_score >= 60:
        level = "جيد"
        message = "أداء جيد! يمكنك تحقيق المزيد بالمثابرة والالتزام 📈"
        color = "#eab308"
    elif total_score >= 40:
        level = "مقبول"
        message = "لديك إمكانيات كبيرة! حاول زيادة حضورك وستلاحظ الفرق ✨"
        color = "#f97316"
    else:
        level = "يحتاج تحسين"
        message = "لا تستسلم! كل رحلة تبدأ بخطوة، والتزامك سيحقق النتائج 🚀"
        color = "#ef4444"
    
    return {
        "score": total_score,
        "level": level,
        "message": message,
        "color": color,
        "breakdown": {
            "booking_points": booking_points,
            "attendance_points": attendance_points,
            "recitation_points": recitation_points,
            "booking_max": 40,
            "attendance_max": 30,
            "recitation_max": 30
        },
        "stats": {
            "total_sessions": total_sessions,
            "completed_sessions": completed_sessions,
            "scheduled_sessions": scheduled_sessions,
            "cancelled_by_student": cancelled_by_student,
            "rated_sessions": len(rated_sessions),
            "total_rating_points": total_rating_points
        },
        "monthly_progress": monthly_data,
        "trend": 0,
        "trend_message": "ثبات",
        "points_to_next_level": points_to_next,
        "next_booking_bonus": 2 if active_sessions < 20 else 0,
        "tips": {
            "booking_tip": "كل حجز جديد يضيف 2 نقطة" if active_sessions < 20 else "وصلت للحد الأقصى من نقاط الحجز!",
            "recitation_tip": "كل تسميع يضيف 1-4 نقاط حسب التقييم" if total_rating_points < 40 else "وصلت للحد الأقصى من نقاط التسميع!"
        }
    }

# ===== STUDENT NOTES ARCHIVE (PERMANENT) =====

@api_router.post("/students/{student_id}/notes")
async def add_student_note(
    student_id: str,
    note: StudentNoteCreate,
    current_user: User = Depends(get_current_user)
):
    """Add a permanent note to student's archive - Teacher only (cannot be edited or deleted)"""
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="فقط المعلمين يمكنهم إضافة ملاحظات")
    
    # Verify student exists
    student = await db.users.find_one({"user_id": student_id}, {"_id": 0})
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    # Create permanent note
    note_id = f"note_{uuid.uuid4().hex[:12]}"
    note_data = {
        "note_id": note_id,
        "student_id": student_id,
        "student_name": student.get("name", ""),
        "teacher_id": current_user.user_id,
        "teacher_name": current_user.name,
        "session_id": note.session_id,
        "note_type": note.note_type,
        "title": note.title,
        "content": note.content,
        "surah_name": note.surah_name,
        "ayah_from": note.ayah_from,
        "ayah_to": note.ayah_to,
        "rating": note.rating,
        "created_at": datetime.now(timezone.utc).isoformat(),
        # Permanent - cannot be edited or deleted
        "is_permanent": True
    }
    
    await db.student_notes_archive.insert_one(note_data)
    note_data.pop("_id", None)
    
    return {"message": "تم حفظ الملاحظة بنجاح في الأرشيف", "note": note_data}

@api_router.get("/students/{student_id}/notes")
async def get_student_notes(
    student_id: str,
    current_user: User = Depends(get_current_user),
    note_type: Optional[str] = None,
    year: Optional[int] = None,
    month: Optional[int] = None
):
    """Get student's notes archive - accessible by student, their teachers, and admin"""
    # Check access permissions
    is_student = current_user.user_id == student_id
    is_teacher = current_user.role == "teacher"
    is_admin = current_user.email == ADMIN_EMAIL
    
    if not (is_student or is_teacher or is_admin):
        raise HTTPException(status_code=403, detail="غير مصرح لك بعرض هذه الملاحظات")
    
    # Build query
    query = {"student_id": student_id}
    
    if note_type:
        query["note_type"] = note_type
    
    # Filter by year/month if provided
    if year and month:
        start_date = f"{year}-{month:02d}-01T00:00:00"
        if month == 12:
            end_date = f"{year + 1}-01-01T00:00:00"
        else:
            end_date = f"{year}-{month + 1:02d}-01T00:00:00"
        query["created_at"] = {"$gte": start_date, "$lt": end_date}
    elif year:
        query["created_at"] = {"$gte": f"{year}-01-01T00:00:00", "$lt": f"{year + 1}-01-01T00:00:00"}
    
    # Get notes sorted by date (newest first)
    notes_cursor = db.student_notes_archive.find(query, {"_id": 0}).sort("created_at", -1)
    notes = await notes_cursor.to_list(length=500)
    
    # Group by month for timeline view
    notes_by_month = {}
    for n in notes:
        created = n.get("created_at", "")
        if created:
            month_key = created[:7]  # YYYY-MM
            if month_key not in notes_by_month:
                notes_by_month[month_key] = []
            notes_by_month[month_key].append(n)
    
    # Get statistics
    stats = {
        "total_notes": len(notes),
        "by_type": {},
        "by_rating": {},
        "teachers_count": len(set(n.get("teacher_id") for n in notes))
    }
    
    for n in notes:
        # Count by type
        ntype = n.get("note_type", "general")
        stats["by_type"][ntype] = stats["by_type"].get(ntype, 0) + 1
        
        # Count by rating
        rating = n.get("rating")
        if rating:
            stats["by_rating"][rating] = stats["by_rating"].get(rating, 0) + 1
    
    return {
        "student_id": student_id,
        "notes": notes,
        "notes_by_month": notes_by_month,
        "stats": stats
    }

@api_router.get("/teacher/my-students-notes")
async def get_teacher_students_notes(
    current_user: User = Depends(get_current_user)
):
    """Get all notes added by this teacher"""
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="للمعلمين فقط")
    
    notes_cursor = db.student_notes_archive.find(
        {"teacher_id": current_user.user_id},
        {"_id": 0}
    ).sort("created_at", -1)
    
    notes = await notes_cursor.to_list(length=500)
    
    # Group by student
    notes_by_student = {}
    for n in notes:
        sid = n.get("student_id")
        if sid not in notes_by_student:
            notes_by_student[sid] = {
                "student_id": sid,
                "student_name": n.get("student_name", ""),
                "notes": []
            }
        notes_by_student[sid]["notes"].append(n)
    
    return {
        "total_notes": len(notes),
        "students_count": len(notes_by_student),
        "notes_by_student": list(notes_by_student.values())
    }

# ===== COMPLETE STUDENT PROFILE FOR TEACHERS =====

@api_router.get("/teacher/student-profile/{student_id}")
async def get_student_full_profile(
    student_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get complete student profile - for teachers and admin only"""
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="للمعلمين فقط")
    
    # Get student basic info
    student = await db.users.find_one(
        {"user_id": student_id, "role": "student"},
        {"_id": 0, "password_hash": 0}
    )
    
    if not student:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    
    # Get all sessions for this student
    sessions_cursor = db.sessions.find(
        {"student_id": student_id},
        {"_id": 0}
    ).sort("scheduled_time", -1)
    all_sessions = await sessions_cursor.to_list(length=500)
    
    # Calculate attendance statistics
    total_sessions = len(all_sessions)
    completed_sessions = [s for s in all_sessions if s.get("status") == "completed"]
    cancelled_by_student = [s for s in all_sessions if s.get("status") == "cancelled" and s.get("cancelled_by") == "student"]
    cancelled_by_teacher = [s for s in all_sessions if s.get("status") == "cancelled" and s.get("cancelled_by") == "teacher"]
    scheduled_sessions = [s for s in all_sessions if s.get("status") == "scheduled"]
    
    # Calculate attendance rate
    attendance_denominator = len(completed_sessions) + len(cancelled_by_student)
    attendance_rate = (len(completed_sessions) / attendance_denominator * 100) if attendance_denominator > 0 else 100
    
    # Get ratings statistics
    ratings_map = {"ضعيف": 1, "مقبول": 2, "متوسط": 3, "ممتاز": 4}
    rated_sessions = [s for s in all_sessions if s.get("rating")]
    ratings_count = {"ممتاز": 0, "متوسط": 0, "مقبول": 0, "ضعيف": 0}
    
    for s in rated_sessions:
        rating = s.get("rating")
        if rating in ratings_count:
            ratings_count[rating] += 1
    
    # Calculate average rating
    if rated_sessions:
        total_rating_points = sum(ratings_map.get(s.get("rating"), 0) for s in rated_sessions)
        avg_rating = total_rating_points / len(rated_sessions)
        avg_rating_text = "ممتاز" if avg_rating >= 3.5 else "متوسط" if avg_rating >= 2.5 else "مقبول" if avg_rating >= 1.5 else "ضعيف"
    else:
        avg_rating = 0
        avg_rating_text = "لا يوجد تقييم"
    
    # Get teacher notes for this student
    notes_cursor = db.student_notes_archive.find(
        {"student_id": student_id},
        {"_id": 0}
    ).sort("created_at", -1)
    notes = await notes_cursor.to_list(length=100)
    
    # Get memorization progress from memorization_progress collection
    mem_cursor = db.memorization_progress.find(
        {"student_id": student_id},
        {"_id": 0}
    ).sort("created_at", -1)
    memorization_entries = await mem_cursor.to_list(length=200)
    
    # Enrich memorization entries with teacher names
    teacher_cache_profile = {}
    for entry in memorization_entries:
        tid = entry.get("teacher_id")
        if tid and not entry.get("teacher_name"):
            if tid not in teacher_cache_profile:
                t = await db.users.find_one({"user_id": tid}, {"_id": 0, "name": 1})
                teacher_cache_profile[tid] = t.get("name") if t else "غير معروف"
            entry["teacher_name"] = teacher_cache_profile[tid]
    
    # Get surahs covered from memorization_progress
    surahs_from_progress = list(set(e.get("surah_name") for e in memorization_entries if e.get("surah_name")))
    
    # Also check legacy notes from student_notes_archive
    memorization_notes = [n for n in notes if n.get("note_type") == "recitation" and n.get("surah_name")]
    surahs_from_notes = list(set(n.get("surah_name") for n in memorization_notes if n.get("surah_name")))
    
    # Merge both surah lists
    all_surahs_covered = list(set(surahs_from_progress + surahs_from_notes))
    
    # Sessions with this teacher
    sessions_with_current_teacher = [s for s in all_sessions if s.get("teacher_id") == current_user.user_id]
    
    # Recent sessions (last 10)
    recent_sessions = []
    for s in all_sessions[:10]:
        teacher_info = await db.users.find_one({"user_id": s.get("teacher_id")}, {"_id": 0, "name": 1})
        recent_sessions.append({
            "session_id": s.get("session_id"),
            "teacher_id": s.get("teacher_id"),
            "scheduled_time": s.get("scheduled_time"),
            "status": s.get("status"),
            "rating": s.get("rating"),
            "teacher_name": teacher_info.get("name") if teacher_info else "غير معروف",
            "cancellation_reason": s.get("cancellation_reason"),
            "cancelled_by": s.get("cancelled_by"),
            "auto_cancelled_at": s.get("auto_cancelled_at"),
            "join_clicked_at": s.get("join_clicked_at"),
            "attendance_confirmed": s.get("attendance_confirmed"),
            "attendance_confirmed_at": s.get("attendance_confirmed_at")
        })
    
    # Monthly attendance (last 6 months)
    now = datetime.now(timezone.utc)
    monthly_attendance = []
    
    for i in range(6):
        month_start = (now.replace(day=1) - timedelta(days=30*i)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        month_sessions = []
        for s in all_sessions:
            if s.get("scheduled_time"):
                try:
                    session_time = datetime.fromisoformat(s["scheduled_time"].replace('Z', '+00:00'))
                    if session_time.tzinfo is None:
                        session_time = session_time.replace(tzinfo=timezone.utc)
                    if session_time.year == month_start.year and session_time.month == month_start.month:
                        month_sessions.append(s)
                except:
                    pass
        
        month_completed = len([s for s in month_sessions if s.get("status") == "completed"])
        month_cancelled = len([s for s in month_sessions if s.get("status") == "cancelled" and s.get("cancelled_by") == "student"])
        
        monthly_attendance.append({
            "month": month_start.strftime("%Y-%m"),
            "month_name": month_start.strftime("%B %Y"),
            "total": len(month_sessions),
            "completed": month_completed,
            "cancelled_by_student": month_cancelled,
            "attendance_rate": round(month_completed / (month_completed + month_cancelled) * 100) if (month_completed + month_cancelled) > 0 else 100
        })
    
    monthly_attendance.reverse()
    
    return {
        "student": {
            "user_id": student.get("user_id"),
            "name": student.get("name"),
            "email": student.get("email"),
            "picture_url": student.get("picture_url"),
            "created_at": student.get("created_at"),
            "is_restricted": student.get("is_restricted", False)
        },
        "statistics": {
            "total_sessions": total_sessions,
            "completed_sessions": len(completed_sessions),
            "scheduled_sessions": len(scheduled_sessions),
            "cancelled_by_student": len(cancelled_by_student),
            "cancelled_by_teacher": len(cancelled_by_teacher),
            "attendance_rate": round(attendance_rate, 1),
            "sessions_with_you": len(sessions_with_current_teacher)
        },
        "ratings": {
            "total_rated": len(rated_sessions),
            "average_rating": round(avg_rating, 2),
            "average_rating_text": avg_rating_text,
            "breakdown": ratings_count
        },
        "memorization": {
            "surahs_covered": all_surahs_covered,
            "total_recitation_notes": len(memorization_notes),
            "total_progress_entries": len(memorization_entries),
            "progress_log": memorization_entries[:20]
        },
        "notes": {
            "total": len(notes),
            "recent": notes[:5]  # Last 5 notes
        },
        "recent_sessions": recent_sessions,
        "monthly_attendance": monthly_attendance
    }


# ============================================================
# ===== WEEKLY MEMORIZATION PLAN + PEER REVIEW (PHASE 1) =====
# Additive only. New collections: peer_partnerships,
# peer_review_slots, peer_review_sessions, peer_evaluations,
# weekly_plans, peer_notifications.
# New field on user: review_method ('self' | 'peer').
# Smart recommendations score peers by "level" = juz/page count
# derived from existing memorization_progress (Quran 604 pages,
# 30 juz, ~20 pages per juz).
# ============================================================

class ReviewMethodPayload(BaseModel):
    method: str  # 'self' | 'peer'

class PeerRequestPayload(BaseModel):
    target_student_id: str
    note: Optional[str] = None

class ManualPeerPartnershipPayload(BaseModel):
    student1_id: str
    student2_id: str

REVIEW_METHODS = {"self", "peer"}
PEER_STATUS_PENDING = "pending"
PEER_STATUS_APPROVED = "approved"
PEER_STATUS_REJECTED = "rejected"
PEER_STATUS_CANCELLED = "cancelled"


async def _get_memorization_position(student_id: str) -> dict:
    """Deep memorization detector.

    Returns a unified picture of *where a student actually is* in their Hifz journey,
    used by:
      • smart weekly plan generation,
      • peer recommendations,
      • PDF student report,
      • student profile.

    Returns dict:
      {
        current_surah:       latest surah they were recorded on (by created_at), or None,
        current_surah_number, current_to_ayah,
        memorized_surahs:    [{number, name, ayahs_recorded}], all surahs they have entries in,
        surah_count:         number of distinct surahs touched,
        direction:           'from_end' (Juz Amma learner) | 'from_start' | 'unknown',
        estimated_pages:     conservative estimate of pages they've covered,
        estimated_juz:       estimated_pages / 20,
        bucket:              granular bucket key (juz_amma / 5_juz / 10_juz / ...),
        bucket_label:        Arabic label,
        review_pool:         list of recently-touched surah names (for review days),
        last_recorded_at:    ISO timestamp of latest entry, or None,
      }
    """
    entries = await db.memorization_progress.find(
        {"student_id": student_id},
        {"_id": 0, "surah_name": 1, "from_ayah": 1, "to_ayah": 1,
         "quality": 1, "created_at": 1, "surah_number": 1}
    ).sort("created_at", -1).to_list(length=500)

    # Normalize surah names (Arabic data is often dirty: trailing spaces, alt forms)
    def _normalize(name):
        if not name:
            return None
        n = name.strip()
        # Try direct match first
        if n in SURAH_MAP:
            return n
        # Compare after removing whitespace / Arabic tatweel
        stripped = n.replace(" ", "").replace("\u0640", "")
        for s in QURAN_SURAHS:
            if s["name"].replace(" ", "").replace("\u0640", "") == stripped:
                return s["name"]
        # Some dirty entries pack multiple surahs (e.g., "الإسراء و الكهف") — pick the first match
        for token in n.replace("،", " ").replace("/", " ").replace("-", " ").split():
            t = token.strip()
            if t in SURAH_MAP:
                return t
            for s in QURAN_SURAHS:
                if s["name"] == t:
                    return s["name"]
        return None

    # Build memorized surahs map and locate the most-recent valid entry
    memorized = {}     # surah_number -> {name, ayahs_recorded, last_at, qualities}
    review_pool = []   # ordered list of recently-touched surah names
    current_surah_name = None
    current_surah_number = None
    current_to_ayah = 0
    last_recorded_at = None

    for e in entries:
        norm = _normalize(e.get("surah_name"))
        # Some entries already store surah_number
        sn_num = e.get("surah_number")
        meta = SURAH_MAP.get(norm) if norm else (SURAH_BY_NUMBER.get(sn_num) if sn_num else None)
        if not meta:
            continue
        snum = meta["number"]
        sname = meta["name"]
        if last_recorded_at is None:
            last_recorded_at = e.get("created_at")
        if current_surah_name is None and e.get("quality") in ("متوسط", "ممتاز"):
            current_surah_name = sname
            current_surah_number = snum
            try:
                current_to_ayah = max(int(e.get("to_ayah") or 0), int(e.get("from_ayah") or 0))
            except Exception:
                current_to_ayah = 0
        # Track all touched surahs
        rec = memorized.setdefault(snum, {"number": snum, "name": sname, "ayahs_recorded": 0, "last_at": e.get("created_at")})
        try:
            f = int(e.get("from_ayah") or 0)
            t = int(e.get("to_ayah") or 0)
            if t >= f >= 1:
                rec["ayahs_recorded"] += (t - f + 1)
        except Exception:
            pass
        if sname not in review_pool:
            review_pool.append(sname)

    # Fallback: if no متوسط/ممتاز entry, use the most-recent valid entry of any quality
    if not current_surah_name:
        for e in entries:
            norm = _normalize(e.get("surah_name"))
            meta = SURAH_MAP.get(norm) if norm else (SURAH_BY_NUMBER.get(e.get("surah_number")) if e.get("surah_number") else None)
            if not meta:
                continue
            current_surah_name = meta["name"]
            current_surah_number = meta["number"]
            try:
                current_to_ayah = max(int(e.get("to_ayah") or 0), int(e.get("from_ayah") or 0))
            except Exception:
                current_to_ayah = 0
            break

    # Estimate direction + scope from the touched-surah numbers
    nums = sorted(memorized.keys())
    if not nums:
        direction = "unknown"
        estimated_pages = 0.0
    else:
        avg_n = sum(nums) / len(nums)
        min_n, max_n = min(nums), max(nums)
        if avg_n >= 60:  # mostly Juz Amma & near (#78-114 area)
            direction = "from_end"
            total_ayahs = sum(SURAH_BY_NUMBER[n]["ayah_count"] for n in range(min_n, 115))
            estimated_pages = round(total_ayahs / 10.3, 1)
        elif avg_n <= 10:
            direction = "from_start"
            total_ayahs = sum(SURAH_BY_NUMBER[n]["ayah_count"] for n in range(1, max_n + 1))
            estimated_pages = round(total_ayahs / 10.3, 1)
        else:
            direction = "mixed"
            total_ayahs = sum(SURAH_BY_NUMBER[n]["ayah_count"] for n in nums)
            estimated_pages = round(total_ayahs / 10.3, 1)

    # The student's *actual current frontier* is the furthest surah they've reached,
    # not necessarily the one they recorded last (a teacher may revisit early surahs
    # for review). Override `current_surah_*` to reflect the real frontier per direction.
    if nums:
        frontier_num = min_n if direction == "from_end" else max_n
        frontier_meta = SURAH_BY_NUMBER.get(frontier_num)
        if frontier_meta:
            current_surah_name = frontier_meta["name"]
            current_surah_number = frontier_meta["number"]
            # Find the recorded `to_ayah` on that frontier surah (highest one we have)
            highest_to = 0
            for e in entries:
                norm = _normalize(e.get("surah_name"))
                meta = SURAH_MAP.get(norm) if norm else (SURAH_BY_NUMBER.get(e.get("surah_number")) if e.get("surah_number") else None)
                if meta and meta["number"] == frontier_num:
                    try:
                        t = max(int(e.get("to_ayah") or 0), int(e.get("from_ayah") or 0))
                        if t > highest_to:
                            highest_to = t
                    except Exception:
                        pass
            current_to_ayah = highest_to

    estimated_juz = round(estimated_pages / 20.0, 1)

    if estimated_juz <= 2:
        bucket, bucket_label = "juz_amma", "حول جزء عمّ"
    elif estimated_juz <= 7:
        bucket, bucket_label = "5_juz", "حول 5 أجزاء"
    elif estimated_juz <= 12:
        bucket, bucket_label = "10_juz", "حول 10 أجزاء"
    elif estimated_juz <= 17:
        bucket, bucket_label = "15_juz", "حول 15 جزءاً"
    elif estimated_juz <= 22:
        bucket, bucket_label = "20_juz", "حول 20 جزءاً"
    elif estimated_juz <= 27:
        bucket, bucket_label = "25_juz", "حول 25 جزءاً"
    else:
        bucket, bucket_label = "30_juz", "حفظ كامل (30 جزءاً)"

    return {
        "current_surah": current_surah_name,
        "current_surah_number": current_surah_number,
        "current_to_ayah": current_to_ayah,
        "memorized_surahs": [memorized[n] for n in nums],
        "surah_count": len(nums),
        "direction": direction,
        "estimated_pages": estimated_pages,
        "estimated_juz": estimated_juz,
        "bucket": bucket,
        "bucket_label": bucket_label,
        "review_pool": review_pool[:10],
        "last_recorded_at": last_recorded_at,
    }


async def _compute_student_level(student_id: str) -> dict:
    """Backwards-compatible thin wrapper around _get_memorization_position()."""
    pos = await _get_memorization_position(student_id)
    return {
        "pages": pos["estimated_pages"],
        "juz": pos["estimated_juz"],
        "total_ayahs": int(pos["estimated_pages"] * 10.3),
        "last_surah": pos["current_surah"],
        "bucket": pos["bucket"],
        "bucket_label": pos["bucket_label"],
    }


async def _push_peer_notification(user_id: str, title: str, body: str, kind: str, ref: Optional[str] = None):
    await db.peer_notifications.insert_one({
        "notif_id": f"pnot_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "title": title,
        "body": body,
        "kind": kind,
        "ref": ref,
        "is_read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


@api_router.put("/student/review-method")
async def set_student_review_method(payload: ReviewMethodPayload, current_user: User = Depends(get_current_user)):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="هذا المسار للطلاب فقط")
    if payload.method not in REVIEW_METHODS:
        raise HTTPException(status_code=400, detail="طريقة المراجعة غير صحيحة")
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"review_method": payload.method,
                  "review_method_updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "تم حفظ طريقة المراجعة", "method": payload.method}


@api_router.get("/student/review-status")
async def get_student_review_status(current_user: User = Depends(get_current_user)):
    """Single endpoint giving the student everything about their review setup."""
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="هذا المسار للطلاب فقط")
    me = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0, "review_method": 1})
    method = (me or {}).get("review_method")
    # Find an active or pending partnership where this user is involved
    partnership = await db.peer_partnerships.find_one(
        {"$or": [{"requester_id": current_user.user_id}, {"target_id": current_user.user_id}],
         "status": {"$in": [PEER_STATUS_PENDING, PEER_STATUS_APPROVED]}},
        {"_id": 0}
    )
    partner = None
    if partnership:
        other_id = partnership["target_id"] if partnership["requester_id"] == current_user.user_id else partnership["requester_id"]
        u = await db.users.find_one({"user_id": other_id}, {"_id": 0, "user_id": 1, "name": 1})
        partner = u
    return {
        "review_method": method,
        "partnership": partnership,
        "partner": partner,
        "i_am_requester": bool(partnership and partnership["requester_id"] == current_user.user_id),
    }


@api_router.get("/student/peer-recommendations")
async def get_peer_recommendations(current_user: User = Depends(get_current_user)):
    """Recommend peers based on real memorization progress, not generic level.

    Scoring (highest first):
      1. Same direction (forward/from_end) — must match if both known: +1000
      2. Estimated juz proximity:               +800 if same bucket, else 200 - 30 × juz_diff
      3. Current-surah proximity (Mushaf):      +300 if same surah, +120 if ≤3 surahs apart
      4. Same direction & overlapping review:   +50 small overlap bonus
    """
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="هذا المسار للطلاب فقط")
    my_pos = await _get_memorization_position(current_user.user_id)

    excluded = {current_user.user_id}
    busy = await db.peer_partnerships.find(
        {"status": {"$in": [PEER_STATUS_PENDING, PEER_STATUS_APPROVED]}},
        {"_id": 0, "requester_id": 1, "target_id": 1}
    ).to_list(length=2000)
    for p in busy:
        excluded.add(p["requester_id"]); excluded.add(p["target_id"])

    others = await db.users.find(
        {"role": "student", "user_id": {"$nin": list(excluded)}},
        {"_id": 0, "user_id": 1, "name": 1}
    ).to_list(length=500)

    scored = []
    for s in others:
        pos = await _get_memorization_position(s["user_id"])
        juz_diff = abs(pos["estimated_juz"] - my_pos["estimated_juz"])
        page_diff = abs(pos["estimated_pages"] - my_pos["estimated_pages"])
        same_bucket = pos["bucket"] == my_pos["bucket"]
        same_direction = (
            my_pos["direction"] != "unknown"
            and pos["direction"] != "unknown"
            and pos["direction"] == my_pos["direction"]
        )

        # Compute score
        score = 0.0
        if same_direction:
            score += 1000
        elif my_pos["direction"] == "unknown" or pos["direction"] == "unknown":
            score += 300  # tolerance when we don't know direction
        # Juz/bucket
        if same_bucket:
            score += 800
        else:
            score += max(0, 200 - 30 * juz_diff)

        # Current surah proximity (Mushaf order distance)
        surah_proximity_reason = None
        if my_pos["current_surah_number"] and pos["current_surah_number"]:
            surah_diff = abs(my_pos["current_surah_number"] - pos["current_surah_number"])
            if surah_diff == 0:
                score += 300
                surah_proximity_reason = f"يحفظان نفس السورة ({pos['current_surah']})"
            elif surah_diff <= 3:
                score += 180
                surah_proximity_reason = f"السور قريبة جداً (فارق {surah_diff} سور)"
            elif surah_diff <= 8:
                score += 80
                surah_proximity_reason = f"نطاق الحفظ مشابه (فارق {surah_diff} سور)"

        # Review-pool overlap (light)
        overlap = set(my_pos.get("review_pool", [])) & set(pos.get("review_pool", []))
        if overlap:
            score += min(60, 20 * len(overlap))

        # Build Arabic reason
        if same_bucket:
            base = f"نفس مستوى الحفظ — {pos['bucket_label']}"
        elif juz_diff <= 2:
            base = f"موقع الحفظ قريب — فارق ~{round(juz_diff,1)} جزء"
        elif juz_diff <= 5:
            base = f"مستوى حفظ متقارب — فارق ~{round(juz_diff,1)} أجزاء"
        else:
            base = f"فارق واضح في الحفظ (~{round(juz_diff,1)} جزء)"
        if surah_proximity_reason:
            base += " · " + surah_proximity_reason

        scored.append({
            "user_id": s["user_id"],
            "name": s["name"],
            "pages": pos["estimated_pages"],
            "juz": pos["estimated_juz"],
            "bucket": pos["bucket"],
            "bucket_label": pos["bucket_label"],
            "current_surah": pos["current_surah"],
            "current_surah_number": pos["current_surah_number"],
            "direction": pos["direction"],
            "surah_count": pos["surah_count"],
            "score": round(score, 1),
            "diff_pages": round(page_diff, 1),
            "diff_juz": round(juz_diff, 1),
            "reason": base,
        })

    scored.sort(key=lambda r: -r["score"])
    return {
        "my_level": {
            "pages": my_pos["estimated_pages"],
            "juz": my_pos["estimated_juz"],
            "bucket": my_pos["bucket"],
            "bucket_label": my_pos["bucket_label"],
            "current_surah": my_pos["current_surah"],
            "current_surah_number": my_pos["current_surah_number"],
            "direction": my_pos["direction"],
            "surah_count": my_pos["surah_count"],
        },
        "recommendations": scored[:20],
    }


@api_router.get("/admin/peer-recommendations/{student_id}")
async def admin_get_peer_recommendations_for_student(
    student_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Admin gets smart peer recommendations for a selected student.

    This is the admin version of /student/peer-recommendations.
    The admin selects the base student, and the system recommends available peers
    based on real memorization progress.
    """
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="هذا المسار للمشرف فقط")

    base_student = await db.users.find_one(
        {"user_id": student_id, "role": "student"},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1}
    )

    if not base_student:
        raise HTTPException(status_code=404, detail="الطالب الأول غير موجود")

    # Read the real memorization position of the selected first student
    base_pos = await _get_memorization_position(student_id)

    # Exclude the selected student and any student already in pending/approved partnership
    excluded_ids = {student_id}

    busy_partnerships = await db.peer_partnerships.find(
        {"status": {"$in": [PEER_STATUS_PENDING, PEER_STATUS_APPROVED]}},
        {"_id": 0, "requester_id": 1, "target_id": 1}
    ).to_list(length=2000)

    for partnership in busy_partnerships:
        if partnership.get("requester_id"):
            excluded_ids.add(partnership["requester_id"])
        if partnership.get("target_id"):
            excluded_ids.add(partnership["target_id"])

    candidate_students = await db.users.find(
        {
            "role": "student",
            "user_id": {"$nin": list(excluded_ids)}
        },
        {"_id": 0, "user_id": 1, "name": 1, "email": 1}
    ).to_list(length=500)

    recommendations = []

    for candidate in candidate_students:
        candidate_pos = await _get_memorization_position(candidate["user_id"])

        base_pages = float(base_pos.get("estimated_pages", 0) or 0)
        candidate_pages = float(candidate_pos.get("estimated_pages", 0) or 0)

        base_juz = float(base_pos.get("estimated_juz", 0) or 0)
        candidate_juz = float(candidate_pos.get("estimated_juz", 0) or 0)

        page_diff = abs(candidate_pages - base_pages)
        juz_diff = abs(candidate_juz - base_juz)

        same_bucket = candidate_pos.get("bucket") == base_pos.get("bucket")

        same_direction = (
            base_pos.get("direction") not in [None, "", "unknown"]
            and candidate_pos.get("direction") not in [None, "", "unknown"]
            and candidate_pos.get("direction") == base_pos.get("direction")
        )

        score = 0.0

        # Same memorization direction is helpful
        if same_direction:
            score += 1000
        elif base_pos.get("direction") == "unknown" or candidate_pos.get("direction") == "unknown":
            score += 300

        # Same memorization bucket is the strongest recommendation criterion
        if same_bucket:
            score += 800
        else:
            score += max(0, 250 - 35 * juz_diff)

        # Page proximity
        score += max(0, 300 - page_diff)

        # Surah proximity
        surah_proximity_reason = None
        base_surah_number = base_pos.get("current_surah_number")
        candidate_surah_number = candidate_pos.get("current_surah_number")

        if base_surah_number and candidate_surah_number:
            surah_diff = abs(int(base_surah_number) - int(candidate_surah_number))

            if surah_diff == 0:
                score += 300
                surah_proximity_reason = f"يحفظان نفس السورة ({candidate_pos.get('current_surah')})"
            elif surah_diff <= 3:
                score += 180
                surah_proximity_reason = f"السور قريبة جدًا (فارق {surah_diff} سور)"
            elif surah_diff <= 8:
                score += 80
                surah_proximity_reason = f"نطاق الحفظ مشابه (فارق {surah_diff} سور)"

        # Review pool overlap if available
        base_review_pool = set(base_pos.get("review_pool", []) or [])
        candidate_review_pool = set(candidate_pos.get("review_pool", []) or [])
        overlap = base_review_pool & candidate_review_pool

        if overlap:
            score += min(80, 20 * len(overlap))

        # Arabic explanation shown in frontend
        if same_bucket:
            reason = f"نفس مستوى الحفظ — {candidate_pos.get('bucket_label', 'مستوى مشابه')}"
        elif juz_diff <= 2:
            reason = f"موقع الحفظ قريب — فارق ~{round(juz_diff, 1)} جزء"
        elif juz_diff <= 5:
            reason = f"مستوى حفظ متقارب — فارق ~{round(juz_diff, 1)} أجزاء"
        else:
            reason = f"فارق واضح في الحفظ (~{round(juz_diff, 1)} جزء)"

        if surah_proximity_reason:
            reason += " · " + surah_proximity_reason

        recommendations.append({
            "user_id": candidate["user_id"],
            "name": candidate.get("name"),
            "email": candidate.get("email"),
            "pages": round(candidate_pages, 1),
            "juz": round(candidate_juz, 1),
            "bucket": candidate_pos.get("bucket"),
            "bucket_label": candidate_pos.get("bucket_label"),
            "current_surah": candidate_pos.get("current_surah"),
            "current_surah_number": candidate_pos.get("current_surah_number"),
            "direction": candidate_pos.get("direction"),
            "surah_count": candidate_pos.get("surah_count"),
            "score": round(score, 1),
            "diff_pages": round(page_diff, 1),
            "diff_juz": round(juz_diff, 1),
            "reason": reason,
        })

    recommendations.sort(key=lambda r: -r["score"])

    return {
        "base_student": {
            "user_id": base_student["user_id"],
            "name": base_student.get("name"),
            "email": base_student.get("email"),
        },
        "base_level": {
            "pages": round(float(base_pos.get("estimated_pages", 0) or 0), 1),
            "juz": round(float(base_pos.get("estimated_juz", 0) or 0), 1),
            "bucket": base_pos.get("bucket"),
            "bucket_label": base_pos.get("bucket_label"),
            "current_surah": base_pos.get("current_surah"),
            "current_surah_number": base_pos.get("current_surah_number"),
            "direction": base_pos.get("direction"),
            "surah_count": base_pos.get("surah_count"),
        },
        "recommendations": recommendations[:30],
    }

@api_router.get("/student/search")
async def search_students(q: str = "", current_user: User = Depends(get_current_user)):
    """Search students by name (for picking a peer partner)."""
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="هذا المسار للطلاب فقط")
    q = (q or "").strip()
    if len(q) < 2:
        return []
    # Case-insensitive match by name; exclude self
    students = await db.users.find(
        {"role": "student", "user_id": {"$ne": current_user.user_id},
         "name": {"$regex": re.escape(q), "$options": "i"}},
        {"_id": 0, "user_id": 1, "name": 1}
    ).to_list(length=20)
    # Annotate availability
    busy = await db.peer_partnerships.find(
        {"status": {"$in": [PEER_STATUS_PENDING, PEER_STATUS_APPROVED]}},
        {"_id": 0, "requester_id": 1, "target_id": 1}
    ).to_list(length=2000)
    busy_ids = set()
    for p in busy:
        busy_ids.add(p["requester_id"])
        busy_ids.add(p["target_id"])
    for s in students:
        s["is_available"] = s["user_id"] not in busy_ids
    return students

@api_router.get("/admin/student-search")
async def admin_search_students(
    q: str = "",
    exclude_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Admin searches all students by name/email for manual peer pairing."""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="هذا المسار للمشرف فقط")

    q = (q or "").strip()
    if len(q) < 2:
        return []

    query = {
        "role": "student",
        "$or": [
            {"name": {"$regex": re.escape(q), "$options": "i"}},
            {"email": {"$regex": re.escape(q), "$options": "i"}},
        ]
    }

    if exclude_id:
        query["user_id"] = {"$ne": exclude_id}

    students = await db.users.find(
        query,
        {"_id": 0, "user_id": 1, "name": 1, "email": 1}
    ).to_list(length=30)

    busy = await db.peer_partnerships.find(
        {"status": {"$in": [PEER_STATUS_PENDING, PEER_STATUS_APPROVED]}},
        {"_id": 0, "requester_id": 1, "target_id": 1}
    ).to_list(length=2000)

    busy_ids = set()
    for p in busy:
        busy_ids.add(p["requester_id"])
        busy_ids.add(p["target_id"])

    for s in students:
        s["is_available"] = s["user_id"] not in busy_ids
        if s["user_id"] == exclude_id:
            s["is_available"] = False

    return students

@api_router.post("/peers/request")
async def request_peer_partner(payload: PeerRequestPayload, current_user: User = Depends(get_current_user)):
    """Student A requests Student B as a peer. Pending teacher/admin approval."""
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="إرسال الطلب للطلاب فقط")
    me = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0, "review_method": 1})
    if (me or {}).get("review_method") != "peer":
        raise HTTPException(status_code=400, detail="عليك اختيار طريقة المراجعة الزوجية أولاً")
    if payload.target_student_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="لا يمكن أن تكون قرين نفسك")
    target = await db.users.find_one({"user_id": payload.target_student_id}, {"_id": 0, "user_id": 1, "name": 1, "role": 1})
    if not target or target.get("role") != "student":
        raise HTTPException(status_code=404, detail="لم يتم العثور على الطالب المختار")
    # Either side must be free
    busy = await db.peer_partnerships.find_one({
        "$or": [
            {"requester_id": current_user.user_id, "status": {"$in": [PEER_STATUS_PENDING, PEER_STATUS_APPROVED]}},
            {"target_id": current_user.user_id, "status": {"$in": [PEER_STATUS_PENDING, PEER_STATUS_APPROVED]}},
            {"requester_id": payload.target_student_id, "status": {"$in": [PEER_STATUS_PENDING, PEER_STATUS_APPROVED]}},
            {"target_id": payload.target_student_id, "status": {"$in": [PEER_STATUS_PENDING, PEER_STATUS_APPROVED]}},
        ]
    }, {"_id": 0})
    if busy:
        # Be specific about who's busy
        if busy["requester_id"] == current_user.user_id or busy["target_id"] == current_user.user_id:
            raise HTTPException(status_code=400, detail="لديك طلب قائم أو شراكة نشطة بالفعل")
        raise HTTPException(status_code=400, detail="الطالب المختار لديه شراكة قائمة بالفعل")
    my_level = await _compute_student_level(current_user.user_id)
    tg_level = await _compute_student_level(payload.target_student_id)
    pid = f"pair_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "partnership_id": pid,
        "requester_id": current_user.user_id,
        "requester_name": current_user.name,
        "requester_level": my_level,
        "target_id": payload.target_student_id,
        "target_name": target["name"],
        "target_level": tg_level,
        "note": payload.note,
        "status": PEER_STATUS_PENDING,
        "created_at": now,
        "decided_at": None,
        "decided_by": None,
        "reject_reason": None,
    }
    await db.peer_partnerships.insert_one(doc)
    # Notify target
    await _push_peer_notification(
        payload.target_student_id,
        "طلب قرين مراجعة جديد",
        f"الطالب {current_user.name} اختارك قرين مراجعة. ينتظر الطلب موافقة الإدارة.",
        "peer_selected", pid
    )
    doc.pop("_id", None)
    return doc


@api_router.get("/peers/notifications")
async def get_my_peer_notifications(current_user: User = Depends(get_current_user)):
    items = await db.peer_notifications.find(
        {"user_id": current_user.user_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(length=50)
    return items


@api_router.post("/peers/notifications/{notif_id}/read")
async def mark_peer_notif_read(notif_id: str, current_user: User = Depends(get_current_user)):
    await db.peer_notifications.update_one(
        {"notif_id": notif_id, "user_id": current_user.user_id},
        {"$set": {"is_read": True}}
    )
    return {"message": "OK"}


@api_router.get("/admin/peer-requests")
async def admin_list_peer_requests(
    status: str = "pending",
    current_user: User = Depends(get_current_user)
):
    _require_teacher_or_admin(current_user)
    if status not in {PEER_STATUS_PENDING, PEER_STATUS_APPROVED, PEER_STATUS_REJECTED, "all"}:
        raise HTTPException(status_code=400, detail="حالة غير صحيحة")
    query = {} if status == "all" else {"status": status}
    items = await db.peer_partnerships.find(query, {"_id": 0}).sort("created_at", -1).to_list(length=500)
    return items

@api_router.post("/admin/peer-partnerships/manual")
async def admin_create_manual_peer_partnership(
    payload: ManualPeerPartnershipPayload,
    current_user: User = Depends(get_current_user)
):
    """Admin manually pairs two students as approved peer review partners."""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="تعيين قرين المراجعة للمشرف فقط")

    if payload.student1_id == payload.student2_id:
        raise HTTPException(status_code=400, detail="لا يمكن اختيار نفس الطالب مرتين")

    student1 = await db.users.find_one({"user_id": payload.student1_id, "role": "student"}, {"_id": 0})
    student2 = await db.users.find_one({"user_id": payload.student2_id, "role": "student"}, {"_id": 0})

    if not student1 or not student2:
        raise HTTPException(status_code=404, detail="يجب اختيار طالبين موجودين بدور طالب")

    existing = await db.peer_partnerships.find_one({
        "$or": [
            {"requester_id": payload.student1_id},
            {"target_id": payload.student1_id},
            {"requester_id": payload.student2_id},
            {"target_id": payload.student2_id},
        ],
        "status": PEER_STATUS_APPROVED
    }, {"_id": 0})

    if existing:
        raise HTTPException(status_code=400, detail="أحد الطالبين لديه قرين مراجعة فعّال مسبقًا")

    pending_existing = await db.peer_partnerships.find_one({
        "$or": [
            {"requester_id": payload.student1_id},
            {"target_id": payload.student1_id},
            {"requester_id": payload.student2_id},
            {"target_id": payload.student2_id},
        ],
        "status": PEER_STATUS_PENDING
    }, {"_id": 0})

    if pending_existing:
        raise HTTPException(status_code=400, detail="أحد الطالبين لديه طلب قرين قيد الانتظار")

    partnership_id = f"peer_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()

    level1 = await _compute_student_level(payload.student1_id)
    level2 = await _compute_student_level(payload.student2_id)

    doc = {
        "partnership_id": partnership_id,
        "requester_id": payload.student1_id,
        "requester_name": student1.get("name"),
        "target_id": payload.student2_id,
        "target_name": student2.get("name"),
        "status": PEER_STATUS_APPROVED,
        "note": "تعيين يدوي من المشرف",
        "requester_level": level1,
        "target_level": level2,
        "created_at": now,
        "decided_at": now,
        "decided_by": current_user.user_id,
        "created_by_admin": True,
        "created_by_admin_name": current_user.name
    }

    await db.peer_partnerships.insert_one(doc)

    await db.users.update_many(
        {"user_id": {"$in": [payload.student1_id, payload.student2_id]}},
        {"$set": {"review_method": "peer"}}
    )

    body = f"قام المشرف بتعيين {student1.get('name')} و {student2.get('name')} كقرينَي مراجعة."
    for uid in (payload.student1_id, payload.student2_id):
        await _push_peer_notification(
            uid,
            "تم تعيين قرين مراجعة",
            body,
            "peer_manual_assigned",
            partnership_id
        )

    doc.pop("_id", None)
    return {"message": "تم تعيين الطالبين كقرينَي مراجعة بنجاح", "partnership": doc}

@api_router.post("/admin/peer-requests/{partnership_id}/approve")
async def admin_approve_peer_request(partnership_id: str, current_user: User = Depends(get_current_user)):
    _require_teacher_or_admin(current_user)
    p = await db.peer_partnerships.find_one({"partnership_id": partnership_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="لم يتم العثور على الطلب")
    if p["status"] != PEER_STATUS_PENDING:
        raise HTTPException(status_code=400, detail="الطلب ليس في حالة الانتظار")
    await db.peer_partnerships.update_one(
        {"partnership_id": partnership_id},
        {"$set": {"status": PEER_STATUS_APPROVED,
                  "decided_at": datetime.now(timezone.utc).isoformat(),
                  "decided_by": current_user.user_id}}
    )
    # Ensure both partners' review_method is 'peer' so the schedule UI appears for both sides
    await db.users.update_many(
        {"user_id": {"$in": [p["requester_id"], p["target_id"]]}},
        {"$set": {"review_method": "peer",
                  "review_method_updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    body = f"تمت الموافقة على الشراكة بين {p['requester_name']} و{p['target_name']}."
    for uid in (p["requester_id"], p["target_id"]):
        await _push_peer_notification(uid, "تمت الموافقة على قرين المراجعة", body, "peer_approved", partnership_id)
    return {"message": "تمت الموافقة"}


@api_router.post("/admin/peer-requests/{partnership_id}/reject")
async def admin_reject_peer_request(partnership_id: str, current_user: User = Depends(get_current_user)):
    _require_teacher_or_admin(current_user)
    body_payload = {}
    p = await db.peer_partnerships.find_one({"partnership_id": partnership_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="لم يتم العثور على الطلب")
    if p["status"] != PEER_STATUS_PENDING:
        raise HTTPException(status_code=400, detail="الطلب ليس في حالة الانتظار")
    await db.peer_partnerships.update_one(
        {"partnership_id": partnership_id},
        {"$set": {"status": PEER_STATUS_REJECTED,
                  "decided_at": datetime.now(timezone.utc).isoformat(),
                  "decided_by": current_user.user_id,
                  "reject_reason": body_payload.get("reason")}}
    )
    body = f"تم رفض الشراكة بين {p['requester_name']} و{p['target_name']}. يمكن اختيار قرين آخر."
    for uid in (p["requester_id"], p["target_id"]):
        await _push_peer_notification(uid, "تم رفض الشراكة", body, "peer_rejected", partnership_id)
    return {"message": "تم الرفض"}


@api_router.post("/peers/cancel")
async def student_cancel_own_request(current_user: User = Depends(get_current_user)):
    """Requester may cancel their own pending request."""
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="للطلاب فقط")
    p = await db.peer_partnerships.find_one(
        {"requester_id": current_user.user_id, "status": PEER_STATUS_PENDING}, {"_id": 0}
    )
    if not p:
        raise HTTPException(status_code=404, detail="لا يوجد طلب قائم لإلغائه")
    await db.peer_partnerships.update_one(
        {"partnership_id": p["partnership_id"]},
        {"$set": {"status": PEER_STATUS_CANCELLED, "decided_at": datetime.now(timezone.utc).isoformat()}}
    )
    await _push_peer_notification(p["target_id"], "تم إلغاء طلب القرين", f"{p['requester_name']} ألغى طلب الشراكة.", "peer_cancelled", p["partnership_id"])
    return {"message": "تم إلغاء الطلب"}


@api_router.post("/admin/peer-requests/{partnership_id}/unpair")
async def admin_unpair_partnership(partnership_id: str, current_user: User = Depends(get_current_user)):
    """Admin-only: dissolve an approved peer partnership. Status becomes 'cancelled'.
    Both students become free to choose a new peer. History (slots/sessions/evaluations) is preserved.
    """
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="إلغاء الاقتران للمشرف فقط")
    p = await db.peer_partnerships.find_one({"partnership_id": partnership_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="لم يتم العثور على الشراكة")
    if p["status"] != PEER_STATUS_APPROVED:
        raise HTTPException(status_code=400, detail="لا يمكن إلغاء اقتران غير نشط")
    now = datetime.now(timezone.utc).isoformat()
    await db.peer_partnerships.update_one(
        {"partnership_id": partnership_id},
        {"$set": {"status": PEER_STATUS_CANCELLED,
                  "unpaired_at": now,
                  "unpaired_by": current_user.user_id,
                  "unpaired_by_name": current_user.name}}
    )
    # Free any un-booked slots so they don't linger
    await db.peer_review_slots.delete_many({"partnership_id": partnership_id, "is_booked": False})
    body = f"تم إلغاء اقتران المراجعة بين {p['requester_name']} و{p['target_name']} من قِبل المشرف."
    for uid in (p["requester_id"], p["target_id"]):
        await _push_peer_notification(uid, "تم إلغاء الاقتران", body, "peer_unpaired", partnership_id)
    return {"message": "تم إلغاء الاقتران"}


# ============================================================
# ===== PHASE 2: SCHEDULING + MEETINGS + EVALUATIONS + PLANS =====
# ============================================================

class PeerSlotPayload(BaseModel):
    scheduled_time: str  # ISO
    duration: int = 30
    meet_link: Optional[str] = None
    notes: Optional[str] = None

class PeerAttendancePayload(BaseModel):
    attended: bool

class PeerEvaluationPayload(BaseModel):
    surah_name: Optional[str] = None
    from_ayah: Optional[int] = None
    to_ayah: Optional[int] = None
    page_range: Optional[str] = None
    quality: str  # 'ممتاز' | 'متوسط' | 'مقبول' | 'ضعيف'
    mistakes_count: Optional[int] = 0
    notes: Optional[str] = None
    advice: Optional[str] = None
    recommendations: Optional[str] = None

class WeeklyPlanPayload(BaseModel):
    student_id: str
    week_start: str  # ISO date (YYYY-MM-DD)
    days: List[Dict[str, Any]]  # 7 day items: { day, kind:'memorize'|'review'|'test', surah, from_ayah, to_ayah, page_range, memorize_target, review_target, notes }
    teacher_notes: Optional[str] = None
    parent_notes: Optional[str] = None


async def _get_user_partnership(user_id: str) -> Optional[dict]:
    return await db.peer_partnerships.find_one(
        {"$or": [{"requester_id": user_id}, {"target_id": user_id}], "status": PEER_STATUS_APPROVED},
        {"_id": 0}
    )


@api_router.get("/peers/me/partnership")
async def get_my_active_partnership(current_user: User = Depends(get_current_user)):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="للطلاب فقط")
    p = await _get_user_partnership(current_user.user_id)
    return p


@api_router.post("/peers/slots")
async def create_peer_slot(payload: PeerSlotPayload, current_user: User = Depends(get_current_user)):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="للطلاب فقط")
    p = await _get_user_partnership(current_user.user_id)
    if not p:
        raise HTTPException(status_code=400, detail="لا توجد شراكة نشطة")
    slot_id = f"pslot_{uuid.uuid4().hex[:12]}"
    doc = {
        "slot_id": slot_id,
        "partnership_id": p["partnership_id"],
        "creator_id": current_user.user_id,
        "creator_name": current_user.name,
        "scheduled_time": payload.scheduled_time,
        "duration": payload.duration,
        "meet_link": payload.meet_link,
        "notes": payload.notes,
        "is_booked": False,
        "booked_by": None,
        "session_id": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.peer_review_slots.insert_one(doc)
    other_id = p["target_id"] if p["requester_id"] == current_user.user_id else p["requester_id"]
    await _push_peer_notification(other_id, "موعد مراجعة جديد متاح",
                                  f"{current_user.name} أضاف موعداً للمراجعة.", "peer_slot_added", slot_id)
    doc.pop("_id", None)
    return doc


@api_router.get("/peers/slots")
async def list_my_peer_slots(current_user: User = Depends(get_current_user)):
    p = await _get_user_partnership(current_user.user_id)
    if not p:
        return []
    items = await db.peer_review_slots.find(
        {"partnership_id": p["partnership_id"]}, {"_id": 0}
    ).sort("scheduled_time", 1).to_list(length=200)
    return items


@api_router.post("/peers/slots/{slot_id}/book")
async def book_peer_slot(slot_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="للطلاب فقط")
    slot = await db.peer_review_slots.find_one({"slot_id": slot_id}, {"_id": 0})
    if not slot:
        raise HTTPException(status_code=404, detail="لم يتم العثور على الموعد")
    if slot["creator_id"] == current_user.user_id:
        raise HTTPException(status_code=400, detail="لا يمكنك حجز موعدك بنفسك — انتظر قرينك")
    if slot["is_booked"]:
        raise HTTPException(status_code=400, detail="هذا الموعد محجوز بالفعل")
    p = await db.peer_partnerships.find_one({"partnership_id": slot["partnership_id"]}, {"_id": 0})
    if not p or p["status"] != PEER_STATUS_APPROVED:
        raise HTTPException(status_code=400, detail="الشراكة غير نشطة")
    # Create the meeting session
    sid = f"psess_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    sess = {
        "peer_session_id": sid,
        "slot_id": slot_id,
        "partnership_id": p["partnership_id"],
        "creator_id": slot["creator_id"],
        "creator_name": slot["creator_name"],
        "booker_id": current_user.user_id,
        "booker_name": current_user.name,
        "scheduled_time": slot["scheduled_time"],
        "duration": slot["duration"],
        "meet_link": slot.get("meet_link"),
        "notes": slot.get("notes"),
        "attendance": {},  # user_id -> bool
        "evaluations_done_by": [],  # user_ids who have submitted their evaluation
        "created_at": now,
    }
    await db.peer_review_sessions.insert_one(sess)
    await db.peer_review_slots.update_one(
        {"slot_id": slot_id},
        {"$set": {"is_booked": True, "booked_by": current_user.user_id, "session_id": sid}}
    )
    await _push_peer_notification(slot["creator_id"], "تم حجز موعد المراجعة",
                                  f"{current_user.name} حجز الموعد الذي أضفته.", "peer_slot_booked", sid)
    sess.pop("_id", None)
    return sess


@api_router.get("/peers/sessions")
async def list_peer_sessions(current_user: User = Depends(get_current_user)):
    """All peer review sessions for this student's active partnership (or full history if previously paired)."""
    items = await db.peer_review_sessions.find(
        {"$or": [{"creator_id": current_user.user_id}, {"booker_id": current_user.user_id}]},
        {"_id": 0}
    ).sort("scheduled_time", -1).to_list(length=200)
    return items


@api_router.delete("/peers/slots/{slot_id}")
async def cancel_peer_slot(slot_id: str, current_user: User = Depends(get_current_user)):
    """Slot creator can cancel an unbooked slot any time."""
    slot = await db.peer_review_slots.find_one({"slot_id": slot_id}, {"_id": 0})
    if not slot:
        raise HTTPException(status_code=404, detail="لم يتم العثور على الموعد")
    if slot["creator_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="يمكن إلغاء الموعد من قبل من أنشأه فقط")
    if slot.get("is_booked"):
        raise HTTPException(status_code=400, detail="الموعد محجوز — استخدم إلغاء الجلسة بدلاً من ذلك")
    await db.peer_review_slots.delete_one({"slot_id": slot_id})
    return {"message": "تم إلغاء الموعد"}


@api_router.delete("/peers/sessions/{peer_session_id}")
async def cancel_peer_session(peer_session_id: str, current_user: User = Depends(get_current_user)):
    """Either side can cancel a booked, *upcoming* peer-review session.

    Disallowed once the session's scheduled_time has already passed — historical
    records must be preserved (the user explicitly asked for this).
    """
    sess = await db.peer_review_sessions.find_one({"peer_session_id": peer_session_id}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="لم يتم العثور على الجلسة")
    if current_user.user_id not in (sess.get("creator_id"), sess.get("booker_id")):
        raise HTTPException(status_code=403, detail="هذه الجلسة ليست لك")
    # Don't allow cancelling sessions that already started or finished
    try:
        sched = datetime.fromisoformat(sess["scheduled_time"].replace("Z", "+00:00"))
        if sched < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="الجلسة بدأت بالفعل — لا يمكن إلغاؤها")
    except HTTPException:
        raise
    except Exception:
        # If we can't parse the time, fail safe (do not delete)
        raise HTTPException(status_code=400, detail="تعذّر قراءة وقت الجلسة — لا يمكن إلغاؤها")

    # Notify the other party first (before delete)
    other_id = sess["booker_id"] if current_user.user_id == sess["creator_id"] else sess["creator_id"]
    await _push_peer_notification(
        other_id,
        "تم إلغاء موعد المراجعة",
        f"{current_user.name} ألغى موعد المراجعة المُجدوَل.",
        "peer_session_cancelled",
        peer_session_id,
    )

    await db.peer_review_sessions.delete_one({"peer_session_id": peer_session_id})
    # Also free up the originating slot (allows recreation)
    if sess.get("slot_id"):
        await db.peer_review_slots.delete_one({"slot_id": sess["slot_id"]})
    return {"message": "تم إلغاء الجلسة"}


@api_router.post("/peers/sessions/{peer_session_id}/attendance")
async def mark_peer_attendance(peer_session_id: str, payload: PeerAttendancePayload, current_user: User = Depends(get_current_user)):
    sess = await db.peer_review_sessions.find_one({"peer_session_id": peer_session_id}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="لم يتم العثور على لقاء المراجعة")
    if current_user.user_id not in (sess["creator_id"], sess["booker_id"]):
        raise HTTPException(status_code=403, detail="هذه الجلسة ليست لك")
    await db.peer_review_sessions.update_one(
        {"peer_session_id": peer_session_id},
        {"$set": {f"attendance.{current_user.user_id}": bool(payload.attended)}}
    )
    return {"message": "تم تسجيل الحضور"}


@api_router.post("/peers/sessions/{peer_session_id}/evaluate")
async def submit_peer_evaluation(peer_session_id: str, payload: PeerEvaluationPayload, current_user: User = Depends(get_current_user)):
    sess = await db.peer_review_sessions.find_one({"peer_session_id": peer_session_id}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="لم يتم العثور على لقاء المراجعة")
    if current_user.user_id not in (sess["creator_id"], sess["booker_id"]):
        raise HTTPException(status_code=403, detail="هذه الجلسة ليست لك")
    # Determine the "evaluatee" (the other student)
    other_id = sess["booker_id"] if current_user.user_id == sess["creator_id"] else sess["creator_id"]
    other_name = sess["booker_name"] if current_user.user_id == sess["creator_id"] else sess["creator_name"]
    # Idempotent: one evaluation per evaluator per session
    existing = await db.peer_evaluations.find_one({
        "peer_session_id": peer_session_id, "evaluator_id": current_user.user_id
    }, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="تم تسجيل تقييمك مسبقاً")
    eid = f"peval_{uuid.uuid4().hex[:12]}"
    doc = {
        "evaluation_id": eid,
        "peer_session_id": peer_session_id,
        "partnership_id": sess["partnership_id"],
        "evaluator_id": current_user.user_id,
        "evaluator_name": current_user.name,
        "evaluatee_id": other_id,
        "evaluatee_name": other_name,
        "surah_name": payload.surah_name,
        "from_ayah": payload.from_ayah,
        "to_ayah": payload.to_ayah,
        "page_range": payload.page_range,
        "quality": payload.quality,
        "mistakes_count": int(payload.mistakes_count or 0),
        "notes": payload.notes,
        "advice": payload.advice,
        "recommendations": payload.recommendations,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.peer_evaluations.insert_one(doc)
    await db.peer_review_sessions.update_one(
        {"peer_session_id": peer_session_id},
        {"$addToSet": {"evaluations_done_by": current_user.user_id}}
    )
    await _push_peer_notification(other_id, "وصلك تقييم من قرينك",
                                  f"{current_user.name} قيَّمك على لقاء المراجعة.", "peer_eval_received", eid)
    doc.pop("_id", None)
    return doc


@api_router.get("/peers/evaluations")
async def list_my_peer_evaluations(current_user: User = Depends(get_current_user)):
    """All peer evaluations involving me (as evaluator or evaluatee)."""
    items = await db.peer_evaluations.find(
        {"$or": [{"evaluator_id": current_user.user_id}, {"evaluatee_id": current_user.user_id}]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(length=500)
    return items


@api_router.get("/teacher/students/{student_id}/peer-overview")
async def get_student_peer_overview(student_id: str, current_user: User = Depends(get_current_user)):
    _require_teacher_or_admin(current_user)
    user = await db.users.find_one({"user_id": student_id}, {"_id": 0, "review_method": 1, "name": 1})
    partnership = await db.peer_partnerships.find_one(
        {"$or": [{"requester_id": student_id}, {"target_id": student_id}],
         "status": {"$in": [PEER_STATUS_PENDING, PEER_STATUS_APPROVED]}},
        {"_id": 0}
    )
    sessions = await db.peer_review_sessions.find(
        {"$or": [{"creator_id": student_id}, {"booker_id": student_id}]}, {"_id": 0}
    ).sort("scheduled_time", -1).to_list(length=200)
    evaluations = await db.peer_evaluations.find(
        {"$or": [{"evaluator_id": student_id}, {"evaluatee_id": student_id}]}, {"_id": 0}
    ).sort("created_at", -1).to_list(length=200)
    return {
        "review_method": (user or {}).get("review_method"),
        "partnership": partnership,
        "sessions": sessions,
        "evaluations": evaluations,
    }


# ----- WEEKLY PLANS -----

@api_router.post("/teacher/weekly-plans")
async def create_weekly_plan(payload: WeeklyPlanPayload, current_user: User = Depends(get_current_user)):
    _require_teacher_or_admin(current_user)
    student = await db.users.find_one({"user_id": payload.student_id}, {"_id": 0, "user_id": 1, "name": 1, "role": 1})
    if not student or student.get("role") != "student":
        raise HTTPException(status_code=404, detail="لم يتم العثور على الطالب")
    pid = f"wkpl_{uuid.uuid4().hex[:12]}"
    doc = {
        "plan_id": pid,
        "student_id": payload.student_id,
        "student_name": student["name"],
        "teacher_id": current_user.user_id,
        "teacher_name": current_user.name,
        "week_start": payload.week_start,
        "days": payload.days or [],
        "teacher_notes": payload.teacher_notes,
        "parent_notes": payload.parent_notes,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.weekly_plans.insert_one(doc)
    doc.pop("_id", None)
    return doc


# ----- SMART WEEKLY PLAN SUGGESTION -----

_PLAN_DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']


@api_router.post("/teacher/weekly-plans/suggest")
async def suggest_weekly_plan(payload: dict, current_user: User = Depends(get_current_user)):
    """Generate a draft weekly memorization plan tailored to the student.

    Uses the shared `_get_memorization_position()` detector to read the student's
    real current position (latest surah, latest ayah, direction). Falls back to a
    sensible Juz Amma starter when the student has no recorded entries.

    Notes are intentionally left empty by default (per user direction) — the
    teacher fills them in as needed.

    Nothing is persisted here. The teacher edits the draft then calls
    `POST /teacher/weekly-plans` to save.
    """
    _require_teacher_or_admin(current_user)
    student_id = (payload or {}).get("student_id")
    week_start = (payload or {}).get("week_start")
    if not student_id:
        raise HTTPException(status_code=400, detail="student_id مطلوب")

    student = await db.users.find_one(
        {"user_id": student_id},
        {"_id": 0, "user_id": 1, "name": 1, "role": 1}
    )
    if not student or student.get("role") != "student":
        raise HTTPException(status_code=404, detail="لم يتم العثور على الطالب")

    # ---- 1) Real memorization position (deep detector) ----
    pos = await _get_memorization_position(student_id)

    # ---- 2) Level-aware base intensity (the real fix) ----
    # Per user direction: advanced students get a stronger plan, beginners a lighter one.
    bucket = pos["bucket"]
    base_ayahs_by_bucket = {
        "juz_amma": 5,      # ~half page/day · gentle
        "5_juz":    9,      # ~1 page/day
        "10_juz":  13,      # ~1.3 page/day
        "15_juz":  16,      # ~1.6 page/day
        "20_juz":  18,      # ~2 pages/day · stronger
        "25_juz":  20,
        "30_juz":  20,      # complete-hifz students still memorize ~2 pages for review/recall
    }
    base_ayahs = base_ayahs_by_bucket.get(bucket, 10)

    # ---- 2b) Commitment-based intensity (acts as a floor, not a hard override) ----
    commitment = await db.student_commitments.find_one(
        {"student_id": student_id}, {"_id": 0}
    )
    min_pages = 0
    min_sessions = 2
    if commitment:
        try:
            min_pages = int(commitment.get("min_pages_per_week") or 0)
            min_sessions = int(commitment.get("min_sessions_per_week") or 2)
        except Exception:
            pass
    if min_pages > 0:
        # Honour the student's weekly commitment as a *floor* when bigger than level default
        commitment_ayahs_per_day = max(1, round(min_pages / 5) * 10)
        base_ayahs = max(base_ayahs, commitment_ayahs_per_day)
    ayahs_per_day = base_ayahs

    # ---- 3) Attendance & quality calibration ----
    sessions = await db.sessions.find(
        {"student_id": student_id, "scheduled_time": {"$exists": True}},
        {"_id": 0, "attendance_confirmed": 1, "scheduled_time": 1}
    ).sort("scheduled_time", -1).to_list(length=20)
    attended = sum(1 for s in sessions if s.get("attendance_confirmed") is True)
    att_rate = round(attended * 100 / len(sessions)) if sessions else 100
    intensity = "standard"
    if att_rate < 60:
        intensity = "gentle"
        ayahs_per_day = max(3, int(ayahs_per_day * 0.7))
    elif att_rate >= 85:
        intensity = "push"
        ayahs_per_day = int(ayahs_per_day * 1.15)

    # ---- 4) Peer-review tone ----
    peer_avg = None
    peer_evs = await db.peer_evaluations.find(
        {"evaluatee_id": student_id}, {"_id": 0, "quality": 1}
    ).to_list(length=50)
    if peer_evs:
        score_map = {'ممتاز': 4, 'متوسط': 3, 'مقبول': 2, 'ضعيف': 1}
        vals = [score_map.get(p.get("quality"), 0) for p in peer_evs if p.get("quality") in score_map]
        if vals:
            peer_avg = round(sum(vals) / len(vals), 1)

    # ---- 5) Resolve starting point ----
    direction = pos["direction"]
    cur_sn = pos["current_surah"]
    cur_num = pos["current_surah_number"]
    next_start = (pos["current_to_ayah"] + 1) if pos["current_to_ayah"] else 1

    # Manual direction override from caller (teacher chooses):
    #   'from_start' → traverse from الفاتحة toward الناس (advance ↑)
    #   'from_end'   → traverse from الناس toward الفاتحة (advance ↓)
    # The direction is ONLY the order of traversal — the plan ALWAYS
    # continues from the student's actual last memorized position. If
    # the auto-detected frontier doesn't match the chosen direction
    # (e.g., a mixed learner), recompute the frontier from the student's
    # actual memorization records in the chosen direction.
    override = (payload or {}).get("direction")
    if override in ("from_start", "from_end"):
        direction = override
        memorized = pos.get("memorized_surahs") or []
        if memorized:
            nums = [s.get("number") for s in memorized if s.get("number")]
            frontier_num = max(nums) if override == "from_start" else min(nums)
            frontier_meta = SURAH_BY_NUMBER.get(frontier_num)
            if frontier_meta:
                cur_sn = frontier_meta["name"]
                cur_num = frontier_meta["number"]
                # Find the highest to_ayah the student has recorded on this surah
                highest_to = 0
                async for e in db.memorization_progress.find(
                    {"student_id": student_id},
                    {"_id": 0, "surah_name": 1, "surah_number": 1, "from_ayah": 1, "to_ayah": 1}
                ):
                    s_name = (e.get("surah_name") or "").strip()
                    e_meta = SURAH_MAP.get(s_name) if s_name in SURAH_MAP else SURAH_BY_NUMBER.get(e.get("surah_number"))
                    if e_meta and e_meta["number"] == frontier_num:
                        try:
                            t = max(int(e.get("to_ayah") or 0), int(e.get("from_ayah") or 0))
                            if t > highest_to:
                                highest_to = t
                        except Exception:
                            pass
                next_start = (highest_to + 1) if highest_to else 1

    # Default ONLY when student has zero memorization records at all.
    # The starting point matches the literal direction name.
    if not cur_sn:
        if override == "from_start":
            starter = SURAH_BY_NUMBER.get(1)  # الفاتحة
            direction = "from_start"
        elif override == "from_end":
            starter = SURAH_BY_NUMBER.get(114)  # الناس
            direction = "from_end"
        else:
            # No override and no records → suggest Juz Amma (النبأ) as a teaching norm
            starter = SURAH_BY_NUMBER.get(78)
            direction = "from_end"
        cur_sn = starter["name"]
        cur_num = starter["number"]
        next_start = 1

    meta_now = SURAH_BY_NUMBER.get(cur_num) if cur_num else None
    surah_total_ayahs = (meta_now or {}).get("ayah_count", 0)

    def _advance(start, cur_name, cur_n, ayah_total):
        if not cur_n or not ayah_total:
            return (cur_name, cur_n, None, None, ayah_total)
        if start > ayah_total:
            if direction == "from_end":
                nxt = SURAH_BY_NUMBER.get(cur_n - 1) if cur_n > 1 else None
            else:
                nxt = SURAH_BY_NUMBER.get(cur_n + 1) if cur_n < 114 else None
            if not nxt:
                return (cur_name, cur_n, ayah_total, ayah_total, ayah_total)
            cur_name = nxt["name"]; cur_n = nxt["number"]; ayah_total = nxt["ayah_count"]
            start = 1
        end = min(start + ayahs_per_day - 1, ayah_total)
        return (cur_name, cur_n, start, end, ayah_total)

    def _page_range(snum, from_a, to_a):
        """Mushaf page range string for the suggested ayah range."""
        if not snum or not from_a:
            return ("", "", "")
        p1 = get_ayah_page(snum, from_a)
        p2 = get_ayah_page(snum, to_a)
        if not p1:
            return ("", "", "")
        if p1 == p2:
            return (p1, p2, f"ص {p1}")
        return (p1, p2, f"ص {p1} — {p2}")

    # ---- 6) Review pool — use SOLIDIFIED earlier surahs (not the frontier) ----
    # The student is currently working on `cur_sn`. Reviews should pull from surahs they
    # have *already* finished (i.e., other surahs in their memorized list excluding the frontier).
    # Build EXACT review segments from the student's real memorization records: for each
    # memorized surah, take the union of all recorded ayah ranges → (surah, surah_num, min_from, max_to).
    review_segments = []  # list of dicts: {name, number, from_ayah, to_ayah}
    seg_by_surah = {}
    async for e in db.memorization_progress.find(
        {"student_id": student_id},
        {"_id": 0, "surah_name": 1, "surah_number": 1, "from_ayah": 1, "to_ayah": 1}
    ):
        s_name_raw = (e.get("surah_name") or "").strip()
        e_meta = SURAH_MAP.get(s_name_raw) if s_name_raw in SURAH_MAP else SURAH_BY_NUMBER.get(e.get("surah_number"))
        if not e_meta:
            continue
        s_num = e_meta["number"]
        s_name = e_meta["name"]
        try:
            f = int(e.get("from_ayah") or 0)
            t = int(e.get("to_ayah") or 0)
        except Exception:
            f, t = 0, 0
        if t < f or f < 1:
            # Bad/missing ayah info → assume the whole surah was memorized
            f, t = 1, e_meta["ayah_count"]
        seg = seg_by_surah.setdefault(s_num, {"name": s_name, "number": s_num, "from_ayah": f, "to_ayah": t})
        if f < seg["from_ayah"]:
            seg["from_ayah"] = f
        if t > seg["to_ayah"]:
            seg["to_ayah"] = t

    # Exclude the current frontier surah (still being memorized) so reviews
    # only target previously-solidified surahs.
    for s_num, seg in seg_by_surah.items():
        if cur_num and s_num == cur_num:
            continue
        review_segments.append(seg)

    # Order review segments by recency in the Mushaf direction (most recent first)
    if direction == "from_end":
        review_segments.sort(key=lambda x: x["number"])     # last memorized = lowest # (going down)
    else:
        review_segments.sort(key=lambda x: -x["number"])    # last memorized = highest # (going up)

    # Fallback: if no earlier surahs (e.g., student just started memorizing the
    # frontier surah), review what they've recorded so far on the frontier.
    # IMPORTANT: only apply when the student actually has at least one recorded
    # ayah on the frontier (next_start > 1). For truly fresh students (zero
    # records, next_start == 1) leave review_segments empty so the review-day
    # builder emits the "لا يوجد محفوظ سابق للمراجعة بعد" sentinel instead of
    # silently defaulting to سورة الفاتحة.
    if not review_segments and cur_sn and next_start > 1:
        fallback_to = next_start - 1
        review_segments.append({"name": cur_sn, "number": cur_num, "from_ayah": 1, "to_ayah": fallback_to})

    # ---- 7) Build 7-day skeleton ----
    plan_pattern = ["memorize", "memorize", "review", "memorize", "memorize", "review", "test"]
    days = []
    review_idx = 0
    days_ar = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
    # Track week's memorize range for the test day
    week_first = None  # (surah, surah_num, from_ayah)
    week_last = None   # (surah, surah_num, to_ayah)

    for i, kind in enumerate(plan_pattern):
        day_label = days_ar[i]
        if kind == "memorize":
            new_sn, new_num, s, e, surah_total_ayahs = _advance(next_start, cur_sn, cur_num, surah_total_ayahs)
            cur_sn, cur_num = new_sn, new_num
            if s is None:
                # Mushaf finished — switch to review-only
                days.append({
                    "day": day_label, "kind": "review", "surah": cur_sn or "",
                    "from_ayah": "", "to_ayah": "",
                    "from_page": "", "to_page": "", "page_range": "",
                    "memorize_target": "",
                    "review_target": "مراجعة شاملة (تم استكمال الحفظ)",
                    "notes": "",
                })
                next_start = surah_total_ayahs + 1
                continue
            fp, tp, pr = _page_range(cur_num, s, e)
            if week_first is None:
                week_first = (cur_sn, cur_num, s)
            week_last = (cur_sn, cur_num, e)
            days.append({
                "day": day_label, "kind": "memorize", "surah": cur_sn,
                "from_ayah": s, "to_ayah": e,
                "from_page": fp, "to_page": tp, "page_range": pr,
                "memorize_target": f"حفظ من آية {s} إلى {e} من سورة {cur_sn}" + (f" ({pr})" if pr else ""),
                "review_target": "",
                "notes": "",
            })
            next_start = e + 1
        elif kind == "review":
            if review_segments:
                seg = review_segments[review_idx % len(review_segments)]
                review_idx += 1
                r_surah = seg["name"]
                r_num = seg["number"]
                r_from = seg["from_ayah"]
                r_to = seg["to_ayah"]
                fp_r, tp_r, pr_r = _page_range(r_num, r_from, r_to)
                days.append({
                    "day": day_label, "kind": "review", "surah": r_surah,
                    "from_ayah": r_from, "to_ayah": r_to,
                    "from_page": fp_r, "to_page": tp_r, "page_range": pr_r,
                    "memorize_target": "",
                    "review_target": f"مراجعة سورة {r_surah} من الآية {r_from} إلى {r_to}" + (f" ({pr_r})" if pr_r else ""),
                    "notes": "",
                })
            else:
                # No memorized surahs at all → cannot review anything yet
                days.append({
                    "day": day_label, "kind": "review", "surah": "",
                    "from_ayah": "", "to_ayah": "",
                    "from_page": "", "to_page": "", "page_range": "",
                    "memorize_target": "",
                    "review_target": "لا يوجد محفوظ سابق للمراجعة بعد",
                    "notes": "",
                })
        else:  # test — recite everything memorized this week
            if week_first and week_last:
                f_surah, f_snum, f_ayah = week_first
                l_surah, l_snum, l_ayah = week_last
                # Page span across the week (always min..max to handle backward learners)
                p_a = get_ayah_page(f_snum, f_ayah)
                p_b = get_ayah_page(l_snum, l_ayah)
                if p_a and p_b:
                    p_lo, p_hi = (p_a, p_b) if p_a <= p_b else (p_b, p_a)
                    pr_t = f"ص {p_lo}" if p_lo == p_hi else f"ص {p_lo} — {p_hi}"
                else:
                    p_lo = p_a or p_b or ""
                    p_hi = p_b or p_a or ""
                    pr_t = ""
                if f_surah == l_surah:
                    surah_field = f_surah
                    target_text = f"تسميع آيات الأسبوع: سورة {f_surah} من {f_ayah} إلى {l_ayah}" + (f" ({pr_t})" if pr_t else "")
                else:
                    surah_field = f"{f_surah} → {l_surah}"
                    target_text = f"تسميع آيات الأسبوع: من سورة {f_surah} الآية {f_ayah} إلى سورة {l_surah} الآية {l_ayah}" + (f" ({pr_t})" if pr_t else "")
                days.append({
                    "day": day_label, "kind": "test",
                    "surah": surah_field,
                    "from_ayah": f_ayah, "to_ayah": l_ayah,
                    "from_page": p_lo, "to_page": p_hi, "page_range": pr_t,
                    "memorize_target": "",
                    "review_target": target_text,
                    "notes": "",
                })
            else:
                # No memorize days this week (rare) — fall back to frontier surah
                days.append({
                    "day": day_label, "kind": "test",
                    "surah": cur_sn or "",
                    "from_ayah": "", "to_ayah": "",
                    "from_page": "", "to_page": "", "page_range": "",
                    "memorize_target": "",
                    "review_target": "تسميع جميع ما حُفظ هذا الأسبوع",
                    "notes": "",
                })

    # ---- 8) Summary (no auto-generated teacher/parent notes) ----
    if pos["current_surah"] and pos["current_to_ayah"]:
        current_position_str = f"سورة {pos['current_surah']} (الآية {pos['current_to_ayah']})"
    elif pos["current_surah"]:
        current_position_str = f"سورة {pos['current_surah']}"
    else:
        current_position_str = "لا توجد سجلات حفظ سابقة — خطة بداية مقترحة (جزء عمّ)"

    summary = {
        "current_position": current_position_str,
        "current_surah": pos["current_surah"],
        "current_surah_number": pos["current_surah_number"],
        "current_to_ayah": pos["current_to_ayah"],
        "direction": direction,
        "surah_count": pos["surah_count"],
        "estimated_juz": pos["estimated_juz"],
        "bucket_label": pos["bucket_label"],
        "min_pages_per_week": min_pages or 0,
        "min_sessions_per_week": min_sessions,
        "attendance_rate": att_rate,
        "intensity": intensity,
        "ayahs_per_memorize_day": ayahs_per_day,
        "peer_avg": peer_avg,
        "review_pool": [seg["name"] for seg in review_segments[:6]],
    }

    return {
        "student_id": student_id,
        "student_name": student["name"],
        "week_start": week_start or "",
        "days": days,
        "teacher_notes": "",
        "parent_notes": "",
        "summary": summary,
    }


@api_router.get("/teacher/students/{student_id}/weekly-plans")
async def list_student_weekly_plans(student_id: str, current_user: User = Depends(get_current_user)):
    _require_teacher_or_admin(current_user)
    items = await db.weekly_plans.find({"student_id": student_id}, {"_id": 0}).sort("week_start", -1).to_list(length=200)
    return items


@api_router.get("/student/weekly-plans")
async def list_my_weekly_plans(current_user: User = Depends(get_current_user)):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="للطلاب فقط")
    items = await db.weekly_plans.find({"student_id": current_user.user_id}, {"_id": 0}).sort("week_start", -1).to_list(length=200)
    return items


@api_router.delete("/teacher/weekly-plans/{plan_id}")
async def delete_weekly_plan(plan_id: str, current_user: User = Depends(get_current_user)):
    _require_teacher_or_admin(current_user)
    res = await db.weekly_plans.delete_one({"plan_id": plan_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="لم يتم العثور على الخطة")
    return {"message": "تم الحذف"}


# ============================================================
# ===== CERTIFICATES SYSTEM (ADMIN-ISSUED ONLY) =====
# Juz completion is detected from the student's REAL memorization
# records (memorization_progress) mapped onto the 604-page Madinah
# Mushaf. Certificates are NEVER auto-issued — the admin reviews the
# eligibility list and explicitly clicks "إصدار الشهادة".
# ============================================================
from pymongo import ReturnDocument


class CertificateIssueRequest(BaseModel):
    student_id: str
    certificate_type: str  # 'juz' | 'full_quran'
    juz_number: Optional[int] = None


class ManualCertificateIssueRequest(BaseModel):
    student_id: str
    certificate_type: str  # 'juz' | 'full_quran'
    juz_number: Optional[int] = None
    force_issue: bool = False  # admin override when auto-verification fails



def _require_admin(current_user: User):
    """Certificates are strictly admin-only — enforced server-side."""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="إصدار الشهادات وإدارتها من صلاحيات المشرف فقط")


def _cert_normalize_arabic(text: str) -> str:
    """Aggressive Arabic normalization for surah-name matching.

    Real DB data is dirty: trailing spaces ('الملك '), missing hamza/madda
    ('ال عمران' vs 'آل عمران', 'الاسراء' vs 'الإسراء', 'المعرج' vs 'المعارج'),
    diacritics, tatweel. We strip diacritics, unify alef/yaa/taa-marbuta
    variants, drop a leading 'سورة', and remove all spaces.
    """
    if not text:
        return ""
    n = str(text).strip()
    n = re.sub(r"[\u064B-\u0652\u0670\u0640]", "", n)          # diacritics + tatweel
    n = (n.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا")
          .replace("ٱ", "ا").replace("ى", "ي").replace("ة", "ه")
          .replace("ؤ", "و").replace("ئ", "ي").replace("ء", ""))
    n = re.sub(r"^سوره\s*", "", n)
    return n.replace(" ", "")


# normalized name -> surah meta (built once)
_CERT_SURAH_KEY = {_cert_normalize_arabic(s["name"]): s for s in QURAN_SURAHS}

# Common alternative surah names seen in real teacher input (normalized form)
_CERT_SURAH_ALIASES = {
    "تبارك": "الملك",        # جزء تبارك opener
    "عم": "النبا",
    "الدهر": "الانسان",
    "بنياسراييل": "الاسرا",
}


def _cert_match_token(token: str):
    """Match ONE candidate token to a surah meta (exact → alias → fuzzy)."""
    key = _cert_normalize_arabic(token)
    if not key or len(key) < 2:
        return None
    key = _CERT_SURAH_ALIASES.get(key, key)
    m = _CERT_SURAH_KEY.get(key)
    if not m and key.startswith("و"):          # attached waw: 'والمدثر' → 'المدثر'
        k2 = _CERT_SURAH_ALIASES.get(key[1:], key[1:])
        m = _CERT_SURAH_KEY.get(k2)
    if not m and len(key) >= 4:                # small typos: 'المعرج' → 'المعارج'
        close = difflib.get_close_matches(key, _CERT_SURAH_KEY.keys(), n=1, cutoff=0.85)
        if close:
            m = _CERT_SURAH_KEY[close[0]]
    return m


def _cert_resolve_surahs(raw_name: str, surah_number=None) -> list:
    """Resolve a raw surah_name field to one or MORE surah metas.

    Handles real data patterns:
      - single surah  : 'الفاتحة', 'الملك ', 'ال عمران'
      - multi-surah   : 'المزمل والمدثر', 'الإسراء و الكهف', 'المعرج، نوح'
      - range strings : 'من قريش -الناس' (interpreted as قريش → الناس)
      - aliases       : 'تبارك' → الملك ; small typos via difflib fallback
    Returns metas sorted in Mushaf order; empty list if nothing matched.
    """
    metas = {}
    if surah_number and SURAH_BY_NUMBER.get(surah_number):
        m = SURAH_BY_NUMBER[surah_number]
        metas[m["number"]] = m
    if raw_name:
        # split ONLY on explicit separators so 'آل عمران' stays intact
        parts = re.split(r"[،,/\-]|\s+و\s+|\s+الي\s+|\s+إلى\s+|\s+الى\s+", str(raw_name))
        for part in parts:
            tok = part.strip()
            if not tok:
                continue
            tok = re.sub(r"^(من|الي|إلى|الى)\s+", "", tok)
            m = _cert_match_token(tok)
            if m:
                metas[m["number"]] = m
                continue
            # No whole-part match → try word combinations:
            # adjacent pairs first ('آل عمران' style), then single words
            # (catches attached waw like 'المعارج ونوح').
            words = tok.split()
            if len(words) < 2:
                continue
            for cand in [" ".join(words[i:i + 2]) for i in range(len(words) - 1)] + words:
                m = _cert_match_token(cand)
                if m:
                    metas[m["number"]] = m
    return [metas[k] for k in sorted(metas)]


def _cert_record_pages(raw_name, surah_number, from_ayah, to_ayah):
    """Convert one memorization record to a (first_page, last_page) span.

    Single surah  → pages of from_ayah..to_ayah within it.
    Multi surahs  → from_ayah applies to the FIRST surah, to_ayah to the
                    LAST ('المزمل والمدثر' 1-56 ⇒ المزمل:1 → المدثر:56).
    Bad ayah data → whole surah span (defensive, matches plan logic).
    Returns (p1, p2) or None when the surah can't be resolved.
    """
    metas = _cert_resolve_surahs(raw_name, surah_number)
    if not metas:
        return None
    first, last = metas[0], metas[-1]
    try:
        f = int(from_ayah or 0)
        t = int(to_ayah or 0)
    except Exception:
        f, t = 0, 0
    if f < 1:
        f = 1
    f = min(f, first["ayah_count"])
    if t < 1:
        t = last["ayah_count"]
    t = min(t, last["ayah_count"])
    if len(metas) == 1 and t < f:
        f, t = 1, first["ayah_count"]
    p1 = get_ayah_page(first["number"], f)
    p2 = get_ayah_page(last["number"], t)
    if not p1 or not p2:
        return None
    if p2 < p1:
        p1, p2 = p2, p1
    return (p1, p2)


async def _collect_memorization_records(student_id: str) -> list:
    """All REAL memorization evidence for a student, from every source the
    system actually writes to (deduped by record id):
      1. memorization_progress  — التسميع المسجل في الحصص
      2. student_notes_archive  — ملاحظات التسميع الدائمة (note_type='recitation')
    Each returned item: {source, raw_surah, surah_number, from_ayah, to_ayah, created_at}.
    """
    records = []
    async for e in db.memorization_progress.find(
        {"student_id": student_id},
        {"_id": 0, "surah_name": 1, "surah_number": 1, "from_ayah": 1, "to_ayah": 1, "created_at": 1}
    ):
        records.append({
            "source": "memorization_progress",
            "raw_surah": e.get("surah_name"),
            "surah_number": e.get("surah_number"),
            "from_ayah": e.get("from_ayah"),
            "to_ayah": e.get("to_ayah"),
            "created_at": e.get("created_at") or "",
        })
    async for n in db.student_notes_archive.find(
        {"student_id": student_id, "note_type": "recitation", "surah_name": {"$nin": [None, ""]}},
        {"_id": 0, "surah_name": 1, "ayah_from": 1, "ayah_to": 1, "created_at": 1}
    ):
        records.append({
            "source": "student_notes_archive",
            "raw_surah": n.get("surah_name"),
            "surah_number": None,
            "from_ayah": n.get("ayah_from"),
            "to_ayah": n.get("ayah_to"),
            "created_at": n.get("created_at") or "",
        })
    return records


async def _get_student_juz_completion(student_id: str, with_breakdown: bool = False) -> dict:
    """Compute which ajzāʼ the student has FULLY memorized.

    Method (strict 604-page Madinah Mushaf):
      1. Every record from ALL real sources (see _collect_memorization_records)
         is converted to the Mushaf pages it touches — never surah names alone,
         so ajzāʼ that start/end mid-surah are handled correctly.
      2. A juz is 'completed' only when EVERY page in its range is covered.
      3. completion_date = when the LAST page of the juz was first covered.

    with_breakdown=True additionally returns per-juz coverage + missing pages
    + unparsed records (powers the admin diagnostics view).
    """
    records = await _collect_memorization_records(student_id)
    page_first_covered = {}   # mushaf page -> earliest created_at covering it
    unparsed = []
    parsed_records = []
    last_recorded_at = ""
    for r in records:
        span = _cert_record_pages(r["raw_surah"], r["surah_number"], r["from_ayah"], r["to_ayah"])
        if span is None:
            unparsed.append({"source": r["source"], "surah_name": r["raw_surah"],
                             "from_ayah": r["from_ayah"], "to_ayah": r["to_ayah"]})
            continue
        p1, p2 = span
        created = r["created_at"]
        if created and created > last_recorded_at:
            last_recorded_at = created
        if with_breakdown:
            parsed_records.append({"source": r["source"], "surah_name": r["raw_surah"],
                                   "from_ayah": r["from_ayah"], "to_ayah": r["to_ayah"],
                                   "from_page": p1, "to_page": p2, "created_at": created})
        for p in range(p1, p2 + 1):
            prev = page_first_covered.get(p)
            if prev is None or (created and (not prev or created < prev)):
                page_first_covered[p] = created

    completed = []
    breakdown = []
    for juz in range(1, 31):
        a, b = get_juz_page_range(juz)
        covered = [p for p in range(a, b + 1) if p in page_first_covered]
        total = b - a + 1
        if len(covered) == total:
            dates = [page_first_covered[p] for p in range(a, b + 1) if page_first_covered[p]]
            completed.append({
                "juz_number": juz,
                "juz_name": get_juz_display_name(juz),
                "completion_date": max(dates) if dates else "",
                "from_page": a,
                "to_page": b,
            })
        if with_breakdown:
            breakdown.append({
                "juz_number": juz,
                "juz_name": get_juz_display_name(juz),
                "from_page": a,
                "to_page": b,
                "covered_pages": len(covered),
                "total_pages": total,
                "is_complete": len(covered) == total,
                "missing_pages": [p for p in range(a, b + 1) if p not in page_first_covered],
            })

    result = {
        "completed_juz": completed,
        "covered_pages_count": len(page_first_covered),
        "records_found": len(records),
        "last_recorded_at": last_recorded_at,
        "full_quran_completed": len(completed) == 30,
    }
    if with_breakdown:
        result["juz_breakdown"] = breakdown
        result["unparsed_records"] = unparsed
        result["parsed_records"] = parsed_records
    return result


async def _next_certificate_number() -> str:
    """Atomic yearly sequence → ALRUQI-CERT-<year>-<0001>."""
    year = datetime.now(timezone.utc).year
    counter = await db.counters.find_one_and_update(
        {"_id": f"certificate_seq_{year}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return f"ALRUQI-CERT-{year}-{int(counter['seq']):04d}"


@api_router.get("/admin/certificates/eligibility")
async def get_certificates_eligibility(current_user: User = Depends(get_current_user)):
    """Admin dashboard: every student's juz completion vs issued certificates."""
    _require_admin(current_user)
    students = await db.users.find(
        {"role": "student"}, {"_id": 0, "user_id": 1, "name": 1, "email": 1}
    ).to_list(length=2000)
    certs = await db.certificates.find(
        {"status": "issued"},
        {"_id": 0, "student_id": 1, "certificate_type": 1, "juz_number": 1}
    ).to_list(length=10000)

    issued_map = {}
    for c in certs:
        d = issued_map.setdefault(c["student_id"], {"juz": set(), "full_quran": False})
        if c["certificate_type"] == "juz" and c.get("juz_number"):
            d["juz"].add(int(c["juz_number"]))
        elif c["certificate_type"] == "full_quran":
            d["full_quran"] = True

    rows = []
    for s in students:
        comp = await _get_student_juz_completion(s["user_id"])
        issued = issued_map.get(s["user_id"], {"juz": set(), "full_quran": False})
        pending = [j for j in comp["completed_juz"] if j["juz_number"] not in issued["juz"]]
        rows.append({
            "student_id": s["user_id"],
            "student_name": s.get("name", ""),
            "student_email": s.get("email", ""),
            "completed_juz": comp["completed_juz"],
            "completed_count": len(comp["completed_juz"]),
            "covered_pages_count": comp["covered_pages_count"],
            "records_found": comp["records_found"],
            "last_recorded_at": comp["last_recorded_at"],
            "issued_juz_numbers": sorted(issued["juz"]),
            "issued_count": len(issued["juz"]),
            "pending_juz": pending,
            "pending_count": len(pending),
            "full_quran_completed": comp["full_quran_completed"],
            "full_quran_issued": issued["full_quran"],
            "full_quran_pending": comp["full_quran_completed"] and not issued["full_quran"],
        })

    # Students needing admin action first
    rows.sort(key=lambda r: (-(r["pending_count"] + (1 if r["full_quran_pending"] else 0)), -r["completed_count"]))
    total_pending = sum(r["pending_count"] for r in rows) + sum(1 for r in rows if r["full_quran_pending"])
    return {"students": rows, "total_pending": total_pending}


@api_router.get("/admin/certificates/diagnostics/{student_id}")
async def get_certificate_diagnostics(student_id: str, current_user: User = Depends(get_current_user)):
    """Admin debug view: WHY a student is (not) eligible for certificates.

    Returns the full evidence trail: how many records were found (and from
    which sources), which records couldn't be parsed, page coverage per juz
    with the exact missing pages, and a human-readable Arabic explanation.
    """
    _require_admin(current_user)
    student = await db.users.find_one(
        {"user_id": student_id}, {"_id": 0, "user_id": 1, "name": 1, "role": 1}
    )
    if not student:
        raise HTTPException(status_code=404, detail="لم يتم العثور على الطالب")

    comp = await _get_student_juz_completion(student_id, with_breakdown=True)
    issued = await db.certificates.find(
        {"student_id": student_id, "status": "issued"},
        {"_id": 0, "certificate_type": 1, "juz_number": 1, "certificate_number": 1}
    ).to_list(length=100)
    issued_juz = {c["juz_number"] for c in issued if c["certificate_type"] == "juz" and c.get("juz_number")}
    pending = [j for j in comp["completed_juz"] if j["juz_number"] not in issued_juz]

    # Nearest-to-completion ajzāʼ (partially covered, best first)
    partial = sorted(
        [j for j in comp["juz_breakdown"] if 0 < j["covered_pages"] < j["total_pages"]],
        key=lambda j: -(j["covered_pages"] / j["total_pages"])
    )

    # Human-readable Arabic explanation
    if comp["records_found"] == 0:
        reason = "لا توجد أي سجلات تسميع/حفظ لهذا الطالب في النظام بعد — الشهادة تُبنى على سجل الحفظ الحقيقي فقط."
    elif pending:
        reason = f"الطالب مستحق لـ {len(pending)} شهادة بانتظار إصدار المشرف."
    elif comp["completed_juz"]:
        reason = "جميع الأجزاء المكتملة صدرت لها شهادات مسبقًا — لا جديد بانتظار الإصدار."
    else:
        nearest = partial[0] if partial else None
        nearest_txt = (
            f" أقرب جزء للاكتمال: {nearest['juz_name']} ({nearest['covered_pages']} من {nearest['total_pages']} صفحة)."
            if nearest else ""
        )
        reason = (
            f"لم يكتمل أي جزء بعد: المسجَّل فعليًا يغطي {comp['covered_pages_count']} صفحة من المصحف "
            f"عبر {comp['records_found']} سجل تسميع، والشهادة تتطلب تغطية كل صفحات الجزء."
            + nearest_txt
        )

    return {
        "student_id": student_id,
        "student_name": student.get("name", ""),
        "records_found": comp["records_found"],
        "covered_pages_count": comp["covered_pages_count"],
        "last_recorded_at": comp["last_recorded_at"],
        "completed_juz": comp["completed_juz"],
        "pending_juz": pending,
        "issued_certificates": issued,
        "full_quran_completed": comp["full_quran_completed"],
        "juz_breakdown": comp["juz_breakdown"],
        "partial_juz": partial[:10],
        "unparsed_records": comp["unparsed_records"],
        "parsed_records": comp["parsed_records"],
        "reason": reason,
    }


async def _create_certificate_record(student_id, student_name, certificate_type, juz_number, juz_name,
                                     completion_date, current_user, manual_issue=False,
                                     eligibility_verified=True, verification_note=None):
    """Create + persist a certificate and notify the student in-app.

    Shared by the eligibility-based issue endpoint and the admin manual-issue
    endpoint. `manual_issue` / `eligibility_verified` / `verification_note`
    keep a full audit trail of HOW the certificate was issued.
    """
    now = datetime.now(timezone.utc).isoformat()
    cert = {
        "certificate_id": f"cert_{uuid.uuid4().hex[:12]}",
        "certificate_number": await _next_certificate_number(),
        "student_id": student_id,
        "student_name": student_name,
        "certificate_type": certificate_type,
        "juz_number": juz_number,
        "juz_name": juz_name,
        "completion_date": completion_date,
        "issued_at": now,
        "issued_by": current_user.user_id,
        "issued_by_name": current_user.name,
        # Text signature now; image_url reserved for a future uploaded signature
        "supervisor_signature": {"type": "text", "value": current_user.name, "image_url": None},
        "platform": "مقرأة الرقي",
        "status": "issued",
        "manual_issue": manual_issue,
        "eligibility_verified": eligibility_verified,
        "verification_note": verification_note,
    }
    await db.certificates.insert_one(dict(cert))

    # In-app notification → certificate appears in the student's "شهاداتي"
    if certificate_type == "full_quran":
        n_title = "🌟 شهادة ختم القرآن الكريم"
        n_msg = "مبارك! صدرت لك شهادة ختم القرآن الكريم من مقرأة الرقي. يمكنك تحميلها من قسم «شهاداتي»."
    else:
        n_title = "🎉 صدرت لك شهادة جديدة"
        n_msg = f"مبارك! صدرت لك شهادة إتمام حفظ {juz_name} من مقرأة الرقي. يمكنك تحميلها من قسم «شهاداتي»."
    await db.notifications.insert_one({
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": student_id,
        "type": "certificate_issued",
        "title": n_title,
        "message": n_msg,
        "related_certificate_id": cert["certificate_id"],
        "read": False,
        "created_at": now,
    })
    return cert


@api_router.post("/admin/certificates/issue")
async def issue_certificate(payload: CertificateIssueRequest, current_user: User = Depends(get_current_user)):
    """Admin issues a juz / full-Quran certificate AFTER reviewing eligibility.

    Server re-validates against the real memorization record — a certificate
    can never be issued for a juz the student hasn't actually completed,
    and duplicates are rejected.
    """
    _require_admin(current_user)

    if payload.certificate_type not in ("juz", "full_quran"):
        raise HTTPException(status_code=400, detail="نوع الشهادة غير صحيح")

    student = await db.users.find_one(
        {"user_id": payload.student_id},
        {"_id": 0, "user_id": 1, "name": 1, "role": 1}
    )
    if not student or student.get("role") != "student":
        raise HTTPException(status_code=404, detail="لم يتم العثور على الطالب")

    comp = await _get_student_juz_completion(payload.student_id)

    if payload.certificate_type == "juz":
        jn = payload.juz_number
        if not jn or jn < 1 or jn > 30:
            raise HTTPException(status_code=400, detail="رقم الجزء مطلوب (1 - 30)")
        match = next((j for j in comp["completed_juz"] if j["juz_number"] == jn), None)
        if not match:
            raise HTTPException(status_code=400, detail="لم يكمل الطالب حفظ هذا الجزء بعد حسب سجل الحفظ")
        dup = await db.certificates.find_one(
            {"student_id": payload.student_id, "certificate_type": "juz", "juz_number": jn, "status": "issued"},
            {"_id": 0, "certificate_number": 1}
        )
        if dup:
            raise HTTPException(status_code=400, detail=f"توجد شهادة صادرة مسبقًا لهذا الجزء ({dup['certificate_number']})")
        juz_name = match["juz_name"]
        completion_date = match["completion_date"]
    else:
        if not comp["full_quran_completed"]:
            raise HTTPException(status_code=400, detail="لم يكمل الطالب حفظ القرآن الكريم كاملًا بعد حسب سجل الحفظ")
        dup = await db.certificates.find_one(
            {"student_id": payload.student_id, "certificate_type": "full_quran", "status": "issued"},
            {"_id": 0, "certificate_number": 1}
        )
        if dup:
            raise HTTPException(status_code=400, detail=f"توجد شهادة ختم صادرة مسبقًا لهذا الطالب ({dup['certificate_number']})")
        jn = None
        juz_name = None
        all_dates = [j["completion_date"] for j in comp["completed_juz"] if j["completion_date"]]
        completion_date = max(all_dates) if all_dates else ""

    return await _create_certificate_record(
        payload.student_id, student.get("name", ""), payload.certificate_type,
        jn, juz_name, completion_date, current_user,
        manual_issue=False, eligibility_verified=True, verification_note=None,
    )


@api_router.post("/admin/certificates/manual-issue")
async def manual_issue_certificate(payload: ManualCertificateIssueRequest, current_user: User = Depends(get_current_user)):
    """Admin manually issues a certificate for ANY juz (1-30) or full Quran.

    Flow:
      - Duplicates are ALWAYS rejected (one juz cert per student/juz,
        one khatm cert per student).
      - The system still tries to verify eligibility from the real
        memorization record. If verification fails and force_issue=False
        → HTTP 409 with a warning; the admin confirms and re-sends with
        force_issue=True. The final decision belongs to the admin, with a
        full audit trail (manual_issue / eligibility_verified / verification_note).
    """
    _require_admin(current_user)

    if payload.certificate_type not in ("juz", "full_quran"):
        raise HTTPException(status_code=400, detail="نوع الشهادة غير صحيح")

    student = await db.users.find_one(
        {"user_id": payload.student_id},
        {"_id": 0, "user_id": 1, "name": 1, "role": 1}
    )
    if not student or student.get("role") != "student":
        raise HTTPException(status_code=404, detail="لم يتم العثور على الطالب")

    comp = await _get_student_juz_completion(payload.student_id)
    now_iso = datetime.now(timezone.utc).isoformat()

    if payload.certificate_type == "juz":
        jn = payload.juz_number
        if not jn or jn < 1 or jn > 30:
            raise HTTPException(status_code=400, detail="رقم الجزء مطلوب (1 - 30)")
        dup = await db.certificates.find_one(
            {"student_id": payload.student_id, "certificate_type": "juz", "juz_number": jn, "status": "issued"},
            {"_id": 0, "certificate_number": 1}
        )
        if dup:
            raise HTTPException(status_code=400, detail=f"توجد شهادة صادرة مسبقًا لهذا الجزء ({dup['certificate_number']})")
        match = next((j for j in comp["completed_juz"] if j["juz_number"] == jn), None)
        if match:
            verified, completion_date, note = True, match["completion_date"], None
        else:
            if not payload.force_issue:
                raise HTTPException(status_code=409, detail=(
                    "لم يتمكن النظام من تأكيد اكتمال هذا الجزء من سجل الحفظ تلقائيًا. "
                    "هل تريد المتابعة وإصدار الشهادة يدويًا بصلاحية المشرف؟"
                ))
            verified, completion_date = False, now_iso
            note = "إصدار يدوي بقرار المشرف — لم يتم التحقق تلقائيًا من اكتمال الجزء في سجل الحفظ"
        juz_name = get_juz_display_name(jn)
    else:
        jn, juz_name = None, None
        dup = await db.certificates.find_one(
            {"student_id": payload.student_id, "certificate_type": "full_quran", "status": "issued"},
            {"_id": 0, "certificate_number": 1}
        )
        if dup:
            raise HTTPException(status_code=400, detail=f"توجد شهادة ختم صادرة مسبقًا لهذا الطالب ({dup['certificate_number']})")
        if comp["full_quran_completed"]:
            all_dates = [j["completion_date"] for j in comp["completed_juz"] if j["completion_date"]]
            verified, completion_date, note = True, (max(all_dates) if all_dates else now_iso), None
        else:
            if not payload.force_issue:
                raise HTTPException(status_code=409, detail=(
                    "لم يتمكن النظام من تأكيد ختم القرآن الكريم كاملًا من سجل الحفظ تلقائيًا. "
                    "هل تريد المتابعة وإصدار شهادة الختم يدويًا بصلاحية المشرف؟"
                ))
            verified, completion_date = False, now_iso
            note = "إصدار يدوي بقرار المشرف — لم يتم التحقق تلقائيًا من ختم القرآن كاملًا في سجل الحفظ"

    return await _create_certificate_record(
        payload.student_id, student.get("name", ""), payload.certificate_type,
        jn, juz_name, completion_date, current_user,
        manual_issue=True, eligibility_verified=verified, verification_note=note,
    )


@api_router.get("/admin/certificates")
async def list_certificates(current_user: User = Depends(get_current_user)):
    """Admin: full certificates log (newest first)."""
    _require_admin(current_user)
    return await db.certificates.find({}, {"_id": 0}).sort("issued_at", -1).to_list(length=2000)


@api_router.get("/admin/certificates/{certificate_id}")
async def get_certificate(certificate_id: str, current_user: User = Depends(get_current_user)):
    """Admin: single certificate details (for re-print / re-download)."""
    _require_admin(current_user)
    cert = await db.certificates.find_one({"certificate_id": certificate_id}, {"_id": 0})
    if not cert:
        raise HTTPException(status_code=404, detail="لم يتم العثور على الشهادة")
    return cert


@api_router.post("/admin/certificates/{certificate_id}/send")
async def send_certificate_to_student(certificate_id: str, current_user: User = Depends(get_current_user)):
    """Admin re-sends an in-app notification pointing the student to the certificate."""
    _require_admin(current_user)
    cert = await db.certificates.find_one({"certificate_id": certificate_id}, {"_id": 0})
    if not cert:
        raise HTTPException(status_code=404, detail="لم يتم العثور على الشهادة")
    now = datetime.now(timezone.utc).isoformat()
    label = "شهادة ختم القرآن الكريم" if cert["certificate_type"] == "full_quran" else f"شهادة إتمام حفظ {cert.get('juz_name') or ''}"
    await db.notifications.insert_one({
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": cert["student_id"],
        "type": "certificate_issued",
        "title": "📜 شهادتك بانتظارك",
        "message": f"أرسل لك المشرف {label}. يمكنك عرضها وتحميلها من قسم «شهاداتي».",
        "related_certificate_id": certificate_id,
        "read": False,
        "created_at": now,
    })
    await db.certificates.update_one(
        {"certificate_id": certificate_id},
        {"$set": {"last_sent_at": now}, "$inc": {"sent_count": 1}}
    )
    return {"message": "تم إرسال الشهادة للطالب داخل النظام"}


@api_router.get("/public/certificates/verify/{certificate_number}")
async def verify_certificate_public(certificate_number: str):
    """PUBLIC certificate verification (no auth/token).

    Anyone with a certificate number can confirm its authenticity. Returns ONLY
    non-sensitive public fields — never email/phone/internal ids/notes/etc.
    Ready for a future QR/barcode that opens /certificate-verification?number=...
    """
    number = (certificate_number or "").strip()
    cert = await db.certificates.find_one(
        {"certificate_number": number, "status": "issued"},
        {
            "_id": 0,
            "certificate_number": 1,
            "student_name": 1,
            "certificate_type": 1,
            "juz_number": 1,
            "juz_name": 1,
            "completion_date": 1,
            "issued_at": 1,
            "issued_by_name": 1,
        },
    )
    if not cert:
        return JSONResponse(
            status_code=404,
            content={"valid": False, "message": "لم يتم العثور على شهادة بهذا الرقم."},
        )
    return {
        "valid": True,
        "certificate_number": cert.get("certificate_number"),
        "student_name": cert.get("student_name"),
        "certificate_type": cert.get("certificate_type"),
        "juz_number": cert.get("juz_number"),
        "juz_name": cert.get("juz_name"),
        "completion_date": cert.get("completion_date"),
        "issued_at": cert.get("issued_at"),
        "issuer_name": cert.get("issued_by_name"),
        "institution_name": "مقرأة الرقي",
        "status": "valid",
    }


@api_router.get("/students/me/certificates")
async def get_my_certificates(current_user: User = Depends(get_current_user)):
    """Student: own issued certificates for the «شهاداتي» section."""
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="هذا القسم للطلاب فقط")
    return await db.certificates.find(
        {"student_id": current_user.user_id, "status": "issued"}, {"_id": 0}
    ).sort("issued_at", -1).to_list(length=200)


# Include router
app.include_router(api_router)

# ===== SITEMAP.XML WITH PROPER HEADERS =====
from fastapi.responses import Response

def generate_sitemap(base_url: str) -> str:
    """Generate sitemap XML with dynamic base URL"""
    # Remove trailing slash if present
    base_url = base_url.rstrip('/')
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>{base_url}/</loc>
    <lastmod>2025-01-20</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>{base_url}/login</loc>
    <lastmod>2025-01-20</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>{base_url}/teachers</loc>
    <lastmod>2025-01-20</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
</urlset>"""

@app.get("/sitemap.xml", include_in_schema=False)
async def sitemap(request: Request):
    """Serve sitemap.xml with proper XML headers for search engines"""
    # Use request base URL or fallback to production domain
    base_url = str(request.base_url).rstrip('/')
    return Response(
        content=generate_sitemap(base_url),
        media_type="application/xml",
        headers={
            "Content-Type": "application/xml; charset=utf-8",
            "X-Robots-Tag": "noindex"
        }
    )

@app.get("/robots.txt", include_in_schema=False)
async def robots(request: Request):
    """Serve robots.txt for search engines"""
    base_url = str(request.base_url).rstrip('/')
    robots_content = f"""User-agent: *
Allow: /
Allow: /teachers
Allow: /login
Disallow: /dashboard/
Disallow: /profile
Disallow: /book/
Disallow: /classroom/

Sitemap: {base_url}/sitemap.xml"""
    return Response(
        content=robots_content,
        media_type="text/plain"
    )

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# ===== SOCKET.IO HANDLERS FOR WEBRTC =====
@sio.event
async def connect(sid, environ):
    """Handle client connection"""
    logger.info(f"Client connected: {sid}")
    await sio.emit('connected', {'sid': sid}, room=sid)

@sio.event
async def disconnect(sid):
    """Handle client disconnection"""
    logger.info(f"Client disconnected: {sid}")

@sio.event
async def join_room(sid, data):
    """Join a specific room (session)"""
    room_id = data.get('room_id')
    user_role = data.get('user_role', 'unknown')
    
    logger.info(f"Client {sid} joining room {room_id} as {user_role}")
    
    # Join the room
    await sio.enter_room(sid, room_id)
    
    # Get all clients in the room
    room_clients = list(sio.manager.rooms.get('/', {}).get(room_id, set()))
    
    # Notify others in the room
    await sio.emit('user_joined', {
        'sid': sid,
        'user_role': user_role,
        'room_id': room_id,
        'participants': len(room_clients)
    }, room=room_id, skip_sid=sid)
    
    # Send room info to the joining client
    await sio.emit('room_joined', {
        'room_id': room_id,
        'participants': len(room_clients),
        'others': [s for s in room_clients if s != sid]
    }, room=sid)

@sio.event
async def leave_room(sid, data):
    """Leave a specific room"""
    room_id = data.get('room_id')
    logger.info(f"Client {sid} leaving room {room_id}")
    
    await sio.leave_room(sid, room_id)
    await sio.emit('user_left', {'sid': sid}, room=room_id)

@sio.event
async def offer(sid, data):
    """Forward WebRTC offer"""
    target_sid = data.get('target')
    offer_data = data.get('offer')
    
    logger.info(f"Forwarding offer from {sid} to {target_sid}")
    
    await sio.emit('offer', {
        'offer': offer_data,
        'sender': sid
    }, room=target_sid)

@sio.event
async def answer(sid, data):
    """Forward WebRTC answer"""
    target_sid = data.get('target')
    answer_data = data.get('answer')
    
    logger.info(f"Forwarding answer from {sid} to {target_sid}")
    
    await sio.emit('answer', {
        'answer': answer_data,
        'sender': sid
    }, room=target_sid)

@sio.event
async def ice_candidate(sid, data):
    """Forward ICE candidate"""
    target_sid = data.get('target')
    candidate = data.get('candidate')
    
    logger.info(f"Forwarding ICE candidate from {sid} to {target_sid}")
    
    await sio.emit('ice_candidate', {
        'candidate': candidate,
        'sender': sid
    }, room=target_sid)
