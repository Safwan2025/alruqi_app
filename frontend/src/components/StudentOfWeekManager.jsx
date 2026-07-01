import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trophy, Upload, Trash2, User, Star } from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';

const StudentOfWeekManager = () => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    student_name: '',
    student_picture: '',
    order: 1
  });
  const [previewImage, setPreviewImage] = useState(null);

  useEffect(() => {
    loadStudents();
  }, []);

  const loadStudents = async () => {
    try {
      const response = await api.get('/admin/students-of-week');
      setStudents(response.data);
    } catch (error) {
      console.log('Failed to load students of week');
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('حجم الصورة يجب أن يكون أقل من 5 ميجابايت');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result;
      setFormData({ ...formData, student_picture: base64 });
      setPreviewImage(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.student_name.trim()) {
      toast.error('يرجى إدخال اسم الطالب');
      return;
    }

    if (!formData.student_picture) {
      toast.error('يرجى رفع صورة الطالب');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/admin/students-of-week', formData);
      toast.success('تم إضافة طالب الأسبوع بنجاح!');
      setFormData({ student_name: '', student_picture: '', order: 1 });
      setPreviewImage(null);
      loadStudents();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل إضافة طالب الأسبوع');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (studentId) => {
    if (!window.confirm('هل أنت متأكد من إزالة هذا الطالب؟')) return;

    try {
      await api.delete(`/admin/students-of-week/${studentId}`);
      toast.success('تم إزالة الطالب');
      loadStudents();
    } catch (error) {
      toast.error('فشل إزالة الطالب');
    }
  };

  return (
    <Card className="border-2 border-yellow-300">
      <CardHeader className="bg-gradient-to-r from-yellow-50 to-amber-50">
        <CardTitle className="font-amiri text-xl text-yellow-700 flex items-center gap-2">
          <Trophy size={24} className="text-yellow-600" />
          إدارة طلاب الأسبوع
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {/* Current Students */}
        <div className="mb-4">
          <h4 className="font-plex font-bold text-gray-700 mb-3 flex items-center gap-2">
            <Star size={18} className="text-yellow-500" />
            الطلاب الحاليون ({students.length}/2)
          </h4>
          
          {loading ? (
            <div className="text-center py-4">
              <div className="spinner border-4 border-yellow-500 border-t-transparent rounded-full w-8 h-8 mx-auto"></div>
            </div>
          ) : students.length === 0 ? (
            <div className="text-center py-4 bg-gray-50 rounded-lg">
              <p className="font-plex text-gray-500">لم يتم اختيار طلاب هذا الأسبوع بعد</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {students.map((student) => (
                <div 
                  key={student.student_id} 
                  className="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg border border-yellow-200"
                >
                  <img
                    src={student.student_picture}
                    alt={student.student_name}
                    className="w-12 h-12 rounded-full object-cover border-2 border-yellow-400"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-plex font-bold text-gray-800 truncate">{student.student_name}</p>
                    <p className="font-plex text-xs text-gray-500">طالب {student.order}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(student.student_id)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 h-auto"
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add New Student Form */}
        {students.length < 2 && (
          <form onSubmit={handleSubmit} className="space-y-4 bg-gray-50 p-4 rounded-lg border">
            <h4 className="font-plex font-bold text-gray-700 flex items-center gap-2">
              <User size={18} />
              إضافة طالب جديد
            </h4>

            {/* Student Name */}
            <div className="space-y-2">
              <Label className="font-plex text-sm">اسم الطالب</Label>
              <Input
                type="text"
                placeholder="أدخل اسم الطالب"
                value={formData.student_name}
                onChange={(e) => setFormData({ ...formData, student_name: e.target.value })}
                className="font-plex"
              />
            </div>

            {/* Student Order */}
            <div className="space-y-2">
              <Label className="font-plex text-sm">الترتيب</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={formData.order === 1 ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFormData({ ...formData, order: 1 })}
                  disabled={students.some(s => s.order === 1)}
                >
                  طالب 1
                </Button>
                <Button
                  type="button"
                  variant={formData.order === 2 ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFormData({ ...formData, order: 2 })}
                  disabled={students.some(s => s.order === 2)}
                >
                  طالب 2
                </Button>
              </div>
            </div>

            {/* Student Picture */}
            <div className="space-y-2">
              <Label className="font-plex text-sm">صورة الطالب</Label>
              <div className="flex items-center gap-4">
                {previewImage ? (
                  <img
                    src={previewImage}
                    alt="Preview"
                    className="w-16 h-16 rounded-full object-cover border-2 border-yellow-400"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center border-2 border-dashed border-gray-300">
                    <User className="text-gray-400" size={24} />
                  </div>
                )}
                <label className="flex-1">
                  <div className="flex items-center justify-center gap-2 px-4 py-2 bg-white border-2 border-dashed border-yellow-300 rounded-lg cursor-pointer hover:bg-yellow-50 transition-colors">
                    <Upload size={18} className="text-yellow-600" />
                    <span className="font-plex text-sm text-yellow-700">رفع صورة</span>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={submitting || !formData.student_name || !formData.student_picture}
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-white"
            >
              {submitting ? (
                <div className="spinner border-2 border-white border-t-transparent rounded-full w-5 h-5"></div>
              ) : (
                <>
                  <Trophy className="ml-2" size={18} />
                  إضافة طالب الأسبوع
                </>
              )}
            </Button>
          </form>
        )}

        {students.length >= 2 && (
          <div className="text-center py-4 bg-green-50 rounded-lg border border-green-200">
            <p className="font-plex text-green-700">✅ تم اختيار طالبي الأسبوع</p>
            <p className="font-plex text-xs text-green-600 mt-1">لإضافة طالب جديد، قم بإزالة أحد الطلاب الحاليين</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default StudentOfWeekManager;
