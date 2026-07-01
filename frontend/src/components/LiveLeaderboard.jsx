import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Trophy, Crown, Medal, Award, Target } from 'lucide-react';
import api from '@/utils/api';

/**
 * Polls the live leaderboard and renders it with optional self-highlight.
 *
 * Props:
 *   liveId: string (required)
 *   selfUserId: string (optional) — row matching this id gets highlighted
 *   variant: 'compact' | 'full' (default 'compact')
 *   pollIntervalMs: number (default 3000)
 *   visible: bool — pause polling when false (e.g. dialog tab hidden)
 *   title: optional custom heading
 */
const RANK_STYLES = [
  { wrap: 'bg-gradient-to-l from-yellow-400 to-amber-300 text-amber-900 border-amber-400', icon: Crown, iconColor: 'text-amber-700', label: 'الأول' },
  { wrap: 'bg-gradient-to-l from-gray-300 to-gray-200 text-gray-800 border-gray-400', icon: Medal, iconColor: 'text-gray-600', label: 'الثاني' },
  { wrap: 'bg-gradient-to-l from-orange-300 to-orange-200 text-orange-900 border-orange-400', icon: Medal, iconColor: 'text-orange-700', label: 'الثالث' },
];

const LiveLeaderboard = ({
  liveId,
  selfUserId,
  variant = 'compact',
  pollIntervalMs = 3000,
  visible = true,
  title,
}) => {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (!liveId) return;
    try {
      const res = await api.get(`/competitions/live/${liveId}/leaderboard`);
      setData(res.data);
      setLoaded(true);
    } catch {
      // ignore — dialog may have been closed or perms changed
    }
  }, [liveId]);

  useEffect(() => {
    if (!visible || !liveId) return;
    fetchData();
    timerRef.current = setInterval(fetchData, pollIntervalMs);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [visible, liveId, pollIntervalMs, fetchData]);

  if (!liveId) return null;
  const rows = data?.leaderboard || [];

  if (loaded && rows.length === 0) {
    return (
      <div className="border rounded-xl p-3 bg-gray-50 text-center font-plex text-xs text-muted-foreground" data-testid="leaderboard-empty">
        لا توجد نتائج بعد
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="border rounded-xl p-3 text-center text-muted-foreground font-plex text-xs">
        جاري تحميل النتائج...
      </div>
    );
  }

  const isFull = variant === 'full';
  // Podium top 3 (only for full variant)
  const top3 = isFull ? rows.slice(0, 3) : [];
  const topByPlace = { 1: top3[0], 2: top3[1], 3: top3[2] };
  const restRows = isFull ? rows.slice(3) : rows;

  return (
    <div className={`border-2 rounded-2xl ${isFull ? 'p-3 sm:p-5 bg-white' : 'p-3 bg-white'}`} data-testid="live-leaderboard">
      <div className="flex items-center justify-between mb-3">
        <p className="font-amiri text-base sm:text-lg font-bold text-primary flex items-center gap-1.5">
          <Trophy size={isFull ? 20 : 14} className="text-secondary" />
          {title || (isFull ? 'النتائج النهائية' : 'الترتيب الحالي')}
        </p>
        {data?.questions_seen != null && data?.total_questions != null && (
          <span className="font-plex text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full" data-testid="leaderboard-progress">
            {data.questions_seen} / {data.total_questions} أسئلة
          </span>
        )}
      </div>

      {/* Podium (full variant + at least 1 result) */}
      {isFull && top3.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-4 items-end" data-testid="leaderboard-podium">
          {[2, 1, 3].map((place) => {
            const r = topByPlace[place];
            if (!r) return <div key={place} className="invisible" />;
            const style = RANK_STYLES[place - 1];
            const Icon = style.icon;
            const heightClass = place === 1 ? 'h-32 sm:h-36' : place === 2 ? 'h-24 sm:h-28' : 'h-20 sm:h-24';
            const isSelf = selfUserId && r.user_id === selfUserId;
            return (
              <div key={place} className="text-center" data-testid={`podium-place-${place}`}>
                <div className={`inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full border-4 border-white shadow-md ${style.wrap} mb-1`}>
                  <Icon size={20} className={style.iconColor} />
                </div>
                <div className={`px-2 py-1 rounded-lg text-xs sm:text-sm font-plex font-bold truncate ${
                  isSelf ? 'ring-2 ring-primary ring-offset-1' : ''
                }`} title={r.name}>
                  {r.name}
                </div>
                <div className={`relative ${heightClass} mt-1 rounded-t-xl border-2 border-b-0 ${style.wrap} flex flex-col items-center justify-end pb-2 px-1`}>
                  <div className="font-amiri text-2xl sm:text-3xl font-bold">{r.total_points}</div>
                  <div className="text-[10px] opacity-80 font-plex">نقطة</div>
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-white text-primary border-2 border-current rounded-full w-7 h-7 flex items-center justify-center font-amiri font-bold text-sm">
                    {place}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ol className="space-y-1.5" data-testid="leaderboard-list">
        {(isFull ? restRows : rows).map((r) => {
          const isTop3 = r.rank <= 3;
          const style = isTop3 ? RANK_STYLES[r.rank - 1] : null;
          const Icon = style?.icon;
          const isSelf = selfUserId && r.user_id === selfUserId;
          // In full mode, skip top 3 (already in podium)
          if (isFull && isTop3) return null;
          return (
            <li
              key={r.user_id}
              data-testid={`leaderboard-row-${r.rank}`}
              className={`flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 rounded-lg border font-plex transition-all ${
                isTop3 ? style.wrap : 'bg-gray-50 border-gray-200 text-gray-700'
              } ${isSelf ? 'ring-2 ring-primary ring-offset-1' : ''}`}
            >
              <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-amiri font-bold flex-shrink-0 ${
                isTop3 ? 'bg-white/40' : 'bg-white border'
              }`}>
                {Icon ? <Icon size={16} className={style.iconColor} /> : <span className="text-sm">{r.rank}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm sm:text-base font-bold truncate flex items-center gap-1.5">
                  {r.name}
                  {isSelf && <span className="text-[10px] bg-primary text-white px-1.5 py-0.5 rounded-full">أنت</span>}
                </p>
                {isFull && (
                  <div className="flex items-center gap-2 text-[10px] sm:text-xs opacity-80 mt-0.5 flex-wrap">
                    <span className="inline-flex items-center gap-0.5"><Target size={10} /> {r.correct_count} صح</span>
                    <span>•</span>
                    <span>{r.accuracy_pct}% دقّة</span>
                  </div>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-amiri text-lg sm:text-xl font-bold tabular-nums flex items-center gap-1" data-testid={`leaderboard-points-${r.rank}`}>
                  <Award size={isFull ? 14 : 12} />
                  {r.total_points}
                </div>
                {!isFull && (
                  <div className="text-[10px] opacity-70">{r.correct_count} صح • {r.accuracy_pct}%</div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default LiveLeaderboard;
