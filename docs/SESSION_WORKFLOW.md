# SESSION_WORKFLOW.md

Lifecycle of a teacher-student booking session as currently implemented.

> **Do not change behavior.** Many side-effects (90-min cutoff, cross-teacher attendance, notification creation, hidden_for_user_ids) are load-bearing. The pytest regression in `tests/test_session_join_attendance.py`, `tests/test_attendance_cross_teacher.py`, and `tests/test_student_profile_attendance.py` covers these.

---

## 1. Files involved

### Backend
- `server.py` lines 1548–2249 (teachers, slots, sessions, attendance, rating, cancel, hide, join, room)
- `server.py` lines 2251–2416 (teacher session notes + memorization entries)
- `server.py` lines 4174–4307 (notes + student progress)
- `server.py` lines 7560–7647 (Socket.IO WebRTC signaling for the live classroom)

### Frontend
- `pages/BookSession.js` — slot picker + book button
- `pages/StudentDashboard.js` — “مواعيدي” tab; cancel + join
- `pages/TeacherDashboard.js` — “الحصص والمواعيد”; rate + notes + memorization entries
- `pages/LiveClassroom.js` — WebRTC peer connection inside the session room
- `components/CancelSessionDialog.jsx`
- `components/SessionNotesDialog.jsx`
- `components/PendingEvaluationsDialog.jsx`
- `components/EditMemorizationDialog.jsx`
- `components/SlotsManager.jsx`, `components/VacationManager.jsx` (teacher side)
- `components/StudentRestrictions.jsx`

---

## 2. API routes involved

- `GET /api/teachers`, `GET /api/teachers/{id}/available-slots`
- `POST /api/teacher/slots` (create), `DELETE /api/teacher/slots/{id}` (remove)
- `POST /api/teacher/vacation-days`, `GET …`, `DELETE …`
- `POST /api/sessions/book`
- `GET /api/sessions/my-sessions`
- `PUT /api/sessions/{id}/cancel`
- `DELETE /api/sessions/{id}/hide`
- `PUT /api/sessions/{id}/attendance`
- `POST /api/sessions/{id}/confirm-attendance`
- `PUT /api/sessions/{id}/rate`
- `POST /api/sessions/{id}/notes`
- `GET /api/sessions/{id}/room`
- `POST /api/sessions/{id}/join` and `POST /api/sessions/{id}/join-click`, `GET /api/sessions/{id}/join-link`
- `POST /api/students/{id}/notes`, `GET /api/students/{id}/notes`
- `GET /api/teacher/pending-evaluations`
- `GET /api/admin/all-bookings` (admin)

## 3. Collections involved

- `available_slots`, `vacation_days`, `booking_restrictions`
- `sessions`
- `memorization_progress`
- `student_notes_archive`
- `notifications`
- `student_warnings_eval` (lazy weekly evaluation may fire on read)
- `users` (frozen check on booking)

## 4. Happy path (student books)

1. Student fetches teacher list (`/api/teachers`) and slots (`/api/teachers/{id}/available-slots`).
2. Student calls `POST /api/sessions/book` with `{ teacher_id, scheduled_time, duration }`.
3. Server checks:
   - Student is `role == "student"`.
   - `users.is_frozen != true` (else 403 Arabic message).
   - No `booking_restrictions` doc for `(teacher_id, student_id)`.
   - Slot exists, not booked, not on a vacation day.
   - Lazy-evaluates weekly commitments (may add warnings + freeze on the way).
4. Marks slot `is_booked=true`, inserts `sessions` doc with status `"scheduled"` and (if configured) a `meet_link`.
5. Sends notifications to both parties (`notifications`).

## 5. During the session

- Either party can open the room via `GET /api/sessions/{id}/room` → returns the `meet_link` (or starts the in-app WebRTC room if no link is set).
- Socket.IO handlers in `server.py` (lines 7560–7647) handle signaling for `LiveClassroom.js`.
- Attendance:
  - **Teacher cross-attendance is allowed**: any teacher can confirm attendance via `PUT /api/sessions/{id}/attendance` (booking teacher is not required). See `test_attendance_cross_teacher.py`.
  - Participants can also call `POST /api/sessions/{id}/confirm-attendance` (student or teacher).
  - When attendance is confirmed, `attendance_confirmed`, `attendance_confirmed_by`, and `attendance_confirmed_at` are written.

## 6. After the session

- Teacher rates the student: `PUT /api/sessions/{id}/rate` with `{ rating: "ضعيف" | "مقبول" | "متوسط" | "ممتاز", rating_notes }`.
- Teacher records notes + memorization in one go: `POST /api/sessions/{id}/notes` (also handles multi-section memorization via `memorization_entries`).
- `memorization_progress` rows are inserted; `student_notes_archive` may also receive entries.
- `GET /api/teacher/pending-evaluations` returns sessions in the last 30 days that are `attended=true` but missing rating or memorization — drives the `PendingEvaluationsDialog`.

## 7. 90-minute cutoff (active UI vs history)

`GET /api/sessions/my-sessions` filters out sessions whose `scheduled_time + 90 minutes` is in the past. Records are **not deleted** — they remain in:
- The student's PDF report
- `student_notes_archive` and `memorization_progress`
- The admin `/all-bookings` view (which does NOT apply the 90-min filter)
- The teacher's `student-profile` view

Cancelled sessions have their own visibility (`hidden_for_user_ids`). `DELETE /api/sessions/{id}/hide` adds the current user to that array.

## 8. Cancellation

`PUT /api/sessions/{id}/cancel`:
- Either side can cancel.
- Status flips to `"cancelled"`.
- The slot may be re-opened (depending on rules in the handler).
- Notification is sent to the other party.

Admin can cancel any session.

## 9. Booking restrictions

A teacher can restrict a specific student with `POST /api/teacher/restrict-student`. Subsequent booking attempts on that teacher hit a 403.

## 10. Notifications generated

- `session_booked` (to teacher), `session_cancelled` (to other party), `session_rated`, `session_notes_added`, `attendance_pending` (teacher reminder for past-90-min sessions missing attendance — idempotent).

---

## 11. Important business rules

1. **Frozen students cannot book.** `users.is_frozen=true` short-circuits `POST /sessions/book`.
2. **Lazy weekly evaluation runs on booking and reads.** Side-effect: warnings/freezes may be created during a normal API call. Don't suppress this.
3. **90-min cutoff is for the active UI only.** History endpoints (PDF, admin all-bookings, teacher student profile) MUST NOT apply this filter.
4. **Cross-teacher attendance is allowed.** Tests guarantee this. Removing it is a regression.
5. **Rate, notes, and memorization are separate endpoints** (with `SessionNotesDialog` chaining them client-side when `requireRating=true`). Keep them decoupled server-side.
6. **`meet_link`** may be empty — the in-app WebRTC room (Socket.IO + simple-peer) is the fallback.

---

## 12. What should not be changed casually

- The 90-minute cutoff constant — many tests pin this exact value.
- Cross-teacher attendance permission.
- The `hidden_for_user_ids` mechanism (vs hard delete).
- The order of side-effects in `POST /sessions/book` (frozen check → restriction → weekly-evaluation → slot lock → insert).
- The Arabic error strings — the frontend and tests assert on these literally in places.
