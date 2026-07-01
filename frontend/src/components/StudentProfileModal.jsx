import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  User, Calendar, BookOpen, Star, TrendingUp, Clock, 
  CheckCircle, XCircle, FileText, Award, BarChart3, Check, Printer, Pencil, Users
} from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';
import StudentNotesArchive from './StudentNotesArchive';
import StudentCommitmentSection from './StudentCommitmentSection';
import EditMemorizationDialog from './EditMemorizationDialog';
import ReportPeriodDialog from './ReportPeriodDialog';
import CompetitionHistoryList from './CompetitionHistoryList';
import WeeklyPlanBuilder from './WeeklyPlanBuilder';
import PeerReviewStatsDialog from './PeerReviewStatsDialog';
import { generateStudentReport } from '@/utils/generateStudentReport';
import SessionNotesDialog from './SessionNotesDialog';

// Rating colors
const RATING_COLORS = {
  'ممتاز': 'bg-green-500',
  'متوسط': 'bg-blue-500',
  'مقبول': 'bg-yellow-500',
  'ضعيف': 'bg-red-500'
};

// Status colors
const STATUS_COLORS = {
  'completed': 'bg-green-100 text-green-700',
  'scheduled': 'bg-blue-100 text-blue-700',
  'cancelled': 'bg-red-100 text-red-700'
};

const STATUS_TEXT = {
  'completed': 'مكتمل',
  'scheduled': 'مجدول',
  'cancelled': 'ملغي'
};

// Stat Card Component
const StatCard = ({ icon: Icon, label, value, subValue, color = 'text-primary', bgColor = 'bg-primary/10' }) => (
  <div className={`${bgColor} rounded-xl p-4 text-center`}>
    <Icon className={`mx-auto ${color} mb-2`} size={24} />
    <p className={`font-amiri text-2xl font-bold ${color}`}>{value}</p>
    <p className="font-plex text-xs text-gray-600">{label}</p>
    {subValue && <p className="font-plex text-xs text-gray-400 mt-1">{subValue}</p>}
  </div>
);

// Attendance Chart
const AttendanceChart = ({ data }) => {
  const maxValue = Math.max(...data.map(d => d.total), 1);
  
  return (
    <div className="space-y-2">
      {data.map((month, index) => (
        <div key={month.month} className="flex items-center gap-3">
          <span className="font-plex text-xs text-gray-500 w-20 text-left">
            {new Date(month.month + '-01').toLocaleDateString('ar-SA', { month: 'short', year: '2-digit' })}
          </span>
          <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden flex">
            <div 
              className="h-full bg-green-500 transition-all duration-500"
              style={{ width: `${(month.completed / maxValue) * 100}%` }}
              title={`مكتمل: ${month.completed}`}
            />
            <div 
              className="h-full bg-red-400 transition-all duration-500"
              style={{ width: `${(month.cancelled_by_student / maxValue) * 100}%` }}
              title={`ملغي: ${month.cancelled_by_student}`}
            />
          </div>
          <span className="font-plex text-xs text-gray-600 w-12">
            {month.attendance_rate}%
          </span>
        </div>
      ))}
      <div className="flex items-center gap-4 justify-center mt-2 text-xs">
        <span className="flex items-center gap-1">
          <div className="w-3 h-3 bg-green-500 rounded"></div>
          <span className="font-plex text-gray-500">مكتمل</span>
        </span>
        <span className="flex items-center gap-1">
          <div className="w-3 h-3 bg-red-400 rounded"></div>
          <span className="font-plex text-gray-500">ملغي</span>
        </span>
      </div>
    </div>
  );
};

// Main Component
const StudentProfileModal = ({ open, onClose, studentId, studentName, isAdmin = false }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showFullNotes, setShowFullNotes] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [weeklyPlanOpen, setWeeklyPlanOpen] = useState(false);
  const [peerStatsOpen, setPeerStatsOpen] = useState(false);
  const [peerOverview, setPeerOverview] = useState(null);
  // P3: session evaluation dialog — opened from any past session inside the
  // student profile. Uses the exact same SessionNotesDialog that the
  // teacher dashboard uses (which contains the attendance-vs-evaluation
  // separation fix and the "no memorization_entries on absence" fix).
  const [evalDialog, setEvalDialog] = useState({ open: false, session: null });

  useEffect(() => {
    if (!open || !studentId) return;
    let alive = true;
    api.get(`/teacher/students/${studentId}/peer-overview`)
      .then(r => { if (alive) setPeerOverview(r.data); })
      .catch(() => { if (alive) setPeerOverview(null); });
    return () => { alive = false; };
  }, [open, studentId]);

  const handleGenerateReport = async (period) => {
    setReportDialogOpen(false);
    let commitment = null;
    try { commitment = (await api.get(`/teacher/student-commitment/${studentId}`)).data; } catch { /* ignore */ }
    generateStudentReport(profile, { period, commitment, peerOverview });
  };

  useEffect(() => {
    if (open && studentId) {
      loadProfile();
    }
  }, [open, studentId]);

  const loadProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/teacher/student-profile/${studentId}`);
      setProfile(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'فشل تحميل ملف الطالب');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAttendance = async (sessionId, attended) => {
    try {
      await api.put(`/sessions/${sessionId}/attendance`, { attended });
      toast.success(attended ? 'تم تأكيد حضور الطالب' : 'تم تسجيل غياب الطالب');
      loadProfile();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'فشل تأكيد الحضور');
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="font-amiri text-2xl flex items-center gap-3">
              <User className="text-primary" size={28} />
              ملف الطالب الكامل
            </DialogTitle>
            {profile && (
              <div className="flex gap-2 flex-wrap">
              <Button
                data-testid="export-pdf-btn"
                variant="outline"
                size="sm"
                onClick={() => setReportDialogOpen(true)}
                className="rounded-full gap-1.5 text-primary border-primary hover:bg-primary/5"
              >
                <Printer size={16} />
                تقرير PDF
              </Button>
              <Button
                data-testid="weekly-plan-btn"
                variant="outline"
                size="sm"
                onClick={() => setWeeklyPlanOpen(true)}
                className="rounded-full gap-1.5 text-amber-700 border-amber-600 hover:bg-amber-50"
              >
                <FileText size={16} />
                خطط أسبوعية
              </Button>
              <Button
                data-testid="peer-review-stats-btn"
                variant="outline"
                size="sm"
                onClick={() => setPeerStatsOpen(true)}
                className="rounded-full gap-1.5 text-teal-700 border-teal-600 hover:bg-teal-50"
              >
                <Users size={16} />
                المراجعة
              </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="spinner border-4 border-primary border-t-transparent rounded-full w-10 h-10"></div>
          </div>
        ) : error ? (
          <div className="text-center py-8 text-red-500">
            <XCircle className="mx-auto mb-2" size={48} />
            <p className="font-plex">{error}</p>
          </div>
        ) : profile ? (
          <div className="space-y-6">
            {/* Student Basic Info */}
            <Card className="border-2 border-primary/20">
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  {profile.student.picture_url ? (
                    <img 
                      src={profile.student.picture_url} 
                      alt={profile.student.name}
                      className="w-20 h-20 rounded-full object-cover border-4 border-primary/20"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                      <User size={40} className="text-primary" />
                    </div>
                  )}
                  <div className="flex-1">
                    <h3 className="font-amiri text-2xl font-bold text-primary">
                      {profile.student.name}
                    </h3>
                    <p className="font-plex text-gray-500">{profile.student.email}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="font-plex text-xs text-gray-400">
                        انضم: {new Date(profile.student.created_at).toLocaleDateString('ar-SA')}
                      </span>
                      {profile.student.is_restricted && (
                        <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full">
                          محظور
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Weekly Commitment & Warnings Section */}
            <StudentCommitmentSection studentId={studentId} isAdmin={isAdmin} />

            {/* Statistics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard 
                icon={BookOpen}
                label="إجمالي الحصص"
                value={profile.statistics.total_sessions}
                color="text-primary"
                bgColor="bg-primary/10"
              />
              <StatCard 
                icon={CheckCircle}
                label="حصص مكتملة"
                value={profile.statistics.completed_sessions}
                color="text-green-600"
                bgColor="bg-green-50"
              />
              <StatCard 
                icon={TrendingUp}
                label="نسبة الحضور"
                value={`${profile.statistics.attendance_rate}%`}
                color="text-blue-600"
                bgColor="bg-blue-50"
              />
              <StatCard 
                icon={Calendar}
                label="حصص معك"
                value={profile.statistics.sessions_with_you}
                color="text-purple-600"
                bgColor="bg-purple-50"
              />
            </div>

            {/* Ratings Section */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="font-amiri text-lg flex items-center gap-2">
                  <Star className="text-amber-500" size={20} />
                  التقييمات
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6 flex-wrap">
                  <div className="text-center">
                    <p className="font-amiri text-3xl font-bold text-amber-500">
                      {Math.round((Number(profile.ratings.average_rating) / 4) * 100)}<span className="text-xl">%</span>
                    </p>
                    <p className="font-plex text-sm text-gray-500">المعدل</p>
                    <p className={`text-xs px-2 py-1 rounded-full mt-1 text-white ${RATING_COLORS[profile.ratings.average_rating_text] || 'bg-gray-400'}`}>
                      {profile.ratings.average_rating_text}
                    </p>
                  </div>
                  <div className="flex-1 grid grid-cols-4 gap-2">
                    {Object.entries(profile.ratings.breakdown).map(([rating, count]) => (
                      <div key={rating} className="text-center p-2 bg-gray-50 rounded-lg">
                        <p className={`font-amiri text-xl font-bold ${
                          rating === 'ممتاز' ? 'text-green-600' :
                          rating === 'متوسط' ? 'text-blue-600' :
                          rating === 'مقبول' ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {count}
                        </p>
                        <p className="font-plex text-xs text-gray-500">{rating}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Monthly Attendance */}
            {profile.monthly_attendance && profile.monthly_attendance.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="font-amiri text-lg flex items-center gap-2">
                    <BarChart3 className="text-primary" size={20} />
                    سجل الحضور الشهري
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <AttendanceChart data={profile.monthly_attendance} />
                </CardContent>
              </Card>
            )}

            {/* Memorization Progress */}
            {(profile.memorization.surahs_covered.length > 0 || profile.memorization.progress_log?.length > 0) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="font-amiri text-lg flex items-center gap-2">
                    <BookOpen className="text-green-600" size={20} />
                    التقدم في الحفظ
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {profile.memorization.surahs_covered.length > 0 && (
                    <div className="mb-4">
                      <p className="font-plex text-xs text-gray-500 mb-2">السور المدروسة:</p>
                      <div className="flex flex-wrap gap-2">
                        {profile.memorization.surahs_covered.map((surah, index) => (
                          <span 
                            key={index}
                            className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-plex"
                          >
                            {surah}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {profile.memorization.progress_log?.length > 0 && (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {profile.memorization.progress_log.map((entry) => (
                        <div key={entry.progress_id} className="p-3 bg-green-50 rounded-lg border border-green-100">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-amiri font-bold text-green-800">
                                سورة {entry.surah_name}
                              </p>
                              <p className="font-plex text-xs text-gray-600">
                                الآيات {entry.from_ayah} - {entry.to_ayah}
                              </p>
                              {entry.teacher_name && (
                                <p className="font-plex text-xs text-gray-400">
                                  المعلم: {entry.teacher_name}
                                </p>
                              )}
                              {entry.last_edited_by_name && (
                                <p className="font-plex text-[10px] text-amber-500">
                                  آخر تعديل: {entry.last_edited_by_name}
                                </p>
                              )}
                            </div>
                            <div className="text-left flex-shrink-0 flex items-start gap-1.5">
                              <button
                                data-testid={`edit-mem-profile-${entry.progress_id}`}
                                onClick={() => setEditEntry(entry)}
                                className="p-1 rounded text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors"
                                title="تعديل"
                              >
                                <Pencil size={12} />
                              </button>
                              <div>
                                <span className={`px-2 py-0.5 rounded-full text-white text-xs ${RATING_COLORS[entry.quality] || 'bg-gray-400'}`}>
                                  {entry.quality}
                                </span>
                                <p className="font-plex text-[10px] text-gray-400 mt-1">
                                  {new Date(entry.created_at).toLocaleDateString('en-US')}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="font-plex text-xs text-gray-400 mt-3">
                    إجمالي تسجيلات التسميع: {profile.memorization.total_progress_entries || profile.memorization.total_recitation_notes}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Recent Sessions */}
            {profile.recent_sessions && profile.recent_sessions.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="font-amiri text-lg flex items-center gap-2">
                    <Clock className="text-primary" size={20} />
                    آخر الحصص
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {profile.recent_sessions.map((session, index) => (
                      <div 
                        key={session.session_id || index}
                        className="p-3 bg-gray-50 rounded-lg space-y-2"
                      >
                        <div className="flex items-start gap-2 flex-wrap">
                          <span className={`px-2 py-1 rounded-full text-xs flex-shrink-0 ${STATUS_COLORS[session.status]}`}>
                            {STATUS_TEXT[session.status]}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-plex text-sm text-gray-700">
                              {new Date(session.scheduled_time).toLocaleDateString('ar-SA', {
                                weekday: 'short',
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                            <p className="font-plex text-xs text-gray-400">
                              المعلم: {session.teacher_name}
                            </p>
                          </div>
                          {session.rating && (
                            <span className={`text-xs px-2 py-1 rounded-full text-white flex-shrink-0 ${RATING_COLORS[session.rating]}`}>
                              {session.rating}
                            </span>
                          )}
                        </div>
                        {/* Status badges + Attendance buttons row */}
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1 flex-wrap">
                            {session.join_clicked_at && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                                دخل الحصة
                              </span>
                            )}
                            {session.attendance_confirmed === true && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                                <Check size={10} /> حاضر
                              </span>
                            )}
                            {session.attendance_confirmed === false && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
                                <XCircle size={10} /> غائب
                              </span>
                            )}
                            {session.rating && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                <Star size={10} /> تم التقييم
                              </span>
                            )}
                            {session.status === 'cancelled' && session.cancellation_reason && (
                              <span className="text-[10px] text-red-500">{session.cancellation_reason}</span>
                            )}
                          </div>
                          <div className="flex gap-1 flex-wrap">
                            {session.status !== 'cancelled' && session.attendance_confirmed == null && (
                              <>
                                <Button
                                  data-testid={`profile-attend-${session.session_id}`}
                                  onClick={() => handleConfirmAttendance(session.session_id, true)}
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-xs rounded-full border-green-400 text-green-600 hover:bg-green-50"
                                >
                                  <Check size={12} className="ml-0.5" />
                                  حاضر
                                </Button>
                                <Button
                                  data-testid={`profile-absent-${session.session_id}`}
                                  onClick={() => handleConfirmAttendance(session.session_id, false)}
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-xs rounded-full border-red-400 text-red-600 hover:bg-red-50"
                                >
                                  <XCircle size={12} className="ml-0.5" />
                                  غائب
                                </Button>
                              </>
                            )}
                            {/* P3: evaluate at any time — uses the same SessionNotesDialog which
                                internally handles attendance-vs-evaluation and skips
                                memorization_entries on absence. Button label reflects whether the
                                session already has a rating. */}
                            {session.status !== 'cancelled' && (
                              <Button
                                data-testid={`profile-evaluate-${session.session_id}`}
                                onClick={() => setEvalDialog({ open: true, session })}
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs rounded-full border-amber-500 text-amber-600 hover:bg-amber-50"
                              >
                                <FileText size={12} className="ml-0.5" />
                                {session.rating ? 'تعديل التقييم' : 'تقييم'}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Notes Section */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="font-amiri text-lg flex items-center gap-2">
                    <FileText className="text-primary" size={20} />
                    ملاحظات المعلمين ({profile.notes.total})
                  </CardTitle>
                  {profile.notes.total > 0 && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setShowFullNotes(true)}
                    >
                      عرض الكل
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {profile.notes.recent.length > 0 ? (
                  <div className="space-y-3">
                    {profile.notes.recent.map((note, index) => (
                      <div key={note.note_id || index} className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-amiri font-bold text-primary">{note.title}</span>
                          {note.rating && (
                            <span className={`text-xs px-2 py-0.5 rounded-full text-white ${RATING_COLORS[note.rating]}`}>
                              {note.rating}
                            </span>
                          )}
                        </div>
                        <p className="font-plex text-sm text-gray-600 line-clamp-2">{note.content}</p>
                        <p className="font-plex text-xs text-gray-400 mt-2">
                          {note.teacher_name} - {new Date(note.created_at).toLocaleDateString('ar-SA')}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="font-plex text-gray-500 text-center py-4">لا توجد ملاحظات</p>
                )}
              </CardContent>
            </Card>

            {/* Competition History */}
            <CompetitionHistoryList studentId={studentId} title="سجل المسابقات" />
          </div>
        ) : null}

        {/* Full Notes Dialog */}
        <Dialog open={showFullNotes} onOpenChange={setShowFullNotes}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-amiri text-xl">
                جميع ملاحظات الطالب
              </DialogTitle>
            </DialogHeader>
            <StudentNotesArchive 
              studentId={studentId}
              studentName={profile?.student?.name}
              isTeacher={true}
            />
          </DialogContent>
        </Dialog>

        {/* Edit Memorization Dialog */}
        <EditMemorizationDialog
          open={!!editEntry}
          onClose={() => setEditEntry(null)}
          entry={editEntry}
          onSaved={loadProfile}
          isAdmin={isAdmin}
        />

        {/* Report Period Dialog */}
        <ReportPeriodDialog
          open={reportDialogOpen}
          onClose={() => setReportDialogOpen(false)}
          onGenerate={handleGenerateReport}
          studentName={profile?.student?.name}
        />

        {/* Weekly Plan Builder */}
        {weeklyPlanOpen && profile?.student && (
          <WeeklyPlanBuilder
            student={profile.student}
            onClose={() => setWeeklyPlanOpen(false)}
          />
        )}

        {/* Peer Review Stats Dialog */}
        <PeerReviewStatsDialog
          open={peerStatsOpen}
          onClose={() => setPeerStatsOpen(false)}
          peerOverview={peerOverview}
          studentName={profile?.student?.name}
          studentId={studentId}
        />

        {/* P3: Session evaluation dialog (opened from any session inside the
            student profile). We reuse SessionNotesDialog verbatim so we
            preserve the attendance-vs-evaluation separation and the
            absence-skips-memorization-entries logic.

            The recent_sessions payload does not carry student_name, so we
            inject it here from the modal props for a correct dialog title. */}
        <SessionNotesDialog
          open={evalDialog.open}
          onClose={() => setEvalDialog({ open: false, session: null })}
          session={evalDialog.session ? {
            ...evalDialog.session,
            student_id: evalDialog.session.student_id || studentId,
            student_name: evalDialog.session.student_name || studentName || profile?.student?.name,
          } : null}
          onSaved={loadProfile}
          requireRating={true}
        />
      </DialogContent>
    </Dialog>
  );
};

export default StudentProfileModal;
