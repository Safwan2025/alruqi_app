# Architecture Reference

Technical deep-dive for `Maqra'at Al-Ruqya`. See `/app/README.md` for the high-level overview.

---

## 1. Backend (`/app/backend/`)

### Why `server.py` is a single module

The backend is a single-module FastAPI app (~6600 lines). This was a conscious decision after iteration 30:

* The app is **live in production** (<https://alruqi-quran.org>). A physical split into routers carries non-trivial regression risk for >100 endpoints.
* `server.py` is already organized into **labelled sections** (see *Section Map* below) and most route handlers are well-named.
* A future incremental split (one router at a time, each gated by full regression) is in the backlog as **ROADMAP P1**.

### Section Map (`server.py`)

Every section is preceded by a `# ===== SECTION NAME =====` banner. Line numbers below are approximate (drift as the file grows — search for the banner).

| § | Line  | Section                                       | Purpose |
|---|-------|-----------------------------------------------|---------|
| 1 | 63    | MODELS                                        | Pydantic models for users, sessions, etc. |
| 2 | 193   | CONTENT MANAGEMENT MODELS                     | News, announcements, broadcasts |
| 3 | 209   | NEW MODELS FOR ENHANCED FEATURES              | Peer review, commitments, holidays |
| 4 | 241   | STUDENT NOTES ARCHIVE MODEL                   | Teacher notes per student |
| 5 | 252   | DATE OF BIRTH & FORGOT PASSWORD MODELS        | Password-recovery via DOB |
| 6 | 274   | STUDENT POINTS MODELS                         | Points system models |
| 7 | 287   | AUTH HELPER                                   | `get_current_user`, session cookie / Bearer parsing |
| 8 | 336   | EMAIL SERVICE                                 | (currently inert — would call provider) |
| 9 | 380   | PUBLIC STATS ENDPOINT                         | `/api/public/stats` |
| 10| 399   | STUDENT OF THE WEEK                           | Public + admin endpoints |
| 11| 480   | AUTH ENDPOINTS                                | signup, login, logout, session exchange, set/change password |
| 12| 844   | DATE OF BIRTH & FORGOT PASSWORD               | DOB-verified reset flow |
| 13| 943   | STUDENT POINTS MANAGEMENT                     | Get/adjust points |
| 14| 1106  | USER/PROFILE ENDPOINTS                        | Profile CRUD + role management |
| 15| 1283  | ADMIN PERMANENT ACCOUNT DELETION              | `DELETE /admin/delete-user/{user_id}` |
| 16| 1396  | ADMIN BULK MESSAGING                          | `POST /admin/send-bulk-message` |
| 17| 1449  | TEACHER LINK MANAGEMENT                       | Bookings + teacher visibility |
| 18| ~     | SESSIONS / BOOKINGS                           | slots, booking, attendance, vacations |
| 19| ~     | MEMORIZATION PROGRESS                         | save/list/delete progress entries |
| 20| ~     | WEEKLY COMMITMENTS                            | set, evaluate (with holiday skip), warnings |
| 21| ~     | WEEKLY PLANS                                  | save, fetch, **suggest** (smart) |
| 22| ~     | PEER REVIEW (المراجعة الزوجية)                | partnership, slots, sessions, evaluations |
| 23| ~     | MESSAGING                                     | DM inbox, broadcasts |
| 24| ~     | COMPETITIONS                                  | join, submit, scoring |
| 25| ~     | CONTENT / NEWS                                | content CRUD + image upload |
| 26| ~     | ADMIN — STUDENT FREEZE / WARNINGS / HOLIDAYS  | freeze, unfreeze, delete-warning, commitment-holidays |

### Key complex functions (each has its own inline docstring)

| Function | Where | What it does |
|----------|-------|--------------|
| `get_current_user` | `server.py` §7 | Resolves a user from either cookie session or `Authorization: Bearer ...` |
| `_get_memorization_position` | `server.py` (§ memorization helpers) | Reads `memorization_progress`, normalizes Arabic surah names, detects direction (from_start / from_end / mixed), computes the student's exact frontier surah + ayah |
| `_compute_student_level` | `server.py` (§ memorization helpers) | Builds the level/bucket label + estimated juz |
| `_evaluate_weekly_commitments` | `server.py` (§ weekly commitments) | Iterates through weeks since cursor, counts attended sessions + pages memorized, issues warnings, skips admin-declared **holiday weeks** |
| `suggest_weekly_plan` | `server.py` §21 | Generates the 7-day smart plan from the student's actual records + Madinah pages. See §Weekly Plan below. |
| `_compute_peer_stats` | `server.py` §22 | Aggregates peer evaluations for a partnership |

### `quran_data.py`

* `QURAN_SURAHS`, `SURAH_MAP`, `SURAH_BY_NUMBER` — surah metadata (number, name, ayah_count).
* `SURAH_START_PAGE` — first page of each surah in the Madinah Mushaf.
* `PAGE_STARTS` (604 entries) — **EXACT** `(surah, ayah)` start of each Madinah Mushaf page. Sourced from the King Fahd Complex via `api.alquran.cloud /v1/meta`.
* `get_ayah_page(surah_number, ayah_number)` — binary-search lookup over `PAGE_STARTS`. Returns the precise 1-indexed page (1..604).

**Anchor self-tests** (run on import in test suite):

| surah, ayah | expected page |
|-------------|---------------|
| 1, 1 (الفاتحة) | 1 |
| 2, 1 (البقرة) | 2 |
| 6, 95 (الأنعام) | 140 |
| 36, 1 (يس) | 440 |
| 78, 1 (النبأ) | 582 |
| 114, 1 (الناس) | 604 |

---

## 2. Frontend (`/app/frontend/src/`)

### Files at a glance

```
src/
├── App.js                       ← Router + AuthProvider + DirectionProvider (RTL) + global Toaster
├── index.css                    ← Tailwind base + CSS variables + .tabs-strip utility + Sonner RTL
├── pages/                       ← top-level routes (one component per route)
├── components/                  ← reusable feature components
├── components/ui/               ← Shadcn primitives (Button, Card, Tabs, Dialog, ...)
├── utils/                       ← helpers (api.js, generateStudentReport, printHTML, ...)
└── hooks/                       ← React hooks (useAuth, useDebounce, ...)
```

### Pages (`src/pages/`)

| File | Route | Audience | Tabs / sections |
|------|-------|----------|-----------------|
| `LandingPage.js` | `/` | public | Hero → About → News → Students of Week → License → CTA |
| `NewsPage.js` | `/news` | public | News archive |
| `StudentsOfWeekPage.js` | `/students-of-week` | public | Full students-of-week list |
| `LoginPage.js` | `/login` | public | Email/password + Google Sign-in |
| `StudentDashboard.js` | `/student` | student | مواعيدي, سجل حفظي, ملاحظاتي, رسائلي, التزامي, المسابقات, المراجعة الزوجية |
| `TeacherDashboard.js` | `/teacher` | teacher / admin | الحصص والمواعيد, الطلاب, سجل الحفظ, الملاحظات والتقييمات, الرسائل, الأدوات, المسابقات, المراجعة الزوجية, الإدارة |

### Feature Components (`src/components/`)

Components are grouped by feature. The most complex ones carry a file-top JSDoc comment.

| File | Used by | Role |
|------|---------|------|
| `PeerReviewSection.jsx` | Student + Teacher dashboards | Partnership management + access to PeerScheduleSection |
| `PeerScheduleSection.jsx` | Student dashboard | Time-slot creation + booking + attendance + evaluation; **handles cancel for both unbooked slots and booked sessions** |
| `PeerRequestsManager.jsx` | Admin tools | Approve/reject peer-pair requests |
| `PeerEvalDialog.jsx` | Anywhere | Modal evaluation form (quality + voice/tajweed notes) |
| `PeerStatsDialog.jsx` | Student profile | Peer-review stats per partnership |
| `WeeklyPlanBuilder.jsx` | Teacher dashboard | Create plans — has 2 modes: smart-suggest (with direction selector) + manual builder |
| `StudentCommitment.jsx` | Student dashboard (التزامي tab) | Set/edit `min_sessions_per_week` + `min_pages_per_week` |
| `StudentCommitmentSection.jsx` | Teacher view of student profile | Read-only commitment + warning list with admin-only `delete-warning` button |
| `CommitmentSetupDialog.jsx` | Student first-login | Force-set initial commitment |
| `CommitmentHolidaysManager.jsx` | Admin tools | Declare holiday weeks (skip warning evaluation) |
| `AdminFrozenStudentsManager.jsx` | Admin tools | List/unfreeze frozen accounts |
| `MessageInbox.jsx` | Both dashboards | DM threads |
| `ContentDisplay.jsx` | Landing + News | Renders news cards / images / videos |
| `StudentOfWeek.jsx` | Landing | Compact + full variants |
| `StudentProfileModal.jsx` | Teacher dashboard | Full student profile with ratings %, memorization, attendance, etc. |

### Shadcn UI Primitives (`src/components/ui/`)

Standard set — `Button`, `Card`, `Tabs`, `Dialog`, `Input`, `Label`, `Select`, `Toast`, `Sonner`, `Calendar`, ... Don't modify these unless adding a new primitive.

### Utilities (`src/utils/`)

| File | Purpose |
|------|---------|
| `api.js` | Axios instance with `withCredentials: true` + automatic 401 redirect |
| `printHTML.js` | **Critical** — iframe-based PDF generator that bypasses popup blockers and preserves Arabic ligatures |
| `generateStudentReport.js` | Builds the 2-page student PDF (KPIs, ratings %, memorization table, peer block) |
| `generateWeeklyPlanPDF.js` | Builds a printable weekly-plan PDF |
| `ratingColors.js` | Shared rating → color map (ممتاز green, متوسط amber, ...) |

---

## 3. Key Workflow Deep-Dives

### 3.1 Smart Weekly Plan (`suggest_weekly_plan` in `server.py` §21)

```
POST /api/teacher/weekly-plans/suggest
Body: { student_id, week_start?, direction?, ayahs_per_day? }
```

**Pipeline**:

1. **Read student level/position** via `_get_memorization_position(student_id)` →
   `{current_surah, current_surah_number, current_to_ayah, memorized_surahs, direction, estimated_pages, bucket_label}`.
2. **Calibrate ayahs/day** from the bucket (`juz_amma=6, 5_juz=8, 10_juz=10, 15_juz=12, 20_juz=14, 25_juz=16, 30_juz=18`).
3. **Apply commitment floor**: if the student's `min_pages_per_week > 0`, raise `ayahs_per_day` accordingly.
4. **Apply attendance calibration** from last 20 sessions: `<60%` → gentle (×0.7), `≥85%` → push (×1.15).
5. **Resolve frontier per direction override** (iter31 + iter32): if teacher selects `direction='from_start'`, frontier = max(memorized surah numbers); if `from_end`, frontier = min. Then `next_start = highest_to_in_frontier + 1`. Fresh students default to الفاتحة / الناس / النبأ based on direction.
6. **Build review_segments** from real records (iter32): for each memorized surah, union of all recorded ayah ranges, **excluding the frontier**, ordered by recency in the chosen direction.
7. **Build 7-day skeleton** with pattern `[memorize, memorize, review, memorize, memorize, review, test]`. Each day populated with `surah, from_ayah, to_ayah, from_page, to_page, page_range` using `get_ayah_page` for exact 604-page Madinah Mushaf mapping.
8. **Test day (السبت)** = recite week's full memorize range, with start→end pages min/max-ordered for backward learners.

### 3.2 Peer Review

**Partnership lifecycle**:

1. Student requests partnership: `POST /api/peers/requests`
2. Other student accepts: `POST /api/peers/requests/{rid}/respond {action: "accept"}`
3. Admin approves: `POST /api/peers/partnerships/{pid}/approve`
4. Either side creates slots: `POST /api/peers/slots`
5. The other side books: `POST /api/peers/slots/{slot_id}/book`
6. After session: each marks attendance (`POST /api/peers/sessions/{psid}/attendance`)
7. Each evaluates the other (`POST /api/peers/sessions/{psid}/evaluate`)

**Cancel logic** (iter28):
* `DELETE /api/peers/slots/{slot_id}` — creator only, 403 for others, 400 if already booked.
* `DELETE /api/peers/sessions/{peer_session_id}` — either side, 400 if scheduled_time ≤ now. Deletes linked slot too. Notifies the other party.

### 3.3 Weekly Commitment + Warnings

* `set_student_commitment` — stores `min_sessions_per_week` and `min_pages_per_week`.
* `_evaluate_weekly_commitments` runs implicitly when admin/teacher hits relevant endpoints. Cycles through weeks since the student's cursor. For each completed week:
  * **Skip if the week is in `commitment_holidays`** (admin-declared).
  * Count attended sessions + pages memorized that week.
  * If both targets unmet → insert a `student_warnings` doc.
  * If warnings within last 90 days ≥ 3 → mark `users.is_frozen = true`.
* **Admin delete warning** (iter29): `DELETE /api/admin/student-warnings/{warning_id}` removes the warning AND auto-unfreezes if remaining count drops below 3.
* **Holiday weeks** (iter29): `POST /api/admin/commitment-holidays` with any date inside the week → normalizes to Monday-of-week → stored as `commitment_holidays` doc.

### 3.4 PDF Report Generation

**Why HTML + iframe.print()?**
* `jsPDF` text functions break Arabic ligatures.
* `window.open()` triggers popup blockers in Chrome/Safari.
* The iframe approach (in `utils/printHTML.js`) injects an off-screen `<iframe>`, writes the HTML, waits for fonts + images to load, calls `iframe.contentWindow.print()`, then removes the iframe.

**Student PDF** (`utils/generateStudentReport.js`):
* Page 1: KPIs (memorized pages, sessions, ratings %, attendance %), ratings distribution bars, recent sessions table, recent notes.
* Page 2: Memorization table, peer review stats block.
* Ratings shown as **percentage out of 100** (iter29 + iter30 fix). Distribution bars have **explicit (X%) parens** to avoid the 1185% visual concat bug from iter30.

---

## 4. Environment Variables

### Backend (`/app/backend/.env`)
* `MONGO_URL` — full MongoDB URI (e.g. `mongodb://localhost:27017`)
* `DB_NAME` — database name (`test_database` in preview)
* `EMERGENT_LLM_KEY` — universal LLM key for future Claude / GPT / Gemini features via `emergentintegrations`

### Frontend (`/app/frontend/.env`)
* `REACT_APP_BACKEND_URL` — full backend base URL (Kubernetes routes `/api/*` to backend, everything else to frontend)
* `WDS_SOCKET_PORT=443` — required for webpack-dev-server HMR over HTTPS preview

### Protected variables
**Never rename or delete** `MONGO_URL`, `DB_NAME`, `REACT_APP_BACKEND_URL`. These are wired into the production Kubernetes ingress and supervisor configs.

---

## 5. Future Work (Backlog)

These are documented here as "intentionally not done now":

* **Split `server.py` into FastAPI routers** — one router per `§` section. Suggested order: peer_review → weekly_plans → commitments → admin → sessions → memorization → messaging → competitions → content → auth. Each split must be gated by a full pytest regression + a fresh testing-agent UI pass.
* **Frontend folder restructuring** — group `components/` into `components/{student,teacher,admin,peer,plan,messaging}/`. Currently all are flat which works fine for the ~30 components but will scale poorly past ~60.
* **Notification System UI** — backend already emits `notifications` docs; frontend `NotificationBell.jsx` should poll `/api/notifications/me` and render badges. Currently inert / mocked.
* **Recurring slot creation** — admin tool to create weekly-recurring time slots in one click.
* **Automated email reminders** — currently the email service is inert (logs only). Wire a transport (SendGrid / Resend) and a 30-min-before-session cron.

---

## 6. Conventions & Pitfalls (Lessons learnt)

1. **MongoDB ObjectId is not JSON-serializable**. Always project `{"_id": 0}` on `find`, or use `model_dump(exclude={"id"})`. Insert operations mutate the input dict — never spread it into a response.
2. **`datetime.utcnow()` is deprecated** — use `datetime.now(timezone.utc)`. Store as `.isoformat()`.
3. **Arabic surah names in DB are dirty** — some entries have trailing whitespace, tatweel `\u0640`, or multi-surah strings like "الإسراء و الكهف". `_get_memorization_position` normalizes them.
4. **RTL + Radix primitives** — wrap the app in `<DirectionProvider dir="rtl">` (already done in `App.js`). Don't use `flex-row-reverse` hacks.
5. **Mobile tabs strip** — use the `.tabs-strip` CSS utility from `index.css` instead of `flex-1 min-w-max` on TabsTriggers (iter30 fix).
6. **Test the EXACT flow before declaring success** — the regression suite covers 63 cases; main agent must run them after any change touching auth, suggest, peer review, commitments, or PDF.

---

*Last updated: Mar 2, 2026 (iteration 33 — documentation pass).*
