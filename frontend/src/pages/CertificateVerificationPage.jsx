import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

const LOGO_URL =
  'https://customer-assets.emergentagent.com/job_8f66b1bb-97ea-4b8f-926f-4f014db49e2a/artifacts/l01dffpm_%D9%85%D9%82%D8%B1%D8%A3%D8%A9%20%D8%A7%D9%84%D8%B1%D9%82%D9%8A.png';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const TYPE_LABELS = {
  full_quran: 'شهادة حفظ القرآن الكريم كاملًا',
  juz: 'شهادة إتمام حفظ جزء من القرآن الكريم',
};

// Gregorian + Hijri (Umm al-Qura) friendly date for display.
const fmtDate = (iso) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const greg = new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    const hij = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-arab', {
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(d);
    return `${greg} (${hij} هـ)`;
  } catch (e) {
    return '—';
  }
};

const CertificateVerificationPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [number, setNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // {valid:true,...}
  const [error, setError] = useState('');

  const verify = useCallback(async (num) => {
    const value = (num || '').trim();
    if (!value) {
      setError('يرجى إدخال رقم الشهادة.');
      setResult(null);
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/public/certificates/verify/${encodeURIComponent(value)}`,
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data && data.valid) {
        setResult(data);
      } else {
        setError(data?.message || 'لم يتم العثور على شهادة بهذا الرقم.');
      }
    } catch (e) {
      setError('تعذّر الاتصال بالخادم، يرجى المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Support future QR/barcode deep-link: /certificate-verification?number=...
  useEffect(() => {
    const q = searchParams.get('number');
    if (q) {
      setNumber(q);
      verify(q);
    }
  }, []);

  const onSubmit = (e) => {
    e.preventDefault();
    if (number.trim()) setSearchParams({ number: number.trim() });
    verify(number);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f7f5ef] to-[#eef2ec] flex flex-col" dir="rtl">
      {/* Header */}
      <header className="bg-white shadow-sm py-4 px-4 sm:px-6">
        <div className="container mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src={LOGO_URL} alt="مقرأة الرقي" className="w-9 h-9 rounded-full bg-white object-contain" />
            <span className="font-amiri text-lg font-bold text-[#1e5631]">مقرأة الرقي</span>
          </Link>
          <Link to="/" className="text-sm text-gray-500 hover:text-[#1e5631]">العودة للرئيسية</Link>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-10 max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="font-amiri text-3xl sm:text-4xl font-bold text-[#1e5631] mb-3">التحقق من الشهادة</h1>
          <p className="text-gray-600 text-sm sm:text-base">
            أدخل رقم الشهادة للتحقق من صحتها وبياناتها الأساسية.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} className="bg-white rounded-2xl shadow-md p-5 sm:p-6 border border-[#e3e0d6]">
          <label htmlFor="cert-number" className="block text-sm font-semibold text-gray-700 mb-2">
            رقم الشهادة
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              id="cert-number"
              data-testid="verify-number-input"
              type="text"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="مثال: ALRUQI-CERT-2026-0001"
              dir="ltr"
              className="flex-1 border border-gray-300 rounded-lg px-4 py-3 text-center font-mono focus:outline-none focus:ring-2 focus:ring-[#1e5631]"
            />
            <button
              type="submit"
              data-testid="verify-submit-btn"
              disabled={loading}
              className="bg-[#1e5631] hover:bg-[#16432596] text-white font-bold rounded-lg px-8 py-3 transition disabled:opacity-60"
            >
              {loading ? 'جارٍ التحقق…' : 'تحقق'}
            </button>
          </div>
        </form>

        {/* Loading */}
        {loading && (
          <div data-testid="verify-loading" className="text-center text-gray-500 mt-6">جارٍ التحقق…</div>
        )}

        {/* Error */}
        {!loading && error && (
          <div
            data-testid="verify-error"
            className="mt-6 bg-red-50 border border-red-200 text-red-700 rounded-xl p-5 text-center"
          >
            <div className="text-2xl mb-1">⚠️</div>
            {error}
          </div>
        )}

        {/* Valid result */}
        {!loading && result && result.valid && (
          <div
            data-testid="verify-result"
            className="mt-6 bg-white rounded-2xl shadow-md border-2 border-[#1e5631] overflow-hidden"
          >
            <div className="bg-[#1e5631] text-white py-3 px-5 flex items-center gap-2">
              <span className="text-xl">✅</span>
              <span className="font-bold">شهادة صحيحة وموثّقة من مقرأة الرقي</span>
            </div>
            <div className="p-5 sm:p-6 space-y-3">
              <Row label="اسم الطالب" value={result.student_name} />
              <Row label="نوع الشهادة" value={TYPE_LABELS[result.certificate_type] || result.certificate_type} />
              {result.certificate_type === 'juz' && (
                <Row label="الجزء" value={result.juz_name || (result.juz_number ? `الجزء ${result.juz_number}` : '—')} />
              )}
              <Row label="رقم الشهادة" value={result.certificate_number} ltr mono />
              <Row label="تاريخ الإتمام" value={fmtDate(result.completion_date)} />
              <Row label="تاريخ الإصدار" value={fmtDate(result.issued_at)} />
              <Row label="جهة الإصدار" value={result.issuer_name} />
              <Row label="المؤسسة" value={result.institution_name} />
              <div className="pt-2">
                <span className="inline-block bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded-full">
                  الحالة: سارية / موثّقة
                </span>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="bg-[#1A1A1A] text-white py-6 px-4 text-center">
        <p className="font-plex text-xs sm:text-sm text-gray-400">© 2025 مقرأة الرقي - جميع الحقوق محفوظة</p>
      </footer>
    </div>
  );
};

const Row = ({ label, value, ltr, mono }) => (
  <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-2 last:border-0">
    <span className="text-gray-500 text-sm shrink-0">{label}</span>
    <span
      className={`text-gray-900 font-semibold text-sm text-left ${ltr ? 'dir-ltr' : ''} ${mono ? 'font-mono' : ''}`}
      dir={ltr ? 'ltr' : 'rtl'}
    >
      {value || '—'}
    </span>
  </div>
);

export default CertificateVerificationPage;
