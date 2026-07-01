import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { User, LogOut, Save } from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';
import DateOfBirthManager from '@/components/DateOfBirthManager';
import ChangePasswordForm from '@/components/ChangePasswordForm';

const ProfilePage = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    bio: '',
    specialization: ''
  });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      // Use /auth/me to get needs_password_setup flag
      const response = await api.get('/auth/me');
      setUser(response.data);
      setFormData({
        name: response.data.name || '',
        bio: response.data.bio || '',
        specialization: response.data.specialization || ''
      });
    } catch (error) {
      toast.error('فشل تحميل الملف الشخصي');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
      navigate('/login');
    } catch (error) {
      toast.error('فشل تسجيل الخروج');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const response = await api.put('/users/profile', formData);
      setUser(response.data);
      toast.success('تم تحديث الملف الشخصي بنجاح');
    } catch (error) {
      toast.error('فشل تحديث الملف الشخصي');
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (newRole) => {
    try {
      const response = await api.put(`/users/role/${newRole}`);
      setUser(response.data);
      toast.success(`تم تغيير الدور إلى ${newRole === 'teacher' ? 'معلم' : 'طالب'}`);
      
      // Navigate to appropriate dashboard
      const dashboardPath = newRole === 'teacher' ? '/dashboard/teacher' : '/dashboard/student';
      navigate(dashboardPath);
    } catch (error) {
      toast.error('فشل تغيير الدور');
    }
  };

  const handlePictureUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('حجم الصورة كبير جداً (الحد الأقصى 5 ميجابايت)');
      return;
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      toast.error('يرجى اختيار صورة');
      return;
    }

    setUploadingPicture(true);

    try {
      // Convert to base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      // Upload to backend
      const response = await api.post('/users/upload-picture', {
        picture_url: base64
      });

      setUser(response.data);
      toast.success('تم تحديث الصورة بنجاح!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل رفع الصورة');
      console.error('Upload error:', error);
    } finally {
      setUploadingPicture(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner border-4 border-primary border-t-transparent rounded-full w-12 h-12"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-white border-b border-border shadow-sm">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <img 
              src="https://customer-assets.emergentagent.com/job_8f66b1bb-97ea-4b8f-926f-4f014db49e2a/artifacts/l01dffpm_%D9%85%D9%82%D8%B1%D8%A3%D8%A9%20%D8%A7%D9%84%D8%B1%D9%82%D9%8A.png"
              alt="مقرأة الرقي" 
              className="w-12 h-12 object-contain cursor-pointer rounded-full bg-white p-0.5"
              onClick={() => navigate(user?.role === 'teacher' ? '/dashboard/teacher' : '/dashboard/student')}
            />
            <h1 className="font-amiri text-2xl font-bold text-primary">مقرأة الرقي</h1>
          </div>
          <div className="flex items-center gap-4">
            <Button
              data-testid="logout-btn"
              variant="outline"
              onClick={handleLogout}
            >
              <LogOut className="ml-2" size={18} />
              تسجيل الخروج
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-10">
        <div className="max-w-2xl mx-auto">
          {/* Profile Header */}
          <div className="text-center mb-10 fade-in">
            <div className="relative w-24 h-24 mx-auto mb-4">
              {user?.picture ? (
                <img 
                  src={user.picture} 
                  alt={user.name}
                  className="w-24 h-24 rounded-full object-cover border-4 border-primary shadow-lg"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-primary flex items-center justify-center">
                  <User className="w-12 h-12 text-white" />
                </div>
              )}
              
              {/* Upload button */}
              <label 
                htmlFor="picture-upload"
                className="absolute bottom-0 right-0 bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-full p-2 cursor-pointer shadow-lg transition-transform hover:scale-110"
                data-testid="upload-picture-btn"
              >
                <input
                  id="picture-upload"
                  type="file"
                  accept="image/*"
                  onChange={handlePictureUpload}
                  className="hidden"
                  disabled={uploadingPicture}
                />
                {uploadingPicture ? (
                  <div className="spinner border-2 border-white border-t-transparent rounded-full w-4 h-4"></div>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                )}
              </label>
            </div>
            
            <h2 className="font-amiri text-4xl font-bold text-primary mb-2">الملف الشخصي</h2>
            <p className="font-plex text-muted-foreground">{user?.email}</p>
          </div>

          {/* Profile Form */}
          <Card className="fade-in" data-testid="profile-form-card">
            <CardHeader>
              <CardTitle className="font-amiri text-2xl text-primary">معلومات شخصية</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name" className="font-plex">الاسم</Label>
                  <Input
                    id="name"
                    data-testid="name-input"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="font-plex"
                  />
                </div>

                {user?.role === 'teacher' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="specialization" className="font-plex">التخصص</Label>
                      <Input
                        id="specialization"
                        data-testid="specialization-input"
                        value={formData.specialization}
                        onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                        placeholder="مثل: تحفيظ القرآن الكريم"
                        className="font-plex"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="bio" className="font-plex">نبذة عنك</Label>
                      <Textarea
                        id="bio"
                        data-testid="bio-textarea"
                        value={formData.bio}
                        onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                        placeholder="اكتب نبذة قصيرة عن خبرتك ومؤهلاتك"
                        rows={4}
                        className="font-plex"
                      />
                    </div>
                  </>
                )}

                <Button
                  data-testid="save-profile-btn"
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-full py-6"
                >
                  {saving ? (
                    <div className="spinner border-2 border-white border-t-transparent rounded-full w-5 h-5"></div>
                  ) : (
                    <>
                      <Save className="ml-2" size={18} />
                      حفظ التغييرات
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Date of Birth Manager */}
          <div className="mt-6">
            <DateOfBirthManager />
          </div>

          {/* Change Password Form */}
          <div className="mt-6">
            <ChangePasswordForm hasExistingPassword={!user?.needs_password_setup} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
