import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle, Key } from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';

const ChangePasswordForm = ({ hasExistingPassword = true }) => {
  const [loading, setLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const validateForm = () => {
    // Only require current password if user has one
    if (hasExistingPassword && !formData.currentPassword) {
      setError('يرجى إدخال كلمة المرور الحالية');
      return false;
    }
    if (!formData.newPassword) {
      setError('يرجى إدخال كلمة المرور الجديدة');
      return false;
    }
    if (formData.newPassword.length < 6) {
      setError('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل');
      return false;
    }
    if (formData.newPassword !== formData.confirmPassword) {
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
    setSuccess(false);

    try {
      await api.post('/auth/change-password', {
        current_password: hasExistingPassword ? formData.currentPassword : null,
        new_password: formData.newPassword
      });
      
      setSuccess(true);
      toast.success('تم تغيير كلمة المرور بنجاح!');
      
      // Reset form
      setFormData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
    } catch (err) {
      setError(err.response?.data?.detail || 'فشل تغيير كلمة المرور');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-2 border-primary/20" data-testid="change-password-card">
      <CardHeader className="pb-4">
        <CardTitle className="font-amiri text-xl text-primary flex items-center gap-2">
          <Key size={24} />
          {hasExistingPassword ? 'تغيير كلمة المرور' : 'تعيين كلمة المرور'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
              <AlertCircle className="text-red-500 flex-shrink-0" size={20} />
              <p className="font-plex text-sm text-red-600">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
              <CheckCircle className="text-green-500 flex-shrink-0" size={20} />
              <p className="font-plex text-sm text-green-600">تم تغيير كلمة المرور بنجاح</p>
            </div>
          )}

          {!hasExistingPassword && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="font-plex text-sm text-blue-700">
                💡 لم تقم بتعيين كلمة مرور بعد. قم بتعيين واحدة لتتمكن من تسجيل الدخول بالبريد الإلكتروني.
              </p>
            </div>
          )}

          {hasExistingPassword && (
            <div className="space-y-2">
              <Label className="font-plex">كلمة المرور الحالية</Label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <Input
                  data-testid="current-password-input"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={formData.currentPassword}
                  onChange={(e) => setFormData(prev => ({ ...prev, currentPassword: e.target.value }))}
                  placeholder="أدخل كلمة المرور الحالية"
                  className="pr-10 pl-10 font-plex"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="font-plex">كلمة المرور الجديدة</Label>
            <div className="relative">
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <Input
                data-testid="new-password-input"
                type={showNewPassword ? 'text' : 'password'}
                value={formData.newPassword}
                onChange={(e) => setFormData(prev => ({ ...prev, newPassword: e.target.value }))}
                placeholder="6 أحرف على الأقل"
                className="pr-10 pl-10 font-plex"
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="font-plex">تأكيد كلمة المرور الجديدة</Label>
            <div className="relative">
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <Input
                data-testid="confirm-new-password-input"
                type={showNewPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                placeholder="أعد إدخال كلمة المرور الجديدة"
                className="pr-10 font-plex"
                dir="ltr"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary/90"
            data-testid="change-password-submit-btn"
          >
            {loading ? (
              <>
                <div className="spinner border-2 border-white border-t-transparent rounded-full w-4 h-4 ml-2"></div>
                جاري الحفظ...
              </>
            ) : (
              <>
                <CheckCircle className="ml-2" size={18} />
                {hasExistingPassword ? 'تغيير كلمة المرور' : 'تعيين كلمة المرور'}
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default ChangePasswordForm;
