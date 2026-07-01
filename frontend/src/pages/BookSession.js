import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, Calendar, Clock, LogOut, User } from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';

const BookSession = () => {
  const { teacherId } = useParams();
  const navigate = useNavigate();
  const [teacher, setTeacher] = useState(null);
  const [user, setUser] = useState(null);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);

  useEffect(() => {
    loadData();
  }, [teacherId]);

  const loadData = async () => {
    try {
      const [teacherRes, userRes, slotsRes] = await Promise.all([
        api.get(`/teachers/${teacherId}`),
        api.get('/auth/me'),
        api.get(`/teachers/${teacherId}/available-slots`)
      ]);
      setTeacher(teacherRes.data);
      setUser(userRes.data);
      setAvailableSlots(slotsRes.data);
    } catch (error) {
      toast.error('فشل تحميل بيانات المعلم');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
      navigate('/login');
    } catch (error) {
      toast.error('فشل تسجيل الخروج');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedSlot) {
      toast.error('الرجاء اختيار موعد');
      return;
    }
    
    setBooking(true);

    try {
      await api.post('/sessions/book', {
        teacher_id: teacherId,
        scheduled_time: selectedSlot.scheduled_time,
        duration: 60
      });

      toast.success('تم حجز الحصة بنجاح!');
      navigate('/dashboard/student');
    } catch (error) {
      toast.error('فشل حجز الحصة');
    } finally {
      setBooking(false);
    }
  };

  // Group slots by date
  const groupSlotsByDate = () => {
    const grouped = {};
    availableSlots.forEach(slot => {
      const date = new Date(slot.scheduled_time).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(slot);
    });
    return grouped;
  };

  const groupedSlots = groupSlotsByDate();

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
                onClick={() => navigate('/dashboard/student')}
              />
              <h1 className="font-amiri text-lg sm:text-2xl font-bold text-primary hidden sm:block">مقرأة الرقي</h1>
            </div>
            <div className="flex items-center gap-1 sm:gap-4">
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
                data-testid="logout-btn"
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="px-2 sm:px-4"
              >
                <LogOut size={18} />
                <span className="hidden sm:inline mr-2">خروج</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="max-w-4xl mx-auto">
          {/* Teacher Info */}
          <Card className="mb-6 sm:mb-8 fade-in" data-testid="teacher-info-card">
            <CardContent className="p-4 sm:p-8">
              <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                {teacher?.picture ? (
                  <img 
                    src={teacher.picture}
                    alt={teacher.name}
                    className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 border-secondary shadow-lg object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 border-secondary shadow-lg bg-primary/10 flex items-center justify-center">
                    <User className="w-10 h-10 sm:w-12 sm:h-12 text-primary" />
                  </div>
                )}
                <div className="text-center sm:text-right">
                  <h2 className="font-amiri text-2xl sm:text-3xl font-bold text-primary mb-2">{teacher?.name}</h2>
                  {teacher?.specialization && (
                    <p className="font-plex text-sm sm:text-base text-muted-foreground mb-2">{teacher.specialization}</p>
                  )}
                  {teacher?.bio && (
                    <p className="font-plex text-xs sm:text-sm text-muted-foreground">{teacher.bio}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Booking Form */}
          <Card className="fade-in" data-testid="booking-form-card">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="font-amiri text-xl sm:text-3xl text-primary">المواعيد المتاحة</CardTitle>
              <p className="font-plex text-sm sm:text-base text-muted-foreground mt-2">
                اختر الموعد المناسب لك من المواعيد المتاحة
              </p>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              {availableSlots.length > 0 ? (
                <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
                  <div className="space-y-4 max-h-[400px] sm:max-h-[500px] overflow-y-auto p-1 sm:p-2">
                    {Object.entries(groupedSlots).map(([date, slots]) => (
                      <div key={date} className="space-y-2">
                        <h3 className="font-plex font-bold text-primary text-sm sm:text-base sticky top-0 bg-background py-2">
                          {date}
                        </h3>
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 sm:gap-3">
                          {slots.map((slot) => {
                            const slotTime = new Date(slot.scheduled_time);
                            const timeString = slotTime.toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true
                            });
                            
                            return (
                              <button
                                key={slot.slot_id}
                                type="button"
                                data-testid={`slot-${slot.slot_id}`}
                                onClick={() => setSelectedSlot(slot)}
                                className={`p-2 sm:p-4 rounded-lg border-2 font-plex text-xs sm:text-base transition-all ${
                                  selectedSlot?.slot_id === slot.slot_id
                                    ? 'border-primary bg-primary text-white'
                                    : 'border-border hover:border-primary hover:bg-primary/5'
                                }`}
                              >
                                <div className="flex items-center justify-center gap-2">
                                  <Clock className="w-4 h-4" />
                                  <span className="font-bold">{timeString}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-4 pt-4 border-t">
                    <Button
                      data-testid="submit-booking-btn"
                      type="submit"
                      disabled={booking || !selectedSlot}
                      className="flex-1 rounded-full py-6"
                    >
                      {booking ? (
                        <div className="spinner border-2 border-white border-t-transparent rounded-full w-5 h-5"></div>
                      ) : (
                        <>
                          تأكيد الحجز
                          <ArrowRight className="mr-2" size={18} />
                        </>
                      )}
                    </Button>
                    <Button
                      data-testid="cancel-btn"
                      type="button"
                      variant="outline"
                      onClick={() => navigate('/teachers')}
                      className="rounded-full px-8"
                    >
                      إلغاء
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="text-center py-12">
                  <Calendar className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                  <p className="font-plex text-lg text-muted-foreground">
                    لا توجد مواعيد متاحة حالياً
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default BookSession;
