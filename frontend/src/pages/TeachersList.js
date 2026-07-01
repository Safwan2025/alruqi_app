import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Star, ArrowRight, LogOut, User, Users, Home } from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';
import NotificationBell from '@/components/NotificationBell';

const TeachersList = () => {
  const navigate = useNavigate();
  const [teachers, setTeachers] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Always load teachers (public)
      const teachersRes = await api.get('/teachers');
      setTeachers(teachersRes.data);
      
      // Try to load user if logged in
      const sessionToken = localStorage.getItem('session_token');
      if (sessionToken) {
        try {
          const userRes = await api.get('/auth/me');
          setUser(userRes.data);
          setIsLoggedIn(true);
        } catch (error) {
          // Not logged in, that's ok
          setIsLoggedIn(false);
        }
      }
    } catch (error) {
      toast.error('فشل تحميل المعلمين');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
      localStorage.removeItem('session_token');
      localStorage.removeItem('remember_me');
      setUser(null);
      setIsLoggedIn(false);
      toast.success('تم تسجيل الخروج');
    } catch (error) {
      localStorage.removeItem('session_token');
      localStorage.removeItem('remember_me');
      setUser(null);
      setIsLoggedIn(false);
    }
  };

  const handleBookSession = (teacherId) => {
    if (isLoggedIn) {
      navigate(`/book/${teacherId}`);
    } else {
      toast.info('يرجى تسجيل الدخول أولاً لحجز حصة');
      navigate('/login');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner border-4 border-primary border-t-transparent rounded-full w-12 h-12"></div>
      </div>
    );
  }

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
                className="w-10 h-10 sm:w-12 sm:h-12 object-contain cursor-pointer rounded-full bg-white p-0.5"
                onClick={() => navigate('/')}
              />
              <h1 className="font-amiri text-lg sm:text-2xl font-bold text-primary hidden sm:block">مقرأة الرقي</h1>
            </div>
            <div className="flex items-center gap-1 sm:gap-4">
              {isLoggedIn ? (
                <>
                  <NotificationBell />
                  <Button
                    data-testid="profile-btn"
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/profile')}
                    className="px-2 sm:px-4"
                  >
                    <User size={18} />
                    <span className="hidden sm:inline mr-2">{user?.name}</span>
                  </Button>
                  <Button
                    data-testid="dashboard-btn"
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(user?.role === 'teacher' ? '/dashboard/teacher' : '/dashboard/student')}
                    className="px-2 sm:px-4"
                  >
                    <Home size={18} />
                    <span className="hidden sm:inline mr-2">لوحة التحكم</span>
                  </Button>
                  <Button
                    data-testid="logout-btn"
                    variant="outline"
                    size="sm"
                    onClick={handleLogout}
                    className="px-2 sm:px-4"
                  >
                    <LogOut size={18} />
                    <span className="hidden sm:inline mr-2">خروج</span>
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    data-testid="home-btn"
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/')}
                    className="px-2 sm:px-4"
                  >
                    <Home size={18} />
                    <span className="hidden sm:inline mr-2">الرئيسية</span>
                  </Button>
                  <Button
                    data-testid="login-btn"
                    onClick={() => navigate('/login')}
                    size="sm"
                    className="px-3 sm:px-4"
                  >
                    تسجيل الدخول
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Header */}
        <div className="mb-6 sm:mb-10 fade-in">
          <h2 className="font-amiri text-2xl sm:text-4xl font-bold text-primary mb-2">
            معلمونا المتميزون
          </h2>
          <p className="font-plex text-sm sm:text-lg text-muted-foreground">
            اختر معلمك المفضل واحجز حصتك الآن
          </p>
        </div>

        {/* Teachers Grid */}
        {teachers.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {teachers.map((teacher) => (
              <Card 
                key={teacher.teacher_id} 
                className="card-hover overflow-hidden" 
                data-testid={`teacher-card-${teacher.teacher_id}`}
              >
                <div className="bg-primary h-16 sm:h-24"></div>
                <CardContent className="p-4 sm:p-6 -mt-8 sm:-mt-12">
                  <div className="flex flex-col items-center">
                    {teacher.picture ? (
                      <img 
                        src={teacher.picture}
                        alt={teacher.name}
                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-4 border-white shadow-lg mb-3 sm:mb-4 object-cover"
                      />
                    ) : (
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-4 border-white shadow-lg mb-3 sm:mb-4 bg-primary/10 flex items-center justify-center">
                        <Users className="w-8 h-8 sm:w-10 sm:h-10 text-primary" />
                      </div>
                    )}
                    <h3 className="font-amiri text-xl sm:text-2xl font-bold text-primary mb-2 text-center">
                      {teacher.name}
                    </h3>
                    
                    {teacher.specialization && (
                      <p className="font-plex text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-3 text-center">
                        {teacher.specialization}
                      </p>
                    )}
                    
                    {teacher.rating && (
                      <div className="flex items-center gap-1 mb-3 sm:mb-4">
                        <Star className="w-4 h-4 sm:w-5 sm:h-5 fill-secondary text-secondary" />
                        <span className="font-plex font-bold text-base sm:text-lg">{teacher.rating}</span>
                      </div>
                    )}

                    {teacher.bio && (
                      <p className="font-plex text-xs sm:text-sm text-muted-foreground mb-4 sm:mb-6 text-center line-clamp-2">
                        {teacher.bio}
                      </p>
                    )}

                    <Button
                      data-testid={`book-teacher-${teacher.teacher_id}`}
                      onClick={() => handleBookSession(teacher.teacher_id)}
                      className="w-full rounded-full mt-auto"
                      size="sm"
                    >
                      احجز حصة
                      <ArrowRight className="mr-2" size={16} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="text-center p-8 sm:p-12">
            <p className="font-plex text-sm sm:text-lg text-muted-foreground">
              لا يوجد معلمون متاحون حالياً
            </p>
          </Card>
        )}
      </div>
    </div>
  );
};

export default TeachersList;
