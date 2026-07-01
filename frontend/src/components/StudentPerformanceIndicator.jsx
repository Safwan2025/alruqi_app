import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus, Award, BookOpen, Calendar, Target } from 'lucide-react';
import api from '@/utils/api';

// Circular Progress Component
const CircularProgress = ({ score, color, size = 200 }) => {
  const [animatedScore, setAnimatedScore] = useState(0);
  const circumference = 2 * Math.PI * 85; // radius = 85
  const strokeDashoffset = circumference - (animatedScore / 100) * circumference;

  useEffect(() => {
    // Animate score from 0 to target
    let start = 0;
    const duration = 1500;
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Easing function
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (score - start) * easeOut);
      setAnimatedScore(current);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }, [score]);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={85}
          stroke="#e5e7eb"
          strokeWidth="12"
          fill="none"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={85}
          stroke={color}
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
        />
        {/* Glow effect */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={85}
          stroke={color}
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ 
            transition: 'stroke-dashoffset 0.5s ease-out',
            filter: 'blur(8px)',
            opacity: 0.5
          }}
        />
      </svg>
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-amiri text-5xl font-bold" style={{ color }}>
          {animatedScore}
        </span>
        <span className="font-plex text-gray-500 text-sm">من 100</span>
      </div>
    </div>
  );
};

// Mini Progress Bar
const MiniProgressBar = ({ value, max, color, label }) => {
  const percentage = (value / max) * 100;
  
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="font-plex text-sm text-gray-600">{label}</span>
        <span className="font-plex text-sm font-bold" style={{ color }}>{value}/{max}</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div 
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${percentage}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
};

// Monthly Chart
const MonthlyChart = ({ data }) => {
  const maxScore = Math.max(...data.map(d => d.score), 100);
  
  return (
    <div className="flex items-end justify-between gap-2 h-32 px-2">
      {data.map((month, index) => {
        const height = (month.score / maxScore) * 100;
        const isLatest = index === data.length - 1;
        
        return (
          <div key={month.month} className="flex flex-col items-center flex-1">
            <div className="relative w-full flex justify-center mb-1">
              <div 
                className={`w-8 rounded-t-lg transition-all duration-500 ${
                  isLatest ? 'bg-primary' : 'bg-primary/40'
                }`}
                style={{ 
                  height: `${height}%`,
                  minHeight: '8px'
                }}
              />
              {isLatest && (
                <div className="absolute -top-6 bg-primary text-white text-xs px-2 py-0.5 rounded font-plex">
                  {month.score}
                </div>
              )}
            </div>
            <span className="font-plex text-xs text-gray-500 truncate w-full text-center">
              {new Date(month.month + '-01').toLocaleDateString('ar-SA', { month: 'short' })}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const StudentPerformanceIndicator = () => {
  const [performance, setPerformance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadPerformance();
    
    // Auto-refresh every 30 seconds for real-time sync
    const interval = setInterval(loadPerformance, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadPerformance = async () => {
    try {
      const response = await api.get('/students/my-performance');
      setPerformance(response.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.detail || 'فشل تحميل مؤشر الأداء');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-2 border-primary/20">
        <CardContent className="p-8 flex items-center justify-center">
          <div className="spinner border-4 border-primary border-t-transparent rounded-full w-10 h-10"></div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-2 border-red-200 bg-red-50">
        <CardContent className="p-6 text-center">
          <p className="font-plex text-red-600">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!performance) return null;

  const TrendIcon = performance.trend > 0 ? TrendingUp : performance.trend < 0 ? TrendingDown : Minus;
  const trendColor = performance.trend > 0 ? '#22c55e' : performance.trend < 0 ? '#ef4444' : '#6b7280';

  return (
    <Card className="border-2 border-primary/30 shadow-lg overflow-hidden">
      <CardHeader className="bg-gradient-to-l from-primary/10 to-secondary/10 pb-4">
        <CardTitle className="font-amiri text-2xl text-primary flex items-center gap-3">
          <Award className="text-secondary" size={28} />
          مؤشر الأداء الشخصي
        </CardTitle>
      </CardHeader>
      
      <CardContent className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Side - Circular Indicator */}
          <div className="flex flex-col items-center">
            <CircularProgress 
              score={performance.score} 
              color={performance.color}
            />
            
            {/* Level Badge */}
            <div 
              className="mt-4 px-6 py-2 rounded-full font-amiri text-xl font-bold text-white shadow-lg"
              style={{ backgroundColor: performance.color }}
            >
              {performance.level}
            </div>
            
            {/* Motivational Message */}
            <p className="font-plex text-center text-gray-600 mt-4 max-w-xs leading-relaxed">
              {performance.message}
            </p>
            
            {/* Trend Indicator */}
            <div className="flex items-center gap-2 mt-4 px-4 py-2 rounded-lg bg-gray-50">
              <TrendIcon size={20} style={{ color: trendColor }} />
              <span className="font-plex text-sm" style={{ color: trendColor }}>
                {performance.trend_message} 
                {performance.trend !== 0 && ` (${Math.abs(performance.trend)} نقطة)`}
              </span>
            </div>
          </div>
          
          {/* Right Side - Details */}
          <div className="space-y-6">
            {/* Score Breakdown */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-4">
              <h4 className="font-amiri text-lg font-bold text-primary flex items-center gap-2">
                <Target size={20} />
                تفاصيل النقاط
              </h4>
              
              <MiniProgressBar 
                value={performance.breakdown.booking_points}
                max={performance.breakdown.booking_max}
                color="#8b5cf6"
                label="نقاط الحجز"
              />
              
              <MiniProgressBar 
                value={performance.breakdown.attendance_points}
                max={performance.breakdown.attendance_max}
                color="#3b82f6"
                label="نقاط الحضور"
              />
              
              <MiniProgressBar 
                value={performance.breakdown.recitation_points}
                max={performance.breakdown.recitation_max}
                color="#22c55e"
                label="نقاط التسميع"
              />
            </div>
            
            {/* Tips */}
            {performance.tips && (
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-4">
                <h4 className="font-amiri text-lg font-bold text-amber-700 mb-3">
                  💡 كيف ترفع درجتك؟
                </h4>
                <ul className="space-y-2 font-plex text-sm text-amber-800">
                  <li className="flex items-start gap-2">
                    <Calendar size={16} className="mt-0.5 text-amber-600" />
                    <span>{performance.tips.booking_tip}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <BookOpen size={16} className="mt-0.5 text-amber-600" />
                    <span>{performance.tips.recitation_tip}</span>
                  </li>
                </ul>
                {performance.points_to_next_level > 0 && (
                  <p className="mt-3 font-plex text-sm text-amber-700 bg-amber-100 px-3 py-2 rounded-lg">
                    🎯 تحتاج <strong>{performance.points_to_next_level}</strong> نقطة للمستوى التالي
                  </p>
                )}
              </div>
            )}
            
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <Calendar className="mx-auto text-blue-500 mb-1" size={20} />
                <p className="font-amiri text-2xl font-bold text-blue-600">
                  {performance.stats.completed_sessions}
                </p>
                <p className="font-plex text-xs text-blue-500">حصص مكتملة</p>
              </div>
              
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <BookOpen className="mx-auto text-green-500 mb-1" size={20} />
                <p className="font-amiri text-2xl font-bold text-green-600">
                  {performance.stats.rated_sessions}
                </p>
                <p className="font-plex text-xs text-green-500">تسميعات مقيّمة</p>
              </div>
              
              <div className="bg-purple-50 rounded-lg p-3 text-center">
                <Target className="mx-auto text-purple-500 mb-1" size={20} />
                <p className="font-amiri text-2xl font-bold text-purple-600">
                  {performance.stats.scheduled_sessions}
                </p>
                <p className="font-plex text-xs text-purple-500">حجوزات قادمة</p>
              </div>
              
              <div className="bg-amber-50 rounded-lg p-3 text-center">
                <Award className="mx-auto text-amber-500 mb-1" size={20} />
                <p className="font-amiri text-2xl font-bold text-amber-600">
                  {performance.stats.total_rating_points}
                </p>
                <p className="font-plex text-xs text-amber-500">نقاط التسميع الكلية</p>
              </div>
            </div>
            
            {/* Monthly Progress Chart */}
            {performance.monthly_progress && performance.monthly_progress.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-4">
                <h4 className="font-amiri text-lg font-bold text-primary mb-4 flex items-center gap-2">
                  <TrendingUp size={20} />
                  تطورك خلال الأشهر الماضية
                </h4>
                <MonthlyChart data={performance.monthly_progress} />
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default StudentPerformanceIndicator;
