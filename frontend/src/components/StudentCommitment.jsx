import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Target, Save, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/utils/api';

const StudentCommitment = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sessions, setSessions] = useState('1');
  const [pages, setPages] = useState('1');

  const load = useCallback(async () => {
    try {
      const res = await api.get('/student/commitment');
      setData(res.data);
      const c = res.data.commitment || {};
      setSessions(String(Math.max(1, c.min_sessions_per_week || 1)));
      setPages(String(Math.max(1, c.min_pages_per_week || 1)));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    const sNum = parseInt(sessions, 10);
    const pNum = parseInt(pages, 10);
    if (!sNum || sNum < 1 || !pNum || pNum < 1) {
      toast.error('الحد الأدنى للجلسات والصفحات هو 1');
      return;
    }
    setSaving(true);
    try {
      await api.put('/student/commitment', {
        min_sessions_per_week: sNum,
        min_pages_per_week: pNum,
      });
      toast.success('تم حفظ التزامك الأسبوعي');
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="spinner border-4 border-primary border-t-transparent rounded-full w-8 h-8"></div>
      </div>
    );
  }

  const c = data?.commitment || {};
  const hasCommitment = c.min_sessions_per_week && c.min_pages_per_week;
  const warningCount = data?.warning_count_3m || 0;
  const isFrozen = data?.is_frozen;

  return (
    <div className="space-y-4" data-testid="student-commitment">
      {/* Frozen Banner */}
      {isFrozen && (
        <Card className="border-2 border-red-300 bg-red-50">
          <CardContent className="p-4 sm:p-5 flex items-start gap-3" data-testid="frozen-banner">
            <ShieldAlert className="text-red-600 flex-shrink-0 mt-1" size={24} />
            <div>
              <h3 className="font-amiri text-lg sm:text-xl font-bold text-red-700 mb-1">تم تجميد حسابك مؤقتاً</h3>
              <p className="font-plex text-sm text-red-600">
                {data.frozen_reason || 'تم تجاوز عدد الإنذارات المسموح بها.'}
              </p>
              <p className="font-plex text-xs text-red-500 mt-1">
                لا يمكنك حجز جلسات جديدة. يرجى التواصل مع إدارة المقرأة لرفع التقييد.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Commitment Settings */}
      <Card className="border-t-4 border-primary shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="font-amiri text-xl sm:text-2xl text-primary flex items-center gap-2">
            <Target size={22} />
            التزامي الأسبوعي
          </CardTitle>
          <p className="font-plex text-xs sm:text-sm text-muted-foreground">
            حدد الحد الأدنى الأسبوعي للجلسات والصفحات (الحد الأدنى للقيمتين هو 1).
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <Label className="font-plex mb-2 block text-sm">الحد الأدنى للجلسات في الأسبوع</Label>
              <Input
                type="number"
                min={1}
                inputMode="numeric"
                value={sessions}
                onChange={(e) => setSessions(e.target.value.replace(/[^0-9]/g, ''))}
                className="font-plex"
                data-testid="min-sessions-input"
              />
            </div>
            <div>
              <Label className="font-plex mb-2 block text-sm">الحد الأدنى للصفحات في الأسبوع</Label>
              <Input
                type="number"
                min={1}
                inputMode="numeric"
                value={pages}
                onChange={(e) => setPages(e.target.value.replace(/[^0-9]/g, ''))}
                className="font-plex"
                data-testid="min-pages-input"
              />
            </div>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving}
            data-testid="save-commitment-btn"
            className="rounded-full"
          >
            {saving ? (
              <><div className="spinner border-2 border-white border-t-transparent rounded-full w-4 h-4 ml-2"></div>جاري الحفظ...</>
            ) : (
              <><Save className="ml-2" size={16} />حفظ الالتزام</>
            )}
          </Button>
          {hasCommitment && !isFrozen && (
            <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg p-2 sm:p-3">
              <CheckCircle2 size={18} />
              <p className="font-plex text-xs sm:text-sm">
                التزامك الحالي: <strong>{c.min_sessions_per_week}</strong> جلسات و <strong>{c.min_pages_per_week}</strong> صفحات أسبوعياً
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Warnings */}
      <Card className={`border-t-4 ${warningCount >= 2 ? 'border-red-500' : 'border-amber-400'}`}>
        <CardHeader className="pb-3">
          <CardTitle className="font-amiri text-lg sm:text-xl flex items-center gap-2">
            <AlertCircle size={20} className={warningCount >= 2 ? 'text-red-500' : 'text-amber-500'} />
            الإنذارات خلال آخر 3 أشهر
            <span className={`text-sm px-2 py-0.5 rounded-full ${warningCount >= 3 ? 'bg-red-500 text-white' : warningCount >= 2 ? 'bg-amber-500 text-white' : 'bg-green-500 text-white'}`} data-testid="warning-count">
              {warningCount}
            </span>
          </CardTitle>
          <p className="font-plex text-xs text-muted-foreground">
            إذا وصل عدد الإنذارات إلى 3 خلال 3 أشهر، يتم تجميد الحساب تلقائياً ومنع الحجز حتى رفع التقييد من قبل إدارة المقرأة.
          </p>
        </CardHeader>
        <CardContent>
          {(!data?.warnings || data.warnings.length === 0) ? (
            <p className="font-plex text-sm text-center text-muted-foreground py-4" data-testid="no-warnings">
              لا توجد إنذارات. أحسنت!
            </p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {data.warnings.map((w) => (
                <div key={w.warning_id} className="border border-amber-200 bg-amber-50 rounded-lg p-3" data-testid={`warning-${w.warning_id}`}>
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                    <span className="font-plex text-xs sm:text-sm font-bold text-amber-700">
                      {new Date(w.week_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {' → '}
                      {new Date(w.week_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <div className="flex gap-1.5 text-[11px] font-plex">
                      <span className={`px-2 py-0.5 rounded-full ${w.sessions_done < w.required_sessions ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        جلسات: {w.sessions_done}/{w.required_sessions}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full ${w.pages_done < w.required_pages ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        صفحات: {w.pages_done}/{w.required_pages}
                      </span>
                    </div>
                  </div>
                  <p className="font-plex text-xs text-gray-600">{w.reason}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentCommitment;
