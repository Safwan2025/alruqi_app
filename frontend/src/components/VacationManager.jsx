import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, Trash2, Plus } from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';

const VacationManager = () => {
  const [vacations, setVacations] = useState([]);
  const [newDate, setNewDate] = useState('');
  const [newReason, setNewReason] = useState('');
  const [loading, setLoading] = useState(false);

  const loadVacations = async () => {
    try {
      const response = await api.get('/teacher/vacation-days');
      setVacations(response.data);
    } catch (error) {
      console.error('Failed to load vacations');
    }
  };

  useEffect(() => {
    loadVacations();
  }, []);

  const addVacation = async () => {
    if (!newDate) {
      toast.error('يرجى اختيار التاريخ');
      return;
    }

    setLoading(true);
    try {
      await api.post('/teacher/vacation-days', {
        date: newDate,
        reason: newReason || 'إجازة'
      });
      toast.success('تمت إضافة يوم الإجازة');
      setNewDate('');
      setNewReason('');
      loadVacations();
    } catch (error) {
      toast.error('فشل في إضافة الإجازة');
    } finally {
      setLoading(false);
    }
  };

  const removeVacation = async (vacationId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الإجازة؟')) return;

    try {
      await api.delete(`/teacher/vacation-days/${vacationId}`);
      toast.success('تم حذف الإجازة');
      loadVacations();
    } catch (error) {
      toast.error('فشل في حذف الإجازة');
    }
  };

  return (
    <Card className="border-2 border-orange-200">
      <CardHeader className="bg-orange-50">
        <CardTitle className="font-amiri text-xl text-orange-700 flex items-center gap-2">
          <Calendar size={24} />
          إدارة أيام الإجازة
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {/* Add new vacation */}
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <Label className="font-plex text-sm">التاريخ</Label>
            <Input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="font-plex"
              min={new Date().toISOString().split('T')[0]}
            />
          </div>
          <div className="flex-1">
            <Label className="font-plex text-sm">السبب (اختياري)</Label>
            <Input
              type="text"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              placeholder="مثال: إجازة شخصية"
              className="font-plex"
            />
          </div>
          <Button
            onClick={addVacation}
            disabled={loading || !newDate}
            className="bg-orange-600 hover:bg-orange-700"
          >
            <Plus size={18} className="ml-1" />
            إضافة
          </Button>
        </div>

        {/* List of vacations */}
        {vacations.length > 0 ? (
          <div className="space-y-2 mt-4">
            <p className="font-plex font-bold text-gray-700">أيام الإجازة المحددة:</p>
            {vacations.map((vacation) => (
              <div
                key={vacation.vacation_id}
                className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-200"
              >
                <div>
                  <p className="font-plex font-bold text-orange-800">
                    {new Date(vacation.date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                  {vacation.reason && (
                    <p className="font-plex text-sm text-orange-600">{vacation.reason}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeVacation(vacation.vacation_id)}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 size={18} />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="font-plex text-gray-500 text-center py-4">
            لم تحدد أي أيام إجازة
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default VacationManager;
