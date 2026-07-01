# SAFE_REFACTORING_PLAN.md

A risk-graded, gated plan for evolving the codebase **without changing user-visible behavior**. This is a proposal for future iterations — nothing here is being executed now.

> **Hard rule**: do NOT begin any refactor in this plan without explicit user approval AND a clean pytest regression on a seeded DB.

---

## 1. Refactoring principles

1. **Behavior preservation first.** Every refactor is gated by a full pytest regression + a screenshot of the affected screens.
2. **One concern at a time.** No mixed PRs (e.g., file split + endpoint rename in the same change).
3. **Keep the wire intact.** No URL changes, no payload changes, no Arabic error string changes.
4. **Keep `_id` projection.** Every find must keep `{"_id": 0}`.
5. **Keep `datetime.now(timezone.utc)`.** Never reintroduce `datetime.utcnow()`.
6. **Keep the auth gating literal.** Do not collapse `current_user.email == ADMIN_EMAIL` and `current_user.role == "teacher"` into a shared helper without a feature ticket.
7. **Reusable helpers go into clearly named modules** (`auth.py`, `quran_data.py` already exists). Do not introduce abstractions for one-off operations.
8. **Tests are first-class deliverables.** Each refactor PR includes/updates tests.

## 2. Risk map (current code)

| Area | Risk | Why |
|------|------|-----|
| `server.py` size (~7648 lines) | Medium | Single module; many sections; high blast radius per edit |
| `_get_memorization_position` | High | Consumed by 5+ features (smart plan, peer recs, certificate path, PDF, profile) |
| `PAGE_STARTS` / `get_ayah_page` | High | Anchors pinned by tests; sourced from King Fahd Complex |
| Auth session model | High | Server-side sessions; admin password owned by real user |
| Admin email hard-code | Low–Medium | Easy to grep; many callsites; safe to centralize but **must remain literal `m0m0077100@gmail.com`** |
| Arabic surah normalizers (`_cert_normalize_arabic`, `_cert_resolve_surahs`) | Medium | Encode years of dirty-data handling |
| Certificate numbering counter | Medium | Atomic; replacement is a race-condition risk |
| Mongo `_id` projection convention | Medium | Followed everywhere; breaking it surfaces as JSON serialization errors |

## 3. Proposed phased plan

### Phase A — Documentation & guard rails (CURRENT phase, this PR)
- Create `/docs/*` (already done).
- Verify `.env` ignored, no secrets tracked.
- Smoke-test app + public API.
- No code change.

### Phase B — Test hygiene (no logic change)
- Add a `pytest_seed` fixture that seeds the admin/teacher/student trio if absent. Currently `conftest.py` only mints sessions for existing users.
- Document running tests against a seeded preview DB.
- Add a Makefile / `scripts/seed_test_db.py` helper (one-off, idempotent).
- **Expected outcome**: tests run on a fresh preview DB without manual mongo commands.

### Phase C — Module split for `server.py` (one router at a time)
Suggested order (lowest risk first):
1. `auth.py` (lines 343–390 + signup/login/logout/session/password endpoints 536–997)
2. `content.py` (lines 4638–4737 + announcements 4385–4446)
3. `competitions.py` (lines 3359–4165)
4. `messaging.py` (lines 2285–2521)
5. `commitments.py` (lines 2777–3357)
6. `peer_review.py` (lines 5223–6843 split into `phase1` + `phase2`)
7. `weekly_plans.py` (lines 6415–6843)
8. `certificates.py` (lines 6845–7477)
9. `sessions.py` (lines 1548–2249)
10. `memorization.py` (lines 4174–4382)
11. `admin.py` (lines 1339–1546 + 4448–4636 + 1339–1450)

Each split:
- Move the section verbatim into a new file under `/app/backend/routers/`.
- Import the same `api_router` and `get_current_user` from a shared `deps.py`.
- Register the router with `app.include_router(...)`.
- Re-run all related pytest files. No behavior change permitted.

### Phase D — Frontend folder restructure (cosmetic)
- Group `components/` into `components/{student,teacher,admin,peer,plan,messaging,certificates}/`.
- Update imports. No logic change. One PR per folder.
- Gated by a screenshot of the affected screens (student dashboard, teacher dashboard, admin tools).

### Phase E — Notification UI polling (backlog feature; out of scope for refactor)
- `NotificationBell.jsx` polls `/api/notifications/me` and `/api/peers/notifications`.
- Backend already emits the rows; only the UI is missing.
- Treat as a new feature, not a refactor.

### Phase F — Recurring slot creation, automated email reminders (backlog)
- Recurring slots admin tool.
- Wire SendGrid transport in `send_email`; add a 30-min-before-session cron.

## 4. Out of scope (never touch as "refactor")

- Auth — must go through `integration_playbook_expert_v2` per project rules.
- `PAGE_STARTS` table contents.
- The admin email literal.
- The Arabic UI strings, toast messages, or error messages.
- Production DB connectivity or production secrets.
- GitHub push automation.
- `.env` file shape — preview is set up; never commit secrets.

## 5. Acceptance criteria for any refactor PR

- [ ] All linters pass (`mcp_lint_python`, `mcp_lint_javascript`).
- [ ] All pytest files run green against a seeded preview DB.
- [ ] Screenshot diff of every affected screen attached.
- [ ] No new env vars introduced.
- [ ] No Arabic strings changed.
- [ ] `/app/memory/PRD.md` and `/docs/CHANGELOG.md` updated.

## 6. Rollback plan

Every Emergent step is checkpointed. To revert:
- Use the Emergent platform's **Rollback** feature (does not require git revert).
- Do not `git reset` the repo — many platform artifacts live alongside the working tree.

## 7. Recommended first step (after this PR)

Phase B (test hygiene + seeder) is the highest leverage / lowest risk. It unlocks every subsequent phase by making the regression suite usable in this preview.
