import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle, Shield } from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';

const SetPasswordDialog = ({ open, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: ''
  });

  const validateForm = () => {
    if (!formData.password) {
      setError('يرجى إدخال كلمة المرور');
      return false;
    }
    if (formData.password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('كلمتا المرور غير متطابقتين');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setLoading(true);
    setError('');

    try {
      await api.post('/auth/set-password', {
        password: formData.password
      });
      
      toast.success('تم تعيين كلمة المرور بنجاح!');
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'فشل تعيين كلمة المرور');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    // Store in localStorage that user skipped, don't show again this session
    sessionStorage.setItem('password_setup_skipped', 'true');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" data-testid="set-password-dialog">
        <DialogHeader>
          <DialogTitle className="font-amiri text-2xl text-center flex items-center justify-center gap-2">
            <Shield className="text-primary" size={28} />
            تأمين حسابك
          </DialogTitle>
          <DialogDescription className="font-plex text-center text-gray-600">
            قم بتعيين كلمة مرور لتتمكن من تسجيل الدخول بالبريد الإلكتروني أيضاً
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
              <AlertCircle className="text-red-500 flex-shrink-0" size={20} />
              <p className="font-plex text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="font-plex text-sm text-amber-700">
              💡 تعيين كلمة مرور يسمح لك بتسجيل الدخول بالبريد الإلكتروني في المستقبل، واستعادة حسابك بسهولة.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="font-plex">كلمة المرور الجديدة</Label>
            <div className="relative">
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <Input
                data-testid="new-password-input"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                placeholder="6 أحرف على الأقل"
                className="pr-10 pl-10 font-plex"
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="font-plex">تأكيد كلمة المرور</Label>
            <div className="relative">
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <Input
                data-testid="confirm-password-input"
                type={showPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                placeholder="أعد إدخال كلمة المرور"
                className="pr-10 font-plex"
                dir="ltr"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleSkip}
              className="flex-1"
              data-testid="skip-password-btn"
            >
              لاحقاً
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-primary hover:bg-primary/90"
              data-testid="set-password-btn"
            >
              {loading ? (
                <>
                  <div className="spinner border-2 border-white border-t-transparent rounded-full w-4 h-4 ml-2"></div>
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <CheckCircle className="ml-2" size={18} />
                  تعيين كلمة المرور
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SetPasswordDialog;
