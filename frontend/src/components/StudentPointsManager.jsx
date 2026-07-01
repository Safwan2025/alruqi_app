import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { 
  Award, Plus, Minus, Search, User, Calendar, 
  BookOpen, TrendingUp, History, RefreshCw 
} from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';

const POINT_TYPES = {
  booking: { label: 'نقاط الحجز', color: 'bg-purple-500', icon: Calendar },
  attendance: { label: 'نقاط الحضور', color: 'bg-blue-500', icon: TrendingUp },
  recitation: { label: 'نقاط التسميع', color: 'bg-green-500', icon: BookOpen }
};

const StudentPointsManager = () => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [adjustDialog, setAdjustDialog] = useState({ open: false, type: 'add' });
  const [historyDialog, setHistoryDialog] = useState({ open: false, studentId: null });
  const [pointsHistory, setPointsHistory] = useState([]);
  const [adjusting, setAdjusting] = useState(false);

  const [adjustment, setAdjustment] = useState({
    point_type: 'attendance',
    amount: '',
    reason: ''
  });

  useEffect(() => {
    loadStudents();
  }, []);

  const loadStudents = async () => {
    setLoading(true);
    try {
      const response = await api.get('/teacher/students-points');
      setStudents(response.data);
    } catch (error) {
      toast.error('فشل تحميل بيانات الطلاب');
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (studentId) => {
    try {
      const response = await api.get(`/students/${studentId}/points`);
      setPointsHistory(response.data.history || []);
    } catch (error) {
      toast.error('فشل تحميل سجل النقاط');
    }
  };

  const handleAdjustPoints = async () => {
    if (!selectedStudent) return;
    
    // Validate amount
    const numAmount = parseInt(adjustment.amount, 10);
    if (isNaN(numAmount) || numAmount < 1) {
      toast.error('يرجى إدخال عدد نقاط صحيح (1 أو أكثر)');
      return;
    }

    const finalAmount = adjustDialog.type === 'add' 
      ? Math.abs(numAmount) 
      : -Math.abs(numAmount);

    setAdjusting(true);
    try {
      await api.post('/teacher/adjust-points', {
        student_id: selectedStudent.user_id,
        point_type: adjustment.point_type,
        amount: finalAmount,
        reason: adjustment.reason || (adjustDialog.type === 'add' ? 'إضافة نقاط' : 'خصم نقاط')
      });

      toast.success(adjustDialog.type === 'add' ? 'تمت إضافة النقاط' : 'تم خصم النقاط');
      loadStudents();
      setAdjustDialog({ open: false, type: 'add' });
      setAdjustment({ point_type: 'attendance', amount: '', reason: '' });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل تعديل النقاط');
    } finally {
      setAdjusting(false);
    }
  };

  const openAdjustDialog = (student, type) => {
    setSelectedStudent(student);
    setAdjustDialog({ open: true, type });
    setAdjustment({ point_type: 'attendance', amount: '', reason: '' });
  };

  const openHistoryDialog = async (student) => {
    setSelectedStudent(student);
    setHistoryDialog({ open: true, studentId: student.user_id });
    await loadHistory(student.user_id);
  };

  const filteredStudents = students.filter(s => 
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Card className="border-2 border-amber-200">
      <CardHeader className="bg-amber-50">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="font-amiri text-xl text-amber-700 flex items-center gap-2">
            <Award size={24} />
            إدارة نقاط الطلاب
          </CardTitle>
          <Button variant="outline" size="sm" onClick={loadStudents} disabled={loading}>
            <RefreshCw className={`ml-1 ${loading ? 'animate-spin' : ''}`} size={16} />
            تحديث
          </Button>
        </div>
        
        {/* Search */}
        <div className="relative mt-4">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث عن طالب..."
            className="pr-10 font-plex"
          />
        </div>
      </CardHeader>

      <CardContent className="p-4">
        {loading ? (
          <div className="text-center py-8">
            <div className="spinner border-4 border-amber-500 border-t-transparent rounded-full w-8 h-8 mx-auto"></div>
          </div>
        ) : filteredStudents.length === 0 ? (
          <p className="text-center py-8 font-plex text-gray-500">لا يوجد طلاب</p>
        ) : (
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {filteredStudents.map(student => (
              <div 
                key={student.user_id}
                className="flex items-center gap-4 p-4 bg-white border rounded-lg hover:shadow-md transition-shadow"
              >
                {/* Avatar */}
                {student.picture_url ? (
                  <img src={student.picture_url} alt={student.name} className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                    <User size={24} className="text-gray-400" />
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-amiri font-bold text-gray-800 truncate">{student.name}</h4>
                  <p className="font-plex text-xs text-gray-500 truncate">{student.email}</p>
                </div>

                {/* Points Display */}
                <div className="flex items-center gap-2">
                  <div className="text-center px-2">
                    <p className="font-amiri text-lg font-bold text-purple-600">{student.points.booking}</p>
                    <p className="font-plex text-xs text-gray-400">حجز</p>
                  </div>
                  <div className="text-center px-2">
                    <p className="font-amiri text-lg font-bold text-blue-600">{student.points.attendance}</p>
                    <p className="font-plex text-xs text-gray-400">حضور</p>
                  </div>
                  <div className="text-center px-2">
                    <p className="font-amiri text-lg font-bold text-green-600">{student.points.recitation}</p>
                    <p className="font-plex text-xs text-gray-400">تسميع</p>
                  </div>
                  <div className="text-center px-3 bg-amber-100 rounded-lg py-1">
                    <p className="font-amiri text-xl font-bold text-amber-600">{student.points.total}</p>
                    <p className="font-plex text-xs text-amber-500">المجموع</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openAdjustDialog(student, 'add')}
                    className="text-green-600 hover:text-green-700 hover:bg-green-50 p-2 h-auto"
                    title="إضافة نقاط"
                  >
                    <Plus size={18} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openAdjustDialog(student, 'remove')}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 p-2 h-auto"
                    title="خصم نقاط"
                  >
                    <Minus size={18} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openHistoryDialog(student)}
                    className="text-gray-600 hover:text-gray-700 hover:bg-gray-50 p-2 h-auto"
                    title="سجل النقاط"
                  >
                    <History size={18} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Adjust Points Dialog */}
      <Dialog open={adjustDialog.open} onOpenChange={(open) => !open && setAdjustDialog({ open: false, type: 'add' })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-amiri text-xl flex items-center gap-2">
              {adjustDialog.type === 'add' ? (
                <Plus className="text-green-500" size={24} />
              ) : (
                <Minus className="text-red-500" size={24} />
              )}
              {adjustDialog.type === 'add' ? 'إضافة نقاط' : 'خصم نقاط'}
              {selectedStudent && ` - ${selectedStudent.name}`}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="font-plex">نوع النقاط</Label>
              <Select 
                value={adjustment.point_type} 
                onValueChange={(v) => setAdjustment(prev => ({ ...prev, point_type: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="booking">
                    <span className="flex items-center gap-2">
                      <Calendar size={16} className="text-purple-500" />
                      نقاط الحجز
                    </span>
                  </SelectItem>
                  <SelectItem value="attendance">
                    <span className="flex items-center gap-2">
                      <TrendingUp size={16} className="text-blue-500" />
                      نقاط الحضور
                    </span>
                  </SelectItem>
                  <SelectItem value="recitation">
                    <span className="flex items-center gap-2">
                      <BookOpen size={16} className="text-green-500" />
                      نقاط التسميع
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="font-plex">عدد النقاط</Label>
              <Input
                type="number"
                min="1"
                max="50"
                value={adjustment.amount === '' ? '' : adjustment.amount}
                onChange={(e) => {
                  const val = e.target.value;
                  // Allow empty value for clearing, or parse as number
                  if (val === '') {
                    setAdjustment(prev => ({ ...prev, amount: '' }));
                  } else {
                    const num = parseInt(val, 10);
                    if (!isNaN(num)) {
                      setAdjustment(prev => ({ ...prev, amount: num }));
                    }
                  }
                }}
                className="mt-1 font-plex"
                placeholder="أدخل عدد النقاط"
              />
            </div>

            <div>
              <Label className="font-plex">السبب (اختياري)</Label>
              <Textarea
                value={adjustment.reason}
                onChange={(e) => setAdjustment(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="سبب التعديل..."
                rows={2}
                className="mt-1 font-plex"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={handleAdjustPoints}
              disabled={adjusting}
              className={adjustDialog.type === 'add' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
            >
              {adjusting ? (
                <>
                  <div className="spinner border-2 border-white border-t-transparent rounded-full w-4 h-4 ml-2"></div>
                  جاري التعديل...
                </>
              ) : (
                adjustDialog.type === 'add' ? 'إضافة' : 'خصم'
              )}
            </Button>
            <Button variant="outline" onClick={() => setAdjustDialog({ open: false, type: 'add' })}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyDialog.open} onOpenChange={(open) => !open && setHistoryDialog({ open: false, studentId: null })}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-amiri text-xl flex items-center gap-2">
              <History className="text-gray-500" size={24} />
              سجل النقاط - {selectedStudent?.name}
            </DialogTitle>
          </DialogHeader>

          {pointsHistory.length === 0 ? (
            <p className="text-center py-8 font-plex text-gray-500">لا يوجد سجل نقاط</p>
          ) : (
            <div className="space-y-2">
              {pointsHistory.map((entry, index) => {
                const typeInfo = POINT_TYPES[entry.point_type] || POINT_TYPES.attendance;
                const Icon = typeInfo.icon;
                
                return (
                  <div 
                    key={entry.history_id || index}
                    className={`flex items-center gap-3 p-3 rounded-lg ${
                      entry.amount > 0 ? 'bg-green-50' : 'bg-red-50'
                    }`}
                  >
                    <div className={`p-2 rounded-full ${typeInfo.color} text-white`}>
                      <Icon size={16} />
                    </div>
                    <div className="flex-1">
                      <p className="font-plex text-sm text-gray-700">
                        {entry.reason || (entry.amount > 0 ? 'إضافة نقاط' : 'خصم نقاط')}
                      </p>
                      <p className="font-plex text-xs text-gray-400">
                        {entry.teacher_name} - {new Date(entry.created_at).toLocaleDateString('ar-SA')}
                      </p>
                    </div>
                    <span className={`font-amiri text-lg font-bold ${
                      entry.amount > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {entry.amount > 0 ? '+' : ''}{entry.amount}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default StudentPointsManager;
