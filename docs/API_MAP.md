# API_MAP.md

Complete inventory of every HTTP route currently exposed by `/app/backend/server.py`. **All routes are prefixed with `/api`** (Kubernetes ingress requirement).

Generated from a deterministic scan of `@api_router.<verb>` decorators (162 routes total at scan time). Method, path, source-file line, and audience are derived directly from code — not inferred.

> **Read-only inventory.** Do not modify behavior of any route as part of refactoring without an explicit feature ticket.

Legend for `Access`:
- **public** — no auth required
- **auth** — any logged-in user (`current_user` resolved via `get_current_user`)
- **student** — `current_user.role == "student"`
- **teacher** — `current_user.role == "teacher"` (admin has the teacher role too)
- **admin** — `current_user.email == ADMIN_EMAIL` (currently `m0m0077100@gmail.com`)
- **teacher_creator** — `current_user.email == TEACHER_CREATOR_EMAIL` (currently same as admin)
- **participants** — only users referenced inside a specific document (e.g., session participants)

---

## Public

| Method | Path | Line | Access |
|--------|------|------|--------|
| GET    | `/api/public/stats` | 437 | public |
| GET    | `/api/public/students-of-week` | 456 | public |
| GET    | `/api/public/content` | 4640 | public |
| GET    | `/api/announcements` | 4421 | public |
| GET    | `/sitemap.xml` (root, not under `/api`) | 7480 | public |

## Auth & profile

| Method | Path | Line | Access |
|--------|------|------|--------|
| POST   | `/api/auth/signup` | 574 | public |
| POST   | `/api/auth/login` | 638 | public |
| POST   | `/api/auth/logout` | 690 | auth |
| POST   | `/api/auth/session` | 704 | public (exchanges Emergent OAuth token for session) |
| GET    | `/api/auth/me` | 809 | auth |
| POST   | `/api/auth/set-password` | 836 | auth (for Google users) |
| POST   | `/api/auth/change-password` | 864 | auth |
| POST   | `/api/auth/verify-dob` | 902 | public |
| POST   | `/api/auth/reset-password-dob` | 939 | public |
| PUT    | `/api/users/date-of-birth` | 971 | auth |
| GET    | `/api/users/date-of-birth` | 990 | auth |
| GET    | `/api/users/profile` | 1163 | auth |
| PUT    | `/api/users/profile` | 1173 | auth |
| PUT    | `/api/users/role/{role}` | 1197 | auth (teacher requires teacher_creator) |
| POST   | `/api/users/upload-picture` | 2197 | auth |

## Admin (account / messaging / lifecycle)

| Method | Path | Line | Access |
|--------|------|------|--------|
| POST   | `/api/admin/create-teacher` | 1228 | teacher_creator |
| GET    | `/api/admin/all-students` | 1253 | admin |
| GET    | `/api/teacher/all-students` | 1266 | teacher |
| PUT    | `/api/admin/promote-to-teacher/{user_id}` | 1279 | admin |
| PUT    | `/api/admin/demote-to-student/{user_id}` | 1307 | admin |
| DELETE | `/api/admin/delete-user/{user_id}` | 1340 | admin |
| GET    | `/api/admin/all-users` | 1439 | admin |
| POST   | `/api/admin/send-bulk-message` | 1453 | admin |
| GET    | `/api/admin/teacher-links` | 1506 | admin |
| PUT    | `/api/admin/teacher-link` | 1520 | admin |
| GET    | `/api/admin/all-bookings` | 2007 | admin |

## Student-of-the-week (admin CRUD)

| Method | Path | Line | Access |
|--------|------|------|--------|
| GET    | `/api/admin/students-of-week` | 467 | admin |
| POST   | `/api/admin/students-of-week` | 480 | admin |
| DELETE | `/api/admin/students-of-week/{student_id}` | 517 | admin |

## Teachers & slots

| Method | Path | Line | Access |
|--------|------|------|--------|
| GET    | `/api/teachers` | 1549 | auth |
| GET    | `/api/teachers/{teacher_id}` | 1576 | auth |
| GET    | `/api/teachers/{teacher_id}/available-slots` | 1603 | auth |
| POST   | `/api/teacher/slots` | 2604 | teacher |
| DELETE | `/api/teacher/slots/{slot_id}` | 2660 | teacher |
| POST   | `/api/teacher/vacation-days` | 2524 | teacher |
| GET    | `/api/teacher/vacation-days` | 2556 | teacher |
| DELETE | `/api/teacher/vacation-days/{vacation_id}` | 2570 | teacher |

## Sessions / bookings

| Method | Path | Line | Access |
|--------|------|------|--------|
| POST   | `/api/sessions/book` | 1637 | student |
| GET    | `/api/sessions/my-sessions` | 1783 | auth |
| POST   | `/api/sessions/{session_id}/join-click` | 1871 | participants |
| GET    | `/api/sessions/{session_id}/join-link` | 1875 | participants |
| POST   | `/api/sessions/{session_id}/join` | 1908 | participants |
| PUT    | `/api/sessions/{session_id}/attendance` | 1948 | teacher (cross-teacher allowed) |
| POST   | `/api/sessions/{session_id}/confirm-attendance` | 1985 | participants |
| PUT    | `/api/sessions/{session_id}/cancel` | 2093 | participants |
| DELETE | `/api/sessions/{session_id}/hide` | 2166 | participants |
| GET    | `/api/sessions/{session_id}/room` | 2226 | participants |
| PUT    | `/api/sessions/{session_id}/rate` | 2252 | teacher |
| POST   | `/api/sessions/{session_id}/notes` | 4174 | teacher |

## Messaging

| Method | Path | Line | Access |
|--------|------|------|--------|
| POST   | `/api/messages/send` | 2285 | auth |
| POST   | `/api/messages/send-to-teacher` | 2315 | student |
| GET    | `/api/messages/my-messages` | 2345 | auth |
| PUT    | `/api/messages/{message_id}/read` | 2379 | recipient |
| DELETE | `/api/messages/{message_id}` | 2419 | participant / admin |
| DELETE | `/api/messages/conversation/{partner_id}` | 2447 | participants |

## Notifications

| Method | Path | Line | Access |
|--------|------|------|--------|
| GET    | `/api/notifications` | 2470 | auth |
| PUT    | `/api/notifications/{notification_id}/read` | 2492 | recipient |
| PUT    | `/api/notifications/read-all` | 2504 | auth |

## Booking restrictions

| Method | Path | Line | Access |
|--------|------|------|--------|
| POST   | `/api/teacher/restrict-student` | 2689 | teacher |
| DELETE | `/api/teacher/restrict-student/{student_id}` | 2728 | teacher |
| GET    | `/api/teacher/restricted-students` | 2762 | teacher |

## Weekly commitment & warnings

| Method | Path | Line | Access |
|--------|------|------|--------|
| GET    | `/api/student/commitment` | 2937 | student |
| PUT    | `/api/student/commitment` | 2966 | student |
| GET    | `/api/admin/frozen-students` | 3002 | admin |
| GET    | `/api/teacher/pending-evaluations` | 3023 | teacher |
| GET    | `/api/teacher/all-students-commitments` | 3052 | teacher |
| GET    | `/api/teacher/student-commitment/{student_id}` | 3113 | teacher |
| GET    | `/api/admin/student-warnings/{student_id}` | 3168 | admin |
| DELETE | `/api/admin/student-freeze/{student_id}` | 3194 | admin |
| DELETE | `/api/admin/student-warnings/{warning_id}` | 3236 | admin |
| GET    | `/api/admin/commitment-holidays` | 3303 | admin |
| POST   | `/api/admin/commitment-holidays` | 3312 | admin |
| DELETE | `/api/admin/commitment-holidays/{holiday_id}` | 3343 | admin |

## Competitions

| Method | Path | Line | Access |
|--------|------|------|--------|
| GET    | `/api/competitions` | 3384 | teacher |
| POST   | `/api/competitions` | 3394 | teacher |
| GET    | `/api/competitions/{competition_id}` | 3421 | teacher |
| PUT    | `/api/competitions/{competition_id}` | 3435 | teacher (owner) |
| DELETE | `/api/competitions/{competition_id}` | 3463 | teacher (owner) |
| POST   | `/api/competitions/{competition_id}/questions` | 3488 | teacher |
| PUT    | `/api/competitions/{competition_id}/questions/{qid}` | 3524 | teacher |
| DELETE | `/api/competitions/{competition_id}/questions/{qid}` | 3557 | teacher |
| POST   | `/api/competitions/{competition_id}/live/start` | 3610 | teacher |
| GET    | `/api/competitions/live/{live_id}` | 3651 | host or joined |
| POST   | `/api/competitions/live/join` | 3685 | student |
| POST   | `/api/competitions/live/{live_id}/leave` | 3726 | student |
| POST   | `/api/competitions/live/{live_id}/begin` | 3741 | host |
| POST   | `/api/competitions/live/{live_id}/next` | 3775 | host |
| POST   | `/api/competitions/live/{live_id}/answer` | 3814 | student |
| POST   | `/api/competitions/live/{live_id}/complete` | 3909 | host |
| GET    | `/api/competitions/live/{live_id}/leaderboard` | 3987 | host or joined |
| GET    | `/api/competitions/live/{live_id}/report` | 4043 | host / admin |
| POST   | `/api/competitions/live/{live_id}/end` | 4150 | host |
| GET    | `/api/student/competition-history` | 4126 | student |
| GET    | `/api/teacher/students/{student_id}/competition-history` | 4137 | teacher / admin |

## Quran / memorization

| Method | Path | Line | Access |
|--------|------|------|--------|
| GET    | `/api/quran/surahs` | 4168 | auth |
| GET    | `/api/students/{student_id}/progress` | 4247 | self or teacher / admin |
| PUT    | `/api/memorization-progress/{progress_id}` | 4310 | teacher |
| DELETE | `/api/memorization-progress/{progress_id}` | 4354 | teacher |

## Announcements

| Method | Path | Line | Access |
|--------|------|------|--------|
| POST   | `/api/admin/announcements` | 4385 | admin |
| DELETE | `/api/admin/announcements/{announcement_id}` | 4432 | admin |

## Statistics / rotations / reports

| Method | Path | Line | Access |
|--------|------|------|--------|
| GET    | `/api/stats/sessions` | 4449 | admin |
| GET    | `/api/admin/weekly-rotation` | 4472 | admin |
| POST   | `/api/admin/weekly-rotation` | 4492 | admin |
| GET    | `/api/current-week-teacher` | 4529 | auth |
| GET    | `/api/admin/top-students` | 4567 | admin |

## Content (CMS)

| Method | Path | Line | Access |
|--------|------|------|--------|
| GET    | `/api/admin/content` | 4651 | admin |
| POST   | `/api/admin/content` | 4665 | admin |
| PUT    | `/api/admin/content/{content_id}` | 4693 | admin |
| DELETE | `/api/admin/content/{content_id}` | 4723 | admin |

## Student performance / notes / profile

| Method | Path | Line | Access |
|--------|------|------|--------|
| GET    | `/api/students/my-performance` | 4741 | student |
| POST   | `/api/students/{student_id}/notes` | 4891 | teacher |
| GET    | `/api/students/{student_id}/notes` | 4932 | teacher / admin / self |
| GET    | `/api/teacher/my-students-notes` | 5005 | teacher |
| GET    | `/api/teacher/student-profile/{student_id}` | 5040 | teacher / admin |

## Student points

| Method | Path | Line | Access |
|--------|------|------|--------|
| GET    | `/api/students/{student_id}/points` | 1001 | self or teacher / admin |
| POST   | `/api/teacher/adjust-points` | 1052 | teacher |
| GET    | `/api/teacher/students-points` | 1117 | teacher |

## Peer review

### Phase 1: discovery & approval

| Method | Path | Line | Access |
|--------|------|------|--------|
| PUT    | `/api/student/review-method` | 5461 | student |
| GET    | `/api/student/review-status` | 5475 | student |
| GET    | `/api/student/peer-recommendations` | 5501 | student |
| GET    | `/api/admin/peer-recommendations/{student_id}` | 5616 | admin |
| GET    | `/api/student/search` | 5781 | student |
| GET    | `/api/admin/student-search` | 5808 | admin |
| POST   | `/api/peers/request` | 5855 | student |
| GET    | `/api/peers/notifications` | 5913 | student |
| POST   | `/api/peers/notifications/{notif_id}/read` | 5921 | recipient |
| GET    | `/api/admin/peer-requests` | 5930 | admin |
| POST   | `/api/admin/peer-partnerships/manual` | 5942 | admin |
| POST   | `/api/admin/peer-requests/{pid}/approve` | 6029 | admin |
| POST   | `/api/admin/peer-requests/{pid}/reject` | 6055 | admin |
| POST   | `/api/peers/cancel` | 6077 | student (own partnership) |
| POST   | `/api/admin/peer-requests/{pid}/unpair` | 6095 | admin |

### Phase 2: scheduling, attendance, evaluations

| Method | Path | Line | Access |
|--------|------|------|--------|
| GET    | `/api/peers/me/partnership` | 6162 | student |
| POST   | `/api/peers/slots` | 6170 | student (partner) |
| GET    | `/api/peers/slots` | 6200 | partner |
| POST   | `/api/peers/slots/{slot_id}/book` | 6211 | other partner |
| GET    | `/api/peers/sessions` | 6255 | partner |
| DELETE | `/api/peers/slots/{slot_id}` | 6265 | creator only |
| DELETE | `/api/peers/sessions/{psid}` | 6279 | either partner (only if not started) |
| POST   | `/api/peers/sessions/{psid}/attendance` | 6319 | partner (self only) |
| POST   | `/api/peers/sessions/{psid}/evaluate` | 6333 | partner (once) |
| GET    | `/api/peers/evaluations` | 6380 | partner |
| GET    | `/api/teacher/students/{student_id}/peer-overview` | 6390 | teacher / admin |

## Weekly plans

| Method | Path | Line | Access |
|--------|------|------|--------|
| POST   | `/api/teacher/weekly-plans` | 6415 | teacher |
| POST   | `/api/teacher/weekly-plans/suggest` | 6444 | teacher |
| GET    | `/api/teacher/students/{student_id}/weekly-plans` | 6820 | teacher / admin |
| GET    | `/api/student/weekly-plans` | 6827 | student |
| DELETE | `/api/teacher/weekly-plans/{plan_id}` | 6835 | teacher (owner) |

## Certificates

| Method | Path | Line | Access |
|--------|------|------|--------|
| GET    | `/api/admin/certificates/eligibility` | 7121 | admin |
| GET    | `/api/admin/certificates/diagnostics/{student_id}` | 7170 | admin |
| POST   | `/api/admin/certificates/issue` | 7288 | admin |
| POST   | `/api/admin/certificates/manual-issue` | 7346 | admin |
| GET    | `/api/admin/certificates` | 7423 | admin |
| GET    | `/api/admin/certificates/{certificate_id}` | 7430 | admin |
| POST   | `/api/admin/certificates/{certificate_id}/send` | 7440 | admin |
| GET    | `/api/students/me/certificates` | 7466 | student (self) |

## Real-time (Socket.IO)

Mounted at `/socket.io` via `python-socketio`. Handlers in `server.py` lines 7560–7647. Used by `LiveClassroom.js` for WebRTC signaling (peer-to-peer video room).

---

## Things to NOT change casually

- Every admin-only route gates on `current_user.email == ADMIN_EMAIL`. Do not switch to role-based gating without an audit — a teacher account is not the same as an admin.
- Many list endpoints filter cancelled / hidden sessions with the **90-minute cutoff** (`get_my_sessions`). Behavior is documented in `SESSION_WORKFLOW.md`.
- Several DELETE endpoints (warnings, freezes) perform **side-effects** (re-evaluate / auto-unfreeze). Do not naively replace with a generic delete handler.
- `/api/peers/sessions/{psid}/evaluate` is **idempotent per evaluator** (second call returns 400). Preserve this.
