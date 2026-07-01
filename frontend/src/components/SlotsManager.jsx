import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Clock, Plus, Trash2, AlertCircle, Users } from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';

// Users authorized to manage slots for any teacher
const SLOT_MANAGERS_EMAILS = [
  "m0m0077100@gmail.com",       // محمد الأنصاري (المشرف)
  "aalsiiada@gmail.com",        // البراء السيدا
  "omarnasernajjar09@gmail.com" // عمر النجار
];

const SlotsManager = () => {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deletingSlotId, setDeletingSlotId] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [newSlot, setNewSlot] = useState({
    date: '',
    time: ''
  });
  const [user, setUser] = useState(null);

  useEffect(() => {
    loadUser();
    loadTeachers();
  }, []);

  useEffect(() => {
    if (user && selectedTeacherId) {
      loadSlots(selectedTeacherId);
    }
  }, [user, selectedTeacherId]);

  const loadUser = async () => {
    try {
      const response = await api.get('/auth/me');
      setUser(response.data);
      // Set default selected teacher to self
      setSelectedTeacherId(response.data.user_id);
    } catch (error) {
      console.error('Failed to load user');
    }
  };

  const loadTeachers = async () => {
    try {
      const response = await api.get('/teachers');
      setTeachers(response.data);
    } catch (error) {
      console.error('Failed to load teachers');
    }
  };

  const loadSlots = async (teacherId) => {
    if (!teacherId) return;
    
    setLoading(true);
    try {
      const response = await api.get(`/teachers/${teacherId}/available-slots`);
      setSlots(response.data);
    } catch (error) {
      console.error('Failed to load slots');
    } finally {
      setLoading(false);
    }
  };

  const handleAddSlot = async () => {
    if (!newSlot.date || !newSlot.time) {
      toast.error('يرجى تحديد التاريخ والوقت');
      return;
    }

    if (!selectedTeacherId) {
      toast.error('يرجى اختيار المعلم');
      return;
    }

    // Combine date and time into ISO string
    const scheduledTime = new Date(`${newSlot.date}T${newSlot.time}:00`);
    
    // Check if time is in the past
    if (scheduledTime < new Date()) {
      toast.error('لا يمكن إضافة موعد في الماضي');
      return;
    }

    setAdding(true);
    try {
      const payload = {
        scheduled_time: scheduledTime.toISOString(),
        duration: 60
      };
      
      // If adding for another teacher (admin only)
      if (selectedTeacherId !== user?.user_id) {
        payload.teacher_id = selectedTeacherId;
      }

      await api.post('/teacher/slots', payload);
      
      const selectedTeacher = teachers.find(t => t.teacher_id === selectedTeacherId);
      toast.success(`تم إضافة الموعد بنجاح للشيخ ${selectedTeacher?.name || ''}`);
      setNewSlot({ date: '', time: '' });
      loadSlots(selectedTeacherId);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل إضافة الموعد');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteSlot = async (slotId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الموعد؟')) return;
    
    setDeletingSlotId(slotId);
    try {
      await api.delete(`/teacher/slots/${slotId}`);
      toast.success('تم حذف الموعد');
      // Update locally
      setSlots(prevSlots => prevSlots.filter(s => s.slot_id !== slotId));
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل حذف الموعد');
    } finally {
      setDeletingSlotId(null);
    }
  };

  // Get minimum date (today)
  const today = new Date().toISOString().split('T')[0];

  // Group slots by date
  const slotsByDate = slots.reduce((acc, slot) => {
    const date = new Date(slot.scheduled_time).toLocaleDateString('en-US', { dateStyle: 'full' });
    if (!acc[date]) acc[date] = [];
    acc[date].push(slot);
    return acc;
  }, {});

  const isAdmin = user?.email && SLOT_MANAGERS_EMAILS.includes(user.email);
  const selectedTeacher = teachers.find(t => t.teacher_id === selectedTeacherId);

  return (
    <Card className="border-2 border-blue-200">
      <CardHeader className="bg-blue-50">
        <CardTitle className="font-amiri text-xl text-blue-700 flex items-center gap-2">
          <Calendar size={24} />
          إدارة المواعيد المتاحة
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {/* Teacher Selector - Admin Only */}
        {isAdmin && (
          <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
            <div className="flex items-center gap-2 mb-3">
              <Users size={18} className="text-indigo-600" />
              <Label className="font-plex font-bold text-indigo-700">اختر المعلم</Label>
            </div>
            <Select value={selectedTeacherId} onValueChange={(value) => setSelectedTeacherId(value)}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="اختر المعلم" />
              </SelectTrigger>
              <SelectContent>
                {teachers.map((teacher) => (
                  <SelectItem key={teacher.teacher_id} value={teacher.teacher_id}>
                    {teacher.name} {teacher.email === user?.email ? '(أنت)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTeacher && selectedTeacher.teacher_id !== user?.user_id && (
              <p className="font-plex text-xs text-indigo-600 mt-2">
                ⚡ ستتم إضافة المواعيد للشيخ {selectedTeacher.name}
              </p>
            )}
          </div>
        )}

        {/* Add New Slot Form */}
        <div className="bg-gray-50 p-4 rounded-lg border">
          <h4 className="font-plex font-bold text-gray-700 mb-3 flex items-center gap-2">
            <Plus size={18} />
            إضافة موعد جديد {selectedTeacher && selectedTeacher.teacher_id !== user?.user_id ? `للشيخ ${selectedTeacher.name}` : ''}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="font-plex text-sm">التاريخ</Label>
              <Input
                type="date"
                value={newSlot.date}
                onChange={(e) => setNewSlot({ ...newSlot, date: e.target.value })}
                min={today}
                className="font-plex mt-1"
              />
            </div>
            <div>
              <Label className="font-plex text-sm">الوقت</Label>
              <Input
                type="time"
                value={newSlot.time}
                onChange={(e) => setNewSlot({ ...newSlot, time: e.target.value })}
                className="font-plex mt-1"
              />
            </div>
          </div>
          <Button
            onClick={handleAddSlot}
            disabled={adding || !newSlot.date || !newSlot.time || !selectedTeacherId}
            className="w-full mt-3 bg-blue-600 hover:bg-blue-700"
          >
            {adding ? (
              <>
                <div className="spinner border-2 border-white border-t-transparent rounded-full w-4 h-4 ml-2"></div>
                جاري الإضافة...
              </>
            ) : (
              <>
                <Plus className="ml-2" size={18} />
                إضافة الموعد
              </>
            )}
          </Button>
        </div>

        {/* Existing Slots */}
        <div>
          <h4 className="font-plex font-bold text-gray-700 mb-3 flex items-center gap-2">
            <Clock size={18} />
            المواعيد الحالية {selectedTeacher ? `للشيخ ${selectedTeacher.name}` : ''} ({slots.length})
          </h4>
          
          {loading ? (
            <div className="text-center py-6 bg-gray-50 rounded-lg">
              <div className="spinner border-4 border-blue-500 border-t-transparent rounded-full w-8 h-8 mx-auto"></div>
              <p className="font-plex text-gray-500 mt-2">جاري التحميل...</p>
            </div>
          ) : slots.length === 0 ? (
            <div className="text-center py-6 bg-gray-50 rounded-lg">
              <AlertCircle className="mx-auto text-gray-400 mb-2" size={32} />
              <p className="font-plex text-gray-500">لا توجد مواعيد متاحة</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {Object.entries(slotsByDate).map(([date, dateSlots]) => (
                <div key={date} className="border rounded-lg overflow-hidden">
                  <div className="bg-blue-100 px-3 py-2">
                    <p className="font-plex font-bold text-blue-800 text-sm">{date}</p>
                  </div>
                  <div className="p-2 space-y-1">
                    {dateSlots.map((slot) => (
                      <div 
                        key={slot.slot_id} 
                        className={`flex items-center justify-between p-2 rounded ${
                          slot.is_available ? 'bg-green-50 border border-green-200' : 'bg-gray-100 border border-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Clock size={16} className={slot.is_available ? 'text-green-600' : 'text-gray-400'} />
                          <span className="font-plex text-sm">
                            {new Date(slot.scheduled_time).toLocaleTimeString('en-US', { 
                              hour: '2-digit', 
                              minute: '2-digit',
                              hour12: true 
                            })}
                          </span>
                          {!slot.is_available && (
                            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded">محجوز</span>
                          )}
                        </div>
                        {slot.is_available && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteSlot(slot.slot_id)}
                            disabled={deletingSlotId === slot.slot_id}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 h-auto"
                          >
                            {deletingSlotId === slot.slot_id ? (
                              <div className="spinner border-2 border-red-500 border-t-transparent rounded-full w-4 h-4"></div>
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default SlotsManager;
