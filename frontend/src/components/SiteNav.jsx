import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const LOGO_URL = "https://customer-assets.emergentagent.com/job_8f66b1bb-97ea-4b8f-926f-4f014db49e2a/artifacts/l01dffpm_%D9%85%D9%82%D8%B1%D8%A3%D8%A9%20%D8%A7%D9%84%D8%B1%D9%82%D9%8A.png";

export const NAV_ITEMS = [
  { path: '/', label: 'الرئيسية', id: 'home' },
  { path: '/why-us', label: 'لماذا مقرأة الرقي', id: 'why-us' },
  { path: '/students-of-week', label: 'طلاب الأسبوع', id: 'students-week' },
  { path: '/news', label: 'أخبار وإعلانات المقرأة', id: 'news' },
  { path: '/about', label: 'من نحن', id: 'about' },
  { path: '/license', label: 'الترخيص الرسمي', id: 'license' },
  { path: '/certificate-verification', label: 'التحقق من الشهادة', id: 'verify-certificate' },
  { path: '/start', label: 'ابدأ رحلتك مع القرآن الكريم اليوم', id: 'start' },
];

const SiteNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const isActive = (path) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <nav
      data-testid="main-nav"
      className="sticky top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg shadow-md border-b border-gray-100"
    >
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 gap-2">
          {/* Right group (in RTL, first child) — Menu + Login */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              data-testid="mobile-menu-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-primary hover:bg-gray-100"
              aria-label="القائمة"
            >
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
            <Button
              data-testid="nav-login-btn"
              onClick={() => navigate('/login')}
              size="sm"
              className="rounded-full font-plex text-xs sm:text-sm bg-primary text-white hover:bg-primary/90"
            >
              تسجيل الدخول
            </Button>
          </div>

          {/* Left group (in RTL, last child) — Name + Logo */}
          <Link to="/" className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <span className="font-amiri text-base sm:text-lg font-bold text-primary">
              مقرأة الرقي
            </span>
            <img src={LOGO_URL} alt="مقرأة الرقي" className="w-10 h-10 rounded-full bg-white p-0.5 object-contain shadow-sm border border-secondary/40" />
          </Link>
        </div>
      </div>

      {/* Dropdown Menu (works on all sizes) */}
      {mobileMenuOpen && (
        <div className="bg-white border-t shadow-xl">
          <div className="container mx-auto px-4 py-3 space-y-1 max-h-[70vh] overflow-y-auto">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.id}
                to={item.path}
                data-testid={`mobile-nav-${item.id}`}
                className={`block w-full text-right px-4 py-3 rounded-lg font-plex text-sm transition-colors ${
                  isActive(item.path)
                    ? 'bg-primary/10 text-primary font-bold'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
};

export default SiteNav;
