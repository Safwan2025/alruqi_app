import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileText, Calendar, Users, Trophy, Target, AlertTriangle, CheckCircle2, Crown, Medal, Printer } from 'lucide-react';
import api from '@/utils/api';

/**
 * Detailed report dialog for a completed live competition (host/admin view).
 * Props: open, onClose, liveId
 */
const RANK_STYLE = (rank) => {
  if (rank === 1) return { Icon: Crown, color: 'bg-amber-100 text-amber-800 border-amber-300', iconColor: 'text-amber-700' };
  if (rank === 2) return { Icon: Medal, color: 'bg-gray-100 text-gray-700 border-gray-300', iconColor: 'text-gray-500' };
  if (rank === 3) return { Icon: Medal, color: 'bg-orange-100 text-orange-800 border-orange-300', iconColor: 'text-orange-600' };
  return { Icon: null, color: 'bg-white text-gray-700 border-gray-200', iconColor: 'text-gray-400' };
};

const CompetitionReportDialog = ({ open, onClose, liveId }) => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !liveId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/competitions/live/${liveId}/report`);
        if (!cancelled) setReport(res.data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [open, liveId]);

  const handlePrint = () => {
    // Use the browser's native print of the dialog content
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="competition-report-dialog">
        <DialogHeader>
          <DialogTitle className="font-amiri text-xl text-primary flex items-center gap-2 justify-end">
            <FileText size={18} />
            تقرير المسابقة
          </DialogTitle>
        </DialogHeader>

        {loading || !report ? (
          <div className="flex justify-center py-10">
            <div className="spinner border-4 border-primary border-t-transparent rounded-full w-10 h-10"></div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Header */}
            <div className="bg-gradient-to-l from-primary to-primary/80 text-white rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Trophy size={22} className="text-secondary" />
                <h3 className="font-amiri text-xl sm:text-2xl font-bold">{report.competition_title}</h3>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm opacity-90 font-plex">
                {report.ended_at && (
                  <span className="flex items-center gap-1"><Calendar size={12} />
                    {new Date(report.ended_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                )}
                <span className="flex items-center gap-1"><Users size={12} /> {report.participants_count} طالب</span>
                <span className="flex items-center gap-1"><Target size={12} /> {report.total_questions} أسئلة</span>
                {report.host_name && <span>• المعلم: {report.host_name}</span>}
              </div>
            </div>

            {/* Leaderboard */}
            <div>
              <p className="font-amiri text-base sm:text-lg font-bold text-primary mb-2 flex items-center gap-1.5">
                <Trophy size={16} className="text-secondary" /> ترتيب الطلاب
              </p>
              {report.leaderboard.length === 0 ? (
                <p className="text-center text-muted-foreground font-plex text-sm py-4">لا يوجد طلاب</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm font-plex" data-testid="report-leaderboard-table">
                    <thead>
                      <tr className="bg-muted text-muted-foreground">
                        <th className="text-right p-2">المركز</th>
                        <th className="text-right p-2">الطالب</th>
                        <th className="text-center p-2">النقاط</th>
                        <th className="text-center p-2 hidden sm:table-cell">صحيحة</th>
                        <th className="text-center p-2 hidden sm:table-cell">خطأ</th>
                        <th className="text-center p-2 hidden sm:table-cell">بدون إجابة</th>
                        <th className="text-center p-2">الدقّة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.leaderboard.map((r) => {
                        const rs = RANK_STYLE(r.rank);
                        const Icon = rs.Icon;
                        return (
                          <tr key={r.user_id} className={`border-b ${rs.color}`} data-testid={`report-row-${r.rank}`}>
                            <td className="p-2">
                              <div className="flex items-center gap-1 font-bold">
                                {Icon ? <Icon size={14} className={rs.iconColor} /> : null}
                                {r.rank}
                              </div>
                            </td>
                            <td className="p-2 font-bold">{r.name}</td>
                            <td className="p-2 text-center font-amiri font-bold">{r.total_points}</td>
                            <td className="p-2 text-center hidden sm:table-cell text-green-700">{r.correct_count}</td>
                            <td className="p-2 text-center hidden sm:table-cell text-red-600">{r.wrong_count}</td>
                            <td className="p-2 text-center hidden sm:table-cell text-gray-500">{r.unanswered_count}</td>
                            <td className="p-2 text-center font-bold text-blue-700">{r.accuracy_pct}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Difficult questions */}
            <div>
              <p className="font-amiri text-base sm:text-lg font-bold text-primary mb-2 flex items-center gap-1.5">
                <AlertTriangle size={16} className="text-amber-500" /> الأسئلة الأكثر صعوبة
              </p>
              {(report.difficult_questions || []).length === 0 ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center font-plex text-xs text-green-700" data-testid="no-difficult-questions">
                  <CheckCircle2 size={14} className="inline ml-1" /> لا توجد أسئلة صعبة. الطلاب أحسنوا في كل الأسئلة!
                </div>
              ) : (
                <div className="space-y-1.5" data-testid="difficult-questions-list">
                  {report.difficult_questions.map((q) => (
                    <div
                      key={q.question_id}
                      className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 font-plex text-xs sm:text-sm"
                      data-testid={`difficult-q-${q.question_id}`}
                    >
                      <p className="font-bold">س{(q.order ?? 0) + 1}. {q.question_text}</p>
                      <p className="text-amber-700 mt-1">
                        نسبة الإجابات الصحيحة: <span className="font-bold">{q.correct_rate_pct}%</span>
                        <span className="mx-2">•</span>
                        صحيحة: {q.correct_count}/{report.participants_count}
                        <span className="mx-2">•</span>
                        بدون إجابة: {q.unanswered_count}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* All questions breakdown */}
            <details className="rounded-lg border bg-white">
              <summary className="cursor-pointer px-3 py-2 font-amiri text-sm font-bold text-primary">
                تفاصيل كل الأسئلة ({report.question_stats.length})
              </summary>
              <div className="p-2 space-y-1.5">
                {report.question_stats.map((q) => (
                  <div key={q.question_id} className="font-plex text-xs p-2 border rounded bg-gray-50">
                    <p className="font-bold">س{(q.order ?? 0) + 1}. {q.question_text}</p>
                    <p className="text-muted-foreground mt-1">
                      صحيحة: <span className="text-green-700 font-bold">{q.correct_count}</span>
                      <span className="mx-1">/</span>
                      خطأ: <span className="text-red-600 font-bold">{q.wrong_count}</span>
                      <span className="mx-1">/</span>
                      بدون إجابة: <span className="text-gray-500 font-bold">{q.unanswered_count}</span>
                      <span className="mx-2">•</span>
                      الدقّة: <span className="font-bold text-blue-700">{q.correct_rate_pct}%</span>
                    </p>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button onClick={handlePrint} variant="outline" className="rounded-full" data-testid="print-report-btn">
            <Printer size={14} className="ml-1" /> طباعة
          </Button>
          <Button variant="ghost" onClick={onClose} className="rounded-full">إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CompetitionReportDialog;
