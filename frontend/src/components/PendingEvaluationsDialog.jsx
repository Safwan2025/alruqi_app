import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw, ClipboardCheck, Clock, Bell } from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';

const SNOOZE_KEY = 'pendingEvalsSnoozeUntil';            // localStorage: ISO timestamp until popup is hidden
const SESSION_DISMISS_KEY = 'pendingEvalsDismissedThisSession';  // sessionStorage: '1' means "remind next login"

/**
 * Forced pending-evaluations popup.
 * Lists sessions where the teacher confirmed attendance but no rating/notes yet.
 *
 * Props:
 *   onStartEvaluation(sessionPayload): opens a unified evaluation dialog (rating + recitation/memorization)
 */
const PendingEvaluationsDialog = ({ onStartEvaluation, refreshKey = 0 }) => {
  const [pending, setPending] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const isSnoozed = useCallback(() => {
    // Skip when the user clicked "Remind on next login" earlier in this browser session
    try {
      if (sessionStorage.getItem(SESSION_DISMISS_KEY) === '1') return true;
    } catch { /* ignore */ }
    // Skip when localStorage snooze hasn't expired yet
    try {
      const until = localStorage.getItem(SNOOZE_KEY);
      if (until && new Date(until).getTime() > Date.now()) return true;
    } catch { /* ignore */ }
    return false;
  }, []);

  const load = useCallback(async (forceShow = false) => {
    setLoading(true);
    try {
      const res = await api.get('/teacher/pending-evaluations');
      const list = res.data || [];
      setPending(list);
      if (list.length === 0) {
        setOpen(false);
        // Clear any stale snooze when there's nothing pending
        try {
          localStorage.removeItem(SNOOZE_KEY);
          sessionStorage.removeItem(SESSION_DISMISS_KEY);
        } catch { /* ignore */ }
      } else {
        // Show only if not snoozed (or explicitly forced)
        setOpen(forceShow || !isSnoozed());
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [isSnoozed]);

  useEffect(() => {
    load();
    // Poll every 5 minutes
    const id = setInterval(() => load(), 5 * 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refreshKey]);

  const handleRemindNextLogin = () => {
    try { sessionStorage.setItem(SESSION_DISMISS_KEY, '1'); } catch { /* ignore */ }
    setOpen(false);
    toast.message('سيتم تذكيرك عند الدخول مرة أخرى');
  };

  const handleRemind24h = () => {
    const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    try { localStorage.setItem(SNOOZE_KEY, until); } catch { /* ignore */ }
    setOpen(false);
    toast.message('سيتم تذكيرك بعد 24 ساعة');
  };

  if (!pending.length || !open) return null;

  return (
    <Dialog open={open} onOpenChange={() => { /* must take an explicit action */ }}>
      <DialogContent
        className="sm:max-w-lg [&>button.absolute]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        data-testid="pending-evaluations-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-amiri text-2xl text-amber-700 flex items-center gap-2 justify-end">
            <AlertCircle size={22} />
            تقييمات معلّقة بانتظارك
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="font-plex text-sm text-amber-800 leading-relaxed">
              لديك <strong>{pending.length}</strong> حصة حضرها الطالب ولم تضف لها تقييماً وتسميعاً بعد.
              اضغط على "بدء التقييم" لتعبئة <strong>التقييم + سجل التسميع (السورة، من آية، إلى آية)</strong> دفعةً واحدة.
            </p>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto" data-testid="pending-list">
            {pending.map((s) => (
              <div
                key={s.session_id}
                className="flex items-center justify-between gap-2 p-3 bg-white border rounded-lg hover:border-amber-300 transition-colors"
                data-testid={`pending-${s.session_id}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-plex font-bold text-sm text-gray-800 truncate">{s.student_name}</p>
                  <p className="font-plex text-xs text-gray-400">
                    {new Date(s.scheduled_time).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => onStartEvaluation?.({
                    session_id: s.session_id,
                    student_id: s.student_id,
                    student_name: s.student_name,
                    scheduled_time: s.scheduled_time
                  })}
                  className="rounded-full bg-amber-600 hover:bg-amber-700 h-8 px-3 flex-shrink-0"
                  data-testid={`pending-start-${s.session_id}`}
                >
                  <ClipboardCheck size={14} className="ml-1" />
                  بدء التقييم
                </Button>
              </div>
            ))}
          </div>

          <div className="border-t pt-3 mt-1">
            <p className="font-plex text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
              <Bell size={12} /> لا أستطيع الآن:
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={handleRemindNextLogin}
                variant="outline"
                size="sm"
                className="rounded-full text-xs h-9"
                data-testid="remind-next-login-btn"
              >
                <Bell size={12} className="ml-1" />
                ذكّرني عند الدخول التالي
              </Button>
              <Button
                onClick={handleRemind24h}
                variant="outline"
                size="sm"
                className="rounded-full text-xs h-9"
                data-testid="remind-24h-btn"
              >
                <Clock size={12} className="ml-1" />
                ذكّرني بعد 24 ساعة
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            onClick={() => load(true)}
            variant="ghost"
            size="sm"
            className="rounded-full"
            disabled={loading}
            data-testid="refresh-pending-btn"
          >
            <RefreshCw size={14} className={`ml-1 ${loading ? 'animate-spin' : ''}`} />
            تحديث القائمة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PendingEvaluationsDialog;
