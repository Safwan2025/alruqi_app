import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Users, UserCheck, BookOpen, Search, Send, X, Clock, CheckCircle2, Sparkles, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/utils/api';
import PeerScheduleSection from '@/components/PeerScheduleSection';

const BUCKET_LABEL = {
  juz_amma: 'حول جزء عمّ',
  '5_juz': 'حول 5 أجزاء',
  '10_juz': 'حول 10 أجزاء',
  '15_juz': 'حول 15 جزءاً',
  '20_juz': 'حول 20 جزءاً',
  '25_juz': 'حول 25 جزءاً',
  '30_juz': 'حفظ كامل (30 جزءاً)',
  // legacy keys (kept so old data does not crash UI)
  small: 'حفظ مبتدئ',
  medium: 'حفظ متوسط',
  large: 'حفظ متقدّم',
};
const BUCKET_COLOR = {
  juz_amma: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '5_juz': 'bg-teal-50 text-teal-700 border-teal-200',
  '10_juz': 'bg-sky-50 text-sky-700 border-sky-200',
  '15_juz': 'bg-amber-50 text-amber-700 border-amber-200',
  '20_juz': 'bg-orange-50 text-orange-700 border-orange-200',
  '25_juz': 'bg-violet-50 text-violet-700 border-violet-200',
  '30_juz': 'bg-rose-50 text-rose-700 border-rose-200',
  small: 'bg-sky-50 text-sky-700 border-sky-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  large: 'bg-violet-50 text-violet-700 border-violet-200',
};

const PeerReviewSection = ({ user }) => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/student/review-status');
      setStatus(res.data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSetMethod = async (method) => {
    try {
      await api.put('/student/review-method', { method });
      toast.success('تم حفظ طريقة المراجعة');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل الحفظ'); }
  };

  const handleCancelRequest = async () => {
    if (!window.confirm('سيتم إلغاء طلب الشراكة. هل أنت متأكد؟')) return;
    try {
      await api.post('/peers/cancel');
      toast.success('تم إلغاء الطلب');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل الإلغاء'); }
  };

  if (loading) {
    return <Card><CardContent className="py-10 text-center"><div className="spinner border-4 border-primary border-t-transparent rounded-full w-8 h-8 mx-auto" /></CardContent></Card>;
  }

  const method = status?.review_method;
  const partnership = status?.partnership;
  const partner = status?.partner;

  return (
    <div className="space-y-4">
      {/* Method picker */}
      <Card className="border-t-4 border-primary" data-testid="review-method-card">
        <CardHeader className="pb-3">
          <CardTitle className="font-amiri text-lg sm:text-xl text-primary flex items-center gap-2 justify-end">
            <BookOpen size={20} className="text-secondary" /> طريقة المراجعة
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!method ? (
            <div className="space-y-3">
              <p className="font-plex text-sm text-muted-foreground">اختر كيف تريد مراجعة محفوظاتك:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button onClick={() => handleSetMethod('self')} data-testid="pick-self-btn"
                        className="border-2 rounded-xl p-4 hover:border-primary hover:bg-primary/5 transition-all text-right">
                  <UserCheck size={22} className="text-primary mb-1" />
                  <p className="font-amiri text-base font-bold text-primary">مراجعة ذاتية</p>
                  <p className="font-plex text-xs text-muted-foreground mt-1">أراجع محفوظي بمفردي.</p>
                </button>
                <button onClick={() => handleSetMethod('peer')} data-testid="pick-peer-btn"
                        className="border-2 rounded-xl p-4 hover:border-secondary hover:bg-secondary/5 transition-all text-right">
                  <Users size={22} className="text-secondary mb-1" />
                  <p className="font-amiri text-base font-bold text-primary">قرين مراجعة</p>
                  <p className="font-plex text-xs text-muted-foreground mt-1">أراجع مع طالب آخر بإذن المعلم.</p>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                {method === 'self' ? <UserCheck className="text-primary" size={20} /> : <Users className="text-secondary" size={20} />}
                <span className="font-amiri text-base font-bold text-primary" data-testid="current-method-label">
                  {method === 'self' ? 'مراجعة ذاتية' : 'قرين مراجعة'}
                </span>
              </div>
              {!partnership && (
                <Button size="sm" variant="outline" onClick={() => handleSetMethod(method === 'self' ? 'peer' : 'self')} className="rounded-full" data-testid="change-method-btn">
                  تغيير الطريقة
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Peer partnership state */}
      {method === 'peer' && (
        <Card className="border-t-4 border-secondary" data-testid="peer-partner-card">
          <CardHeader className="pb-3">
            <CardTitle className="font-amiri text-lg sm:text-xl text-primary flex items-center gap-2 justify-end">
              <Users size={20} className="text-secondary" /> قرين المراجعة
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!partnership && (
              <div className="space-y-3">
                <p className="font-plex text-sm text-muted-foreground">لم تختر قرين مراجعة بعد. ابحث عن طالب مناسب لمستواك.</p>
                <Button onClick={() => setPickerOpen(true)} className="rounded-full" data-testid="open-peer-picker-btn">
                  <Search size={14} className="ml-1" /> ابحث عن قرين
                </Button>
              </div>
            )}

            {partnership?.status === 'pending' && (
              <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4" data-testid="peer-pending-card">
                <div className="flex items-center gap-2 text-amber-800 font-amiri text-base font-bold mb-1">
                  <Clock size={18} /> طلب قيد الموافقة
                </div>
                <p className="font-plex text-sm text-amber-700">
                  {status.i_am_requester
                    ? <>اخترت <strong>{partner?.name}</strong>. ينتظر الطلب موافقة المعلم/الإدارة.</>
                    : <><strong>{partnership.requester_name}</strong> اختارك قرين مراجعة. ينتظر القرار من المعلم/الإدارة. خلال هذه الفترة لا يمكنك اختيار قرين آخر.</>
                  }
                </p>
                {status.i_am_requester && (
                  <Button size="sm" variant="outline" onClick={handleCancelRequest}
                          className="mt-3 rounded-full border-red-400 text-red-500 hover:bg-red-50" data-testid="cancel-peer-request-btn">
                    <X size={12} className="ml-1" /> إلغاء الطلب
                  </Button>
                )}
              </div>
            )}

            {partnership?.status === 'approved' && partner && (
              <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4" data-testid="peer-approved-card">
                <div className="flex items-center gap-2 text-green-800 font-amiri text-base font-bold mb-1">
                  <CheckCircle2 size={18} /> شراكة نشطة
                </div>
                <p className="font-plex text-sm text-green-800">
                  قرينك للمراجعة الآن: <strong>{partner.name}</strong>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Phase 2: scheduling + evaluations (only when partnership is approved) */}
      {method === 'peer' && partnership?.status === 'approved' && (
        <PeerScheduleSection user={user} />
      )}

      <PeerPickerDialog open={pickerOpen} onClose={() => setPickerOpen(false)} onPicked={() => { setPickerOpen(false); load(); }} />
    </div>
  );
};

// ---------- Peer picker dialog ----------
const PeerPickerDialog = ({ open, onClose, onPicked }) => {
  const [tab, setTab] = useState('recommended');
  const [recs, setRecs] = useState([]);
  const [myLevel, setMyLevel] = useState(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab('recommended'); setSearchQ(''); setSearchResults([]); setConfirmTarget(null); setNote('');
    (async () => {
      try {
        const res = await api.get('/student/peer-recommendations');
        setMyLevel(res.data.my_level);
        setRecs(res.data.recommendations || []);
      } catch { /* ignore */ }
    })();
  }, [open]);

  useEffect(() => {
    if (!open || tab !== 'search') return;
    const q = (searchQ || '').trim();
    if (q.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get(`/student/search?q=${encodeURIComponent(q)}`);
        setSearchResults(res.data || []);
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [searchQ, tab, open]);

  const handleSubmit = async () => {
    if (!confirmTarget) return;
    setSubmitting(true);
    try {
      await api.post('/peers/request', { target_student_id: confirmTarget.user_id, note: note || null });
      toast.success('تم إرسال الطلب. ينتظر موافقة الإدارة.');
      onPicked?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل إرسال الطلب');
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto" data-testid="peer-picker-dialog">
        <DialogHeader>
          <DialogTitle className="font-amiri text-xl text-primary flex items-center gap-2 justify-end">
            <Users size={18} className="text-secondary" /> اختر قرين مراجعة
          </DialogTitle>
        </DialogHeader>

        {!confirmTarget ? (
          <div className="space-y-4">
            {myLevel && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-center font-plex text-xs sm:text-sm">
                <Sparkles size={14} className="inline ml-1 text-secondary" />
                مستوى حفظك الحالي: <strong>{myLevel.bucket_label || BUCKET_LABEL[myLevel.bucket]}</strong>
                {' '}· {myLevel.pages} صفحة (~{myLevel.juz} جزء)
              </div>
            )}
            <div className="flex gap-1.5 border-b">
              {['recommended', 'search'].map(t => (
                <button key={t} onClick={() => setTab(t)}
                        data-testid={`tab-${t}`}
                        className={`px-3 py-1.5 font-plex text-sm border-b-2 transition-colors ${
                          tab === t ? 'border-primary text-primary font-bold' : 'border-transparent text-muted-foreground hover:text-primary'
                        }`}>
                  {t === 'recommended' ? 'مقترحون حسب مستوى الحفظ' : 'بحث بالاسم'}
                </button>
              ))}
            </div>
            {tab === 'recommended' ? (
              <div className="space-y-2 max-h-80 overflow-y-auto" data-testid="recommended-list">
                {recs.length === 0
                  ? <p className="text-center text-muted-foreground font-plex text-xs py-6">لا توجد توصيات متاحة الآن</p>
                  : recs.map(r => (
                      <RecommendedRow key={r.user_id} r={r} onPick={() => setConfirmTarget(r)} />
                    ))
                }
              </div>
            ) : (
              <div className="space-y-2">
                <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
                       placeholder="ابحث باسم الطالب..." data-testid="peer-search-input" className="font-plex" />
                <div className="max-h-72 overflow-y-auto space-y-1.5" data-testid="search-results-list">
                  {searching ? <p className="text-center text-muted-foreground text-xs py-4">يبحث...</p>
                    : searchResults.length === 0
                      ? <p className="text-center text-muted-foreground text-xs py-4">لا نتائج. اكتب على الأقل حرفين.</p>
                      : searchResults.map(s => (
                          <div key={s.user_id} className="flex items-center justify-between border rounded-lg px-3 py-2 bg-white">
                            <div>
                              <p className="font-amiri font-bold text-sm text-primary">{s.name}</p>
                              {!s.is_available && <span className="text-[10px] text-amber-600 font-plex">لديه شراكة قائمة</span>}
                            </div>
                            <Button size="sm" disabled={!s.is_available} onClick={() => setConfirmTarget(s)}
                                    className="rounded-full h-8" data-testid={`pick-${s.user_id}`}>
                              اختيار
                            </Button>
                          </div>
                        ))
                  }
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="font-plex text-xs text-amber-800">
                ستُرسَل طلباً لاختيار <strong>{confirmTarget.name}</strong> قريناً لك. الطلب لن يصبح نشطاً حتى يوافق المعلم/الإدارة. لا يمكنك اختيار قرين آخر حتى يُتَّخذ القرار.
              </p>
            </div>
            <div>
              <Label className="font-plex text-sm">ملاحظة للمعلم (اختياري)</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="سبب الاختيار أو ملاحظات إضافية..." className="font-plex" data-testid="peer-request-note" />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {confirmTarget && (
            <>
              <Button onClick={handleSubmit} disabled={submitting} className="rounded-full" data-testid="submit-peer-request-btn">
                {submitting ? <div className="border-2 border-white border-t-transparent rounded-full w-4 h-4 animate-spin ml-2"></div> : <Send size={14} className="ml-1" />}
                إرسال الطلب
              </Button>
              <Button variant="outline" onClick={() => setConfirmTarget(null)} className="rounded-full">رجوع</Button>
            </>
          )}
          {!confirmTarget && <Button variant="ghost" onClick={onClose} className="rounded-full">إغلاق</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const RecommendedRow = ({ r, onPick }) => (
  <div className="flex items-center justify-between border rounded-lg px-3 py-2 bg-white hover:border-primary/40 transition-colors" data-testid={`rec-row-${r.user_id}`}>
    <div className="min-w-0 flex-1">
      <p className="font-amiri font-bold text-sm text-primary truncate">{r.name}</p>
      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${BUCKET_COLOR[r.bucket] || 'bg-gray-50 text-gray-700 border-gray-200'}`}>{r.bucket_label || BUCKET_LABEL[r.bucket]}</span>
        <span className="text-[10px] text-muted-foreground font-plex">{r.pages} صفحة (~{r.juz} جزء)</span>
      </div>
      {r.reason && (
        <p className="text-[10px] text-emerald-700 font-plex mt-1 flex items-center gap-1">
          <Sparkles size={9} /> {r.reason}
        </p>
      )}
    </div>
    <Button size="sm" onClick={onPick} className="rounded-full h-8 bg-secondary text-secondary-foreground hover:bg-secondary/90" data-testid={`pick-rec-${r.user_id}`}>
      اختيار
    </Button>
  </div>
);

export default PeerReviewSection;
