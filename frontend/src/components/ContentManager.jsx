import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FileText, Image, Plus, Edit, Trash2, Star, Eye, EyeOff, GripVertical } from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';

const ContentManager = () => {
  const [contents, setContents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContent, setEditingContent] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const fileInputRef = useRef(null);
  
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    image_url: '',
    order: 0,
    is_featured: false
  });

  useEffect(() => {
    loadContents();
  }, []);

  const loadContents = async () => {
    try {
      const response = await api.get('/admin/content');
      setContents(response.data);
    } catch (error) {
      console.error('Failed to load content');
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('حجم الصورة يجب أن يكون أقل من 5 ميجابايت');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData(prev => ({ ...prev, image_url: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      toast.error('يرجى إدخال العنوان والمحتوى');
      return;
    }

    setSaving(true);
    try {
      if (editingContent) {
        await api.put(`/admin/content/${editingContent.content_id}`, formData);
        toast.success('تم تحديث المحتوى بنجاح');
      } else {
        await api.post('/admin/content', formData);
        toast.success('تم إضافة المحتوى بنجاح');
      }
      setDialogOpen(false);
      resetForm();
      loadContents();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل حفظ المحتوى');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (content) => {
    setEditingContent(content);
    setFormData({
      title: content.title,
      content: content.content,
      image_url: content.image_url || '',
      order: content.order,
      is_featured: content.is_featured
    });
    setDialogOpen(true);
  };

  const handleDelete = async (contentId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا المحتوى؟')) return;
    
    setDeletingId(contentId);
    try {
      await api.delete(`/admin/content/${contentId}`);
      toast.success('تم حذف المحتوى');
      setContents(prev => prev.filter(c => c.content_id !== contentId));
    } catch (error) {
      toast.error('فشل حذف المحتوى');
    } finally {
      setDeletingId(null);
    }
  };

  const toggleActive = async (content) => {
    try {
      await api.put(`/admin/content/${content.content_id}`, { active: !content.active });
      setContents(prev => prev.map(c => 
        c.content_id === content.content_id ? { ...c, active: !c.active } : c
      ));
      toast.success(content.active ? 'تم إخفاء المحتوى' : 'تم إظهار المحتوى');
    } catch (error) {
      toast.error('فشل تحديث الحالة');
    }
  };

  const toggleFeatured = async (content) => {
    try {
      await api.put(`/admin/content/${content.content_id}`, { is_featured: !content.is_featured });
      setContents(prev => prev.map(c => 
        c.content_id === content.content_id ? { ...c, is_featured: !c.is_featured } : c
      ));
      toast.success(content.is_featured ? 'تم إلغاء التمييز' : 'تم تمييز المحتوى');
    } catch (error) {
      toast.error('فشل تحديث الحالة');
    }
  };

  const resetForm = () => {
    setEditingContent(null);
    setFormData({
      title: '',
      content: '',
      image_url: '',
      order: 0,
      is_featured: false
    });
  };

  const openNewDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  return (
    <Card className="border-2 border-emerald-200">
      <CardHeader className="bg-emerald-50">
        <div className="flex items-center justify-between">
          <CardTitle className="font-amiri text-xl text-emerald-700 flex items-center gap-2">
            <FileText size={24} />
            إدارة المحتوى
          </CardTitle>
          <Button onClick={openNewDialog} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="ml-2" size={18} />
            إضافة محتوى جديد
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {loading ? (
          <div className="text-center py-8">
            <div className="spinner border-4 border-emerald-500 border-t-transparent rounded-full w-8 h-8 mx-auto"></div>
            <p className="font-plex text-gray-500 mt-2">جاري التحميل...</p>
          </div>
        ) : contents.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <FileText className="mx-auto text-gray-400 mb-3" size={48} />
            <p className="font-plex text-gray-500">لا يوجد محتوى بعد</p>
            <p className="font-plex text-sm text-gray-400 mt-1">اضغط على "إضافة محتوى جديد" للبدء</p>
          </div>
        ) : (
          <div className="space-y-3">
            {contents.map((content, index) => (
              <div 
                key={content.content_id}
                className={`flex items-start gap-4 p-4 rounded-lg border-2 transition-all ${
                  content.active 
                    ? content.is_featured 
                      ? 'bg-amber-50 border-amber-300' 
                      : 'bg-white border-gray-200'
                    : 'bg-gray-100 border-gray-200 opacity-60'
                }`}
              >
                {/* Image Preview — thumbnail (cover is fine here for compact admin list) */}
                {content.image_url && (
                  <div className="w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden border bg-amber-50">
                    <img 
                      src={content.image_url} 
                      alt={content.title}
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}
                
                {/* Content Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {content.is_featured && (
                      <Star className="text-amber-500 fill-amber-500" size={16} />
                    )}
                    <h4 className="font-amiri text-lg font-bold text-gray-800 truncate">
                      {content.title}
                    </h4>
                    {!content.active && (
                      <span className="text-xs bg-gray-400 text-white px-2 py-0.5 rounded">مخفي</span>
                    )}
                  </div>
                  <p className="font-plex text-sm text-gray-600 line-clamp-2">
                    {content.content}
                  </p>
                  <p className="font-plex text-xs text-gray-400 mt-2">
                    الترتيب: {content.order} | 
                    تم الإنشاء: {new Date(content.created_at).toLocaleDateString('ar-SA')}
                  </p>
                </div>
                
                {/* Actions */}
                <div className="flex flex-col gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleFeatured(content)}
                    className={`p-2 h-auto ${content.is_featured ? 'text-amber-500' : 'text-gray-400'}`}
                    title={content.is_featured ? 'إلغاء التمييز' : 'تمييز'}
                  >
                    <Star size={16} className={content.is_featured ? 'fill-amber-500' : ''} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleActive(content)}
                    className={`p-2 h-auto ${content.active ? 'text-green-500' : 'text-gray-400'}`}
                    title={content.active ? 'إخفاء' : 'إظهار'}
                  >
                    {content.active ? <Eye size={16} /> : <EyeOff size={16} />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(content)}
                    className="p-2 h-auto text-blue-500 hover:text-blue-700"
                    title="تعديل"
                  >
                    <Edit size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(content.content_id)}
                    disabled={deletingId === content.content_id}
                    className="p-2 h-auto text-red-500 hover:text-red-700"
                    title="حذف"
                  >
                    {deletingId === content.content_id ? (
                      <div className="spinner border-2 border-red-500 border-t-transparent rounded-full w-4 h-4"></div>
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); resetForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-amiri text-2xl">
              {editingContent ? 'تعديل المحتوى' : 'إضافة محتوى جديد'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label className="font-plex font-bold">العنوان *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="أدخل عنوان المحتوى..."
                className="font-plex mt-1"
              />
            </div>
            
            <div>
              <Label className="font-plex font-bold">المحتوى *</Label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                placeholder="أدخل نص المحتوى..."
                rows={6}
                className="font-plex mt-1"
              />
            </div>
            
            <div>
              <Label className="font-plex font-bold">الصورة (اختياري)</Label>
              <div className="mt-2 space-y-3">
                {formData.image_url && (
                  <div className="relative w-full max-w-md">
                    <div className="w-full bg-gradient-to-br from-amber-50 to-amber-100/30 rounded-lg border flex items-center justify-center" style={{ aspectRatio: '16 / 10' }}>
                      <img 
                        src={formData.image_url} 
                        alt="Preview"
                        className="w-full h-full object-contain rounded-lg"
                      />
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setFormData(prev => ({ ...prev, image_url: '' }))}
                      className="absolute top-2 left-2"
                    >
                      <Trash2 size={14} />
                    </Button>
                    <p className="font-plex text-[11px] text-muted-foreground mt-1.5 text-right">
                      الصورة تُعرض بالكامل دون قصّ — يتم ضبطها تلقائياً لتناسب البطاقة.
                    </p>
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Image className="ml-2" size={18} />
                    رفع صورة
                  </Button>
                </div>
                <p className="font-plex text-xs text-gray-500">
                  الحد الأقصى: 5 ميجابايت | الصيغ المدعومة: JPG, PNG, WebP
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="font-plex font-bold">الترتيب</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.order}
                  onChange={(e) => setFormData(prev => ({ ...prev, order: parseInt(e.target.value) || 0 }))}
                  className="font-plex mt-1"
                />
                <p className="font-plex text-xs text-gray-500 mt-1">الأصغر يظهر أولاً</p>
              </div>
              
              <div className="flex items-center gap-3 pt-6">
                <Switch
                  checked={formData.is_featured}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_featured: checked }))}
                />
                <Label className="font-plex">محتوى مميز</Label>
              </div>
            </div>
          </div>
          
          <DialogFooter className="mt-6">
            <Button onClick={handleSubmit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? (
                <>
                  <div className="spinner border-2 border-white border-t-transparent rounded-full w-4 h-4 ml-2"></div>
                  جاري الحفظ...
                </>
              ) : (
                editingContent ? 'تحديث' : 'إضافة'
              )}
            </Button>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default ContentManager;
