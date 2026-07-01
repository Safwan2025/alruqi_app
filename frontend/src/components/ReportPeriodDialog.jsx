import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar as CalendarIcon, FileDown } from 'lucide-react';

const MONTHS = [
  ['1', 'يناير'], ['2', 'فبراير'], ['3', 'مارس'], ['4', 'أبريل'],
  ['5', 'مايو'], ['6', 'يونيو'], ['7', 'يوليو'], ['8', 'أغسطس'],
  ['9', 'سبتمبر'], ['10', 'أكتوبر'], ['11', 'نوفمبر'], ['12', 'ديسمبر']
];

const ReportPeriodDialog = ({ open, onClose, onGenerate, studentName }) => {
  const now = new Date();
  const [type, setType] = useState('monthly');
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));

  const years = Array.from({ length: 7 }, (_, i) => String(now.getFullYear() - 3 + i));

  const handleGenerate = () => {
    onGenerate({
      type,
      month: type === 'monthly' ? Number(month) : null,
      year: Number(year)
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="sm:max-w-md" data-testid="report-period-dialog">
        <DialogHeader>
          <DialogTitle className="font-amiri text-xl text-primary flex items-center gap-2 justify-end">
            <CalendarIcon size={20} />
            تقرير {studentName ? studentName : 'الطالب'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <Label className="font-plex mb-2 block">نوع التقرير</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger data-testid="report-type-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">تقرير شهري</SelectItem>
                <SelectItem value="yearly">تقرير سنوي</SelectItem>
                <SelectItem value="all">سجل كامل (كل البيانات)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {type !== 'all' && (
            <div className="grid grid-cols-2 gap-3">
              {type === 'monthly' && (
                <div>
                  <Label className="font-plex mb-2 block">الشهر</Label>
                  <Select value={month} onValueChange={setMonth}>
                    <SelectTrigger data-testid="report-month-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className={type === 'monthly' ? '' : 'col-span-2'}>
                <Label className="font-plex mb-2 block">السنة</Label>
                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger data-testid="report-year-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map(y => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 mt-2">
          <Button
            onClick={handleGenerate}
            data-testid="generate-report-btn"
            className="rounded-full"
          >
            <FileDown size={16} className="ml-2" />
            إنشاء التقرير
          </Button>
          <Button
            variant="outline"
            onClick={onClose}
            className="rounded-full"
          >
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReportPeriodDialog;
