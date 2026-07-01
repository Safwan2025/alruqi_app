import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Megaphone, Trash2, Plus, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';

const AnnouncementsManager = () => {
  const [announcements, setAnnouncements] = useState([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState('normal');
  const [loading, setLoading] = useState(false);

  const loadAnnouncements = async () => {
    try {
      const response = await api.get('/announcements');
      setAnnouncements(response.data);
    } catch (error) {
      console.error('Failed to load announcements');
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const createAnnouncement = async () => {
    if (!title || !content) {
      toast.error('يرجى ملء جميع الحقول');
      return;
    }

    setLoading(true);
    try {
      await api.post('/admin/announcements', {
        title,
        content,
        priority
      });
      toast.success('تم نشر الإعلان بنجاح');
      setTitle('');
      setContent('');
      setPriority('normal');
      loadAnnouncements();
    } catch (error) {
      toast.error('فشل في نشر الإعلان');
    } finally {
      setLoading(false);
    }
  };

  const deleteAnnouncement = async (announcementId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الإعلان؟')) return;

    try {
      await api.delete(`/admin/announcements/${announcementId}`);
      toast.success('تم حذف الإعلان');
      loadAnnouncements();
    } catch (error) {
      toast.error('فشل في حذف الإعلان');
    }
  };

  const getPriorityIcon = (p) => {
    switch (p) {
      case 'urgent': return <AlertCircle className="text-red-500" size={20} />;
      case 'important': return <AlertTriangle className="text-orange-500" size={20} />;
      default: return <Info className="text-blue-500" size={20} />;
    }
  };

  const getPriorityBg = (p) => {
    switch (p) {
      case 'urgent': return 'bg-red-50 border-red-200';
      case 'important': return 'bg-orange-50 border-orange-200';
      default: return 'bg-blue-50 border-blue-200';
    }
  };

  return (
    <Card className="border-2 border-purple-200">
      <CardHeader className="bg-purple-50">
        <CardTitle className="font-amiri text-xl text-purple-700 flex items-center gap-2">
          <Megaphone size={24} />
          الإعلانات العامة
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {/* Create new announcement */}
        <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-plex font-bold text-gray-700">إنشاء إعلان جديد</h4>
          <div>
            <Label className="font-plex text-sm">عنوان الإعلان</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: إعلان هام"
              className="font-plex"
            />
          </div>
          <div>
            <Label className="font-plex text-sm">محتوى الإعلان</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="اكتب نص الإعلان هنا..."
              rows={3}
              className="font-plex"
            />
          </div>
          <div>
            <Label className="font-plex text-sm">الأولوية</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">عادي</SelectItem>
                <SelectItem value="important">مهم</SelectItem>
                <SelectItem value="urgent">عاجل</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={createAnnouncement}
            disabled={loading || !title || !content}
            className="w-full bg-purple-600 hover:bg-purple-700"
          >
            <Plus size={18} className="ml-1" />
            نشر الإعلان
          </Button>
        </div>

        {/* List of announcements */}
        {announcements.length > 0 && (
          <div className="space-y-3 mt-4">
            <p className="font-plex font-bold text-gray-700">الإعلانات النشطة:</p>
            {announcements.map((ann) => (
              <div
                key={ann.announcement_id}
                className={`p-4 rounded-lg border ${getPriorityBg(ann.priority)}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {getPriorityIcon(ann.priority)}
                    <div>
                      <p className="font-amiri font-bold text-lg">{ann.title}</p>
                      <p className="font-plex text-sm text-gray-700 mt-1">{ann.content}</p>
                      <p className="font-plex text-xs text-gray-500 mt-2">
                        بواسطة: {ann.created_by_name} | 
                        {new Date(ann.created_at).toLocaleString('en-US', {
                          dateStyle: 'short',
                          timeStyle: 'short'
                        })}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteAnnouncement(ann.announcement_id)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 size={18} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {announcements.length === 0 && (
          <p className="font-plex text-gray-500 text-center py-4">
            لا توجد إعلانات نشطة
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default AnnouncementsManager;
