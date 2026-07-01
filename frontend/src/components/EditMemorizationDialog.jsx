import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
//import { Pencil, Search, Save } from 'lucide-react';
import { Pencil, Search, Save, Trash2 } from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';

const EditMemorizationDialog = ({ open, onClose, entry, onSaved, isAdmin = false }) => {
  const [surahName, setSurahName] = useState('');
  const [fromAyah, setFromAyah] = useState('');
  const [toAyah, setToAyah] = useState('');
  const [quality, setQuality] = useState('');
  const [notes, setNotes] = useState('');
  const [surahSearch, setSurahSearch] = useState('');
  const [surahs, setSurahs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && entry) {
      setSurahName(entry.surah_name || '');
      setFromAyah(String(entry.from_ayah || ''));
      setToAyah(String(entry.to_ayah || ''));
      setQuality(entry.quality || '');
      setNotes(entry.notes || '');
      setSurahSearch('');
      loadSurahs();
    }
  }, [open, entry]);

  const loadSurahs = async () => {
    try {
      const res = await api.get('/quran/surahs');
      setSurahs(res.data.surahs || []);
    } catch {
      console.error('Failed to load surahs');
    }
  };

  const selectedSurah = useMemo(() => surahs.find(s => s.name === surahName), [surahName, surahs]);
  const maxAyah = selectedSurah?.ayah_count || 999;

  const filteredSurahs = useMemo(() => {
    if (!surahSearch) return surahs;
    return surahs.filter(s => s.name.includes(surahSearch) || String(s.number).includes(surahSearch));
  }, [surahSearch, surahs]);

  const handleSave = async () => {
    if (!surahName || !fromAyah || !toAyah || !quality) {
      toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }
    const from = parseInt(fromAyah);
    const to = parseInt(toAyah);
    if (from > to) {
      toast.error('رقم الآية "من" يجب أن يكون أقل من أو يساوي "إلى"');
      return;
    }
    if (selectedSurah && to > selectedSurah.ayah_count) {
      toast.error(`سورة ${surahName} تحتوي على ${selectedSurah.ayah_count} آية فقط`);
      return;
    }

    setLoading(true);
    try {
      await api.put(`/memorization-progress/${entry.progress_id}`, {
        surah_name: surahName,
        from_ayah: from,
        to_ayah: to,
        quality,
        notes: notes || null
      });
      toast.success('تم تحديث سجل الحفظ بنجاح');
      onSaved?.();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تحديث السجل');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
  if (!entry?.progress_id) return;

  const confirmed = window.confirm(
    'هل أنت متأكد من حذف سجل الحفظ هذا؟ لن يظهر بعد الحذف في سجل الطالب أو التقرير.'
  );

  if (!confirmed) return;

  setLoading(true);
  try {
    await api.delete(`/memorization-progress/${entry.progress_id}`);
    toast.success('تم حذف سجل الحفظ بنجاح');
    onSaved?.();
    onClose();
  } catch (error) {
    toast.error(error.response?.data?.detail || 'فشل في حذف سجل الحفظ');
  } finally {
    setLoading(false);
  }
};
  if (!entry) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" data-testid="edit-memorization-dialog">
        <DialogHeader>
          <DialogTitle className="font-amiri text-xl flex items-center gap-2">
            <Pencil className="text-primary" size={20} />
            تعديل سجل الحفظ
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="font-plex">السورة</Label>
            <Select value={surahName} onValueChange={(v) => { setSurahName(v); setFromAyah(''); setToAyah(''); }}>
              <SelectTrigger data-testid="edit-surah-select">
                <SelectValue placeholder="اختر السورة..." />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <div className="sticky top-0 p-2 bg-white border-b">
                  <div className="relative">
                    <Search size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      data-testid="edit-surah-search"
                      type="text"
                      value={surahSearch}
                      onChange={(e) => setSurahSearch(e.target.value)}
                      placeholder="ابحث..."
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
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="font-plex">من الآية</Label>
              <input
                data-testid="edit-from-ayah"
                type="number" value={fromAyah}
                onChange={(e) => setFromAyah(e.target.value)}
                min="1" max={maxAyah}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-plex ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div>
              <Label className="font-plex">إلى الآية</Label>
              <input
                data-testid="edit-to-ayah"
                type="number" value={toAyah}
                onChange={(e) => setToAyah(e.target.value)}
                min={fromAyah || '1'} max={maxAyah}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-plex ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          <div>
            <Label className="font-plex">التقييم</Label>
            <Select value={quality} onValueChange={setQuality}>
              <SelectTrigger data-testid="edit-quality-select">
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

          <div>
            <Label className="font-plex">ملاحظات</Label>
            <Textarea
              data-testid="edit-mem-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ملاحظات..."
              rows={2}
              className="font-plex"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {isAdmin && (
            <Button
              type="button"
              variant="outline"
              onClick={handleDelete}
              disabled={loading}
              className="border-red-500 text-red-600 hover:bg-red-50"
              data-testid="delete-memorization-btn"
            >
              <Trash2 className="ml-2" size={16} />
              حذف السجل
            </Button>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              إلغاء
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              <Save className="ml-2" size={16} />
              {loading ? 'جاري الحفظ...' : 'حفظ التعديلات'}
            </Button>
          </div>
</DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditMemorizationDialog;
