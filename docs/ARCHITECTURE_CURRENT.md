# ARCHITECTURE_CURRENT.md

Snapshot of the **current** Maqra'at Al-Ruqya (مقرأة الرقي) codebase as it exists in this Emergent preview, captured without changing any feature behavior.

> Companion to `/app/ARCHITECTURE.md` (long-form reference written by the previous team) and `/app/README.md`. This file focuses on what is **actually present and running today** so future safe refactors have a reliable baseline.

---

## 1. Stack at a glance

| Layer    | Technology / Version |
|----------|----------------------|
| Frontend | React 19, Tailwind 3.4, Shadcn/UI (Radix primitives), lucide-react, sonner, react-router-dom v7, axios, recharts, jspdf, socket.io-client, simple-peer |
| Backend  | FastAPI 0.110, Pydantic v2.12, Motor 3.3 (async MongoDB), passlib + bcrypt, python-jose (PyJWT), python-socketio, sendgrid SDK, emergentintegrations |
| Database | MongoDB (single instance, async via Motor) |
| Process  | Supervisor (backend → uvicorn on `0.0.0.0:8001`, frontend → CRACO dev-server on `:3000`) |
| Ingress  | Kubernetes routes `/api/*` → port 8001, everything else → port 3000 |
| Auth     | Email/Password (bcrypt) + Emergent-managed Google OAuth; both produce a server-side session token persisted in `user_sessions` |

## 2. Repository layout (top-level)

```
/app
├── README.md                  ← high-level overview (Arabic-aware)
├── ARCHITECTURE.md            ← long-form deep dive (kept verbatim)
├── design_guidelines.json
├── auth_testing.md            ← legacy auth notes
├── backend/
│   ├── server.py              ← single-module FastAPI app (~7648 lines)
│   ├── quran_data.py          ← Madinah-Mushaf 604-page lookup + surah metadata (~853 lines)
│   ├── requirements.txt
│   ├── .env                   ← preview-only, git-ignored
│   └── tests/                 ← 20 pytest files (see TESTING_GUIDE.md)
├── frontend/
│   ├── package.json
│   ├── craco.config.js
│   ├── tailwind.config.js
│   ├── .env                   ← preview-only, git-ignored
│   ├── public/
│   └── src/
│       ├── App.js             ← router + AuthProvider + DirectionProvider (RTL) + Toaster
│       ├── index.css          ← Tailwind layers, design tokens, `.tabs-strip`
│       ├── pages/             ← 15 route components
│       ├── components/        ← 53 feature components + `ui/` Shadcn primitives
│       ├── utils/             ← 7 helpers (api, printHTML, generate*PDF, formatters)
│       └── hooks/             ← `use-toast`
├── scripts/                   ← seed / migration / one-off scripts
├── tests/                     ← (top-level) legacy / e2e holding folder
├── docs/                      ← THIS folder (engineering documentation)
└── memory/
    ├── PRD.md
    └── test_credentials.md
```

## 3. Backend module map (`server.py` sections in order)

`server.py` is **deliberately a single module** (~7648 lines). Sections are demarcated by `# ===== SECTION =====` banners; line ranges are approximate.

| Lines        | Section                                                |
|--------------|--------------------------------------------------------|
| 1–118        | Imports, environment loading, FastAPI app + router, bcrypt context |
| 119–242      | Core Pydantic models (User, Session, Booking, Memorization, etc.) |
| 249–263      | Content management models |
| 265–295      | Enhanced features models (peer review, commitments, holidays) |
| 297–306      | Student notes archive model |
| 308–328      | DOB / forgot-password models |
| 330–341      | Student points models |
| 343–390      | `get_current_user` auth helper |
| 392–434      | Email service (SendGrid, currently inert) |
| 436–454      | `/public/stats` |
| 456–534      | Student-of-the-week (public + admin CRUD) |
| 536–898      | Auth endpoints (signup, login, logout, session exchange, change/set password) |
| 900–997      | DOB-based forgot-password flow |
| 999–1160     | Student points management |
| 1162–1337    | User / profile endpoints + role transitions |
| 1339–1450    | Admin permanent account deletion |
| 1452–1503    | Admin bulk messaging |
| 1505–1546    | Teacher link management (teacher visibility per student) |
| 1548–1634    | Teacher list endpoints + available slots |
| 1636–2249    | Sessions / bookings (book, list, attendance, rate, cancel, hide, join, room) |
| 2251–2416    | Session notes + memorization entries (teacher feature) |
| 2418–2467    | Message delete (single + full conversation) |
| 2469–2521    | Notifications |
| 2523–2601    | Vacation / unavailable days |
| 2603–2686    | Teacher slots management |
| 2688–2775    | Booking restrictions |
| 2777–3357    | Weekly commitment + warnings + holiday weeks |
| 3359–3583    | Competitions management (CRUD + questions) |
| 3585–4165    | Competitions live sessions (join, begin, next, answer, complete, leaderboard, report) |
| 4167–4307    | Quran data API + student progress + edit memorization |
| 4309–4446    | Edit/delete memorization + global announcements |
| 4448–4636    | Statistics, weekly rotation, most-engaged students |
| 4638–4737    | Content management system |
| 4739–4887    | Student performance indicator |
| 4889–5036    | Student notes archive (permanent) |
| 5038–5221    | Complete student profile (teacher view) |
| 5223–6122    | Peer Review Phase 1 (recommendations, requests, search, approvals) |
| 6124–6843    | Peer Review Phase 2 (slots, sessions, evaluations) + Weekly plans + smart-suggest |
| 6845–7477    | Certificates system (eligibility, diagnostics, issue, manual-issue, list, send) |
| 7479–7558    | Sitemap.xml route |
| 7560–7647    | Socket.IO handlers (WebRTC signaling) + ASGI mount |

The router prefix is `/api`. CORS allows the value of `CORS_ORIGINS` env (defaults to `*` for preview).

## 4. Frontend module map

### Pages (`src/pages/`)

| Route                  | File                       | Audience    |
|------------------------|----------------------------|-------------|
| `/`                    | `LandingPage.js`           | public      |
| `/why-us`              | `WhyUsPage.js`             | public      |
| `/students-of-week`    | `StudentsOfWeekPage.js`    | public      |
| `/news`                | `NewsPage.js`              | public      |
| `/about`               | `AboutPage.js`             | public      |
| `/license`             | `LicensePage.js`           | public      |
| `/start`               | `StartJourneyPage.js`      | public      |
| `/login`               | `LoginPage.js`             | public      |
| `/auth/callback`       | `AuthCallback.js`          | post-OAuth  |
| `/profile`             | `ProfilePage.js`           | any logged-in |
| `/teachers`            | `TeachersList.js`          | logged-in   |
| `/book/:teacherId`     | `BookSession.js`           | student     |
| `/student`             | `StudentDashboard.js`      | student     |
| `/teacher`             | `TeacherDashboard.js`      | teacher / admin |
| `/live/:sessionId`     | `LiveClassroom.js`         | session participants |

Route protection lives in `components/ProtectedRoute.js`.

### Components (`src/components/`)

53 feature components + `ui/` Shadcn primitives. Notable cross-cutting components:

- **Auth / global**: `ProtectedRoute`, `SiteNav`, `SiteFooter`, `PublicLayout`, `ScrollToTop`, `NotificationBell`, `MessageInbox`, `SetPasswordDialog`, `ChangePasswordForm`, `ForgotPasswordDialog`, `DateOfBirthManager`
- **Sessions / bookings**: `SlotsManager`, `VacationManager`, `CancelSessionDialog`, `SessionNotesDialog`, `PendingEvaluationsDialog`, `EditMemorizationDialog`, `StudentRestrictions`, `StudentProgress`, `StudentPerformanceIndicator`
- **Commitments**: `StudentCommitment`, `StudentCommitmentSection`, `CommitmentSetupDialog`, `CommitmentHolidaysManager`, `AdminFrozenStudentsManager`, `AllStudentsCommitments`
- **Peer Review**: `PeerReviewSection`, `PeerScheduleSection`, `PeerEvalDialog` (inside `PeerScheduleSection`), `PeerRequestsManager`, `PeerReviewStatsDialog`
- **Weekly Plan**: `WeeklyPlanBuilder`, `StudentWeeklyPlansViewer`
- **Certificates**: `CertificatesManager`, `MyCertificates`, `ManualCertificateIssue`
- **Competitions**: `CompetitionsManager`, `CompetitionHistoryList`, `CompetitionReportDialog`, `JoinCompetitionDialog`, `LiveLeaderboard`, `LiveWaitingRoomDialog`
- **Admin tools**: `AdminAccountDeletion`, `AdminBulkMessaging`, `AnnouncementsManager`, `StudentOfWeekManager`, `ContentManager`, `StudentPointsManager`, `TeacherLinkManager`, `TeacherPromotion`, `TeacherStudentBrowser`, `TeacherStudentsList`, `StudentProfileModal`, `StudentNotesArchive`

### Utilities (`src/utils/`)

| File                          | Purpose |
|-------------------------------|---------|
| `api.js`                      | axios instance with `withCredentials: true`, base = `process.env.REACT_APP_BACKEND_URL`, automatic 401 redirect to `/login` |
| `printHTML.js`                | iframe-based PDF printer (popup-safe, preserves Arabic ligatures) |
| `generateStudentReport.js`    | 2-page student PDF |
| `generateWeeklyPlanPDF.js`    | Weekly-plan PDF |
| `generateCertificatePDF.js`   | Juz + Khatm certificate PDFs (with signature + stamp) |
| `formatArabicDate.js`         | shared ar-EG date formatter |
| `formatSupervisorName.js`     | normalizes "الشيخ {name}" display (idempotent) |

## 5. Cross-cutting concerns

- **Single source of truth for memorization position**: `_get_memorization_position(student_id)` in `server.py`. Used by weekly-plan suggest, peer recommendations, profile, PDF.
- **Single source of truth for Madinah page mapping**: `get_ayah_page(surah, ayah)` in `quran_data.py` (binary search over the 604-entry `PAGE_STARTS` table). Anchors are unit-tested.
- **Single source of truth for current user**: `get_current_user(request)` reads `session_token` from cookie, `X-Session-Token` header, or `Authorization: Bearer …`. Sessions live in `user_sessions` with explicit `expires_at` ISO string.
- **All timestamps**: `datetime.now(timezone.utc).isoformat()` — never `datetime.utcnow()`.
- **All Mongo reads** must project `{"_id": 0}` to avoid serializing `ObjectId`. This convention is **followed everywhere in current code** — do not break it.

## 6. Process / runtime

| Component | Where | Notes |
|-----------|-------|-------|
| MongoDB   | Local container, supervisor-managed | Single instance; preview uses DB name `alruqi_preview` (isolated from production) |
| Backend   | uvicorn 0.0.0.0:8001 via supervisor | Hot reload enabled; restart only on `.env` or dependency changes |
| Frontend  | `craco start` (CRA-based) on :3000 | Hot reload enabled |
| Logs      | `/var/log/supervisor/{backend,frontend}.{err,out}.log` | tail to debug |

## 7. What is intentionally NOT present (or inert)

- Email service (`send_email`) — code is in place, but SendGrid env vars are not set; the function silently no-ops and logs.
- `EMERGENT_LLM_KEY` — not in `.env`; no LLM features are wired in yet (only the dependency is installed).
- Notification UI polling — backend pushes notifications but the `NotificationBell` polling badge is not yet built (per backlog).
- Tests cannot run on a fresh empty preview DB — they expect seed users (see `TESTING_GUIDE.md`).

## 8. What should not be changed casually

1. **`server.py` is a single module by design.** A future incremental split is in the backlog but must be gated by the full pytest regression + a fresh testing-agent UI pass.
2. **`PAGE_STARTS` table in `quran_data.py`** — sourced from King Fahd Complex; anchor tests guarantee `(1,1)=1, (2,1)=2, (6,95)=140, (36,1)=440, (78,1)=582, (114,1)=604`. Editing is forbidden without an audit trail.
3. **Auth flow** — sessions are stored server-side. Never replace with stateless JWT without a full audit.
4. **Admin email**: `m0m0077100@gmail.com` is hard-coded in `ADMIN_EMAIL` / `TEACHER_CREATOR_EMAIL`. Many endpoints gate behavior with `current_user.email == ADMIN_EMAIL`.
5. **Mongo `_id` projection** convention — every find must include `{"_id": 0}`.
6. **`datetime.now(timezone.utc)`** — never re-introduce `datetime.utcnow()`.
