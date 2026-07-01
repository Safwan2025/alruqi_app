import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  Link2, Edit2, Save, RefreshCw, User, CheckCircle, 
  ExternalLink, GraduationCap
} from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';

const TeacherLinkManager = () => {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editDialog, setEditDialog] = useState({ open: false, teacher: null });
  const [newLink, setNewLink] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTeachers();
  }, []);

  const loadTeachers = async () => {
    setLoading(true);
    try {
      const response = await api.get('/admin/teacher-links');
      setTeachers(response.data);
    } catch (error) {
      toast.error('فشل تحميل بيانات المعلمين');
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (teacher) => {
    setEditDialog({ open: true, teacher });
    setNewLink(teacher.recitation_link || '');
  };

  const handleSaveLink = async () => {
    if (!editDialog.teacher) return;

    setSaving(true);
    try {
      await api.put('/admin/teacher-link', {
        teacher_id: editDialog.teacher.user_id,
        recitation_link: newLink.trim()
      });

      toast.success('تم تحديث الرابط بنجاح');
      loadTeachers();
      setEditDialog({ open: false, teacher: null });
      setNewLink('');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل تحديث الرابط');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-2 border-purple-200" data-testid="teacher-link-manager">
      <CardHeader className="bg-purple-50">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="font-amiri text-xl text-purple-700 flex items-center gap-2">
            <Link2 size={24} />
            إدارة روابط التسميع
          </CardTitle>
          <Button variant="outline" size="sm" onClick={loadTeachers} disabled={loading}>
            <RefreshCw className={`ml-1 ${loading ? 'animate-spin' : ''}`} size={16} />
            تحديث
          </Button>
        </div>
        <p className="font-plex text-sm text-purple-600 mt-2">
          قم بتعيين رابط Google Meet أو Zoom خاص لكل معلم
        </p>
      </CardHeader>

      <CardContent className="p-4">
        {loading ? (
          <div className="text-center py-8">
            <div className="spinner border-4 border-purple-500 border-t-transparent rounded-full w-8 h-8 mx-auto"></div>
          </div>
        ) : teachers.length === 0 ? (
          <p className="text-center py-8 font-plex text-gray-500">لا يوجد معلمون</p>
        ) : (
          <div className="space-y-3">
            {teachers.map(teacher => (
              <div 
                key={teacher.user_id}
                className="flex items-center gap-4 p-4 bg-white border rounded-lg hover:shadow-md transition-shadow"
                data-testid={`teacher-link-row-${teacher.user_id}`}
              >
                {/* Avatar */}
                {teacher.picture ? (
                  <img src={teacher.picture} alt={teacher.name} className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                    <GraduationCap size={24} className="text-purple-500" />
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-amiri font-bold text-gray-800">{teacher.name}</h4>
                  <p className="font-plex text-xs text-gray-500 truncate">{teacher.email}</p>
                  
                  {/* Current Link */}
                  {teacher.recitation_link ? (
                    <div className="flex items-center gap-2 mt-1">
                      <Link2 size={14} className="text-green-500" />
                      <a 
                        href={teacher.recitation_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-plex text-xs text-blue-600 hover:underline truncate max-w-[200px]"
                      >
                        {teacher.recitation_link}
                      </a>
                      <ExternalLink size={12} className="text-gray-400" />
                    </div>
                  ) : (
                    <p className="font-plex text-xs text-amber-600 mt-1">لم يتم تعيين رابط بعد</p>
                  )}
                </div>

                {/* Edit Button */}
                <Button
                  onClick={() => openEditDialog(teacher)}
                  variant="outline"
                  className="border-purple-300 text-purple-600 hover:bg-purple-50"
                  data-testid={`edit-link-btn-${teacher.user_id}`}
                >
                  <Edit2 className="ml-2" size={16} />
                  {teacher.recitation_link ? 'تعديل' : 'إضافة رابط'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Edit Dialog */}
      <Dialog open={editDialog.open} onOpenChange={(open) => !open && setEditDialog({ open: false, teacher: null })}>
        <DialogContent className="max-w-lg" data-testid="edit-link-dialog">
          <DialogHeader>
            <DialogTitle className="font-amiri text-xl flex items-center gap-2">
              <Link2 className="text-purple-500" size={24} />
              تعديل رابط التسميع
            </DialogTitle>
          </DialogHeader>

          {editDialog.teacher && (
            <div className="py-4 space-y-4">
              {/* Teacher Info */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                {editDialog.teacher.picture ? (
                  <img src={editDialog.teacher.picture} alt="" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                    <User size={20} className="text-purple-500" />
                  </div>
                )}
                <div>
                  <h4 className="font-amiri font-bold">{editDialog.teacher.name}</h4>
                  <p className="font-plex text-xs text-gray-500">{editDialog.teacher.email}</p>
                </div>
              </div>

              {/* Link Input */}
              <div>
                <Label className="font-plex font-bold mb-2 block">رابط التسميع (Google Meet / Zoom)</Label>
                <Input
                  value={newLink}
                  onChange={(e) => setNewLink(e.target.value)}
                  placeholder="https://meet.google.com/xxx-xxxx-xxx"
                  className="font-plex"
                  dir="ltr"
                  data-testid="link-input"
                />
                <p className="font-plex text-xs text-gray-500 mt-1">
                  أدخل رابط Google Meet أو Zoom الخاص بهذا المعلم
                </p>
              </div>

              {/* Preview */}
              {newLink && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="font-plex text-sm text-blue-700 mb-1">معاينة الرابط:</p>
                  <a 
                    href={newLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-plex text-sm text-blue-600 hover:underline break-all"
                  >
                    {newLink}
                  </a>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={handleSaveLink}
              disabled={saving}
              className="bg-purple-600 hover:bg-purple-700"
              data-testid="save-link-btn"
            >
              {saving ? (
                <>
                  <div className="spinner border-2 border-white border-t-transparent rounded-full w-4 h-4 ml-2"></div>
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <Save className="ml-2" size={18} />
                  حفظ الرابط
                </>
              )}
            </Button>
            <Button variant="outline" onClick={() => setEditDialog({ open: false, teacher: null })}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default TeacherLinkManager;
