import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserX, Unlock, AlertTriangle } from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';

const StudentRestrictions = ({ students = [] }) => {
  const [restrictions, setRestrictions] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const loadRestrictions = async () => {
    try {
      const response = await api.get('/teacher/restricted-students');
      setRestrictions(response.data);
    } catch (error) {
      console.error('Failed to load restrictions');
    }
  };

  useEffect(() => {
    loadRestrictions();
  }, []);

  const restrictStudent = async () => {
    if (!selectedStudent || !reason) {
      toast.error('يرجى اختيار الطالب وكتابة السبب');
      return;
    }

    setLoading(true);
    try {
      await api.post('/teacher/restrict-student', {
        student_id: selectedStudent,
        reason: reason
      });
      toast.success('تم تقييد الطالب');
      setSelectedStudent('');
      setReason('');
      loadRestrictions();
    } catch (error) {
      toast.error('فشل في تقييد الطالب');
    } finally {
      setLoading(false);
    }
  };

  const removeRestriction = async (studentId) => {
    if (!window.confirm('هل أنت متأكد من رفع التقييد عن هذا الطالب؟')) return;

    try {
      await api.delete(`/teacher/restrict-student/${studentId}`);
      toast.success('تم رفع التقييد');
      loadRestrictions();
    } catch (error) {
      toast.error('فشل في رفع التقييد');
    }
  };

  // Get unique students from sessions (for selection dropdown)
  const availableStudents = students.filter(
    s => !restrictions.some(r => r.student_id === s.student_id)
  );

  return (
    <Card className="border-2 border-red-200">
      <CardHeader className="bg-red-50">
        <CardTitle className="font-amiri text-xl text-red-700 flex items-center gap-2">
          <UserX size={24} />
          تقييد حجوزات الطلاب
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {/* Add new restriction */}
        <div className="space-y-3">
          <div>
            <Label className="font-plex text-sm">اختر الطالب</Label>
            <select
              value={selectedStudent}
              onChange={(e) => setSelectedStudent(e.target.value)}
              className="w-full p-2 border rounded-lg font-plex"
            >
              <option value="">-- اختر طالب --</option>
              {availableStudents.map((student) => (
                <option key={student.student_id} value={student.student_id}>
                  {student.student_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="font-plex text-sm">سبب التقييد</Label>
            <Input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: عدم الالتزام بالمواعيد"
              className="font-plex"
            />
          </div>
          <Button
            onClick={restrictStudent}
            disabled={loading || !selectedStudent || !reason}
            className="w-full bg-red-600 hover:bg-red-700"
          >
            <UserX size={18} className="ml-1" />
            تقييد الطالب
          </Button>
        </div>

        {/* List of restrictions */}
        {restrictions.length > 0 && (
          <div className="space-y-2 mt-4">
            <p className="font-plex font-bold text-gray-700 flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-500" />
              الطلاب المقيدون:
            </p>
            {restrictions.map((restriction) => (
              <div
                key={restriction.restriction_id}
                className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200"
              >
                <div>
                  <p className="font-plex font-bold text-red-800">
                    {restriction.student_name}
                  </p>
                  <p className="font-plex text-sm text-red-600">
                    السبب: {restriction.reason}
                  </p>
                  <p className="font-plex text-xs text-gray-500">
                    منذ: {new Date(restriction.created_at).toLocaleDateString('en-US')}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => removeRestriction(restriction.student_id)}
                  className="border-green-500 text-green-600 hover:bg-green-50"
                >
                  <Unlock size={16} className="ml-1" />
                  رفع التقييد
                </Button>
              </div>
            ))}
          </div>
        )}

        {restrictions.length === 0 && (
          <p className="font-plex text-gray-500 text-center py-4">
            لا يوجد طلاب مقيدون
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default StudentRestrictions;
