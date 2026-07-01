import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Star, Award, Trophy } from 'lucide-react';
import api from '@/utils/api';

const StudentOfWeek = ({ variant = 'full' }) => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStudents();
  }, []);

  const loadStudents = async () => {
    try {
      const API_URL = process.env.REACT_APP_BACKEND_URL || '';
      const response = await fetch(`${API_URL}/api/public/students-of-week`);
      if (response.ok) {
        const data = await response.json();
        setStudents(data);
      }
    } catch (error) {
      console.log('Students of week not available');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return null;
  }

  if (students.length === 0) {
    return null;
  }

  // Compact version for dashboards
  if (variant === 'compact') {
    return (
      <Card className="border-2 border-yellow-300 bg-gradient-to-r from-yellow-50 to-amber-50 overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-5 h-5 text-yellow-600" />
            <h3 className="font-amiri text-lg font-bold text-yellow-700">طلاب الأسبوع</h3>
          </div>
          <div className="flex justify-center gap-4">
            {students.map((student, index) => (
              <div key={student.student_id || index} className="text-center">
                <div className="relative inline-block">
                  <img
                    src={student.student_picture}
                    alt={student.student_name}
                    className="w-14 h-14 rounded-full object-cover border-3 border-yellow-400 shadow-md"
                  />
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center">
                    <Star className="w-3 h-3 text-white fill-white" />
                  </div>
                </div>
                <p className="font-plex text-xs font-bold text-yellow-800 mt-1 truncate max-w-[80px]">
                  {student.student_name}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Full version for landing page
  return (
    <div className="py-16 px-6 bg-gradient-to-b from-yellow-50 to-amber-100">
      <div className="container mx-auto max-w-4xl">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center gap-3 mb-4">
            <Trophy className="w-10 h-10 text-yellow-600" />
            <h2 className="font-amiri text-4xl md:text-5xl font-bold text-primary">
              طلاب الأسبوع
            </h2>
            <Trophy className="w-10 h-10 text-yellow-600" />
          </div>
          <p className="font-plex text-lg text-muted-foreground">
            نفخر بطلابنا المتميزين هذا الأسبوع
          </p>
        </div>

        {/* Students Cards */}
        <div className="flex flex-col sm:flex-row justify-center items-center gap-6 sm:gap-10">
          {students.map((student, index) => (
            <Card 
              key={student.student_id || index} 
              className="w-full sm:w-72 overflow-hidden border-2 border-yellow-300 shadow-xl transform hover:scale-105 transition-transform duration-300"
              data-testid={`student-of-week-${index + 1}`}
            >
              {/* Gold Banner */}
              <div className="bg-gradient-to-r from-yellow-400 via-yellow-500 to-amber-500 py-3 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Star className="w-5 h-5 text-white fill-white" />
                  <span className="font-amiri text-lg font-bold text-white">طالب متميز</span>
                  <Star className="w-5 h-5 text-white fill-white" />
                </div>
              </div>
              
              <CardContent className="p-6 bg-gradient-to-b from-white to-yellow-50">
                {/* Student Image */}
                <div className="relative flex justify-center mb-4">
                  <div className="relative">
                    <img
                      src={student.student_picture}
                      alt={student.student_name}
                      className="w-28 h-28 sm:w-32 sm:h-32 rounded-full object-cover border-4 border-yellow-400 shadow-lg"
                    />
                    <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-yellow-500 rounded-full flex items-center justify-center shadow-md">
                      <Award className="w-6 h-6 text-white" />
                    </div>
                  </div>
                </div>
                
                {/* Student Name */}
                <h3 className="font-amiri text-2xl font-bold text-center text-primary mb-2">
                  {student.student_name}
                </h3>
                
                {/* Decorative Stars */}
                <div className="flex justify-center gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Motivational Text */}
        <p className="text-center font-plex text-sm text-muted-foreground mt-8">
          نحتفي بتميز طلابنا ونشجعهم على المواصلة والإبداع
        </p>
      </div>
    </div>
  );
};

export default StudentOfWeek;
