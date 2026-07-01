/**
 * Generate a printable weekly memorization plan as an A4 HTML document.
 * Same identity as the Student Report (Feb 2026 polish refresh).
 *
 * Renders via the iframe-based print helper — no popup is opened.
 */
import { printHTMLInIframe } from './printHTML';
import { formatArabicDate } from './formatArabicDate';
import { generateReportPDFForIOS, isIOSDevice } from './generateReportPDF';

const LOGO_URL = "https://customer-assets.emergentagent.com/job_8f66b1bb-97ea-4b8f-926f-4f014db49e2a/artifacts/l01dffpm_%D9%85%D9%82%D8%B1%D8%A3%D8%A9%20%D8%A7%D9%84%D8%B1%D9%82%D9%8A.png";

const C = {
  primary:   '#1e5631',
  primaryDark: '#143d22',
  primarySoft: '#e8f3ec',
  gold:      '#c89b2a',
  goldSoft:  '#fef6e0',
  ink:       '#1a1a1a',
  ink2:      '#384451',
  muted:     '#6b7280',
  line:      '#e5e7eb',
  surface:   '#fafaf7',
  surface2:  '#ffffff',
};

const KIND_META = {
  memorize: { label: 'حفظ',         color: '#0f766e', bg: '#ecfdf5' },
  review:   { label: 'مراجعة',      color: '#b45309', bg: '#fffbeb' },
  test:     { label: 'تسميع/اختبار', color: '#7c3aed', bg: '#f5f3ff' },
};

const formatDate = (d) => formatArabicDate(d, 'long', '');

export const generateWeeklyPlanPDF = (plan) => {
  if (!plan) return;
  const days = plan.days || [];

  const dayRows = days.map((d) => {
    const m = KIND_META[d.kind] || { label: d.kind || '—', color: C.muted, bg: '#f3f4f6' };
    return `
      <tr>
        <td class="day-cell"><strong>${d.day || ''}</strong></td>
        <td><span class="kind-pill" style="background:${m.bg};color:${m.color};border:1px solid ${m.color}33">${m.label}</span></td>
        <td>${d.surah || '—'}</td>
        <td class="num">${d.from_ayah || '—'}</td>
        <td class="num">${d.to_ayah || '—'}</td>
        <td>${d.page_range || '—'}</td>
        <td>${d.review_target || '—'}</td>
        <td class="notes">${d.notes || ''}</td>
      </tr>`;
  }).join('');

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>الخطة الأسبوعية — ${plan.student_name || ''}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body { background:${C.surface}; }
    body {
      font-family:'IBM Plex Sans Arabic', sans-serif;
      direction:rtl; color:${C.ink};
      font-size:12px; line-height:1.65;
      -webkit-print-color-adjust:exact; print-color-adjust:exact;
    }

    .toolbar {
      position:fixed; top:14px; left:14px; z-index:1000;
      background:${C.primary}; color:#fff; border:none;
      padding:10px 22px; border-radius:999px; cursor:pointer;
      font-family:inherit; font-size:13px; font-weight:600;
      box-shadow:0 6px 22px rgba(30,86,49,0.25);
    }
    .toolbar:hover { background:${C.primaryDark}; }

    .doc { max-width:210mm; margin:0 auto; background:${C.surface2}; box-shadow:0 4px 24px rgba(0,0,0,0.06); }
    .doc > .page { padding:16mm 13mm; }

    /* Cover */
    .cover {
      background:linear-gradient(135deg, ${C.primary} 0%, ${C.primaryDark} 100%);
      color:#fff; border-radius:18px; padding:18px 22px; margin-bottom:14px;
      display:flex; align-items:center; justify-content:space-between; gap:18px;
      position:relative; overflow:hidden;
    }
    .cover::before {
      content:''; position:absolute; inset:0;
      background:radial-gradient(circle at 80% 20%, rgba(200,155,42,0.20), transparent 55%);
    }
    .cover-r { display:flex; align-items:center; gap:14px; position:relative; z-index:1; }
    .cover img { width:64px; height:64px; object-fit:contain; background:#fff; border-radius:50%; padding:5px; border:3px solid ${C.gold}; }
    .cover-title { font-family:'Amiri', serif; font-size:24px; font-weight:700; line-height:1.1; }
    .cover-subtitle { font-size:12px; opacity:0.88; margin-top:3px; }
    .cover-period {
      position:relative; z-index:1;
      background:rgba(255,255,255,0.14); border:1px solid rgba(255,255,255,0.22);
      backdrop-filter:blur(6px); padding:9px 14px; border-radius:11px; text-align:left;
    }
    .cover-period-label { font-size:11px; opacity:0.82; }
    .cover-period-value { font-family:'Amiri', serif; font-size:16px; font-weight:700; margin-top:2px; }

    /* Info chips */
    .info-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin-bottom:14px; }
    .info-box {
      background:${C.primarySoft}; border:1px solid #cfe6d6;
      border-right:5px solid ${C.primary};
      border-radius:11px; padding:9px 13px;
    }
    .info-box .label { font-size:11px; color:${C.muted}; }
    .info-box .value { font-family:'Amiri', serif; font-size:15px; font-weight:700; color:${C.primary}; margin-top:1px; }

    /* Section */
    .section { margin-bottom:14px; }
    .section-h {
      display:flex; justify-content:space-between; align-items:center;
      gap:8px; margin-bottom:9px; padding-bottom:6px;
      border-bottom:2px solid ${C.primary};
    }
    .section-h h2 { font-family:'Amiri', serif; font-size:16px; font-weight:700; color:${C.primary}; }
    .section-h .count { background:${C.gold}; color:${C.primaryDark}; font-size:11px; font-weight:700; padding:3px 11px; border-radius:999px; }

    /* Table */
    table.t { width:100%; border-collapse:collapse; font-size:11px; border:1px solid ${C.line}; border-radius:11px; overflow:hidden; }
    table.t th { background:${C.primary}; color:#fff; padding:7px 6px; text-align:center; font-weight:600; font-size:11px; }
    table.t td { padding:7px 6px; border-bottom:1px solid ${C.line}; color:${C.ink2}; text-align:center; vertical-align:middle; }
    table.t tr:last-child td { border-bottom:none; }
    table.t tr:nth-child(even) td { background:#fafbfa; }
    .day-cell { background:${C.primarySoft} !important; color:${C.primary} !important; font-weight:700; }
    .num { font-weight:700; }
    .notes { text-align:right; color:${C.ink2}; }
    .kind-pill { padding:2px 9px; border-radius:999px; font-size:10px; font-weight:700; display:inline-block; }

    /* Notes blocks */
    .notes-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:14px; }
    .note-card {
      background:${C.surface2}; border:1px solid ${C.line};
      border-radius:11px; padding:11px 13px; position:relative;
    }
    .note-card::before {
      content:''; position:absolute; top:11px; right:0; width:4px; height:calc(100% - 22px); border-radius:0 999px 999px 0;
    }
    .note-card.teacher::before { background:${C.primary}; }
    .note-card.parent::before  { background:${C.gold}; }
    .note-card h4 {
      font-family:'Amiri', serif; font-size:14px; font-weight:700; margin-bottom:5px; padding-right:8px;
    }
    .note-card.teacher h4 { color:${C.primary}; }
    .note-card.parent  h4 { color:${C.gold}; }
    .note-card p { font-size:12px; color:${C.ink2}; min-height:32px; padding-right:8px; }
    .note-card.empty p { color:${C.muted}; font-style:italic; }

    .footer { padding:10px 0 4px; text-align:center; color:${C.muted}; font-size:10px; border-top:1px dashed ${C.line}; margin-top:14px; }
    .footer b { color:${C.primary}; }

    @media print {
      .toolbar { display:none !important; }
      .doc { box-shadow:none; }
      .doc > .page { padding:11mm 10mm; }
    }
    @page { size:A4; margin:0; }
  </style>
</head>
<body>
  <button class="toolbar" onclick="window.print()">طباعة / حفظ PDF</button>

  <div class="doc">
    <div class="page">

      <div class="cover">
        <div class="cover-r">
          <img src="${LOGO_URL}" alt="مقرأة الرقي" />
          <div>
            <div class="cover-title">الخطة الأسبوعية</div>
            <div class="cover-subtitle">مقرأة الرقي · للحفظ والمراجعة</div>
          </div>
        </div>
        <div class="cover-period">
          <div class="cover-period-label">بداية الأسبوع</div>
          <div class="cover-period-value">${formatDate(plan.week_start) || '—'}</div>
        </div>
      </div>

      <div class="info-grid">
        <div class="info-box"><div class="label">الطالب</div><div class="value">${plan.student_name || '—'}</div></div>
        <div class="info-box"><div class="label">المعلم</div><div class="value">${plan.teacher_name || '—'}</div></div>
        <div class="info-box"><div class="label">عدد الأيام</div><div class="value">${days.length} أيام</div></div>
      </div>

      <section class="section">
        <header class="section-h">
          <h2>برنامج الأسبوع</h2>
          <span class="count">${days.length}</span>
        </header>
        <table class="t">
          <thead>
            <tr>
              <th>اليوم</th><th>النوع</th><th>السورة</th>
              <th>من آية</th><th>إلى آية</th><th>الصفحات</th>
              <th>المراجعة اليومية</th><th>ملاحظات</th>
            </tr>
          </thead>
          <tbody>${dayRows}</tbody>
        </table>
      </section>

      <div class="notes-row">
        <div class="note-card teacher ${plan.teacher_notes ? '' : 'empty'}">
          <h4>ملاحظات المعلم</h4>
          <p>${plan.teacher_notes || 'لا توجد ملاحظات'}</p>
        </div>
        <div class="note-card parent ${plan.parent_notes ? '' : 'empty'}">
          <h4>ملاحظات لولي الأمر</h4>
          <p>${plan.parent_notes || 'لا توجد ملاحظات'}</p>
        </div>
      </div>

      <div class="footer">
        <b>مقرأة الرقي</b> · تمَّ توليد هذه الخطة في ${new Date().toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}
      </div>
    </div>
  </div>
</body>
</html>`;

  /* iOS / iPhone: build a real A4-PORTRAIT PDF for each `.page` of the
     plan and open it in a new tab. Desktop + Android keep `window.print()`
     which already honours the report's portrait layout correctly. */
  if (isIOSDevice()) {
    generateReportPDFForIOS(html, {
      pageSelector: '.page',
      title: 'الخطة الأسبوعية',
    }).catch((err) => {
      try { console.warn('[weekly-plan] iOS PDF path failed, falling back to print', err); } catch (_) { /* console missing */ }
      printHTMLInIframe(html);
    });
    return;
  }

  printHTMLInIframe(html);
};

export default generateWeeklyPlanPDF;
