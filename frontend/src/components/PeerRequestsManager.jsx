import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
//import { Users, Check, X, Clock, CheckCircle2, XCircle, RefreshCw, Sparkles, Unlink } from 'lucide-react';
import { Users, Check, X, Clock, CheckCircle2, XCircle, RefreshCw, Sparkles, Unlink, Plus } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/utils/api';

const BUCKET_LABEL = {
  juz_amma: 'حول جزء عمّ',
  small: 'حفظ مبتدئ',
  medium: 'حفظ متوسط',
  large: 'حفظ متقدّم',
};

const STATUS_TABS = [
  { id: 'pending', label: 'بانتظار القرار', icon: Clock, color: 'text-amber-600' },
  { id: 'approved', label: 'موافق عليها', icon: CheckCircle2, color: 'text-green-600' },
  { id: 'rejected', label: 'مرفوضة', icon: XCircle, color: 'text-red-500' },
];

const PeerRequestsManager = ({ isAdmin = false }) => {
  const [tab, setTab] = useState('pending');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);

  // Manual admin pairing states
  const [students, setStudents] = useState([]);
  const [manualStudent1, setManualStudent1] = useState('');
  const [manualStudent2, setManualStudent2] = useState('');
  const [manualSearch1, setManualSearch1] = useState('');
  const [manualSearch2, setManualSearch2] = useState('');
  const [manualRecommendations, setManualRecommendations] = useState([]);
  const [manualBaseLevel, setManualBaseLevel] = useState(null);
  const [manualLoading, setManualLoading] = useState(false);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);

  // Student 2 selection mode:
  // recommended = smart suggestions
  // search = search all students by name/email
  const [manualSecondMode, setManualSecondMode] = useState('recommended');
  const [manualSearchAll, setManualSearchAll] = useState('');
  const [manualSearchAllResults, setManualSearchAllResults] = useState([]);
  const [manualSearchingAll, setManualSearchingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/peer-requests?status=${tab}`);
      setItems(res.data || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل تحميل الطلبات');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  // Load all students for selecting the first student
  useEffect(() => {
    if (!isAdmin) return;

    const loadStudents = async () => {
      try {
        const res = await api.get('/admin/all-users');
        const onlyStudents = (res.data || []).filter((u) => u.role === 'student');
        setStudents(onlyStudents);
      } catch (e) {
        console.error('Failed to load students for manual pairing', e);
        toast.error('فشل تحميل قائمة الطلاب');
      }
    };

    loadStudents();
  }, [isAdmin]);

  // Load smart recommendations after admin selects the first student
  useEffect(() => {
    if (!isAdmin || !manualStudent1) {
      setManualRecommendations([]);
      setManualBaseLevel(null);
      setManualStudent2('');
      return;
    }

    const loadRecommendations = async () => {
      setRecommendationsLoading(true);
      setManualStudent2('');
      setManualSearch2('');
      setManualSearchAll('');
      setManualSearchAllResults([]);

      try {
        const res = await api.get(`/admin/peer-recommendations/${manualStudent1}`);
        setManualRecommendations(res.data?.recommendations || []);
        setManualBaseLevel(res.data?.base_level || null);
      } catch (e) {
        console.error('Failed to load manual peer recommendations', e);
        toast.error(e.response?.data?.detail || 'فشل تحميل الاقتراحات حسب مستوى الحفظ');
        setManualRecommendations([]);
        setManualBaseLevel(null);
      } finally {
        setRecommendationsLoading(false);
      }
    };

    loadRecommendations();
  }, [isAdmin, manualStudent1]);

  // Search all students by name/email for second student
  useEffect(() => {
    if (!isAdmin || manualSecondMode !== 'search' || !manualStudent1) {
      setManualSearchAllResults([]);
      return;
    }

    const q = manualSearchAll.trim();

    if (q.length < 2) {
      setManualSearchAllResults([]);
      return;
    }

    const t = setTimeout(async () => {
      setManualSearchingAll(true);

      try {
        const res = await api.get(
          `/admin/student-search?q=${encodeURIComponent(q)}&exclude_id=${encodeURIComponent(manualStudent1)}`
        );
        setManualSearchAllResults(res.data || []);
      } catch (e) {
        console.error('Failed to search students for manual pairing', e);
        setManualSearchAllResults([]);
      } finally {
        setManualSearchingAll(false);
      }
    }, 350);

    return () => clearTimeout(t);
  }, [isAdmin, manualSecondMode, manualSearchAll, manualStudent1]);

  const handleApprove = async (id) => {
    setActingId(id);
    try {
      await api.post(`/admin/peer-requests/${id}/approve`);
      toast.success('تمت الموافقة على الشراكة');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل');
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async (id) => {
    if (!window.confirm('سيتم رفض هذا الطلب. هل أنت متأكد؟')) return;

    setActingId(id);
    try {
      await api.post(`/admin/peer-requests/${id}/reject`);
      toast.success('تم رفض الطلب');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل');
    } finally {
      setActingId(null);
    }
  };

  const handleUnpair = async (id, names) => {
    const msg = `سيتم إلغاء اقتران ${names}. الطالبان سيصبحان قادرين على اختيار قرين جديد. هل أنت متأكد؟`;
    if (!window.confirm(msg)) return;

    setActingId(id);
    try {
      await api.post(`/admin/peer-requests/${id}/unpair`);
      toast.success('تم إلغاء الاقتران');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل إلغاء الاقتران');
    } finally {
      setActingId(null);
    }
  };

  const handleManualPair = async () => {
    if (!manualStudent1 || !manualStudent2) {
      toast.error('يرجى اختيار الطالب الأول والطالب الثاني');
      return;
    }

    if (manualStudent1 === manualStudent2) {
      toast.error('لا يمكن اختيار نفس الطالب مرتين');
      return;
    }

    setManualLoading(true);

    try {
      await api.post('/admin/peer-partnerships/manual', {
        student1_id: manualStudent1,
        student2_id: manualStudent2
      });

      toast.success('تم تعيين الطالبين كقرينَي مراجعة');

      setManualStudent1('');
      setManualStudent2('');
      setManualSearch1('');
      setManualSearch2('');
      setManualSearchAll('');
      setManualSearchAllResults([]);
      setManualRecommendations([]);
      setManualBaseLevel(null);
      setManualSecondMode('recommended');

      setTab('approved');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل تعيين قرينَي المراجعة');
    } finally {
      setManualLoading(false);
    }
  };

  const filteredFirstStudents = students.filter((s) => {
    const q = manualSearch1.trim().toLowerCase();
    if (!q) return true;

    return (
      (s.name || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q)
    );
  });

  const filteredRecommendedPeers = manualRecommendations.filter((s) => {
    const q = manualSearch2.trim().toLowerCase();
    if (!q) return true;

    return (
      (s.name || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q)
    );
  });

  const selectedFirstStudent = students.find((s) => s.user_id === manualStudent1);

  return (
    <Card className="border-t-4 border-secondary" data-testid="peer-requests-manager">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="font-amiri text-lg sm:text-xl text-primary flex items-center gap-2 justify-end">
            <Users size={20} className="text-secondary" /> طلبات قرين المراجعة
          </CardTitle>

          <Button
            size="sm"
            variant="ghost"
            onClick={load}
            disabled={loading}
            className="rounded-full"
            data-testid="refresh-peer-requests-btn"
          >
            <RefreshCw size={14} className={`ml-1 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {isAdmin && (
          <div className="border-2 border-dashed border-primary/30 rounded-xl p-3 mb-4 bg-primary/5">
            <div className="flex items-center gap-2 mb-3">
              <Plus size={16} className="text-primary" />
              <h4 className="font-amiri font-bold text-primary">
                تعيين قرينَي مراجعة يدويًا
              </h4>
            </div>

            <div className="space-y-4">
              {/* الطالب الأول */}
              <div>
                <label className="font-plex text-xs text-muted-foreground block mb-1">
                  الطالب الأول
                </label>

                <Input
                  value={manualSearch1}
                  onChange={(e) => setManualSearch1(e.target.value)}
                  placeholder="ابحث عن الطالب الأول بالاسم أو البريد..."
                  className="font-plex mb-2"
                  data-testid="manual-peer-search-student-1"
                />

                {/* نتائج البحث المباشرة للطالب الأول */}
                {manualSearch1.trim().length > 0 && (
                  <div className="border rounded-lg bg-white mb-2 max-h-44 overflow-y-auto">
                    {filteredFirstStudents.length === 0 ? (
                      <div className="p-3 text-xs text-amber-700 font-plex">
                        لا يوجد طالب بهذا الاسم أو البريد.
                      </div>
                    ) : (
                      filteredFirstStudents.slice(0, 8).map((s) => (
                        <button
                          key={s.user_id}
                          type="button"
                          onClick={() => {
                            setManualStudent1(s.user_id);
                            setManualSearch1(`${s.name} - ${s.email || ''}`);
                            setManualStudent2('');
                            setManualSearch2('');
                            setManualSearchAll('');
                            setManualSearchAllResults([]);
                            setManualRecommendations([]);
                            setManualBaseLevel(null);
                          }}
                          className={`w-full text-right border-b last:border-b-0 p-2 text-xs font-plex transition ${
                            manualStudent1 === s.user_id
                              ? 'bg-primary/10 text-primary'
                              : 'hover:bg-primary/5'
                          }`}
                          data-testid={`manual-peer-first-search-result-${s.user_id}`}
                        >
                          <div className="font-amiri font-bold text-primary">
                            {s.name}
                          </div>
                          <div className="text-muted-foreground">
                            {s.email}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}

                {/* القائمة تبقى موجودة كخيار إضافي لمن يريد الاختيار اليدوي */}
                <select
                  value={manualStudent1}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    const selected = students.find((s) => s.user_id === selectedId);

                    setManualStudent1(selectedId);
                    setManualSearch1(selected ? `${selected.name} - ${selected.email || ''}` : '');
                    setManualStudent2('');
                    setManualSearch2('');
                    setManualSearchAll('');
                    setManualSearchAllResults([]);
                    setManualRecommendations([]);
                    setManualBaseLevel(null);
                  }}
                  className="h-10 rounded-md border bg-white px-3 text-sm font-plex w-full"
                  data-testid="manual-peer-student-1"
                >
                  <option value="">أو اختر الطالب الأول من القائمة</option>
                  {students.map((s) => (
                    <option key={s.user_id} value={s.user_id}>
                      {s.name} - {s.email}
                    </option>
                  ))}
                </select>

                {selectedFirstStudent && manualBaseLevel && (
                  <div className="mt-2 bg-white border rounded-lg p-2 text-xs font-plex text-primary">
                    الطالب المختار: <strong>{selectedFirstStudent.name}</strong>
                    {' '}· مستوى الحفظ: <strong>{manualBaseLevel.bucket_label}</strong>
                    {' '}· {manualBaseLevel.pages} صفحة (~{manualBaseLevel.juz} جزء)
                    {manualBaseLevel.current_surah && (
                      <span> · آخر موضع: {manualBaseLevel.current_surah}</span>
                    )}
                  </div>
                )}
              </div>


              {/* الطالب الثاني / قرين المراجعة */}
              <div>
                <label className="font-plex text-xs text-muted-foreground block mb-2">
                  الطالب الثاني / قرين المراجعة
                </label>

                {!manualStudent1 ? (
                  <div className="border rounded-lg bg-white p-3 text-xs text-muted-foreground font-plex">
                    اختر الطالب الأول أولًا، ثم اختر القرين الثاني من المقترحات أو من البحث العام.
                  </div>
                ) : (
                  <>
                    <div className="flex gap-1.5 border-b mb-3 overflow-x-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setManualSecondMode('recommended');
                          setManualStudent2('');
                        }}
                        className={`px-3 py-1.5 font-plex text-xs border-b-2 whitespace-nowrap ${
                          manualSecondMode === 'recommended'
                            ? 'border-primary text-primary font-bold'
                            : 'border-transparent text-muted-foreground hover:text-primary'
                        }`}
                      >
                        مقترحات حسب مستوى الحفظ
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setManualSecondMode('search');
                          setManualStudent2('');
                        }}
                        className={`px-3 py-1.5 font-plex text-xs border-b-2 whitespace-nowrap ${
                          manualSecondMode === 'search'
                            ? 'border-primary text-primary font-bold'
                            : 'border-transparent text-muted-foreground hover:text-primary'
                        }`}
                      >
                        بحث بالاسم من جميع الطلاب
                      </button>
                    </div>

                    {manualSecondMode === 'recommended' && (
                      <div>
                        {recommendationsLoading ? (
                          <div className="border rounded-lg bg-white p-3 text-xs text-muted-foreground font-plex">
                            جاري تحميل الاقتراحات...
                          </div>
                        ) : manualRecommendations.length === 0 ? (
                          <div className="border rounded-lg bg-white p-3 text-xs text-amber-700 font-plex">
                            لا توجد اقتراحات متاحة لهذا الطالب حاليًا.
                          </div>
                        ) : (
                          <>
                            <Input
                              value={manualSearch2}
                              onChange={(e) => setManualSearch2(e.target.value)}
                              placeholder="ابحث داخل المقترحات..."
                              className="font-plex mb-2"
                              data-testid="manual-peer-search-recommended"
                            />

                            <div className="space-y-1.5 max-h-44 overflow-y-auto">
                              {filteredRecommendedPeers.map((s) => (
                                <button
                                  key={s.user_id}
                                  type="button"
                                  onClick={() => setManualStudent2(s.user_id)}
                                  className={`w-full text-right border rounded-lg p-2 text-xs font-plex transition ${
                                    manualStudent2 === s.user_id
                                      ? 'border-primary bg-primary/10'
                                      : 'bg-white hover:bg-primary/5'
                                  }`}
                                  data-testid={`manual-peer-recommended-${s.user_id}`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-amiri font-bold text-primary">
                                      {s.name}
                                    </span>
                                    <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                      {s.bucket_label}
                                    </span>
                                  </div>

                                  <div className="text-muted-foreground mt-1">
                                    {s.reason} · فارق {s.diff_pages} صفحة
                                  </div>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {manualSecondMode === 'search' && (
                      <div>
                        <Input
                          value={manualSearchAll}
                          onChange={(e) => setManualSearchAll(e.target.value)}
                          placeholder="ابحث عن أي طالب بالاسم أو البريد..."
                          className="font-plex mb-2"
                          data-testid="manual-peer-search-all"
                        />

                        {manualSearchAll.trim().length < 2 ? (
                          <div className="border rounded-lg bg-white p-3 text-xs text-muted-foreground font-plex">
                            اكتب حرفين على الأقل للبحث.
                          </div>
                        ) : manualSearchingAll ? (
                          <div className="border rounded-lg bg-white p-3 text-xs text-muted-foreground font-plex">
                            جاري البحث...
                          </div>
                        ) : manualSearchAllResults.length === 0 ? (
                          <div className="border rounded-lg bg-white p-3 text-xs text-amber-700 font-plex">
                            لا توجد نتائج.
                          </div>
                        ) : (
                          <div className="space-y-1.5 max-h-44 overflow-y-auto">
                            {manualSearchAllResults.map((s) => (
                              <button
                                key={s.user_id}
                                type="button"
                                disabled={!s.is_available}
                                onClick={() => {
                                  if (s.is_available) setManualStudent2(s.user_id);
                                }}
                                className={`w-full text-right border rounded-lg p-2 text-xs font-plex transition ${
                                  manualStudent2 === s.user_id
                                    ? 'border-primary bg-primary/10'
                                    : s.is_available
                                      ? 'bg-white hover:bg-primary/5'
                                      : 'bg-gray-50 opacity-60 cursor-not-allowed'
                                }`}
                                data-testid={`manual-peer-search-result-${s.user_id}`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-amiri font-bold text-primary">
                                    {s.name}
                                  </span>
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                                    s.is_available
                                      ? 'bg-green-50 text-green-700'
                                      : 'bg-red-50 text-red-700'
                                  }`}>
                                    {s.is_available ? 'متاح' : 'لديه قرين/طلب قائم'}
                                  </span>
                                </div>

                                <div className="text-muted-foreground mt-1">
                                  {s.email}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {manualStudent2 && (
                      <p className="font-plex text-xs text-green-700 mt-2">
                        تم اختيار الطالب الثاني. يمكنك الآن تعيينهما كقرينَي مراجعة.
                      </p>
                    )}
                  </>
                )}
              </div>

              <Button
                size="sm"
                onClick={handleManualPair}
                disabled={manualLoading || !manualStudent1 || !manualStudent2}
                className="rounded-full"
                data-testid="manual-peer-create-btn"
              >
                <Users size={14} className="ml-1" />
                {manualLoading ? 'جاري التعيين...' : 'تعيين كقرينَي مراجعة'}
              </Button>

              <p className="font-plex text-[11px] text-muted-foreground">
                يمكن للمشرف اختيار القرين الثاني من المقترحات الذكية حسب مستوى الحفظ، أو البحث بالاسم من جميع الطلاب إذا رأى أن الاقتران مناسب تربويًا.
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-1.5 border-b mb-3 overflow-x-auto">
          {STATUS_TABS.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => setTab(s.id)}
                data-testid={`peer-tab-${s.id}`}
                className={`flex items-center gap-1.5 px-3 py-2 font-plex text-xs sm:text-sm border-b-2 whitespace-nowrap transition-colors ${
                  tab === s.id
                    ? 'border-primary text-primary font-bold'
                    : 'border-transparent text-muted-foreground hover:text-primary'
                }`}
              >
                <Icon size={14} className={tab === s.id ? s.color : ''} /> {s.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="spinner border-4 border-primary border-t-transparent rounded-full w-8 h-8"></div>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 font-plex text-sm text-muted-foreground" data-testid="peer-requests-empty">
            لا توجد طلبات في هذه القائمة
          </div>
        ) : (
          <div className="space-y-2.5" data-testid="peer-requests-list">
            {items.map((p) => {
              const same = p.requester_level?.bucket === p.target_level?.bucket;

              return (
                <div
                  key={p.partnership_id}
                  className="border-2 rounded-xl p-3 sm:p-4 bg-white"
                  data-testid={`peer-req-${p.partnership_id}`}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <PeerStudentBlock label="الطالب الطالِب" name={p.requester_name} level={p.requester_level} />
                    <PeerStudentBlock label="القرين المختار" name={p.target_name} level={p.target_level} />
                  </div>

                  <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t">
                    <div className="flex items-center gap-1.5 text-xs font-plex">
                      <Sparkles size={12} className={same ? 'text-green-600' : 'text-amber-500'} />
                      <span className={same ? 'text-green-700' : 'text-amber-700'}>
                        {same ? 'مستويان متقاربان' : 'مستويان مختلفان'} · فارق {Math.abs((p.requester_level?.pages || 0) - (p.target_level?.pages || 0)).toFixed(1)} صفحة
                      </span>
                    </div>

                    {p.note && (
                      <span className="text-xs text-muted-foreground font-plex truncate" title={p.note}>
                        ملاحظة: {p.note}
                      </span>
                    )}
                  </div>

                  {p.status === 'pending' && (
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        onClick={() => handleApprove(p.partnership_id)}
                        disabled={actingId === p.partnership_id}
                        className="rounded-full bg-green-600 hover:bg-green-700 flex-1 sm:flex-none"
                        data-testid={`approve-${p.partnership_id}`}
                      >
                        <Check size={14} className="ml-1" /> موافقة
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReject(p.partnership_id)}
                        disabled={actingId === p.partnership_id}
                        className="rounded-full border-red-400 text-red-500 hover:bg-red-50 flex-1 sm:flex-none"
                        data-testid={`reject-${p.partnership_id}`}
                      >
                        <X size={14} className="ml-1" /> رفض
                      </Button>
                    </div>
                  )}

                  {p.status !== 'pending' && p.decided_at && (
                    <p className="font-plex text-[11px] text-muted-foreground mt-2 pt-2 border-t">
                      {p.status === 'approved' ? 'تمت الموافقة' : 'تم الرفض'} في {new Date(p.decided_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  )}

                  {p.status === 'approved' && isAdmin && (
                    <div className="mt-3 pt-3 border-t flex items-center justify-between flex-wrap gap-2">
                      <p className="font-plex text-[11px] text-amber-700 flex items-center gap-1">
                        <Sparkles size={12} /> صلاحية المشرف: يمكنك إلغاء الاقتران ليصبح الطالبان متاحَين لاختيار قرين جديد.
                      </p>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUnpair(p.partnership_id, `${p.requester_name} و${p.target_name}`)}
                        disabled={actingId === p.partnership_id}
                        className="rounded-full border-red-400 text-red-600 hover:bg-red-50"
                        data-testid={`unpair-${p.partnership_id}`}
                      >
                        <Unlink size={14} className="ml-1" /> إلغاء الاقتران
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const PeerStudentBlock = ({ label, name, level }) => (
  <div className="border rounded-lg p-3 bg-gradient-to-br from-white to-amber-50/30">
    <p className="text-[10px] font-plex text-muted-foreground mb-1">{label}</p>
    <p className="font-amiri text-base font-bold text-primary truncate">{name}</p>
    {level && (
      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-plex">{BUCKET_LABEL[level.bucket] || 'مستوى'}</span>
        <span className="text-[10px] text-muted-foreground font-plex">{level.pages} صفحة</span>
      </div>
    )}
  </div>
);

export default PeerRequestsManager;
