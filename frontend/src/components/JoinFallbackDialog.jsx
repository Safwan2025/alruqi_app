import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink, Copy, Check as CheckIcon, AlertTriangle } from 'lucide-react';

/**
 * JoinFallbackDialog
 * ---------------------------------------------------------------------------
 * Shown ONLY when we can't rely on the new tab (popup blocked, in-app WebView,
 * or the meet link isn't available yet).
 *
 * On mobile browsers, when window.open() is blocked, this in-page fallback
 * still lets the user reach the meet link with:
 *  - a big anchor button that opens in a new tab (real user gesture)
 *  - a manual, selectable, copyable link
 *  - a copy-to-clipboard button
 *  - a clear Arabic error message when link is missing
 * ---------------------------------------------------------------------------
 */
const JoinFallbackDialog = ({ open, onClose, link, errorMessage }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!link) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        const ta = document.createElement('textarea');
        ta.value = link;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (_) {
      /* ignore */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" data-testid="join-fallback-dialog">
        <DialogHeader>
          <DialogTitle className="font-amiri text-xl flex items-center gap-2">
            {link ? 'الدخول إلى الحصة' : (
              <>
                <AlertTriangle size={20} className="text-amber-600" />
                تعذّر فتح الحصة
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {link ? (
          <div className="space-y-4">
            <p className="font-plex text-sm text-muted-foreground">
              إذا لم تُفتح نافذة الحصة تلقائيًا، استخدم أحد الخيارات التالية:
            </p>

            <a
              data-testid="fallback-join-link"
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full rounded-full bg-primary text-white py-3 font-plex font-bold text-base hover:opacity-90 active:opacity-80 transition"
              onClick={onClose}
            >
              <ExternalLink size={18} />
              الدخول إلى الحصة الآن
            </a>

            <div className="rounded-xl bg-muted/60 border border-dashed border-secondary/60 p-3 text-xs font-mono break-all select-all" dir="ltr" data-testid="fallback-link-text">
              {link}
            </div>

            <div className="flex gap-2 flex-wrap justify-center">
              <Button
                data-testid="fallback-copy-btn"
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="rounded-full"
              >
                {copied ? <><CheckIcon size={14} className="ml-1" /> تم النسخ</> : <><Copy size={14} className="ml-1" /> نسخ رابط الحصة</>}
              </Button>
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-plex hover:bg-muted transition"
                onClick={onClose}
                data-testid="fallback-manual-link"
              >
                <ExternalLink size={14} />
                اضغط هنا للدخول إلى الحصة
              </a>
            </div>

            <p className="font-plex text-[11px] text-muted-foreground text-center">
              إذا فتح المتصفح صفحة تنزيل تطبيق Google Meet، فانسخ الرابط أعلاه وافتحه في متصفح آخر أو داخل تطبيق Meet مباشرةً.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="font-plex text-sm text-red-600" data-testid="fallback-error-msg">
              {errorMessage || 'لم يتم تعيين رابط الحصة بعد. يرجى مراجعة إدارة المقرأة.'}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button data-testid="fallback-close-btn" variant="outline" onClick={onClose} className="rounded-full">
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default JoinFallbackDialog;
