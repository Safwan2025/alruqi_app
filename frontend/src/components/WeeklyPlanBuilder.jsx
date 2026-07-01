import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Calendar, Plus, Printer, Trash2, Sparkles, Edit, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/utils/api';
import { generateWeeklyPlanPDF } from '@/utils/generateWeeklyPlanPDF';

const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const EMPTY_DAY = (label) => ({
  day: label, kind: 'memorize', surah: '', from_ayah: '', to_ayah: '',
  page_range: '', memorize_target: '', review_target: '', notes: ''
});

const INTENSITY_LABEL = {
  gentle: 'لطيفة (للالتزام المتذبذب)',
  standard: 'قياسية',
  push: 'مكثّفة (لحضور عالٍ)'
};

const WeeklyPlanBuilder = ({ student, onClose }) => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState(null);           // null | 'choose' | 'form'
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestion, setSuggestion] = useState(null); // { summary, ... }
  const [weekStart, setWeekStart] = useState('');
  const [days, setDays] = useState(DAYS.map(d => EMPTY_DAY(d)));
  const [teacherNotes, setTeacherNotes] = useState('');
  const [parentNotes, setParentNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [direction, setDirection] = useState('from_start'); // 'from_start' (الفاتحة → الناس) | 'from_end' (الناس → الفاتحة)

  const load = useCallback(async () => {
    if (!student?.user_id) return;
    setLoading(true);
    try {
      const res = await api.get(`/teacher/students/${student.user_id}/weekly-plans`);
      setPlans(res.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [student?.user_id]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setDays(DAYS.map(d => EMPTY_DAY(d)));
    setWeekStart(''); setTeacherNotes(''); setParentNotes('');
    setSuggestion(null); setMode(null);
  };

  const handleSave = async () => {
    if (!weekStart) { toast.error('اختر بداية الأسبوع'); return; }
    setSaving(true);
    try {
      const cleanDays = days.map(d => ({
        ...d,
        from_ayah: d.from_ayah ? parseInt(d.from_ayah) : null,
        to_ayah: d.to_ayah ? parseInt(d.to_ayah) : null,
      }));
      await api.post('/teacher/weekly-plans', {
        student_id: student.user_id, week_start: weekStart, days: cleanDays,
        teacher_notes: teacherNotes || null, parent_notes: parentNotes || null,
      });
      toast.success('تم حفظ الخطة');
      resetForm();
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (pid) => {
    if (!window.confirm('سيتم حذف الخطة. هل أنت متأكد؟')) return;
    try { await api.delete(`/teacher/weekly-plans/${pid}`); toast.success('تم الحذف'); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'فشل'); }
  };

  const handleSmartSuggest = async () => {
    if (!weekStart) { toast.error('اختر بداية الأسبوع أولاً'); return; }
    if (!direction) { toast.error('اختر اتجاه الحفظ'); return; }
    setSuggestLoading(true);
    try {
      const res = await api.post('/teacher/weekly-plans/suggest', {
        student_id: student.user_id,
        week_start: weekStart,
        direction,
      });
      const data = res.data || {};
      // Map server days into our local format (preserve everything; ensure fields exist)
      const sDays = (data.days || []).map(d => ({
        day: d.day || '',
        kind: d.kind || 'memorize',
        surah: d.surah || '',
        from_ayah: d.from_ayah || '',
        to_ayah: d.to_ayah || '',
        from_page: d.from_page || '',
        to_page: d.to_page || '',
        page_range: d.page_range || '',
        memorize_target: d.memorize_target || '',
        review_target: d.review_target || '',
        notes: d.notes || '',
      }));
      // Pad to 7 days
      while (sDays.length < 7) sDays.push(EMPTY_DAY(DAYS[sDays.length]));
      setDays(sDays);
      setTeacherNotes(data.teacher_notes || '');
      setParentNotes(data.parent_notes || '');
      setSuggestion(data.summary || null);
      setMode('form');
      toast.success('تم اقتراح خطة — يمكنك تعديل أي بند قبل الحفظ');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'تعذّر توليد الاقتراح');
    } finally {
      setSuggestLoading(false);
    }
  };

  const handleManualStart = () => {
    setDays(DAYS.map(d => EMPTY_DAY(d)));
    setTeacherNotes(''); setParentNotes('');
    setSuggestion(null);
    setMode('form');
  };

  // -------- RENDER --------
  return (
    <Dialog open onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="weekly-plan-builder">
        <DialogHeader>
          <DialogTitle className="font-amiri text-xl text-primary flex items-center gap-2 justify-end">
            <Calendar size={20} className="text-secondary" /> الخطط الأسبوعية — {student?.name}
          </DialogTitle>
        </DialogHeader>
        <DialogDescription className="font-plex text-xs text-muted-foreground text-right">
          يمكنك توليد خطة ذكية من النظام (مبنيّة على سجل الحفظ، الالتزام، الحضور، وتقييمات القرين) أو إدخالها يدوياً.
        </DialogDescription>

        {/* ===== Plans list (default view) ===== */}
        {mode === null && (
          <div className="space-y-3">
            <Button onClick={() => setMode('choose')} className="rounded-full" data-testid="new-plan-btn">
              <Plus size={14} className="ml-1" /> خطة أسبوع جديدة
            </Button>
            {loading ? <p className="text-center py-4 text-muted-foreground">جاري التحميل...</p>
              : plans.length === 0 ? <p className="text-center py-6 text-muted-foreground font-plex text-sm">لا توجد خطط محفوظة</p>
              : <div className="space-y-2">
                  {plans.map(p => (
                    <div key={p.plan_id} className="border-2 rounded-xl p-3 flex items-center justify-between flex-wrap gap-2" data-testid={`plan-row-${p.plan_id}`}>
                      <div>
                        <p className="font-amiri text-base font-bold text-primary">أسبوع {p.week_start}</p>
                        <p className="font-plex text-xs text-muted-foreground">من إنشاء {p.teacher_name} · {(p.days || []).length} أيام</p>
                      </div>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => generateWeeklyPlanPDF(p)} className="rounded-full h-8" data-testid={`print-plan-${p.plan_id}`}>
                          <Printer size={12} className="ml-1" /> طباعة
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(p.plan_id)} className="rounded-full h-8 text-red-500"><Trash2 size={12} /></Button>
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>
        )}

        {/* ===== Choose smart-vs-manual ===== */}
        {mode === 'choose' && (
          <div className="space-y-4" data-testid="plan-choose-mode">
            <div>
              <Label className="font-plex text-sm">بداية الأسبوع *</Label>
              <Input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} data-testid="plan-week-start" />
              <p className="font-plex text-[11px] text-muted-foreground mt-1">يفضّل اختيار يوم الأحد. الاقتراح الذكي يحتاج هذا التاريخ.</p>
            </div>
            <div>
              <Label className="font-plex text-sm">اتجاه الحفظ * <span className="text-[10px] text-muted-foreground">(للاقتراح الذكي فقط)</span></Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1" role="radiogroup" aria-label="اتجاه الحفظ">
                <button
                  type="button"
                  role="radio"
                  aria-checked={direction === 'from_start'}
                  onClick={() => setDirection('from_start')}
                  data-testid="dir-from-start"
                  className={`text-right border-2 rounded-xl p-3 transition-all font-plex text-xs ${direction === 'from_start' ? 'bg-emerald-100 border-emerald-500 text-emerald-900' : 'bg-white border-gray-200 hover:border-emerald-300'}`}
                >
                  <div className="font-amiri text-base font-bold mb-0.5">من الفاتحة إلى الناس</div>
                  <div className="opacity-75">حفظ بترتيب المصحف الطبيعي (الأمام)</div>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={direction === 'from_end'}
                  onClick={() => setDirection('from_end')}
                  data-testid="dir-from-end"
                  className={`text-right border-2 rounded-xl p-3 transition-all font-plex text-xs ${direction === 'from_end' ? 'bg-amber-100 border-amber-500 text-amber-900' : 'bg-white border-gray-200 hover:border-amber-300'}`}
                >
                  <div className="font-amiri text-base font-bold mb-0.5">من الناس إلى الفاتحة</div>
                  <div className="opacity-75">حفظ من آخر المصحف صعوداً (الخلف)</div>
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                onClick={handleSmartSuggest}
                disabled={suggestLoading || !weekStart}
                data-testid="smart-suggest-btn"
                className="text-right border-2 rounded-2xl p-4 transition-all bg-gradient-to-bl from-emerald-50 to-amber-50 hover:from-emerald-100 hover:to-amber-100 border-emerald-200 hover:border-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Wand2 size={20} className="text-emerald-700" />
                  <h3 className="font-amiri text-lg font-bold text-emerald-800">اقتراح خطة من النظام</h3>
                </div>
                <p className="font-plex text-xs text-emerald-900/80 leading-relaxed">
                  يحلّل النظام سجل الحفظ والمراجعة، التزام الطالب، نسبة حضوره، وتقييم القرين، ثم يقترح خطة قابلة للتعديل.
                </p>
                {suggestLoading && (
                  <p className="font-plex text-xs text-emerald-700 mt-2 flex items-center gap-1">
                    <span className="inline-block w-3 h-3 border-2 border-emerald-700 border-t-transparent rounded-full animate-spin" /> يحلّل بيانات الطالب...
                  </p>
                )}
              </button>
              <button
                onClick={handleManualStart}
                data-testid="manual-mode-btn"
                className="text-right border-2 rounded-2xl p-4 transition-all bg-gradient-to-bl from-sky-50 to-violet-50 hover:from-sky-100 hover:to-violet-100 border-sky-200 hover:border-sky-400"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Edit size={20} className="text-sky-700" />
                  <h3 className="font-amiri text-lg font-bold text-sky-800">إدخال الخطة يدوياً</h3>
                </div>
                <p className="font-plex text-xs text-sky-900/80 leading-relaxed">
                  ابدأ بجدول أسبوعي فارغ، ثم اكتب كل يوم بنفسك: السورة، الآيات، نوع التمرين، والملاحظات.
                </p>
              </button>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={resetForm} className="rounded-full">رجوع</Button>
            </DialogFooter>
          </div>
        )}

        {/* ===== Plan form (editable) ===== */}
        {mode === 'form' && (
          <div className="space-y-3">
            {suggestion && (
              <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-3 flex items-start gap-2" data-testid="suggestion-summary">
                <Sparkles size={16} className="text-emerald-700 flex-shrink-0 mt-0.5" />
                <div className="text-[11px] font-plex text-emerald-900 leading-relaxed">
                  <p><strong>الاقتراح الذكي (قابل للتعديل بالكامل):</strong></p>
                  <ul className="mt-1 space-y-0.5">
                    <li>• الموقع الحالي للحفظ: <strong>{suggestion.current_position}</strong></li>
                    {suggestion.bucket_label && <li>• مستوى الحفظ التقديري: <strong>{suggestion.bucket_label}</strong> (~{suggestion.estimated_juz} جزء · {suggestion.surah_count} سورة)</li>}
                    <li>• الالتزام الأسبوعي: {suggestion.min_pages_per_week} صفحة / {suggestion.min_sessions_per_week} جلسة</li>
                    <li>• نسبة الحضور الأخيرة: {suggestion.attendance_rate}%</li>
                    <li>• شدة الخطة: <strong>{INTENSITY_LABEL[suggestion.intensity] || suggestion.intensity}</strong> ({suggestion.ayahs_per_memorize_day} آية في كل يوم حفظ)</li>
                    {suggestion.peer_avg && <li>• متوسط تقييم القرين: {suggestion.peer_avg} / 4</li>}
                    {suggestion.review_pool && suggestion.review_pool.length > 0 && (
                      <li>• مراجعة من: {suggestion.review_pool.join('، ')}</li>
                    )}
                  </ul>
                  <p className="mt-1.5 text-emerald-700">ملاحظات المعلم وولي الأمر مُتروكة فارغة — يمكنك إضافتها يدوياً.</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="font-plex text-sm">بداية الأسبوع</Label>
                <Input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} data-testid="plan-week-start" />
              </div>
            </div>

            <div className="border-2 rounded-xl p-2 max-h-[50vh] overflow-y-auto">
              <table className="w-full text-xs font-plex">
                <thead>
                  <tr className="bg-muted">
                    <th className="p-1">اليوم</th><th className="p-1">النوع</th><th className="p-1">السورة</th>
                    <th className="p-1">من</th><th className="p-1">إلى</th><th className="p-1">صفحات</th>
                    <th className="p-1">المراجعة</th><th className="p-1">ملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d, i) => (
                    <tr key={i} className="border-b" data-testid={`plan-day-${i}`}>
                      <td className="p-1 font-bold text-primary">{d.day}</td>
                      <td className="p-1">
                        <select value={d.kind} onChange={(e) => { const c = [...days]; c[i].kind = e.target.value; setDays(c); }} className="border rounded px-1 py-0.5 text-xs">
                          <option value="memorize">حفظ</option>
                          <option value="review">مراجعة</option>
                          <option value="test">تسميع</option>
                        </select>
                      </td>
                      <td className="p-1"><Input value={d.surah} onChange={(e) => { const c=[...days]; c[i].surah=e.target.value; setDays(c); }} className="h-7 text-xs" /></td>
                      <td className="p-1"><Input value={d.from_ayah} onChange={(e) => { const c=[...days]; c[i].from_ayah=e.target.value; setDays(c); }} className="h-7 text-xs w-14" /></td>
                      <td className="p-1"><Input value={d.to_ayah} onChange={(e) => { const c=[...days]; c[i].to_ayah=e.target.value; setDays(c); }} className="h-7 text-xs w-14" /></td>
                      <td className="p-1"><Input value={d.page_range} onChange={(e) => { const c=[...days]; c[i].page_range=e.target.value; setDays(c); }} className="h-7 text-xs w-16" placeholder="2-5" /></td>
                      <td className="p-1"><Input value={d.review_target} onChange={(e) => { const c=[...days]; c[i].review_target=e.target.value; setDays(c); }} className="h-7 text-xs" /></td>
                      <td className="p-1"><Input value={d.notes} onChange={(e) => { const c=[...days]; c[i].notes=e.target.value; setDays(c); }} className="h-7 text-xs" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label className="font-plex text-sm">ملاحظات المعلم</Label><Textarea value={teacherNotes} onChange={(e) => setTeacherNotes(e.target.value)} rows={3} data-testid="plan-teacher-notes" /></div>
              <div><Label className="font-plex text-sm">ملاحظات لولي الأمر</Label><Textarea value={parentNotes} onChange={(e) => setParentNotes(e.target.value)} rows={3} data-testid="plan-parent-notes" /></div>
            </div>

            <DialogFooter className="gap-2">
              <Button onClick={handleSave} disabled={saving} className="rounded-full" data-testid="save-plan-btn">
                {saving ? 'جاري الحفظ...' : 'حفظ الخطة'}
              </Button>
              <Button variant="outline" onClick={resetForm} className="rounded-full">إلغاء</Button>
            </DialogFooter>
          </div>
        )}

        {mode === null && <DialogFooter><Button variant="ghost" onClick={onClose} className="rounded-full">إغلاق</Button></DialogFooter>}
      </DialogContent>
    </Dialog>
  );
};

export default WeeklyPlanBuilder;
