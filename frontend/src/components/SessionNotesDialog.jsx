import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
// import { FileText, BookOpen, Save, Search, Plus, Trash2, Star } from 'lucide-react';
import { FileText, BookOpen, Save, Search, Plus, Trash2, Star, Check, XCircle } from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';

const RATING_OPTIONS = ['ممتاز', 'متوسط', 'مقبول', 'ضعيف'];

const EMPTY_ENTRY = () => ({
  id: Date.now() + Math.random(),
  surahName: '',
  fromAyah: '',
  toAyah: '',
  quality: '',
  notes: '',
  surahSearch: ''
});

const MemorizationBlock = ({ entry, index, surahs, onUpdate, onRemove, canRemove }) => {
  const selectedSurah = useMemo(() => surahs.find(s => s.name === entry.surahName), [entry.surahName, surahs]);
  const maxAyah = selectedSurah?.ayah_count || 999;

  const filteredSurahs = useMemo(() => {
    if (!entry.surahSearch) return surahs;
    return surahs.filter(s => s.name.includes(entry.surahSearch) || String(s.number).includes(entry.surahSearch));
  }, [entry.surahSearch, surahs]);

  const update = useCallback((field, value) => {
    const patch = { [field]: value };
    if (field === 'surahName') {
      patch.fromAyah = '';
      patch.toAyah = '';
    }
    onUpdate(entry.id, patch);
  }, [entry.id, onUpdate]);

  return (
    <div className="relative border-2 border-green-200 rounded-lg bg-green-50/30" data-testid={`mem-block-${index}`}>
      {canRemove && (
        <button
          data-testid={`remove-mem-block-${index}`}
          onClick={() => onRemove(entry.id)}
          className="absolute top-2 left-2 p-1.5 rounded-full bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors"
          type="button"
        >
          <Trash2 size={14} />
        </button>
      )}
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen size={16} className="text-green-600" />
          <span className="font-plex text-sm font-medium text-green-700">
            {index === 0 ? 'مقطع الحفظ' : `مقطع الحفظ ${index + 1}`}
          </span>
        </div>

        {/* Surah Selection */}
        <div>
          <Label className="font-plex text-xs">السورة</Label>
          <Select value={entry.surahName} onValueChange={(v) => update('surahName', v)}>
            <SelectTrigger data-testid={`surah-select-${index}`} className="h-9">
              <SelectValue placeholder="اختر السورة..." />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              <div className="sticky top-0 p-2 bg-white border-b">
                <div className="relative">
                  <Search size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    data-testid={`surah-search-${index}`}
                    type="text"
                    value={entry.surahSearch}
                    onChange={(e) => update('surahSearch', e.target.value)}
                    placeholder="ابحث عن السورة..."
                    className="w-full pr-7 pl-2 py-1.5 text-sm border rounded font-plex focus:outline-none focus:ring-1 focus:ring-green-400"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
              {filteredSurahs.map((s) => (
                <SelectItem key={s.number} value={s.name} className="font-plex">
                  {s.number}. {s.name} ({s.ayah_count} آية)
                </SelectItem>
              ))}
              {filteredSurahs.length === 0 && (
                <div className="p-3 text-center text-gray-400 text-sm font-plex">لا توجد نتائج</div>
              )}
            </SelectContent>
          </Select>
          {selectedSurah && (
            <p className="text-[11px] text-green-600 mt-0.5 font-plex">
              {selectedSurah.name} - {selectedSurah.ayah_count} آية
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {/* From Ayah */}
          <div>
            <Label className="font-plex text-xs">من الآية</Label>
            <input
              data-testid={`from-ayah-${index}`}
              type="number"
              value={entry.fromAyah}
              onChange={(e) => update('fromAyah', e.target.value)}
              placeholder="1"
              min="1"
              max={maxAyah}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm font-plex ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {/* To Ayah */}
          <div>
            <Label className="font-plex text-xs">إلى الآية</Label>
            <input
              data-testid={`to-ayah-${index}`}
              type="number"
              value={entry.toAyah}
              onChange={(e) => update('toAyah', e.target.value)}
              placeholder={selectedSurah ? String(selectedSurah.ayah_count) : ''}
              min={entry.fromAyah || '1'}
              max={maxAyah}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm font-plex ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {/* Quality */}
          <div>
            <Label className="font-plex text-xs">التقييم</Label>
            <Select value={entry.quality} onValueChange={(v) => update('quality', v)}>
              <SelectTrigger data-testid={`quality-select-${index}`} className="h-9">
                <SelectValue placeholder="التقييم" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ممتاز">ممتاز</SelectItem>
                <SelectItem value="متوسط">متوسط</SelectItem>
                <SelectItem value="مقبول">مقبول</SelectItem>
                <SelectItem value="ضعيف">ضعيف</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Notes */}
        <div>
          <Label className="font-plex text-xs">ملاحظات (اختياري)</Label>
          <Textarea
            data-testid={`mem-notes-${index}`}
            value={entry.notes}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="ملاحظات عن مستوى الحفظ..."
            rows={1}
            className="font-plex text-sm resize-none"
          />
        </div>
      </div>
    </div>
  );
};

const SessionNotesDialog = ({ open, onClose, session, onSaved, requireRating = false }) => {
  const [mistakes, setMistakes] = useState('');
  const [corrections, setCorrections] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [memEntries, setMemEntries] = useState([EMPTY_ENTRY()]);
  const [loading, setLoading] = useState(false);
  const [surahs, setSurahs] = useState([]);
  // Rating fields (used when requireRating=true OR when teacher wants to set rating along with notes)
  const [rating, setRating] = useState('');
  const [ratingNotes, setRatingNotes] = useState('');
  const [attendanceChoice, setAttendanceChoice] = useState(null);

  // useEffect(() => {
  //   if (open) {
  //     loadSurahs();
  //     // Reset rating state on each open to avoid stale values
  //     setRating('');
  //     setRatingNotes('');
  //   }
  // }, [open]);
  
  useEffect(() => {
  if (open) {
    loadSurahs();
    // Reset rating state on each open to avoid stale values
    setRating('');
    setRatingNotes('');

    if (session?.attendance_confirmed === true) {
      setAttendanceChoice(true);
    } else if (session?.attendance_confirmed === false) {
      setAttendanceChoice(false);
    } else {
      setAttendanceChoice(null);
    }
  }
}, [open, session]);

  const loadSurahs = async () => {
    try {
      const res = await api.get('/quran/surahs');
      setSurahs(res.data.surahs || []);
    } catch {
      console.error('Failed to load surahs');
    }
  };

  const updateEntry = useCallback((id, patch) => {
    setMemEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  }, []);

  const removeEntry = useCallback((id) => {
    setMemEntries(prev => prev.filter(e => e.id !== id));
  }, []);

  const addEntry = () => {
    setMemEntries(prev => [...prev, EMPTY_ENTRY()]);
  };

  // const handleSave = async () => {
  //   // When required, the teacher must set a rating before saving
  //   if (requireRating && !rating) {
  //     toast.error('يرجى اختيار التقييم');
  //     return;
  //   }
  //   setLoading(true);
  //   try {
  //     const notesData = {
  //       mistakes: mistakes || null,
  //       corrections: corrections || null,
  //       recommendations: recommendations || null
  //     };

  //     // Collect valid memorization entries
  //     const validEntries = memEntries.filter(e => e.surahName && e.fromAyah && e.toAyah && e.quality);

  //     if (validEntries.length > 0) {
  //       // Validate each entry client-side
  //       for (const e of validEntries) {
  //         const surah = surahs.find(s => s.name === e.surahName);
  //         const from = parseInt(e.fromAyah);
  //         const to = parseInt(e.toAyah);
  //         if (from > to) {
  //           toast.error(`سورة ${e.surahName}: رقم الآية "من" يجب أن يكون أقل من أو يساوي "إلى"`);
  //           setLoading(false);
  //           return;
  //         }
  //         if (surah && to > surah.ayah_count) {
  //           toast.error(`سورة ${e.surahName} تحتوي على ${surah.ayah_count} آية فقط`);
  //           setLoading(false);
  //           return;
  //         }
  //       }

  //       notesData.memorization_entries = validEntries.map(e => ({
  //         surah_name: e.surahName,
  //         from_ayah: parseInt(e.fromAyah),
  //         to_ayah: parseInt(e.toAyah),
  //         quality: e.quality,
  //         notes: e.notes || null
  //       }));
  //     }

  //     // Save notes + memorization first
  //     try {
  //       await api.post(`/sessions/${session.session_id}/notes`, notesData);
  //     } catch (err) {
  //       const detail = err.response?.data?.detail;
  //       if (err.response?.status === 404) {
  //         toast.error('لم يتم العثور على سجل الحصة');
  //       } else {
  //         toast.error(detail || 'فشل في حفظ الملاحظات');
  //       }
  //       setLoading(false);
  //       return;
  //     }

  //     // If rating was provided (or required), persist it
  //     if (rating) {
  //       try {
  //         await api.put(`/sessions/${session.session_id}/rate`, { rating, notes: ratingNotes || null });
  //       } catch (err) {
  //         const detail = err.response?.data?.detail;
  //         if (err.response?.status === 404) {
  //           toast.error('لم يتم العثور على الحصة عند حفظ التقييم');
  //         } else {
  //           toast.error(detail || 'فشل في حفظ التقييم');
  //         }
  //         setLoading(false);
  //         return;
  //       }
  //     }

  //     toast.success(
  //       validEntries.length > 1
  //         ? `تم حفظ التقييم و ${validEntries.length} مقاطع حفظ`
  //         : (rating ? 'تم حفظ التقييم والملاحظات' : 'تم حفظ الملاحظات')
  //     );
  //     onSaved?.();
  //     onClose();
  //     // Reset
  //     setMistakes('');
  //     setCorrections('');
  //     setRecommendations('');
  //     setMemEntries([EMPTY_ENTRY()]);
  //     setRating('');
  //     setRatingNotes('');
  //   } catch (error) {
  //     toast.error(error.response?.data?.detail || 'فشل في حفظ البيانات');
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  const resetForm = () => {
    setMistakes('');
    setCorrections('');
    setRecommendations('');
    setMemEntries([EMPTY_ENTRY()]);
    setRating('');
    setRatingNotes('');
    setAttendanceChoice(null);
  };

  const handleSave = async () => {
  // الحضور مطلوب أولًا قبل أي شيء آخر
  if (attendanceChoice === null) {
    toast.error('يرجى تحديد حالة الحضور: حاضر أو غائب');
    return;
  }

  // ===== حالة الغياب: حفظ الغياب فقط — بدون أي validation ولا ملاحظات ولا مقاطع حفظ ولا تقييم =====
  if (attendanceChoice === false) {
    setLoading(true);
    try {
      await api.put(`/sessions/${session.session_id}/attendance`, { attended: false });
      toast.success('تم تثبيت غياب الطالب');
      onSaved?.();
      onClose();
      resetForm();
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (err.response?.status === 404) toast.error('لم يتم العثور على الحصة عند تثبيت الغياب');
      else if (err.response?.status === 403) toast.error('ليس لديك صلاحية لتعديل حضور هذه الحصة');
      else toast.error(detail || 'فشل في تثبيت الغياب');
    } finally {
      setLoading(false);
    }
    return;
  }

  // ===== حالة الحضور: نفس منطق التقييم/الملاحظات/الحفظ السابق بالكامل =====
  // التقييم مطلوب عند فتح النافذة من زر "تقييم الطالب"
  if (requireRating && !rating) {
    toast.error('يرجى اختيار تقييم الطالب');
    return;
  }

  // تجهيز مقاطع الحفظ الصحيحة
  const validEntries = memEntries.filter(
    (e) => e.surahName && e.fromAyah && e.toAyah && e.quality
  );

  // الطالب حاضر: يجب إدخال مقطع حفظ واحد على الأقل
  if (requireRating && validEntries.length === 0) {
    toast.error('يرجى تسجيل مقطع حفظ واحد على الأقل حتى يظهر في سجل الحفظ وتقرير الطالب');
    return;
  }

  // منع الحفظ إذا بدأ المعلم بملء مقطع لكنه تركه ناقصًا
  const partiallyFilledEntries = memEntries.filter((e) => {
    const values = [e.surahName, e.fromAyah, e.toAyah, e.quality, e.notes];
    const hasAnyValue = values.some((v) => v !== undefined && v !== null && String(v).trim() !== '');
    const isComplete = e.surahName && e.fromAyah && e.toAyah && e.quality;
    return hasAnyValue && !isComplete;
  });

  if (partiallyFilledEntries.length > 0) {
    toast.error('يوجد مقطع حفظ غير مكتمل. يرجى تعبئة السورة، من آية، إلى آية، وتقييم المقطع');
    return;
  }

  setLoading(true);

  try {
    const notesData = {
      mistakes: mistakes || null,
      corrections: corrections || null,
      recommendations: recommendations || null
    };

    // 6) التحقق من صحة الآيات قبل الإرسال (يُتجاوز عند الغياب — لا حفظ ولا إرسال مقاطع)
    if (validEntries.length > 0) {
      for (const e of validEntries) {
        const surah = surahs.find((s) => s.name === e.surahName);
        const from = parseInt(e.fromAyah);
        const to = parseInt(e.toAyah);

        if (Number.isNaN(from) || Number.isNaN(to)) {
          toast.error(`سورة ${e.surahName}: يرجى إدخال أرقام آيات صحيحة`);
          setLoading(false);
          return;
        }

        if (from > to) {
          toast.error(`سورة ${e.surahName}: رقم الآية "من" يجب أن يكون أقل من أو يساوي "إلى"`);
          setLoading(false);
          return;
        }

        if (surah && to > surah.ayah_count) {
          toast.error(`سورة ${e.surahName} تحتوي على ${surah.ayah_count} آية فقط`);
          setLoading(false);
          return;
        }
      }

      // 7) إرسال مقاطع الحفظ للـ backend
      // هذا هو الجزء المهم الذي ينشئ سجل الحفظ الحقيقي
      notesData.memorization_entries = validEntries.map((e) => ({
        surah_name: e.surahName,
        from_ayah: parseInt(e.fromAyah),
        to_ayah: parseInt(e.toAyah),
        quality: e.quality,
        notes: e.notes || null
      }));
    }

    // 8) حفظ الحضور (حاضر) أولًا
    if (session?.attendance_confirmed !== true) {
      try {
        await api.put(`/sessions/${session.session_id}/attendance`, {
          attended: true
        });
      } catch (err) {
        const detail = err.response?.data?.detail;

        if (err.response?.status === 404) {
          toast.error('لم يتم العثور على الحصة عند تأكيد الحضور');
        } else if (err.response?.status === 403) {
          toast.error('ليس لديك صلاحية لتأكيد حضور هذه الحصة');
        } else {
          toast.error(detail || 'فشل في تأكيد الحضور');
        }

        setLoading(false);
        return;
      }
    }

    // 9) حفظ الملاحظات + مقاطع الحفظ
    try {
      await api.post(`/sessions/${session.session_id}/notes`, notesData);
    } catch (err) {
      const detail = err.response?.data?.detail;

      if (err.response?.status === 404) {
        toast.error('لم يتم العثور على سجل الحصة');
      } else if (err.response?.status === 403) {
        toast.error('ليس لديك صلاحية لحفظ ملاحظات هذه الحصة');
      } else {
        toast.error(detail || 'فشل في حفظ الملاحظات وسجل الحفظ');
      }

      setLoading(false);
      return;
    }

    // 10) حفظ تقييم الطالب
    if (rating) {
      try {
        await api.put(`/sessions/${session.session_id}/rate`, {
          rating,
          notes: ratingNotes || null
        });
      } catch (err) {
        const detail = err.response?.data?.detail;

        if (err.response?.status === 404) {
          toast.error('لم يتم العثور على الحصة عند حفظ التقييم');
        } else if (err.response?.status === 403) {
          toast.error('ليس لديك صلاحية لحفظ تقييم هذه الحصة');
        } else {
          toast.error(detail || 'فشل في حفظ التقييم');
        }

        setLoading(false);
        return;
      }
    }

    toast.success(
      validEntries.length > 0
        ? `تم حفظ تقييم الطالب وتسجيل ${validEntries.length} مقطع حفظ`
        : 'تم حفظ تقييم الطالب'
    );

    onSaved?.();
    onClose();

    // 11) تصفير النموذج
    setMistakes('');
    setCorrections('');
    setRecommendations('');
    setMemEntries([EMPTY_ENTRY()]);
    setRating('');
    setRatingNotes('');
    setAttendanceChoice(null);
  } catch (error) {
    toast.error(error.response?.data?.detail || 'فشل في حفظ البيانات');
  } finally {
    setLoading(false);
  }
};

  if (!session) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="session-notes-dialog">
        <DialogHeader>
          <DialogTitle className="font-amiri text-2xl flex items-center gap-2">
          <FileText className="text-primary" />
          تقييم الطالب - {session.student_name}
          </DialogTitle>
          {/* <DialogTitle className="font-amiri text-2xl flex items-center gap-2">
            <FileText className="text-primary" />
            ملاحظات الجلسة - {session.student_name}
          </DialogTitle> */}
        </DialogHeader>

        <div className="space-y-5">
          <Card className="border-2 border-blue-200 bg-blue-50/40">
            <CardHeader className="pb-3 bg-blue-50">
              <CardTitle className="font-amiri text-lg flex items-center gap-2 text-blue-800">
                <Check size={20} className="text-blue-600" />
                تأكيد الحضور
                <span className="text-xs font-plex bg-blue-600 text-white px-2 py-0.5 rounded-full mr-2">مهم</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {session.join_clicked_at && (
                <p className="font-plex text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg p-2">
                  الطالب ضغط دخول الحصة، لكن تأكيد الحضور النهائي يبقى من المعلم.
                </p>
              )}

              <p className="font-plex text-sm text-muted-foreground">
                هل حضر الطالب هذه الحصة فعلاً؟
              </p>

              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  data-testid="session-attendance-present"
                  onClick={() => setAttendanceChoice(true)}
                  variant={attendanceChoice === true ? 'default' : 'outline'}
                  className="rounded-full border-green-500 text-green-600 data-[state=active]:bg-green-600"
                >
                  <Check className="ml-1" size={14} />
                  حاضر
                </Button>

                <Button
                  type="button"
                  data-testid="session-attendance-absent"
                  onClick={() => setAttendanceChoice(false)}
                  variant={attendanceChoice === false ? 'default' : 'outline'}
                  className="rounded-full border-red-500 text-red-600"
                >
                  <XCircle className="ml-1" size={14} />
                  غائب
                </Button>
              </div>

              {attendanceChoice === true && (
                <p className="font-plex text-xs text-green-700">سيتم حفظ الطالب كحاضر عند الضغط على حفظ.</p>
              )}

              {attendanceChoice === false && (
                <p className="font-plex text-xs text-red-700">سيتم حفظ الطالب كغائب فقط عند الضغط على «تثبيت الغياب» — بدون تقييم أو ملاحظات أو سجل حفظ.</p>
              )}

              {attendanceChoice === null && (
                <p className="font-plex text-xs text-amber-700">لم يتم اختيار حالة الحضور بعد.</p>
              )}
            </CardContent>
          </Card>

          {/* عند الغياب: لا تظهر أي أقسام تقييم */}
          {attendanceChoice === false && (
            <Card className="border-2 border-red-200 bg-red-50/40" data-testid="absent-info-card">
              <CardContent className="py-4 font-plex text-sm text-red-700 space-y-1">
                <p className="font-bold">تم تحديد الطالب كغائب.</p>
                <p className="text-xs">لن يُطلب التقييم أو الملاحظات أو مقاطع الحفظ، ولن يُنشأ أي سجل حفظ. اضغط «تثبيت الغياب» لحفظ الغياب فقط.</p>
              </CardContent>
            </Card>
          )}

          {/* Rating Section — shown only when the student is PRESENT */}
          {attendanceChoice === true && requireRating && (
            <Card className="border-2 border-amber-300 bg-amber-50/40">
              <CardHeader className="pb-3 bg-amber-50">
                <CardTitle className="font-amiri text-lg flex items-center gap-2 text-amber-800">
                  <Star size={20} className="text-amber-600 fill-amber-500" />
                  تقييم أداء الطالب
                  <span className="text-xs font-plex bg-red-500 text-white px-2 py-0.5 rounded-full mr-2">مطلوب</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                <div>
                  <Label className="font-plex">المستوى</Label>
                  <Select value={rating} onValueChange={setRating}>
                    <SelectTrigger data-testid="evaluation-rating-select" className="h-10">
                      <SelectValue placeholder="اختر المستوى..." />
                    </SelectTrigger>
                    <SelectContent>
                      {RATING_OPTIONS.map((r) => (
                        <SelectItem key={r} value={r} className="font-plex">{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="font-plex">ملاحظات حول التقييم (اختياري)</Label>
                  <Textarea
                    data-testid="evaluation-rating-notes"
                    value={ratingNotes}
                    onChange={(e) => setRatingNotes(e.target.value)}
                    placeholder="ملاحظات عامة عن أداء الطالب..."
                    rows={2}
                    className="font-plex"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Instructional Notes + Memorization — only for PRESENT students */}
          {attendanceChoice === true && (
          <>
          {/* Instructional Notes */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-amiri text-lg">ملاحظات تعليمية</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="font-plex">الأخطاء</Label>
                <Textarea
                  data-testid="notes-mistakes"
                  value={mistakes}
                  onChange={(e) => setMistakes(e.target.value)}
                  placeholder="اكتب الأخطاء التي وقع فيها الطالب..."
                  rows={2}
                  className="font-plex"
                />
              </div>
              <div>
                <Label className="font-plex">التصحيحات</Label>
                <Textarea
                  data-testid="notes-corrections"
                  value={corrections}
                  onChange={(e) => setCorrections(e.target.value)}
                  placeholder="اكتب التصحيحات المطلوبة..."
                  rows={2}
                  className="font-plex"
                />
              </div>
              <div>
                <Label className="font-plex">التوصيات</Label>
                <Textarea
                  data-testid="notes-recommendations"
                  value={recommendations}
                  onChange={(e) => setRecommendations(e.target.value)}
                  placeholder="اكتب توصياتك للطالب..."
                  rows={2}
                  className="font-plex"
                />
              </div>
            </CardContent>
          </Card>

          {/* Memorization Entries */}
          <Card className="border-2 border-green-200">
            <CardHeader className="pb-3 bg-green-50">
              <CardTitle className="font-amiri text-lg flex items-center gap-2 text-green-700">
                <BookOpen size={20} />
                {requireRating ? 'تسجيل تقدم الحفظ (مطلوب)' : 'تسجيل تقدم الحفظ (اختياري)'}
                {/* تسجيل تقدم الحفظ (اختياري) */}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {memEntries.map((entry, idx) => (
                <MemorizationBlock
                  key={entry.id}
                  entry={entry}
                  index={idx}
                  surahs={surahs}
                  onUpdate={updateEntry}
                  onRemove={removeEntry}
                  canRemove={memEntries.length > 1}
                />
              ))}

              <Button
                data-testid="add-mem-entry-btn"
                type="button"
                variant="outline"
                onClick={addEntry}
                className="w-full border-dashed border-green-300 text-green-600 hover:bg-green-50 hover:text-green-700 gap-1.5"
              >
                <Plus size={16} />
                إضافة مقطع حفظ آخر
              </Button>
            </CardContent>
          </Card>
          </>
          )}
        </div>

        <DialogFooter>
          <Button data-testid="save-notes-btn" onClick={handleSave} disabled={loading} className="rounded-full">
            <Save size={18} className="ml-2" />
            {loading ? 'جاري الحفظ...' : (attendanceChoice === false ? 'تثبيت الغياب' : 'حفظ تقييم الطالب')}
          </Button>
          <Button variant="outline" onClick={onClose} className="rounded-full">
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SessionNotesDialog;
