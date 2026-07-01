import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Trophy, Users, LogIn, CheckCircle2, X, Hourglass, Timer } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/utils/api';
import LiveLeaderboard from '@/components/LiveLeaderboard';

/**
 * Student dialog to join a live competition and play through it.
 * States: enter-code → waiting → in_progress (questions) → completed/ended
 */
const JoinCompetitionDialog = ({ open, onClose, selfUserId }) => {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [session, setSession] = useState(null);
  const [selected, setSelected] = useState(null);     // index user is about to/has submitted
  const [submittingAns, setSubmittingAns] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const pollRef = useRef(null);
  const tickRef = useRef(null);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setCode(''); setSession(null); setSelected(null);
      setSubmitting(false); setSubmittingAns(false);
    }
  }, [open]);

  const handleJoin = async (e) => {
    e?.preventDefault?.();
    const clean = (code || '').trim();
    if (!/^\d{6}$/.test(clean)) { toast.error('الكود يجب أن يكون 6 أرقام'); return; }
    setSubmitting(true);
    try {
      const res = await api.post('/competitions/live/join', { join_code: clean });
      setSession(res.data);
      toast.success('تم انضمامك إلى غرفة الانتظار');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'تعذّر الانضمام');
    } finally { setSubmitting(false); }
  };

  const refresh = useCallback(async () => {
    if (!session?.live_id) return;
    try {
      const res = await api.get(`/competitions/live/${session.live_id}`);
      setSession(prev => {
        // Reset selected/submitting when question changes
        if (prev?.current_question?.question_id !== res.data?.current_question?.question_id) {
          setSelected(null);
        }
        return res.data;
      });
    } catch { /* ignore */ }
  }, [session?.live_id]);

  // Sync `selected` from server-stored answer
  useEffect(() => {
    if (session?.my_answer && session.my_answer.selected_index !== undefined) {
      setSelected(session.my_answer.selected_index);
    }
  }, [session?.my_answer?.selected_index, session?.current_question?.question_id]);

  // Polling: 2s in progress, 3s otherwise
  useEffect(() => {
    if (!open || !session?.live_id) return;
    const interval = session?.status === 'in_progress' ? 2000 : 3000;
    pollRef.current = setInterval(refresh, interval);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [open, session?.live_id, session?.status, refresh]);

  // 1s tick for countdown
  useEffect(() => {
    if (!open) return;
    tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [open]);

  const handleLeave = async () => {
    if (!session?.live_id) { onClose?.(); return; }
    // Only call leave during waiting; mid-competition the answer record stays.
    if (session.status === 'waiting') {
      try { await api.post(`/competitions/live/${session.live_id}/leave`); } catch { /* ignore */ }
    }
    setSession(null); setCode(''); setSelected(null);
    onClose?.();
  };

  const handleSubmitAnswer = async (idx) => {
    if (!session?.current_question?.question_id) return;
    setSubmittingAns(true);
    setSelected(idx);
    try {
      await api.post(`/competitions/live/${session.live_id}/answer`, {
        question_id: session.current_question.question_id,
        selected_index: idx,
      });
      toast.success('تم تسجيل إجابتك');
      await refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل إرسال الإجابة');
      setSelected(null);
    } finally { setSubmittingAns(false); }
  };

  // -------- Enter code view --------
  if (!session) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
        <DialogContent className="sm:max-w-md" data-testid="join-competition-dialog">
          <DialogHeader>
            <DialogTitle className="font-amiri text-xl text-primary flex items-center gap-2 justify-end">
              <LogIn size={18} /> انضم إلى مسابقة
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <Label className="font-plex mb-2 block text-sm">أدخل كود المسابقة المكوّن من 6 أرقام</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoFocus
                placeholder="123456"
                dir="ltr"
                maxLength={6}
                className="font-amiri text-3xl text-center tracking-[0.4em] h-16"
                data-testid="join-code-input"
              />
              <p className="font-plex text-xs text-muted-foreground mt-2 text-center">
                اطلب الكود من معلمك عند بدء الجلسة المباشرة
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button type="submit" disabled={submitting || code.length !== 6} className="rounded-full" data-testid="submit-join-btn">
                {submitting ? <div className="border-2 border-white border-t-transparent rounded-full w-4 h-4 animate-spin ml-2"></div> : <LogIn size={14} className="ml-1" />}
                انضمام
              </Button>
              <Button type="button" variant="outline" onClick={onClose} className="rounded-full">إلغاء</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  // -------- Live states --------
  const status = session.status;
  const isWaiting = status === 'waiting';
  const isInProgress = status === 'in_progress';
  const isCompleted = status === 'completed';
  const isEnded = status === 'ended';
  const q = session.current_question;
  const totalQ = session.total_questions ?? 0;
  const currentIndex = (session.current_question_index ?? -1) + 1;
  const myAnswer = session.my_answer;
  const hasAnswered = !!myAnswer || selected !== null;

  // Color-tagged options (same palette as host view)
  const OPTION_LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
  const OPTION_STYLES = [
    'from-emerald-600 to-emerald-700 border-emerald-800',
    'from-amber-500 to-amber-600 border-amber-700',
    'from-sky-600 to-sky-700 border-sky-800',
    'from-rose-500 to-rose-600 border-rose-700',
    'from-violet-600 to-violet-700 border-violet-800',
    'from-slate-600 to-slate-700 border-slate-800',
  ];

  let remaining = null;
  if (isInProgress && q && session.question_started_at) {
    const start = new Date(session.question_started_at).getTime();
    const elapsed = (now - start) / 1000;
    remaining = Math.max(0, Math.ceil((q.time_limit || 30) - elapsed));
  }
  const timeUp = remaining !== null && remaining <= 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleLeave()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="student-waiting-room">
        <DialogHeader>
          <DialogTitle className="font-amiri text-xl text-primary flex items-center gap-2 justify-end">
            <Trophy size={18} className="text-secondary" />
            {session.competition_title}
          </DialogTitle>
        </DialogHeader>

        {/* WAITING */}
        {isWaiting && (
          <div className="space-y-4">
            <div className="relative bg-gradient-to-l from-amber-100 via-amber-50 to-amber-100 border-2 border-amber-300 rounded-2xl p-5 text-center overflow-hidden">
              <div className="absolute inset-0 opacity-20 pointer-events-none"
                   style={{ backgroundImage: 'radial-gradient(circle, #d97706 1px, transparent 1px)', backgroundSize: '14px 14px' }} />
              <div className="relative">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-500 text-white shadow-lg mb-2 animate-pulse">
                  <Hourglass size={26} />
                </div>
                <p className="font-amiri text-lg sm:text-xl font-bold text-amber-900">في انتظار بدء المعلم...</p>
                <p className="font-plex text-xs sm:text-sm text-amber-700 mt-1">المعلم: <span className="font-bold">{session.host_name}</span></p>
              </div>
            </div>
            <div className="border-2 rounded-2xl p-3 max-h-44 overflow-y-auto bg-white">
              <div className="flex items-center justify-between mb-2">
                <p className="font-amiri text-sm font-bold text-primary flex items-center gap-1.5">
                  <Users size={14} /> الطلاب في الغرفة
                </p>
                <span className="bg-secondary text-secondary-foreground text-xs font-bold px-2.5 py-0.5 rounded-full" data-testid="student-participants-count">
                  {(session.participants || []).length}
                </span>
              </div>
              {(session.participants || []).length === 0 ? (
                <p className="text-center text-muted-foreground py-3 font-plex text-xs">لا يوجد طلاب بعد</p>
              ) : (
                <ul className="grid grid-cols-1 gap-1.5">
                  {session.participants.map((p) => (
                    <li key={p.user_id} className={`font-plex text-sm rounded-lg px-2.5 py-1.5 flex items-center gap-2 ${
                      selfUserId && p.user_id === selfUserId ? 'bg-primary/10 border border-primary/30 text-primary font-bold' : 'bg-gray-50 border border-gray-100'
                    }`}>
                      <CheckCircle2 size={12} className="text-green-600 flex-shrink-0" /> {p.name}
                      {selfUserId && p.user_id === selfUserId && <span className="text-[10px] bg-primary text-white px-1.5 py-0.5 rounded-full mr-auto">أنت</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* IN PROGRESS - QUESTION */}
        {isInProgress && q && (
          <div className="space-y-4" data-testid="student-question-view">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="font-plex text-sm bg-primary/10 text-primary rounded-full px-3 py-1 font-bold">
                السؤال <span className="font-amiri text-base">{currentIndex}</span> من <span className="font-amiri text-base">{totalQ}</span>
              </div>
              <div className={`flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full border-4 font-amiri text-xl sm:text-2xl font-bold tabular-nums transition-all ${
                remaining !== null && remaining <= 5
                  ? 'bg-red-50 border-red-500 text-red-600 animate-pulse shadow-lg shadow-red-200'
                  : 'bg-secondary/10 border-secondary text-primary'
              }`} data-testid="student-countdown">
                <div className="flex flex-col items-center leading-none">
                  <span>{remaining ?? '—'}</span>
                  <span className="text-[9px] font-plex opacity-70 mt-0.5">ثانية</span>
                </div>
              </div>
            </div>
            <div className="relative bg-gradient-to-l from-primary via-primary to-accent text-white rounded-2xl p-5 shadow-lg border-2 border-secondary/20">
              <div className="absolute top-0 right-1/2 translate-x-1/2 -translate-y-1/2 bg-secondary text-secondary-foreground font-amiri text-xs font-bold px-3 py-0.5 rounded-full">سؤال</div>
              <p className="font-amiri text-xl sm:text-2xl leading-relaxed text-center pt-1" data-testid="student-question-text">{q.question_text}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(q.options || []).map((opt, i) => {
                const isSelected = selected === i || myAnswer?.selected_index === i;
                const disabled = hasAnswered || timeUp || submittingAns;
                const colorIdx = i % OPTION_STYLES.length;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={disabled}
                    onClick={() => !disabled && handleSubmitAnswer(i)}
                    className={`relative rounded-xl border-2 font-plex p-3 sm:p-4 flex items-center gap-3 text-right transition-all ${
                      isSelected
                        ? `bg-gradient-to-l ${OPTION_STYLES[colorIdx]} text-white shadow-lg scale-[1.02]`
                        : disabled
                          ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed opacity-60'
                          : 'bg-white border-gray-300 text-gray-800 hover:border-primary hover:bg-primary/5 hover:shadow active:scale-95 cursor-pointer'
                    }`}
                    data-testid={`student-option-${i}`}
                  >
                    <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 font-amiri font-bold text-lg ${
                      isSelected ? 'bg-white/25 text-white' : `bg-gradient-to-br ${OPTION_STYLES[colorIdx]} text-white`
                    }`}>
                      {OPTION_LETTERS[i] || (i + 1)}
                    </div>
                    <span className="flex-1 text-sm sm:text-base font-bold">{opt}</span>
                    {isSelected && <CheckCircle2 size={18} className="text-white flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
            {hasAnswered && (
              <div className={`rounded-xl p-3 sm:p-4 text-center font-plex ${
                myAnswer?.is_correct ? 'bg-green-50 border-2 border-green-300' : 'bg-rose-50 border-2 border-rose-300'
              }`} data-testid="answer-submitted-msg">
                <div className={`flex items-center justify-center gap-2 text-sm font-bold ${
                  myAnswer?.is_correct ? 'text-green-700' : 'text-rose-700'
                }`}>
                  {myAnswer?.is_correct ? <CheckCircle2 size={18} /> : <X size={18} />}
                  {myAnswer?.is_correct ? 'إجابة صحيحة!' : 'إجابة خاطئة'}
                </div>
                {myAnswer?.points_earned !== undefined && (
                  <div className="mt-1.5 font-amiri text-2xl font-bold" data-testid="my-points-earned">
                    <span className={myAnswer?.is_correct ? 'text-green-800' : 'text-rose-800'}>
                      + {myAnswer.points_earned || 0}
                    </span>
                    <span className="text-sm font-plex opacity-70 mr-1">نقطة</span>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground mt-1">في انتظار السؤال التالي...</p>
              </div>
            )}
            {!hasAnswered && timeUp && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-3 text-center font-plex text-xs text-amber-700" data-testid="time-up-msg">
                <Timer size={16} className="inline ml-1" /> انتهى الوقت. في انتظار السؤال التالي...
              </div>
            )}
            {(hasAnswered || timeUp) && (
              <LiveLeaderboard liveId={session.live_id} selfUserId={selfUserId} variant="compact" pollIntervalMs={3000} visible={open} />
            )}
          </div>
        )}

        {/* COMPLETED */}
        {isCompleted && (
          <div className="space-y-4">
            <div className="relative bg-gradient-to-l from-emerald-700 via-green-700 to-emerald-600 text-white rounded-2xl p-5 sm:p-6 text-center shadow-lg overflow-hidden">
              <div className="absolute inset-0 opacity-10 pointer-events-none"
                   style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
              <div className="relative">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-secondary text-secondary-foreground border-4 border-white/30 shadow-xl mb-2">
                  <Trophy size={26} />
                </div>
                <p className="font-amiri text-xl sm:text-2xl font-bold drop-shadow">تمَّت المسابقة!</p>
                <p className="font-plex text-xs sm:text-sm opacity-90 mt-1">جزاكَ الله خيراً على مشاركتك</p>
              </div>
            </div>
            <LiveLeaderboard liveId={session.live_id} selfUserId={selfUserId} variant="full" pollIntervalMs={5000} visible={open} title="النتائج النهائية" />
          </div>
        )}

        {/* ENDED early */}
        {isEnded && (
          <div className="bg-gray-100 border-2 border-gray-200 rounded-xl p-5 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-300 text-gray-600 mb-2">
              <X size={24} />
            </div>
            <p className="font-amiri text-lg font-bold text-gray-700">انتهت الجلسة</p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline" onClick={handleLeave}
            className="rounded-full border-red-500 text-red-500 hover:bg-red-50"
            data-testid="leave-waiting-room-btn"
          >
            {isCompleted || isEnded ? 'إغلاق' : isWaiting ? 'مغادرة الغرفة' : 'خروج'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default JoinCompetitionDialog;
