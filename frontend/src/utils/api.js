import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Public API instance (no auth headers)
export const publicApi = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Check for session token in localStorage
    const sessionToken = localStorage.getItem('session_token');
    if (sessionToken) {
      config.headers['X-Session-Token'] = sessionToken;
    }
    
    // Also check for auth_token (legacy)
    const authToken = localStorage.getItem('auth_token');
    if (authToken) {
      config.headers.Authorization = `Bearer ${authToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear all auth data
      localStorage.removeItem('session_token');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('remember_me');
      
      // Only redirect if on a protected route and not already on login page
      const protectedRoutes = ['/dashboard', '/profile', '/book/', '/classroom/'];
      const currentPath = window.location.pathname;
      const isProtectedRoute = protectedRoutes.some(route => currentPath.includes(route));
      
      if (isProtectedRoute && !currentPath.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
