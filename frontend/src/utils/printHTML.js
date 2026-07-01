/**
 * Safe print helper for Alruqi Quran LMS.
 *
 * هذا الملف لا يغيّر تصميم الشهادة ولا يحقن ألوانًا ولا يغيّر CSS الشهادة.
 * وظيفته فقط:
 * - يأخذ HTML الشهادة كما هو.
 * - يضعه داخل iframe مخفي بحجم A4 landscape.
 * - ينتظر الصور والخطوط.
 * - يطبع iframe نفسه، وليس صفحة الموقع.
 *
 * مهم:
 * أبقينا printHTMLInIframe لأن ملفات قديمة تستورده بهذا الاسم.
 */

function isIOSDevice() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function createPrintIframe() {
  const iframe = document.createElement('iframe');

  /*
    لا نجعل iframe صفر الحجم.
    بعض المتصفحات، خصوصًا Safari/Chrome، قد تغيّر layout إذا كان iframe صفر.
  */
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '297mm';
  iframe.style.height = '210mm';
  iframe.style.minWidth = '297mm';
  iframe.style.minHeight = '210mm';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.background = '#ffffff';
  iframe.setAttribute('aria-hidden', 'true');

  document.body.appendChild(iframe);

  return iframe;
}

async function waitForFonts(doc) {
  try {
    if (doc.fonts && doc.fonts.ready) {
      await doc.fonts.ready;
    }
  } catch (error) {
    console.warn('Fonts loading skipped:', error);
  }
}

function waitForImages(doc) {
  const images = Array.from(doc.images || []);

  if (images.length === 0) {
    return Promise.resolve();
  }

  return Promise.all(
    images.map((img) => {
      if (img.complete) return Promise.resolve();

      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    })
  );
}

function normalizeHTML(html) {
  if (typeof html !== 'string') return '';

  /*
    لا نضيف CSS عام هنا حتى لا يتغير شكل الشهادة.
    فقط إذا جاءنا fragment بدون document كامل، نضعه داخل HTML بسيط.
  */
  if (html.includes('<!DOCTYPE html') || html.includes('<html')) {
    return html;
  }

  return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body>
        ${html}
      </body>
    </html>
  `;
}

// ---------------------------------------------------------------------------
// iOS real-PDF generation pipeline (jsPDF + html2canvas)
// ---------------------------------------------------------------------------
/**
 * Generate an A4-landscape PDF from the certificate HTML and open it in a
 * new tab as a Blob URL. iOS's native PDF viewer renders the geometry
 * faithfully and offers Save / Print / Share via the system Share Sheet.
 *
 * Strategy:
 *   1. Render the HTML into an offscreen iframe sized 297mm × 210mm.
 *   2. Wait for web fonts + images.
 *   3. Rasterise the `.sheet` element to a high-DPI canvas with html2canvas.
 *   4. Build A4-landscape PDF with jsPDF and addImage the canvas.
 *   5. Open the resulting Blob URL via window.open(_blank).
 *
 * Why a Blob URL: iOS Safari's native PDF viewer opens blob: URLs reliably
 * and exposes the system Share/Save/Print menu. data: URLs are flaky on iOS.
 */
async function generateAndOpenPDF(html, opts = {}) {
  // Open the destination tab synchronously (preserves the user-gesture
  // chain) so iOS does not block the pop-up; we'll point it at the blob
  // URL once the PDF is ready.
  const targetWin = window.open('', '_blank');

  let iframe = null;
  let blobUrl = null;
  try {
    const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
      import('jspdf'),
      import('html2canvas'),
    ]);

    // Offscreen iframe at real A4-landscape pixel dimensions
    iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText =
      'position:fixed; top:0; left:0; width:297mm; height:210mm; ' +
      'border:0; opacity:0; pointer-events:none; z-index:-1;';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(normalizeHTML(html));
    doc.close();

    // Wait for fonts + images
    try {
      if (doc.fonts && doc.fonts.ready) {
        await doc.fonts.ready;
      }
    } catch (_) { /* ignore */ }
    await waitForImages(doc);
    // Tiny settle delay for late layout / gradient paint
    await new Promise((r) => setTimeout(r, 120));

    const sheet = doc.querySelector('.sheet') || doc.body;

    // Capture density: callers (e.g. certificates) may request a higher scale
    // for sharper output. Default stays 2 so existing reports are unchanged.
    const pdfScale = Math.max(2, Math.min(6, Number(opts.pdfScale) || 2));
    const canvas = await html2canvas(sheet, {
      scale: pdfScale,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: sheet.scrollWidth || sheet.clientWidth,
      windowHeight: sheet.scrollHeight || sheet.clientHeight,
    });

    // Build A4-landscape PDF (297mm × 210mm) with a 4mm safety margin
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = 297;
    const pageH = 210;
    const margin = 4;
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2;

    // Fit canvas into available area while preserving aspect ratio. The
    // certificate sheet is ~297:209 ≈ A4-landscape; centering on the
    // remaining axis prevents any side from being clipped.
    const ratio = canvas.width / canvas.height;
    let drawW = maxW;
    let drawH = drawW / ratio;
    if (drawH > maxH) {
      drawH = maxH;
      drawW = drawH * ratio;
    }
    const x = (pageW - drawW) / 2;
    const y = (pageH - drawH) / 2;

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    pdf.addImage(imgData, 'JPEG', x, y, drawW, drawH, undefined, 'FAST');

    const blob = pdf.output('blob');
    blobUrl = URL.createObjectURL(blob);

    if (targetWin && !targetWin.closed) {
      targetWin.location.href = blobUrl;
    } else {
      // Pop-up was blocked → fall back to a direct location-replace anchor
      // (still inside this function's promise chain). If even this fails,
      // throw to let the caller fall through to the iframe-print path.
      const a = document.createElement('a');
      a.href = blobUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    // Free the iframe immediately, but keep the blob URL alive long enough
    // for the new tab to finish reading it.
    setTimeout(() => {
      if (blobUrl) {
        try { URL.revokeObjectURL(blobUrl); } catch (_) { /* already revoked */ }
      }
    }, 90_000);
  } catch (err) {
    // Cleanup the placeholder tab if we opened one
    try { if (targetWin && !targetWin.closed) targetWin.close(); } catch (_) { /* tab already gone */ }
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

export async function printHTML(html, opts = {}) {
  /*
    iOS strategy — real PDF generation:
    Even with a top-level document and `@page { size: A4 landscape; margin: 0 }`,
    iOS Safari/Chrome (AirPrint) routinely renders into A4 PORTRAIT, so the
    HTML-print approach cannot reliably guarantee landscape on iPhone. We
    instead build an actual A4-landscape PDF via jsPDF + html2canvas and
    open the resulting Blob URL in a new tab — iOS's native PDF viewer
    honours the page geometry exactly.

    Imports are dynamic so jsPDF/html2canvas (~430 KB) only enter the
    bundle the first time a user actually prints. If real-PDF generation
    fails for any reason, we transparently fall back to the legacy
    iframe-print path so the feature never breaks.
  */
  if (isIOSDevice()) {
    try {
      await generateAndOpenPDF(html, opts);
      return;
    } catch (err) {
      // Best-effort: log and fall through to legacy iframe path
      try { console.warn('[printHTML] iOS PDF path failed, falling back to iframe', err); } catch (_) { /* console missing */ }
    }
  }

  return new Promise((resolve, reject) => {
    let iframe = null;
    let alreadyPrinted = false;
    let alreadyResolved = false;

    const finish = () => {
      if (alreadyResolved) return;
      alreadyResolved = true;

      setTimeout(() => {
        try {
          if (iframe && iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        } catch (error) {
          console.warn('Failed to remove print iframe:', error);
        }

        resolve();
      }, 1200);
    };

    const runPrint = async () => {
      if (alreadyPrinted) return;
      alreadyPrinted = true;

      try {
        const win = iframe.contentWindow;
        const doc = iframe.contentDocument || win.document;

        await waitForFonts(doc);
        await waitForImages(doc);

        /*
          على iPhone/Safari لا نؤخر print كثيرًا حتى لا يعتبرها طباعة تلقائية.
          إذا ظهرت رسالة "تم منع الطباعة تلقائيًا"، يضغط المستخدم السماح.
        */
        await new Promise((res) => setTimeout(res, isIOSDevice() ? 80 : 250));

        win.focus();
        win.print();

        finish();
      } catch (error) {
        finish();
        reject(error);
      }
    };

    try {
      iframe = createPrintIframe();

      const doc = iframe.contentDocument || iframe.contentWindow.document;

      doc.open();
      doc.write(normalizeHTML(html));
      doc.close();

      iframe.onload = runPrint;

      /*
        fallback لبعض نسخ Safari التي لا تطلق onload دائمًا.
      */
      setTimeout(runPrint, isIOSDevice() ? 350 : 700);
    } catch (error) {
      reject(error);
    }
  });
}

/*
  Backward compatibility:
  عندك ملفات تستورد printHTMLInIframe.
  لذلك نعيد نفس الاسم بدون أن نكسر generateCertificatePDF أو StudentReport أو WeeklyPlan.
*/
export const printHTMLInIframe = printHTML;

export default printHTML;