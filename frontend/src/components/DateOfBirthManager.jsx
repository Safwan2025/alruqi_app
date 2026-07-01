import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, Save, AlertCircle } from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';

const DateOfBirthManager = () => {
  const [dob, setDob] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isSet, setIsSet] = useState(false);

  useEffect(() => {
    loadDOB();
  }, []);

  const loadDOB = async () => {
    try {
      const response = await api.get('/users/date-of-birth');
      if (response.data.date_of_birth) {
        setDob(response.data.date_of_birth);
        setIsSet(true);
      }
    } catch (error) {
      console.error('Failed to load DOB');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!dob) {
      toast.error('يرجى إدخال تاريخ الميلاد');
      return;
    }

    setSaving(true);
    try {
      await api.put('/users/date-of-birth', { date_of_birth: dob });
      toast.success('تم حفظ تاريخ الميلاد بنجاح');
      setIsSet(true);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل حفظ تاريخ الميلاد');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <div className="spinner border-4 border-primary border-t-transparent rounded-full w-8 h-8 mx-auto"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="font-amiri text-lg flex items-center gap-2">
          <Calendar className="text-primary" size={20} />
          تاريخ الميلاد
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!isSet && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-start gap-2">
            <AlertCircle className="text-amber-500 mt-0.5" size={18} />
            <div>
              <p className="font-plex text-sm text-amber-700">
                تاريخ الميلاد مهم لاستعادة كلمة المرور
              </p>
              <p className="font-plex text-xs text-amber-600 mt-1">
                يرجى إضافة تاريخ ميلادك لتتمكن من استعادة كلمة المرور إذا نسيتها
              </p>
            </div>
          </div>
        )}

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label className="font-plex text-sm">تاريخ الميلاد</Label>
            <Input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="mt-1 font-plex"
            />
          </div>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary hover:bg-primary/90"
          >
            {saving ? (
              <>
                <div className="spinner border-2 border-white border-t-transparent rounded-full w-4 h-4 ml-2"></div>
                جاري الحفظ...
              </>
            ) : (
              <>
                <Save className="ml-2" size={16} />
                حفظ
              </>
            )}
          </Button>
        </div>

        {isSet && (
          <p className="font-plex text-xs text-green-600 mt-3">
            ✓ تاريخ الميلاد محفوظ - يمكنك استخدامه لاستعادة كلمة المرور
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default DateOfBirthManager;
