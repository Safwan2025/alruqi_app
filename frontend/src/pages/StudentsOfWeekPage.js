import React from 'react';
import PublicLayout from '@/components/PublicLayout';
import StudentOfWeek from '@/components/StudentOfWeek';

const StudentsOfWeekPage = () => {
  return (
    <PublicLayout>
      <div className="py-6 sm:py-10">
        <StudentOfWeek variant="full" />
      </div>
    </PublicLayout>
  );
};

export default StudentsOfWeekPage;
