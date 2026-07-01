import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, TrendingUp, FileText, Pencil, Trash2 } from 'lucide-react';
import api from '@/utils/api';
import EditMemorizationDialog from './EditMemorizationDialog';

const QUALITY_COLORS = {
  'ممتاز': 'bg-green-500',
  'متوسط': 'bg-blue-500',
  'مقبول': 'bg-yellow-500',
  'ضعيف': 'bg-red-500'
};

const StudentProgress = ({ studentId, isTeacherView = false, isAdmin = false }) => {
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editEntry, setEditEntry] = useState(null);

  const loadProgress = async () => {
    try {
      const response = await api.get(`/students/${studentId}/progress`);
      setProgress(response.data);
    } catch {
      console.error('Failed to load progress');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEntry = async (entry) => {
  if (!entry?.progress_id) return;

  const confirmed = window.confirm(
    `هل أنت متأكد من حذف سجل حفظ سورة ${entry.surah_name}؟\nلن يظهر هذا السجل بعد الحذف في ملف الطالب أو التقرير.`
  );

  if (!confirmed) return;

  try {
    await api.delete(`/memorization-progress/${entry.progress_id}`);
    await loadProgress();
  } catch (error) {
    alert(error.response?.data?.detail || 'فشل حذف سجل الحفظ');
  }
};



  useEffect(() => {
    if (studentId) loadProgress();
  }, [studentId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <div className="border-4 border-primary border-t-transparent rounded-full w-8 h-8 mx-auto animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (!progress) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="font-plex text-gray-500">لا توجد بيانات تقدم</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="student-progress">
      {/* Weekly Summary */}
      <Card className="border-2 border-primary/20">
        <CardHeader className="bg-primary/5">
          <CardTitle className="font-amiri text-xl text-primary flex items-center gap-2">
            <TrendingUp size={24} />
            ملخص الأسبوع
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="font-amiri text-2xl font-bold text-primary">{progress.weekly_summary.sessions_count}</p>
              <p className="font-plex text-xs text-gray-600">جلسات هذا الأسبوع</p>
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <p className="font-amiri text-2xl font-bold text-green-600">{progress.weekly_summary.quality_breakdown['ممتاز']}</p>
              <p className="font-plex text-xs text-gray-600">ممتاز</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="font-amiri text-2xl font-bold text-blue-600">{progress.weekly_summary.quality_breakdown['متوسط']}</p>
              <p className="font-plex text-xs text-gray-600">متوسط</p>
            </div>
            <div className="p-3 bg-yellow-50 rounded-lg">
              <p className="font-amiri text-2xl font-bold text-yellow-600">{progress.weekly_summary.quality_breakdown['مقبول']}</p>
              <p className="font-plex text-xs text-gray-600">مقبول</p>
            </div>
            <div className="p-3 bg-red-50 rounded-lg">
              <p className="font-amiri text-2xl font-bold text-red-600">{progress.weekly_summary.quality_breakdown['ضعيف']}</p>
              <p className="font-plex text-xs text-gray-600">ضعيف</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Full Memorization History */}
      <Card>
        <CardHeader>
          <CardTitle className="font-amiri text-xl text-primary flex items-center gap-2">
            <BookOpen size={24} />
            سجل الحفظ الكامل ({progress.total_entries} سجل)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {progress.progress_log.length > 0 ? (
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {progress.progress_log.map((entry) => (
                <div
                  key={entry.progress_id}
                  className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                  data-testid={`progress-entry-${entry.progress_id}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-amiri text-lg font-bold text-primary">
                        سورة {entry.surah_name}
                      </p>
                      <p className="font-plex text-sm text-gray-600">
                        من الآية {entry.from_ayah} إلى {entry.to_ayah}
                      </p>
                      {entry.teacher_name && (
                        <p className="font-plex text-xs text-gray-400 mt-0.5">
                          المعلم: {entry.teacher_name}
                        </p>
                      )}
                      {entry.last_edited_by_name && (
                        <p className="font-plex text-[10px] text-amber-500 mt-0.5">
                          آخر تعديل: {entry.last_edited_by_name} - {new Date(entry.last_edited_at).toLocaleDateString('en-US')}
                        </p>
                      )}
                      {entry.notes && (
                        <p className="font-plex text-sm text-gray-500 mt-1">{entry.notes}</p>
                      )}
                    </div>
                    <div className="text-left flex-shrink-0 flex items-start gap-2">
                      {isTeacherView && (
                          <button
                            data-testid={`edit-mem-btn-${entry.progress_id}`}
                            onClick={() => setEditEntry(entry)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors"
                            title="تعديل"
                          >
                            <Pencil size={14} />
                          </button>
                        )}

                        {isAdmin && (
                          <button
                            data-testid={`delete-mem-btn-${entry.progress_id}`}
                            onClick={() => handleDeleteEntry(entry)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="حذف"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      <div>
                        <span className={`px-3 py-1 rounded-full text-white text-sm ${QUALITY_COLORS[entry.quality] || 'bg-gray-500'}`}>
                          {entry.quality}
                        </span>
                        <p className="font-plex text-xs text-gray-400 mt-2 text-center">
                          {new Date(entry.created_at).toLocaleDateString('en-US')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="font-plex text-gray-500 text-center py-6">
              لا يوجد سجل حفظ حتى الآن
            </p>
          )}
        </CardContent>
      </Card>

      {/* Sessions with Notes */}
      {progress.sessions_with_notes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-amiri text-xl text-primary flex items-center gap-2">
              <FileText size={24} />
              ملاحظات الشيخ
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {progress.sessions_with_notes.map((session) => (
                <div key={session.session_id} className="p-4 border rounded-lg bg-amber-50 border-amber-200">
                  <p className="font-plex text-sm text-gray-500 mb-2">
                    {new Date(session.scheduled_time).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                    {session.teacher_name && ` - ${session.teacher_name}`}
                  </p>
                  {session.instructor_notes?.mistakes && (
                    <div className="mb-2">
                      <p className="font-plex font-bold text-red-600 text-sm">الأخطاء:</p>
                      <p className="font-plex text-sm text-gray-700">{session.instructor_notes.mistakes}</p>
                    </div>
                  )}
                  {session.instructor_notes?.corrections && (
                    <div className="mb-2">
                      <p className="font-plex font-bold text-blue-600 text-sm">التصحيحات:</p>
                      <p className="font-plex text-sm text-gray-700">{session.instructor_notes.corrections}</p>
                    </div>
                  )}
                  {session.instructor_notes?.recommendations && (
                    <div>
                      <p className="font-plex font-bold text-green-600 text-sm">التوصيات:</p>
                      <p className="font-plex text-sm text-gray-700">{session.instructor_notes.recommendations}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <EditMemorizationDialog
        open={!!editEntry}
        onClose={() => setEditEntry(null)}
        entry={editEntry}
        onSaved={loadProgress}
        isAdmin={isAdmin}
      />
    </div>
  );
};

export default StudentProgress;
