import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Award, Crown, Download, Printer, Send, RefreshCw, ScrollText, BarChart3, CheckCircle2, Search, AlertTriangle } from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';
import { generateCertificatePDF } from '@/utils/generateCertificatePDF';
import { formatSupervisorName } from '@/utils/formatSupervisorName';
import { formatArabicDate } from '@/utils/formatArabicDate';
import ManualCertificateIssue from '@/components/ManualCertificateIssue';
import useShowMoreList from '@/hooks/useShowMoreList';
import ShowMoreButton from '@/components/ShowMoreButton';

const fmtDate = (iso) => formatArabicDate(iso, 'short');

/**
 * Admin-only certificates console:
 *  1. Pending eligibility cards (juz completed → certificate awaiting issue)
 *  2. Follow-up dashboard (all students, completion vs issued)
 *  3. Certificates log (download / print / re-send to student)
 * Issuing is ALWAYS manual — admin reviews then confirms in a dialog.
 */
const CertificatesManager = () => {
  const [eligibility, setEligibility] = useState(null);
  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [sendingId, setSendingId] = useState(null);
  const [diag, setDiag] = useState(null);          // diagnostics data
  const [diagLoading, setDiagLoading] = useState(false);

  const openDiagnostics = async (studentId) => {
    setDiagLoading(true);
    setDiag({ loading: true });
    try {
      const res = await api.get(`/admin/certificates/diagnostics/${studentId}`);
      setDiag(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل تحميل التشخيص');
      setDiag(null);
    }
    setDiagLoading(false);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eligRes, certsRes] = await Promise.all([
        api.get('/admin/certificates/eligibility'),
        api.get('/admin/certificates'),
      ]);
      setEligibility(eligRes.data);
      setCerts(certsRes.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل تحميل بيانات الشهادات');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleIssue = async () => {
    if (!confirmDialog) return;
    setIssuing(true);
    try {
      const res = await api.post('/admin/certificates/issue', {
        student_id: confirmDialog.student_id,
        certificate_type: confirmDialog.type,
        juz_number: confirmDialog.juz_number || null,
      });
      toast.success(`تم إصدار الشهادة بنجاح — ${res.data.certificate_number}`);
      setConfirmDialog(null);
      generateCertificatePDF(res.data);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل إصدار الشهادة');
    }
    setIssuing(false);
  };

  const handleSend = async (cert) => {
    setSendingId(cert.certificate_id);
    try {
      await api.post(`/admin/certificates/${cert.certificate_id}/send`);
      toast.success('تم إرسال الشهادة للطالب داخل النظام');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الإرسال');
    }
    setSendingId(null);
  };

  const students = eligibility?.students || [];
  const pendingStudents = students.filter(s => s.pending_count > 0 || s.full_quran_pending);

  // 5 طلاب أولًا + "عرض المزيد" (+5) لقائمة المستحقين ولوحة المتابعة
  const pendingList = useShowMoreList(pendingStudents, 5);
  const followupList = useShowMoreList(students, 5);

  if (loading) {
    return <div className="text-center py-12 font-plex text-muted-foreground" data-testid="certificates-loading">جارٍ تحميل بيانات الشهادات...</div>;
  }

  return (
    <div className="space-y-6" data-testid="certificates-manager">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award className="text-amber-600" size={24} />
          <h3 className="font-amiri text-xl sm:text-2xl font-bold text-emerald-800">نظام الشهادات</h3>
        </div>
        <Button onClick={load} variant="outline" size="sm" className="rounded-full font-plex" data-testid="certificates-refresh-btn">
          <RefreshCw size={14} className="ml-1" /> تحديث
        </Button>
      </div>

      {/* ===== 1) Pending certificates (awaiting admin issue) ===== */}
      <section data-testid="pending-certificates-section">
        <div className="flex items-center gap-2 mb-3">
          <ScrollText className="text-emerald-700" size={18} />
          <h4 className="font-plex font-bold text-emerald-800">شهادات مستحقة بانتظار الإصدار</h4>
          <span className="bg-amber-500 text-white text-xs font-bold px-2.5 py-0.5 rounded-full" data-testid="pending-certificates-count">{eligibility?.total_pending || 0}</span>
        </div>
        {pendingStudents.length === 0 ? (
          <Card><CardContent className="py-6 text-center font-plex text-sm text-muted-foreground" data-testid="no-pending-certificates">
            لا توجد شهادات مستحقة حاليًا — عند إكمال أي طالب جميع صفحات جزء كامل وفق سجل التسميع سيظهر هنا.
            <br />
            <span className="text-xs">يمكنك الضغط على «التفاصيل» بجانب أي طالب في لوحة المتابعة أدناه لمعرفة سبب عدم الاستحقاق بدقة.</span>
          </CardContent></Card>
        ) : (
          <div className="grid gap-3">
            {pendingList.visible.map(s => (
              <Card key={s.student_id} className="border-amber-200 bg-amber-50/40" data-testid={`pending-student-${s.student_id}`}>
                <CardHeader className="p-3 sm:p-4 pb-1">
                  <CardTitle className="font-amiri text-lg text-emerald-900 flex items-center gap-2">
                    <CheckCircle2 className="text-emerald-600" size={18} />
                    الطالب {s.student_name} <span className="font-plex text-xs text-muted-foreground font-normal">({s.completed_count} من 30 جزءًا مكتملة)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 sm:p-4 pt-2 space-y-2">
                  {s.full_quran_pending && (
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-gradient-to-l from-amber-100 to-yellow-50 border border-amber-400 rounded-xl p-3">
                      <div className="flex items-center gap-2 font-plex text-sm font-bold text-amber-800">
                        <Crown size={18} className="text-amber-600" />
                        مستحق لشهادة ختم القرآن الكريم — أكمل حفظ الأجزاء الثلاثين
                      </div>
                      <Button
                        size="sm"
                        className="rounded-full bg-amber-600 hover:bg-amber-700 text-white font-plex"
                        data-testid={`issue-khatm-btn-${s.student_id}`}
                        onClick={() => setConfirmDialog({ student_id: s.student_id, student_name: s.student_name, type: 'full_quran' })}
                      >
                        <Crown size={14} className="ml-1" /> إصدار شهادة ختم القرآن الكريم
                      </Button>
                    </div>
                  )}
                  {s.pending_juz.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {s.pending_juz.map(j => (
                        <div key={j.juz_number} className="flex items-center gap-2 bg-white border border-emerald-200 rounded-full pr-3 pl-1 py-1">
                          <span className="font-plex text-xs font-semibold text-emerald-800">{j.juz_name}</span>
                          <span className="font-plex text-[10px] text-muted-foreground">أُكمل {fmtDate(j.completion_date)}</span>
                          <Button
                            size="sm"
                            className="rounded-full h-7 px-3 text-xs bg-emerald-700 hover:bg-emerald-800 font-plex"
                            data-testid={`issue-cert-btn-${s.student_id}-${j.juz_number}`}
                            onClick={() => setConfirmDialog({ student_id: s.student_id, student_name: s.student_name, type: 'juz', juz_number: j.juz_number, juz_name: j.juz_name })}
                          >
                            إصدار الشهادة
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            <ShowMoreButton canShowMore={pendingList.canShowMore} onShowMore={pendingList.showMore} total={pendingList.total} shown={pendingList.shown} testId="pending-students-show-more" />
          </div>
        )}
      </section>

      {/* ===== 2) Manual certificate issuing (admin decision) ===== */}
      <ManualCertificateIssue students={students} certs={certs} onReload={load} />

      {/* ===== 3) Follow-up dashboard (all students) ===== */}
      <section data-testid="certificates-dashboard-section">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="text-emerald-700" size={18} />
          <h4 className="font-plex font-bold text-emerald-800">لوحة متابعة الشهادات</h4>
        </div>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm font-plex" data-testid="eligibility-table">
              <thead>
                <tr className="bg-emerald-700 text-white text-xs">
                  <th className="py-2.5 px-3 text-right">الطالب</th>
                  <th className="py-2.5 px-3 text-center">سجلات الحفظ</th>
                  <th className="py-2.5 px-3 text-center">صفحات محفوظة</th>
                  <th className="py-2.5 px-3 text-center">الأجزاء المنجزة</th>
                  <th className="py-2.5 px-3 text-center">شهادات صادرة</th>
                  <th className="py-2.5 px-3 text-center">بانتظار الإصدار</th>
                  <th className="py-2.5 px-3 text-center">ختم القرآن</th>
                  <th className="py-2.5 px-3 text-center">التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {students.length === 0 && (
                  <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">لا يوجد طلاب</td></tr>
                )}
                {followupList.visible.map(s => (
                  <tr key={s.student_id} className="border-b last:border-0 hover:bg-emerald-50/40" data-testid={`eligibility-row-${s.student_id}`}>
                    <td className="py-2 px-3 font-semibold text-emerald-900">{s.student_name}</td>
                    <td className="py-2 px-3 text-center text-xs">{s.records_found ?? '—'}</td>
                    <td className="py-2 px-3 text-center text-xs">{s.covered_pages_count ?? '—'}</td>
                    <td className="py-2 px-3 text-center"><span className="font-bold">{s.completed_count}</span> <span className="text-xs text-muted-foreground">/ 30</span></td>
                    <td className="py-2 px-3 text-center">{s.issued_count}</td>
                    <td className="py-2 px-3 text-center">
                      {s.pending_count > 0
                        ? <span className="bg-amber-100 text-amber-800 font-bold text-xs px-2.5 py-0.5 rounded-full">{s.pending_count}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2 px-3 text-center text-xs">
                      {s.full_quran_issued ? <span className="text-emerald-700 font-bold">صدرت الشهادة ✓</span>
                        : s.full_quran_pending ? <span className="text-amber-700 font-bold">مستحق — بانتظار الإصدار</span>
                        : <span className="text-muted-foreground">لم يكتمل بعد</span>}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <Button size="sm" variant="outline" className="rounded-full h-7 px-2.5 text-xs" data-testid={`cert-diagnostics-btn-${s.student_id}`} onClick={() => openDiagnostics(s.student_id)}>
                        <Search size={12} className="ml-1" /> التفاصيل
                      </Button>
                    </td>
                  </tr>
                ))}
                {followupList.canShowMore && (
                  <tr data-testid="followup-show-more-row">
                    <td colSpan={8} className="py-3 text-center">
                      <button
                        type="button"
                        data-testid="followup-students-show-more"
                        onClick={followupList.showMore}
                        className="px-5 py-2 rounded-full text-xs font-plex bg-primary/10 text-primary hover:bg-primary/20 font-bold transition-colors"
                      >
                        عرض المزيد <span className="opacity-70" dir="ltr">({followupList.shown} / {followupList.total})</span>
                      </button>
                    </td>
                  </tr>
                )}
                {!followupList.canShowMore && followupList.total > 5 && (
                  <tr>
                    <td colSpan={8} className="py-2 text-center text-xs font-plex text-muted-foreground" data-testid="followup-students-all-shown">تم عرض جميع الطلاب</td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* ===== 4) Certificates log ===== */}
      <section data-testid="certificates-log-section">
        <div className="flex items-center gap-2 mb-3">
          <ScrollText className="text-emerald-700" size={18} />
          <h4 className="font-plex font-bold text-emerald-800">سجل الشهادات الصادرة</h4>
          <span className="bg-emerald-700 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">{certs.length}</span>
        </div>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm font-plex" data-testid="certificates-log-table">
              <thead>
                <tr className="bg-emerald-700 text-white text-xs">
                  <th className="py-2.5 px-3 text-right">رقم الشهادة</th>
                  <th className="py-2.5 px-3 text-right">الطالب</th>
                  <th className="py-2.5 px-3 text-right">النوع</th>
                  <th className="py-2.5 px-3 text-center">تاريخ الإتمام</th>
                  <th className="py-2.5 px-3 text-center">تاريخ الإصدار</th>
                  <th className="py-2.5 px-3 text-right">أصدرها</th>
                  <th className="py-2.5 px-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {certs.length === 0 && (
                  <tr><td colSpan={7} className="py-6 text-center text-muted-foreground" data-testid="empty-certificates-log">لم تصدر أي شهادات بعد</td></tr>
                )}
                {certs.map(c => (
                  <tr key={c.certificate_id} className="border-b last:border-0 hover:bg-emerald-50/40" data-testid={`cert-row-${c.certificate_id}`}>
                    <td className="py-2 px-3"><span dir="ltr" className="text-xs font-bold text-emerald-800">{c.certificate_number}</span></td>
                    <td className="py-2 px-3 font-semibold">{c.student_name}</td>
                    <td className="py-2 px-3 text-xs">
                      {c.certificate_type === 'full_quran'
                        ? <span className="bg-amber-100 text-amber-800 font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1"><Crown size={12} /> ختم القرآن الكريم</span>
                        : <span className="bg-emerald-100 text-emerald-800 font-semibold px-2.5 py-0.5 rounded-full">{c.juz_name}</span>}
                    </td>
                    <td className="py-2 px-3 text-center text-xs">{fmtDate(c.completion_date)}</td>
                    <td className="py-2 px-3 text-center text-xs">{fmtDate(c.issued_at)}</td>
                    <td className="py-2 px-3 text-xs">{formatSupervisorName(c.issued_by_name)}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <Button size="sm" variant="outline" className="rounded-full h-7 px-2.5 text-xs" data-testid={`cert-download-btn-${c.certificate_id}`} onClick={() => generateCertificatePDF(c)}>
                          <Download size={12} className="ml-1" /> PDF
                        </Button>
                        <Button size="sm" variant="outline" className="rounded-full h-7 px-2.5 text-xs" data-testid={`cert-print-btn-${c.certificate_id}`} onClick={() => generateCertificatePDF(c)}>
                          <Printer size={12} className="ml-1" /> طباعة
                        </Button>
                        <Button size="sm" variant="outline" className="rounded-full h-7 px-2.5 text-xs border-blue-300 text-blue-700 hover:bg-blue-50" disabled={sendingId === c.certificate_id} data-testid={`cert-send-btn-${c.certificate_id}`} onClick={() => handleSend(c)}>
                          <Send size={12} className="ml-1" /> {sendingId === c.certificate_id ? 'جارٍ...' : 'إرسال للطالب'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* ===== Diagnostics dialog (why is/isn't a student eligible) ===== */}
      <Dialog open={!!diag} onOpenChange={(open) => !open && setDiag(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="cert-diagnostics-dialog">
          <DialogHeader>
            <DialogTitle className="font-amiri text-xl text-emerald-800 flex items-center gap-2">
              <Search size={18} /> تشخيص استحقاق الشهادات
            </DialogTitle>
            <DialogDescription className="font-plex text-xs">
              فحص تفصيلي لسجل الحفظ الحقيقي وسبب الاستحقاق أو عدمه
            </DialogDescription>
          </DialogHeader>
          {diagLoading || diag?.loading ? (
            <p className="font-plex text-sm text-muted-foreground py-6 text-center">جارٍ فحص سجل الحفظ...</p>
          ) : diag && (
            <div className="font-plex text-sm space-y-3">
              <p className="font-bold text-emerald-900">{diag.student_name}</p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-900 text-sm" data-testid="diagnostics-reason">
                {diag.reason}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-emerald-50 rounded-lg p-2">
                  <p className="text-lg font-bold text-emerald-800">{diag.records_found}</p>
                  <p className="text-[11px] text-muted-foreground">سجل تسميع/حفظ</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-2">
                  <p className="text-lg font-bold text-emerald-800">{diag.covered_pages_count}</p>
                  <p className="text-[11px] text-muted-foreground">صفحة محفوظة (من 604)</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-2">
                  <p className="text-lg font-bold text-emerald-800">{diag.completed_juz?.length || 0}</p>
                  <p className="text-[11px] text-muted-foreground">جزء مكتمل (من 30)</p>
                </div>
              </div>
              {diag.last_recorded_at && (
                <p className="text-xs text-muted-foreground">آخر تسميع مسجَّل: <span className="text-foreground">{fmtDate(diag.last_recorded_at)}</span></p>
              )}
              {diag.completed_juz?.length > 0 && (
                <div>
                  <p className="font-bold text-emerald-800 text-xs mb-1">الأجزاء المكتملة:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {diag.completed_juz.map(j => (
                      <span key={j.juz_number} className="bg-emerald-100 text-emerald-800 text-xs font-semibold px-2 py-0.5 rounded-full">{j.juz_name}</span>
                    ))}
                  </div>
                </div>
              )}
              {diag.partial_juz?.length > 0 && (
                <div>
                  <p className="font-bold text-amber-800 text-xs mb-1">أجزاء ناقصة (الأقرب للاكتمال أولًا):</p>
                  <div className="space-y-1">
                    {diag.partial_juz.map(j => (
                      <div key={j.juz_number} className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                        <span className="text-xs font-semibold text-amber-900">{j.juz_name}</span>
                        <span className="text-[11px] text-muted-foreground">
                          محفوظ <b className="text-amber-800">{j.covered_pages}</b> من {j.total_pages} صفحة — ناقص: <span dir="ltr">{j.missing_pages.slice(0, 12).join(', ')}{j.missing_pages.length > 12 ? '…' : ''}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {diag.parsed_records?.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer font-bold text-emerald-800">سجلات الحفظ المحتسبة ({diag.parsed_records.length})</summary>
                  <div className="mt-1.5 max-h-44 overflow-y-auto space-y-1">
                    {diag.parsed_records.map((r, i) => (
                      <div key={i} className="flex items-center justify-between bg-gray-50 rounded px-2 py-1">
                        <span>{r.surah_name} <span className="text-muted-foreground">(آية <span dir="ltr">{r.from_ayah}-{r.to_ayah}</span>)</span></span>
                        <span className="text-muted-foreground">صفحات <span dir="ltr">{r.from_page}-{r.to_page}</span> · {r.source === 'student_notes_archive' ? 'ملاحظات التسميع' : 'سجل الحفظ'}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {diag.unparsed_records?.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-2.5" data-testid="diagnostics-unparsed">
                  <p className="font-bold text-red-800 text-xs flex items-center gap-1 mb-1"><AlertTriangle size={13} /> سجلات لم يتعرف النظام على سورها ({diag.unparsed_records.length}) — لا تُحتسب:</p>
                  {diag.unparsed_records.map((r, i) => (
                    <p key={i} className="text-[11px] text-red-700">«{r.surah_name}» (آية <span dir="ltr">{r.from_ayah}-{r.to_ayah}</span>)</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== Issue confirmation dialog ===== */}
      <Dialog open={!!confirmDialog} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <DialogContent data-testid="issue-certificate-dialog">
          <DialogHeader>
            <DialogTitle className="font-amiri text-2xl text-emerald-800">
              {confirmDialog?.type === 'full_quran' ? 'إصدار شهادة ختم القرآن الكريم' : 'إصدار شهادة جزء'}
            </DialogTitle>
            <DialogDescription className="font-plex text-xs">
              راجع البيانات ثم أكّد الإصدار — لن تصدر الشهادة تلقائيًا
            </DialogDescription>
          </DialogHeader>
          {confirmDialog && (
            <div className="font-plex text-sm space-y-2">
              <p>الطالب: <b className="text-emerald-900">{confirmDialog.student_name}</b></p>
              {confirmDialog.type === 'juz'
                ? <p>الشهادة: <b className="text-emerald-900">إتمام حفظ {confirmDialog.juz_name}</b></p>
                : <p className="text-amber-700 font-bold flex items-center gap-1"><Crown size={16} /> شهادة ختم القرآن الكريم كاملًا</p>}
              <p className="text-xs text-muted-foreground">سيتم توليد رقم شهادة فريد، وإشعار الطالب داخل النظام، وستظهر الشهادة في قسم «شهاداتي» لديه.</p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-full font-plex" onClick={() => setConfirmDialog(null)} data-testid="issue-cancel-btn">إلغاء</Button>
            <Button className="rounded-full bg-emerald-700 hover:bg-emerald-800 font-plex" disabled={issuing} onClick={handleIssue} data-testid="issue-confirm-btn">
              <Award size={14} className="ml-1" /> {issuing ? 'جارٍ الإصدار...' : 'تأكيد إصدار الشهادة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CertificatesManager;
