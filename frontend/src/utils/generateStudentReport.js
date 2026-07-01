import { toast } from 'sonner';
import { printHTMLInIframe } from './printHTML';
import { formatArabicDate, formatArabicDateTime } from './formatArabicDate';
import { generateReportPDFForIOS, isIOSDevice } from './generateReportPDF';

const LOGO_URL = "https://customer-assets.emergentagent.com/job_8f66b1bb-97ea-4b8f-926f-4f014db49e2a/artifacts/l01dffpm_%D9%85%D9%82%D8%B1%D8%A3%D8%A9%20%D8%A7%D9%84%D8%B1%D9%82%D9%8A.png";

/* ---- Unified palette (one identity throughout the document) ---- */
const C = {
  primary: '#1e5631',
  primaryDark: '#143d22',
  primarySoft: '#e8f3ec',
  gold: '#c89b2a',
  goldSoft: '#fef6e0',
  ink: '#1a1a1a',
  ink2: '#384451',
  muted: '#6b7280',
  line: '#e5e7eb',
  surface: '#fafaf7',
  surface2: '#ffffff',
  ok: '#0f7a3a',
  warn: '#b45309',
  bad: '#b91c1c',
  info: '#1d4ed8',
};
const RATING_COLORS = { 'ممتاز': C.ok, 'متوسط': C.info, 'مقبول': C.warn, 'ضعيف': C.bad };
const RATING_BG = { 'ممتاز': '#ecfdf5', 'متوسط': '#eff6ff', 'مقبول': '#fffbeb', 'ضعيف': '#fef2f2' };
const STATUS_TEXT = { 'completed': 'مكتمل', 'scheduled': 'مجدول', 'cancelled': 'ملغي' };
const MONTH_NAMES_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

const formatDate = (d) => formatArabicDate(d, 'short');
const formatDateTime = (d) => formatArabicDateTime(d, 'short');
const inPeriod = (iso, period) => {
  if (!period || period.type === 'all') return true;
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  if (period.type === 'yearly') return d.getFullYear() === period.year;
  if (period.type === 'monthly') return d.getFullYear() === period.year && (d.getMonth() + 1) === period.month;
  return true;
};
const periodLabel = (p) => {
  if (!p || p.type === 'all') return 'سجلّ كامل';
  if (p.type === 'yearly') return `تقرير سنوي · ${p.year}`;
  return `تقرير شهري · ${MONTH_NAMES_AR[p.month - 1]} ${p.year}`;
};

/**
 * Generate the unified 2-page student report.
 *
 *   Page 1 = الحفظ والحضور (memorization, attendance, sessions, evaluations, performance, excellence).
 *   Page 2 = المراجعة الزوجية (review method, partner, sessions, attendance, evaluations, mistakes, advice).
 *
 * Both pages share the same identity: cover header, palette, typography, KPI/card/table classes.
 */
export function generateStudentReport(profile, options = {}) {
  if (!profile) { toast.error('لا توجد بيانات لإنشاء التقرير'); return; }
  const period = options.period || { type: 'all' };
  const commitment = options.commitment || null;
  const peerOverview = options.peerOverview || null;

  const today = formatDate(new Date().toISOString());
  const student = profile.student || {};
  const stats = profile.statistics || {};
  const ratings = profile.ratings || {};
  const memorization = profile.memorization || {};
  const notes = profile.notes || {};
  const recentSessions = profile.recent_sessions || [];

  /* Filter by selected period */
  const filteredSessions = recentSessions.filter(s => inPeriod(s.scheduled_time, period));
  const filteredMem = (memorization.progress_log || []).filter(m => inPeriod(m.created_at, period));
  const filteredNotes = (notes.recent || []).filter(n => inPeriod(n.created_at, period));

  const completedSessions = filteredSessions.filter(s => s.status === 'completed' || s.attendance_confirmed === true);
  const cancelledByStudent = filteredSessions.filter(s => s.status === 'cancelled' && s.cancelled_by === 'student');
  const absentSessions = filteredSessions.filter(s => s.attendance_confirmed === false);
  const attendedSessions = filteredSessions.filter(s => s.attendance_confirmed === true);
  const attendanceRate = filteredSessions.length > 0 ? Math.round((attendedSessions.length / filteredSessions.length) * 100) : 0;
  const absenceRate = filteredSessions.length > 0 ? Math.round((absentSessions.length / filteredSessions.length) * 100) : 0;

  const breakdown = { 'ممتاز': 0, 'متوسط': 0, 'مقبول': 0, 'ضعيف': 0 };
  filteredSessions.forEach(s => { if (s.rating && breakdown[s.rating] !== undefined) breakdown[s.rating]++; });
  filteredNotes.forEach(n => { if (n.rating && breakdown[n.rating] !== undefined) breakdown[n.rating]++; });
  filteredMem.forEach(m => { if (m.quality && breakdown[m.quality] !== undefined) breakdown[m.quality]++; });
  const totalRatings = Object.values(breakdown).reduce((a, b) => a + b, 0);

  /* Excellence indicator (لقب الأداء) */
  const excellence = (() => {
    if (!totalRatings) return { label: 'لا يوجد بعد', color: C.muted, bg: C.surface };
    const score = (breakdown['ممتاز'] * 4 + breakdown['متوسط'] * 3 + breakdown['مقبول'] * 2 + breakdown['ضعيف'] * 1) / totalRatings;
    if (score >= 3.5) return { label: 'متميّز', color: C.ok, bg: '#ecfdf5' };
    if (score >= 2.8) return { label: 'جيّد', color: C.info, bg: '#eff6ff' };
    if (score >= 2.0) return { label: 'مقبول', color: C.warn, bg: '#fffbeb' };
    return { label: 'يحتاج متابعة', color: C.bad, bg: '#fef2f2' };
  })();

  /* ---- Page 1: memorization position summary (most-recent surah + ayah) ---- */
  const lastMem = filteredMem[0] || (memorization.progress_log || [])[0] || null;
  const memSurahsSet = [...new Set((filteredMem.length ? filteredMem : memorization.progress_log || []).map(m => m.surah_name).filter(Boolean))];

  /* ---- Ratings bar chart ---- */
  const ratingsChart = (() => {
    const max = Math.max(...Object.values(breakdown), 1);
    return `<div class="bars">${Object.entries(breakdown).map(([q, c]) => {
      const pct = totalRatings ? Math.round((c / totalRatings) * 100) : 0;
      const w = totalRatings ? Math.round((c / max) * 100) : 0;
      return `<div class="bar-row">
        <div class="bar-label" style="color:${RATING_COLORS[q]}">${q}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${RATING_COLORS[q]}"></div></div>
        <div class="bar-value"><span class="bar-count">${c}</span><span class="bar-pct">(${pct}%)</span></div>
      </div>`;
    }).join('')}</div>`;
  })();

  /* ---- Memorization table rows ---- */
  const memRows = filteredMem.slice(0, 18).map(e => `
    <tr>
      <td><b>سورة ${e.surah_name || '—'}</b></td>
      <td class="center">${e.from_ayah || '—'} — ${e.to_ayah || '—'}</td>
      <td class="center"><span class="pill" style="background:${RATING_BG[e.quality] || '#f3f4f6'};color:${RATING_COLORS[e.quality] || C.ink2}">${e.quality || '—'}</span></td>
      <td class="center">${formatDate(e.created_at)}</td>
    </tr>`).join('');

  /* ---- Session rows ---- */
  const sessionRows = filteredSessions.slice(0, 14).map(s => `
    <tr>
      <td class="center">${formatDateTime(s.scheduled_time)}</td>
      <td class="center">${s.teacher_name || '—'}</td>
      <td class="center">${STATUS_TEXT[s.status] || s.status}</td>
      <td class="center">${s.rating ? `<span class="pill" style="background:${RATING_BG[s.rating]};color:${RATING_COLORS[s.rating]}">${s.rating}</span>` : '—'}</td>
      <td class="center">${s.attendance_confirmed === true ? `<span style="color:${C.ok};font-weight:bold">حاضر</span>` : s.attendance_confirmed === false ? `<span style="color:${C.bad};font-weight:bold">غائب</span>` : '—'}</td>
    </tr>`).join('');

  /* ---- Commitment block (compact, page 1) ---- */
  const commitmentChip = (() => {
    if (!commitment || !commitment.commitment) return `<span class="meta-chip muted">لم يُحدَّد التزام أسبوعي</span>`;
    const c = commitment.commitment;
    const cw = commitment.current_week || {};
    const warns = commitment.warnings || [];
    const frozen = commitment.student && commitment.student.is_frozen;
    return `
      <div class="commit-row">
        <span class="meta-chip">الحد الأسبوعي: <b>${c.min_sessions_per_week}</b> جلسة · <b>${c.min_pages_per_week}</b> صفحة</span>
        <span class="meta-chip">هذا الأسبوع: <b>${cw.sessions_done ?? 0}</b> / <b>${cw.pages_done ?? 0}</b></span>
        ${frozen ? `<span class="meta-chip bad">حساب مُجمَّد</span>` :
          warns.length ? `<span class="meta-chip warn">إنذارات: ${warns.length}</span>`
                       : `<span class="meta-chip ok">منتظم</span>`}
      </div>`;
  })();

  /* ---- Attendance rings ---- */
  const attendanceBlock = `
    <div class="attendance">
      <div class="att-rings">
        <div class="ring" style="--p:${attendanceRate};--c:${C.ok}">
          <div class="ring-inner">
            <span class="ring-val">${attendanceRate}<small>%</small></span>
            <span class="ring-label">حضور</span>
          </div>
        </div>
        <div class="ring" style="--p:${absenceRate};--c:${C.bad}">
          <div class="ring-inner">
            <span class="ring-val">${absenceRate}<small>%</small></span>
            <span class="ring-label">غياب</span>
          </div>
        </div>
      </div>
      <div class="att-legend">
        <div class="legend-row"><span class="dot" style="background:${C.primary}"></span><b>${filteredSessions.length}</b> جلسة في الفترة</div>
        <div class="legend-row"><span class="dot" style="background:${C.ok}"></span><b>${attendedSessions.length}</b> حضور</div>
        <div class="legend-row"><span class="dot" style="background:${C.bad}"></span><b>${absentSessions.length}</b> غياب</div>
        <div class="legend-row"><span class="dot" style="background:${C.gold}"></span><b>${cancelledByStudent.length}</b> إلغاء بمبادرة الطالب</div>
      </div>
    </div>`;

  /* =============================================================
   * PAGE 2 — Review & peer review (always rendered; gracefully empty)
   * ============================================================= */
  const reviewBlock = (() => {
    const sid = student.user_id;
    const po = peerOverview || {};
    const sessions = po.sessions || [];
    const evals = po.evaluations || [];
    const received = evals.filter(e => e.evaluatee_id === sid);
    const attended = sessions.filter(s => (s.attendance || {})[sid] === true);
    const partnership = po.partnership;
    const partnerName = partnership
      ? (partnership.requester_id === sid ? partnership.target_name : partnership.requester_name)
      : null;
    const partnerStatus = partnership ? (
      partnership.status === 'approved' ? 'شراكة نشطة' :
      partnership.status === 'pending'  ? 'بانتظار الموافقة' :
      partnership.status === 'cancelled' ? 'منتهية' : partnership.status
    ) : null;
    const reviewMethod = po.review_method;
    const methodLabel = reviewMethod === 'peer' ? 'مراجعة بقرين'
                      : reviewMethod === 'self' ? 'مراجعة ذاتية'
                      : 'لم تُحدَّد بعد';

    /* Stats */
    const totalSess = sessions.length;
    const attRate = totalSess ? Math.round((attended.length / totalSess) * 100) : 0;
    const QSCORE = { 'ممتاز': 4, 'متوسط': 3, 'مقبول': 2, 'ضعيف': 1 };
    const counts = { 'ممتاز': 0, 'متوسط': 0, 'مقبول': 0, 'ضعيف': 0 };
    let sum = 0, n = 0, mistakes = 0;
    received.forEach(e => {
      if (e.quality && counts[e.quality] !== undefined) { counts[e.quality]++; sum += QSCORE[e.quality]; n++; }
      mistakes += Number(e.mistakes_count || 0);
    });
    const QLABEL = ['—','ضعيف','مقبول','متوسط','ممتاز'];
    const avgLabel = n ? QLABEL[Math.round(sum / n)] : '—';
    const maxQ = Math.max(1, ...Object.values(counts));

    const sessionRowsP2 = sessions.slice(0, 14).map(s => {
      const other = s.creator_id === sid ? s.booker_name : s.creator_name;
      const att = (s.attendance || {})[sid];
      return `<tr>
        <td class="center">${formatDate(s.scheduled_time)}</td>
        <td class="center">${other || '—'}</td>
        <td class="center">${s.duration || '—'} د</td>
        <td class="center">${att === true ? `<span style="color:${C.ok};font-weight:bold">حضر</span>` : att === false ? `<span style="color:${C.bad};font-weight:bold">غاب</span>` : '—'}</td>
      </tr>`;
    }).join('');

    const evalCards = received.slice(0, 8).map(e => `
      <div class="eval-card" style="border-color:${RATING_COLORS[e.quality] || C.line};background:${RATING_BG[e.quality] || '#fff'}">
        <div class="eval-head">
          <span class="pill" style="background:${RATING_COLORS[e.quality]};color:#fff;border:none">${e.quality || '—'}</span>
          <span class="eval-meta">من ${e.evaluator_name || '—'} · ${formatDate(e.created_at)}</span>
        </div>
        <div class="eval-meta-line">
          ${e.surah_name ? `سورة <b>${e.surah_name}</b>` : ''}
          ${(e.from_ayah && e.to_ayah) ? ` · آية ${e.from_ayah}—${e.to_ayah}` : ''}
          ${e.mistakes_count > 0 ? ` · أخطاء: <b style="color:${C.bad}">${e.mistakes_count}</b>` : ''}
        </div>
        ${e.notes ? `<p class="eval-line">📝 ${e.notes}</p>` : ''}
        ${e.advice ? `<p class="eval-line" style="color:${C.warn}">💡 ${e.advice}</p>` : ''}
        ${e.recommendations ? `<p class="eval-line" style="color:${C.info}">✦ ${e.recommendations}</p>` : ''}
      </div>`).join('');

    return `
      <!-- ===== PAGE 2 HEADER ===== -->
      <div class="cover cover-secondary">
        <div class="cover-r">
          <img src="${LOGO_URL}" alt="مقرأة الرقي" />
          <div>
            <div class="cover-title">المراجعة الزوجية</div>
            <div class="cover-subtitle">${student.name || ''} · ${periodLabel(period)}</div>
          </div>
        </div>
        <div class="cover-period">
          <div class="cover-period-label">طريقة المراجعة</div>
          <div class="cover-period-value">${methodLabel}</div>
        </div>
      </div>

      <!-- Partner banner -->
      ${partnerName ? `
      <div class="partner-banner">
        <div><div class="pb-label">قرين المراجعة</div><div class="pb-name">${partnerName}</div></div>
        <span class="pb-status">${partnerStatus}</span>
      </div>` : (reviewMethod === 'peer'
        ? `<div class="empty">لم يتم اختيار قرين بعد.</div>`
        : reviewMethod === 'self'
          ? `<div class="info-banner">الطالب يستخدم <b>المراجعة الذاتية</b>.</div>`
          : `<div class="empty">لم يحدد الطالب طريقة المراجعة بعد.</div>`)}

      <!-- Peer KPIs -->
      <section class="section">
        <header class="section-h"><h2>إحصائيات المراجعة</h2></header>
        <div class="kpi-grid kpi-4">
          <div class="kpi"><div class="kpi-value" style="color:${C.info}">${attended.length}</div><div class="kpi-label">حصص حضرها</div></div>
          <div class="kpi"><div class="kpi-value" style="color:${C.ok}">${attRate}%</div><div class="kpi-label">نسبة حضوره</div></div>
          <div class="kpi"><div class="kpi-value" style="color:${C.warn}">${received.length}</div><div class="kpi-label">تقييمات تلقاها</div></div>
          <div class="kpi"><div class="kpi-value" style="color:${RATING_COLORS[avgLabel] || C.primary}">${avgLabel}</div><div class="kpi-label">متوسط مستواه</div></div>
        </div>
        ${n > 0 ? `
        <div class="block">
          <div class="block-head">
            <strong>توزيع مستوى التقييمات من قرينه</strong>
            ${mistakes > 0 ? `<span class="mistakes-tag">إجمالي الأخطاء: ${mistakes}</span>` : ''}
          </div>
          <div class="bars">
            ${['ممتاز','متوسط','مقبول','ضعيف'].map(q => {
              const v = counts[q]; const w = Math.round((v / maxQ) * 100);
              return `<div class="bar-row">
                <div class="bar-label" style="color:${RATING_COLORS[q]}">${q}</div>
                <div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${RATING_COLORS[q]}"></div></div>
                <div class="bar-value">${v}</div>
              </div>`;
            }).join('')}
          </div>
        </div>` : ''}
      </section>

      <!-- Peer sessions table -->
      ${sessions.length ? `
      <section class="section">
        <header class="section-h">
          <h2>مواعيد المراجعة وحضوره</h2>
          <span class="count">${sessions.length}</span>
        </header>
        <table class="t">
          <thead><tr><th>التاريخ</th><th>القرين</th><th>المدة</th><th>الحضور</th></tr></thead>
          <tbody>${sessionRowsP2}</tbody>
        </table>
      </section>` : ''}

      <!-- Received evaluations / mistakes / advice -->
      ${received.length ? `
      <section class="section">
        <header class="section-h">
          <h2>تقييمات قرينه — الأخطاء والنصائح</h2>
          <span class="count">${received.length}</span>
        </header>
        <div class="eval-list">${evalCards}</div>
      </section>` : ''}
    `;
  })();

  /* ============================================================= */
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>تقرير الطالب — ${student.name || ''}</title>
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

    .toolbar { position:fixed; top:14px; left:14px; z-index:1000;
      background:${C.primary}; color:#fff; border:none;
      padding:10px 22px; border-radius:999px; cursor:pointer;
      font-family:inherit; font-size:13px; font-weight:600;
      box-shadow:0 6px 22px rgba(30,86,49,0.25);
    }
    .toolbar:hover { background:${C.primaryDark}; }

    .doc { max-width:210mm; margin:0 auto; background:${C.surface2}; box-shadow:0 4px 24px rgba(0,0,0,0.06); }
    .doc > .page { padding:16mm 13mm; }
    .doc > .page + .page { border-top:1px dashed ${C.line}; }

    /* ---- Cover header (shared) ---- */
    .cover {
      background:linear-gradient(135deg, ${C.primary} 0%, ${C.primaryDark} 100%);
      color:#fff; border-radius:18px; padding:18px 22px; margin-bottom:14px;
      display:flex; align-items:center; justify-content:space-between; gap:18px;
      position:relative; overflow:hidden;
    }
    .cover.cover-secondary { background:linear-gradient(135deg, ${C.primaryDark} 0%, ${C.primary} 60%, ${C.gold} 130%); }
    .cover::before {
      content:''; position:absolute; inset:0;
      background:radial-gradient(circle at 80% 20%, rgba(200,155,42,0.20), transparent 55%);
    }
    .cover-r { display:flex; align-items:center; gap:14px; position:relative; z-index:1; }
    .cover img { width:64px; height:64px; object-fit:contain; background:#fff; border-radius:50%; padding:5px; border:3px solid ${C.gold}; }
    .cover-title { font-family:'Amiri', serif; font-size:24px; font-weight:700; line-height:1.1; }
    .cover-subtitle { font-size:12px; opacity:0.88; margin-top:3px; letter-spacing:0.3px; }
    .cover-period {
      position:relative; z-index:1;
      background:rgba(255,255,255,0.14); border:1px solid rgba(255,255,255,0.22);
      backdrop-filter:blur(6px); padding:9px 14px; border-radius:11px; text-align:left;
    }
    .cover-period-label { font-size:11px; opacity:0.82; }
    .cover-period-value { font-family:'Amiri', serif; font-size:16px; font-weight:700; margin-top:2px; }

    /* ---- Identity card ---- */
    .student {
      display:flex; justify-content:space-between; align-items:center;
      gap:12px; flex-wrap:wrap;
      background:${C.primarySoft}; border:1px solid #cfe6d6;
      border-right:6px solid ${C.primary};
      border-radius:12px; padding:11px 16px; margin-bottom:14px;
    }
    .student-name { font-family:'Amiri', serif; font-size:20px; font-weight:700; color:${C.primary}; }
    .student-email { font-size:11px; color:${C.muted}; margin-top:1px; }
    .student-meta { text-align:left; font-size:11px; color:${C.muted}; }
    .student-meta b { color:${C.ink2}; }
    .student-flag { color:${C.bad}; font-weight:bold; font-size:11px; margin-top:3px; }
    .excellence {
      display:inline-flex; align-items:center; gap:6px;
      font-family:'Amiri', serif; font-size:14px; font-weight:700;
      padding:5px 14px; border-radius:999px; border:1px solid;
      margin-top:4px;
    }

    /* ---- Section ---- */
    .section { margin-bottom:14px; page-break-inside:avoid; }
    .section-h {
      display:flex; justify-content:space-between; align-items:center;
      gap:8px; margin-bottom:9px; padding-bottom:6px;
      border-bottom:2px solid ${C.primary};
    }
    .section-h h2 { font-family:'Amiri', serif; font-size:16px; font-weight:700; color:${C.primary}; letter-spacing:0.2px; }
    .section-h .count { background:${C.primary}; color:#fff; font-size:11px; font-weight:600; padding:3px 11px; border-radius:999px; }
    .section-h .count.gold { background:${C.gold}; color:${C.primaryDark}; }

    /* ---- KPI / chips / chart ---- */
    .kpi-grid { display:grid; gap:8px; margin-bottom:6px; }
    .kpi-4 { grid-template-columns:repeat(4, 1fr); }
    .kpi-2 { grid-template-columns:repeat(2, 1fr); }
    .kpi { background:${C.surface2}; border:1px solid ${C.line}; border-radius:11px; padding:11px 9px; text-align:center; position:relative; overflow:hidden; }
    .kpi::after { content:''; position:absolute; top:0; right:0; width:4px; height:100%; background:${C.gold}; }
    .kpi-value { font-family:'Amiri', serif; font-size:23px; font-weight:700; color:${C.primary}; line-height:1.05; }
    .kpi-label { font-size:11px; color:${C.muted}; margin-top:2px; }

    .meta-chip { display:inline-block; background:${C.surface2}; border:1px solid ${C.line}; color:${C.ink2}; font-size:11px; padding:3px 10px; border-radius:999px; margin:0 0 0 4px; }
    .meta-chip b { color:${C.primary}; }
    .meta-chip.ok   { background:#ecfdf5; border-color:#bbf7d0; color:${C.ok}; }
    .meta-chip.warn { background:#fffbeb; border-color:#fde68a; color:${C.warn}; }
    .meta-chip.bad  { background:#fef2f2; border-color:#fca5a5; color:${C.bad}; }
    .meta-chip.muted{ background:#f3f4f6; border-color:${C.line}; color:${C.muted}; }
    .commit-row { display:flex; flex-wrap:wrap; gap:5px; margin-top:6px; }

    .info-banner { background:${C.goldSoft}; border:1px dashed ${C.gold}; color:${C.warn}; padding:8px 12px; border-radius:10px; font-size:12px; margin-bottom:10px; }

    /* Attendance */
    .attendance { display:flex; align-items:center; gap:18px; flex-wrap:wrap; background:${C.surface2}; border:1px solid ${C.line}; border-radius:12px; padding:11px 14px; }
    .att-rings { display:flex; gap:14px; }
    .ring { --p:0; --c:${C.ok}; width:92px; height:92px; border-radius:50%; background:conic-gradient(var(--c) calc(var(--p) * 1%), #eef0f2 0); display:flex; align-items:center; justify-content:center; position:relative; }
    .ring-inner { width:64px; height:64px; background:${C.surface2}; border-radius:50%; display:flex; flex-direction:column; align-items:center; justify-content:center; box-shadow:0 0 0 1px ${C.line} inset; }
    .ring-val { font-family:'Amiri', serif; font-size:20px; font-weight:700; color:var(--c); line-height:1; }
    .ring-val small { font-size:11px; }
    .ring-label { font-size:10px; color:${C.muted}; margin-top:1px; }
    .att-legend { flex:1; min-width:170px; }
    .legend-row { display:flex; align-items:center; gap:8px; font-size:12px; color:${C.ink2}; padding:2px 0; }
    .legend-row b { color:${C.ink}; }
    .dot { width:9px; height:9px; border-radius:50%; display:inline-block; }

    /* Bars */
    .bars { padding:3px 0; }
    .bar-row { display:flex; align-items:center; gap:9px; padding:3px 0; }
    .bar-label { width:50px; font-size:11px; font-weight:700; text-align:right; }
    .bar-track { flex:1; background:#f1f3f1; border-radius:999px; overflow:hidden; height:13px; }
    .bar-fill { height:100%; border-radius:999px; }
    .bar-value { width:70px; font-size:11px; text-align:left; color:${C.ink2}; font-weight:600; display:flex; align-items:baseline; gap:6px; }
    .bar-count { font-weight:700; color:${C.ink}; }
    .bar-pct { color:${C.muted}; font-weight:500; }

    /* Tables (unified) */
    table.t { width:100%; border-collapse:collapse; font-size:11px; border:1px solid ${C.line}; border-radius:10px; overflow:hidden; }
    table.t th { background:${C.primary}; color:#fff; padding:7px 6px; text-align:right; font-weight:600; font-size:11px; }
    table.t td { padding:6px; border-bottom:1px solid ${C.line}; color:${C.ink2}; }
    table.t tr:last-child td { border-bottom:none; }
    table.t tr:nth-child(even) td { background:#fafbfa; }
    .center { text-align:center; }
    .pill { padding:2px 9px; border-radius:999px; font-size:10px; font-weight:700; display:inline-block; }
    .badge { background:${C.primarySoft}; color:${C.primary}; padding:3px 10px; border-radius:999px; font-size:11px; font-weight:600; border:1px solid #cfe6d6; }
    .badge-row { display:flex; flex-wrap:wrap; gap:5px; margin-bottom:7px; }

    /* Sub-blocks */
    .block { background:${C.surface2}; border:1px solid ${C.line}; border-radius:11px; padding:10px 12px; margin-top:8px; }
    .block-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; color:${C.primary}; font-size:13px; }
    .mistakes-tag { background:#fee2e2; color:${C.bad}; border:1px solid #fca5a5; font-size:10px; font-weight:700; padding:2px 10px; border-radius:999px; }
    .hint { font-size:11px; color:${C.muted}; margin-bottom:5px; }

    /* Peer review */
    .partner-banner {
      display:flex; justify-content:space-between; align-items:center;
      background:linear-gradient(to left, ${C.primarySoft}, ${C.goldSoft});
      border:1px solid #cfe6d6; border-radius:12px;
      padding:9px 14px; margin-bottom:10px;
    }
    .pb-label { font-size:11px; color:${C.muted}; }
    .pb-name { font-family:'Amiri', serif; font-size:15px; font-weight:700; color:${C.primary}; }
    .pb-status { background:${C.surface2}; border:1px solid ${C.line}; color:${C.primary}; font-size:11px; font-weight:600; padding:3px 11px; border-radius:999px; }

    .eval-list { display:flex; flex-direction:column; gap:6px; }
    .eval-card { border:1px solid ${C.line}; border-right-width:4px; border-radius:10px; padding:9px 11px; background:${C.surface2}; }
    .eval-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; }
    .eval-meta { font-size:11px; color:${C.muted}; }
    .eval-meta-line { font-size:11px; color:${C.ink2}; margin-bottom:2px; }
    .eval-line { font-size:11px; color:${C.ink2}; margin-top:2px; }

    .footer { padding:10px 0 4px; text-align:center; color:${C.muted}; font-size:10px; border-top:1px dashed ${C.line}; margin-top:10px; }
    .footer b { color:${C.primary}; }
    .empty { text-align:center; color:${C.muted}; padding:10px; font-style:italic; font-size:11px; background:${C.surface2}; border:1px dashed ${C.line}; border-radius:10px; margin-bottom:10px; }

    @media print {
      .toolbar { display:none !important; }
      .doc { box-shadow:none; }
      .doc > .page { padding:11mm 10mm; }
      .section { page-break-inside:avoid; }
      .doc > .page + .page { page-break-before:always; border-top:none; }
    }
    @page { size:A4; margin:0; }
  </style>
</head>
<body>
  <button class="toolbar" onclick="window.print()">طباعة / حفظ PDF</button>

  <div class="doc">

    <!-- ====================================================== -->
    <!-- ============ PAGE 1: الحفظ والحضور ================== -->
    <!-- ====================================================== -->
    <div class="page">

      <div class="cover">
        <div class="cover-r">
          <img src="${LOGO_URL}" alt="مقرأة الرقي" />
          <div>
            <div class="cover-title">تقرير الطالب</div>
            <div class="cover-subtitle">مقرأة الرقي · ${periodLabel(period)}</div>
          </div>
        </div>
        <div class="cover-period">
          <div class="cover-period-label">تاريخ الإصدار</div>
          <div class="cover-period-value">${today}</div>
        </div>
      </div>

      <div class="student">
        <div>
          <div class="student-name">${student.name || ''}</div>
          <div class="student-email">${student.email || ''}</div>
          <div class="excellence" style="color:${excellence.color};background:${excellence.bg};border-color:${excellence.color}33">
            🏅 ${excellence.label}
          </div>
        </div>
        <div class="student-meta">
          <div><b>تاريخ الانضمام:</b> ${formatDate(student.created_at)}</div>
          ${lastMem ? `<div><b>آخر سورة سُمِّعت:</b> ${lastMem.surah_name} (${lastMem.from_ayah}-${lastMem.to_ayah})</div>` : ''}
          ${student.is_restricted ? `<div class="student-flag">⚠ محظور من الحجز</div>` : ''}
        </div>
      </div>

      <!-- ملخّص الأرقام -->
      <section class="section">
        <header class="section-h">
          <h2>المؤشرات الأساسية</h2>
          <span class="count">${filteredSessions.length} حصة</span>
        </header>
        <div class="kpi-grid kpi-4">
          <div class="kpi"><div class="kpi-value">${filteredSessions.length}</div><div class="kpi-label">إجمالي الحصص</div></div>
          <div class="kpi"><div class="kpi-value" style="color:${C.ok}">${completedSessions.length}</div><div class="kpi-label">حصص مكتملة</div></div>
          <div class="kpi"><div class="kpi-value" style="color:${C.ok}">${attendanceRate}%</div><div class="kpi-label">نسبة الحضور</div></div>
          <div class="kpi"><div class="kpi-value" style="color:${C.gold}">${ratings.average_rating ? Math.round((Number(ratings.average_rating) / 4) * 100) + '%' : '—'}</div><div class="kpi-label">متوسط التقييم</div></div>
        </div>
        ${commitmentChip}
      </section>

      <!-- الحضور -->
      <section class="section">
        <header class="section-h"><h2>الحضور والغياب</h2></header>
        ${attendanceBlock}
      </section>

      <!-- التقييمات -->
      <section class="section">
        <header class="section-h">
          <h2>توزيع التقييمات</h2>
          <span class="count gold">${totalRatings}</span>
        </header>
        ${totalRatings ? ratingsChart : `<div class="empty">لا توجد تقييمات في هذه الفترة</div>`}
      </section>

      <!-- الحفظ -->
      <section class="section">
        <header class="section-h">
          <h2>سجلّ الحفظ والتسميع</h2>
          <span class="count">${filteredMem.length}</span>
        </header>
        ${memSurahsSet.length ? `<div class="hint">السور في هذه الفترة:</div><div class="badge-row">${memSurahsSet.slice(0, 10).map(s => `<span class="badge">${s}</span>`).join('')}</div>` : ''}
        ${memRows ? `
          <table class="t">
            <thead><tr><th>السورة</th><th>الآيات</th><th>التقييم</th><th>التاريخ</th></tr></thead>
            <tbody>${memRows}</tbody>
          </table>` : `<div class="empty">لا توجد سجلات حفظ في هذه الفترة</div>`}
      </section>

      <!-- الحصص -->
      <section class="section">
        <header class="section-h">
          <h2>الحصص</h2>
          <span class="count">${filteredSessions.length}</span>
        </header>
        ${sessionRows ? `
          <table class="t">
            <thead><tr><th>التاريخ والوقت</th><th>المعلم</th><th>الحالة</th><th>التقييم</th><th>الحضور</th></tr></thead>
            <tbody>${sessionRows}</tbody>
          </table>` : `<div class="empty">لا توجد حصص في هذه الفترة</div>`}
      </section>

      <div class="footer">
        <b>مقرأة الرقي</b> · صفحة 1 من 2 — الحفظ والحضور · ${today}
      </div>
    </div>

    <!-- ====================================================== -->
    <!-- ============ PAGE 2: المراجعة الزوجية =============== -->
    <!-- ====================================================== -->
    <div class="page">
      ${reviewBlock}
      <div class="footer">
        <b>مقرأة الرقي</b> · صفحة 2 من 2 — المراجعة الزوجية · ${today}
      </div>
    </div>

  </div>
</body>
</html>`;

  /* iOS / iPhone: build a real multi-page A4-PORTRAIT PDF and open it in a
     new tab. The shared `printHTMLInIframe` path was tuned for the landscape
     certificate sheets — feeding it a portrait, multi-page report caused
     iOS to shrink-to-fit the whole document into a single landscape page.
     Other devices keep the proven `window.print()` path unchanged. */
  if (isIOSDevice()) {
    toast.success('جاري تجهيز التقرير…');
    generateReportPDFForIOS(html, {
      pageSelector: '.page',
      title: `تقرير الطالب — ${student.name || ''}`,
    }).catch((err) => {
      try { console.warn('[student-report] iOS PDF path failed, falling back to print', err); } catch (_) { /* console missing */ }
      printHTMLInIframe(html);
    });
    return;
  }

  printHTMLInIframe(html);
  toast.success('جاري تجهيز التقرير للطباعة…');
}