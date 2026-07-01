import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, ShieldAlert, User, AlertCircle, CheckCircle2, Target } from 'lucide-react';
import api from '@/utils/api';

const Pill = ({ ok, children, ...rest }) => (
  <span
    {...rest}
    className={`px-2 py-0.5 rounded-full text-[11px] font-plex ${
      ok ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
    }`}
  >
    {children}
  </span>
);

const AllStudentsCommitments = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [showAll, setShowAll] = useState(false);
  const VISIBLE_LIMIT = 5;

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/teacher/all-students-commitments');
        setData(res.data);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    let list = data;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(s => s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q));
    }
    if (filter === 'frozen') list = list.filter(s => s.is_frozen);
    if (filter === 'warning') list = list.filter(s => s.warning_count_3m > 0 && !s.is_frozen);
    if (filter === 'no-commitment') list = list.filter(s => !s.commitment);
    return list;
  }, [data, search, filter]);

  const isSearching = search.trim().length > 0;
  const displayList = (showAll || isSearching) ? filtered : filtered.slice(0, VISIBLE_LIMIT);
  const hasMore = !showAll && !isSearching && filtered.length > VISIBLE_LIMIT;

  const counts = useMemo(() => ({
    total: data.length,
    frozen: data.filter(s => s.is_frozen).length,
    warning: data.filter(s => s.warning_count_3m > 0 && !s.is_frozen).length,
    noCommitment: data.filter(s => !s.commitment).length
  }), [data]);

  return (
    <Card data-testid="all-students-commitments" className="border-t-4 border-amber-400">
      <CardHeader className="pb-3">
        <CardTitle className="font-amiri text-xl text-amber-700 flex items-center gap-2">
          <Target size={20} />
          نظرة عامة على التزام الطلاب الأسبوعي
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500 text-white">{counts.total}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالاسم أو البريد..."
              className="pr-9 font-plex text-sm"
              data-testid="search-commitments"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {[
              ['all', `الكل (${counts.total})`],
              ['frozen', `مُجمَّد (${counts.frozen})`],
              ['warning', `عليه إنذارات (${counts.warning})`],
              ['no-commitment', `بدون التزام (${counts.noCommitment})`]
            ].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                data-testid={`filter-${k}`}
                className={`px-3 py-1.5 rounded-full text-xs font-plex transition-colors ${
                  filter === k ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="spinner border-4 border-primary border-t-transparent rounded-full w-8 h-8"></div>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center font-plex text-sm text-muted-foreground py-8">لا توجد نتائج.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-plex">
              <thead>
                <tr className="border-b text-xs text-gray-500 text-right">
                  <th className="p-2 sm:p-3 font-bold">الطالب</th>
                  <th className="p-2 sm:p-3 font-bold">الالتزام الأسبوعي</th>
                  <th className="p-2 sm:p-3 font-bold">إنجاز هذا الأسبوع</th>
                  <th className="p-2 sm:p-3 font-bold">الإنذارات</th>
                  <th className="p-2 sm:p-3 font-bold">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {displayList.map((s) => {
                  const c = s.commitment;
                  const cw = s.current_week || {};
                  const sessOk = c ? (cw.sessions_done >= c.min_sessions_per_week) : false;
                  const pagesOk = c ? (cw.pages_done >= c.min_pages_per_week) : false;
                  return (
                    <tr key={s.student_id} className="border-b hover:bg-gray-50" data-testid={`row-${s.student_id}`}>
                      <td className="p-2 sm:p-3">
                        <div className="flex items-center gap-2">
                          {s.picture ? (
                            <img src={s.picture} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                              <User size={14} className="text-gray-500" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-bold text-xs sm:text-sm truncate">{s.name}</p>
                            <p className="text-[10px] text-gray-400 truncate">{s.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-2 sm:p-3">
                        {c ? (
                          <div className="space-y-1">
                            <p className="text-[11px]">{c.min_sessions_per_week} جلسات</p>
                            <p className="text-[11px]">{c.min_pages_per_week} صفحات</p>
                          </div>
                        ) : (
                          <span className="text-[11px] text-gray-400">لم يُحدّد</span>
                        )}
                      </td>
                      <td className="p-2 sm:p-3">
                        {c ? (
                          <div className="space-y-1">
                            <Pill ok={sessOk}>{cw.sessions_done ?? 0}/{c.min_sessions_per_week} جلسات</Pill>
                            <Pill ok={pagesOk}>{cw.pages_done ?? 0}/{c.min_pages_per_week} صفحات</Pill>
                          </div>
                        ) : (
                          <span className="text-[11px] text-gray-400">-</span>
                        )}
                      </td>
                      <td className="p-2 sm:p-3">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                          s.warning_count_3m >= 3 ? 'bg-red-500 text-white' :
                          s.warning_count_3m >= 1 ? 'bg-amber-500 text-white' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {s.warning_count_3m}
                        </span>
                      </td>
                      <td className="p-2 sm:p-3">
                        {s.is_frozen ? (
                          <span className="flex items-center gap-1 text-red-600 text-[11px] font-bold">
                            <ShieldAlert size={12} />
                            مُجمَّد
                          </span>
                        ) : s.warning_count_3m > 0 ? (
                          <span className="flex items-center gap-1 text-amber-600 text-[11px]">
                            <AlertCircle size={12} />
                            تحت المراقبة
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-green-600 text-[11px]">
                            <CheckCircle2 size={12} />
                            نشط
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {(hasMore || (showAll && filtered.length > VISIBLE_LIMIT && !isSearching)) && (
              <div className="mt-3 flex items-center justify-center">
                <button
                  data-testid="toggle-show-all-commitments"
                  onClick={() => setShowAll(prev => !prev)}
                  className="px-4 py-2 rounded-full text-xs font-plex bg-primary/10 text-primary hover:bg-primary/20 font-bold"
                >
                  {showAll
                    ? 'إخفاء — اعرض 5 فقط'
                    : `عرض كل الطلاب (${filtered.length})`}
                </button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AllStudentsCommitments;
