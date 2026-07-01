import React from 'react';
import PublicLayout from '@/components/PublicLayout';
import ContentDisplay from '@/components/ContentDisplay';

const NewsPage = () => {
  return (
    <PublicLayout>
      <section className="py-10 sm:py-14 px-4 sm:px-6 bg-background">
        <div className="container mx-auto">
          <div className="text-center mb-8 sm:mb-12">
            <h1 className="font-amiri text-3xl sm:text-4xl font-bold text-primary mb-3 sm:mb-4">
              أخبار وإعلانات المقرأة
            </h1>
            <div className="w-24 h-1 bg-secondary mx-auto rounded-full"></div>
          </div>
          <ContentDisplay />
        </div>
      </section>
    </PublicLayout>
  );
};

export default NewsPage;
