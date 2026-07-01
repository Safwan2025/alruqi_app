import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { LogIn, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';
import ForgotPasswordDialog from '@/components/ForgotPasswordDialog';

const LoginPage = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [mode, setMode] = useState('login'); // 'login' or 'signup'
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    confirmPassword: ''
  });
  
  const [errors, setErrors] = useState({});

  const validateForm = () => {
    const newErrors = {};
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email) {
      newErrors.email = 'البريد الإلكتروني مطلوب';
    } else if (!emailRegex.test(formData.email)) {
      newErrors.email = 'البريد الإلكتروني غير صحيح';
    }
    
    // Password validation
    if (!formData.password) {
      newErrors.password = 'كلمة المرور مطلوبة';
    } else if (formData.password.length < 6) {
      newErrors.password = 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
    }
    
    // Signup validations
    if (mode === 'signup') {
      if (!formData.name || formData.name.trim().length < 2) {
        newErrors.name = 'الاسم يجب أن يكون حرفين على الأقل';
      }
      if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'كلمتا المرور غير متطابقتين';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsLoading(true);
    
    try {
      if (mode === 'signup') {
        // Sign up
        const response = await api.post('/auth/signup', {
          email: formData.email,
          password: formData.password,
          name: formData.name,
          remember_me: rememberMe
        });
        
        // Store session token
        localStorage.setItem('session_token', response.data.token);
        if (rememberMe) {
          localStorage.setItem('remember_me', 'true');
        }
        
        toast.success('تم إنشاء الحساب بنجاح! مرحباً بك');
        
        // Redirect based on role
        navigate('/dashboard/student');
      } else {
        // Login
        const response = await api.post('/auth/login', {
          email: formData.email,
          password: formData.password,
          remember_me: rememberMe
        });
        
        // Store session token
        localStorage.setItem('session_token', response.data.token);
        if (rememberMe) {
          localStorage.setItem('remember_me', 'true');
        }
        
        toast.success('مرحباً بك مجدداً!');
        
        // Redirect based on role
        const userRole = response.data.user.role;
        if (userRole === 'teacher') {
          navigate('/dashboard/teacher');
        } else {
          navigate('/dashboard/student');
        }
      }
    } catch (error) {
      const errorMessage = error.response?.data?.detail || 'حدث خطأ، يرجى المحاولة مرة أخرى';
      toast.error(errorMessage);
      setErrors({ submit: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    setIsGoogleLoading(true);
    const redirectUrl = window.location.origin + '/dashboard/student';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const toggleMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login');
    setErrors({});
    setFormData({ email: '', password: '', name: '', confirmPassword: '' });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-gradient-to-b from-primary/5 to-background">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 md:p-10 border-t-4 border-secondary">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <img 
              src="https://customer-assets.emergentagent.com/job_8f66b1bb-97ea-4b8f-926f-4f014db49e2a/artifacts/l01dffpm_%D9%85%D9%82%D8%B1%D8%A3%D8%A9%20%D8%A7%D9%84%D8%B1%D9%82%D9%8A.png"
              alt="مقرأة الرقي" 
              className="w-20 h-20 sm:w-24 sm:h-24 object-contain drop-shadow-lg rounded-full bg-white p-1.5"
            />
          </div>

          <h1 className="font-amiri text-3xl sm:text-4xl font-bold text-center text-primary mb-2">
            {mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}
          </h1>
          <p className="font-plex text-sm sm:text-base text-center text-muted-foreground mb-6">
            {mode === 'login' ? 'أدخل بياناتك للمتابعة' : 'انضم إلينا لتبدأ رحلتك مع القرآن'}
          </p>

          {/* Email/Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name field - only for signup */}
            {mode === 'signup' && (
              <div className="space-y-2">
                <Label className="font-plex text-sm">الاسم الكامل</Label>
                <div className="relative">
                  <User className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <Input
                    data-testid="name-input"
                    type="text"
                    placeholder="أدخل اسمك"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={`pr-10 font-plex ${errors.name ? 'border-red-500' : ''}`}
                  />
                </div>
                {errors.name && <p className="text-red-500 text-xs font-plex">{errors.name}</p>}
              </div>
            )}

            {/* Email */}
            <div className="space-y-2">
              <Label className="font-plex text-sm">البريد الإلكتروني</Label>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <Input
                  data-testid="email-input"
                  type="email"
                  placeholder="example@email.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className={`pr-10 font-plex text-left dir-ltr ${errors.email ? 'border-red-500' : ''}`}
                  dir="ltr"
                />
              </div>
              {errors.email && <p className="text-red-500 text-xs font-plex">{errors.email}</p>}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label className="font-plex text-sm">كلمة المرور</Label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <Input
                  data-testid="password-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className={`pr-10 pl-10 font-plex text-left ${errors.password ? 'border-red-500' : ''}`}
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
              {errors.password && <p className="text-red-500 text-xs font-plex">{errors.password}</p>}
            </div>

            {/* Confirm Password - only for signup */}
            {mode === 'signup' && (
              <div className="space-y-2">
                <Label className="font-plex text-sm">تأكيد كلمة المرور</Label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <Input
                    data-testid="confirm-password-input"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    className={`pr-10 font-plex text-left ${errors.confirmPassword ? 'border-red-500' : ''}`}
                    dir="ltr"
                  />
                </div>
                {errors.confirmPassword && <p className="text-red-500 text-xs font-plex">{errors.confirmPassword}</p>}
              </div>
            )}

            {/* Remember Me - only for login */}
            {mode === 'login' && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="remember-me"
                    data-testid="remember-me-checkbox"
                    checked={rememberMe}
                    onCheckedChange={setRememberMe}
                  />
                  <Label htmlFor="remember-me" className="font-plex text-sm cursor-pointer">
                    تذكرني (البقاء مسجلاً لمدة 30 يوم)
                  </Label>
                </div>
                <button
                  type="button"
                  onClick={() => setForgotPasswordOpen(true)}
                  className="font-plex text-sm text-primary hover:underline"
                >
                  نسيت كلمة المرور؟
                </button>
              </div>
            )}

            {/* Submit Error */}
            {errors.submit && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-600 text-sm font-plex text-center">{errors.submit}</p>
              </div>
            )}

            {/* Submit Button */}
            <Button
              data-testid="submit-btn"
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-5 rounded-full shadow-lg"
            >
              {isLoading ? (
                <div className="spinner border-2 border-white border-t-transparent rounded-full w-5 h-5"></div>
              ) : (
                <>
                  <LogIn className="ml-2" size={18} />
                  {mode === 'login' ? 'دخول' : 'إنشاء حساب'}
                </>
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-4 text-sm text-gray-500 font-plex">أو</span>
            </div>
          </div>

          {/* Google Login Button */}
          <Button
            data-testid="google-login-btn"
            onClick={handleGoogleLogin}
            disabled={isGoogleLoading}
            variant="outline"
            className="w-full border-2 font-bold py-5 rounded-full"
          >
            {isGoogleLoading ? (
              <div className="spinner border-2 border-primary border-t-transparent rounded-full w-5 h-5"></div>
            ) : (
              <>
                <svg className="ml-2 w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                الدخول عبر Google
              </>
            )}
          </Button>

          {/* Toggle Mode */}
          <div className="mt-6 text-center">
            <p className="font-plex text-sm text-gray-600">
              {mode === 'login' ? 'ليس لديك حساب؟' : 'لديك حساب بالفعل؟'}
              <button
                data-testid="toggle-mode-btn"
                onClick={toggleMode}
                className="mr-2 text-primary font-bold hover:underline"
              >
                {mode === 'login' ? 'إنشاء حساب جديد' : 'تسجيل الدخول'}
              </button>
            </p>
          </div>

          {/* Back to Home */}
          <div className="mt-4 text-center">
            <button
              data-testid="back-home-btn"
              onClick={() => navigate('/')}
              className="font-plex text-sm text-gray-500 hover:text-primary hover:underline"
            >
              العودة للصفحة الرئيسية
            </button>
          </div>
        </div>
      </div>

      {/* Forgot Password Dialog */}
      <ForgotPasswordDialog 
        open={forgotPasswordOpen} 
        onClose={() => setForgotPasswordOpen(false)} 
      />
    </div>
  );
};

export default LoginPage;
