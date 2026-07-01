import React, { useEffect, useState } from 'react';
import PublicLayout from '@/components/PublicLayout';
import { Card, CardContent } from '@/components/ui/card';
import { publicApi } from '@/utils/api';

const PUBLIC_DOC_URL = `${process.env.REACT_APP_BACKEND_URL}/api/public/license/document`;

const LicensePage = () => {
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    publicApi
      .get('/public/license')
      .then((res) => {
        if (!cancelled) setMeta(res.data || { has_document: false });
      })
      .catch(() => {
        if (!cancelled) setMeta({ has_document: false });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const hasDoc = !!meta?.has_document;
  const isImage = hasDoc && meta?.file_mime && meta.file_mime.startsWith('image/');
  const issuer = meta?.issuer || 'جمعية مثاني القرآنية';
  const licenseNumber = meta?.license_number || '—';
  const statusLabel = meta?.status_label || 'مرخصة رسمياً';

  return (
    <PublicLayout>
      <section className="py-12 sm:py-16 px-4 sm:px-6 bg-gradient-to-b from-background to-primary/5">
        <div className="container mx-auto max-w-4xl">
          <h1 className="font-amiri text-3xl sm:text-4xl font-bold text-center text-primary mb-6 sm:mb-8">الترخيص الرسمي</h1>
          <Card className="border-2 border-secondary/30 shadow-2xl overflow-hidden">
            <CardContent className="p-0">
              <div className="bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/10 p-4 sm:p-6 text-center">
                <div className="flex items-center justify-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <span className="font-amiri text-lg sm:text-xl font-bold text-primary" data-testid="license-status-label">مقرأة {statusLabel}</span>
                </div>
                <p className="font-plex text-xs sm:text-sm text-gray-600" data-testid="license-issuer-text">
                  تصريح إقامة حلقات لتحفيظ القرآن الكريم من {issuer}
                </p>
              </div>
              <div className="p-4 md:p-6 flex justify-center bg-white">
                {loading ? (
                  <div className="py-8 font-plex text-sm text-gray-500" data-testid="license-loading">جارٍ تحميل وثيقة الترخيص...</div>
                ) : hasDoc ? (
                  <a href={PUBLIC_DOC_URL} target="_blank" rel="noopener noreferrer" className="block hover:opacity-90 transition-opacity" data-testid="license-link">
                    {isImage ? (
                      <img src={PUBLIC_DOC_URL} alt="وثيقة الترخيص الرسمي" className="max-w-full md:max-w-lg mx-auto rounded-lg shadow-lg border" />
                    ) : (
                      <div className="text-center py-8 px-6">
                        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                          <svg className="w-10 h-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        </div>
                        <p className="font-amiri text-lg text-primary font-bold">اضغط لعرض الترخيص الرسمي</p>
                        <p className="font-plex text-sm text-gray-500 mt-1">تصريح رقم {licenseNumber} — {issuer}</p>
                      </div>
                    )}
                  </a>
                ) : (
                  <div className="text-center py-8 px-6" data-testid="license-empty">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                      <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </div>
                    <p className="font-amiri text-lg text-primary font-bold">لم تُرفع وثيقة الترخيص بعد</p>
                    <p className="font-plex text-sm text-gray-500 mt-1">سيتم عرض الوثيقة هنا فور رفعها من إدارة المقرأة.</p>
                  </div>
                )}
              </div>
              <div className="bg-gray-50 p-3 sm:p-4 border-t">
                <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-xs sm:text-sm font-plex text-gray-600">
                  <div className="flex items-center gap-1.5"><svg className="w-4 h-4 sm:w-5 sm:h-5 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg><span data-testid="license-issuer-chip">{issuer}</span></div>
                  <div className="flex items-center gap-1.5"><svg className="w-4 h-4 sm:w-5 sm:h-5 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" /></svg><span data-testid="license-number-chip">رقم الترخيص: {licenseNumber}</span></div>
                  <div className="flex items-center gap-1.5"><svg className="w-4 h-4 sm:w-5 sm:h-5 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg><span>المركز الوطني لتنمية القطاع غير الربحي</span></div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </PublicLayout>
  );
};

export default LicensePage;
