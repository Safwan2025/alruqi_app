import React from 'react';
import SiteNav from '@/components/SiteNav';
import SiteFooter from '@/components/SiteFooter';

const PublicLayout = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteNav />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
};

export default PublicLayout;
