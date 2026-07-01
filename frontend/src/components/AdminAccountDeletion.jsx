import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  Trash2, Search, User, RefreshCw, AlertTriangle, 
  GraduationCap, Shield, XCircle, CheckCircle
} from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';

const AdminAccountDeletion = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteDialog, setDeleteDialog] = useState({ open: false, user: null });
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [filterRole, setFilterRole] = useState('all'); // 'all', 'student', 'teacher'

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await api.get('/admin/all-users');
      // Exclude admin from the list
      const filteredUsers = response.data.filter(u => u.email !== 'm0m0077100@gmail.com');
      setUsers(filteredUsers);
    } catch (error) {
      toast.error('فشل تحميل قائمة المستخدمين');
    } finally {
      setLoading(false);
    }
  };

  const openDeleteDialog = (user) => {
    setDeleteDialog({ open: true, user });
    setConfirmText('');
  };

  const handleDelete = async () => {
    if (!deleteDialog.user) return;
    
    // Require typing "حذف" to confirm
    if (confirmText !== 'حذف') {
      toast.error('يرجى كتابة "حذف" للتأكيد');
      return;
    }

    setDeleting(true);
    try {
      const response = await api.delete(`/admin/delete-user/${deleteDialog.user.user_id}`);
      toast.success(response.data.message);
      loadUsers();
      setDeleteDialog({ open: false, user: null });
      setConfirmText('');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل حذف الحساب');
    } finally {
      setDeleting(false);
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = filterRole === 'all' || u.role === filterRole;
    
    return matchesSearch && matchesRole;
  });

  const studentCount = users.filter(u => u.role === 'student').length;
  const teacherCount = users.filter(u => u.role === 'teacher').length;

  return (
    <Card className="border-2 border-red-200" data-testid="admin-account-deletion">
      <CardHeader className="bg-red-50">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="font-amiri text-xl text-red-700 flex items-center gap-2">
            <Trash2 size={24} />
            حذف الحسابات نهائياً
          </CardTitle>
          <Button variant="outline" size="sm" onClick={loadUsers} disabled={loading}>
            <RefreshCw className={`ml-1 ${loading ? 'animate-spin' : ''}`} size={16} />
            تحديث
          </Button>
        </div>
        <p className="font-plex text-sm text-red-600 mt-2 flex items-center gap-1">
          <AlertTriangle size={16} />
          تحذير: الحذف نهائي ولا يمكن التراجع عنه
        </p>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Stats */}
        <div className="flex gap-4 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full text-sm font-plex">
            <User size={16} className="text-gray-500" />
            الإجمالي: {users.length}
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 rounded-full text-sm font-plex">
            <User size={16} className="text-blue-500" />
            طلاب: {studentCount}
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-100 rounded-full text-sm font-plex">
            <GraduationCap size={16} className="text-purple-500" />
            معلمون: {teacherCount}
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث بالاسم أو البريد..."
              className="pr-10 font-plex"
              data-testid="search-users-delete"
            />
          </div>
          
          {/* Role Filter */}
          <div className="flex gap-2">
            <Button
              variant={filterRole === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterRole('all')}
            >
              الكل
            </Button>
            <Button
              variant={filterRole === 'student' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterRole('student')}
            >
              طلاب
            </Button>
            <Button
              variant={filterRole === 'teacher' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterRole('teacher')}
            >
              معلمون
            </Button>
          </div>
        </div>

        {/* Users List */}
        {loading ? (
          <div className="text-center py-8">
            <div className="spinner border-4 border-red-500 border-t-transparent rounded-full w-8 h-8 mx-auto"></div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <p className="text-center py-8 font-plex text-gray-500">لا يوجد مستخدمين</p>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {filteredUsers.map(user => (
              <div 
                key={user.user_id}
                className="flex items-center gap-4 p-3 bg-white border rounded-lg hover:border-red-200 transition-colors"
                data-testid={`user-delete-row-${user.user_id}`}
              >
                {/* Avatar */}
                {user.picture ? (
                  <img src={user.picture} alt={user.name} className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    user.role === 'teacher' ? 'bg-purple-100' : 'bg-gray-100'
                  }`}>
                    {user.role === 'teacher' ? (
                      <GraduationCap size={20} className="text-purple-500" />
                    ) : (
                      <User size={20} className="text-gray-400" />
                    )}
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-amiri font-bold text-gray-800 truncate">{user.name}</h4>
                    <span className={`px-2 py-0.5 text-xs rounded-full font-plex ${
                      user.role === 'teacher' 
                        ? 'bg-purple-100 text-purple-700' 
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {user.role === 'teacher' ? 'معلم' : 'طالب'}
                    </span>
                  </div>
                  <p className="font-plex text-xs text-gray-500 truncate">{user.email}</p>
                </div>

                {/* Delete Button */}
                <Button
                  onClick={() => openDeleteDialog(user)}
                  variant="outline"
                  size="sm"
                  className="border-red-300 text-red-600 hover:bg-red-50"
                  data-testid={`delete-btn-${user.user_id}`}
                >
                  <Trash2 size={16} className="ml-1" />
                  حذف
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, user: null })}>
        <DialogContent className="max-w-md" data-testid="confirm-delete-dialog">
          <DialogHeader>
            <DialogTitle className="font-amiri text-xl flex items-center gap-2 text-red-600">
              <AlertTriangle size={24} />
              تأكيد الحذف النهائي
            </DialogTitle>
          </DialogHeader>

          {deleteDialog.user && (
            <div className="py-4 space-y-4">
              {/* Warning */}
              <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <XCircle className="text-red-500 flex-shrink-0 mt-0.5" size={24} />
                  <div>
                    <p className="font-plex font-bold text-red-700">تحذير!</p>
                    <p className="font-plex text-sm text-red-600 mt-1">
                      سيتم حذف هذا الحساب وجميع بياناته نهائياً بما في ذلك:
                    </p>
                    <ul className="font-plex text-sm text-red-600 mt-2 list-disc list-inside space-y-1">
                      <li>الرسائل المرسلة والمستلمة</li>
                      <li>الحجوزات والحصص</li>
                      <li>الملاحظات والتقدم الدراسي</li>
                      <li>النقاط والإشعارات</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* User Info */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border">
                {deleteDialog.user.picture ? (
                  <img src={deleteDialog.user.picture} alt="" className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                    <User size={24} className="text-gray-400" />
                  </div>
                )}
                <div>
                  <h4 className="font-amiri font-bold text-lg">{deleteDialog.user.name}</h4>
                  <p className="font-plex text-sm text-gray-500">{deleteDialog.user.email}</p>
                  <span className={`inline-block mt-1 px-2 py-0.5 text-xs rounded-full ${
                    deleteDialog.user.role === 'teacher' 
                      ? 'bg-purple-100 text-purple-700' 
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {deleteDialog.user.role === 'teacher' ? 'معلم' : 'طالب'}
                  </span>
                </div>
              </div>

              {/* Confirmation Input */}
              <div>
                <p className="font-plex text-sm text-gray-700 mb-2">
                  للتأكيد، اكتب كلمة <strong className="text-red-600">"حذف"</strong> في الحقل أدناه:
                </p>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder='اكتب "حذف" هنا'
                  className="font-plex text-center"
                  data-testid="confirm-delete-input"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={handleDelete}
              disabled={deleting || confirmText !== 'حذف'}
              className="bg-red-600 hover:bg-red-700"
              data-testid="confirm-delete-btn"
            >
              {deleting ? (
                <>
                  <div className="spinner border-2 border-white border-t-transparent rounded-full w-4 h-4 ml-2"></div>
                  جاري الحذف...
                </>
              ) : (
                <>
                  <Trash2 className="ml-2" size={18} />
                  حذف نهائياً
                </>
              )}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => {
                setDeleteDialog({ open: false, user: null });
                setConfirmText('');
              }}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default AdminAccountDeletion;
