import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Award, Crown, Download } from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';
import { generateCertificatePDF } from '@/utils/generateCertificatePDF';
import { formatSupervisorName } from '@/utils/formatSupervisorName';
import { formatArabicDate } from '@/utils/formatArabicDate';

const fmtDate = (iso) => formatArabicDate(iso, 'long');

/** Student «شهاداتي» section — lists admin-issued certificates with PDF download. */
const MyCertificates = () => {
  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/students/me/certificates')
      .then(res => setCerts(res.data))
      .catch(() => toast.error('فشل تحميل الشهادات'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-center py-12 font-plex text-muted-foreground">جارٍ تحميل شهاداتك...</div>;
  }

  return (
    <div className="space-y-4" data-testid="my-certificates-section">
      <div className="flex items-center gap-2">
        <Award className="text-amber-600" size={22} />
        <h3 className="font-amiri text-xl sm:text-2xl font-bold text-emerald-800">شهاداتي</h3>
        <span className="bg-emerald-700 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">{certs.length}</span>
      </div>

      {certs.length === 0 ? (
        <Card><CardContent className="py-10 text-center" data-testid="no-certificates-message">
          <Award className="mx-auto text-muted-foreground mb-3" size={40} />
          <p className="font-plex text-sm text-muted-foreground">لم تصدر لك شهادات بعد.</p>
          <p className="font-plex text-xs text-muted-foreground mt-1">عند إتمامك حفظ جزء كامل وفق سجل التسميع، يصدر المشرف شهادتك وستظهر هنا بإذن الله.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {certs.map(c => {
            const isKhatm = c.certificate_type === 'full_quran';
            return (
              <Card
                key={c.certificate_id}
                data-testid={`my-cert-card-${c.certificate_id}`}
                className={isKhatm ? 'border-2 border-amber-400 bg-gradient-to-bl from-amber-50 to-yellow-50' : 'border-emerald-200 bg-emerald-50/40'}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    {isKhatm
                      ? <Crown className="text-amber-600" size={20} />
                      : <Award className="text-emerald-700" size={20} />}
                    <span className={`font-amiri text-lg font-bold ${isKhatm ? 'text-amber-800' : 'text-emerald-900'}`}>
                      {isKhatm ? 'شهادة ختم القرآن الكريم' : `شهادة إتمام حفظ ${c.juz_name}`}
                    </span>
                  </div>
                  <div className="font-plex text-xs text-muted-foreground space-y-1">
                    <p>رقم الشهادة: <span dir="ltr" className="font-bold text-foreground">{c.certificate_number}</span></p>
                    <p>تاريخ الإتمام: <span className="text-foreground">{fmtDate(c.completion_date)}</span></p>
                    <p>تاريخ الإصدار: <span className="text-foreground">{fmtDate(c.issued_at)}</span></p>
                    <p>المشرف: <span className="text-foreground">{formatSupervisorName(c.issued_by_name)}</span></p>
                  </div>
                  <Button
                    size="sm"
                    className={`rounded-full font-plex w-full ${isKhatm ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-700 hover:bg-emerald-800'}`}
                    data-testid={`my-cert-download-btn-${c.certificate_id}`}
                    onClick={() => generateCertificatePDF(c)}
                  >
                    <Download size={14} className="ml-1" /> تحميل / طباعة الشهادة PDF
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MyCertificates;
