import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Calendar, Video, Plus, Check, Star, BookOpen, FileText, AlertCircle, ClipboardCheck } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/utils/api';

const QUALITY = ['ممتاز', 'متوسط', 'مقبول', 'ضعيف'];

const PeerScheduleSection = ({ user }) => {
  const [partnership, setPartnership] = useState(null);
  const [slots, setSlots] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [slotDialogOpen, setSlotDialogOpen] = useState(false);
  const [evalTarget, setEvalTarget] = useState(null); // peer_session that needs evaluation

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, sl, ss, ev] = await Promise.all([
        api.get('/peers/me/partnership'),
        api.get('/peers/slots'),
        api.get('/peers/sessions'),
        api.get('/peers/evaluations'),
      ]);
      setPartnership(p.data);
      setSlots(sl.data || []);
      setSessions(ss.data || []);
      setEvaluations(ev.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Sessions that need this user's evaluation (used by the in-card buttons).
  // We intentionally do NOT auto-open the eval dialog any more — the previous
  // auto-prompt would re-fire after save because state hadn't reloaded yet,
  // which made the dialog feel "stuck" / unable to close. The user opens it
  // explicitly by clicking the "تقييم قريني" button on the relevant session.
  const pendingEvals = sessions.filter(s => !(s.evaluations_done_by || []).includes(user?.user_id));
  /* eslint-disable-next-line no-unused-vars */
  const _ = pendingEvals; // kept for future use; intentional

  if (loading) {
    return <Card><CardContent className="py-10 text-center"><div className="spinner border-4 border-primary border-t-transparent rounded-full w-8 h-8 mx-auto" /></CardContent></Card>;
  }

  if (!partnership) {
    return (
      <Card><CardContent className="py-8 text-center font-plex text-sm text-muted-foreground">
        لا توجد شراكة نشطة لجدولة مراجعات.
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-t-4 border-secondary" data-testid="peer-schedule-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="font-amiri text-lg sm:text-xl text-primary flex items-center gap-2 justify-end">
              <Calendar size={20} className="text-secondary" /> مواعيد المراجعة مع القرين
            </CardTitle>
            <Button size="sm" onClick={() => setSlotDialogOpen(true)} className="rounded-full" data-testid="add-peer-slot-btn">
              <Plus size={14} className="ml-1" /> إضافة موعد
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {slots.length === 0 && sessions.length === 0 ? (
            <p className="text-center font-plex text-sm text-muted-foreground py-6">لا توجد مواعيد بعد. أضف موعداً مع قرينك.</p>
          ) : (
            <div className="space-y-2" data-testid="peer-slots-list">
              {slots.filter(s => !s.is_booked).map(s => (
                <SlotRow key={s.slot_id} slot={s} mine={s.creator_id === user?.user_id} onBook={async () => {
                  try { await api.post(`/peers/slots/${s.slot_id}/book`); toast.success('تم حجز الموعد'); load(); }
                  catch (e) { toast.error(e.response?.data?.detail || 'فشل الحجز'); }
                }} onCancel={async () => {
                  if (!window.confirm('سيتم إلغاء هذا الموعد. هل أنت متأكد؟')) return;
                  try { await api.delete(`/peers/slots/${s.slot_id}`); toast.success('تم إلغاء الموعد'); load(); }
                  catch (e) { toast.error(e.response?.data?.detail || 'فشل الإلغاء'); }
                }} />
              ))}
              {sessions.map(s => (
                <SessionRow key={s.peer_session_id} session={s} selfId={user?.user_id} onMarkAttended={async () => {
                  try { await api.post(`/peers/sessions/${s.peer_session_id}/attendance`, { attended: true }); toast.success('تم تأكيد الحضور'); load(); }
                  catch (e) { toast.error(e.response?.data?.detail || 'فشل'); }
                }} onEvaluate={() => setEvalTarget(s)} onCancel={async () => {
                  if (!window.confirm('سيتم إلغاء جلسة المراجعة الزوجية. هل أنت متأكد؟')) return;
                  try { await api.delete(`/peers/sessions/${s.peer_session_id}`); toast.success('تم إلغاء الجلسة'); load(); }
                  catch (e) { toast.error(e.response?.data?.detail || 'فشل الإلغاء'); }
                }} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {evaluations.length > 0 && (
        <Card className="border-t-4 border-primary" data-testid="peer-evals-card">
          <CardHeader className="pb-3">
            <CardTitle className="font-amiri text-lg text-primary flex items-center gap-2 justify-end">
              <ClipboardCheck size={18} /> تقييمات المراجعة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2" data-testid="peer-evals-list">
              {evaluations.slice(0, 10).map(e => (
                <div key={e.evaluation_id} className="border rounded-lg p-3 bg-white text-sm font-plex">
                  <div className="flex items-center justify-between flex-wrap gap-1 mb-1">
                    <span className="font-bold text-primary">
                      {e.evaluator_id === user?.user_id ? `أنت قيّمت ${e.evaluatee_name}` : `${e.evaluator_name} قيّمك`}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{new Date(e.created_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mt-1">
                    <span className="bg-gray-50 rounded px-2 py-0.5">المستوى: <strong>{e.quality}</strong></span>
                    {e.surah_name && <span className="bg-gray-50 rounded px-2 py-0.5">السورة: <strong>{e.surah_name}</strong></span>}
                    {(e.from_ayah || e.to_ayah) && <span className="bg-gray-50 rounded px-2 py-0.5">الآيات: {e.from_ayah}-{e.to_ayah}</span>}
                    {e.mistakes_count > 0 && <span className="bg-red-50 text-red-700 rounded px-2 py-0.5">الأخطاء: {e.mistakes_count}</span>}
                  </div>
                  {e.notes && <p className="text-xs text-muted-foreground mt-1">📝 {e.notes}</p>}
                  {e.advice && <p className="text-xs text-amber-700 mt-1">💡 {e.advice}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <CreateSlotDialog open={slotDialogOpen} onClose={() => setSlotDialogOpen(false)} onSaved={() => { setSlotDialogOpen(false); load(); }} />
      <PeerEvalDialog target={evalTarget} onClose={() => setEvalTarget(null)} onSaved={() => { setEvalTarget(null); load(); }} />
    </div>
  );
};

const SlotRow = ({ slot, mine, onBook, onCancel }) => (
  <div className="border-2 rounded-xl p-3 bg-amber-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2" data-testid={`slot-${slot.slot_id}`}>
    <div className="flex items-center gap-2 font-plex text-sm">
      <Calendar size={16} className="text-amber-600" />
      <div>
        <p className="font-bold text-primary">{new Date(slot.scheduled_time).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}</p>
        <p className="text-[11px] text-muted-foreground">أنشأه {slot.creator_name} · {slot.duration} دقيقة</p>
      </div>
    </div>
    <div className="flex items-center gap-2">
      {slot.meet_link && (
        <a href={slot.meet_link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
          <Video size={12} /> الرابط
        </a>
      )}
      {!mine && <Button size="sm" onClick={onBook} className="rounded-full h-8" data-testid={`book-${slot.slot_id}`}>حجز</Button>}
      {mine && <span className="text-xs text-muted-foreground">في انتظار قرينك</span>}
      {mine && (
        <Button size="sm" variant="outline" onClick={onCancel} className="rounded-full h-8 border-red-400 text-red-600 hover:bg-red-50" data-testid={`cancel-slot-${slot.slot_id}`}>
          إلغاء
        </Button>
      )}
    </div>
  </div>
);

const SessionRow = ({ session, selfId, onMarkAttended, onEvaluate, onCancel }) => {
  const start = new Date(session.scheduled_time).getTime();
  const upcoming = start > Date.now();
  const myAttended = (session.attendance || {})[selfId];
  const myEvaluated = (session.evaluations_done_by || []).includes(selfId);
  return (
    <div className="border-2 rounded-xl p-3 bg-green-50/30" data-testid={`peer-session-${session.peer_session_id}`}>
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <p className="font-bold text-primary font-plex text-sm flex items-center gap-1.5">
            <Calendar size={14} /> {new Date(session.scheduled_time).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
          <p className="text-[11px] text-muted-foreground">{session.creator_name} ↔ {session.booker_name} · {session.duration} دقيقة</p>
          {upcoming && <p className="text-[11px] text-amber-700 mt-0.5">قادم · تستطيع تأكيد الحضور وتقييم قرينك بعد انتهاء الجلسة (أو الآن إن كنتما قد راجعتما).</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {session.meet_link && <a href={session.meet_link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1"><Video size={12} /> دخول الحصة</a>}
          {!myAttended && <Button size="sm" variant="outline" onClick={onMarkAttended} className="rounded-full h-8" data-testid={`attend-${session.peer_session_id}`}><Check size={12} className="ml-1" /> حضرت</Button>}
          {myAttended && !myEvaluated && <Button size="sm" onClick={onEvaluate} className="rounded-full h-8 bg-secondary text-secondary-foreground hover:bg-secondary/90" data-testid={`evaluate-${session.peer_session_id}`}><Star size={12} className="ml-1" /> تقييم قريني</Button>}
          {myEvaluated && <span className="text-xs text-green-700 font-bold flex items-center gap-1"><Check size={12} /> تم التقييم</span>}
          {upcoming && (
            <Button size="sm" variant="outline" onClick={onCancel} className="rounded-full h-8 border-red-400 text-red-600 hover:bg-red-50" data-testid={`cancel-session-${session.peer_session_id}`}>
              إلغاء
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

// ----- Create slot dialog -----
const CreateSlotDialog = ({ open, onClose, onSaved }) => {
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('20:00');
  const [duration, setDuration] = useState(30);
  const [meetLink, setMeetLink] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (open) { setDateStr(''); setTimeStr('20:00'); setDuration(30); setMeetLink(''); setNotes(''); } }, [open]);

  const handleSubmit = async () => {
    if (!dateStr) { toast.error('اختر التاريخ'); return; }
    const iso = new Date(`${dateStr}T${timeStr}:00`).toISOString();
    if (new Date(iso).getTime() < Date.now() - 60000) { toast.error('الموعد في الماضي'); return; }
    setSubmitting(true);
    try {
      await api.post('/peers/slots', { scheduled_time: iso, duration: parseInt(duration) || 30, meet_link: meetLink || null, notes: notes || null });
      toast.success('تم إضافة الموعد');
      onSaved?.();
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل'); }
    finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="sm:max-w-md" data-testid="create-slot-dialog">
        <DialogHeader><DialogTitle className="font-amiri text-xl text-primary text-right">إضافة موعد مراجعة</DialogTitle></DialogHeader>
        <DialogDescription className="font-plex text-xs text-muted-foreground text-right">حدّد موعداً جديداً للمراجعة مع قرينك. يمكن إضافة رابط Meet اختياري.</DialogDescription>
        <div className="space-y-3">
          <div><Label className="font-plex text-sm">التاريخ</Label><Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} data-testid="slot-date" /></div>
          <div><Label className="font-plex text-sm">الوقت</Label><Input type="time" value={timeStr} onChange={(e) => setTimeStr(e.target.value)} data-testid="slot-time" /></div>
          <div><Label className="font-plex text-sm">المدّة (دقائق)</Label><Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} min={10} max={120} data-testid="slot-duration" /></div>
          <div><Label className="font-plex text-sm">رابط Google Meet (اختياري)</Label><Input dir="ltr" value={meetLink} onChange={(e) => setMeetLink(e.target.value)} placeholder="https://meet.google.com/..." data-testid="slot-meet" /></div>
          <div><Label className="font-plex text-sm">ملاحظات (اختياري)</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} data-testid="slot-notes" /></div>
        </div>
        <DialogFooter className="gap-2">
          <Button onClick={handleSubmit} disabled={submitting} className="rounded-full" data-testid="save-slot-btn">حفظ</Button>
          <Button variant="outline" onClick={onClose} className="rounded-full">إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ----- Peer evaluation dialog -----
const PeerEvalDialog = ({ target, onClose, onSaved }) => {
  const open = !!target;
  const [surah, setSurah] = useState('');
  const [fromAyah, setFromAyah] = useState('');
  const [toAyah, setToAyah] = useState('');
  const [pageRange, setPageRange] = useState('');
  const [quality, setQuality] = useState('');
  const [mistakes, setMistakes] = useState(0);
  const [notes, setNotes] = useState('');
  const [advice, setAdvice] = useState('');
  const [reco, setReco] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (open) { setSurah(''); setFromAyah(''); setToAyah(''); setPageRange(''); setQuality(''); setMistakes(0); setNotes(''); setAdvice(''); setReco(''); } }, [open]);

  const submit = async () => {
    if (submitting) return;
    if (!quality) { toast.error('اختر مستوى التقييم'); return; }
    if (!target?.peer_session_id) { toast.error('لا يمكن تحديد الجلسة'); onClose?.(); return; }
    setSubmitting(true);
    try {
      await api.post(`/peers/sessions/${target.peer_session_id}/evaluate`, {
        surah_name: surah || null,
        from_ayah: fromAyah ? parseInt(fromAyah) : null,
        to_ayah: toAyah ? parseInt(toAyah) : null,
        page_range: pageRange || null,
        quality,
        mistakes_count: parseInt(mistakes) || 0,
        notes: notes || null,
        advice: advice || null,
        recommendations: reco || null,
      });
      toast.success('تم تسجيل التقييم');
      setSubmitting(false);  // unlock BEFORE invoking parent so the dialog can be reopened safely
      onSaved?.();
    } catch (e) {
      setSubmitting(false);
      toast.error(e?.response?.data?.detail || 'تعذّر حفظ التقييم، حاول مجدداً');
    }
  };

  if (!target) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="peer-eval-dialog">
        <DialogHeader>
          <DialogTitle className="font-amiri text-xl text-primary flex items-center gap-2 justify-end">
            <Star size={18} className="text-secondary" /> تقييم قرينك على المراجعة
          </DialogTitle>
        </DialogHeader>
        <DialogDescription className="font-plex text-xs text-muted-foreground text-right">قيّم أداء قرينك في هذه الجلسة (المستوى مطلوب، باقي الحقول اختيارية).</DialogDescription>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs font-plex text-amber-800 flex items-start gap-2 mb-1">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          يطلب من كل طرف تقييم الآخر بعد لقاء المراجعة.
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="font-plex text-xs">السورة</Label><Input value={surah} onChange={(e) => setSurah(e.target.value)} placeholder="مثلاً البقرة" data-testid="eval-surah" /></div>
            <div><Label className="font-plex text-xs">نطاق الصفحات</Label><Input value={pageRange} onChange={(e) => setPageRange(e.target.value)} placeholder="مثلاً 2-5" data-testid="eval-page-range" /></div>
            <div><Label className="font-plex text-xs">من آية</Label><Input type="number" value={fromAyah} onChange={(e) => setFromAyah(e.target.value)} data-testid="eval-from-ayah" /></div>
            <div><Label className="font-plex text-xs">إلى آية</Label><Input type="number" value={toAyah} onChange={(e) => setToAyah(e.target.value)} data-testid="eval-to-ayah" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="font-plex text-xs">المستوى</Label>
              <Select value={quality} onValueChange={setQuality}>
                <SelectTrigger data-testid="eval-quality"><SelectValue placeholder="اختر..." /></SelectTrigger>
                <SelectContent>{QUALITY.map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="font-plex text-xs">عدد الأخطاء</Label><Input type="number" value={mistakes} onChange={(e) => setMistakes(e.target.value)} min={0} data-testid="eval-mistakes" /></div>
          </div>
          <div><Label className="font-plex text-xs">ملاحظات</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} data-testid="eval-notes" /></div>
          <div><Label className="font-plex text-xs">نصيحة لقرينك</Label><Textarea value={advice} onChange={(e) => setAdvice(e.target.value)} rows={2} data-testid="eval-advice" /></div>
          <div><Label className="font-plex text-xs">توصيات</Label><Textarea value={reco} onChange={(e) => setReco(e.target.value)} rows={2} data-testid="eval-reco" /></div>
        </div>
        <DialogFooter className="gap-2">
          <Button onClick={submit} disabled={submitting} className="rounded-full" data-testid="save-peer-eval-btn">حفظ التقييم</Button>
          <Button variant="outline" onClick={onClose} className="rounded-full">إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PeerScheduleSection;
