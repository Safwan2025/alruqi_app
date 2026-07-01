# CERTIFICATE_WORKFLOW.md

How the platform detects eligibility for and issues two kinds of certificates: per-juz (شهادة جزء) and full Quran completion (ختم القرآن الكريم).

> **Irrevocable, audit-tracked output.** Each issued certificate has a unique serial number `ALRUQI-CERT-YYYY-NNNN` and audit fields. Do not refactor without a feature ticket. Tests in `tests/test_certificates.py`, `test_certificate_diagnostics.py`, and `test_manual_certificates.py` pin the contract.

---

## 1. Files involved

### Backend
- `server.py` lines 6845–7477 (full Certificates section):
  - `_cert_normalize_arabic(s)` — hamza/alef/yaa/taa variants, diacritics, `سورة ` prefix stripping
  - `_cert_resolve_surahs(s)` — separator + attached-waw + word-pair + alias + difflib fuzzy match
  - `_collect_memorization_records(student_id)` — unions `memorization_progress` + recitation rows from `student_notes_archive`
  - `_get_student_juz_completion(student_id, with_breakdown=False)` — page-level per-juz coverage map
  - Endpoints (admin-only):
    - `GET /api/admin/certificates/eligibility`
    - `GET /api/admin/certificates/diagnostics/{student_id}`
    - `POST /api/admin/certificates/issue`
    - `POST /api/admin/certificates/manual-issue`
    - `GET /api/admin/certificates`, `GET /api/admin/certificates/{id}`
    - `POST /api/admin/certificates/{id}/send`
  - Student endpoint: `GET /api/students/me/certificates`
- `quran_data.py`:
  - `get_juz_page_range(juz_number)` — Madinah-Mushaf page span for each of the 30 juz
  - `get_juz_display_name(juz_number)` — Arabic label (e.g., `"الجزء الخامس"`)
  - `get_ayah_page(surah_num, ayah_num)` — page resolver
- `counters` collection — atomic numbering source (`cert_seq_<year>`)

### Frontend
- `components/CertificatesManager.jsx` — admin tab with eligibility cards, follow-up dashboard, certificates log, diagnostics dialog (`data-testid='cert-diagnostics-dialog'`)
- `components/ManualCertificateIssue.jsx` — manual issuance dialog with juz selector + duplicate guard surfacing
- `components/MyCertificates.jsx` — student tab "شهاداتي"
- `utils/generateCertificatePDF.js` — two A4-landscape RTL designs:
  - Juz certificate: green/gold theme, Islamic motif corners
  - Khatm certificate: triple gold frame, deep emerald background, parchment inner, gold-Kufi title
- `utils/formatSupervisorName.js` — normalizes display to `"الشيخ محمد حامد الأنصاري"` (idempotent)
- `frontend/src/public/assets/sheikh_signature.png` and `ruqi_stamp.png` — embedded in PDFs (processed transparent bg)

---

## 2. Collections involved

- `certificates` — issued records with full audit trail
- `counters` — atomic per-year sequence
- `memorization_progress` — source of truth for ayah ranges
- `student_notes_archive` — recitation notes also counted
- `notifications` — issued-to-student and sent-to-student events

---

## 3. Eligibility detection

`_get_student_juz_completion(student_id, with_breakdown=True)`:

1. `_collect_memorization_records(student_id)`:
   - Reads `memorization_progress` rows for the student.
   - Reads `student_notes_archive` rows where `note_type == "recitation"` AND surah/ayah are populated.
   - Returns a list of `(surah_name_raw, from_ayah, to_ayah)` tuples.

2. For each record:
   - `_cert_normalize_arabic` on the surah name.
   - `_cert_resolve_surahs` splits multi-surah strings (separator, attached-waw, "X و Y" word pair, "تبارك" → الملك alias, difflib fuzzy fallback).
   - For each resolved surah, map `(surah_num, from_ayah)..(surah_num, to_ayah)` to Madinah pages via `get_ayah_page`.

3. Collect the **union of covered pages** per student.

4. For each juz (1..30):
   - `get_juz_page_range(j)` → the set of pages in that juz.
   - "Complete" iff **all** pages of the juz are covered by the student's union.

5. Return either:
   - Flat: `{1: True, 2: False, …}` — juz_number → eligible bool
   - With breakdown: includes `covered_pages_per_juz`, `missing_pages_per_juz`, `unparsed_records`

---

## 4. Endpoint contract

### `GET /api/admin/certificates/eligibility`

Returns a list of students with at least one record, each with:
- `student_id`, `name`
- `records_count` (sources unioned)
- `covered_pages_count`
- `eligible_juzs`: list of `{juz_number, display_name}` (juz that are complete AND not already issued)

### `GET /api/admin/certificates/diagnostics/{student_id}`

Returns the full breakdown (covered pages, per-juz missing pages, unparsed records, Arabic reason). Drives the "التفاصيل" dialog so the admin can see WHY a juz is incomplete.

### `POST /api/admin/certificates/issue`

Request: `{ student_id, juz_number? }` (juz_number absent → khatm).

Server re-validates eligibility against the live data (cannot rely on the GET payload). Rejects duplicates (same student + same juz, or another khatm). Atomic `counters.findOneAndUpdate($inc: {seq: 1})` for `cert_seq_<year>` → builds `ALRUQI-CERT-YYYY-NNNN`. Writes `certificates` doc:

```
{
  certificate_id, certificate_number,
  student_id, student_name,
  kind: "juz" | "khatm",
  juz_number, juz_display_name,
  issued_by, issued_by_name, issued_at,
  manual_issue: false,
  eligibility_verified: true,
  signature_image_url, stamp_image_url
}
```

Notifies the student.

### `POST /api/admin/certificates/manual-issue`

Same as `/issue` but with `manual_issue=true`, `eligibility_verified=false` (or `true` if also passes), and a required `verification_note` field. **Duplicates are still rejected.**

### `GET /api/admin/certificates`

Admin log of all issued certificates with filters.

### `POST /api/admin/certificates/{id}/send`

Marks `sent_at`, sends an in-app notification to the student (and emits an email if SendGrid is configured — currently inert).

### `GET /api/students/me/certificates`

Student's own list of certificates.

---

## 5. PDF generation

`utils/generateCertificatePDF.js` builds an HTML document and prints via the iframe printer (`utils/printHTML.js`) — bypasses popup blockers and preserves Arabic ligatures.

- **Juz certificate**: green/gold, soft Islamic motif corners, embedded `sheikh_signature.png` and `ruqi_stamp.png`, sheikh name normalized via `formatSupervisorName`.
- **Khatm certificate**: triple gold frame, deep emerald background, parchment inner, gold-Kufi title, larger signature/stamp area.

---

## 6. Important business rules

1. **Page-level coverage**, not surah-level. A juz is complete iff **all** its Madinah pages are covered.
2. **Recitation rows from `student_notes_archive` count.** Don't accidentally exclude them.
3. **Dirty Arabic input is handled at read time** via `_cert_normalize_arabic` + `_cert_resolve_surahs`. Tested with strings like `"المزمل والمدثر"`, `"الإسراء و الكهف"`, `"تبارك"`, `"من قريش -الناس"`, `"ال عمران"`, `"الملك "`.
4. **Numbering is atomic per year** via the `counters` collection — never derived from a count.
5. **Duplicates are forbidden.** Issuing the same juz to the same student returns 400.
6. **Manual issue requires a verification_note.** Auto-issued does not.
7. **Sheikh name is normalized** at display time via `formatSupervisorName` — never hard-code in PDFs.

---

## 7. Risks / sensitive areas

- **`PAGE_STARTS` table integrity** in `quran_data.py` — anchor unit tests guarantee a small set of correct answers; any edit must keep them passing.
- **Atomic counter** — replacing it with a count of existing docs is a race condition.
- **Real preview data**: no student currently covers ALL pages of any juz (the diagnostics endpoint is the explanation tool). Don't add fake "eligible" demos.
- **The two PDF designs MUST stay visually distinct** (per user direction); the khatm design is the "premium" tier.
- **The signature and stamp images** must remain in `frontend/src/public/assets/` — moving them would break the PDF rendering.

---

## 8. What should not be changed casually

- `_cert_normalize_arabic` and `_cert_resolve_surahs` — encode the dirty-data tolerance.
- `_get_student_juz_completion` page-level logic.
- The atomic counter usage.
- The Arabic display names of each juz (`get_juz_display_name`).
- The PDF designs (juz vs khatm) — they are the user-visible product.
