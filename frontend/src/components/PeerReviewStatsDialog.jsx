import React, { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Calendar, Star, Award, BookOpen, AlertCircle, ClipboardCheck, TrendingUp, Sparkles } from 'lucide-react';
import { formatArabicDate } from '@/utils/formatArabicDate';

const QUALITY_SCORE = { 'ممتاز': 4, 'متوسط': 3, 'مقبول': 2, 'ضعيف': 1 };
const QUALITY_LABEL = ['—', 'ضعيف', 'مقبول', 'متوسط', 'ممتاز'];
const QUALITY_COLOR = {
  'ممتاز': 'bg-emerald-500',
  'متوسط': 'bg-sky-500',
  'مقبول': 'bg-amber-500',
  'ضعيف': 'bg-red-500',
};
const QUALITY_TEXT_COLOR = {
  'ممتاز': 'text-emerald-700',
  'متوسط': 'text-sky-700',
  'مقبول': 'text-amber-700',
  'ضعيف': 'text-red-700',
};

const formatDate = (d) => formatArabicDate(d, 'short', d);

const PeerReviewStatsDialog = ({ open, onClose, peerOverview, studentName, studentId }) => {
  const stats = useMemo(() => {
    if (!peerOverview) return null;
    const sessions = peerOverview.sessions || [];
    const evals = peerOverview.evaluations || [];
    // Only evaluations RECEIVED by this student
    const received = evals.filter(e => e.evaluatee_id === studentId);
    // Only sessions where THIS student attended
    const attended = sessions.filter(s => (s.attendance || {})[studentId] === true);
    const totalSessions = sessions.length;
    const attendanceRate = totalSessions ? Math.round((attended.length / totalSessions) * 100) : 0;
    // Quality distribution from received evals only
    const qualityCounts = { 'ممتاز': 0, 'متوسط': 0, 'مقبول': 0, 'ضعيف': 0 };
    let scoreSum = 0;
    let scoreN = 0;
    let totalMistakes = 0;
    received.forEach(e => {
      if (e.quality && qualityCounts[e.quality] !== undefined) {
        qualityCounts[e.quality] += 1;
        scoreSum += QUALITY_SCORE[e.quality];
        scoreN += 1;
      }
      totalMistakes += Number(e.mistakes_count || 0);
    });
    const avgScore = scoreN ? scoreSum / scoreN : 0;
    const avgLabel = scoreN ? QUALITY_LABEL[Math.round(avgScore)] : '—';
    const maxQ = Math.max(1, ...Object.values(qualityCounts));
    const partnerName = peerOverview.partnership
      ? (peerOverview.partnership.requester_id === studentId
          ? peerOverview.partnership.target_name
          : peerOverview.partnership.requester_name)
      : null;
    return { sessions, received, attended, totalSessions, attendanceRate, qualityCounts, avgLabel, avgScore, totalMistakes, partnerName, maxQ };
  }, [peerOverview, studentId]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="peer-review-stats-dialog">
        <DialogHeader>
          <DialogTitle className="font-amiri text-xl text-primary flex items-center gap-2 justify-end">
            <Users size={22} className="text-secondary" /> المراجعة الزوجية — {studentName}
          </DialogTitle>
        </DialogHeader>
        <DialogDescription className="font-plex text-xs text-muted-foreground text-right">
          إحصائيات الحصص التي حضرها الطالب مع قرينه، والتقييمات التي حصل عليها فقط من قرينه.
        </DialogDescription>

        {!stats || (!stats.partnerName && stats.received.length === 0 && stats.sessions.length === 0) ? (
          <Card><CardContent className="py-10 text-center font-plex text-sm text-muted-foreground">
            لا توجد بيانات مراجعة زوجية لهذا الطالب.
          </CardContent></Card>
        ) : (
          <div className="space-y-4">
            {/* Partner banner */}
            {stats.partnerName && (
              <div className="bg-gradient-to-l from-emerald-50 to-amber-50 border-2 border-emerald-200 rounded-xl p-3 flex items-center justify-between flex-wrap gap-2" data-testid="peer-partner-banner">
                <div className="flex items-center gap-2">
                  <Users size={18} className="text-emerald-700" />
                  <span className="font-amiri text-base font-bold text-primary">قرين المراجعة الحالي</span>
                </div>
                <span className="font-plex text-sm text-emerald-800 font-bold bg-white/70 px-3 py-1 rounded-full">{stats.partnerName}</span>
              </div>
            )}

            {/* Stat cards row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="peer-stat-cards">
              <StatCard icon={<Calendar size={18} className="text-blue-600" />} label="حصص حضرها" value={stats.attended.length} color="text-blue-700" />
              <StatCard icon={<TrendingUp size={18} className="text-emerald-600" />} label="نسبة حضوره" value={`${stats.attendanceRate}%`} color="text-emerald-700" />
              <StatCard icon={<ClipboardCheck size={18} className="text-amber-600" />} label="تقييمات تلقاها" value={stats.received.length} color="text-amber-700" />
              <StatCard icon={<Award size={18} className="text-violet-600" />} label="متوسط مستواه" value={stats.avgLabel} color={stats.avgLabel === '—' ? 'text-muted-foreground' : QUALITY_TEXT_COLOR[stats.avgLabel] || 'text-violet-700'} />
            </div>

            {/* Quality distribution chart */}
            {stats.received.length > 0 && (
              <Card className="border-t-4 border-secondary" data-testid="peer-quality-chart">
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-amiri text-base font-bold text-primary flex items-center gap-2 justify-end">
                      <Sparkles size={16} className="text-secondary" /> توزيع المستوى من قرينه
                    </h4>
                    {stats.totalMistakes > 0 && (
                      <span className="font-plex text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <AlertCircle size={12} /> مجموع الأخطاء: {stats.totalMistakes}
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {['ممتاز', 'متوسط', 'مقبول', 'ضعيف'].map(q => {
                      const v = stats.qualityCounts[q];
                      const pct = Math.round((v / stats.maxQ) * 100);
                      return (
                        <div key={q} className="flex items-center gap-2" data-testid={`quality-row-${q}`}>
                          <span className={`font-plex text-xs font-bold w-14 text-left ${QUALITY_TEXT_COLOR[q]}`}>{q}</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                            <div className={`${QUALITY_COLOR[q]} h-full rounded-full transition-all`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="font-plex text-xs font-bold w-8 text-right tabular-nums">{v}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Attended sessions */}
            <Card data-testid="peer-attended-sessions">
              <CardContent className="pt-5 pb-4">
                <h4 className="font-amiri text-base font-bold text-primary flex items-center gap-2 justify-end mb-3">
                  <Calendar size={16} className="text-blue-600" /> حصص المراجعة التي حضرها ({stats.attended.length})
                </h4>
                {stats.attended.length === 0 ? (
                  <p className="text-center font-plex text-sm text-muted-foreground py-3">لم يحضر أي حصة مراجعة بعد.</p>
                ) : (
                  <div className="space-y-1.5">
                    {stats.attended.slice(0, 12).map(s => {
                      const other = s.creator_id === studentId ? s.booker_name : s.creator_name;
                      return (
                        <div key={s.peer_session_id} className="flex items-center justify-between flex-wrap gap-1.5 border rounded-lg px-3 py-2 bg-blue-50/30">
                          <div className="flex items-center gap-2 font-plex text-xs">
                            <Calendar size={12} className="text-blue-600" />
                            <span className="font-bold text-primary">{formatDate(s.scheduled_time)}</span>
                            <span className="text-muted-foreground">مع {other}</span>
                          </div>
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-plex font-bold">حضر · {s.duration}د</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Received evaluations */}
            <Card data-testid="peer-received-evals">
              <CardContent className="pt-5 pb-4">
                <h4 className="font-amiri text-base font-bold text-primary flex items-center gap-2 justify-end mb-3">
                  <Star size={16} className="text-secondary" /> التقييمات التي حصل عليها من قرينه ({stats.received.length})
                </h4>
                {stats.received.length === 0 ? (
                  <p className="text-center font-plex text-sm text-muted-foreground py-3">لم يستلم أي تقييم من قرينه بعد.</p>
                ) : (
                  <div className="space-y-2">
                    {stats.received.slice(0, 12).map(e => (
                      <div key={e.evaluation_id} className="border-2 rounded-xl p-3 bg-amber-50/20" data-testid={`received-eval-${e.evaluation_id}`}>
                        <div className="flex items-center justify-between flex-wrap gap-1 mb-2">
                          <div className="flex items-center gap-1.5">
                            <BookOpen size={13} className="text-secondary" />
                            <span className="font-plex text-xs font-bold text-primary">من {e.evaluator_name}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-plex">{formatDate(e.created_at)}</span>
                        </div>
                        <div className="flex items-center flex-wrap gap-1.5 mb-1">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full text-white ${QUALITY_COLOR[e.quality] || 'bg-gray-500'}`}>{e.quality}</span>
                          {e.surah_name && <span className="text-[11px] bg-white border rounded-full px-2 py-0.5 font-plex">سورة {e.surah_name}</span>}
                          {(e.from_ayah && e.to_ayah) && <span className="text-[11px] bg-white border rounded-full px-2 py-0.5 font-plex">آية {e.from_ayah}-{e.to_ayah}</span>}
                          {e.mistakes_count > 0 && <span className="text-[11px] bg-red-50 text-red-700 border border-red-200 rounded-full px-2 py-0.5 font-plex flex items-center gap-1"><AlertCircle size={10} />{e.mistakes_count} خطأ</span>}
                        </div>
                        {e.notes && <p className="text-xs text-muted-foreground font-plex mt-1.5">📝 {e.notes}</p>}
                        {e.advice && <p className="text-xs text-amber-700 font-plex">💡 {e.advice}</p>}
                        {e.recommendations && <p className="text-xs text-sky-700 font-plex">✦ {e.recommendations}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const StatCard = ({ icon, label, value, color }) => (
  <div className="border-2 rounded-xl p-3 bg-white flex flex-col items-end gap-1 hover:shadow-sm transition-shadow">
    <div className="flex items-center justify-between w-full">
      <span className="font-plex text-[11px] text-muted-foreground">{label}</span>
      {icon}
    </div>
    <span className={`font-amiri text-2xl font-bold ${color}`}>{value}</span>
  </div>
);

export default PeerReviewStatsDialog;
