import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Calendar, Lock, Mail, AlertCircle, CheckCircle } from 'lucide-react';
import { publicApi } from '@/utils/api';
import { toast } from 'sonner';

const ForgotPasswordDialog = ({ open, onClose }) => {
  const [step, setStep] = useState(1); // 1: Enter email & DOB, 2: Enter new password
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  const [formData, setFormData] = useState({
    email: '',
    date_of_birth: '',
    new_password: '',
    confirm_password: ''
  });

  const handleVerifyDOB = async () => {
    if (!formData.email || !formData.date_of_birth) {
      setError('يرجى إدخال البريد الإلكتروني وتاريخ الميلاد');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await publicApi.post('/auth/verify-dob', {
        email: formData.email,
        date_of_birth: formData.date_of_birth
      });
      
      setStep(2);
      toast.success('تم التحقق من تاريخ الميلاد');
    } catch (err) {
      setError(err.response?.data?.detail || 'فشل التحقق');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!formData.new_password || !formData.confirm_password) {
      setError('يرجى إدخال كلمة المرور الجديدة');
      return;
    }

    if (formData.new_password !== formData.confirm_password) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }

    if (formData.new_password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await publicApi.post('/auth/reset-password-dob', {
        email: formData.email,
        date_of_birth: formData.date_of_birth,
        new_password: formData.new_password
      });
      
      setSuccess(true);
      toast.success('تم تغيير كلمة المرور بنجاح');
      
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.detail || 'فشل تغيير كلمة المرور');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setError('');
    setSuccess(false);
    setFormData({
      email: '',
      date_of_birth: '',
      new_password: '',
      confirm_password: ''
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-amiri text-2xl text-center">
            {success ? 'تم بنجاح!' : step === 1 ? 'استعادة كلمة المرور' : 'تعيين كلمة مرور جديدة'}
          </DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="text-center py-8">
            <CheckCircle className="mx-auto text-green-500 mb-4" size={64} />
            <p className="font-plex text-lg text-green-600">تم تغيير كلمة المرور بنجاح</p>
            <p className="font-plex text-gray-500 mt-2">يمكنك الآن تسجيل الدخول</p>
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
                <AlertCircle className="text-red-500" size={20} />
                <p className="font-plex text-sm text-red-600">{error}</p>
              </div>
            )}

            {step === 1 && (
              <>
                <p className="font-plex text-gray-600 text-sm text-center">
                  أدخل بريدك الإلكتروني وتاريخ ميلادك للتحقق من هويتك
                </p>

                <div>
                  <Label className="font-plex">البريد الإلكتروني</Label>
                  <div className="relative mt-1">
                    <Mail className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="example@email.com"
                      className="pr-10 font-plex"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div>
                  <Label className="font-plex">تاريخ الميلاد</Label>
                  <div className="relative mt-1">
                    <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <Input
                      type="date"
                      value={formData.date_of_birth}
                      onChange={(e) => setFormData(prev => ({ ...prev, date_of_birth: e.target.value }))}
                      className="pr-10 font-plex"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleVerifyDOB}
                  disabled={loading}
                  className="w-full bg-primary hover:bg-primary/90"
                >
                  {loading ? (
                    <>
                      <div className="spinner border-2 border-white border-t-transparent rounded-full w-4 h-4 ml-2"></div>
                      جاري التحقق...
                    </>
                  ) : (
                    'تحقق'
                  )}
                </Button>
              </>
            )}

            {step === 2 && (
              <>
                <p className="font-plex text-gray-600 text-sm text-center">
                  تم التحقق من هويتك. أدخل كلمة المرور الجديدة
                </p>

                <div>
                  <Label className="font-plex">كلمة المرور الجديدة</Label>
                  <div className="relative mt-1">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <Input
                      type="password"
                      value={formData.new_password}
                      onChange={(e) => setFormData(prev => ({ ...prev, new_password: e.target.value }))}
                      placeholder="6 أحرف على الأقل"
                      className="pr-10 font-plex"
                    />
                  </div>
                </div>

                <div>
                  <Label className="font-plex">تأكيد كلمة المرور</Label>
                  <div className="relative mt-1">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <Input
                      type="password"
                      value={formData.confirm_password}
                      onChange={(e) => setFormData(prev => ({ ...prev, confirm_password: e.target.value }))}
                      placeholder="أعد إدخال كلمة المرور"
                      className="pr-10 font-plex"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setStep(1)}
                    disabled={loading}
                    className="flex-1"
                  >
                    رجوع
                  </Button>
                  <Button
                    onClick={handleResetPassword}
                    disabled={loading}
                    className="flex-1 bg-primary hover:bg-primary/90"
                  >
                    {loading ? (
                      <>
                        <div className="spinner border-2 border-white border-t-transparent rounded-full w-4 h-4 ml-2"></div>
                        جاري الحفظ...
                      </>
                    ) : (
                      'تغيير كلمة المرور'
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ForgotPasswordDialog;
