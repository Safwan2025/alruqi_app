import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Calendar, Users, LogOut, User, Mail, Check, BookOpen, XCircle, Trash2, Inbox, Star, Trophy, Award } from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';
import NotificationBell from '@/components/NotificationBell';
import StudentOfWeek from '@/components/StudentOfWeek';
import StudentPerformanceIndicator from '@/components/StudentPerformanceIndicator';
import StudentNotesArchive from '@/components/StudentNotesArchive';
import StudentProgress from '@/components/StudentProgress';
import CancelSessionDialog from '@/components/CancelSessionDialog';
import SetPasswordDialog from '@/components/SetPasswordDialog';
import CommitmentSetupDialog from '@/components/CommitmentSetupDialog';
import MessageInbox from '@/components/MessageInbox';
import StudentCommitment from '@/components/StudentCommitment';
import JoinCompetitionDialog from '@/components/JoinCompetitionDialog';
import CompetitionHistoryList from '@/components/CompetitionHistoryList';
import PeerReviewSection from '@/components/PeerReviewSection';
import StudentWeeklyPlansViewer from '@/components/StudentWeeklyPlansViewer';
import MyCertificates from '@/components/MyCertificates';

const StudentDashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [peerSessions, setPeerSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [cancelDialog, setCancelDialog] = useState({ open: false, session: null });
  const [hidingSessionId, setHidingSessionId] = useState(null);
  const [showSetPasswordDialog, setShowSetPasswordDialog] = useState(false);
  const [needsCommitment, setNeedsCommitment] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [composeTarget, setComposeTarget] = useState(null);
  const [joinCompOpen, setJoinCompOpen] = useState(false);

  useEffect(() => {
    loadData();
    loadMessages();
    checkCommitment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkCommitment = async () => {
    try {
      const res = await api.get('/student/commitment');
      const c = res.data?.commitment;
      if (!c || !c.min_sessions_per_week || !c.min_pages_per_week) {
        setNeedsCommitment(true);
      }
    } catch {
      // silent — if endpoint fails, don't block
    }
  };

  const loadMessages = async () => {
    try {
      const response = await api.get('/messages/my-messages');
      setMessages(response.data);
    } catch (error) {
      console.error('Failed to load messages');
    }
  };

  const loadData = async () => {
    try {
      const [userRes, sessionsRes, peerSessRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/sessions/my-sessions'),
        api.get('/peers/sessions').catch(() => ({ data: [] }))
      ]);
      setUser(userRes.data);
      setSessions(sessionsRes.data);
      setPeerSessions(peerSessRes.data || []);
      if (userRes.data.needs_password_setup) {
        setShowSetPasswordDialog(true);
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

  // const handleJoinSession = async (session) => {
  //   try {
  //     await api.post(`/sessions/${session.session_id}/join-click`);
  //     navigate(`/live-classroom/${session.session_id}`);
  //   } catch (error) {
  //     toast.error(error.response?.data?.detail || 'فشل في الانضمام');
  //   }
  // };

  const normalizeUrl = (url) => {
  if (!url) return '';
  const trimmed = url.trim();

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  return `https://${trimmed}`;
};

const handleJoinSession = async (session) => {
  /*
   * iPhone/Safari popup-blocker fix.
   *
   * Safari only allows `window.open(...)` calls that happen SYNCHRONOUSLY
   * inside the click handler. Once we `await` the API calls, the JS task
   * resumes in a new microtask without an active "user gesture" token and
   * Safari silently blocks any subsequent `window.open(url, '_blank')`.
   *
   * The fix is to open a blank tab synchronously *first* (Safari allows
   * that), keep a reference to it, then redirect that already-open tab
   * once the meet link is ready.
   *
   * Fallbacks (in order):
   *  1. If `window.open('', '_blank')` returned a valid tab → redirect it.
   *  2. If the blank tab was blocked too → set `window.location.href`
   *     directly so the student still reaches the session (in-tab nav is
   *     always allowed).
   *  3. If the API fails before we get a meet link → close the blank tab
   *     and show a clickable fallback link via toast.
   */
  /* IMPORTANT: do NOT pass 'noopener,noreferrer' here.
     Those features sever the JS reference to the new tab, which means
     `preOpenedWin.location.href = link` later becomes a no-op and Safari
     leaves the student staring at a blank tab. Open with no features so
     we keep a live handle to the tab. */
  let preOpenedWin = null;
  try {
    preOpenedWin = window.open('about:blank', '_blank');
  } catch (_) { preOpenedWin = null; }

  try {
    await api.post(`/sessions/${session.session_id}/join`);

    const response = await api.get(`/sessions/${session.session_id}/join-link`);
    const meetLink = normalizeUrl(response.data?.recitation_link);

    if (!meetLink) {
      if (preOpenedWin && !preOpenedWin.closed) preOpenedWin.close();
      toast.error('لم يتم تعيين رابط الحصة بعد');
      return;
    }

    if (preOpenedWin && !preOpenedWin.closed) {
      /* Safari path: navigate the tab we opened synchronously. */
      preOpenedWin.location.href = meetLink;
    } else {
      /* Blank tab was blocked (very strict Safari settings). Try a
         hidden <a> click — still respected because it shares the same
         user-gesture chain as the original button click. */
      const a = document.createElement('a');
      a.href = meetLink;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();

      /* Last resort: tell the student and give them a clickable link so
         they can finish the navigation in one tap. */
      toast.success(
        (t) => (
          <span>
            إذا لم تُفتح الحصة تلقائيًا، {' '}
            <a
              href={meetLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => toast.dismiss(t.id)}
              style={{ color: '#2563eb', textDecoration: 'underline', fontWeight: 600 }}
            >
              اضغط هنا للدخول
            </a>
          </span>
        ),
        { duration: 8000 }
      );
    }
  } catch (error) {
    if (preOpenedWin && !preOpenedWin.closed) preOpenedWin.close();
    toast.error(error.response?.data?.detail || 'فشل في الانضمام');
  }
};

  


  const hideSession = async (sessionId) => {
    setHidingSessionId(sessionId);
    try {
      await api.delete(`/sessions/${sessionId}/hide`);
      setSessions(prev => prev.filter(s => s.session_id !== sessionId));
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
  const unreadMessages = messages.filter(m => !m.read && (m.from_role === 'teacher' || !m.from_role));

  // Peer sessions surfaced as regular session-like cards (hide ones older than 6 hours).
  const HIDE_THRESHOLD_MS = 6 * 60 * 60 * 1000;
  const upcomingPeerSessions = peerSessions.filter(p => {
    const t = new Date(p.scheduled_time).getTime();
    return t + HIDE_THRESHOLD_MS > Date.now();
  });
  const partnerOf = (p) => (p.creator_id === user?.user_id ? p.booker_name : p.creator_name);

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
          <h2 className="font-amiri text-2xl sm:text-4xl font-bold text-primary mb-1">مرحباً {user?.name}</h2>
          <p className="font-plex text-sm sm:text-base text-muted-foreground">نتمنى لك يوماً مليئاً بالتعلم والبركة</p>
        </div>

        <div className="mb-4"><StudentOfWeek variant="compact" /></div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="h-auto p-1 bg-muted rounded-xl mb-6 tabs-strip" data-testid="student-tabs">
            <TabsTrigger value="home" data-testid="tab-home" className="flex-shrink-0 gap-1.5 font-plex py-2.5 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white whitespace-nowrap">
              <Calendar size={16} />
              <span>مواعيدي</span>
              {upcomingSessions.length > 0 && (
                <span className="bg-secondary text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">{upcomingSessions.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="progress" data-testid="tab-progress" className="flex-shrink-0 gap-1.5 font-plex py-2.5 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white whitespace-nowrap">
              <BookOpen size={16} />
              <span>سجل حفظي</span>
            </TabsTrigger>
            <TabsTrigger value="notes" data-testid="tab-notes" className="flex-shrink-0 gap-1.5 font-plex py-2.5 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white whitespace-nowrap">
              <Mail size={16} />
              <span>ملاحظاتي</span>
            </TabsTrigger>
            <TabsTrigger value="messages" data-testid="tab-messages" className="flex-shrink-0 gap-1.5 font-plex py-2.5 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white whitespace-nowrap">
              <Inbox size={16} />
              <span>رسائلي</span>
              {unreadMessages.length > 0 && (
                <span className="bg-blue-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">{unreadMessages.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="commitment" data-testid="tab-commitment" className="flex-shrink-0 gap-1.5 font-plex py-2.5 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white whitespace-nowrap">
              <Star size={16} />
              <span>التزامي</span>
            </TabsTrigger>
            <TabsTrigger value="competitions" data-testid="tab-student-competitions" className="flex-shrink-0 gap-1.5 font-plex py-2.5 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white whitespace-nowrap">
              <Trophy size={16} />
              <span>المسابقات</span>
            </TabsTrigger>
            <TabsTrigger value="peer-review" data-testid="tab-peer-review" className="flex-shrink-0 gap-1.5 font-plex py-2.5 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white whitespace-nowrap">
              <Users size={16} />
              <span>المراجعة الزوجية</span>
            </TabsTrigger>
            <TabsTrigger value="my-certificates" data-testid="tab-my-certificates" className="flex-shrink-0 gap-1.5 font-plex py-2.5 px-3 text-xs sm:text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white whitespace-nowrap">
              <Award size={16} />
              <span>شهاداتي</span>
            </TabsTrigger>
          </TabsList>

          {/* ===== HOME / SESSIONS TAB ===== */}
          <TabsContent value="home">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6 mb-6">
              <Card className="card-hover" data-testid="total-sessions-card">
                <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6">
                  <CardTitle className="font-plex text-xs sm:text-sm font-medium">إجمالي الحصص</CardTitle>
                  <BookOpen className="text-primary" size={18} />
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
                  <div className="font-amiri text-2xl sm:text-3xl font-bold text-secondary">{upcomingSessions.length + upcomingPeerSessions.length}</div>
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

            {/* Quick Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6">
              <Button data-testid="browse-teachers-btn" onClick={() => navigate('/teachers')} size="lg" className="h-auto py-4 sm:py-6 rounded-xl bg-primary hover:bg-primary/90">
                <div className="text-right w-full">
                  <div className="font-amiri text-lg sm:text-xl font-bold mb-1">تصفح المعلمين</div>
                  <div className="font-plex text-xs opacity-90">ابحث عن معلم واحجز حصتك</div>
                </div>
              </Button>
              <Button data-testid="join-competition-btn" onClick={() => setJoinCompOpen(true)} size="lg" className="h-auto py-4 sm:py-6 rounded-xl bg-green-600 hover:bg-green-700">
                <div className="text-right w-full flex items-start gap-2">
                  <Trophy size={20} className="mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-amiri text-lg sm:text-xl font-bold mb-1">انضم إلى مسابقة</div>
                    <div className="font-plex text-xs opacity-90">أدخل الكود من معلمك</div>
                  </div>
                </div>
              </Button>
              <Button data-testid="send-message-btn" onClick={() => { setComposeTarget({ id: null, name: null, key: Date.now() }); setActiveTab('messages'); }} size="lg" className="h-auto py-4 sm:py-6 rounded-xl bg-blue-600 hover:bg-blue-700">
                <div className="text-right w-full">
                  <div className="font-amiri text-lg sm:text-xl font-bold mb-1">إرسال رسالة</div>
                  <div className="font-plex text-xs opacity-90">تواصل مع المعلمين</div>
                </div>
              </Button>
              <Button data-testid="my-profile-btn" onClick={() => navigate('/profile')} size="lg" variant="outline" className="h-auto py-4 sm:py-6 rounded-xl border-2">
                <div className="text-right w-full">
                  <div className="font-amiri text-lg sm:text-xl font-bold mb-1">ملفي الشخصي</div>
                  <div className="font-plex text-xs opacity-70">عدل معلوماتك الشخصية</div>
                </div>
              </Button>
            </div>

            {/* Upcoming Sessions */}
            {(upcomingSessions.length > 0 || upcomingPeerSessions.length > 0) && (
              <div className="mb-6">
                <h3 className="font-amiri text-xl sm:text-2xl font-bold text-primary mb-4">الحصص القادمة</h3>
                <div className="grid gap-3">
                  {upcomingSessions.map((session) => (
                    <Card key={session.session_id} className="card-hover" data-testid={`session-${session.session_id}`}>
                      <CardContent className="p-4 sm:p-6">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                          <div className="flex-1">
                            <h4 className="font-amiri text-lg sm:text-xl font-bold text-primary mb-1">حصة مع {session.teacher_name}</h4>
                            <p className="font-plex text-sm text-muted-foreground">{new Date(session.scheduled_time).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                            <p className="font-plex text-xs text-muted-foreground">المدة: {session.duration} دقيقة</p>
                          </div>
                          <div className="flex gap-2 w-full sm:w-auto">
                            <Button data-testid={`join-session-${session.session_id}`} onClick={() => handleJoinSession(session)} className="rounded-full flex-1 sm:flex-none" size="sm">
                              {session.join_clicked_at ? <><Check size={14} className="ml-1" />إعادة الدخول</> : 'دخول الحصة'}
                            </Button>
                            <Button data-testid={`cancel-session-${session.session_id}`} onClick={() => setCancelDialog({ open: true, session })} variant="outline" className="rounded-full border-red-500 text-red-500 hover:bg-red-50 flex-1 sm:flex-none" size="sm">إلغاء</Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {upcomingPeerSessions.map((ps) => {
                    const past = new Date(ps.scheduled_time).getTime() < Date.now();
                    const cancelPeer = async () => {
                      if (!window.confirm('سيتم إلغاء موعد المراجعة الزوجية. هل أنت متأكد؟')) return;
                      try {
                        await api.delete(`/peers/sessions/${ps.peer_session_id}`);
                        toast.success('تم إلغاء الموعد');
                        loadData();
                      } catch (e) {
                        toast.error(e.response?.data?.detail || 'فشل الإلغاء');
                      }
                    };
                    return (
                      <Card key={ps.peer_session_id} className="card-hover border-amber-200 bg-amber-50/30" data-testid={`peer-session-card-${ps.peer_session_id}`}>
                        <CardContent className="p-4 sm:p-6">
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <h4 className="font-amiri text-lg sm:text-xl font-bold text-primary">جلسة مراجعة مع قرينك {partnerOf(ps)}</h4>
                                <span className="bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full text-[10px] font-plex">مراجعة زوجية</span>
                              </div>
                              <p className="font-plex text-sm text-muted-foreground">{new Date(ps.scheduled_time).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                              <p className="font-plex text-xs text-muted-foreground">المدة: {ps.duration} دقيقة</p>
                              {past && <p className="font-plex text-xs text-amber-700 mt-1">انتقل إلى تبويب "المراجعة" لتأكيد الحضور وتقييم قرينك.</p>}
                            </div>
                            <div className="flex gap-2 w-full sm:w-auto flex-wrap">
                              {ps.meet_link ? (
                                <Button asChild className="rounded-full flex-1 sm:flex-none" size="sm" data-testid={`join-peer-${ps.peer_session_id}`}>
                                  <a href={ps.meet_link} target="_blank" rel="noopener noreferrer">دخول الحصة</a>
                                </Button>
                              ) : (
                                <Button variant="outline" disabled size="sm" className="rounded-full flex-1 sm:flex-none" data-testid={`peer-no-link-${ps.peer_session_id}`}>لا يوجد رابط</Button>
                              )}
                              <Button variant="outline" size="sm" onClick={() => setActiveTab('peer-review')} className="rounded-full flex-1 sm:flex-none" data-testid={`peer-open-review-${ps.peer_session_id}`}>التفاصيل</Button>
                              {!past && (
                                <Button variant="outline" size="sm" onClick={cancelPeer} className="rounded-full border-red-500 text-red-500 hover:bg-red-50 flex-1 sm:flex-none whitespace-nowrap" data-testid={`cancel-peer-${ps.peer_session_id}`}>
                                  إلغاء
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {upcomingSessions.length === 0 && upcomingPeerSessions.length === 0 && (
              <Card className="text-center p-6 sm:p-12 mb-6" data-testid="no-sessions-card">
                <Calendar className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-amiri text-xl sm:text-2xl font-bold text-primary mb-2">لا توجد حصص قادمة</h3>
                <p className="font-plex text-sm text-muted-foreground mb-4">ابدأ بحجز حصتك الأولى مع أحد معلمينا المتميزين</p>
                <Button data-testid="browse-teachers-empty-btn" onClick={() => navigate('/teachers')} className="rounded-full">تصفح المعلمين</Button>
              </Card>
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
                            <h4 className="font-amiri text-lg font-bold text-red-600 mb-1">حصة ملغاة مع {session.teacher_name}</h4>
                            <p className="font-plex text-sm text-muted-foreground">{new Date(session.scheduled_time).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                            {session.cancellation_reason && (<p className="font-plex text-xs text-red-500">السبب: {session.cancellation_reason}</p>)}
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
          </TabsContent>

          {/* ===== PROGRESS TAB ===== */}
          <TabsContent value="progress">
            {user && <StudentProgress studentId={user.user_id} />}
          </TabsContent>

          {/* ===== NOTES TAB ===== */}
          <TabsContent value="notes">
            {user && <StudentNotesArchive studentId={user.user_id} studentName={user.name} isTeacher={false} isAdmin={false} />}
          </TabsContent>

          {/* ===== COMMITMENT TAB ===== */}
          <TabsContent value="commitment">
            <div className="space-y-4 sm:space-y-6">
              <StudentCommitment />
              <StudentPerformanceIndicator />
            </div>
          </TabsContent>

          {/* ===== COMPETITIONS HISTORY TAB ===== */}
          <TabsContent value="competitions">
            <CompetitionHistoryList own title="سجل مسابقاتي" />
          </TabsContent>

          {/* ===== PEER REVIEW TAB ===== */}
          <TabsContent value="peer-review">
            <div className="space-y-4 sm:space-y-6">
              <PeerReviewSection user={user} />
              <StudentWeeklyPlansViewer />
            </div>
          </TabsContent>

          {/* ===== MY CERTIFICATES TAB ===== */}
          <TabsContent value="my-certificates">
            <MyCertificates />
          </TabsContent>

          {/* ===== MESSAGES TAB ===== */}
          <TabsContent value="messages">
            <MessageInbox
              messages={messages}
              setMessages={setMessages}
              role="student"
              composeTarget={composeTarget}
              onComposeHandled={() => setComposeTarget(null)}
            />
          </TabsContent>
        </Tabs>
      </div>

      <CancelSessionDialog open={cancelDialog.open} onClose={() => setCancelDialog({ open: false, session: null })} session={cancelDialog.session} onCancelled={loadData} />
      <SetPasswordDialog open={showSetPasswordDialog} onClose={() => setShowSetPasswordDialog(false)} onSuccess={() => loadData()} />
      <CommitmentSetupDialog open={needsCommitment} onSaved={() => setNeedsCommitment(false)} />
      <JoinCompetitionDialog open={joinCompOpen} onClose={() => setJoinCompOpen(false)} selfUserId={user?.user_id} />
    </div>
  );
};

export default StudentDashboard;