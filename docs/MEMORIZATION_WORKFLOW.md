# MEMORIZATION_WORKFLOW.md

How the platform tracks Quran memorization, computes a student's "current position", and feeds downstream features (smart plan, peer recommendations, certificate eligibility, PDF report).

> **Memorization is the data spine of the product.** Dozens of features compute on top of it. Do not change the readers, normalizers, or page-mapping table without a feature ticket and a full pytest regression.

---

## 1. Files involved

### Backend
- `server.py`:
  - Memorization endpoints: lines 4174–4307 (notes + create entries via session notes), 4309–4382 (edit/delete progress)
  - Student progress read: lines 4247–4307 (`GET /api/students/{id}/progress`)
  - `_get_memorization_position` (single source of truth for the student's frontier + memorized scope)
  - `_compute_student_level` (thin wrapper over `_get_memorization_position` — kept for compat)
  - Certificate readers: `_collect_memorization_records`, `_cert_normalize_arabic`, `_cert_resolve_surahs`, `_get_student_juz_completion`
- `quran_data.py`:
  - `QURAN_SURAHS`, `SURAH_MAP`, `SURAH_BY_NUMBER` (114 surahs metadata)
  - `SURAH_START_PAGE` (first page of each surah in the Madinah Mushaf)
  - `PAGE_STARTS` (604 entries; exact `(surah, ayah)` start of each page; sourced from the King Fahd Complex)
  - `get_ayah_page(surah_num, ayah_num)` (binary search; 1-indexed result 1..604)
  - `get_juz_page_range`, `get_juz_display_name` (Madinah-Mushaf juz boundaries)

### Frontend
- `pages/StudentDashboard.js` — "سجل حفظي" tab + memorization summary
- `pages/TeacherDashboard.js` — "سجل الحفظ" tab + edit/delete dialogs
- `components/StudentProgress.jsx`
- `components/SessionNotesDialog.jsx` — multi-entry memorization recording during session evaluation
- `components/EditMemorizationDialog.jsx`
- `components/StudentPerformanceIndicator.jsx`
- `components/StudentNotesArchive.jsx`
- `utils/generateStudentReport.js` (page 1 memorization table)
- `utils/generateCertificatePDF.js` (consumes pages from `get_ayah_page` indirectly)

---

## 2. API routes involved

- `GET /api/quran/surahs`
- `POST /api/sessions/{session_id}/notes` (multi-entry memorization saved here)
- `GET /api/students/{student_id}/progress`
- `PUT /api/memorization-progress/{progress_id}` (teacher edit)
- `DELETE /api/memorization-progress/{progress_id}` (teacher delete)
- `POST /api/students/{student_id}/notes`, `GET /api/students/{student_id}/notes`
- `GET /api/students/my-performance`
- `GET /api/teacher/student-profile/{student_id}` (aggregated profile incl. memorization)

## 3. Collections involved

- **Primary**: `memorization_progress` — one row per recorded ayah range during a session.
- **Secondary**: `student_notes_archive` — recitation-type notes ALSO count for certificate eligibility (via `_collect_memorization_records`).
- `sessions` — links a `memorization_progress` row back to a session.
- `users` — read for student name and direction inference.

---

## 4. Data shape (per row)

```text
memorization_progress {
  progress_id, session_id, student_id, teacher_id,
  surah_name (raw Arabic — possibly dirty),
  from_ayah, to_ayah,
  quality (one of: "ضعيف", "مقبول", "متوسط", "ممتاز"),
  notes,
  recorded_at, created_at
}
```

Multi-entry recording: `POST /api/sessions/{id}/notes` accepts `memorization_entries: [{surah, from, to, quality, notes}, …]` and inserts one row per entry.

---

## 5. `_get_memorization_position` — single source of truth

Returns:
```
{
  current_surah,           # name of frontier surah (string)
  current_surah_number,    # 1..114
  current_to_ayah,         # highest ayah recorded on frontier
  memorized_surahs,        # list of {surah, surah_number, max_to_ayah, ayah_count}
  surah_count,
  direction,               # "from_start" | "from_end" | "mixed"
  estimated_pages,
  estimated_juz,
  bucket,                  # "juz_amma" | "5_juz" | "10_juz" | "15_juz" | "20_juz" | "25_juz" | "30_juz"
  bucket_label,            # Arabic ("حول جزء عمّ", "حول 5 أجزاء", …)
  review_pool,             # surahs eligible for review (excludes frontier)
  last_recorded_at
}
```

Direction inference:
- avg(surah_number) ≤ 10 → `"from_start"`
- avg(surah_number) ≥ 60 → `"from_end"`
- otherwise → `"mixed"`

Frontier:
- forward learners: `max(surah_numbers)` reached
- backward learners: `min(surah_numbers)` reached

`current_to_ayah` = highest `to_ayah` recorded for the frontier surah.

---

## 6. Arabic normalization

Surah names in real data are dirty (trailing spaces, missing hamza, multi-surah strings like `"الإسراء و الكهف"`, aliases like `"تبارك" → "الملك"`). All readers go through one of these helpers — never a raw `find_one({"surah_name": …})`:

- `_get_memorization_position` (normalizes within itself)
- `_cert_normalize_arabic` (hamza/alef/yaa/taa variants, diacritics, `سورة ` prefix)
- `_cert_resolve_surahs` (separator + attached-waw + word-pair + alias + difflib fuzzy match)

If you add a new feature that reads surah names, **wire through one of these helpers**.

---

## 7. Madinah-Mushaf page mapping

`get_ayah_page(surah_num, ayah_num)` does a binary search over `PAGE_STARTS` (604 entries) and returns a precise 1-indexed page. Anchors (must stay correct):

| (surah, ayah) | page |
|---------------|------|
| (1, 1) الفاتحة | 1 |
| (2, 1) البقرة | 2 |
| (6, 95) الأنعام | 140 |
| (36, 1) يس | 440 |
| (78, 1) النبأ | 582 |
| (114, 1) الناس | 604 |

This table is sourced from the King Fahd Complex via `api.alquran.cloud /v1/meta`. Editing is forbidden without an audit trail.

---

## 8. Downstream consumers

| Feature | How it uses memorization |
|---------|---------------------------|
| Smart Weekly Plan (`/teacher/weekly-plans/suggest`) | Calls `_get_memorization_position`, calibrates intensity (bucket + attendance), resolves frontier per direction override, builds 7-day skeleton with `get_ayah_page` |
| Peer Recommendations (`/student/peer-recommendations`) | Uses bucket + direction + frontier + review-pool overlap to rank peers |
| Certificate Eligibility (`/admin/certificates/eligibility`) | Maps each ayah range to its Madinah pages via `get_ayah_page`; reports a juz "complete" only when ALL its pages are covered |
| Student PDF Report (`utils/generateStudentReport.js`) | Memorization table + per-juz progress bars + estimated pages |
| Teacher profile view (`/teacher/student-profile/{id}`) | Embeds memorization summary and rows |

---

## 9. Editing existing records

`PUT /api/memorization-progress/{progress_id}` (teacher-only) updates the surah / ayah range / quality / notes. The handler keeps an audit-friendly footprint (write `updated_at`, `updated_by`). Tests in `tests/test_edit_memorization.py` pin this.

`DELETE /api/memorization-progress/{progress_id}` (teacher-only) hard-deletes.

---

## 10. Important business rules

1. **Multi-entry per session is supported** — the same session can have multiple `memorization_progress` rows.
2. **The frontier is the FURTHEST surah reached in Mushaf order**, not the most-recently-logged one (which may be a review).
3. **Reviews exclude the frontier surah** when building the smart plan's review days (the frontier is still being memorized).
4. **Dirty Arabic input is the rule, not the exception.** Multi-surah strings, missing diacritics, trailing spaces are real data.
5. **`student_notes_archive` recitation rows DO count for certificate eligibility.** Don't accidentally exclude them in any new aggregator.

---

## 11. What should not be changed casually

- `_get_memorization_position` — its return shape is consumed by 5+ features.
- `PAGE_STARTS`, `SURAH_START_PAGE`, `get_ayah_page` — anchor tests pin the answers.
- The Arabic normalizers — they encode years of "weird data" handling.
- Removing memorization_progress entries is a teacher action; do not introduce a student-side delete.
- The four-level Arabic quality scale is hard-coded in many places (UI, PDFs, ratings color map). Treat as enum.
