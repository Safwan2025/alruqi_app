import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, Crown, Medal, Calendar, Target, Award, Users } from 'lucide-react';
import api from '@/utils/api';

/**
 * Displays a list of past competition results for either the current student
 * (own=true) or a specific student id (teacher/admin view).
 *
 * Props:
 *   own?: bool — use /student/competition-history (student self)
 *   studentId?: string — teacher/admin view using /teacher/students/{id}/competition-history
 *   title?: string
 */
const RANK_BADGE = (rank) => {
  if (rank === 1) return { Icon: Crown, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-300', label: 'الأول' };
  if (rank === 2) return { Icon: Medal, color: 'text-gray-500', bg: 'bg-gray-50 border-gray-300', label: 'الثاني' };
  if (rank === 3) return { Icon: Medal, color: 'text-orange-600', bg: 'bg-orange-50 border-orange-300', label: 'الثالث' };
  return { Icon: null, color: 'text-gray-500', bg: 'bg-white border-gray-200', label: null };
};

const CompetitionHistoryList = ({ own = false, studentId, title = 'سجل المسابقات' }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const url = own
          ? '/student/competition-history'
          : `/teacher/students/${studentId}/competition-history`;
        const res = await api.get(url);
        if (!cancelled) setItems(res.data || []);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (own || studentId) load();
    return () => { cancelled = true; };
  }, [own, studentId]);

  return (
    <Card className="border-t-4 border-secondary" data-testid="competition-history-list">
      <CardHeader className="pb-3">
        <CardTitle className="font-amiri text-lg sm:text-xl text-primary flex items-center gap-2 justify-end">
          <Trophy size={20} className="text-secondary" /> {title}
          {items.length > 0 && (
            <span className="bg-secondary text-secondary-foreground text-xs px-2 py-0.5 rounded-full">{items.length}</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="spinner border-4 border-primary border-t-transparent rounded-full w-8 h-8"></div>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-8" data-testid="competition-history-empty">
            <Trophy size={36} className="mx-auto text-muted-foreground mb-2" />
            <p className="font-plex text-sm text-muted-foreground">لا توجد مسابقات مكتملة بعد</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map((it) => {
              const rb = RANK_BADGE(it.rank);
              const Icon = rb.Icon;
              return (
                <div
                  key={it.result_id}
                  className={`rounded-xl border p-3 sm:p-4 flex flex-col sm:flex-row gap-3 ${rb.bg}`}
                  data-testid={`competition-history-row-${it.result_id}`}
                >
                  <div className="flex items-center gap-2 sm:flex-col sm:items-center sm:gap-1 sm:w-20 flex-shrink-0">
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center bg-white border ${rb.color}`}>
                      {Icon ? <Icon size={20} /> : <span className="font-amiri font-bold text-base">{it.rank}</span>}
                    </div>
                    <div className="sm:text-center">
                      <p className="font-amiri font-bold text-base text-primary">المركز {it.rank}</p>
                      <p className="font-plex text-[10px] text-muted-foreground">من {it.participants_count}</p>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-amiri text-base sm:text-lg font-bold text-primary truncate">{it.competition_title}</h4>
                    <p className="font-plex text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Calendar size={12} />
                      {new Date(it.completed_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-xs font-plex">
                      <div className="bg-white/70 rounded px-2 py-1 border">
                        <p className="text-[10px] text-muted-foreground">النقاط</p>
                        <p className="font-amiri font-bold text-primary flex items-center gap-1">
                          <Award size={11} /> {it.total_points}
                        </p>
                      </div>
                      <div className="bg-white/70 rounded px-2 py-1 border">
                        <p className="text-[10px] text-muted-foreground">إجابات صحيحة</p>
                        <p className="font-amiri font-bold text-green-700 flex items-center gap-1">
                          <Target size={11} /> {it.correct_count}/{it.total_questions}
                        </p>
                      </div>
                      <div className="bg-white/70 rounded px-2 py-1 border">
                        <p className="text-[10px] text-muted-foreground">الدقّة</p>
                        <p className="font-amiri font-bold text-blue-700">{it.accuracy_pct}%</p>
                      </div>
                      <div className="bg-white/70 rounded px-2 py-1 border">
                        <p className="text-[10px] text-muted-foreground">المشاركون</p>
                        <p className="font-amiri font-bold text-purple-700 flex items-center gap-1">
                          <Users size={11} /> {it.participants_count}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CompetitionHistoryList;
