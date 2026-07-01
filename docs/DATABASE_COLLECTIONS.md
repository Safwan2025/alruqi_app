# DATABASE_COLLECTIONS.md

Inventory of every MongoDB collection currently accessed by `server.py`. Derived from a deterministic scan of `db.<collection>` references. Field lists are summarized from Pydantic models, insert sites, and read projections in code — no schema invention.

> **Read-only inventory.** Do not add, drop, or rename collections as part of a refactor without an explicit ticket. Mongo is schemaless; ad-hoc field additions are tolerated but breaking field removals are not.

The active database name in preview is `alruqi_preview` (configured via `DB_NAME` env). The production database lives elsewhere and must not be reused.

---

## 1. `users`

The canonical account record.

**Identifier**: `user_id` (string, e.g. `"user_<12-hex>"`).
**Key fields** (selected): `user_id`, `email`, `name`, `role` (`"student"` | `"teacher"`), `password_hash`, `picture` (URL/data URI), `phone`, `bio`, `date_of_birth` (`YYYY-MM-DD`), `is_frozen` (bool), `warning_reset_at` (ISO), `review_method` (`"peer"` | `"self"` | null), `created_at`, `updated_at`.

**Used by**: every authenticated endpoint via `get_current_user`. Lookups by `user_id` or `email`. Always projected with `{"_id": 0}`.

**Sensitive**: `password_hash` is bcrypt; never logged, never returned by any endpoint. Auth flow detail in `AUTH_FLOW.md`.

---

## 2. `user_sessions`

Server-side session tokens. The auth source-of-truth.

**Fields**: `user_id`, `session_token` (string; usually `"session_<32-hex>"`; tests may inject `"pytest_…"`), `expires_at` (ISO with TZ), `created_at`.

**Used by**: `get_current_user` (`user_sessions.find_one({"session_token": …})`), `login`, `logout`, `auth/session` (Emergent OAuth exchange).

**Risk**: replacing this with stateless JWT changes every gate in the system. Do not modify silently.

---

## 3. `sessions`

A booked lesson between a student and a teacher.

**Key fields**: `session_id`, `student_id`, `teacher_id`, `student_name`, `teacher_name`, `scheduled_time` (ISO), `duration` (minutes; default 60), `status` (`"scheduled"` | `"cancelled"` | `"completed"`), `meet_link`, `attended` (bool/null), `attendance_confirmed`, `attendance_confirmed_by`, `notes`, `rating` (`"ضعيف"` / `"مقبول"` / `"متوسط"` / `"ممتاز"`), `rating_notes`, `hidden_for_user_ids` (array), `memorization_progress`, `created_at`.

**Used by**: bookings, attendance, rating, notes, weekly-plan-suggest (attendance calibration), commitment evaluation, student PDF report, top-students stats.

**Hard rules**:
- `get_my_sessions` hides sessions whose `scheduled_time + 90 minutes` is in the past (active UI only).
- Cancelled sessions have their own visibility logic; do not collapse the two.

---

## 4. `available_slots`

Teacher-defined open booking slots.

**Key fields**: `slot_id`, `teacher_id`, `day_of_week` or `date`, `start_time`, `duration`, `is_booked`, `created_at`.

**Used by**: `/teacher/slots`, `/teachers/{id}/available-slots`, booking flow.

---

## 5. `vacation_days`

Teacher unavailability.

**Fields**: `vacation_id`, `teacher_id`, `date` (or `from_date`/`to_date`), `reason`, `created_at`.

---

## 6. `booking_restrictions`

Per-(teacher, student) blocks on booking.

**Fields**: `restriction_id`, `teacher_id`, `student_id`, `reason`, `created_at`.

---

## 7. `memorization_progress`

Per-session memorization log (multi-entry supported).

**Key fields**: `progress_id`, `session_id`, `student_id`, `teacher_id`, `surah_name`, `from_ayah`, `to_ayah`, `quality` (one of the four ratings), `notes`, `recorded_at`, `created_at`.

**Used by**: `_get_memorization_position`, weekly-plan suggest, certificate eligibility detector, student PDF report.

**Risk**: Arabic surah names in real data are dirty (trailing spaces, missing hamza, multi-surah strings). All readers must call `_get_memorization_position` or `_cert_normalize_arabic` / `_cert_resolve_surahs`. Do not bypass these helpers.

---

## 8. `student_notes_archive`

Teacher notes per student (permanent, separate from session notes).

**Fields**: `note_id`, `student_id`, `teacher_id`, `session_id` (optional), `note_type` (`"general"` / `"recitation"` / `"behavior"` / `"progress"` / `"evaluation"`), `title`, `content`, `surah_name`, `ayah_from`, `ayah_to`, `rating`, `created_at`.

**Cross-feature use**: recitation notes here are counted by the certificate eligibility detector via `_collect_memorization_records`.

---

## 9. `student_commitments`

Per-student weekly commitment.

**Fields**: `commitment_id`, `student_id`, `min_sessions_per_week` (int ≥1), `min_pages_per_week` (int ≥1), `created_at`, `updated_at`.

---

## 10. `student_warnings`

Issued when a student misses both weekly targets.

**Fields**: `warning_id`, `student_id`, `week_start` (Monday ISO date), `week_end`, `reason`, `sessions_done`, `pages_done`, `created_at`.

**Side-effects**: ≥3 warnings within 90 days → `users.is_frozen=true`. `DELETE /admin/student-warnings/{id}` re-counts and auto-unfreezes if the count drops below 3.

---

## 11. `student_warnings_eval`

Eval cursor for lazy weekly evaluation (so the same week is not re-evaluated repeatedly).

**Fields**: `student_id`, `last_evaluated_week_start` (ISO), `updated_at`.

---

## 12. `commitment_holidays`

Admin-declared holiday weeks (skip warning evaluation).

**Fields**: `holiday_id`, `week_start` (Monday ISO), `reason`, `created_by`, `created_at`.

---

## 13. `messages`

DM + admin broadcast persistence.

**Fields**: `message_id`, `sender_id`, `sender_name`, `recipient_id` (or `recipient_ids` for broadcasts), `subject`, `body`, `is_read`, `deleted_for_user_ids` (array; per-user soft delete for conversation deletes), `created_at`.

**Hard rule**: `DELETE /messages/{id}` is a HARD delete (both sides). `DELETE /messages/conversation/{partner_id}` is per-user soft delete (uses `deleted_for_user_ids`). Keep these distinct.

---

## 14. `notifications`

User-facing in-app notifications.

**Fields**: `notification_id`, `user_id`, `type`, `title`, `body`, `data` (object), `is_read`, `created_at`.

---

## 15. `peer_partnerships`

Approved pair of students for peer review.

**Fields**: `partnership_id`, `student_a_id`, `student_b_id`, `status` (`"pending"` / `"approved"` / `"rejected"` / `"cancelled"`), `requested_by`, `requested_at`, `approved_at`, `approved_by`, `unpaired_at`, `unpaired_by`, `unpaired_by_name`.

**Side-effects on approve**: both users' `users.review_method` is set to `"peer"`.

---

## 16. `peer_review_slots`

Open time slots created by one side of a partnership.

**Fields**: `slot_id`, `partnership_id`, `creator_id`, `scheduled_time`, `duration`, `is_booked`, `meet_link`, `created_at`.

**Hard rule**: a slot can only be cancelled by the creator; if already booked, the booker must cancel the **session** (which deletes the slot atomically).

---

## 17. `peer_review_sessions`

Materialized peer review session (created when a slot is booked).

**Fields**: `peer_session_id`, `partnership_id`, `slot_id`, `creator_id`, `booker_id`, `scheduled_time`, `duration`, `meet_link`, `attendance` (object: `{creator: bool, booker: bool}`), `evaluations_done_by` (array of user_ids), `created_at`.

---

## 18. `peer_evaluations`

One evaluation document per (session, evaluator).

**Fields**: `evaluation_id`, `peer_session_id`, `partnership_id`, `evaluator_id`, `target_id`, `quality` (`"ممتاز"` / `"متوسط"` / `"مقبول"` / `"ضعيف"`), `mistakes_count`, `surah_name`, `from_ayah`, `to_ayah`, `notes`, `advice`, `recommendations`, `created_at`.

**Idempotency**: a second submit from the same evaluator returns 400 `"تم تسجيل تقييمك مسبقاً"`. Preserve this.

---

## 19. `peer_notifications`

Peer-specific notifications (separate from `notifications`).

**Fields**: `notif_id`, `user_id`, `type` (e.g., `peer_partnership_approved`, `peer_session_booked`, `peer_unpaired`), `payload`, `is_read`, `created_at`.

---

## 20. `weekly_plans`

Persisted weekly plans (manual or smart-suggest then saved).

**Fields**: `plan_id`, `student_id`, `teacher_id`, `week_start` (Monday ISO), `days` (array of 7 day objects: kind, surah, from_ayah, to_ayah, from_page, to_page, page_range, memorize_target, review_target, notes), `teacher_notes`, `parent_notes`, `summary`, `created_at`.

---

## 21. `competitions`

Quiz definitions (teacher-authored).

**Fields**: `competition_id`, `owner_id`, `title`, `description`, `status` (`"draft"` / `"published"`), `created_at`.

---

## 22. `competition_questions`

Question bank for each competition.

**Fields**: `question_id`, `competition_id`, `text`, `options` (array of strings), `correct_index`, `points`, `time_limit` (seconds), `order`.

---

## 23. `competition_live_sessions`

A live run of a competition.

**Fields**: `live_id`, `competition_id`, `host_id`, `join_code` (6-digit numeric), `status` (`"waiting"` / `"in_progress"` / `"completed"` / `"ended"`), `participants` (array of `{user_id, name, joined_at}`), `current_question_index`, `current_question_id`, `question_started_at`, `total_questions`, `created_at`, `completed_at`.

---

## 24. `competition_live_answers`

Student answers, one per (live_id, user_id, question_id).

**Fields**: `live_id`, `user_id`, `question_id`, `selected_index`, `is_correct`, `time_taken`, `points_earned`, `created_at`.

**Idempotency**: first-answer-wins; a second submit on the same question is rejected.

---

## 25. `competition_results`

Materialized per-student result rows (created on `/complete`).

**Fields**: `result_id`, `live_id`, `competition_id`, `competition_title`, `host_id`, `user_id`, `name`, `total_points`, `correct_count`, `wrong_count`, `unanswered_count`, `total_questions`, `accuracy_pct`, `rank`, `participants_count`, `completed_at`.

---

## 26. `certificates`

Issued certificates (per-juz or full Khatm).

**Fields**: `certificate_id`, `certificate_number` (`"ALRUQI-CERT-YYYY-NNNN"`), `student_id`, `student_name`, `kind` (`"juz"` / `"khatm"`), `juz_number` (for juz), `juz_display_name`, `issued_by`, `issued_at`, `sent_at`, `manual_issue` (bool), `eligibility_verified` (bool), `verification_note`, `signature_image_url`, `stamp_image_url`.

**Numbering source**: `counters` collection (atomic findOneAndUpdate `$inc`).

---

## 27. `counters`

Atomic counters (currently only `cert_seq` per year).

**Fields**: `key` (`"cert_seq_<year>"`), `seq`.

---

## 28. `password_reset_tokens`

DOB-verified password-reset token (short-lived).

**Fields**: `token`, `email`, `expires_at`, `created_at`.

---

## 29. `announcements`

Global admin announcements.

**Fields**: `announcement_id`, `title`, `content`, `priority` (`"normal"` / `"important"` / `"urgent"`), `created_at`.

---

## 30. `students_of_week`

Featured students.

**Fields**: `student_id`, `name`, `picture`, `featured_week_start`, `note`, `created_at`.

---

## 31. `site_content`

CMS content (news / posts / images).

**Fields**: `content_id`, `kind`, `title`, `body`, `image_url`, `is_featured`, `published_at`, `created_at`, `updated_at`.

---

## 32. `points` / `points_history` / `student_points`

Student points subsystem (booking, attendance, recitation).

- `student_points`: aggregated current totals per student (`booking_points`, `attendance_points`, `recitation_points`, `total_points`).
- `points_history`: per-adjustment audit (`student_id`, `point_type`, `amount`, `reason`, `actor_id`, `created_at`).
- `points`: legacy / read-side mirror; both readers fall back to `student_points` if absent.

---

## 33. `system_settings`

Free-form key/value system flags (e.g., weekly rotation cursor, teacher-link toggles).

---

## Things to NOT change casually

- **Indexes**: none are explicitly created in code (Mongo creates `_id` only). Adding indexes is safe but should be tracked.
- **`session_token` shape**: code expects `session_<hex>` for normal auth and `pytest_<hex>` for tests — preserve both.
- **`_id` projection**: every find call uses `{"_id": 0}`. Any new query must do the same to keep API responses JSON-serializable.
- **`week_start`** is always normalized to **Monday** ISO date (`_week_bounds`). Do not store arbitrary dates.
- **Arabic surah names** in `memorization_progress` and `student_notes_archive` are dirty by design; normalize at read-time only.
