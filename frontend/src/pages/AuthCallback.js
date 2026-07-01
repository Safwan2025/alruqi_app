import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/utils/api';
import { toast } from 'sonner';

const AuthCallback = () => {
  const navigate = useNavigate();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Prevent double execution (React StrictMode)
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processAuth = async () => {
      try {
        // Extract session_id from URL fragment
        const hash = window.location.hash;
        const params = new URLSearchParams(hash.substring(1));
        const sessionId = params.get('session_id');

        if (!sessionId) {
          throw new Error('لا يوجد معرف جلسة');
        }

        // Exchange session_id for session_token
        const response = await api.post('/auth/session', { 
          session_id: sessionId,
          remember_me: true
        });
        const user = response.data;

        // Get session_token from response headers or extract from cookie
        // The backend sets session_token in both cookie and we need to store it in localStorage too
        const sessionToken = response.headers['x-session-token'] || `session_${Date.now()}`;
        
        // Store session token in localStorage for subsequent requests
        // We'll need to get it from the backend response
        if (response.data.session_token) {
          localStorage.setItem('session_token', response.data.session_token);
        }
        
        // Also set remember_me to true for Google login (persistent session)
        localStorage.setItem('remember_me', 'true');
        
        toast.success('مرحباً بك!');

        // Navigate to appropriate dashboard
        const dashboardPath = user.role === 'teacher' 
          ? '/dashboard/teacher' 
          : '/dashboard/student';
        
        navigate(dashboardPath, { replace: true, state: { user } });
      } catch (error) {
        console.error('Auth error:', error);
        toast.error('فشل تسجيل الدخول');
        navigate('/login', { replace: true });
      }
    };

    processAuth();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="spinner border-4 border-primary border-t-transparent rounded-full w-16 h-16 mx-auto mb-4"></div>
        <p className="text-lg font-plex text-muted-foreground">جاري تسجيل الدخول...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
