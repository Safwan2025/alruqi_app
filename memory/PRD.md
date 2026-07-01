# Maqra'at Al-Ruqya (مقرأة الرقي) - PRD

## Original Problem Statement
Clone the GitHub repository `https://github.com/Safwan2025/alruqi_app.git`, install required dependencies, and prepare the project so it can run correctly inside Emergent.

## Overview
Online Quran teaching and memorization platform (Arabic / RTL) with role-based dashboards (student, teacher, admin), session booking, smart weekly memorization plans, peer review, competitions, messaging, certificates, and PDF reports.

## Tech Stack
- **Frontend**: React 19 + TailwindCSS + Shadcn/UI (Radix), CRACO, socket.io-client, lucide-react
- **Backend**: FastAPI (async) + Motor (async MongoDB) + Pydantic v2, python-socketio, JWT + bcrypt auth
- **Database**: MongoDB (local)
- **Auth**: Email/Password (bcrypt + session tokens) + Emergent Google OAuth

## Setup Done (Jan 2026)
- Cloned repo from `https://github.com/Safwan2025/alruqi_app.git` into `/app`
- Installed backend deps from `requirements.txt` (pip)
- Installed frontend deps from `package.json` (yarn)
- Created `/app/backend/.env` with `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `CORS_ORIGINS`
- Created `/app/frontend/.env` with `REACT_APP_BACKEND_URL`, `WDS_SOCKET_PORT`
- Supervisor restarted; backend on port 8001, frontend on port 3000
- Verified: `/api/public/stats` returns 200 OK; landing page renders correctly

## Verified Working
- Backend API (FastAPI) starts and responds on `/api/*`
- Frontend (React) landing page loads with Arabic RTL layout
- MongoDB connected (empty DB, `alruqi_database`)

## Notes / Deferred
- Optional integrations NOT configured (using placeholders per user request):
  - `SENDGRID_API_KEY`, `SENDER_EMAIL` (email sending — inert without keys)
  - `EMERGENT_LLM_KEY` (for any AI features)
- Socket.IO (`socket_app`) is defined in `server.py` but supervisor mounts `server:app` directly, so WebRTC/socket features may not be reachable without adapting the supervisor command (not modified per project rules).
- No admin/teacher/student accounts are seeded — users can sign up via the UI.

## Backlog (from repo)
- P1: Configure SendGrid email delivery
- P1: Verify certificate PDF generation on live env
- P2: Seed initial admin/teacher accounts
- P2: Wire Socket.IO endpoint (WebRTC classroom)

## Next Action Items
- Verify signup/login flow end-to-end via UI
- Add SendGrid/LLM keys when needed
- Seed the initial admin user (`m0m0077100@gmail.com`) as documented in server.py
