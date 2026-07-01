import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  MessageSquare, Send, Users, Search, User, CheckCircle, 
  RefreshCw, Mail, UserCheck, AlertCircle
} from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';

const AdminBulkMessaging = () => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [sendToAll, setSendToAll] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(false);

  useEffect(() => {
    loadStudents();
  }, []);

  const loadStudents = async () => {
    setLoading(true);
    try {
      const response = await api.get('/admin/all-students');
      setStudents(response.data);
    } catch (error) {
      toast.error('فشل تحميل قائمة الطلاب');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectStudent = (studentId) => {
    setSelectedStudents(prev => {
      if (prev.includes(studentId)) {
        return prev.filter(id => id !== studentId);
      } else {
        return [...prev, studentId];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedStudents.length === filteredStudents.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(filteredStudents.map(s => s.user_id));
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim()) {
      toast.error('يرجى كتابة الرسالة');
      return;
    }

    if (!sendToAll && selectedStudents.length === 0) {
      toast.error('يرجى اختيار طالب واحد على الأقل أو تحديد "إرسال للجميع"');
      return;
    }

    setSending(true);
    try {
      const response = await api.post('/admin/send-bulk-message', {
        student_ids: sendToAll ? [] : selectedStudents,
        message: message.trim(),
        send_to_all: sendToAll
      });

      toast.success(response.data.message);
      setMessage('');
      setSelectedStudents([]);
      setSendToAll(false);
      setConfirmDialog(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل إرسال الرسالة');
    } finally {
      setSending(false);
    }
  };

  const filteredStudents = students.filter(s => 
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const targetCount = sendToAll ? students.length : selectedStudents.length;

  return (
    <Card className="border-2 border-blue-200" data-testid="admin-bulk-messaging">
      <CardHeader className="bg-blue-50">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="font-amiri text-xl text-blue-700 flex items-center gap-2">
            <MessageSquare size={24} />
            إرسال رسالة للطلاب
          </CardTitle>
          <Button variant="outline" size="sm" onClick={loadStudents} disabled={loading}>
            <RefreshCw className={`ml-1 ${loading ? 'animate-spin' : ''}`} size={16} />
            تحديث
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Message Input */}
        <div>
          <Label className="font-plex font-bold mb-2 block">نص الرسالة</Label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="اكتب رسالتك هنا..."
            rows={4}
            className="font-plex"
            data-testid="bulk-message-input"
          />
        </div>

        {/* Send to All Toggle */}
        <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
          <Checkbox 
            id="send-to-all"
            checked={sendToAll}
            onCheckedChange={(checked) => {
              setSendToAll(checked);
              if (checked) setSelectedStudents([]);
            }}
            data-testid="send-to-all-checkbox"
          />
          <Label htmlFor="send-to-all" className="font-plex cursor-pointer flex items-center gap-2">
            <Users size={18} className="text-amber-600" />
            إرسال لجميع الطلاب ({students.length} طالب)
          </Label>
        </div>

        {/* Student Selection (if not sending to all) */}
        {!sendToAll && (
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <Label className="font-plex font-bold">اختر الطلاب ({selectedStudents.length} محدد)</Label>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleSelectAll}
                data-testid="select-all-btn"
              >
                <UserCheck className="ml-1" size={16} />
                {selectedStudents.length === filteredStudents.length ? 'إلغاء الكل' : 'تحديد الكل'}
              </Button>
            </div>

            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="بحث عن طالب..."
                className="pr-10 font-plex"
                data-testid="search-students-input"
              />
            </div>

            {/* Students List */}
            <div className="max-h-[250px] overflow-y-auto space-y-2">
              {loading ? (
                <div className="text-center py-4">
                  <div className="spinner border-4 border-blue-500 border-t-transparent rounded-full w-6 h-6 mx-auto"></div>
                </div>
              ) : filteredStudents.length === 0 ? (
                <p className="text-center py-4 text-gray-500 font-plex">لا يوجد طلاب</p>
              ) : (
                filteredStudents.map(student => (
                  <div 
                    key={student.user_id}
                    className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                      selectedStudents.includes(student.user_id) 
                        ? 'bg-blue-100 border border-blue-300' 
                        : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                    onClick={() => handleSelectStudent(student.user_id)}
                    data-testid={`student-select-${student.user_id}`}
                  >
                    <Checkbox 
                      checked={selectedStudents.includes(student.user_id)}
                      onChange={() => {}}
                    />
                    {student.picture ? (
                      <img src={student.picture} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                        <User size={16} className="text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-amiri font-bold truncate text-sm">{student.name}</p>
                      <p className="font-plex text-xs text-gray-500 truncate">{student.email}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Send Button */}
        <Button
          onClick={() => setConfirmDialog(true)}
          disabled={!message.trim() || (!sendToAll && selectedStudents.length === 0)}
          className="w-full bg-blue-600 hover:bg-blue-700"
          data-testid="send-message-btn"
        >
          <Send className="ml-2" size={18} />
          إرسال الرسالة ({targetCount} طالب)
        </Button>
      </CardContent>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog} onOpenChange={setConfirmDialog}>
        <DialogContent className="max-w-md" data-testid="confirm-send-dialog">
          <DialogHeader>
            <DialogTitle className="font-amiri text-xl flex items-center gap-2">
              <Mail className="text-blue-500" size={24} />
              تأكيد الإرسال
            </DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="font-plex text-blue-700">
                سيتم إرسال هذه الرسالة إلى <strong>{targetCount}</strong> طالب
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-3">
              <p className="font-plex text-sm text-gray-500 mb-1">نص الرسالة:</p>
              <p className="font-plex text-gray-800">{message}</p>
            </div>

            {sendToAll && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="text-amber-500 flex-shrink-0 mt-0.5" size={18} />
                <p className="font-plex text-sm text-amber-700">
                  سيتم إرسال الرسالة لجميع الطلاب المسجلين في المقرأة
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              onClick={handleSendMessage}
              disabled={sending}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="confirm-send-btn"
            >
              {sending ? (
                <>
                  <div className="spinner border-2 border-white border-t-transparent rounded-full w-4 h-4 ml-2"></div>
                  جاري الإرسال...
                </>
              ) : (
                <>
                  <CheckCircle className="ml-2" size={18} />
                  تأكيد الإرسال
                </>
              )}
            </Button>
            <Button variant="outline" onClick={() => setConfirmDialog(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default AdminBulkMessaging;
