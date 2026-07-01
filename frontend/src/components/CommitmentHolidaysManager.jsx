import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CalendarOff, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/utils/api';

/**
 * Admin tool: declare weeks as "holiday weeks" where the weekly-commitment
 * evaluator skips warning issuance. Pairs with the backend collection
 * `commitment_holidays` and the `_evaluate_weekly_commitments` skip logic.
 */
const CommitmentHolidaysManager = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/commitment-holidays');
      setItems(res.data || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'تعذّر تحميل العطلات');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!date) { toast.error('اختر تاريخاً ضمن الأسبوع المراد تعطيله'); return; }
    setSaving(true);
    try {
      const res = await api.post('/admin/commitment-holidays', { week_start: date, reason });
      toast.success(res.data?.message || 'تم إضافة العطلة');
      setDate(''); setReason('');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الإضافة');
    } finally { setSaving(false); }
  };

  const handleDelete = async (hid) => {
    if (!window.confirm('سيتم إلغاء العطلة وسيستأنف احتساب الإنذارات لهذا الأسبوع. هل أنت متأكد؟')) return;
    try {
      await api.delete(`/admin/commitment-holidays/${hid}`);
      toast.success('تم الحذف');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الحذف');
    }
  };

  return (
    <Card className="border-t-4 border-amber-400" data-testid="commitment-holidays-manager">
      <CardHeader className="pb-3">
        <CardTitle className="font-amiri text-lg sm:text-xl text-amber-700 flex items-center gap-2">
          <CalendarOff size={18} />
          أسابيع العطل (إيقاف احتساب الإنذارات)
        </CardTitle>
        <p className="font-plex text-xs text-muted-foreground">
          عند تعطيل أسبوع، لن يحصل أي طالب على إنذار بسبب التقصير في ذلك الأسبوع. اختر تاريخاً ضمن الأسبوع وسيتم تطبيقه على الأسبوع كاملاً (من الإثنين إلى الأحد).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
          <div className="sm:col-span-1">
            <Label className="font-plex text-xs mb-1 block">تاريخ ضمن الأسبوع</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              data-testid="holiday-date-input"
            />
          </div>
          <div className="sm:col-span-1">
            <Label className="font-plex text-xs mb-1 block">السبب (اختياري)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: عيد الفطر / إجازة منتصف العام"
              data-testid="holiday-reason-input"
            />
          </div>
          <div className="sm:col-span-1">
            <Button
              onClick={handleAdd}
              disabled={saving || !date}
              data-testid="add-holiday-btn"
              className="w-full rounded-full"
            >
              <Plus size={14} className="ml-1" /> {saving ? 'جاري الحفظ...' : 'تعطيل الأسبوع'}
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="font-plex text-xs text-center text-muted-foreground py-4">جاري التحميل...</p>
        ) : items.length === 0 ? (
          <p className="font-plex text-xs text-center text-muted-foreground py-4" data-testid="no-holidays">
            لا توجد أسابيع معطّلة حالياً.
          </p>
        ) : (
          <div className="space-y-1.5">
            {items.map(h => {
              const ws = new Date(h.week_start);
              const we = new Date(ws.getTime() + 7 * 24 * 60 * 60 * 1000);
              return (
                <div
                  key={h.holiday_id}
                  className="flex items-center justify-between gap-2 text-xs font-plex p-2 bg-amber-50 border border-amber-200 rounded-lg"
                  data-testid={`holiday-row-${h.holiday_id}`}
                >
                  <div>
                    <p className="font-bold text-amber-800">
                      {ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {' → '}
                      {we.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                    {h.reason && <p className="text-[11px] text-amber-700">{h.reason}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(h.holiday_id)}
                    data-testid={`delete-holiday-${h.holiday_id}`}
                    title="حذف العطلة"
                    className="text-red-600 hover:bg-red-100 rounded p-1.5"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CommitmentHolidaysManager;
