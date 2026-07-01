import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Printer, FileText } from 'lucide-react';
import api from '@/utils/api';
import { generateWeeklyPlanPDF } from '@/utils/generateWeeklyPlanPDF';

const KIND_LABELS = { memorize: 'حفظ', review: 'مراجعة', test: 'تسميع' };
const KIND_BG = { memorize: 'bg-emerald-100 text-emerald-800', review: 'bg-amber-100 text-amber-800', test: 'bg-violet-100 text-violet-800' };

const StudentWeeklyPlansViewer = () => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/student/weekly-plans');
        setPlans(res.data || []);
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return null;
  if (plans.length === 0) return null;

  return (
    <Card className="border-t-4 border-amber-500" data-testid="student-weekly-plans-card">
      <CardHeader className="pb-3">
        <CardTitle className="font-amiri text-lg sm:text-xl text-primary flex items-center gap-2 justify-end">
          <FileText size={18} className="text-amber-600" /> الخطط الأسبوعية من معلمك
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2" data-testid="student-weekly-plans-list">
          {plans.map(p => {
            const open = expanded === p.plan_id;
            return (
              <div key={p.plan_id} className="border-2 rounded-xl p-3 bg-amber-50/20" data-testid={`student-plan-${p.plan_id}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 font-plex text-sm">
                    <Calendar size={14} className="text-amber-600" />
                    <div>
                      <p className="font-bold text-primary">أسبوع {p.week_start}</p>
                      <p className="text-[11px] text-muted-foreground">من إنشاء {p.teacher_name} · {(p.days || []).length} أيام</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => setExpanded(open ? null : p.plan_id)} className="rounded-full h-8" data-testid={`toggle-plan-${p.plan_id}`}>
                      {open ? 'إغلاق' : 'عرض'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => generateWeeklyPlanPDF(p)} className="rounded-full h-8" data-testid={`student-print-plan-${p.plan_id}`}>
                      <Printer size={12} className="ml-1" /> طباعة
                    </Button>
                  </div>
                </div>
                {open && (
                  <div className="mt-3 border-t pt-2 overflow-x-auto">
                    <table className="w-full text-xs font-plex">
                      <thead>
                        <tr className="bg-muted">
                          <th className="p-1.5">اليوم</th>
                          <th className="p-1.5">النوع</th>
                          <th className="p-1.5">السورة</th>
                          <th className="p-1.5">الآيات</th>
                          <th className="p-1.5">صفحات</th>
                          <th className="p-1.5">المراجعة</th>
                          <th className="p-1.5">ملاحظات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(p.days || []).map((d, i) => (
                          <tr key={i} className="border-b">
                            <td className="p-1.5 font-bold text-primary">{d.day}</td>
                            <td className="p-1.5"><span className={`inline-block rounded-full px-2 py-0.5 text-[10px] ${KIND_BG[d.kind] || 'bg-gray-100'}`}>{KIND_LABELS[d.kind] || d.kind}</span></td>
                            <td className="p-1.5">{d.surah || '—'}</td>
                            <td className="p-1.5">{d.from_ayah && d.to_ayah ? `${d.from_ayah}-${d.to_ayah}` : '—'}</td>
                            <td className="p-1.5">{d.page_range || '—'}</td>
                            <td className="p-1.5">{d.review_target || '—'}</td>
                            <td className="p-1.5 text-right">{d.notes || ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {p.teacher_notes && <p className="mt-2 bg-emerald-50 border border-emerald-200 rounded p-2 text-xs"><strong className="text-emerald-800">ملاحظات المعلم:</strong> {p.teacher_notes}</p>}
                    {p.parent_notes && <p className="mt-1 bg-amber-50 border border-amber-200 rounded p-2 text-xs"><strong className="text-amber-800">ملاحظات لولي الأمر:</strong> {p.parent_notes}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default StudentWeeklyPlansViewer;
