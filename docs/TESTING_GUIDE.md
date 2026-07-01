# TESTING_GUIDE.md

How to run and read the test suite. Honest report of what works today on the **preview** environment vs. what needs a seeded database.

---

## 1. Test inventory (`/app/backend/tests/`)

20 pytest files (see filenames below); the README lists **63 tests · all passing** as of the last documented iteration (Mar 2, 2026 — `iter32_review_precision`).

```
conftest.py                              # shared login_or_mint helper
test_attendance_cross_teacher.py         # any teacher can confirm attendance
test_auth_features.py                    # signup, login, change/set password, DOB reset
test_certificate_diagnostics.py          # per-juz breakdown, unparsed records
test_certificates.py                     # eligibility + issue + numbering
test_competition_live.py                 # Phase 2: join flow
test_competition_live_phase3.py          # Phase 3: question/answer/leaderboard
test_edit_memorization.py                # PUT/DELETE memorization-progress
test_iter29_fixes.py                     # commitment input + holidays + warning delete + direction-override + PDF rating %
test_iter31_direction_override.py        # direction = traversal-order only
test_iter32_review_precision.py          # review days use real memorized segments
test_manual_certificates.py              # manual issuance + duplicate guard
test_memorization_entries.py             # multi-entry recording
test_memorization_feature.py             # progress + summary endpoints
test_peer_cancel_and_weekly_suggest.py   # slot/session cancel + Madinah pages
test_peer_review_phase2.py               # full Phase 2 lifecycle
test_remember_me_bulk_messages.py        # 30-day session + admin bulk msg
test_session_join_attendance.py          # session room + attendance
test_student_profile_attendance.py       # complete student profile read
test_teacher_recitation_link.py          # teacher view of student progress
```

## 2. How conftest authenticates

`tests/conftest.py` defines `login_or_mint(creds)`:

1. Tries `POST /api/auth/login` first.
2. If login fails (e.g., admin password was rotated by the real user), **mints a session directly** in the `user_sessions` collection:
   - finds the user by email in `users`
   - inserts a `user_sessions` doc with `session_token = "pytest_<uuid>"`, `expires_at = now+2h`
   - returns the token

This is why tests **require pre-seeded users to exist** in the active DB.

## 3. Running tests

```bash
cd /app/backend
REACT_APP_BACKEND_URL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2) \
  python -m pytest tests/ -v
```

Or a single file:

```bash
python -m pytest tests/test_peer_review_phase2.py -v
```

## 4. Honest preview status (Feb 2026 fork into this container)

- The preview DB (`alruqi_preview`) is **empty** — no users have been signed up yet.
- Running the full suite against this empty DB **fails immediately at conftest auth** because `login_or_mint` cannot find any user to mint a session for.
- Verified: `tests/test_attendance_cross_teacher.py` fails at step 1 with `assert 401 == 200` for the same reason (the test creates sessions directly via `mongosh` but the auth headers go through an empty `users` collection).

To restore the documented "63/63 passing" status, the preview DB must be **seeded** first (admin `m0m0077100@gmail.com`, test student `test_dialog_user@test.com`, teacher `aalsiiada@gmail.com`). See `/app/memory/test_credentials.md` for the documented identities.

> **The "missing seed" is not a code regression.** It's an environment state. Application logic is intact.

## 5. Test credentials (per `/app/memory/test_credentials.md`)

| Role | Email | Password |
|------|-------|----------|
| Admin | `m0m0077100@gmail.com` | Owned by the real user; tests mint via `login_or_mint` |
| Student | `test_dialog_user@test.com` | `test123456` (may have drifted) |
| Teacher | `aalsiiada@gmail.com` | `teacher_test_123` (may have drifted) |

**Never reset the admin `password_hash`.** Tests do not require it.

## 6. Frontend test approach

There is no `jest` / `vitest` suite for the React app. Frontend testing is done by the agent harness (`testing_agent_v3_fork`) via Playwright, with results stored under `/app/test_reports/iteration_<n>.json`. The convention is documented in `/app/test_result.md`.

`data-testid` attributes are present on every interactive element (per CLAUDE-style rules in the project handoff). Driving the UI by test id is the supported approach.

## 7. Linters

- Python: `flake8` + `black` + `isort` + `mypy` are listed in `backend/requirements.txt` but are not enforced via CI in this repo. The project conventions in the handoff suggest running `mcp_lint_python` before declaring a feature done.
- JS: `eslint` 9 with the React preset is configured; CRACO runs lint as part of `craco build`.

## 8. CI

There is **no CI workflow file** in the repo today (`.github/workflows/` absent). Testing is run locally / by agents.

## 9. Recommended verification ladder

When evaluating any future change, in order:

1. **Lint**: `mcp_lint_python` and `mcp_lint_javascript`.
2. **Targeted tests**: run the pytest file matching the area you touched (peer_review, weekly_plan, certificates, …).
3. **Full backend regression**: `python -m pytest tests/` — but only against a seeded DB.
4. **Frontend smoke**: a screenshot at the relevant route via `mcp_screenshot_tool`.
5. **Agent harness**: `testing_agent_v3_fork` for E2E user flows.

## 10. What should not be changed casually

- `tests/conftest.py` `login_or_mint` — the entire fallback path depends on it.
- `session_token` shape — tests check `find_one({"session_token": "pytest_…"})`.
- The Arabic error strings — tests assert on them literally.
- The pytest file names — they are referenced in `/app/memory/PRD.md` history.
