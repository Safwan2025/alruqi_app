import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Users, Copy, Play, X, CheckCircle2, Trophy, Timer, ChevronLeft, Flag } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/utils/api';
import LiveLeaderboard from '@/components/LiveLeaderboard';
import CompetitionReportDialog from '@/components/CompetitionReportDialog';

/**
 * Host (teacher/admin) live dialog covering 4 states:
 *  - waiting:     show join code + participants + Begin/End
 *  - in_progress: show current question, countdown timer, Next / Complete
 *  - completed:   show success summary
 *  - ended:       show terminated message
 */
const LiveWaitingRoomDialog = ({ open, onClose, liveSession, onBegan }) => {
  const [session, setSession] = useState(liveSession);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [reportOpen, setReportOpen] = useState(false);
  const pollRef = useRef(null);
  const tickRef = useRef(null);

  useEffect(() => {
    if (open) setSession(liveSession);
  }, [open, liveSession]);

  const refresh = useCallback(async () => {
    if (!session?.live_id) return;
    try {
      const res = await api.get(`/competitions/live/${session.live_id}`);
      setSession(res.data);
    } catch { /* session may be gone */ }
  }, [session?.live_id]);

  // Poll every 2s while dialog open
  useEffect(() => {
    if (!open) return;
    pollRef.current = setInterval(refresh, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [open, refresh]);

  // Local 1s tick for countdown
  useEffect(() => {
    if (!open) return;
    tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [open]);

  if (!session) return null;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(session.join_code);
      toast.success('تم نسخ الكود');
    } catch { toast.error('تعذّر النسخ'); }
  };

  const handleBegin = async () => {
    setBusy(true);
    try {
      await api.post(`/competitions/live/${session.live_id}/begin`);
      toast.success('بدأت المسابقة');
      onBegan?.();
      await refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل بدء المسابقة');
    } finally { setBusy(false); }
  };

  const handleNext = async () => {
    setBusy(true);
    try {
      await api.post(`/competitions/live/${session.live_id}/next`);
      await refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الانتقال للسؤال التالي');
    } finally { setBusy(false); }
  };

  const handleComplete = async () => {
    if (!window.confirm('سيتم إنهاء المسابقة. هل أنت متأكد؟')) return;
    setBusy(true);
    try {
      await api.post(`/competitions/live/${session.live_id}/complete`);
      toast.success('تمت المسابقة');
      await refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل إنهاء المسابقة');
    } finally { setBusy(false); }
  };

  const handleEnd = async () => {
    if (!window.confirm('سيتم إنهاء الجلسة المباشرة. هل أنت متأكد؟')) return;
    setBusy(true);
    try {
      await api.post(`/competitions/live/${session.live_id}/end`);
      toast.success('تم إنهاء الجلسة');
      onClose?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل إنهاء الجلسة');
    } finally { setBusy(false); }
  };

  const participants = session.participants || [];
  const status = session.status;
  const isWaiting = status === 'waiting';
  const isInProgress = status === 'in_progress';
  const isCompleted = status === 'completed';
  const isEnded = status === 'ended';

  // Color-tagged option styles for the Quran-suitable scholarly palette
  const OPTION_LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
  const OPTION_STYLES = [
    'from-emerald-600 to-emerald-700 border-emerald-800',
    'from-amber-500 to-amber-600 border-amber-700',
    'from-sky-600 to-sky-700 border-sky-800',
    'from-rose-500 to-rose-600 border-rose-700',
    'from-violet-600 to-violet-700 border-violet-800',
    'from-slate-600 to-slate-700 border-slate-800',
  ];

  // Countdown
  const q = session.current_question;
  let remaining = null;
  if (isInProgress && q && session.question_started_at) {
    const start = new Date(session.question_started_at).getTime();
    const elapsed = (now - start) / 1000;
    remaining = Math.max(0, Math.ceil((q.time_limit || 30) - elapsed));
  }
  const currentIndex = (session.current_question_index ?? -1) + 1;
  const totalQ = session.total_questions ?? 0;
  const isLastQuestion = totalQ > 0 && currentIndex >= totalQ;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto" data-testid="live-waiting-room-dialog">
        <DialogHeader>
          <DialogTitle className="font-amiri text-xl text-primary flex items-center gap-2 justify-end">
            <Trophy size={18} className="text-secondary" />
            {isWaiting ? 'غرفة الانتظار: ' : isInProgress ? 'مباشر: ' : ''}
            {session.competition_title}
          </DialogTitle>
        </DialogHeader>

        {/* ---------------- WAITING ---------------- */}
        {isWaiting && (
          <div className="space-y-4">
            <div className="relative bg-gradient-to-l from-primary via-primary to-accent text-white rounded-2xl p-5 sm:p-6 text-center shadow-lg overflow-hidden">
              {/* Decorative dots pattern */}
              <div className="absolute inset-0 opacity-10 pointer-events-none"
                   style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
              <div className="relative">
                <div className="inline-block bg-secondary/20 backdrop-blur-sm border border-secondary/40 text-secondary px-3 py-0.5 rounded-full font-amiri text-xs font-bold mb-3">
                  كود الانضمام
                </div>
                <p className="font-amiri text-5xl sm:text-6xl font-bold tracking-[0.4em] mb-3 drop-shadow-md" dir="ltr" data-testid="live-join-code">
                  {session.join_code}
                </p>
                <Button size="sm" variant="secondary" onClick={copyCode} className="rounded-full shadow-md" data-testid="copy-join-code-btn">
                  <Copy size={12} className="ml-1" /> نسخ الكود
                </Button>
                <p className="font-plex text-xs sm:text-sm opacity-90 mt-3 max-w-sm mx-auto">
                  شارك هذا الكود مع طلابك ليدخلوا إلى المسابقة عبر زر "انضم إلى مسابقة"
                </p>
              </div>
            </div>

            <div className="border-2 rounded-2xl p-3 sm:p-4 max-h-60 overflow-y-auto bg-white">
              <div className="flex items-center justify-between mb-3">
                <p className="font-amiri text-base sm:text-lg font-bold text-primary flex items-center gap-1.5">
                  <Users size={18} /> الطلاب المنضمون
                </p>
                <span className="bg-secondary text-secondary-foreground text-xs sm:text-sm font-bold px-2.5 py-0.5 rounded-full" data-testid="participants-count">
                  {participants.length}
                </span>
              </div>
              {participants.length === 0 ? (
                <div className="text-center py-6">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 border-2 border-amber-200 mb-2">
                    <Users size={20} className="text-amber-500 animate-pulse" />
                  </div>
                  <p className="font-plex text-xs text-muted-foreground">في انتظار انضمام الطلاب...</p>
                </div>
              ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5" data-testid="participants-list">
                  {participants.map((p) => (
                    <li
                      key={p.user_id}
                      className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 font-plex text-sm text-green-800"
                      data-testid={`participant-${p.user_id}`}
                    >
                      <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" />
                      <span className="truncate">{p.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* ---------------- IN PROGRESS ---------------- */}
        {isInProgress && q && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="font-plex text-sm bg-primary/10 text-primary rounded-full px-3 py-1 font-bold">
                السؤال <span className="font-amiri text-base">{currentIndex}</span> من <span className="font-amiri text-base">{totalQ}</span>
              </div>
              <div className={`flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full border-4 font-amiri text-2xl sm:text-3xl font-bold tabular-nums transition-all ${
                remaining !== null && remaining <= 5
                  ? 'bg-red-50 border-red-500 text-red-600 animate-pulse shadow-lg shadow-red-200'
                  : 'bg-secondary/10 border-secondary text-primary'
              }`} data-testid="host-countdown">
                <div className="flex flex-col items-center leading-none">
                  <span>{remaining ?? '—'}</span>
                  <span className="text-[10px] font-plex opacity-70 mt-0.5">ثانية</span>
                </div>
              </div>
            </div>
            <div className="relative bg-gradient-to-l from-primary via-primary to-accent text-white rounded-2xl p-5 sm:p-6 shadow-lg border-2 border-secondary/20">
              <div className="absolute top-0 right-1/2 translate-x-1/2 -translate-y-1/2 bg-secondary text-secondary-foreground font-amiri text-xs font-bold px-3 py-0.5 rounded-full">سؤال</div>
              <p className="font-amiri text-xl sm:text-2xl leading-relaxed text-center pt-1" data-testid="host-question-text">
                {q.question_text}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {q.options?.map((opt, i) => {
                const isCorrect = i === q.correct_index;
                const colorIdx = i % OPTION_STYLES.length;
                return (
                  <div
                    key={i}
                    className={`relative rounded-xl border-2 font-plex p-3 sm:p-4 flex items-center gap-3 transition-all ${
                      isCorrect
                        ? `bg-gradient-to-l ${OPTION_STYLES[colorIdx]} text-white shadow-md`
                        : 'bg-white border-gray-200 text-gray-500 opacity-60'
                    }`}
                    data-testid={`host-option-${i}`}
                  >
                    <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 font-amiri font-bold text-lg ${
                      isCorrect ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {OPTION_LETTERS[i] || (i + 1)}
                    </div>
                    <span className={`flex-1 text-sm sm:text-base font-bold ${isCorrect ? '' : 'line-through decoration-1 opacity-70'}`}>{opt}</span>
                    {isCorrect && <CheckCircle2 size={18} className="text-white flex-shrink-0" />}
                  </div>
                );
              })}
            </div>
            <div className="text-xs text-muted-foreground font-plex text-center bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5 inline-flex items-center justify-center gap-1.5 mx-auto w-fit">
              <Users size={12} className="text-amber-600" />
              <span className="font-bold">{participants.length}</span> طالب في الجلسة
            </div>
            <LiveLeaderboard liveId={session.live_id} variant="compact" pollIntervalMs={3000} visible={open} />
          </div>
        )}

        {/* ---------------- COMPLETED ---------------- */}
        {isCompleted && (
          <div className="space-y-4">
            <div className="relative bg-gradient-to-l from-emerald-700 via-green-700 to-emerald-600 text-white rounded-2xl p-5 sm:p-7 text-center shadow-lg overflow-hidden">
              <div className="absolute inset-0 opacity-10 pointer-events-none"
                   style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
              <div className="relative">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-secondary text-secondary-foreground border-4 border-white/30 shadow-xl mb-2">
                  <Trophy size={32} />
                </div>
                <p className="font-amiri text-2xl sm:text-3xl font-bold drop-shadow">تمَّت المسابقة بنجاح</p>
                <p className="font-plex text-xs sm:text-sm opacity-90 mt-1">
                  {totalQ} أسئلة • {participants.length} طالب
                </p>
              </div>
            </div>
            <LiveLeaderboard liveId={session.live_id} variant="full" pollIntervalMs={5000} visible={open} title="النتائج النهائية" />
          </div>
        )}

        {/* ---------------- ENDED ---------------- */}
        {isEnded && (
          <div className="bg-gray-100 border border-gray-200 rounded-lg p-4 text-center font-plex text-sm text-gray-700">
            هذه الجلسة منتهية.
          </div>
        )}

        <DialogFooter className="gap-2 flex-wrap">
          {isWaiting && (
            <>
              <Button
                onClick={handleBegin}
                disabled={busy || participants.length === 0}
                className="rounded-full bg-green-600 hover:bg-green-700"
                data-testid="begin-live-btn"
              >
                <Play size={14} className="ml-1" /> بدء المسابقة
              </Button>
              <Button
                variant="outline" onClick={handleEnd} disabled={busy}
                className="rounded-full border-red-500 text-red-500 hover:bg-red-50"
                data-testid="end-live-btn"
              >
                <X size={14} className="ml-1" /> إنهاء الجلسة
              </Button>
            </>
          )}
          {isInProgress && !isLastQuestion && (
            <Button
              onClick={handleNext} disabled={busy}
              className="rounded-full bg-primary hover:bg-primary/90"
              data-testid="next-question-btn"
            >
              <ChevronLeft size={14} className="ml-1" /> السؤال التالي
            </Button>
          )}
          {isInProgress && isLastQuestion && (
            <Button
              onClick={handleComplete} disabled={busy}
              className="rounded-full bg-green-600 hover:bg-green-700"
              data-testid="complete-live-btn"
            >
              <Flag size={14} className="ml-1" /> إنهاء المسابقة
            </Button>
          )}
          {isInProgress && !isLastQuestion && (
            <Button
              variant="outline" onClick={handleComplete} disabled={busy}
              className="rounded-full border-amber-500 text-amber-600 hover:bg-amber-50"
              data-testid="end-early-btn"
              title="إنهاء المسابقة مبكراً"
            >
              <Flag size={14} className="ml-1" /> إنهاء مبكر
            </Button>
          )}
          {isCompleted && (
            <Button
              onClick={() => setReportOpen(true)}
              className="rounded-full bg-primary hover:bg-primary/90"
              data-testid="view-report-btn"
            >
              <Flag size={14} className="ml-1" /> عرض التقرير المفصّل
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} className="rounded-full">إغلاق</Button>
        </DialogFooter>
      </DialogContent>
      <CompetitionReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        liveId={session.live_id}
      />
    </Dialog>
  );
};

export default LiveWaitingRoomDialog;
