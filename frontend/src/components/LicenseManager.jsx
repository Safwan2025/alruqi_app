import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldCheck, Upload, FileText, ExternalLink, Trash2 } from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
const ACCEPT_ATTR = 'application/pdf,image/png,image/jpeg';
const PUBLIC_DOC_URL = `${process.env.REACT_APP_BACKEND_URL}/api/public/license/document`;

const initialForm = {
  license_number: '',
  issuer: '',
  status_label: 'مرخصة رسمياً',
  issue_date: '',
  expiry_date: '',
};

const LicenseManager = () => {
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [pendingFile, setPendingFile] = useState(null); // { data_url, name, mime, size }
  const fileInputRef = useRef(null);

  useEffect(() => {
    void loadCurrent();
  }, []);

  const loadCurrent = async () => {
    try {
      const res = await api.get('/admin/license');
      if (res.data?.has_document) {
        setCurrent(res.data);
        setForm({
          license_number: res.data.license_number || '',
          issuer: res.data.issuer || '',
          status_label: res.data.status_label || 'مرخصة رسمياً',
          issue_date: res.data.issue_date || '',
          expiry_date: res.data.expiry_date || '',
        });
      } else {
        setCurrent(null);
      }
    } catch (err) {
      console.error('Failed to load license', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      toast.error('نوع الملف غير مدعوم. اقبل PDF أو PNG أو JPG فقط.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('حجم الملف يتجاوز 5MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setPendingFile({
        data_url: reader.result,
        name: file.name,
        mime: file.type,
        size: file.size,
      });
    };
    reader.readAsDataURL(file);
  };

  const clearPendingFile = () => {
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
    if (!form.license_number.trim() || !form.issuer.trim() || !form.status_label.trim()) {
      toast.error('رقم الترخيص، الجهة، وحالة الترخيص حقول مطلوبة.');
      return;
    }
    if (!pendingFile && !current) {
      toast.error('يرجى اختيار ملف الترخيص.');
      return;
    }
    if (!pendingFile && current) {
      toast.error('لتحديث الحقول النصية، الرجاء إعادة رفع الملف أو الإبقاء على الملف الحالي.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        license_number: form.license_number.trim(),
        issuer: form.issuer.trim(),
        status_label: form.status_label.trim(),
        issue_date: form.issue_date || null,
        expiry_date: form.expiry_date || null,
        file_data_url: pendingFile.data_url,
        file_name: pendingFile.name,
      };
      await api.post('/admin/license', payload);
      toast.success('تم حفظ وثيقة الترخيص بنجاح.');
      clearPendingFile();
      await loadCurrent();
    } catch (err) {
      const detail = err.response?.data?.detail || 'حدث خطأ أثناء حفظ الوثيقة.';
      toast.error(detail);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!current) return;
    if (!window.confirm('هل تريد إلغاء تفعيل وثيقة الترخيص الحالية؟')) return;
    setDeleting(true);
    try {
      await api.delete('/admin/license');
      toast.success('تم إلغاء تفعيل الوثيقة.');
      setCurrent(null);
      setForm(initialForm);
    } catch (err) {
      const detail = err.response?.data?.detail || 'تعذر إلغاء التفعيل.';
      toast.error(detail);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 font-plex text-gray-500" data-testid="license-loading">
        جارٍ تحميل بيانات الترخيص...
      </div>
    );
  }

  return (
    <Card className="border-2 border-purple-200" data-testid="license-manager">
      <CardHeader className="bg-purple-50">
        <CardTitle className="font-amiri text-xl text-purple-700 flex items-center gap-2">
          <ShieldCheck size={24} />
          إدارة وثيقة الترخيص الرسمي
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 space-y-5">
        {current ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4" data-testid="license-current-card">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <FileText className="text-green-700" size={28} />
                <div>
                  <p className="font-amiri text-lg font-bold text-green-800" data-testid="license-current-number">
                    رقم الترخيص: {current.license_number}
                  </p>
                  <p className="font-plex text-sm text-green-700" data-testid="license-current-issuer">
                    {current.issuer} — {current.status_label}
                  </p>
                  <p className="font-plex text-xs text-gray-600 mt-1">
                    الملف: {current.file_name} ({Math.round((current.file_size_bytes || 0) / 1024)} KB)
                    {current.updated_at ? ` · آخر تحديث: ${new Date(current.updated_at).toLocaleString('ar')}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <a href={PUBLIC_DOC_URL} target="_blank" rel="noopener noreferrer" data-testid="license-view-current-btn">
                  <Button variant="outline" size="sm" className="border-green-600 text-green-700 hover:bg-green-600 hover:text-white">
                    <ExternalLink size={14} className="ml-1" /> عرض الوثيقة الحالية
                  </Button>
                </a>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-500 text-red-600 hover:bg-red-500 hover:text-white"
                  onClick={handleDelete}
                  disabled={deleting}
                  data-testid="license-delete-btn"
                >
                  <Trash2 size={14} className="ml-1" /> {deleting ? '...' : 'إلغاء التفعيل'}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-center" data-testid="license-empty-state">
            <p className="font-plex text-sm text-gray-600">لا توجد وثيقة ترخيص مفعّلة حالياً. ارفع وثيقة جديدة من النموذج أدناه.</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="font-plex">رقم الترخيص</Label>
            <Input
              value={form.license_number}
              onChange={(e) => setForm((f) => ({ ...f, license_number: e.target.value }))}
              placeholder="مثلاً: 324"
              data-testid="license-input-number"
              className="font-plex mt-2"
            />
          </div>
          <div>
            <Label className="font-plex">الجهة المانحة</Label>
            <Input
              value={form.issuer}
              onChange={(e) => setForm((f) => ({ ...f, issuer: e.target.value }))}
              placeholder="مثلاً: جمعية مثاني القرآنية"
              data-testid="license-input-issuer"
              className="font-plex mt-2"
            />
          </div>
          <div>
            <Label className="font-plex">حالة الترخيص</Label>
            <Input
              value={form.status_label}
              onChange={(e) => setForm((f) => ({ ...f, status_label: e.target.value }))}
              placeholder="مرخصة رسمياً"
              data-testid="license-input-status"
              className="font-plex mt-2"
            />
          </div>
          <div>
            <Label className="font-plex">تاريخ الإصدار (اختياري)</Label>
            <Input
              type="date"
              value={form.issue_date}
              onChange={(e) => setForm((f) => ({ ...f, issue_date: e.target.value }))}
              data-testid="license-input-issue-date"
              className="font-plex mt-2"
            />
          </div>
          <div>
            <Label className="font-plex">تاريخ الانتهاء (اختياري)</Label>
            <Input
              type="date"
              value={form.expiry_date}
              onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value }))}
              data-testid="license-input-expiry-date"
              className="font-plex mt-2"
            />
          </div>
          <div>
            <Label className="font-plex">رفع ملف الترخيص (PDF / PNG / JPG، حد أقصى 5MB)</Label>
            <Input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTR}
              onChange={handleFile}
              data-testid="license-file-input"
              className="font-plex mt-2 cursor-pointer"
            />
            {pendingFile && (
              <p className="text-xs text-gray-600 mt-1" data-testid="license-pending-info">
                الملف المختار: {pendingFile.name} ({Math.round(pendingFile.size / 1024)} KB)
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-2 border-t">
          <Button
            onClick={handleSave}
            disabled={saving || !pendingFile}
            className="bg-purple-600 hover:bg-purple-700 text-white"
            data-testid="license-save-btn"
          >
            <Upload size={16} className="ml-1" />
            {saving ? 'جارٍ الحفظ...' : current ? 'تحديث الوثيقة' : 'حفظ الوثيقة'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default LicenseManager;
