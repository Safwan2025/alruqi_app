import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldAlert, Unlock, User, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/utils/api';

const AdminFrozenStudentsManager = () => {
  const [frozen, setFrozen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unfreezing, setUnfreezing] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [details, setDetails] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/frozen-students');
      setFrozen(res.data);
    } catch {
      toast.error('فشل تحميل القائمة');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = async (studentId) => {
    const next = !expanded[studentId];
    setExpanded(prev => ({ ...prev, [studentId]: next }));
    if (next && !details[studentId]) {
      try {
        const res = await api.get(`/admin/student-warnings/${studentId}`);
        setDetails(prev => ({ ...prev, [studentId]: res.data }));
      } catch {
        toast.error('فشل تحميل تفاصيل الإنذارات');
      }
    }
  };

  const unfreeze = async (studentId, name) => {
    if (!window.confirm(`سيتم رفع التقييد عن "${name}" وإعادة عداد الإنذارات. هل أنت متأكد؟`)) return;
    setUnfreezing(studentId);
    try {
      await api.delete(`/admin/student-freeze/${studentId}`);
      toast.success('تم رفع التقييد بنجاح');
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل رفع التقييد');
    } finally {
      setUnfreezing(null);
    }
  };

  return (
    <Card className="border-2 border-red-200 shadow-md" data-testid="frozen-students-manager">
      <CardHeader className="bg-red-50 p-4 sm:p-5">
        <CardTitle className="font-amiri text-xl text-red-700 flex items-center gap-2">
          <ShieldAlert size={22} />
          الطلاب المُجمَّدون (إنذارات أسبوعية)
          <span className="text-xs px-2 py-0.5 rounded-full bg-red-500 text-white">{frozen.length}</span>
        </CardTitle>
        <p className="font-plex text-xs sm:text-sm text-red-500 mt-1">
          الطلاب الذين تم تجميد حساباتهم بعد 3 إنذارات خلال 3 أشهر. يمكنك رفع التقييد يدوياً.
        </p>
      </CardHeader>
      <CardContent className="p-3 sm:p-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="spinner border-4 border-red-500 border-t-transparent rounded-full w-8 h-8"></div>
          </div>
        ) : frozen.length === 0 ? (
          <p className="font-plex text-sm text-center text-muted-foreground py-6" data-testid="no-frozen">
            لا يوجد طلاب مُجمَّدون حالياً.
          </p>
        ) : (
          <div className="space-y-2">
            {frozen.map((s) => (
              <div key={s.user_id} className="border rounded-lg bg-white" data-testid={`frozen-${s.user_id}`}>
                <div className="p-3 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {s.picture ? (
                      <img src={s.picture} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                        <User size={18} className="text-red-500" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-plex font-bold text-sm text-gray-800 truncate">{s.name}</p>
                      <p className="font-plex text-xs text-gray-400 truncate">{s.email}</p>
                      <p className="font-plex text-xs text-red-500 mt-1 flex items-center gap-1">
                        <AlertCircle size={12} />
                        {s.frozen_reason || `${s.warning_count_3m} إنذارات`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleExpand(s.user_id)}
                      data-testid={`expand-${s.user_id}`}
                      className="rounded-full"
                    >
                      {expanded[s.user_id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      التفاصيل
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => unfreeze(s.user_id, s.name)}
                      disabled={unfreezing === s.user_id}
                      data-testid={`unfreeze-${s.user_id}`}
                      className="rounded-full bg-green-600 hover:bg-green-700"
                    >
                      {unfreezing === s.user_id ? (
                        <div className="spinner border-2 border-white border-t-transparent rounded-full w-3 h-3"></div>
                      ) : (
                        <><Unlock size={14} className="ml-1" />رفع التقييد</>
                      )}
                    </Button>
                  </div>
                </div>
                {expanded[s.user_id] && details[s.user_id] && (
                  <div className="border-t bg-gray-50 p-3 space-y-2" data-testid={`details-${s.user_id}`}>
                    {details[s.user_id].warnings.length === 0 ? (
                      <p className="font-plex text-xs text-gray-500">لا توجد إنذارات.</p>
                    ) : (
                      details[s.user_id].warnings.map((w) => (
                        <div key={w.warning_id} className="flex items-center justify-between gap-2 text-xs font-plex p-2 bg-white border rounded">
                          <span className="text-gray-600">
                            {new Date(w.week_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} → {new Date(w.week_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                          <span className="flex gap-1">
                            <span className={`px-2 py-0.5 rounded ${w.sessions_done < w.required_sessions ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                              {w.sessions_done}/{w.required_sessions} جلسات
                            </span>
                            <span className={`px-2 py-0.5 rounded ${w.pages_done < w.required_pages ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                              {w.pages_done}/{w.required_pages} صفحات
                            </span>
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminFrozenStudentsManager;
