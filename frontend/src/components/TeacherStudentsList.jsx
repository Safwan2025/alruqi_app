import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { 
  Users, Search, User, Eye, RefreshCw, FileText, Star, 
  BookOpen, Calendar, TrendingUp, CheckCircle, Clock, XCircle,
  MessageSquare, Award, ChevronDown, ChevronUp, Printer, UsersRound
} from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';
import StudentCommitmentSection from './StudentCommitmentSection';
import { generateStudentReport } from '@/utils/generateStudentReport';
import ReportPeriodDialog from './ReportPeriodDialog';
import WeeklyPlanBuilder from './WeeklyPlanBuilder';
import PeerReviewStatsDialog from './PeerReviewStatsDialog';
import useShowMoreList from '@/hooks/useShowMoreList';
import ShowMoreButton from '@/components/ShowMoreButton';

const TeacherStudentsList = ({ isAdmin = false }) => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Student Profile State
  const [profileDialog, setProfileDialog] = useState({ open: false, student: null });
  const [profileData, setProfileData] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [weeklyPlanOpen, setWeeklyPlanOpen] = useState(false);
  const [peerStatsOpen, setPeerStatsOpen] = useState(false);
  const [peerOverview, setPeerOverview] = useState(null);
  
  const handleGenerateReport = async (period) => {
    setReportDialogOpen(false);
    if (!profileData || !profileDialog.student) return;
    let commitment = null;
    try { commitment = (await api.get(`/teacher/student-commitment/${profileDialog.student.user_id}`)).data; } catch { /* ignore */ }
    generateStudentReport(profileData, { period, commitment, peerOverview });
  };
  
  // Notes Dialog State
  const [notesDialog, setNotesDialog] = useState({ open: false, studentId: null, studentName: null });
  const [noteData, setNoteData] = useState({ note_type: 'general', title: '', content: '', surah_name: '' });
  const [savingNote, setSavingNote] = useState(false);
  
  // Rating Dialog State
  const [ratingDialog, setRatingDialog] = useState({ open: false, studentId: null, studentName: null });
  const [rating, setRating] = useState('');
  const [ratingNotes, setRatingNotes] = useState('');
  const [savingRating, setSavingRating] = useState(false);
  
  // Expanded sections in profile
  const [expandedSections, setExpandedSections] = useState({
    stats: true,
    sessions: false,
    notes: false
  });

  useEffect(() => {
    loadStudents();
  }, []);

  const loadStudents = async () => {
    setLoading(true);
    try {
      const response = await api.get('/teacher/all-students');
      setStudents(response.data);
    } catch (error) {
      toast.error('فشل تحميل قائمة الطلاب');
    } finally {
      setLoading(false);
    }
  };

  const openStudentProfile = async (student) => {
    setProfileDialog({ open: true, student });
    setLoadingProfile(true);
    setProfileData(null);
    setPeerOverview(null);
    try {
      const [response, peerRes] = await Promise.all([
        api.get(`/teacher/student-profile/${student.user_id}`),
        api.get(`/teacher/students/${student.user_id}/peer-overview`).catch(() => ({ data: null }))
      ]);
      setProfileData(response.data);
      setPeerOverview(peerRes.data);
    } catch (error) {
      toast.error('فشل تحميل ملف الطالب');
    } finally {
      setLoadingProfile(false);
    }
  };

  const openNotesDialog = (studentId, studentName) => {
    setNotesDialog({ open: true, studentId, studentName });
    setNoteData({ note_type: 'general', title: '', content: '', surah_name: '' });
  };

  const openRatingDialog = (studentId, studentName) => {
    setRatingDialog({ open: true, studentId, studentName });
    setRating('');
    setRatingNotes('');
  };

  const handleSaveNote = async () => {
    if (!noteData.content.trim()) {
      toast.error('يرجى كتابة محتوى الملاحظة');
      return;
    }

    setSavingNote(true);
    try {
      await api.post(`/students/${notesDialog.studentId}/notes`, {
        note_type: noteData.note_type,
        title: noteData.title || (noteData.note_type === 'recitation' ? 'تسميع' : 'ملاحظة عامة'),
        content: noteData.content,
        surah_name: noteData.surah_name || null
      });
      
      toast.success('تم حفظ الملاحظة بنجاح');
      setNotesDialog({ open: false, studentId: null, studentName: null });
      
      // Refresh profile if open
      if (profileDialog.open && profileDialog.student?.user_id === notesDialog.studentId) {
        openStudentProfile(profileDialog.student);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل حفظ الملاحظة');
    } finally {
      setSavingNote(false);
    }
  };

  const handleSaveRating = async () => {
    if (!rating) {
      toast.error('يرجى اختيار التقييم');
      return;
    }

    setSavingRating(true);
    try {
      // Save rating as a note with type 'evaluation'
      await api.post(`/students/${ratingDialog.studentId}/notes`, {
        note_type: 'evaluation',
        title: `تقييم: ${rating}`,
        content: ratingNotes || `تم تقييم الطالب بـ: ${rating}`,
        rating: rating
      });
      
      toast.success('تم حفظ التقييم بنجاح');
      setRatingDialog({ open: false, studentId: null, studentName: null });
      
      // Refresh profile if open
      if (profileDialog.open && profileDialog.student?.user_id === ratingDialog.studentId) {
        openStudentProfile(profileDialog.student);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل حفظ التقييم');
    } finally {
      setSavingRating(false);
    }
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const filteredStudents = students.filter(s => 
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  // عرض 5 طلاب أولًا ثم "عرض المزيد" (+5)، ويعود إلى 5 عند تغيّر البحث
  const {
    visible: displayedStudents,
    canShowMore: canShowMoreStudents,
    showMore: showMoreStudents,
    total: totalFilteredStudents,
    shown: shownStudentsCount,
  } = useShowMoreList(filteredStudents, 5, searchTerm);

  const formatDate = (dateStr) => {
    if (!dateStr) return 'غير محدد';
    const date = new Date(dateStr);
    return date.toLocaleDateString('ar-SA', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getRatingColor = (rating) => {
    switch (rating) {
      case 'ممتاز': return 'text-green-600 bg-green-100';
      case 'متوسط': return 'text-blue-600 bg-blue-100';
      case 'مقبول': return 'text-amber-600 bg-amber-100';
      case 'ضعيف': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckCircle className="text-green-500" size={16} />;
      case 'scheduled': return <Clock className="text-blue-500" size={16} />;
      case 'cancelled': return <XCircle className="text-red-500" size={16} />;
      default: return null;
    }
  };

  return (
    <Card className="border-2 border-teal-200" data-testid="teacher-students-list">
      <CardHeader className="bg-teal-50">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="font-amiri text-xl text-teal-700 flex items-center gap-2">
            <Users size={24} />
            قائمة الطلاب المسجلين
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm font-plex text-teal-600 bg-teal-100 px-3 py-1 rounded-full">
              {students.length} طالب
            </span>
            <Button variant="outline" size="sm" onClick={loadStudents} disabled={loading}>
              <RefreshCw className={`ml-1 ${loading ? 'animate-spin' : ''}`} size={16} />
              تحديث
            </Button>
          </div>
        </div>
        
        {/* Search */}
        <div className="relative mt-4">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث بالاسم أو البريد..."
            className="pr-10 font-plex"
            data-testid="search-students-input"
          />
        </div>
      </CardHeader>

      <CardContent className="p-4">
        {loading ? (
          <div className="text-center py-8">
            <div className="spinner border-4 border-teal-500 border-t-transparent rounded-full w-8 h-8 mx-auto"></div>
          </div>
        ) : filteredStudents.length === 0 ? (
          <p className="text-center py-8 font-plex text-gray-500">لا يوجد طلاب</p>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {displayedStudents.map(student => (
              <div 
                key={student.user_id}
                className="flex items-center gap-4 p-3 bg-white border rounded-lg hover:border-teal-300 hover:shadow-md transition-all"
                data-testid={`student-row-${student.user_id}`}
              >
                {/* Avatar */}
                {student.picture ? (
                  <img src={student.picture} alt={student.name} className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center">
                    <User size={24} className="text-teal-500" />
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-amiri font-bold text-gray-800 truncate">{student.name}</h4>
                  <p className="font-plex text-xs text-gray-500 truncate">{student.email}</p>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    onClick={() => openStudentProfile(student)}
                    variant="outline"
                    size="sm"
                    className="border-green-300 text-green-600 hover:bg-green-50"
                    data-testid={`view-profile-${student.user_id}`}
                    title="عرض ملف الطالب"
                  >
                    <Eye size={16} className="ml-1" />
                    ملف الطالب
                  </Button>
                  <Button
                    onClick={() => openNotesDialog(student.user_id, student.name)}
                    variant="outline"
                    size="sm"
                    className="border-amber-300 text-amber-600 hover:bg-amber-50"
                    data-testid={`add-note-${student.user_id}`}
                    title="إضافة ملاحظة"
                  >
                    <FileText size={16} className="ml-1" />
                    ملاحظة
                  </Button>
                  <Button
                    onClick={() => openRatingDialog(student.user_id, student.name)}
                    variant="outline"
                    size="sm"
                    className="border-purple-300 text-purple-600 hover:bg-purple-50"
                    data-testid={`add-rating-${student.user_id}`}
                    title="إضافة تقييم"
                  >
                    <Star size={16} className="ml-1" />
                    تقييم
                  </Button>
                </div>
              </div>
            ))}
            <ShowMoreButton
              canShowMore={canShowMoreStudents}
              onShowMore={showMoreStudents}
              total={totalFilteredStudents}
              shown={shownStudentsCount}
              testId="students-show-more"
            />
          </div>
        )}
      </CardContent>

      {/* Student Profile Dialog */}
      <Dialog open={profileDialog.open} onOpenChange={(open) => !open && setProfileDialog({ open: false, student: null })}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="student-profile-dialog">
          <DialogHeader>
            <DialogTitle className="font-amiri text-2xl flex items-center gap-3">
              {profileDialog.student?.picture ? (
                <img src={profileDialog.student.picture} alt="" className="w-12 h-12 rounded-full object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center">
                  <User size={24} className="text-teal-500" />
                </div>
              )}
              <div>
                <span className="text-primary">{profileDialog.student?.name}</span>
                <p className="font-plex text-sm text-gray-500 font-normal">{profileDialog.student?.email}</p>
              </div>
            </DialogTitle>
          </DialogHeader>

          {loadingProfile ? (
            <div className="text-center py-12">
              <div className="spinner border-4 border-teal-500 border-t-transparent rounded-full w-10 h-10 mx-auto"></div>
              <p className="font-plex text-gray-500 mt-3">جاري تحميل البيانات...</p>
            </div>
          ) : profileData ? (
            <div className="space-y-4 mt-4">
              {/* Quick Actions */}
              <div className="flex gap-2 flex-wrap">
                <Button
                  data-testid="export-pdf-btn-students-list"
                  onClick={() => setReportDialogOpen(true)}
                  variant="outline"
                  className="border-green-500 text-green-600 hover:bg-green-50"
                >
                  <Printer size={18} className="ml-2" />
                  تقرير PDF
                </Button>
                <Button
                  onClick={() => openNotesDialog(profileDialog.student.user_id, profileDialog.student.name)}
                  className="bg-amber-500 hover:bg-amber-600"
                >
                  <FileText size={18} className="ml-2" />
                  إضافة ملاحظة
                </Button>
                <Button
                  onClick={() => openRatingDialog(profileDialog.student.user_id, profileDialog.student.name)}
                  className="bg-purple-500 hover:bg-purple-600"
                >
                  <Star size={18} className="ml-2" />
                  إضافة تقييم
                </Button>
                <Button
                  data-testid="weekly-plan-btn"
                  onClick={() => setWeeklyPlanOpen(true)}
                  variant="outline"
                  className="border-amber-500 text-amber-700 hover:bg-amber-50"
                >
                  <Calendar size={18} className="ml-2" />
                  خطط أسبوعية
                </Button>
                <Button
                  data-testid="peer-review-stats-btn"
                  onClick={() => setPeerStatsOpen(true)}
                  variant="outline"
                  className="border-teal-500 text-teal-700 hover:bg-teal-50"
                >
                  <UsersRound size={18} className="ml-2" />
                  المراجعة
                </Button>
              </div>

              {/* Weekly Commitment & Warnings */}
              <StudentCommitmentSection studentId={profileDialog.student?.user_id} isAdmin={isAdmin} />

              {/* Statistics Section */}
              <div className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection('stats')}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100"
                >
                  <span className="font-amiri font-bold flex items-center gap-2">
                    <TrendingUp className="text-teal-500" size={20} />
                    الإحصائيات
                  </span>
                  {expandedSections.stats ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
                {expandedSections.stats && (
                  <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <p className="text-2xl font-bold text-blue-600">{profileData.statistics?.total_sessions || 0}</p>
                      <p className="font-plex text-xs text-gray-600">إجمالي الحصص</p>
                    </div>
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <p className="text-2xl font-bold text-green-600">{profileData.statistics?.completed_sessions || 0}</p>
                      <p className="font-plex text-xs text-gray-600">حصص مكتملة</p>
                    </div>
                    <div className="text-center p-3 bg-amber-50 rounded-lg">
                      <p className="text-2xl font-bold text-amber-600">{profileData.statistics?.attendance_rate?.toFixed(0) || 0}%</p>
                      <p className="font-plex text-xs text-gray-600">نسبة الحضور</p>
                    </div>
                    <div className="text-center p-3 bg-purple-50 rounded-lg">
                      <p className={`text-lg font-bold ${getRatingColor(profileData.statistics?.avg_rating_text)}`}>
                        {profileData.statistics?.avg_rating_text || 'لا يوجد'}
                      </p>
                      <p className="font-plex text-xs text-gray-600">متوسط التقييم</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Ratings Distribution */}
              {profileData.statistics?.ratings_count && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="font-amiri font-bold mb-3">توزيع التقييمات</p>
                  <div className="flex gap-4 flex-wrap">
                    {Object.entries(profileData.statistics.ratings_count).map(([rating, count]) => (
                      <div key={rating} className={`px-3 py-1 rounded-full text-sm font-plex ${getRatingColor(rating)}`}>
                        {rating}: {count}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Sessions */}
              <div className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection('sessions')}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100"
                >
                  <span className="font-amiri font-bold flex items-center gap-2">
                    <Calendar className="text-blue-500" size={20} />
                    الحصص الأخيرة ({profileData.recent_sessions?.length || 0})
                  </span>
                  {expandedSections.sessions ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
                {expandedSections.sessions && (
                  <div className="p-4 space-y-2 max-h-[200px] overflow-y-auto">
                    {profileData.recent_sessions?.length > 0 ? (
                      profileData.recent_sessions.map((session, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-white border rounded">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(session.status)}
                            <span className="font-plex text-sm">{formatDate(session.scheduled_time)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-plex text-xs text-gray-500">{session.teacher_name}</span>
                            {session.rating && (
                              <span className={`px-2 py-0.5 rounded text-xs ${getRatingColor(session.rating)}`}>
                                {session.rating}
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-gray-500 font-plex">لا توجد حصص</p>
                    )}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection('notes')}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100"
                >
                  <span className="font-amiri font-bold flex items-center gap-2">
                    <FileText className="text-amber-500" size={20} />
                    الملاحظات ({profileData.notes?.length || 0})
                  </span>
                  {expandedSections.notes ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
                {expandedSections.notes && (
                  <div className="p-4 space-y-2 max-h-[200px] overflow-y-auto">
                    {profileData.notes?.length > 0 ? (
                      profileData.notes.map((note, idx) => (
                        <div key={idx} className="p-3 bg-white border rounded">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-amiri font-bold text-sm">{note.title || 'ملاحظة'}</span>
                            <span className="font-plex text-xs text-gray-400">{formatDate(note.created_at)}</span>
                          </div>
                          <p className="font-plex text-sm text-gray-700">{note.content}</p>
                          {note.surah_name && (
                            <span className="inline-block mt-1 px-2 py-0.5 bg-teal-100 text-teal-700 rounded text-xs">
                              سورة {note.surah_name}
                            </span>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-gray-500 font-plex">لا توجد ملاحظات</p>
                    )}
                  </div>
                )}
              </div>

              {/* Surahs Covered */}
              {profileData.surahs_covered?.length > 0 && (
                <div className="p-4 bg-teal-50 rounded-lg">
                  <p className="font-amiri font-bold mb-3 flex items-center gap-2">
                    <BookOpen className="text-teal-600" size={20} />
                    السور المحفوظة
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {profileData.surahs_covered.map((surah, idx) => (
                      <span key={idx} className="px-3 py-1 bg-white border border-teal-200 rounded-full text-sm font-plex">
                        {surah}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-center py-8 font-plex text-gray-500">فشل تحميل البيانات</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Weekly Plan Builder (teacher) */}
      {weeklyPlanOpen && profileDialog.student && (
        <WeeklyPlanBuilder
          student={profileDialog.student}
          onClose={() => setWeeklyPlanOpen(false)}
        />
      )}

      {/* Peer Review Stats Dialog */}
      <PeerReviewStatsDialog
        open={peerStatsOpen}
        onClose={() => setPeerStatsOpen(false)}
        peerOverview={peerOverview}
        studentName={profileDialog.student?.name}
        studentId={profileDialog.student?.user_id}
      />

      {/* Add Note Dialog */}
      <Dialog open={notesDialog.open} onOpenChange={(open) => !open && setNotesDialog({ open: false, studentId: null, studentName: null })}>
        <DialogContent className="max-w-md" data-testid="add-note-dialog">
          <DialogHeader>
            <DialogTitle className="font-amiri text-xl flex items-center gap-2">
              <FileText className="text-amber-500" size={24} />
              إضافة ملاحظة - {notesDialog.studentName}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <Label className="font-plex">نوع الملاحظة</Label>
              <Select value={noteData.note_type} onValueChange={(v) => setNoteData(prev => ({ ...prev, note_type: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">ملاحظة عامة</SelectItem>
                  <SelectItem value="recitation">تسميع</SelectItem>
                  <SelectItem value="behavior">سلوك</SelectItem>
                  <SelectItem value="progress">تقدم</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {noteData.note_type === 'recitation' && (
              <div>
                <Label className="font-plex">اسم السورة (اختياري)</Label>
                <Input
                  value={noteData.surah_name}
                  onChange={(e) => setNoteData(prev => ({ ...prev, surah_name: e.target.value }))}
                  placeholder="مثال: البقرة"
                  className="mt-1 font-plex"
                />
              </div>
            )}

            <div>
              <Label className="font-plex">العنوان (اختياري)</Label>
              <Input
                value={noteData.title}
                onChange={(e) => setNoteData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="عنوان الملاحظة"
                className="mt-1 font-plex"
              />
            </div>

            <div>
              <Label className="font-plex">محتوى الملاحظة *</Label>
              <Textarea
                value={noteData.content}
                onChange={(e) => setNoteData(prev => ({ ...prev, content: e.target.value }))}
                placeholder="اكتب ملاحظتك هنا..."
                rows={4}
                className="mt-1 font-plex"
              />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button onClick={handleSaveNote} disabled={savingNote} className="bg-amber-500 hover:bg-amber-600">
              {savingNote ? (
                <>
                  <div className="spinner border-2 border-white border-t-transparent rounded-full w-4 h-4 ml-2"></div>
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <CheckCircle className="ml-2" size={18} />
                  حفظ الملاحظة
                </>
              )}
            </Button>
            <Button variant="outline" onClick={() => setNotesDialog({ open: false, studentId: null, studentName: null })}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Rating Dialog */}
      <Dialog open={ratingDialog.open} onOpenChange={(open) => !open && setRatingDialog({ open: false, studentId: null, studentName: null })}>
        <DialogContent className="max-w-md" data-testid="add-rating-dialog">
          <DialogHeader>
            <DialogTitle className="font-amiri text-xl flex items-center gap-2">
              <Star className="text-purple-500" size={24} />
              إضافة تقييم - {ratingDialog.studentName}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <Label className="font-plex">التقييم *</Label>
              <Select value={rating} onValueChange={setRating}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="اختر التقييم" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ممتاز">
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-green-500"></span>
                      ممتاز
                    </span>
                  </SelectItem>
                  <SelectItem value="متوسط">
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                      متوسط
                    </span>
                  </SelectItem>
                  <SelectItem value="مقبول">
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                      مقبول
                    </span>
                  </SelectItem>
                  <SelectItem value="ضعيف">
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-red-500"></span>
                      ضعيف
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="font-plex">ملاحظات إضافية (اختياري)</Label>
              <Textarea
                value={ratingNotes}
                onChange={(e) => setRatingNotes(e.target.value)}
                placeholder="أضف ملاحظات حول هذا التقييم..."
                rows={3}
                className="mt-1 font-plex"
              />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button onClick={handleSaveRating} disabled={savingRating} className="bg-purple-500 hover:bg-purple-600">
              {savingRating ? (
                <>
                  <div className="spinner border-2 border-white border-t-transparent rounded-full w-4 h-4 ml-2"></div>
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <CheckCircle className="ml-2" size={18} />
                  حفظ التقييم
                </>
              )}
            </Button>
            <Button variant="outline" onClick={() => setRatingDialog({ open: false, studentId: null, studentName: null })}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report Period Dialog */}
      <ReportPeriodDialog
        open={reportDialogOpen}
        onClose={() => setReportDialogOpen(false)}
        onGenerate={handleGenerateReport}
        studentName={profileDialog.student?.name}
      />
    </Card>
  );
};

export default TeacherStudentsList;
