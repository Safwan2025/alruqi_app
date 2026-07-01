/**
 * Quran certificates — printable A4 LANDSCAPE documents (RTL Arabic).
 *
 * The two approved, fixed PDF templates are used verbatim as full-bleed
 * background images. The placeholder tokens in each template were cleaned out
 * once during asset preparation, and ONLY the dynamic variables are overlaid
 * at the exact positions of those placeholders:
 *
 *   - full_quran ("شهادة حفظ القرآن الكريم")  → student name, date, cert number
 *   - juz        ("شهادة إنجاز")              → student name, juz, date, cert number
 *
 * The frame, colours, typography, ornaments, borders, stamp, signature and
 * every static line of Arabic text are baked into the template image and are
 * never recreated here.
 *
 * Name placement: the font size is computed at generation time (canvas
 * measurement) so the name always fits inside its reserved box, and the box
 * uses flexbox to centre the name perfectly on both axes. No in-iframe script
 * is used, which keeps the Desktop print + iPhone/iOS real-PDF flows intact.
 *
 * Rendered through the shared iframe/PDF print helper (printHTMLInIframe).
 */
import { printHTMLInIframe } from './printHTML';
import { generateCertificateImagePDF } from './generateCertificateImagePDF';

/* iOS detection — kept local so this module stays self-contained. */
const isIOSDevice = () => {
  try {
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  } catch (_) { return false; }
};

/* Cleaned template images served from /public/assets — resolved to an absolute
   URL at call time so they load inside the print iframe. */
const assetUrl = (p) => (typeof window !== 'undefined' ? window.location.origin : '') + p;
const FULL_QURAN_TEMPLATE = '/assets/quran_full_template.png';
const JUZ_TEMPLATE = '/assets/juz_achievement_template.png';

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));

// Achievement certificate: show ONLY the juz number ("الجزء ٣"), never the
// detailed juz name, so the inline slot stays short and uncluttered.
const toArabicIndic = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
const formatJuzLabel = (cert) => {
  if (cert.juz_number != null && cert.juz_number !== '') {
    return `الجزء ${toArabicIndic(cert.juz_number)}`;
  }
  return cert.juz_name || '';
};

// Hijri (Umm al-Qura) date as "٢٥ / محرم / ١٤٤٨ هـ" (Arabic-Indic digits) —
// matches the date format printed in both templates.
const formatHijriDate = (iso) => {
  try {
    const d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) return '';
    const fmt = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-arab', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    const parts = fmt.formatToParts(d);
    const get = (t) => (parts.find((p) => p.type === t) || {}).value || '';
    const day = get('day'), month = get('month'), year = get('year');
    if (!day || !month || !year) return '';
    return `${day} / ${month} / ${year} هـ`;
  } catch (e) {
    return '';
  }
};

/* Auto-fit a single line of text (returns size in mm) so it never exceeds
   `maxWmm`. Pure measurement at generation time → no in-iframe script. */
const fitTextSizeMm = (text, { maxWmm, baseMm, minMm, weight = 700, family = "Amiri, 'Scheherazade New', serif", safety = 1.06 }) => {
  if (!text) return baseMm;
  const PX_PER_MM = 4;
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${weight} ${baseMm * PX_PER_MM}px ${family}`;
    // safety factor compensates for font-metric uncertainty (Amiri may not be
    // fully loaded at measure time) so the line never overflows its box.
    const wMm = (ctx.measureText(String(text)).width / PX_PER_MM) * safety;
    const size = wMm > maxWmm ? Math.max(minMm, (baseMm * maxWmm) / wMm) : baseMm;
    return Math.round(size * 100) / 100;
  } catch (e) {
    return baseMm;
  }
};

const baseCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Tajawal:wght@400;500;700&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  html, body { background: #e8e6e0; }

  body {
    font-family: 'Tajawal', sans-serif;
    direction: rtl;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .toolbar {
    position: fixed; top: 14px; left: 14px; z-index: 1000;
    background: #1e5631; color: #fff; border: none;
    padding: 10px 22px; border-radius: 999px; cursor: pointer;
    font-family: inherit; font-size: 13px; font-weight: 600;
    box-shadow: 0 6px 22px rgba(30, 86, 49, 0.25);
  }

  .sheet {
    width: 297mm; height: 209mm; margin: 0 auto;
    position: relative; overflow: hidden;
    background: #fff;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
  }

  /* Fixed approved template as a full-bleed background. */
  .bg {
    position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: fill; display: block;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }

  /* Generic overlay anchor: positioned by its centre point. */
  .ov {
    position: absolute; transform: translate(-50%, -50%);
    display: flex; align-items: center; justify-content: center;
    text-align: center; white-space: nowrap; line-height: 1;
    color: #2b2b2b;
  }

  /* Student name box — centred on both axes, never overflows. */
  .ov-name {
    overflow: hidden;
    font-family: 'Amiri', 'Scheherazade New', serif;
    font-weight: 700;
    color: #2b2b2b;
  }
  .ov-name > span { display: inline-block; max-width: 100%; white-space: nowrap; }

  .ov-date {
    font-family: 'Amiri', serif; font-weight: 400; color: #2b2b2b;
  }
  .ov-juz {
    font-family: 'Amiri', serif; font-weight: 700; color: #2b2b2b;
  }
  .ov-cert {
    font-family: 'Tajawal', sans-serif; font-weight: 600;
    direction: ltr; letter-spacing: .3px; color: #1a1a1a;
  }

  @media print {
    html, body { width: 297mm; height: 210mm; margin: 0; padding: 0; overflow: hidden; background: #fff; }
    .toolbar, .no-print { display: none !important; }
    .sheet { width: 297mm; height: 209mm; margin: 0 auto; box-shadow: none; page-break-inside: avoid; break-inside: avoid; }
  }

  @page { size: A4 landscape; margin: 0; }
`;

/* ===================== full_quran — شهادة حفظ القرآن الكريم ===================== */
const fullQuranHTML = (cert) => {
  const name = cert.student_name || '';
  const date = formatHijriDate(cert.completion_date || cert.issued_at);
  const certNo = cert.certificate_number || '';
  const nameMm = fitTextSizeMm(name, { maxWmm: 44, baseMm: 12.5, minMm: 4.0 });
  const dateMm = fitTextSizeMm(date, { maxWmm: 42, baseMm: 5.2, minMm: 3.8, weight: 400 });
  const tpl = assetUrl(FULL_QURAN_TEMPLATE);
  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>شهادة حفظ القرآن الكريم — ${esc(name)}</title>
<style>${baseCSS}</style>
</head>
<body>
  <button class="toolbar no-print" onclick="window.print()">طباعة / حفظ PDF</button>
  <div class="sheet">
    <img class="bg" src="${tpl}" alt="شهادة حفظ القرآن الكريم" crossorigin="anonymous" />
    <div class="ov ov-name" style="left:50%; top:42.4%; width:46mm; height:16mm;"><span style="font-size:${nameMm}mm;">${esc(name)}</span></div>
    <div class="ov ov-date" style="left:58.4%; top:56.8%; font-size:${dateMm}mm;">${esc(date)}</div>
    <div class="ov ov-cert" style="left:49.3%; top:87.5%; font-size:3.9mm;">${esc(certNo)}</div>
  </div>
</body>
</html>`;
};

/* ========================= juz — شهادة إنجاز ========================= */
const juzHTML = (cert) => {
  const name = cert.student_name || '';
  const juz = formatJuzLabel(cert);
  const date = formatHijriDate(cert.completion_date || cert.issued_at);
  const certNo = cert.certificate_number || '';
  const nameMm = fitTextSizeMm(name, { maxWmm: 44, baseMm: 12.5, minMm: 4.0 });
  const juzMm = fitTextSizeMm(juz, { maxWmm: 21, baseMm: 5.0, minMm: 3.4 });
  const dateMm = fitTextSizeMm(date, { maxWmm: 42, baseMm: 5.2, minMm: 3.8, weight: 400 });
  const tpl = assetUrl(JUZ_TEMPLATE);
  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>شهادة إنجاز — ${esc(name)}</title>
<style>${baseCSS}</style>
</head>
<body>
  <button class="toolbar no-print" onclick="window.print()">طباعة / حفظ PDF</button>
  <div class="sheet">
    <img class="bg" src="${tpl}" alt="شهادة إنجاز" crossorigin="anonymous" />
    <div class="ov ov-name" style="left:50%; top:37.9%; width:46mm; height:16mm;"><span style="font-size:${nameMm}mm;">${esc(name)}</span></div>
    <div class="ov ov-juz" style="left:46.2%; top:47.6%; font-size:${juzMm}mm;">${esc(juz)}</div>
    <div class="ov ov-date" style="left:58.4%; top:52.3%; font-size:${dateMm}mm;">${esc(date)}</div>
    <div class="ov ov-cert" style="left:50%; top:85.7%; font-size:3.9mm;">${esc(certNo)}</div>
  </div>
</body>
</html>`;
};

export const generateCertificatePDF = (cert) => {
  if (!cert) return;

  /* iPhone / iOS path — bypass HTML→html2canvas and draw the certificate
     directly on a Canvas with deterministic pixel coordinates. This removes
     the Safari layout jitter where dynamic text (name / juz / date) used to
     drift by a few millimetres. Other devices keep the proven HTML overlay
     path (which works correctly on Desktop and Android). */
  if (isIOSDevice()) {
    return generateCertificateImagePDF(cert).catch((err) => {
      try { console.warn('[cert] iOS canvas-PDF failed; falling back to HTML overlay path', err); } catch (_) { /* console missing */ }
      const html = cert.certificate_type === 'full_quran'
        ? fullQuranHTML(cert)
        : juzHTML(cert);
      return printHTMLInIframe(html, {
        title: cert.certificate_type === 'full_quran'
          ? 'شهادة حفظ القرآن الكريم'
          : 'شهادة إنجاز',
        pdfScale: 4,
      });
    });
  }

  const html = cert.certificate_type === 'full_quran'
    ? fullQuranHTML(cert)
    : juzHTML(cert);

  /*
    مهم: لا نستخدم window.print هنا مباشرة.
    نرسل HTML الشهادة إلى printHTMLInIframe (طباعة / PDF داخل iframe)
    حتى لا تتأثر صفحة الموقع، ويبقى مسار iPhone/iOS كما هو.
  */
  printHTMLInIframe(html, {
    title: cert.certificate_type === 'full_quran'
      ? 'شهادة حفظ القرآن الكريم'
      : 'شهادة إنجاز',
    // Certificates render at high density on the iOS real-PDF path for crisp,
    // near-8K output (capped for mobile-memory safety). Desktop print uses the
    // full 8K template raster + vector text directly.
    pdfScale: 4,
  });
};

export default generateCertificatePDF;
