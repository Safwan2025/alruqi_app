import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar, TrendingUp, ArrowLeft, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import PublicLayout from '@/components/PublicLayout';
import StudentOfWeek from '@/components/StudentOfWeek';
import ContentDisplay from '@/components/ContentDisplay';

const LOGO_URL = "https://customer-assets.emergentagent.com/job_8f66b1bb-97ea-4b8f-926f-4f014db49e2a/artifacts/l01dffpm_%D9%85%D9%82%D8%B1%D8%A3%D8%A9%20%D8%A7%D9%84%D8%B1%D9%82%D9%8A.png";

const AnimatedCounter = ({ value, duration = 2000 }) => {
  const [count, setCount] = useState(0);
  const countRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { threshold: 0.1 }
    );
    if (countRef.current) observer.observe(countRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || value === 0) return;
    let startTime;
    const animate = (currentTime) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setCount(Math.floor(value * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [value, duration, isVisible]);

  return <span ref={countRef}>{count.toLocaleString('ar-EG')}</span>;
};

const LandingPage = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ total_bookings: 0, total_teachers: 0, total_students: 0 });
  const [licenseMeta, setLicenseMeta] = useState(null);

  const loadStats = useCallback(async () => {
    try {
      const API_URL = process.env.REACT_APP_BACKEND_URL || '';
      const response = await fetch(`${API_URL}/api/public/stats`);
      if (response.ok) setStats(await response.json());
    } catch {}
  }, []);

  const loadLicense = useCallback(async () => {
    try {
      const API_URL = process.env.REACT_APP_BACKEND_URL || '';
      const response = await fetch(`${API_URL}/api/public/license`);
      if (response.ok) setLicenseMeta(await response.json());
    } catch (_e) {
      // Public landing page must never break on license fetch failure.
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadLicense();
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, [loadStats, loadLicense]);

  return (
    <PublicLayout>
      {/* Booking Counter Banner */}
      <div className="bg-gradient-to-r from-secondary via-yellow-500 to-secondary py-2.5 sm:py-3 px-3 sm:px-4 shadow-lg relative overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.1) 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
        <div className="container mx-auto relative z-10">
          <div className="flex items-center justify-center gap-2 sm:gap-6 text-center flex-wrap">
            <div className="flex items-center gap-1.5 animate-pulse">
              <Calendar className="w-4 h-4 sm:w-7 sm:h-7 text-primary" />
              <TrendingUp className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-primary" />
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-center">
              <span className="font-plex text-[11px] sm:text-base font-bold text-primary whitespace-nowrap">عدد الحصص المحجوزة:</span>
              <div className="flex items-center gap-1.5">
                <span className="font-amiri text-xl sm:text-4xl font-bold text-primary drop-shadow-md leading-none" data-testid="bookings-counter">
                  <AnimatedCounter value={stats.total_bookings} duration={2500} />
                </span>
                <span className="font-plex text-[11px] sm:text-base font-bold text-primary">حصة</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hero */}
      <section
        id="hero"
        className="relative min-h-[80vh] flex items-center justify-center"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(15, 81, 50, 0.9) 0%, rgba(15, 81, 50, 0.7) 100%), url('https://images.unsplash.com/photo-1600616677773-0fbd06bd2727?q=80&w=2000')`,
          backgroundSize: 'cover', backgroundPosition: 'center'
        }}
      >
        <div className="container mx-auto px-4 sm:px-6 py-16 sm:py-20 text-center relative z-10">
          <div className="mb-6 sm:mb-8 flex justify-center">
            <img src={LOGO_URL} alt="مقرأة الرقي" className="w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 object-contain drop-shadow-2xl rounded-full bg-white p-2 border-4 border-secondary" />
          </div>
          <h1 className="font-amiri text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-4 sm:mb-6">مقرأة الرقي</h1>
          <p className="font-plex text-base sm:text-xl md:text-2xl text-white/90 mb-8 sm:mb-12 max-w-2xl mx-auto">
            منصة إلكترونية متميزة لتعليم القرآن الكريم عبر الإنترنت
          </p>
          <div className="flex gap-3 sm:gap-4 justify-center flex-wrap">
            <Button data-testid="landing-login-btn" onClick={() => navigate('/login')} size="lg" className="bg-secondary text-secondary-foreground hover:bg-secondary/90 font-bold text-sm sm:text-lg px-6 sm:px-8 py-5 sm:py-6 rounded-full shadow-xl">
              ابدأ التعلم الآن
            </Button>
            <Button data-testid="landing-teachers-btn" onClick={() => navigate('/teachers')} variant="outline" size="lg" className="bg-transparent border-2 border-white text-white hover:bg-white/10 font-bold text-sm sm:text-lg px-6 sm:px-8 py-5 sm:py-6 rounded-full">
              تصفح المعلمين
            </Button>
          </div>
          <div className="mt-12 sm:mt-16 grid grid-cols-3 gap-3 sm:gap-4 max-w-sm sm:max-w-md mx-auto">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 sm:p-4 border border-white/20">
              <div className="font-amiri text-xl sm:text-3xl font-bold text-secondary"><AnimatedCounter value={stats.total_teachers} duration={1500} /></div>
              <div className="font-plex text-[10px] sm:text-sm text-white/80">معلم</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 sm:p-4 border border-white/20">
              <div className="font-amiri text-xl sm:text-3xl font-bold text-secondary"><AnimatedCounter value={stats.total_students} duration={1500} /></div>
              <div className="font-plex text-[10px] sm:text-sm text-white/80">طالب</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 sm:p-4 border border-white/20">
              <div className="font-amiri text-xl sm:text-3xl font-bold text-secondary"><AnimatedCounter value={stats.total_bookings} duration={2000} /></div>
              <div className="font-plex text-[10px] sm:text-sm text-white/80">حصة</div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== About ===== */}
      <section id="home-about" className="py-10 sm:py-14 px-4 sm:px-6 bg-background">
        <div className="container mx-auto max-w-3xl">
          <Card className="border-t-4 border-secondary shadow-md card-hover">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="text-secondary" size={20} />
                <h2 className="font-amiri text-2xl sm:text-3xl font-bold text-primary">من نحن</h2>
              </div>
              <p className="font-plex text-sm sm:text-base leading-relaxed text-[#4A5568] mb-3">
                <strong className="text-primary">مقرأة الرُّقي</strong> منصة قرآنية تعليمية تربوية، تجمع بين الأصالة في تعليم القرآن، والحداثة في أساليب التعليم عن بُعد، مع متابعة دقيقة للطلاب.
              </p>
              <p className="font-plex text-xs sm:text-sm text-muted-foreground mb-4">
                شرّف الله القائمين عليها بتعليم أكثر من <strong className="text-secondary">14,000 طالب</strong> حول العالم في أكثر من <strong className="text-secondary">30 دولة</strong>.
              </p>
              <Link to="/about" data-testid="home-link-about">
                <Button variant="outline" size="sm" className="rounded-full border-primary text-primary hover:bg-primary hover:text-white">
                  اقرأ المزيد عنّا <ArrowLeft size={14} className="rotate-180 mr-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ===== News & Announcements (preview) ===== */}
      <section id="home-news" className="py-10 sm:py-14 px-4 sm:px-6 bg-gradient-to-b from-background to-primary/5">
        <div className="container mx-auto">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
            <h2 className="font-amiri text-2xl sm:text-3xl font-bold text-primary">أخبار وإعلانات المقرأة</h2>
            <Link to="/news" className="font-plex text-sm text-primary hover:text-secondary font-bold flex items-center gap-1" data-testid="home-link-news">
              المزيد <ArrowLeft size={16} className="rotate-180" />
            </Link>
          </div>
          <ContentDisplay />
        </div>
      </section>

      {/* ===== Students of the Week (preview) ===== */}
      <section id="home-students-of-week" className="py-10 sm:py-14 px-4 sm:px-6 bg-background">
        <div className="container mx-auto">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
            <h2 className="font-amiri text-2xl sm:text-3xl font-bold text-primary">طلاب الأسبوع</h2>
            <Link to="/students-of-week" className="font-plex text-sm text-primary hover:text-secondary font-bold flex items-center gap-1" data-testid="home-link-students-of-week">
              عرض جميع الطلاب <ArrowLeft size={16} className="rotate-180" />
            </Link>
          </div>
          <StudentOfWeek variant="compact" />
        </div>
      </section>

      {/* ===== License ===== */}
      <section id="home-license" className="py-10 sm:py-14 px-4 sm:px-6 bg-gradient-to-b from-background to-green-50/40">
        <div className="container mx-auto max-w-3xl">
          <Card className="border-t-4 border-green-500 shadow-md card-hover">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="text-green-600" size={22} />
                <h2 className="font-amiri text-2xl sm:text-3xl font-bold text-primary">الترخيص الرسمي</h2>
              </div>
              <p className="font-plex text-sm sm:text-base leading-relaxed text-[#4A5568] mb-3">
                مقرأة الرقي حاصلة على ترخيص رسمي لإقامة حلقات تحفيظ القرآن الكريم من <strong className="text-green-700" data-testid="home-license-issuer">{licenseMeta?.issuer || 'جمعية مثاني القرآنية'}</strong> المعتمدة من المركز الوطني لتنمية القطاع غير الربحي.
              </p>
              <div className="flex flex-wrap items-center gap-2 mb-4 text-xs font-plex">
                <span className="bg-green-50 text-green-700 px-2 py-1 rounded-full border border-green-200" data-testid="home-license-number">
                  رقم الترخيص: {licenseMeta?.license_number || '—'}
                </span>
                <span className="bg-green-50 text-green-700 px-2 py-1 rounded-full border border-green-200" data-testid="home-license-status">
                  {licenseMeta?.status_label || 'مرخصة رسمياً'}
                </span>
              </div>
              <Link to="/license" data-testid="home-link-license">
                <Button variant="outline" size="sm" className="rounded-full border-green-600 text-green-700 hover:bg-green-600 hover:text-white">
                  عرض وثيقة الترخيص <ArrowLeft size={14} className="rotate-180 mr-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ===== CTA: Start Journey ===== */}
      <section className="py-12 sm:py-16 px-4 sm:px-6 bg-gradient-to-br from-primary to-primary/90 text-white">
        <div className="container mx-auto text-center max-w-3xl">
          <h2 className="font-amiri text-2xl sm:text-4xl font-bold mb-3">ابدأ رحلتك مع القرآن الكريم اليوم</h2>
          <p className="font-plex text-sm sm:text-lg text-white/90 mb-6 sm:mb-8">
            انضم إلى آلاف الطلاب الذين يتعلمون القرآن مع أفضل المعلمين، خطوةً بخطوة، حتى تُتقن كتاب الله.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button data-testid="home-cta-register" onClick={() => navigate('/login')} size="lg" className="bg-secondary text-secondary-foreground hover:bg-secondary/90 font-bold text-sm sm:text-lg px-6 sm:px-10 py-5 sm:py-6 rounded-full shadow-2xl">
              سجل الآن مجاناً
            </Button>
            <Link to="/start">
              <Button variant="outline" size="lg" className="w-full bg-transparent border-2 border-white text-white hover:bg-white/10 font-bold text-sm sm:text-lg px-6 sm:px-10 py-5 sm:py-6 rounded-full">
                تعرّف على المنصة
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
};

export default LandingPage;
