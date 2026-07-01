import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  FileText, Plus, Calendar, User, BookOpen, Star, 
  Filter, ChevronDown, ChevronUp, Clock, Award
} from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';

// Note type labels
const NOTE_TYPES = {
  general: { label: 'ملاحظة عامة', color: 'bg-gray-100 text-gray-700' },
  recitation: { label: 'تسميع', color: 'bg-green-100 text-green-700' },
  behavior: { label: 'سلوك', color: 'bg-blue-100 text-blue-700' },
  progress: { label: 'تقدم', color: 'bg-purple-100 text-purple-700' }
};

// Rating colors
const RATING_COLORS = {
  'ممتاز': 'bg-green-500',
  'متوسط': 'bg-blue-500',
  'مقبول': 'bg-yellow-500',
  'ضعيف': 'bg-red-500'
};

// Single Note Card
const NoteCard = ({ note }) => {
  const [expanded, setExpanded] = useState(false);
  const typeInfo = NOTE_TYPES[note.note_type] || NOTE_TYPES.general;
  
  return (
    <div className="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          {/* Header */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className={`px-2 py-0.5 rounded-full text-xs font-plex ${typeInfo.color}`}>
              {typeInfo.label}
            </span>
            {note.rating && (
              <span className={`px-2 py-0.5 rounded-full text-xs text-white ${RATING_COLORS[note.rating]}`}>
                {note.rating}
              </span>
            )}
            {note.surah_name && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">
                {note.surah_name} {note.ayah_from && `(${note.ayah_from}-${note.ayah_to || note.ayah_from})`}
              </span>
            )}
          </div>
          
          {/* Title */}
          <h4 className="font-amiri text-lg font-bold text-primary mb-1">
            {note.title}
          </h4>
          
          {/* Content Preview */}
          <p className={`font-plex text-gray-600 text-sm ${expanded ? '' : 'line-clamp-2'}`}>
            {note.content}
          </p>
          
          {note.content.length > 150 && (
            <button 
              onClick={() => setExpanded(!expanded)}
              className="text-primary text-sm font-plex mt-1 flex items-center gap-1"
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {expanded ? 'عرض أقل' : 'عرض المزيد'}
            </button>
          )}
          
          {/* Meta info */}
          <div className="flex items-center gap-4 mt-3 text-xs text-gray-400 font-plex">
            <span className="flex items-center gap-1">
              <User size={12} />
              {note.teacher_name}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {new Date(note.created_at).toLocaleDateString('ar-SA', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Add Note Dialog (for teachers)
const AddNoteDialog = ({ open, onClose, studentId, studentName, onNoteAdded }) => {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    note_type: 'general',
    title: '',
    content: '',
    surah_name: '',
    ayah_from: '',
    ayah_to: '',
    rating: ''
  });

  const handleSubmit = async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      toast.error('يرجى إدخال العنوان والملاحظة');
      return;
    }

    setSaving(true);
    try {
      await api.post(`/students/${studentId}/notes`, {
        student_id: studentId,
        ...formData,
        ayah_from: formData.ayah_from ? parseInt(formData.ayah_from) : null,
        ayah_to: formData.ayah_to ? parseInt(formData.ayah_to) : null
      });
      
      toast.success('تم حفظ الملاحظة في الأرشيف الدائم');
      onNoteAdded();
      onClose();
      setFormData({
        note_type: 'general',
        title: '',
        content: '',
        surah_name: '',
        ayah_from: '',
        ayah_to: '',
        rating: ''
      });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل حفظ الملاحظة');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-amiri text-2xl flex items-center gap-2">
            <FileText className="text-primary" />
            إضافة ملاحظة للطالب {studentName}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Note Type */}
          <div>
            <Label className="font-plex">نوع الملاحظة</Label>
            <Select 
              value={formData.note_type} 
              onValueChange={(v) => setFormData(prev => ({ ...prev, note_type: v }))}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">ملاحظة عامة</SelectItem>
                <SelectItem value="recitation">تسميع</SelectItem>
                <SelectItem value="behavior">سلوك</SelectItem>
                <SelectItem value="progress">تقدم</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Title */}
          <div>
            <Label className="font-plex">العنوان *</Label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="عنوان الملاحظة..."
              className="mt-1"
            />
          </div>
          
          {/* Content */}
          <div>
            <Label className="font-plex">الملاحظة *</Label>
            <Textarea
              value={formData.content}
              onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
              placeholder="اكتب ملاحظتك هنا..."
              rows={4}
              className="mt-1"
            />
          </div>
          
          {/* Quran Reference (for recitation type) */}
          {formData.note_type === 'recitation' && (
            <div className="bg-green-50 p-3 rounded-lg space-y-3">
              <Label className="font-plex text-green-700">معلومات التسميع</Label>
              
              <Input
                value={formData.surah_name}
                onChange={(e) => setFormData(prev => ({ ...prev, surah_name: e.target.value }))}
                placeholder="اسم السورة"
              />
              
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  value={formData.ayah_from}
                  onChange={(e) => setFormData(prev => ({ ...prev, ayah_from: e.target.value }))}
                  placeholder="من آية"
                />
                <Input
                  type="number"
                  value={formData.ayah_to}
                  onChange={(e) => setFormData(prev => ({ ...prev, ayah_to: e.target.value }))}
                  placeholder="إلى آية"
                />
              </div>
              
              <Select 
                value={formData.rating} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, rating: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="التقييم" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ممتاز">ممتاز</SelectItem>
                  <SelectItem value="متوسط">متوسط</SelectItem>
                  <SelectItem value="مقبول">مقبول</SelectItem>
                  <SelectItem value="ضعيف">ضعيف</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          
          <div className="bg-amber-50 p-3 rounded-lg">
            <p className="font-plex text-sm text-amber-700">
              ⚠️ الملاحظات المحفوظة دائمة ولا يمكن تعديلها أو حذفها
            </p>
          </div>
        </div>
        
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? (
              <>
                <div className="spinner border-2 border-white border-t-transparent rounded-full w-4 h-4 ml-2"></div>
                جاري الحفظ...
              </>
            ) : (
              <>
                <FileText className="ml-2" size={18} />
                حفظ في الأرشيف
              </>
            )}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Main Component
const StudentNotesArchive = ({ studentId, studentName, isTeacher = false, isAdmin = false }) => {
  const [notes, setNotes] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [notesByMonth, setNotesByMonth] = useState({});

  useEffect(() => {
    if (studentId) {
      loadNotes();
    }
  }, [studentId, filterType, selectedMonth]);

  const loadNotes = async () => {
    setLoading(true);
    try {
      let url = `/students/${studentId}/notes`;
      const params = new URLSearchParams();
      
      if (filterType !== 'all') {
        params.append('note_type', filterType);
      }
      if (selectedMonth) {
        const [year, month] = selectedMonth.split('-');
        params.append('year', year);
        params.append('month', month);
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const response = await api.get(url);
      setNotes(response.data.notes || []);
      setStats(response.data.stats || {});
      setNotesByMonth(response.data.notes_by_month || {});
    } catch (error) {
      console.error('Failed to load notes');
    } finally {
      setLoading(false);
    }
  };

  // Get available months from notes
  const availableMonths = Object.keys(notesByMonth).sort().reverse();

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="bg-gradient-to-l from-primary/5 to-secondary/5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="font-amiri text-xl text-primary flex items-center gap-2">
            <FileText size={24} />
            أرشيف الملاحظات {studentName && `- ${studentName}`}
          </CardTitle>
          
          {isTeacher && (
            <Button onClick={() => setAddDialogOpen(true)} size="sm">
              <Plus className="ml-1" size={16} />
              إضافة ملاحظة
            </Button>
          )}
        </div>
        
        {/* Stats Summary */}
        {stats && stats.total_notes > 0 && (
          <div className="flex items-center gap-4 mt-4 flex-wrap">
            <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-full text-sm">
              <FileText size={14} className="text-primary" />
              <span className="font-plex">{stats.total_notes} ملاحظة</span>
            </div>
            {stats.by_rating && Object.entries(stats.by_rating).map(([rating, count]) => (
              <div 
                key={rating}
                className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm text-white ${RATING_COLORS[rating]}`}
              >
                <Star size={12} />
                <span className="font-plex">{rating}: {count}</span>
              </div>
            ))}
          </div>
        )}
      </CardHeader>
      
      <CardContent className="p-4">
        {/* Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-400" />
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="كل الأنواع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأنواع</SelectItem>
                <SelectItem value="general">ملاحظة عامة</SelectItem>
                <SelectItem value="recitation">تسميع</SelectItem>
                <SelectItem value="behavior">سلوك</SelectItem>
                <SelectItem value="progress">تقدم</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {availableMonths.length > 0 && (
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-gray-400" />
              <Select value={selectedMonth || "all"} onValueChange={(v) => setSelectedMonth(v === "all" ? "" : v)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="كل الأشهر" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأشهر</SelectItem>
                  {availableMonths.map(month => (
                    <SelectItem key={month} value={month}>
                      {new Date(month + '-01').toLocaleDateString('ar-SA', { year: 'numeric', month: 'long' })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        
        {/* Notes List */}
        {loading ? (
          <div className="text-center py-8">
            <div className="spinner border-4 border-primary border-t-transparent rounded-full w-8 h-8 mx-auto"></div>
          </div>
        ) : notes.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <FileText className="mx-auto text-gray-300 mb-3" size={48} />
            <p className="font-plex text-gray-500">لا توجد ملاحظات</p>
            {isTeacher && (
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => setAddDialogOpen(true)}
              >
                <Plus className="ml-1" size={16} />
                أضف أول ملاحظة
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {notes.map(note => (
              <NoteCard key={note.note_id} note={note} />
            ))}
          </div>
        )}
      </CardContent>
      
      {/* Add Note Dialog */}
      <AddNoteDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        studentId={studentId}
        studentName={studentName}
        onNoteAdded={loadNotes}
      />
    </Card>
  );
};

export default StudentNotesArchive;
