import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Calendar, Users, LogOut, User, MessageSquare, Star, X, Mail, Check, Send, BarChart3, GraduationCap, FileText, Settings, Trash2, RefreshCw, Award, XCircle, Eye, Inbox, BookOpen, Shield, Trophy } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import api from '@/utils/api';
import { toast } from 'sonner';
import NotificationBell from '@/components/NotificationBell';
import VacationManager from '@/components/VacationManager';
import StudentRestrictions from '@/components/StudentRestrictions';
import SessionNotesDialog from '@/components/SessionNotesDialog';
import CancelSessionDialog from '@/components/CancelSessionDialog';
import AnnouncementsManager from '@/components/AnnouncementsManager';
import SlotsManager from '@/components/SlotsManager';
import StudentOfWeek from '@/components/StudentOfWeek';
import StudentOfWeekManager from '@/components/StudentOfWeekManager';
import ContentManager from '@/components/ContentManager';
import LicenseManager from '@/components/LicenseManager';
import StudentNotesArchive from '@/components/StudentNotesArchive';
import StudentProfileModal from '@/components/StudentProfileModal';
import StudentPointsManager from '@/components/StudentPointsManager';
import SetPasswordDialog from '@/components/SetPasswordDialog';
import TeacherPromotion from '@/components/TeacherPromotion';
import TeacherLinkManager from '@/components/TeacherLinkManager';
import AdminAccountDeletion from '@/components/AdminAccountDeletion';
import AdminFrozenStudentsManager from '@/components/AdminFrozenStudentsManager';
import CommitmentHolidaysManager from '@/components/CommitmentHolidaysManager';
import TeacherStudentsList from '@/components/TeacherStudentsList';
import AllStudentsCommitments from '@/components/AllStudentsCommitments';
import PendingEvaluationsDialog from '@/components/PendingEvaluationsDialog';
import TeacherStudentBrowser from '@/components/TeacherStudentBrowser';
import MessageInbox from '@/components/MessageInbox';
import CompetitionsManager from '@/components/CompetitionsManager';
import PeerRequestsManager from '@/components/PeerRequestsManager';
import CertificatesManager from '@/components/CertificatesManager';
import JoinFallbackDialog from '@/components/JoinFallbackDialog';
import { openMeetLoadingTab, normalizeMeetUrl } from '@/utils/openMeetTab';

const ADMIN_EMAIL = "m0m0077100@gmail.com";

const SLOT_MANAGERS_EMAILS = [
  "m0m0077100@gmail.com",
  "aalsiiada@gmail.com",
  "omarnasernajjar09@gmail.com"
];

const TeacherDashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ratingDialog, setRatingDialog] = useState({ open: false, session: null });
  const [notesDialog, setNotesDialog] = useState({ open: false, session: null });
  const [cancelDialog, setCancelDialog] = useState({ open: false, session: null });
  const [studentArchiveDialog, setStudentArchiveDialog] = useState({ open: false, student: null });
  const [studentProfileDialog, setStudentProfileDialog] = useState({ open: false, studentId: null, studentName: null });
  const [rating, setRating] = useState('');
  const [notes, setNotes] = useState('');
  const [messages, setMessages] = useState([]);
  const [adminStats, setAdminStats] = useState(null);
  const [weeklyRotation, setWeeklyRotation] = useState(null);
  const [hidingSessionId, setHidingSessionId] = useState(null);
  const [showSetPasswordDialog, setShowSetPasswordDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('sessions');
  const [composeTarget, setComposeTarget] = useState(null);
  const [pendingRefreshKey, setPendingRefreshKey] = useState(0);
  const [joinFallback, setJoinFallback] = useState({ open: false, link: '', error: '' });

  useEffect(() => {
    loadData();
    loadMessages();
    const refreshInterval = setInterval(() => { loadData(); }, 30000);
    return () => clearInterval(refreshInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMessages = async () => {
    try {
      const response = await api.get('/messages/my-messages');
      setMessages(response.data);
    } catch (error) {
      console.error('Failed to load messages');
    }
  };

  const loadAdminStats = async () => {
    try {
      const response = await api.get('/admin/all-bookings');
      setAdminStats(response.data);
    } catch (error) {
      console.error('Not admin or failed to load stats');
    }
  };

  const loadData = async () => {
    try {
      const [userRes, sessionsRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/sessions/my-sessions')
      ]);
      setUser(userRes.data);
      setSessions(sessionsRes.data);
      
      if (userRes.data.needs_password_setup) {
        setShowSetPasswordDialog(true);
      }
      
      if (userRes.data.email === ADMIN_EMAIL) {
        loadAdminStats();
        try {
          const rotationRes = await api.get('/admin/weekly-rotation');
          setWeeklyRotation(rotationRes.data);
        } catch {}
      }
    } catch (error) {
      if (error.response?.status === 401) {
        localStorage.removeItem('token');
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('rememberMe');
    navigate('/login');
  };

  const handleRateSession = async () => {
    if (!rating) { toast.error('يرجى اختيار تقييم'); return; }
    try {
      await api.put(`/sessions/${ratingDialog.session.session_id}/rate`, { rating, notes });
      toast.success('تم حفظ التقييم');
      setRatingDialog({ open: false, session: null });
      setRating(''); setNotes('');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في حفظ التقييم');
    }
  };

  // const handleTeacherJoinSession = async (session) => {
  //   try {
  //     const response = await api.get(`/teacher/recitation-link`);
  //     const link = response.data?.recitation_link;
  //     if (link) { window.open(link, '_blank'); } 
  //     else { toast.error('لم يتم تعيين رابط الحصة بعد'); }
  //   } catch { toast.error('فشل في فتح رابط الحصة'); }
  // };

  const normalizeUrl = normalizeMeetUrl;

const handleTeacherJoinSession = async (session) => {
  /* Mobile-safe join flow — same rationale as
     StudentDashboard.handleJoinSession and utils/openMeetTab.js.
     We inject Arabic loading/ready/error HTML into the new tab so the
     teacher never lands on about:blank and Google Meet is opened via a
     real anchor click carrying a fresh user gesture (avoids the "Install
     Meet" landing page on Android/iOS). */
  const tab = openMeetLoadingTab();

  try {
    const response = await api.get(`/sessions/${session.session_id}/join-link`);
    const link = normalizeUrl(response.data?.recitation_link);

    if (!link) {
      const msg = 'لم يتم تعيين رابط الحصة بعد.';
      if (tab.wasOpened) tab.showError(msg);
      else setJoinFallback({ open: true, link: '', error: msg });
      toast.error(msg);
      return;
    }

    if (tab.wasOpened) {
      tab.showReady(link);
    } else {
      setJoinFallback({ open: true, link, error: '' });
    }
  } catch (error) {
    const detail = error.response?.data?.detail || 'فشل في فتح رابط الحصة';
    if (tab.wasOpened) tab.showError(detail);
    else setJoinFallback({ open: true, link: '', error: detail });
    toast.error(detail);
  }
};

  // const handleConfirmAttendance = async (sessionId, isPresent) => {
  //   try {
  //     await api.post(`/sessions/${sessionId}/confirm-attendance`, { is_present: isPresent });
  //     toast.success(isPresent ? 'تم تأكيد حضور الطالب' : 'تم تسجيل غياب الطالب');
  //     loadData();
  //   } catch (error) {
  //     toast.error(error.response?.data?.detail || 'فشل في تحديث الحضور');
  //   }
  // };

    const handleConfirmAttendance = async (sessionId, isPresent) => {
    try {
      await api.put(`/sessions/${sessionId}/attendance`, { attended: isPresent });
      toast.success(isPresent ? 'تم تأكيد حضور الطالب' : 'تم تسجيل غياب الطالب');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تحديث الحضور');
    }
  };

  const updateWeeklyRotation = async (data) => {
    try {
      await api.put('/admin/weekly-rotation', data);
      setWeeklyRotation(prev => ({ ...prev, ...data }));
      toast.success('تم تحديث التناوب الأسبوعي');
    } catch (error) {
      toast.error('فشل في تحديث التناوب');
    }
  };

  const hideSession = async (sessionId) => {
    setHidingSessionId(sessionId);
    try {
      await api.delete(`/sessions/${sessionId}/hide`);
      setSessions(prev => prev.filter(s => s.session_id !== sessionId));
      if (adminStats) {
        setAdminStats(prev => ({
          ...prev,
          bookings_by_teacher: prev.bookings_by_teacher.map(teacher => ({
            ...teacher,
            students: teacher.students.filter(s => s.session_id !== sessionId),
            total_bookings: teacher.students.filter(s => s.session_id !== sessionId).length
          }))
        }));
      }
      toast.success('تم إخفاء الموعد');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل إخفاء الموعد');
    } finally {
      setHidingSessionId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner border-4 border-primary border-t-transparent rounded-full w-12 h-12"></div>
      </div>
    );
  }

  //const upcomingSessions = sessions.filter(s => s.status === 'scheduled' && new Date(s.scheduled_time) > new Date());
  //const completedSessions = sessions.filter(s => s.status === 'completed' || (s.status === 'scheduled' && new Date(s.scheduled_time) <= new Date()));
  
  const SESSION_VISIBLE_MS = 90 * 60 * 1000;
  const nowMs = Date.now();

  const isSessionVisibleActive = (s) => {
    if (s.status === 'cancelled') return false;
    const startMs = new Date(s.scheduled_time).getTime();
    return nowMs <= startMs + SESSION_VISIBLE_MS;
  };

  const isSessionHistory = (s) => {
    if (s.status === 'completed') return true;
    if (s.status !== 'scheduled') return false;
    const startMs = new Date(s.scheduled_time).getTime();
    return nowMs > startMs + SESSION_VISIBLE_MS;
  };

  const upcomingSessions = sessions.filter(isSessionVisibleActive);
  const completedSessions = sessions.filter(isSessionHistory);
  
  const cancelledSessions = sessions.filter(s => s.status === 'cancelled');
  const unreadMessages = messages.filter(m => !m.read && m.from_role === 'student');
  const isAdmin = user?.email === ADMIN_EMAIL;
  const isSlotManager = SLOT_MANAGERS_EMAILS.includes(user?.email);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-white border-b border-border shadow-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 sm:gap-4">
              <img 
                src="https://customer-assets.emergentagent.com/job_8f66b1bb-97ea-4b8f-926f-4f014db49e2a/artifacts/l01dffpm_%D9%85%D9%82%D8%B1%D8%A3%D8%A9%20%D8%A7%D9%84%D8%B1%D9%82%D9%8A.png"
                alt="مقرأة الرقي" 
                className="w-10 h-10 sm:w-12 sm:h-12 object-contain rounded-full bg-white p-0.5"
              />
              <h1 className="font-amiri text-lg sm:text-2xl font-bold text-primary hidden sm:block">مقرأة الرقي</h1>
            </div>
            <div className="flex items-center gap-1 sm:gap-4">
              <NotificationBell />
              <Button data-testid="profile-btn" variant="ghost" size="sm" onClick={() => navigate('/profile')} className="px-2 sm:px-4">
                <User size={18} />
                <span className="hidden sm:inline mr-2">{user?.name}</span>
              </Button>
              <Button data-testid="logout-btn" variant="outline" size="sm" onClick={handleLogout} className="px-2 sm:px-4">
                <LogOut size={18} />
                <span className="hidden sm:inline mr-2">خروج</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Welcome */}
        <div className="mb-4 sm:mb-6 fade-in">
          <h2 className="font-amiri text-2xl sm:text-4xl font-bold text-primary mb-1">
            مرحباً أستاذ {user?.name}
          </h2>
          <p className="font-plex text-sm sm:text-base text-muted-foreground">
            {isAdmin ? 'لوحة التحكم الإدارية' : 'لوحة التحكم الخاصة بالمعلم'}
          </p>
        </div>

        <div className="mb-4">
          <StudentOfWeek variant="compact" />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="h-auto p-1 bg-muted rounded-xl mb-6 tabs-strip" data-testid="teacher-tabs">
            <TabsTrigger value="sessions" data-testid="tab-sessions" className="flex-shrink-0 gap-1.5 font-plex py-2.5 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white whitespace-nowrap">
              <Calendar size={16} />
              <span>الحصص والمواعيد</span>
              {upcomingSessions.length > 0 && (
                <span className="bg-secondary text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">{upcomingSessions.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="students" data-testid="tab-students" className="flex-shrink-0 gap-1.5 font-plex py-2.5 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white whitespace-nowrap">
              <Users size={16} />
              <span>الطلاب</span>
            </TabsTrigger>
            <TabsTrigger value="memorization" data-testid="tab-memorization" className="flex-shrink-0 gap-1.5 font-plex py-2.5 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white whitespace-nowrap">
              <BookOpen size={16} />
              <span>سجل الحفظ</span>
            </TabsTrigger>
            <TabsTrigger value="notes-ratings" data-testid="tab-notes-ratings" className="flex-shrink-0 gap-1.5 font-plex py-2.5 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white whitespace-nowrap">
              <FileText size={16} />
              <span>الملاحظات والتقييمات</span>
            </TabsTrigger>
            <TabsTrigger value="messages" data-testid="tab-messages" className="flex-shrink-0 gap-1.5 font-plex py-2.5 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white whitespace-nowrap">
              <Inbox size={16} />
              <span>الرسائل</span>
              {unreadMessages.length > 0 && (
                <span className="bg-blue-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">{unreadMessages.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="tools" data-testid="tab-tools" className="flex-shrink-0 gap-1.5 font-plex py-2.5 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white whitespace-nowrap">
              <Settings size={16} />
              <span>الأدوات</span>
            </TabsTrigger>
            <TabsTrigger value="competitions" data-testid="tab-competitions" className="flex-shrink-0 gap-1.5 font-plex py-2.5 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white whitespace-nowrap">
              <Trophy size={16} />
              <span>المسابقات</span>
            </TabsTrigger>
            <TabsTrigger value="peer-review" data-testid="tab-teacher-peer-review" className="flex-shrink-0 gap-1.5 font-plex py-2.5 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white whitespace-nowrap">
              <Users size={16} />
              <span>المراجعة الزوجية</span>
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="admin" data-testid="tab-admin" className="flex-shrink-0 gap-1.5 font-plex py-2.5 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white whitespace-nowrap">
                <Shield size={16} />
                <span>الإدارة</span>
              </TabsTrigger>
            )}
          </TabsList>

          {/* ===== SESSIONS TAB ===== */}
          <TabsContent value="sessions">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6 mb-6">
              <Card className="card-hover" data-testid="total-sessions-card">
                <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6">
                  <CardTitle className="font-plex text-xs sm:text-sm font-medium">إجمالي الحصص</CardTitle>
                  <Calendar className="text-primary" size={18} />
                </CardHeader>
                <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                  <div className="font-amiri text-2xl sm:text-3xl font-bold text-primary">{sessions.length}</div>
                </CardContent>
              </Card>
              <Card className="card-hover" data-testid="upcoming-sessions-card">
                <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6">
                  <CardTitle className="font-plex text-xs sm:text-sm font-medium">القادمة</CardTitle>
                  <Calendar className="text-secondary" size={18} />
                </CardHeader>
                <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                  <div className="font-amiri text-2xl sm:text-3xl font-bold text-secondary">{upcomingSessions.length}</div>
                </CardContent>
              </Card>
              <Card className="card-hover" data-testid="completed-sessions-card">
                <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6">
                  <CardTitle className="font-plex text-xs sm:text-sm font-medium">المكتملة</CardTitle>
                  <Users className="text-accent" size={18} />
                </CardHeader>
                <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                  <div className="font-amiri text-2xl sm:text-3xl font-bold text-accent">{completedSessions.length}</div>
                </CardContent>
              </Card>
              <Card className="card-hover" data-testid="messages-card">
                <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6">
                  <CardTitle className="font-plex text-xs sm:text-sm font-medium">رسائل جديدة</CardTitle>
                  <Mail className="text-blue-500" size={18} />
                </CardHeader>
                <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                  <div className="font-amiri text-2xl sm:text-3xl font-bold text-blue-500">{unreadMessages.length}</div>
                </CardContent>
              </Card>
            </div>

            {/* Upcoming Sessions */}
            {upcomingSessions.length > 0 && (
              <div className="mb-6">
                <h3 className="font-amiri text-xl sm:text-2xl font-bold text-primary mb-4">الحصص القادمة</h3>
                <div className="grid gap-3">
                  {upcomingSessions.map((session) => (
                    <Card key={session.session_id} className="card-hover" data-testid={`session-${session.session_id}`}>
                      <CardContent className="p-4 sm:p-6">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                          <div className="flex items-center gap-4 flex-1">
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <Users className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                              <h4 className="font-amiri text-lg sm:text-xl font-bold text-primary mb-1">حصة مع {session.student_name}</h4>
                              <p className="font-plex text-sm text-muted-foreground">
                                {new Date(session.scheduled_time).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}
                              </p>
                              <p className="font-plex text-xs text-muted-foreground">المدة: {session.duration} دقيقة</p>
                              {session.join_clicked_at && (
                                <p className="font-plex text-xs text-green-600 mt-1 flex items-center gap-1"><Check size={14} />الطالب دخل الحصة</p>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 flex-wrap justify-end">
                            <Button data-testid={`join-session-${session.session_id}`} onClick={() => handleTeacherJoinSession(session)} className="rounded-full" size="sm">دخول الحصة</Button>
                            <Button data-testid={`message-student-${session.session_id}`} onClick={() => { setComposeTarget({ id: session.student_id, name: session.student_name, key: Date.now() }); setActiveTab('messages'); }} variant="outline" className="rounded-full" size="sm">
                              <MessageSquare className="ml-1" size={14} />رسالة
                            </Button>
                            <Button data-testid={`cancel-session-${session.session_id}`} onClick={() => setCancelDialog({ open: true, session })} variant="outline" className="rounded-full border-red-500 text-red-500 hover:bg-red-50" size="sm">إلغاء</Button>
                            <Button
                            data-testid={`evaluate-session-${session.session_id}`}
                            onClick={() => setNotesDialog({ open: true, session, requireRating: true })}
                            variant="outline"
                            className="rounded-full border-amber-500 text-amber-600 hover:bg-amber-50"
                            size="sm"
                          >
                            <FileText className="ml-1" size={14} />تقييم الطالب
                          </Button>
                            {/* <Button data-testid={`notes-session-${session.session_id}`} onClick={() => setNotesDialog({ open: true, session })} variant="outline" className="rounded-full border-amber-500 text-amber-600 hover:bg-amber-50" size="sm">
                              <FileText className="ml-1" size={14} />ملاحظات
                            </Button> */}
                            
                            <Button data-testid={`view-student-${session.session_id}`} onClick={() => setStudentProfileDialog({ open: true, studentId: session.student_id, studentName: session.student_name })} variant="outline" className="rounded-full border-green-500 text-green-600 hover:bg-green-50" size="sm">
                              <Eye className="ml-1" size={14} />ملف الطالب
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Completed Sessions */}
            {completedSessions.length > 0 && (
              <div className="mb-6">
                <h3 className="font-amiri text-xl sm:text-2xl font-bold text-primary mb-4">الحصص المكتملة</h3>
                <div className="grid gap-3">
                  {completedSessions.map((session) => (
                    <Card key={session.session_id} className="card-hover">
                      <CardContent className="p-4 sm:p-6">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                          <div className="flex-1">
                            <h4 className="font-amiri text-lg sm:text-xl font-bold text-primary mb-1">حصة مع {session.student_name}</h4>
                            <p className="font-plex text-sm text-muted-foreground mb-2">
                              {new Date(session.scheduled_time).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}
                            </p>
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              {session.attendance_confirmed === true && (<span className="inline-flex items-center gap-1 text-xs font-plex px-2 py-1 rounded-full bg-green-100 text-green-700" data-testid={`attendance-confirmed-${session.session_id}`}><Check size={12} /> حاضر</span>)}
                              {session.attendance_confirmed === false && (<span className="inline-flex items-center gap-1 text-xs font-plex px-2 py-1 rounded-full bg-red-100 text-red-700" data-testid={`attendance-absent-${session.session_id}`}><XCircle size={12} /> غائب</span>)}
                              {session.attendance_confirmed == null && (<span className="inline-flex items-center gap-1 text-xs font-plex px-2 py-1 rounded-full bg-amber-100 text-amber-700">لم يتم تأكيد الحضور</span>)}
                              {session.join_clicked_at && (<span className="inline-flex items-center gap-1 text-xs font-plex px-2 py-1 rounded-full bg-blue-100 text-blue-700">الطالب ضغط دخول</span>)}
                            </div>
                            {session.rating && (<p className="font-plex text-sm"><span className="font-bold">التقييم:</span> {session.rating}</p>)}
                          </div>
                          <div className="flex gap-2 flex-wrap justify-end">
                            {session.attendance_confirmed == null && (
                              <>
                                <Button data-testid={`confirm-attend-${session.session_id}`} onClick={() => handleConfirmAttendance(session.session_id, true)} variant="outline" className="rounded-full border-green-500 text-green-600 hover:bg-green-50" size="sm"><Check className="ml-1" size={14} />حاضر</Button>
                                <Button data-testid={`confirm-absent-${session.session_id}`} onClick={() => handleConfirmAttendance(session.session_id, false)} variant="outline" className="rounded-full border-red-500 text-red-600 hover:bg-red-50" size="sm"><XCircle className="ml-1" size={14} />غائب</Button>
                              </>
                            )}
                            {!session.rating && (<Button onClick={() => setRatingDialog({ open: true, session })} variant="outline" className="rounded-full" size="sm"><Star className="ml-1" size={14} />تقييم</Button>)}
                            {/* <Button onClick={() => setNotesDialog({ open: true, session })} variant="outline" className="rounded-full border-amber-500 text-amber-600 hover:bg-amber-50" size="sm"><FileText className="ml-1" size={14} />ملاحظات</Button> */}
                            <Button
                              onClick={() => setNotesDialog({ open: true, session, requireRating: true })}
                              variant="outline"
                              className="rounded-full border-amber-500 text-amber-600 hover:bg-amber-50"
                              size="sm"
                            >
                              <FileText className="ml-1" size={14} />تقييم الطالب
                            </Button>
                            <Button onClick={() => setStudentProfileDialog({ open: true, studentId: session.student_id, studentName: session.student_name })} variant="outline" className="rounded-full border-green-500 text-green-600 hover:bg-green-50" size="sm"><Eye className="ml-1" size={14} />ملف الطالب</Button>
                            <Button data-testid={`hide-completed-${session.session_id}`} onClick={() => hideSession(session.session_id)} disabled={hidingSessionId === session.session_id} variant="outline" size="sm" className="rounded-full border-gray-300 text-gray-500 hover:bg-gray-100" title="إخفاء من العرض">
                              {hidingSessionId === session.session_id ? <div className="spinner border-2 border-gray-500 border-t-transparent rounded-full w-4 h-4"></div> : <><Trash2 className="ml-1" size={14} />إخفاء</>}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Cancelled Sessions */}
            {cancelledSessions.length > 0 && (
              <div className="mb-6">
                <h3 className="font-amiri text-xl sm:text-2xl font-bold text-red-600 mb-4 flex items-center gap-2"><XCircle size={22} />المواعيد الملغاة</h3>
                <div className="grid gap-3">
                  {cancelledSessions.map((session) => (
                    <Card key={session.session_id} className="border-red-200 bg-red-50/50" data-testid={`cancelled-session-${session.session_id}`}>
                      <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                          <div className="flex-1">
                            <h4 className="font-amiri text-lg font-bold text-red-600 mb-1">حصة ملغاة مع {session.student_name}</h4>
                            <p className="font-plex text-sm text-muted-foreground">{new Date(session.scheduled_time).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                            {session.cancellation_reason && (<p className="font-plex text-xs text-red-500">السبب: {session.cancellation_reason}</p>)}
                            {session.cancelled_by && (<p className="font-plex text-xs text-gray-500">ملغى بواسطة: {session.cancelled_by === 'teacher' ? 'المعلم' : 'الطالب'}</p>)}
                          </div>
                          <Button variant="outline" size="sm" onClick={() => hideSession(session.session_id)} disabled={hidingSessionId === session.session_id} className="rounded-full border-red-300 text-red-600 hover:bg-red-100" data-testid={`hide-session-${session.session_id}`}>
                            {hidingSessionId === session.session_id ? <div className="spinner border-2 border-red-500 border-t-transparent rounded-full w-4 h-4"></div> : <><Trash2 className="ml-1" size={14} />إخفاء</>}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {upcomingSessions.length === 0 && completedSessions.length === 0 && (
              <Card className="text-center p-12" data-testid="no-sessions-card">
                <Calendar className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-amiri text-2xl font-bold text-primary mb-2">لا توجد حصص</h3>
                <p className="font-plex text-muted-foreground">سيتم عرض حصصك المحجوزة هنا</p>
              </Card>
            )}
          </TabsContent>

          {/* ===== STUDENTS TAB ===== */}
          <TabsContent value="students">
            <div className="space-y-4 sm:space-y-6">
              <AllStudentsCommitments />
              <TeacherStudentsList isAdmin={isAdmin} />
            </div>
          </TabsContent>

          {/* ===== MEMORIZATION TAB ===== */}
          <TabsContent value="memorization">
            <TeacherStudentBrowser view="memorization" isAdmin={isAdmin} />
          </TabsContent>

          {/* ===== NOTES & RATINGS TAB ===== */}
          <TabsContent value="notes-ratings">
            <TeacherStudentBrowser view="notes" isAdmin={isAdmin} />
          </TabsContent>

          {/* ===== MESSAGES TAB ===== */}
          <TabsContent value="messages">
            <MessageInbox
              messages={messages}
              setMessages={setMessages}
              role="teacher"
              isAdmin={isAdmin}
              composeTarget={composeTarget}
              onComposeHandled={() => setComposeTarget(null)}
            />
          </TabsContent>

          {/* ===== TOOLS TAB ===== */}
          <TabsContent value="tools">
            <Tabs defaultValue="vacations" className="w-full">
              <TabsList className="h-auto p-1 bg-muted/60 rounded-xl mb-6 tabs-strip" data-testid="tools-subtabs">
                <TabsTrigger value="vacations" data-testid="subtab-vacations" className="flex-shrink-0 font-plex py-2 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white whitespace-nowrap">إدارة أيام الإجازة</TabsTrigger>
                <TabsTrigger value="restrictions" data-testid="subtab-restrictions" className="flex-shrink-0 font-plex py-2 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white whitespace-nowrap">تقييد حجوزات الطلاب</TabsTrigger>
                {isSlotManager && (
                  <TabsTrigger value="slots" data-testid="subtab-slots" className="flex-shrink-0 font-plex py-2 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white whitespace-nowrap">إدارة المواعيد المتاحة</TabsTrigger>
                )}
                <TabsTrigger value="points" data-testid="subtab-points" className="flex-shrink-0 font-plex py-2 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white whitespace-nowrap">إدارة نقاط الطلاب</TabsTrigger>
              </TabsList>

              <TabsContent value="vacations">
                <VacationManager />
              </TabsContent>
              <TabsContent value="restrictions">
                <StudentRestrictions
                  students={sessions.filter(s => s.status !== 'cancelled').map(s => ({ student_id: s.student_id, student_name: s.student_name })).filter((v, i, a) => a.findIndex(t => t.student_id === v.student_id) === i)}
                />
              </TabsContent>
              {isSlotManager && (
                <TabsContent value="slots">
                  <SlotsManager />
                </TabsContent>
              )}
              <TabsContent value="points">
                <StudentPointsManager />
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* ===== COMPETITIONS TAB ===== */}
          <TabsContent value="competitions">
            <CompetitionsManager />
          </TabsContent>

          {/* ===== PEER REVIEW TAB ===== */}
          <TabsContent value="peer-review">
            <PeerRequestsManager isAdmin={isAdmin} />
          </TabsContent>

          {/* ===== ADMIN TAB ===== */}
          {isAdmin && (
            <TabsContent value="admin">
              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="h-auto p-1 bg-purple-50 rounded-xl mb-6 tabs-strip" data-testid="admin-subtabs">
                  <TabsTrigger value="overview" data-testid="subtab-overview" className="flex-shrink-0 font-plex py-2 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white whitespace-nowrap">نظرة عامة</TabsTrigger>
                  <TabsTrigger value="teachers" data-testid="subtab-teachers" className="flex-shrink-0 font-plex py-2 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white whitespace-nowrap">إدارة المعلمين</TabsTrigger>
                  <TabsTrigger value="announcements" data-testid="subtab-announcements" className="flex-shrink-0 font-plex py-2 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white whitespace-nowrap">إدارة الإعلانات العامة</TabsTrigger>
                  <TabsTrigger value="students-of-week" data-testid="subtab-students-of-week" className="flex-shrink-0 font-plex py-2 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white whitespace-nowrap">إدارة طلاب الأسبوع</TabsTrigger>
                  <TabsTrigger value="content" data-testid="subtab-content" className="flex-shrink-0 font-plex py-2 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white whitespace-nowrap">إدارة المحتوى</TabsTrigger>
                  <TabsTrigger value="license" data-testid="subtab-license" className="flex-shrink-0 font-plex py-2 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white whitespace-nowrap">إدارة الترخيص</TabsTrigger>
                  <TabsTrigger value="accounts" data-testid="subtab-accounts" className="flex-shrink-0 font-plex py-2 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white whitespace-nowrap">إدارة الحسابات</TabsTrigger>
                  <TabsTrigger value="certificates" data-testid="subtab-certificates" className="flex-shrink-0 font-plex py-2 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white whitespace-nowrap">الشهادات</TabsTrigger>
                </TabsList>

                {/* Overview: Stats + Bookings by Teacher */}
                <TabsContent value="overview">
                  {adminStats && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-4"><BarChart3 className="text-purple-600" size={24} /><h3 className="font-amiri text-xl sm:text-2xl font-bold text-purple-600">إحصائيات المقرأة</h3></div>
                      <div className="grid grid-cols-3 gap-3 sm:gap-6 mb-4">
                        <Card className="bg-gradient-to-br from-purple-500 to-purple-700 text-white">
                          <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6"><CardTitle className="font-plex text-xs sm:text-sm font-medium text-purple-100">إجمالي الحجوزات</CardTitle><Calendar className="text-purple-200 hidden sm:block" size={20} /></CardHeader>
                          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0"><div className="font-amiri text-2xl sm:text-4xl font-bold">{adminStats.total_sessions}</div></CardContent>
                        </Card>
                        <Card className="bg-gradient-to-br from-blue-500 to-blue-700 text-white">
                          <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6"><CardTitle className="font-plex text-xs sm:text-sm font-medium text-blue-100">عدد الطلاب</CardTitle><GraduationCap className="text-blue-200 hidden sm:block" size={20} /></CardHeader>
                          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0"><div className="font-amiri text-2xl sm:text-4xl font-bold">{adminStats.total_students}</div></CardContent>
                        </Card>
                        <Card className="bg-gradient-to-br from-green-500 to-green-700 text-white">
                          <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6"><CardTitle className="font-plex text-xs sm:text-sm font-medium text-green-100">عدد المعلمين</CardTitle><Users className="text-green-200 hidden sm:block" size={20} /></CardHeader>
                          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0"><div className="font-amiri text-2xl sm:text-4xl font-bold">{adminStats.total_teachers}</div></CardContent>
                        </Card>
                      </div>
                      {/* Bookings by Teacher */}
                      <div className="space-y-4">
                        {adminStats.bookings_by_teacher.map((teacherData) => (
                          <Card key={teacherData.teacher_id} className="border-2 border-purple-200">
                            <CardHeader className="bg-purple-50 p-3 sm:p-6">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="flex items-center gap-2 sm:gap-3">
                                  <User className="text-purple-600" size={20} />
                                  <div>
                                    <CardTitle className="font-amiri text-lg sm:text-xl text-purple-700">{teacherData.teacher_name}</CardTitle>
                                    <p className="font-plex text-xs sm:text-sm text-purple-500">{teacherData.teacher_email}</p>
                                  </div>
                                </div>
                                <div className="bg-purple-600 text-white px-3 py-1 rounded-full font-bold text-sm self-start sm:self-auto">{teacherData.total_bookings} حجز</div>
                              </div>
                            </CardHeader>
                            <CardContent className="p-3 sm:p-4">
                              {teacherData.students.length > 0 ? (
                                <div className="space-y-2">
                                  <div className="grid gap-2">
                                    {teacherData.students.map((student) => (
                                      <div key={student.session_id || student.student_id} className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg ${student.session_status === 'scheduled' ? 'bg-green-50 border border-green-200' : student.session_status === 'cancelled' ? 'bg-red-50 border border-red-200' : 'bg-gray-50 border border-gray-200'}`}>
                                        <div className="flex items-center gap-3">
                                          {student.student_picture ? (<img src={student.student_picture} alt={student.student_name} className="w-10 h-10 rounded-full object-cover" />) : (<div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center"><User size={20} className="text-gray-600" /></div>)}
                                          <div>
                                            <p className="font-plex font-bold text-gray-800">{student.student_name}</p>
                                            <p className="font-plex text-xs text-gray-500">{student.student_email}</p>
                                            {student.session_status === 'cancelled' && student.cancellation_reason && (<p className="font-plex text-xs text-red-500 mt-1">السبب: {student.cancellation_reason}</p>)}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap justify-end">
                                          <div className="text-left">
                                            <p className="font-plex text-sm text-gray-600">{new Date(student.session_time).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                                            <span className={`text-xs px-2 py-1 rounded-full ${student.session_status === 'scheduled' ? 'bg-green-500 text-white' : student.session_status === 'cancelled' ? 'bg-red-500 text-white' : 'bg-gray-500 text-white'}`}>{student.session_status === 'scheduled' ? 'مجدول' : student.session_status === 'cancelled' ? 'ملغي' : 'مكتمل'}</span>
                                          </div>
                                          {student.session_id && (<Button variant="ghost" size="sm" onClick={() => hideSession(student.session_id)} disabled={hidingSessionId === student.session_id} className="text-red-500 hover:text-red-700 hover:bg-red-100 px-2 py-1" title="إخفاء الموعد من العرض">{hidingSessionId === student.session_id ? <div className="spinner border-2 border-red-500 border-t-transparent rounded-full w-4 h-4"></div> : <Trash2 size={16} />}</Button>)}
                                          <Button variant="ghost" size="sm" onClick={() => setStudentArchiveDialog({ open: true, student: { id: student.student_id, name: student.student_name } })} className="text-primary hover:text-primary/80 hover:bg-primary/10 px-2 py-1" title="أرشيف الملاحظات" data-testid={`archive-btn-${student.student_id}`}><FileText size={18} /></Button>
                                          <Button variant="ghost" size="sm" onClick={() => setStudentProfileDialog({ open: true, studentId: student.student_id, studentName: student.student_name })} className="text-green-600 hover:text-green-700 hover:bg-green-50 px-2 py-1" title="عرض ملف الطالب الكامل" data-testid={`profile-btn-${student.student_id}`}><Eye size={18} /></Button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : (<p className="font-plex text-gray-500 text-center py-4">لا توجد حجوزات</p>)}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Teachers Management */}
                <TabsContent value="teachers">
                  <div className="space-y-4 sm:space-y-6">
                    <TeacherPromotion />
                    <TeacherLinkManager />
                    {weeklyRotation && (
                      <Card className="border-2 border-indigo-200">
                        <CardHeader className="bg-indigo-50">
                          <CardTitle className="font-amiri text-xl text-indigo-700 flex items-center gap-2"><RefreshCw size={24} />التناوب الأسبوعي بين المعلمين</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4">
                          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <Label className="font-plex font-bold">تفعيل التناوب الأسبوعي</Label>
                            <Switch checked={weeklyRotation.enabled} onCheckedChange={(checked) => updateWeeklyRotation({ enabled: checked, start_date: weeklyRotation.start_date || new Date().toISOString().split('T')[0], first_week_teacher: weeklyRotation.first_week_teacher || (weeklyRotation.teachers?.[0]?.teacher_id || '') })} />
                          </div>
                          {weeklyRotation.enabled && (
                            <>
                              <div>
                                <Label className="font-plex">تاريخ بداية الأسبوع الأول</Label>
                                <Input type="date" value={weeklyRotation.start_date || ''} onChange={(e) => updateWeeklyRotation({ ...weeklyRotation, start_date: e.target.value })} className="font-plex mt-2" />
                              </div>
                              <div>
                                <Label className="font-plex">المعلم في الأسبوع الأول</Label>
                                <Select value={weeklyRotation.first_week_teacher} onValueChange={(value) => updateWeeklyRotation({ ...weeklyRotation, first_week_teacher: value })}>
                                  <SelectTrigger className="mt-2"><SelectValue placeholder="اختر المعلم" /></SelectTrigger>
                                  <SelectContent>{weeklyRotation.teachers?.map((teacher) => (<SelectItem key={teacher.teacher_id} value={teacher.teacher_id}>{teacher.name}</SelectItem>))}</SelectContent>
                                </Select>
                              </div>
                              <div className="p-4 bg-indigo-50 rounded-lg"><p className="font-plex text-sm text-indigo-700"><strong>كيف يعمل:</strong> الأسبوع الأول سيكون الحجز متاحًا فقط مع المعلم الأول، والأسبوع الثاني مع المعلم الآخر، وهكذا بالتناوب.</p></div>
                            </>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </TabsContent>

                {/* Announcements */}
                <TabsContent value="announcements">
                  <AnnouncementsManager />
                </TabsContent>

                {/* Students of Week */}
                <TabsContent value="students-of-week">
                  <StudentOfWeekManager />
                </TabsContent>

                {/* Content */}
                <TabsContent value="content">
                  <ContentManager />
                </TabsContent>

                {/* License */}
                <TabsContent value="license">
                  <LicenseManager />
                </TabsContent>

                {/* Accounts */}
                <TabsContent value="accounts">
                  <div className="space-y-4 sm:space-y-6">
                    <AdminFrozenStudentsManager />
                    <CommitmentHolidaysManager />
                    <AdminAccountDeletion />
                  </div>
                </TabsContent>

                {/* Certificates (admin-only issuing) */}
                <TabsContent value="certificates">
                  <CertificatesManager />
                </TabsContent>
              </Tabs>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Dialogs */}
      <Dialog open={ratingDialog.open} onOpenChange={(open) => !open && setRatingDialog({ open: false, session: null })}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-amiri text-2xl">تقييم الطالب</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {ratingDialog.session && ratingDialog.session.attendance_confirmed == null && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <Label className="font-plex font-bold text-amber-800 mb-2 block">تأكيد الحضور</Label>
                <p className="font-plex text-xs text-amber-600 mb-2">هل حضر الطالب هذه الحصة فعلاً؟</p>
                <div className="flex gap-2">
                  <Button data-testid="dialog-confirm-attend" onClick={() => handleConfirmAttendance(ratingDialog.session.session_id, true)} variant="outline" size="sm" className="rounded-full border-green-500 text-green-600 hover:bg-green-50"><Check className="ml-1" size={14} />حاضر</Button>
                  <Button data-testid="dialog-confirm-absent" onClick={() => handleConfirmAttendance(ratingDialog.session.session_id, false)} variant="outline" size="sm" className="rounded-full border-red-500 text-red-600 hover:bg-red-50"><XCircle className="ml-1" size={14} />غائب</Button>
                </div>
              </div>
            )}
            {ratingDialog.session && ratingDialog.session.attendance_confirmed === true && (<div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3"><Check size={16} className="text-green-600" /><span className="font-plex text-sm text-green-700">تم تأكيد حضور الطالب</span></div>)}
            {ratingDialog.session && ratingDialog.session.attendance_confirmed === false && (<div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3"><XCircle size={16} className="text-red-600" /><span className="font-plex text-sm text-red-700">تم تسجيل غياب الطالب</span></div>)}
            <div>
              <Label className="font-plex mb-2">تقييم التسميع</Label>
              <Select value={rating} onValueChange={setRating}><SelectTrigger data-testid="rating-select"><SelectValue placeholder="اختر التقييم" /></SelectTrigger><SelectContent><SelectItem value="ضعيف">ضعيف</SelectItem><SelectItem value="مقبول">مقبول</SelectItem><SelectItem value="متوسط">متوسط</SelectItem><SelectItem value="ممتاز">ممتاز</SelectItem></SelectContent></Select>
            </div>
            <div>
              <Label className="font-plex mb-2">ملاحظات (اختياري)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="أضف ملاحظات عن أداء الطالب..." rows={4} className="font-plex" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleRateSession} className="rounded-full" data-testid="save-rating-btn">حفظ التقييم</Button>
            <Button variant="outline" onClick={() => setRatingDialog({ open: false, session: null })} className="rounded-full">إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SessionNotesDialog open={notesDialog.open} onClose={() => setNotesDialog({ open: false, session: null })} session={notesDialog.session} onSaved={() => { loadData(); setPendingRefreshKey(k => k + 1); }} requireRating={!!notesDialog.requireRating} />

      {/* Forced pending evaluations popup — opens the unified evaluation dialog (rating + recitation/memorization) */}
      <PendingEvaluationsDialog
        refreshKey={pendingRefreshKey}
        onStartEvaluation={(session) => setNotesDialog({ open: true, session, requireRating: true })}
      />
      <CancelSessionDialog open={cancelDialog.open} onClose={() => setCancelDialog({ open: false, session: null })} session={cancelDialog.session} onCancelled={loadData} />

      <Dialog open={studentArchiveDialog.open} onOpenChange={(open) => !open && setStudentArchiveDialog({ open: false, student: null })}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-amiri text-2xl flex items-center gap-2"><FileText className="text-primary" />أرشيف ملاحظات الطالب</DialogTitle></DialogHeader>
          {studentArchiveDialog.student && (<StudentNotesArchive studentId={studentArchiveDialog.student.id} studentName={studentArchiveDialog.student.name} isTeacher={true} isAdmin={isAdmin} />)}
        </DialogContent>
      </Dialog>

      <StudentProfileModal open={studentProfileDialog.open} onClose={() => setStudentProfileDialog({ open: false, studentId: null, studentName: null })} studentId={studentProfileDialog.studentId} studentName={studentProfileDialog.studentName} isAdmin={isAdmin} />
      <SetPasswordDialog open={showSetPasswordDialog} onClose={() => setShowSetPasswordDialog(false)} onSuccess={() => loadData()} />
      <JoinFallbackDialog
        open={joinFallback.open}
        onClose={() => setJoinFallback({ open: false, link: '', error: '' })}
        link={joinFallback.link}
        errorMessage={joinFallback.error}
      />
    </div>
  );
};

export default TeacherDashboard;
