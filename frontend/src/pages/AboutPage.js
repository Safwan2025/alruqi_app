import React from 'react';
import PublicLayout from '@/components/PublicLayout';
import { Card, CardContent } from '@/components/ui/card';

const AboutPage = () => {
  return (
    <PublicLayout>
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-background">
        <div className="container mx-auto max-w-5xl">
          <h1 className="font-amiri text-3xl sm:text-4xl md:text-5xl font-bold text-center text-primary mb-8 sm:mb-12">من نحن</h1>
          <Card className="border-t-4 border-secondary shadow-xl">
            <CardContent className="p-6 sm:p-8 md:p-12">
              <div className="space-y-5 sm:space-y-6 font-plex text-base sm:text-lg leading-relaxed text-[#4A5568]">
                <p>
                  <strong className="text-primary font-bold">مقرأة الرُّقي</strong> منصة قرآنية تعليمية تربوية، تهدف إلى بناء جيلٍ متقنٍ لكتاب الله حفظًا وتلاوةً وخُلُقًا، تجمع بين الأصالة في تعليم القرآن، والحداثة في أساليب التعليم عن بُعد، مع متابعة دقيقة للطلاب وتمكينٍ حقيقي لأولياء الأمور من مرافقة رحلة أبنائهم مع القرآن.
                </p>
                <p>
                  انطلقت المقرأة بعد تجربة تعليمية عميقة في ميدان تعليم القرآن، امتدت لسنوات، وشرّف الله خلالها القائمين عليها بتعليم أكثر من <strong className="text-secondary">أربعة عشر ألف</strong> حول العالم، عبر منصات تعليمية متعددة شملت أكثر من <strong className="text-secondary">ثلاثين دولة</strong>.
                </p>
                <p>
                  جاءت مقرأة الرقي ثمرة تجربة طويلة في التعليم القرآني، ورغبة صادقة في تقديم نموذج مختلف: مقرأة تُتقن التعليم وتغرس القيم وتُحيي في القلوب محبة القرآن ليكون القرآن أسلوب حياة لا مجرد حفظ.
                </p>
                <div className="mt-6 sm:mt-8 pt-6 border-t border-secondary/20 flex items-center justify-center">
                  <a href="https://wa.me/966599299124" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-full transition-all duration-300 shadow-lg hover:shadow-xl" data-testid="whatsapp-contact">
                    <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                    <span className="font-bold text-sm sm:text-lg">تواصل معنا عبر واتساب</span>
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </PublicLayout>
  );
};

export default AboutPage;
