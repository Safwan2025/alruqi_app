/**
 * Certificate real-PDF generator for iPhone / iOS Safari.
 *
 * Why this file exists
 * --------------------
 * The HTML-overlay path (`generateCertificatePDF.js` → `printHTMLInIframe`)
 * works perfectly on Desktop and Android. On iPhone, the iOS flow used
 * `html2canvas` to rasterise the HTML — which still relies on Safari's
 * layout engine to position the dynamic text (name, juz, date, cert #).
 * Safari's late web-font metrics + flexbox quirks shifted the text by
 * a few millimetres, producing the "imbalanced" look users reported.
 *
 * This file draws the certificate directly on a 2-D Canvas with
 * deterministic pixel coordinates derived from the same approved layout
 * used by the HTML path. Nothing depends on Safari layout any more.
 *
 * Hard rules followed here (matching the product brief)
 * -----------------------------------------------------
 * - Templates (`/assets/quran_full_template.png`, `juz_achievement_template.png`)
 *   are used **verbatim** as full-bleed backgrounds. Not modified, not
 *   downscaled, not regenerated. They stay at their authored 8K resolution.
 * - Only four dynamic variables are drawn: student name, juz label,
 *   Hijri date, certificate number (from `cert.certificate_number`).
 * - The student name is centred on **both axes** of its reserved box and
 *   auto-shrinks to fit when very long. No border, no underline, no
 *   placeholder line is ever drawn — short names render absolutely clean.
 * - Arabic shaping uses the browser's native text engine (no
 *   `arabic-reshaper` library, no embedded font file).
 * - No new dependency: jsPDF is already loaded by `printHTML.js`.
 *
 * Output: A4-landscape PDF Blob URL opened in a new tab; iOS's native PDF
 * viewer exposes Save / Share / Print via the system Share Sheet.
 */

/* Cleaned approved templates, served from /public/assets. */
const TEMPLATES = {
  full_quran: '/assets/quran_full_template.png',
  juz: '/assets/juz_achievement_template.png',
};

/* Render-canvas dimensions.
 *
 * The original template is 7680×5431 (~41.7 MP, ≈ 1.4146 aspect). iOS Safari's
 * 2-D canvas memory budget is ~16 MP for 4-channel images, so a 7680-wide
 * canvas would crash the page on iPhone. We render to 4096-wide (≈ 11.86 MP)
 * which is still ≈ 350 DPI at A4 landscape — far above print quality.
 * The final PDF is A4-landscape (297×210mm) so the canvas uses the exact A4
 * aspect (no distortion when `addImage` maps it to the page).
 */
const CANVAS_W = 4096;
const CANVAS_H = Math.round(CANVAS_W * (210 / 297));   // 2897 px

/* 1 millimetre on the canvas, in pixels. */
const PX_PER_MM = CANVAS_W / 297;
const mm = (v) => v * PX_PER_MM;

/*
 * Verbatim layout from `generateCertificatePDF.js` (HTML-overlay path) — same
 * anchors and font sizes, expressed as fractions of canvas size so the iOS
 * output is visually identical to the Desktop/Android output.
 *
 * `xPct` / `yPct` mark the centre of the element.
 */
const LAYOUT = {
  full_quran: {
    name: { xPct: 0.500, yPct: 0.424, widthMm: 46, heightMm: 16, baseMm: 12.5, minMm: 4.0 },
    date: { xPct: 0.584, yPct: 0.568, baseMm: 5.2, minMm: 3.8, weight: 400 },
    cert: { xPct: 0.493, yPct: 0.875, baseMm: 3.9, minMm: 3.2, weight: 600, ltr: true },
  },
  juz: {
    name: { xPct: 0.500, yPct: 0.379, widthMm: 46, heightMm: 16, baseMm: 12.5, minMm: 4.0 },
    juz:  { xPct: 0.462, yPct: 0.476, baseMm: 5.0, minMm: 3.4, weight: 700 },
    date: { xPct: 0.584, yPct: 0.523, baseMm: 5.2, minMm: 3.8, weight: 400 },
    cert: { xPct: 0.500, yPct: 0.857, baseMm: 3.9, minMm: 3.2, weight: 600, ltr: true },
  },
};

/* ------------------------- formatting helpers ------------------------- */

/* Western digits → Arabic-Indic. */
const toArabicIndic = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);

/* Achievement certificate: prefer the short form "الجزء ٣"; only fall back to
   `juz_name` if `juz_number` is genuinely absent. */
const formatJuzLabel = (cert) => {
  if (cert.juz_number != null && cert.juz_number !== '') {
    return `الجزء ${toArabicIndic(cert.juz_number)}`;
  }
  return cert.juz_name || '';
};

/* Hijri date as "٢٥ / محرم / ١٤٤٨ هـ" — same format the templates expect. */
const formatHijriDate = (iso) => {
  try {
    const d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) return '';
    const fmt = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-arab', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    const parts = fmt.formatToParts(d);
    const get = (t) => (parts.find((p) => p.type === t) || {}).value || '';
    const day = get('day'); const month = get('month'); const year = get('year');
    if (!day || !month || !year) return '';
    return `${day} / ${month} / ${year} هـ`;
  } catch (_e) { return ''; }
};

/* ------------------------- font / image loading ----------------------- */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Template image failed to load: ${src}`));
    img.src = src;
  });
}

/* Inject the same Amiri / Tajawal stylesheet the HTML path uses (once) and
   wait for the glyphs we will draw with to be ready. Canvas 2-D `fillText`
   uses the document's font registry, so we don't have to embed anything. */
let _fontPromise = null;
function ensureCertFontsLoaded() {
  if (_fontPromise) return _fontPromise;
  _fontPromise = (async () => {
    if (typeof document === 'undefined') return;
    if (!document.querySelector('link[data-cert-fonts]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Tajawal:wght@400;500;700&display=swap';
      link.setAttribute('data-cert-fonts', 'true');
      document.head.appendChild(link);
    }
    try {
      if (document.fonts && document.fonts.load) {
        await Promise.all([
          document.fonts.load('700 100px "Amiri"'),
          document.fonts.load('400 100px "Amiri"'),
          document.fonts.load('600 100px "Tajawal"'),
        ]);
      }
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    } catch (_) { /* best-effort */ }
  })();
  return _fontPromise;
}

/* ------------------------- drawing primitives ------------------------- */

/* Auto-fit a single-line string into a maximum pixel width by shrinking the
   font size — never the inverse. Returns the chosen size (integer px). */
function fitFontSizePx(ctx, text, { fontFamily, weight, basePx, minPx, maxWidthPx, safety = 1.02 }) {
  if (!text) return basePx;
  ctx.font = `${weight} ${basePx}px ${fontFamily}`;
  const measured = ctx.measureText(text).width * safety;
  if (measured <= maxWidthPx) return basePx;
  const scaled = Math.max(minPx, (basePx * maxWidthPx) / measured);
  return Math.round(scaled);
}

/* Draw a perfectly centred single line (no underline, no box, no padding).
   `textBaseline:'middle'` + `textAlign:'center'` guarantees vertical and
   horizontal centring regardless of glyph height — even for short names. */
function drawCenteredLine(ctx, text, { x, y, fontPx, weight, family, color = '#2b2b2b', ltr = false }) {
  if (!text) return;
  ctx.save();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = ltr ? 'ltr' : 'rtl';
  ctx.font = `${weight} ${fontPx}px ${family}`;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/* ------------------------- main entry point --------------------------- */

const assetUrl = (p) =>
  (typeof window !== 'undefined' ? window.location.origin : '') + p;

/**
 * Build an A4-landscape PDF certificate for iOS and open it in a new tab.
 * Returns a Promise that resolves once the PDF tab has been opened.
 *
 * @param {Object} cert  Certificate record (must include certificate_type;
 *                       optionally student_name, juz_number, juz_name,
 *                       completion_date/issued_at, certificate_number).
 */
export async function generateCertificateImagePDF(cert) {
  if (!cert) return;

  const isFull = cert.certificate_type === 'full_quran';
  const tplKey = isFull ? 'full_quran' : 'juz';
  const layout = LAYOUT[tplKey];

  const name   = cert.student_name || '';
  const certNo = cert.certificate_number || '';
  const date   = formatHijriDate(cert.completion_date || cert.issued_at);
  const juzTxt = !isFull ? formatJuzLabel(cert) : '';

  /* Open the destination tab synchronously so iOS does not block it.
     We'll point it at the blob URL once the PDF is ready. */
  const targetWin = (typeof window !== 'undefined') ? window.open('', '_blank') : null;

  let blobUrl = null;
  try {
    /* Load template + fonts in parallel. */
    const [tplImg] = await Promise.all([
      loadImage(assetUrl(TEMPLATES[tplKey])),
      ensureCertFontsLoaded(),
    ]);

    /* Build the render canvas. */
    const canvas = document.createElement('canvas');
    canvas.width  = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2-D canvas unavailable');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    /* Paint the approved template full-bleed. */
    ctx.drawImage(tplImg, 0, 0, CANVAS_W, CANVAS_H);

    const arFamily   = `"Amiri", "Scheherazade New", "Geeza Pro", serif`;
    const sansFamily = `"Tajawal", system-ui, sans-serif`;

    /* --- Student name (auto-fit + perfectly centred) ----------------- */
    {
      const cx = layout.name.xPct * CANVAS_W;
      const cy = layout.name.yPct * CANVAS_H;
      const boxW = mm(layout.name.widthMm);
      const basePx = mm(layout.name.baseMm);
      const minPx  = mm(layout.name.minMm);
      const fontPx = fitFontSizePx(ctx, name, {
        fontFamily: arFamily, weight: 700,
        basePx, minPx, maxWidthPx: boxW, safety: 1.02,
      });
      drawCenteredLine(ctx, name, {
        x: cx, y: cy, fontPx, weight: 700, family: arFamily,
      });
    }

    /* --- Juz (juz certificate only) --------------------------------- */
    if (!isFull && juzTxt) {
      const cx = layout.juz.xPct * CANVAS_W;
      const cy = layout.juz.yPct * CANVAS_H;
      const fontPx = mm(layout.juz.baseMm);
      drawCenteredLine(ctx, juzTxt, {
        x: cx, y: cy, fontPx, weight: 700, family: arFamily,
      });
    }

    /* --- Hijri date -------------------------------------------------- */
    if (date) {
      const cx = layout.date.xPct * CANVAS_W;
      const cy = layout.date.yPct * CANVAS_H;
      const fontPx = mm(layout.date.baseMm);
      drawCenteredLine(ctx, date, {
        x: cx, y: cy, fontPx, weight: 400, family: arFamily,
      });
    }

    /* --- Certificate number (LTR, sans-serif, slightly darker) ------ */
    if (certNo) {
      const cx = layout.cert.xPct * CANVAS_W;
      const cy = layout.cert.yPct * CANVAS_H;
      const fontPx = mm(layout.cert.baseMm);
      drawCenteredLine(ctx, certNo, {
        x: cx, y: cy, fontPx, weight: 600, family: sansFamily,
        color: '#1a1a1a', ltr: true,
      });
    }

    /* Canvas → JPEG (high quality) → A4-landscape PDF, full-bleed. */
    const { default: jsPDF } = await import('jspdf');
    const imgData = canvas.toDataURL('image/jpeg', 0.94);
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    pdf.addImage(imgData, 'JPEG', 0, 0, 297, 210, undefined, 'FAST');

    const blob = pdf.output('blob');
    blobUrl = URL.createObjectURL(blob);

    if (targetWin && !targetWin.closed) {
      targetWin.location.href = blobUrl;
    } else {
      /* Pop-up was blocked → fall back to a hidden link click which still
         honours the user-gesture chain. */
      const a = document.createElement('a');
      a.href = blobUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    /* Keep the blob URL alive long enough for the iOS PDF viewer to read it. */
    setTimeout(() => {
      try { URL.revokeObjectURL(blobUrl); } catch (_) { /* already revoked */ }
    }, 90_000);
  } catch (err) {
    try { if (targetWin && !targetWin.closed) targetWin.close(); } catch (_) { /* tab gone */ }
    if (blobUrl) { try { URL.revokeObjectURL(blobUrl); } catch (_) { /* already revoked */ } }
    throw err;
  }
}

export default generateCertificateImagePDF;
