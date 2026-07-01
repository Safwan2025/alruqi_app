import React from 'react';
import { BookOpen, Users, Video, Star } from 'lucide-react';
import PublicLayout from '@/components/PublicLayout';

const FEATURES = [
  { icon: Users, title: 'معلمون متميزون', desc: 'نخبة من المعلمين المتخصصين في تحفيظ وتعليم القرآن الكريم', testid: 'feature-teachers' },
  { icon: Video, title: 'دروس مباشرة', desc: 'حصص فردية مباشرة عبر الفيديو والصوت لتجربة تعليمية تفاعلية', testid: 'feature-live' },
  { icon: BookOpen, title: 'مرونة في المواعيد', desc: 'احجز حصصك في الأوقات التي تناسبك مع معلمك المفضل', testid: 'feature-flexible' },
  { icon: Star, title: 'جودة عالية', desc: 'منهج متميز ومتابعة دقيقة لتقدم الطالب', testid: 'feature-quality' },
];

const WhyUsPage = () => {
  return (
    <PublicLayout>
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-white">
        <div className="container mx-auto">
          <h1 className="font-amiri text-3xl sm:text-4xl md:text-5xl font-bold text-center text-primary mb-4">
            لماذا مقرأة الرقي؟
          </h1>
          <p className="font-plex text-center text-base sm:text-lg text-muted-foreground mb-10 sm:mb-16 max-w-2xl mx-auto">
            مزايا تجعل من رحلتك مع القرآن تجربةً ممتعة ومثمرة
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8">
            {FEATURES.map(({ icon: Icon, title, desc, testid }) => (
              <div key={testid} className="text-center p-6 sm:p-8 rounded-2xl bg-background border-t-4 border-secondary shadow-lg card-hover" data-testid={testid}>
                <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 sm:mb-6 rounded-full bg-primary/10 flex items-center justify-center">
                  <Icon className="w-7 h-7 sm:w-8 sm:h-8 text-primary" />
                </div>
                <h3 className="font-amiri text-xl sm:text-2xl font-bold mb-3 sm:mb-4 text-primary">{title}</h3>
                <p className="font-plex text-sm sm:text-base text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
};

export default WhyUsPage;
