# مقرأة الرقي · Maqra'at Al-Ruqya

Online Quran teaching and memorization platform with unified authentication, role-based dashboards (student, teacher, admin), session booking, smart weekly memorization plans, peer review, competitions, messaging, and PDF reports — fully Arabic / RTL.

**Production**: <https://alruqi-quran.org>

---

## Tech Stack

| Layer    | Technology |
|----------|-----------|
| Frontend | React 19 + TailwindCSS + Shadcn/UI (Radix Primitives), Sonner toasts, lucide-react icons, Amiri + IBM Plex Sans Arabic fonts |
| Backend  | FastAPI (async), Motor (async MongoDB driver), Pydantic v2 |
| Database | MongoDB |
| Auth     | Email/Password (bcrypt + session tokens) + Emergent-managed Google OAuth |
| PDF      | HTML-to-print via in-page iframe (`utils/printHTML.js`) — preserves Arabic ligatures |

---

## Quick Start

### Environment variables

**`/app/backend/.env`** (already configured in container; do NOT change keys):
```
MONGO_URL="mongodb://localhost:27017"
DB_NAME="test_database"
EMERGENT_LLM_KEY=...   # for any future LLM features
```

**`/app/frontend/.env`** (already configured; do NOT change keys):
```
REACT_APP_BACKEND_URL=https://<preview-host>.preview.emergentagent.com
WDS_SOCKET_PORT=443
```

### Running locally (preview environment)

The container already runs everything via supervisor:

```bash
sudo supervisorctl status            # show service status
sudo supervisorctl restart backend   # only after .env or dependency changes
sudo supervisorctl restart frontend
```

* Backend: `http://localhost:8001` (all routes prefixed with `/api`)
* Frontend: `http://localhost:3000` (proxied through the preview URL)
* MongoDB: local instance on 27017

### Running the tests

```bash
cd /app/backend
REACT_APP_BACKEND_URL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2) \
  python -m pytest tests/ -v
```

Test files (each iteration named for the user-fix it covers):

```
tests/test_peer_review_phase2.py             — peer slot/session lifecycle
tests/test_peer_cancel_and_weekly_suggest.py — cancel endpoints + Madinah pages
tests/test_iter29_fixes.py                   — commitment input, holidays, warning delete, direction override
tests/test_iter31_direction_override.py      — direction = traversal-order only
tests/test_iter32_review_precision.py        — review days use real memorized segments
```

Total: **63 tests · all passing** (as of Mar 2, 2026).

---

## Project Structure

```
/app
├── README.md                     ← you are here
├── ARCHITECTURE.md               ← deep technical reference
├── memory/
│   ├── PRD.md                    ← product requirements + changelog
│   └── test_credentials.md       ← seeded accounts for testing
│
├── backend/
│   ├── server.py                 ← FastAPI app (single-module by design — see ARCHITECTURE.md §Backend)
│   ├── quran_data.py             ← Quran metadata + Madinah Mushaf 604-page lookup
│   ├── requirements.txt
│   ├── .env
│   └── tests/                    ← pytest regression suite
│
└── frontend/
    ├── src/
    │   ├── App.js                ← router + global providers (DirectionProvider RTL, AuthContext)
    │   ├── index.css             ← Tailwind + design tokens + .tabs-strip utility
    │   ├── pages/
    │   │   ├── LandingPage.js
    │   │   ├── StudentDashboard.js
    │   │   ├── TeacherDashboard.js
    │   │   ├── NewsPage.js
    │   │   └── ...
    │   ├── components/           ← feature components (peer review, weekly plan, commitments, etc.)
    │   │   └── ui/               ← Shadcn primitives (Button, Card, Tabs, ...)
    │   ├── utils/
    │   │   ├── api.js                       ← axios wrapper with auth
    │   │   ├── formatArabicDate.js          ← shared ar-EG date formatter
    │   │   ├── formatSupervisorName.js      ← "الشيخ {name}" display helper
    │   │   ├── generateStudentReport.js     ← student PDF report builder
    │   │   ├── generateWeeklyPlanPDF.js     ← weekly plan PDF
    │   │   ├── generateCertificatePDF.js    ← juz / khatm certificate PDF
    │   │   └── printHTML.js                 ← iframe-based PDF printer (popup-safe)
    │   ├── public/assets/
    │   │   ├── sheikh_signature.png         ← processed (transparent bg)
    │   │   └── ruqi_stamp.png               ← processed (transparent bg)
    │   └── hooks/
    └── package.json
```

---

## Main API Groups

All endpoints are prefixed with `/api`. See `ARCHITECTURE.md` for a per-endpoint table.

| Group           | Prefix(es)                                       | Examples |
|-----------------|--------------------------------------------------|----------|
| Public          | `/api/public/*`                                  | `/public/stats`, `/public/students-of-week` |
| Auth            | `/api/auth/*`, `/api/users/*`                    | login, signup, change-password, profile |
| Bookings        | `/api/sessions/*`, `/api/slots/*`                | book, cancel, attendance |
| Memorization    | `/api/memorization/*`, `/api/student/progress`   | save, list, summary |
| Weekly Plans    | `/api/teacher/weekly-plans/*`, `/api/student/weekly-plan` | suggest, save, fetch |
| Commitments     | `/api/student/commitment`, `/api/admin/commitment-holidays/*` | min sessions/pages + holiday weeks |
| Peer Review     | `/api/peers/*`, `/api/student/peer-recommendations` | partnership, slots, sessions, evaluations |
| Messaging       | `/api/messages/*`                                | inbox, send, mark-read |
| Competitions    | `/api/competitions/*`                            | join, submit, leaderboard |
| Certificates    | `/api/admin/certificates/*`, `/api/student/certificates` | eligibility, diagnostics, issue, manual-issue, شهاداتي |
| Admin           | `/api/admin/*`                                   | freeze/unfreeze, delete user, bulk messaging |
| Content         | `/api/content/*`, `/api/news/*`                  | news, announcements |

---

## Key Workflows

### 1. Smart Weekly Memorization Plan (`POST /api/teacher/weekly-plans/suggest`)

A 7-day plan is generated from the student's actual memorization records using the Madinah Mushaf 604-page layout. See `ARCHITECTURE.md §Weekly Plan` and the inline docstring on `suggest_weekly_plan` in `server.py`.

**Direction parameter** (`from_start` / `from_end`) controls **traversal order ONLY** — the plan always continues from the student's actual last memorized position, never from الفاتحة/الناس by default.

### 2. Peer Review (المراجعة الزوجية)

Approved pairs of students can post time slots, book each other, attend, and evaluate. See `ARCHITECTURE.md §Peer Review`.

### 3. PDF Reports

All PDFs are generated as HTML and printed via an in-page iframe (`utils/printHTML.js`) — bypasses popup blockers and preserves Arabic ligatures (raw `jsPDF` text breaks them).

### 4. Weekly Commitment & Warnings

Each student sets `min_sessions_per_week` and `min_pages_per_week`. A weekly evaluator issues warnings if both are unmet, with auto-freeze after 3 warnings in 90 days. **Holiday weeks** (declared by admin) are skipped. Admin can delete any warning manually.

### 5. Certificate System (نظام الشهادات)

Two kinds of admin-issued certificates: per-juz and full-Quran (ختم).

- **Eligibility detector** (`server.py :: _get_student_juz_completion`) reads every real memorization record, maps each ayah range to its Madinah-Mushaf pages, and reports a juz as "complete" only when **all** its pages are covered. Handles dirty Arabic input (trailing spaces, missing hamza/madda, multi-surah strings, common aliases) via `_cert_normalize_arabic` + `_cert_resolve_surahs`.
- **Manual issuing** lets the admin override automatic detection. Duplicates are still rejected, and every certificate carries a full audit trail (`manual_issue`, `eligibility_verified`, `verification_note`).
- **PDF rendering** (`utils/generateCertificatePDF.js`) ships two visually distinct designs (green/gold juz, premium triple-gold khatm) with the embedded signature + official stamp, and the sheikh's name normalized to "الشيخ محمد حامد الأنصاري" via `utils/formatSupervisorName.js`.

---

## Conventions

* **All backend routes prefixed with `/api`** (Kubernetes ingress routes `/api/*` to port 8001 and `/*` to port 3000).
* **All MongoDB responses must exclude `_id`** (`{"_id": 0}` projection or skip on insert echo).
* **All env-derived config** comes from `.env` files — never hard-code URLs, ports, or DB names.
* **Frontend API calls** must use `process.env.REACT_APP_BACKEND_URL` (typically via `utils/api.js`).
* **RTL support**: app is wrapped in `<DirectionProvider dir="rtl">` for Radix primitives. Do NOT use brittle `dir="ltr"` / `flex-row-reverse` workarounds.
* **Test IDs**: every interactive element + critical info element has `data-testid="kebab-case-name"`.

---

## Operational Notes

* Hot-reload is enabled for both backend and frontend — supervisor restart is only required after `.env` or dependency changes.
* The user is **Arabic-first**. All UI text, toasts, errors, and PDF labels must be in Arabic.
* Use the `EMERGENT_LLM_KEY` (already in `backend/.env`) for any future Claude / GPT / Gemini features via `emergentintegrations`.

---

## License & Credits

Licensed by جمعية مثاني القرآنية (License #324) for Quran-teaching circle hosting.
