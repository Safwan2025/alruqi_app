# ROLE_PERMISSIONS.md

Current authorization model in `server.py`. Derived from a deterministic scan of `current_user.email == …` and `current_user.role == …` checks.

> **No role logic should be changed casually.** Many endpoints gate behavior on `current_user.email == ADMIN_EMAIL` rather than on a generic role check — switching them silently to role-based gating WILL break production behavior.

---

## 1. Role taxonomy

There are exactly **three** distinguishable principals:

| Principal | How it is detected | Where it is stored |
|-----------|-------------------|---------------------|
| **Student** | `current_user.role == "student"` | `users.role` |
| **Teacher** | `current_user.role == "teacher"` | `users.role` |
| **Admin** | `current_user.email == ADMIN_EMAIL` (`m0m0077100@gmail.com`) | hard-coded in `server.py` line 92 |

`TEACHER_CREATOR_EMAIL` is currently the same value as `ADMIN_EMAIL` (line 93).

The **admin is also a teacher** (`users.role == "teacher"` for that account). So a teacher-role check passes for the admin, but the reverse is not true.

---

## 2. How `current_user` is resolved

`get_current_user(request)` in `server.py:343`:

1. Reads `session_token` from cookie, then `X-Session-Token` header, then `Authorization: Bearer …`.
2. Fetches the corresponding `user_sessions` doc.
3. Validates `expires_at` (deletes the doc if expired → 401).
4. Loads the matching `users` doc → returns a `User` Pydantic model.

Every protected endpoint declares `current_user: User = Depends(get_current_user)` and then performs one of the explicit checks below.

---

## 3. Explicit gates by category (excerpt from `server.py` scan)

### Admin-only (`current_user.email == ADMIN_EMAIL`)

Lines (subset): 470, 486, 523, 1256, 1285, 1313, 1346, 1442, 1459, 1509, 1526, 2010, 1885 (mixed).

Endpoints include: students-of-week CRUD, all-students listing, promote/demote, delete-user, all-users, bulk-message, teacher-links, all-bookings, content CRUD, announcements CRUD, all admin commitment / freeze / warnings / holiday endpoints, all certificate endpoints, peer-request approve/reject/unpair (admin-only — not just teacher), competition report (host or admin).

### Teacher-creator only (`current_user.email == TEACHER_CREATOR_EMAIL`)

Endpoints: `POST /api/admin/create-teacher` (line 1228), `PUT /api/users/role/{role}` when promoting to teacher (line 1207).

### Teacher (`current_user.role == "teacher"`)

Endpoints: `POST /api/teacher/slots`, `DELETE /api/teacher/slots/{id}`, `POST /api/teacher/vacation-days` and DELETE, `POST /api/teacher/restrict-student` and DELETE, `GET /api/teacher/restricted-students`, `GET /api/teacher/all-students`, `GET /api/teacher/students-points`, `POST /api/teacher/adjust-points`, `POST /api/sessions/{id}/notes`, `PUT /api/sessions/{id}/rate`, `PUT /api/memorization-progress/{id}`, `DELETE /api/memorization-progress/{id}`, `POST /api/students/{id}/notes`, `GET /api/teacher/my-students-notes`, `GET /api/teacher/student-profile/{id}`, all `POST/PUT/DELETE /api/competitions/…` (with extra owner check for mutating ops), `POST /api/teacher/weekly-plans`, `POST /api/teacher/weekly-plans/suggest`, `GET /api/teacher/students/{id}/weekly-plans`, `DELETE /api/teacher/weekly-plans/{id}`, `GET /api/teacher/pending-evaluations`, `GET /api/teacher/all-students-commitments`, `GET /api/teacher/student-commitment/{id}`.

### Student (`current_user.role == "student"`)

Endpoints: `POST /api/sessions/book`, `GET /api/student/commitment`, `PUT /api/student/commitment`, `GET /api/students/my-performance`, `GET /api/student/peer-recommendations`, `PUT /api/student/review-method`, `GET /api/student/review-status`, `GET /api/student/search`, `POST /api/peers/request`, `POST /api/peers/cancel`, `POST /api/peers/slots` (must be partner), `POST /api/peers/slots/{id}/book`, `POST /api/peers/sessions/{id}/attendance`, `POST /api/peers/sessions/{id}/evaluate`, `GET /api/student/weekly-plans`, `GET /api/students/me/certificates`, `GET /api/student/competition-history`, `POST /api/competitions/live/join`, `POST /api/competitions/live/{id}/leave`, `POST /api/competitions/live/{id}/answer`, `POST /api/messages/send-to-teacher`.

### Owner / participant checks (per-document)

Many session and message endpoints check that `current_user.user_id` is one of the document's `student_id`/`teacher_id`/`sender_id`/`recipient_id` (e.g., `cancel`, `confirm-attendance`, `messages/{id}` delete, peer session cancel/attendance/evaluate).

---

## 4. Cross-cutting rules

- **`current_user.email == ADMIN_EMAIL` is NOT the same as `current_user.role == "teacher"`.** A teacher who is not the admin must get 403 on admin-only endpoints, even though they have `role == "teacher"`. The current code enforces this strictly — keep it that way.
- **Admin can cancel/hide ANY session.** `DELETE /sessions/{id}/hide` allows the admin to bypass the participant check. Several read-side endpoints (`/admin/all-bookings`) also bypass the 90-minute cutoff filter applied for normal users.
- **Teacher cross-attendance**: any teacher (not just the booking teacher) can confirm attendance on a session via `PUT /sessions/{id}/attendance`. This is tested by `tests/test_attendance_cross_teacher.py`.
- **Idempotency**: peer evaluation, competition answer, and warning evaluation are explicitly idempotent. Do not refactor away the duplicate-detection guards.
- **Forbidden gestures**: do not introduce a generic `is_admin` decorator that diverges from `current_user.email == ADMIN_EMAIL`; do not introduce role inheritance (admin > teacher > student); do not move the admin email to a database-driven flag without a feature ticket — many tests, seed scripts, and the README mention `m0m0077100@gmail.com` literally.

---

## 5. Forbidden access matrix (must remain enforced)

| Actor              | Cannot do                                                                  |
|--------------------|-----------------------------------------------------------------------------|
| Student            | Any `/api/admin/*`, any `/api/teacher/*` write, any competition mutation, any other student's commitment/profile (`/teacher/student-commitment/{id}` returns 403 for student) |
| Teacher (non-admin)| `/admin/create-teacher`, peer-request approve/reject/unpair, certificate issue/manual-issue/send, freeze/unfreeze, commitment holidays CRUD, warning delete, bulk-message |
| Admin              | Nothing — admin has the union of all three sets within the current product scope |

---

## 6. Sensitive endpoints (audit before changing)

1. `DELETE /api/admin/delete-user/{user_id}` (line 1340) — cascades to remove user data; admin only.
2. `POST /api/auth/session` (line 704) — exchanges an Emergent OAuth token for a session. The token comes from `EMERGENT_AUTH_URL` (see `AUTH_FLOW.md`).
3. `POST /api/admin/create-teacher` — single email gate; the only way to create teacher accounts manually.
4. `POST /api/admin/certificates/issue` / `manual-issue` — irrevocable issuance with unique numbering. Duplicate guards live in the handler; preserve them.
5. `DELETE /admin/student-freeze/{id}` — automatically writes `warning_reset_at` so old warnings don't immediately re-freeze. Do not remove this side-effect.
