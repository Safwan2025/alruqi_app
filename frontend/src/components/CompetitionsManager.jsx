import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Trophy, Plus, Edit2, Trash2, Eye, ChevronRight, CheckCircle2, Sparkles, Timer, Award, Play } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/utils/api';
import LiveWaitingRoomDialog from '@/components/LiveWaitingRoomDialog';

const STATUS_LABELS = { draft: 'مسودة', published: 'منشورة' };
const STATUS_COLORS = { draft: 'bg-gray-200 text-gray-700', published: 'bg-green-500 text-white' };

const QuestionDialog = ({ open, onClose, onSaved, competitionId, initial }) => {
  const [q, setQ] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [timeLimit, setTimeLimit] = useState(30);
  const [points, setPoints] = useState(100);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (initial) {
        setQ(initial.question_text || '');
        const opts = initial.options || ['', '', '', ''];
        setOptions([...opts, '', '', '', ''].slice(0, Math.max(4, opts.length)));
        setCorrectIndex(initial.correct_index || 0);
        setTimeLimit(initial.time_limit || 30);
        setPoints(initial.points || 100);
      } else {
        setQ(''); setOptions(['', '', '', '']); setCorrectIndex(0);
        setTimeLimit(30); setPoints(100);
      }
    }
  }, [open, initial]);

  const handleSave = async () => {
    const cleanOptions = options.map(o => o.trim()).filter(Boolean);
    if (!q.trim()) { toast.error('نص السؤال مطلوب'); return; }
    if (cleanOptions.length < 2) { toast.error('أضف خيارين على الأقل'); return; }
    if (correctIndex >= cleanOptions.length) { toast.error('يجب اختيار إجابة صحيحة'); return; }
    setSaving(true);
    try {
      const payload = {
        question_text: q.trim(),
        options: cleanOptions,
        correct_index: correctIndex,
        time_limit: Number(timeLimit),
        points: Number(points)
      };
      if (initial) {
        await api.put(`/competitions/${competitionId}/questions/${initial.question_id}`, payload);
        toast.success('تم تحديث السؤال');
      } else {
        await api.post(`/competitions/${competitionId}/questions`, payload);
        toast.success('تمت إضافة السؤال');
      }
      onSaved?.();
      onClose?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="sm:max-w-xl" data-testid="question-dialog">
        <DialogHeader>
          <DialogTitle className="font-amiri text-xl text-primary justify-end flex items-center gap-2">
            <Sparkles size={18} />
            {initial ? 'تعديل السؤال' : 'إضافة سؤال جديد'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="font-plex mb-1.5 block">نص السؤال</Label>
            <Textarea
              value={q}
              onChange={(e) => setQ(e.target.value)}
              rows={2}
              placeholder="مثلاً: من هو أول من جمع القرآن في مصحف واحد؟"
              className="font-plex"
              data-testid="question-text"
            />
          </div>
          <div>
            <Label className="font-plex mb-1.5 block">الخيارات (اضغط على الإجابة الصحيحة)</Label>
            <div className="space-y-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCorrectIndex(idx)}
                    data-testid={`option-correct-${idx}`}
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                      correctIndex === idx
                        ? 'bg-green-500 text-white shadow-md ring-2 ring-green-200'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    }`}
                    title="اضغط لتحديد كإجابة صحيحة"
                  >
                    {correctIndex === idx ? <CheckCircle2 size={16} /> : <span className="text-xs font-bold">{idx + 1}</span>}
                  </button>
                  <Input
                    value={opt}
                    onChange={(e) => {
                      const copy = [...options]; copy[idx] = e.target.value; setOptions(copy);
                    }}
                    placeholder={`الخيار ${idx + 1}`}
                    className="font-plex"
                    data-testid={`option-${idx}`}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="font-plex mb-1.5 flex items-center gap-1"><Timer size={14} /> الوقت (ثانية)</Label>
              <Input
                type="number" min={5} max={300}
                value={timeLimit}
                onChange={(e) => setTimeLimit(Math.max(5, Math.min(300, Number(e.target.value) || 30)))}
                data-testid="time-limit"
              />
            </div>
            <div>
              <Label className="font-plex mb-1.5 flex items-center gap-1"><Award size={14} /> النقاط</Label>
              <Input
                type="number" min={1} max={10000}
                value={points}
                onChange={(e) => setPoints(Math.max(1, Math.min(10000, Number(e.target.value) || 100)))}
                data-testid="points"
              />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button onClick={handleSave} disabled={saving} className="rounded-full" data-testid="save-question-btn">
            {saving ? <div className="border-2 border-white border-t-transparent rounded-full w-4 h-4 animate-spin ml-2"></div> : null}
            حفظ السؤال
          </Button>
          <Button variant="outline" onClick={onClose} className="rounded-full">إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const PreviewDialog = ({ open, onClose, competition }) => {
  if (!competition) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="preview-dialog">
        <DialogHeader>
          <DialogTitle className="font-amiri text-xl text-primary justify-end flex items-center gap-2">
            <Eye size={18} />
            معاينة: {competition.title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-gradient-to-l from-primary to-primary/80 text-white rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Trophy size={20} className="text-secondary" />
              <h3 className="font-amiri text-2xl font-bold">{competition.title}</h3>
            </div>
            {competition.description && <p className="font-plex text-sm opacity-90">{competition.description}</p>}
            <div className="flex gap-2 mt-2 flex-wrap">
              {competition.category && <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">{competition.category}</span>}
              {competition.level && <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">{competition.level}</span>}
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">{(competition.questions || []).length} سؤال</span>
            </div>
          </div>
          {(competition.questions || []).length === 0 ? (
            <p className="text-center text-muted-foreground py-6 font-plex text-sm">لم تتم إضافة أسئلة بعد.</p>
          ) : (
            (competition.questions || []).map((q, i) => (
              <Card key={q.question_id} className="border-r-4 border-r-secondary" data-testid={`preview-q-${i}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <p className="font-amiri text-lg font-bold text-primary">سؤال {i + 1}</p>
                    <div className="flex gap-1.5 text-xs">
                      <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full flex items-center gap-1"><Timer size={11} />{q.time_limit}ث</span>
                      <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full flex items-center gap-1"><Award size={11} />{q.points} نقطة</span>
                    </div>
                  </div>
                  <p className="font-plex mb-3">{q.question_text}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {q.options.map((opt, oi) => (
                      <div
                        key={oi}
                        className={`p-2 rounded-lg border font-plex text-sm flex items-center gap-2 ${
                          oi === q.correct_index ? 'bg-green-50 border-green-300 text-green-800 font-bold' : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        {oi === q.correct_index && <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" />}
                        {opt}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const CompetitionFormDialog = ({ open, onClose, onSaved, initial }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState('draft');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(initial?.title || '');
      setDescription(initial?.description || '');
      setCategory(initial?.category || '');
      setLevel(initial?.level || '');
      setStatus(initial?.status || 'draft');
    }
  }, [open, initial]);

  const handleSave = async () => {
    if (!title.trim()) { toast.error('العنوان مطلوب'); return; }
    setSaving(true);
    try {
      const payload = { title: title.trim(), description, category, level, status };
      if (initial) {
        await api.put(`/competitions/${initial.competition_id}`, payload);
        toast.success('تم تحديث المسابقة');
      } else {
        await api.post('/competitions', payload);
        toast.success('تم إنشاء المسابقة');
      }
      onSaved?.();
      onClose?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="sm:max-w-lg" data-testid="competition-form-dialog">
        <DialogHeader>
          <DialogTitle className="font-amiri text-xl text-primary justify-end flex items-center gap-2">
            <Trophy size={18} />
            {initial ? 'تعديل المسابقة' : 'إنشاء مسابقة جديدة'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="font-plex mb-1.5 block">العنوان</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مسابقة حفظ الجزء الأول" data-testid="comp-title" />
          </div>
          <div>
            <Label className="font-plex mb-1.5 block">الوصف</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="مسابقة لاختبار حفظ الطلاب..." data-testid="comp-description" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="font-plex mb-1.5 block">الفئة / النوع</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="حفظ / تجويد / علوم القرآن" data-testid="comp-category" />
            </div>
            <div>
              <Label className="font-plex mb-1.5 block">المستوى</Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger data-testid="comp-level"><SelectValue placeholder="اختر المستوى" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="مبتدئ">مبتدئ</SelectItem>
                  <SelectItem value="متوسط">متوسط</SelectItem>
                  <SelectItem value="متقدم">متقدم</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="font-plex mb-1.5 block">الحالة</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger data-testid="comp-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">مسودة (يمكن تعديل الأسئلة)</SelectItem>
                <SelectItem value="published">منشورة (مقفولة للتعديل)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button onClick={handleSave} disabled={saving} className="rounded-full" data-testid="save-comp-btn">حفظ</Button>
          <Button variant="outline" onClick={onClose} className="rounded-full">إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const CompetitionsManager = () => {
  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingComp, setEditingComp] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedComp, setSelectedComp] = useState(null); // expanded competition with questions
  const [previewComp, setPreviewComp] = useState(null);
  const [questionDialog, setQuestionDialog] = useState({ open: false, initial: null });
  const [liveSession, setLiveSession] = useState(null);
  const [startingLiveFor, setStartingLiveFor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/competitions');
      setCompetitions(res.data || []);
    } catch {
      toast.error('فشل تحميل المسابقات');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (cid) => {
    try {
      const res = await api.get(`/competitions/${cid}`);
      setSelectedComp(res.data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDeleteComp = async (cid, title) => {
    if (!window.confirm(`سيتم حذف المسابقة "${title}" وكل أسئلتها. هل أنت متأكد؟`)) return;
    try {
      await api.delete(`/competitions/${cid}`);
      toast.success('تم حذف المسابقة');
      if (selectedComp?.competition_id === cid) setSelectedComp(null);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الحذف');
    }
  };

  const handleStartLive = async (cid) => {
    setStartingLiveFor(cid);
    try {
      const res = await api.post(`/competitions/${cid}/live/start`);
      setLiveSession(res.data);
      toast.success('تم إنشاء جلسة مباشرة');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل بدء الجلسة المباشرة');
    } finally {
      setStartingLiveFor(null);
    }
  };

  const handleDeleteQuestion = async (qid) => {    if (!window.confirm('سيتم حذف السؤال. هل أنت متأكد؟')) return;
    try {
      await api.delete(`/competitions/${selectedComp.competition_id}/questions/${qid}`);
      toast.success('تم حذف السؤال');
      await loadDetail(selectedComp.competition_id);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الحذف');
    }
  };

  // Detail view
  if (selectedComp) {
    const isPublished = selectedComp.status === 'published';
    return (
      <Card className="border-t-4 border-secondary" data-testid="competition-detail">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="font-amiri text-xl text-primary flex items-center gap-2">
                <Trophy size={20} className="text-secondary" />
                {selectedComp.title}
              </CardTitle>
              {selectedComp.description && <p className="font-plex text-sm text-muted-foreground mt-1">{selectedComp.description}</p>}
              <div className="flex gap-2 mt-2 flex-wrap text-xs">
                <span className={`px-2 py-0.5 rounded-full ${STATUS_COLORS[selectedComp.status]}`}>{STATUS_LABELS[selectedComp.status]}</span>
                {selectedComp.category && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{selectedComp.category}</span>}
                {selectedComp.level && <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{selectedComp.level}</span>}
                <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{selectedComp.questions?.length || 0} سؤال</span>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedComp(null)} className="rounded-full" data-testid="back-to-list">
              <ChevronRight size={14} className="rotate-180 ml-1" />
              العودة للقائمة
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            <Button
              onClick={() => setQuestionDialog({ open: true, initial: null })}
              disabled={isPublished}
              className="rounded-full"
              data-testid="add-question-btn"
            >
              <Plus size={14} className="ml-1" /> إضافة سؤال
            </Button>
            <Button variant="outline" onClick={() => setPreviewComp(selectedComp)} className="rounded-full" data-testid="preview-comp-btn">
              <Eye size={14} className="ml-1" /> معاينة
            </Button>
            <Button variant="outline" onClick={() => { setEditingComp(selectedComp); setFormOpen(true); }} className="rounded-full">
              <Edit2 size={14} className="ml-1" /> تعديل بيانات المسابقة
            </Button>
            {isPublished && (selectedComp.questions || []).length > 0 && (
              <Button
                onClick={() => handleStartLive(selectedComp.competition_id)}
                disabled={startingLiveFor === selectedComp.competition_id}
                className="rounded-full bg-green-600 hover:bg-green-700"
                data-testid="start-live-detail-btn"
              >
                {startingLiveFor === selectedComp.competition_id
                  ? <div className="border-2 border-white border-t-transparent rounded-full w-4 h-4 animate-spin ml-2"></div>
                  : <Play size={14} className="ml-1" />}
                بدء جلسة مباشرة
              </Button>
            )}
          </div>

          {isPublished && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 font-plex text-xs text-amber-700">
              المسابقة منشورة — أعدها إلى "مسودة" لتعديل الأسئلة.
            </div>
          )}

          {(selectedComp.questions || []).length === 0 ? (
            <p className="text-center text-muted-foreground font-plex text-sm py-8">لم تتم إضافة أسئلة بعد. اضغط "إضافة سؤال" للبدء.</p>
          ) : (
            <div className="space-y-2">
              {selectedComp.questions.map((q, idx) => (
                <div key={q.question_id} className="border rounded-lg p-3 bg-white hover:border-primary/40 transition-colors" data-testid={`question-row-${q.question_id}`}>
                  <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                    <p className="font-plex font-bold text-sm flex items-center gap-2">
                      <span className="bg-primary text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">{idx + 1}</span>
                      {q.question_text}
                    </p>
                    <div className="flex gap-1">
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => setQuestionDialog({ open: true, initial: q })}
                        disabled={isPublished}
                        data-testid={`edit-q-${q.question_id}`}
                        className="text-blue-600 hover:bg-blue-50 h-7 px-2"
                      >
                        <Edit2 size={12} />
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => handleDeleteQuestion(q.question_id)}
                        disabled={isPublished}
                        data-testid={`del-q-${q.question_id}`}
                        className="text-red-500 hover:bg-red-50 h-7 px-2"
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mr-8">
                    {q.options.map((opt, oi) => (
                      <div
                        key={oi}
                        className={`text-xs font-plex p-1.5 rounded ${
                          oi === q.correct_index ? 'bg-green-50 text-green-800 font-bold border border-green-200' : 'bg-gray-50 text-gray-600'
                        }`}
                      >
                        {oi === q.correct_index && '✓ '}{opt}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-2 mr-8 text-[11px] text-muted-foreground">
                    <span><Timer size={10} className="inline ml-0.5" />{q.time_limit}ث</span>
                    <span><Award size={10} className="inline ml-0.5" />{q.points} نقطة</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>

        <QuestionDialog
          open={questionDialog.open}
          onClose={() => setQuestionDialog({ open: false, initial: null })}
          onSaved={() => loadDetail(selectedComp.competition_id).then(load)}
          competitionId={selectedComp.competition_id}
          initial={questionDialog.initial}
        />
        <CompetitionFormDialog
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditingComp(null); }}
          onSaved={() => loadDetail(selectedComp.competition_id).then(load)}
          initial={editingComp}
        />
        <PreviewDialog open={!!previewComp} onClose={() => setPreviewComp(null)} competition={previewComp} />
        <LiveWaitingRoomDialog
          open={!!liveSession}
          onClose={() => setLiveSession(null)}
          liveSession={liveSession}
        />
      </Card>
    );
  }

  // List view
  return (
    <Card className="border-t-4 border-secondary" data-testid="competitions-manager">
      <CardHeader className="pb-3">
        <CardTitle className="font-amiri text-xl text-primary flex items-center gap-2 justify-between flex-wrap">
          <div className="flex items-center gap-2">
            <Trophy size={20} className="text-secondary" />
            مسابقات المقرأة
            <span className="bg-secondary text-secondary-foreground text-xs px-2 py-0.5 rounded-full">{competitions.length}</span>
          </div>
          <Button onClick={() => { setEditingComp(null); setFormOpen(true); }} className="rounded-full bg-primary hover:bg-primary/90 shadow-md" data-testid="create-comp-btn">
            <Plus size={14} className="ml-1" /> إنشاء مسابقة
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="spinner border-4 border-primary border-t-transparent rounded-full w-8 h-8"></div>
          </div>
        ) : competitions.length === 0 ? (
          <div className="text-center py-10">
            <Trophy size={40} className="mx-auto text-muted-foreground mb-2" />
            <p className="font-plex text-sm text-muted-foreground mb-3">لا توجد مسابقات. ابدأ بإنشاء أول مسابقة!</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {competitions.map((c) => (
              <div
                key={c.competition_id}
                className="relative border-2 rounded-2xl p-4 bg-gradient-to-br from-white via-amber-50/30 to-white hover:border-secondary hover:shadow-lg transition-all group"
                data-testid={`comp-row-${c.competition_id}`}
              >
                {/* Decorative corner trophy */}
                <div className="absolute top-3 left-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Trophy size={40} className="text-primary" />
                </div>
                <div className="cursor-pointer min-w-0 mb-3 pl-12" onClick={() => loadDetail(c.competition_id)}>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status]}`}>
                      {STATUS_LABELS[c.status]}
                    </span>
                    {c.level && <span className="text-[10px] bg-secondary/20 text-secondary px-2 py-0.5 rounded-full font-plex">{c.level}</span>}
                  </div>
                  <h4 className="font-amiri text-lg sm:text-xl font-bold text-primary leading-tight truncate">{c.title}</h4>
                  {c.description && <p className="font-plex text-xs text-muted-foreground line-clamp-2 mt-1">{c.description}</p>}
                  <div className="flex gap-3 mt-2 text-xs flex-wrap text-gray-600 font-plex">
                    <span className="inline-flex items-center gap-1">
                      <Sparkles size={11} className="text-secondary" />
                      <span className="font-bold">{c.question_count}</span> سؤال
                    </span>
                    {c.category && <span className="text-muted-foreground">• {c.category}</span>}
                  </div>
                </div>
                <div className="flex gap-1.5 flex-wrap pt-2 border-t">
                  {c.status === 'published' && (c.question_count || 0) > 0 && (
                    <Button
                      size="sm"
                      onClick={() => handleStartLive(c.competition_id)}
                      disabled={startingLiveFor === c.competition_id}
                      className="rounded-full bg-green-600 hover:bg-green-700 h-8 px-3"
                      title="بدء جلسة مباشرة"
                      data-testid={`start-live-${c.competition_id}`}
                    >
                      {startingLiveFor === c.competition_id
                        ? <div className="border-2 border-white border-t-transparent rounded-full w-3.5 h-3.5 animate-spin ml-1"></div>
                        : <Play size={12} className="ml-1" />}
                      بدء مباشر
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => loadDetail(c.competition_id)} className="rounded-full h-8 px-3 border-primary text-primary" data-testid={`open-${c.competition_id}`}>
                    <Eye size={12} className="ml-1" /> فتح
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditingComp(c); setFormOpen(true); }} className="text-blue-600 h-8 px-2" title="تعديل">
                    <Edit2 size={14} />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDeleteComp(c.competition_id, c.title)} className="text-red-500 h-8 px-2 mr-auto" title="حذف" data-testid={`del-${c.competition_id}`}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <CompetitionFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingComp(null); }}
        onSaved={load}
        initial={editingComp}
      />
      <LiveWaitingRoomDialog
        open={!!liveSession}
        onClose={() => setLiveSession(null)}
        liveSession={liveSession}
      />
    </Card>
  );
};

export default CompetitionsManager;
