# AUTH_FLOW.md

End-to-end documentation of the **current** authentication flow. No logic changes — this file describes the system as it stands.

> **Auth is an integration boundary.** Any change must go through `integration_playbook_expert_v2` per the project conventions. Do not modify endpoints, token shape, or session lifetime as part of refactoring.

---

## 1. Identities & secrets

- **Server-side session token** is the auth source of truth. JWT is wired but secondary; sessions are stored in MongoDB (`user_sessions`).
- **`JWT_SECRET`** env var is required at backend boot (`server.py:86`); without it the process refuses to start.
- **Password hashing**: bcrypt via `passlib.context.CryptContext(schemes=["bcrypt"])`.
- **Admin email** is hard-coded as `m0m0077100@gmail.com` in `server.py:92` and used to gate admin-only endpoints.

---

## 2. Login methods

### 2.1 Email + Password

`POST /api/auth/login` (`server.py:638`).

Request: `{ "email": str, "password": str }`.

Behavior:
1. Find `users` doc by lowercased email.
2. If no `password_hash` field → 400 `"يجب تعيين كلمة مرور أولاً"` (the user has only Google auth so far).
3. `verify_password(plain, hash)` (bcrypt) → 401 on mismatch.
4. Create `user_sessions` doc: `session_token = "session_<32-hex>"`, `expires_at = now + 30 days` (Remember-Me default).
5. Return `{ token, user }`. Also sets a `session_token` cookie (`HttpOnly`, `SameSite=lax`, secure in production).

### 2.2 Google OAuth (Emergent-managed)

The frontend redirects to the Emergent OAuth proxy. After the user authorizes, the proxy returns to `/auth/callback` with a one-time `session_id`. The callback page calls:

`POST /api/auth/session` (`server.py:704`).

Request: `{ "session_id": <emergent-returned-id> }`.

Behavior:
1. Backend calls the Emergent integrations endpoint to redeem the `session_id` for `{ email, name, picture }`.
2. Upsert `users` doc (create with `role: "student"` if new; never reset existing `password_hash` / `role`).
3. Create `user_sessions` doc (same shape as email login).
4. Return `{ token, user }`. The frontend persists the token in localStorage (`session_token`) AND the cookie is set server-side.

### 2.3 Signup (email + password)

`POST /api/auth/signup` (`server.py:574`).

Request: `{ "email", "password" (≥6), "name" }`.

Behavior:
1. Reject duplicate email.
2. Create `users` doc with `role: "student"`, `password_hash = bcrypt(password)`, `user_id = "user_<12-hex>"`.
3. Create session (same as login). Return `{ token, user }`.

---

## 3. Session validation (every authenticated request)

`get_current_user(request)` in `server.py:343`:

```text
1. Read session token in this order:
     a. cookie  "session_token"
     b. header "X-Session-Token"
     c. header "Authorization: Bearer <token>"
   → 401 "Not authenticated" if none

2. Find user_sessions doc by session_token
   → 401 "Invalid session" if missing

3. Validate expires_at (ISO; converted to aware UTC datetime)
   → if expired: delete the session doc, raise 401 "Session expired"

4. Find users doc by user_sessions.user_id
   → 404 "User not found" if missing

5. Return User(**user_doc)
```

The dependency `Depends(get_current_user)` is the **only** way endpoints learn who is calling. All gating downstream uses `current_user.role` or `current_user.email`.

---

## 4. Logout

`POST /api/auth/logout` (`server.py:690`): deletes the `user_sessions` doc for the current token and clears the cookie.

---

## 5. Password-related endpoints

| Endpoint | Purpose | Notes |
|----------|---------|-------|
| `POST /api/auth/set-password` (line 836) | Google-only user setting their first password | requires authenticated user, no `current_password` |
| `POST /api/auth/change-password` (line 864) | Authenticated change | `current_password` required if the user already has a `password_hash` |
| `POST /api/auth/verify-dob` (line 902) | Step 1 of DOB-based reset; returns a short-lived token in `password_reset_tokens` | public |
| `POST /api/auth/reset-password-dob` (line 939) | Step 2 of DOB-based reset; consumes the token + sets new password | public |
| `PUT /api/users/date-of-birth` (line 971) | Authenticated user sets/updates their DOB | one of two “you must set DOB” touchpoints (the other is forced on student dashboard) |

---

## 6. Frontend wiring

- `src/utils/api.js` is an axios instance with `withCredentials: true` and `baseURL = process.env.REACT_APP_BACKEND_URL`. A response interceptor catches **401** and redirects to `/login` (unless already on a public route).
- Auth context (in `App.js`) reads `localStorage.session_token` on boot and calls `GET /api/auth/me` to hydrate `currentUser`. The result is exposed to the entire tree via context.
- After login/signup/Google, the frontend stores `session_token` in `localStorage` AND relies on the `HttpOnly` cookie set by the server. Either path resolves the same session.
- `<ProtectedRoute>` (`src/components/ProtectedRoute.js`) wraps `/student` and `/teacher` and redirects unauthenticated users to `/login`.

---

## 7. Sensitive behaviors / risks

1. **Session lifetime is 30 days** by default (Remember-Me); shorter sessions (when Remember-Me is unchecked) are 24h. Lifetime is set on creation only — there is no rolling-refresh.
2. **Admin password is owned by the real user.** Per `/app/memory/test_credentials.md`, the real admin password is NOT what is documented; tests mint sessions in `user_sessions` directly via `tests/conftest.py::login_or_mint`. **Never reset `password_hash` for `m0m0077100@gmail.com`.**
3. **`session_token` cookie is set with `Secure=true` in production** but the preview is served over HTTPS so this is transparent.
4. **DOB-based password reset** does not require email delivery — the new password is set directly when both DOB and the issued token match.
5. **Tests inject sessions** with token prefix `pytest_…` — preserve the lookup logic that simply does `find_one({"session_token": token})` so these tokens validate.

---

## 8. What should not be changed casually

- Do not replace the server-side session with stateless JWT-only auth.
- Do not centralize gating into a single decorator that conflates `role == "teacher"` and `email == ADMIN_EMAIL`.
- Do not change `session_token` shape; many tests, seed scripts, and the `login_or_mint` fallback depend on `session_<hex>` / `pytest_<hex>`.
- Do not auto-rotate sessions on every request without a feature ticket.
- Do not log raw bcrypt hashes, session tokens, or `password_hash` fields anywhere.
