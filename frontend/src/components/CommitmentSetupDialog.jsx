import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Target, Save } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/utils/api';

const CommitmentSetupDialog = ({ open, onSaved }) => {
  const [sessions, setSessions] = useState('1');
  const [pages, setPages] = useState('1');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const sNum = parseInt(sessions, 10);
    const pNum = parseInt(pages, 10);
    if (!sNum || sNum < 1 || !pNum || pNum < 1) {
      toast.error('الحد الأدنى هو 1 لكلٍ من الجلسات والصفحات');
      return;
    }
    setSaving(true);
    try {
      await api.put('/student/commitment', {
        min_sessions_per_week: sNum,
        min_pages_per_week: pNum,
      });
      toast.success('تم حفظ التزامك الأسبوعي بنجاح');
      onSaved?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} modal>
      <DialogContent
        className="sm:max-w-md [&>button.absolute]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        data-testid="commitment-setup-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-amiri text-2xl text-primary flex items-center gap-2 justify-end">
            <Target size={22} />
            ضع التزامك الأسبوعي
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="font-plex text-sm text-amber-800 leading-relaxed">
              قبل أن تبدأ، يجب عليك تحديد التزامك الأسبوعي الأدنى. هذا الالتزام سيُستخدم لمتابعة تقدمك، وإذا قلَّ أداؤك عنه لمدة 3 أسابيع خلال 3 أشهر سيتم تجميد حسابك تلقائياً.
            </p>
          </div>

          <div>
            <Label className="font-plex mb-2 block">عدد الجلسات الأسبوعية (1 على الأقل)</Label>
            <Input
              type="number"
              min={1}
              inputMode="numeric"
              value={sessions}
              onChange={(e) => setSessions(e.target.value.replace(/[^0-9]/g, ''))}
              data-testid="setup-sessions-input"
              className="font-plex"
            />
          </div>

          <div>
            <Label className="font-plex mb-2 block">عدد صفحات التسميع الأسبوعية (1 على الأقل)</Label>
            <Input
              type="number"
              min={1}
              inputMode="numeric"
              value={pages}
              onChange={(e) => setPages(e.target.value.replace(/[^0-9]/g, ''))}
              data-testid="setup-pages-input"
              className="font-plex"
            />
          </div>

          <Button
            onClick={handleSave}
            disabled={saving}
            data-testid="setup-save-btn"
            className="w-full rounded-full"
          >
            {saving ? (
              <><div className="spinner border-2 border-white border-t-transparent rounded-full w-4 h-4 ml-2"></div>جاري الحفظ...</>
            ) : (
              <><Save className="ml-2" size={16} />احفظ والتزم</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CommitmentSetupDialog;
