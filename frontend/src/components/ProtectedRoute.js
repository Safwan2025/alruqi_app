import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '@/utils/api';

const ProtectedRoute = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const checkAuth = async () => {
      // Check if we have a session token
      const sessionToken = localStorage.getItem('session_token');
      
      // If user data passed from AuthCallback, use it
      if (location.state?.user) {
        setIsAuthenticated(true);
        setUser(location.state.user);
        return;
      }

      // No session token means not authenticated
      if (!sessionToken) {
        setIsAuthenticated(false);
        navigate('/login', { replace: true });
        return;
      }

      try {
        const response = await api.get('/auth/me');
        setIsAuthenticated(true);
        setUser(response.data);
      } catch (error) {
        // Clear invalid session
        localStorage.removeItem('session_token');
        localStorage.removeItem('remember_me');
        setIsAuthenticated(false);
        navigate('/login', { replace: true });
      }
    };

    checkAuth();
  }, [navigate, location.state]);

  // Show loading while checking auth
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner border-4 border-primary border-t-transparent rounded-full w-12 h-12"></div>
      </div>
    );
  }

  // Render children if authenticated
  if (isAuthenticated) {
    return <>{children}</>;
  }

  return null;
};

export default ProtectedRoute;
