import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PublicLayout from '@/components/PublicLayout';

const BENEFITS = [
  'حصص فردية مباشرة مع معلمين متميزين',
  'متابعة دقيقة لتقدمك في الحفظ والتلاوة',
  'مرونة في اختيار المواعيد التي تناسبك',
  'تقارير دورية ونظام نقاط تحفيزي',
];

const StartJourneyPage = () => {
  const navigate = useNavigate();

  return (
    <PublicLayout>
      <section className="py-16 sm:py-24 px-4 sm:px-6 bg-gradient-to-b from-primary to-primary/90 text-white">
        <div className="container mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center justify-center gap-2 bg-secondary/20 backdrop-blur-sm border border-secondary/40 rounded-full px-4 py-2 mb-6">
            <Sparkles className="w-4 h-4 text-secondary" />
            <span className="font-plex text-xs sm:text-sm text-secondary font-bold">ابدأ مجاناً</span>
          </div>

          <h1 className="font-amiri text-3xl sm:text-4xl md:text-6xl font-bold mb-4 sm:mb-6 leading-tight">
            ابدأ رحلتك مع القرآن الكريم اليوم
          </h1>

          <p className="font-plex text-base sm:text-xl text-white/90 mb-10 sm:mb-12 max-w-2xl mx-auto leading-relaxed">
            انضم إلى آلاف الطلاب الذين يتعلمون القرآن الكريم مع أفضل المعلمين، خطوةً بخطوة، حتى تُتقن كتاب الله حفظًا وتلاوةً.
          </p>

          <div className="grid sm:grid-cols-2 gap-3 sm:gap-4 max-w-2xl mx-auto mb-10 sm:mb-12 text-right">
            {BENEFITS.map((b, i) => (
              <div key={i} className="flex items-center gap-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-3" data-testid={`benefit-${i}`}>
                <CheckCircle2 className="w-5 h-5 text-secondary flex-shrink-0" />
                <span className="font-plex text-sm sm:text-base">{b}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
            <Button
              data-testid="start-journey-register-btn"
              onClick={() => navigate('/login')}
              size="lg"
              className="bg-secondary text-secondary-foreground hover:bg-secondary/90 font-bold text-base sm:text-xl px-8 sm:px-12 py-6 sm:py-7 rounded-full shadow-2xl"
            >
              <BookOpen className="w-5 h-5 ml-2" />
              سجل الآن مجاناً
            </Button>
            <Button
              data-testid="start-journey-teachers-btn"
              onClick={() => navigate('/teachers')}
              variant="outline"
              size="lg"
              className="bg-transparent border-2 border-white text-white hover:bg-white/10 font-bold text-base sm:text-xl px-8 sm:px-12 py-6 sm:py-7 rounded-full"
            >
              تصفح المعلمين
            </Button>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
};

export default StartJourneyPage;
