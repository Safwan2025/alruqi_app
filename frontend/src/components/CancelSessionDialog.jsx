import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';

const CancelSessionDialog = ({ open, onClose, session, onCancelled }) => {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCancel = async () => {
    if (!reason || reason.trim().length < 3) {
      toast.error('يرجى كتابة سبب الإلغاء (3 أحرف على الأقل)');
      return;
    }

    setLoading(true);
    try {
      await api.put(`/sessions/${session.session_id}/cancel`, {
        reason: reason
      });
      toast.success('تم إلغاء الحصة بنجاح');
      onCancelled?.();
      onClose();
      setReason('');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إلغاء الحصة');
    } finally {
      setLoading(false);
    }
  };

  if (!session) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-amiri text-2xl flex items-center gap-2 text-red-600">
            <AlertTriangle />
            إلغاء الحصة
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-red-50 rounded-lg border border-red-200">
            <p className="font-plex text-sm text-red-700">
              أنت على وشك إلغاء حصتك مع <strong>{session.teacher_name || session.student_name}</strong>
            </p>
            <p className="font-plex text-xs text-red-600 mt-1">
              {new Date(session.scheduled_time).toLocaleString('en-US', {
                dateStyle: 'full',
                timeStyle: 'short'
              })}
            </p>
          </div>

          <div>
            <Label className="font-plex font-bold">
              سبب الإلغاء <span className="text-red-500">*</span>
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="يرجى كتابة سبب إلغاء الحصة..."
              rows={3}
              className="font-plex mt-2"
            />
            <p className="font-plex text-xs text-gray-500 mt-1">
              سيتم إشعار الطرف الآخر بسبب الإلغاء
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button 
            onClick={handleCancel} 
            disabled={loading || reason.trim().length < 3}
            className="bg-red-600 hover:bg-red-700 rounded-full"
          >
            {loading ? 'جاري الإلغاء...' : 'تأكيد الإلغاء'}
          </Button>
          <Button variant="outline" onClick={onClose} className="rounded-full">
            تراجع
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CancelSessionDialog;
