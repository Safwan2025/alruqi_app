import React, { useState, useEffect, useCallback } from 'react';
import { Target, AlertCircle, ShieldAlert, Unlock, CheckCircle2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import api from '@/utils/api';

const StudentCommitmentSection = ({ studentId, isAdmin = false }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unfreezing, setUnfreezing] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const res = await api.get(`/teacher/student-commitment/${studentId}`);
      setData(res.data);
    } catch {
      // silently ignore — section won't render
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  const handleUnfreeze = async () => {
    if (!window.confirm('سيتم رفع التقييد عن الطالب. هل أنت متأكد؟')) return;
    setUnfreezing(true);
    try {
      await api.delete(`/admin/student-freeze/${studentId}`);
      toast.success('تم رفع التقييد');
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل رفع التقييد');
    } finally {
      setUnfreezing(false);
    }
  };

  const handleDeleteWarning = async (warningId) => {
    if (!window.confirm('سيتم حذف هذا الإنذار نهائياً. هل أنت متأكد؟')) return;
    setDeletingId(warningId);
    try {
      const res = await api.delete(`/admin/student-warnings/${warningId}`);
      toast.success(res.data?.message || 'تم حذف الإنذار');
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الحذف');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return null;
  if (!data) return null;

  const c = data.commitment;
  const cw = data.current_week || {};
  const warnings = data.warnings || [];
  const isFrozen = data.student?.is_frozen;
  const reqSessions = c?.min_sessions_per_week;
  const reqPages = c?.min_pages_per_week;
  const metSessions = reqSessions ? (cw.sessions_done >= reqSessions) : null;
  const metPages = reqPages ? (cw.pages_done >= reqPages) : null;

  return (
    <div className="border-t-4 border-amber-400 rounded-xl bg-amber-50/40 p-3 sm:p-4 space-y-3" data-testid="commitment-section">
      <h3 className="font-amiri text-lg sm:text-xl font-bold text-amber-700 flex items-center gap-2">
        <Target size={18} />
        الالتزام الأسبوعي والإنذارات
      </h3>

      {/* Frozen Banner */}
      {isFrozen && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-3 flex items-start justify-between gap-3 flex-wrap" data-testid="profile-frozen-banner">
          <div className="flex items-start gap-2">
            <ShieldAlert className="text-red-600 flex-shrink-0 mt-0.5" size={18} />
            <div>
              <p className="font-plex font-bold text-red-700 text-sm">الحساب مُقيَّد</p>
              <p className="font-plex text-xs text-red-600">{data.student?.frozen_reason || 'تم تجاوز عدد الإنذارات.'}</p>
              {data.student?.frozen_at && (
                <p className="font-plex text-[11px] text-red-500 mt-0.5">
                  تاريخ التقييد: {new Date(data.student.frozen_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                </p>
              )}
            </div>
          </div>
          {isAdmin && (
            <Button
              size="sm"
              onClick={handleUnfreeze}
              disabled={unfreezing}
              data-testid="profile-unfreeze-btn"
              className="rounded-full bg-green-600 hover:bg-green-700"
            >
              {unfreezing ? (
                <div className="spinner border-2 border-white border-t-transparent rounded-full w-3 h-3"></div>
              ) : (
                <><Unlock size={12} className="ml-1" />رفع التقييد</>
              )}
            </Button>
          )}
        </div>
      )}

      {/* Commitment + Current Week */}
      {!c ? (
        <p className="font-plex text-sm text-muted-foreground py-2" data-testid="no-commitment">
          لم يُحدد الطالب التزامه الأسبوعي بعد.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {/* Sessions */}
          <div className={`rounded-lg p-3 border ${metSessions ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`} data-testid="sessions-progress">
            <p className="font-plex text-[11px] sm:text-xs text-gray-500 mb-1">الجلسات هذا الأسبوع</p>
            <div className="flex items-baseline gap-1">
              <span className={`font-amiri text-xl sm:text-2xl font-bold ${metSessions ? 'text-green-700' : 'text-amber-700'}`}>{cw.sessions_done ?? 0}</span>
              <span className="font-plex text-xs text-gray-500">/ {reqSessions}</span>
              {metSessions && <CheckCircle2 size={14} className="text-green-600 mr-auto" />}
            </div>
          </div>
          {/* Pages */}
          <div className={`rounded-lg p-3 border ${metPages ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`} data-testid="pages-progress">
            <p className="font-plex text-[11px] sm:text-xs text-gray-500 mb-1">الصفحات هذا الأسبوع</p>
            <div className="flex items-baseline gap-1">
              <span className={`font-amiri text-xl sm:text-2xl font-bold ${metPages ? 'text-green-700' : 'text-amber-700'}`}>{cw.pages_done ?? 0}</span>
              <span className="font-plex text-xs text-gray-500">/ {reqPages}</span>
              {metPages && <CheckCircle2 size={14} className="text-green-600 mr-auto" />}
            </div>
          </div>
        </div>
      )}

      {/* Warnings */}
      <div className="bg-white rounded-lg border p-3">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <span className="font-plex text-sm font-bold flex items-center gap-1.5 text-gray-700">
            <AlertCircle size={14} className={warnings.length >= 2 ? 'text-red-500' : 'text-amber-500'} />
            الإنذارات (آخر 3 أشهر)
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${warnings.length >= 3 ? 'bg-red-500 text-white' : warnings.length >= 1 ? 'bg-amber-500 text-white' : 'bg-green-500 text-white'}`} data-testid="profile-warning-count">
            {warnings.length}
          </span>
        </div>
        {warnings.length === 0 ? (
          <p className="font-plex text-xs text-muted-foreground">لا توجد إنذارات.</p>
        ) : (
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {warnings.map((w) => (
              <div key={w.warning_id} className="flex items-center justify-between gap-2 text-[11px] sm:text-xs font-plex p-1.5 sm:p-2 bg-amber-50 border border-amber-100 rounded" data-testid={`profile-warning-${w.warning_id}`}>
                <span className="text-gray-700 whitespace-nowrap">
                  {new Date(w.week_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} → {new Date(w.week_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <span className="flex gap-1 flex-wrap justify-end items-center">
                  <span className={`px-1.5 py-0.5 rounded ${w.sessions_done < w.required_sessions ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {w.sessions_done}/{w.required_sessions} جلسات
                  </span>
                  <span className={`px-1.5 py-0.5 rounded ${w.pages_done < w.required_pages ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {w.pages_done}/{w.required_pages} صفحات
                  </span>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleDeleteWarning(w.warning_id)}
                      disabled={deletingId === w.warning_id}
                      data-testid={`delete-warning-${w.warning_id}`}
                      title="حذف الإنذار (للمشرف فقط)"
                      className="text-red-600 hover:bg-red-100 rounded p-1 disabled:opacity-50"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentCommitmentSection;
