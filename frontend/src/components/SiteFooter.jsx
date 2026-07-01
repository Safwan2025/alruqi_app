import React from 'react';
import { Link } from 'react-router-dom';

const LOGO_URL = "https://customer-assets.emergentagent.com/job_8f66b1bb-97ea-4b8f-926f-4f014db49e2a/artifacts/l01dffpm_%D9%85%D9%82%D8%B1%D8%A3%D8%A9%20%D8%A7%D9%84%D8%B1%D9%82%D9%8A.png";

const SiteFooter = () => {
  return (
    <footer className="bg-[#1A1A1A] text-white py-6 sm:py-8 px-4 sm:px-6">
      <div className="container mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3">
            <img src={LOGO_URL} alt="مقرأة الرقي" className="w-8 h-8 rounded-full bg-white p-0.5 object-contain" />
            <span className="font-amiri text-sm font-bold">مقرأة الرقي</span>
          </Link>
          <p className="font-plex text-xs sm:text-sm text-gray-400">© 2025 مقرأة الرقي - جميع الحقوق محفوظة</p>
        </div>
      </div>
    </footer>
  );
};

export default SiteFooter;
