import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  UserCog, Search, User, GraduationCap, ArrowUpCircle, 
  ArrowDownCircle, RefreshCw, Shield, CheckCircle 
} from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';

const TeacherPromotion = () => {
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDialog, setConfirmDialog] = useState({ open: false, user: null, action: null });
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('students'); // 'students' or 'teachers'

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [studentsRes, teachersRes] = await Promise.all([
        api.get('/admin/all-students'),
        api.get('/teachers')
      ]);
      setStudents(studentsRes.data);
      setTeachers(teachersRes.data);
    } catch (error) {
      toast.error('فشل تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const handlePromote = async () => {
    if (!confirmDialog.user) return;
    
    setProcessing(true);
    try {
      if (confirmDialog.action === 'promote') {
        await api.put(`/admin/promote-to-teacher/${confirmDialog.user.user_id}`);
        toast.success(`تم ترقية ${confirmDialog.user.name} إلى معلم`);
      } else {
        await api.put(`/admin/demote-to-student/${confirmDialog.user.user_id}`);
        toast.success(`تم تحويل ${confirmDialog.user.name} إلى طالب`);
      }
      loadData();
      setConfirmDialog({ open: false, user: null, action: null });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشلت العملية');
    } finally {
      setProcessing(false);
    }
  };

  const filteredStudents = students.filter(s => 
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredTeachers = teachers.filter(t => 
    t.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const currentList = activeTab === 'students' ? filteredStudents : filteredTeachers;

  return (
    <Card className="border-2 border-indigo-200" data-testid="teacher-promotion-card">
      <CardHeader className="bg-indigo-50">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="font-amiri text-xl text-indigo-700 flex items-center gap-2">
            <UserCog size={24} />
            إدارة المعلمين
          </CardTitle>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`ml-1 ${loading ? 'animate-spin' : ''}`} size={16} />
            تحديث
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mt-4">
          <Button
            variant={activeTab === 'students' ? 'default' : 'outline'}
            onClick={() => setActiveTab('students')}
            className={activeTab === 'students' ? 'bg-indigo-600' : ''}
            data-testid="students-tab-btn"
          >
            <User className="ml-2" size={18} />
            الطلاب ({students.length})
          </Button>
          <Button
            variant={activeTab === 'teachers' ? 'default' : 'outline'}
            onClick={() => setActiveTab('teachers')}
            className={activeTab === 'teachers' ? 'bg-indigo-600' : ''}
            data-testid="teachers-tab-btn"
          >
            <GraduationCap className="ml-2" size={18} />
            المعلمون ({teachers.length})
          </Button>
        </div>
        
        {/* Search */}
        <div className="relative mt-4">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث بالاسم أو البريد..."
            className="pr-10 font-plex"
            data-testid="search-users-input"
          />
        </div>
      </CardHeader>

      <CardContent className="p-4">
        {loading ? (
          <div className="text-center py-8">
            <div className="spinner border-4 border-indigo-500 border-t-transparent rounded-full w-8 h-8 mx-auto"></div>
          </div>
        ) : currentList.length === 0 ? (
          <p className="text-center py-8 font-plex text-gray-500">
            {activeTab === 'students' ? 'لا يوجد طلاب' : 'لا يوجد معلمون'}
          </p>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {currentList.map(user => (
              <div 
                key={user.user_id}
                className="flex items-center gap-4 p-4 bg-white border rounded-lg hover:shadow-md transition-shadow"
                data-testid={`user-row-${user.user_id}`}
              >
                {/* Avatar */}
                {user.picture ? (
                  <img src={user.picture} alt={user.name} className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    activeTab === 'teachers' ? 'bg-indigo-100' : 'bg-gray-100'
                  }`}>
                    {activeTab === 'teachers' ? (
                      <GraduationCap size={24} className="text-indigo-500" />
                    ) : (
                      <User size={24} className="text-gray-400" />
                    )}
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-amiri font-bold text-gray-800 truncate">{user.name}</h4>
                    {activeTab === 'teachers' && (
                      <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full font-plex">
                        معلم
                      </span>
                    )}
                  </div>
                  <p className="font-plex text-xs text-gray-500 truncate">{user.email}</p>
                </div>

                {/* Action */}
                {activeTab === 'students' ? (
                  <Button
                    onClick={() => setConfirmDialog({ open: true, user, action: 'promote' })}
                    className="bg-green-600 hover:bg-green-700"
                    data-testid={`promote-btn-${user.user_id}`}
                  >
                    <ArrowUpCircle className="ml-2" size={18} />
                    ترقية لمعلم
                  </Button>
                ) : (
                  <Button
                    onClick={() => setConfirmDialog({ open: true, user, action: 'demote' })}
                    variant="outline"
                    className="border-red-300 text-red-600 hover:bg-red-50"
                    data-testid={`demote-btn-${user.user_id}`}
                  >
                    <ArrowDownCircle className="ml-2" size={18} />
                    تحويل لطالب
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog({ open: false, user: null, action: null })}>
        <DialogContent className="max-w-md" data-testid="confirm-role-dialog">
          <DialogHeader>
            <DialogTitle className="font-amiri text-xl flex items-center gap-2">
              {confirmDialog.action === 'promote' ? (
                <ArrowUpCircle className="text-green-500" size={24} />
              ) : (
                <ArrowDownCircle className="text-red-500" size={24} />
              )}
              {confirmDialog.action === 'promote' ? 'تأكيد الترقية' : 'تأكيد التحويل'}
            </DialogTitle>
          </DialogHeader>

          <div className="py-4">
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg mb-4">
              {confirmDialog.user?.picture ? (
                <img src={confirmDialog.user.picture} alt="" className="w-14 h-14 rounded-full object-cover" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center">
                  <User size={28} className="text-gray-400" />
                </div>
              )}
              <div>
                <h4 className="font-amiri font-bold text-lg">{confirmDialog.user?.name}</h4>
                <p className="font-plex text-sm text-gray-500">{confirmDialog.user?.email}</p>
              </div>
            </div>

            <div className={`p-4 rounded-lg ${
              confirmDialog.action === 'promote' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            }`}>
              {confirmDialog.action === 'promote' ? (
                <p className="font-plex text-green-700">
                  <Shield className="inline ml-2" size={18} />
                  سيتم ترقية هذا المستخدم إلى <strong>معلم</strong>. سيتمكن من إدارة الحصص وتقييم الطلاب.
                </p>
              ) : (
                <p className="font-plex text-red-700">
                  <Shield className="inline ml-2" size={18} />
                  سيتم تحويل هذا المعلم إلى <strong>طالب</strong>. سيفقد صلاحيات المعلم.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={handlePromote}
              disabled={processing}
              className={confirmDialog.action === 'promote' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
              data-testid="confirm-action-btn"
            >
              {processing ? (
                <>
                  <div className="spinner border-2 border-white border-t-transparent rounded-full w-4 h-4 ml-2"></div>
                  جاري التنفيذ...
                </>
              ) : (
                <>
                  <CheckCircle className="ml-2" size={18} />
                  تأكيد
                </>
              )}
            </Button>
            <Button variant="outline" onClick={() => setConfirmDialog({ open: false, user: null, action: null })}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default TeacherPromotion;
