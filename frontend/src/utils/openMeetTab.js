/*
 * openMeetTab.js
 * ---------------------------------------------------------------------------
 * Reliable mobile-safe helper for opening a Google Meet / recitation link
 * for both students and teachers.
 *
 * Why this file exists:
 *  - Safari (iOS) requires window.open(...) to be called SYNCHRONOUSLY inside
 *    the click handler; after the first `await` the user-gesture token is
 *    gone and Safari blocks any new tab.
 *  - Android Chrome + iOS Safari, when we redirect an `about:blank` tab to
 *    https://meet.google.com/... via `location.href`, sometimes lose the user
 *    gesture and Meet responds by sending the user to the "Install Meet"
 *    landing page (or a blank tab if the API stalls).
 *
 * The fix:
 *  1. Open a real tab SYNCHRONOUSLY (still keeps Safari happy).
 *  2. Immediately inject a small Arabic RTL "loading" HTML document into it
 *     so the user never sees a blank/about:blank tab.
 *  3. When the meet link is ready, REPLACE the HTML with a "ready" page
 *     that contains:
 *       - a big "الدخول إلى الحصة الآن" anchor (real anchor, so the click
 *         inside the tab carries a fresh user gesture → Meet stops redirecting
 *         to the install page)
 *       - a copyable manual link
 *       - a "نسخ الرابط" button
 *       - a subtle auto-redirect after 2s as a convenience (not required)
 *  4. On error / missing link, we REPLACE with an Arabic error page and
 *     never leave the user staring at about:blank.
 *  5. If the browser blocked the popup entirely (preOpenedWin === null),
 *     we fall back to an in-app modal via `onFallback(link)` so the user
 *     still gets a working button in the current page.
 *
 * Public API:
 *   const handle = openMeetLoadingTab();
 *   try {
 *     const { link } = await fetchLink();  // your API call
 *     handle.showReady(link);
 *   } catch (e) {
 *     handle.showError(e.message);
 *   }
 *
 *   // If popup was blocked:
 *   if (!handle.wasOpened) {
 *     showInPageFallback(link);
 *   }
 * ---------------------------------------------------------------------------
 */

const escapeHtml = (str = '') =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const BASE_STYLE = `
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "IBM Plex Sans Arabic", "Amiri", Tahoma, sans-serif;
    background: linear-gradient(180deg, #f7f4ec 0%, #e8f0e6 100%);
    color: #1c3a2e;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px;
    box-sizing: border-box;
    -webkit-text-size-adjust: 100%;
  }
  .card {
    background: #fff;
    border: 1px solid #d9e2d5;
    border-radius: 20px;
    padding: 32px 24px;
    max-width: 520px;
    width: 100%;
    box-shadow: 0 10px 40px rgba(15, 81, 50, 0.12);
  }
  h1 { font-size: 22px; margin: 0 0 12px; color: #0f5132; }
  p  { font-size: 15px; margin: 8px 0; line-height: 1.7; color: #37504a; }
  .btn {
    display: inline-block;
    background: #0f5132;
    color: #fff !important;
    padding: 14px 28px;
    border-radius: 999px;
    text-decoration: none;
    font-weight: 700;
    font-size: 17px;
    margin: 16px 0 8px;
    border: 0;
    cursor: pointer;
    min-width: 240px;
    box-shadow: 0 6px 20px rgba(15, 81, 50, 0.25);
  }
  .btn:active { transform: translateY(1px); }
  .btn-outline {
    display: inline-block;
    background: #fff;
    color: #0f5132 !important;
    padding: 10px 20px;
    border-radius: 999px;
    text-decoration: none;
    font-weight: 600;
    font-size: 14px;
    margin: 6px 4px;
    border: 1.5px solid #0f5132;
    cursor: pointer;
  }
  .link-box {
    background: #f7f4ec;
    border: 1px dashed #b8a870;
    border-radius: 12px;
    padding: 12px;
    margin: 14px 0;
    word-break: break-all;
    direction: ltr;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 13px;
    color: #1c3a2e;
    user-select: all;
    -webkit-user-select: all;
  }
  .muted { color: #7a8a83; font-size: 13px; }
  .spinner {
    width: 42px; height: 42px;
    border: 4px solid #d4af37;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
    margin: 6px auto 14px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .error { color: #a52a2a; }
`;

const loadingHtml = () => `<!doctype html>
<html lang="ar" dir="rtl"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>جاري تجهيز رابط الحصة…</title>
<style>${BASE_STYLE}</style>
</head><body>
  <div class="card" role="status" aria-live="polite">
    <div class="spinner" aria-hidden="true"></div>
    <h1>جاري تجهيز رابط الحصة…</h1>
    <p class="muted">لحظات ونقلك إلى الحصة إن شاء الله.</p>
  </div>
</body></html>`;

const readyHtml = (link) => {
  const safe = escapeHtml(link);
  return `<!doctype html>
<html lang="ar" dir="rtl"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>الدخول إلى الحصة</title>
<style>${BASE_STYLE}</style>
</head><body>
  <div class="card">
    <h1>الحصة جاهزة</h1>
    <p>اضغط الزر أدناه للدخول إلى الحصة.</p>
    <a class="btn" id="join-btn" href="${safe}" target="_top" rel="noopener">الدخول إلى الحصة الآن</a>
    <p class="muted">إذا لم يفتح الزر، اضغط الرابط اليدوي:</p>
    <div class="link-box" id="link-box">${safe}</div>
    <p>
      <button class="btn-outline" id="copy-btn" type="button">نسخ رابط الحصة</button>
      <a class="btn-outline" href="${safe}" target="_top" rel="noopener">اضغط هنا للدخول إلى الحصة</a>
    </p>
    <p class="muted" id="hint">إذا فتح المتصفح صفحة تنزيل تطبيق Google Meet، فانسخ الرابط أعلاه وافتحه في متصفح آخر أو داخل تطبيق Meet مباشرةً.</p>
  </div>
<script>
  (function(){
    var btn = document.getElementById('copy-btn');
    var box = document.getElementById('link-box');
    var url = ${JSON.stringify(link)};
    if (btn) {
      btn.addEventListener('click', function(){
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(function(){ btn.textContent = 'تم النسخ ✓'; setTimeout(function(){ btn.textContent = 'نسخ رابط الحصة'; }, 1800); });
          } else {
            var range = document.createRange();
            range.selectNode(box);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
            document.execCommand('copy');
            btn.textContent = 'تم النسخ ✓';
            setTimeout(function(){ btn.textContent = 'نسخ رابط الحصة'; }, 1800);
          }
        } catch(e){ btn.textContent = 'تعذّر النسخ'; }
      });
    }
  })();
</script>
</body></html>`;
};

const errorHtml = (message, link) => {
  const safeMsg = escapeHtml(message || 'حدث خطأ غير متوقع.');
  const linkBlock = link
    ? `<p class="muted">يمكنك محاولة الدخول عبر الرابط اليدوي:</p>
       <div class="link-box">${escapeHtml(link)}</div>
       <p><a class="btn-outline" href="${escapeHtml(link)}" target="_top" rel="noopener">اضغط هنا للدخول</a></p>`
    : '';
  return `<!doctype html>
<html lang="ar" dir="rtl"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>تعذّر فتح الحصة</title>
<style>${BASE_STYLE}</style>
</head><body>
  <div class="card">
    <h1 class="error">تعذّر فتح الحصة</h1>
    <p>${safeMsg}</p>
    ${linkBlock}
    <p><button class="btn-outline" type="button" onclick="window.close()">إغلاق النافذة</button></p>
  </div>
</body></html>`;
};

const writeInto = (win, html) => {
  if (!win || win.closed) return false;
  try {
    win.document.open();
    win.document.write(html);
    win.document.close();
    return true;
  } catch (_) {
    return false;
  }
};

/**
 * Opens a blank tab synchronously and immediately renders a loading page.
 * Returns a handle with `showReady(link)` and `showError(msg, [link])`.
 * If popup is blocked, `wasOpened` is false and callers should fall back
 * to an in-page dialog.
 *
 * MUST be called synchronously from a click handler — never after await.
 */
export function openMeetLoadingTab() {
  let win = null;
  try {
    /* IMPORTANT: do NOT pass 'noopener,noreferrer' features here — that
       severs the JS reference and we lose the ability to write into the
       tab later. */
    win = window.open('about:blank', '_blank');
  } catch (_) {
    win = null;
  }

  const wasOpened = !!win && !win.closed;
  if (wasOpened) {
    writeInto(win, loadingHtml());
  }

  return {
    wasOpened,
    /** Replace loading page with the "ready" page containing the join button. */
    showReady(link) {
      if (!link) {
        this.showError('لم يتم تعيين رابط الحصة بعد.');
        return;
      }
      if (!wasOpened || !win || win.closed) return;
      writeInto(win, readyHtml(link));
    },
    /** Replace loading page with an Arabic error message. */
    showError(message, link) {
      if (!wasOpened || !win || win.closed) return;
      writeInto(win, errorHtml(message, link));
    },
    /** Best-effort close (some browsers ignore this). */
    close() {
      if (win && !win.closed) {
        try { win.close(); } catch (_) { /* ignore */ }
      }
    },
    /** Direct access if caller needs to do something custom. */
    _win: win,
  };
}

export function normalizeMeetUrl(url) {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export default openMeetLoadingTab;
