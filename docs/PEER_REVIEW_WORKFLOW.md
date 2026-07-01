# PEER_REVIEW_WORKFLOW.md

المراجعة الزوجية — the peer-to-peer review feature where two approved students review each other's memorization.

> **Two-phase implementation; both phases must remain intact.** Phase 1 is discovery + approval; Phase 2 is scheduling + sessions + evaluations. Tests `tests/test_peer_review_phase2.py` and `tests/test_peer_cancel_and_weekly_suggest.py` pin the contract.

---

## 1. Files involved

### Backend
- `server.py` lines 5223–6122 (Phase 1 — discovery, request, approve, reject, unpair)
- `server.py` lines 6124–6843 (Phase 2 — slots, sessions, attendance, evaluations, teacher overview)
- `server.py` `_push_peer_notification` (writes `peer_notifications` rows)
- `server.py` `_compute_peer_stats` (aggregates evaluations for one partnership)

### Frontend
- `components/PeerReviewSection.jsx` — entry point; method selection, current partnership banner, scheduling section embed
- `components/PeerScheduleSection.jsx` — slot creation, booking, attendance, evaluation buttons
- `components/PeerEvalDialog.jsx` (inside `PeerScheduleSection`) — modal evaluation form
- `components/PeerRequestsManager.jsx` — admin tool: approve / reject / unpair
- `components/PeerReviewStatsDialog.jsx` — read-only stats for one partnership

---

## 2. API routes involved

### Phase 1
- `PUT /api/student/review-method` — set `users.review_method` to `"peer"` or `"self"`
- `GET /api/student/review-status` — current status + active partnership (if any)
- `GET /api/student/peer-recommendations` — ranked peers by level + direction + frontier proximity
- `GET /api/student/search?q=` — manual search for a peer
- `POST /api/peers/request` — student initiates pairing
- `GET /api/peers/notifications`, `POST /api/peers/notifications/{nid}/read`
- `GET /api/admin/peer-requests` — admin tray
- `POST /api/admin/peer-requests/{pid}/approve` — admin approval; flips `users.review_method='peer'` for both sides
- `POST /api/admin/peer-requests/{pid}/reject`
- `POST /api/peers/cancel` — either side can withdraw before approval
- `POST /api/admin/peer-requests/{pid}/unpair` — admin breaks an approved partnership
- `POST /api/admin/peer-partnerships/manual` — admin creates a partnership directly without a request

### Phase 2
- `GET /api/peers/me/partnership` — current student's active partnership
- `POST /api/peers/slots` — creator-side slot creation
- `GET /api/peers/slots` — list slots for the partnership
- `POST /api/peers/slots/{sid}/book` — other partner books a slot → creates `peer_review_sessions` row
- `GET /api/peers/sessions` — list sessions for the partnership
- `DELETE /api/peers/slots/{sid}` — creator only; 403 for other; 400 if booked
- `DELETE /api/peers/sessions/{psid}` — either partner; 400 if `scheduled_time` ≤ now; deletes linked slot; notifies the other
- `POST /api/peers/sessions/{psid}/attendance` — each side marks self
- `POST /api/peers/sessions/{psid}/evaluate` — once per evaluator; idempotent (second call returns 400)
- `GET /api/peers/evaluations` — list evaluations involving me
- `GET /api/teacher/students/{sid}/peer-overview` — teacher/admin read-only view of method, partnership, sessions, evaluations

---

## 3. Collections involved

- `peer_partnerships` — pair-level state (pending/approved/rejected/cancelled)
- `peer_review_slots` — open slots
- `peer_review_sessions` — booked sessions
- `peer_evaluations` — one row per (session, evaluator)
- `peer_notifications` — per-event notifications (separate from `notifications`)
- `users` — read for `review_method`, name, picture

---

## 4. Partnership state machine

```
pending  ──admin approve──▶  approved  ──admin unpair──▶  cancelled
   │                              │
   ├──admin reject──▶ rejected    └──either student cancel before book──▶ cancelled
   │
   └──either student cancel─▶ cancelled
```

On `approved`:
- `users.review_method='peer'` is set for **both** sides (UX shortcut — students don't need to set it manually).
- Both sides receive a `peer_partnership_approved` notification.

On `unpair` (admin only):
- Status flips to `cancelled` with `unpaired_at`, `unpaired_by`, `unpaired_by_name`.
- All un-booked `peer_review_slots` for this partnership are deleted.
- Past slots/sessions/evaluations are **preserved** (history).
- Both sides receive a `peer_unpaired` notification.
- Their `review_method` stays `'peer'`, so they can immediately request a new partner.

---

## 5. Session lifecycle (Phase 2)

1. Creator (either partner) calls `POST /api/peers/slots` with `{ scheduled_time, duration, meet_link? }`.
2. Other partner sees the slot via `GET /api/peers/slots` and calls `POST /api/peers/slots/{sid}/book`.
3. Server creates a `peer_review_sessions` row, flips `is_booked=true` on the slot, notifies the creator.
4. At session time, each side marks attendance via `POST /api/peers/sessions/{psid}/attendance`.
5. Each side submits an evaluation via `POST /api/peers/sessions/{psid}/evaluate` — first call inserts a `peer_evaluations` row + appends evaluator's user_id to the session's `evaluations_done_by` array. Second call returns 400 `"تم تسجيل تقييمك مسبقاً"`.

**Cancellation invariants** (iter28):
- Slot delete: creator only. 403 for the other. 400 if `is_booked=true`.
- Session delete: either side. 400 if `scheduled_time ≤ now` (`"الجلسة بدأت بالفعل — لا يمكن إلغاؤها"`). On delete, the linked slot is also deleted.

---

## 6. Evaluation shape

```text
peer_evaluations {
  evaluation_id, peer_session_id, partnership_id,
  evaluator_id, target_id,
  quality: "ممتاز" | "متوسط" | "مقبول" | "ضعيف",
  mistakes_count: int,
  surah_name, from_ayah, to_ayah,
  notes, advice, recommendations,
  created_at
}
```

`PeerReviewStatsDialog` and the PDF report's page-2 panel **only show evaluations the student RECEIVED** (`target_id == student_id`). Outgoing evaluations are filtered out.

---

## 7. Teacher / admin overview

`GET /api/teacher/students/{student_id}/peer-overview` returns method + active partnership + sessions + evaluations for that student. Used by the teacher's student-profile modal and by the PDF report.

`GET /api/admin/peer-requests?status=` is the admin tray for pending/approved/rejected pairs. Approve/reject/unpair endpoints are **admin-only** (`current_user.email == ADMIN_EMAIL`) — not teacher-allowed.

---

## 8. Smart peer recommendations (Phase 1)

`GET /api/student/peer-recommendations` scores other students by:

| Signal | Score |
|--------|-------|
| Same direction (`from_start`/`from_end`/`mixed`) | +1000 (or +300 if direction unknown) |
| Same bucket (`5_juz`, `10_juz`, …) | +800; else `max(0, 200 − 30 × juz_diff)` |
| Mushaf proximity: same surah | +300 |
| Mushaf proximity: ≤3 surahs apart | +180 |
| Mushaf proximity: ≤8 surahs apart | +80 |
| Review-pool overlap | +20 per overlap, capped at +60 |

Returns name + bucket_label + Arabic `reason` string ("نفس مستوى الحفظ — حول 5 أجزاء · يحفظان نفس السورة (الأنعام)").

---

## 9. Important business rules

1. **Approve/reject/unpair is admin-only.** Teachers cannot break a partnership.
2. **Evaluation is idempotent per evaluator.** Second submit returns 400 with the Arabic message — UI relies on this.
3. **Session-level visibility**: each side sees their own attendance + their own evaluation. The other side's evaluation is shown via `peer-overview` but not editable.
4. **Slot vs session cancel are different.** Don't merge them.
5. **`review_method` flip on approve** is a UX shortcut — preserve it (testing confirms it eliminates a manual step).
6. **`peer_notifications` is a separate collection** from `notifications`. Both exist intentionally.

---

## 10. What should not be changed casually

- The state machine transitions and the side-effects on each transition.
- The idempotency of evaluate.
- The "session_started_in_past" cancel guard (400 with the exact Arabic message).
- The "creator-only slot delete" rule and the "either-side session delete" rule.
- The smart-recommendation scoring weights — they are tuned and tested.
