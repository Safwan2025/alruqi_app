/**
 * Multi-page A4-PORTRAIT report PDF generator — iOS / iPhone path.
 *
 * Why this file exists
 * --------------------
 * The shared `printHTMLInIframe` iOS pipeline was designed for the
 * certificate sheets (A4 LANDSCAPE, single `.sheet` element). When fed a
 * report document — which is A4 PORTRAIT with multiple `.page` children
 * stacked vertically — that pipeline produced a tiny "screenshot inside a
 * big page" because:
 *   1. The offscreen iframe is landscape (297×210mm), so the portrait
 *      report (210mm wide) leaves a huge empty band on one side.
 *   2. html2canvas captures the whole tall `body`, then jsPDF squeezes the
 *      tall canvas into one landscape page → shrink-to-fit.
 *   3. There is no `.page` walking, so two-page reports collapse to one.
 *
 * This generator solves all three points:
 *   - Renders into a PORTRAIT iframe (210×297mm).
 *   - Iterates `.page` children one at a time, rasterising each
 *     individually with html2canvas (scale ≈ 2.5 for ~250 DPI quality).
 *   - Adds each as its own A4-portrait page via `jsPDF.addPage()`, so the
 *     final PDF has exactly the same number of pages as the report.
 *   - Opens the result as a Blob URL in a new tab; iOS's native PDF
 *     viewer exposes Save / Share / Print via the system Share Sheet.
 *
 * Scope: this file is **only** for reports. Certificates and any other
 * single-page LANDSCAPE PDF keep using their own dedicated path.
 * `printHTML.js` is **not** modified.
 */

const A4_PORTRAIT_W_MM = 210;
const A4_PORTRAIT_H_MM = 297;

function isIOSDevice() {
  try {
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  } catch (_) { return false; }
}

function waitForImages(doc) {
  const imgs = Array.from(doc.images || []);
  if (!imgs.length) return Promise.resolve();
  return Promise.all(imgs.map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise((res) => { img.onload = res; img.onerror = res; });
  }));
}

async function waitForFonts(doc) {
  /* For iframe-hosted reports we cannot rely on `document.fonts.ready` alone:
     Safari (and Chromium-on-iOS UA) resolve `.ready` BEFORE `@import` fonts
     have actually been downloaded. We therefore explicitly request each
     specific (family, weight, size) we know the report uses, which forces
     the download and waits for it. Missing the load step produces the
     classic "broken Arabic" output where letters appear disconnected
     because the renderer falls back to a system font with no Arabic
     shaping at the requested weight. */
  try {
    if (doc.fonts && doc.fonts.load) {
      const variants = [
        '400 14px "Amiri"',          '700 16px "Amiri"',
        '700 20px "Amiri"',          '700 24px "Amiri"',
        '400 12px "IBM Plex Sans Arabic"', '500 12px "IBM Plex Sans Arabic"',
        '600 12px "IBM Plex Sans Arabic"', '700 12px "IBM Plex Sans Arabic"',
        '300 11px "IBM Plex Sans Arabic"',
      ];
      await Promise.all(variants.map((v) => doc.fonts.load(v).catch(() => null)));
    }
    if (doc.fonts && doc.fonts.ready) await doc.fonts.ready;
  } catch (_) { /* best-effort */ }
}

/* Inject a minimal Arabic-safety stylesheet inside the iframe BEFORE we
   raster the report. Goals:
   - Neutralise any `letter-spacing` the report applies (even 0.2px breaks
     Arabic ligatures, especially after html2canvas rasterisation).
   - Force the RTL writing direction at every container level so mixed
     text never falls back to LTR shaping.
   - Enable the standard OpenType shaping features Arabic depends on
     (`liga`, `calt`, `kern`) regardless of what the renderer defaults to.
   - Isolate LTR values (numbers, dates, page counters, emails) so they
     do not bleed into the surrounding Arabic context.
   We do NOT modify the report HTML/CSS — only the iframe copy. */
function injectArabicSafetyCSS(doc) {
  try {
    const style = doc.createElement('style');
    style.setAttribute('data-arabic-safety', 'true');
    style.textContent = `
      /* === 1) Arabic shaping safety (must come first) =================== */
      * { letter-spacing: 0 !important; word-spacing: normal !important; }
      html, body, .doc, .page {
        direction: rtl !important;
        unicode-bidi: isolate;
        text-rendering: optimizeLegibility;
        font-feature-settings: "liga" 1, "calt" 1, "kern" 1, "rlig" 1 !important;
        -webkit-font-feature-settings: "liga" 1, "calt" 1, "kern" 1, "rlig" 1 !important;
      }
      .num-ltr, .ltr-value, .email, .url, .cert-number,
      .page-number, .latin {
        direction: ltr !important;
        unicode-bidi: isolate !important;
        display: inline-block;
      }

      /* === 2) Layout safety for iOS foreignObject rasterisation =========
         When html2canvas uses \`foreignObjectRendering: true\` the layout is
         re-rasterised through SVG — Safari's SVG engine measures text a
         few pixels tighter than HTML, which can collapse heading lines on
         top of each other if no explicit \`line-height\` is set. The rules
         below give every heading and major text block a guaranteed
         vertical breathing room *without* changing the report design. */
      body { line-height: 1.6 !important; }
      h1, h2, h3, h4 { line-height: 1.45 !important; }
      .section-h, .section-h h2 { line-height: 1.5 !important; min-height: 1.7em; }
      .cover-title, .student-name { line-height: 1.25 !important; }
      .cover-subtitle, .cover-meta, .pb-status, .badge, .pill, .footer {
        line-height: 1.55 !important;
      }
      table.t th, table.t td, th, td { line-height: 1.45 !important; }
      .kpi-value, .ring-val { line-height: 1.15 !important; }

      /* === 3) Logo / image fidelity =====================================
         Some report covers embed a logo. With CORS-restricted sources the
         image can appear faded after SVG raster. We keep aspect ratio
         clean and force native image rendering quality. */
      img {
        max-width: 100%;
        height: auto;
        image-rendering: auto;
        -webkit-user-drag: none;
      }
    `;
    (doc.head || doc.documentElement).appendChild(style);
  } catch (_) { /* iframe gone — skip */ }
}

/* Build offscreen portrait iframe and write the document into it. */
function buildPortraitIframe(html) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    `position:fixed; top:0; left:0; ` +
    `width:${A4_PORTRAIT_W_MM}mm; height:${A4_PORTRAIT_H_MM}mm; ` +
    `min-width:${A4_PORTRAIT_W_MM}mm; min-height:${A4_PORTRAIT_H_MM}mm; ` +
    `border:0; opacity:0; pointer-events:none; z-index:-1;`;
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  return iframe;
}

/**
 * Build a multi-page A4-portrait PDF from an HTML report and open it in a
 * new tab on iOS. Returns the open Blob URL via a Promise.
 *
 * @param {string}  html               Full HTML document for the report.
 * @param {object}  [opts]
 * @param {string}  [opts.pageSelector='.page']  CSS selector for each page.
 * @param {number}  [opts.scale=2.5]   html2canvas scale (≥250 DPI at A4).
 * @param {string}  [opts.title]       Window title for the PDF tab.
 */
export async function generateReportPDFForIOS(html, opts = {}) {
  const pageSelector = opts.pageSelector || '.page';
  const scale = Math.max(1.5, Math.min(3.5, Number(opts.scale) || 2.5));

  /* Open destination tab synchronously so iOS does not block the pop-up. */
  const targetWin = (typeof window !== 'undefined') ? window.open('', '_blank') : null;

  let iframe = null;
  let blobUrl = null;
  try {
    const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
      import('jspdf'),
      import('html2canvas'),
    ]);

    iframe = buildPortraitIframe(html);
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    /* Ensure RTL + Arabic root attributes are set at the document level even
       if the report omitted them on `<html>`. */
    try {
      doc.documentElement.setAttribute('dir', 'rtl');
      doc.documentElement.setAttribute('lang', 'ar');
      if (doc.body) doc.body.setAttribute('dir', 'rtl');
    } catch (_) { /* iframe gone — skip */ }
    /* Force-load the specific font weights the report uses, then add the
       Arabic-safety stylesheet, then let layout settle. */
    await waitForFonts(doc);
    injectArabicSafetyCSS(doc);
    await waitForImages(doc);
    /* Slightly longer settle to give Safari / the iframe one paint after the
       safety stylesheet is applied, and a chance for foreignObject's slower
       Arabic measuring pass to stabilise heading line-heights. */
    await new Promise((r) => setTimeout(r, 350));

    /* Walk every report page; if none found, fall back to body (still
       portrait) so we never silently produce an empty PDF. */
    let pages = Array.from(doc.querySelectorAll(pageSelector));
    if (!pages.length) {
      pages = [doc.querySelector('.doc') || doc.body];
    }

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    /* A4 page geometry — leave a tiny safety margin so printers / iOS
       previewers never crop the edge content. */
    const margin = 4;
    const pageW = A4_PORTRAIT_W_MM;
    const pageH = A4_PORTRAIT_H_MM;
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2;

    for (let i = 0; i < pages.length; i += 1) {
      const el = pages[i];
      if (!el) continue;

      const canvas = await html2canvas(el, {
        scale,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        /* SVG `<foreignObject>` rendering — critical for Arabic.
           Without this, html2canvas walks the DOM and re-rasterises each
           glyph individually, which strips Arabic ligatures and produces
           the "disconnected letters" output users saw on iPhone PDFs.
           With `foreignObjectRendering: true` the snapshot is embedded into
           an SVG <foreignObject> and rasterised by the browser's native
           text engine — Arabic shaping, RTL bidi, and ligatures are all
           preserved. Modern Safari and Chromium both support this. */
        foreignObjectRendering: true,
        windowWidth: el.scrollWidth || el.clientWidth,
        windowHeight: el.scrollHeight || el.clientHeight,
      });

      const ratio = canvas.width / canvas.height;
      /* Prefer width-fit (portrait reports are taller than wide) and only
         clamp to height if the page is unusually short. */
      let drawW = maxW;
      let drawH = drawW / ratio;
      if (drawH > maxH) {
        drawH = maxH;
        drawW = drawH * ratio;
      }
      const x = (pageW - drawW) / 2;
      const y = margin; /* anchor to top so all pages start at the same Y */

      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      if (i > 0) pdf.addPage('a4', 'portrait');
      pdf.addImage(imgData, 'JPEG', x, y, drawW, drawH, undefined, 'FAST');
    }

    const blob = pdf.output('blob');
    blobUrl = URL.createObjectURL(blob);

    if (targetWin && !targetWin.closed) {
      try {
        if (opts.title) targetWin.document.title = opts.title;
      } catch (_) { /* about:blank may forbid title write — ignore */ }
      targetWin.location.href = blobUrl;
    } else {
      /* Pop-up blocked → fall back to a hidden anchor click. */
      const a = document.createElement('a');
      a.href = blobUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    setTimeout(() => {
      try { URL.revokeObjectURL(blobUrl); } catch (_) { /* already revoked */ }
    }, 90_000);
  } catch (err) {
    try { if (targetWin && !targetWin.closed) targetWin.close(); } catch (_) { /* tab gone */ }
    if (blobUrl) {
      try { URL.revokeObjectURL(blobUrl); } catch (_) { /* already revoked */ }
    }
    throw err;
  } finally {
    if (iframe && iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  }
}

export { isIOSDevice };

export default generateReportPDFForIOS;
