# WEEKLY_PLAN_WORKFLOW.md

The Smart Weekly Memorization Plan feature.

> **High-value, high-risk surface.** The suggest endpoint underwent six documented iterations (29 → 32) to reach its current behavior. Tests in `tests/test_iter29_fixes.py`, `test_iter31_direction_override.py`, and `test_iter32_review_precision.py` pin the exact contract. Do not refactor.

---

## 1. Files involved

### Backend
- `server.py` lines 6415–6843:
  - `POST /api/teacher/weekly-plans` (save)
  - `POST /api/teacher/weekly-plans/suggest` (generate without persisting)
  - `GET /api/teacher/students/{id}/weekly-plans`
  - `GET /api/student/weekly-plans`
  - `DELETE /api/teacher/weekly-plans/{plan_id}`
- `server.py` `_get_memorization_position` (shared with smart plan)
- `quran_data.py` (`get_ayah_page`, `SURAH_BY_NUMBER`, `SURAH_START_PAGE`)

### Frontend
- `components/WeeklyPlanBuilder.jsx` — teacher tool (choose mode → smart-suggest or manual → edit → save)
- `components/StudentWeeklyPlansViewer.jsx` — student-side viewer with print
- `utils/generateWeeklyPlanPDF.js` — A4 RTL print template

---

## 2. API routes involved

- `POST /api/teacher/weekly-plans/suggest`
- `POST /api/teacher/weekly-plans`
- `GET /api/teacher/students/{student_id}/weekly-plans`
- `GET /api/student/weekly-plans`
- `DELETE /api/teacher/weekly-plans/{plan_id}`

---

## 3. Collections involved

- `weekly_plans` (persistence)
- `memorization_progress`, `student_notes_archive` (read by `_get_memorization_position` and review-segments builder)
- `sessions` (read for attendance calibration)
- `student_commitments` (read for min-pages floor)
- `peer_evaluations` (read for summary banner)

---

## 4. Suggest contract

`POST /api/teacher/weekly-plans/suggest`

**Request**
```json
{
  "student_id": "user_…",
  "week_start": "YYYY-MM-DD",          // optional; defaults to next Monday
  "direction": "from_start" | "from_end" | null,  // optional traversal override
  "ayahs_per_day": null | int           // optional manual override
}
```

**Pipeline** (do not reorder)

1. `_get_memorization_position(student_id)` → position + memorized list + auto-detected direction + bucket.
2. Bucket-based default `ayahs_per_day`:
   - juz_amma → 6
   - 5_juz → 8
   - 10_juz → 10
   - 15_juz → 12
   - 20_juz → 14
   - 25_juz → 16
   - 30_juz → 18
3. Commitment floor: if `min_pages_per_week > 0` → raise `ayahs_per_day` accordingly.
4. Attendance calibration over the last 20 sessions:
   - `<60%` attendance → multiply by 0.7 (gentle)
   - `≥85%` attendance → multiply by 1.15 (push)
5. **Direction-override frontier rule (iter31)** — the override controls **traversal order only**, never the starting point:
   - `from_start` → frontier = `max(surah_numbers)` from memorized list
   - `from_end` → frontier = `min(surah_numbers)` from memorized list
   - then `next_start = highest_to_in_frontier + 1`
   - **Fresh student fallback** (zero records): `from_start` → الفاتحة, `from_end` → الناس, no override → النبأ (Juz Amma starter convention)
6. **Review-segments builder (iter32)** — for each memorized surah, take the **union** of all recorded ayah ranges, normalize missing values to whole-surah, **exclude the current frontier**, order by recency in the chosen direction.
7. **7-day skeleton** with kind pattern: `[memorize, memorize, review, memorize, memorize, review, test]`.
8. Populate each day with `surah, from_ayah, to_ayah, from_page, to_page, page_range` via `get_ayah_page`. The test day (السبت) covers the week's full memorize range; cross-surah weeks show `"السورة الأولى → السورة الأخيرة"` and min→max page ordering.
9. Return `{ days[7], teacher_notes: "", parent_notes: "", summary: { bucket_label, ayahs_per_day, intensity, current_surah, current_to_ayah, attendance_rate, peer_avg } }`.

The endpoint **does not persist**. The teacher edits in the UI then calls `POST /api/teacher/weekly-plans` to save.

---

## 5. Save / read / delete

- `POST /api/teacher/weekly-plans`: writes a `weekly_plans` doc with `student_id`, `teacher_id`, `week_start` (Monday ISO), `days`, `teacher_notes`, `parent_notes`, `summary`, `created_at`.
- `GET /api/teacher/students/{id}/weekly-plans`: returns the plans for a student (teacher view).
- `GET /api/student/weekly-plans`: same for the logged-in student.
- `DELETE /api/teacher/weekly-plans/{plan_id}`: teacher-owner-only.

---

## 6. Frontend flow

1. Teacher opens `WeeklyPlanBuilder` for a student.
2. "خطة أسبوع جديدة" → choose mode:
   - **Smart**: pick `from_start` / `from_end` direction → call `/suggest` → table populates + summary banner shows.
   - **Manual**: blank 7-row table.
3. Teacher edits any field (surah, ayahs, page_range, kind, target, notes).
4. Adds optional `teacher_notes` and `parent_notes`.
5. Saves via `POST /teacher/weekly-plans`. The plan appears in `StudentWeeklyPlansViewer` for the student.
6. Either side can print the plan (`utils/generateWeeklyPlanPDF.js` via the iframe printer).

---

## 7. Important business rules

1. **Direction is traversal order, NOT starting point.** This is the iter31 fix — overriding direction never resets the plan to الفاتحة or الناس when the student has prior records.
2. **The frontier is excluded from review days.** It is still being memorized.
3. **Fresh-student review** = "لا يوجد محفوظ سابق للمراجعة بعد" with empty fields, when `next_start == 1` AND no review_segments.
4. **`teacher_notes` and `parent_notes` default to empty.** No generic auto-text.
5. **The test day** (السبت) is always a recap of the week's memorize range with min→max page ordering for backward learners.
6. **All 7 days must populate `from_page`/`to_page`/`page_range`** — derived from `get_ayah_page`. Blank page fields are a regression.

---

## 8. Risks / sensitive areas

- Re-ordering the pipeline above (1–9) will silently change recommendations. The iteration history is in `/app/memory/PRD.md` — read iter28..32 before touching.
- Changing the bucket → ayahs_per_day mapping breaks dozens of student plans implicitly. Treat as configuration.
- Removing the commitment floor (step 3) breaks the contract with students who set very low minimums but the system bumps them up.
- The attendance calibration uses **the last 20 sessions** — not a date range — so a student who books rarely will hit the multiplier slowly.

---

## 9. What should not be changed casually

- `_get_memorization_position` and its return shape.
- The review-segments builder (iter32) — handles split records and frontier exclusion.
- The direction-override frontier rule (iter31).
- `get_ayah_page` and the `PAGE_STARTS` table in `quran_data.py`.
- The 7-day kind pattern `[memorize×2, review, memorize×2, review, test]`.
