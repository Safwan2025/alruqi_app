import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Award, Crown, Download, Printer, Send, PenLine, Search, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';
import { generateCertificatePDF } from '@/utils/generateCertificatePDF';
import useShowMoreList from '@/hooks/useShowMoreList';
import ShowMoreButton from '@/components/ShowMoreButton';

/**
 * Admin "إصدار شهادة يدويًا" section:
 * search student → pick certificate type (juz 1-30 / khatm) → smart status
 * (eligible / unverified-warning / already issued) → issue.
 * Unverified eligibility returns HTTP 409 from the backend → admin confirms
 * in a dialog and we retry with force_issue=true. Duplicates are blocked
 * server-side; the UI shows view/download/print/send for existing certs.
 */
const ManualCertificateIssue = ({ students, certs, onReload }) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);   // eligibility row
  const [certType, setCertType] = useState('juz');
  const [juzNumber, setJuzNumber] = useState(null);
  const [issuing, setIssuing] = useState(false);
  const [forceWarning, setForceWarning] = useState(null); // backend 409 warning text
  const [sending, setSending] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return (students || [])
      .filter(s => (s.student_name || '').toLowerCase().includes(q) || (s.student_email || '').toLowerCase().includes(q));
  }, [query, students]);

  // عرض 5 نتائج أولًا ثم "عرض المزيد" (+5)، ويعود إلى 5 عند تغيّر البحث
  const { visible: visibleResults, canShowMore, showMore, total: totalResults, shown: shownResults } = useShowMoreList(results, 5, query);

  // Existing issued certificate for the current selection (duplicate guard UI)
  const existingCert = useMemo(() => {
    if (!selected) return null;
    return (certs || []).find(c =>
      c.student_id === selected.student_id && c.status === 'issued' &&
      (certType === 'full_quran'
        ? c.certificate_type === 'full_quran'
        : (c.certificate_type === 'juz' && juzNumber && c.juz_number === juzNumber))
    ) || null;
  }, [selected, certType, juzNumber, certs]);

  // Auto-verification status from the already-loaded eligibility data
  const isEligible = useMemo(() => {
    if (!selected) return false;
    if (certType === 'full_quran') return !!selected.full_quran_completed;
    return !!juzNumber && (selected.completed_juz || []).some(j => j.juz_number === juzNumber);
  }, [selected, certType, juzNumber]);

  const readyToIssue = selected && (certType === 'full_quran' || !!juzNumber);

  const doIssue = async (force = false) => {
    setIssuing(true);
    try {
      const res = await api.post('/admin/certificates/manual-issue', {
        student_id: selected.student_id,
        certificate_type: certType,
        juz_number: certType === 'juz' ? juzNumber : null,
        force_issue: force,
      });
      toast.success(`تم إصدار الشهادة — ${res.data.certificate_number}`);
      setForceWarning(null);
      generateCertificatePDF(res.data);
      onReload?.();
    } catch (e) {
      if (e.response?.status === 409) {
        setForceWarning(e.response.data?.detail || 'لم يتم التحقق تلقائيًا. هل تريد المتابعة؟');
      } else {
        toast.error(e.response?.data?.detail || 'فشل إصدار الشهادة');
      }
    }
    setIssuing(false);
  };

  const handleSendExisting = async () => {
    if (!existingCert) return;
    setSending(true);
    try {
      await api.post(`/admin/certificates/${existingCert.certificate_id}/send`);
      toast.success('تم إرسال الشهادة للطالب داخل النظام');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الإرسال');
    }
    setSending(false);
  };

  return (
    <section data-testid="manual-issue-section">
      <div className="flex items-center gap-2 mb-3">
        <PenLine className="text-emerald-700" size={18} />
        <h4 className="font-plex font-bold text-emerald-800">إصدار شهادة يدويًا</h4>
      </div>
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Student search */}
          {!selected ? (
            <div className="space-y-2">
              <div className="relative">
                <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  data-testid="manual-student-search"
                  className="pr-9 font-plex"
                  placeholder="ابحث عن الطالب بالاسم أو البريد الإلكتروني..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              {query.trim().length >= 2 && (
                <div className="border rounded-xl divide-y max-h-64 overflow-y-auto" data-testid="manual-search-results">
                  {results.length === 0 && (
                    <p className="p-3 text-xs font-plex text-muted-foreground text-center">لا توجد نتائج مطابقة</p>
                  )}
                  {visibleResults.map(s => (
                    <button
                      key={s.student_id}
                      type="button"
                      data-testid={`manual-student-result-${s.student_id}`}
                      className="w-full text-right p-2.5 hover:bg-emerald-50 transition-colors flex items-center justify-between"
                      onClick={() => { setSelected(s); setJuzNumber(null); setCertType('juz'); }}
                    >
                      <span className="font-plex text-sm font-semibold text-emerald-900">{s.student_name}</span>
                      <span className="font-plex text-[11px] text-muted-foreground" dir="ltr">{s.student_email}</span>
                    </button>
                  ))}
                  <ShowMoreButton canShowMore={canShowMore} onShowMore={showMore} total={totalResults} shown={shownResults} testId="manual-results-show-more" className="pb-2" />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Selected student chip */}
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                <div className="font-plex text-sm">
                  <span className="font-bold text-emerald-900" data-testid="manual-selected-student">{selected.student_name}</span>
                  <span className="text-xs text-muted-foreground mr-2">({selected.completed_count} جزء مكتمل وفق السجل · {selected.covered_pages_count ?? 0} صفحة)</span>
                </div>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs font-plex" data-testid="manual-clear-student-btn"
                        onClick={() => { setSelected(null); setQuery(''); setJuzNumber(null); }}>
                  <X size={13} className="ml-1" /> تغيير الطالب
                </Button>
              </div>

              {/* Certificate type + juz selection */}
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-plex text-xs font-semibold text-muted-foreground">نوع الشهادة</label>
                  <Select value={certType} onValueChange={(v) => { setCertType(v); if (v === 'full_quran') setJuzNumber(null); }}>
                    <SelectTrigger className="font-plex" data-testid="manual-type-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="juz" data-testid="manual-type-juz" className="font-plex">شهادة إتمام جزء</SelectItem>
                      <SelectItem value="full_quran" data-testid="manual-type-khatm" className="font-plex">شهادة ختم القرآن الكريم</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {certType === 'juz' && (
                  <div className="space-y-1">
                    <label className="font-plex text-xs font-semibold text-muted-foreground">الجزء</label>
                    <Select value={juzNumber ? String(juzNumber) : undefined} onValueChange={(v) => setJuzNumber(parseInt(v, 10))}>
                      <SelectTrigger className="font-plex" data-testid="manual-juz-select">
                        <SelectValue placeholder="اختر الجزء (1 - 30)" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {Array.from({ length: 30 }, (_, i) => i + 1).map(n => {
                          const done = (selected.completed_juz || []).some(j => j.juz_number === n);
                          const issued = (certs || []).some(c => c.student_id === selected.student_id && c.certificate_type === 'juz' && c.juz_number === n && c.status === 'issued');
                          return (
                            <SelectItem key={n} value={String(n)} data-testid={`manual-juz-option-${n}`} className="font-plex">
                              الجزء {n}{issued ? ' — صدرت شهادته ✓' : done ? ' — مكتمل في السجل' : ''}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Smart status + actions */}
              {readyToIssue && (
                existingCert ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2" data-testid="manual-status-message">
                    <p className="font-plex text-sm text-blue-900 font-semibold flex items-center gap-1.5">
                      <CheckCircle2 size={15} /> هذه الشهادة صادرة سابقًا — <span dir="ltr" className="text-xs font-bold">{existingCert.certificate_number}</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" className="rounded-full h-8 px-3 text-xs font-plex" data-testid="manual-existing-view-btn" onClick={() => generateCertificatePDF(existingCert)}>
                        <Award size={13} className="ml-1" /> عرض الشهادة
                      </Button>
                      <Button size="sm" variant="outline" className="rounded-full h-8 px-3 text-xs font-plex" data-testid="manual-existing-download-btn" onClick={() => generateCertificatePDF(existingCert)}>
                        <Download size={13} className="ml-1" /> تحميل PDF
                      </Button>
                      <Button size="sm" variant="outline" className="rounded-full h-8 px-3 text-xs font-plex" data-testid="manual-existing-print-btn" onClick={() => generateCertificatePDF(existingCert)}>
                        <Printer size={13} className="ml-1" /> طباعة
                      </Button>
                      <Button size="sm" variant="outline" className="rounded-full h-8 px-3 text-xs font-plex border-blue-300 text-blue-700 hover:bg-blue-100" disabled={sending} data-testid="manual-existing-send-btn" onClick={handleSendExisting}>
                        <Send size={13} className="ml-1" /> {sending ? 'جارٍ...' : 'إرسال للطالب'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div
                      data-testid="manual-status-message"
                      className={`rounded-xl p-3 font-plex text-sm flex items-start gap-2 ${isEligible ? 'bg-emerald-50 border border-emerald-200 text-emerald-900' : 'bg-amber-50 border border-amber-300 text-amber-900'}`}
                    >
                      {isEligible
                        ? (<><CheckCircle2 size={16} className="mt-0.5 shrink-0" /> <span>{certType === 'full_quran' ? 'سجل الطالب يؤكد إتمام حفظ القرآن كاملًا — يمكن الإصدار مباشرة.' : 'هذا الجزء يبدو مكتملًا في سجل حفظ الطالب — يمكن الإصدار مباشرة.'}</span></>)
                        : (<><AlertTriangle size={16} className="mt-0.5 shrink-0" /> <span>لم يتم التأكد تلقائيًا من سجل الحفظ — يمكن الإصدار يدويًا بصلاحية المشرف بعد التأكيد.</span></>)}
                    </div>
                    <Button
                      className={`rounded-full font-plex ${certType === 'full_quran' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-700 hover:bg-emerald-800'}`}
                      disabled={issuing}
                      data-testid="manual-issue-btn"
                      onClick={() => doIssue(false)}
                    >
                      {certType === 'full_quran' ? <Crown size={15} className="ml-1.5" /> : <Award size={15} className="ml-1.5" />}
                      {issuing ? 'جارٍ الإصدار...' : 'إصدار الشهادة'}
                    </Button>
                  </div>
                )
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Force-issue confirmation (backend returned 409) */}
      <Dialog open={!!forceWarning} onOpenChange={(open) => !open && setForceWarning(null)}>
        <DialogContent data-testid="manual-force-dialog">
          <DialogHeader>
            <DialogTitle className="font-amiri text-xl text-amber-700 flex items-center gap-2">
              <AlertTriangle size={18} /> تأكيد الإصدار اليدوي
            </DialogTitle>
            <DialogDescription className="font-plex text-xs">
              القرار النهائي للمشرف — سيُسجَّل في الشهادة أنها أُصدرت يدويًا دون تحقق تلقائي
            </DialogDescription>
          </DialogHeader>
          <p className="font-plex text-sm text-foreground" data-testid="manual-force-warning-text">{forceWarning}</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-full font-plex" data-testid="manual-force-cancel-btn" onClick={() => setForceWarning(null)}>إلغاء</Button>
            <Button className="rounded-full bg-amber-600 hover:bg-amber-700 font-plex" disabled={issuing} data-testid="manual-force-confirm-btn" onClick={() => doIssue(true)}>
              {issuing ? 'جارٍ الإصدار...' : 'متابعة وإصدار الشهادة يدويًا'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default ManualCertificateIssue;
