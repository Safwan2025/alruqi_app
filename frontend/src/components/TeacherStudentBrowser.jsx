import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, User, ChevronRight, BookOpen, FileText } from 'lucide-react';
import api from '@/utils/api';
import StudentProgress from '@/components/StudentProgress';
import StudentNotesArchive from '@/components/StudentNotesArchive';
import useShowMoreList from '@/hooks/useShowMoreList';
import ShowMoreButton from '@/components/ShowMoreButton';

/**
 * Lightweight student browser used by the Teacher Dashboard.
 * Lists all students with search; clicking a student opens a focused view.
 *
 * Props:
 *   view: 'memorization' | 'notes'
 */
const TeacherStudentBrowser = ({ view, isAdmin = false }) => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/teacher/students-points');
        if (!cancelled) {
          setStudents(res.data.map(s => ({ id: s.user_id, name: s.name, email: s.email, picture: s.picture_url })));
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter(s =>
      s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q)
    );
  }, [students, search]);

  // عرض 5 طلاب أولًا ثم "عرض المزيد" (+5)، ويعود إلى 5 عند تغيّر البحث
  const {
    visible: visibleStudents,
    canShowMore,
    showMore,
    total: totalStudents,
    shown: shownStudents,
  } = useShowMoreList(filtered, 5, search);

  const Icon = view === 'memorization' ? BookOpen : FileText;
  const headerLabel = view === 'memorization' ? 'سجل حفظ الطالب' : 'ملاحظات وتقييمات الطالب';

  if (selected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Icon size={18} className="text-primary" />
            </div>
            <div>
              <h3 className="font-amiri text-lg sm:text-xl font-bold text-primary">{headerLabel}</h3>
              <p className="font-plex text-sm text-muted-foreground">{selected.name}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelected(null)}
            data-testid="back-to-students-btn"
            className="rounded-full"
          >
            <ChevronRight size={16} className="rotate-180 ml-1" />
            العودة لقائمة الطلاب
          </Button>
        </div>
        {view === 'memorization' ? (
          <StudentProgress
          studentId={selected.id}
          isTeacherView={true}
          isAdmin={isAdmin}
        />
        ) : (
          <StudentNotesArchive studentId={selected.id} studentName={selected.name} isTeacher={true} isAdmin={isAdmin} />
        )}
      </div>
    );
  }

  return (
    <div data-testid={`teacher-${view}-browser`}>
      <div className="relative mb-4">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث عن طالب بالاسم أو البريد..."
          className="pr-10 font-plex"
          data-testid={`search-students-${view}`}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="spinner border-4 border-primary border-t-transparent rounded-full w-8 h-8"></div>
        </div>
      ) : filtered.length === 0 ? (
        <Card className="text-center p-8">
          <User className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
          <p className="font-plex text-sm text-muted-foreground">لا يوجد طلاب لعرضهم</p>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y max-h-[600px] overflow-y-auto">
              {visibleStudents.map((s) => (
                <button
                  key={s.id}
                  data-testid={`browse-student-${s.id}`}
                  onClick={() => setSelected(s)}
                  className="w-full flex items-center justify-between gap-3 p-3 sm:p-4 hover:bg-gray-50 transition-colors text-right"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {s.picture ? (
                      <img src={s.picture} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                        <User size={18} className="text-gray-500" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-plex font-bold text-gray-800 text-sm truncate">{s.name}</p>
                      <p className="font-plex text-xs text-gray-400 truncate">{s.email}</p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-gray-300 flex-shrink-0 rotate-180" />
                </button>
              ))}
            </div>
            <ShowMoreButton
              canShowMore={canShowMore}
              onShowMore={showMore}
              total={totalStudents}
              shown={shownStudents}
              testId={`browse-students-show-more-${view}`}
              className="pb-3"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TeacherStudentBrowser;
